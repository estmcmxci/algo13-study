import {rpc} from './rpc.mjs';
const ORC='0x0fc3152971714E5ed7723FAFa650F86A4BaF30C5';
const raw=await rpc('eth_call',[{to:ORC,data:'0x98d35f20'},'latest'],{endpoint:'public'});
// abi-decoded bytes: offset(32) + length(32) + data
const len=parseInt(raw.slice(66,130),16);
const data=raw.slice(130,130+len*2);
console.log('anchors length:',len,'bytes');
console.log('anchors hex:',data);
// DS RR wire format after the owner name: type(2) class(2) ttl(4) rdlen(2) keytag(2) alg(1) digesttype(1) digest
let i=0; const b=Buffer.from(data,'hex');
while(i<b.length){
  // owner name: root = single 0x00
  if(b[i]!==0){ console.log('  unexpected owner name byte at',i); break; }
  i+=1;
  const type=b.readUInt16BE(i); i+=2;
  const cls=b.readUInt16BE(i); i+=2;
  const ttl=b.readUInt32BE(i); i+=4;
  const rdlen=b.readUInt16BE(i); i+=2;
  const keytag=b.readUInt16BE(i);
  const alg=b[i+2], dt=b[i+3];
  const digest=b.slice(i+4,i+rdlen).toString('hex');
  console.log(`  DS record: keytag=${keytag} algorithm=${alg} digestType=${dt} type=${type} class=${cls} ttl=${ttl}`);
  console.log(`             digest=${digest}`);
  i+=rdlen;
}
console.log('\nIANA root KSK reference: tag 19036 (KSK-2010, retired) and tag 20326 (KSK-2017, current).');
