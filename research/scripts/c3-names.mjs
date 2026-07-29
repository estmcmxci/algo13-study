import {rpc} from './rpc.mjs';
import fs from 'node:fs';
const REG={current:'0xB32cB5677a7C971689228EC835800432B339bA2B',legacy:'0x58774Bb8acD458A640aF0B88238369A167546ef2'};
const T={current:'0x87db02a0e483e2818060eddcbb3488ce44e35aff49a70d92c2aa6c8046cf01e2',
         legacy:'0xa2e66ce20e6fb2c4f61339c364ad79f15160cf5307230c8bc4d628adbca2ba39'};
// node + owner are INDEXED -> data holds only [offset, (inception), len, dnsname]
function decodeName(dataHex){
  const d=Buffer.from(dataHex.slice(2),'hex');
  const off=Number(BigInt('0x'+d.slice(0,32).toString('hex')));
  const len=Number(BigInt('0x'+d.slice(off,off+32).toString('hex')));
  const raw=d.slice(off+32,off+32+len);
  const labels=[]; let i=0;
  while(i<raw.length){ const l=raw[i]; if(l===0)break; labels.push(raw.slice(i+1,i+1+l).toString('utf8')); i+=1+l; }
  return labels.join('.');
}
// Extraction cutoff of the published study. Pinned so this script reproduces the
// figures in the write-up rather than drifting as new imports land. Override with
// CUTOFF_BLOCK=latest to count the present-day population instead.
const CUTOFF = process.env.CUTOFF_BLOCK || '0x1870ae0';   // 25,627,360 (2026-07-27)
console.log('cutoff block:', CUTOFF === 'latest' ? 'latest' : parseInt(CUTOFF,16).toLocaleString());
const out=[];
for(const v of ['current','legacy']){
  const logs=await rpc('eth_getLogs',[{fromBlock:'0x0',toBlock:CUTOFF,address:REG[v],topics:[T[v]]}],{endpoint:'public'});
  console.log(v+' Claim logs:',logs.length);
  for(const l of logs){ let name=null,err=null; try{name=decodeName(l.data);}catch(e){err=String(e.message).slice(0,60);}
    out.push({tx:l.transactionHash,block:parseInt(l.blockNumber,16),logIndex:parseInt(l.logIndex,16),
      registrarVersion:v,name,err}); }
}
fs.writeFileSync('research/derived/c3-imported-names.json',JSON.stringify(out,null,1));
const ok=out.filter(x=>x.name);
console.log('total claims:',out.length,' names decoded:',ok.length,' failed:',out.length-ok.length);
const uniqTx=new Set(out.map(x=>x.tx));
console.log('distinct txs:',uniqTx.size);
const dup=out.length-new Set(out.map(x=>x.tx+':'+x.logIndex)).size;
console.log('duplicate (tx,logIndex):',dup);
const tlds={}; for(const x of ok){ const p=x.name.split('.'); tlds[p[p.length-1]]=(tlds[p[p.length-1]]||0)+1; }
console.log('distinct TLDs:',Object.keys(tlds).length);
console.log('top 20:'); for(const [k,v] of Object.entries(tlds).sort((a,b)=>b[1]-a[1]).slice(0,20)) console.log('   .'+k.padEnd(14)+String(v).padStart(5));
