SHELL := /bin/bash
PROJECT := opencandle
COMPOSE := docker compose -p $(PROJECT)
VOLUMES := opencandle-data pi-agent opencandle-workspace opencandle-home
BACKUP_DIR := backups
NODE_IMAGE := node:24-bookworm-slim

.PHONY: help build up down logs cli doctor shell smoke test-persistence backup restore upgrade

help: ## List targets
	@grep -hE '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-18s %s\n", $$1, $$2}'

build: ## Build the image
	$(COMPOSE) build

up: ## Start the GUI in the background (http://localhost:14567 by default)
	$(COMPOSE) up -d --build --wait
	@echo "OpenCandle: http://localhost:$${HOST_PORT:-14567}"

down: ## Stop (data volumes are kept)
	$(COMPOSE) down

logs: ## Follow logs
	$(COMPOSE) logs -f opencandle

cli: ## OpenCandle terminal agent
	$(COMPOSE) run --rm opencandle cli

doctor: ## Check setup and model server
	$(COMPOSE) run --rm opencandle doctor

shell: ## Shell in a new container
	$(COMPOSE) run --rm opencandle shell

smoke: ## Smoke test against the fake LLM (isolated volumes)
	scripts/smoke-test.sh

test-persistence: ## Persistence test (isolated volumes)
	scripts/test-persistence.sh

backup: ## Archive all data volumes into backups/
	@mkdir -p $(BACKUP_DIR)
	@ts=$$(date +%Y%m%d-%H%M%S); \
	docker run --rm $(foreach v,$(VOLUMES),-v $(PROJECT)_$(v):/backup/$(v):ro) -v "$(abspath $(BACKUP_DIR)):/out" \
	  $(NODE_IMAGE) tar czf /out/opencandle-$$ts.tar.gz -C /backup . && \
	echo "Wrote $(BACKUP_DIR)/opencandle-$$ts.tar.gz"

restore: ## Restore volumes from BACKUP=backups/<file>.tar.gz (overwrites!)
	@test -n "$(BACKUP)" && test -f "$(BACKUP)" || { echo "usage: make restore BACKUP=backups/<file>.tar.gz"; exit 1; }
	@read -p "This replaces all current OpenCandle data with $(BACKUP). Continue? [y/N] " a && [ "$$a" = y ]
	$(COMPOSE) down
	docker run --rm $(foreach v,$(VOLUMES),-v $(PROJECT)_$(v):/backup/$(v)) -v "$(abspath $(dir $(BACKUP))):/in:ro" \
	  $(NODE_IMAGE) sh -c 'for v in $(VOLUMES); do find /backup/$$v -mindepth 1 -delete; done; tar xzf /in/$(notdir $(BACKUP)) -C /backup'
	$(COMPOSE) up -d --wait

upgrade: ## Pin a new OpenCandle release: make upgrade VERSION=x.y.z
	@test -n "$(VERSION)" || { echo "usage: make upgrade VERSION=x.y.z"; exit 1; }
	docker run --rm -v "$$PWD/docker/app:/app" -w /app $(NODE_IMAGE) \
	  sh -c 'npm pkg set dependencies.opencandle=$(VERSION) && npm install --package-lock-only --omit=dev --no-audit --no-fund'
	sed -i.bak 's/^ARG OPENCANDLE_VERSION=.*/ARG OPENCANDLE_VERSION=$(VERSION)/' docker/Dockerfile && rm docker/Dockerfile.bak
	$(COMPOSE) up -d --build --wait
