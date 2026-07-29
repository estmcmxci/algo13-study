import {rpc, readConfirmed, STATS, logEvent} from './rpc.mjs';
import {getValidatedTrace} from './rpc3.mjs';
import fs from 'node:fs';

const REG={current:'0xb32cb5677a7c971689228ec835800432b339ba2b', legacy:'0x58774bb8acd458a640af0b88238369a167546ef2'};
const ORACLE={current:'0x0fc3152971714e5ed7723fafa650f86a4baf30c5', legacy:'0x21745ff62108968fbf5ab1e07961cc0fcbeb2364'};
const V_LEGACY='0xe571a50f76ff7404f3ce380d06cbd2c9c6ca3670';
const V_OLD   ='0x0faa24e538ba4620165933f68a9d142f79a68091';
const V_NEW   ='0xb091c4f6fac16edda5ee1e0f4738f80011905878';
const B_PRE=23935694, P_ENS=24619423;
const CLAIM_SELECTORS=new Set(['0x29d56630','0x06963218','0x8bbedf75','0x224199c2']);
const period=b=> b<B_PRE?'historical_hypothetical': b<P_ENS?'feasible_counterfactual':'realized';
// Which alg-13 verifier was ACTIVE for a given oracle at a given block.
function activeVerifier(oracle, block){
  if(oracle===ORACLE.legacy) return block>=13097301 ? V_LEGACY : null;
  if(oracle===ORACLE.current) return block<19020688 ? null : (block<P_ENS ? V_OLD : V_NEW);
  return null;
}
const OUT='research/derived/p1-census.jsonl';
const done=new Set(fs.existsSync(OUT)?fs.readFileSync(OUT,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l).tx):[]);
const claims=JSON.parse(fs.readFileSync('research/derived/p1-claims.json','utf8'));
const byTx=new Map();
for(const c of claims){ if(!byTx.has(c.tx)) byTx.set(c.tx,{tx:c.tx,block:c.block,registrarVersion:c.registrarVersion,claims:0}); byTx.get(c.tx).claims++; }
const work=[...byTx.values()].filter(t=>!done.has(t.tx));
console.log(`census: ${byTx.size} claim txs, ${done.size} already done, ${work.length} to do`);

let n=0;
for(const item of work){
  n++;
  try{
    const {tx,rc,trace,traceAttempts}=await getValidatedTrace(item.tx,{ctx:{block:item.block}});
    const reg=REG[item.registrarVersion];
    // walk: collect registrar calls and, inside each, oracle + alg13 verifier dispatches
    const regCalls=[];
    const walk=(c,path=[],ancestorReg=null)=>{
      const to=(c.to||'').toLowerCase();
      let curReg=ancestorReg;
      if(to===reg && CLAIM_SELECTORS.has((c.input||'').slice(0,10))){
        curReg={callId:`1:${item.tx}:${path.join('.')}`, traceAddress:path.join('.'), selector:(c.input||'').slice(0,10),
                caller:(c.from||'').toLowerCase(), calldata:c.input, reverted:!!c.error, error:c.error??null,
                gas:c.gas?parseInt(c.gas,16):null, gasUsed:c.gasUsed?parseInt(c.gasUsed,16):null,
                oracleCalls:0, n13_trace:0, verifiersSeen:{}};
        regCalls.push(curReg);
      }
      if(curReg){
        if(to===ORACLE.current||to===ORACLE.legacy) curReg.oracleCalls++;
        if(to===V_LEGACY||to===V_OLD||to===V_NEW){
          curReg.verifiersSeen[to]=(curReg.verifiersSeen[to]||0)+1;
          const oracle = item.registrarVersion==='legacy'?ORACLE.legacy:ORACLE.current;
          if(to===activeVerifier(oracle,item.block)) curReg.n13_trace++;
        }
      }
      (c.calls||[]).forEach((x,i)=>walk(x,[...path,i],curReg));
    };
    walk(trace);
    const rec={tx:item.tx, block:item.block, txIndex:parseInt(tx.transactionIndex,16),
      registrarVersion:item.registrarVersion, period:period(item.block), claimEvents:item.claims,
      txStatus:rc.status, txGasUsed:parseInt(rc.gasUsed,16),
      effectiveGasPrice: rc.effectiveGasPrice?BigInt(rc.effectiveGasPrice).toString():null,
      topLevelTo:(tx.to||'').toLowerCase(), topLevelSelector:tx.input.slice(0,10),
      registrarCalls:regCalls.length, n13_trace_total:regCalls.reduce((a,c)=>a+c.n13_trace,0),
      oracleCalls:regCalls.reduce((a,c)=>a+c.oracleCalls,0),
      calls:regCalls, traceAttempts};
    fs.appendFileSync(OUT,JSON.stringify(rec)+'\n');
  }catch(e){
    fs.appendFileSync(OUT,JSON.stringify({tx:item.tx,block:item.block,registrarVersion:item.registrarVersion,
      period:period(item.block),error:String(e.message).slice(0,220),failed:true})+'\n');
    logEvent({kind:'census_error',hash:item.tx,error:String(e.message).slice(0,200)});
  }
  if(n%50===0) process.stdout.write(`\r  ${n}/${work.length}  alchemy=${STATS.alchemy.calls} public=${STATS.public.calls} rejects=${STATS.public.traceRejects} 429=${STATS.alchemy.rateLimited+STATS.public.rateLimited}   `);
}
console.log(`\ndone. alchemy calls ${STATS.alchemy.calls}, public ${STATS.public.calls}, traceRejects ${STATS.public.traceRejects}, 429s ${STATS.alchemy.rateLimited+STATS.public.rateLimited}`);
