/**
 * Adversarial / fail-closed tests for pre-devnet hardening.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import {
  parseNetwork,
  parseReceipt,
  buildReceipt,
  serializeReceipt,
  ReceiptError,
  requireSolanaSignature,
  COMPROMISED_PROGRAM_ID,
  QAL_PROGRAM_ID,
  QAL_PROTOCOL_VERSION,
  programIdForNetwork,
  decodeVaultAnchor,
  DecodeError,
  DISC,
} from "../../packages/sdk/src/index.js";

function fakeSig(): string {
  return bs58.encode(Keypair.generate().secretKey.slice(0, 64));
}

function baseReceipt(overrides: Record<string, unknown> = {}) {
  const issuer = Keypair.generate().publicKey.toBase58();
  const r = buildReceipt({
    network: "solana-devnet",
    genesis_hash: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
    program_id: QAL_PROGRAM_ID.toBase58(),
    anchor_address: Keypair.generate().publicKey.toBase58(),
    status_address: Keypair.generate().publicKey.toBase58(),
    issuer,
    controller: issuer,
    vault_digest: "ab".repeat(32),
    qev_schema: "BRY-NFET-SX-VAULT-V2",
    qev_schema_hash: "cd".repeat(32),
    content_reference: null,
    parent_digest_claim: null,
    transaction_signature: fakeSig(),
    created_slot: 42,
  });
  return { ...r, ...overrides };
}

describe("official program ID enforcement", () => {
  it("rejects wrong non-compromised program ID without opt-in", () => {
    const other = Keypair.generate().publicKey.toBase58();
    const r = baseReceipt({ program_id: other });
    assert.throws(
      () => parseReceipt(serializeReceipt(r as never)),
      (e: unknown) =>
        e instanceof ReceiptError &&
        /not the official QAL deployment/i.test(e.message),
    );
  });

  it("allows custom program ID with allowCustomProgramId", () => {
    const other = Keypair.generate().publicKey.toBase58();
    const r = baseReceipt({ program_id: other });
    const parsed = parseReceipt(serializeReceipt(r as never), {
      allowCustomProgramId: true,
    });
    assert.equal(parsed.program_id, other);
  });

  it("still rejects compromised ID even with custom opt-in", () => {
    const r = baseReceipt({ program_id: COMPROMISED_PROGRAM_ID });
    assert.throws(
      () =>
        parseReceipt(serializeReceipt(r as never), {
          allowCustomProgramId: true,
        }),
      /compromised/i,
    );
  });

  it("official program ID matches network config", () => {
    assert.equal(
      programIdForNetwork("solana-devnet"),
      QAL_PROGRAM_ID.toBase58(),
    );
  });
});

describe("receipt field strictness", () => {
  it("rejects missing qev_schema_hash (no zero default)", () => {
    const r = baseReceipt();
    const obj = JSON.parse(serializeReceipt(r));
    delete obj.qev_schema_hash;
    assert.throws(() => parseReceipt(JSON.stringify(obj)), /qev_schema_hash/);
  });

  it("rejects unsupported protocol versions including future 0.1.x", () => {
    const r = baseReceipt({ protocol_version: "0.1.9" });
    assert.throws(
      () => parseReceipt(serializeReceipt(r as never)),
      /Unsupported receipt protocol_version/,
    );
  });

  it("accepts only 0.1.2", () => {
    const r = baseReceipt();
    assert.equal(r.protocol_version, QAL_PROTOCOL_VERSION);
    const parsed = parseReceipt(serializeReceipt(r));
    assert.equal(parsed.protocol_version, "0.1.2");
  });

  it("rejects invalid transaction signature strings", () => {
    assert.throws(() => requireSolanaSignature("not-a-sig"), ReceiptError);
    assert.throws(() => requireSolanaSignature("short"), ReceiptError);
    const r = baseReceipt({ transaction_signature: "abc" });
    assert.throws(() => parseReceipt(serializeReceipt(r as never)));
  });

  it("accepts structurally valid 64-byte signatures", () => {
    const sig = fakeSig();
    assert.equal(requireSolanaSignature(sig), sig);
  });
});

describe("network fail-closed", () => {
  it("rejects mainnet and unknown", () => {
    assert.throws(() => parseNetwork("mainnet"));
    assert.throws(() => parseNetwork("testnet"));
    assert.throws(() => parseNetwork(undefined));
  });
});

describe("decoder fail-closed", () => {
  it("rejects wrong discriminator", () => {
    const junk = Buffer.alloc(200, 7);
    assert.throws(
      () => decodeVaultAnchor(junk, Keypair.generate().publicKey.toBase58()),
      (e: unknown) => e instanceof DecodeError,
    );
  });

  it("discriminators are 8 bytes", () => {
    assert.equal(DISC.vaultAnchor.length, 8);
    assert.equal(DISC.vaultStatus.length, 8);
  });
});

describe("browser vendor remote URL scan", () => {
  it("verifier sources contain no remote script/CDN URLs", async () => {
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../apps/verifier",
    );
    for (const f of ["verifier.js", "index.html", "build.mjs"]) {
      const text = await fs.readFile(path.join(root, f), "utf8");
      assert.equal(
        /src\s*=\s*["']https?:\/\//i.test(text),
        false,
        `${f} has remote script src`,
      );
      if (f !== "build.mjs") {
        assert.equal(
          /unpkg\.com|cdn\.jsdelivr|cdnjs\.cloudflare/i.test(text),
          false,
          `${f} references CDN host`,
        );
      }
    }
  });

  it("build.mjs has no unpkg fallback", async () => {
    const p = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../apps/verifier/build.mjs",
    );
    const text = await fs.readFile(p, "utf8");
    assert.equal(/unpkg\.com/.test(text), false);
    assert.match(text, /lockfile|require\.resolve|no network/i);
  });
});

describe("receipt tampering detection shape", () => {
  it("serialize/parse preserves fields used in chain cross-check", () => {
    const r = baseReceipt({
      vault_digest: "11".repeat(32),
      qev_schema_hash: "22".repeat(32),
      created_slot: 99,
    });
    const p = parseReceipt(serializeReceipt(r as never));
    assert.equal(p.vault_digest, "11".repeat(32));
    assert.equal(p.qev_schema_hash, "22".repeat(32));
    assert.equal(p.created_slot, 99);
  });
});
