/**
 * Transaction provenance verification for QAL receipts.
 *
 * Requires deterministic instruction data — never treats log mentions as proof.
 * Returns TRANSACTION_PROVENANCE_INCOMPLETE when RPC does not expose enough data.
 */

import {
  Connection,
  PublicKey,
  type ParsedTransactionWithMeta,
  type VersionedTransactionResponse,
} from "@solana/web3.js";
import bs58 from "bs58";
import type { VerificationOutcome } from "./types.js";

export interface TxProvenanceOk {
  ok: true;
  slot: number;
}

export interface TxProvenanceErr {
  ok: false;
  outcome: VerificationOutcome;
  error: string;
}

export type TxProvenanceResult = TxProvenanceOk | TxProvenanceErr;

function err(outcome: VerificationOutcome, error: string): TxProvenanceErr {
  return { ok: false, outcome, error };
}

/** Anchor instruction discriminators we accept for provenance. */
function isQalIxData(data: Buffer, vaultDigest: Uint8Array): boolean {
  if (data.length < 8 + 32) return false;
  // First arg after 8-byte disc is vault_digest for anchor_vault and new_vault_digest for supersede_vault
  const first32 = data.subarray(8, 8 + 32);
  if (Buffer.from(first32).equals(Buffer.from(vaultDigest))) return true;
  // Also allow digest anywhere after disc (defensive for future layouts)
  return data.subarray(8).includes(Buffer.from(vaultDigest));
}

/**
 * Verify transaction provenance for an anchor receipt.
 */
export async function verifyAnchorTransactionProvenance(
  connection: Connection,
  params: {
    signature: string;
    programId: PublicKey;
    issuer: PublicKey;
    anchorAddress: PublicKey;
    vaultDigest: Uint8Array;
    expectedSlot: number;
  },
): Promise<TxProvenanceResult> {
  let tx: VersionedTransactionResponse | null;
  try {
    tx = await connection.getTransaction(params.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
  } catch (e) {
    return err("RPC_UNAVAILABLE", e instanceof Error ? e.message : String(e));
  }

  if (!tx) {
    let parsed: ParsedTransactionWithMeta | null = null;
    try {
      parsed = await connection.getParsedTransaction(params.signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
    } catch {
      // fall through
    }
    if (!parsed) {
      return err("TRANSACTION_NOT_FOUND", `Transaction not found: ${params.signature}`);
    }
    return verifyParsed(parsed, params);
  }

  if (tx.meta?.err) {
    return err(
      "TRANSACTION_NOT_FOUND",
      `Transaction failed on-chain: ${JSON.stringify(tx.meta.err)}`,
    );
  }

  const message = tx.transaction.message;
  const accountKeys = message.staticAccountKeys.map((k) => k.toBase58());
  if (tx.meta?.loadedAddresses) {
    for (const k of tx.meta.loadedAddresses.writable) {
      accountKeys.push(k.toBase58());
    }
    for (const k of tx.meta.loadedAddresses.readonly) {
      accountKeys.push(k.toBase58());
    }
  }

  const programIdStr = params.programId.toBase58();
  const issuerStr = params.issuer.toBase58();
  const anchorStr = params.anchorAddress.toBase58();

  const numSigners = message.header.numRequiredSignatures;
  const signers = message.staticAccountKeys
    .slice(0, numSigners)
    .map((k) => k.toBase58());
  if (!signers.includes(issuerStr)) {
    return err(
      "TRANSACTION_ISSUER_MISMATCH",
      `Issuer ${issuerStr} did not sign transaction (signers=${signers.join(",")})`,
    );
  }

  if (!accountKeys.includes(anchorStr)) {
    return err(
      "TRANSACTION_ANCHOR_MISMATCH",
      `Anchor PDA ${anchorStr} not present in transaction account keys`,
    );
  }

  // Resolve account key by index (static + loaded writable + loaded readonly)
  const keyAt = (index: number): string | undefined => accountKeys[index];

  type FoundIx = { data: Buffer; source: "top-level" | "inner" };
  const qalIxs: FoundIx[] = [];

  // Top-level compiled instructions
  for (const ix of message.compiledInstructions) {
    const pid = keyAt(ix.programIdIndex);
    if (pid === programIdStr) {
      qalIxs.push({ data: Buffer.from(ix.data), source: "top-level" });
    }
  }

  // Inner instructions (CPI) — inspect actual instruction data, never logs alone
  if (tx.meta?.innerInstructions) {
    for (const group of tx.meta.innerInstructions) {
      for (const inner of group.instructions) {
        const pid = keyAt(inner.programIdIndex);
        if (pid === programIdStr) {
          // web3.js may return data as base58 string or number[]
          let data: Buffer;
          const raw = inner.data as unknown;
          if (typeof raw === "string") {
            try {
              data = Buffer.from(bs58.decode(raw));
            } catch {
              try {
                data = Buffer.from(raw, "base64");
              } catch {
                return err(
                  "TRANSACTION_PROVENANCE_INCOMPLETE",
                  "Inner QAL instruction data could not be decoded",
                );
              }
            }
          } else if (Array.isArray(raw)) {
            data = Buffer.from(raw as number[]);
          } else if (raw instanceof Uint8Array) {
            data = Buffer.from(raw);
          } else {
            return err(
              "TRANSACTION_PROVENANCE_INCOMPLETE",
              "Inner QAL instruction data format unsupported",
            );
          }
          qalIxs.push({ data, source: "inner" });
        }
      }
    }
  }

  if (qalIxs.length === 0) {
    return err(
      "TRANSACTION_PROGRAM_MISMATCH",
      `No top-level or inner instruction invoked program ${programIdStr}`,
    );
  }

  // Require at least one QAL ix with matching digest in instruction data
  let digestMatched = false;
  let anyDataTooShort = false;
  for (const ix of qalIxs) {
    if (ix.data.length < 8 + 32) {
      anyDataTooShort = true;
      continue;
    }
    if (isQalIxData(ix.data, params.vaultDigest)) {
      digestMatched = true;
      break;
    }
  }

  if (!digestMatched) {
    if (anyDataTooShort || qalIxs.every((i) => i.data.length < 8 + 32)) {
      return err(
        "TRANSACTION_PROVENANCE_INCOMPLETE",
        "RPC response exposed QAL program invocation but instruction data incomplete for digest match",
      );
    }
    return err(
      "TRANSACTION_DIGEST_MISMATCH",
      "Vault digest not found in any QAL instruction data (top-level or inner)",
    );
  }

  if (
    typeof params.expectedSlot === "number" &&
    params.expectedSlot > 0 &&
    tx.slot !== params.expectedSlot
  ) {
    return err(
      "TRANSACTION_SLOT_MISMATCH",
      `Transaction slot ${tx.slot} != anchor created_slot ${params.expectedSlot}`,
    );
  }

  return { ok: true, slot: tx.slot };
}

function verifyParsed(
  parsed: ParsedTransactionWithMeta,
  params: {
    programId: PublicKey;
    issuer: PublicKey;
    anchorAddress: PublicKey;
    vaultDigest: Uint8Array;
    expectedSlot: number;
  },
): TxProvenanceResult {
  if (parsed.meta?.err) {
    return err("TRANSACTION_NOT_FOUND", "Parsed transaction failed on-chain");
  }
  const msg = parsed.transaction.message;
  const accountKeys = msg.accountKeys.map((k) =>
    typeof k === "string" ? k : k.pubkey.toBase58(),
  );
  const signers = msg.accountKeys
    .filter((k) => (typeof k === "string" ? false : k.signer))
    .map((k) => (typeof k === "string" ? k : k.pubkey.toBase58()));

  if (!signers.includes(params.issuer.toBase58())) {
    return err("TRANSACTION_ISSUER_MISMATCH", "Issuer not in parsed signers");
  }
  if (!accountKeys.includes(params.anchorAddress.toBase58())) {
    return err("TRANSACTION_ANCHOR_MISMATCH", "Anchor not in parsed account keys");
  }

  type Found = { data: Buffer };
  const qalIxs: Found[] = [];

  const collect = (ix: {
    programId?: PublicKey | string;
    data?: string;
    parsed?: unknown;
  }) => {
    const pid =
      ix.programId === undefined
        ? ""
        : typeof ix.programId === "string"
          ? ix.programId
          : ix.programId.toBase58();
    if (pid !== params.programId.toBase58()) return;
    if (typeof ix.data !== "string") {
      // Partially decoded / jsonParsed without raw data
      return;
    }
    // Parsed transactions use base58 for data on many RPCs; try base58 then base64
    let raw: Buffer | null = null;
    try {
      raw = Buffer.from(bs58.decode(ix.data));
    } catch {
      try {
        const b64 = Buffer.from(ix.data, "base64");
        if (b64.length >= 8) raw = b64;
      } catch {
        raw = null;
      }
    }
    if (raw && raw.length >= 8) qalIxs.push({ data: raw });
  };

  for (const ix of msg.instructions) {
    collect(ix as { programId?: PublicKey | string; data?: string });
  }
  if (parsed.meta?.innerInstructions) {
    for (const group of parsed.meta.innerInstructions) {
      for (const inner of group.instructions) {
        collect(inner as { programId?: PublicKey | string; data?: string });
      }
    }
  }

  if (qalIxs.length === 0) {
    // Program may appear only as partially decoded — incomplete
    const anyProgramMention = msg.instructions.some((ix) => {
      const pid =
        "programId" in ix
          ? typeof ix.programId === "string"
            ? ix.programId
            : ix.programId.toBase58()
          : "";
      return pid === params.programId.toBase58();
    });
    if (anyProgramMention) {
      return err(
        "TRANSACTION_PROVENANCE_INCOMPLETE",
        "Parsed transaction invokes QAL but instruction data is not available for digest verification",
      );
    }
    return err(
      "TRANSACTION_PROGRAM_MISMATCH",
      "Program not in parsed top-level or inner instructions",
    );
  }

  let matched = false;
  for (const ix of qalIxs) {
    if (isQalIxData(ix.data, params.vaultDigest)) {
      matched = true;
      break;
    }
  }
  if (!matched) {
    return err(
      "TRANSACTION_DIGEST_MISMATCH",
      "Vault digest not found in parsed QAL instruction data",
    );
  }

  if (params.expectedSlot > 0 && parsed.slot !== params.expectedSlot) {
    return err(
      "TRANSACTION_SLOT_MISMATCH",
      `Parsed slot ${parsed.slot} != created_slot ${params.expectedSlot}`,
    );
  }
  return { ok: true, slot: parsed.slot };
}
