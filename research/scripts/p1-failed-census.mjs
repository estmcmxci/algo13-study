import {rpc, STATS, logEvent} from './rpc.mjs';
import {getValidatedTrace} from './rpc3.mjs';
import fs from 'node:fs';
const REG={current:'0xb32cb5677a7c971689228ec835800432b339ba2b', legacy:'0x58774bb8acd458a640af0b88238369a167546ef2'};
const ORACLE={current:'0x0fc3152971714e5ed7723fafa650f86a4baf30c5', legacy:'0x21745ff62108968fbf5ab1e07961cc0fcbeb2364'};
const V_LEGACY='0xe571a50f76ff7404f3ce380d06cbd2c9c6ca3670', V_OLD='0x0faa24e538ba4620165933f68a9d142f79a68091', V_NEW='0xb091c4f6fac16edda5ee1e0f4738f80011905878';
const B_PRE=23935694,P_ENS=24619423;
const SEL=new Set(['0x29d56630','0x06963218','0x8bbedf75','0x224199c2']);
const period=b=>b<B_PRE?'historical_hypothetical':b<P_ENS?'feasible_counterfactual':'realized';
function activeVerifier(o,b){ if(o===ORACLE.legacy) return b>=13097301?V_LEGACY:null;
  if(o===ORACLE.current) return b<19020688?null:(b<P_ENS?V_OLD:V_NEW); return null; }
const rows=JSON.parse(fs.readFileSync('research/derived/p1-failed-calls.json','utf8'));
const OUT='research/derived/p1-failed-census.jsonl';
const done=new Set(fs.existsSync(OUT)?fs.readFileSync(OUT,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l).tx):[]);
const work=rows.filter(r=>!done.has(r.tx_hash));
console.log(`failed-call census: ${rows.length} rows, ${work.length} to do`);
let n=0;
for(const r of work){
  n++;
  try{
    const {tx,rc,trace}=await getValidatedTrace(r.tx_hash,{ctx:{block:r.block_number,pop:'failed'}});
    const reg=REG[r.registrar_version];
    const calls=[];
    const walk=(c,path=[],cur=null)=>{
      const to=(c.to||'').toLowerCase();
      let k=cur;
      if(to===reg && SEL.has((c.input||'').slice(0,10))){
        k={traceAddress:path.join('.'),selector:(c.input||'').slice(0,10),reverted:!!c.error,error:c.error??null,
           gasUsed:c.gasUsed?parseInt(c.gasUsed,16):null,oracleCalls:0,n13_trace:0,verifiersSeen:{},calldata:c.input};
        calls.push(k);
      }
      if(k){ if(to===ORACLE.current||to===ORACLE.legacy) k.oracleCalls++;
        if(to===V_LEGACY||to===V_OLD||to===V_NEW){ k.verifiersSeen[to]=(k.verifiersSeen[to]||0)+1;
          const o=r.registrar_version==='legacy'?ORACLE.legacy:ORACLE.current;
          if(to===activeVerifier(o,r.block_number)) k.n13_trace++; } }
      (c.calls||[]).forEach((x,i)=>walk(x,[...path,i],k));
    };
    walk(trace);
    fs.appendFileSync(OUT,JSON.stringify({tx:r.tx_hash,block:r.block_number,layer:r.layer,
      registrarVersion:r.registrar_version,period:period(r.block_number),selector:r.selector,
      txStatus:rc.status,txGasUsed:parseInt(rc.gasUsed,16),
      effectiveGasPrice:rc.effectiveGasPrice?BigInt(rc.effectiveGasPrice).toString():null,
      registrarCalls:calls.length, reachedAlg13: calls.some(c=>c.n13_trace>0),
      n13_trace_total:calls.reduce((a,c)=>a+c.n13_trace,0),
      oracleCalls:calls.reduce((a,c)=>a+c.oracleCalls,0), calls})+'\n');
  }catch(e){ fs.appendFileSync(OUT,JSON.stringify({tx:r.tx_hash,block:r.block_number,failed:true,error:String(e.message).slice(0,200)})+'\n'); }
  if(n%25===0) process.stdout.write(`\r  ${n}/${work.length}  rejects=${STATS.public.traceRejects}   `);
}
console.log('\ndone');
