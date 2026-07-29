import {rpc, STATS, logEvent} from './rpc.mjs';
// The endpoint intermittently serves "absent" for historical state that exists.
// EPISODIC IN TIME (healthy windows 0%, bad windows several %), so correlated
// re-reads inside a bad window defeat per-read voting. Defence = invariant
// assertion + whole-operation retry with backoff. Every repair is logged so the
// observed corruption rate is reportable as a measured quantity.
const ABSENT = v => v === '0x' || /^0x0*$/.test(v);
const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function readConfirmed(method, params, {confirm = 4, gap = 300, ctx = {}} = {}) {
  const first = await rpc(method, params);
  if (!ABSENT(first)) return {value: first, repaired: false};
  for (let i = 0; i < confirm; i++) {
    await sleep(gap);
    const again = await rpc(method, params);
    if (!ABSENT(again)) {
      STATS.readRepairs++;
      logEvent({kind: 'read_repair', method, address: params[0], block: params[1],
                attemptsToRepair: i + 1, ...ctx});
      return {value: again, repaired: true};
    }
  }
  STATS.absentAccepted++;
  logEvent({kind: 'absent_accepted', method, address: params[0], block: params[1], ...ctx});
  return {value: first, repaired: false};
}
async function bisectOnce(addr, hi0) {
  let lo = 0, hi = hi0;
  const codeAt = async b => (await readConfirmed('eth_getCode', [addr, '0x' + b.toString(16)])).value;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; (await codeAt(m)) === '0x' ? lo = m : hi = m; }
  const before = await codeAt(hi - 1), at = await codeAt(hi);
  if (before !== '0x' || at === '0x') throw new Error(`invariant failed at ${hi}`);
  return hi;
}
export async function creationBlock(addr, hi0, attempts = 6) {
  let last;
  for (let a = 0; a < attempts; a++) {
    try { return await bisectOnce(addr, hi0); }
    catch (e) { last = e; logEvent({kind: 'invariant_failure', op: 'creationBlock', address: addr, attempt: a + 1});
                await sleep(1500 * (a + 1)); }
  }
  throw new Error(`creationBlock(${addr}) failed after ${attempts}: ${last.message}`);
}
