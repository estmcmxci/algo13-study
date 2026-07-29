import {rpc, readConfirmed, STATS, logEvent} from './rpc.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Cross-source trace validation.
// The trace comes from 'public' (the only source that serves trace methods).
// The reference tx/receipt come from 'alchemy' — an INDEPENDENT clean source — so a
// bad window on the public endpoint cannot corrupt subject and reference together.
export async function getTxAndReceipt(hash) {
  const tx = (await readConfirmed('eth_getTransactionByHash', [hash], {endpoint:'alchemy'})).value;
  const rc = (await readConfirmed('eth_getTransactionReceipt', [hash], {endpoint:'alchemy'})).value;
  if (!tx || !rc) throw new Error(`tx/receipt unavailable on alchemy: ${hash}`);
  return {tx, rc};
}
export async function getValidatedTrace(hash, {tries = 10, ref, ctx = {}} = {}) {
  const {tx, rc} = ref ?? await getTxAndReceipt(hash);
  const want = {from:(tx.from||'').toLowerCase(), to:(tx.to||'').toLowerCase(),
                gasUsed:BigInt(rc.gasUsed), input:tx.input};
  let last;
  for (let i = 0; i < tries; i++) {
    const t = await rpc('debug_traceTransaction', [hash, {tracer:'callTracer'}], {endpoint:'public'});
    const v = [];
    if (!t) v.push('null trace');
    else {
      if ((t.from||'').toLowerCase() !== want.from) v.push('from');
      if ((t.to||'').toLowerCase() !== want.to) v.push('to');
      if (t.gasUsed !== undefined && BigInt(t.gasUsed) !== want.gasUsed) v.push('gasUsed');
      if (t.input !== undefined && t.input !== want.input) v.push('input');
    }
    if (!v.length) {
      if (i > 0) { STATS.public.traceRepairs++; logEvent({kind:'trace_repair', endpoint:'public', hash, attempts:i+1, ...ctx}); }
      return {tx, rc, trace:t, traceAttempts:i+1};
    }
    last = v; STATS.public.traceRejects++;
    logEvent({kind:'trace_reject', endpoint:'public', hash, attempt:i+1, violations:v, ...ctx});
    await sleep(250);
  }
  throw new Error(`trace failed cross-source validation ${tries}x: ${hash} [${last?.join(',')}]`);
}
