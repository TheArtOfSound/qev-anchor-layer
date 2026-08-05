/**
 * Revision lineage helpers (parent_digest chain).
 * Full historical indexing requires an indexer; v0.1 walks known digests / receipts.
 */

import { PublicKey } from "@solana/web3.js";
import { hexToBytes, isZeroDigest } from "./digest.js";
import {
  createConnection,
  fetchAnchorForIssuerDigest,
  type AnchorClientOptions,
} from "./anchor.js";
import type { VaultAnchorAccount, VaultStatusAccount } from "./types.js";

export interface HistoryEntry {
  vault_digest: string;
  anchor: VaultAnchorAccount;
  status: VaultStatusAccount | null;
  parent_digest: string | null;
}

/**
 * Walk parent_digest links starting from a known digest for a given issuer.
 * Stops at zero parent or missing account. Max depth prevents infinite loops.
 */
export async function walkRevisionHistory(
  issuer: PublicKey,
  startDigestHex: string,
  opts: AnchorClientOptions,
  maxDepth = 32,
): Promise<HistoryEntry[]> {
  const connection = createConnection(opts);
  // touch connection to fail fast
  await connection.getSlot();

  const chain: HistoryEntry[] = [];
  let current = startDigestHex;

  for (let i = 0; i < maxDepth; i++) {
    const digestBytes = hexToBytes(current);
    const { anchor, status } = await fetchAnchorForIssuerDigest(issuer, digestBytes, opts);
    if (!anchor) break;

    const parent = isZeroDigest(hexToBytes(anchor.parent_digest))
      ? null
      : anchor.parent_digest;

    chain.push({
      vault_digest: anchor.vault_digest,
      anchor,
      status,
      parent_digest: parent,
    });

    if (!parent) break;
    current = parent;
  }

  return chain;
}
