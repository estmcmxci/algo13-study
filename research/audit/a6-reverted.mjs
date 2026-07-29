#!/usr/bin/env node
/**
 * Stage 6: validate the reverted population against chain state.
 *
 * NOTE ON COMPLETENESS: exhaustively enumerating every reverted direct-import
 * call over 12.5M blocks needs `trace_filter`, which this endpoint tier gates.
 * So this checks VALIDITY (is each claimed reverted call really a failed direct
 * import?) and not COMPLETENESS (are there others we never saw?).
 */
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, rpc, scrub } from './rpc.mjs'

const REG = new Set([
  '0xb32cb5677a7c971689228ec835800432b339ba2b',
  '0x58774bb8acd458a640af0b88238369a167546ef2',
])
const SELECTORS = new Set(['0x29d56630', '0x06963218', '0x8bbedf75', '0x224199c2'])
const CUTOFF = 25627360

const main = async () => {
  const failed = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'research/derived/p1-failed-calls.json'), 'utf8'),
  )
  const map = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'research/derived/p3-override-map.json'), 'utf8'),
  )
  const revertedRows = map.filter((r) => r.population === 'reverted')

  const out = {
    p1_failed_calls_rows: failed.length,
    override_map_reverted_rows: revertedRows.length,
    distinct_txs_in_failed: new Set(failed.map((f) => f.tx_hash.toLowerCase())).size,
  }

  // Validate a sample of the claimed reverted txs against chain state.
  const txs = [...new Set(failed.map((f) => f.tx_hash.toLowerCase()))]
  let checked = 0
  let statusFailed = 0
  let toRegistrar = 0
  let rightSelector = 0
  let beyondCutoff = 0
  const anomalies = []
  for (const tx of txs) {
    const [rcpt, txo] = await Promise.all([
      rpc('eth_getTransactionReceipt', [tx]),
      rpc('eth_getTransactionByHash', [tx]),
    ])
    checked++
    if (!rcpt || !txo) { anomalies.push({ tx, why: 'not found on chain' }); continue }
    if (rcpt.status === '0x0') statusFailed++
    else anomalies.push({ tx, why: `receipt status ${rcpt.status} (not a failed tx)` })
    if (REG.has((txo.to ?? '').toLowerCase())) toRegistrar++
    if (SELECTORS.has((txo.input ?? '').slice(0, 10))) rightSelector++
    if (Number(rcpt.blockNumber) > CUTOFF) beyondCutoff++
  }
  out.validation = {
    txs_checked: checked,
    receipt_status_failed: statusFailed,
    top_level_to_a_registrar: toRegistrar,
    top_level_direct_import_selector: rightSelector,
    beyond_cutoff: beyondCutoff,
    anomalies: anomalies.slice(0, 10),
    anomaly_count: anomalies.length,
  }
  out.completeness = 'NOT VERIFIED — requires trace_filter over the full range (gated on this tier)'

  fs.writeFileSync(path.join(ROOT, 'research/audit/a6-reverted.json'), `${JSON.stringify(out, null, 2)}\n`)
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => { console.error('STAGE 6 FAILED:', scrub(e.stack ?? e.message)); process.exit(1) })
