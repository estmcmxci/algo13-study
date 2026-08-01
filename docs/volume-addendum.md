# Addendum — Did import volume respond to the cost reduction?

Task `algorithm13-direct-import-empirical` (`#f40b5886`) · agent `researcher`

**This addendum retracts a stated non-finding.** The final report previously said the census shows
"no post-`P_ENS` import-volume surge". **That was wrong, and it was wrong because of the ~5-week
duration error.** Believing the realized window was ~5 weeks, I compared a short slice against a
much longer history and saw nothing. Corrected to the true **140.5-day** window and matched against
an equal-length prior window, there is a clear increase. The non-finding was never tested; it was
inferred from a wrong duration.

## 1. The raw effect

Matched 140.5-day windows either side of `P_ENS` (2026-03-09), computed from **actual block
timestamps**, not a blocks-per-day approximation:

| | before (2025-10-19 → 2026-03-09) | after (2026-03-09 → 2026-07-27) | ratio |
|---|---|---|---|
| direct imports | 113 | 315 | **2.79x** |
| unique claimants | 100 | 180 | **1.80x** |
| imports per claimant | 1.13 | 1.75 | 1.55x |
| busiest single day | 7 | 24 | — |

## 2. Controls — normalised against independent baselines

| series | before | after | ratio |
|---|---|---|---|
| **DNS direct imports** | 113 | 315 | **2.79x** |
| total mainnet transactions | 264,761,425 | 319,861,137 | **1.21x** |
| `ENSRegistry` logs | 192,522 | 121,434 | **0.63x** |
| `BaseRegistrar` logs | 292,411 | 241,835 | **0.83x** |
| **median mainnet gas price** | 0.1508 gwei | 0.2150 gwei | **1.43x** |

Two of the proposed confounders are **refuted by measurement**:

- **"Gas fell, lifting all gas-sensitive activity."** Median mainnet gas price **rose 43%** across
  the after-window. Whatever drove the increase, cheaper mainnet gas did not.
- **"General ENS/mainnet activity has its own cycle."** ENS-specific activity **declined** on both
  baselines (0.63x, 0.83x) while DNS imports nearly tripled. Mainnet as a whole grew only 1.21x.
  Normalised against `ENSRegistry` activity, imports rose ~4.4x relative to baseline.

## 3. The confounder that does NOT go away

**A single claimant, `0xd79eaf8396…`, performed 113 of the 315 after-window imports — 36% of the
total.** The largest before-window claimant performed 3. This is exactly the bulk-import scenario
that could manufacture an apparent adoption effect.

Excluding each window's largest claimant from both sides:

| | before | after | ratio |
|---|---|---|---|
| imports excl. top claimant | 110 | 202 | **1.84x** |

**The effect survives at 1.84x, but roughly a third of the headline 2.79x is one actor.** The
residual still exceeds the mainnet baseline (1.21x) and runs opposite to both ENS baselines.

*(98% of after-window claimants were unseen before, but this is weak evidence — a name is imported
once, so claimant turnover is expected regardless of volume.)*

## 4. The changepoint is NOT cleanly attributable to `P_ENS`

`B_precompile` (2025-12-03) is an alternative trigger: anyone tracking EVM capability rather than
ENS routing had a different date, ~3 months earlier.

| changepoint | before | after | ratio | claimant ratio |
|---|---|---|---|---|
| `P_ENS` 2026-03-09 | 113 | 315 | 2.79x | 1.80x |
| `B_precompile` 2025-12-03 | 102 | 203 | 1.99x | 1.85x |

**These two tests are not independent — their windows overlap** (B_precompile's after-window runs
2025-12-03 → 2026-04-23, straddling `P_ENS`). Both show an increase; this design cannot separate
them. Attributing the response specifically to ENS's routing update rather than to precompile
availability is **not supported** by these data.

## 5. Verdict

**The non-finding is retracted. A volume increase is real and survives normalisation.** It is
2.79x raw, 1.84x after removing the largest claimant on each side, against a mainnet baseline of
1.21x and ENS baselines that fell.

**It is NOT established as a causal demand response to the cost reduction.** Three reasons, all of
which would need resolving first:

1. **One actor supplies ~36% of the after-window volume.**
2. **The changepoint is ambiguous** between `P_ENS` and `B_precompile`; the windows overlap.
3. **n is small** — 113 → 315 imports at ~2/day. One coordinated portfolio import moves the ratio
   materially.

This is reported as **a correlation that survived four control tests and failed none**, not as
induced adoption. Calling it induced adoption would require an identification strategy this study
does not have — plausibly a difference-in-differences against a comparable non-DNS ENS flow, or
claimant-level analysis of whether new importers cite cost.

## 6. Effect on the other two stated non-findings

**"No evidence that algorithm-13 cost caused any import to fail" — UNCHANGED.** That rests on a
different measurement: all **39** out-of-gas failures had `n13 = 0`, dying before reaching
algorithm 13 at user-set limits of 50k–100k. Transaction *failure* and demand *suppression* are
distinct mechanisms; the first remains unsupported by the data, and this addendum does not bear on
it. We still do **not** claim the precompile rescued previously-impossible imports.

**Eligibility growth remains independent of ENS gas cost.** The 35.3% → 98.1% adoption curve
reflects DNS zone signing practice, which is exogenous to ENS execution cost — zone operators do not
choose ECDSAP256SHA256 because ENS verification got cheaper. That curve begins rising in 2022, long
before either changepoint. The "floor that grows" framing rests on it and is unaffected by this
addendum either way.

## 7. Provenance

Windows from actual block timestamps (`research/derived/p3-block-timestamps.json`); imports and
claimants from `research/derived/p1-census.jsonl`; baselines from Dune query **8136215**
(2.741 credits). Dune total **60.02 of a 1,000 ceiling**.

---

# Part 2 — Claimant-entry test: which changepoint do new users respond to?

The volume test (Part 1) could not separate `B_precompile` from `P_ENS` because the windows overlap.
This test can, because it uses a different quantity: **the date each distinct address performed its
first-ever DNS direct import**. Clustering at `B_precompile` would mean people responded to the
precompile becoming *available*; clustering at `P_ENS` would mean they responded to **ENS routing to
it** — that is, to this PR.

Bulk claimant `0xd79eaf8396…` is **excluded**. It is an EOA whose lifetime nonce is 122, of which
113 are DNS imports (~93% of everything it has ever done). Its first import is **2026-04-19**, a
single entry in the week of 2026-04-13 — so including it adds **+1 to one week** and does not change
the shape. Both readings are therefore effectively identical; the series below is excl. bulk.

## Weekly first-appearance of new claimants

1,668 distinct claimants exist across the whole census; 294 first appear inside the 2025-09 → 2026-07
window.

| period | new claimants | weeks | rate |
|---|---|---|---|
| 2025-09-01 → `B_precompile` | 55 | 13.4 | **4.10 / wk** |
| `B_precompile` → `P_ENS` | 68 | 13.6 | **4.98 / wk** |
| `P_ENS` → cutoff | 171 | 20.1 | **8.52 / wk** |

Weekly detail around the two changepoints:

```
2025-11-10   6  ######
2025-11-17   4  ####
2025-11-24   4  ####
2025-12-01   4  ####            <== B_precompile
2025-12-08   2  ##
2025-12-15   2  ##
2025-12-22   4  ####
2025-12-29   5  #####
2026-01-05   4  ####
2026-01-12   6  ######
2026-01-19   6  ######
2026-01-26   5  #####
2026-02-02   4  ####
2026-02-09   4  ####
2026-02-16   9  #########
2026-02-23  10  ##########
2026-03-02   3  ###
2026-03-09  16  ################   <== P_ENS
2026-03-16   8  ########
2026-03-23  19  ###################
2026-03-30   7  #######
2026-04-06  19  ###################
2026-04-13  19  ###################
2026-04-20  17  #################
2026-04-27   4  ####
2026-05-04  12  ############
2026-05-11   7  #######
2026-05-18   6  ######
2026-05-25   4  ####
2026-06-01   4  ####
```

## Reading

**`B_precompile` shows no discontinuity.** Its week records 4 new claimants — exactly the
pre-period mean of 4.10 — and the four weeks following it are 2, 2, 4, 5, i.e. **at or below**
baseline. The `B_precompile → P_ENS` rate of 4.98/wk is nominally above the 4.10/wk before it, but
every week in that stretch (2–10) falls inside the range already observed beforehand (2–7, with a 9
and 10 in the two weeks immediately *preceding* `P_ENS`). There is no visible break at the
precompile's activation.

**`P_ENS` shows a clear discontinuity.** Its week jumps to **16**, higher than any of the preceding
26 weeks (previous maximum 10). Elevation is sustained for roughly seven weeks — 16, 8, 19, 7, 19,
19, 17 — against a prior ceiling of 10.

**Two honest qualifications, both visible in the table:**

1. **There is a run-up before `P_ENS`.** The two weeks immediately prior record 9 and 10, above the
   2–7 baseline. So the break is not perfectly clean at the changepoint. This could be anticipation
   (the governance proposal was public before execution), or simply noise at this n.
2. **The elevation decays back to baseline.** From 2026-05-11 onward the series returns to 7, 6, 4,
   4, 6, 4, 2, 4, 2, 6, 4, 1 — indistinguishable from the pre-period. **This looks like a one-time
   burst rather than a permanently higher adoption rate** — consistent with a backlog of
   cost-deferred imports clearing, not with a new steady state.

## Verdict on attribution

**The data support `P_ENS`, not `B_precompile`.** New-claimant entry shows no response when the
precompile became available in December, and a marked response when ENS routed algorithm 13 to it in
March. On this method, the volume correlation is associated with **the ENS wiring change — this
PR — rather than with Ethereum shipping the precompile**.

**This is a visual reading of a table, deliberately not a fitted changepoint model.** At 294 entries
over 47 weeks, formal changepoint inference would overstate precision. The claim is that one
candidate date shows a break and the other does not — not that the break is statistically certified.

Combined with Part 1, the strongest defensible statement is: **direct-import activity and new-user
entry both rose after `P_ENS`, the rise survives normalisation against mainnet and ENS baselines and
against removal of the bulk importer, it is not visible at `B_precompile`, and it decays toward
baseline after ~7 weeks.** That is consistent with induced adoption of a backlog. It is not proof of
it, and the decay argues against reading it as a permanent step change in demand.
