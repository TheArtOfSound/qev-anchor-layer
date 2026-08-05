/**
 * Unit tests for PDA derivation and fail-closed network/receipt parsing.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import {
  deriveAnchorPda,
  deriveStatusPda,
  QAL_PROGRAM_ID,
  buildAnchorVaultIx,
  DISC,
  parseNetwork,
  COMPROMISED_PROGRAM_ID,
  parseReceipt,
  buildReceipt,
  serializeReceipt,
  decodeVaultAnchor,
  DecodeError,
} from "../../packages/sdk/src/index.js";

function fakeSig(): string {
  return bs58.encode(Keypair.generate().secretKey.slice(0, 64));
}

describe("PDA derivation", () => {
  it("is deterministic for issuer+digest", () => {
    const issuer = Keypair.generate().publicKey;
    const digest = new Uint8Array(32).fill(7);
    const [a1, b1] = deriveAnchorPda(issuer, digest);
    const [a2, b2] = deriveAnchorPda(issuer, digest);
    assert.equal(a1.toBase58(), a2.toBase58());
    assert.equal(b1, b2);
  });

  it("status PDA differs from anchor PDA", () => {
    const issuer = Keypair.generate().publicKey;
    const digest = new Uint8Array(32).fill(9);
    const [anchor] = deriveAnchorPda(issuer, digest);
    const [status] = deriveStatusPda(issuer, digest);
    assert.notEqual(anchor.toBase58(), status.toBase58());
  });
});

describe("instruction data", () => {
  it("anchor_vault ix includes 8-byte disc + 4*32 + 2 and no protocol account", () => {
    const issuer = Keypair.generate().publicKey;
    const digest = new Uint8Array(32).fill(3);
    const ix = buildAnchorVaultIx({
      issuer,
      vaultDigest: digest,
      qevSchemaHash: new Uint8Array(32).fill(4),
      contentRefHash: new Uint8Array(32),
      parentDigestClaim: new Uint8Array(32),
      flags: 0,
    });
    assert.equal(ix.programId.toBase58(), QAL_PROGRAM_ID.toBase58());
    assert.equal(ix.data.length, 8 + 32 * 4 + 2);
    assert.ok(Buffer.from(ix.data.subarray(0, 8)).equals(Buffer.from(DISC.anchorVault)));
    assert.equal(ix.keys.length, 4);
  });
});

describe("network parsing fail-closed", () => {
  it("rejects mainnet", () => {
    assert.throws(() => parseNetwork("mainnet"), /Mainnet is not supported/);
  });
  it("rejects unknown networks", () => {
    assert.throws(() => parseNetwork("bogus"), /Unknown network/);
  });
  it("requires explicit network", () => {
    assert.throws(() => parseNetwork(undefined), /Network is required/);
  });
  it("accepts devnet and localnet", () => {
    assert.equal(parseNetwork("devnet"), "solana-devnet");
    assert.equal(parseNetwork("localnet"), "solana-localnet");
  });
});

describe("receipt strict validation", () => {
  it("rejects compromised program id", () => {
    const r = buildReceipt({
      network: "solana-devnet",
      genesis_hash: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
      program_id: COMPROMISED_PROGRAM_ID,
      anchor_address: Keypair.generate().publicKey.toBase58(),
      status_address: Keypair.generate().publicKey.toBase58(),
      issuer: Keypair.generate().publicKey.toBase58(),
      controller: Keypair.generate().publicKey.toBase58(),
      vault_digest: "ab".repeat(32),
      qev_schema: "BRY-NFET-SX-VAULT-V2",
      qev_schema_hash: "cd".repeat(32),
      content_reference: null,
      parent_digest_claim: null,
      transaction_signature: fakeSig(),
      created_slot: 1,
    });
    assert.throws(() => parseReceipt(serializeReceipt(r)), /compromised/i);
  });

  it("round-trips valid receipt", () => {
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
    assert.equal(again.protocol_version, "0.1.2");
  });
});

describe("decoder fail-closed", () => {
  it("rejects wrong discriminator", () => {
    const junk = Buffer.alloc(178, 1);
    assert.throws(
      () => decodeVaultAnchor(junk, PublicKey.default.toBase58()),
      (err: unknown) => err instanceof DecodeError && err.code === "INVALID_ACCOUNT",
    );
  });
});
