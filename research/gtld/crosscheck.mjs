/** (1) Independent-resolver cross-check (Google) on all 126 alg-13 TLDs + 100 others.
 *  (2) Is nic.{tld} a SEPARATELY DELEGATED zone? That determines chain depth and n13. */
import fs from 'node:fs';
import crypto from 'node:crypto';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const MN={RSASHA1:5,'RSASHA1-NSEC3-SHA1':7,RSASHA256:8,RSASHA512:10,ECDSAP256SHA256:13,ECDSAP384SHA384:14,ED25519:15,ED448:16};
const toNum=s=>{const n=parseInt(s,10);return Number.isFinite(n)&&String(n)===String(s).trim()?n:(MN[String(s).toUpperCase()]??null);};
async function g(name,type,tries=4){
  for(let i=0;i<tries;i++){ try{
    const r=await fetch(`https://dns.google/resolve?name=${name}&type=${type}`,{headers:{accept:'application/dns-json'}});
    if(r.ok) return await r.json();
  }catch{} await sleep(250*(i+1)); }
  return null;
}
const algs=(j,kind)=>{ if(!j||!j.Answer)return[]; const w=kind==='DS'?43:48, i=kind==='DS'?1:2;
  return [...new Set(j.Answer.filter(a=>a.type===w).map(a=>toNum(String(a.data).trim().split(/\s+/)[i])).filter(x=>x!==null))].sort((a,b)=>a-b); };
const cf=fs.readFileSync('research/gtld/census-v2.jsonl','utf8').trim().split('\n').map(JSON.parse);
const byTld=new Map(cf.map(x=>[x.tld,x]));
const a13=cf.filter(x=>x.ds_algs.includes(13)).map(x=>x.tld);
const others=cf.filter(x=>!x.ds_algs.includes(13)).map(x=>x.tld);
const seed=(s)=>crypto.createHash('sha256').update('509:'+s).digest('hex');
const sample=[...a13, ...others.sort((a,b)=>seed(a)<seed(b)?-1:1).slice(0,100)];
console.log(`cross-check sample: ${sample.length} (all ${a13.length} alg-13 + 100 deterministic others)`);
let agree=0,dis=0; const D=[];
const OUT='research/gtld/crosscheck.jsonl'; fs.writeFileSync(OUT,'');
for(const t of sample){
  const ds=await g(t+'.','DS'), dk=await g(t+'.','DNSKEY');
  const gd=algs(ds,'DS'), gk=algs(dk,'DNSKEY');
  const c=byTld.get(t);
  const ok=JSON.stringify(gd)===JSON.stringify(c.ds_algs)&&JSON.stringify(gk)===JSON.stringify(c.dnskey_algs);
  ok?agree++:dis++; if(!ok) D.push({tld:t,cloudflare:{ds:c.ds_algs,dk:c.dnskey_algs},google:{ds:gd,dk:gk}});
  fs.appendFileSync(OUT,JSON.stringify({tld:t,google_ds:gd,google_dnskey:gk,cf_ds:c.ds_algs,cf_dnskey:c.dnskey_algs,agrees:ok})+'\n');
  await sleep(35);
}
console.log(`resolver agreement: ${agree}/${sample.length}  disagreements: ${dis}`);
if(D.length) console.log(JSON.stringify(D.slice(0,10),null,1));

console.log('\n=== Is nic.{tld} a separately delegated, signed zone?');
const probe=a13.slice(0,40);
let deleg=0,nodeleg=0,nx=0;
for(const t of probe){
  const ds=await g(`nic.${t}.`,'DS');
  if(!ds){nx++;continue;}
  if(ds.Status===3){nx++;}                       // NXDOMAIN
  else if(ds.Answer&&ds.Answer.some(a=>a.type===43)) deleg++;
  else nodeleg++;
  await sleep(35);
}
console.log(`  probed ${probe.length} alg-13 TLDs for nic.{tld} DS:`);
console.log(`    separately delegated AND signed (own DS): ${deleg}`);
console.log(`    no DS (in-zone or unsigned delegation)  : ${nodeleg}`);
console.log(`    NXDOMAIN / no answer                    : ${nx}`);
