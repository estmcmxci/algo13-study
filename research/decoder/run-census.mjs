#!/usr/bin/env node
/**
 * Deliverable #2: run the decoder across the full direct-import census and
 * produce the trace/decoder reconciliation dataset.
 *
 *   node research/decoder/run-census.mjs
 *
 * in : research/derived/p1-calls-for-decode.json
 * out: research/derived/p2-decode.jsonl        (one object per call)
 *      research/derived/p2-reconciliation.json (cohort/period tables + disagreements)
 *
 * The decoder is run EXACTLY ONCE per call with no per-call special-casing and
 * no knowledge of `n13_trace` inside the decode path. `n13_trace` is copied
 * through and compared only after the fact.
 */
import fs from 'node:fs'
import path from 'node:path'
import { decodeCall, DECODER_VERSION } from './index.mjs'

const ROOT = path.resolve(import.meta.dirname, '../..')
const IN = path.join(ROOT, 'research/derived/p1-calls-for-decode.json')
const OUT = path.join(ROOT, 'research/derived/p2-decode.jsonl')
const REPORT = path.join(ROOT, 'research/derived/p2-reconciliation.json')

const calls = JSON.parse(fs.readFileSync(IN, 'utf8'))

const emptyBucket = () => ({
  n: 0,
  decoded_ok: 0,
  decode_failed: 0,
  agree: 0,
  disagree: 0,
  delta_distribution: {},
  status: {},
  shape: {},
  error_codes: {},
})

const bump = (o, k) => {
  o[k] = (o[k] ?? 0) + 1
}

const cohorts = {}
const periods = {}
const cohortPeriod = {}
const disagreements = []
const out = []

for (const call of calls) {
  const r = decodeCall({
    callId: call.callId,
    calldata: call.calldata,
    registrarVersion: call.registrarVersion,
    // NOTE: no `now`. Block timestamps are not present in the input, so the
    // RRSIG inception/expiration checks are skipped rather than fabricated.
    // They gate an RRSet before any dispatch, and every call in this census
    // succeeded on-chain, so they passed in production by construction.
  })

  const record = {
    callId: call.callId,
    tx: call.tx,
    block: call.block,
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
    decoder_version: DECODER_VERSION,
  }
  out.push(JSON.stringify(record))

  const keys = [
    [cohorts, call.registrarVersion],
    [periods, call.period],
    [cohortPeriod, `${call.registrarVersion}/${call.period}`],
  ]
  for (const [table, key] of keys) {
    if (!table[key]) table[key] = emptyBucket()
    const b = table[key]
    b.n++
    bump(b.status, r.decode_status)
    bump(b.shape, r.proof_shape)
    if (r.decode_status === 'ok') {
      b.decoded_ok++
      const delta = r.n13_decoded - call.n13_trace
      bump(b.delta_distribution, delta)
      if (delta === 0) b.agree++
      else b.disagree++
    } else {
      b.decode_failed++
      bump(b.error_codes, r.decode_error?.code ?? 'unknown')
    }
  }

  if (r.decode_status !== 'ok' || r.n13_decoded !== call.n13_trace) {
    disagreements.push({
      callId: call.callId,
      tx: call.tx,
      block: call.block,
      registrarVersion: call.registrarVersion,
      period: call.period,
      selector: call.selector,
      n13_trace: call.n13_trace,
      n13_decoded: r.n13_decoded,
      delta: r.decode_status === 'ok' ? r.n13_decoded - call.n13_trace : null,
      decode_status: r.decode_status,
      decode_error: r.decode_error,
      terminal: r.terminal,
      proof_depth: r.proof_depth,
      algorithms_seen: r.algorithms_seen,
      proof_shape: r.proof_shape,
      proof_hash: r.proof_hash,
    })
  }
}

fs.writeFileSync(OUT, `${out.join('\n')}\n`)

const rate = (b) => (b.decoded_ok === 0 ? null : +(b.agree / b.decoded_ok).toFixed(6))
const withRate = (t) =>
  Object.fromEntries(
    Object.entries(t).map(([k, b]) => [k, { ...b, agreement_rate_of_decoded: rate(b) }]),
  )

const report = {
  decoder_version: DECODER_VERSION,
  input: path.relative(ROOT, IN),
  output: path.relative(ROOT, OUT),
  total_calls: calls.length,
  time_checks: 'skipped (no block timestamps in input)',
  by_cohort: withRate(cohorts),
  by_period: withRate(periods),
  by_cohort_period: withRate(cohortPeriod),
  disagreement_count: disagreements.length,
  disagreements,
}
fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`)

// Console summary — cohorts kept strictly separate, never blended.
const line = (label, b) =>
  `${label.padEnd(34)} n=${String(b.n).padStart(5)}  ok=${String(b.decoded_ok).padStart(5)}` +
  `  failed=${String(b.decode_failed).padStart(4)}` +
  `  agree=${String(b.agree).padStart(5)}  disagree=${String(b.disagree).padStart(5)}` +
  `  rate=${b.decoded_ok ? (b.agree / b.decoded_ok * 100).toFixed(2) + '%' : 'n/a'}`

console.log('=== BY COHORT ===')
for (const [k, b] of Object.entries(cohorts)) console.log(line(k, b))
console.log('\n=== BY PERIOD ===')
for (const [k, b] of Object.entries(periods)) console.log(line(k, b))
console.log('\n=== BY COHORT x PERIOD ===')
for (const [k, b] of Object.entries(cohortPeriod)) console.log(line(k, b))
console.log('\n=== DELTA DISTRIBUTION (decoded - trace), per cohort ===')
for (const [k, b] of Object.entries(cohorts)) {
  console.log(k, JSON.stringify(b.delta_distribution), 'errors:', JSON.stringify(b.error_codes))
}
console.log('\n=== PROOF SHAPE, per cohort ===')
for (const [k, b] of Object.entries(cohorts)) console.log(k, JSON.stringify(b.shape))
console.log(`\ndisagreements (incl. decode failures): ${disagreements.length}`)
