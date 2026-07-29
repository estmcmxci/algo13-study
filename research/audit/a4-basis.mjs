#!/usr/bin/env node
/**
 * INDEPENDENT AUDIT — stage 4.
 *
 * (a) Why do my realized-period TOTALS differ from the reported ones by a
 *     constant 42,101,640 gas? Test the competing bases: transaction receipt
 *     gas vs registrar-call gas from the raw traces.
 * (b) Measure the per-verification cost of each deployed verifier DIRECTLY, on
 *     a fork, instead of inferring it from a regression.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { ROOT, rpc, scrub } from './rpc.mjs'
import { Anvil, hexToBytes, keccak256, loadPins, intrinsicGas } from '../replay/lib.mjs'

const REALIZED_FROM = 24619423
const CUTOFF = 25627360
const REG_CURRENT = '0xb32cb5677a7c971689228ec835800432b339ba2b'
const SELECTORS = new Set(['0x29d56630', '0x06963218', '0x8bbedf75', '0x224199c2'])

// RFC 6605 alg-13 vector (ens-contracts test fixture)
const V = {
  key: '0101030d1a88c88615d437fbb8bf9e1942a1929f28562706ae6c2bd399e7b1bfb6d1e9e75b92b4aa42917ae1c61b701ef035c3fe7be3009cbafe5a2f71316c902dcf0d00',
  data: '00010d0300000e104c88b1374c63c737d960076578616d706c65036e65740003777777076578616d706c65036e6574000001000100000e100004c0000201',
  sig: 'ab1eb02d8aa687e97da0229337aa8873e6f0eb26be289f28333d183f5d3b7a95c0c869adfb748daee3c5286eed6682c12e5533186baced9c26c167a9ebae950b',
}

const W = 32
const word = (n) => {
  const b = Buffer.alloc(W)
  let v = BigInt(n)
  for (let i = W - 1; i >= 0 && v > 0n; i--) { b[i] = Number(v & 0xffn); v >>= 8n }
  return b
}
const pad = (b) => (b.length % W === 0 ? b : Buffer.concat([b, Buffer.alloc(W - (b.length % W))]))
const encBytes = (b) => Buffer.concat([word(b.length), pad(b)])
/** Algorithm.verify(bytes key, bytes data, bytes sig) -> 0xde8f50a1 */
const encodeVerify = () => {
  const k = encBytes(Buffer.from(V.key, 'hex'))
  const d = encBytes(Buffer.from(V.data, 'hex'))
  const s = encBytes(Buffer.from(V.sig, 'hex'))
  const head = Buffer.concat([word(3 * W), word(3 * W + k.length), word(3 * W + k.length + d.length)])
  return `0x${Buffer.concat([Buffer.from('de8f50a1', 'hex'), head, k, d, s]).toString('hex')}`
}

const main = async () => {
  const out = {}

  // ── (a) which base reproduces the reported totals? ────────────────────────
  const replay = fs
    .readFileSync(path.join(ROOT, 'research/derived/p3-replay.jsonl'), 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l))
  const byId = new Map()
  for (const r of replay) {
    if (r.replay_status !== 'ok' && r.replay_status !== 'ok_reverted') continue
    if (!byId.has(r.callId)) byId.set(r.callId, r)
  }
  const realized = [...byId.values()].filter(
    (r) => r.population === 'successful' && r.block >= REALIZED_FROM && r.block <= CUTOFF,
  )
  const txs = [...new Set(realized.map((r) => r.tx))]

  // basis 1: transaction receipt gas
  let receiptTotal = 0
  const receiptGas = new Map()
  for (const tx of txs) {
    const rcpt = await rpc('eth_getTransactionReceipt', [tx])
    receiptGas.set(tx, Number(rcpt.gasUsed))
    receiptTotal += Number(rcpt.gasUsed)
  }

  // basis 2: registrar-call gasUsed from the RAW traces
  const traceDir = path.join(ROOT, 'research/raw/alchemy-traces')
  let registrarTotal = 0
  let missingTrace = 0
  const registrarGas = new Map()
  for (const tx of txs) {
    const f = path.join(traceDir, `${tx}.json`)
    if (!fs.existsSync(f)) { missingTrace++; continue }
    const traces = JSON.parse(fs.readFileSync(f, 'utf8'))
    let g = 0
    for (const t of traces) {
      if (t.type !== 'call' || t.error) continue
      const to = t.action?.to?.toLowerCase()
      if (to !== REG_CURRENT) continue
      if (!SELECTORS.has((t.action.input ?? '').slice(0, 10))) continue
      g += Number(t.result?.gasUsed ?? 0)
    }
    registrarGas.set(tx, g)
    registrarTotal += g
  }

  const delta = realized.reduce((a, r) => a + r.delta_gas, 0)
  out.a_basis_test = {
    realized_txs: txs.length,
    delta_total: delta,
    basis_receipt_gasUsed: receiptTotal,
    basis_registrar_call_gasUsed: registrarTotal,
    missing_trace_files: missingTrace,
    reported_new_total: 200395968,
    receipt_minus_reported: receiptTotal - 200395968,
    registrarcall_minus_reported: registrarTotal - 200395968,
    mean_receipt: Math.round(receiptTotal / txs.length),
    mean_registrar_call: Math.round(registrarTotal / txs.length),
    mean_gap: Math.round((receiptTotal - registrarTotal) / txs.length),
  }

  // ── (b) direct per-verification cost of each deployed verifier ────────────
  const { byRole } = loadPins()
  const anvil = new Anvil({ forkBlock: 25600000, hardfork: 'osaka' })
  await anvil.start()
  try {
    const data = encodeVerify()
    const intrinsic = intrinsicGas(data)
    const SLOT = '0x00000000000000000000000000000000000ab1e0'
    const measure = async (role) => {
      await anvil.rpc.send('anvil_setCode', [SLOT, byRole[role].code])
      const back = await anvil.rpc.send('eth_getCode', [SLOT, 'latest'])
      const h = keccak256(hexToBytes(back))
      if (h.toLowerCase() !== byRole[role].runtimeBytecodeKeccak256.toLowerCase()) {
        throw new Error(`bytecode assertion failed for ${role}`)
      }
      const t = await anvil.rpc.send('debug_traceCall', [
        { to: SLOT, data, gas: '0x2faf080' },
        'latest',
        { disableStorage: true, disableMemory: true, disableStack: true },
      ])
      return {
        role,
        keccakVerified: true,
        total: Number(t.gas),
        exec: Number(t.gas) - intrinsic,
        failed: !!t.failed,
        returnValue: t.returnValue,
      }
    }
    out.b_direct_verifier_cost = {
      note: 'single Algorithm.verify() call with the RFC 6605 vector, deployed bytecode, keccak-asserted',
      intrinsic,
      new: await measure('alg13_verifier_new'),
      old_current_oracle: await measure('alg13_verifier_old_current_oracle'),
      old_legacy_oracle: await measure('alg13_verifier_old_legacy_oracle'),
    }
    const b = out.b_direct_verifier_cost
    b.derived = {
      delta_old_current_minus_new: b.old_current_oracle.exec - b.new.exec,
      ratio_old_over_new: +(b.old_current_oracle.exec / b.new.exec).toFixed(2),
      pct_reduction: +((1 - b.new.exec / b.old_current_oracle.exec) * 100).toFixed(2),
    }
  } finally {
    await anvil.stop()
  }

  fs.writeFileSync(path.join(ROOT, 'research/audit/a4-basis.json'), `${JSON.stringify(out, null, 2)}\n`)
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => { console.error('AUDIT STAGE 4 FAILED:', scrub(e.stack ?? e.message)); process.exit(1) })
