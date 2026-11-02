# OpenCandle in Docker, with a local model

Runs [OpenCandle](https://github.com/Kahtaf/OpenCandle), an open source financial research agent, in a container. It uses the [pi coding agent](https://pi.dev/) that OpenCandle bundles, talks to a **model server on your machine** (oMLX for now), keeps its data in **Docker volumes**, and serves the GUI on **http://localhost:14567** only.

## Requirements

- Docker Desktop (macOS) or Docker Engine with Compose v2.24+ (Linux)
- `make` (optional; every target is a plain `docker compose` command)
- A local OpenAI-compatible model server with a **tool-calling** model. Tested setup: oMLX on port 8000.

## Quick start (oMLX)

1. Start oMLX and load a model. Note its model ID and API key (oMLX settings).
2. Configure:

   ```bash
   cp .env.example .env
   ```

   Then edit `.env`:

   ```dotenv
   LOCAL_LLM_PRESET=omlx
   LOCAL_LLM_MODELS=Qwen3.8-27B-MLX-4bit   # as listed by oMLX
   LOCAL_LLM_API_KEY=<your oMLX API key>
   ```

3. Check the setup, then start:

   ```bash
   make doctor
   ```

   ```bash
   make up
   ```

4. Open http://localhost:14567.

Terminal agent instead of the GUI: `make cli`.

## How it works

| Piece | Where |
|-------|-------|
| OpenCandle version | Pinned in [docker/app/package.json](docker/app/package.json); [docker/app/package-lock.json](docker/app/package-lock.json) pins all dependencies, including pi |
| Model config | Generated on every start from `.env` into pi's `models.json` ([docker/lib/render-config.mjs](docker/lib/render-config.mjs)). The API key is stored as a `$LOCAL_LLM_API_KEY` reference, not the value. |
| Default model | Written to pi's `settings.json` only if none is set, so a model you pick in the GUI is kept |
| Host access | The container reaches your machine at `host.docker.internal` (built into Docker Desktop, added by `extra_hosts` on Linux) |
| GUI | Listens on `0.0.0.0:14567` inside the container, published only on `127.0.0.1` on the host |

### Your own `models.json`

To use several providers or custom per-model settings:

1. Set `PI_MODELS_MANAGED=false` in `.env`.
2. Edit `/data/pi-agent/models.json` (`make shell`), or copy a file in with `docker compose cp`.

The format is described in [pi's models docs](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/models.md).

## Data

| Volume | Mounted at | Contents |
|--------|------------|----------|
| `opencandle_opencandle-data` | `/data/opencandle` (`OPENCANDLE_HOME`) | watchlists, portfolios, alerts, `state.db`, `config.json` |
| `opencandle_pi-agent` | `/data/pi-agent` (`PI_CODING_AGENT_DIR`) | `models.json`, `settings.json`, `auth.json`, chat sessions |
| `opencandle_opencandle-workspace` | `/data/workspace` | agent working directory |
| `opencandle_opencandle-home` | `/data/home` | `$HOME`, catches anything else |

- To keep data in host folders instead, create them, set the `*_DIR` variables in `.env` (see `.env.example`), and use `docker compose -f compose.yaml -f compose.bind.yaml up -d`. On Linux, also set `APP_UID`/`APP_GID` to your `id -u`/`id -g`.
- `make down` keeps the data. `docker compose down -v` deletes it.
- `make backup` writes `backups/opencandle-<timestamp>.tar.gz`.
- `make restore BACKUP=backups/<file>` replaces the current data, after asking.
- `make upgrade VERSION=x.y.z` pins a new OpenCandle release, rebuilds and restarts. Your data is kept.

## Security

- The GUI has no login. It's published on `127.0.0.1` only, so other machines can't reach it.
- Inside Docker, browser requests come from the Docker network rather than loopback, so `OPENCANDLE_GUI_ALLOW_REMOTE_PRIVATE_API=1` is set. The GUI still requires its session cookie and same-origin headers.
- Don't change `BIND_ADDRESS` from `127.0.0.1` unless you put authentication in front of it.
- The container runs as a non-root user with a read-only root filesystem, all capabilities dropped, and `no-new-privileges`.
- `.env` holds your keys and is git-ignored. Keys are never baked into the image.

## Troubleshooting

Run `make doctor` first. It checks the data folders, `models.json`, the model server, and OpenCandle's own provider checks.

| Symptom | Fix |
|---------|-----|
| `HTTP 401` from the model server | Set `LOCAL_LLM_API_KEY` in `.env`, then `make up`. |
| `model X not served` | Use an ID exactly as `doctor` lists it, or load the model in oMLX. |
| Model server `unreachable` | Is it running? On Linux it must listen on `0.0.0.0` or the docker0 IP, not just `127.0.0.1`. |
| Answers but never uses tools | Use a model with reliable tool calling. |
| Polymarket `Not reachable` in doctor | Network or regional block. It fails from the host too. Optional. |
| Index sparklines missing in the GUI | The external Ticker Line service returns errors for some symbols. Not a container issue. |

## Tests

These run against a fake model server, in a separate Compose project with its own volumes:

- `make smoke` checks health, loopback-only publish, non-root user, key handling, file permissions, `doctor`, and that nothing is written outside the volumes.
- `make test-persistence` checks that data and settings survive `down`/`up` and a rebuild.

## Not included

Reddit and X sentiment (they need CLIs logged in through your host browser), access from other devices on your network, and presets for servers other than oMLX. For those, set `LOCAL_LLM_BASE_URL`/`LOCAL_LLM_PROVIDER` yourself.
