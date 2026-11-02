// Renders pi's models.json from LOCAL_LLM_* env vars and seeds the default
// provider/model in settings.json. Runs on every container start.
//
// models.json is (re)written when it is missing or PI_MODELS_MANAGED=true
// (default). Set PI_MODELS_MANAGED=false to manage the file yourself.
// settings.json defaults are only written when absent, unless
// PI_SETTINGS_FORCE_DEFAULT_MODEL=true.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { agentDir, isTrue, localLlmConfig, modelsPath, settingsPath } from "./config.mjs";

const log = (msg) => console.error(`[opencandle-docker] ${msg}`);

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error.message}`);
  }
}

const cfg = localLlmConfig();
const managed = process.env.PI_MODELS_MANAGED == null || isTrue(process.env.PI_MODELS_MANAGED);

if (cfg.models.length === 0 || !cfg.baseUrl) {
  log("LOCAL_LLM_MODELS / LOCAL_LLM_BASE_URL not set; leaving pi model config untouched.");
  process.exit(0);
}

if (managed || !existsSync(modelsPath)) {
  const provider = {
    baseUrl: cfg.baseUrl,
    api: cfg.api,
    // Reference, not the secret: pi resolves "$VAR" from the environment.
    apiKey: cfg.hasApiKey ? "$LOCAL_LLM_API_KEY" : "local",
    models: cfg.models.map((id) => ({
      id,
      ...(cfg.contextWindow && { contextWindow: cfg.contextWindow }),
      ...(cfg.maxTokens && { maxTokens: cfg.maxTokens }),
    })),
  };
  writeJson(modelsPath, {
    $schema: "https://pi.dev/schemas/models.json",
    providers: { [cfg.provider]: provider },
  });
  log(`Wrote ${modelsPath}: provider "${cfg.provider}" at ${cfg.baseUrl}, models ${cfg.models.join(", ")}.`);
} else {
  log(`PI_MODELS_MANAGED=false and ${modelsPath} exists; not touching it.`);
}

const force = isTrue(process.env.PI_SETTINGS_FORCE_DEFAULT_MODEL);
const settings = existsSync(settingsPath) ? readJson(settingsPath) : {};
if (force || settings.defaultProvider == null || settings.defaultModel == null) {
  settings.defaultProvider = cfg.provider;
  settings.defaultModel = cfg.defaultModel;
  writeJson(settingsPath, settings);
  log(`Default model in ${agentDir}/settings.json: ${cfg.provider}/${cfg.defaultModel}.`);
}
