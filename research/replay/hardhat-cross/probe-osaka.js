// Leg 4 probe: can Hardhat 3.1.4 / EDR execute Osaka, and does EIP-7951 exist there?
import hre from 'hardhat';
const { ethers } = await import('ethers');
const conn = await hre.network.connect();
const provider = conn.provider;
const P256 = '0x0000000000000000000000000000000000000100';
const INPUT = '0xf3c3fc2bc93f926c16c726097de5bcafec49792d10effc432d4d03bc6aef54fe'
  + 'ab1eb02d8aa687e97da0229337aa8873e6f0eb26be289f28333d183f5d3b7a95'
  + 'c0c869adfb748daee3c5286eed6682c12e5533186baced9c26c167a9ebae950b'
  + '1a88c88615d437fbb8bf9e1942a1929f28562706ae6c2bd399e7b1bfb6d1e9e7'
  + '5b92b4aa42917ae1c61b701ef035c3fe7be3009cbafe5a2f71316c902dcf0d00';
const chainId = await provider.request({ method: 'eth_chainId' });
const bn = await provider.request({ method: 'eth_blockNumber' });
console.log('chainId', chainId, 'blockNumber', parseInt(bn, 16));
const res = await provider.request({ method: 'eth_call', params: [{ to: P256, data: INPUT }, 'latest'] });
console.log('eth_call 0x100 ->', res);
console.log('VALID?', res === '0x' + '0'.repeat(63) + '1');
const bad = INPUT.slice(0, 66) + 'ff' + INPUT.slice(68);
const res2 = await provider.request({ method: 'eth_call', params: [{ to: P256, data: bad }, 'latest'] });
console.log('invalid-sig ->', JSON.stringify(res2), 'len', (res2.length - 2) / 2);
const est = await provider.request({ method: 'eth_estimateGas', params: [{ from: '0x0000000000000000000000000000000000000001', to: P256, data: INPUT }] });
console.log('estimateGas', parseInt(est, 16), ' minus intrinsic 23536 =', parseInt(est, 16) - 23536);
