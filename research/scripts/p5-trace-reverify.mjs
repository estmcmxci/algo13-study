/**
 * B6 CLOSURE: re-verify trace-derived n13 for every successful call against Alchemy.
 * Independent on BOTH axes vs the original:
 *   endpoint: Alchemy (paid)          vs public evm.stupidtech.net
 *   tracer  : trace_transaction (flat) vs debug_traceTransaction (callTracer)
 * Raw responses persisted with sha256 per the provenance rule.
 */
import {rpc, STATS, logEvent} from './rpc.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
const sha256=s=>crypto.createHash('sha256').update(s).digest('hex');
const REG={current:'0xb32cb5677a7c971689228ec835800432b339ba2b', legacy:'0x58774bb8acd458a640af0b88238369a167546ef2'};
const ORACLE={current:'0x0fc3152971714e5ed7723fafa650f86a4baf30c5', legacy:'0x21745ff62108968fbf5ab1e07961cc0fcbeb2364',
              legacy_original:'0x46c6f79952d3046bf673a28132ff2a81f306959c'};
const V_LEG='0xe571a50f76ff7404f3ce380d06cbd2c9c6ca3670', V_OLD='0x0faa24e538ba4620165933f68a9d142f79a68091', V_NEW='0xb091c4f6fac16edda5ee1e0f4738f80011905878';
const P_ENS=24619423, LEG_MIG=13103261;
const SEL=new Set(['0x29d56630','0x06963218','0x8bbedf75','0x224199c2']);
function activeVerifier(regVer, block){
  if(regVer==='legacy') return V_LEG;               // both legacy oracles map 13 -> 0xe571a50f
  return block < P_ENS ? V_OLD : V_NEW;
}
const OUT='research/derived/p5-trace-reverify.jsonl';
const RAWDIR='research/raw/alchemy-traces';
const calls=JSON.parse(fs.readFileSync('research/derived/p1-calls-for-decode.json','utf8'));
// group calls by tx so one trace_transaction covers every call in that tx
const byTx=new Map();
for(const c of calls){ if(!byTx.has(c.tx)) byTx.set(c.tx,[]); byTx.get(c.tx).push(c); }
const done=new Set(fs.existsSync(OUT)?fs.readFileSync(OUT,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l).tx):[]);
const work=[...byTx.entries()].filter(([tx])=>!done.has(tx));
console.log(`re-verify: ${byTx.size} txs (${calls.length} calls), ${done.size} done, ${work.length} to do`);
let n=0, agree=0, disagree=0, errs=0;
const disagreements=[];
for(const [tx, cs] of work){
  n++;
  try{
    const flat=await rpc('trace_transaction',[tx],{endpoint:'alchemy'});
    const body=JSON.stringify(flat);
    fs.writeFileSync(`${RAWDIR}/${tx}.json`, body);
    // recompute n13 per registrar call from FLAT traces using traceAddress ancestry
    for(const c of cs){
      const regPath = c.traceAddress==='' ? [] : c.traceAddress.split('.').map(Number);
      const isDesc = (ta)=> ta.length>regPath.length && regPath.every((v,i)=>ta[i]===v);
      const want = activeVerifier(c.registrarVersion, c.block);
      let n13=0;
      for(const t of flat){
        const ta=t.traceAddress||[];
        if(!isDesc(ta)) continue;
        const to=(t.action&&t.action.to||'').toLowerCase();
        if(to===want) n13++;
      }
      const ok = n13===c.n13_trace;
      if(ok) agree++; else { disagree++; disagreements.push({callId:c.callId,tx,alchemy:n13,public:c.n13_trace,block:c.block,ver:c.registrarVersion}); }
      fs.appendFileSync(OUT, JSON.stringify({tx, callId:c.callId, block:c.block, registrarVersion:c.registrarVersion,
        n13_public:c.n13_trace, n13_alchemy:n13, agrees:ok, rawSha256:sha256(body), source:'alchemy:trace_transaction'})+'\n');
    }
  }catch(e){ errs++; logEvent({kind:'reverify_error', tx, error:String(e.message).slice(0,160)});
    fs.appendFileSync(OUT, JSON.stringify({tx, error:String(e.message).slice(0,200)})+'\n'); }
  if(n%200===0) console.log(`  ${n}/${work.length}  agree=${agree} disagree=${disagree} err=${errs}`);
}
console.log(`\nDONE  agree=${agree} disagree=${disagree} errors=${errs}`);
if(disagreements.length){ fs.writeFileSync('research/derived/p5-disagreements.json',JSON.stringify(disagreements,null,1));
  console.log('disagreements written:', disagreements.length); }
