/**
 * One-off: create official QEV vault + stamp on existing Devnet program.
 * Outputs to /tmp/qal-demo/. Never logs secrets or RPC URLs.
 */
import { promises as fs } from "node:fs";
import { encryptVaultV2 } from "@bryan237l/qev-cli";
import {
  computeVaultDigest,
  anchorVault,
  serializeReceipt,
} from "../packages/sdk/src/index.ts";
import { loadWallet } from "../packages/cli/src/wallet.ts";

const outDir = "/tmp/qal-demo";
const phrase = process.env.QAL_DEMO_PHRASE;
if (!phrase) {
  throw new Error("QAL_DEMO_PHRASE required (not written to disk)");
}

await fs.mkdir(outDir, { recursive: true });
const wallet = await loadWallet(process.env.QAL_WALLET);
const vault = await encryptVaultV2({
  plaintext: JSON.stringify({
    demo: "qal-hosted-check-file",
    note: "Public demo locker for Check. Experimental. Not production evidence. A liar can lock a lie.",
    published: "2026-08-13",
  }),
  password: phrase,
  mode: "self",
  opslimit: 1,
  memlimit: 32 * 1024 * 1024,
});
const digest = computeVaultDigest(vault);
const { receipt, signature } = await anchorVault(
  { vault, network: "solana-devnet" },
  wallet,
  { network: "solana-devnet", rpcUrl: process.env.QAL_RPC_URL },
);

await fs.writeFile(`${outDir}/vault.json`, JSON.stringify(vault, null, 2) + "\n");
await fs.writeFile(`${outDir}/demo-receipt.json`, serializeReceipt(receipt) + "\n");
await fs.writeFile(
  `${outDir}/meta.json`,
  JSON.stringify(
    {
      label: "hosted-demo-not-the-revoked-primary",
      network: "solana-devnet",
      program_id: receipt.program_id,
      vault_digest: digest.digest,
      transaction_signature: signature,
      anchor_address: receipt.anchor_address,
      status_address: receipt.status_address,
      issuer: receipt.issuer,
      created_slot: receipt.created_slot,
      explorer_tx: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
      note: "New official vault stamped 2026-08-13 so Check-from-Proof has bytes. Distinct from revoked primary 2379d8e3…",
    },
    null,
    2,
  ) + "\n",
);
console.log("digest", digest.digest);
console.log("sig", signature);
console.log("anchor", receipt.anchor_address);
console.log("status", receipt.status_address);
console.log("slot", receipt.created_slot);
console.log("issuer", receipt.issuer);
