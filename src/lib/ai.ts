import "server-only";
import { createAzure } from "@ai-sdk/azure";
import {
  availableModels,
  DEFAULT_BUILD_MODEL,
  DEFAULT_CHAT_MODEL,
  DEFAULT_FIX_MODEL,
  DEFAULT_STRUCTURED_MODEL,
} from "@/lib/models";

// Azure AI Foundry via the AI SDK. Billing runs through the Azure subscription that owns
// the Foundry resource. Each deployment is named after its model (see src/lib/models.ts).
//
// Every call picks the cheapest model that does the job well:
//   chat        agents' messages in the huddle                  gpt-4.1-nano
//   structured  spec reading, cards, huddle plan, design choice  gpt-5.4-mini, no reasoning
//   planner     the build round's task list                     gpt-5.4-mini, low reasoning
//   builder     writing code (the project's choice)             gpt-5.4-mini, gpt-5.4 for fixes

export function aiConfigured() {
  return Boolean((process.env.AZURE_RESOURCE_NAME || process.env.AZURE_BASE_URL) && process.env.AZURE_API_KEY);
}

let provider: ReturnType<typeof createAzure> | null = null;

function azure() {
  if (!aiConfigured()) {
    throw new Error(
      "Azure AI Foundry is not configured. Set AZURE_RESOURCE_NAME (or AZURE_BASE_URL) and AZURE_API_KEY.",
    );
  }
  provider ??= createAzure({
    resourceName: process.env.AZURE_BASE_URL ? undefined : process.env.AZURE_RESOURCE_NAME,
    baseURL: process.env.AZURE_BASE_URL || undefined,
    apiKey: process.env.AZURE_API_KEY,
  });
  return provider;
}

export function modelFor(deployment: string) {
  return azure()(deployment);
}

export const chatModelId = () => process.env.AZURE_CHAT_DEPLOYMENT || DEFAULT_CHAT_MODEL;
export const structuredModelId = () => process.env.AZURE_STRUCTURED_DEPLOYMENT || DEFAULT_STRUCTURED_MODEL;
export const plannerModelId = () => process.env.AZURE_PLANNER_DEPLOYMENT || DEFAULT_BUILD_MODEL;

/** Only deployments we offer can be chosen; anything else falls back to the default. */
function offered(choice: string | null | undefined) {
  return choice && availableModels().some((m) => m.id === choice) ? choice : null;
}

/** The deployment the builder writes code with. A project's explicit choice always wins. */
export function builderModelId(choice?: string | null, opts: { fixing?: boolean } = {}) {
  const picked = offered(choice);
  if (picked) return picked;
  if (opts.fixing) return process.env.AZURE_BUILDER_FIX_DEPLOYMENT || DEFAULT_FIX_MODEL;
  return process.env.AZURE_BUILDER_DEPLOYMENT || DEFAULT_BUILD_MODEL;
}

/** GPT-4.x models don't reason; sending the setting only produces warnings. */
export function reasoningFor<T extends string>(deployment: string, level: T): T | undefined {
  return /^gpt-4|^gpt-3/i.test(deployment) ? undefined : level;
}
