import { existsSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { homedir } from "node:os"
import { readFileSync } from "node:fs"

export type Role = "ux" | "ui" | "dev" | "orchestration" | "general"

export interface MemoryPaths {
  root: string
  globalMd: string
  projectsDir: string
  indexYaml: string
  metricsDir: string
}

export function memoryPaths(opts?: { memoryRoot?: string; worktree?: string }): MemoryPaths {
  let root = opts?.memoryRoot ?? process.env.MEMORY_ROOT ?? join(homedir(), "memory")
  if (root === "~" || root.startsWith("~/")) root = join(homedir(), root.slice(1))
  if (!root.startsWith("/") && opts?.worktree) root = join(opts.worktree, root)
  return {
    root,
    globalMd: join(root, "GLOBAL.md"),
    projectsDir: join(root, "PROJECTS"),
    indexYaml: join(root, "PROJECTS", "INDEX.yaml"),
    metricsDir: join(root, ".metrics"),
  }
}

export function gitRoot(dir: string): string | null {
  let cur = dir
  for (;;) {
    if (existsSync(join(cur, ".git"))) return cur
    const parent = dirname(cur)
    if (parent === cur) return null
    cur = parent
  }
}

// INDEX.yaml support is a deliberately tiny subset: a flat `aliases:` map of
// `repo-basename: slug`. Anything else in the file is ignored.
export function loadAliases(indexYaml: string): Record<string, string> {
  const aliases: Record<string, string> = {}
  let inAliases = false
  let text = ""
  try {
    text = readFileSync(indexYaml, "utf8")
  } catch {
    return aliases
  }
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim()
    if (!line) continue
    const indented = raw.startsWith(" ") || raw.startsWith("\t")
    if (!indented) {
      inAliases = line === "aliases:"
      continue
    }
    if (!inAliases) continue
    const m = line.match(/^"?([\w.-]+)"?\s*:\s*"?([\w.-]+)"?$/)
    if (m) aliases[m[1]] = m[2]
  }
  return aliases
}

export interface ProjectRef {
  slug: string
  repoRoot: string | null
  projectDir: string
  path: string
}

export function resolveProject(projectDir: string, paths: MemoryPaths): ProjectRef {
  const repoRoot = gitRoot(projectDir)
  const base = basename(repoRoot ?? projectDir)
  const slug = loadAliases(paths.indexYaml)[base] ?? base
  return { slug, repoRoot, projectDir, path: join(paths.projectsDir, slug) }
}
