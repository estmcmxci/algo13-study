# gTLD Algorithm-13 Census — forward relevance of PR #509 to TLDMinter

Task `algorithm13-direct-import-empirical` (`#f40b5886`) · agent `researcher`

**Conditional framing, deliberately.** TLDMinter is at
[temp check](https://discuss.ens.domains/t/temp-check-authorize-tldminter-as-root-controller/22020),
not passed, and April 2026-round gTLD delegation is estimated at 2028 earliest. Nothing here says
TLD onboarding will happen. It says: **if** TLD onboarding proceeds through this mechanism, **then**
the algorithm-13 verifier cost applies to it, and this is the measured algorithm mix it would meet.

**Why the two are the same cost path.** The proposal states TLDMinter verifies the submitted
proof chain via "the existing `DNSSECImpl` oracle, the same oracle ENS already uses for DNS name
imports". That is the oracle whose algorithm-13 verifier PR #509 made **128x** cheaper. Registry-level
TLD onboarding and ENSIP-6 name import are therefore not separate cost paths.

## 1. Population — and a discrepancy with the proposal

Source: ICANN `gtlds.json` (`https://www.icann.org/resources/registries/gtlds/v2/gtlds.json`),
sha256 `b2915313d4d6d107…`, fetched 2026-07-28. Cross-referenced against the IANA root zone list
(`data.iana.org/TLD/tlds-alpha-by-domain.txt`, version 2026072702).

> **Reproducing this: use the committed snapshot, not a live fetch.** ICANN's `gtlds.json` changes
> as TLDs are delegated and terminated, so re-fetching it today will not reproduce the counts below.
> The exact bytes this census was computed from are archived at
> [`research/gtld/raw/icann-gtlds-v2.json`](../research/gtld/raw/icann-gtlds-v2.json) and match the
> sha256 above. The resulting population is committed at
> [`research/gtld/population.json`](../research/gtld/population.json) (1,099 entries), alongside the
> per-TLD snapshots in `research/gtld/raw/` and `research/gtld/raw-root/` and the scripts that
> produced them.

**Measured population: 1,099** — delegated 2013-01-01 or later, not contract-terminated, no removal
date. All 1,099 are present in the IANA root list; **zero** delegation records lack a root entry.

**The proposal cites 1,166. No definition I can construct reproduces that number:**

| definition | count | vs 1,166 |
|---|---|---|
| post-2012, live (no termination, no removal) | **1,099** | −67 |
| post-2012, not removed from root | 1,106 | −60 |
| post-2012, not contract-terminated | 1,101 | −65 |
| post-2012, all delegations ever incl. terminated | 1,243 | +77 |
| all delegations ever, live | 1,117 | −49 |

1,166 sits between the live count (1,099) and the all-ever count (1,243), which is what a **snapshot
taken before some delegations were removed** would look like. 142 contracts are terminated and 137
carry a removal date. **The most likely reading is that the allowlist is stale by roughly 67
entries** — worth checking before the list is used normatively, since an allowlist containing
removed TLDs would authorise claims on strings no longer delegated.

I have not adopted 1,166. All rates below use the measured 1,099.

## 2. Method

DNS-over-HTTPS JSON against **Cloudflare `1.1.1.1`** (`cloudflare-dns.com/dns-query`), observation
window **2026-07-28 19:00:04Z → 19:04:01Z**. Every raw answer persisted (1,101 files) and sha256'd;
per-record checksums in `research/gtld/census-v2.jsonl`.

DNS answers are time-varying in a way on-chain data is not, so resolver and timestamp are recorded
per record rather than once for the run.

**One parser defect, caught and corrected.** Cloudflare returns the DNSSEC algorithm as a
*mnemonic* (`RSASHA256`) where Google returns an integer. My first parse used `parseInt` and
silently produced empty algorithm sets for all 1,099 TLDs — a 100%-loss failure that presented as
"0% algorithm 13" rather than as an error. Caught because *every* record was empty, which is not a
plausible measurement. Re-parsed from the persisted raw answers with a mnemonic map; **zero
additional DNS queries were needed**, which is the practical argument for persisting raw responses.

**Independent-resolver cross-check:** all 126 algorithm-13 TLDs plus 100 deterministically-sampled
others (seed 509), re-queried against **Google `8.8.8.8`** (`dns.google/resolve`).
**226/226 agreement, 0 disagreements**, on both DS and DNSKEY algorithm sets.

## 3. Results — signing status

| category | count | share |
|---|---|---|
| signed (DS in root **and** DNSKEY in zone) | **1,099** | **100.0%** |
| unsigned (no DS in root) | 0 | 0.0% |
| DS present but DNSKEY missing | 0 | 0.0% |
| unresolvable / resolver error | 0 | 0.0% |

Every post-2012 gTLD is DNSSEC-signed. The unsigned and unresolvable categories are **empty rather
than omitted** — reported explicitly so their absence is a measurement, not a silent exclusion.

## 4. Results — algorithms, root→TLD and TLD zone

**(a) DS algorithm published in the root zone** — the root→TLD link:

| algorithm | count | share of 1,099 |
|---|---|---|
| 8 (RSASHA256) | 947 | 86.2% |
| **13 (ECDSAP256SHA256)** | **126** | **11.5%** |
| 10 (RSASHA512) | 25 | 2.3% |
| 7 (RSASHA1-NSEC3-SHA1) | 1 | 0.1% |

**(b) DNSKEY algorithm in the TLD's own zone** — identical distribution: 947 / 126 / 25 / 1.

**The joint picture is degenerate: DS and DNSKEY agree in every single case.** Zero TLDs publish a
DS under one algorithm and a DNSKEY under another. The "DS is 8 but DNSKEY is 13" case you asked
about **does not occur** in this population — 0 of 1,099. That is worth stating positively, because
it means the root→TLD and TLD-zone links always carry the *same* algorithm.

## 5. The chain is deeper than root→TLD→`_ens.nic.{tld}`

The work order describes the proof chain as root → TLD → `_ens.nic.{tld}`. **Measured, that
under-describes it for most TLDs.** `nic.{tld}` is usually a *separately delegated, signed zone*
with its own DS in the TLD zone:

| | count | share |
|---|---|---|
| `nic.{tld}` separately delegated **and** signed | **639** | **58.1%** |
| not separately signed (in-zone, or unsigned delegation) | 460 | 41.9% |

So for 58% of gTLDs the real chain is **root → TLD → `nic.{tld}` → `_ens.nic.{tld}`** — four links,
not three. Chain composition by number of algorithm-13 zones:

| algorithm-13 zones in chain | TLDs | share |
|---|---|---|
| 0 | 972 | 88.4% |
| 1 | 47 | 4.3% |
| 2 | 80 | 7.3% |

**127 of 1,099 (11.6%)** have at least one algorithm-13 zone in the chain — one more than the 126
counted at the TLD level, because `xn--p1acf` has an algorithm-13 `nic` zone under a non-13 TLD.

Most common combinations: TLD 8 / nic 8 (506, 46.0%), TLD 8 / nic not-signed (439, 39.9%),
**TLD 13 / nic 13 (80, 7.3%)**, TLD 10 / nic 10 (25), TLD 13 / nic not-signed (21),
TLD 13 / nic 5 (12), TLD 13 / nic 7 (9), TLD 13 / nic 8 (4).

## 6. Verifications per claim — what I can and cannot measure

**I cannot measure n13 per TLDMinter claim, and I am not going to model it as though I could.**
TLDMinter is not deployed. There is no on-chain claim to replay, no calldata to decode, and no trace
to attribute. Everything above is measured; a per-claim verification count would be inferred.

What can be said with the evidence in hand:

- **The measurable quantity is chain composition**, given in §5: 88.4% of gTLDs have no
  algorithm-13 zone in the chain at all, 4.3% have one, 7.3% have two.
- **A bounding inference, labelled as such.** In the import census each algorithm-13 zone in a proof
  chain contributed about two dispatches — one validating the zone's DNSKEY RRset, one validating
  the RRset signed by its ZSK — which is why the measured import distribution has its mode at
  `n13 = 2` and substantial mass at `n13 = 4`. Applying that same per-zone factor to the chain
  compositions above implies **~0 dispatches for 88.4% of gTLDs, ~2 for 4.3%, ~4 for 7.3%**.
- **That inference carries real uncertainty** and should not be quoted as a measurement. The
  TLDMinter proof is assembled differently from an ENSIP-6 import: the RRsets submitted, whether the
  `nic` delegation is included, and how many DNSKEYs each zone publishes all affect the count. Only
  replaying an actual claim would settle it.

## 7. What this licenses us to claim — and what it does not

**Supported:**

- TLD onboarding via TLDMinter would pay for DNSSEC verification through **the same `DNSSECImpl`
  oracle** PR #509 improved. The cost improvement is not confined to the ENSIP-6 import flow.
- **11.6% of currently-delegated post-2012 gTLDs (127 of 1,099)** have at least one algorithm-13
  zone in their proof chain and would therefore exercise the improved verifier.
- **100%** of that population is DNSSEC-signed, so every claim would exercise the oracle regardless
  of algorithm — the non-13 majority pays RSA verification costs PR #509 did not change.
- The measurement is resolver-independent: **226/226** agreement across two operators.

**Not supported:**

- **Any claim about the number of algorithm-13 verifications per TLD claim.** Unmeasurable until
  TLDMinter exists; §6 gives a labelled inference, not a result.
- **Any claim that this will happen.** Temp check, not passed. 2028 earliest for the current round.
- **Any dollar figure.** No claims exist, so there is no realized or counterfactual gas to value.
- **Any claim that 11.6% will hold.** It is a snapshot from one four-minute window on 2026-07-28.
  Algorithm-13 adoption among gTLDs is materially *lower* than among the domains that actually use
  ENS DNS import today (11.6% vs 98.1% eligibility in the 2026 import census), so the two
  populations should not be conflated.

**The honest one-line summary:** if TLD onboarding proceeds through TLDMinter, roughly one in nine
currently-delegated new gTLDs would exercise the algorithm-13 verifier, and all of them would
exercise the oracle PR #509 touched.

## 8. Cost

**Dune: 0 credits. Alchemy: 0 CU.** This was entirely DNS work — 1,099 TLDs × 2 record types on
Cloudflare, 226 × 2 on Google, plus 1,099 `nic.{tld}` DS probes and 639 follow-up DNSKEY queries.
Raw answers under `research/gtld/raw/` (1,101 files), datasets `census-v2.jsonl`,
`nic-chain.jsonl`, `crosscheck.jsonl`, all sha256'd.
