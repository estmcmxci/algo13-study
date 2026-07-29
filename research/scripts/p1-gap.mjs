import {rpc} from './rpc.mjs';
const ORACLE_LEG='0x21745ff62108968fbf5ab1e07961cc0fcbeb2364';
const T='0x55ee06b1c9052dc4a5cd3e5cb75c0e5c65e7d4e0c4b0e0f38bc9fdc1e1f5cbcc';
// enumerate ALL log topics emitted by the legacy oracle, cheaply
const logs=await rpc('eth_getLogs',[{fromBlock:'0x0',toBlock:'latest',address:ORACLE_LEG}],{endpoint:'public'});
console.log(`legacy oracle total logs: ${logs.length}`);
const byTopic={}; for(const l of logs){ const t=l.topics[0]||'(none)'; byTopic[t]=(byTopic[t]||0)+1; }
for(const [t,c] of Object.entries(byTopic).sort((a,b)=>b[1]-a[1])) console.log(`  ${t}  ${c}`);
const txs=new Set(logs.map(l=>l.transactionHash));
console.log(`distinct txs touching legacy oracle (log-emitting): ${txs.size}`);
