/** A4: widen the denominator to the FULL root zone — every delegated TLD. */
import fs from 'node:fs';
import crypto from 'node:crypto';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const MN={RSAMD5:1,DSA:3,RSASHA1:5,'DSA-NSEC3-SHA1':6,'RSASHA1-NSEC3-SHA1':7,RSASHA256:8,RSASHA512:10,'ECC-GOST':12,ECDSAP256SHA256:13,ECDSAP384SHA384:14,ED25519:15,ED448:16};
const toNum=s=>{const n=parseInt(s,10);return Number.isFinite(n)&&String(n)===String(s).trim()?n:(MN[String(s).toUpperCase()]??null);};
async function q(name,type,tries=4){for(let i=0;i<tries;i++){try{
  const r=await fetch(`https://cloudflare-dns.com/dns-query?name=${name}&type=${type}`,{headers:{accept:'application/dns-json'}});
  if(r.ok)return await r.json();}catch{}await sleep(250*(i+1));}return null;}
const algs=(j,k)=>{if(!j||!j.Answer)return[];const w=k==='DS'?43:48,i=k==='DS'?1:2;
  return[...new Set(j.Answer.filter(a=>a.type===w).map(a=>toNum(String(a.data).trim().split(/\s+/)[i])).filter(x=>x!==null))].sort((a,b)=>a-b);};
const all=fs.readFileSync('research/gtld/raw/iana-tlds-alpha.txt','utf8').split('\n')
  .map(s=>s.trim()).filter(s=>s&&!s.startsWith('#')).map(s=>s.toLowerCase());
const OUT='research/gtld/root-census.jsonl';
const done=new Set(fs.existsSync(OUT)?fs.readFileSync(OUT,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l).tld):[]);
const work=all.filter(t=>!done.has(t));
console.log(`root census: ${all.length} TLDs in IANA root list, ${done.size} done, ${work.length} to do`);
let n=0;
for(const t of work){
  n++;
  const ts=new Date().toISOString();
  const ds=await q(t+'.','DS');
  const rec={tld:t,observedAt:ts,resolver:'cloudflare',ds_status:ds?ds.Status:null,ds_ad:ds?!!ds.AD:null,
    ds_algs:algs(ds,'DS'),ds_count:ds&&ds.Answer?ds.Answer.filter(a=>a.type===43).length:0,
    raw_sha256:crypto.createHash('sha256').update(JSON.stringify(ds)).digest('hex')};
  fs.appendFileSync(OUT,JSON.stringify(rec)+'\n');
  fs.writeFileSync(`research/gtld/raw-root/${t}.json`,JSON.stringify(ds));
  if(n%250===0)console.log(`  ${n}/${work.length}`);
  await sleep(30);
}
console.log('done');
