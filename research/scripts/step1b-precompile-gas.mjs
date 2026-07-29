import {rpc} from './rpc.mjs';
const P256='0x0000000000000000000000000000000000000100';
const INPUT='0xf3c3fc2bc93f926c16c726097de5bcafec49792d10effc432d4d03bc6aef54feab1eb02d8aa687e97da0229337aa8873e6f0eb26be289f28333d183f5d3b7a95c0c869adfb748daee3c5286eed6682c12e5533186baced9c26c167a9ebae950b1a88c88615d437fbb8bf9e1942a1929f28562706ae6c2bd399e7b1bfb6d1e9e75b92b4aa42917ae1c61b701ef035c3fe7be3009cbafe5a2f71316c902dcf0d00';
const from='0x0000000000000000000000000000000000000001';
// intrinsic-inclusive estimate, then subtract intrinsic (21000 + calldata cost)
const est = parseInt(await rpc('eth_estimateGas',[{from,to:P256,data:INPUT}],{}),16);
const bytes = Buffer.from(INPUT.slice(2),'hex');
let cd=0; for(const b of bytes) cd += (b===0?4:16);
console.log('eth_estimateGas total :', est);
console.log('intrinsic 21000 + calldata', cd, '=', 21000+cd);
console.log('=> precompile execution gas =', est-21000-cd);
// cross-check with debug_traceCall callTracer
try {
  const t = await rpc('debug_traceCall',[{from,to:P256,data:INPUT},'latest',{tracer:'callTracer'}]);
  console.log('debug_traceCall gasUsed:', parseInt(t.gasUsed,16), '(includes intrinsic)');
} catch(e) { console.log('traceCall:', e.message.slice(0,100)); }
// invalid-signature variant (flip one byte of r) -> should be empty output
const bad = INPUT.slice(0,66)+'ff'+INPUT.slice(68);
const res = await rpc('eth_call',[{to:P256,data:bad},'latest']);
console.log('invalid-sig output:', JSON.stringify(res), '(EIP says empty bytes)');
