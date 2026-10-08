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


/* Presentation-only homepage and fund refresh. Do not modify proof/RPC, receipts, static assets or wallet. */
const QAL_EDITORIAL_CSS="\n/* QAL editorial public-facing refresh; core game, proof and funding scripts untouched */\n:root{--paper:#f5f3ee;--ink:#131b1d;--link:#224c53;--fund:#cc642b}\nbody{background:#f5f3ee;color:#172022}\n.app-bar{background:#13191d;border-bottom:1px solid #374143;gap:1.1rem;padding:.75rem clamp(1rem,3.2vw,3rem)}\n.app-bar .brand{font-family:var(--mono);font-size:1.15rem;letter-spacing:-.05em;border:1px solid #a5c9ca;padding:.25rem .55rem}\n.app-bar a,.app-bar .nav-parent{border-radius:3px;font-size:.86rem}\n.app-bar .nav-fund{color:#121a19!important;background:#d4f273;border-radius:3px;font-weight:800;padding:.55rem 1rem}\n.app-bar .nav-fund:hover{color:#121a19!important;background:#ebffb2}\n.home .app-main{width:min(1240px,calc(100% - 2.2rem));padding-top:0}\n.qal-intro{padding:clamp(2.3rem,6vw,5rem) 0 2.2rem}\n.qal-kicker,.qal-overline{font-family:var(--mono);font-size:.72rem;font-weight:650;letter-spacing:.12em;text-transform:uppercase}\n.qal-overline{display:flex;justify-content:space-between;gap:1rem;color:#496368;border-top:1px solid #a8b4b0;padding-top:.8rem}\n.qal-overline span:last-child{color:#925228}\n.qal-hero-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(250px,.8fr);gap:clamp(1.5rem,4vw,5rem);align-items:end;margin-top:1.65rem}\n.qal-kicker{color:#7f633e;margin-bottom:1.05rem}\n.qal-intro h1{font-size:clamp(3rem,7.6vw,6.7rem);letter-spacing:-.073em;line-height:.98;font-weight:700;max-width:880px;margin:0 0 1.5rem}\n.qal-intro h1 em{font-style:normal;color:#527674;display:block}\n.qal-lede{max-width:630px;font-size:clamp(1.08rem,1.55vw,1.28rem);line-height:1.55;color:#4c5856;margin:0 0 1.65rem}\n.qal-actions{display:flex;flex-wrap:wrap;gap:.7rem;align-items:center}\n.qal-actions a{border-radius:3px;padding:.85rem 1.15rem;font-weight:750;text-decoration:none;display:inline-flex;gap:1rem;align-items:center}\n.qal-actions a:first-child{background:#1c292a;color:#fff}\n.qal-actions a:last-child{border:1px solid #a5b0ad;color:#1d383b}\n.qal-actions a:hover{filter:brightness(1.13)}\n.qal-aside{background:#172528;color:#f4f5e9;border:1px solid #263e42;padding:1.5rem 1.4rem 1.2rem;border-radius:3px}\n.qal-aside .qal-kicker{color:#d4f273}\n.qal-aside h2{font-size:1.45rem;letter-spacing:-.04em;line-height:1.2;margin:.25rem 0 1.15rem}\n.qal-aside ol{counter-reset:steps;list-style:none;padding:0}\n.qal-aside li{display:grid;grid-template-columns:32px 1fr;gap:.6rem;align-items:start;padding:.9rem 0;border-top:1px solid #355054;font-size:.95rem;line-height:1.45}\n.qal-aside li::before{counter-increment:steps;content:\"0\" counter(steps);color:#d4f273;font-family:var(--mono);font-size:.78rem;padding-top:.16rem}\n.qal-aside small{display:block;color:#a5c1bf;line-height:1.4;margin-top:.85rem}\n.qal-context{display:flex;flex-wrap:wrap;gap:.65rem 1.25rem;margin-top:1.35rem;font-family:var(--mono);font-size:.72rem;color:#5d706e}\n.qal-context span::before{content:\"•\";color:#d06336;margin-right:.4rem}\n.home .workspace{scroll-margin-top:5.5rem}\n.qal-support-strip{background:#d4f273;color:#172021;display:grid;grid-template-columns:1fr auto;gap:1.5rem;align-items:center;padding:1.3rem 1.6rem;margin:1.25rem 0 3rem;border:1px solid #aec34c}\n.qal-support-strip .qal-kicker{color:#384d18}\n.qal-support-strip h2{font-size:clamp(1.2rem,2vw,1.65rem);letter-spacing:-.04em;margin:.2rem 0}\n.qal-support-strip p{max-width:650px;color:#415040;font-size:.9rem}\n.qal-support-strip a{color:#fff;background:#182322;padding:.85rem 1.1rem;text-decoration:none;font-weight:800;white-space:nowrap;border-radius:2px}\n.home .below>h2{letter-spacing:-.04em}\n.home .go-card,.home .breath-card,.home .proof-card,.home .fund-card{border-radius:3px}\n.home .go-card{border-top:3px solid #456a68}\n.home .fund-card{border:1px solid #d0aa7a;background:#fff8ef}\n.home .fund-card .btn-fund{background:#9d4b23;color:#fff;border-radius:2px}\n.home .fund-card h3{letter-spacing:-.03em}\n.fund-page .wrap{width:min(940px,calc(100% - 2rem));margin:0 auto}\n.qal-fund-intro{padding:3.8rem 0 2rem;border-bottom:1px solid #b6bdb6;margin-bottom:1.5rem}\n.qal-fund-intro .qal-overline{margin-bottom:1.5rem}\n.qal-fund-intro h1{font-size:clamp(2.9rem,7vw,5.6rem);line-height:1.03;letter-spacing:-.065em;margin:0 0 1.1rem;max-width:800px}\n.qal-fund-intro h1 em{color:#b85d2a;font-style:normal}\n.qal-fund-intro p{max-width:710px;font-size:1.15rem;color:#56615e;line-height:1.6}\n.qal-roadmap{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.75rem;margin:1.5rem 0}\n.qal-roadmap article{border:1px solid #c8d0c8;border-top:3px solid #537c77;padding:1.1rem;background:#fff}\n.qal-roadmap span{font-family:var(--mono);font-size:.73rem;color:#ac5d33}\n.qal-roadmap h2{font-size:1.03rem;margin:.55rem 0 .35rem;line-height:1.25}\n.qal-roadmap p{font-size:.9rem;color:#5c6763;margin:0}\n.qal-fund-note{color:#6b5546;font-size:.88rem;line-height:1.5;margin:.7rem 0 2rem}\n.fund-page .fund-card{border-radius:3px;border-color:#b9a48c}\n@media(max-width:830px){.qal-hero-grid{grid-template-columns:1fr}.qal-aside{max-width:none}.qal-support-strip{grid-template-columns:1fr}.qal-intro{padding-top:2rem}.qal-roadmap{grid-template-columns:1fr}}\n@media(max-width:560px){.qal-intro h1{font-size:clamp(2.7rem,13.5vw,4rem)}.qal-overline{flex-direction:column;gap:.2rem}.qal-actions a{width:100%;justify-content:center}.qal-aside{padding:1rem}.qal-support-strip{padding:1.15rem}.app-bar .nav-fund{margin-left:0}.qal-fund-intro{padding-top:2rem}}\n@media(prefers-reduced-motion:reduce){.qal-intro *, .qal-support-strip *{animation:none!important;transition:none!important}}\n";
const QAL_HERO="\n<section class=\"qal-intro\" aria-labelledby=\"qal-heading\">\n  <div class=\"qal-overline\"><span>QAL / PUBLIC FILE VERIFICATION</span><span>Open prototype · Solana Devnet</span></div>\n  <div class=\"qal-hero-grid\">\n    <div>\n      <p class=\"qal-kicker\">THE PROBLEM WITH \"TRUST US\"</p>\n      <h1 id=\"qal-heading\">Don't take their word for it. <em>Check the file.</em></h1>\n      <p class=\"qal-lede\">A company can change a PDF after you've read it. Screenshots won't settle the argument. QAL is building a way to check whether the file people see today matches the version recorded earlier.</p>\n      <div class=\"qal-actions\">\n        <a href=\"#play\">Try the 2-minute demo <span aria-hidden=\"true\">↗</span></a>\n        <a href=\"/evidence/devnet/\">Inspect the real testnet proof <span aria-hidden=\"true\">→</span></a>\n      </div>\n      <div class=\"qal-context\"><span>No account to try the demo</span><span>No QAL token</span><span>Experimental, not audited</span></div>\n    </div>\n    <aside class=\"qal-aside\" aria-label=\"How file checking works\">\n      <p class=\"qal-kicker\">THE IDEA, WITHOUT THE JARGON</p>\n      <h2>One file. Three simple steps.</h2>\n      <ol>\n        <li>Keep the original file on your own computer.</li>\n        <li>Record a small digital fingerprint on the public test network.</li>\n        <li>Later, check whether another copy matches that fingerprint.</li>\n      </ol>\n      <small>This checks whether files match. It cannot tell you whether a document's claims are true.</small>\n    </aside>\n  </div>\n</section>\n";
const QAL_SUPPORT="\n<section class=\"qal-support-strip\" aria-label=\"Help build QAL\">\n  <div>\n    <p class=\"qal-kicker\">INDEPENDENT PROJECT · COMMUNITY SUPPORTED</p>\n    <h2>Help make file verification usable by everyone.</h2>\n    <p>Support independent review, a proper file locker, and free public checks. No token sale, no promised return. Just work that still needs funding.</p>\n  </div>\n  <a href=\"/fund/\">See what your donation funds →</a>\n</section>\n";
const QAL_FUND="\n<section class=\"qal-fund-intro\" aria-labelledby=\"fund-heading\">\n  <div class=\"qal-overline\"><span>QAL / SUPPORT THE BUILD</span><span>Voluntary donations · SOL</span></div>\n  <h1 id=\"fund-heading\">Good proof should be <em>public.</em> Help us build it.</h1>\n  <p>The first public testnet proof is already up. The next job is making the technology safe enough, clear enough, and simple enough for real people to use. Your support goes toward that work, not a coin or an investment.</p>\n</section>\n<div class=\"qal-roadmap\" aria-label=\"What donations are intended to support\">\n  <article><span>01 / REVIEW</span><h2>Get the security work checked</h2><p>Independent review and documented fixes before any broader release.</p></article>\n  <article><span>02 / PRODUCT</span><h2>Build the real file locker</h2><p>Move beyond practice mode with a safer, clearer way to record proof.</p></article>\n  <article><span>03 / ACCESS</span><h2>Keep checking free</h2><p>Make the public verifier easier to use, explain and maintain.</p></article>\n</div>\n<p class=\"qal-fund-note\">Donations are optional and non-refundable unless the sender and recipient separately arrange otherwise. This is not a purchase, a security, or a promise of future access. The project is experimental and has not been audited.</p>\n";
function refreshPublicPage(html, path) {
  let updated=html;
  if(path==="/") {
    const headStart='<div class="hit">';
    const end='<!-- 3D stage + controls side by side so the next click is never off-screen -->';
    const i=updated.indexOf(headStart), j=updated.indexOf(end);
    if(i<0||j<i) return null;
    updated=updated.slice(0,i)+QAL_HERO+'\n'+updated.slice(j);
    const marker='<div class="below">';
    if(!updated.includes(marker)) return null;
    updated=updated.replace(marker,QAL_SUPPORT+'\n'+marker);
    updated=updated.replace('They swapped the PDF. The fingerprint didn’t. — QAL','QAL — Check the file, not the promise');
  } else if(path==="/fund/"||path==="/fund") {
    const start=updated.indexOf('<p class="crumb">Fund</p>');
    const end=updated.indexOf('<section class="fund-card fund-in"');
    if(start<0||end<=start) return null;
    updated=updated.slice(0,start)+QAL_FUND+'\n'+updated.slice(end);
    updated=updated.replace('Fund QAL — send SOL','Support QAL — build public file verification');
    updated=updated.replace('class="app"','class="app fund-page"');
  } else return null;
  updated=updated.replaceAll('>Fund</a>','>Support QAL</a>');
  if(!updated.includes('</head>')) return null;
  updated=updated.replace('</head>','<style id="qal-editorial-20261008">'+QAL_EDITORIAL_CSS+'</style></head>');
  return updated;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/rpc") {
      return proxyDevnetRpc(request, env);
    }
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/fund/" || url.pathname === "/fund")) {
      const original = await env.ASSETS.fetch(request);
      if (!original.ok || !(original.headers.get("content-type") || "").includes("text/html")) return original;
      const newHtml = refreshPublicPage(await original.text(), url.pathname);
      if (newHtml === null) return original;
      const headers = new Headers(original.headers);
      headers.delete("content-length"); headers.delete("etag"); headers.delete("content-encoding");
      headers.set("cache-control", "no-store");
      headers.set("x-qal-presentation", "editorial-20261008");
      return new Response(newHtml, {status: original.status, headers});
    }
    return env.ASSETS.fetch(request);
  },
};
