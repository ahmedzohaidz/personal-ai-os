import { join } from 'node:path';
import type { GoldenWorkflowDeps } from '../core/goldenWorkflow.js';
import { DeterministicAgentProvider } from '../core/deterministicAgents.js';
import { MemoryExecutionStore } from '../core/memoryStore.js';
import { CryptoIdGenerator, SystemClock } from '../core/runtime.js';
import { JsonFileExecutionStore } from '../infrastructure/local/jsonFileStore.js';
import { OpenAIAgentProvider } from '../infrastructure/openai/agentProvider.js';
import { createSupabaseAdminClient } from '../infrastructure/supabase/admin.js';
import { SupabaseExecutionStore } from '../infrastructure/supabase/executionStore.js';

type Runtime = GoldenWorkflowDeps;

declare global {
  var __personalAiOsRuntimeV03: Runtime | undefined;
}

export function getRuntime(): Runtime {
  if (!globalThis.__personalAiOsRuntimeV03) {
    const persistenceDriver = process.env.PERSISTENCE_DRIVER ?? 'local';
    let store: Runtime['store'];

    const isVercel = process.env.VERCEL === '1';
    const cloudDemoMode = isVercel && persistenceDriver !== 'supabase';

    if (persistenceDriver === 'supabase') {
      const client = createSupabaseAdminClient();
      if (!client) throw new Error('Supabase persistence selected but URL/secret key is not configured');
      store = new SupabaseExecutionStore(client);
    } else if (cloudDemoMode) {
      // Vercel functions do not provide durable writable filesystem storage.
      // Keep the public zero-cost deployment explicitly ephemeral until a
      // dedicated Supabase project is available.
      store = new MemoryExecutionStore();
    } else {
      const localDataPath = process.env.LOCAL_DATA_PATH || join(process.cwd(), '.data', 'personal-ai-os.json');
      store = new JsonFileExecutionStore(localDataPath);
    }

    globalThis.__personalAiOsRuntimeV03 = {
      store,
      // In zero-cost Vercel demo mode stay deterministic so one request can
      // finish end-to-end without depending on cross-invocation persistence.
      agents: cloudDemoMode
        ? new DeterministicAgentProvider()
        : process.env.OPENAI_API_KEY
          ? new OpenAIAgentProvider()
          : new DeterministicAgentProvider(),
      clock: new SystemClock(),
      ids: new CryptoIdGenerator()
    };
  }
  return globalThis.__personalAiOsRuntimeV03;
}
