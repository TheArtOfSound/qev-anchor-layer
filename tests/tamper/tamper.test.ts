/**
 * Tamper tests: one-byte ciphertext mutation and metadata mutation change digest.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encryptVaultV2 } from "@bryan237l/qev-cli";
import {
  computeVaultDigest,
  buildReceipt,
  serializeReceipt,
  parseReceipt,
  QAL_PROGRAM_ID,
} from "../../packages/sdk/src/index.js";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

function fakeSig(): string {
  return bs58.encode(Keypair.generate().secretKey.slice(0, 64));
}

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
  it("round-trips with genesis_hash and protocol 0.1.2", () => {
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
    const again = parseReceipt(serializeReceipt(r));
    assert.equal(again.vault_digest, r.vault_digest);
    assert.equal(again.genesis_hash, r.genesis_hash);
    assert.equal(again.protocol_version, "0.1.2");
  });
});
