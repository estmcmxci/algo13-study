import {rpc, sha256, CALLS} from './rpc.mjs';
// RFC 6605 vector from ens-contracts test/dnssec-oracle/fixtures/algorithms.ts
const KEY  = '0101030d1a88c88615d437fbb8bf9e1942a1929f28562706ae6c2bd399e7b1bfb6d1e9e75b92b4aa42917ae1c61b701ef035c3fe7be3009cbafe5a2f71316c902dcf0d00';
const DATA = '00010d0300000e104c88b1374c63c737d960076578616d706c65036e65740003777777076578616d706c65036e6574000001000100000e100004c0000201';
const SIG  = 'ab1eb02d8aa687e97da0229337aa8873e6f0eb26be289f28333d183f5d3b7a95c0c869adfb748daee3c5286eed6682c12e5533186baced9c26c167a9ebae950b';
const qx = KEY.slice(8, 72), qy = KEY.slice(72, 136);
const r = SIG.slice(0, 64), s = SIG.slice(64, 128);
const h = sha256(DATA);
const INPUT = '0x' + h + r + s + qx + qy;
console.log('precompile input (160B):', INPUT.length/2 - 1, 'bytes');
console.log('  msgHash', h, '\n  r', r, '\n  s', s, '\n  qx', qx, '\n  qy', qy);

const P256 = '0x0000000000000000000000000000000000000100';
const VALID = '0x' + '00'.repeat(31) + '01';
async function active(block) {
  const res = await rpc('eth_call', [{to: P256, data: INPUT}, '0x' + block.toString(16)]);
  return {res, active: res === VALID};
}
const latest = parseInt(await rpc('eth_blockNumber', []), 16);
console.log('\nlatest block:', latest);
let lo = 19_000_000, hi = latest;
const a0 = await active(lo), a1 = await active(hi);
console.log(`probe lo=${lo}: active=${a0.active} raw=${a0.res}`);
console.log(`probe hi=${hi}: active=${a1.active} raw=${a1.res}`);
if (a0.active) { console.log('!! active at lo — widen range'); process.exit(1); }
if (!a1.active) { console.log('!! NOT active at head — precompile not live'); process.exit(1); }
while (hi - lo > 1) {
  const mid = Math.floor((lo + hi) / 2);
  const {active: ok} = await active(mid);
  if (ok) hi = mid; else lo = mid;
  process.stdout.write(`\r  bisect lo=${lo} hi=${hi}     `);
}
console.log(`\n\nB_precompile = ${hi}  (first block where EIP-7951 P-256 precompile @0x100 returns valid)`);
console.log(`last inactive block = ${lo}`);
const b = await rpc('eth_getBlockByNumber', ['0x' + hi.toString(16), false]);
const bPrev = await rpc('eth_getBlockByNumber', ['0x' + lo.toString(16), false]);
console.log(`  activation block hash ${b.hash}`);
console.log(`  timestamp ${parseInt(b.timestamp,16)} = ${new Date(parseInt(b.timestamp,16)*1000).toISOString()}`);
console.log(`  prior block ts        ${new Date(parseInt(bPrev.timestamp,16)*1000).toISOString()}`);
