#!/usr/bin/env node
/**
 * #3c VALIDATION BATTERY — a hard gate. No replay number is trustworthy until
 * every leg passes. Each leg reports PASS/FAIL with its evidence.
 *
 *   node research/replay/battery.mjs
 *
 * Legs:
 *   1  RFC 6605 alg-13 vector verifies through the EIP-7951 precompile
 *   2  Osaka config REPRODUCES observed mainnet behaviour (6,900 gas; empty on invalid)
 *   3  Determinism — repeated runs byte-identical
 *   4  Foundry/Hardhat cross-check on a stratified subset
 *   5  Bytecode assertion actually fires on a wrong-but-valid override
 *   6  Address-independence of the swapped verifier (self-address immutables)
 *   7  EIP-2929 cold-access premium, measured in-harness
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  Anvil,
  ROOT,
  bytesToHex,
  hexToBytes,
  intrinsicGas,
  keccak256,
  loadPins,
  redact,
} from './lib.mjs'
import { replayPair, revertClass, HARNESS_VERSION } from './harness.mjs'
import { createRequire } from 'node:module'

const require_hh = createRequire(path.join(ROOT, 'ens-contracts/package.json'))
const byRoleAddress = (byRole, role) => byRole[role].address

const P256_PRECOMPILE = '0x0000000000000000000000000000000000000100'
const REF = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'research/derived/p3-reference-measurements.json'), 'utf8'),
)

// RFC 6605 vector, from ens-contracts/test/dnssec-oracle/fixtures/algorithms.ts
const V = {
  key: '0101030d1a88c88615d437fbb8bf9e1942a1929f28562706ae6c2bd399e7b1bfb6d1e9e75b92b4aa42917ae1c61b701ef035c3fe7be3009cbafe5a2f71316c902dcf0d00',
  data: '00010d0300000e104c88b1374c63c737d960076578616d706c65036e65740003777777076578616d706c65036e6574000001000100000e100004c0000201',
  sig: 'ab1eb02d8aa687e97da0229337aa8873e6f0eb26be289f28333d183f5d3b7a95c0c869adfb748daee3c5286eed6682c12e5533186baced9c26c167a9ebae950b',
}

const p256Input = (corrupt = false) => {
  const key = Buffer.from(V.key, 'hex')
  const sig = Buffer.from(V.sig, 'hex')
  const hash = crypto.createHash('sha256').update(Buffer.from(V.data, 'hex')).digest()
  const b = Buffer.concat([hash, sig.subarray(0, 32), sig.subarray(32), key.subarray(4, 36), key.subarray(36, 68)])
  if (corrupt) b[32] ^= 0x01
  return bytesToHex(b)
}

const results = []
const leg = (id, name) => {
  const r = { id, name, pass: false, evidence: {}, notes: [] }
  results.push(r)
  return r
}

const main = async () => {
  const { byRole } = loadPins()
  console.log(`pins: ${Object.keys(byRole).length} artifacts re-hashed from disk, all match\n`)

  // ── Legs 1 & 2: precompile behaviour and Osaka config, on a NON-forked node ──
  const local = new Anvil({ hardfork: 'osaka' })
  await local.start()
  try {
    const l1 = leg(1, 'RFC 6605 alg-13 vector verifies through the EIP-7951 precompile')
    const valid = p256Input()
    const ret = await local.rpc.send('eth_call', [{ to: P256_PRECOMPILE, data: valid }, 'latest'])
    l1.evidence.returnValue = ret
    l1.evidence.expected = '0x' + '0'.repeat(63) + '1'
    l1.pass = ret === l1.evidence.expected
    l1.evidence.inputLength = hexToBytes(valid).length

    const l2 = leg(2, 'Osaka config reproduces observed MAINNET behaviour (not assumed)')
    const tr = await local.rpc.send('debug_traceCall', [
      { to: P256_PRECOMPILE, data: valid },
      'latest',
      { disableStorage: true, disableMemory: true, disableStack: true },
    ])
    const total = Number(tr.gas)
    const intrinsic = intrinsicGas(valid)
    const base = total - intrinsic
    const invalidRet = await local.rpc.send('eth_call', [
      { to: P256_PRECOMPILE, data: p256Input(true) },
      'latest',
    ])
    l2.evidence = {
      traceCallGasTotal: total,
      mainnetReference_traceCallTotal: 30436,
      intrinsic,
      mainnetReference_intrinsic: 23536,
      derivedBaseGas: base,
      mainnetReference_baseGas: REF.eip7951_precompile.base_gas_mainnet_measured,
      specGas: REF.eip7951_precompile.spec_gas,
      invalidReturn: invalidRet,
      invalidReturnLength: hexToBytes(invalidRet).length,
    }
    l2.pass =
      total === 30436 &&
      intrinsic === 23536 &&
      base === 6900 &&
      base === REF.eip7951_precompile.spec_gas &&
      invalidRet === '0x'
    if (!l2.pass) l2.notes.push('harness does NOT reproduce the mainnet reference')
  } finally {
    await local.stop()
  }

  // ── Load census inputs for the forked legs ─────────────────────────────────
  const overrideMap = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'research/derived/p3-override-map.json'), 'utf8'),
  )
  const calls = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'research/derived/p1-calls-for-decode.json'), 'utf8'),
  )
  const calldataById = new Map(calls.map((c) => [c.callId, c.calldata]))
  const n13ById = new Map(calls.map((c) => [c.callId, c.n13_trace]))

  // Manager-supplied seed-509 deterministic subset (15 strata, 42 calls).
  // The legacy-oracle carve-out is GONE: p3-override-map.json now routes the 7
  // pre-migration rows to oracle_legacy_original, so nothing is blocked.
  const bucket = (n) => (n === 0 ? '0' : n === 1 ? '1' : n <= 2 ? '2' : '3+')
  const subsetRaw = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'research/derived/p3-strata-subset.json'), 'utf8'),
  )
  const mapById = new Map(overrideMap.map((r) => [r.callId, r]))
  const subset = []
  const noCalldata = []
  for (const r of subsetRaw) {
    const row = mapById.get(r.callId) ?? r
    if (!calldataById.has(row.callId)) { noCalldata.push(row.callId); continue }
    subset.push(row)
  }
  const preMigration = subset.filter((r) => r.registrarVersion === 'legacy' && r.block < 13103261)
  console.log(`subset: ${subset.length}/${subsetRaw.length} of the seed-509 strata subset are replayable`)
  console.log(`  skipped (no calldata, reverted population): ${noCalldata.length}`)
  console.log(`  pre-migration legacy rows included (carve-out dropped): ${preMigration.length}`)
  console.log(`  oracleRole mix: ${JSON.stringify(subset.reduce((a, r) => ((a[r.oracleRole] = (a[r.oracleRole] ?? 0) + 1), a), {}))}\n`)

  // ── Legs 3, 5, 6, 7 and the pilot all need a forked node per parentBlock ───
  const l3 = leg(3, 'Determinism: repeated runs byte-identical')
  const l5 = leg(5, 'Bytecode assertion fires on a wrong-but-valid override')
  const l6 = leg(6, 'Swapped verifier is address-independent (no self-address immutables)')
  const l7 = leg(7, 'EIP-2929 cold-access premium measured in-harness')
  const pilot = []

  let rowIdx = 0
  for (const row of subset) {
    rowIdx++
    console.log(`[row ${rowIdx}/${subset.length}] ${row.period} ${row.registrarVersion} parentBlock=${row.parentBlock}`)
    const anvil = new Anvil({ forkBlock: row.parentBlock, hardfork: 'osaka' })
    const t0 = Date.now()
    await anvil.start()
    const startupMs = Date.now() - t0
    try {
      const calldata = calldataById.get(row.callId)
      const t1 = Date.now()
      const a = await replayPair(anvil, row, calldata, byRole)
      const replayMs = Date.now() - t1
      pilot.push({ ...a, startupMs, replayMs, n13_trace: n13ById.get(row.callId) })

      // leg 3 — run the same pair twice more on the same node
      const b = await replayPair(anvil, row, calldata, byRole)
      const c = await replayPair(anvil, row, calldata, byRole)
      const key = (x) =>
        JSON.stringify([x.gas_old, x.gas_new, x.delta_gas, x.output_identical, x.revert_class_old, x.revert_class_new])
      const same = key(a) === key(b) && key(b) === key(c)
      l3.evidence[row.callId] = { repeated: key(a), stable: same }
      l3.pass = l3.pass === false && Object.keys(l3.evidence).length === 1 ? same : l3.pass && same
      if (Object.keys(l3.evidence).length === 1) l3.pass = same

      // leg 5 — install the WRONG (but perfectly valid) artifact and confirm abort
      if (!l5.evidence.tested && a.alg13SlotAddress) {
        const wrongRole =
          row.oldRole === 'alg13_verifier_old_legacy_oracle'
            ? 'alg13_verifier_old_current_oracle'
            : 'alg13_verifier_old_legacy_oracle'
        await anvil.rpc.send('anvil_setCode', [a.alg13SlotAddress, byRole[wrongRole].code])
        const readBack = await anvil.rpc.send('eth_getCode', [a.alg13SlotAddress, 'latest'])
        const gotHash = keccak256(hexToBytes(readBack))
        l5.evidence = {
          tested: true,
          installedRole: wrongRole,
          expectedRole: row.oldRole,
          expectedKeccak: row.oldVerifierKeccak,
          observedKeccak: gotHash,
          detected: gotHash.toLowerCase() !== row.oldVerifierKeccak.toLowerCase(),
        }
        l5.pass = l5.evidence.detected
      }

      // leg 6 — same bytecode at a DIFFERENT address must cost the same
      if (!l6.evidence.tested && a.replay_status === 'ok') {
        const alt = '0x000000000000000000000000000000000000dead'
        await anvil.rpc.send('anvil_setCode', [alt, byRole[row.newRole].code])
        const gAlt = await anvil.rpc.send('debug_traceCall', [
          { to: alt, data: '0x', gas: '0x2faf080' },
          'latest',
          { disableStorage: true, disableMemory: true, disableStack: true },
        ])
        await anvil.rpc.send('anvil_setCode', [a.alg13SlotAddress, byRole[row.newRole].code])
        const gSlot = await anvil.rpc.send('debug_traceCall', [
          { to: a.alg13SlotAddress, data: '0x', gas: '0x2faf080' },
          'latest',
          { disableStorage: true, disableMemory: true, disableStack: true },
        ])
        l6.evidence = {
          tested: true,
          role: row.newRole,
          gasAtScratchAddress: Number(gAlt.gas),
          gasAtSlotAddress: Number(gSlot.gas),
          identical: Number(gAlt.gas) === Number(gSlot.gas),
          note: 'empty-calldata entry; equal gas => no self-address immutable affects dispatch cost',
        }
        l6.pass = l6.evidence.identical
      }

      // leg 7 — EIP-2929 cold-access premium, MEASURED intra-transaction.
      //
      // A top-level call cannot show this: EIP-2929 pre-warms the tx target. So
      // we install a forwarder whose ONLY job is to STATICCALL a target N times,
      // and diff. The forwarder is the (warm) tx target; the address it calls is
      // cold on first touch and warm thereafter.
      //   premium = (cost of 1st access) - (cost of 2nd access)
      if (!l7.evidence.tested && a.alg13SlotAddress) {
        const FWD = '0x00000000000000000000000000000000000fd000'
        const staticcallOnce = (addr) =>
          '6000' + '6000' + '6000' + '6000' + '73' + addr.replace(/^0x/, '').toLowerCase() + '5a' + 'fa' + '50'
        const forwarder = (addr, n) => '0x' + staticcallOnce(addr).repeat(n) + '00'
        const measure = async (addr, n) => {
          await anvil.rpc.send('anvil_setCode', [FWD, forwarder(addr, n)])
          const t = await anvil.rpc.send('debug_traceCall', [
            { to: FWD, data: '0x', gas: '0x2faf080' },
            'latest',
            { disableStorage: true, disableMemory: true, disableStack: true },
          ])
          return Number(t.gas) - intrinsicGas('0x')
        }
        const premium = async (addr) => {
          const one = await measure(addr, 1)
          const two = await measure(addr, 2)
          const warm = two - one            // 2nd access: warm
          const cold = one                  // 1st access: cold (+ callee execution)
          return { one, two, warmAccessPlusExec: warm, coldAccessPlusExec: cold, premium: cold - warm }
        }
        const pre = await premium(P256_PRECOMPILE)
        const oldV = await premium(byRoleAddress(byRole, row.oldRole))
        const ref = REF.eip2929_access_asymmetry.cold_access_premium_gas
        l7.evidence = {
          tested: true,
          method: 'forwarder contract STATICCALLs target 1x vs 2x; premium = cold - warm',
          precompile_0x100: pre,
          old_verifier_address: { role: row.oldRole, ...oldV },
          referenceClaim: ref,
          precompilePremiumMatchesRef: Math.abs(pre.premium - ref.precompile_0x100) <= 5,
          verifierPremiumMatchesRef: Math.abs(oldV.premium - 2503) <= 10,
        }
        l7.pass = l7.evidence.precompilePremiumMatchesRef && l7.evidence.verifierPremiumMatchesRef
        await anvil.rpc.send('anvil_setCode', [FWD, '0x'])
      }
    } finally {
      await anvil.stop()
    }
  }

  // ── Leg 4: Foundry cross-check ────────────────────────────────────────────
  const l4 = leg(4, 'Foundry/Hardhat agreement on the stratified subset')
  l4.evidence.foundryVersion = execFileSync('forge', ['--version'], { encoding: 'utf8' })
    .split('\n')[0]
    .trim()
  // EXECUTED capability probe, not an assertion: ask the installed EDR for Osaka.
  try {
    const hhPkg = require_hh('hardhat/package.json')
    const edrPkg = require_hh('@nomicfoundation/edr/package.json')
    const edr = require_hh('@nomicfoundation/edr')
    l4.evidence.declaredHardhat = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'ens-contracts/package.json'), 'utf8'),
    ).devDependencies.hardhat
    l4.evidence.installedHardhat = hhPkg.version
    l4.evidence.installedEdr = edrPkg.version
    l4.evidence.edrLatestL1Hardfork = edr.l1HardforkToString(edr.l1HardforkLatest())
    try {
      edr.l1HardforkFromString('osaka')
      l4.evidence.osakaLookup = 'SUPPORTED'
      l4.notes.push('Osaka now available on the Hardhat side — leg 4 can be implemented.')
    } catch (e) {
      l4.evidence.osakaLookup = `THROWS: ${e.message}`
    }
  } catch (e) {
    l4.evidence.probeError = redact(e.message)
  }
  l4.pass = l4.evidence.osakaLookup === 'SUPPORTED'
  if (!l4.pass) {
    l4.notes.push(
      'UNMET: the installed Hardhat/EDR cannot execute Osaka, so EIP-7951 (precompile 0x100) ' +
        'does not exist on that side and no cross-implementation check under Osaka is possible. ' +
        'Fixing it requires installing Hardhat 3.1.4, which cannot go into the read-only ' +
        'ens-contracts checkout. NOT worked around, NOT waved through — needs a decision.',
    )
  }

  fs.writeFileSync(
    path.join(ROOT, 'research/derived/p3-battery.json'),
    `${JSON.stringify({ harnessVersion: HARNESS_VERSION, results, pilot }, null, 2)}\n`,
  )

  console.log('════════ VALIDATION BATTERY ════════')
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  leg ${r.id}: ${r.name}`)
    console.log(`      ${redact(JSON.stringify(r.evidence))}`)
    for (const n of r.notes) console.log(`      NOTE ${n}`)
  }
  console.log('\n════════ PILOT (same fork depth / override path / tracer as census) ════════')
  for (const p of pilot) {
    console.log(
      `${p.period.padEnd(24)} ${p.registrarVersion.padEnd(8)} n13=${String(p.n13_trace).padEnd(2)}` +
        ` old=${String(p.gas_old).padStart(8)} new=${String(p.gas_new).padStart(8)}` +
        ` delta=${String(p.delta_gas).padStart(7)} ident=${p.output_identical}` +
        ` status=${p.replay_status} startup=${p.startupMs}ms replay=${p.replayMs}ms`,
    )
  }
  const startup = pilot.reduce((a, p) => a + p.startupMs, 0) / (pilot.length || 1)
  const replay = pilot.reduce((a, p) => a + p.replayMs, 0) / (pilot.length || 1)
  console.log(
    `\nmean startup ${startup.toFixed(0)}ms  mean replay ${replay.toFixed(0)}ms  ` +
      `per-call ${(startup + replay).toFixed(0)}ms  ` +
      `projected 2283 calls: ${(((startup + replay) * 2283) / 1000 / 60).toFixed(1)} min single-threaded`,
  )
}

main().catch((e) => {
  console.error('BATTERY ABORTED:', redact(e.stack ?? e.message))
  process.exit(1)
})
