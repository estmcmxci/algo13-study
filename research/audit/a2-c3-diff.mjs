import fs from 'node:fs'
import path from 'node:path'
import { ROOT, rpc, scrub } from './rpc.mjs'

const T = [
  '0x87db02a0e483e2818060eddcbb3488ce44e35aff49a70d92c2aa6c8046cf01e2',
  '0xa2e66ce20e6fb2c4f61339c364ad79f15160cf5307230c8bc4d628adbca2ba39',
]
const main = async () => {
  const L = await rpc('eth_getLogs', [{ address: '0x58774bb8acd458a640af0b88238369a167546ef2', topics: [T], fromBlock: '0xc65d40', toBlock: '0x186e6c0' }])
  const C = await rpc('eth_getLogs', [{ address: '0xb32cb5677a7c971689228ec835800432b339ba2b', topics: [T], fromBlock: '0x1211a40', toBlock: '0x186e6c0' }])
  const logs = [...L, ...C].filter((l) => !l.removed)
  const mine = new Set(logs.map((l) => l.transactionHash.toLowerCase()))
  const c3 = JSON.parse(fs.readFileSync(path.join(ROOT, 'research/derived/c3-imported-names.json'), 'utf8'))
  const c3tx = new Set(c3.map((r) => r.tx.toLowerCase()))
  const extra = [...c3tx].filter((t) => !mine.has(t))
  const missing = [...mine].filter((t) => !c3tx.has(t))
  console.log('my Claim logs:', logs.length, ' distinct txs:', mine.size)
  console.log('c3 rows:', c3.length, ' distinct txs:', c3tx.size)
  console.log('IN c3 BUT NOT A CLAIM:', extra.length, extra)
  console.log('IN CLAIMS BUT NOT IN c3:', missing.length, missing)
  for (const t of extra) {
    const row = c3.find((r) => r.tx.toLowerCase() === t)
    console.log('  c3 row:', JSON.stringify(row))
    const rcpt = await rpc('eth_getTransactionReceipt', [t])
    console.log('  receipt status:', rcpt?.status, 'block', Number(rcpt?.blockNumber), 'to', rcpt?.to, 'logs', rcpt?.logs?.length)
    const topics = (rcpt?.logs ?? []).map((l) => `${l.address.slice(0, 10)}..:${l.topics[0].slice(0, 12)}`)
    console.log('  log topics:', JSON.stringify(topics))
  }
}
main().catch((e) => { console.error('FAILED:', scrub(e.message)); process.exit(1) })
