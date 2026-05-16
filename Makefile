# Crypto Arena Survivors -- top-level orchestration
#
# This Makefile coordinates the npm workspaces (client, contracts) and the
# Go server module. Targets are deliberately tolerant: each step is guarded
# with file-existence checks so a fresh skeleton (no client/server/contracts
# code yet) still exits 0. As later features land the same targets exercise
# the real toolchains.
#
# Use real tabs for recipe lines.

SHELL := /bin/bash

ROOT_DIR     := $(CURDIR)
CLIENT_DIR   := $(ROOT_DIR)/client
SERVER_DIR   := $(ROOT_DIR)/server
CONTRACTS_DIR := $(ROOT_DIR)/contracts

.PHONY: help install build test lint format \
        dev dev-client dev-server \
        docker docker-client docker-server \
        clean

help:
	@echo "Crypto Arena Survivors -- available targets:"
	@echo "  make install        Install npm workspaces and Go modules"
	@echo "  make build          Build client, server, and contracts"
	@echo "  make test           Run all test suites"
	@echo "  make lint           Run linters across all workspaces"
	@echo "  make format         Run formatters across all workspaces"
	@echo "  make dev-client     Start the Vite dev server (client)"
	@echo "  make dev-server     Run the Go API + WebSocket server"
	@echo "  make docker         Build all Docker images"
	@echo "  make docker-client  Build the client Docker image"
	@echo "  make docker-server  Build the server Docker image"
	@echo "  make clean          Remove build outputs and node_modules"

install:
	@echo ">>> Installing npm workspace dependencies"
	@if [ -f "$(ROOT_DIR)/package.json" ]; then \
		npm install --no-audit --no-fund; \
	else \
		echo "    (no root package.json, skipping npm install)"; \
	fi
	@echo ">>> Downloading Go modules"
	@if [ -f "$(SERVER_DIR)/go.mod" ]; then \
		cd "$(SERVER_DIR)" && go mod download; \
	else \
		echo "    (no server/go.mod yet, skipping go mod download)"; \
	fi

build:
	@echo ">>> Building client"
	@if [ -f "$(CLIENT_DIR)/package.json" ]; then \
		npm -w client run build --if-present; \
	else \
		echo "    (no client/package.json yet, skipping)"; \
	fi
	@echo ">>> Building server"
	@if [ -f "$(SERVER_DIR)/go.mod" ]; then \
		cd "$(SERVER_DIR)" && go build ./...; \
	else \
		echo "    (no server/go.mod yet, skipping)"; \
	fi
	@echo ">>> Compiling contracts"
	@if [ -f "$(CONTRACTS_DIR)/package.json" ]; then \
		npm -w contracts run compile --if-present; \
	else \
		echo "    (no contracts/package.json yet, skipping)"; \
	fi

test:
	@echo ">>> Testing client"
	@if [ -f "$(CLIENT_DIR)/package.json" ]; then \
		npm -w client run test --if-present -- --run || npm -w client run test --if-present; \
	else \
		echo "    (no client/package.json yet, skipping)"; \
	fi
	@echo ">>> Testing server"
	@if [ -f "$(SERVER_DIR)/go.mod" ]; then \
		cd "$(SERVER_DIR)" && go test ./...; \
	else \
		echo "    (no server/go.mod yet, skipping)"; \
	fi
	@echo ">>> Testing contracts"
	@if [ -f "$(CONTRACTS_DIR)/package.json" ]; then \
		npm -w contracts run test --if-present; \
	else \
		echo "    (no contracts/package.json yet, skipping)"; \
	fi

lint:
	@echo ">>> Linting npm workspaces"
	@if [ -f "$(ROOT_DIR)/package.json" ]; then \
		npm run lint --workspaces --if-present || true; \
	fi
	@echo ">>> Linting Go server"
	@if [ -f "$(SERVER_DIR)/go.mod" ]; then \
		cd "$(SERVER_DIR)" && go vet ./...; \
	fi

format:
	@echo ">>> Formatting npm workspaces"
	@if [ -f "$(ROOT_DIR)/package.json" ]; then \
		npm run format --workspaces --if-present || true; \
	fi
	@echo ">>> Formatting Go server"
	@if [ -f "$(SERVER_DIR)/go.mod" ]; then \
		cd "$(SERVER_DIR)" && gofmt -w .; \
	fi

dev: dev-client

dev-client:
	@if [ -f "$(CLIENT_DIR)/package.json" ]; then \
		npm -w client run dev; \
	else \
		echo "client/ is not initialized yet (see FEAT-002)"; \
		exit 1; \
	fi

dev-server:
	@if [ -f "$(SERVER_DIR)/go.mod" ]; then \
		cd "$(SERVER_DIR)" && go run ./cmd/api; \
	else \
		echo "server/ is not initialized yet (see FEAT-003)"; \
		exit 1; \
	fi

docker: docker-client docker-server

docker-client:
	@if [ -f "$(CLIENT_DIR)/Dockerfile" ]; then \
		docker build -f "$(CLIENT_DIR)/Dockerfile" -t crypto-arena-survivors/client:dev "$(CLIENT_DIR)"; \
	else \
		echo "client/Dockerfile not present yet, skipping"; \
	fi

docker-server:
	@if [ -f "$(SERVER_DIR)/Dockerfile" ]; then \
		docker build -f "$(SERVER_DIR)/Dockerfile" -t crypto-arena-survivors/server:dev "$(SERVER_DIR)"; \
	else \
		echo "server/Dockerfile not present yet, skipping"; \
	fi

clean:
	@echo ">>> Removing build outputs"
	rm -rf node_modules
	rm -rf "$(CLIENT_DIR)/node_modules" "$(CLIENT_DIR)/dist" "$(CLIENT_DIR)/.vite"
	rm -rf "$(SERVER_DIR)/bin"
	rm -rf "$(CONTRACTS_DIR)/node_modules" "$(CONTRACTS_DIR)/artifacts" "$(CONTRACTS_DIR)/cache" "$(CONTRACTS_DIR)/typechain-types"
