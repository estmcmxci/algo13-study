/** C2: current NS records for imported names -> provider concentration.
 *  LIMITATION recorded per record: NS is CURRENT, imports are HISTORICAL. */
import fs from 'node:fs';
import crypto from 'node:crypto';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function q(name,type,tries=3){for(let i=0;i<tries;i++){try{
  const r=await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,{headers:{accept:'application/dns-json'}});
  if(r.ok)return await r.json();}catch{}await sleep(200*(i+1));}return null;}
const names=JSON.parse(fs.readFileSync('research/derived/c3-imported-names.json','utf8')).filter(x=>x.block<=25627360);
const uniq=[...new Set(names.map(x=>x.name).filter(Boolean))];
const OUT='research/gtld/ns-census.jsonl';
const done=new Set(fs.existsSync(OUT)?fs.readFileSync(OUT,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l).name):[]);
const work=uniq.filter(n=>!done.has(n));
console.log(`NS census: ${uniq.length} distinct imported names, ${done.size} done, ${work.length} to do`);
let n=0;
for(const nm of work){
  n++;
  const ts=new Date().toISOString();
  const j=await q(nm+'.','NS');
  const ns=(j&&j.Answer?j.Answer.filter(a=>a.type===2).map(a=>String(a.data).toLowerCase().replace(/\.$/,'')):[]);
  fs.appendFileSync(OUT,JSON.stringify({name:nm,observedAt:ts,resolver:'cloudflare',
    status:j?j.Status:null, ns, ns_count:ns.length,
    raw_sha256:crypto.createHash('sha256').update(JSON.stringify(j)).digest('hex')})+'\n');
  if(n%250===0)console.log(`  ${n}/${work.length}`);
  await sleep(25);
}
console.log('done');
