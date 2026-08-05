/**
 * Tamper tests: one-byte ciphertext mutation and metadata mutation change digest.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encryptVaultV2 } from "@bryan237l/qev-cli";
import { computeVaultDigest } from "../../packages/sdk/src/index.js";
import { serializeReceipt, parseReceipt, buildReceipt } from "../../packages/sdk/src/receipt.js";

describe("tamper detection", () => {
  it("one-byte ciphertext change alters digest", async () => {
    const vault = (await encryptVaultV2({
      plaintext: "tamper-me",
      password: "test-phrase-for-qal-only-not-secret-prod",
      mode: "self",
      opslimit: 1,
      memlimit: 32 * 1024 * 1024,
    })) as {
      content: { ciphertext: string; nonce: string };
      [k: string]: unknown;
    };

    const original = computeVaultDigest(vault).digest;

    const ct = vault.content.ciphertext;
    // Flip one character in base64url ciphertext safely
    const chars = ct.split("");
    const idx = Math.max(0, chars.length - 3);
    chars[idx] = chars[idx] === "A" ? "B" : "A";
    vault.content = { ...vault.content, ciphertext: chars.join("") };

    const mutated = computeVaultDigest(vault).digest;
    assert.notEqual(original, mutated);
  });

  it("metadata mutation alters digest", async () => {
    const vault = (await encryptVaultV2({
      plaintext: "meta-tamper",
      password: "test-phrase-for-qal-only-not-secret-prod",
      mode: "self",
      opslimit: 1,
      memlimit: 32 * 1024 * 1024,
    })) as Record<string, unknown>;

    const original = computeVaultDigest(vault).digest;
    vault.created_at = "2099-01-01T00:00:00.000Z";
    const mutated = computeVaultDigest(vault).digest;
    assert.notEqual(original, mutated);
  });
});

describe("receipt serialization", () => {
  it("round-trips", () => {
    const r = buildReceipt({
      network: "solana-devnet",
      program_id: "AFGfcVVNtucEjJXvL7QSrRLdujr7yWqnC8FdhP7rpixf",
      anchor_address: "Anchor1111111111111111111111111111111111111",
      status_address: "Status1111111111111111111111111111111111111",
      issuer: "Issuer1111111111111111111111111111111111111",
      controller: "Issuer1111111111111111111111111111111111111",
      vault_digest: "ab".repeat(32),
      qev_schema: "BRY-NFET-SX-VAULT-V2",
      content_reference: null,
      parent_digest: null,
      transaction_signature: "sig",
      created_slot: 42,
    });
    const again = parseReceipt(serializeReceipt(r));
    assert.equal(again.vault_digest, r.vault_digest);
    assert.equal(again.protocol, "QAL");
    assert.equal(again.protocol_version, "0.1.0");
  });
});
