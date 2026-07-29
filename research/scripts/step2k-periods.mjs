import {rpc} from './rpc.mjs';
const B_PRE=23935694, P_ENS=24619423;
const R={cur:'0xB32cB5677a7C971689228EC835800432B339bA2B',leg:'0x58774Bb8acD458A640aF0B88238369A167546ef2'};
const T={cur:'0x87db02a0e483e2818060eddcbb3488ce44e35aff49a70d92c2aa6c8046cf01e2',leg:'0xa2e66ce20e6fb2c4f61339c364ad79f15160cf5307230c8bc4d628adbca2ba39'};
const all=[];
for(const [k,addr] of Object.entries(R)){
  const logs=await rpc('eth_getLogs',[{fromBlock:'0x0',toBlock:'latest',address:addr,topics:[T[k]]}]);
  for(const l of logs) all.push({reg:k,block:parseInt(l.blockNumber,16),tx:l.transactionHash});
}
all.sort((a,b)=>a.block-b.block);
const period=b=> b<B_PRE?'1 historical_hypothetical': b<P_ENS?'2 feasible_counterfactual':'3 realized';
const agg={};
for(const c of all){const p=period(c.block);agg[p]??={claims:0,txs:new Set(),reg:{}};agg[p].claims++;agg[p].txs.add(c.tx);agg[p].reg[c.reg]=(agg[p].reg[c.reg]||0)+1;}
console.log(`TOTAL successful Claim events: ${all.length}  across ${new Set(all.map(c=>c.tx)).size} transactions`);
console.log(`B_precompile=${B_PRE}  P_ENS=${P_ENS}\n`);
for(const p of Object.keys(agg).sort()){
  const a=agg[p];
  console.log(`  ${p.padEnd(28)} claims ${String(a.claims).padStart(5)}  txs ${String(a.txs.size).padStart(5)}  by registrar ${JSON.stringify(a.reg)}`);
}
const last=all.at(-1);
console.log(`\n  earliest claim block ${all[0].block}   latest claim block ${last.block}`);
