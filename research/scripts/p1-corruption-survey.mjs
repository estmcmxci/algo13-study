import {rpc} from './rpc.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const R='0xb32cb5677a7c971689228ec835800432b339ba2b';
const TX='0x54dc404968ac4ca18df6c78dee1baeb16c69c9a874a9074bec7ac3f3cdb2c522';
const N=50;
async function survey(label, fn, isBad){
  let bad=0, err=0;
  for(let i=0;i<N;i++){
    try{ const v=await fn(); if(isBad(v)) bad++; }catch(e){ err++; }
  }
  console.log(`  ${label.padEnd(34)} bad ${String(bad).padStart(3)}/${N}  err ${err}   rate ${(100*bad/N).toFixed(1)}%`);
  return bad/N;
}
console.log(`corruption survey, ${N} samples per method  (${new Date().toISOString()})`);
await survey('eth_getTransactionByHash -> null', ()=>rpc('eth_getTransactionByHash',[TX],{retries:1}), v=>v===null);
await survey('eth_getTransactionReceipt -> null',()=>rpc('eth_getTransactionReceipt',[TX],{retries:1}), v=>v===null);
await survey('eth_getBlockByNumber -> null',      ()=>rpc('eth_getBlockByNumber',['0x123a5d6',false],{retries:1}), v=>v===null);
await survey('eth_getCode(registrar) -> empty',   ()=>rpc('eth_getCode',[R,'0x1234567'],{retries:1}), v=>v==='0x');
await survey('debug_traceTransaction wrong-shape',()=>rpc('debug_traceTransaction',[TX,{tracer:'callTracer'}],{retries:1}),
             t=>!t || (t.to||'').toLowerCase()!==R);
const logs=await survey('eth_getLogs(Claim,cur) != 821',()=>rpc('eth_getLogs',[{fromBlock:'0x0',toBlock:'latest',address:R,
             topics:['0x87db02a0e483e2818060eddcbb3488ce44e35aff49a70d92c2aa6c8046cf01e2']}],{retries:1}), v=>v.length!==821);
