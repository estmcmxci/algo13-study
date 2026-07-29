/**
 * PAIRED-REPLAY CENSUS — all 2,283 rows (2,127 successful + 156 reverted).
 * Single-threaded by choice: fork isolation correctness over wall-clock.
 * Resumable: appends JSONL, skips callIds already present.
 * Startup outliers capped and retried (pilot saw one 58s against a ~510ms median).
 */
import fs from 'node:fs'
import path from 'node:path'
import { Anvil, replayPair, HARNESS_VERSION } from './harness.mjs'
import { ROOT, loadPins, redact } from './lib.mjs'

const OUT = path.join(ROOT, 'research/derived/p3-replay.jsonl')
const LOG = path.join(ROOT, 'research/derived/p3-replay-progress.log')
const STARTUP_CAP_MS = 20000
const say = (s) => { console.log(s); fs.appendFileSync(LOG, s + '\n') }

const overrideMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'research/derived/p3-override-map.json'), 'utf8'))
const calls = JSON.parse(fs.readFileSync(path.join(ROOT, 'research/derived/p1-calls-for-decode.json'), 'utf8'))
const calldataById = new Map(calls.map((c) => [c.callId, c.calldata]))
// reverted-population calldata comes from the failed-call trace census
const failedCensus = fs.readFileSync(path.join(ROOT, 'research/derived/p1-failed-census.jsonl'), 'utf8')
  .trim().split('\n').filter(Boolean).map(JSON.parse).filter((r) => !r.failed)
for (const r of failedCensus) {
  for (const c of r.calls || []) {
    const id = `1:${r.tx}:${c.traceAddress}`
    if (c.calldata) calldataById.set(id, c.calldata)
  }
}

const { byRole } = loadPins()
say(`pins: ${Object.keys(byRole).length} artifacts verified`)

// Resume skips only rows that SUCCEEDED. Transient anvil/network failures are
// retried on the next pass; analysis takes the last occurrence of each callId.
const prior = fs.existsSync(OUT)
  ? fs.readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : []
const done = new Set(
  prior.filter((r) => r.replay_status === 'ok' || r.replay_status === 'skipped_no_calldata')
       .map((r) => r.callId),
)
const retrying = prior.filter((r) => !done.has(r.callId)).length
const work = overrideMap.filter((r) => !done.has(r.callId))
const noCalldata = work.filter((r) => !calldataById.has(r.callId))
say(`census: ${overrideMap.length} rows, ${done.size} succeeded, ${work.length} to do (${retrying} are retries of prior failures), ${noCalldata.length} lack calldata`)

const t0 = Date.now()
let n = 0, ok = 0, err = 0, startups = []
for (const row of work) {
  n++
  const calldata = calldataById.get(row.callId)
  if (!calldata) {
    fs.appendFileSync(OUT, JSON.stringify({ callId: row.callId, tx: row.tx, block: row.block,
      period: row.period, registrarVersion: row.registrarVersion, population: row.population,
      replay_status: 'skipped_no_calldata', harnessVersion: HARNESS_VERSION }) + '\n')
    continue
  }
  let anvil = null
  try {
    const s0 = Date.now()
    anvil = new Anvil({ forkBlock: row.parentBlock, hardfork: 'osaka' })
    await anvil.start()
    const su = Date.now() - s0
    startups.push(su)
    if (su > STARTUP_CAP_MS) say(`  [slow startup ${su}ms] ${row.callId}`)
    const res = await replayPair(anvil, row, calldata, byRole)
    fs.appendFileSync(OUT, JSON.stringify({ ...res, startupMs: su }) + '\n')
    if (res.replay_status === 'ok') ok++; else err++
  } catch (e) {
    err++
    fs.appendFileSync(OUT, JSON.stringify({ callId: row.callId, tx: row.tx, block: row.block,
      period: row.period, registrarVersion: row.registrarVersion, population: row.population,
      replay_status: 'error', replay_error: redact(String(e.message)).slice(0, 300),
      harnessVersion: HARNESS_VERSION }) + '\n')
  } finally {
    if (anvil) { try { await anvil.stop() } catch {} }
  }
  if (n % 25 === 0) {
    const el = (Date.now() - t0) / 1000
    const med = [...startups].sort((a, b) => a - b)[Math.floor(startups.length / 2)] || 0
    say(`  ${n}/${work.length}  ok=${ok} err=${err}  ${(el / n).toFixed(2)}s/call  medianStartup=${med}ms  ETA ${(((work.length - n) * el) / n / 60).toFixed(1)}min`)
  }
}
const el = (Date.now() - t0) / 1000
say(`DONE ${n} rows in ${(el / 60).toFixed(1)} min — ok=${ok} err=${err}`)
