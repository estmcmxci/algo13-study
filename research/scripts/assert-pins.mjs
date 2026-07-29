import fs from 'node:fs';
import crypto from 'node:crypto';
import {execSync} from 'node:child_process';
const keccak = h => execSync(`cast keccak ${h}`,{maxBuffer:1<<28}).toString().trim();
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const MANIFEST = 'research/manifests/bytecode-pins.json';

/**
 * MANDATORY preamble for every paired-replay run.
 * Re-hashes each persisted bytecode artifact and compares against the pinned
 * keccak256. Any drift throws before a single gas number is produced, so a
 * silently changed override fails loudly instead of yielding quiet garbage.
 * Returns role -> {address, code, keccak} for use as state overrides.
 */
export function assertPins({verbose = true} = {}) {
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const loaded = {}; const failures = [];
  for (const a of m.artifacts) {
    if (!fs.existsSync(a.rawFile)) { failures.push(`${a.role}: missing ${a.rawFile}`); continue; }
    const code = fs.readFileSync(a.rawFile, 'utf8').trim();
    const k = keccak(code), s = sha256(code);
    if (k !== a.runtimeBytecodeKeccak256) failures.push(`${a.role}: keccak drift\n     pinned ${a.runtimeBytecodeKeccak256}\n     actual ${k}`);
    else if (s !== a.rawFileSha256)       failures.push(`${a.role}: sha256 drift on raw file`);
    else if ((code.length-2)/2 !== a.sizeBytes) failures.push(`${a.role}: size drift`);
    else loaded[a.role] = {address: a.address, code, keccak: k};
  }
  if (failures.length) {
    throw new Error(`BYTECODE PIN ASSERTION FAILED (${failures.length}):\n  - ` + failures.join('\n  - '));
  }
  if (verbose) console.log(`[pins] ${Object.keys(loaded).length} artifacts verified against ${MANIFEST}`);
  return {manifest: m, artifacts: loaded};
}
export function overrideFor(period, registrarVersion, variant, pins) {
  // variant: 'old' | 'new'; selects the version-matched alg-13 verifier bytecode
  if (variant === 'new') return pins.artifacts.alg13_verifier_new;
  return registrarVersion === 'legacy'
    ? pins.artifacts.alg13_verifier_old_legacy_oracle
    : pins.artifacts.alg13_verifier_old_current_oracle;
}
