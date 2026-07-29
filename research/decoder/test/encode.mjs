/**
 * Test-only ABI ENCODER. Lets the tests build real `proveAndClaim` /
 * `proveAndClaimWithResolver` calldata from the checked-in fixture RRSets, so
 * the decoder is exercised end-to-end from calldata rather than from
 * pre-parsed structures.
 *
 * This is intentionally an independent implementation from `abi.mjs` — encoding
 * here and decoding there is a round-trip check on both.
 */
const WORD = 32

const hex = (h) => Buffer.from(h.replace(/^0x/, ''), 'hex')

const word = (n) => {
  const b = Buffer.alloc(WORD)
  b.writeUInt32BE(Number(n), WORD - 4)
  return b
}

const pad = (b) => {
  const rem = b.length % WORD
  return rem === 0 ? b : Buffer.concat([b, Buffer.alloc(WORD - rem)])
}

/** dynamic `bytes`: length word + right-padded data */
const encBytes = (b) => Buffer.concat([word(b.length), pad(b)])

/** `(bytes,bytes)` — a dynamic tuple: two head offsets then the two payloads */
const encTuple = ({ rrset, sig }) => {
  const a = encBytes(hex(rrset))
  const b = encBytes(hex(sig))
  const head = Buffer.concat([word(2 * WORD), word(2 * WORD + a.length)])
  return Buffer.concat([head, a, b])
}

/** `(bytes,bytes)[]` */
const encRRSets = (items) => {
  const bodies = items.map(encTuple)
  const heads = []
  let cursor = items.length * WORD
  for (const body of bodies) {
    heads.push(word(cursor))
    cursor += body.length
  }
  return Buffer.concat([word(items.length), ...heads, ...bodies])
}

const encAddress = (addr) => {
  const b = Buffer.alloc(WORD)
  hex(addr).copy(b, WORD - 20)
  return b
}

/**
 * @param {string} selector 0x-prefixed 4-byte selector
 * @param {Array<{type:'bytes'|'rrsets'|'address', value:any}>} args
 */
export const encodeCall = (selector, args) => {
  const heads = []
  const tails = []
  let tailOffset = args.length * WORD

  for (const arg of args) {
    if (arg.type === 'address') {
      heads.push(encAddress(arg.value))
      continue
    }
    const body = arg.type === 'rrsets' ? encRRSets(arg.value) : encBytes(hex(arg.value))
    heads.push(word(tailOffset))
    tails.push(body)
    tailOffset += body.length
  }

  return `0x${Buffer.concat([hex(selector), ...heads, ...tails]).toString('hex')}`
}

/**
 * Re-serialise a DNSKEY record as a wire-format RR usable as an oracle proof.
 * The RDATA passed in is the fixture's, unmodified; only the owner name, type,
 * class, TTL and RDLENGTH wrapper are added, taken from the fixture's own
 * comment line.
 */
export const encodeDnskeyRR = ({ owner, ttl, rdataHex }) => {
  const labels = owner.replace(/\.$/, '').split('.').filter(Boolean)
  const name = Buffer.concat([
    ...labels.map((l) => Buffer.concat([Buffer.from([l.length]), Buffer.from(l, 'ascii')])),
    Buffer.from([0]),
  ])
  const rdata = hex(rdataHex)
  const header = Buffer.alloc(10)
  header.writeUInt16BE(48, 0) // TYPE = DNSKEY
  header.writeUInt16BE(1, 2) // CLASS = IN
  header.writeUInt32BE(ttl, 4)
  header.writeUInt16BE(rdata.length, 8)
  return `0x${Buffer.concat([name, header, rdata]).toString('hex')}`
}
