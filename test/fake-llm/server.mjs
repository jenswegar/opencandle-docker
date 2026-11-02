// Minimal OpenAI-compatible server for smoke tests. No dependencies.
//   GET  /v1/models            -> one model, "fake-model"
//   POST /v1/chat/completions  -> fixed reply "FAKE-LLM-OK" (stream or not)
// Env: FAKE_LLM_PORT (18080), FAKE_LLM_API_KEY (optional bearer check),
//      FAKE_LLM_LOG (optional file that gets one JSON line per request).
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";

const port = Number(process.env.FAKE_LLM_PORT ?? 18080);
const apiKey = process.env.FAKE_LLM_API_KEY;
const logFile = process.env.FAKE_LLM_LOG;
const MODEL = "fake-model";
const REPLY = "FAKE-LLM-OK";

function record(entry) {
  const line = JSON.stringify({ time: new Date().toISOString(), ...entry });
  console.log(line);
  if (logFile) appendFileSync(logFile, `${line}\n`);
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || "{}") : {};
  record({ method: req.method, path: req.url, model: body.model, stream: body.stream, tools: body.tools?.length ?? 0 });

  if (apiKey && req.headers.authorization !== `Bearer ${apiKey}`) {
    return json(res, 401, { error: { message: "API key required", type: "authentication_error" } });
  }

  if (req.method === "GET" && req.url === "/v1/models") {
    return json(res, 200, { object: "list", data: [{ id: MODEL, object: "model", owned_by: "fake" }] });
  }

  if (req.method === "POST" && req.url === "/v1/chat/completions") {
    const id = `chatcmpl-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);
    const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };
    if (!body.stream) {
      return json(res, 200, {
        id,
        object: "chat.completion",
        created,
        model: body.model ?? MODEL,
        choices: [{ index: 0, message: { role: "assistant", content: REPLY }, finish_reason: "stop" }],
        usage,
      });
    }
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    const send = (delta, finish = null, extra = {}) =>
      res.write(
        `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model: body.model ?? MODEL, choices: [{ index: 0, delta, finish_reason: finish }], ...extra })}\n\n`,
      );
    send({ role: "assistant", content: "" });
    send({ content: REPLY });
    send({}, "stop", { usage });
    res.end("data: [DONE]\n\n");
    return;
  }

  json(res, 404, { error: { message: `no route ${req.method} ${req.url}` } });
}).listen(port, "0.0.0.0", () => console.log(`fake-llm listening on :${port}`));
