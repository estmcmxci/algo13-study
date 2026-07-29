import fs from 'node:fs';
import crypto from 'node:crypto';
// Deterministic seed-509 stratified subset (work-order seed), used for:
//  (a) Foundry/Hardhat cross-implementation agreement  [battery leg 4]
//  (b) full-transaction replay vs oracle-level delta   [acceptance gate 8, max(500 gas,1%)]
const rows=JSON.parse(fs.readFileSync('research/derived/p3-override-map.json','utf8'));
const bucket=r=>[r.period, r.registrarVersion, r.population,
  r.n13_trace===undefined?'na':(r.n13_trace===0?'n13=0':r.n13_trace<=2?'n13=1-2':'n13>=3')].join(' | ');
const strata={};
for(const r of rows) (strata[bucket(r)] ??= []).push(r);
// deterministic ordering within each stratum: hash(seed || callId)
const rank=id=>crypto.createHash('sha256').update('509:'+id).digest('hex');
const PER=3;
const picked=[];
for(const [k,v] of Object.entries(strata).sort()){
  const sorted=[...v].sort((a,b)=>rank(a.callId)<rank(b.callId)?-1:1);
  const take=sorted.slice(0,Math.min(PER,sorted.length));
  picked.push(...take);
  console.log(`  ${String(v.length).padStart(5)}  ${k}   -> picked ${take.length}`);
}
fs.writeFileSync('research/derived/p3-strata-subset.json',JSON.stringify(picked,null,1));
console.log(`\nstrata: ${Object.keys(strata).length}   subset size: ${picked.length} / ${rows.length}`);
const cov={}; for(const p of picked) cov[p.period]=(cov[p.period]||0)+1;
console.log('subset by period:',JSON.stringify(cov));
const co={}; for(const p of picked) co[p.oldRole]=(co[p.oldRole]||0)+1;
console.log('subset by OLD-variant bytecode:',JSON.stringify(co));
const po={}; for(const p of picked) po[p.population]=(po[p.population]||0)+1;
console.log('subset by population:',JSON.stringify(po));
