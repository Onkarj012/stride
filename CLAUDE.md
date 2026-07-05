# Claude Configuration

See `AGENTS.md` for full project details, conventions, and commands.

## Orchestrator rule (permanent)

In this repo the main Claude session acts as an orchestrator only. It must NOT write or edit application code itself — all code changes are delegated to subagents (Codex/gpt-5.5 for spec'd implementation, OpenCode for recon, Fable/Opus agents for taste-sensitive UI and reviews). The main session may read code, run read-only commands, review agent output, and edit docs/config like this file. One-shot exception only when the user explicitly says "execute directly" / "do it yourself".
