/**
 * Execution-path simulator for the ENS DNSSEC oracle.
 *
 * Mirrors `DNSSECImpl` for BOTH deployed variants. Sources read:
 *   current (`0x0fc3152971714E5ed7723FAFa650F86A4BaF30C5`)
 *     ens-contracts/contracts/dnssec-oracle/DNSSECImpl.sol
 *   legacy  (`0x21745ff62108968fbf5ab1e07961cc0fcbeb2364`, used by legacy registrar)
 *     ens-contracts/deployments/mainnet/solcInputs/08371ea78d6ca0259dbc9b2f768cf73e.json
 *     ens-contracts/deployments/mainnet/solcInputs/40ce5451dce8f428cafdaca8fb82d91d.json
 *       (the two legacy revisions differ ONLY in the key-tag implementation —
 *        optimised library call vs inline naive loop — which is the same
 *        RFC 4034 Appendix B checksum, so the modelled path is identical)
 *
 * The only thing we count is CALLS INTO AN ALGORITHM VERIFIER. That is exactly
 * the single `algorithm.verify(...)` / `algorithms[..].verify(...)` site at the
 * bottom of `verifySignatureWithKey`, reached only after protocol, algorithm,
 * key-tag and zone-flag all match.
 *
 * ── Deliberate legacy/current differences, all read from source ──────────────
 *
 * 1. INITIAL PROOF.
 *      current: `verifyRRSet` seeds `proof = anchors` (contract storage).
 *      legacy:  `submitRRSets(input, _proof)` seeds `proof = _proof`, which the
 *               legacy registrar passes straight through from calldata arg 3.
 *
 * 2. SIGNER-NAME CHECK in `verifySignature`.
 *      current: `name.isSubdomainOf(rrset.signerName)` — label-aligned.
 *      legacy:  `signerName.length <= name.length` plus a raw byte-suffix
 *               compare — NOT label-aligned, therefore laxer.
 *
 * 3. `verifyWithDS` CONTROL FLOW.
 *      current: on a self-signed key whose DS lookup fails, REWINDS the DS
 *               iterator and continues to the next key — so a second key can
 *               produce a second verifier dispatch.
 *      legacy:  `return verifyKeyWithDS(...)` immediately — the first
 *               self-signed key is final, so at most one dispatch survives it.
 *
 * 4. UNMAPPED ALGORITHM.
 *      current: `if (address(algorithm) == address(0)) return false;`
 *      legacy:  no zero check; `algorithms[alg].verify(...)` on address(0)
 *               hits solc's extcodesize guard and REVERTS.
 *
 * 5. `verifyKeyWithDS` OWNER-NAME CHECK.
 *      current: reverts `ProofNameMismatch` if a DS owner name differs.
 *      legacy:  no such check.
 */
import { reverted, unsupported } from './errors.mjs'
import {
  CLASS_IN,
  DNSKEY_FLAG_ZONEKEY,
  RRIterator,
  TYPE_DNSKEY,
  TYPE_DS,
  computeKeytag,
  isSubdomainOf,
  labelCount,
  nameLength,
  readDNSKEY,
  readDS,
  readSignedSet,
  serialNumberGte,
} from './wire.mjs'
import { bytesEqual, rangesEqual } from './bytes.mjs'
import { verifyDigest, verifySignature } from './algorithms.mjs'

/**
 * @param {object} opts
 * @param {{rrset: Buffer, sig: Buffer}[]} opts.input
 * @param {Buffer} opts.initialProof
 * @param {'current'|'legacy'} opts.version
 * @param {Set<number>} opts.algorithmMap  algorithm IDs mapped to a non-zero verifier
 * @param {number|null} opts.now           unix seconds, or null to skip time checks
 */
export const runChain = ({ input, initialProof, version, algorithmMap, now }) => {
  const state = {
    version,
    algorithmMap,
    now,
    dispatches: [],
    algorithmsSeen: new Set(),
    matchingKeys: [],
    depth: 0,
  }

  let proof = initialProof
  try {
    for (let i = 0; i < input.length; i++) {
      state.depth = i
      const rrset = validateSignedSet(state, input[i], proof)
      proof = rrset.data
    }
  } catch (e) {
    // Carry the partial state out with the error: dispatches that happened
    // before a revert are real and must still be counted and reported.
    if (e && typeof e === 'object') e.state = state
    throw e
  }
  return state
}

const validateSignedSet = (state, input, proof) => {
  const rrset = readSignedSet(input.rrset)
  state.algorithmsSeen.add(rrset.algorithm)

  // The legacy oracle additionally requires the proof to already be present in
  // its `rrsets` storage (`validProof`). That is a state precondition we cannot
  // and need not model: it gates the whole call, so if it failed there would be
  // no verifier dispatch at all, and every transaction in the study population
  // passed it by construction.

  const name = validateRRs(state, rrset, rrset.typeCovered)
  if (labelCount(name, 0) !== rrset.labels) {
    throw reverted('invalid_label_count', 'label count does not match RRSIG labels', {
      depth: state.depth,
      labels: rrset.labels,
      labelCount: labelCount(name, 0),
    })
  }
  rrset.name = name

  if (state.now !== null && state.now !== undefined) {
    const now32 = state.now >>> 0
    if (!serialNumberGte(rrset.expiration, now32)) {
      throw reverted('signature_expired', 'RRSIG expiration precedes the timestamp', {
        depth: state.depth,
        expiration: rrset.expiration,
        now: now32,
      })
    }
    if (!serialNumberGte(now32, rrset.inception)) {
      throw reverted('signature_not_valid_yet', 'RRSIG inception follows the timestamp', {
        depth: state.depth,
        inception: rrset.inception,
        now: now32,
      })
    }
  }

  verifySignatureStep(state, name, rrset, input, proof)
  return rrset
}

/** `DNSSECImpl.validateRRs` — identical in both versions apart from revert style. */
const validateRRs = (state, rrset, typecovered) => {
  let name = null
  for (const iter = new RRIterator(rrset.data, 0); !iter.done(); iter.next()) {
    if (iter.class !== CLASS_IN) {
      throw reverted('invalid_class', 'RR class is not IN', {
        depth: state.depth,
        class: iter.class,
      })
    }
    if (name === null) {
      name = iter.name()
    } else {
      if (
        name.length !== nameLength(iter.data, iter.offset) ||
        !rangesEqual(name, 0, iter.data, iter.offset, name.length, 'validateRRs')
      ) {
        throw reverted('invalid_rrset', 'RR owner names differ within the RRset', {
          depth: state.depth,
        })
      }
    }
    if (iter.dnstype !== typecovered) {
      throw reverted('signature_type_mismatch', 'RR type does not match RRSIG type covered', {
        depth: state.depth,
        rrsetType: iter.dnstype,
        sigType: typecovered,
      })
    }
  }
  if (name === null) {
    // An empty RRset never enters the loop, so `name` stays zero-length and the
    // subsequent `labelCount(name, 0)` reads offset 0 of an empty array -> Panic.
    throw reverted('empty_rrset', 'signed set contains no resource records', {
      depth: state.depth,
    })
  }
  return name
}

/** `DNSSECImpl.verifySignature` */
const verifySignatureStep = (state, name, rrset, data, proof) => {
  if (state.version === 'current') {
    if (!isSubdomainOf(name, rrset.signerName)) {
      throw reverted('invalid_signer_name', 'RRSIG signer name does not cover the RR name', {
        depth: state.depth,
      })
    }
  } else {
    // legacy: raw byte-suffix, not label-aligned
    if (rrset.signerName.length > name.length) {
      throw reverted('invalid_signer_name', 'signer name longer than RR name', {
        depth: state.depth,
      })
    }
    if (
      !bytesEqual(rrset.signerName, name.subarray(name.length - rrset.signerName.length))
    ) {
      throw reverted('invalid_signer_name', 'RRSIG signer name is not a suffix of the RR name', {
        depth: state.depth,
      })
    }
  }

  const proofRR = new RRIterator(proof, 0)
  if (proofRR.dnstype === TYPE_DS) {
    verifyWithDS(state, rrset, data, proofRR)
  } else if (proofRR.dnstype === TYPE_DNSKEY) {
    verifyWithKnownKey(state, rrset, data, proofRR)
  } else {
    throw reverted('invalid_proof_type', 'proof is neither DS nor DNSKEY', {
      depth: state.depth,
      proofType: proofRR.dnstype,
    })
  }
}

/** `DNSSECImpl.verifyWithKnownKey` */
const verifyWithKnownKey = (state, rrset, data, proof) => {
  if (state.version === 'legacy') {
    // legacy has a redundant pre-loop `require(proof.name().equals(signerName))`
    if (!bytesEqual(proof.name(), rrset.signerName)) {
      throw reverted('proof_name_mismatch', 'DNSKEY owner name does not match signer name', {
        depth: state.depth,
      })
    }
  }
  for (; !proof.done(); proof.next()) {
    const proofName = proof.name()
    if (!bytesEqual(proofName, rrset.signerName)) {
      throw reverted('proof_name_mismatch', 'DNSKEY owner name does not match signer name', {
        depth: state.depth,
      })
    }
    const keyrdata = proof.rdata()
    const dnskey = readDNSKEY(keyrdata, 0, keyrdata.length)
    state.algorithmsSeen.add(dnskey.algorithm)
    if (verifySignatureWithKey(state, dnskey, keyrdata, rrset, data)) {
      state.matchingKeys.push({
        depth: state.depth,
        keytag: computeKeytag(keyrdata),
        algorithm: dnskey.algorithm,
        via: 'known-key',
      })
      return
    }
  }
  throw reverted('no_matching_proof', 'no DNSKEY in the proof verified the RRset', {
    depth: state.depth,
  })
}

/** `DNSSECImpl.verifyWithDS` */
const verifyWithDS = (state, rrset, data, proof) => {
  const proofOffset = proof.offset
  for (const iter = new RRIterator(rrset.data, 0); !iter.done(); iter.next()) {
    if (iter.dnstype !== TYPE_DNSKEY) {
      throw reverted('invalid_proof_type', 'DS-proved RRset contains a non-DNSKEY record', {
        depth: state.depth,
        proofType: iter.dnstype,
      })
    }
    const keyrdata = iter.rdata()
    const dnskey = readDNSKEY(keyrdata, 0, keyrdata.length)
    state.algorithmsSeen.add(dnskey.algorithm)
    if (verifySignatureWithKey(state, dnskey, keyrdata, rrset, data)) {
      const keyname = state.version === 'current' ? rrset.signerName : iter.name()
      if (verifyKeyWithDS(state, keyname, proof, dnskey, keyrdata)) {
        state.matchingKeys.push({
          depth: state.depth,
          keytag: computeKeytag(keyrdata),
          algorithm: dnskey.algorithm,
          via: 'ds',
        })
        return
      }
      if (state.version === 'legacy') {
        // legacy returns the DS result immediately; no rewind, no second chance
        throw reverted('no_matching_proof', 'self-signed key had no matching DS record', {
          depth: state.depth,
        })
      }
      // current: rewind the DS iterator and try the next key
      proof.nextOffset = proofOffset
      proof.next()
    }
  }
  throw reverted('no_matching_proof', 'no DNSKEY in the RRset verified against the DS proof', {
    depth: state.depth,
  })
}

/** `DNSSECImpl.verifyKeyWithDS` */
const verifyKeyWithDS = (state, keyname, dsrrs, dnskey, keyrdata) => {
  const keytag = computeKeytag(keyrdata)
  for (; !dsrrs.done(); dsrrs.next()) {
    if (state.version === 'current') {
      const proofName = dsrrs.name()
      if (!bytesEqual(proofName, keyname)) {
        throw reverted('proof_name_mismatch', 'DS owner name does not match the key name', {
          depth: state.depth,
        })
      }
    }
    const ds = readDS(dsrrs.data, dsrrs.rdataOffset, dsrrs.nextOffset - dsrrs.rdataOffset)
    state.algorithmsSeen.add(ds.algorithm)
    if (ds.keytag !== keytag) continue
    if (ds.algorithm !== dnskey.algorithm) continue

    const buf = Buffer.concat([keyname, keyrdata])
    const r = verifyDigest(ds.digestType, buf, ds.digest)
    if (r.revert) {
      throw reverted('digest_revert', r.revert, {
        depth: state.depth,
        digestType: ds.digestType,
      })
    }
    if (r.ok) return true
  }
  return false
}

/**
 * `DNSSECImpl.verifySignatureWithKey` — THE dispatch site.
 *
 * Returns the boolean the contract returns. Every `true` return from the
 * pre-checks below reaches `algorithm.verify(...)`, which is one verifier CALL
 * and is what `n13_decoded` counts when the algorithm is 13.
 */
const verifySignatureWithKey = (state, dnskey, keyrdata, rrset, data) => {
  if (dnskey.protocol !== 3) return false
  if (dnskey.algorithm !== rrset.algorithm) return false
  if (computeKeytag(keyrdata) !== rrset.keytag) return false
  if ((dnskey.flags & DNSKEY_FLAG_ZONEKEY) === 0) return false

  const mapped = state.algorithmMap.has(dnskey.algorithm)
  if (!mapped) {
    if (state.version === 'current') {
      // `if (address(algorithm) == address(0)) return false;`
      return false
    }
    // legacy: high-level call to address(0) fails solc's extcodesize check
    throw reverted(
      'unmapped_algorithm_revert',
      `legacy oracle reverts calling unmapped algorithm ${dnskey.algorithm}`,
      { depth: state.depth, algorithm: dnskey.algorithm },
    )
  }

  const result = verifySignature(dnskey.algorithm, keyrdata, data.rrset, data.sig)

  state.dispatches.push({
    depth: state.depth,
    algorithm: dnskey.algorithm,
    keytag: rrset.keytag,
    verifier_result: result.revert ? 'revert' : result.ok,
    engine: result.engine,
    ...(result.cryptoError ? { crypto_error: result.cryptoError } : {}),
  })

  if (result.revert) {
    // The current alg-13 verifier `require`s its input lengths, so a bad length
    // aborts the whole call. The dispatch above still happened and is counted.
    throw reverted('verifier_revert', result.revert, {
      depth: state.depth,
      algorithm: dnskey.algorithm,
    })
  }
  return result.ok
}

export { unsupported }
