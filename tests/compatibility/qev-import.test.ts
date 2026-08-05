/**
 * QEV external import + self-test + digest determinism.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  encryptVaultV2,
  decryptVaultV2,
  validateVaultSchemaV2,
  canonicalJSON,
  runSelfTest,
  VERSION,
} from "@bryan237l/qev-cli";
import {
  computeVaultDigest,
  DigestError,
  checkQevCompatibility,
  PINNED_QEV_VERSION,
  sha256Hex,
  bytesToHex,
  schemaHash,
} from "../../packages/sdk/src/index.js";

describe("QEV external package", () => {
  it("imports public API from @bryan237l/qev-cli", () => {
    assert.equal(typeof encryptVaultV2, "function");
    assert.equal(typeof decryptVaultV2, "function");
    assert.equal(typeof validateVaultSchemaV2, "function");
    assert.equal(typeof canonicalJSON, "function");
    assert.equal(typeof runSelfTest, "function");
  });

  it("reports installed QEV version", () => {
    assert.ok(typeof VERSION === "string" && VERSION.length > 0);
    // Pinned dependency is 0.30.0; installed VERSION field should match package.
    assert.equal(PINNED_QEV_VERSION, "0.30.0");
  });

  it("passes QEV runSelfTest", async () => {
    await runSelfTest();
  });

  it("checkQevCompatibility succeeds", async () => {
    const r = await checkQevCompatibility();
    assert.equal(r.ok, true);
  });
});

describe("deterministic digests", () => {
  it("pretty vs compact JSON same digest", async () => {
    const vault = await encryptVaultV2({
      plaintext: "qal-digest-fixture",
      password: "test-phrase-for-qal-only-not-secret-prod",
      mode: "self",
      opslimit: 1,
      memlimit: 32 * 1024 * 1024,
    });

    const compact = JSON.parse(JSON.stringify(vault));
    const pretty = JSON.parse(JSON.stringify(vault, null, 2));

    // Re-parse through different whitespace
    const fromPretty = JSON.parse(JSON.stringify(pretty, null, 4));
    const d1 = computeVaultDigest(compact);
    const d2 = computeVaultDigest(fromPretty);
    assert.equal(d1.digest, d2.digest);
  });

  it("key reordering does not change digest", async () => {
    const vault = (await encryptVaultV2({
      plaintext: "reorder-test",
      password: "test-phrase-for-qal-only-not-secret-prod",
      mode: "self",
      opslimit: 1,
      memlimit: 32 * 1024 * 1024,
    })) as Record<string, unknown>;

    // Build object with keys in reverse order
    const keys = Object.keys(vault).reverse();
    const reordered: Record<string, unknown> = {};
    for (const k of keys) reordered[k] = vault[k];

    assert.equal(computeVaultDigest(vault).digest, computeVaultDigest(reordered).digest);
  });

  it("canonical string hashes with sha256 as specified", async () => {
    const vault = await encryptVaultV2({
      plaintext: "spec-hash",
      password: "test-phrase-for-qal-only-not-secret-prod",
      mode: "self",
      opslimit: 1,
      memlimit: 32 * 1024 * 1024,
    });
    const d = computeVaultDigest(vault);
    assert.equal(d.digest, sha256Hex(d.canonical));
    assert.equal(d.schema, "BRY-NFET-SX-VAULT-V2");
    assert.equal(d.schemaHashHex, bytesToHex(schemaHash(d.schema)));
  });

  it("rejects unsupported schema", () => {
    assert.throws(
      () =>
        computeVaultDigest({
          schema: "BRY-NFET-SX-VAULT-V1",
          version: "0",
          created_at: "x",
          mode: "self",
          kdf: {},
          wrap: {},
          content: {},
        }),
      (err: unknown) => err instanceof DigestError && err.code === "UNSUPPORTED_QEV_SCHEMA",
    );
  });

  it("rejects malformed vault", () => {
    assert.throws(
      () => computeVaultDigest({ schema: "BRY-NFET-SX-VAULT-V2" }),
      (err: unknown) => err instanceof DigestError && err.code === "MALFORMED_QEV",
    );
  });
});
