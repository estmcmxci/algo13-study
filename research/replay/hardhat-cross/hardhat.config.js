import fs from 'node:fs';

// Endpoint resolution: environment first, then .env at the repo root. The study read
// this from ens-contracts/.env, a path that does not exist in this tree — the only
// change made to this file for publication.
function endpoint() {
  if (process.env.MAINNET_API_KEY) return process.env.MAINNET_API_KEY;
  if (process.env.MAINNET_RPC_URL) return process.env.MAINNET_RPC_URL;
  const t = fs.readFileSync(new URL('../../../.env', import.meta.url), 'utf8');
  for (const l of t.split('\n')) {
    const m = l.match(/^\s*MAINNET_API_KEY\s*=\s*(.*)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, '').trim();
  }
  throw new Error('MAINNET_API_KEY not found — set it in the environment or in .env at the repo root');
}

export default {
  networks: {
    hardhat: {
      type: 'edr-simulated',
      chainType: 'l1',
      hardfork: 'osaka',
      // Pinned. This is the cross-check against Foundry, so the two implementations
      // must fork at a fixed block to be compared on identical state.
      forking: { url: endpoint(), blockNumber: 25600000 },
    },
  },
};
