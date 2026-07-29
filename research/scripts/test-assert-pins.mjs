import {assertPins, overrideFor} from './assert-pins.mjs';
import fs from 'node:fs';
console.log('--- PASS path:');
const pins = assertPins();
console.log('  old/legacy ->', overrideFor(1,'legacy','old',pins).address);
console.log('  old/current->', overrideFor(1,'current','old',pins).address);
console.log('  new        ->', overrideFor(3,'current','new',pins).address);

console.log('\n--- TAMPER path (flip one byte of the new verifier):');
const f='research/raw/bytecode/alg13_verifier_new.hex';
const orig=fs.readFileSync(f,'utf8');
fs.writeFileSync(f, orig.slice(0,-2)+(orig.slice(-2)==='ff'?'ee':'ff'));
try { assertPins({verbose:false}); console.log('  *** FAILED TO DETECT ***'); }
catch(e){ console.log('  detected:\n   ', e.message.split('\n').slice(0,3).join('\n    ')); }
finally { fs.writeFileSync(f, orig); }
console.log('\n--- restored; re-verify:');
assertPins();
