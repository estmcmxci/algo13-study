/**
 * gTLD algorithm-13 census.
 * For each post-2012 New gTLD Program delegation, measure:
 *   (a) DS algorithm(s) published in the ROOT zone  -> root->TLD link
 *   (b) DNSKEY algorithm(s) in the TLD's own zone   -> TLD->_ens.nic.{tld} link
 * DNS answers are time-varying; resolver and timestamp are recorded per answer.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const RESOLVERS = {
  cloudflare: n => `https://cloudflare-dns.com/dns-query?name=${n}&type=`,
  google:     n => `https://dns.google/resolve?name=${n}&type=`,
};
async function doh(resolver, name, type, tries = 4) {
  const url = RESOLVERS[resolver](name) + type;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {headers: {accept: 'application/dns-json'}});
      if (!r.ok) { await sleep(300 * (i + 1)); continue; }
      const j = await r.json();
      return j;
    } catch { await sleep(300 * (i + 1)); }
  }
  return null;
}
// DS  rdata: "<keytag> <alg> <digesttype> <digest>"
// DNSKEY rdata: "<flags> <protocol> <alg> <key>"
const algsFrom = (j, type) => {
  if (!j || !j.Answer) return [];
  const want = type === 'DS' ? 43 : 48;
  return [...new Set(j.Answer.filter(a => a.type === want)
    .map(a => parseInt(String(a.data).trim().split(/\s+/)[type === 'DS' ? 1 : 2], 10))
    .filter(n => Number.isFinite(n)))].sort((a, b) => a - b);
};
const tlds = JSON.parse(fs.readFileSync('research/gtld/population.json', 'utf8'));
const OUT = 'research/gtld/census.jsonl';
const done = new Set(fs.existsSync(OUT)
  ? fs.readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).tld) : []);
const work = tlds.filter(t => !done.has(t));
console.log(`gTLD census: ${tlds.length} TLDs, ${done.size} done, ${work.length} to do`);
let n = 0;
for (const tld of work) {
  n++;
  const ts = new Date().toISOString();
  const ds = await doh('cloudflare', tld + '.', 'DS');
  const dk = await doh('cloudflare', tld + '.', 'DNSKEY');
  const rec = {
    tld, observedAt: ts, resolver: 'cloudflare',
    ds_status: ds ? ds.Status : null, dnskey_status: dk ? dk.Status : null,
    ds_ad: ds ? !!ds.AD : null, dnskey_ad: dk ? !!dk.AD : null,
    ds_algs: algsFrom(ds, 'DS'), dnskey_algs: algsFrom(dk, 'DNSKEY'),
    ds_count: ds && ds.Answer ? ds.Answer.filter(a => a.type === 43).length : 0,
    dnskey_count: dk && dk.Answer ? dk.Answer.filter(a => a.type === 48).length : 0,
    raw_sha256: crypto.createHash('sha256').update(JSON.stringify({ds, dk})).digest('hex'),
  };
  fs.appendFileSync(OUT, JSON.stringify(rec) + '\n');
  fs.writeFileSync(`research/gtld/raw/${tld}.json`, JSON.stringify({ds, dk}));
  if (n % 100 === 0) console.log(`  ${n}/${work.length}`);
  await sleep(40);
}
console.log('done');
