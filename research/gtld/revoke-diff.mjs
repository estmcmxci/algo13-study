/**
 * DNSKEY churn across the delegated gTLD population, July to November 2026.
 *
 *   node research/gtld/revoke-diff.mjs
 *
 * in : research/gtld/raw/{tld}.json          (census.mjs, late July)
 *      research/gtld/raw-revoke/{tld}.json   (revoke-census.mjs, November)
 * out: research/gtld/revoke-diff.json
 *
 * A snapshot cannot say how often a state occurs, only whether it held at one
 * instant. Two snapshots four months apart can say which zones changed their
 * key set in between, which is the closest thing to a rate this data supports.
 *
 * Keys are compared by tag, since a rollover replaces keys rather than flags:
 * a zone that rolls its KSK publishes a new 257 with a different tag, and the
 * flags multiset alone would not move. The tag is computed from the DNSKEY
 * rdata per RFC 4034 appendix B, so it does not depend on the resolver echoing
 * one, and it is stable across vantage points.
 *
 * Questions this answers:
 *   1. How many gTLDs changed their key set in the interval?
 *   2. Of those, how many published a revoked key at either end?
 *   3. How many left the root entirely?
 */
import fs from 'node:fs';
// The mnemonic map and the keytag both live in dnssec.mjs. Cloudflare returns
// algorithm mnemonics rather than numbers in most answers, and the keytag needs
// the number: a pass written without the map reported 1,097 untaggable TLDs.
import { toNum, keytag } from './dnssec.mjs';

const REVOKE = 0x0080;
const tlds = JSON.parse(fs.readFileSync('research/gtld/population.json', 'utf8'));

/** {tag: flags} for every DNSKEY in a DoH answer, plus the raw flag multiset. */
const keysOf = j => {
  const out = {tags: {}, flags: [], count: 0};
  if (!j || !j.Answer) return out;
  for (const a of j.Answer.filter(x => x.type === 48)) {
    const p = String(a.data).trim().split(/\s+/);
    const flags = parseInt(p[0], 10);
    const proto = toNum(p[1]);
    const alg = toNum(p[2]);
    if (!Number.isFinite(flags) || !p[3]) continue;
    out.flags.push(flags);
    out.count++;
    // Algorithm may arrive as a mnemonic (see reparse.mjs). Without a numeric
    // algorithm the tag cannot be computed, so such keys are counted but not
    // tagged, and the TLD is reported as untaggable rather than unchanged.
    if (Number.isFinite(alg) && Number.isFinite(proto)) {
      out.tags[keytag(flags, proto, alg, p[3])] = flags;
    } else {
      out.untaggable = true;
    }
  }
  out.flags.sort((a, b) => a - b);
  return out;
};

const read = p => fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
const setEq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

const result = {
  interval: {from: 'census.mjs, late July 2026', to: 'revoke-census.mjs, 4 November 2026'},
  population: tlds.length,
  compared: 0,
  unchanged: 0,
  rolled: 0,
  departed: 0,
  appeared: 0,
  untaggable: 0,
  missingEnd: 0,
  revokedEitherEnd: 0,
  departedTlds: [],
  rolledTlds: [],
  revokedTlds: [],
};

for (const tld of tlds) {
  const jul = read(`research/gtld/raw/${tld}.json`);
  const nov = read(`research/gtld/raw-revoke/${tld}.json`);
  if (!jul || !nov) { result.missingEnd++; continue; }
  const a = keysOf(jul.dk);
  // Cloudflare is the primary at both ends, so the comparison is like for like.
  const b = keysOf(nov.cf);
  result.compared++;

  if (a.flags.some(f => f & REVOKE) || b.flags.some(f => f & REVOKE)) {
    result.revokedEitherEnd++;
    result.revokedTlds.push(tld);
  }
  if (a.count > 0 && b.count === 0) { result.departed++; result.departedTlds.push(tld); continue; }
  if (a.count === 0 && b.count > 0) { result.appeared++; continue; }
  if (a.untaggable || b.untaggable) { result.untaggable++; continue; }

  const ta = Object.keys(a.tags).sort(), tb = Object.keys(b.tags).sort();
  if (setEq(ta, tb)) {
    result.unchanged++;
  } else {
    result.rolled++;
    result.rolledTlds.push({
      tld,
      added: tb.filter(t => !ta.includes(t)).map(Number),
      removed: ta.filter(t => !tb.includes(t)).map(Number),
      julFlags: a.flags, novFlags: b.flags,
    });
  }
}

fs.writeFileSync('research/gtld/revoke-diff.json', JSON.stringify(result, null, 2) + '\n');
const {rolledTlds, departedTlds, ...summary} = result;
console.log(JSON.stringify(summary, null, 2));
console.log(`\ndeparted: ${departedTlds.join(', ') || 'none'}`);
console.log(`rolled:   ${rolledTlds.length} TLDs`);
for (const r of rolledTlds.slice(0, 15)) {
  console.log(`  ${r.tld.padEnd(18)} +[${r.added}] -[${r.removed}]  ${JSON.stringify(r.julFlags)} -> ${JSON.stringify(r.novFlags)}`);
}
