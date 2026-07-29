#!/usr/bin/env node
/**
 * INDEPENDENT AUDIT — stage 3: re-derive the nine headline figures.
 *
 * Nothing is imported from research/scripts/**. No derivation document was
 * read. Actual on-chain gas is fetched fresh from receipts rather than taken
 * from any census file. The algorithm split is computed with this agent's own
 * decoder from raw calldata.
 */
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, rpc, scrub } from './rpc.mjs'
import { decodeCall } from '../decoder/index.mjs'

const CUTOFF = 25627360
const REALIZED_FROM = 24619423
const R = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))

// ── p3-replay dedup ─────────────────────────────────────────────────────────
// 2,716 rows / 2,283 callIds. 433 ids have two rows; in all 88 disagreeing
// cases the disagreement is error-vs-success, i.e. a failed attempt followed by
// a retry. RULE: keep the successful row (ok | ok_reverted). If several
// successful rows exist for one id, require them to agree on the gas triple and
// keep the first; if they disagreed that would be a determinism violation and
// is reported rather than silently resolved.
const dedupeReplay = () => {
  const rows = fs
    .readFileSync(path.join(ROOT, 'research/derived/p3-replay.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))
  const byId = new Map()
  for (const r of rows) {
    if (!byId.has(r.callId)) byId.set(r.callId, [])
    byId.get(r.callId).push(r)
  }
  const kept = []
  const noSuccess = []
  const conflicting = []
  for (const [id, rs] of byId) {
    const ok = rs.filter((r) => r.replay_status === 'ok' || r.replay_status === 'ok_reverted')
    if (ok.length === 0) {
      noSuccess.push({ id, statuses: rs.map((r) => r.replay_status) })
      continue
    }
    const keys = new Set(ok.map((r) => JSON.stringify([r.gas_old, r.gas_new, r.delta_gas])))
    if (keys.size > 1) conflicting.push({ id, variants: [...keys] })
    kept.push(ok[0])
  }
  return { rows, kept, noSuccess, conflicting, distinctIds: byId.size }
}

const ols = (xs, ys) => {
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) ** 2
  }
  const slope = num / den
  return { slope, intercept: my - slope * mx, n }
}

const main = async () => {
  const out = {}
  const { rows, kept, noSuccess, conflicting, distinctIds } = dedupeReplay()
  out.replay_dedup = {
    raw_rows: rows.length,
    distinct_callIds: distinctIds,
    kept: kept.length,
    callIds_with_no_successful_row: noSuccess.length,
    noSuccess_detail: noSuccess,
    successful_duplicates_that_disagree: conflicting.length,
    conflicting_detail: conflicting,
  }

  const ok = kept.filter((r) => r.replay_status === 'ok')
  const succ = ok.filter((r) => r.population === 'successful')

  // ── FIGURE 1: per-verification gas, current oracle ────────────────────────
  // Estimated as the SLOPE of whole-oracle gas on the number of algorithm-13
  // dispatches, over current-oracle successful calls. Intercept absorbs the
  // fixed oracle/chain cost, so the slope is the marginal cost of one
  // verification — which is what "per-verification gas" means.
  const cur = succ.filter((r) => r.oracleRole === 'oracle_current' && r.n13_trace != null)
  const oldFit = ols(cur.map((r) => r.n13_trace), cur.map((r) => r.gas_old_exec))
  const newFit = ols(cur.map((r) => r.n13_trace), cur.map((r) => r.gas_new_exec))
  out.fig1_per_verification = {
    method: 'OLS slope of whole-oracle exec gas on n13, current-oracle successful calls',
    n: cur.length,
    old_slope: Math.round(oldFit.slope),
    old_intercept: Math.round(oldFit.intercept),
    new_slope: Math.round(newFit.slope),
    new_intercept: Math.round(newFit.intercept),
  }
  // cross-check: mean of delta_gas / n13 over calls with n13 > 0
  const perCall = cur.filter((r) => r.n13_trace > 0).map((r) => r.delta_gas / r.n13_trace)
  out.fig1_crosscheck_mean_delta_over_n13 = Math.round(
    perCall.reduce((a, b) => a + b, 0) / perCall.length,
  )
  // cross-check 2: bucket means
  const buckets = {}
  for (const r of cur) {
    ;(buckets[r.n13_trace] ??= { old: [], new: [] }).old.push(r.gas_old_exec)
    buckets[r.n13_trace].new.push(r.gas_new_exec)
  }
  out.fig1_bucket_means = Object.fromEntries(
    Object.entries(buckets).map(([k, v]) => [
      k,
      {
        n: v.old.length,
        old: Math.round(v.old.reduce((a, b) => a + b, 0) / v.old.length),
        new: Math.round(v.new.reduce((a, b) => a + b, 0) / v.new.length),
      },
    ]),
  )

  // ── FIGURE 2: ratio and % reduction ───────────────────────────────────────
  out.fig2 = {
    ratio_old_over_new: +(oldFit.slope / newFit.slope).toFixed(2),
    pct_reduction: +((1 - newFit.slope / oldFit.slope) * 100).toFixed(2),
  }

  // ── realized-period population, from the replay rows ──────────────────────
  const realized = succ.filter((r) => r.block >= REALIZED_FROM && r.block <= CUTOFF)
  const realizedTxs = [...new Set(realized.map((r) => r.tx))]
  out.realized_population = {
    calls: realized.length,
    distinct_txs: realizedTxs.length,
    all_current_oracle: realized.every((r) => r.oracleRole === 'oracle_current'),
    all_actual_new: realized.every((r) => r.actualVariantOnChain === 'new'),
  }

  // ── FIGURE 3: total gas saved in the realized period ──────────────────────
  const deltaByTx = new Map()
  for (const r of realized) deltaByTx.set(r.tx, (deltaByTx.get(r.tx) ?? 0) + r.delta_gas)
  const totalDelta = [...deltaByTx.values()].reduce((a, b) => a + b, 0)
  out.fig3_realized_total_gas_saved = totalDelta

  // ── FIGURE 4/5: realized totals and means, using FRESH receipts ───────────
  // Post-P_ENS the chain ran the NEW verifier, so actual receipt gas IS the
  // "new" total. The "old" counterfactual is actual + delta.
  const gasUsed = new Map()
  for (const tx of realizedTxs) {
    const rcpt = await rpc('eth_getTransactionReceipt', [tx])
    if (!rcpt) throw new Error(`no receipt for ${tx}`)
    if (rcpt.status !== '0x1') throw new Error(`realized tx not successful: ${tx}`)
    gasUsed.set(tx, Number(rcpt.gasUsed))
  }
  const newTotal = [...gasUsed.values()].reduce((a, b) => a + b, 0)
  const oldTotal = newTotal + totalDelta
  out.fig4_realized_totals = {
    new_total_actual_receipt_gas: newTotal,
    old_total_counterfactual: oldTotal,
    difference: oldTotal - newTotal,
    receipts_fetched: gasUsed.size,
  }
  out.fig5_means_per_import = {
    imports: realizedTxs.length,
    new_mean: Math.round(newTotal / realizedTxs.length),
    old_mean: Math.round(oldTotal / realizedTxs.length),
  }

  // ── FIGURE 9: transaction-level headroom factor ───────────────────────────
  out.fig9_headroom = {
    interpretation: 'old mean per import / new mean per import',
    value: +(oldTotal / newTotal).toFixed(2),
  }

  // ── FIGURE 6: signature verifications by algorithm, via MY decoder ────────
  const calls = R('research/derived/p1-calls-for-decode.json')
  const algCount = {}
  let totalDispatch = 0
  let decodeFailures = 0
  for (const c of calls) {
    const d = decodeCall({
      callId: c.callId,
      calldata: c.calldata,
      registrarVersion: c.registrarVersion,
    })
    if (d.decode_status !== 'ok') decodeFailures++
    for (const disp of d.dispatches) {
      algCount[disp.algorithm] = (algCount[disp.algorithm] ?? 0) + 1
      totalDispatch++
    }
  }
  const NAMES = { 5: 'RSASHA1', 7: 'RSASHA1(NSEC3)', 8: 'RSASHA256', 13: 'ECDSAP256SHA256' }
  out.fig6_verifications = {
    method: 'independent decoder replay of raw calldata for all 2,127 registrar calls',
    total: totalDispatch,
    by_algorithm: Object.fromEntries(
      Object.entries(algCount)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([k, v]) => [`${k} (${NAMES[k] ?? '?'})`, v]),
    ),
    rsa_sha1_combined_5_and_7: (algCount[5] ?? 0) + (algCount[7] ?? 0),
    decode_failures: decodeFailures,
  }

  // ── FIGURE 8: elapsed time and rate ───────────────────────────────────────
  const ts = R('research/derived/p3-block-timestamps.json')
  const claimBlocks = R('research/audit/a1-population.json')
  const firstB = claimBlocks.first_claim_block
  const lastB = claimBlocks.last_claim_block
  const tFirst = ts[String(firstB)]?.timestamp ?? Number(
    (await rpc('eth_getBlockByNumber', [`0x${firstB.toString(16)}`, false])).timestamp,
  )
  const tLast = ts[String(lastB)]?.timestamp ?? Number(
    (await rpc('eth_getBlockByNumber', [`0x${lastB.toString(16)}`, false])).timestamp,
  )
  const days = (tLast - tFirst) / 86400
  out.fig8_time = {
    first_claim_block: firstB,
    last_claim_block: lastB,
    first_ts: tFirst,
    last_ts: tLast,
    elapsed_days: +days.toFixed(2),
    elapsed_years_365: +(days / 365).toFixed(3),
    elapsed_years_365_2425: +(days / 365.2425).toFixed(3),
    imports: 2145,
    imports_per_day: +(2145 / days).toFixed(3),
  }

  fs.writeFileSync(
    path.join(ROOT, 'research/audit/a3-figures.json'),
    `${JSON.stringify(out, null, 2)}\n`,
  )
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error('AUDIT STAGE 3 FAILED:', scrub(e.stack ?? e.message))
  process.exit(1)
})
