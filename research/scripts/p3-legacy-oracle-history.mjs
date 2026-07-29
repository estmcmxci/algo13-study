import {rpc} from './rpc.mjs';
import {readConfirmed} from './rpc2.mjs';
const REG_LEG='0x58774bb8acd458a640af0b88238369a167546ef2';
for(const b of [13040372,13083904,13097301,13103260,13103261,13103262,13200000,19093081]){
  const r=await readConfirmed('eth_call',[{to:REG_LEG,data:'0x7dc0d1d0'},'0x'+b.toString(16)],{endpoint:'alchemy'});
  console.log(`  legacy registrar @${String(b).padEnd(9)} oracle() = 0x${r.value.slice(26)}`);
}
