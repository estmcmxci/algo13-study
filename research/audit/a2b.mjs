import fs from 'node:fs'
import path from 'node:path'
import { ROOT, rpc, scrub, hexNum } from './rpc.mjs'

const T = [
  '0x87db02a0e483e2818060eddcbb3488ce44e35aff49a70d92c2aa6c8046cf01e2',
  '0xa2e66ce20e6fb2c4f61339c364ad79f15160cf5307230c8bc4d628adbca2ba39',
]
const CUTOFF = 25627360
const LEGACY = '0x58774bb8acd458a640af0b88238369a167546ef2'
const CURRENT = '0xb32cb5677a7c971689228ec835800432b339ba2b'

const main = async () => {
  console.log('stated cutoff', CUTOFF, '=', hexNum(CUTOFF))

  const at = [
    ...(await rpc('eth_getLogs', [{ address: LEGACY, topics: [T], fromBlock: hexNum(13000000), toBlock: hexNum(CUTOFF) }])),
    ...(await rpc('eth_getLogs', [{ address: CURRENT, topics: [T], fromBlock: hexNum(19000000), toBlock: hexNum(CUTOFF) }])),
  ].filter((l) => !l.removed)
  console.log('Claim logs at/below cutoff:', at.length, 'distinct txs:', new Set(at.map((l) => l.transactionHash)).size)

  const head = Number(await rpc('eth_blockNumber', []))
  const all = [
    ...(await rpc('eth_getLogs', [{ address: LEGACY, topics: [T], fromBlock: hexNum(13000000), toBlock: 'latest' }])),
    ...(await rpc('eth_getLogs', [{ address: CURRENT, topics: [T], fromBlock: hexNum(19000000), toBlock: 'latest' }])),
  ].filter((l) => !l.removed)
  console.log('current head block:', head)
  console.log('Claim logs to HEAD:', all.length)
  const beyond = all.filter((l) => Number(l.blockNumber) > CUTOFF)
  console.log('claims BEYOND stated cutoff:', beyond.length, JSON.stringify(beyond.map((l) => ({ tx: l.transactionHash, block: Number(l.blockNumber) }))))

  const c3 = JSON.parse(fs.readFileSync(path.join(ROOT, 'research/derived/c3-imported-names.json'), 'utf8'))
  console.log('c3 rows total:', c3.length)
  console.log('c3 rows at/below cutoff:', c3.filter((r) => r.block <= CUTOFF).length)
  console.log('c3 rows beyond cutoff:', JSON.stringify(c3.filter((r) => r.block > CUTOFF)))
}

main().catch((e) => {
  console.error('FAILED:', scrub(e.message))
  process.exit(1)
})
