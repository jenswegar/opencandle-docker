// Docker HEALTHCHECK: healthy when the GUI answers over HTTP. In the cli,
// doctor and shell modes there is no GUI, so report healthy instead of noise.
import { readFileSync } from "node:fs";

const cmdline = readFileSync("/proc/1/cmdline", "utf8").split("\0");
const mode = cmdline[3] ?? "gui"; // tini -- entrypoint.sh <mode>
if (mode !== "gui") process.exit(0);

const port = process.env.OPENCANDLE_GUI_PORT ?? "14567";
try {
  const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(4000) });
  process.exit(res.ok ? 0 : 1);
} catch {
  process.exit(1);
}
