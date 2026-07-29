/**
 * Paired-replay harness — shared primitives.
 *
 * SECRET HANDLING: the Alchemy fork URL is read at runtime from
 * `ens-contracts/.env` (key MAINNET_API_KEY). It embeds the API key and IS the
 * secret. It is never logged, never written to an output file, never echoed.
 * `redact()` is applied to anything that could carry it.
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

export const ROOT = path.resolve(import.meta.dirname, '../..')

// @noble/hashes is already vendored inside the read-only ens-contracts
// checkout. We IMPORT it (read-only); nothing is installed there.
const require_ = createRequire(path.join(ROOT, 'ens-contracts/package.json'))
const { keccak_256 } = require_('@noble/hashes/sha3')

export const keccak256 = (bytes) => `0x${Buffer.from(keccak_256(bytes)).toString('hex')}`

export const hexToBytes = (h) => Buffer.from(String(h).replace(/^0x/, ''), 'hex')
export const bytesToHex = (b) => `0x${Buffer.from(b).toString('hex')}`

// ── secrets ─────────────────────────────────────────────────────────────────

let FORK_URL = null

export const forkUrl = () => {
  if (FORK_URL) return FORK_URL
  const env = fs.readFileSync(path.join(ROOT, 'ens-contracts/.env'), 'utf8')
  const m = /^\s*MAINNET_API_KEY\s*=\s*["']?([^"'\r\n]+)["']?\s*$/m.exec(env)
  if (!m) throw new Error('MAINNET_API_KEY not found in ens-contracts/.env')
  FORK_URL = m[1].trim()
  return FORK_URL
}

/** Strip the fork URL (and anything URL-shaped) out of any string before it is shown. */
export const redact = (s) => {
  let out = String(s)
  if (FORK_URL) out = out.split(FORK_URL).join('<FORK_URL_REDACTED>')
  return out.replace(/https?:\/\/[^\s"']+/g, '<URL_REDACTED>')
}

// ── JSON-RPC ────────────────────────────────────────────────────────────────

export class Rpc {
  constructor(url) {
    this.url = url
    this.id = 0
    this.calls = 0
  }

  async send(method, params = []) {
    this.calls++
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++this.id, method, params }),
    })
    const j = await res.json()
    if (j.error) {
      const e = new Error(`${method}: ${redact(j.error.message)}`)
      e.rpcError = j.error
      throw e
    }
    return j.result
  }
}

// ── anvil ───────────────────────────────────────────────────────────────────

let PORT_SEQ = 19000

export class Anvil {
  constructor({ port = PORT_SEQ++, forkBlock, hardfork = 'osaka' }) {
    this.port = port
    this.forkBlock = forkBlock
    this.hardfork = hardfork
    this.proc = null
    this.rpc = new Rpc(`http://127.0.0.1:${port}`)
  }

  async start(attempts = 4) {
    for (let i = 1; ; i++) {
      try {
        return await this._start()
      } catch (e) {
        const rateLimited = /429|Max retries/i.test(e.message)
        if (i >= attempts) throw e
        const backoff = rateLimited ? 5000 * i : 1000 * i
        await this.stop()
        this.port = PORT_SEQ++
        this.rpc = new Rpc(`http://127.0.0.1:${this.port}`)
        await new Promise((r) => setTimeout(r, backoff))
      }
    }
  }

  async _start() {
    const args = [
      '--port', String(this.port),
      '--hardfork', this.hardfork,
      '--fork-url', forkUrl(),
      '--silent',
      '--code-size-limit', '100000',
    ]
    if (this.forkBlock !== undefined && this.forkBlock !== null) {
      args.push('--fork-block-number', String(this.forkBlock))
    }
    // anvil's own output is captured to a temp file so start-up failures are
    // diagnosable. It is ALWAYS passed through redact() before being surfaced,
    // because anvil echoes the fork URL in its banner.
    this.logPath = `/tmp/anvil-${this.port}.log`
    const fd = fs.openSync(this.logPath, 'w')
    this.proc = spawn('anvil', args, { stdio: ['ignore', fd, fd] })
    this.proc.on('error', () => {})
    let exited = null
    this.proc.on('exit', (code, sig) => { exited = `exit=${code} signal=${sig}` })
    const deadline = Date.now() + 120_000
    for (;;) {
      try {
        await this.rpc.send('web3_clientVersion')
        return this
      } catch {
        if (exited !== null || Date.now() > deadline) {
          let tail = ''
          try { tail = redact(fs.readFileSync(this.logPath, 'utf8')).slice(-600) } catch {}
          throw new Error(
            `anvil not ready on port ${this.port} (forkBlock=${this.forkBlock ?? 'head'}) ` +
            `after ${((Date.now() - (deadline - 120_000)) / 1000).toFixed(1)}s; ` +
            `process ${exited ?? 'still alive'}; anvil output tail: ${tail}`,
          )
        }
        await new Promise((r) => setTimeout(r, 250))
      }
    }
  }

  async stop() {
    if (!this.proc) return
    this.proc.kill('SIGKILL')
    this.proc = null
    await new Promise((r) => setTimeout(r, 120))
  }
}

// ── ABI ─────────────────────────────────────────────────────────────────────

const WORD = 32
const word = (n) => {
  const b = Buffer.alloc(WORD)
  let v = BigInt(n)
  for (let i = WORD - 1; i >= 0 && v > 0n; i--) {
    b[i] = Number(v & 0xffn)
    v >>= 8n
  }
  return b
}
const pad = (b) => (b.length % WORD === 0 ? b : Buffer.concat([b, Buffer.alloc(WORD - (b.length % WORD))]))
const encBytes = (b) => Buffer.concat([word(b.length), pad(b)])

const encRRSets = (items) => {
  const bodies = items.map(({ rrset, sig }) => {
    const a = encBytes(rrset)
    const b = encBytes(sig)
    return Buffer.concat([word(2 * WORD), word(2 * WORD + a.length), a, b])
  })
  const heads = []
  let cursor = items.length * WORD
  for (const body of bodies) {
    heads.push(word(cursor))
    cursor += body.length
  }
  return Buffer.concat([word(items.length), ...heads, ...bodies])
}

/** Selectors derived with `cast sig` and asserted in the battery. */
export const SELECTORS = {
  // current DNSSECImpl
  verifyRRSet: '0x440f3d42', // verifyRRSet((bytes,bytes)[],uint256)
  // legacy DNSSECImpl
  submitRRSets: '0x435cc162', // submitRRSets((bytes,bytes)[],bytes)
  algorithms: '0xc327deef', // algorithms(uint8)
  anchors: '0x98d35f20', // anchors()
}

/** current oracle: verifyRRSet(input, now) */
export const encodeVerifyRRSet = (input, now) => {
  const arr = encRRSets(input)
  return bytesToHex(
    Buffer.concat([hexToBytes(SELECTORS.verifyRRSet), word(2 * WORD), word(now), arr]),
  )
}

/** legacy oracle: submitRRSets(input, proof) */
export const encodeSubmitRRSets = (input, proof) => {
  const arr = encRRSets(input)
  const head = Buffer.concat([word(2 * WORD), word(2 * WORD + arr.length)])
  return bytesToHex(
    Buffer.concat([hexToBytes(SELECTORS.submitRRSets), head, arr, encBytes(proof)]),
  )
}

export const encodeAlgorithms = (id) =>
  bytesToHex(Buffer.concat([hexToBytes(SELECTORS.algorithms), word(id)]))

/** EIP-2028 intrinsic cost of a transaction carrying `data`. */
export const intrinsicGas = (dataHex) => {
  const b = hexToBytes(dataHex)
  let zeros = 0
  for (const x of b) if (x === 0) zeros++
  return 21000 + 4 * zeros + 16 * (b.length - zeros)
}

// ── pinned bytecode ─────────────────────────────────────────────────────────

export const loadPins = () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'research/manifests/bytecode-pins.json'), 'utf8'),
  )
  const byRole = {}
  for (const a of manifest.artifacts) {
    const raw = fs.readFileSync(path.join(ROOT, a.rawFile), 'utf8').trim()
    const code = raw.startsWith('0x') ? raw : `0x${raw}`
    const got = keccak256(hexToBytes(code))
    if (got.toLowerCase() !== a.runtimeBytecodeKeccak256.toLowerCase()) {
      throw new Error(
        `PIN MISMATCH for ${a.role}: file hashes ${got}, manifest says ${a.runtimeBytecodeKeccak256}`,
      )
    }
    byRole[a.role] = { ...a, code }
  }
  return { manifest, byRole }
}

/** A minimal runtime that returns block.timestamp — used to prove the harness clock. */
export const TIMESTAMP_PROBE_CODE = '0x4260005260206000f3'
