# DNSSEC algorithm 13 on ENS — measurement harness and data

Reproduction material for a study of [`ensdomains/ens-contracts#509`](https://github.com/ensdomains/ens-contracts/pull/509),
which routed ENS's DNSSEC algorithm-13 (ECDSA P-256) verification to the
[EIP-7951](https://eips.ethereum.org/EIPS/eip-7951) precompile.

Every DNS import ENS has recorded was re-executed against both the old and new verifier at their
deployed mainnet bytecode, using each transaction's real proof.

| | |
|---|---|
| cost per verification | `1,340,706 → 10,493` — a saving of `1,330,213` |
| population | 2,145 successful imports across 4.93 years; 2,283 replay records |
| extraction cutoff | block 25,627,360 (2026-07-27) |

---

## Check it yourself

Three tiers, in ascending order of effort. **They are not interchangeable** — the Foundry
harness measures gas and verifies none of the census figures; the Node scripts do the census
and measure no gas.

```bash
git clone https://github.com/estmcmxci/ens-dnssec-alg13-study.git
cd ens-dnssec-alg13-study
cp .env.example .env
forge install foundry-rs/forge-std --no-git
```

**On endpoints.** Not every public RPC survives this. Tested 2026-07-29 from a clean clone:

| endpoint | tiers 1–2 | tier 3 traces |
|---|---|---|
| `evm.stupidtech.net/v1/1` — the default | yes | **yes** |
| `ethereum-rpc.publicnode.com` | yes | no — archive requests need a token |
| `eth.drpc.org` | **no** — HTTP 408 under Foundry's fork workload | — |

**Tier 1 — the population, about 10 seconds.**

```bash
node research/scripts/c3-names.mjs
```

One `eth_getLogs` for `Claim` events. Returns **2,145**, pinned to the study's cutoff block
25,627,360. Set `CUTOFF_BLOCK=latest` to count the present-day population instead — it will be
higher, because imports have continued since.

**Tier 2 — the headline, about a minute.**

```bash
forge test --match-path "test/Unified.t.sol" --fork-url $MAINNET_RPC_URL -vv
```

Prints gas for both verifiers at their deployed mainnet addresses. `p256_old_current` is
1,340,706 and `p256_new` is 10,493. Requires a Foundry recent enough to accept
`evm_version = "osaka"`, which is what makes the EIP-7951 precompile available.

**Tier 3 — the full census, hours, and needs a trace-capable provider.**

```bash
node research/scripts/p1-census.mjs
```

Uses `trace_*` methods that most free tiers do not serve. The derived outputs are committed
under `research/derived/`, so tier 3 is only necessary if you doubt those files rather than the
arithmetic over them.

---

## Verifying a published figure without running anything

Every figure in the study cites a `§` ID whose entry names its source file and derivation. Those
run directly against the committed data. For example, the 1.12 B gas saved since activation:

```bash
python3 -c "
import json
rows=[json.loads(l) for l in open('research/derived/p3-replay.jsonl')]
rs=[r for r in rows if r.get('period')=='realized' and r.get('population')=='successful'
                     and r.get('delta_gas') is not None]
print(len(rs), sum(r['delta_gas'] for r in rs))
"
# 315 1123866630
```

---

## Layout

```
foundry.toml            evm_version = "osaka" — required for EIP-7951
test/                   Foundry harness. Unified.t.sol produces the headline figures.
research/scripts/       Node extraction and derivation scripts
research/derived/       census and replay outputs
research/gtld/          root-zone and gTLD algorithm census
research/replay/hardhat-cross/   Hardhat/EDR cross-check — the second EVM implementation
research/manifests/     per-artifact checksums
research/audit/         verification records
research/sources/       persisted third-party excerpts
```

## How the measurement works

Nothing is recompiled. Deployed mainnet runtime bytecode is installed via state override and
asserted per call, so the measured difference is between artifacts **as they existed on-chain**,
not between source revisions. Each vector is cryptographically verified before its gas is
recorded — gas on a failing vector is meaningless — and each measurement is asserted
deterministic across repeated runs.

Addresses under test:

| | |
|---|---|
| P-256 old, current oracle | [`0x0faa24e5…`](https://evm.now/address/0x0faa24e538ba4620165933f68a9d142f79a68091) |
| P-256 new, EIP-7951 | [`0xb091c4f6…`](https://evm.now/address/0xb091c4f6fac16edda5ee1e0f4738f80011905878) |
| DNSSEC oracle (`dnssec.ens.eth`) | [`0x0fc31529…`](https://evm.now/address/0x0fc3152971714e5ed7723fafa650f86a4baf30c5) |

The swap was activated in [one transaction](https://evm.now/tx/0x36cadd8ab8167ec1841b21d4993c01fe183afbe00859532e54762dd28e5a28dd)
at block 24,619,423 (2026-03-09), which rewired algorithms 5, 8 and 13 together.

## Changes made for publication

Two, both recorded so this tree can be diffed against the working one:

1. **`research/scripts/endpoints.mjs`** and **`research/replay/hardhat-cross/hardhat.config.js`**
   read the endpoint from the environment, falling back to `.env` at the repo root. The study read
   it from `ens-contracts/.env`, a path that does not exist here.
2. **`research/derived/p3-replay.jsonl`** is deduplicated by `callId` — 2,716 records to 2,283.
   The working file carried 433 exact duplicates. No measurement changed: every distinct
   `(callId, delta_gas)` pair is preserved, and the published totals reproduce from the
   deduplicated file under the plain filter shown above. In the working copy they only
   reproduced after deduplicating, which is why this is fixed here rather than documented.

## Scope

This is measurement material, not a library. The Solidity under `test/` exists to measure
deployed contracts and is not intended for reuse. Figures are current to the extraction cutoff
above; re-running the census against a later block will produce larger populations.
