/**
 * Shared DNSSEC parsing helpers for the gTLD census scripts.
 *
 * Three things live here because several callers need them and the copies had
 * already begun to diverge:
 *
 *   MNEMONIC, toNum   Cloudflare returns algorithm mnemonics rather than
 *                     numbers. reparse.mjs exists because the first parse did
 *                     not allow for this and silently produced empty sets.
 *                     root-census.mjs carried a second copy of the map that was
 *                     missing DH, and the keytag pass wanted a third.
 *   keytag            RFC 4034 appendix B. A rollover replaces keys rather than
 *                     flags, so key identity has to be computed from the rdata
 *                     instead of read off the answer.
 *   adStatus          The AD bit as a classification. census.mjs writes the bit
 *                     to every record and nothing reads it, so an answer that
 *                     did not validate is counted the same as one that did.
 *
 * census.mjs keeps its own copies of the first two. It produced the published
 * figures, so it is not edited.
 */

/** DNSSEC algorithm numbers (IANA DNSSEC Algorithm Numbers), by mnemonic. */
export const MNEMONIC = { RSAMD5:1, DH:2, DSA:3, RSASHA1:5, 'DSA-NSEC3-SHA1':6,
  'RSASHA1-NSEC3-SHA1':7, RSASHA256:8, RSASHA512:10, 'ECC-GOST':12,
  ECDSAP256SHA256:13, ECDSAP384SHA384:14, ED25519:15, ED448:16 };

/** An algorithm field, numeric or mnemonic, as a number. null if neither. */
export const toNum = s => {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && String(n) === String(s).trim()
    ? n : (MNEMONIC[String(s).toUpperCase()] ?? null);
};

/** RFC 4034 appendix B keytag, over the wire-format rdata. */
export const keytag = (flags, protocol, algorithm, keyB64) => {
  const key = Buffer.from(keyB64, 'base64');
  const rdata = Buffer.concat([
    Buffer.from([flags >> 8, flags & 0xff, protocol, algorithm]),
    key,
  ]);
  if (algorithm === 1) { // RSAMD5 uses the trailing bytes directly
    return ((rdata[rdata.length - 3] << 8) + rdata[rdata.length - 2]) & 0xffff;
  }
  let ac = 0;
  for (let i = 0; i < rdata.length; i++) ac += (i & 1) ? rdata[i] : rdata[i] << 8;
  ac += (ac >> 16) & 0xffff;
  return ac & 0xffff;
};

/** The three states an answer can be in, as far as validation goes. */
export const AD_STATUS = {
  VALIDATED:   'validated',    // the resolver set AD, so it checked the chain
  UNVALIDATED: 'unvalidated',  // records arrived, AD clear
  NO_ANSWER:   'no-answer',    // nothing to classify
};

/**
 * Classify a DoH JSON answer: validated, unvalidated, or no-answer.
 *
 * no-answer covers both an absent response (the query failed after its
 * retries) and a response that carries no records of the type asked for. An
 * unsigned zone reaches the second case legitimately, so the two are one
 * class here; the response Status is recorded separately and tells them apart.
 *
 * @param {object|null} j    parsed DoH JSON, or null if the query failed
 * @param {number} [type]    RR type to require, e.g. 48 for DNSKEY. Omit to
 *                           accept any record in the answer section.
 */
export const adStatus = (j, type) => {
  if (!j || !Array.isArray(j.Answer)) return AD_STATUS.NO_ANSWER;
  const rr = type === undefined ? j.Answer : j.Answer.filter(a => a.type === type);
  if (!rr.length) return AD_STATUS.NO_ANSWER;
  return j.AD ? AD_STATUS.VALIDATED : AD_STATUS.UNVALIDATED;
};
