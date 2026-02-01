.PHONY: test build clean deploy deploy-patch deploy-minor deploy-major check

# Load .env file if it exists
ifneq (,$(wildcard .env))
    include .env
    export
endif

# Default target
help:
	@echo "Available commands:"
	@echo "  make test         - Run all tests"
	@echo "  make build        - Build the project"
	@echo "  make check        - Run tests + build (pre-deploy verification)"
	@echo "  make deploy       - Publish current version to npm"
	@echo "  make deploy-patch - Bump patch version (x.x.X) and publish"
	@echo "  make deploy-minor - Bump minor version (x.X.0) and publish"
	@echo "  make deploy-major - Bump major version (X.0.0) and publish"

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
