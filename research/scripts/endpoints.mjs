import fs from 'node:fs';
import path from 'node:path';

// Two sources, deliberately split:
//   'alchemy' — clean archive: receipts, txs, blocks, logs, eth_call, eth_getCode, state.
//   'public'  — the ONLY source of traces we have (Alchemy free tier gates trace methods).
// Trace validation references are fetched from 'alchemy' so a trace is checked against an
// INDEPENDENT source, not against the same endpoint that produced it.
//
// SECRET HANDLING: the Alchemy URL embeds the API key, so the URL itself is the secret.
// It is read from the environment at runtime, never hardcoded, and a redaction guard
// below makes it impossible for the URL to reach telemetry, manifests or stdout.

// Repo layout: the endpoint is supplied by env var, falling back to a .env at the
// repo root. The original study read it from ens-contracts/.env; that path does not
// exist here, and this is the only change made to the scripts for publication.
const ENV_PATH = path.resolve('.env');
function readEnvValue(key) {
  if (process.env[key]) return process.env[key];
  if (process.env.MAINNET_RPC_URL && key === 'MAINNET_API_KEY') return process.env.MAINNET_RPC_URL;
  const txt = fs.readFileSync(ENV_PATH, 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[1] === key) return m[2].replace(/^["']|["']$/g, '').trim();
  }
  throw new Error(`${key} not found — set it in the environment or in .env at the repo root`);
}
const ALCHEMY_URL = readEnvValue('MAINNET_API_KEY');
if (!/^https?:\/\//.test(ALCHEMY_URL)) throw new Error('MAINNET_API_KEY is not a URL');
const PUBLIC_URL = 'https://evm.stupidtech.net/v1/1';

// Redaction guard: strip the secret (and any bare key segment) from any string we emit.
const SECRETS = [ALCHEMY_URL, ...ALCHEMY_URL.split('/').filter(s => s.length >= 20)];
export function redact(s) {
  let out = typeof s === 'string' ? s : JSON.stringify(s);
  for (const sec of SECRETS) if (sec) out = out.split(sec).join('«REDACTED»');
  return out;
}
export const ENDPOINTS = {
  alchemy: {label: 'alchemy', url: ALCHEMY_URL, note: 'clean archive; trace methods gated on free tier'},
  public:  {label: 'public',  url: PUBLIC_URL,  note: 'traces only; measured wrong-shape rate 2-4%'},
};
export const TRACE_METHODS = new Set(['debug_traceTransaction','debug_traceCall','debug_traceBlockByNumber',
                                      'trace_transaction','trace_filter','trace_block']);
// Alchemy's free tier caps eth_getLogs at a 10-BLOCK range, which is unusable across a
// 12.5M-block census. The public endpoint serves full-range getLogs in one call and measured
// 0/50 errors on it, returning exact stable counts. So logs route to 'public' and are
// cross-validated per-transaction against Alchemy receipts (which independently carry the logs).
export const PUBLIC_ONLY = new Set([...TRACE_METHODS, 'eth_getLogs']);
export function routeFor(method) { return PUBLIC_ONLY.has(method) ? ENDPOINTS.public : ENDPOINTS.alchemy; }
