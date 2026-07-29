/**
 * Independent proof decoder for ENS direct-import Claim transactions.
 *
 * Deliverable #1 of task `algorithm13-direct-import-empirical`.
 *
 * Contract: given ONLY the raw calldata of a direct-import call, decode the
 * submitted proof and compute how many algorithm-13 verifier dispatches that
 * execution path implies. It never consults traces, never touches the network,
 * and is a pure function of its inputs.
 */
import crypto from 'node:crypto'
import { decodeCalldata } from './abi.mjs'
import { bytesToHex, hexToBytes } from './bytes.mjs'
import {
  ALGORITHM_13,
  CURRENT_ANCHORS,
  DECODER_VERSION,
  DEFAULT_ALGORITHM_MAP,
} from './config.mjs'
import { DecodeError, malformed } from './errors.mjs'
import { runChain } from './oracle.mjs'

/**
 * Canonical proof hash.
 *
 * RULE (v1), documented so it can be reproduced independently:
 *
 *   proof_hash = sha256(
 *       "ens-dnssec-proof/v1\n"                 (ASCII, 20 bytes)
 *     || uint32be(n)                            number of RRSetWithSignature
 *     || for each i in 0..n-1:
 *            uint32be(len(rrset_i)) || rrset_i
 *         || uint32be(len(sig_i))   || sig_i
 *   )
 *
 * Length-prefixing every field makes the encoding injective, so two different
 * proofs can never collide through concatenation ambiguity. The hash covers the
 * proof chain ONLY: not the claimed name, not the resolver/addr arguments, and
 * not the legacy initial-proof argument. That is deliberate — it lets the same
 * proof chain submitted through the legacy and the current registrar hash
 * identically. The legacy initial proof is reported separately as
 * `initial_proof_hash` (sha256 over "ens-dnssec-initial-proof/v1\n" || bytes).
 */
export const proofHash = (input) => {
  const h = crypto.createHash('sha256')
  h.update(Buffer.from('ens-dnssec-proof/v1\n', 'ascii'))
  const n = Buffer.alloc(4)
  n.writeUInt32BE(input.length)
  h.update(n)
  for (const { rrset, sig } of input) {
    const a = Buffer.alloc(4)
    a.writeUInt32BE(rrset.length)
    h.update(a)
    h.update(rrset)
    const b = Buffer.alloc(4)
    b.writeUInt32BE(sig.length)
    h.update(b)
    h.update(sig)
  }
  return `0x${h.digest('hex')}`
}

const initialProofHash = (bytes) =>
  `0x${crypto
    .createHash('sha256')
    .update(Buffer.from('ens-dnssec-initial-proof/v1\n', 'ascii'))
    .update(bytes)
    .digest('hex')}`

/**
 * `proof_shape` is computed over the algorithms that were actually DISPATCHED
 * to a verifier, not merely those appearing somewhere in the wire data — the
 * dispatched set is what drives gas. `algorithms_seen` reports the wider set.
 */
const RSA_ALGORITHMS = new Set([5, 7, 8])

const proofShape = (dispatches) => {
  const algs = new Set(dispatches.map((d) => d.algorithm))
  if (algs.size === 0) return 'none'
  const only13 = [...algs].every((a) => a === ALGORITHM_13)
  if (only13) return 'alg13-only'
  const onlyRsa = [...algs].every((a) => RSA_ALGORITHMS.has(a))
  if (onlyRsa) return 'rsa-only'
  if (algs.has(ALGORITHM_13)) return 'mixed'
  return 'other'
}

/**
 * Decode one direct-import call.
 *
 * @param {object} call
 * @param {string} call.callId              stable call key, echoed through
 * @param {string} call.calldata            0x-prefixed hex, including selector
 * @param {'current'|'legacy'} call.registrarVersion
 * @param {number} [call.now]               block timestamp; omit to skip the
 *                                          RRSIG inception/expiration checks
 * @param {Set<number>|number[]} [call.algorithmMap]
 * @param {string} [call.initialProof]      override the seeded proof (current
 *                                          version only; legacy takes it from
 *                                          calldata). Used by tests.
 * @returns {object} always a record — never throws for bad input
 */
export const decodeCall = (call) => {
  const base = {
    callId: call?.callId ?? null,
    registrarVersion: call?.registrarVersion ?? null,
    decoder_version: DECODER_VERSION,
    selector: null,
    function: null,
    name: null,
    n13_decoded: 0,
    algorithms_seen: [],
    proof_depth: 0,
    matching_key: null,
    matching_keys: [],
    proof_hash: null,
    initial_proof_hash: null,
    proof_shape: 'none',
    shape_basis: 'dispatched',
    decode_status: 'ok',
    decode_error: null,
    dispatches: [],
    time_checks: 'skipped',
    terminal: null,
  }

  let state = null
  try {
    if (!call || typeof call !== 'object') {
      throw malformed('bad_input', 'call record is not an object')
    }
    if (call.registrarVersion !== 'current' && call.registrarVersion !== 'legacy') {
      throw malformed(
        'bad_registrar_version',
        "registrarVersion must be 'current' or 'legacy'",
        { registrarVersion: call.registrarVersion ?? null },
      )
    }

    const calldata = hexToBytes(call.calldata, 'calldata')
    const decoded = decodeCalldata(calldata)
    base.selector = decoded.selector
    base.function = decoded.signature
    base.name = decoded.name ? bytesToHex(decoded.name) : null
    base.proof_depth = decoded.input.length
    base.proof_hash = proofHash(decoded.input)

    if (decoded.version !== call.registrarVersion) {
      throw malformed(
        'version_selector_mismatch',
        `selector belongs to the ${decoded.version} registrar but the call is labelled ${call.registrarVersion}`,
        { selector: decoded.selector, declared: call.registrarVersion },
      )
    }

    let initialProof
    if (call.registrarVersion === 'legacy') {
      if (decoded.legacyProof === null) {
        throw malformed('missing_legacy_proof', 'legacy call carries no initial proof argument')
      }
      initialProof = decoded.legacyProof
      base.initial_proof_hash = initialProofHash(initialProof)
    } else if (call.initialProof !== undefined) {
      initialProof = hexToBytes(call.initialProof, 'initialProof')
      base.initial_proof_hash = initialProofHash(initialProof)
    } else {
      initialProof = CURRENT_ANCHORS
      base.initial_proof_hash = initialProofHash(initialProof)
    }

    const algorithmMap =
      call.algorithmMap instanceof Set
        ? call.algorithmMap
        : Array.isArray(call.algorithmMap)
          ? new Set(call.algorithmMap)
          : DEFAULT_ALGORITHM_MAP

    const now = call.now === undefined || call.now === null ? null : Number(call.now)
    base.time_checks = now === null ? 'skipped' : 'applied'

    state = runChain({
      input: decoded.input,
      initialProof,
      version: call.registrarVersion,
      algorithmMap,
      now,
    })
    base.terminal = { outcome: 'verified', reason: null }
  } catch (e) {
    if (e instanceof DecodeError) {
      // A `reverted` path is still a fully modelled path: everything dispatched
      // before the revert is real and is reported.
      base.decode_status = e.kind === 'reverted' ? 'ok' : e.kind
      base.terminal = { outcome: e.kind === 'reverted' ? 'revert' : 'undecodable', reason: e.code }
      base.decode_error = e.toJSON()
      state = e.state ?? null
    } else {
      base.decode_status = 'malformed'
      base.terminal = { outcome: 'undecodable', reason: 'internal_error' }
      base.decode_error = {
        kind: 'malformed',
        code: 'internal_error',
        message: String(e && e.message ? e.message : e),
      }
    }
  }

  if (state) {
    base.dispatches = state.dispatches
    base.n13_decoded = state.dispatches.filter((d) => d.algorithm === ALGORITHM_13).length
    base.algorithms_seen = [...state.algorithmsSeen].sort((a, b) => a - b)
    base.matching_keys = state.matchingKeys
    base.matching_key =
      state.matchingKeys.length > 0
        ? state.matchingKeys[state.matchingKeys.length - 1].keytag
        : null
    base.proof_shape = proofShape(state.dispatches)
  }

  return base
}

export { DECODER_VERSION }
