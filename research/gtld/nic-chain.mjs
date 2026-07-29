/** The TLDMinter chain is root -> TLD -> nic.{tld} -> _ens.nic.{tld}.
 *  Measure the nic.{tld} zone's own algorithms so n13 per claim can be counted
 *  from observed chain composition rather than modelled. */
import fs from 'node:fs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const MN={RSASHA1:5,'RSASHA1-NSEC3-SHA1':7,RSASHA256:8,RSASHA512:10,ECDSAP256SHA256:13,ECDSAP384SHA384:14,ED25519:15,ED448:16};
const toNum=s=>{const n=parseInt(s,10);return Number.isFinite(n)&&String(n)===String(s).trim()?n:(MN[String(s).toUpperCase()]??null);};
async function q(name,type,tries=4){ for(let i=0;i<tries;i++){ try{
  const r=await fetch(`https://cloudflare-dns.com/dns-query?name=${name}&type=${type}`,{headers:{accept:'application/dns-json'}});
  if(r.ok) return await r.json(); }catch{} await sleep(250*(i+1)); } return null; }
const algs=(j,kind)=>{ if(!j||!j.Answer)return[]; const w=kind==='DS'?43:48,i=kind==='DS'?1:2;
  return [...new Set(j.Answer.filter(a=>a.type===w).map(a=>toNum(String(a.data).trim().split(/\s+/)[i])).filter(x=>x!==null))].sort((a,b)=>a-b); };
const cf=fs.readFileSync('research/gtld/census-v2.jsonl','utf8').trim().split('\n').map(JSON.parse);
const OUT='research/gtld/nic-chain.jsonl'; fs.writeFileSync(OUT,'');
let n=0;
for(const x of cf){
  n++;
  const ds=await q(`nic.${x.tld}.`,'DS');
  const nicDs=algs(ds,'DS');
  let nicDk=[];
  if(nicDs.length){ const dk=await q(`nic.${x.tld}.`,'DNSKEY'); nicDk=algs(dk,'DNSKEY'); }
  fs.appendFileSync(OUT,JSON.stringify({tld:x.tld, tld_ds:x.ds_algs, tld_dnskey:x.dnskey_algs,
    nic_ds:nicDs, nic_dnskey:nicDk, nic_delegated_signed:nicDs.length>0,
    nic_ds_status:ds?ds.Status:null})+'\n');
  if(n%200===0) console.log(`  ${n}/${cf.length}`);
  await sleep(30);
}
console.log('done');
