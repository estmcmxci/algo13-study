# External source excerpts — cited passages only

**Excerpts, not copies.** Only the passages the artifact relies on are stored. Full third-party
articles are not republished into this corpus: quoting is a different act from republishing, and for
retrieval the cited passage is what the advisor needs.

Retrieved 2026-07-28.

---

## S1 — ENS Labs · "How ENS Is Approaching ICANN's gTLD Expansion Program"
- URL: https://ens.domains/blog/post/icann-84-gtld
- Byline: **jamesbeck.eth** · Published **2025-11-12** · Class: **OFFICIAL ENS LABS PUBLICATION**

> "We see an opportunity for ENS to participate in the new gTLD program and run our own registry as
> a '.brand', meaning that ENS would control the registrations in the .ens TLD which could open up
> doors for enhanced security, trust, and flexibility."

**Checked and ABSENT from this source:** the ICANN Technical Study Group name; any Francisco Arias
statement; any Registry Service / RSEP recognition claim; the "hard problem" phrasing; SSAC's
position. None of those may be attributed to this post.

---

## S2 — ENS Labs · "Tokenized DNS Domains with Doma and ENS"
- URL: https://ens.domains/blog/post/d3-doma
- Published **October 2025** · Class: **OFFICIAL ENS LABS PUBLICATION**

> "Doma lets domain owners tokenize their domains so that control is represented by a transferable
> token."

> "DNSSEC import remains the native, canonical way to prove control of a DNS domain. With Doma's
> tokenization, ENS is adding a second path for registries and communities that prefer onchain
> verification."

> "If you rely on DNSSEC today, your existing path will continue to remain fully supported without
> any changes. For DNS domains that are not tokenized, the DNSSEC import flow remains fully
> available."

---

## S3 — ENS DAO Governance Forum · "Temp Check: Authorize TLDMinter as Root Controller"
- URL: https://discuss.ens.domains/t/temp-check-authorize-tldminter-as-root-controller/22020
- Byline: **steg** · Posted **2026-04-04**, updated 2026-05-14 · Class: **AUTHOR'S OWN PROPOSAL**

> "Only **1,166 post-2012 ICANN New gTLD Program** TLDs are eligible for self-serve claims."

> "The operator publishes a TXT record at `_ens.nic.{tld}` containing their Ethereum address,
> verified against the IANA root trust chain via DNSSEC."

> "TLDMinter verifies this cryptographic chain via the existing DNSSECImpl oracle — the same oracle
> ENS already uses for DNS name imports."

> "7-day minimum delay (veto open until execution), 10 claims per rolling 7-day window, 14-day proof
> freshness, emergency pause."

---

## S4 — RFC 8624 · "Algorithm Implementation Requirements and Usage Guidance for DNSSEC"
- Persisted: `research/gtld/rfc/rfc8624.txt` (sha256 `2014214b11d214fc…`) · Class: **IETF STANDARD**

> `| 8      | RSASHA256          | MUST            | MUST              |`
> `| 10     | RSASHA512          | NOT RECOMMENDED | MUST              |`
> `| 13     | ECDSAP256SHA256    | MUST            | MUST              |`

> "Due to the industry-wide trend towards elliptic curve cryptography, ECDSAP256SHA256 is the
> RECOMMENDED DNSKEY algorithm for use by new DNSSEC deployments, and users of RSA-based algorithms
> SHOULD upgrade to ECDSAP256SHA256."

---

## S5 — Thomas Clowes · "DNS, ENS, and the ICANN Technical Study Group"
- URL: https://thomasclowes.com/dns-ens-and-the-icann-technical-study-group/
- Byline: **Thomas Clowes** · Published **29 Apr 2026** · Retrieved **2026-07-28** (HTTP 200, 27,616 bytes)
- Persisted: `research/sources/raw/clowes-tsg.html` (sha256 `27670a5b547347d5…`), text rendering
  `research/sources/raw/clowes-tsg.txt`
- Class: **FIRST-HAND TESTIMONY** — one attendee's account of what was said at a panel. Nothing here
  is an ICANN publication, and no passage may be cited as established ICANN policy.

**Retrieval note.** Earlier searches for this article failed and it was recorded as unlocatable. It
was reachable the whole time by direct URL. The failure was in the search, not the source.

### S5.a — the Technical Study Group (supports §4.1, name only)
> "During the ICANN Contracted Parties summit in Manchester, ICANN announced their intention to form
> a Technical Study Group entitled ' gTLD Integrations with Alternative Naming Systems '."

Tier note: Clowes' own reporting of a public announcement.

### S5.b — Arias on Registry Service recognition (supports §4.1)
> "Francisco Arias (VP, GDS Technical Services at ICANN) provided an update from ICANN. He stated
> that integration with alternate namespaces **requires** recognition as a Registry Service (RS),
> and as a result announced the formation of the aforementioned Technical Study Group."

**Attribution required:** *as reported by Thomas Clowes, Francisco Arias stated…* This is a
second-hand account of an oral statement at a panel, not an ICANN policy document.

**Contested within the source itself.** Clowes immediately adds:
> "This positioning seems directly contradictory to the positioning and advice coming out of the SSAC."

Any citation that presents the Registry Service requirement as settled ICANN policy contradicts the
very source it rests on.

### S5.c — the "hard problem" quote (supports §4.2)
Framing sentence, immediately above the passage, under the heading **"Additional Notes"**:
> "I specifically noted some comments from attendees that I wanted to note and will relay within the
> ENS ecosystem:"

The quoted passage:
> "It was highlighted that technical integration may be straightforward but appropriate governance -
> especially around domain lifecycle and consumer expectations - is the _hard problem_."

**Attribution required:** this is an **unnamed attendee's comment, relayed by Clowes**. It is neither
Clowes' own assertion nor an ICANN position. The passive "It was highlighted" is the author's own
signal that he is relaying rather than asserting.

### S5.d — SSAC's stated posture (supports §4.3)
> "During this panel, Rick Wilhelm (CTO of PIR.org and SSAC Chair) announced that the SSAC are in the
> process of writing their report. Crucially he noted that they do **not** intend to tell alternate
> namespaces _how_ they should operate or implement their products. Rather they will outline how the
> DNS system works in relevant contexts such that integrators can do so in a responsible manner."

**Attribution required:** as reported by Clowes, Rick Wilhelm announced… The SSAC report was
**in progress, not published**, as of 2026-04-29.

### S5.e — Registry Service scope, incl. DNSSEC signing (supports §4.4)
> "A Registry Service (RS) is essentially any functionality the registry provides that affects how
> domain names are registered, resolved, or behave. This includes: DNS resolution / WHOIS / RDAP data
> access / DNSSEC signing / EPP provisioning (registrars talking to the registry) / Premium pricing,
> reserved names, etc."

> "The Registry Services Evaluation Process (RSEP) is the process through which ICANN reviews
> requests by registries to introduce or change a Registry Service."

**Attribution required:** this is **Clowes' own gloss** on ICANN terminology, not a quotation of
ICANN's contractual definition. The underlying ICANN definition remains **NOT RETRIEVED**. Cite as
*"Clowes summarises the Registry Service definition as including DNSSEC signing"* — not as ICANN's
own text.

### S5.f — the TSG seat (bears on the `.ens` wording)
> "Additionally I would like to represent ENS on the Technical Study Group such that we can continue
> to constructively collaborate."

**Attribution required:** first person singular. This is **Clowes' personal stated wish**, not an ENS
organisational position and not a submitted application.

**Scope of that caution — narrowed 2026-07-28.** It applies to *this source only*. It says nothing
about whether ENS holds a TSG seat by some other route. The artifact's seat claim is sourced instead
to the ENS Labs Q2 2026 report's record of **Nick Johnson's appointment** — a different and stronger
basis than Clowes' wish, and one this citation layer **cannot confirm**: the Q2 report has never been
retrieved (attempted again 2026-07-28; the public blog index returns only seven recent posts and does
not list it, nor even the ICANN-84 post already cited as S1). **The seat claim is therefore verified
by the author, not by me**, and remains in the NOT RETRIEVED table below.

**Checked and ABSENT from this source** (verified by search of the persisted text): the string
`.ens`; any mention of the **root zone**; any mention of ICANN **accepting**, or ENS **applying**
for, a TLD. Counts are 0 for each. Nothing about `.ens` may be attributed to Clowes.

---

## S6 — ENS Labs · Q2 2026 quarterly progress report
- URL: https://discuss.ens.domains/t/ens-labs-quarterly-progress-reports/20565/8
- Publisher: **ENS Labs**, posted to the ENS DAO governance forum · Retrieved **2026-07-28**
  (HTTP 200, 769,126 bytes raw HTML; 24,439 chars of extracted text)
- Persisted: `research/sources/raw/ens-q2-2026.html` (sha256 `897f53bef29defbb…`), text rendering
  `research/sources/raw/ens-q2-2026.txt`
- Class: **OFFICIAL PUBLICATION** — the strongest tier in this corpus, and stronger than S5.

**Retrieval note.** Recorded as unretrievable across two attempts. Reachable by direct URL. This is
the **second** such failure (see S5); both were search failures, not source failures.

### S6.a — Nick Johnson's TSG appointment (closes the TSG-seat item)
> "Another Q2 significant outcome was Nick's appointment to ICANN's new seven-member Technical Study
> Group on gTLD integrations with alternative naming systems."

This is an **official ENS Labs statement of an appointment already made** — not a wish, not an
application. It supersedes any attempt to source the seat to S5.f. Note it also fixes the size of
the group at **seven members**, a detail absent from Clowes.

### S6.b — `.ens` gTLD preparation
> "Our work has strengthened relationships with registries, WIPO, and the contracted-party community,
> advanced our .ens gTLD preparation, and increased ENS visibility in technical, policy, and media
> discussions around naming systems, digital identity, and AI."

**Supports "preparation", not "application".** The report claims preparatory work advanced; it does
not claim a filing. Consistent with the corrected S1 wording — ENS *sees an opportunity*.

### S6.c — legal work on the TLD
> "Professional Services (18.3%) included expenses for ENSv2 frontend and smart contract external
> auditing, legal expenses for the ENSv2 patent and .ens TLD being finalized this year."

### S6.d — ICANN event attendance
> "As part of our commitment to ENS' role in the DNS Security space, we represented at the 2026 ICANN
> Contracted Parties Summit in Manchester, DNS OARC 46 in Edinburgh, and the ICANN86 Policy Forum in
> Seville."

**Cross-source corroboration:** independently confirms the Manchester Contracted Parties Summit at
which Clowes (S5.a) places the TSG announcement. Two sources, different authors, same event.

### S6.e — DOMA tokenised DNS
> "We partnered with DOMA on a primary name campaign which brought in 300+ newly set ENS primary
> names. Additionally, users can now use DOMA to set their tokenized DNS as their ENS name."

**Spelling note for exact quotation:** the source reads **"tokenized"**; the artifact quotes
"tokenised". Align the artifact to the source if presenting this as a quotation.

---

## NOT RETRIEVED — must not be cited until sourced

| source | needed for | status |
|---|---|---|
| **ENS DAO executable "Replace DNSSEC oracle algorithms"** | the `~200k → ~3.5k` language the artifact corrects | Not retrieved — **this is the text §1 is built against** |
| ICANN Registry Service definition incl. DNSSEC signing | §4 composition argument | **Still not retrieved.** S5.e is Clowes' *summary* of it, not ICANN's contractual text. The primary definition remains unsourced |
| Immunefi RSA forgery disclosure (`.cc`, `.name`) | §4 root-authority argument | Not retrieved |
