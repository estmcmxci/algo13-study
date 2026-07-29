/**
 * Minimal, hand-rolled ABI decoder for the four direct-import entry points.
 * No dependency on viem/ethers — this file must stay readable enough that a
 * reviewer can check it against the ABI spec directly.
 *
 * Selectors are pinned constants, cross-checked against the work order and
 * re-derived independently in `output/checkpoint-1-readiness.md` §3.4.
 */
import { malformed } from './errors.mjs'

export const FUNCTIONS = {
  '0x29d56630': {
    version: 'current',
    signature: 'proveAndClaim(bytes,(bytes,bytes)[])',
    layout: ['bytes', 'rrsets'],
  },
  '0x06963218': {
    version: 'current',
    signature: 'proveAndClaimWithResolver(bytes,(bytes,bytes)[],address,address)',
    layout: ['bytes', 'rrsets', 'address', 'address'],
  },
  '0x8bbedf75': {
    version: 'legacy',
    signature: 'proveAndClaim(bytes,(bytes,bytes)[],bytes)',
    layout: ['bytes', 'rrsets', 'bytes'],
  },
  '0x224199c2': {
    version: 'legacy',
    signature: 'proveAndClaimWithResolver(bytes,(bytes,bytes)[],bytes,address,address)',
    layout: ['bytes', 'rrsets', 'bytes', 'address', 'address'],
  },
}

const WORD = 32
// Offsets are ABI-encoded as uint256 but any real offset fits in a safe integer.
const MAX_OFFSET = 0x7fffffff

const readWord = (data, off, what) => {
  if (off + WORD > data.length) {
    throw malformed('calldata_truncated', `calldata truncated reading ${what}`, {
      need: off + WORD,
      length: data.length,
    })
  }
  let hi = 0n
  for (let i = 0; i < WORD; i++) hi = (hi << 8n) | BigInt(data[off + i])
  return hi
}

const readOffset = (data, off, what) => {
  const v = readWord(data, off, what)
  if (v > BigInt(MAX_OFFSET)) {
    throw malformed('offset_too_large', `implausible ABI offset in ${what}`, {
      value: v.toString(),
    })
  }
  return Number(v)
}

/** dynamic `bytes` living at absolute offset `at` in the args region */
const readBytes = (data, at, what) => {
  const len = readOffset(data, at, `${what} length`)
  const start = at + WORD
  if (start + len > data.length) {
    throw malformed('calldata_truncated', `calldata truncated reading ${what}`, {
      need: start + len,
      length: data.length,
    })
  }
  return data.subarray(start, start + len)
}

/** `(bytes,bytes)[]` — an array of dynamic tuples */
const readRRSets = (data, at, base) => {
  const count = readOffset(data, at, 'RRSetWithSignature[] length')
  const arrayBase = at + WORD
  // Each element needs at least a head word here; reject absurd counts early
  // rather than allocating.
  if (arrayBase + count * WORD > data.length) {
    throw malformed('calldata_truncated', 'calldata truncated reading RRSetWithSignature[]', {
      count,
      length: data.length,
    })
  }
  const out = []
  for (let i = 0; i < count; i++) {
    const elemOff = arrayBase + readOffset(data, arrayBase + i * WORD, `rrset[${i}] offset`)
    const rrsetOff = elemOff + readOffset(data, elemOff, `rrset[${i}].rrset offset`)
    const sigOff = elemOff + readOffset(data, elemOff + WORD, `rrset[${i}].sig offset`)
    out.push({
      rrset: readBytes(data, rrsetOff, `rrset[${i}].rrset`),
      sig: readBytes(data, sigOff, `rrset[${i}].sig`),
    })
  }
  void base
  return out
}

/**
 * @param {Buffer} calldata full calldata including the 4-byte selector
 * @returns {{selector, signature, version, name, input, legacyProof}}
 */
export const decodeCalldata = (calldata) => {
  if (calldata.length < 4) {
    throw malformed('no_selector', 'calldata shorter than a function selector', {
      length: calldata.length,
    })
  }
  const selector = `0x${Buffer.from(calldata.subarray(0, 4)).toString('hex')}`
  const fn = FUNCTIONS[selector]
  if (!fn) {
    throw malformed('unknown_selector', 'selector is not a direct-import entry point', {
      selector,
    })
  }

  const args = calldata.subarray(4)
  const decoded = { name: null, input: null, legacyProof: null }
  let byteArgIndex = 0

  fn.layout.forEach((kind, i) => {
    const head = i * WORD
    if (kind === 'address') return
    const at = readOffset(args, head, `arg ${i} offset`)
    if (kind === 'rrsets') {
      decoded.input = readRRSets(args, at, 0)
    } else {
      const value = readBytes(args, at, `arg ${i}`)
      // In both legacy signatures the first `bytes` is the DNS name and the
      // second is the initial proof passed on to `submitRRSets`.
      if (byteArgIndex === 0) decoded.name = value
      else decoded.legacyProof = value
      byteArgIndex++
    }
  })

  if (decoded.input === null) {
    throw malformed('missing_rrsets', 'no RRSetWithSignature[] argument decoded', { selector })
  }

  return { selector, signature: fn.signature, version: fn.version, ...decoded }
}
