#!/usr/bin/env node
/**
 * Batch driver: JSONL in, JSONL out, one record per line, order preserved.
 *
 *   node research/decoder/cli.mjs < calls.jsonl > decoded.jsonl
 *   node research/decoder/cli.mjs calls.jsonl   > decoded.jsonl
 *
 * Input line: {"callId","calldata","registrarVersion","now"?,"algorithmMap"?}
 *
 * A line that is not valid JSON still produces an output record — nothing is
 * ever silently dropped. Exit code is 0 unless the input itself could not be
 * read; per-record failures are reported in the records.
 */
import { createInterface } from 'node:readline'
import { createReadStream } from 'node:fs'
import process from 'node:process'
import { decodeCall, DECODER_VERSION } from './index.mjs'

const source = process.argv[2] ? createReadStream(process.argv[2]) : process.stdin
const rl = createInterface({ input: source, crlfDelay: Infinity })

const counts = { total: 0, ok: 0, malformed: 0, unsupported: 0, withAlg13: 0, n13: 0 }
let lineNo = 0

for await (const line of rl) {
  lineNo++
  const trimmed = line.trim()
  if (trimmed === '') continue
  counts.total++

  let record
  try {
    record = decodeCall(JSON.parse(trimmed))
  } catch (e) {
    record = {
      callId: null,
      decoder_version: DECODER_VERSION,
      decode_status: 'malformed',
      decode_error: {
        kind: 'malformed',
        code: 'invalid_json_line',
        message: String(e.message),
        line: lineNo,
      },
      n13_decoded: 0,
    }
  }

  counts[record.decode_status] = (counts[record.decode_status] ?? 0) + 1
  counts.n13 += record.n13_decoded
  if (record.n13_decoded > 0) counts.withAlg13++

  process.stdout.write(`${JSON.stringify(record)}\n`)
}

process.stderr.write(
  `${JSON.stringify({ summary: counts, decoder_version: DECODER_VERSION })}\n`,
)
