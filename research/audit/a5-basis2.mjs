#!/usr/bin/env node
/** Which basis yields the reported realized totals of 200,395,968 / 1,324,262,598? */
import fs from 'node:fs'
import path from 'node:path'
import { ROOT } from './rpc.mjs'

const REALIZED_FROM = 24619423
const CUTOFF = 25627360
const REPORTED_NEW = 200395968
const REPORTED_OLD = 1324262598

const rows = fs
  .readFileSync(path.join(ROOT, 'research/derived/p3-replay.jsonl'), 'utf8')
  .trim().split('\n').map((l) => JSON.parse(l))
const byId = new Map()
for (const r of rows) {
  if (r.replay_status !== 'ok' && r.replay_status !== 'ok_reverted') continue
  if (!byId.has(r.callId)) byId.set(r.callId, r)
}
const realized = [...byId.values()].filter(
  (r) => r.population === 'successful' && r.block >= REALIZED_FROM && r.block <= CUTOFF,
)

const sum = (f) => realized.reduce((a, r) => a + f(r), 0)
const cands = {
  'sum gas_new (whole-oracle, incl intrinsic)': sum((r) => r.gas_new),
  'sum gas_new_exec (whole-oracle, excl intrinsic)': sum((r) => r.gas_new_exec),
  'sum gas_old (whole-oracle, incl intrinsic)': sum((r) => r.gas_old),
  'sum gas_old_exec (whole-oracle, excl intrinsic)': sum((r) => r.gas_old_exec),
  'sum delta_gas': sum((r) => r.delta_gas),
}
console.log('realized calls:', realized.length)
for (const [k, v] of Object.entries(cands)) {
  const mNew = v - REPORTED_NEW
  const mOld = v - REPORTED_OLD
  console.log(
    `${k.padEnd(48)} = ${String(v).padStart(12)}   vs reportedNEW ${mNew === 0 ? 'EXACT MATCH' : mNew}   vs reportedOLD ${mOld === 0 ? 'EXACT MATCH' : mOld}`,
  )
}
console.log()
console.log('reported new mean/import :', (REPORTED_NEW / 315).toFixed(1))
console.log('reported old mean/import :', (REPORTED_OLD / 315).toFixed(1))
console.log('gas_new_exec mean/import :', (cands['sum gas_new_exec (whole-oracle, excl intrinsic)'] / 315).toFixed(1))
console.log('gas_old_exec mean/import :', (cands['sum gas_old_exec (whole-oracle, excl intrinsic)'] / 315).toFixed(1))
console.log('reportedOLD - reportedNEW:', REPORTED_OLD - REPORTED_NEW, '(delta_total =', sum((r) => r.delta_gas), ')')
