/**
 * ElizaOS-compatible types — local shim.
 *
 * These mirror the public shapes of @elizaos/core (Action / Provider / Evaluator /
 * Service / Character / IAgentRuntime / Memory / State) so the rest of this package
 * compiles WITHOUT installing @elizaos/core. When you're ready to upgrade to the
 * full framework, replace the imports here with:
 *
 *   export type { Action, Provider, Evaluator, Service, Character,
 *                 IAgentRuntime, Memory, State } from "@elizaos/core";
 *
 * and delete this file's bodies — every other file in this package keeps working.
 *
 * Reference: https://github.com/elizaOS/eliza (apache-2.0)
 */

export type UUID = `${string}-${string}-${string}-${string}-${string}`;

export interface Memory {
  id?: UUID;
  userId: UUID;
  agentId: UUID;
  roomId: UUID;
  content: { text: string; action?: string; source?: string; metadata?: Record<string, unknown> };
  createdAt?: number;
  embedding?: number[];
}

/** Mutable per-turn state passed between providers and actions. */
export interface State {
  agentId: UUID;
  roomId: UUID;
  userId: UUID;
  /** Aggregated free-form context produced by providers. */
  providers?: string;
  /** Raw structured key→value bag for state composition. */
  values?: Record<string, unknown>;
  /** Recent decisions, observations, market data. */
  recentMessages?: Memory[];
  [k: string]: unknown;
}

/** Minimal subset of IAgentRuntime needed by Actions and Providers. */
export interface IAgentRuntime {
  agentId: UUID;
  character: Character;
  composeState(message?: Memory): Promise<State>;
  /** Persist a memory item — by default appends to in-memory log. */
  createMemory(memory: Memory): Promise<void>;
  /** Read previously stored memories. */
  getMemories(opts: { roomId?: UUID; count?: number }): Promise<Memory[]>;
  /** Resolve an env-style setting (e.g. private key). */
  getSetting(key: string): string | null;
  /** Logger surface. */
  logger: {
    info: (msg: string, ctx?: object) => void;
    warn: (msg: string, ctx?: object) => void;
    error: (msg: string, ctx?: object) => void;
  };
}

/** A side-effect the agent can take (e.g. record decision on-chain). */
export interface Action {
  name: string;
  description: string;
  similes?: string[];
  examples?: ActionExample[][];
  validate(runtime: IAgentRuntime, message?: Memory, state?: State): Promise<boolean>;
  handler(runtime: IAgentRuntime, message?: Memory, state?: State): Promise<ActionResult>;
}

export interface ActionResult {
  success: boolean;
  text?: string;
  data?: Record<string, unknown>;
  error?: string;
}

export interface ActionExample {
  user: string;
  content: { text: string; action?: string };
}

/** A data source (market price, OI, news) that feeds context into State. */
export interface Provider {
  name: string;
  description: string;
  /** Returns the slice of State this provider contributes. */
  get(runtime: IAgentRuntime, message?: Memory, state?: State): Promise<ProviderResult>;
}

export interface ProviderResult {
  /** Free-form text appended to State.providers. */
  text?: string;
  /** Structured values merged into State.values. */
  values?: Record<string, unknown>;
  /** Optional debug info (last update, source URL, etc.). */
  data?: Record<string, unknown>;
}

/** Runs AFTER an action to grade the outcome — e.g. reputation update. */
export interface Evaluator {
  name: string;
  description: string;
  alwaysRun?: boolean;
  validate(runtime: IAgentRuntime, message?: Memory, state?: State): Promise<boolean>;
  handler(runtime: IAgentRuntime, message?: Memory, state?: State): Promise<EvaluatorResult>;
}

export interface EvaluatorResult {
  score: number;          // 0..100
  text?: string;
  data?: Record<string, unknown>;
}

/** Long-running background process (e.g. 30-min decision loop). */
export interface Service {
  name: string;
  description: string;
  start(runtime: IAgentRuntime): Promise<() => Promise<void>>;
}

/** Character file — same shape as ElizaOS character JSON. */
export interface Character {
  name: string;
  bio: string[];
  lore?: string[];
  knowledge?: string[];
  topics?: string[];
  adjectives?: string[];
  modelProvider?: string;
  settings?: Record<string, unknown>;
  plugins?: string[];
}
