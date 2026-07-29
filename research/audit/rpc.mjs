/**
 * Audit RPC helper.
 *
 * SECRET HANDLING — hardened after a leak. The endpoint URL embeds the API key.
 *  - the variable is NEVER named `URL` (shadowing the global breaks fetch, and
 *    node's resulting TypeError embeds the URL verbatim in its message);
 *  - every error is scrubbed before it can propagate to a console or a file.
 */
import fs from 'node:fs'
import path from 'node:path'

export const ROOT = path.resolve(import.meta.dirname, '../..')

let endpoint = null
const getEndpoint = () => {
  if (endpoint) return endpoint
  const env = fs.readFileSync(path.join(ROOT, 'ens-contracts/.env'), 'utf8')
  const m = /^\s*MAINNET_API_KEY\s*=\s*["']?([^"'\r\n]+)["']?\s*$/m.exec(env)
  if (!m) throw new Error('MAINNET_API_KEY not found in ens-contracts/.env')
  endpoint = m[1].trim()
  return endpoint
}

export const scrub = (s) => {
  let out = String(s)
  if (endpoint) out = out.split(endpoint).join('<ENDPOINT_REDACTED>')
  return out.replace(/https?:\/\/[^\s"')]+/g, '<URL_REDACTED>')
}

let n = 0
export const rpcCallCount = () => n

export const rpc = async (method, params = []) => {
  n++
  try {
    const res = await fetch(getEndpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: n, method, params }),
    })
    const j = await res.json()
    if (j.error) throw new Error(`${method} rpc error: ${j.error.message}`)
    return j.result
  } catch (e) {
    throw new Error(scrub(e.message))
  }
}

export const hexNum = (x) => `0x${Number(x).toString(16)}`
