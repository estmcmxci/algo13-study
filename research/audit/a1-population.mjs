#!/usr/bin/env node
/**
 * INDEPENDENT AUDIT — stage 1: population.
 *
 * Written from scratch. Imports nothing from research/scripts/**. The only
 * reused code is research/decoder/**, which this agent authored.
 *
 * Method: go back to mainnet. Fetch Claim logs directly over the whole range
 * with eth_getLogs rather than trusting any derived census file, then
 * cross-check against the 2,127 raw Parity flat traces on disk.
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')

const forkUrl = () => {
  const env = fs.readFileSync(path.join(ROOT, 'ens-contracts/.env'), 'utf8')
  const m = /^\s*MAINNET_API_KEY\s*=\s*["']?([^"'\r\n]+)["']?\s*$/m.exec(env)
  if (!m) throw new Error('MAINNET_API_KEY not found')
  return m[1].trim()
}
const URL = forkUrl()
let rpcCalls = 0
const rpc = async (method, params) => {
  rpcCalls++
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: rpcCalls, method, params }),
  })
  const j = await res.json()
  if (j.error) throw new Error(`${method}: ${j.error.message}`)
  return j.result
}

// Production anchors — addresses only, taken from the pinned manifest (roles),
// not from any derived population file.
const PINS = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'research/manifests/bytecode-pins.json'), 'utf8'),
)
const addrOf = (role) => PINS.artifacts.find((a) => a.role === role).address.toLowerCase()
const REG_CURRENT = addrOf('registrar_current')
const REG_LEGACY = addrOf('registrar_legacy')

// Claim(bytes32,address,bytes,uint32) and Claim(bytes32,address,bytes)
const CLAIM_V2 = '0x87db02a0e483e2818060eddcbb3488ce44e35aff49a70d92c2aa6c8046cf01e2'
const CLAIM_V1 = '0xa2e66ce20e6fb2c4f61339c364ad79f15160cf5307230c8bc4d628adbca2ba39'

const CUTOFF = 25627360
const REALIZED_FROM = 24619423

const hex = (n) => `0x${n.toString(16)}`

/** eth_getLogs with adaptive range splitting — no assumption about provider caps. */
const getLogsChunked = async (address, topics, from, to, depth = 0) => {
  try {
    return await rpc('eth_getLogs', [
      { address, topics, fromBlock: hex(from), toBlock: hex(to) },
    ])
  } catch (e) {
    if (from >= to || depth > 40) throw e
    const mid = Math.floor((from + to) / 2)
    const a = await getLogsChunked(address, topics, from, mid, depth + 1)
    const b = await getLogsChunked(address, topics, mid + 1, to, depth + 1)
    return [...a, ...b]
  }
}

const main = async () => {
  const out = {}

  // ── Claim events, fetched fresh from mainnet ──────────────────────────────
  const legacyLogs = await getLogsChunked(REG_LEGACY, [[CLAIM_V1, CLAIM_V2]], 13000000, CUTOFF)
  const currentLogs = await getLogsChunked(REG_CURRENT, [[CLAIM_V1, CLAIM_V2]], 19000000, CUTOFF)
  const all = [...legacyLogs, ...currentLogs]
    .filter((l) => !l.removed)
    .map((l) => ({
      tx: l.transactionHash,
      block: Number(l.blockNumber),
      logIndex: Number(l.logIndex),
      topic0: l.topics[0],
      address: l.address.toLowerCase(),
      version: l.address.toLowerCase() === REG_LEGACY ? 'legacy' : 'current',
    }))
    .sort((a, b) => a.block - b.block || a.logIndex - b.logIndex)

  out.claimEvents_total = all.length
  out.claimEvents_legacy = all.filter((c) => c.version === 'legacy').length
  out.claimEvents_current = all.filter((c) => c.version === 'current').length
  out.claim_txs_distinct = new Set(all.map((c) => c.tx)).size
  out.claimEvents_realized = all.filter((c) => c.block >= REALIZED_FROM).length
  out.claim_txs_realized = new Set(
    all.filter((c) => c.block >= REALIZED_FROM).map((c) => c.tx),
  ).size
  out.first_claim_block = all[0].block
  out.last_claim_block = all[all.length - 1].block
  out.blockRangeUsed = { cutoff: CUTOFF, realizedFrom: REALIZED_FROM }

  // multi-claim transactions
  const perTx = new Map()
  for (const c of all) perTx.set(c.tx, (perTx.get(c.tx) ?? 0) + 1)
  const multi = [...perTx.entries()].filter(([, n]) => n > 1)
  out.txs_with_multiple_claims = multi.length
  out.multi_claim_detail = multi.map(([tx, n]) => ({ tx, claims: n }))

  // ── Registrar calls, counted from the RAW traces on disk ──────────────────
  const traceDir = path.join(ROOT, 'research/raw/alchemy-traces')
  const files = fs.readdirSync(traceDir).filter((f) => f.endsWith('.json'))
  const SELECTORS = new Set(['0x29d56630', '0x06963218', '0x8bbedf75', '0x224199c2'])
  let registrarCalls = 0
  const callsByVersion = { legacy: 0, current: 0 }
  const traceTxs = new Set()
  const registrarCallIds = new Set()
  for (const f of files) {
    const traces = JSON.parse(fs.readFileSync(path.join(traceDir, f), 'utf8'))
    const tx = f.replace('.json', '')
    traceTxs.add(tx)
    for (const t of traces) {
      const to = t.action?.to?.toLowerCase()
      const input = t.action?.input ?? ''
      if (t.type !== 'call') continue
      if (to !== REG_LEGACY && to !== REG_CURRENT) continue
      if (!SELECTORS.has(input.slice(0, 10))) continue
      if (t.error) continue
      registrarCalls++
      callsByVersion[to === REG_LEGACY ? 'legacy' : 'current']++
      registrarCallIds.add(`1:${tx}:${(t.traceAddress ?? []).join('.')}`)
    }
  }
  out.raw_trace_files = files.length
  out.registrar_calls_from_raw_traces = registrarCalls
  out.registrar_calls_by_version = callsByVersion
  out.distinct_registrar_callIds = registrarCallIds.size

  // Claim txs that have NO successful registrar call in the raw traces
  const claimTxs = new Set(all.map((c) => c.tx.toLowerCase()));
  const traceTxsLower = new Set([...traceTxs].map((t) => t.toLowerCase()))
  out.claim_txs_without_trace_file = [...claimTxs].filter((t) => !traceTxsLower.has(t)).length
  out.trace_files_without_claim = [...traceTxsLower].filter((t) => !claimTxs.has(t)).length

  out.rpcCalls = rpcCalls
  fs.writeFileSync(
    path.join(ROOT, 'research/audit/a1-population.json'),
    `${JSON.stringify(out, null, 2)}\n`,
  )
  const { multi_claim_detail, ...print } = out
  console.log(JSON.stringify(print, null, 2))
  if (multi.length) console.log('multi-claim txs:', JSON.stringify(multi_claim_detail))
}

main().catch((e) => {
  console.error('AUDIT STAGE 1 FAILED:', e.message.replace(/https?:\/\/[^\s"']+/g, '<REDACTED>'))
  process.exit(1)
})
