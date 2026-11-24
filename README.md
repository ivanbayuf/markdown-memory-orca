# opencode-memory

Shared file-based external memory for OpenCode agents. Injects a compact,
cache-stable memory block before every model request and exposes a `memory`
tool (save / update / read / search). Storage is plain Markdown, shared with
future Claude Code and Codex integrations.

## Storage

```text
~/memory/
├── GLOBAL.md                  # durable user preferences + conventions
├── .metrics/opencode.jsonl    # per-request injection metrics (this plugin)
└── PROJECTS/
    ├── INDEX.yaml             # optional slug aliases (repo basename -> slug)
    └── <slug>/
        ├── CURRENT.md         # living state: decisions, goals, blockers, next steps
        ├── HISTORY.md         # append-only meaningful events (with session refs)
        └── ARCHIVE/           # rotated snapshots; searched on demand, never loaded eagerly
```

Default slug = git repository root basename; repositories without a Git root
fall back to the directory basename. `INDEX.yaml` aliases override.

Roles (`MEMORY_ROLE` env or `role` option): `ux | ui | dev | orchestration | general`.
Sections wrapped in `<!-- memory:roles="ux,ui" --> ... <!-- /memory:roles -->`
are injected only to matching roles; `orchestration` sees everything; untagged
content is shared by all roles.

## Install (per-project only)

In the project's `opencode.json` (never in `~/.config/opencode/opencode.json`
until approved for production):

```json
{
  "plugin": [["/Users/ivanbayu/code/opencode-memory/plugin/memory-engine.ts", { "memoryRoot": "~/memory" }]]
}
```

Options: `memoryRoot` (default `~/memory`), `role` (default `MEMORY_ROLE` env,
else `general`), `injectBudgetChars` (default `4200` ≈ 1,050 tokens),
`disabled` (true = plugin inert).

## Rollback

Remove the `plugin` entry from that project's `opencode.json`. Nothing else is
modified: no sessions, no session database, no global config. Memory files
under `~/memory` are never deleted by the plugin (HISTORY is append-only).

## Behavior notes

- Injection is byte-identical until a source file changes (content-hash cache,
  mtime-gated reads) — required for provider prompt-cache hits; verified
  against opencode-go (`cache.read` in session tokens).
- The plugin hook fires twice per request in opencode 1.19.6; a guard keeps
  exactly one block.
- `experimental.session.compacting` adds a preservation instruction to the
  compaction prompt so summarized context keeps project decisions/blockers.
- All hooks and the tool fail open: any error logs to the opencode log and the
  native context proceeds untouched.

## Tests

```sh
node --test test/
```
