/**
 * Explicit network configuration. No silent mainnet. No unknown-network fallback.
 */

import type { SolanaNetwork } from "./types.js";

/** Compromised historical program ID — never use for deployment. */
export const COMPROMISED_PROGRAM_ID =
  "AFGfcVVNtucEjJXvL7QSrRLdujr7yWqnC8FdhP7rpixf";

/**
 * Active pre-alpha program ID (keypair is NOT in the repository).
 * Keypair path (local only): ~/.config/qal/qal-anchor-program-keypair.json
 */
export const QAL_PROGRAM_ID_STRING =
  "6cN9gD8LBqkEUhvT4LibnbBgXdCHeC5AgqvcFQQTNvnR";

/** Well-known Solana genesis hashes for cluster binding. */
export const GENESIS_HASH = {
  /** Mainnet-beta — listed only so we can REJECT it. */
  "solana-mainnet-beta": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  "solana-devnet": "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  // localnet genesis is ephemeral; verified by RPC equality only when expected is set
} as const;

export interface NetworkConfig {
  network: SolanaNetwork;
  programId: string;
  defaultRpcUrl: string;
  /** Expected genesis hash; null for localnet (ephemeral). */
  expectedGenesisHash: string | null;
  supportsMainnet: false;
}

const NETWORKS: Record<SolanaNetwork, NetworkConfig> = {
  "solana-devnet": {
    network: "solana-devnet",
    programId: QAL_PROGRAM_ID_STRING,
    defaultRpcUrl: process.env.QAL_RPC_URL ?? "https://api.devnet.solana.com",
    expectedGenesisHash: GENESIS_HASH["solana-devnet"],
    supportsMainnet: false,
  },
  "solana-localnet": {
    network: "solana-localnet",
    programId: QAL_PROGRAM_ID_STRING,
    defaultRpcUrl: process.env.QAL_RPC_URL ?? "http://127.0.0.1:8899",
    expectedGenesisHash: null,
    supportsMainnet: false,
  },
};

export function parseNetwork(flag: string | undefined): SolanaNetwork {
  if (flag === undefined || flag === "") {
    throw new Error(
      "Network is required. Use --network devnet or --network localnet. Mainnet is not supported in pre-alpha.",
    );
  }
  const n = flag.toLowerCase().trim();
  if (n === "devnet" || n === "solana-devnet") return "solana-devnet";
  if (n === "localnet" || n === "local" || n === "solana-localnet") {
    return "solana-localnet";
  }
  if (n === "mainnet" || n === "mainnet-beta" || n === "solana-mainnet-beta") {
    throw new Error(
      "Mainnet is not supported. QAL pre-alpha is devnet/localnet only, unaudited.",
    );
  }
  throw new Error(
    `Unknown network "${flag}". Allowed: devnet, localnet. No silent defaults.`,
  );
}

export function getNetworkConfig(network: SolanaNetwork): NetworkConfig {
  const cfg = NETWORKS[network];
  if (!cfg) {
    throw new Error(`Unsupported network: ${String(network)}`);
  }
  return cfg;
}

export function defaultRpcUrl(network: SolanaNetwork): string {
  return getNetworkConfig(network).defaultRpcUrl;
}

export function programIdForNetwork(network: SolanaNetwork): string {
  return getNetworkConfig(network).programId;
}

/** CLI alias kept for compatibility with older imports. */
export function networkFromCli(flag: string | undefined): SolanaNetwork {
  return parseNetwork(flag);
}
