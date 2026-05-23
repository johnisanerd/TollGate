/**
 * @arcmind/agent — public entrypoint.
 *
 * Usage:
 *
 *   import { startArcMindAgent } from "@arcmind/agent";
 *
 *   const stop = await startArcMindAgent({
 *     settings: { ARC_PRIVATE_KEY: "0x…", ARC_AGENT_ID: "0x…" },
 *   });
 *   // …later:
 *   await stop();
 *
 * Architecture mirrors ElizaOS plugins: Character + Providers + Actions +
 * Evaluators + Service. Swap the local `types.ts` import for `@elizaos/core`
 * to upgrade to the full framework.
 */

import { arcMindCharacter } from "./character.js";
import { arcMindService } from "./service/arcMindService.js";
import { createMinimalRuntime, type CreateRuntimeOptions } from "./runtime.js";
import type { Character, IAgentRuntime } from "./types.js";

export { arcMindCharacter } from "./character.js";
export { arcMindService } from "./service/arcMindService.js";
export { createMinimalRuntime, type CreateRuntimeOptions } from "./runtime.js";
export * from "./providers/index.js";
export * from "./actions/index.js";
export * from "./evaluators/index.js";
export type {
  Action, ActionResult, ActionExample,
  Provider, ProviderResult,
  Evaluator, EvaluatorResult,
  Service,
  IAgentRuntime,
  Memory, State, Character, UUID,
} from "./types.js";

export interface StartArcMindAgentOptions {
  character?: Character;
  settings?: Record<string, string | undefined>;
  runtime?: IAgentRuntime;
}

export async function startArcMindAgent(opts: StartArcMindAgentOptions = {}): Promise<() => Promise<void>> {
  const runtimeOpts: CreateRuntimeOptions = {
    character: opts.character ?? arcMindCharacter,
    settings: opts.settings,
  };
  const runtime = opts.runtime ?? createMinimalRuntime(runtimeOpts);
  return arcMindService.start(runtime);
}
