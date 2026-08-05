/**
 * Minimal ambient types for @bryan237l/qev-cli@0.30.0 public surface.
 * Upstream package ships JS without TypeScript declarations.
 */
declare module "@bryan237l/qev-cli" {
  export const SCHEMA_V1: string;
  export const SCHEMA_V2: string;
  export const SCHEMA: string;
  export const VERSION: string;
  export const KDF_ALG: string;
  export const AEAD_ALG: string;
  export const DEFAULT_OPSLIMIT: number;
  export const DEFAULT_MEMLIMIT: number;
  export const MIN_OPSLIMIT: number;
  export const MAX_OPSLIMIT: number;
  export const MIN_MEMLIMIT: number;
  export const MAX_MEMLIMIT: number;
  export const SALT_BYTES: number;
  export const NONCE_BYTES: number;
  export const KEY_BYTES: number;
  export const TAG_BYTES: number;
  export const MAX_PLAINTEXT_BYTES: number;
  export const MAX_CIPHERTEXT_BYTES: number;
  export const LOCK_PRESETS: Record<
    string,
    { opslimit: number; memlimit: number; label: string; hint: string }
  >;
  export const DEFAULT_PRESET_KEY: string;

  export function ready(): Promise<unknown>;
  export function validateVaultSchemaV2(vault: unknown): void;
  export function encryptVaultV2(opts: {
    plaintext: string | Uint8Array;
    password: string;
    mode?: "self" | "share";
    opslimit?: number;
    memlimit?: number;
  }): Promise<Record<string, unknown>>;
  export function decryptVaultV2(opts: {
    vault: unknown;
    password: string;
  }): Promise<string>;
  export function rewrapVaultV2(opts: {
    vault: unknown;
    oldPassword: string;
    newPassword: string;
  }): Promise<Record<string, unknown>>;
  export function runSelfTest(): Promise<void>;
  export function generatePassphrase(wordCount?: number): string;

  export function canonicalJSON(value: unknown): string;
  export function buildAADV2(vault: unknown): string;
  export function b64urlEncode(bytes: Uint8Array): string;
  export function b64urlDecode(s: string): Uint8Array;
  export function utf8(s: string): Uint8Array;
  export function fromUtf8(bytes: Uint8Array): string;
}
