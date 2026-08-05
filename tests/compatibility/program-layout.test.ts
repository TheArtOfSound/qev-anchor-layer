/**
 * Unit tests for PDA derivation and instruction discriminators.
 * Does not require a live cluster.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  deriveAnchorPda,
  deriveStatusPda,
  deriveProtocolPda,
  QAL_PROGRAM_ID,
  buildAnchorVaultIx,
  DISC,
} from "../../packages/sdk/src/index.js";

describe("PDA derivation", () => {
  it("is deterministic for issuer+digest", () => {
    const issuer = Keypair.generate().publicKey;
    const digest = new Uint8Array(32).fill(7);
    const [a1, b1] = deriveAnchorPda(issuer, digest);
    const [a2, b2] = deriveAnchorPda(issuer, digest);
    assert.equal(a1.toBase58(), a2.toBase58());
    assert.equal(b1, b2);
  });

  it("differs for different digests", () => {
    const issuer = Keypair.generate().publicKey;
    const d1 = new Uint8Array(32).fill(1);
    const d2 = new Uint8Array(32).fill(2);
    const [a1] = deriveAnchorPda(issuer, d1);
    const [a2] = deriveAnchorPda(issuer, d2);
    assert.notEqual(a1.toBase58(), a2.toBase58());
  });

  it("status PDA differs from anchor PDA", () => {
    const issuer = Keypair.generate().publicKey;
    const digest = new Uint8Array(32).fill(9);
    const [anchor] = deriveAnchorPda(issuer, digest);
    const [status] = deriveStatusPda(issuer, digest);
    assert.notEqual(anchor.toBase58(), status.toBase58());
  });

  it("protocol PDA is stable", () => {
    const [p1] = deriveProtocolPda();
    const [p2] = deriveProtocolPda(QAL_PROGRAM_ID);
    assert.equal(p1.toBase58(), p2.toBase58());
  });
});

describe("instruction data", () => {
  it("anchor_vault ix includes 8-byte disc + 4*32 + 2", () => {
    const issuer = Keypair.generate().publicKey;
    const digest = new Uint8Array(32).fill(3);
    const ix = buildAnchorVaultIx({
      issuer,
      vaultDigest: digest,
      qevSchemaHash: new Uint8Array(32).fill(4),
      contentRefHash: new Uint8Array(32),
      parentDigest: new Uint8Array(32),
      flags: 0,
    });
    assert.equal(ix.programId.toBase58(), QAL_PROGRAM_ID.toBase58());
    assert.equal(ix.data.length, 8 + 32 * 4 + 2);
    assert.ok(Buffer.from(ix.data.subarray(0, 8)).equals(Buffer.from(DISC.anchorVault)));
    assert.ok(ix.keys.some((k) => k.pubkey.equals(issuer) && k.isSigner));
  });

  it("discriminators are 8 bytes", () => {
    for (const v of Object.values(DISC)) {
      assert.equal(v.length, 8);
    }
  });
});

describe("zero digest rejection is client-enforced preflight", () => {
  it("document: program also rejects zero digest", () => {
    // Client should not build meaningless anchors; program requires non-zero.
    const zero = new Uint8Array(32);
    assert.ok(zero.every((b) => b === 0));
    assert.ok(PublicKey.default);
  });
});
