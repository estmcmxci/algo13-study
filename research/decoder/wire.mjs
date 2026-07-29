/**
 * DNS wire-format parsing mirroring `ens-contracts/contracts/dnssec-oracle/RRUtils.sol`.
 *
 * This reproduces the CONTRACT's semantics, not generic DNS semantics. In
 * particular:
 *   - names are never decompressed (the oracle has no message context, so a
 *     0xC0 pointer byte is simply a 192-byte label length and will run off the
 *     end of the buffer);
 *   - `nameLength` uses `assert(idx < self.length)`, a Solidity Panic;
 *   - the RRSIG header layout is fixed-offset with no validation of the
 *     remaining length beyond the bounds checks in BytesUtils.
 *
 * The legacy (`0x21745ff6…`) and current (`0x0fc31529…`) oracles ship byte-identical
 * implementations of every function used here. Verified by diffing
 * `deployments/mainnet/solcInputs/08371ea7…` and `40ce5451…` against
 * `contracts/dnssec-oracle/RRUtils.sol`: the only delta between the two legacy
 * revisions is that one calls the optimised `RRUtils.computeKeytag` and the
 * other an inline naive implementation of the same RFC 4034 Appendix B checksum.
 */
import { malformed } from './errors.mjs'
import { readUint8, readUint16, readUint32, substring } from './bytes.mjs'

export const TYPE_DS = 43
export const TYPE_DNSKEY = 48
export const CLASS_IN = 1
export const DNSKEY_FLAG_ZONEKEY = 0x100

/** `RRUtils.nameLength` */
export const nameLength = (self, offset) => {
  let idx = offset
  for (;;) {
    // assert(idx < self.length) -> Panic(0x01)
    if (idx >= self.length) {
      throw malformed('name_runs_off_end', 'DNS name runs past end of buffer', {
        offset,
        idx,
        length: self.length,
      })
    }
    const labelLen = self[idx]
    idx += labelLen + 1
    if (labelLen === 0) break
  }
  return idx - offset
}

/** `RRUtils.readName` */
export const readName = (self, offset) =>
  substring(self, offset, nameLength(self, offset), 'readName')

/** `RRUtils.labelCount` */
export const labelCount = (self, offset) => {
  let count = 0
  let off = offset
  for (;;) {
    if (off >= self.length) {
      throw malformed('name_runs_off_end', 'DNS name runs past end of buffer', {
        offset,
        idx: off,
        length: self.length,
      })
    }
    const labelLen = self[off]
    off += labelLen + 1
    if (labelLen === 0) break
    count += 1
  }
  return count
}

const RRSIG_SIGNER_NAME = 18

/** `RRUtils.readSignedSet` */
export const readSignedSet = (data) => {
  const self = {
    typeCovered: readUint16(data, 0, 'RRSIG.typeCovered'),
    algorithm: readUint8(data, 2, 'RRSIG.algorithm'),
    labels: readUint8(data, 3, 'RRSIG.labels'),
    ttl: readUint32(data, 4, 'RRSIG.ttl'),
    expiration: readUint32(data, 8, 'RRSIG.expiration'),
    inception: readUint32(data, 12, 'RRSIG.inception'),
    keytag: readUint16(data, 16, 'RRSIG.keytag'),
  }
  self.signerName = readName(data, RRSIG_SIGNER_NAME)
  self.data = substring(
    data,
    RRSIG_SIGNER_NAME + self.signerName.length,
    data.length - RRSIG_SIGNER_NAME - self.signerName.length,
    'RRSIG.data',
  )
  self.name = null
  return self
}

/**
 * `RRUtils.RRIterator`. Mutable, because `DNSSECImpl.verifyWithDS` rewinds one
 * by assigning `proof.nextOffset` and calling `next` — behaviour we must keep.
 */
export class RRIterator {
  constructor(data, offset) {
    this.data = data
    this.offset = 0
    this.dnstype = 0
    this.class = 0
    this.ttl = 0
    this.rdataOffset = 0
    this.nextOffset = offset
    this.next()
  }

  done() {
    return this.offset >= this.data.length
  }

  next() {
    this.offset = this.nextOffset
    if (this.offset >= this.data.length) return

    let off = this.offset + nameLength(this.data, this.offset)
    this.dnstype = readUint16(this.data, off, 'RR.type')
    off += 2
    this.class = readUint16(this.data, off, 'RR.class')
    off += 2
    this.ttl = readUint32(this.data, off, 'RR.ttl')
    off += 4
    const rdataLength = readUint16(this.data, off, 'RR.rdlength')
    off += 2
    this.rdataOffset = off
    this.nextOffset = off + rdataLength
  }

  name() {
    return substring(
      this.data,
      this.offset,
      nameLength(this.data, this.offset),
      'RR.name',
    )
  }

  rdata() {
    return substring(
      this.data,
      this.rdataOffset,
      this.nextOffset - this.rdataOffset,
      'RR.rdata',
    )
  }
}

/** `RRUtils.readDNSKEY` */
export const readDNSKEY = (data, offset, length) => ({
  flags: readUint16(data, offset + 0, 'DNSKEY.flags'),
  protocol: readUint8(data, offset + 2, 'DNSKEY.protocol'),
  algorithm: readUint8(data, offset + 3, 'DNSKEY.algorithm'),
  // `length - DNSKEY_PUBKEY` is checked arithmetic in Solidity: length < 4 panics.
  publicKey: substring(data, offset + 4, length - 4, 'DNSKEY.publicKey'),
})

/** `RRUtils.readDS` */
export const readDS = (data, offset, length) => ({
  keytag: readUint16(data, offset + 0, 'DS.keytag'),
  algorithm: readUint8(data, offset + 2, 'DS.algorithm'),
  digestType: readUint8(data, offset + 3, 'DS.digestType'),
  digest: substring(data, offset + 4, length - 4, 'DS.digest'),
})

/** `RRUtils.progress` */
const progress = (body, off) => off + 1 + readUint8(body, off, 'progress')

/**
 * `RRUtils.isSubdomainOf` — label-aligned suffix test, used by the CURRENT
 * oracle. Note this is strictly stricter than the legacy byte-suffix test.
 */
export const isSubdomainOf = (self, other) => {
  let off = 0
  let counts = labelCount(self, 0)
  const othercounts = labelCount(other, 0)
  while (counts > othercounts) {
    off = progress(self, off)
    counts--
  }
  // equals(self, off, other, 0): compares the two tails.
  if (off > self.length) {
    throw malformed('offset_out_of_bounds', 'isSubdomainOf offset past end', {
      off,
      length: self.length,
    })
  }
  return Buffer.compare(self.subarray(off), other) === 0
}

/**
 * `RRUtils.serialNumberGte` — RFC 1982 serial arithmetic.
 *
 *   unchecked { return int32(i1) - int32(i2) >= 0; }
 *
 * `x | 0` is JS ToInt32: it reinterprets the uint32 as signed and, applied to
 * the difference, reproduces Solidity's unchecked int32 wraparound exactly.
 */
export const serialNumberGte = (i1, i2) => (((i1 | 0) - (i2 | 0)) | 0) >= 0

/**
 * `RRUtils.computeKeytag` — RFC 4034 Appendix B.
 *
 * The current library uses a word-parallel implementation; the 40ce5451 legacy
 * revision uses the naive loop reproduced here. The library's own comment
 * documents the two as equivalent, and `test/decoder.test.mjs` asserts this
 * implementation reproduces the key tags recorded in the checked-in fixtures.
 */
export const computeKeytag = (data) => {
  if (data.length > 8192) {
    throw malformed('key_too_long', 'Long keys not permitted', { length: data.length })
  }
  let ac = 0
  for (let i = 0; i < data.length; i++) {
    ac += (i & 1) === 0 ? data[i] << 8 : data[i]
  }
  return (ac + (ac >>> 16)) & 0xffff
}
