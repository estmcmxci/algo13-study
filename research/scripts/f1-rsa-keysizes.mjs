/**
 * TASK 1 (v2): RSA modulus-size distribution in the ACTUAL import proofs.
 *
 * PRIMARY signal: for RSA (PKCS#1 v1.5) the SIGNATURE length equals the modulus
 * length exactly, and the signature is carried alongside every RRset. So
 * sig.length x 8 IS the modulus size, per signed RRset, with no key parsing.
 * The RRSIG algorithm comes from readSignedSet.
 *
 * CORROBORATION: parse DNSKEY RDATA (RFC 3110 exponent-prefixed) via the
 * decoder's own primitives and check the two agree.
 *
 * Level from RRSIG.labels: 0 = root, 1 = TLD, 2+ = leaf.
 */
import fs from 'node:fs';
import { decodeCalldata } from '../decoder/abi.mjs';
import { readSignedSet, RRIterator, TYPE_DNSKEY, readDNSKEY } from '../decoder/wire.mjs';

const RSA = new Set([1, 5, 7, 8, 10]);
const modulusBitsFromKey = (pub) => {
  if (pub.length < 3) return null;
  let explen = pub[0], off = 1;
  if (explen === 0) { explen = (pub[1] << 8) | pub[2]; off = 3; }
  const modLen = pub.length - off - explen;
  return modLen > 0 ? modLen * 8 : null;
};
const calls = JSON.parse(fs.readFileSync('research/derived/p1-calls-for-decode.json', 'utf8'));
const OUT = 'research/derived/f1-rsa-keysizes.jsonl'; fs.writeFileSync(OUT, '');
let ok = 0, bad = 0, agree = 0, disagree = 0;
const sigDist = {}, byLevel = {}, perCall = [];
for (const c of calls) {
  let dec;
  try { dec = decodeCalldata(Buffer.from(c.calldata.slice(2), 'hex')); } catch { bad++; continue; }
  const rows = [];
  for (const el of dec.input || []) {
    let ss; try { ss = readSignedSet(el.rrset); } catch { continue; }
    const alg = ss.algorithm, labels = ss.labels;
    const lvl = labels === 0 ? 'root' : labels === 1 ? 'tld' : 'leaf';
    if (RSA.has(alg)) {
      const bits = el.sig.length * 8;
      sigDist[bits] = (sigDist[bits] || 0) + 1;
      byLevel[lvl] ??= {}; byLevel[lvl][bits] = (byLevel[lvl][bits] || 0) + 1;
      rows.push({ alg, bits, level: lvl });
      // corroborate against any DNSKEY in this rrset
      try {
        const it = new RRIterator(ss.data, 0);
        while (!it.done()) {
          if (it.dnstype === TYPE_DNSKEY) {
            const rd = it.rdata(); const k = readDNSKEY(rd, 0, rd.length);
            if (RSA.has(k.algorithm)) {
              const kb = modulusBitsFromKey(k.publicKey);
              if (kb) (kb === bits ? agree++ : disagree++);
            }
          }
          it.next();
        }
      } catch {}
    } else {
      rows.push({ alg, bits: null, level: lvl });
    }
  }
  if (!rows.length) { bad++; continue; }
  ok++;
  perCall.push({ callId: c.callId, period: c.period, rows });
  fs.appendFileSync(OUT, JSON.stringify({ callId: c.callId, period: c.period, rows }) + '\n');
}
console.log(`calls parsed: ${ok}   unparsed: ${bad}`);
console.log(`DNSKEY-vs-signature-length corroboration: agree ${agree}, disagree ${disagree}`);
const tot = Object.values(sigDist).reduce((a, b) => a + b, 0);
console.log(`\nRSA MODULUS SIZE, per signed RRset (n=${tot} RSA-signed RRsets):`);
for (const [b, n] of Object.entries(sigDist).sort((a, b) => Number(a[0]) - Number(b[0])))
  console.log(`  ${String(b).padStart(5)}-bit  ${String(n).padStart(6)}  ${(100 * n / tot).toFixed(1).padStart(5)}%`);
console.log('\nBY LEVEL:');
for (const lk of ['root', 'tld', 'leaf']) {
  const d = byLevel[lk]; if (!d) continue;
  const t = Object.values(d).reduce((a, b) => a + b, 0);
  console.log(`  ${lk.padEnd(5)} n=${String(t).padStart(6)}  ` +
    Object.entries(d).sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([b, n]) => `${b}b ${(100 * n / t).toFixed(1)}%`).join('   '));
}
fs.writeFileSync('research/derived/f1-rsa-summary.json', JSON.stringify({ sigDist, byLevel, ok, bad, agree, disagree }, null, 1));
