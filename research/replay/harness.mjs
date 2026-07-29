/**
 * Paired-replay harness.
 *
 * For one call: execute the WHOLE ORACLE twice over identical proof bytes,
 * changing ONLY the bytecode installed at the algorithm-13 verifier slot.
 *
 *   delta_gas = G_old - G_new
 *
 * DESIGN — "the algorithm-13 slot".
 * `algorithms[13]` is oracle STORAGE holding an address. To change only the
 * verifier and nothing else, we resolve that address on the fork (call
 * `algorithms(13)`), cross-check it against the override map's
 * `actualVariantOnChain`, and then swap the CODE AT THAT ADDRESS. Storage is
 * never touched, so the CALL target, its warm/cold status, and every other
 * mapping stay byte-identical between the two runs.
 *
 * ASSERTION — every install is read back out of the EVM with `eth_getCode` and
 * hashed. A write that silently did nothing, or wrote the wrong artifact, aborts
 * the call loudly. `assert-pins.mjs` covers the files on disk; this covers what
 * is actually in the machine.
 *
 * ENTRY POINT — version-dependent, because the two oracles do not share an ABI:
 *   current: verifyRRSet((bytes,bytes)[],uint256)  — view, explicit `now`
 *   legacy:  submitRRSets((bytes,bytes)[],bytes)   — reads block.timestamp, and
 *            takes its trust root from calldata, so the fork's block timestamp
 *            must be set to the real one (proven by TIMESTAMP_PROBE_CODE).
 */
import {
  Anvil,
  TIMESTAMP_PROBE_CODE,
  bytesToHex,
  encodeAlgorithms,
  encodeSubmitRRSets,
  encodeVerifyRRSet,
  hexToBytes,
  intrinsicGas,
  keccak256,
  redact,
} from './lib.mjs'
import { decodeCalldata } from '../decoder/abi.mjs'

const PROBE_ADDRESS = '0x00000000000000000000000000000000000c10c4'

/** Production registrars, and `oracle()` — used for the routing assertion. */
const REGISTRARS = {
  current: '0xB32cB5677a7C971689228EC835800432B339bA2B',
  legacy: '0x58774Bb8acD458A640aF0B88238369A167546ef2',
}
const SEL_ORACLE = '0x7dc0d1d0'
const DEFAULT_CALLER = '0x0000000000000000000000000000000000000a11'

export class ReplayError extends Error {
  constructor(code, message, detail = {}) {
    super(message)
    this.code = code
    this.detail = detail
  }
}

const assertCodeHash = async (rpc, address, expectedKeccak, label) => {
  const onChain = await rpc.send('eth_getCode', [address, 'latest'])
  const got = keccak256(hexToBytes(onChain))
  if (got.toLowerCase() !== String(expectedKeccak).toLowerCase()) {
    throw new ReplayError('bytecode_assertion_failed', `${label}: installed bytecode hash mismatch`, {
      address,
      expected: expectedKeccak,
      got,
      installedSize: hexToBytes(onChain).length,
    })
  }
  return got
}

const traceCall = async (rpc, { from, to, data }) => {
  const res = await rpc.send('debug_traceCall', [
    { from, to, data, gas: '0x2faf080' }, // 50M cap; oracle calls are far below
    'latest',
    { disableStorage: true, disableMemory: true, disableStack: true },
  ])
  return {
    gasTotal: Number(res.gas),
    failed: !!res.failed,
    returnValue: res.returnValue ?? '0x',
  }
}

/**
 * Classify a terminal revert so old/new pairs can be compared without pretending
 * to decode every custom error. Solidity Error(string) and Panic(uint) are
 * decoded; anything else is identified by its 4-byte selector.
 */
export const revertClass = ({ failed, returnValue }) => {
  if (!failed) return null
  const b = hexToBytes(returnValue ?? '0x')
  if (b.length === 0) return 'revert:empty'
  const sel = bytesToHex(b.subarray(0, 4))
  if (sel === '0x08c379a0') {
    try {
      const len = Number(BigInt(bytesToHex(b.subarray(36, 68))))
      return `Error(${Buffer.from(b.subarray(68, 68 + len)).toString('utf8')})`
    } catch {
      return 'Error(<undecodable>)'
    }
  }
  if (sel === '0x4e487b71') return `Panic(${bytesToHex(b.subarray(4, 36))})`
  return `custom:${sel}`
}

/** Set the fork's block timestamp and PROVE it took, rather than assuming. */
const setAndProveTimestamp = async (rpc, timestamp) => {
  await rpc.send('evm_setNextBlockTimestamp', [`0x${BigInt(timestamp).toString(16)}`])
  await rpc.send('evm_mine', [])
  await rpc.send('anvil_setCode', [PROBE_ADDRESS, TIMESTAMP_PROBE_CODE])
  const seen = await rpc.send('eth_call', [{ to: PROBE_ADDRESS, data: '0x' }, 'latest'])
  const got = Number(BigInt(seen))
  if (got !== Number(timestamp)) {
    throw new ReplayError('timestamp_not_applied', 'harness block.timestamp does not match the row', {
      wanted: Number(timestamp),
      got,
    })
  }
  // Remove the probe so it cannot perturb anything downstream.
  await rpc.send('anvil_setCode', [PROBE_ADDRESS, '0x'])
  return got
}

/**
 * Replay one call. `anvil` must already be forked at `row.parentBlock`.
 *
 * @param {Anvil} anvil
 * @param {object} row      a p3-override-map row
 * @param {string} calldata the ORIGINAL registrar calldata for this call
 * @param {object} pins     loadPins().byRole
 * @param {string} [caller]
 */
export const replayPair = async (anvil, row, calldata, pins, caller = DEFAULT_CALLER) => {
  const { rpc } = anvil
  const out = {
    callId: row.callId,
    tx: row.tx,
    block: row.block,
    parentBlock: row.parentBlock,
    registrarVersion: row.registrarVersion,
    period: row.period,
    population: row.population,
    n13_trace: row.n13_trace ?? null,
    oracleRole: row.oracleRole,
    oldRole: row.oldRole,
    newRole: row.newRole,
    actualVariantOnChain: row.actualVariantOnChain,
    gas_old: null,
    gas_new: null,
    gas_old_exec: null,
    gas_new_exec: null,
    delta_gas: null,
    output_identical: null,
    revert_class_old: null,
    revert_class_new: null,
    oracleKeccakVerified: false,
    oldVerifierKeccakVerified: false,
    newVerifierKeccakVerified: false,
    alg13SlotAddress: null,
    evmConfig: `anvil ${anvil.hardfork} fork@${row.parentBlock}`,
    harnessVersion: HARNESS_VERSION,
    replay_status: 'error',
    replay_error: null,
  }

  try {
    // 0. The registrar's `oracle()` AT THIS BLOCK must be the oracle the map
    //    routes to. The legacy registrar's `oracle` is a mutable state variable
    //    and was in fact re-pointed at block 13,103,261, so a map built from a
    //    head-block probe silently mis-routes every earlier call. Assert the
    //    routing against the chain rather than trusting the map.
    const regOracleRaw = await rpc.send('eth_call', [
      { to: REGISTRARS[row.registrarVersion], data: SEL_ORACLE },
      'latest',
    ])
    const regOracle = `0x${regOracleRaw.slice(-40)}`
    if (regOracle.toLowerCase() !== row.oracleAddress.toLowerCase()) {
      throw new ReplayError('oracle_routing_mismatch', 'registrar.oracle() differs from the map', {
        registrar: REGISTRARS[row.registrarVersion],
        onChainOracle: regOracle,
        mapOracle: row.oracleAddress,
        parentBlock: row.parentBlock,
      })
    }

    // 1. The oracle must be the artifact we pinned, at this block.
    await assertCodeHash(rpc, row.oracleAddress, row.oracleKeccak, `oracle ${row.oracleRole}`)
    out.oracleKeccakVerified = true

    // 2. Resolve the algorithm-13 slot from oracle storage and cross-check it
    //    against the routing the override map declares.
    const slotRaw = await rpc.send('eth_call', [
      { to: row.oracleAddress, data: encodeAlgorithms(13) },
      'latest',
    ])
    const slot = `0x${slotRaw.slice(-40)}`
    out.alg13SlotAddress = slot
    const expectedSlot =
      row.actualVariantOnChain === 'new' ? row.newVerifierAddress : row.oldVerifierAddress
    if (slot.toLowerCase() !== expectedSlot.toLowerCase()) {
      throw new ReplayError('routing_mismatch', 'algorithms(13) does not match the override map', {
        onChain: slot,
        expected: expectedSlot,
        actualVariantOnChain: row.actualVariantOnChain,
      })
    }

    // 3. Rebuild the oracle-level call from the ORIGINAL registrar calldata.
    const decoded = decodeCalldata(hexToBytes(calldata))
    if (decoded.version !== row.registrarVersion) {
      throw new ReplayError('version_selector_mismatch', 'selector/version disagree', {
        selector: decoded.selector,
        declared: row.registrarVersion,
      })
    }
    const input = decoded.input
    let data
    if (row.registrarVersion === 'current') {
      data = encodeVerifyRRSet(input, row.blockTimestamp)
    } else {
      if (decoded.legacyProof === null) {
        throw new ReplayError('missing_legacy_proof', 'legacy call carries no initial proof')
      }
      data = encodeSubmitRRSets(input, decoded.legacyProof)
      // legacy reads block.timestamp directly, so the clock has to be right.
      await setAndProveTimestamp(rpc, row.blockTimestamp)
    }
    const intrinsic = intrinsicGas(data)

    // 4. OLD variant.
    await rpc.send('anvil_setCode', [slot, pins[row.oldRole].code])
    await assertCodeHash(rpc, slot, row.oldVerifierKeccak, `old verifier ${row.oldRole}`)
    out.oldVerifierKeccakVerified = true
    const oldRun = await traceCall(rpc, { from: caller, to: row.oracleAddress, data })

    // 5. NEW variant — identical in every respect except the code at `slot`.
    await rpc.send('anvil_setCode', [slot, pins[row.newRole].code])
    await assertCodeHash(rpc, slot, row.newVerifierKeccak, `new verifier ${row.newRole}`)
    out.newVerifierKeccakVerified = true
    const newRun = await traceCall(rpc, { from: caller, to: row.oracleAddress, data })

    out.gas_old = oldRun.gasTotal
    out.gas_new = newRun.gasTotal
    out.gas_old_exec = oldRun.gasTotal - intrinsic
    out.gas_new_exec = newRun.gasTotal - intrinsic
    out.delta_gas = oldRun.gasTotal - newRun.gasTotal
    out.revert_class_old = revertClass(oldRun)
    out.revert_class_new = revertClass(newRun)
    out.output_identical = oldRun.returnValue === newRun.returnValue

    if (!oldRun.failed && !newRun.failed) {
      // Successful pair: RR data and inception are both inside the ABI return,
      // so byte equality of returnValue covers the work order's requirement.
      out.replay_status = out.output_identical ? 'ok' : 'output_mismatch'
    } else if (oldRun.failed && newRun.failed) {
      out.replay_status =
        out.revert_class_old === out.revert_class_new ? 'ok_reverted' : 'revert_class_mismatch'
    } else {
      out.replay_status = 'outcome_divergence'
    }
  } catch (e) {
    out.replay_status = e instanceof ReplayError ? `error:${e.code}` : 'error:unexpected'
    out.replay_error = {
      code: e instanceof ReplayError ? e.code : 'unexpected',
      message: redact(e.message),
      ...(e instanceof ReplayError ? e.detail : {}),
    }
  }

  return out
}

export const HARNESS_VERSION = 'replay-1.0.0'
export { Anvil, PROBE_ADDRESS, DEFAULT_CALLER }
