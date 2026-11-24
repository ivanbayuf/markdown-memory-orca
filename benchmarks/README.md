# Benchmarks

## Injection benchmark (reproducible)

```sh
node benchmarks/bench_orca.mjs
```

Runs deterministic fixtures (small / medium / large `CURRENT.md`) through
`buildInjection` only — no OpenCode, no provider, no LLM — and writes
`benchmarks/results/orca-2026-11-24.json`. Chars, hashes, and bust behaviour
are identical across runs; only sub-millisecond timings vary. See
`docs/BENCHMARKS.md` for the numbers and what they do and don't establish.

## Tests

```sh
npm install   # first time: installs @opencode-ai/plugin + zod
npm test      # node --test test/engine.test.ts (14 tests)
```

`test/phase4.sh` and `test/phase5.sh` are manual zsh harnesses (opencode
serve/run + sqlite3 + opencode-go provider); they are not run by `npm test`
and were not run in this update.
