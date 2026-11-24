# Comparison: markdown-memory, RTK, and Graphify

**The one-line distinction:** *RTK shrinks what the agent is about to read,
Graphify shrinks what the agent has to re-read about code, markdown-memory
shrinks what the agent has to re-learn — none of them does the other two
jobs.* Their headline percentages have different denominators and are not
commensurable. Do not rank these tools on a single "% saved" axis.

## At a glance

| | markdown-memory-orca (this repo) | markdown-memory-hermes | RTK | Graphify |
|---|---|---|---|---|
| **Problem** | Reorientation + lost decisions across sessions | Replaying old conversation turns on every request | Verbose shell/tool output | Re-reading code to understand structure |
| **Intervention point** | System-prompt injection + memory tool | Pre-request context selection | Tool-output boundary, in-session | Retrieval boundary, per codebase corpus |
| **What it reduces** | Re-derivation of known facts/decisions | Old *turns* | Bytes of *new* shell output | Full-file / grep-loop re-reads |
| **Durable data** | Shared `~/memory` Markdown (`CURRENT`/`HISTORY`/`ARCHIVE`) | Per-session `state.md` + append-only `transcript.md` | None as memory (only `gain` accounting + elided-output recall store) | Persistent `graph.json` per corpus |
| **LLM needed** | No (deterministic text ops) | No | No for core filters; optional cheaper model in pipelines | No for code AST; LLM for docs/media semantic pass |
| **Determinism** | Fully deterministic | Fully deterministic | Fully deterministic filters | Deterministic AST; LLM-dependent semantic edges/labels |
| **Cannot do** | Compress live shell output; map code structure | Compress live shell output; map code structure | Conversation-history compression; durable memory; file-read compression (core) | Tool-output compression; conversation-history compression; curated personal memory |

## markdown-memory-orca — verified (this repo, 2026-11-24)

- OpenCode plugin; injects a bounded (4,200-char), role-filtered, byte-stable
  block from `GLOBAL.md` + `CURRENT.md` before every request, plus a `memory`
  tool (`save` / `update` / `read` / `search`). Cross-session, cross-bot.
- **Measured (synthetic fixtures, reproducible):** injected block 1,381 chars
  (~346 est. tokens) at small size, 2,881 (~721) medium, capped at 4,200
  (~1,050) large; byte-stable across 10 calls per fixture; hash busts on
  exactly one edit, then re-stabilises; cached build ~0.01 ms. Tokens are
  `ceil(chars/4)` estimates, not provider counts.
  Harness + raw values: `benchmarks/`.
- **Prior author-reported measurements (not re-run here):** injection
  121–287 tokens (mean ≈210) vs a ~12.4k-token native system prompt; an
  A/B micro-benchmark (n=3) in which the with-memory arm cost *more*
  ($0.0140 vs $0.0093) because it did extra work — read honestly in
  `docs/BENCHMARKS.md`. n=3 is noise; the pay-off claim rests on
  agents skipping re-orientation in real use, which is not established by
  that A/B.

## markdown-memory-hermes — verified (sibling repo, 2026-11-24)

- Hermes Agent context-engine plugin; replaces pre-turn history with a
  frozen digest + current turn; records completed turns; `context_recall`
  retrieves from the archive. Session DB never modified; fail-open.
- **Measured (synthetic fixture, reproducible):** 20 turns × 3 requests,
  tiktoken `cl100k_base` on captured messages — 194,565 → 54,204 tokens
  (−72.1% total), last request 6,338 → 1,163 (−81.7%).
  Harness + raw per-request values: `benchmarks/` in that repo.
- **Prior author-reported estimate (not reproduced):** 306k → 59k (~81%) on
  a real conversation. No fixture or payloads exist in the repo; plausible
  in shape, not evidence. See that repo's `docs/BENCHMARKS.md`.

## RTK (Rust Token Killer) — verified from its README + local install

- **What it is:** a CLI proxy (`rtk-ai/rtk`, Apache-2.0 + BUSL-1.1 mixed
  licence). An agent hook rewrites a shell command to `rtk <cmd>`; RTK runs
  the real command, applies a command-specific deterministic filter (no LLM),
  and returns compacted output before the agent reads it. Exit code passes
  through; filter failure returns raw output. 100+ commands (test runners,
  `git status/diff/log`, `ls`/`grep`/`rg`, linters, `docker`, `kubectl`…).
  Local install checked 2026-11-24: `rtk 1.2.1`.
- **Headline number, with its denominator:** "60–90% less command output"
  — reduction in **command-output bytes** on supported dev commands, counted
  as `bytes/4`. The README itself warns: *"a 90% cut in command output is
  not a 90% cut in cost"* — command output is one part of input tokens,
  which is one part of the bill. No task suite, n, or model is disclosed for
  the headline range; there is no canonical benchmark to reproduce it.
- **Pipeline number (not RTK core):** the `laya-tiered` pipeline page reports
  −20.2% total cost per trial on SkillsBench (Claude Code / Claude Opus 5.5,
  11 tasks, 44 trials/arm, Oct 2026), reward 0.66 → 0.64, per-task range
  −51.2% to **+64.5%**, errored/timed-out trials excluded. The page states
  the benchmark is the author's, "not reproduced by RTK". It needs a local
  classifier (~1.7 GB), an Anthropic key, and sub-agent delegation — never
  present it as "RTK saves 20.2%".
- **What it does NOT do:** touch conversation history, summarise accumulated
  context, or provide durable/cross-session memory. Its only persistence is
  `rtk gain` accounting (90 days) and the elided-output recall store (30
  days) — accounting/recovery, not memory. Core RTK does not reduce output
  tokens, the system prompt, or the user's prompt, and does not help when the
  bill is dominated by large file reads or history. Pipelines + the optional
  `rtk-proxy` daemon can compress file reads / re-sent API traffic, but that
  is still not memory: no persistence, no recall, no curation.
- **Local demo (not a benchmark):** `rtk gain` on this machine, 2026-11-21:
  3 commands, 151 tokens saved (52.8%). n=3 — do not cite as evidence.

## Graphify — verified from its README + BENCHMARKS.md

- **What it is:** turns a codebase (+ docs, schemas, configs, PDFs) into a
  queryable knowledge graph (`Graphify-Labs/graphify`, Apache-2.0, CLI
  `graphify`, PyPI `graphifyy`). Local deterministic tree-sitter AST parsing,
  no vector store, every edge `EXTRACTED` or `INFERRED`. Agent queries the
  graph and gets a scoped subgraph instead of re-reading whole files.
  Local install checked 2026-11-24: `graphify 0.9.114`.
- **Benchmark numbers (its own harness, BENCHMARKS.md last updated
  2026-07-05 — flag as possibly stale):** LOCOMO (n=300) recall@10 **0.497**
  (best of systems tested; mem0 0.048, BM25 0.362) but QA accuracy 45.3% —
  **supermemory wins QA at 49.7%** (at ~11× ingest cost). LongMemEval-S
  (n=50) QA 76%, tied with dense RAG. ERPNext cross-tool key-fact coverage
  82.0% vs 70.8% grep/read baseline — **n=6, directional only**. Graph build
  0 LLM credits (AST-only). Same model (Kimi K2.6) for all LLM roles; judge
  blind-validated (90.6% agreement, Cohen's κ 0.81). Datasets not
  redistributed; reproduction needs a Moonshot key. The file notes the
  headline adapter's exact reproduce command is not given — partial
  reproducibility.
- **What it does NOT do:** compress arbitrary tool output, test logs, or
  conversation history; it does not rewrite commands. It is not a personal
  memory store: the graph is per-corpus (a folder/repo) and records no
  decisions, preferences, or session outcomes unless those facts are *in the
  scanned files*. Its BENCHMARKS.md frames conversation transcripts as a
  corpus for retrieval benchmarks — that is benchmark framing, not a
  memory-write / consolidation / forgetting feature.
- **Cost note:** code-only corpora need no API key; docs/media semantic
  extraction costs minutes and tens of thousands of tokens, and the project's
  own skill advises plain `grep`/`Read` for a single targeted lookup.

## How they stack (and where they don't)

RTK and Graphify shrink what *enters* the conversation; markdown-memory
shrinks what *stays* in it. Without RTK/Graphify, the digest and current turn
are fatter because tool results arrive uncompressed and code has to be
re-read. Without markdown-memory, RTK/Graphify savings get re-billed forever,
because everything they saved still rides in the history every later request
re-sends. Together: minimum enters, nothing accumulates.

**Savings are not automatically additive.** Each tool's percentage has a
different denominator (command-output bytes, re-read tokens, replayed history),
and they interact: a smaller history means less re-billing of RTK's savings,
but also less history for Graphify's subgraph to displace. No combined
number is claimed here — measuring the stack together is future work.

A natural loop: memory says "this was decided yesterday" → Graphify answers
"where does X live" → RTK keeps the tool output cheap → the agent saves the
distilled conclusion back to memory (store the conclusion, never the whole
graph or raw dumps).

## Assumptions and things not verified

- RTK/Graphify numbers above are **as reported in their own docs, read
  2026-11-24**; none were re-run here except the local `--version` /
  `rtk gain` checks noted. RTK's telemetry default is disputed between its
  README (off by default) and an independent review citing its DISCLAIMER.md
  (enabled by default) — not resolved here; do not assert either way.
- Installed versions (RTK 1.2.1, Graphify 0.9.114) were not checked against
  the current releases; either may be behind.
- Star counts, pipeline behaviour, and Graphify Cloud claims were not
  independently verified.
- The markdown-memory numbers are from the checked-in harnesses on synthetic
  fixtures (Hermes) and engine-level fixtures (Orca) — not live-provider
  billing, and not a combined-stack measurement.
- The real Hermes behind the Hermes plugin runs on the user's VPS, which this
  workspace cannot access; the `rtk-rewrite` plugin's PATH behaviour was
  verified only on this VM.

## Sources (read 2026-11-24)

- RTK README: https://github.com/rtk-ai/rtk (default branch `develop`,
  commit `c43b5c44` at time of reading)
- RTK pipeline page: https://www.rtk-ai.app/pipelines/aeppling/rtk-pipeline-laya-tiered/
- Graphify README: https://github.com/Graphify-Labs/graphify (branch `v8`,
  commit `013a6461`)
- Graphify BENCHMARKS.md: https://raw.githubusercontent.com/Graphify-Labs/graphify/v8/BENCHMARKS.md
- markdown-memory-orca: https://github.com/ivanbayuf/markdown-memory-orca
  (`docs/BENCHMARKS.md` in this repo)
- markdown-memory-hermes: https://github.com/ivanbayuf/markdown-memory-hermes
  (`docs/BENCHMARKS.md` in that repo)
