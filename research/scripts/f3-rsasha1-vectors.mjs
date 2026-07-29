/** Real (key, data, sig) triples for RSASHA1 (algorithms 5 and 7), keyed by
 *  (algorithm, modulus bits). The earlier extractor keyed on bits alone and
 *  stopped at four, so it only ever captured algorithm 8.
 *
 *  This matters because RSASHA1 does NOT share algorithm 8's cost curve: the
 *  EVM has no SHA-1 precompile, so the digest is computed in Solidity. Pricing
 *  RSASHA1 with RSASHA256's per-size costs would be an assumption, not a
 *  measurement. */
import fs from 'node:fs';
import { decodeCalldata } from '../decoder/abi.mjs';
import { readSignedSet, RRIterator, TYPE_DNSKEY } from '../decoder/wire.mjs';
import { verifySignature } from '../decoder/algorithms.mjs';

const keytag = (rd) => {              // RFC 4034 Appendix B
  let ac = 0;
  for (let i = 0; i < rd.length; i++) ac += (i & 1) ? rd[i] : rd[i] << 8;
  ac += (ac >> 16) & 0xffff;
  return ac & 0xffff;
};

const calls = JSON.parse(fs.readFileSync('research/derived/p1-calls-for-decode.json', 'utf8'));
const captured = new Map();           // key: `${alg}:${bits}`
let scanned = 0;

for (const c of calls) {
  let d; try { d = decodeCalldata(Buffer.from(c.calldata.slice(2), 'hex')); } catch { continue; }
  scanned++;
  for (const el of d.input || []) {
    let ss; try { ss = readSignedSet(el.rrset); } catch { continue; }
    if (![5, 7].includes(ss.algorithm)) continue;      // RSASHA1 only
    if (ss.typeCovered !== TYPE_DNSKEY) continue;      // self-signed: key is in the set
    const bits = el.sig.length * 8;
    const k = `${ss.algorithm}:${bits}`;
    if (captured.has(k)) continue;
    try {
      const it = new RRIterator(ss.data, 0);
      while (!it.done()) {
        if (it.dnstype === TYPE_DNSKEY) {
          const rd = it.rdata();
          if (keytag(rd) === ss.keytag) {
            // the triple must actually verify before it is worth measuring
            if (verifySignature(ss.algorithm, rd, el.rrset, el.sig)) {
              captured.set(k, {
                algorithm: ss.algorithm, bits, tx: c.tx,
                key: Buffer.from(rd).toString('hex'),
                data: Buffer.from(el.rrset).toString('hex'),
                sig: Buffer.from(el.sig).toString('hex'),
              });
            }
            break;
          }
        }
        it.next();
      }
    } catch {}
  }
}

const out = [...captured.values()].sort((a, b) => a.algorithm - b.algorithm || a.bits - b.bits);
fs.writeFileSync('research/derived/f3-rsasha1-vectors.json', JSON.stringify(out, null, 1));
console.log(`scanned ${scanned} calls; captured ${out.length} RSASHA1 vectors`);
for (const v of out) console.log(`  alg ${v.algorithm}  ${v.bits}-bit  key=${v.key.length / 2}B data=${v.data.length / 2}B sig=${v.sig.length / 2}B`);
if (!out.length) console.log('  NONE — self-signed DNSKEY sets may not exist for alg 5/7 in this population');
