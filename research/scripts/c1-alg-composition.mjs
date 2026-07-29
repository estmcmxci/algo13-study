/** C1: per-import dispatch counts by ALGORITHM, from persisted Alchemy flat traces.
 *  No new RPC. Verifier addresses are interval-indexed exactly as the alg-13 table was. */
import fs from 'node:fs';
const REG={current:'0xb32cb5677a7c971689228ec835800432b339ba2b', legacy:'0x58774bb8acd458a640af0b88238369a167546ef2'};
const SEL=new Set(['0x29d56630','0x06963218','0x8bbedf75','0x224199c2']);
const P_ENS=24619423, ALG7_ROT=24967723, CUR_ORACLE_START=19020688;
// verifier address -> algorithm, per oracle generation
function verifierAlg(addr, registrarVersion, block){
  const a=addr.toLowerCase();
  // legacy oracles (0x21745ff6 and 0x46c6F799) share the same verifier set
  const LEG={'0x765653c78f609826dfd091f9208aeb610949a28f':'5/7',
             '0xb83a8ac6900f19d77333e640550bd8830d5fcb26':'8',
             '0xe571a50f76ff7404f3ce380d06cbd2c9c6ca3670':'13'};
  const CUR_OLD={'0x6ca8624bc207f043d140125486de0f7e624e37a1':'5/7',
                 '0x9d1b5a639597f558bc37cf81813724076c5c1e96':'8',
                 '0x0faa24e538ba4620165933f68a9d142f79a68091':'13'};
  const CUR_NEW={'0x58e0383e21f25dab957f6664240445a514e9f5e8':'5/7',
                 '0xaee0e2c4d5ab2fc164c8b0cc8d3118c1c752c95e':'8',
                 '0xb091c4f6fac16edda5ee1e0f4738f80011905878':'13'};
  if(registrarVersion==='legacy') return LEG[a]??null;
  if(block<P_ENS) return CUR_OLD[a]??null;
  // post-P_ENS: alg 7 only rotated at 24,967,723, so the OLD 5/7 verifier is still
  // live for alg 7 between P_ENS and that block
  return CUR_NEW[a] ?? CUR_OLD[a] ?? null;
}
const calls=JSON.parse(fs.readFileSync('research/derived/p1-calls-for-decode.json','utf8'));
const byTx=new Map(); for(const c of calls){ if(!byTx.has(c.tx)) byTx.set(c.tx,[]); byTx.get(c.tx).push(c); }
const OUT='research/derived/c1-alg-composition.jsonl'; fs.writeFileSync(OUT,'');
let missing=0, n=0;
for(const [tx,cs] of byTx){
  const f=`research/raw/alchemy-traces/${tx}.json`;
  if(!fs.existsSync(f)){ missing+=cs.length; continue; }
  const flat=JSON.parse(fs.readFileSync(f,'utf8'));
  const regCalls=flat.filter(t=>{const a=t.action||{};const to=(a.to||'').toLowerCase();
    return (to===REG.current||to===REG.legacy)&&SEL.has((a.input||'').slice(0,10));})
    .sort((x,y)=>JSON.stringify(x.traceAddress).localeCompare(JSON.stringify(y.traceAddress)));
  const cens=[...cs].sort((x,y)=>String(x.traceAddress).localeCompare(String(y.traceAddress)));
  for(let i=0;i<cens.length;i++){
    const c=cens[i], rc=regCalls[i];
    const counts={'5/7':0,'8':0,'13':0};
    if(rc){ const rp=rc.traceAddress||[];
      for(const t of flat){ const ta=t.traceAddress||[];
        if(!(ta.length>rp.length&&rp.every((v,j)=>ta[j]===v))) continue;
        const al=verifierAlg((((t.action||{}).to)||''), c.registrarVersion, c.block);
        if(al) counts[al]++; } }
    n++;
    fs.appendFileSync(OUT,JSON.stringify({callId:c.callId,tx,block:c.block,period:c.period,
      registrarVersion:c.registrarVersion,n13_trace:c.n13_trace,
      d_rsasha1:counts['5/7'],d_rsasha256:counts['8'],d_ecdsap256:counts['13']})+'\n');
  }
}
console.log('calls processed:',n,' missing raw trace:',missing);
