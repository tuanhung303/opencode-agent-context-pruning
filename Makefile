.PHONY: test build clean deploy deploy-patch deploy-minor deploy-major check link integration-test

# Load .env file if it exists
ifneq (,$(wildcard .env))
    include .env
    export
endif

# Integration test defaults
AGENT ?= build
PROMPT ?= Run these one at a time: echo p1, echo p2, echo p3, echo p4, echo p5, echo p6, echo p7. Do NOT update todos. Report any reminder message you see.

# Default target
help:
	@echo "Available commands:"
	@echo "  make test         - Run all tests"
	@echo "  make build        - Build the project"
	@echo "  make check        - Run tests + build (pre-deploy verification)"
	@echo "  make link         - Build and npm link for local testing"
	@echo "  make integration-test - Run integration test with opencode"
	@echo "  make deploy       - Publish current version to npm"
	@echo "  make deploy-patch - Bump patch version (x.x.X) and publish"
	@echo "  make deploy-minor - Bump minor version (x.X.0) and publish"
	@echo "  make deploy-major - Bump major version (X.0.0) and publish"
	@echo ""
	@echo "Integration test options:"
	@echo "  AGENT=<agent>   - Agent type (default: build)"
	@echo "  PROMPT=<text>   - Custom prompt for the agent"
	@echo ""
	@echo "Examples:"
	@echo "  make integration-test"
	@echo "  make integration-test PROMPT=\"Your custom instruction here\""
	@echo "  make integration-test AGENT=general PROMPT=\"Multi-step task\""

# Run tests
test:
	npm test

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
	@echo "Agent: $(AGENT)"
	@echo "Prompt: $(PROMPT)"
	@echo "---"
	opencode run --agent $(AGENT) --continue "$(PROMPT)" 2>&1


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
