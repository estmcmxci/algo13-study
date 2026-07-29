import {rpc} from './rpc.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const R='0xb32cb5677a7c971689228ec835800432b339ba2b';
const A='0xc4e1dad002d891c8c353318f2f5bbf635b69ab713e77efa4c87cf254ca19a548'; // sample1 good
const B='0x54dc404968ac4ca18df6c78dee1baeb16c69c9a874a9074bec7ac3f3cdb2c522'; // sample2 callTracer 0 hits
const C='0xbb8caf724fd749b03cbe808a78e750ad49efb52b483317b8441654dd650ca04c'; // sample3 tx null
for(const [n,h] of [['A(good)',A],['B(0 hits)',B],['C(null tx)',C]]){
  let exists=0,nulls=0;
  for(let i=0;i<10;i++){ await sleep(200);
    const tx=await rpc('eth_getTransactionByHash',[h]); tx?exists++:nulls++; }
  console.log(`${n.padEnd(11)} eth_getTransactionByHash x10 -> exists=${exists} null=${nulls}`);
  // receipt as a second opinion
  let rexists=0,rnull=0;
  for(let i=0;i<6;i++){ await sleep(200);
    const rc=await rpc('eth_getTransactionReceipt',[h]); rc?rexists++:rnull++; }
  console.log(`${''.padEnd(11)} eth_getTransactionReceipt x6 -> exists=${rexists} null=${rnull}`);
}
console.log('\n--- B: repeat callTracer, count registrar hits');
for(let i=0;i<6;i++){ await sleep(250);
  const tr=await rpc('debug_traceTransaction',[B,{tracer:'callTracer'}]);
  let n=0; const walk=c=>{if((c.to||'').toLowerCase()===R)n++;(c.calls||[]).forEach(walk);}; walk(tr);
  process.stdout.write(` ${n}`);
}
console.log('\n--- B: top-level tx.to / selector');
const btx=await rpc('eth_getTransactionByHash',[B]);
console.log('   to',btx?.to,'sel',btx?.input?.slice(0,10));
