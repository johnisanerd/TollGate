/**
 * Minimal IAgentRuntime implementation — drop-in replacement for @elizaos/core's
 * runtime when the framework isn't installed. Uses in-memory memory storage and
 * process.env for settings.
 */

import type { Character, IAgentRuntime, Memory, State, UUID } from "./types.js";

function uuid(): UUID {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID() as UUID;
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, hex).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` as UUID;
}

export interface CreateRuntimeOptions {
  character: Character;
  settings?: Record<string, string | undefined>;
  agentId?: UUID;
  logger?: IAgentRuntime["logger"];
  memoryStore?: Memory[];
}

const defaultLogger: IAgentRuntime["logger"] = {
  info: (msg, ctx) => console.log("[arcmind]", msg, ctx ?? ""),
  warn: (msg, ctx) => console.warn("[arcmind]", msg, ctx ?? ""),
  error: (msg, ctx) => console.error("[arcmind]", msg, ctx ?? ""),
};

export function createMinimalRuntime(opts: CreateRuntimeOptions): IAgentRuntime {
  const agentId = opts.agentId ?? uuid();
  const memoryStore = opts.memoryStore ?? [];
  const settings = { ...process.env, ...(opts.settings ?? {}) };
  const logger = opts.logger ?? defaultLogger;

  const runtime: IAgentRuntime = {
    agentId,
    character: opts.character,
    logger,

    async composeState(_message?: Memory): Promise<State> {
      return {
        agentId,
        roomId: agentId,
        userId: agentId,
        values: {},
        providers: "",
        recentMessages: memoryStore.slice(-10),
      };
    },

    async createMemory(memory: Memory): Promise<void> {
      memoryStore.push({ ...memory, id: memory.id ?? uuid() });
      if (memoryStore.length > 500) memoryStore.splice(0, memoryStore.length - 500);
    },

    async getMemories(opts: { roomId?: UUID; count?: number }): Promise<Memory[]> {
      const filtered = opts.roomId ? memoryStore.filter((m) => m.roomId === opts.roomId) : [...memoryStore];
      const count = opts.count ?? 10;
      return filtered.slice(-count).reverse();
    },

    getSetting(key: string): string | null {
      const value = settings[key];
      return typeof value === "string" && value.length > 0 ? value : null;
    },
  };

  return runtime;
}
