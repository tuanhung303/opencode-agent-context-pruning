# Initial Concept

Agentic Context Pruning (ACP) - An OpenCode plugin that optimizes token usage by intelligently managing conversation context through automated pruning strategies, agent-driven context management tools, and autonomous reflection mechanisms.

The plugin provides automatic pruning strategies (deduplication, truncation, error purging), agentic pruning tools (discard, distill), and autonomous mechanisms like Automata Mode that empower AI agents to maintain strategic focus.

# Product Guide

## Overview

Agentic Context Pruning (ACP) is an OpenCode plugin designed to optimize token usage by intelligently managing conversation context. It provides a dual-mode approach to context management: automatic pruning strategies that work behind the scenes, and explicit agent-controlled tools that give AI agents direct control over their context.

## Goals

1. **Reduce Token Costs**: Automatically prune obsolete context from conversations to minimize token usage and associated costs
2. **Improve AI Performance**: Keep only relevant context in conversations, helping AI agents maintain focus and performance
3. **Explicit Agent Control**: Provide agents with tools to explicitly manage their own context (discard, distill)
4. **Safe Defaults**: Ensure no context is lost automatically unless the user explicitly opts into heuristic-driven pruning strategies.

## Target Users

- **OpenCode Users**: Developers and teams using OpenCode who want context optimization with precise agent control.

## Key Features

### 1. Agentic-First Pruning

ACP prioritizes an agentic-first approach:

- **Agentic Tools (Enabled by Default)**: Explicit `discard_tool` and `distill_tool` that agents can call to manage context.
- **Automatic Strategies (Opt-In)**: Deduplication, truncation, error purging, and thinking compression that can be enabled via configuration.

### 2. Configurable Pruning Strategies

- **Deduplication**: Removes duplicate tool outputs
- **Truncation**: Truncates large outputs (read/grep/glob/bash) based on token limits
- **Error Purging**: Removes tool outputs that resulted in errors after N turns
- **Supersede Writes**: Replaces older file write outputs when new ones target the same file
- **Thinking Compression**: Compresses reasoning/thinking blocks from AI models

### 3. Explicit Agent Tools

- **discard_tool**: Remove tool outputs the agent is "done" with
- **distill_tool**: Replace large chunks with concise summaries
- **discard_msg**: Remove assistant message parts by pattern matching
- **distill_msg**: Summarize assistant message parts

### 4. Protection Mechanisms

- **Protected Tools**: Core tools like `task`, `todowrite`, `write`, `edit` are never pruned
- **Focus Mechanisms**: Todo Reminders and Automata Mode (Strategic Reflection) to prevent agents from going "off-track"
- **Protected File Patterns**: Environment files, secrets, configs are protected by default
- **Turn Protection**: Recent tool outputs can be protected for a configurable number of turns

## Core Principles

1. **Agentic-First**: Agents should have explicit control over their context. The plugin empowers agents to decide what stays and what goes.

2. **Safe Defaults**: Important tools and files are protected from accidental pruning. Users must explicitly opt-in to aggressive pruning.

3. **Configurable**: All pruning behavior can be customized via configuration files. Users control the balance between automation and explicit control.

4. **Non-Intrusive**: The plugin should not break existing workflows. It enhances OpenCode without requiring changes to how users work.

## Unique Value Proposition

ACP is the only solution that combines **explicit agent-controlled tools** with **optional automatic pruning**. This approach means:

- Context management is predictable and safe by default
- Agents can take fine-grained control when needed
- Users can opt-in to automatic strategies for high-volume sessions

## Out of Scope

- Subagent context pruning (disabled for subagents to prioritize concise summaries)
- Cross-session context management
- External context storage or retrieval
- Non-OpenCode IDE integration
