/**
 * B6 CLOSURE v2 — corrected ancestry.
 * v1 compared a Geth callTracer path ("0.1") against Parity flat traceAddress arrays.
 * Those index spaces are NOT comparable: the same registrar call is "0.1" under
 * callTracer and [0,0] in the flat trace. v1 therefore scored 0 for nested calls.
 * v2 locates the registrar call WITHIN the flat trace and uses its own flat
 * traceAddress as the prefix. Re-parses persisted raw traces; no new RPC.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
const sha256=s=>crypto.createHash('sha256').update(s).digest('hex');
const REG={current:'0xb32cb5677a7c971689228ec835800432b339ba2b', legacy:'0x58774bb8acd458a640af0b88238369a167546ef2'};
const V_LEG='0xe571a50f76ff7404f3ce380d06cbd2c9c6ca3670', V_OLD='0x0faa24e538ba4620165933f68a9d142f79a68091', V_NEW='0xb091c4f6fac16edda5ee1e0f4738f80011905878';
const P_ENS=24619423;
const SEL=new Set(['0x29d56630','0x06963218','0x8bbedf75','0x224199c2']);
const av=(v,b)=> v==='legacy'?V_LEG:(b<P_ENS?V_OLD:V_NEW);
const calls=JSON.parse(fs.readFileSync('research/derived/p1-calls-for-decode.json','utf8'));
const byTx=new Map(); for(const c of calls){ if(!byTx.has(c.tx)) byTx.set(c.tx,[]); byTx.get(c.tx).push(c); }
const OUT='research/derived/p5-trace-reverify-v2.jsonl'; fs.writeFileSync(OUT,'');
let agree=0,dis=0,missing=0; const disagreements=[];
for(const [tx,cs] of byTx){
  const f=`research/raw/alchemy-traces/${tx}.json`;
  if(!fs.existsSync(f)){ missing+=cs.length; continue; }
  const body=fs.readFileSync(f,'utf8'); const flat=JSON.parse(body);
  // registrar calls IN THE FLAT TRACE, in document order
  const regCalls=flat.filter(t=>{
    const a=t.action||{}; const to=(a.to||'').toLowerCase();
    return (to===REG.current||to===REG.legacy) && SEL.has((a.input||'').slice(0,10));
  }).sort((x,y)=>JSON.stringify(x.traceAddress).localeCompare(JSON.stringify(y.traceAddress)));
  // census calls for this tx, also in document order
  const cens=[...cs].sort((x,y)=>String(x.traceAddress).localeCompare(String(y.traceAddress)));
  for(let i=0;i<cens.length;i++){
    const c=cens[i]; const rc=regCalls[i];
    let n13=0;
    if(rc){
      const rp=rc.traceAddress||[];
      const want=av(c.registrarVersion,c.block);
      for(const t of flat){ const ta=t.traceAddress||[];
        if(!(ta.length>rp.length && rp.every((v,j)=>ta[j]===v))) continue;
        if((((t.action||{}).to)||'').toLowerCase()===want) n13++; }
    }
    const ok = n13===c.n13_trace;
    ok?agree++:dis++;
    if(!ok) disagreements.push({callId:c.callId,tx,public:c.n13_trace,alchemy:n13,block:c.block,ver:c.registrarVersion,nested:c.traceAddress!==''});
    fs.appendFileSync(OUT,JSON.stringify({tx,callId:c.callId,block:c.block,registrarVersion:c.registrarVersion,
      n13_public:c.n13_trace,n13_alchemy:n13,agrees:ok,rawSha256:sha256(body),source:'alchemy:trace_transaction',ancestry:'v2-flat-native'})+'\n');
  }
}
console.log(`B6 v2: agree=${agree} disagree=${dis} missing-raw=${missing}  => ${(100*agree/(agree+dis)).toFixed(2)}% agreement`);
if(disagreements.length){ fs.writeFileSync('research/derived/p5-disagreements-v2.json',JSON.stringify(disagreements,null,1));
  for(const d of disagreements.slice(0,10)) console.log('  ',d.callId.slice(0,32)+'…','public',d.public,'alchemy',d.alchemy,'nested',d.nested); }
