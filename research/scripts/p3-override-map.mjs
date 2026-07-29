import fs from 'node:fs';
const pins=JSON.parse(fs.readFileSync('research/manifests/bytecode-pins.json','utf8'));
const K=Object.fromEntries(pins.artifacts.map(a=>[a.role,{address:a.address.toLowerCase(),keccak:a.runtimeBytecodeKeccak256,size:a.sizeBytes}]));
const P_ENS=24619423, B_PRE=23935694;
const calls=JSON.parse(fs.readFileSync('research/derived/p1-calls-for-decode.json','utf8'));
const failed=JSON.parse(fs.readFileSync('research/derived/p1-failed-calls.json','utf8'));
const ts=JSON.parse(fs.readFileSync('research/derived/p3-block-timestamps.json','utf8'));

// Authoritative routing. OLD variant is registrar-version dependent; NEW is always the
// precompile verifier. Each row carries the EXPECTED keccak256 for both variants so the
// harness asserts WHICH bytecode was selected for THIS call, not merely that one loaded.
const LEGACY_ORACLE_MIGRATION = 13103261; // legacy registrar setOracle(): 0x46c6F799 -> 0x21745ff6
function route(registrarVersion, block){
  const oracleRoleName = registrarVersion!=='legacy' ? 'oracle_current'
      : (block < LEGACY_ORACLE_MIGRATION ? 'oracle_legacy_original' : 'oracle_legacy');
  const oracle = K[oracleRoleName];
  const oldRole = registrarVersion==='legacy' ? 'alg13_verifier_old_legacy_oracle' : 'alg13_verifier_old_current_oracle';
  return {
    oracleRole: oracleRoleName,
    oracleAddress: oracle.address, oracleKeccak: oracle.keccak,
    oldRole, oldVerifierAddress: K[oldRole].address, oldVerifierKeccak: K[oldRole].keccak,
    newRole:'alg13_verifier_new', newVerifierAddress: K.alg13_verifier_new.address,
    newVerifierKeccak: K.alg13_verifier_new.keccak,
    // which variant actually executed on-chain, for the counterfactual direction
    actualVariantOnChain: (registrarVersion==='current' && block>=P_ENS) ? 'new' : 'old',
  };
}
const rows=[];
for(const c of calls) rows.push({callId:c.callId, tx:c.tx, block:c.block, population:'successful',
  registrarVersion:c.registrarVersion, period:c.period, selector:c.selector,
  blockTimestamp: ts[c.block].timestamp, parentBlock: c.block-1, n13_trace:c.n13_trace, ...route(c.registrarVersion,c.block)});
for(const f of failed) rows.push({callId:`1:${f.tx_hash}:${(f.trace_address||[]).join('.')}`, tx:f.tx_hash,
  block:f.block_number, population:'reverted', registrarVersion:f.registrar_version,
  period: f.block_number<B_PRE?'historical_hypothetical':f.block_number<P_ENS?'feasible_counterfactual':'realized',
  selector:f.selector, blockTimestamp: ts[f.block_number].timestamp, parentBlock:f.block_number-1,
  ...route(f.registrar_version,f.block_number)});
fs.writeFileSync('research/derived/p3-override-map.json',JSON.stringify(rows,null,1));
console.log(`override map: ${rows.length} rows (successful ${calls.length}, reverted ${failed.length})`);
const byOld={}; for(const r of rows) byOld[r.oldRole]=(byOld[r.oldRole]||0)+1;
console.log('OLD-variant bytecode routing:'); for(const [k,v] of Object.entries(byOld)) console.log('   '+k.padEnd(36)+v);
const byOracle={}; for(const r of rows) byOracle[r.oracleRole]=(byOracle[r.oracleRole]||0)+1;
console.log('oracle routing:'); for(const [k,v] of Object.entries(byOracle)) console.log('   '+k.padEnd(36)+v);
const byAct={}; for(const r of rows) byAct[r.actualVariantOnChain]=(byAct[r.actualVariantOnChain]||0)+1;
console.log('actual on-chain variant:', JSON.stringify(byAct));
// invariant: no realized-period row may route to the legacy old verifier
const bad=rows.filter(r=>r.period==='realized'&&r.oldRole!=='alg13_verifier_old_current_oracle');
console.log('routing invariant violations:', bad.length);
