import { loadConfig } from '@kairos/core';

// Phase 1 will turn this into the indexer loop (cursor-based polling of
// program signatures, event decoding, projections). For now it only proves
// the workspace wiring compiles and runs.
const config = loadConfig();
console.log(`kairos worker placeholder — cluster=${config.cluster} rpc=${config.rpcUrl}`);
console.log('The indexer arrives in Phase 1.');
