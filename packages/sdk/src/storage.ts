/**
 * Optional encrypted-vault storage adapters.
 * Default QAL workflow is digest-only.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { contentRefHash, bytesToHex } from "./digest.js";
import type { StorageReceipt, VaultStorageAdapter } from "./types.js";

function resolveInsideRoot(rootDir: string, reference: string): string {
  const name = reference.startsWith("file://")
    ? reference.slice("file://".length)
    : reference;
  if (path.isAbsolute(name)) {
    throw new Error("LocalFileStorage refuses absolute paths");
  }
  if (name.includes("\0")) {
    throw new Error("LocalFileStorage refuses null bytes in path");
  }
  const root = path.resolve(rootDir);
  const full = path.resolve(root, name);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("LocalFileStorage path escape blocked");
  }
  return full;
}

export class LocalFileStorage implements VaultStorageAdapter {
  constructor(private readonly rootDir: string) {}

  async put(vaultBytes: Uint8Array): Promise<StorageReceipt> {
    await fs.mkdir(this.rootDir, { recursive: true });
    const hash = bytesToHex(
      contentRefHash(Buffer.from(vaultBytes).toString("base64url")),
    );
    const fileName = `${hash.slice(0, 32)}.qev.json`;
    const full = resolveInsideRoot(this.rootDir, fileName);
    await fs.writeFile(full, vaultBytes);
    const reference = `file://${fileName}`;
    return {
      reference,
      content_ref_hash: bytesToHex(contentRefHash(reference)),
      adapter: "local-file",
    };
  }

  async get(reference: string): Promise<Uint8Array> {
    const full = resolveInsideRoot(this.rootDir, reference);
    return new Uint8Array(await fs.readFile(full));
  }
}

export class IPFSStorage implements VaultStorageAdapter {
  constructor(private readonly apiUrl: string = "http://127.0.0.1:5001") {}

  async put(vaultBytes: Uint8Array): Promise<StorageReceipt> {
    if (vaultBytes.length > 2 * 1024 * 1024) {
      throw new Error("IPFS put refused: vault exceeds 2 MiB safety limit");
    }
    const form = new FormData();
    form.append(
      "file",
      new Blob([vaultBytes], { type: "application/json" }),
      "vault.qev.json",
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(`${this.apiUrl}/api/v0/add?pin=true`, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`IPFS add failed: HTTP ${res.status}`);
      const body = (await res.json()) as { Hash?: string; cid?: string };
      const cid = body.Hash ?? body.cid;
      if (!cid || !/^[A-Za-z0-9]+$/.test(cid)) {
        throw new Error("IPFS add response missing or invalid CID");
      }
      const reference = `ipfs://${cid}`;
      return {
        reference,
        content_ref_hash: bytesToHex(contentRefHash(reference)),
        adapter: "ipfs",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async get(reference: string): Promise<Uint8Array> {
    const cid = reference.startsWith("ipfs://")
      ? reference.slice("ipfs://".length)
      : reference.replace(/^\/ipfs\//, "");
    if (!/^[A-Za-z0-9]+$/.test(cid)) {
      throw new Error("Invalid CID");
    }
    const gateway = this.apiUrl.includes("5001")
      ? "http://127.0.0.1:8080"
      : this.apiUrl;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(`${gateway}/ipfs/${cid}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`IPFS get failed: HTTP ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length > 2 * 1024 * 1024) {
        throw new Error("IPFS get refused: response exceeds 2 MiB safety limit");
      }
      return buf;
    } finally {
      clearTimeout(timer);
    }
  }
}

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
