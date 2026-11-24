import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, existsSync, readFileSync, appendFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { memoryPaths, gitRoot, loadAliases, resolveProject } from "../plugin/lib/paths.ts"
import { filterRoles, buildInjection, tokensEstimate } from "../plugin/lib/inject.ts"
import { save, updateSection, read, search, MemoryError } from "../plugin/lib/store.ts"

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "memtest-"))
}

test("gitRoot walks up to nearest .git and returns null without one", () => {
  const root = tmp()
  const nested = join(root, "a", "b")
  mkdirSync(nested, { recursive: true })
  mkdirSync(join(root, "a", ".git"))
  assert.equal(gitRoot(nested), join(root, "a"))
  const noGit = tmp()
  assert.equal(gitRoot(noGit), null)
})

test("resolveProject: git basename slug, alias override, non-git fallback", () => {
  const root = tmp()
  const paths = memoryPaths({ memoryRoot: root })
  const repo = tmp()
  mkdirSync(join(repo, ".git"))
  const ref = resolveProject(join(repo, "src", "deep"), paths)
  assert.equal(ref.slug, repo.split("/").pop())
  assert.equal(ref.repoRoot, repo)

  mkdirSync(join(root, "PROJECTS"), { recursive: true })
  writeFileSync(join(root, "PROJECTS", "INDEX.yaml"), "aliases:\n  " + repo.split("/").pop() + ": hermes-core\n")
  assert.equal(resolveProject(repo, paths).slug, "hermes-core")

  const plain = tmp()
  const ref2 = resolveProject(plain, paths)
  assert.equal(ref2.slug, plain.split("/").pop())
  assert.equal(ref2.repoRoot, null)
})

test("filterRoles: shared passes all, role blocks filter, orchestration sees everything", () => {
  const md = "shared line\n\n<!-- memory:roles=\"ux,ui\" -->\nux secret\n<!-- /memory:roles -->\n\nmore shared\n"
  assert.ok(filterRoles(md, "ux").includes("ux secret"))
  assert.ok(!filterRoles(md, "dev").includes("ux secret"))
  assert.ok(filterRoles(md, "orchestration").includes("ux secret"))
  assert.ok(filterRoles(md, null).includes("more shared"))
  assert.ok(!filterRoles(md, null).includes("ux secret"))
})

test("buildInjection: deterministic bytes + hash, mtime bust, budget truncate, null when empty", () => {
  const root = tmp()
  const paths = memoryPaths({ memoryRoot: root })
  mkdirSync(join(root, "PROJECTS", "p1"), { recursive: true })
  writeFileSync(join(root, "GLOBAL.md"), "# Global\n\n- concise answers")
  writeFileSync(join(root, "PROJECTS", "p1", "CURRENT.md"), "# p1\n\n## Decisions\n\n| ID | Date | Decision | Status | Supersedes |\n|---|---|---|---|---|\n\n## Goals\n\n- ship v1")
  const a = buildInjection(paths, "p1", null, 4200)
  const b = buildInjection(paths, "p1", null, 4200)
  assert.ok(a && b)
  assert.equal(a!.block, b!.block)
  assert.equal(a!.hash, b!.hash)
  assert.ok(a!.block.includes("ship v1"))
  assert.ok(a!.tokens > 0 && a!.tokens === tokensEstimate(a!.chars))

  const future = new Date(Date.now() + 5000)
  utimesSync(join(root, "PROJECTS", "p1", "CURRENT.md"), future, future)
  writeFileSync(join(root, "PROJECTS", "p1", "CURRENT.md"), readFileSync(join(root, "PROJECTS", "p1", "CURRENT.md"), "utf8") + "\n- new goal added")
  const c = buildInjection(paths, "p1", null, 4200)
  assert.ok(c && c.hash !== a!.hash && c.block.includes("new goal added"))

  const small = buildInjection(paths, "p1", null, 60)
  assert.ok(small && small.block.length <= 60)

  // no GLOBAL.md anywhere + unknown slug -> nothing to inject
  const bare = memoryPaths({ memoryRoot: tmp() })
  assert.equal(buildInjection(bare, "ghost", null, 4200), null)
})

test("save: decision ids increment, history appended, kinds mirror into sections", () => {
  const root = tmp()
  const paths = memoryPaths({ memoryRoot: root })
  const ref = { slug: "p1", repoRoot: null, projectDir: "/x", path: join(root, "PROJECTS", "p1") }
  const r1 = save(paths, ref, { kind: "decision", content: "Use Bun, not npm | ever", status: "confirmed", sessionID: "ses_abcdefgh1234" })
  assert.match(r1, /D-01/)
  const r2 = save(paths, ref, { kind: "decision", content: "Switch storage to SQLite" })
  assert.match(r2, /D-02/)
  const current = readFileSync(join(ref.path, "CURRENT.md"), "utf8")
  assert.ok(current.includes("Use Bun, not npm \\| ever"))
  assert.ok(current.includes("| D-02 |"))

  save(paths, ref, { kind: "issue", content: "Resolver fails on symlinks" })
  assert.ok(readFileSync(join(ref.path, "CURRENT.md"), "utf8").includes("## Blockers\n\n- "))
  const hist = readFileSync(join(ref.path, "HISTORY.md"), "utf8")
  assert.ok(hist.includes("decision confirmed session:ses_abcdefgh"))
  assert.ok(hist.includes("issue confirmed"))
})

test("save: supersede rewrites old row, rejects missing or non-confirmed targets", () => {
  const root = tmp()
  const paths = memoryPaths({ memoryRoot: root })
  const ref = { slug: "p1", repoRoot: null, projectDir: "/x", path: join(root, "PROJECTS", "p1") }
  save(paths, ref, { kind: "decision", content: "Original plan" })
  save(paths, ref, { kind: "milestone", content: "assumption logged", status: "assumption" })
  assert.throws(() => save(paths, ref, { kind: "decision", content: "New plan", supersedes: "D-99" }), MemoryError)
  const r = save(paths, ref, { kind: "decision", content: "Replacement plan", supersedes: "D-01" })
  assert.match(r, /superseded by D-02/)
  const current = readFileSync(join(ref.path, "CURRENT.md"), "utf8")
  assert.ok(current.includes("superseded by D-02"))
  assert.ok(!/\| confirmed \| \|/.test(current))
})

test("updateSection rewrites body and Last updated, rejects unknown sections", () => {
  const root = tmp()
  const paths = memoryPaths({ memoryRoot: root })
  const ref = { slug: "p1", repoRoot: null, projectDir: "/x", path: join(root, "PROJECTS", "p1") }
  updateSection(paths, ref, "Next steps", "1. wire hooks\n2. benchmark")
  const current = readFileSync(join(ref.path, "CURRENT.md"), "utf8")
  assert.ok(current.includes("1. wire hooks\n2. benchmark"))
  assert.ok(/Last updated: \d{4}-\d{2}-\d{2}T/.test(current))
  assert.throws(() => updateSection(paths, ref, "Decisions" as never, "hack"), MemoryError)
})

test("search scores across global/history/archive and respects budget", () => {
  const root = tmp()
  const paths = memoryPaths({ memoryRoot: root })
  const ref = { slug: "p1", repoRoot: null, projectDir: "/x", path: join(root, "PROJECTS", "p1") }
  mkdirSync(join(ref.path, "ARCHIVE"), { recursive: true })
  appendFileSync(join(ref.path, "HISTORY.md"), "\n## 2026-01-01 decision confirmed\nWe chose SQLite for the queue because it needs zero ops.\n")
  appendFileSync(join(ref.path, "ARCHIVE", "old.md"), "## Old notes\nThe websocket gateway used kubernetes autoscaling.\n")
  writeFileSync(join(root, "GLOBAL.md"), "x")
  const hits = search(paths, ref, "sqlite queue")
  assert.ok(hits.includes("SQLite"))
  assert.ok(hits.includes("~memory"))
  assert.ok(!hits.toLowerCase().includes("websocket"))
  const none = search(paths, ref, "zzzz qqqq")
  assert.match(none, /no matches/)
})

test("read: history tail respects line limit, missing files fail soft", () => {
  const root = tmp()
  const paths = memoryPaths({ memoryRoot: root })
  const ref = { slug: "p1", repoRoot: null, projectDir: "/x", path: join(root, "PROJECTS", "p1") }
  mkdirSync(ref.path, { recursive: true })
  appendFileSync(join(ref.path, "HISTORY.md"), Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join("\n") + "\n")
  const tail = read(paths, ref, "history", 20)
  assert.ok(tail.startsWith("line 181"))
  assert.ok(!tail.includes("line 1\n"))
  assert.match(read(paths, ref, "current"), /no current memory/)
})

test("initProject creates CURRENT and HISTORY on first write", () => {
  const root = tmp()
  const paths = memoryPaths({ memoryRoot: root })
  const ref = { slug: "fresh", repoRoot: null, projectDir: "/x", path: join(root, "PROJECTS", "fresh") }
  save(paths, ref, { kind: "discovery", content: "First discovery" })
  assert.ok(existsSync(join(ref.path, "CURRENT.md")))
  assert.ok(existsSync(join(ref.path, "HISTORY.md")))
  assert.ok(existsSync(join(ref.path, "ARCHIVE")))
})

test("memoryPaths expands ~/ and resolves relative against worktree", async () => {
  const { memoryPaths } = await import("../plugin/lib/paths.ts")
  const { join } = await import("node:path")
  const { homedir } = await import("node:os")
  const p1 = memoryPaths({ memoryRoot: "~/memory", worktree: "/w" })
  assert.equal(p1.root, join(homedir(), "memory"))
  const p2 = memoryPaths({ memoryRoot: "./m", worktree: "/w" })
  assert.equal(p2.root, "/w/m")
})

test("supersede works when decision text contains escaped pipes", () => {
  const root = tmp()
  const paths = memoryPaths({ memoryRoot: root })
  const ref = { slug: "p1", repoRoot: null, projectDir: "/x", path: join(root, "PROJECTS", "p1") }
  save(paths, ref, { kind: "decision", content: "Use Bun, not npm | ever" })
  const r = save(paths, ref, { kind: "decision", content: "Switched to pnpm", supersedes: "D-01" })
  assert.match(r, /superseded by D-02/)
  const current = readFileSync(join(ref.path, "CURRENT.md"), "utf8")
  assert.ok(current.includes("superseded by D-02"))
  assert.ok(current.includes("Use Bun, not npm \\| ever"))
})

test("auto-run toggle: .disabled marker makes the plugin inert", async () => {
  const { existsSync, writeFileSync } = await import("node:fs")
  const { join } = await import("node:path")
  const { MemoryEnginePlugin } = await import("../plugin/memory-engine.ts")
  const root = tmp()
  const hooksOn = await MemoryEnginePlugin({ worktree: "/w", directory: "/w" }, { memoryRoot: root })
  assert.ok(hooksOn && Object.keys(hooksOn).length >= 2)
  writeFileSync(join(root, ".disabled"), "")
  const hooksOff = await MemoryEnginePlugin({ worktree: "/w", directory: "/w" }, { memoryRoot: root })
  assert.deepEqual(hooksOff, {})
  assert.ok(!existsSync(join(root, "PROJECTS")))
})

test("save: failed save leaves no HISTORY entry (regression 2026-11-24)", () => {
  const root = tmp()
  const paths = memoryPaths({ memoryRoot: root })
  const ref = { slug: "p1", repoRoot: null, projectDir: "/x", path: join(root, "PROJECTS", "p1") }
  save(paths, ref, { kind: "decision", content: "Original plan" })
  const histBefore = readFileSync(join(ref.path, "HISTORY.md"), "utf8")
  assert.equal((histBefore.match(/^## /gm) || []).length, 1)
  assert.throws(() => save(paths, ref, { kind: "decision", content: "New plan", supersedes: "D-99" }), MemoryError)
  const histAfter = readFileSync(join(ref.path, "HISTORY.md"), "utf8")
  assert.equal(histAfter, histBefore, "failed supersede must not pollute HISTORY.md")
  assert.ok(!histAfter.includes("New plan"))
  const current = readFileSync(join(ref.path, "CURRENT.md"), "utf8")
  assert.ok(current.includes("| D-01 |"))
  assert.ok(!current.includes("New plan"))
})
