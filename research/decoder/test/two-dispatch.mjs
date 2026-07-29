/**
 * CONSTRUCTED VECTOR — not from production data, not from a checked-in fixture.
 *
 * This builds the one path the ens-contracts fixtures do not cover and that no
 * call in the 2,127-call census exercises: TWO algorithm-13 verifier dispatches
 * at a SINGLE proof depth, via the CURRENT oracle's `verifyWithDS` rewind.
 *
 *   DNSSECImpl.sol:314-339
 *     for (iter over rrset.rrs()) {
 *         if (verifySignatureWithKey(...)) {         <-- dispatch
 *             if (verifyKeyWithDS(...)) return;      <-- fails here
 *             proof.nextOffset = proofOffset;        <-- REWIND
 *             proof.next();
 *         }                                          <-- loop advances -> dispatch again
 *     }
 *
 * To reach the rewind, the first key must genuinely VERIFY (otherwise the
 * branch is never taken and the loop advances for the ordinary reason). No
 * checked-in fixture has a signature over a DNSKEY RRset, and the RFC 6605
 * private key is not published, so the signature here has to be generated. That
 * is why this vector is constructed. Everything structural — the DNSKEY RDATA
 * layout, the RRSIG header layout, the key-tag arithmetic — is the real thing.
 *
 * Construction:
 *   key A  a P-256 key generated here; its DNSKEY RDATA has key tag T
 *   key B  key A's RDATA with two even-offset public-key bytes shifted by
 *          equal and opposite amounts, which by construction leaves the RFC 4034
 *          Appendix B checksum unchanged -> key tag is also T
 *   rrset  RRSIG(typeCovered=DNSKEY, alg=13, keytag=T, signer=example.net.)
 *          over [DNSKEY A, DNSKEY B], signed with key A's private key
 *   proof  a DS RRset for example.net. whose key tag is deliberately NOT T, so
 *          `verifyKeyWithDS` runs to completion and returns false
 *
 * Expected: A dispatches and verifies -> DS lookup fails -> rewind -> B
 * dispatches (and fails, being a corrupted curve point) -> NoMatchingProof.
 * n13 = 2 at depth 0.
 */
import crypto from 'node:crypto'
import { computeKeytag } from '../wire.mjs'

const DNSKEY_FLAGS_ZSK_SEP = 0x0101
const ALG_P256 = 13

/** `example.net.` in DNS label-sequence form */
export const EXAMPLE_NET = Buffer.from('076578616d706c65036e657400', 'hex')

const rr = (owner, type, ttl, rdata) => {
  const head = Buffer.alloc(10)
  head.writeUInt16BE(type, 0)
  head.writeUInt16BE(1, 2) // CLASS IN
  head.writeUInt32BE(ttl, 4)
  head.writeUInt16BE(rdata.length, 8)
  return Buffer.concat([owner, head, rdata])
}

const dnskeyRdata = (rawPublicKey) =>
  Buffer.concat([
    Buffer.from([DNSKEY_FLAGS_ZSK_SEP >> 8, DNSKEY_FLAGS_ZSK_SEP & 0xff, 3, ALG_P256]),
    rawPublicKey,
  ])

/**
 * Produce a distinct DNSKEY RDATA with an identical key tag.
 *
 * `computeKeytag` accumulates `data[i] << 8` at even i and `data[i]` at odd i,
 * so adding +d at one even offset and -d at another even offset is exactly
 * checksum-neutral. Offsets 8 and 40 sit inside the 64-byte public key, so the
 * flags/protocol/algorithm header is untouched and the record stays a
 * well-formed algorithm-13 zone key.
 */
const collidingVariant = (rdata) => {
  const b = Buffer.from(rdata)
  const i = 8
  const j = 40
  // A byte must not wrap: wrapping carries into the neighbouring 16-bit
  // accumulator lane and would change the tag rather than preserve it.
  if (b[i] < 0xff && b[j] > 0x00) {
    b[i] += 1
    b[j] -= 1
  } else if (b[i] > 0x00 && b[j] < 0xff) {
    b[i] -= 1
    b[j] += 1
  } else {
    return null // unusable key material; caller regenerates
  }
  return b
}

/** raw 64-byte (x||y) public key from a node EC KeyObject */
const rawPublicKey = (publicKey) => {
  const jwk = publicKey.export({ format: 'jwk' })
  return Buffer.concat([
    Buffer.from(jwk.x, 'base64url'),
    Buffer.from(jwk.y, 'base64url'),
  ])
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.dsMatches] make the DS record match key A's tag, so
 *        `verifyKeyWithDS` succeeds and the rewind is NOT taken (control case)
 * @returns {{rrset: string, sig: string, proof: string, keytag: number}}
 */
export const buildTwoDispatchVector = ({ dsMatches = false } = {}) => {
  let keyA
  let rdataA
  let rdataB
  let keytag

  // Regenerate until the two variants really do collide and really do differ.
  // The arithmetic above guarantees it, but assert rather than assume.
  for (let attempt = 0; ; attempt++) {
    keyA = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    rdataA = dnskeyRdata(rawPublicKey(keyA.publicKey))
    rdataB = collidingVariant(rdataA)
    keytag = computeKeytag(rdataA)
    if (rdataB && computeKeytag(rdataB) === keytag && Buffer.compare(rdataA, rdataB) !== 0) break
    if (attempt > 100) throw new Error('could not build a key-tag collision')
  }

  const rrsA = rr(EXAMPLE_NET, 48, 3600, rdataA)
  const rrsB = rr(EXAMPLE_NET, 48, 3600, rdataB)

  const header = Buffer.alloc(18)
  header.writeUInt16BE(48, 0) // type covered = DNSKEY
  header.writeUInt8(ALG_P256, 2)
  header.writeUInt8(2, 3) // labels: example.net. = 2
  header.writeUInt32BE(3600, 4) // original TTL
  header.writeUInt32BE(0x7fffffff, 8) // expiration, far future
  header.writeUInt32BE(0x00000001, 12) // inception, far past
  header.writeUInt16BE(keytag, 16)

  const rrset = Buffer.concat([header, EXAMPLE_NET, rrsA, rrsB])

  const sig = crypto.sign('sha256', rrset, {
    key: keyA.privateKey,
    dsaEncoding: 'ieee-p1363',
  })

  // DS RRset acting as the proof. digestType 2 (SHA-256), 32-byte digest.
  const dsKeytag = dsMatches ? keytag : (keytag ^ 0x5555) & 0xffff
  const digest = dsMatches
    ? crypto.createHash('sha256').update(Buffer.concat([EXAMPLE_NET, rdataA])).digest()
    : Buffer.alloc(32, 0xab)
  const dsRdata = Buffer.concat([
    Buffer.from([dsKeytag >> 8, dsKeytag & 0xff, ALG_P256, 2]),
    digest,
  ])
  const proof = rr(EXAMPLE_NET, 43, 3600, dsRdata)

  return {
    rrset: `0x${rrset.toString('hex')}`,
    sig: `0x${sig.toString('hex')}`,
    proof: `0x${proof.toString('hex')}`,
    keytag,
  }
}
