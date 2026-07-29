/**
 * Pinned constants. Nothing here is fetched at runtime — the decoder makes no
 * network calls.
 */
import { hexToBytes } from './bytes.mjs'

export const DECODER_VERSION = '1.0.0'

/**
 * Constructor argument of the CURRENT DNSSECImpl
 * (`0x0fc3152971714E5ed7723FAFa650F86A4BaF30C5`), i.e. the root DS trust
 * anchors that seed `verifyRRSet`.
 *
 * Source: `ens-contracts/deployments/mainnet/DNSSECImpl.json` -> `args[0]`.
 * Decodes to two root DS RRs, key tags 19036 (0x4a5c) and 20326 (0x4f66),
 * both algorithm 8 / digest type 2 — matching the IANA root anchors and
 * `test/fixtures/anchors.ts` `realEntries`.
 */
export const CURRENT_ANCHORS_HEX =
  '0x00002b000100000e1000244a5c080249aac11d7b6f6446702e54a1607371607a1a41855200fd2ce1cdde32f24e8fb5' +
  '00002b000100000e1000244f660802e06d44b80b8f1d39a95c0b0d7c65d08458e880409bbc683457104237c7f8ec8d'

export const CURRENT_ANCHORS = hexToBytes(CURRENT_ANCHORS_HEX, 'anchors')

/**
 * Algorithm IDs mapped to a non-zero verifier on the oracle.
 *
 * This is a MODELLING INPUT, not an assumption baked into the logic: a proof
 * that reaches an algorithm outside this set is reported, not guessed at. The
 * default mirrors `test/fixtures/dnssecFixture.ts` minus the test-only dummy
 * algorithms 253/254.
 *
 * OPEN ITEM for the research agent: confirm the on-chain `algorithms(id)` map
 * for each oracle across each study period via RPC and pass the real set in as
 * `algorithmMap`. It only changes a count if a proof carries a DNSKEY whose
 * algorithm sits outside {5,7,8,13} AND that key matches the RRSIG's key tag.
 */
export const DEFAULT_ALGORITHM_MAP = new Set([5, 7, 8, 13])

export const ALGORITHM_13 = 13
