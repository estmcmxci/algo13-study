/** Re-parse persisted raw DoH answers. Cloudflare returns algorithm MNEMONICS,
 *  not numbers, so the first parse silently produced empty sets. No new queries. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { toNum } from './dnssec.mjs';   // the mnemonic map this script was written for
const algsFrom = (j, kind) => {
  if (!j || !j.Answer) return [];
  const want = kind === 'DS' ? 43 : 48;
  const idx  = kind === 'DS' ? 1 : 2;   // DS: keytag alg digesttype digest | DNSKEY: flags proto alg key
  return [...new Set(j.Answer.filter(a=>a.type===want)
    .map(a => toNum(String(a.data).trim().split(/\s+/)[idx]))
    .filter(n => n !== null))].sort((a,b)=>a-b);
};
const tlds = JSON.parse(fs.readFileSync('research/gtld/population.json','utf8'));
const OUT='research/gtld/census-v2.jsonl'; fs.writeFileSync(OUT,'');
let unparsed=0;
for (const tld of tlds) {
  const p=`research/gtld/raw/${tld}.json`;
  if(!fs.existsSync(p)){ console.log('MISSING RAW', tld); continue; }
  const body=fs.readFileSync(p,'utf8'); const {ds,dk}=JSON.parse(body);
  const dsA=algsFrom(ds,'DS'), dkA=algsFrom(dk,'DNSKEY');
  const dsN=ds&&ds.Answer?ds.Answer.filter(a=>a.type===43).length:0;
  const dkN=dk&&dk.Answer?dk.Answer.filter(a=>a.type===48).length:0;
  if((dsN>0&&dsA.length===0)||(dkN>0&&dkA.length===0)) unparsed++;
  fs.appendFileSync(OUT, JSON.stringify({tld, ds_status:ds?ds.Status:null, dnskey_status:dk?dk.Status:null,
    ds_ad:ds?!!ds.AD:null, dnskey_ad:dk?!!dk.AD:null, ds_algs:dsA, dnskey_algs:dkA,
    ds_count:dsN, dnskey_count:dkN, raw_sha256:crypto.createHash('sha256').update(body).digest('hex')})+'\n');
}
console.log('re-parsed:', tlds.length, ' records with counts but unparsed algs:', unparsed);
