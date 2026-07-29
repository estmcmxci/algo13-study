import {rpc} from './rpc.mjs';
import {execSync} from 'node:child_process';
const keccak=h=>execSync(`cast keccak ${h}`,{maxBuffer:1<<28}).toString().trim();
const ADDR='0xb091c4f6fac16edda5ee1e0f4738f80011905878';
console.log('code presence / hash across time at', ADDR);
for (const b of [19220349,19220350,19220351,20000000,22000000,23935694,24526616,24526617,24526618,24619423,25000000,'latest']) {
  const tag=b==='latest'?'latest':'0x'+b.toString(16);
  const c=await rpc('eth_getCode',[ADDR,tag]);
  const sz=(c.length-2)/2;
  console.log(`  ${String(b).padEnd(10)} size ${String(sz).padStart(5)}B  ${sz?keccak(c).slice(0,18)+'…':'(EMPTY)'}`);
}
console.log('\n--- manager-cited creation tx 0x8f6ed545… :');
const t='0x8f6ed545325f825ebaa4979959ffae821c8f802711e8a0c214d83037e2d04180';
try {
  const tx=await rpc('eth_getTransactionByHash',[t]);
  const rc=await rpc('eth_getTransactionReceipt',[t]);
  console.log(`  block ${parseInt(tx.blockNumber,16)} txIndex ${parseInt(tx.transactionIndex,16)} from ${tx.from}`);
  console.log(`  to ${tx.to} contractAddress ${rc.contractAddress} status ${rc.status}`);
} catch(e){console.log('  ERR',e.message.slice(0,160));}
console.log('\n--- what is at block 24526617 index 16 (manager indexed this position):');
const blk=await rpc('eth_getBlockByNumber',['0x'+(24526617).toString(16),true]);
console.log('  block tx count', blk.transactions.length);
const tx16=blk.transactions[16];
console.log(`  idx16 hash ${tx16.hash} to ${tx16.to}`);
const rc16=await rpc('eth_getTransactionReceipt',[tx16.hash]);
console.log(`  idx16 contractAddress ${rc16.contractAddress}`);
