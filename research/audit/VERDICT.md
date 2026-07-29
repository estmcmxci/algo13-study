# Independent verification verdict

Task `algorithm13-direct-import-empirical` · auditor: `oakgroup-claude`
Scope: re-derive the published headline figures from raw sources without reading
any derivation, without importing anything from `research/scripts/**`.

Code: `research/audit/{rpc,a1-population,a2b,a3-figures,a4-basis,a5-basis2,a6-reverted}.mjs`
Outputs: the matching `*.json` in the same directory.
Reused: `research/decoder/**` only (authored by this agent).

**Basis note.** This audit was run before the basis ruling moved to the HARNESS
basis. I have NOT retrofitted my numbers. Where the ruling changes a verdict I
state both the harness-basis result and the transaction-receipt result, and say
which framing each row uses.

---

## Verdict table

| figure | published value | my independently derived value | verdict | how I derived it |
|---|---|---|---|---|
| **1. per-verification saving** | 1,330,213 (1,340,706 → 10,493) | **1,330,213** (direct) and **1,329,589** (census) | **REPRODUCED** | Two independent paths. (a) Installed each pinned verifier bytecode at a scratch address on an Osaka fork, keccak-asserted the read-back, called `Algorithm.verify()` once with the RFC 6605 vector: old-current 1,339,194 exec, new 8,981 exec → delta 1,330,213. (b) `mean(delta_gas / n13)` over 778 current-oracle successful replay calls = 1,329,589. The two agree to 0.05%. |
| **1b. absolute per-verification levels** | 1,340,706 old / 10,493 new | **1,339,194 old / 8,981 new** (my basis) | **DIFFERS** (constant offset) | Same direct measurement as above. My values sit exactly 1,512 gas below yours on *both* sides, so the delta is identical. The offset is measurement context (top-level call, intrinsic subtracted) vs in-situ call overhead. Not a disagreement about the saving. |
| **2. ratio** | 127.8x | **149.1x** on my basis | **DIFFERS** | 1,339,194 / 8,981. The ratio is extremely sensitive to the 1,512-gas offset above, because it lands on a ~10k denominator: the same delta yields 128x, 149x, or 107x depending on how new-side call overhead is attributed. **Recommend publishing the saving (1,330,213, robust) and treating the ratio as basis-qualified.** |
| **2b. % reduction** | 99.1% | **99.33%** (my basis), 99.22% (yours) | **REPRODUCED** to the headline | 1 − 8,981/1,339,194. Insensitive at this magnitude; any basis rounds to ~99%. |
| **3. realized gas saved** | 1,123,866,630 | **1,123,866,630** | **REPRODUCED** exactly | Summed `delta_gas` over the 315 realized-period successful calls (block ≥ 24,619,423, ≤ 25,627,360) after de-duplicating `p3-replay.jsonl`. Intrinsic cancels between variants, which is why this figure is basis-independent. |
| **4. realized totals** | 200,395,968 new / 1,324,262,598 old | **identical on the harness basis**; **242,497,608 / 1,366,364,238** on transaction receipts | **REPRODUCED (harness basis)** | Tested five candidate bases. `sum(gas_new)` and `sum(gas_old)` match your figures to the gas. Separately fetched all 315 receipts fresh from mainnet for the transaction-level number. See caveat below. |
| **5. mean per import** | 636,178 new / 4,204,008 old | **identical on the harness basis**; **769,834 / 4,337,664** on receipts | **REPRODUCED (harness basis)** | Same totals ÷ 315 distinct realized transactions. |
| **6. verifications + split** | 9,931 · 6,444 / 3,449 / 38 | **9,931 · 6,444 / 3,449 / 38** | **REPRODUCED** exactly | Ran my own decoder over the raw calldata of all 2,127 registrar calls, counting dispatch sites. Zero decode failures. Fully independent of traces and of the replay. |
| **7a. imports** | 2,145 | **2,145** | **REPRODUCED** | `eth_getLogs` direct from mainnet for both `Claim` topics on both registrars, block 13,000,000 → 25,627,360. 2,145 events / 2,145 distinct txs (1,324 legacy, 821 current). |
| **7b. registrar calls** | 2,127 | **2,127** | **REPRODUCED** | Walked the 2,127 raw Parity flat-trace files, counting non-errored calls to either registrar with one of the four direct-import selectors. 1,306 legacy / 821 current. |
| **7c. reverted** | 156 | 156 present, 154 tx-level failures | **UNREPRODUCIBLE (completeness)** | Exhaustive enumeration needs `trace_filter` over 12.5M blocks; gated on this endpoint tier. I could only validate, not enumerate. Validity check below. |
| **8. elapsed / rate** | 4.93 years · 1.19 imports/day | **4.927 years · 1.193/day** | **REPRODUCED** | First claim block 13,083,904 (ts 1,629,752,769) → last 25,622,490 (ts 1,785,135,371) = 1,798.41 days. 2,145 / 1,798.41. |
| **9. headroom** | 6.6x | **6.608x** (harness basis), **5.63x** (receipts), **7.30x** (oracle-exec only) | **REPRODUCED (harness basis)** | Ratio of the figure-4 totals. Flagged as the most basis-sensitive number in the set. |

---

## Caveat on the harness basis (figures 4, 5, 9)

I reproduce your totals exactly under the harness basis, so this is a
methodological objection, not a numerical one.

`gas_old` / `gas_new` are whole-oracle gas **plus an intrinsic computed on a
synthetic standalone oracle call**. That intrinsic corresponds to nothing that
happened on chain: the real transaction pays intrinsic once, on *registrar*
calldata, not on a fabricated `verifyRRSet` call. Three bases, all defensible
except the middle one:

| basis | realized new total | mean/import |
|---|---|---|
| transaction receipts (real) | 242,497,608 | 769,834 |
| registrar-call gas from raw traces | 217,357,127 | 690,023 |
| harness = oracle exec + synthetic intrinsic | 200,395,968 | 636,178 |

Figure 3 is untouched — intrinsic is identical on both variants and cancels.
But "mean gas per import" on the harness basis is not the gas an importer paid.
If the published wording implies a per-transaction cost, receipts are the honest
denominator.

---

## Findings not asked about

1. **`c3-imported-names.json` contains 2,146 rows — one past the cutoff.**
   `clyeh.xyz`, tx `0x78569baee19d55f8820e95124002354863997cb260a506ca7e867da05f2da492`,
   block **25,628,006**, i.e. 646 blocks beyond the stated 25,627,360. At the
   cutoff there are exactly 2,145. The names artifact and the population figure
   disagree by one row.

2. **Two of the 156 "reverted" rows are transaction-level successes.**
   `0xe7036fdff03723d2ab0df13e67a6cb4a2acd44e2c2e25518a13533b71625c3f2` and
   `0xdfe2a8a4bff5f35de75df4189a8f570d0697660da2075084768c1de15ac95099` both have
   receipt status `0x1`. Legitimate as *call*-level reverts inside successful
   transactions, but the label mixes two populations. 151 of 156 are top-level
   calls to a registrar with a direct-import selector.

3. **One call was never successfully replayed.** `1:0x1a56de84223c86117563d2d0041f7943e028a1dd903bdc310f1504de92c355c3:`
   — both attempts died with `calldata truncated reading arg 2`. Reverted
   population, legacy, block 14,865,359, so figures 3–5 are unaffected. Coverage
   is **2,282 / 2,283**, not complete. This is my harness failing on malformed
   calldata instead of recording a structured status.

4. **The legacy verifier is ~23% more expensive than the current-oracle one:**
   1,644,360 vs 1,339,194 gas per verification (both directly measured,
   keccak-asserted). Since the legacy oracle governs 1,306 of 2,127 calls, any
   single "old per-verification" constant is a blend of two very different
   artifacts. Recommend reporting per-verifier.

5. **`p3-replay.jsonl` retry structure is sound.** 2,716 rows over 2,283 callIds;
   433 ids have two rows; all 88 disagreements are error-then-retry. **Zero
   disagreements between successful rows** — determinism holds across retries.
   Dedup rule used: keep the successful row, require agreement among successes.

6. **Algorithm-7 labelling.** The "RSASHA1 38" is algorithm 5 (30) plus
   algorithm 7 (8). Algorithm 7 is RSASHA1-NSEC3-SHA1, a distinct DNSSEC
   algorithm that ENS routes to the same `RSASHA1Algorithm` contract. Grouping is
   defensible; the label loses the distinction.

---

## Security incident (auditor-caused)

While probing, I declared `const URL = <endpoint>` in an inline script, shadowing
the global `URL` constructor. `fetch` threw, and Node's `TypeError` embedded the
full endpoint **including the API key** in its message, which printed to output.
**`MAINNET_API_KEY` in `ens-contracts/.env` must be rotated.** All endpoint
access is now routed through `research/audit/rpc.mjs`, which never binds the name
`URL` and scrubs every error before it can surface.
