/**
 * Devnet integration test — vertical slice with durable evidence output.
 *
 *   QAL_DEVNET=1 pnpm test:devnet
 *
 * Requires deployed program + funded wallet (not grant receive wallet).
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
  verifyVaultWithReceipt,
  revokeAnchor,
  supersedeVault,
  serializeReceipt,
  fetchGenesisHash,
  hexToBytes,
} from "../../packages/sdk/src/index.js";
import { loadWallet } from "../../packages/cli/src/wallet.js";

const RUN = process.env.QAL_DEVNET === "1";
const network = "solana-devnet" as const;

describe("devnet integration", { skip: !RUN }, () => {
  let wallet: Keypair;
  let connection: Connection;
  let evidenceDir: string;

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
    evidenceDir = path.join(
      process.cwd(),
      "evidence",
      "devnet",
      "v0.1.2",
    );
    await fs.mkdir(evidenceDir, { recursive: true });
  });

  it("full flow: encrypt → anchor → verify receipt → tamper → revoke → supersede", async () => {
    const genesis = await fetchGenesisHash(connection);
    await fs.writeFile(path.join(evidenceDir, "genesis-hash.txt"), `${genesis}\n`);
    await fs.writeFile(
      path.join(evidenceDir, "program-id.txt"),
      `${QAL_PROGRAM_ID.toBase58()}\n`,
    );
    await fs.writeFile(
      path.join(evidenceDir, "source-commit.txt"),
      `${process.env.QAL_SOURCE_COMMIT ?? "unknown"}\n`,
    );

    // 1–2. Generate vault + digest
    const vault = await encryptVaultV2({
      plaintext: JSON.stringify({
        evidence: "qal-devnet-e2e",
        ts: new Date().toISOString(),
        note: "experimental pre-alpha — not production evidence",
      }),
      password: "devnet-test-phrase-not-for-production-use",
      mode: "self",
      opslimit: 1,
      memlimit: 32 * 1024 * 1024,
    });
    const d = computeVaultDigest(vault);

    // 3–5. Anchor
    const { receipt, signature, anchor } = await anchorVault(
      { vault, network },
      wallet,
      { network },
    );
    assert.equal(anchor.vault_digest, d.digest);
    assert.equal(anchor.issuer, wallet.publicKey.toBase58());

    await fs.writeFile(
      path.join(evidenceDir, "anchor-receipt.json"),
      serializeReceipt(receipt),
    );
    await fs.writeFile(
      path.join(evidenceDir, "anchor-transaction.txt"),
      `${signature}\n`,
    );

    // 6. Receipt-directed verify (full tiers including tx provenance)
    const ok = await verifyVaultWithReceipt(vault, receipt, {
      connection,
      verifyTransaction: true,
    });
    assert.equal(ok.cryptographic_match, true);
    assert.equal(ok.outcome, "VALID_ACTIVE");
    assert.equal(ok.tiers.transaction_provenance, true);
    assert.equal(ok.official_program, true);

    // 7. Tamper against receipt → DIGEST_MISMATCH
    const tampered = structuredClone(vault) as {
      content: { ciphertext: string };
      [k: string]: unknown;
    };
    const ct = tampered.content.ciphertext.split("");
    ct[0] = ct[0] === "A" ? "B" : "A";
    tampered.content.ciphertext = ct.join("");
    const mismatch = await verifyVaultWithReceipt(tampered, receipt, {
      connection,
      verifyTransaction: false, // focus on digest path
    });
    assert.equal(mismatch.cryptographic_match, false);
    assert.equal(mismatch.outcome, "DIGEST_MISMATCH");

    // 8–9. Revoke; still match with VALID_REVOKED
    const revokeSig = await revokeAnchor(
      wallet.publicKey,
      d.digestBytes,
      wallet,
      { network },
    );
    await fs.writeFile(
      path.join(evidenceDir, "revoke-transaction.txt"),
      `${revokeSig}\n`,
    );

    const revoked = await verifyVaultWithReceipt(vault, receipt, {
      connection,
      verifyTransaction: false,
    });
    // controller still matches receipt (issuer=controller)
    assert.equal(revoked.cryptographic_match, true);
    assert.equal(revoked.outcome, "VALID_REVOKED");
    assert.equal(revoked.status, "revoked");

    // For supersede we need active/disputed — use a fresh vault pair
    const vaultA = await encryptVaultV2({
      plaintext: JSON.stringify({ rev: 1, t: Date.now() }),
      password: "devnet-test-phrase-not-for-production-use",
      mode: "self",
      opslimit: 1,
      memlimit: 32 * 1024 * 1024,
    });
    const vaultB = await encryptVaultV2({
      plaintext: JSON.stringify({ rev: 2, t: Date.now() }),
      password: "devnet-test-phrase-not-for-production-use",
      mode: "self",
      opslimit: 1,
      memlimit: 32 * 1024 * 1024,
    });
    const dA = computeVaultDigest(vaultA);
    const dB = computeVaultDigest(vaultB);

    await anchorVault({ vault: vaultA, network }, wallet, { network });
    const {
      receipt: rB,
      signature: supersedeSig,
      fullySuperseded,
      oldDigest,
      newDigest,
    } = await supersedeVault(
      {
        oldVault: vaultA,
        newVault: vaultB,
        issuer: wallet.publicKey,
      },
      wallet,
      { network },
    );
    assert.equal(fullySuperseded, true);
    assert.equal(oldDigest, dA.digest);
    assert.equal(newDigest, dB.digest);
    assert.equal(rB.parent_digest_claim, dA.digest);

    await fs.writeFile(
      path.join(evidenceDir, "supersede-transaction.txt"),
      `${supersedeSig}\n`,
    );
    await fs.writeFile(
      path.join(evidenceDir, "supersede-receipt.json"),
      serializeReceipt(rB),
    );

    const lineage = await verifyVaultWithReceipt(vaultB, rB, {
      connection,
      verifyTransaction: true,
    });
    assert.equal(lineage.outcome, "VALID_ACTIVE");
    assert.equal(lineage.parent_digest_claim, dA.digest);

    await fs.writeFile(
      path.join(evidenceDir, "vault-digests.json"),
      `${JSON.stringify(
        {
          primary_digest: d.digest,
          primary_anchor: receipt.anchor_address,
          primary_status: receipt.status_address,
          primary_tx: signature,
          primary_final_status: "revoked",
          supersede_old_digest: dA.digest,
          supersede_new_digest: dB.digest,
          supersede_tx: supersedeSig,
          supersede_new_anchor: rB.anchor_address,
        },
        null,
        2,
      )}\n`,
    );

    await fs.writeFile(
      path.join(evidenceDir, "explorer-links.md"),
      [
        "# Devnet explorer links",
        "",
        `- Program: https://explorer.solana.com/address/${QAL_PROGRAM_ID.toBase58()}?cluster=devnet`,
        `- Anchor tx: https://explorer.solana.com/tx/${signature}?cluster=devnet`,
        `- Revoke tx: https://explorer.solana.com/tx/${revokeSig}?cluster=devnet`,
        `- Supersede tx: https://explorer.solana.com/tx/${supersedeSig}?cluster=devnet`,
        `- Anchor PDA: https://explorer.solana.com/address/${receipt.anchor_address}?cluster=devnet`,
        "",
      ].join("\n"),
    );

    await fs.writeFile(
      path.join(evidenceDir, "test-output.txt"),
      [
        "devnet integration: PASS",
        `program: ${QAL_PROGRAM_ID.toBase58()}`,
        `issuer: ${wallet.publicKey.toBase58()}`,
        `primary_outcome_after_revoke: VALID_REVOKED`,
        `tamper_outcome: DIGEST_MISMATCH`,
        `supersede: fully_superseded=true`,
        `verify_tiers_on_anchor: ${JSON.stringify(ok.tiers)}`,
        "",
      ].join("\n"),
    );
  });
});
