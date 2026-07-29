// Leg 4 (substantive): install the SAME pinned verifier bytecodes in Hardhat/EDR and
// measure the paired delta, for comparison against Foundry/anvil. No fork needed —
// the comparison is of bytecode execution cost, which is what delta_gas is made of.
import fs from 'node:fs';
import hre from 'hardhat';
const conn = await hre.network.connect();
const p = conn.provider;
const PINS = JSON.parse(fs.readFileSync(new URL('../../manifests/bytecode-pins.json', import.meta.url), 'utf8'));
const byRole = Object.fromEntries(PINS.artifacts.map(a => [a.role, a]));
const SLOT = '0x00000000000000000000000000000000deadbeef';
const CALLER = '0x0000000000000000000000000000000000000001';

// verify(bytes,bytes,bytes) with the RFC 6605 alg-13 vector
const KEY = '0101030d1a88c88615d437fbb8bf9e1942a1929f28562706ae6c2bd399e7b1bfb6d1e9e75b92b4aa42917ae1c61b701ef035c3fe7be3009cbafe5a2f71316c902dcf0d00';
const DATA = '00010d0300000e104c88b1374c63c737d960076578616d706c65036e65740003777777076578616d706c65036e6574000001000100000e100004c0000201';
const SIG = 'ab1eb02d8aa687e97da0229337aa8873e6f0eb26be289f28333d183f5d3b7a95c0c869adfb748daee3c5286eed6682c12e5533186baced9c26c167a9ebae950b';
const pad = (h) => h + '0'.repeat((64 - (h.length % 64)) % 64);
const w = (n) => n.toString(16).padStart(64, '0');
const enc = (...arrs) => {
  let head = '', tail = '', off = 32 * arrs.length;
  for (const a of arrs) { head += w(off); const b = w(a.length / 2) + pad(a); tail += b; off += b.length / 2; }
  return '0xde8f50a1' + head + tail;
};
const CALLDATA = enc(KEY, DATA, SIG);

const results = {};
for (const role of ['alg13_verifier_old_current_oracle', 'alg13_verifier_old_legacy_oracle', 'alg13_verifier_new']) {
  const code = fs.readFileSync(new URL('../../' + byRole[role].rawFile.replace('research/', ''), import.meta.url), 'utf8').trim();
  await p.request({ method: 'hardhat_setCode', params: [SLOT, code] });
  const readBack = await p.request({ method: 'eth_getCode', params: [SLOT, 'latest'] });
  const ok = readBack.toLowerCase() === code.toLowerCase();
  const ret = await p.request({ method: 'eth_call', params: [{ from: CALLER, to: SLOT, data: CALLDATA }, 'latest'] });
  const est = await p.request({ method: 'eth_estimateGas', params: [{ from: CALLER, to: SLOT, data: CALLDATA }] });
  results[role] = { codeInstalled: ok, verified: ret.endsWith('1'), estimateGas: parseInt(est, 16) };
  console.log(`${role.padEnd(34)} installed=${ok} verified=${ret.endsWith('1')} estimateGas=${parseInt(est,16)}`);
}
const dCur = results.alg13_verifier_old_current_oracle.estimateGas - results.alg13_verifier_new.estimateGas;
const dLeg = results.alg13_verifier_old_legacy_oracle.estimateGas - results.alg13_verifier_new.estimateGas;
console.log('\nHARDHAT/EDR paired delta (current-oracle old - new):', dCur);
console.log('HARDHAT/EDR paired delta (legacy-oracle  old - new):', dLeg);
fs.writeFileSync(new URL('../../derived/p3-leg4-hardhat.json', import.meta.url), JSON.stringify({results, dCur, dLeg}, null, 1));
