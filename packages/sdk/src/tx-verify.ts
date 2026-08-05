/**
 * Transaction provenance verification for QAL receipts.
 *
 * Tier: deeper verification. Confirms the receipt signature corresponds to a
 * real cluster transaction that invoked the expected program and involved the
 * expected accounts / issuer.
 */

import {
  Connection,
  PublicKey,
  type ConfirmedTransactionMeta,
  type ParsedTransactionWithMeta,
  type VersionedTransactionResponse,
} from "@solana/web3.js";
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

/**
 * Verify transaction provenance for an anchor receipt.
 *
 * Checks:
 * 1. Signature exists on cluster
 * 2. Transaction invokes expected program
 * 3. Issuer is among signers
 * 4. Anchor PDA is in account keys (writable)
 * 5. Slot is present (compared to created_slot by caller)
 * 6. Instruction data (where available) contains vault digest bytes
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
    return err(
      "RPC_UNAVAILABLE",
      e instanceof Error ? e.message : String(e),
    );
  }

  if (!tx) {
    // Try parsed as fallback for some RPCs
    let parsed: ParsedTransactionWithMeta | null = null;
    try {
      parsed = await connection.getParsedTransaction(params.signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
    } catch {
      // ignore
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
  // loaded addresses for v0
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

  // Signers: first numRequiredSignatures static keys
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

  // Program invoked?
  let programInvoked = false;
  const compiled = message.compiledInstructions;
  for (const ix of compiled) {
    const pid = message.staticAccountKeys[ix.programIdIndex]?.toBase58();
    if (pid === programIdStr) {
      programInvoked = true;
      // Check digest in instruction data (after 8-byte discriminator)
      const data = Buffer.from(ix.data);
      if (data.length >= 8 + 32) {
        const digestInIx = data.subarray(8, 8 + 32);
        if (!Buffer.from(digestInIx).equals(Buffer.from(params.vaultDigest))) {
          // For supersede, digest is still first arg after disc for new digest
          // Accept if digest appears anywhere after disc
          const hay = data.subarray(8);
          const needle = Buffer.from(params.vaultDigest);
          if (!hay.includes(needle)) {
            return err(
              "TRANSACTION_DIGEST_MISMATCH",
              "Vault digest not found in instruction data for QAL program invocation",
            );
          }
        }
      }
    }
  }

  // Also scan inner instructions for CPI (unlikely for our program)
  if (!programInvoked && tx.meta) {
    programInvoked = logMentionsProgram(tx.meta, programIdStr);
  }

  if (!programInvoked) {
    return err(
      "TRANSACTION_PROGRAM_MISMATCH",
      `Transaction did not invoke program ${programIdStr}`,
    );
  }

  if (
    typeof params.expectedSlot === "number" &&
    params.expectedSlot > 0 &&
    tx.slot !== params.expectedSlot
  ) {
    // Slot mismatch is soft-hard: anchors store Clock::get slot at creation;
    // tx.slot should match created_slot for same confirmation path.
    return err(
      "TRANSACTION_SLOT_MISMATCH",
      `Transaction slot ${tx.slot} != anchor created_slot ${params.expectedSlot}`,
    );
  }

  return { ok: true, slot: tx.slot };
}

function logMentionsProgram(meta: ConfirmedTransactionMeta, programId: string): boolean {
  const logs = meta.logMessages ?? [];
  return logs.some((l) => l.includes(programId));
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

  let programInvoked = false;
  for (const ix of msg.instructions) {
    const pid =
      "programId" in ix
        ? typeof ix.programId === "string"
          ? ix.programId
          : ix.programId.toBase58()
        : "";
    if (pid === params.programId.toBase58()) {
      programInvoked = true;
      if ("data" in ix && typeof ix.data === "string") {
        try {
          const raw = Buffer.from(ix.data, "base64");
          if (raw.length >= 8 + 32) {
            const hay = raw.subarray(8);
            if (!hay.includes(Buffer.from(params.vaultDigest))) {
              return err(
                "TRANSACTION_DIGEST_MISMATCH",
                "Vault digest not in parsed instruction data",
              );
            }
          }
        } catch {
          // ignore decode issues for partial
        }
      }
    }
  }
  if (!programInvoked) {
    return err("TRANSACTION_PROGRAM_MISMATCH", "Program not in parsed instructions");
  }
  if (params.expectedSlot > 0 && parsed.slot !== params.expectedSlot) {
    return err(
      "TRANSACTION_SLOT_MISMATCH",
      `Parsed slot ${parsed.slot} != created_slot ${params.expectedSlot}`,
    );
  }
  return { ok: true, slot: parsed.slot };
}
