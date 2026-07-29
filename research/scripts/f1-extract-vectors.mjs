/** Real (key, data, sig) triples per RSA modulus size, taken from actual proofs.
 *  For a self-signed DNSKEY RRset the signing key is inside the set; match it by
 *  keytag (RFC 4034 App. B). `data` is the SignedSet buffer itself — RRSIG RDATA
 *  minus the signature, followed by the canonical RRs — which is exactly what
 *  Algorithm.verify receives. */
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
const captured = new Map();
let scanned = 0;
for (const c of calls) {
  let d; try { d = decodeCalldata(Buffer.from(c.calldata.slice(2), 'hex')); } catch { continue; }
  scanned++;
  for (const el of d.input || []) {
    let ss; try { ss = readSignedSet(el.rrset); } catch { continue; }
    if (![5,7,8,10].includes(ss.algorithm)) continue;
    if (ss.typeCovered !== TYPE_DNSKEY) continue;      // self-signed set: key is inside
    const bits = el.sig.length * 8;
    if (captured.has(bits)) continue;
    try {
      const it = new RRIterator(ss.data, 0);
      while (!it.done()) {
        if (it.dnstype === TYPE_DNSKEY) {
          const rd = it.rdata();
          if (keytag(rd) === ss.keytag) {
            // prove the triple actually verifies before keeping it
            if (verifySignature(ss.algorithm, rd, el.rrset, el.sig)) {
              captured.set(bits, { algorithm: ss.algorithm, bits,
                key: Buffer.from(rd).toString('hex'),
                data: Buffer.from(el.rrset).toString('hex'),
                sig: Buffer.from(el.sig).toString('hex') });
            }
            break;
          }
        }
        it.next();
      }
    } catch {}
  }
  if (captured.size >= 4) break;
}
console.log('calls scanned:', scanned, ' sizes captured:', [...captured.keys()].sort((a,b)=>a-b).join(', '));
for (const [b, v] of [...captured].sort((a,b)=>a[0]-b[0]))
  console.log(`  ${b}-bit alg=${v.algorithm} key=${v.key.length/2}B data=${v.data.length/2}B sig=${v.sig.length/2}B  VERIFIES`);
fs.writeFileSync('research/derived/f1-real-vectors.json', JSON.stringify([...captured.values()], null, 1));
