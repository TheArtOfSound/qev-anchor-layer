/**
 * Revision lineage helpers.
 *
 * parent_digest_claim is an UNVERIFIED claim unless FLAG_PARENT_SUPERSEDED_ATOMIC
 * was set by the supersede_vault instruction. History walks claims only.
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
  parent_digest_claim: string | null;
  /** True when flags bit 2 (atomic supersede) is set on the child. */
  parent_claim_atomic: boolean;
}

export async function walkRevisionHistory(
  issuer: PublicKey,
  startDigestHex: string,
  opts: AnchorClientOptions,
  maxDepth = 32,
): Promise<HistoryEntry[]> {
  const connection = createConnection(opts);
  await connection.getSlot();

  const chain: HistoryEntry[] = [];
  let current = startDigestHex;

  for (let i = 0; i < maxDepth; i++) {
    const digestBytes = hexToBytes(current);
    const { anchor, status } = await fetchAnchorForIssuerDigest(
      issuer,
      digestBytes,
      opts,
    );
    if (!anchor) break;

    const parent = isZeroDigest(hexToBytes(anchor.parent_digest_claim))
      ? null
      : anchor.parent_digest_claim;
    const parent_claim_atomic = (anchor.flags & (1 << 2)) !== 0;

    chain.push({
      vault_digest: anchor.vault_digest,
      anchor,
      status,
      parent_digest_claim: parent,
      parent_claim_atomic,
    });

    if (!parent) break;
    current = parent;
  }

  return chain;
}
