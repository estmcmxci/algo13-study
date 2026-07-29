import {rpc} from './rpc.mjs';
const P256NEW='0xb091c4f6fac16edda5ee1e0f4738f80011905878'; // code EXISTS from 24526617
const IMPL='0x0fc3152971714E5ed7723FAFa650F86A4BaF30C5';    // code EXISTS from 19020686
const N=60;
async function probe(label, addr, block, expectSize){
  let ok=0, falseEmpty=0, wrongSize=0, err=0;
  for(let i=0;i<N;i++){
    try{
      const c=await rpc('eth_getCode',[addr,'0x'+block.toString(16)],{retries:1});
      const sz=(c.length-2)/2;
      if(sz===expectSize) ok++; else if(sz===0) falseEmpty++; else wrongSize++;
    }catch(e){err++;}
  }
  console.log(`${label}\n   correct=${ok}/${N}  FALSE-EMPTY=${falseEmpty}  wrongSize=${wrongSize}  err=${err}  => false-empty rate ${(100*falseEmpty/N).toFixed(1)}%`);
}
await probe('eth_getCode p256New @24,600,000 (recent, code=1039B)', P256NEW, 24600000, 1039);
await probe('eth_getCode DNSSECImpl @20,000,000 (mid, code=7588B)', IMPL, 20000000, 7588);
await probe('eth_getCode DNSSECImpl @19,020,700 (old, code=7588B)', IMPL, 19020700, 7588);

// does eth_call suffer the same? algorithms(13) at a block where answer is known-nonzero
const call13='0xc327deef'+'0d'.padStart(64,'0');
let good=0,zero=0,e2=0;
for(let i=0;i<N;i++){
  try{ const r=await rpc('eth_call',[{to:IMPL,data:call13},'0x'+(24619422).toString(16)],{retries:1});
       if(r.slice(26)==='0faa24e538ba4620165933f68a9d142f79a68091') good++; else zero++;
  }catch(err){e2++;}
}
console.log(`\neth_call algorithms(13) @24,619,422 [truth: 0x0faa24e5…]\n   correct=${good}/${N}  WRONG=${zero}  err=${e2}`);
