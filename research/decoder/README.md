# Independent proof decoder

Deliverable #1 of task `algorithm13-direct-import-empirical`.

Given only the raw calldata of an ENS direct-import call, this decodes the
submitted DNSSEC proof and computes how many times that execution path would
dispatch to the **algorithm-13 (ECDSAP256SHA256) verifier**.

It is an *independent* check on the trace-derived `n13`. It therefore:

- **never consults traces**, receipts, logs or any trace-derived artifact;
- **makes no network calls** anywhere;
- is a **pure function** of its inputs — same input, byte-identical output;
- **never silently drops an input**. Every abnormal condition, including a
  malformed line in a batch file, produces a structured record.

## Usage

```js
import { decodeCall } from './research/decoder/index.mjs'

const record = decodeCall({
  callId: '1:0xabc…:0,1',        // stable call key, echoed through
  calldata: '0x29d56630…',       // full calldata including selector
  registrarVersion: 'current',   // 'current' | 'legacy'
  now: 1552658805,               // optional block timestamp
  algorithmMap: [5, 7, 8, 13],   // optional; see "Open item" below
})
```

Batch:

```sh
node research/decoder/cli.mjs calls.jsonl > decoded.jsonl   # JSONL in, JSONL out
node --test research/decoder/test/decoder.test.mjs          # 35 tests
```

Runs on plain Node (v24 used here). No dependencies beyond `node:crypto`.

## Output record

| field | meaning |
|---|---|
| `n13_decoded` | count of algorithm-13 verifier dispatches implied by the path |
| `algorithms_seen` | sorted unique algorithm IDs encountered in RRSIG, DNSKEY and DS records |
| `proof_depth` | number of RRSets in the submitted chain |
| `matching_key` | key tag of the DNSKEY that validated the final RRSet |
| `matching_keys` | per-depth `{depth, keytag, algorithm, via}` — `via` is `ds` or `known-key` |
| `proof_hash` | deterministic hash over the canonical proof bytes (rule below) |
| `initial_proof_hash` | hash of the seeded proof (legacy calldata arg 3, or the anchors) |
| `proof_shape` | `alg13-only` \| `rsa-only` \| `mixed` \| `other` \| `none` |
| `decode_status` | `ok` \| `malformed` \| `unsupported` |
| `decode_error` | structured `{kind, code, message, …}` when not `ok` |
| `dispatches` | per-dispatch `{depth, algorithm, keytag, verifier_result, engine}` |
| `terminal` | `{outcome: verified \| revert \| undecodable, reason}` |
| `time_checks` | `applied` when `now` was supplied, else `skipped` |

`decode_status` is `ok` for a proof the *contract itself* rejects — that is a
fully modelled path, and dispatches counted before the rejection are real.
`malformed` / `unsupported` mean the *decoder* could not model the path.

`proof_shape` is computed over the algorithms actually **dispatched**, not those
merely present in the wire data, because dispatches are what drive gas.
`shape_basis` records this.

### `proof_hash` rule

```
proof_hash = sha256(
      "ens-dnssec-proof/v1\n"                    ASCII, 20 bytes
   || uint32be(n)                                number of RRSetWithSignature
   || for i in 0..n-1:
          uint32be(len(rrset_i)) || rrset_i
       || uint32be(len(sig_i))   || sig_i
)
```

Length-prefixing every field makes the encoding injective, so no two distinct
proofs can collide through concatenation ambiguity (tested). The hash covers the
proof chain **only** — not the claimed name, the resolver/addr arguments, or the
legacy initial-proof argument — so the same chain submitted through either
registrar hashes identically. `initial_proof_hash` is
`sha256("ens-dnssec-initial-proof/v1\n" || bytes)`.

## What is counted

Exactly one thing: **calls into an algorithm verifier contract**. That is the
single `algorithm.verify(...)` site at the bottom of
`DNSSECImpl.verifySignatureWithKey`, reached only after *all* of:

1. `dnskey.protocol == 3`
2. `dnskey.algorithm == rrset.algorithm`
3. `computeKeytag(keyrdata) == rrset.keytag`
4. `dnskey.flags & 0x100 != 0` (zone-key)
5. `algorithms[dnskey.algorithm] != address(0)` *(current only — see below)*

A DNSKEY that fails any of these produces **no dispatch**.

## Contract semantics reproduced

Authority read, not assumed:

- current oracle `0x0fc3152971714E5ed7723FAFa650F86A4BaF30C5` —
  `contracts/dnssec-oracle/{DNSSECImpl,RRUtils}.sol`
- legacy oracle `0x21745ff62108968fbf5ab1e07961cc0fcbeb2364` —
  recovered from the deployed verified sources in
  `deployments/mainnet/solcInputs/{08371ea7…,40ce5451…}.json`
- legacy registrar `0x58774Bb8…` — `DNSRegistrar.sol` from the same solcInputs

`RRUtils` is byte-identical across all three revisions for every function used
here. The two legacy `DNSSECImpl` revisions differ **only** in the key-tag
implementation (optimised library call vs inline naive loop) — the same RFC 4034
Appendix B checksum — so the modelled path is identical either way.

### Legacy vs current: five real differences, all modelled

| | legacy | current |
|---|---|---|
| **initial proof** | `submitRRSets(input, _proof)` seeds from **calldata arg 3** | `verifyRRSet` seeds from the oracle's `anchors` |
| **signer-name check** | raw byte-suffix compare — *not* label-aligned | `isSubdomainOf` — label-aligned, stricter |
| **`verifyWithDS`** | `return verifyKeyWithDS(...)` on the first self-signed key — final | rewinds the DS iterator and tries the next key, so a **second dispatch is possible at one depth** |
| **unmapped algorithm** | no zero check → call to `address(0)` hits solc's extcodesize guard and **reverts** | `if (address(algorithm) == address(0)) return false;` |
| **`verifyKeyWithDS` owner name** | no check | reverts `ProofNameMismatch` |

The initial-proof difference is the consequential one: the legacy registrar's
third `bytes` argument *is* the trust root for that call, so a legacy proof
cannot be decoded against the anchors.

The current oracle's `anchors` are pinned in `config.mjs` from
`deployments/mainnet/DNSSECImpl.json` `args[0]` — two root DS RRs, key tags
19036 and 20326, algorithm 8, digest type 2.

### Strictness

Where the contract is strict, this is strict. `BytesUtils` bounds-checks every
read and `RRUtils.nameLength` asserts, so out-of-range access is a revert, not a
zero-fill — reproduced as a `malformed` record rather than a silent misparse.
Names are **never** decompressed: the oracle has no message context, so a `0xC0`
byte is a 192-byte label length and will run off the end (tested).

## Why real cryptography

Whether `Algorithm.verify` returns true or false is not cosmetic: it decides
whether the key loop stops or advances to the next candidate, and therefore
changes the dispatch count. Assuming "the first key passing the pre-checks wins"
would make the decoder agree with the traces *by construction*, defeating its
purpose. So signatures are actually verified, via `node:crypto` (a builtin):
P-256 raw `r||s` for algorithm 13, PKCS#1 v1.5 for 5/7/8, with RFC 3110 key
parsing copied from the contract.

## Known limitations — stated, not buried

1. **RSA PKCS#1 v1.5 edge cases.** The contract's `RSAPKCS1Verify` is
   hand-rolled and is not guaranteed byte-identical to OpenSSL's for
   pathological encodings — which is what `TestRSAForgedSignature.test.ts`
   exists to pin down. A divergence would have to occur on a key that *already*
   matched the signer name, algorithm, key tag and zone flag to change any
   count. Each dispatch records its `engine` so any trace/decoder mismatch can
   be traced to this boundary.
2. **Old algorithm-13 verifier behaviour on bad input lengths.** The current
   verifier `require`s a 64-byte signature and 68-byte key and reverts
   otherwise; that is modelled. The two older deployed verifiers
   (`0xe571a50f…`, `0x0faa24e5…`) are available as bytecode only, so their
   behaviour on malformed input is not modelled. The **dispatch is still
   counted** either way — only the continuation would differ. No fixture in the
   population is known to hit this; it is flagged if it does.
3. **Legacy `validProof` storage precondition.** The legacy oracle also requires
   the proof to already be present in its `rrsets` mapping. That is contract
   state, not calldata, so it is not modelled. It gates the whole call, so a
   failure would mean *zero* dispatches; every transaction in the study
   population passed it by construction. Relevant only to the reverted-call
   secondary population.
4. **Time checks are opt-in.** `now` is not in the calldata. Supply it to apply
   the RRSIG inception/expiration checks; omit it and they are skipped, recorded
   as `time_checks: "skipped"`.

## Open item for the research agent

`DEFAULT_ALGORITHM_MAP` is `{5, 7, 8, 13}`, mirroring
`test/fixtures/dnssecFixture.ts` minus the test-only dummy algorithms. The real
per-oracle, per-period `algorithms(id)` map should be read from chain via RPC
and passed in as `algorithmMap`. It changes a count only if a proof carries a
DNSKEY whose algorithm sits outside that set **and** that key matches the
RRSIG's key tag. Until confirmed, the decoder reports such a case rather than
guessing.

## Test provenance

Every vector traces to a checked-in ens-contracts fixture; none is invented.

- `test/dnssec-oracle/fixtures/algorithms.ts` — the RFC 6605 algorithm-13
  vector (DNSKEY `0x0101030d1a88c886…`, alg byte `0x0d` at offset 3) plus the
  RSASHA1 and RSASHA256 vectors.
- `test/dnssec-oracle/TestDNSSEC.test.ts` `test_rrsets` — a real, complete,
  six-deep RSASHA256 chain from the live root anchors down to
  `_ens.ethlab.xyz TXT`, with its pinned timestamp `1552658805`.
- Expected key tags are read out of the RRSIG lines quoted in the fixtures' own
  comments, i.e. the fixtures' ground truth rather than this decoder's output.

The RFC 6605 fixture's `data` field is already a valid `RRSetWithSignature.rrset`
(an RRSIG RDATA header with the signature stripped, followed by the canonical
`www.example.net. A` record). The alg-13 end-to-end test wraps the fixture's own
DNSKEY RDATA in its wire header — owner/type/class/ttl/rdlength taken from the
fixture's comment line — to serve as the initial proof. That is a
re-serialisation of the fixture record, not a new vector: the key bytes and the
signature bytes are unchanged, and the real RFC 6605 signature verifies.
