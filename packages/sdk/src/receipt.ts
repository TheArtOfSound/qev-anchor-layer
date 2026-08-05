import {
  QAL_PROTOCOL,
  QAL_PROTOCOL_VERSION,
  type QalReceipt,
  type SolanaNetwork,
} from "./types.js";

export function buildReceipt(params: {
  network: SolanaNetwork;
  program_id: string;
  anchor_address: string;
  status_address: string;
  issuer: string;
  controller: string;
  vault_digest: string;
  qev_schema: string;
  content_reference: string | null;
  parent_digest: string | null;
  transaction_signature: string;
  created_slot: number;
}): QalReceipt {
  return {
    protocol: QAL_PROTOCOL,
    protocol_version: QAL_PROTOCOL_VERSION,
    network: params.network,
    program_id: params.program_id,
    anchor_address: params.anchor_address,
    status_address: params.status_address,
    issuer: params.issuer,
    controller: params.controller,
    vault_digest: params.vault_digest,
    qev_schema: params.qev_schema,
    content_reference: params.content_reference,
    parent_digest: params.parent_digest,
    transaction_signature: params.transaction_signature,
    created_slot: params.created_slot,
  };
}

export function serializeReceipt(receipt: QalReceipt): string {
  return `${JSON.stringify(receipt, null, 2)}\n`;
}

export function parseReceipt(json: string): QalReceipt {
  const obj = JSON.parse(json) as QalReceipt;
  if (obj.protocol !== QAL_PROTOCOL) {
    throw new Error(`Not a QAL receipt (protocol=${String(obj.protocol)})`);
  }
  return obj;
}
