/**
 * RFC 5011 revoke-flag census across the delegated gTLD population.
 *
 *   node research/gtld/revoke-census.mjs
 *   node research/gtld/revoke-census.mjs --population research/gtld/population-current.json \
 *        --out research/gtld/revoke-census-current.jsonl --raw research/gtld/raw-revoke-current
 *
 * in : research/gtld/population.json         (--population <path> to override)
 * out: research/gtld/revoke-census.jsonl     (--out <path> to override)
 *      research/gtld/raw-revoke/{tld}.json   (--raw <dir> to override)
 *        {cf, gg} answers, both resolvers
 *
 * The pinned July population is the default and reproduces the study. Point
 * --population at population-current.json, which population-current.mjs writes
 * from the live root list, to ask what is delegated today instead. Give --out
 * and --raw with it. Both are the record of one snapshot: the jsonl is resumable
 * and keyed by TLD, so two populations appended to one file would produce a
 * record set that is neither snapshot, and a second pass into the same raw
 * directory would overwrite the archived answers of the first.
 *
 * Why this is a separate script and not a change to census.mjs: that one
 * produced the published figures. Editing it would break reproduction.
 *
 * What it adds over census.mjs:
 *   (a) the DNSKEY flags field, which census.mjs discards. REVOKE lives there.
 *   (b) a second resolver. census.mjs defines google and never calls it, so
 *       every published DNS figure rests on one vantage point.
 *   (c) the AD bit becomes a status (validated, unvalidated, no-answer) and is
 *       compared across the two resolvers, rather than merely recorded.
 *       The field is cf_ad_status / gg_ad_status, not the cf_ad / gg_ad boolean
 *       of the records written before this change. The earlier jsonl lines are
 *       left as they were, so the two shapes stay distinguishable by name.
 *
 *   DNSKEY rdata: "<flags> <protocol> <alg> <key>"
 *                    ^ field 0.  REVOKE = 0x0080, ZONE = 0x0100, SEP = 0x0001.
 *   A zone-signing key reads 256, a KSK 257, and their revoked forms 384 and 385.
 *
 * Cloudflare returns algorithm mnemonics rather than numbers in some answers
 * (see reparse.mjs). Flags are numeric in both resolvers, but the raw answers
 * are archived either way so a later pass can re-read any field without querying.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { adStatus } from './dnssec.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const RESOLVERS = {
  cf: n => `https://cloudflare-dns.com/dns-query?name=${n}&type=DNSKEY`,
  gg: n => `https://dns.google/resolve?name=${n}&type=DNSKEY`,
};
const REVOKE = 0x0080, ZONE = 0x0100, SEP = 0x0001;
const CONCURRENCY = 8;
const PACE = 40;

async function doh(resolver, name, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(RESOLVERS[resolver](name), {headers: {accept: 'application/dns-json'}});
      if (r.ok) return await r.json();
    } catch { /* retry */ }
    await sleep(300 * (i + 1));
  }
  return null;
}

/** Every DNSKEY in an answer, as {flags, revoked, sep, zone, alg}. */
const keysFrom = j => {
  if (!j || !j.Answer) return [];
  return j.Answer.filter(a => a.type === 48).map(a => {
    const p = String(a.data).trim().split(/\s+/);
    const flags = parseInt(p[0], 10);
    if (!Number.isFinite(flags)) return null;
    return {
      flags,
      revoked: (flags & REVOKE) !== 0,
      sep: (flags & SEP) !== 0,
      zone: (flags & ZONE) !== 0,
      alg: p[2] ?? null,
    };
  }).filter(Boolean);
};

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  if (!v || v.startsWith('--')) { console.error(`${name} needs a path`); process.exit(1); }
  return v;
};
const POP = arg('--population', 'research/gtld/population.json');
const OUT = arg('--out', 'research/gtld/revoke-census.jsonl');
const RAW = arg('--raw', 'research/gtld/raw-revoke');

const tlds = JSON.parse(fs.readFileSync(POP, 'utf8'));
fs.mkdirSync(RAW, {recursive: true});
const done = new Set(fs.existsSync(OUT)
  ? fs.readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).tld) : []);
const work = tlds.filter(t => !done.has(t));
console.log(`revoke census: ${tlds.length} TLDs, ${done.size} done, ${work.length} to do`);
console.log(`  population ${POP}\n  out        ${OUT}\n  raw        ${RAW}/`);

let n = 0;
async function one(tld) {
  const observedAt = new Date().toISOString();
  const cf = await doh('cf', tld + '.');
  await sleep(PACE);
  const gg = await doh('gg', tld + '.');
  const kcf = keysFrom(cf), kgg = keysFrom(gg);
  const flagsOf = ks => [...new Set(ks.map(k => k.flags))].sort((a, b) => a - b);
  const rec = {
    tld, observedAt,
    cf_status: cf ? cf.Status : null, gg_status: gg ? gg.Status : null,
    cf_ad_status: adStatus(cf, 48), gg_ad_status: adStatus(gg, 48),
    cf_keys: kcf.length, gg_keys: kgg.length,
    cf_flags: flagsOf(kcf), gg_flags: flagsOf(kgg),
    cf_revoked: kcf.filter(k => k.revoked).length,
    gg_revoked: kgg.filter(k => k.revoked).length,
    // Disagreement between vantage points is itself a finding, so it is recorded
    // rather than resolved. Neither resolver is treated as authoritative.
    agree_flags: JSON.stringify(flagsOf(kcf)) === JSON.stringify(flagsOf(kgg)),
    agree_ad: adStatus(cf, 48) === adStatus(gg, 48),
    raw_sha256: crypto.createHash('sha256').update(JSON.stringify({cf, gg})).digest('hex'),
  };
  fs.appendFileSync(OUT, JSON.stringify(rec) + '\n');
  fs.writeFileSync(`${RAW}/${tld}.json`, JSON.stringify({cf, gg}));
  if (++n % 100 === 0) console.log(`  ${n}/${work.length}`);
}

const queue = [...work];
await Promise.all(Array.from({length: CONCURRENCY}, async () => {
  while (queue.length) await one(queue.shift());
}));
console.log('done');
