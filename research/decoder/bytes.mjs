/**
 * Byte primitives mirroring `ens-contracts/contracts/utils/BytesUtils.sol`.
 *
 * The contract bounds-checks every read:
 *
 *   function _checkBound(bytes memory v, uint256 end) internal pure {
 *       if (end > v.length) revert OffsetOutOfBoundsError(end, v.length);
 *   }
 *
 * so an out-of-range read is a revert, not a zero-fill. We reproduce that as a
 * `malformed` DecodeError rather than reading past the end.
 */
import { malformed } from './errors.mjs'

const checkBound = (v, end, what) => {
  if (end > v.length) {
    throw malformed('offset_out_of_bounds', `read past end of buffer in ${what}`, {
      end,
      length: v.length,
    })
  }
}

export const readUint8 = (v, off, what = 'readUint8') => {
  checkBound(v, off + 1, what)
  return v[off]
}

export const readUint16 = (v, off, what = 'readUint16') => {
  checkBound(v, off + 2, what)
  return (v[off] << 8) | v[off + 1]
}

export const readUint32 = (v, off, what = 'readUint32') => {
  checkBound(v, off + 4, what)
  // >>> 0 keeps this an unsigned 32-bit value.
  return ((v[off] << 24) | (v[off + 1] << 16) | (v[off + 2] << 8) | v[off + 3]) >>> 0
}

/**
 * `BytesUtils.substring`. The contract computes `len` with checked arithmetic,
 * so a negative length is a Solidity Panic (underflow) and a length running off
 * the end is caught by `copyBytes`.
 */
export const substring = (v, off, len, what = 'substring') => {
  if (len < 0) {
    throw malformed('length_underflow', `negative length in ${what}`, { off, len })
  }
  checkBound(v, off + len, what)
  return v.subarray(off, off + len)
}

export const bytesEqual = (a, b) => Buffer.compare(a, b) === 0

/** `equals(bytes vA, uint offA, bytes vB, uint offB)` — compares the two tails. */
export const tailsEqual = (a, offA, b, offB, what = 'equals') => {
  checkBound(a, offA, what)
  checkBound(b, offB, what)
  return bytesEqual(a.subarray(offA), b.subarray(offB))
}

/** `equals(bytes vA, uint offA, bytes vB, uint offB, uint len)`. */
export const rangesEqual = (a, offA, b, offB, len, what = 'equals') => {
  checkBound(a, offA + len, what)
  checkBound(b, offB + len, what)
  return bytesEqual(a.subarray(offA, offA + len), b.subarray(offB, offB + len))
}

export const hexToBytes = (hex, what = 'input') => {
  if (typeof hex !== 'string') {
    throw malformed('not_hex', `${what} is not a string`, { type: typeof hex })
  }
  const body = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex
  if (body.length % 2 !== 0) {
    throw malformed('odd_hex_length', `${what} has an odd number of hex digits`, {
      length: body.length,
    })
  }
  if (body.length > 0 && !/^[0-9a-fA-F]+$/.test(body)) {
    throw malformed('non_hex_characters', `${what} contains non-hex characters`)
  }
  return Buffer.from(body, 'hex')
}

export const bytesToHex = (b) => `0x${Buffer.from(b).toString('hex')}`
