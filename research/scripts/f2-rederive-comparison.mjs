#!/usr/bin/env node
// Re-derive the §3 verifier comparison on real production RSA costs.
//
// Every gas figure here comes from ONE harness (research/replay-ref/test/Unified.t.sol),
// warm, via the same Probe, against deployed mainnet bytecode. The RFC 5702 figure
// reproduces at 12,873 and the new verifier at 10,493, identical to the values the
// brief already prints — which is what establishes that the real-modulus figures are
// commensurable with the table they are replacing.
import fs from 'node:fs'

const GAS = {                       // unified basis, Unified.t.sol
  p256_old_current: 1_340_706,
  p256_old_legacy: 1_645_872,
  p256_new: 10_493,
  rsa_rfc5702: 12_873,
  1024: 31_807,
  1280: 42_736,
  2048: 81_733,
  4096: 230_837,
}
const gasFor = (bits) => GAS[bits] ?? GAS[1024]   // 1032 = 129-byte sig, same modexp bucket

const summary = JSON.parse(fs.readFileSync('research/derived/f1-rsa-summary.json', 'utf8'))
const rows = fs.readFileSync('research/derived/f1-rsa-keysizes.jsonl', 'utf8')
  .trim().split('\n').map((l) => JSON.parse(l))

// ---------------------------------------------------------------- weightings
const wmean = (dist) => {
  let n = 0, g = 0
  for (const [bits, count] of Object.entries(dist)) { n += count; g += count * gasFor(bits) }
  return { n, gas: g, mean: g / n }
}

const overall = wmean(summary.sigDist)
const byLevel = Object.fromEntries(
  Object.entries(summary.byLevel).map(([lvl, d]) => [lvl, wmean(d)]),
)

// naive unweighted mean across the four sizes — the thing NOT to use, shown for contrast
const naive = [1024, 1280, 2048, 4096].reduce((a, b) => a + GAS[b], 0) / 4

// per-proof-chain: total RSA gas a chain actually pays, and its per-verification mean
const perChain = rows.map((r) => {
  const rsa = r.rows.filter((x) => x.alg === 8 || x.alg === 10 || x.alg === 5 || x.alg === 7)
  return { n: rsa.length, gas: rsa.reduce((a, x) => a + gasFor(x.bits), 0) }
}).filter((c) => c.n > 0)
const chainGas = perChain.map((c) => c.gas).sort((a, b) => a - b)
const median = (a) => a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2

// ---------------------------------------------------------------- ratios
const W = overall.mean
const r = (x, y) => x / y
const out = {
  basis: 'Unified.t.sol — warm, via Probe, deployed mainnet bytecode, all figures one harness',
  gas: GAS,
  weighting: {
    chosen: 'production-weighted over all observed RSA verification instances',
    overall,
    byLevel,
    naiveUnweightedAcrossSizes: naive,
    shares: Object.fromEntries(
      Object.entries(summary.sigDist).map(([b, c]) => [b, +(100 * c / overall.n).toFixed(2)]),
    ),
    levelShares: Object.fromEntries(
      Object.entries(byLevel).map(([l, v]) => [l, +(100 * v.n / overall.n).toFixed(2)]),
    ),
  },
  perProofChain: {
    chains: perChain.length,
    meanRsaVerificationsPerChain: +(perChain.reduce((a, c) => a + c.n, 0) / perChain.length).toFixed(3),
    meanRsaGasPerChain: Math.round(chainGas.reduce((a, b) => a + b, 0) / chainGas.length),
    medianRsaGasPerChain: median(chainGas),
  },
  ratios: {
    // superseded arithmetic, reproduced so the correction is auditable
    OLD_oldP256_over_rfc5702: +r(GAS.p256_old_current, GAS.rsa_rfc5702).toFixed(2),
    OLD_rfc5702_over_newP256: +r(GAS.rsa_rfc5702, GAS.p256_new).toFixed(3),
    // corrected, against production-weighted RSA
    oldP256_over_weightedRSA: +r(GAS.p256_old_current, W).toFixed(2),
    weightedRSA_over_newP256: +r(W, GAS.p256_new).toFixed(2),
    // and against each real size, so no single weighting has to carry the claim
    oldP256_over_rsa: Object.fromEntries([1024, 1280, 2048, 4096].map((b) => [b, +r(GAS.p256_old_current, GAS[b]).toFixed(1)])),
    rsa_over_newP256: Object.fromEntries([1024, 1280, 2048, 4096].map((b) => [b, +r(GAS[b], GAS.p256_new).toFixed(2)])),
    // legacy-oracle variant, for completeness
    oldP256legacy_over_weightedRSA: +r(GAS.p256_old_legacy, W).toFixed(2),
  },
}
out.ratios.weightedRSA = Math.round(W)

// cross-check: the unified old-P256 cost against the independent census derivation
out.crossCheck = {
  censusDeltaPlusNewCost: 1_329_589 + GAS.p256_new,
  unifiedOldCost: GAS.p256_old_current,
  agreementPct: +(100 * Math.abs(1_329_589 + GAS.p256_new - GAS.p256_old_current) / GAS.p256_old_current).toFixed(3),
}

fs.writeFileSync('research/derived/f2-comparison-rederived.json', JSON.stringify(out, null, 1))
console.log(JSON.stringify(out, null, 1))
