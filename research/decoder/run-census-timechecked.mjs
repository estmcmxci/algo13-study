#!/usr/bin/env node
/**
 * Deliverable #3a: re-run the full census decode with the RRSIG
 * inception/expiration checks ENABLED, using each transaction's real block
 * timestamp.
 *
 * This changes exactly ONE thing versus run-census.mjs: `now` is supplied.
 * No decode semantics are altered.
 */
import fs from 'node:fs'
import path from 'node:path'
import { decodeCall, DECODER_VERSION } from './index.mjs'

const ROOT = path.resolve(import.meta.dirname, '../..')
const calls = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'research/derived/p1-calls-for-decode.json'), 'utf8'),
)
const blocks = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'research/derived/p3-block-timestamps.json'), 'utf8'),
)
const prior = fs
  .readFileSync(path.join(ROOT, 'research/derived/p2-decode.jsonl'), 'utf8')
  .trim()
  .split('\n')
  .map(JSON.parse)
const priorById = new Map(prior.map((r) => [r.callId, r]))

const out = []
const cohorts = {}
const changed = []
const timeSkipped = []

for (const call of calls) {
  const blk = blocks[String(call.block)]
  if (!blk || typeof blk.timestamp !== 'number') {
    timeSkipped.push(call.callId)
  }
  const r = decodeCall({
    callId: call.callId,
    calldata: call.calldata,
    registrarVersion: call.registrarVersion,
    now: blk ? blk.timestamp : undefined,
  })

  const before = priorById.get(call.callId)
  const rec = {
    callId: call.callId,
    tx: call.tx,
    block: call.block,
    blockTimestamp: blk?.timestamp ?? null,
    registrarVersion: call.registrarVersion,
    period: call.period,
    selector: call.selector,
    traceAddress: call.traceAddress,
    n13_trace: call.n13_trace,
    n13_decoded: r.n13_decoded,
    agrees: r.decode_status === 'ok' && r.n13_decoded === call.n13_trace,
    delta: r.decode_status === 'ok' ? r.n13_decoded - call.n13_trace : null,
    algorithms_seen: r.algorithms_seen,
    proof_depth: r.proof_depth,
    matching_key: r.matching_key,
    proof_hash: r.proof_hash,
    proof_shape: r.proof_shape,
    decode_status: r.decode_status,
    decode_error: r.decode_error,
    terminal: r.terminal,
    time_checks: r.time_checks,
    decoder_version: DECODER_VERSION,
  }
  out.push(JSON.stringify(rec))

  const c = (cohorts[call.registrarVersion] ??= {
    n: 0, ok: 0, failed: 0, agree: 0, disagree: 0, delta: {}, errors: {}, timeApplied: 0,
  })
  c.n++
  if (r.time_checks === 'applied') c.timeApplied++
  if (r.decode_status === 'ok') {
    c.ok++
    const d = r.n13_decoded - call.n13_trace
    c.delta[d] = (c.delta[d] ?? 0) + 1
    if (d === 0) c.agree++
    else c.disagree++
  } else {
    c.failed++
    c.errors[r.decode_error?.code ?? '?'] = (c.errors[r.decode_error?.code ?? '?'] ?? 0) + 1
  }

  // Diff against the time-checks-skipped run.
  if (
    before &&
    (before.n13_decoded !== r.n13_decoded ||
      before.decode_status !== r.decode_status ||
      before.terminal.outcome !== r.terminal.outcome)
  ) {
    changed.push({
      callId: call.callId,
      tx: call.tx,
      block: call.block,
      blockTimestamp: blk?.timestamp ?? null,
      registrarVersion: call.registrarVersion,
      period: call.period,
      n13_trace: call.n13_trace,
      before: { n13: before.n13_decoded, status: before.decode_status, terminal: before.terminal },
      after: { n13: r.n13_decoded, status: r.decode_status, terminal: r.terminal, error: r.decode_error },
    })
  }
}

fs.writeFileSync(
  path.join(ROOT, 'research/derived/p2-decode-timechecked.jsonl'),
  `${out.join('\n')}\n`,
)

console.log('=== TIME-CHECKED RE-RUN, BY COHORT ===')
for (const [k, c] of Object.entries(cohorts)) {
  console.log(
    `${k.padEnd(9)} n=${String(c.n).padStart(5)} ok=${String(c.ok).padStart(5)} failed=${String(c.failed).padStart(4)}` +
      ` agree=${String(c.agree).padStart(5)} disagree=${String(c.disagree).padStart(5)}` +
      ` rate=${c.ok ? ((c.agree / c.ok) * 100).toFixed(2) + '%' : 'n/a'}` +
      ` timeChecksApplied=${c.timeApplied}/${c.n}`,
  )
  console.log(`          delta=${JSON.stringify(c.delta)} errors=${JSON.stringify(c.errors)}`)
}
console.log(`\ncalls whose decode CHANGED vs the skipped-time run: ${changed.length}`)
for (const c of changed.slice(0, 25)) console.log(' ', JSON.stringify(c))
console.log(`calls with no timestamp available: ${timeSkipped.length}`)
