const PUBLIC_DEVNET_RPCS = [
  "https://solana-devnet.publicnode.com",
  "https://api.devnet.solana.com",
];
const MAX_RPC_BYTES = 64 * 1024;
const RPC_METHODS = new Set([
  "getAccountInfo",
  "getMultipleAccounts",
  "getTransaction",
  "getGenesisHash",
  "getLatestBlockhash",
  "getBalance",
  "getSlot",
]);

function jsonError(status, message) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { message } }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function proxyDevnetRpc(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
      },
    });
  }
  if (request.method !== "POST") {
    return jsonError(405, "POST only");
  }
  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX_RPC_BYTES) {
    return jsonError(413, "payload too large");
  }
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(buf));
  } catch {
    return jsonError(400, "invalid json");
  }
  const calls = Array.isArray(payload) ? payload : [payload];
  if (!calls.length || calls.length > 8) {
    return jsonError(400, "bad batch");
  }
  for (const call of calls) {
    if (!call || call.jsonrpc !== "2.0" || typeof call.method !== "string") {
      return jsonError(400, "not jsonrpc");
    }
    if (!RPC_METHODS.has(call.method)) {
      return jsonError(403, "method not allowed");
    }
  }
  const urls = [];
  if (env && typeof env.DEVNET_RPC_URL === "string" && env.DEVNET_RPC_URL.startsWith("https://")) {
    urls.push(env.DEVNET_RPC_URL);
  }
  for (const u of PUBLIC_DEVNET_RPCS) urls.push(u);

  let last = jsonError(502, "upstream failed");
  const body = JSON.stringify(payload);
  for (const url of urls) {
    try {
      const upstream = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (upstream.ok) {
        return new Response(upstream.body, {
          status: upstream.status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        });
      }
      last = new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    } catch {
      last = jsonError(502, "upstream failed");
    }
  }
  return last;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/rpc") {
      return proxyDevnetRpc(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
