// Reproducible injection benchmark for markdown-memory-orca.
//
// Measures the engine layer only (`plugin/lib/`, no OpenCode, no provider,
// no LLM): what `buildInjection` returns for fixed GLOBAL.md + CURRENT.md
// fixtures, whether the block is byte-stable across calls, and how long
// a cached vs uncached build takes.
//
// Fixtures (deterministic, generated here, no network):
//   small  CURRENT.md ~500 chars, medium ~2000, large ~3800 chars
//   GLOBAL.md ~400 chars in every case; role "general"; budget 4200 chars
//   (the plugin default).
//
// Tokens are `tokensEstimate` = ceil(chars/4) -- the plugin's own estimate,
// NOT a tokenizer or provider count. The headline numbers are therefore
// chars (exact) and estimated tokens (labelled as such). Provider cache
// behaviour is NOT measured here; the README's opencode-go cache numbers
// are prior, separate measurements -- see docs/BENCHMARKS.md.
//
// Run:  node benchmarks/bench_orca.mjs [--out benchmarks/results/orca-2026-11-24.json]
// Requires: Node >= 22 (type stripping for the .ts lib imports).
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, utimesSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { memoryPaths, resolveProject } from "../plugin/lib/paths.ts";
import { buildInjection } from "../plugin/lib/inject.ts";

const WORDS = "design review refactor deploy pipeline cache session decision blocker milestone requirement discovery endpoint schema migration rollback timeout retry budget token context memory agent tool result prompt system user assistant analysis test coverage release note".split(" ");
function text(seed, n) {
  let s = seed, out = [];
  while (out.join(" ").length < n) { s = (s * 1103515245 + 12345) % 2147483648; out.push(WORDS[s % WORDS.length]); }
  return out.join(" ").slice(0, n);
}
function median(xs) { const a = [...xs].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; }
function timed(fn, n = 20) {
  const ts = [];
  for (let i = 0; i < n; i++) { const t0 = performance.now(); fn(); ts.push(performance.now() - t0); }
  return { median_ms: +median(ts).toFixed(3), min_ms: +Math.min(...ts).toFixed(3), max_ms: +Math.max(...ts).toFixed(3), runs: n };
}

const root = mkdtempSync(join(tmpdir(), "orca-bench-"));
const paths = memoryPaths({ memoryRoot: root });
const projDir = join(root, "proj");
mkdirSync(join(paths.projectsDir, "proj"), { recursive: true });
writeFileSync(paths.globalMd, "# Global memory\n\n" + text(7, 380) + "\n");
const ref = { slug: "proj", repoRoot: null, projectDir: projDir, path: join(paths.projectsDir, "proj") };
const header = "# proj — project memory\nLast updated: 2026-11-24T00:00:00.000Z\n\n## Decisions\n\n| ID | Date | Decision | Status | Supersedes |\n|----|------|----------|--------|------------|\n\n## Goals\n\n## Blockers\n\n## Next steps\n\n## Notes\n";

const results = { engine: "markdown-memory-orca", date: "2026-11-24", node: process.version, budget_chars: 4200, fixtures: [] };
for (const [name, size] of [["small", 500], ["medium", 2000], ["large", 3800]]) {
  const body = header + text(name === "small" ? 11 : name === "medium" ? 22 : 33, size) + "\n";
  writeFileSync(join(ref.path, "CURRENT.md"), body);
  const first = buildInjection(paths, ref.slug, "general", 4200);
  const hashes = new Set();
  for (let i = 0; i < 10; i++) hashes.add(buildInjection(paths, ref.slug, "general", 4200).hash);
  const cached = timed(() => buildInjection(paths, ref.slug, "general", 4200));
  // Bust the cache with a real edit *inside the injected region* (near the
  // top of CURRENT.md). Note: an edit past the 4200-char truncation point
  // would not change the block at all -- the tail is never injected -- so
  // appending at the end is not a valid cache-bust probe at the large size.
  const curPath = join(ref.path, "CURRENT.md");
  const curText = readFileSync(curPath, "utf8");
  writeFileSync(curPath, curText.replace("\n", "\n- 2026-11-24 discovery (confirmed): cache-bust probe line\n"));
  const afterEdit = buildInjection(paths, ref.slug, "general", 4200);
  const uncached = timed(() => { utimesSync(curPath, new Date(), new Date(Date.now() + 1000)); buildInjection(paths, ref.slug, "general", 4200); }, 5);
  results.fixtures.push({
    fixture: name,
    current_md_chars: body.length,
    injected_chars: first.chars,
    injected_tokens_estimate_chars_div_4: first.tokens,
    hash: first.hash,
    byte_stable_across_10_calls: hashes.size === 1,
    hash_changes_after_edit: afterEdit.hash !== first.hash,
    timing_cached_ms: cached,
    timing_uncached_ms: uncached,
  });
}
// Empty-memory case: nothing to inject.
const emptyRoot = mkdtempSync(join(tmpdir(), "orca-bench-empty-"));
const emptyPaths = memoryPaths({ memoryRoot: emptyRoot });
results.empty_memory = { injection: buildInjection(emptyPaths, "proj", "general", 4200) };

const outPath = join(new URL(".", import.meta.url).pathname, "results", "orca-2026-11-24.json");
mkdirSync(join(new URL(".", import.meta.url).pathname, "results"), { recursive: true });
writeFileSync(outPath, JSON.stringify(results, null, 2) + "\n");
console.log(JSON.stringify(results, null, 2));
