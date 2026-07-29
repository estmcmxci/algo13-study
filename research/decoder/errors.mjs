/**
 * Structured error type for the decoder.
 *
 * The decoder NEVER silently drops an input and NEVER lets a raw JS exception
 * escape `decodeCall`. Every abnormal condition is expressed as a `DecodeError`
 * which is caught at the top level and rendered into the output record.
 *
 * `kind` maps onto `decode_status`:
 *   'malformed'   -> input cannot be parsed under the contract's own rules
 *                    (this includes conditions where the contract itself would
 *                    revert with a Panic / OffsetOutOfBounds).
 *   'unsupported' -> input parses, but the decoder cannot faithfully model the
 *                    execution path (e.g. an algorithm outside the pinned map).
 *                    This is deliberately NOT 'malformed': it is a decoder
 *                    limitation, not a claim about the input.
 *   'reverted'    -> the contract's own semantics reject the proof. The path is
 *                    fully modelled; dispatches counted up to that point are real.
 */
export class DecodeError extends Error {
  constructor(kind, code, message, detail = {}) {
    super(message)
    this.name = 'DecodeError'
    this.kind = kind
    this.code = code
    this.detail = detail
  }

  toJSON() {
    return { kind: this.kind, code: this.code, message: this.message, ...this.detail }
  }
}

export const malformed = (code, message, detail) =>
  new DecodeError('malformed', code, message, detail)

export const unsupported = (code, message, detail) =>
  new DecodeError('unsupported', code, message, detail)

export const reverted = (code, message, detail) =>
  new DecodeError('reverted', code, message, detail)
