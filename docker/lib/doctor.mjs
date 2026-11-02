// `doctor` mode: checks data dirs, pi model config and the model server(s),
// then runs `opencandle doctor`. Exit code 0 only when every check passes.
import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { modelsPath, settingsPath } from "./config.mjs";

let failed = false;
const ok = (msg) => console.log(`  ok    ${msg}`);
const warn = (msg) => console.log(`  warn  ${msg}`);
const fail = (msg, hint) => {
  failed = true;
  console.log(`  FAIL  ${msg}${hint ? `\n        hint: ${hint}` : ""}`);
};

function resolveKey(apiKey) {
  if (typeof apiKey !== "string") return undefined;
  const ref = apiKey.match(/^\$\{?([A-Z0-9_]+)\}?$/);
  return ref ? process.env[ref[1]] : apiKey;
}

console.log("Data directories");
for (const dir of [process.env.OPENCANDLE_HOME, process.env.PI_CODING_AGENT_DIR, process.env.HOME, "/data/workspace"]) {
  try {
    accessSync(dir, constants.W_OK);
    ok(`${dir} writable`);
  } catch {
    fail(`${dir} not writable`, "fix volume/bind-mount ownership or set APP_UID/APP_GID");
  }
}

console.log("pi model config");
let providers = {};
if (!existsSync(modelsPath)) {
  fail(`${modelsPath} missing`, "set LOCAL_LLM_PRESET and LOCAL_LLM_MODELS in .env");
} else {
  try {
    providers = JSON.parse(readFileSync(modelsPath, "utf8")).providers ?? {};
    ok(`${modelsPath}: ${Object.keys(providers).join(", ") || "(no providers)"}`);
  } catch (error) {
    fail(`${modelsPath} invalid JSON: ${error.message}`);
  }
}
if (existsSync(settingsPath)) {
  const s = JSON.parse(readFileSync(settingsPath, "utf8"));
  ok(`default model: ${s.defaultProvider ?? "?"}/${s.defaultModel ?? "?"}`);
}

console.log("Model servers");
for (const [name, provider] of Object.entries(providers)) {
  if (!provider.baseUrl) continue;
  const url = `${provider.baseUrl.replace(/\/$/, "")}/models`;
  const key = resolveKey(provider.apiKey);
  try {
    const res = await fetch(url, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 401 || res.status === 403) {
      fail(`${name}: ${url} -> HTTP ${res.status}`, "set LOCAL_LLM_API_KEY in .env to the server's API key");
      continue;
    }
    if (!res.ok) {
      fail(`${name}: ${url} -> HTTP ${res.status}`);
      continue;
    }
    const served = new Set(((await res.json()).data ?? []).map((m) => m.id));
    ok(`${name}: ${url} reachable (${served.size} models served)`);
    for (const model of provider.models ?? []) {
      if (served.has(model.id)) ok(`${name}: model ${model.id} available`);
      else
        fail(
          `${name}: model ${model.id} not served`,
          `served: ${[...served].join(", ") || "none"}. Fix LOCAL_LLM_MODELS or load the model.`,
        );
    }
  } catch (error) {
    fail(
      `${name}: ${url} unreachable (${error.cause?.code ?? error.name})`,
      "is the server running? On Linux it must listen on 0.0.0.0 or the docker0 IP, not only 127.0.0.1.",
    );
  }
}

console.log("opencandle doctor");
const oc = spawnSync("opencandle", ["doctor", ...process.argv.slice(2)], { stdio: "inherit" });
if (oc.status !== 0) warn(`opencandle doctor exited with ${oc.status}`);

console.log(failed ? "\nSome checks failed." : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
