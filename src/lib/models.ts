// The models the builder can write code with: Azure AI Foundry deployments in the EU data
// zone, named after their model. Client-safe (no secrets): the picker reads this list too.
//
// The group chat always runs on the cheapest models (see src/lib/ai.ts); only building, where
// quality shows in the product, is worth a choice. "auto" (no choice) uses the fast model and
// steps up to a stronger one when a build has to be fixed.

export type ModelId = string;

export type ModelOption = {
  id: ModelId;
  label: string;
  /** Dictionary key for a one-line hint (see t.models.hints). */
  hint: "fast" | "strong" | "stronger" | "newest";
};

export const MODEL_CATALOG: ModelOption[] = [
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini", hint: "fast" },
  { id: "gpt-5.4", label: "GPT-5.4", hint: "strong" },
  { id: "gpt-5.5", label: "GPT-5.5", hint: "stronger" },
  { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", hint: "newest" },
  { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", hint: "newest" },
  { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", hint: "newest" },
];

/** Agents' chat messages: short Slack-style replies, the cheapest model that writes them well. */
export const DEFAULT_CHAT_MODEL = "gpt-4.1-nano";
/** An agent answering the human's question directly. */
export const DEFAULT_ANSWER_MODEL = "gpt-5.4-mini";
/** Structured work (spec reading, decision cards, huddle plans, design choice) without reasoning. */
export const DEFAULT_STRUCTURED_MODEL = "gpt-5.4-mini";
export const DEFAULT_BUILD_MODEL = "gpt-5.4-mini";
/** A failed build is harder than the task was: fixes step up to this model on "auto". */
export const DEFAULT_FIX_MODEL = "gpt-5.4";

/**
 * The models this deployment offers. AZURE_MODEL_DEPLOYMENTS (comma-separated deployment
 * names) narrows or extends the catalog when your Foundry resource has a different set.
 */
export function availableModels(env = process.env.AZURE_MODEL_DEPLOYMENTS): ModelOption[] {
  if (!env) return MODEL_CATALOG;
  return env
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => MODEL_CATALOG.find((m) => m.id === id) ?? { id, label: id, hint: "strong" as const });
}

export function modelLabel(id: string | undefined, models: ModelOption[] = MODEL_CATALOG) {
  if (!id) return null;
  return models.find((m) => m.id === id)?.label ?? id;
}
