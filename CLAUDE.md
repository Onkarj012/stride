# Claude configuration

Read `AGENTS.md` first. It covers the product, the rules, and how we work.

## Main session

The main Claude session orchestrates. It reads code, runs read-only commands, dispatches and reviews agents, merges ready PRs, and edits docs and config. Application code goes to delegated agents, picked with the `routing` skill. Never use Fable models. The one exception is when the owner says "execute directly" or "do it yourself" for that task.

Agents dispatched from here work on their own branch and hand the result back. The rules above are for the main session only.
