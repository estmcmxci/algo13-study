import {rpc, readConfirmed} from './rpc.mjs';
import fs from 'node:fs';
const REG={current:'0xb32cb5677a7c971689228ec835800432b339ba2b', legacy:'0x58774bb8acd458a640af0b88238369a167546ef2'};
const CLAIM_TOPIC={current:'0x87db02a0e483e2818060eddcbb3488ce44e35aff49a70d92c2aa6c8046cf01e2',
                   legacy:'0xa2e66ce20e6fb2c4f61339c364ad79f15160cf5307230c8bc4d628adbca2ba39'};
const B_PRE=23935694, P_ENS=24619423;
const period=b=> b<B_PRE?'historical_hypothetical': b<P_ENS?'feasible_counterfactual':'realized';

// --- A. successful Claim events (public: Alchemy free tier caps getLogs at 10 blocks)
const claims=[];
for(const v of ['current','legacy']){
  const logs=await rpc('eth_getLogs',[{fromBlock:'0x0',toBlock:'latest',address:REG[v],topics:[CLAIM_TOPIC[v]]}],{endpoint:'public'});
  for(const l of logs) claims.push({registrarVersion:v, tx:l.transactionHash, block:parseInt(l.blockNumber,16),
    txIndex:parseInt(l.transactionIndex,16), logIndex:parseInt(l.logIndex,16)});
}
claims.sort((a,b)=>a.block-b.block||a.logIndex-b.logIndex);
console.log(`Claim events: ${claims.length}  (current ${claims.filter(c=>c.registrarVersion==='current').length}, legacy ${claims.filter(c=>c.registrarVersion==='legacy').length})`);
const byTx={}; for(const c of claims){ (byTx[c.tx] ??= []).push(c); }
console.log(`distinct claim-bearing txs: ${Object.keys(byTx).length}`);
const multi=Object.entries(byTx).filter(([,v])=>v.length>1);
console.log(`txs with >1 Claim (multicall candidates): ${multi.length}`);
const per={}; for(const c of claims) per[period(c.block)]=(per[period(c.block)]||0)+1;
console.log('claims by period:', per);

// --- B. ALL calls to both registrars, incl. reverted + internal (public trace_filter, chunked)
// Chunked because a 1M-block span returned HTTP 530 and a full-range span returned an
// implausible 42 rows; chunk size validated below against the known Claim population.
const CHUNK=250_000, head=parseInt(await rpc('eth_blockNumber',[],{endpoint:'alchemy'}),16);
const SPAN={current:[19027588,head], legacy:[13040372,head]};
const traceRows=[];
for(const v of ['current','legacy']){
  const [from,to]=SPAN[v];
  for(let s=from;s<=to;s+=CHUNK){
    const e=Math.min(s+CHUNK-1,to);
    let rows=null;
    for(let a=0;a<5 && rows===null;a++){
      try{ rows=await rpc('trace_filter',[{fromBlock:'0x'+s.toString(16),toBlock:'0x'+e.toString(16),toAddress:[REG[v]]}],{endpoint:'public'}); }
      catch(err){ await new Promise(r=>setTimeout(r,1200*(a+1))); }
    }
    if(rows===null){ console.log(`  !! chunk ${v} ${s}-${e} FAILED`); continue; }
    for(const t of rows) traceRows.push({registrarVersion:v, ...t});
    process.stdout.write(`\r  trace_filter ${v} ${s}..${e} (+${rows.length}) total=${traceRows.length}   `);
  }
}
console.log('');
fs.writeFileSync('research/derived/p1-claims.json',JSON.stringify(claims,null,2));
fs.writeFileSync('research/derived/p1-tracefilter-raw.json',JSON.stringify(traceRows));
console.log(`trace_filter rows: ${traceRows.length}`);

// --- C. COMPLETENESS INVARIANT: every claim-bearing tx must appear in trace_filter output
const tfTxs=new Set(traceRows.map(t=>t.transactionHash));
const missing=Object.keys(byTx).filter(h=>!tfTxs.has(h));
console.log(`\nCOMPLETENESS: claim txs missing from trace_filter: ${missing.length} / ${Object.keys(byTx).length}`);
if(missing.length) console.log('  first few:', missing.slice(0,5));
