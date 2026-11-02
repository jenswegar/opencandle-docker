// Shared helpers: resolve the effective local-LLM settings from a preset file
// plus explicit LOCAL_LLM_* environment overrides.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PRESET_DIR = "/opt/opencandle-docker/presets";

export const agentDir = process.env.PI_CODING_AGENT_DIR ?? "/data/pi-agent";
export const modelsPath = join(agentDir, "models.json");
export const settingsPath = join(agentDir, "settings.json");

export function isTrue(value) {
  return /^(1|true|yes|on)$/i.test(value ?? "");
}

function readPreset(name) {
  const file = join(PRESET_DIR, `${name}.env`);
  if (!existsSync(file)) {
    throw new Error(`Unknown LOCAL_LLM_PRESET "${name}" (no ${file}).`);
  }
  const values = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

/** Effective local LLM config, or null when no model is configured. */
export function localLlmConfig(env = process.env) {
  const preset = env.LOCAL_LLM_PRESET ? readPreset(env.LOCAL_LLM_PRESET) : {};
  const pick = (key, fallback) => (env[key] ? env[key] : (preset[key] ?? fallback));

  const models = pick("LOCAL_LLM_MODELS", "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  return {
    preset: env.LOCAL_LLM_PRESET || null,
    provider: pick("LOCAL_LLM_PROVIDER", "local"),
    baseUrl: pick("LOCAL_LLM_BASE_URL", ""),
    api: pick("LOCAL_LLM_API", "openai-completions"),
    hasApiKey: Boolean(env.LOCAL_LLM_API_KEY),
    models,
    contextWindow: Number(pick("LOCAL_LLM_CONTEXT_WINDOW", "")) || undefined,
    maxTokens: Number(pick("LOCAL_LLM_MAX_TOKENS", "")) || undefined,
    defaultModel: env.PI_DEFAULT_MODEL || models[0],
  };
}
