.PHONY: test test-fixtures test-e2e test-all build clean deploy deploy-patch deploy-minor deploy-major check link integration-test test-llm

# Load .env file if it exists
ifneq (,$(wildcard .env))
    include .env
    export
endif

# Integration test defaults
AGENT ?= オートマタ
PROMPT ?= run the validation doc.

# XDG isolation for E2E tests
E2E_ROOT := $(shell mktemp -d)
export XDG_DATA_HOME := $(E2E_ROOT)/share
export XDG_CONFIG_HOME := $(E2E_ROOT)/config
export XDG_CACHE_HOME := $(E2E_ROOT)/cache
export XDG_STATE_HOME := $(E2E_ROOT)/state
export OPENCODE_TEST_HOME := $(E2E_ROOT)
export OPENCODE_DISABLE_SHARE := true
export OPENCODE_DISABLE_LSP_DOWNLOAD := true
export OPENCODE_DISABLE_DEFAULT_PLUGINS := true
export OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER := true

# Default target
help:
	@echo "Available commands:"
	@echo ""
	@echo "Testing:"
	@echo "  make test           - Run all unit tests (vitest)"
	@echo "  make test-fixtures  - Run fixture tests only"
	@echo "  make test-e2e       - Run E2E tests with XDG isolation"
	@echo "  make test-all       - Run unit + E2E tests"
	@echo "  make test-llm       - Run real LLM validation tests (requires API keys)"
	@echo ""
	@echo "Building:"
	@echo "  make build          - Build the project"
	@echo "  make check          - Run tests + build (pre-deploy verification)"
	@echo "  make link           - Build and npm link for local testing"
	@echo ""
	@echo "Integration:"
	@echo "  make integration-test - Full integration test with opencode CLI"
	@echo ""
	@echo "Deployment:"
	@echo "  make deploy         - Publish current version to npm"
	@echo "  make deploy-patch   - Bump patch version (x.x.X) and publish"
	@echo "  make deploy-minor   - Bump minor version (x.X.0) and publish"
	@echo "  make deploy-major   - Bump major version (X.0.0) and publish"
	@echo ""
	@echo "Integration test options:"
	@echo "  AGENT=<agent>   - Agent type (default: オートマタ)"
	@echo "  PROMPT=<text>   - Custom prompt for the agent"
	@echo ""
	@echo "Examples:"
	@echo "  make integration-test"
	@echo "  make integration-test PROMPT=\"Your custom instruction here\""
	@echo "  make test-all"

# Run all unit tests
test:
	npm test

# Run fixture tests only
test-fixtures:
	npm test -- tests/fixtures/ tests/scripts/

# Run E2E tests with XDG isolation
test-e2e:
	@echo "🧪 Running E2E tests with XDG isolation..."
	@mkdir -p $(XDG_DATA_HOME) $(XDG_CONFIG_HOME) $(XDG_CACHE_HOME) $(XDG_STATE_HOME)
	npm test -- tests/e2e/
	@rm -rf $(E2E_ROOT)
	@echo "✅ E2E tests passed!"

# Run all tests (unit + E2E)
test-all: test test-e2e
	@echo "✅ All tests passed!"

# Run real LLM validation tests (requires API keys)
test-llm: link
	@echo "🤖 Running real LLM validation tests..."
	@echo "⚠️  This will make actual API calls and incur costs!"
	RUN_LLM_TESTS=true npm test -- tests/llm/ --run
	@echo "✅ LLM validation tests passed!"

# Run only LLM infrastructure tests (no API calls)
test-llm-infra: link
	@echo "🔧 Running LLM infrastructure tests (no API calls)..."
	npm test -- tests/llm/ --run
	@echo "✅ LLM infrastructure tests passed!"

# Build the project
build:
	npm run build

# Clean build artifacts
clean:
	npm run clean

# Pre-deploy checks
check: test build
	@echo "✅ All checks passed!"

# Set npm auth token from .env
npm-auth:
	@if [ -z "$(NPM_TOKEN)" ]; then \
		echo "❌ NPM_TOKEN not found. Create .env file with NPM_TOKEN=your_token"; \
		exit 1; \
	fi
	@npm config set //registry.npmjs.org/:_authToken $(NPM_TOKEN)

# Deploy current version
deploy: check npm-auth
	@echo "📦 Publishing to npm..."
	npm publish --access public
	@echo "✅ Published successfully!"
	@npm view @tuanhung303/opencode-acp version

# Build and link for local development
link: build
	@echo "🔗 Linking package locally..."
	npm link
	@echo "✅ Linked! Use 'npm link @tuanhung303/opencode-acp' in target project"

# Integration test - build, link, run opencode with prompt
integration-test: link
	@echo "🧪 Running integration test..."
	@echo "The following tests must be performed by the agent:"
	@echo "----------------------------------------------------"
	@cat docs/VALIDATION_GUIDE.md
	@echo "----------------------------------------------------"
	@echo "Agent: $(AGENT)"
	@echo "Prompt: $(PROMPT)"
	@echo "---"
	npm run build && npm link && opencode run --agent $(AGENT) --continue "$(PROMPT)" 2>&1


# Bump patch version and deploy (x.x.X)
deploy-patch: check npm-auth
	@echo "📦 Bumping patch version..."
	npm version patch --no-git-tag-version
	git add package.json package-lock.json
	git commit -m "chore: bump version to $$(npm pkg get version | tr -d '\"')"
	npm publish --access public
	@echo "✅ Published successfully!"
	@npm view @tuanhung303/opencode-acp version

# Bump minor version and deploy (x.X.0)
deploy-minor: check npm-auth
	@echo "📦 Bumping minor version..."
	npm version minor --no-git-tag-version
	git add package.json package-lock.json
	git commit -m "chore: bump version to $$(npm pkg get version | tr -d '\"')"
	npm publish --access public
	@echo "✅ Published successfully!"
	@npm view @tuanhung303/opencode-acp version

# Bump major version and deploy (X.0.0)
deploy-major: check npm-auth
	@echo "📦 Bumping major version..."
	npm version major --no-git-tag-version
	git add package.json package-lock.json
	git commit -m "chore: bump version to $$(npm pkg get version | tr -d '\"')"
	npm publish --access public
	@echo "✅ Published successfully!"
	@npm view @tuanhung303/opencode-acp version
