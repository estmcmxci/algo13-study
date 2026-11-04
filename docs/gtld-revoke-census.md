# gTLD RFC 5011 Revoke Census: key churn, July to November 2026

Companion measurement to [the gTLD algorithm-13 census](gtld-algorithm-census.md), over the same
population and the same archived answers.

**Scope, deliberately narrow.** This document is about DNSSEC operational practice in the delegated
gTLD population. It reports what keys those zones published, how the keys changed in one quarter,
and one mechanism that explains the result. It makes **no claim about ENS, smart contracts, or any
downstream consumer of the measurement.** Nothing here says what any of it is for.

## 1. The finding

**RFC 5011 revocation does not occur in this population.** Of 1,099 delegated post-2012 gTLDs, zero
published a key with the REVOKE bit set in July 2026, and zero published one in November 2026. In
the same interval 644 of them changed their key set and 503 changed at least one key-signing key.

The absence is not inactivity. The population rolls its KSKs often. It rolls them by a method that
has no use for REVOKE, and section 6 gives the reason.

## 2. Population and provenance

The population is the pinned July set: **1,099 gTLDs**, delegated 2013-01-01 or later, not
contract-terminated, no removal date. It is the same set the algorithm-13 census measured, and
§1 of that document gives its derivation from ICANN `gtlds.json`.

> **Reproducing this: use the committed snapshots, not a live fetch.** Every census figure in
> sections 4 and 5 comes from answers archived in this repository, and none of them needs a new
> query. Two observations are **not** reproducible this way and are labelled where they appear: the
> live root DNSKEY set in section 6, and the live record check and root-list membership in section
> 7. Both carry a timestamp. A reader repeating them will get the state of the DNS on the day they
> ask, which is the point of including them.
>
> | artifact | sha256 | what it is |
> |---|---|---|
> | [`research/gtld/population.json`](../research/gtld/population.json) | `aa44837d9f3fb1e543362540b67015229308d4d1d4ddbbcdb11e4ba48057c476` | the pinned 1,099 |
> | `research/gtld/raw/{tld}.json` | 1,101 files, per-record hashes in `census-v2.jsonl` | July answers, archived by `census.mjs` |
> | `research/gtld/raw-revoke/{tld}.json` | 1,099 files, per-record hashes in `revoke-census.jsonl` | November answers, both resolvers |
> | [`research/gtld/revoke-historical.json`](../research/gtld/revoke-historical.json) | `412274322bc1f17b3b13c4396be78440557d58dcfcc1aab6416a010f4a0a2c8f` | July flags, re-read from `raw/` |
> | [`research/gtld/revoke-census.jsonl`](../research/gtld/revoke-census.jsonl) | `d0df6464f15af9c6be47a76cc913d51eeaa9585f2b707cd4aeb93f9a55258c35` | November census, 1,099 records |
> | [`research/gtld/revoke-diff.json`](../research/gtld/revoke-diff.json) | `26766502ccb2f9a5f2eeced19bf5bdc7ef9cb1c961ae9ef781add947d4c001b9` | the July to November comparison |

**The pinned population is now two members out of date, and that is deliberate.** `helsinki` and
`juniper` were delegated and signed in July. Both have since left the root. They remain in
`population.json` because the pinned file is what reproduces the published figures. Section 7
reports them as observed. `population-current.mjs` writes the current membership to a separate
file for anyone who needs today's list instead; it does not change the default.

## 3. Method

Three scripts, each named in the table above as the producer of its output.

- **July figures: `revoke-reparse.mjs`.** `census.mjs` parsed field 2 of each DNSKEY rdata, the
  algorithm, and discarded the rest. Field 0 is the flags word, and REVOKE lives there. The archived
  answers still hold it, so the July figure costs **zero new queries**.
- **November figures: `revoke-census.mjs`.** DNS-over-HTTPS against **Cloudflare `1.1.1.1`** and
  **Google `8.8.8.8`**, observation window **2026-11-04 17:35:13Z → 17:36:16Z**. Every raw answer
  persisted and sha256'd per record.
- **The comparison: `revoke-diff.mjs`.** Keys are compared **by key tag, computed per RFC 4034
  appendix B**, not by flags. A rollover replaces keys rather than flags, so a zone that swaps one
  KSK for another publishes the same flag multiset with a different tag. 174 of the 644 changed
  zones are exactly that case, and a flags-only comparison would have scored all 174 as
  unchanged.

**Both resolvers agree on every TLD.** 1,099 of 1,099 agree on the flag set, and 1,099 of 1,099
agree on the validation status. The July figures rest on Cloudflare alone, as the published census
did; the November pass is the first in this study to query two operators over the whole population.

**Validation status, not a raw AD bit.** Each November record carries `validated`, `unvalidated` or
`no-answer`. 1,097 validated from both resolvers; 2 are `no-answer`. Zero unvalidated. The
distinction matters here: the two `no-answer` records are the departed TLDs, which return NXDOMAIN
with the AD bit set. A raw AD boolean records those as `true`, which is indistinguishable from a
validated DNSKEY answer.

## 4. Results: revocation

| | July 2026 | November 2026 |
|---|---|---|
| gTLDs measured | 1,099 | 1,099 |
| answering with DNSKEY records | 1,099 | 1,097 |
| **publishing a revoked key** | **0** | **0** |
| DNSKEYs published, total | 2,724 | 3,348 |
| zone-signing keys (flags 256) | 1,585 | 1,777 |
| key-signing keys (flags 257) | 1,139 | 1,571 |
| revoked ZSK (flags 384) | 0 | 0 |
| revoked KSK (flags 385) | 0 | 0 |

**Only two flag values occur anywhere in either snapshot: 256 and 257.** The revoked forms, 384 and
385, appear on no key, in no zone, at either end, from either resolver. The revoked categories are
**empty rather than omitted**, reported so their absence is a measurement and not a silent
exclusion.

## 5. Results: key churn, and how the population rolls

Of the 1,099 compared, by key tag:

| | count | share |
|---|---|---|
| key set changed | **644** | 58.6% |
| key set identical | 453 | 41.2% |
| left the root | 2 | 0.2% |
| newly appeared | 0 | 0.0% |
| key tag not computable | 0 | 0.0% |

Of the **644** that changed, split by what happened to the key-signing keys:

| | count |
|---|---|
| **changed at least one KSK** | **503** |
| ...by changing the number of KSKs | 454 |
| ......gained a KSK | 444 |
| ......lost a KSK | 10 |
| ...by replacing a KSK at the same count | 49 |
| changed only zone-signing keys | 141 |

**A KSK-count test is not a KSK-rollover test.** 49 zones replaced a key-signing key while
publishing the same number of them before and after. Counting keys misses those 49, and counting
flags misses 174. Only the tag comparison finds them.

**The rollover method is legible in the flags.** The most common transitions, as flag multisets:

| July | November | TLDs |
|---|---|---|
| `[256,256,257]` | `[256,256,257,257]` | 249 |
| `[256,256,257]` | `[256,256,256,257,257]` | 194 |
| `[256,257]` | `[256,257]` (tags differ) | 160 |
| `[256,257]` | `[256,256,257]` | 10 |
| `[256,256,257]` | `[256,257]` | 6 |
| `[256,257,257]` | `[256,257]` | 5 |

The first two transitions are **double-KSK rollover**: publish the incoming key beside the outgoing
one, move the DS record at the root, then retire the old key. The population gains a second 257 and
holds both for a time. The fifth and sixth rows are the same process at its other end, where a zone
drops back to one KSK. Across the quarter the population went from 1,139 KSKs to 1,571.

**At no point in that process does a zone set REVOKE.**

## 6. Why: the mechanism

RFC 5011 revocation exists to solve one problem: how a zone retires a key that **resolvers have
configured as a trust anchor**. A resolver holding an anchor it learned once cannot be told to
forget it by a DS record, because it is not consulting a parent. RFC 5011 gives it an in-band
signal: the zone republishes the key with REVOKE set and signs the DNSKEY RRset with that key, which
proves possession of the private half and so authenticates the withdrawal.

**A delegated gTLD is not a trust anchor.** Its parent is the root, and the root vouches for it with
a DS record. To roll a KSK the zone publishes the new key, has the DS updated at the root, and
removes the old key. Validators follow the parent and need no in-band revocation signal, so the
zone has nothing to gain by setting REVOKE. The measurement matches the mechanism: 503 KSK changes
in one quarter and no revocations.

**The root is a trust anchor, and it does use RFC 5011.** On **11 January 2019 at 1400 UTC**, root
zone serial **2019011100**, ICANN published KSK-2010 with the REVOKE bit set. Matt Larson's
announcement to `dns-operations`
([archive](https://lists.dns-oarc.net/pipermail/dns-operations/2019-January/018279.html),
11 January 2019 14:07 UTC) records the two details that show the mechanism working:

- The DNSKEY RRset was signed with **two** KSKs, the then-current KSK-2017 and the former KSK-2010.
  The second signature is what proves possession and asserts the revocation.
- **KSK-2010's key tag changed from 19036 to 19164.** The tag is computed over the rdata, flags word
  included, so setting REVOKE changes the tag. This is the same computation `revoke-diff.mjs` uses
  to compare key sets.

The revoked key stayed in the root zone until 22 March 2019.

**Observed in the live root, 2026-11-04 18:03:16Z** (live query, not archived in this repository):
the root publishes three keys, two KSKs and one ZSK, all algorithm 8, **none revoked**. Both resolvers agree. The root is therefore holding two
key-signing keys at the time of writing, which is the same double-publication shape section 5 found
in the gTLDs. What a trust anchor does at the end of that process, and what a delegated zone does,
are different, and that difference is the whole of this finding. This document does not predict
what the root will publish next.

## 7. The two departures, as observed

`helsinki` and `juniper` were both delegated and signed in July, each publishing `[256,256,257]`:

| | July key tags | November |
|---|---|---|
| `helsinki` | KSK 31639; ZSK 27429, 31155 | NXDOMAIN, no DNSKEY |
| `juniper` | KSK 49897; ZSK 40284, 54456 | NXDOMAIN, no DNSKEY |

Both return **NXDOMAIN with the AD bit set from both resolvers**, so the non-existence is
authenticated rather than merely unanswered. The November DNSKEY answers are archived in
`raw-revoke/`. Two further checks are live queries and are **not** archived here: on 2026-11-04 at
18:03Z both strings return NXDOMAIN with AD set for NS, DS and SOA as well, and neither is present
in IANA root list version 2026110304 (sha256 `f0ba6b170d8c26a6…`, fetched the same day).

**They left the root without revoking anything**, which is consistent with section 6: a zone that
stops being delegated has its DS removed at the root, and the keys simply stop being published.

**What this does not say.** It does not say either gTLD was terminated. Departure from the root is
an observation about DNS. The registry status of both strings is **unverified**, and the cause
should be checked before either is described as terminated, withdrawn or anything else.

## 8. What this licenses, and what it does not

**Supported:**

- **Zero of 1,099 delegated post-2012 gTLDs published an RFC 5011 revoked key** at either
  observation, July 2026 or November 2026.
- **The population rolls key-signing keys actively**: 503 of 1,099 changed at least one KSK in one
  quarter, and the KSK count rose from 1,139 to 1,571.
- **The dominant method is double-KSK rollover.** Every one of the 444 zones that gained a
  key-signing key went from one to two, and the two most common flag transitions, 443 zones
  between them, are that shape.
- **The November measurement is resolver-independent**: 1,099 of 1,099 agreement on both the flag
  set and the validation status, across two operators.
- The **root** did revoke KSK-2010 per RFC 5011 in January 2019, on the documented record.

**Not supported:**

- **Any claim about the rate of revocation.** Two snapshots can say a state did not hold at two
  instants. They cannot say a zone never revokes a key between them. A revocation lasting less than
  the gap between July and November would be invisible to this method.
- **Any claim that 5011 revocation is wrong, unused or deprecated generally.** It is measured here as
  absent from **one** population, delegated gTLDs, and §6 gives the structural reason. The root uses
  it, and this study did not measure ccTLDs, second-level zones or any zone configured as an anchor
  elsewhere.
- **Any claim about why `helsinki` and `juniper` left the root.** See section 7.
- **Any claim that these figures will hold.** The July pass is one four-minute window and the
  November pass is one sixty-three-second window. 644 of 1,099 key sets changed between them, which
  is itself the measure of how fast this data moves.
- **Any claim about ENS, DNSSEC verification cost, or on-chain anything.** Out of scope by design.

**The honest one-line summary:** delegated gTLDs roll their key-signing keys often and revoke them
never, because they are vouched for by a parent rather than pinned as trust anchors, and RFC 5011
revocation solves a problem they do not have.
