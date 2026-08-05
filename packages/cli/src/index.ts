#!/usr/bin/env node
/**
 * qal — QEV Anchor Layer CLI
 *
 * Encrypt locally. Anchor publicly. Verify anywhere.
 * Never put passwords on the command line.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  QAL_VERSION,
  PINNED_QEV_VERSION,
  QEV_PACKAGE_VERSION,
  checkQevCompatibility,
  encryptWithQev,
  computeVaultDigest,
  DigestError,
  networkFromCli,
  defaultRpcUrl,
  QAL_PROGRAM_ID,
  programExists,
  describeAnchorPayload,
  anchorVault,
  verifyVault,
  toCliVerifyJson,
  fetchAnchorByAddress,
  fetchStatusByAddress,
  revokeAnchor,
  walkRevisionHistory,
  serializeReceipt,
  parseReceipt,
  hexToBytes,
  STATUS_CODES,
  deriveStatusPda,
  type SolanaNetwork,
} from "@qira/qal-sdk";
import { loadWallet, walletPathDefault } from "./wallet.js";
import { promptSecret } from "./prompt.js";

const require = createRequire(import.meta.url);

function usage(): string {
  return `
qal — QEV Anchor Layer v${QAL_VERSION}

  Encrypt locally. Anchor publicly. Verify anywhere.

Usage:
  qal doctor
  qal encrypt <INPUT> --out <OUTPUT>
  qal anchor <VAULT> --network devnet [--receipt out.json] [--parent <HEX>] [--cid <CID>]
  qal verify <VAULT> --network devnet [--issuer <PUBKEY>] [--receipt receipt.json]
  qal inspect <ANCHOR_ADDRESS> --network devnet
  qal history <VAULT_DIGEST> --issuer <PUBKEY> --network devnet
  qal revoke <ANCHOR_ADDRESS> --network devnet
  qal supersede <OLD_VAULT> <NEW_VAULT> --network devnet

Notes:
  - Passwords are prompted interactively (never --password).
  - On-chain data is digests + registry state only — not the vault payload.
  - QEV package pinned: @bryan237l/qev-cli@${PINNED_QEV_VERSION}
`.trim();
}

function parseArgs(argv: string[]): {
  cmd: string;
  positional: string[];
  flags: Record<string, string | boolean>;
} {
  const args = argv.slice(2);
  const cmd = args[0] ?? "help";
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 1; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--help" || a === "-h") {
      flags.help = true;
      continue;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
      continue;
    }
    positional.push(a);
  }

  return { cmd, positional, flags };
}

function flagStr(flags: Record<string, string | boolean>, key: string): string | undefined {
  const v = flags[key];
  return typeof v === "string" ? v : undefined;
}

function network(flags: Record<string, string | boolean>): SolanaNetwork {
  return networkFromCli(flagStr(flags, "network"));
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as unknown;
}

async function cmdDoctor(): Promise<number> {
  const lines: string[] = [];
  let failed = false;

  const { installedQevPackageVersion } = await import("@qira/qal-sdk");
  lines.push(`QAL version:        ${QAL_VERSION}`);
  lines.push(`QEV pinned:         @bryan237l/qev-cli@${PINNED_QEV_VERSION}`);
  lines.push(`QEV npm package:    ${installedQevPackageVersion()}`);
  lines.push(`QEV VERSION const:  ${QEV_PACKAGE_VERSION}`);

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  lines.push(`Node:               ${process.version}`);
  if (nodeMajor < 18) {
    lines.push("  FAIL: Node >= 18.17 required");
    failed = true;
  } else {
    lines.push("  OK: Node version");
  }

  const qev = await checkQevCompatibility();
  if (qev.ok) {
    lines.push("QEV self-test:      PASS");
  } else {
    lines.push(`QEV self-test:      FAIL — ${qev.error}`);
    failed = true;
  }

  const net: SolanaNetwork = "solana-devnet";
  const rpc = defaultRpcUrl(net);
  lines.push(`Default RPC:        ${rpc}`);
  lines.push(`Program ID:         ${QAL_PROGRAM_ID.toBase58()}`);

  try {
    const conn = new Connection(rpc, "confirmed");
    const epoch = await conn.getEpochInfo();
    lines.push(`RPC connectivity:   OK (epoch ${epoch.epoch}, slot ${epoch.absoluteSlot})`);
    lines.push(`Cluster:            ${net}`);

    const present = await programExists(conn);
    if (present) {
      lines.push("Program deployed:   YES");
      const info = await conn.getAccountInfo(QAL_PROGRAM_ID);
      if (info) {
        lines.push(`Program data len:   ${info.data.length} bytes`);
      }
    } else {
      lines.push("Program deployed:   NO (deploy to devnet/localnet before anchoring)");
      // Not a hard fail for doctor when developing — warn only if QAL_STRICT_DOCTOR
      if (process.env.QAL_STRICT_DOCTOR === "1") failed = true;
    }
  } catch (err) {
    lines.push(`RPC connectivity:   FAIL — ${err instanceof Error ? err.message : String(err)}`);
    failed = true;
  }

  try {
    const wallet = await loadWallet();
    lines.push(`Wallet:             ${wallet.publicKey.toBase58()}`);
    lines.push(`Wallet path:        ${walletPathDefault()}`);
    lines.push("  (secret material not printed)");
  } catch (err) {
    lines.push(`Wallet:             FAIL — ${err instanceof Error ? err.message : String(err)}`);
    failed = true;
  }

  lines.push("");
  lines.push(
    "Note: program source verification ≠ security audit. See SECURITY.md and DISCLAIMER.md.",
  );

  console.log(lines.join("\n"));
  return failed ? 1 : 0;
}

async function cmdEncrypt(input: string, out: string): Promise<number> {
  const plaintext = await fs.readFile(input);
  if (plaintext.length > 256 * 1024) {
    console.error(`Input exceeds QEV max plaintext size (256 KiB): ${plaintext.length} bytes`);
    return 1;
  }

  const password = await promptSecret("QEV passphrase: ");
  if (!password) {
    console.error("Empty passphrase rejected");
    return 1;
  }
  const confirm = await promptSecret("Confirm passphrase: ");
  if (password !== confirm) {
    console.error("Passphrases do not match");
    return 1;
  }

  const vault = await encryptWithQev({
    plaintext,
    password,
    mode: "self",
  });

  // Wipe references best-effort (JS strings are immutable; avoid logging).
  await fs.mkdir(path.dirname(path.resolve(out)), { recursive: true });
  await fs.writeFile(out, `${JSON.stringify(vault, null, 2)}\n`, "utf8");

  const d = computeVaultDigest(vault);
  console.log(`Wrote encrypted QEV vault: ${out}`);
  console.log(`Schema:  ${d.schema}`);
  console.log(`Digest:  ${d.digest}`);
  console.log("Plaintext and passphrase were not written to disk by QAL.");
  return 0;
}

async function cmdAnchor(
  vaultPath: string,
  flags: Record<string, string | boolean>,
): Promise<number> {
  const net = network(flags);
  const vault = await readJsonFile(vaultPath);
  const wallet = await loadWallet(flagStr(flags, "wallet"));

  try {
    computeVaultDigest(vault);
  } catch (err) {
    if (err instanceof DigestError) {
      console.error(`${err.code}: ${err.message}`);
      return 1;
    }
    throw err;
  }

  const parent = flagStr(flags, "parent") ?? null;
  const cid = flagStr(flags, "cid");
  const contentReference = cid ? (cid.startsWith("ipfs://") ? cid : `ipfs://${cid}`) : null;

  const preview = describeAnchorPayload({
    vault,
    network: net,
    parentDigest: parent,
    contentReference,
    issuer: wallet.publicKey.toBase58(),
  });

  console.log("Public metadata to be anchored (no secrets):");
  console.log(JSON.stringify(preview, null, 2));

  if (flags["dry-run"]) {
    console.log("Dry run — no transaction submitted.");
    return 0;
  }

  try {
    const { receipt, signature } = await anchorVault(
      {
        vault,
        network: net,
        parentDigest: parent,
        contentReference,
      },
      wallet,
      { network: net },
    );

    const receiptPath =
      flagStr(flags, "receipt") ??
      vaultPath.replace(/\.qev(\.json)?$/i, "") + ".qal-receipt.json";

    await fs.writeFile(receiptPath, serializeReceipt(receipt), "utf8");

    console.log("Anchored successfully.");
    console.log(`Transaction: ${signature}`);
    console.log(`Anchor PDA:  ${receipt.anchor_address}`);
    console.log(`Status PDA:  ${receipt.status_address}`);
    console.log(`Digest:      ${receipt.vault_digest}`);
    console.log(`Receipt:     ${receiptPath}`);
    if (net === "solana-devnet") {
      console.log(
        `Explorer:    https://explorer.solana.com/tx/${signature}?cluster=devnet`,
      );
    }
    return 0;
  } catch (err) {
    console.error(`Anchor failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

async function cmdVerify(
  vaultPath: string,
  flags: Record<string, string | boolean>,
): Promise<number> {
  const net = network(flags);
  const vault = await readJsonFile(vaultPath);

  let issuer = flagStr(flags, "issuer");
  const receiptPath = flagStr(flags, "receipt");
  if (!issuer && receiptPath) {
    const receipt = parseReceipt(await fs.readFile(receiptPath, "utf8"));
    issuer = receipt.issuer;
  }
  // Also try sibling receipt
  if (!issuer) {
    const sibling = vaultPath.replace(/\.qev(\.json)?$/i, "") + ".qal-receipt.json";
    try {
      const receipt = parseReceipt(await fs.readFile(sibling, "utf8"));
      issuer = receipt.issuer;
    } catch {
      // ignore
    }
  }

  const result = await verifyVault(vault, {
    network: net,
    issuer,
  });

  console.log(JSON.stringify(toCliVerifyJson(result), null, 2));

  const ok =
    result.cryptographic_match &&
    (result.outcome === "VALID_ACTIVE" ||
      result.outcome === "VALID_REVOKED" ||
      result.outcome === "VALID_SUPERSEDED" ||
      result.outcome === "VALID_DISPUTED");

  // Historical anchors that are revoked still exit 0 when crypto matches,
  // but we use exit 0 only for any successful crypto verification path
  // so scripts can branch on outcome field.
  if (
    result.outcome === "VALID_ACTIVE" ||
    result.outcome === "VALID_REVOKED" ||
    result.outcome === "VALID_SUPERSEDED" ||
    result.outcome === "VALID_DISPUTED"
  ) {
    return 0;
  }
  return ok ? 0 : 1;
}

async function cmdInspect(
  anchorAddress: string,
  flags: Record<string, string | boolean>,
): Promise<number> {
  const net = network(flags);
  const anchor = await fetchAnchorByAddress(anchorAddress, { network: net });
  if (!anchor) {
    console.error(`Anchor not found: ${anchorAddress}`);
    return 1;
  }

  // Derive status PDA from issuer + digest
  const [statusPda] = deriveStatusPda(
    new PublicKey(anchor.issuer),
    hexToBytes(anchor.vault_digest),
  );
  const status = await fetchStatusByAddress(statusPda.toBase58(), { network: net });

  console.log(
    JSON.stringify(
      {
        network: net,
        program_id: QAL_PROGRAM_ID.toBase58(),
        anchor,
        status,
        notes: [
          "Wallet anchoring proves control of the anchoring wallet, not real-world authorship.",
          "Verified program source does not imply a security audit.",
          "No plaintext or keys are stored on-chain.",
        ],
      },
      null,
      2,
    ),
  );
  return 0;
}

async function cmdHistory(
  digest: string,
  flags: Record<string, string | boolean>,
): Promise<number> {
  const net = network(flags);
  const issuerStr = flagStr(flags, "issuer");
  if (!issuerStr) {
    console.error("--issuer <PUBKEY> is required for history");
    return 1;
  }
  const chain = await walkRevisionHistory(new PublicKey(issuerStr), digest, {
    network: net,
  });
  console.log(
    JSON.stringify(
      {
        issuer: issuerStr,
        start_digest: digest,
        depth: chain.length,
        entries: chain.map((e) => ({
          vault_digest: e.vault_digest,
          parent_digest: e.parent_digest,
          anchor_address: e.anchor.address,
          status: e.status?.state ?? null,
          created_slot: e.anchor.created_slot,
          controller: e.anchor.controller,
        })),
      },
      null,
      2,
    ),
  );
  return chain.length > 0 ? 0 : 1;
}

async function cmdRevoke(
  anchorAddress: string,
  flags: Record<string, string | boolean>,
): Promise<number> {
  const net = network(flags);
  const wallet = await loadWallet(flagStr(flags, "wallet"));
  const anchor = await fetchAnchorByAddress(anchorAddress, { network: net });
  if (!anchor) {
    console.error(`Anchor not found: ${anchorAddress}`);
    return 1;
  }
  if (anchor.controller !== wallet.publicKey.toBase58()) {
    console.error("Wallet is not the current controller");
    return 1;
  }

  try {
    const sig = await revokeAnchor(
      new PublicKey(anchor.issuer),
      hexToBytes(anchor.vault_digest),
      wallet,
      { network: net },
    );
    console.log(
      JSON.stringify(
        {
          revoked: true,
          anchor: anchorAddress,
          vault_digest: anchor.vault_digest,
          transaction_signature: sig,
          note: "Historical anchor remains. cryptographic_match can still be true with status=revoked.",
        },
        null,
        2,
      ),
    );
    return 0;
  } catch (err) {
    console.error(`Revoke failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

async function cmdSupersede(
  oldVaultPath: string,
  newVaultPath: string,
  flags: Record<string, string | boolean>,
): Promise<number> {
  const net = network(flags);
  const wallet = await loadWallet(flagStr(flags, "wallet"));
  const oldVault = await readJsonFile(oldVaultPath);
  const newVault = await readJsonFile(newVaultPath);

  const oldDigest = computeVaultDigest(oldVault);
  const newDigest = computeVaultDigest(newVault);

  // Anchor new with parent = old digest (revision lineage).
  const { receipt, signature } = await anchorVault(
    {
      vault: newVault,
      network: net,
      parentDigest: oldDigest.digest,
      contentReference: flagStr(flags, "cid")
        ? `ipfs://${flagStr(flags, "cid")}`
        : null,
    },
    wallet,
    { network: net },
  );

  // Mark old endorsement superseded (does not erase historical anchor).
  try {
    const { setStatus, fetchAnchorForIssuerDigest } = await import("@qira/qal-sdk");
    const oldOnChain = await fetchAnchorForIssuerDigest(
      wallet.publicKey,
      oldDigest.digestBytes,
      { network: net },
    );
    const issuerPk = oldOnChain.anchor
      ? new PublicKey(oldOnChain.anchor.issuer)
      : wallet.publicKey;
    await setStatus(
      {
        issuer: issuerPk,
        vaultDigest: oldDigest.digestBytes,
        newState: STATUS_CODES.superseded,
      },
      wallet,
      { network: net },
    );
  } catch (err) {
    console.error(
      `Warning: could not mark old anchor superseded: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const receiptPath =
    flagStr(flags, "receipt") ??
    newVaultPath.replace(/\.qev(\.json)?$/i, "") + ".qal-receipt.json";
  await fs.writeFile(receiptPath, serializeReceipt(receipt), "utf8");

  console.log(
    JSON.stringify(
      {
        superseded: true,
        old_digest: oldDigest.digest,
        new_digest: newDigest.digest,
        parent_digest: oldDigest.digest,
        new_anchor: receipt.anchor_address,
        transaction_signature: signature,
        receipt: receiptPath,
      },
      null,
      2,
    ),
  );
  return 0;
}

async function main(): Promise<void> {
  const { cmd, positional, flags } = parseArgs(process.argv);

  if (flags.help || cmd === "help" || cmd === "--help") {
    console.log(usage());
    process.exit(0);
  }

  // Reject password flags hard
  for (const bad of ["password", "phrase", "passphrase", "secret"]) {
    if (bad in flags) {
      console.error(
        `Refusing --${bad}: passphrases must be entered interactively or via stdin, never as CLI args.`,
      );
      process.exit(2);
    }
  }

  let code = 0;
  try {
    switch (cmd) {
      case "doctor":
        code = await cmdDoctor();
        break;
      case "encrypt": {
        const input = positional[0];
        const out = flagStr(flags, "out");
        if (!input || !out) {
          console.error("Usage: qal encrypt <INPUT> --out <OUTPUT>");
          code = 2;
          break;
        }
        code = await cmdEncrypt(input, out);
        break;
      }
      case "anchor": {
        const vault = positional[0];
        if (!vault) {
          console.error("Usage: qal anchor <VAULT> --network devnet");
          code = 2;
          break;
        }
        code = await cmdAnchor(vault, flags);
        break;
      }
      case "verify": {
        const vault = positional[0];
        if (!vault) {
          console.error("Usage: qal verify <VAULT> --network devnet [--issuer <PUBKEY>]");
          code = 2;
          break;
        }
        code = await cmdVerify(vault, flags);
        break;
      }
      case "inspect": {
        const addr = positional[0];
        if (!addr) {
          console.error("Usage: qal inspect <ANCHOR_ADDRESS>");
          code = 2;
          break;
        }
        code = await cmdInspect(addr, flags);
        break;
      }
      case "history": {
        const digest = positional[0];
        if (!digest) {
          console.error("Usage: qal history <VAULT_DIGEST> --issuer <PUBKEY>");
          code = 2;
          break;
        }
        code = await cmdHistory(digest, flags);
        break;
      }
      case "revoke": {
        const addr = positional[0];
        if (!addr) {
          console.error("Usage: qal revoke <ANCHOR_ADDRESS>");
          code = 2;
          break;
        }
        code = await cmdRevoke(addr, flags);
        break;
      }
      case "supersede": {
        const oldV = positional[0];
        const newV = positional[1];
        if (!oldV || !newV) {
          console.error("Usage: qal supersede <OLD_VAULT> <NEW_VAULT>");
          code = 2;
          break;
        }
        code = await cmdSupersede(oldV, newV, flags);
        break;
      }
      case "version":
        console.log(QAL_VERSION);
        break;
      default:
        console.error(`Unknown command: ${cmd}\n`);
        console.log(usage());
        code = 2;
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    code = 1;
  }

  process.exit(code);
}

// silence unused require in production builds if tree-shaken differently
void require;

main();
