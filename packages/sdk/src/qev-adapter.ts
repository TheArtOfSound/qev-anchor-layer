/**
 * Thin adapter over the public @bryan237l/qev-cli surface.
 * QAL never vendors QEV crypto source — only documented exports.
 */

import { createRequire } from "node:module";
import {
  encryptVaultV2,
  decryptVaultV2,
  validateVaultSchemaV2,
  canonicalJSON,
  runSelfTest,
  VERSION as QEV_PACKAGE_VERSION,
  SCHEMA_V2,
  MAX_PLAINTEXT_BYTES,
} from "@bryan237l/qev-cli";

export {
  encryptVaultV2,
  decryptVaultV2,
  validateVaultSchemaV2,
  canonicalJSON,
  runSelfTest,
  QEV_PACKAGE_VERSION,
  SCHEMA_V2,
  MAX_PLAINTEXT_BYTES,
};

export const PINNED_QEV_VERSION = "0.30.0";

/**
 * Read the installed npm package version from package.json.
 * Note: QEV's exported `VERSION` constant may lag the package version
 * (0.30.0 package still exported VERSION "0.29.0" in inspected build).
 */
export function installedQevPackageVersion(): string {
  try {
    const req = createRequire(import.meta.url);
    const entry = req.resolve("@bryan237l/qev-cli");
    // package.json is not in "exports"; resolve relative to the entry file.
    const path = req("node:path") as typeof import("node:path");
    const fs = req("node:fs") as typeof import("node:fs");
    const pkgPath = path.join(path.dirname(entry), "..", "package.json");
    const raw = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? String(QEV_PACKAGE_VERSION);
  } catch {
    return String(QEV_PACKAGE_VERSION);
  }
}

export interface EncryptFileOptions {
  /** UTF-8 plaintext string or raw bytes. */
  plaintext: string | Uint8Array;
  password: string;
  mode?: "self" | "share";
  opslimit?: number;
  memlimit?: number;
}

/**
 * Encrypt via QEV public API. Returns the vault object (not a file path).
 */
export async function encryptWithQev(opts: EncryptFileOptions): Promise<unknown> {
  return encryptVaultV2({
    plaintext: opts.plaintext,
    password: opts.password,
    mode: opts.mode ?? "self",
    opslimit: opts.opslimit,
    memlimit: opts.memlimit,
  });
}

/**
 * Decrypt via QEV public API. Returns plaintext string (QEV default).
 */
export async function decryptWithQev(vault: unknown, password: string): Promise<string> {
  return decryptVaultV2({ vault, password }) as Promise<string>;
}

/**
 * Run QEV self-test and return version metadata.
 */
export async function checkQevCompatibility(options?: {
  /** When true, installed npm version must equal PINNED_QEV_VERSION. Default true for doctor. */
  requirePinnedVersion?: boolean;
}): Promise<{
  ok: boolean;
  qevVersion: string;
  pinnedVersion: string;
  schema: string;
  versionMatch: boolean;
  error?: string;
}> {
  const requirePinned = options?.requirePinnedVersion !== false;
  const qevVersion = installedQevPackageVersion();
  const versionMatch = qevVersion === PINNED_QEV_VERSION;
  try {
    await runSelfTest();
    if (requirePinned && !versionMatch) {
      return {
        ok: false,
        qevVersion,
        pinnedVersion: PINNED_QEV_VERSION,
        schema: String(SCHEMA_V2),
        versionMatch,
        error: `Installed @bryan237l/qev-cli@${qevVersion} != pinned ${PINNED_QEV_VERSION}`,
      };
    }
    return {
      ok: true,
      qevVersion,
      pinnedVersion: PINNED_QEV_VERSION,
      schema: String(SCHEMA_V2),
      versionMatch,
    };
  } catch (err) {
    return {
      ok: false,
      qevVersion,
      pinnedVersion: PINNED_QEV_VERSION,
      schema: String(SCHEMA_V2 ?? "unknown"),
      versionMatch,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
