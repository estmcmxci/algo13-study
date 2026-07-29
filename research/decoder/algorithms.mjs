/**
 * Signature-verification and digest layer.
 *
 * WHY REAL CRYPTO: whether `Algorithm.verify` returns true or false is not
 * cosmetic — it decides whether `verifyWithKnownKey` / `verifyWithDS` stop or
 * advance to the next candidate key, and therefore changes the dispatch count.
 * Assuming "the first key that passes the pre-checks wins" would make the
 * decoder agree with the traces by construction, which defeats its purpose as
 * an independent check. So we actually verify, using `node:crypto` (a Node
 * builtin — no new dependency).
 *
 * Key parsing mirrors the contract exactly:
 *   - RSA (algs 5, 7, 8): `RSASHA1Algorithm` / `RSASHA256Algorithm`, RFC 3110
 *     exponent-length encoding read from the DNSKEY RDATA at offset 4.
 *   - P-256 (alg 13): `P256SHA256Algorithm`, qx = key[4:36], qy = key[36:68],
 *     signature = r||s, 64 bytes.
 *
 * Divergence risk, stated plainly: the contract's `RSAPKCS1Verify` is a
 * hand-rolled PKCS#1 v1.5 check and is not guaranteed byte-identical to
 * OpenSSL's for pathological encodings (this is exactly what
 * `TestRSAForgedSignature.test.ts` exists to pin down). A divergence would have
 * to occur on a key that already matched the signer name, algorithm, key tag
 * and zone flag to change any count. Each dispatch records the engine used so
 * any trace/decoder mismatch can be traced back to this boundary.
 */
import crypto from 'node:crypto'
import { readUint8, readUint16, substring } from './bytes.mjs'
import { unsupported } from './errors.mjs'

const b64u = (buf) => Buffer.from(buf).toString('base64url')

/** RFC 3110 key split, byte-for-byte as `RSASHA*Algorithm.verify` does it. */
const splitRsaKey = (key) => {
  let exponentLen = readUint8(key, 4, 'RSA.exponentLen')
  let exponent
  let modulus
  if (exponentLen !== 0) {
    exponent = substring(key, 5, exponentLen, 'RSA.exponent')
    modulus = substring(key, exponentLen + 5, key.length - exponentLen - 5, 'RSA.modulus')
  } else {
    exponentLen = readUint16(key, 5, 'RSA.exponentLen16')
    exponent = substring(key, 7, exponentLen, 'RSA.exponent')
    modulus = substring(key, exponentLen + 7, key.length - exponentLen - 7, 'RSA.modulus')
  }
  return { exponent, modulus }
}

const stripLeadingZeros = (b) => {
  let i = 0
  while (i < b.length - 1 && b[i] === 0) i++
  return b.subarray(i)
}

const verifyRsa = (hashAlg, key, data, sig) => {
  const { exponent, modulus } = splitRsaKey(key)
  if (modulus.length === 0 || exponent.length === 0) return false
  const pub = crypto.createPublicKey({
    key: {
      kty: 'RSA',
      n: b64u(stripLeadingZeros(modulus)),
      e: b64u(stripLeadingZeros(exponent)),
    },
    format: 'jwk',
  })
  return crypto.verify(
    hashAlg,
    data,
    { key: pub, padding: crypto.constants.RSA_PKCS1_PADDING },
    sig,
  )
}

const verifyP256 = (key, data, sig) => {
  // `P256SHA256Algorithm` requires these lengths and REVERTS otherwise. The
  // caller decides what a revert means for the path; here we only report it.
  if (sig.length !== 64) {
    return { ok: false, revert: 'Invalid p256 signature length' }
  }
  if (key.length !== 68) {
    return { ok: false, revert: 'Invalid p256 key length' }
  }
  const pub = crypto.createPublicKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: b64u(key.subarray(4, 36)),
      y: b64u(key.subarray(36, 68)),
    },
    format: 'jwk',
  })
  const ok = crypto.verify(
    'sha256',
    data,
    { key: pub, dsaEncoding: 'ieee-p1363' },
    sig,
  )
  return { ok, revert: null }
}

/**
 * Algorithm IDs the decoder can evaluate. Anything outside this set that is
 * actually reached is reported as `unsupported` rather than guessed at.
 */
export const SUPPORTED_ALGORITHMS = new Set([5, 7, 8, 13])

/**
 * @returns {{ok: boolean, revert: string|null, engine: string}}
 */
export const verifySignature = (algorithm, key, data, sig) => {
  try {
    switch (algorithm) {
      case 5:
      case 7:
        return { ok: verifyRsa('sha1', key, data, sig), revert: null, engine: 'node:rsa-sha1' }
      case 8:
        return {
          ok: verifyRsa('sha256', key, data, sig),
          revert: null,
          engine: 'node:rsa-sha256',
        }
      case 13: {
        const r = verifyP256(key, data, sig)
        return { ...r, engine: 'node:ecdsa-p256-sha256' }
      }
      default:
        throw unsupported(
          'unsupported_algorithm',
          `no decoder model for DNSSEC algorithm ${algorithm}`,
          { algorithm },
        )
    }
  } catch (e) {
    if (e.name === 'DecodeError') throw e
    // A malformed key that OpenSSL rejects is a verification failure, not a
    // decoder failure — the contract would call the verifier and get false back.
    return { ok: false, revert: null, engine: 'node:error', cryptoError: String(e.message) }
  }
}

/**
 * `SHA1Digest` / `SHA256Digest`, reached through `DNSSECImpl.verifyDSHash`.
 * Both contracts REQUIRE an exact hash length and revert otherwise:
 *   SHA1Digest:   require(hash.length == 20, "Invalid sha1 hash length")
 *   SHA256Digest: require(hash.length == 32, "Invalid sha256 hash length")
 *
 * @returns {{ok: boolean, revert: string|null}}
 */
export const DIGESTS = { 1: { alg: 'sha1', len: 20 }, 2: { alg: 'sha256', len: 32 } }

export const verifyDigest = (digestType, data, expected) => {
  const d = DIGESTS[digestType]
  // `verifyDSHash` returns false when `digests[digesttype] == address(0)`.
  if (!d) return { ok: false, revert: null }
  if (expected.length !== d.len) {
    return { ok: false, revert: `Invalid ${d.alg} hash length` }
  }
  const got = crypto.createHash(d.alg).update(data).digest()
  return { ok: crypto.timingSafeEqual(got, expected), revert: null }
}
