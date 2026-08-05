/**
 * Devnet integration test.
 *
 * Skipped unless QAL_DEVNET=1 and program is deployed with a funded wallet.
 *
 *   QAL_DEVNET=1 pnpm test:devnet
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { encryptVaultV2 } from "@bryan237l/qev-cli";
import {
  computeVaultDigest,
  defaultRpcUrl,
  programExists,
  QAL_PROGRAM_ID,
  anchorVault,
  verifyVault,
  revokeAnchor,
  setStatus,
  STATUS_CODES,
  fetchAnchorForIssuerDigest,
  hexToBytes,
} from "../../packages/sdk/src/index.js";
import { loadWallet } from "../../packages/cli/src/wallet.js";

const RUN = process.env.QAL_DEVNET === "1";
const network = "solana-devnet" as const;

describe("devnet integration", { skip: !RUN }, () => {
  let wallet: Keypair;
  let connection: Connection;

  before(async () => {
    wallet = await loadWallet();
    connection = new Connection(defaultRpcUrl(network), "confirmed");
    const exists = await programExists(connection);
    if (!exists) {
      throw new Error(
        `Program ${QAL_PROGRAM_ID.toBase58()} not deployed on devnet. Deploy first.`,
      );
    }
    const bal = await connection.getBalance(wallet.publicKey);
    if (bal < 50_000_000) {
      throw new Error(`Wallet underfunded on devnet: ${bal} lamports`);
    }
  });

  it("full flow: encrypt → anchor → verify → tamper fail → revoke → supersede", async () => {
    const evidenceDir = path.join(process.cwd(), "test-output");
    await fs.mkdir(evidenceDir, { recursive: true });

    // 1–2. Generate vault + digest
    const vault = await encryptVaultV2({
      plaintext: JSON.stringify({
        evidence: "qal-devnet-e2e",
        ts: new Date().toISOString(),
      }),
      password: "devnet-test-phrase-not-for-production-use",
      mode: "self",
      opslimit: 1,
      memlimit: 32 * 1024 * 1024,
    });
    const d = computeVaultDigest(vault);
    await fs.writeFile(
      path.join(evidenceDir, "vault.json"),
      JSON.stringify(vault, null, 2),
    );
    await fs.writeFile(path.join(evidenceDir, "digest.txt"), d.digest);

    // 3–5. Anchor + fetch PDA + compare
    const { receipt, signature, anchor } = await anchorVault(
      { vault, network },
      wallet,
      { network },
    );
    assert.equal(anchor.vault_digest, d.digest);
    assert.equal(anchor.issuer, wallet.publicKey.toBase58());

    await fs.writeFile(
      path.join(evidenceDir, "receipt.json"),
      JSON.stringify(receipt, null, 2),
    );
    await fs.writeFile(path.join(evidenceDir, "tx.txt"), signature);

    // 6. Verify original
    const ok = await verifyVault(vault, {
      network,
      issuer: wallet.publicKey.toBase58(),
    });
    assert.equal(ok.cryptographic_match, true);
    assert.equal(ok.outcome, "VALID_ACTIVE");

    // 7. Tamper one byte → mismatch
    const tampered = structuredClone(vault) as {
      content: { ciphertext: string };
      [k: string]: unknown;
    };
    const ct = tampered.content.ciphertext.split("");
    ct[0] = ct[0] === "A" ? "B" : "A";
    tampered.content.ciphertext = ct.join("");
    // schema still V2 but content changed — may still validate structure
    const badDigest = computeVaultDigest(tampered);
    assert.notEqual(badDigest.digest, d.digest);
    const mismatch = await verifyVault(tampered, {
      network,
      issuer: wallet.publicKey.toBase58(),
    });
    // PDA is derived from local digest, so tampered vault looks like ANCHOR_NOT_FOUND
    // or if we verified against original digest path — document both behaviors.
    assert.equal(mismatch.cryptographic_match, false);
    assert.ok(
      mismatch.outcome === "ANCHOR_NOT_FOUND" || mismatch.outcome === "DIGEST_MISMATCH",
    );

    // 8–9. Revoke; digest still matches with revoked status
    await revokeAnchor(wallet.publicKey, d.digestBytes, wallet, { network });
    const revoked = await verifyVault(vault, {
      network,
      issuer: wallet.publicKey.toBase58(),
    });
    assert.equal(revoked.cryptographic_match, true);
    assert.equal(revoked.outcome, "VALID_REVOKED");
    assert.equal(revoked.status, "revoked");

    // 10–11. Second revision with parent digest
    const vault2 = await encryptVaultV2({
      plaintext: JSON.stringify({ evidence: "qal-devnet-e2e-v2" }),
      password: "devnet-test-phrase-not-for-production-use",
      mode: "self",
      opslimit: 1,
      memlimit: 32 * 1024 * 1024,
    });
    const d2 = computeVaultDigest(vault2);
    const { receipt: r2 } = await anchorVault(
      { vault: vault2, network, parentDigest: d.digest },
      wallet,
      { network },
    );
    assert.equal(r2.parent_digest, d.digest);

    await setStatus(
      {
        issuer: wallet.publicKey,
        vaultDigest: d.digestBytes,
        newState: STATUS_CODES.superseded,
      },
      wallet,
      { network },
    );

    const { anchor: a2 } = await fetchAnchorForIssuerDigest(
      wallet.publicKey,
      hexToBytes(d2.digest),
      { network },
    );
    assert.ok(a2);
    assert.equal(a2!.parent_digest, d.digest);

    await fs.writeFile(
      path.join(evidenceDir, "evidence-summary.json"),
      JSON.stringify(
        {
          program_id: QAL_PROGRAM_ID.toBase58(),
          issuer: wallet.publicKey.toBase58(),
          v1_digest: d.digest,
          v1_anchor: receipt.anchor_address,
          v1_tx: signature,
          v2_digest: d2.digest,
          v2_anchor: r2.anchor_address,
          v2_tx: r2.transaction_signature,
          explorer_v1: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
        },
        null,
        2,
      ),
    );
  });
});
