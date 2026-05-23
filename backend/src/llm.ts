import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createWorkersAI } from "workers-ai-provider";
import type { LanguageModel } from "ai";
import type { Env } from "./index";

const OPENROUTER_DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

/**
 * Single source of truth for resolving a configured Vercel-`ai`-compatible
 * model. Phase 02 supports Workers AI (default, free of egress + secrets)
 * and OpenRouter (opt-in via secret). Both are proxied through the same
 * Cloudflare AI Gateway slug so we get caching, rate-limit guarding, and
 * request logs without code-side wiring.
 */
export function getModel(env: Env): LanguageModel {
  const provider = env.AGENT_LLM_PROVIDER;

  if (provider === "echo") {
    throw new Error(
      "AGENT_LLM_PROVIDER='echo' is not supported in the LLM path. Set AGENT_LLM_PROVIDER to 'workers-ai' or 'openrouter'.",
    );
  }

  if (provider === "openrouter") {
    if (!env.OPENROUTER_API_KEY) {
      throw new Error(
        "AGENT_LLM_PROVIDER='openrouter' requires the OPENROUTER_API_KEY secret. Set it with `wrangler secret put OPENROUTER_API_KEY` (or add it to backend/.dev.vars locally).",
      );
    }
    // AI Gateway is optional. When AI_GATEWAY_ACCOUNT_ID is set, route through
    // Cloudflare's gateway for caching, rate-limit guarding, and request logs.
    // Otherwise hit OpenRouter directly — the demo path stays unblocked even
    // before the gateway slug is provisioned.
    const baseURL =
      env.AI_GATEWAY_ACCOUNT_ID && env.AI_GATEWAY_ACCOUNT_ID.length > 0
        ? `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/openrouter`
        : undefined;
    const openrouter = createOpenRouter({
      apiKey: env.OPENROUTER_API_KEY,
      ...(baseURL ? { baseURL } : {}),
    });
    return openrouter.chat(OPENROUTER_DEFAULT_MODEL);
  }

  if (provider === "workers-ai") {
    const workersai = createWorkersAI({
      binding: env.AI,
      gateway: { id: env.AI_GATEWAY_ID },
    });
    return workersai(env.WORKERS_AI_MODEL);
  }

  throw new Error(
    `Unknown AGENT_LLM_PROVIDER='${provider}'. Expected 'workers-ai' or 'openrouter'.`,
  );
}

/**
 * Human-readable provider tag for logs and the agent's `[provider=…]` debug
 * line. Mirrors what `getModel` would build for the same env without
 * actually constructing the client.
 */
export function describeProvider(env: Env): string {
  const provider = env.AGENT_LLM_PROVIDER;
  if (provider === "openrouter") {
    const transport =
      env.AI_GATEWAY_ACCOUNT_ID && env.AI_GATEWAY_ACCOUNT_ID.length > 0
        ? `via ${env.AI_GATEWAY_ID} gateway`
        : "direct";
    return `openrouter:${OPENROUTER_DEFAULT_MODEL} ${transport}`;
  }
  if (provider === "workers-ai") {
    return `workers-ai:${env.WORKERS_AI_MODEL} via ${env.AI_GATEWAY_ID} gateway`;
  }
  return `unknown:${provider}`;
}
