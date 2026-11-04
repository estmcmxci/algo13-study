/**
 * Re-read the July census answers for the DNSKEY flags field. No new queries.
 *
 *   node research/gtld/revoke-reparse.mjs
 *
 * in : research/gtld/raw/{tld}.json   (archived by census.mjs)
 * out: research/gtld/revoke-historical.json
 *
 * census.mjs parsed field 2 of each DNSKEY rdata, the algorithm, and discarded
 * the rest. Field 0 is the flags word, which carries RFC 5011's REVOKE bit.
 * The archived answers still hold it, so the historical figure costs nothing.
 *
 * Same spirit as reparse.mjs: the raws are the record, the parse is not.
 */
import fs from 'node:fs';

const REVOKE = 0x0080;
const tlds = JSON.parse(fs.readFileSync('research/gtld/population.json', 'utf8'));

let signed = 0, revoked = 0, nodata = 0, missing = 0;
const revokedTlds = [];
const histogram = {};

for (const tld of tlds) {
  const path = `research/gtld/raw/${tld}.json`;
  if (!fs.existsSync(path)) { missing++; continue; }
  const dk = (JSON.parse(fs.readFileSync(path, 'utf8')) || {}).dk || {};
  const answers = (dk.Answer || []).filter(a => a.type === 48);
  if (!answers.length) { nodata++; continue; }
  signed++;
  let hit = false;
  for (const a of answers) {
    const flags = parseInt(String(a.data).trim().split(/\s+/)[0], 10);
    if (!Number.isFinite(flags)) continue;
    histogram[flags] = (histogram[flags] ?? 0) + 1;
    if (flags & REVOKE) hit = true;
  }
  if (hit) { revoked++; revokedTlds.push(tld); }
}

const out = {
  source: 'research/gtld/raw/{tld}.json, archived by census.mjs',
  population: tlds.length,
  withDnskey: signed,
  noDnskeyData: nodata,
  noRawFile: missing,
  withRevokedKey: revoked,
  revokedTlds,
  flagsHistogram: histogram,
};
fs.writeFileSync('research/gtld/revoke-historical.json', JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out, null, 2));
