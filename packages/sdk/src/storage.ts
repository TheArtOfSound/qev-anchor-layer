/**
 * Optional encrypted-vault storage adapters.
 * Default QAL workflow is digest-only; storage is never required for anchoring.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { contentRefHash, bytesToHex } from "./digest.js";
import type { StorageReceipt, VaultStorageAdapter } from "./types.js";

/**
 * Store vault JSON under a local directory. Reference is a relative file id.
 */
export class LocalFileStorage implements VaultStorageAdapter {
  constructor(private readonly rootDir: string) {}

  async put(vaultBytes: Uint8Array): Promise<StorageReceipt> {
    await fs.mkdir(this.rootDir, { recursive: true });
    const hash = bytesToHex(contentRefHash(Buffer.from(vaultBytes).toString("base64url")));
    const fileName = `${hash.slice(0, 32)}.qev.json`;
    const full = path.join(this.rootDir, fileName);
    await fs.writeFile(full, vaultBytes);
    const reference = `file://${fileName}`;
    return {
      reference,
      content_ref_hash: bytesToHex(contentRefHash(reference)),
      adapter: "local-file",
    };
  }

  async get(reference: string): Promise<Uint8Array> {
    const name = reference.startsWith("file://") ? reference.slice("file://".length) : reference;
    const full = path.isAbsolute(name) ? name : path.join(this.rootDir, name);
    return new Uint8Array(await fs.readFile(full));
  }
}

/**
 * Optional IPFS adapter via a writable HTTP API (e.g. Kubo /api/v0/add).
 * CID is not confidential — encrypted vault may become publicly retrievable.
 */
export class IPFSStorage implements VaultStorageAdapter {
  constructor(
    private readonly apiUrl: string = "http://127.0.0.1:5001",
  ) {}

  async put(vaultBytes: Uint8Array): Promise<StorageReceipt> {
    const form = new FormData();
    form.append(
      "file",
      new Blob([vaultBytes], { type: "application/json" }),
      "vault.qev.json",
    );
    const res = await fetch(`${this.apiUrl}/api/v0/add?pin=true`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      throw new Error(`IPFS add failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { Hash?: string; cid?: string };
    const cid = body.Hash ?? body.cid;
    if (!cid) {
      throw new Error("IPFS add response missing CID");
    }
    const reference = `ipfs://${cid}`;
    return {
      reference,
      content_ref_hash: bytesToHex(contentRefHash(reference)),
      adapter: "ipfs",
    };
  }

  async get(reference: string): Promise<Uint8Array> {
    const cid = reference.startsWith("ipfs://")
      ? reference.slice("ipfs://".length)
      : reference.replace(/^\/ipfs\//, "");
    const gateway = this.apiUrl.includes("5001")
      ? "http://127.0.0.1:8080"
      : this.apiUrl;
    const res = await fetch(`${gateway}/ipfs/${cid}`);
    if (!res.ok) {
      throw new Error(`IPFS get failed: HTTP ${res.status}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }
}

/**
 * No-op storage: digest-only mode.
 */
export class NullStorage implements VaultStorageAdapter {
  async put(_vaultBytes: Uint8Array): Promise<StorageReceipt> {
    return {
      reference: "",
      content_ref_hash: bytesToHex(new Uint8Array(32)),
      adapter: "null",
    };
  }

  async get(_reference: string): Promise<Uint8Array> {
    throw new Error("NullStorage has no stored vaults");
  }
}
