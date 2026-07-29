import crypto from 'node:crypto';
import fs from 'node:fs';
import {ENDPOINTS, routeFor, redact} from './endpoints.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const TELEMETRY = 'research/derived/rpc-telemetry.jsonl';

// Per-endpoint counters so both sources' observed error rates are reportable separately.
export const STATS = {
  alchemy: {calls:0, transportRetries:0, rateLimited:0, failures:0, absentFirstRead:0, repaired:0},
  public:  {calls:0, transportRetries:0, rateLimited:0, failures:0, absentFirstRead:0, repaired:0,
            traceRejects:0, traceRepairs:0},
};
export function logEvent(ev) {
  fs.appendFileSync(TELEMETRY, redact(JSON.stringify({ts:new Date().toISOString(), ...ev})) + '\n');
}
export class RateLimited extends Error {}

export async function rpc(method, params, {retries = 6, endpoint} = {}) {
  const ep = endpoint ? ENDPOINTS[endpoint] : routeFor(method);
  const S = STATS[ep.label];
  let lastErr;
  for (let a = 0; a < retries; a++) {
    try {
      S.calls++;
      const res = await fetch(ep.url, {method:'POST',
        headers:{'Content-Type':'application/json','User-Agent':'curl/8.7.1'},
        body: JSON.stringify({jsonrpc:'2.0', id:1, method, params})});
      if (res.status === 429) {
        S.rateLimited++;
        logEvent({kind:'rate_limited', endpoint:ep.label, method, attempt:a+1});
        throw new RateLimited(`429 from ${ep.label}`);
      }
      const txt = await res.text();
      let j; try { j = JSON.parse(txt); }
      catch { throw new Error(`non-JSON (${res.status}): ${redact(txt).slice(0,120)}`); }
      if (j.error) throw new Error(`rpc error: ${redact(JSON.stringify(j.error)).slice(0,180)}`);
      if (j.result === undefined) throw new Error(`no result`);
      if (a > 0) { S.transportRetries += a; logEvent({kind:'transport_retry', endpoint:ep.label, method, attempts:a+1}); }
      return j.result;
    } catch (e) {
      lastErr = e;
      if (e instanceof RateLimited && a >= 2) { S.failures++; throw e; }  // surface, don't grind
      await sleep(400 * 2 ** a);
    }
  }
  STATS[ep.label].failures++;
  logEvent({kind:'transport_failure', endpoint:ep.label, method, error: redact(lastErr.message).slice(0,200)});
  throw new Error(`${method} on ${ep.label} failed after ${retries}: ${redact(lastErr.message)}`);
}

const ABSENT = v => v === null || v === '0x' || /^0x0*$/.test(String(v));
export async function readConfirmed(method, params, {confirm = 8, gap = 200, endpoint, ctx = {}} = {}) {
  const ep = endpoint ? ENDPOINTS[endpoint] : routeFor(method);
  const S = STATS[ep.label];
  const first = await rpc(method, params, {endpoint: ep.label});
  if (!ABSENT(first)) return {value: first, repaired: false};
  S.absentFirstRead++;
  for (let i = 0; i < confirm; i++) {
    await sleep(gap);
    const again = await rpc(method, params, {endpoint: ep.label});
    if (!ABSENT(again)) {
      S.repaired++;
      logEvent({kind:'read_repair', endpoint:ep.label, method, target:params[0], block:params[1], attemptsToRepair:i+1, ...ctx});
      return {value: again, repaired: true};
    }
  }
  logEvent({kind:'absent_accepted', endpoint:ep.label, method, target:params[0], block:params[1], ...ctx});
  return {value: first, repaired: false};
}
export const sha256hex = h => crypto.createHash('sha256').update(Buffer.from(String(h).replace(/^0x/,''),'hex')).digest('hex');
