import { join } from 'node:path';
import type { GoldenWorkflowDeps } from '../core/goldenWorkflow.js';
import { DeterministicAgentProvider } from '../core/deterministicAgents.js';
import { CryptoIdGenerator, SystemClock } from '../core/runtime.js';
import { OpenAIAgentProvider } from '../infrastructure/openai/agentProvider.js';
import { JsonFileExecutionStore } from '../infrastructure/local/jsonFileStore.js';

type Runtime = GoldenWorkflowDeps;

declare global {
  var __personalAiOsRuntime: Runtime | undefined;
}

export function getDemoRuntime(): Runtime {
  if (!globalThis.__personalAiOsRuntime) {
    const localDataPath = process.env.LOCAL_DATA_PATH || join(process.cwd(), '.data', 'personal-ai-os.json');
    globalThis.__personalAiOsRuntime = {
      store: new JsonFileExecutionStore(localDataPath),
      agents: process.env.OPENAI_API_KEY ? new OpenAIAgentProvider() : new DeterministicAgentProvider(),
      clock: new SystemClock(),
      ids: new CryptoIdGenerator()
    };
  }
  return globalThis.__personalAiOsRuntime;
}
