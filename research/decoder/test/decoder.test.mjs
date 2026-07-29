/**
 * Test suite for the independent proof decoder.
 *
 *   node --test research/decoder/test/
 *
 * Every vector traces back to a checked-in ens-contracts fixture; see
 * `fixtures.mjs` for provenance of each one.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { decodeCall, proofHash } from '../index.mjs'
import { computeKeytag, readDNSKEY, readSignedSet } from '../wire.mjs'
import { verifySignature } from '../algorithms.mjs'
import { hexToBytes } from '../bytes.mjs'
import { CURRENT_ANCHORS_HEX } from '../config.mjs'
import { encodeCall, encodeDnskeyRR } from './encode.mjs'
import { buildTwoDispatchVector } from './two-dispatch.mjs'
import {
  ALGORITHM_VECTORS,
  ETHLAB_CHAIN,
  ETHLAB_NAME,
  ETHLAB_TIMESTAMP,
  EXPECTED_KEYTAGS,
  RFC6605_DNSKEY_OWNER,
  RFC6605_DNSKEY_TTL,
} from './fixtures.mjs'

const CURRENT_PROVE_AND_CLAIM = '0x29d56630'
const CURRENT_WITH_RESOLVER = '0x06963218'
const LEGACY_PROVE_AND_CLAIM = '0x8bbedf75'
const LEGACY_WITH_RESOLVER = '0x224199c2'

// ── 1. Algorithm-13 identification ──────────────────────────────────────────

test('alg-13: DNSKEY RDATA carries algorithm 13 at offset 3', () => {
  const key = hexToBytes(ALGORITHM_VECTORS.P256SHA256Algorithm.key)
  const dnskey = readDNSKEY(key, 0, key.length)
  assert.equal(key[3], 0x0d, 'RFC 6605 vector must have alg byte 0x0d at offset 3')
  assert.equal(dnskey.algorithm, 13)
  assert.equal(dnskey.protocol, 3)
  assert.equal(dnskey.flags, 257)
  assert.equal(dnskey.flags & 0x100, 0x100, 'zone-key flag must be set')
  assert.equal(dnskey.publicKey.length, 64, 'P-256 public key is 64 bytes')
  assert.equal(key.length, 68, 'P-256 DNSKEY RDATA is 68 bytes')
})

test('alg-13: the RRSIG in the RFC 6605 vector also declares algorithm 13', () => {
  const ss = readSignedSet(hexToBytes(ALGORITHM_VECTORS.P256SHA256Algorithm.data))
  assert.equal(ss.algorithm, 13)
  assert.equal(ss.keytag, EXPECTED_KEYTAGS.P256SHA256Algorithm)
  assert.equal(ss.labels, 3)
  assert.equal(
    Buffer.from(ss.signerName).toString('hex'),
    '076578616d706c65036e657400', // example.net.
  )
})

test('non-13 fixtures are not misidentified as algorithm 13', () => {
  for (const name of ['RSASHA1Algorithm', 'RSASHA256Algorithm']) {
    const v = ALGORITHM_VECTORS[name]
    const key = hexToBytes(v.key)
    assert.equal(readDNSKEY(key, 0, key.length).algorithm, v.algorithm)
    assert.notEqual(readDNSKEY(key, 0, key.length).algorithm, 13)
  }
})

// ── 2. Key-tag computation ──────────────────────────────────────────────────

test('computeKeytag reproduces the key tags recorded in the fixtures', () => {
  for (const [name, expected] of Object.entries(EXPECTED_KEYTAGS)) {
    const key = hexToBytes(ALGORITHM_VECTORS[name].key)
    assert.equal(computeKeytag(key), expected, `${name} key tag`)
  }
})

test('computeKeytag agrees with the key tag the RRSIG itself declares', () => {
  for (const name of Object.keys(ALGORITHM_VECTORS)) {
    const v = ALGORITHM_VECTORS[name]
    const ss = readSignedSet(hexToBytes(v.data))
    assert.equal(computeKeytag(hexToBytes(v.key)), ss.keytag, `${name} RRSIG key tag`)
  }
})

// ── 3. Crypto layer verifies the real fixture signatures ────────────────────

test('every checked-in algorithm vector verifies', () => {
  for (const [name, v] of Object.entries(ALGORITHM_VECTORS)) {
    const r = verifySignature(
      v.algorithm,
      hexToBytes(v.key),
      hexToBytes(v.data),
      hexToBytes(v.sig),
    )
    assert.equal(r.revert, null, `${name} must not revert`)
    assert.equal(r.ok, true, `${name} signature must verify`)
  }
})

test('a corrupted signature does not verify', () => {
  const v = ALGORITHM_VECTORS.P256SHA256Algorithm
  const sig = hexToBytes(v.sig)
  sig[0] ^= 0xff
  const r = verifySignature(13, hexToBytes(v.key), hexToBytes(v.data), sig)
  assert.equal(r.ok, false)
})

// ── 4. RSA-only proof: full six-deep real chain, n13 must be 0 ──────────────

const ethlabCalldata = (selector, extra = []) =>
  encodeCall(selector, [
    { type: 'bytes', value: ETHLAB_NAME },
    { type: 'rrsets', value: ETHLAB_CHAIN },
    ...extra,
  ])

test('ethlab.xyz chain (current registrar): verifies, n13 = 0, rsa-only', () => {
  const r = decodeCall({
    callId: 'test:ethlab:current',
    calldata: ethlabCalldata(CURRENT_PROVE_AND_CLAIM),
    registrarVersion: 'current',
    now: ETHLAB_TIMESTAMP,
  })

  assert.equal(r.decode_status, 'ok')
  assert.deepEqual(r.terminal, { outcome: 'verified', reason: null })
  assert.equal(r.n13_decoded, 0)
  assert.equal(r.proof_depth, 6)
  assert.equal(r.proof_shape, 'rsa-only')
  assert.deepEqual(r.algorithms_seen, [8])
  assert.equal(r.time_checks, 'applied')
  assert.equal(r.selector, CURRENT_PROVE_AND_CLAIM)
  assert.equal(r.name, ETHLAB_NAME)
  // Six RRSets, each validated by exactly one key here.
  assert.equal(r.matching_keys.length, 6)
  // Final RRSet (_ens.ethlab.xyz TXT) is signed by ethlab.xyz key 42999.
  assert.equal(r.matching_key, 42999)
  // Chain starts from the real root anchors: the root DNSKEY set is proved via DS.
  assert.equal(r.matching_keys[0].via, 'ds')
  assert.equal(r.matching_keys[0].keytag, 20326)
  assert.ok(
    r.dispatches.every((d) => d.algorithm === 8 && d.verifier_result === true),
    'every dispatch is an alg-8 success',
  )
})

test('ethlab.xyz chain decodes identically through proveAndClaimWithResolver', () => {
  const withResolver = decodeCall({
    callId: 'test:ethlab:resolver',
    calldata: ethlabCalldata(CURRENT_WITH_RESOLVER, [
      { type: 'address', value: '0x231b0ee14048e9dccd1d247744d114a4eb5e8e63' },
      { type: 'address', value: '0xfdb33f8ac7ce72d7d4795dd8610e323b4c122fbb' },
    ]),
    registrarVersion: 'current',
    now: ETHLAB_TIMESTAMP,
  })
  const plain = decodeCall({
    callId: 'test:ethlab:current',
    calldata: ethlabCalldata(CURRENT_PROVE_AND_CLAIM),
    registrarVersion: 'current',
    now: ETHLAB_TIMESTAMP,
  })

  assert.equal(withResolver.decode_status, 'ok')
  assert.equal(withResolver.n13_decoded, plain.n13_decoded)
  assert.equal(withResolver.proof_hash, plain.proof_hash)
  assert.equal(withResolver.selector, CURRENT_WITH_RESOLVER)
})

test('ethlab.xyz chain under the legacy registrar, seeded from calldata', () => {
  // The legacy registrar passes its third `bytes` argument straight through to
  // `submitRRSets` as the initial proof, so the anchors go in explicitly.
  const r = decodeCall({
    callId: 'test:ethlab:legacy',
    calldata: encodeCall(LEGACY_PROVE_AND_CLAIM, [
      { type: 'bytes', value: ETHLAB_NAME },
      { type: 'rrsets', value: ETHLAB_CHAIN },
      { type: 'bytes', value: CURRENT_ANCHORS_HEX },
    ]),
    registrarVersion: 'legacy',
    now: ETHLAB_TIMESTAMP,
  })

  assert.equal(r.decode_status, 'ok')
  assert.equal(r.terminal.outcome, 'verified')
  assert.equal(r.n13_decoded, 0)
  assert.equal(r.proof_depth, 6)
  assert.equal(r.matching_key, 42999)
  assert.ok(r.initial_proof_hash, 'legacy calls report the initial proof hash')
})

test('the time checks actually bite', () => {
  const tooEarly = decodeCall({
    callId: 'test:ethlab:early',
    calldata: ethlabCalldata(CURRENT_PROVE_AND_CLAIM),
    registrarVersion: 'current',
    now: 1000000000,
  })
  assert.equal(tooEarly.terminal.outcome, 'revert')
  assert.equal(tooEarly.decode_error.code, 'signature_not_valid_yet')

  const tooLate = decodeCall({
    callId: 'test:ethlab:late',
    calldata: ethlabCalldata(CURRENT_PROVE_AND_CLAIM),
    registrarVersion: 'current',
    now: 2000000000,
  })
  assert.equal(tooLate.terminal.outcome, 'revert')
  assert.equal(tooLate.decode_error.code, 'signature_expired')
})

test('the ethlab chain dispatches exactly once per depth, with the fixtures\' own key tags', () => {
  const r = decodeCall({
    callId: 'test:ethlab:dispatches',
    calldata: ethlabCalldata(CURRENT_PROVE_AND_CLAIM),
    registrarVersion: 'current',
    now: ETHLAB_TIMESTAMP,
  })
  // Key tags quoted in the RRSIG lines above each fixture entry, in order:
  //   20326 .   /  16749 .  /  3599 xyz.  /  53709 xyz.  /  42999 ethlab.xyz. (x2)
  assert.deepEqual(
    r.dispatches.map((d) => d.keytag),
    [20326, 16749, 3599, 53709, 42999, 42999],
  )
  assert.equal(r.dispatches.length, 6, 'one verifier call per RRSet, no redundant dispatches')
  // The chain alternates: DNSKEY sets are proved by DS, DS/TXT sets by a known key.
  assert.deepEqual(
    r.matching_keys.map((k) => k.via),
    ['ds', 'known-key', 'ds', 'known-key', 'ds', 'known-key'],
  )
})

// ── 4b. Mutation checks: prove the suite is not vacuous ─────────────────────

test('mutation: corrupting one signature byte breaks the chain at that depth', () => {
  const target = 3
  const mutated = ETHLAB_CHAIN.map((e, i) => {
    if (i !== target) return e
    const sig = Buffer.from(hexToBytes(e.sig))
    sig[0] ^= 0x01
    return { ...e, sig: `0x${sig.toString('hex')}` }
  })
  const r = decodeCall({
    callId: 'test:mutation:sig',
    calldata: encodeCall(CURRENT_PROVE_AND_CLAIM, [
      { type: 'bytes', value: ETHLAB_NAME },
      { type: 'rrsets', value: mutated },
    ]),
    registrarVersion: 'current',
    now: ETHLAB_TIMESTAMP,
  })
  assert.equal(r.terminal.outcome, 'revert')
  assert.equal(r.decode_error.code, 'no_matching_proof')
  assert.equal(r.decode_error.depth, target, 'must fail at the mutated depth, not earlier or later')
  // Dispatches up to and including the failing one are still counted.
  assert.equal(r.dispatches.length, target + 1)
  assert.equal(r.dispatches[target].verifier_result, false)
})

test('mutation: corrupting the trust anchors breaks the chain at depth 0', () => {
  const anchors = Buffer.from(hexToBytes(CURRENT_ANCHORS_HEX))
  anchors[anchors.length - 1] ^= 0x01 // last byte of the second DS digest
  const r = decodeCall({
    callId: 'test:mutation:anchors',
    calldata: ethlabCalldata(CURRENT_PROVE_AND_CLAIM),
    registrarVersion: 'current',
    initialProof: `0x${anchors.toString('hex')}`,
    now: ETHLAB_TIMESTAMP,
  })
  assert.equal(r.terminal.outcome, 'revert')
  assert.equal(r.decode_error.depth, 0)
})

// ── 5. Algorithm-13 dispatch, end to end ────────────────────────────────────

/**
 * The RFC 6605 fixture is itself a valid `RRSetWithSignature`: `data` is an
 * RRSIG RDATA header with the signature stripped followed by the canonical
 * `www.example.net. A` record, and `sig` is the real signature. Wrapping the
 * fixture's own DNSKEY RDATA in its wire header (owner/type/class/ttl/rdlength,
 * all taken from the fixture's comment) turns it into the initial proof the
 * legacy registrar supplies from calldata. No vector is invented here — the key
 * bytes and the signature bytes are the fixture's, unchanged.
 */
const rfc6605Proof = encodeDnskeyRR({
  owner: RFC6605_DNSKEY_OWNER,
  ttl: RFC6605_DNSKEY_TTL,
  rdataHex: ALGORITHM_VECTORS.P256SHA256Algorithm.key,
})

// Inside the RFC 6605 vector's own validity window (20100812 - 20100909).
const RFC6605_NOW = 1283000000

test('alg-13 dispatch is counted, and the real RFC 6605 signature verifies', () => {
  const r = decodeCall({
    callId: 'test:rfc6605',
    calldata: encodeCall(LEGACY_PROVE_AND_CLAIM, [
      { type: 'bytes', value: '0x03777777076578616d706c65036e65740' + '0' },
      {
        type: 'rrsets',
        value: [
          {
            rrset: ALGORITHM_VECTORS.P256SHA256Algorithm.data,
            sig: ALGORITHM_VECTORS.P256SHA256Algorithm.sig,
          },
        ],
      },
      { type: 'bytes', value: rfc6605Proof },
    ]),
    registrarVersion: 'legacy',
    now: RFC6605_NOW,
  })

  assert.equal(r.decode_status, 'ok')
  assert.equal(r.terminal.outcome, 'verified')
  assert.equal(r.n13_decoded, 1)
  assert.equal(r.proof_depth, 1)
  assert.equal(r.proof_shape, 'alg13-only')
  assert.deepEqual(r.algorithms_seen, [13])
  assert.equal(r.matching_key, EXPECTED_KEYTAGS.P256SHA256Algorithm)
  assert.equal(r.dispatches.length, 1)
  assert.deepEqual(r.dispatches[0], {
    depth: 0,
    algorithm: 13,
    keytag: 55648,
    verifier_result: true,
    engine: 'node:ecdsa-p256-sha256',
  })
})

test('a key-tag mismatch suppresses the dispatch entirely', () => {
  // Flip one byte of the DNSKEY public key: the key tag no longer matches the
  // RRSIG's, so `verifySignatureWithKey` returns false BEFORE reaching the
  // verifier. n13 must be 0 and the chain must fail with no matching proof.
  const mutated = Buffer.from(hexToBytes(ALGORITHM_VECTORS.P256SHA256Algorithm.key))
  mutated[10] ^= 0x01
  const proof = encodeDnskeyRR({
    owner: RFC6605_DNSKEY_OWNER,
    ttl: RFC6605_DNSKEY_TTL,
    rdataHex: `0x${mutated.toString('hex')}`,
  })

  const r = decodeCall({
    callId: 'test:rfc6605:keytag-mismatch',
    calldata: encodeCall(LEGACY_PROVE_AND_CLAIM, [
      { type: 'bytes', value: '0x0377777707' },
      {
        type: 'rrsets',
        value: [
          {
            rrset: ALGORITHM_VECTORS.P256SHA256Algorithm.data,
            sig: ALGORITHM_VECTORS.P256SHA256Algorithm.sig,
          },
        ],
      },
      { type: 'bytes', value: proof },
    ]),
    registrarVersion: 'legacy',
    now: RFC6605_NOW,
  })

  assert.equal(r.n13_decoded, 0, 'no verifier call when the key tag does not match')
  assert.equal(r.terminal.outcome, 'revert')
  assert.equal(r.decode_error.code, 'no_matching_proof')
})

test('a zone-key flag clear suppresses the dispatch', () => {
  // Clear bit 0x100 of flags without disturbing anything else, then repair the
  // RRSIG key tag so the ONLY failing pre-check is the zone-key flag.
  const key = Buffer.from(hexToBytes(ALGORITHM_VECTORS.P256SHA256Algorithm.key))
  key.writeUInt16BE(key.readUInt16BE(0) & ~0x100, 0)
  const proof = encodeDnskeyRR({
    owner: RFC6605_DNSKEY_OWNER,
    ttl: RFC6605_DNSKEY_TTL,
    rdataHex: `0x${key.toString('hex')}`,
  })
  const rrsig = Buffer.from(hexToBytes(ALGORITHM_VECTORS.P256SHA256Algorithm.data))
  rrsig.writeUInt16BE(computeKeytag(key), 16)

  const r = decodeCall({
    callId: 'test:rfc6605:no-zonekey',
    calldata: encodeCall(LEGACY_PROVE_AND_CLAIM, [
      { type: 'bytes', value: '0x0377777707' },
      {
        type: 'rrsets',
        value: [
          { rrset: `0x${rrsig.toString('hex')}`, sig: ALGORITHM_VECTORS.P256SHA256Algorithm.sig },
        ],
      },
      { type: 'bytes', value: proof },
    ]),
    registrarVersion: 'legacy',
    now: RFC6605_NOW,
  })

  assert.equal(r.n13_decoded, 0, 'zone-key flag clear must short-circuit before the verifier')
  assert.equal(r.terminal.outcome, 'revert')
})

test('an unmapped algorithm dispatches nothing on current and reverts on legacy', () => {
  const call = (registrarVersion, selector) =>
    decodeCall({
      callId: `test:unmapped:${registrarVersion}`,
      calldata: encodeCall(selector, [
        { type: 'bytes', value: '0x0377777707' },
        {
          type: 'rrsets',
          value: [
            {
              rrset: ALGORITHM_VECTORS.P256SHA256Algorithm.data,
              sig: ALGORITHM_VECTORS.P256SHA256Algorithm.sig,
            },
          ],
        },
        ...(registrarVersion === 'legacy' ? [{ type: 'bytes', value: rfc6605Proof }] : []),
      ]),
      registrarVersion,
      now: RFC6605_NOW,
      algorithmMap: [8], // algorithm 13 deliberately not mapped
      ...(registrarVersion === 'current' ? { initialProof: rfc6605Proof } : {}),
    })

  const current = call('current', CURRENT_PROVE_AND_CLAIM)
  assert.equal(current.n13_decoded, 0)
  assert.equal(current.decode_error.code, 'no_matching_proof')

  const legacy = call('legacy', LEGACY_PROVE_AND_CLAIM)
  assert.equal(legacy.n13_decoded, 0)
  assert.equal(legacy.decode_error.code, 'unmapped_algorithm_revert')
})

// ── 5b. Two dispatches at one depth (CURRENT verifyWithDS rewind) ───────────
//
// CONSTRUCTED VECTOR. No ens-contracts fixture covers this path and no call in
// the 2,127-call census exercises it. See test/two-dispatch.mjs for exactly
// what is constructed and why it has to be.

const twoDispatchCalldata = (vector, version) =>
  version === 'legacy'
    ? encodeCall(LEGACY_PROVE_AND_CLAIM, [
        { type: 'bytes', value: '0x076578616d706c65036e657400' },
        { type: 'rrsets', value: [{ rrset: vector.rrset, sig: vector.sig }] },
        { type: 'bytes', value: vector.proof },
      ])
    : encodeCall(CURRENT_PROVE_AND_CLAIM, [
        { type: 'bytes', value: '0x076578616d706c65036e657400' },
        { type: 'rrsets', value: [{ rrset: vector.rrset, sig: vector.sig }] },
      ])

test('CURRENT verifyWithDS rewind produces TWO alg-13 dispatches at one depth', () => {
  const v = buildTwoDispatchVector({ dsMatches: false })
  const r = decodeCall({
    callId: 'test:two-dispatch:current',
    calldata: twoDispatchCalldata(v, 'current'),
    registrarVersion: 'current',
    initialProof: v.proof,
    now: 1000000000,
  })

  assert.equal(r.n13_decoded, 2, 'the rewind must yield a second verifier call')
  assert.equal(r.proof_depth, 1, 'both dispatches occur within a single RRSet')
  assert.deepEqual(
    r.dispatches.map((d) => d.depth),
    [0, 0],
    'both dispatches are at depth 0',
  )
  assert.deepEqual(
    r.dispatches.map((d) => d.algorithm),
    [13, 13],
  )
  // The first key really verifies — that is what makes the rewind reachable.
  assert.equal(r.dispatches[0].verifier_result, true)
  // The second is the colliding-key-tag variant, which fails.
  assert.equal(r.dispatches[1].verifier_result, false)
  // Both keys carry the same key tag, which is why the second one is reached.
  assert.equal(r.dispatches[0].keytag, v.keytag)
  assert.equal(r.dispatches[1].keytag, v.keytag)
  assert.equal(r.proof_shape, 'alg13-only')
  assert.equal(r.terminal.outcome, 'revert')
  assert.equal(r.decode_error.code, 'no_matching_proof')
})

test('LEGACY takes the same input to ONE dispatch — no rewind exists there', () => {
  const v = buildTwoDispatchVector({ dsMatches: false })
  const r = decodeCall({
    callId: 'test:two-dispatch:legacy',
    calldata: twoDispatchCalldata(v, 'legacy'),
    registrarVersion: 'legacy',
    now: 1000000000,
  })

  // legacy verifyWithDS: `return verifyKeyWithDS(...)` — the first self-signed
  // key is final, so the second key is never reached.
  assert.equal(r.n13_decoded, 1)
  assert.equal(r.dispatches[0].verifier_result, true)
  assert.equal(r.terminal.outcome, 'revert')
})

test('control: when the DS matches, the rewind is not taken and n13 is 1', () => {
  const v = buildTwoDispatchVector({ dsMatches: true })
  const r = decodeCall({
    callId: 'test:two-dispatch:control',
    calldata: twoDispatchCalldata(v, 'current'),
    registrarVersion: 'current',
    initialProof: v.proof,
    now: 1000000000,
  })

  assert.equal(r.n13_decoded, 1, 'a successful DS lookup returns immediately')
  assert.equal(r.terminal.outcome, 'verified')
  assert.equal(r.matching_key, v.keytag)
  assert.equal(r.matching_keys[0].via, 'ds')
})

// ── 6. Malformed input returns a structured error, never a throw ────────────

const malformedCases = [
  ['not a string', { callId: 'm1', calldata: 12345, registrarVersion: 'current' }, 'not_hex'],
  ['odd hex length', { callId: 'm2', calldata: '0x123', registrarVersion: 'current' }, 'odd_hex_length'],
  [
    'non-hex characters',
    { callId: 'm3', calldata: '0xzzzzzzzz', registrarVersion: 'current' },
    'non_hex_characters',
  ],
  ['empty calldata', { callId: 'm4', calldata: '0x', registrarVersion: 'current' }, 'no_selector'],
  [
    'unknown selector',
    { callId: 'm5', calldata: '0xdeadbeef', registrarVersion: 'current' },
    'unknown_selector',
  ],
  [
    'selector only, no args',
    { callId: 'm6', calldata: CURRENT_PROVE_AND_CLAIM, registrarVersion: 'current' },
    'calldata_truncated',
  ],
  [
    'truncated mid-argument',
    {
      callId: 'm7',
      calldata: ethlabCalldata(CURRENT_PROVE_AND_CLAIM).slice(0, 600),
      registrarVersion: 'current',
    },
    'calldata_truncated',
  ],
  [
    'bad registrar version',
    { callId: 'm8', calldata: ethlabCalldata(CURRENT_PROVE_AND_CLAIM), registrarVersion: 'v3' },
    'bad_registrar_version',
  ],
  [
    'legacy selector labelled current',
    {
      callId: 'm9',
      calldata: encodeCall(LEGACY_PROVE_AND_CLAIM, [
        { type: 'bytes', value: ETHLAB_NAME },
        { type: 'rrsets', value: ETHLAB_CHAIN },
        { type: 'bytes', value: CURRENT_ANCHORS_HEX },
      ]),
      registrarVersion: 'current',
    },
    'version_selector_mismatch',
  ],
  ['null input', null, 'bad_input'],
  ['undefined input', undefined, 'bad_input'],
]

for (const [label, input, expectedCode] of malformedCases) {
  test(`malformed input returns a structured error: ${label}`, () => {
    let r
    assert.doesNotThrow(() => {
      r = decodeCall(input)
    }, `decodeCall must not throw for: ${label}`)
    assert.ok(r, 'a record is always returned')
    assert.notEqual(r.decode_status, 'ok')
    assert.ok(r.decode_error, 'decode_error is populated')
    assert.equal(r.decode_error.code, expectedCode)
    assert.equal(r.n13_decoded, 0)
    assert.equal(r.decoder_version, '1.0.0')
  })
}

test('a truncated RRSIG inside otherwise valid calldata is reported, not dropped', () => {
  const r = decodeCall({
    callId: 'm10',
    calldata: encodeCall(CURRENT_PROVE_AND_CLAIM, [
      { type: 'bytes', value: ETHLAB_NAME },
      { type: 'rrsets', value: [{ rrset: '0x0030080100', sig: '0x00' }] },
    ]),
    registrarVersion: 'current',
  })
  assert.equal(r.decode_status, 'malformed')
  assert.equal(r.decode_error.code, 'offset_out_of_bounds')
  assert.equal(r.proof_depth, 1, 'structural facts survive a later parse failure')
  assert.ok(r.proof_hash, 'proof hash is still emitted')
})

test('a DNS name with a length byte running off the end is reported', () => {
  // 0xC0 would be a compression pointer in a real DNS message; the oracle has
  // no message context and reads it as a 192-byte label.
  const r = decodeCall({
    callId: 'm11',
    calldata: encodeCall(CURRENT_PROVE_AND_CLAIM, [
      { type: 'bytes', value: ETHLAB_NAME },
      {
        type: 'rrsets',
        value: [{ rrset: '0x0030080100000e105cad5cd55c85830c0f0c00c0', sig: '0x00' }],
      },
    ]),
    registrarVersion: 'current',
  })
  assert.equal(r.decode_status, 'malformed')
  assert.equal(r.decode_error.code, 'name_runs_off_end')
})

// ── 7. Determinism and purity ───────────────────────────────────────────────

test('same input produces byte-identical output', () => {
  const call = {
    callId: 'test:determinism',
    calldata: ethlabCalldata(CURRENT_PROVE_AND_CLAIM),
    registrarVersion: 'current',
    now: ETHLAB_TIMESTAMP,
  }
  const a = JSON.stringify(decodeCall(call))
  for (let i = 0; i < 5; i++) {
    assert.equal(JSON.stringify(decodeCall(call)), a)
  }
})

test('proof_hash is stable, injective over field boundaries, and registrar-independent', () => {
  const h = proofHash(
    ETHLAB_CHAIN.map((r) => ({ rrset: hexToBytes(r.rrset), sig: hexToBytes(r.sig) })),
  )
  assert.match(h, /^0x[0-9a-f]{64}$/)

  const current = decodeCall({
    callId: 'a',
    calldata: ethlabCalldata(CURRENT_PROVE_AND_CLAIM),
    registrarVersion: 'current',
    now: ETHLAB_TIMESTAMP,
  })
  const legacy = decodeCall({
    callId: 'b',
    calldata: encodeCall(LEGACY_PROVE_AND_CLAIM, [
      { type: 'bytes', value: ETHLAB_NAME },
      { type: 'rrsets', value: ETHLAB_CHAIN },
      { type: 'bytes', value: CURRENT_ANCHORS_HEX },
    ]),
    registrarVersion: 'legacy',
    now: ETHLAB_TIMESTAMP,
  })
  assert.equal(current.proof_hash, h)
  assert.equal(legacy.proof_hash, h, 'the same chain hashes the same through either registrar')

  // Moving a byte across the rrset/sig boundary must change the hash.
  const shifted = proofHash([
    { rrset: Buffer.from([1, 2, 3]), sig: Buffer.from([4]) },
  ])
  const other = proofHash([{ rrset: Buffer.from([1, 2]), sig: Buffer.from([3, 4]) }])
  assert.notEqual(shifted, other)
})

test('decodeCall does not mutate its argument', () => {
  const call = Object.freeze({
    callId: 'test:frozen',
    calldata: ethlabCalldata(CURRENT_PROVE_AND_CLAIM),
    registrarVersion: 'current',
    now: ETHLAB_TIMESTAMP,
  })
  assert.doesNotThrow(() => decodeCall(call))
})

test('all four production selectors are recognised', () => {
  const expect = {
    [CURRENT_PROVE_AND_CLAIM]: 'current',
    [CURRENT_WITH_RESOLVER]: 'current',
    [LEGACY_PROVE_AND_CLAIM]: 'legacy',
    [LEGACY_WITH_RESOLVER]: 'legacy',
  }
  for (const [selector, version] of Object.entries(expect)) {
    const r = decodeCall({ callId: selector, calldata: selector, registrarVersion: version })
    // Truncated args, but the selector must resolve rather than be rejected.
    assert.notEqual(r.decode_error.code, 'unknown_selector', selector)
  }
})
