import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

/**
 * Load a Solana keypair from common locations.
 * Never logs secret material.
 */
export async function loadWallet(walletPath?: string): Promise<Keypair> {
  const resolved =
    walletPath ??
    process.env.QAL_WALLET ??
    process.env.SOLANA_WALLET ??
    path.join(os.homedir(), ".config", "solana", "id.json");

  const expanded = resolved.startsWith("~/")
    ? path.join(os.homedir(), resolved.slice(2))
    : resolved;

  const raw = await fs.readFile(expanded, "utf8");
  const trimmed = raw.trim();

  // JSON byte array (solana-keygen format)
  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }

  // base58 secret key
  try {
    const secret = bs58.decode(trimmed);
    return Keypair.fromSecretKey(secret);
  } catch {
    throw new Error(`Unable to parse wallet at ${expanded}`);
  }
}

export function walletPathDefault(): string {
  return (
    process.env.QAL_WALLET ??
    process.env.SOLANA_WALLET ??
    path.join(os.homedir(), ".config", "solana", "id.json")
  );
}
