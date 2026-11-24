import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs"
import { join } from "node:path"
import type { MemoryPaths, ProjectRef } from "./paths.ts"

export type Kind = "decision" | "milestone" | "discovery" | "issue" | "requirement"
export type Status = "confirmed" | "assumption" | "proposal"

const SECTIONS = ["Goals", "Blockers", "Next steps", "Notes"] as const
export type Section = (typeof SECTIONS)[number]

const CURRENT_TEMPLATE = (slug: string, ts: string) =>
  `# ${slug} — project memory\n\nLast updated: ${ts}\n\n## Decisions\n\n| ID | Date | Decision | Status | Supersedes |\n|---|---|---|---|---|\n\n` +
  SECTIONS.map((s) => `## ${s}\n`).join("\n")

const HISTORY_HEADER = (slug: string) =>
  `# ${slug} — history\n\nAppend-only. Meaningful events only: decisions, milestones, discoveries, outcomes.\n`

export class MemoryError extends Error {}

function now(): string {
  return new Date().toISOString()
}

function initProject(paths: MemoryPaths, ref: ProjectRef, ts: string): void {
  mkdirSync(join(ref.path, "ARCHIVE"), { recursive: true })
  if (!existsSync(join(ref.path, "CURRENT.md"))) writeFileSync(join(ref.path, "CURRENT.md"), CURRENT_TEMPLATE(ref.slug, ts))
  if (!existsSync(join(ref.path, "HISTORY.md"))) writeFileSync(join(ref.path, "HISTORY.md"), HISTORY_HEADER(ref.slug))
}

function oneLine(content: string): string {
  return content.split("\n")[0].replace(/\|/g, "\\|").trim().slice(0, 200)
}

function nextDecisionId(current: string): string {
  const ids = [...current.matchAll(/^\| (D-\d+) \|/gm)].map((m) => Number(m[1].slice(2)))
  const max = ids.length ? Math.max(...ids) : 0
  return `D-${String(max + 1).padStart(2, "0")}`
}

function touchUpdated(current: string, ts: string): string {
  return current.replace(/Last updated: .*/, `Last updated: ${ts}`)
}

// Never overwrites a decision silently: superseding rewrites only the old
// row's status cell (explicit, referenced) and appends the new decision row.
export function save(
  paths: MemoryPaths,
  ref: ProjectRef,
  args: { kind: Kind; content: string; status?: Status; supersedes?: string; sessionID?: string },
): string {
  const ts = now()
  if (!args.content.trim()) throw new MemoryError("save requires content")
  const status: Status = args.status ?? "confirmed"
  initProject(paths, ref, ts)
  const sessionRef = args.sessionID ? ` session:${args.sessionID.slice(0, 12)}` : ""
  // HISTORY is appended only AFTER the CURRENT.md write succeeds. An earlier
  // version appended it first, so a failed save (unknown supersede target,
  // missing Decisions table / section) still left a HISTORY entry claiming
  // something was saved (fixed 2026-11-24; see the regression test).
  const appendHistory = () =>
    appendFileSync(join(ref.path, "HISTORY.md"), `\n## ${ts} ${args.kind} ${status}${sessionRef}\n${args.content.trim()}\n`)

  const currentPath = join(ref.path, "CURRENT.md")
  let current = readFileSync(currentPath, "utf8")

  if (args.kind === "decision") {
    const id = nextDecisionId(current)
    if (args.supersedes) {
      const lines = current.split("\n")
      const idx = lines.findIndex((l) => l.startsWith(`| ${args.supersedes} |`))
      if (idx === -1) throw new MemoryError(`decision ${args.supersedes} not found in CURRENT.md; nothing superseded (nothing saved)`)
      // greedy match anchors on the LAST "| " before the status cell, so
      // escaped pipes (\|) inside the decision text cannot shift the boundary
      const re = /^(.*\| )confirmed( \|[^|]*\|)\s*$/
      if (!re.test(lines[idx])) throw new MemoryError(`${args.supersedes} is not confirmed; only confirmed decisions can be superseded`)
      lines[idx] = lines[idx].replace(re, `$1superseded by ${id} $2`)
      current = lines.join("\n")
    }
    const row = `| ${id} | ${ts.slice(0, 10)} | ${oneLine(args.content)} | ${status} | ${args.supersedes ?? ""} |`
    const re = /## Decisions\n\n\|[^\n]*\|\n\|[-| ]+\|\n/
    if (!re.test(current)) throw new MemoryError("Decisions table missing from CURRENT.md")
    current = current.replace(re, (m) => `${m}${row}\n`)
    current = touchUpdated(current, ts)
    writeFileSync(currentPath, current)
    appendHistory()
    return `saved decision ${id} (${status}) to ${ref.slug}/CURRENT.md + HISTORY.md${args.supersedes ? `; ${args.supersedes} marked superseded by ${id}` : ""}`
  }

  const section = args.kind === "requirement" ? "Goals" : args.kind === "issue" ? "Blockers" : "Notes"
  const bullet = `- ${ts.slice(0, 10)} ${args.kind} (${status}): ${oneLine(args.content)}`
  const re = new RegExp(`(## ${section}\\n)`)
  if (!re.test(current)) throw new MemoryError(`section ${section} missing from CURRENT.md`)
  current = current.replace(re, `$1\n${bullet}\n`)
  current = touchUpdated(current, ts)
  writeFileSync(currentPath, current)
  appendHistory()
  return `saved ${args.kind} (${status}) to ${ref.slug}/CURRENT.md#${section} + HISTORY.md`
}

export function updateSection(paths: MemoryPaths, ref: ProjectRef, section: Section, content: string): string {
  const ts = now()
  if (!content.trim()) throw new MemoryError("update requires content")
  if (!SECTIONS.includes(section))
    throw new MemoryError(`update only allows sections: ${SECTIONS.join(", ")}; decisions change only via save/supersede`)
  initProject(paths, ref, ts)
  const currentPath = join(ref.path, "CURRENT.md")
  let current = readFileSync(currentPath, "utf8")
  const re = new RegExp(`(## ${section}\\n)([\\s\\S]*?)(?=\\n## |$)`)
  if (!re.test(current)) throw new MemoryError(`section ${section} missing from CURRENT.md`)
  current = current.replace(re, `$1\n${content.trim()}\n`)
  current = touchUpdated(current, ts)
  writeFileSync(currentPath, current)
  return `updated ${ref.slug}/CURRENT.md#${section}`
}

export function read(paths: MemoryPaths, ref: ProjectRef, target: "current" | "global" | "history", lines = 120): string {
  const file =
    target === "current"
      ? join(ref.path, "CURRENT.md")
      : target === "global"
        ? paths.globalMd
        : join(ref.path, "HISTORY.md")
  if (!existsSync(file)) return target === "global" ? "(no GLOBAL.md yet)" : `(no ${target} memory for ${ref.slug} yet)`
  if (target !== "history") return readFileSync(file, "utf8")
  const all = readFileSync(file, "utf8").split("\n")
  while (all.length && all[all.length - 1] === "") all.pop()
  return all.slice(Math.max(0, all.length - lines)).join("\n")
}

// Deterministic, dependency-free retrieval: score paragraphs by query-term
// hits and return excerpts inside a character budget. Never eager.
export function search(paths: MemoryPaths, ref: ProjectRef, query: string, budgetChars = 1500): string {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2)
  if (!terms.length) throw new MemoryError("search requires a query")
  const files: string[] = [paths.globalMd, join(ref.path, "HISTORY.md")]
  const archive = join(ref.path, "ARCHIVE")
  try {
    for (const f of readdirSync(archive)) if (f.endsWith(".md")) files.push(join(archive, f))
  } catch {}
  const scored: { score: number; source: string; text: string }[] = []
  for (const file of files) {
    let text: string
    try {
      text = readFileSync(file, "utf8")
    } catch {
      continue
    }
    for (const para of text.split(/\n(?=#{1,2} )|\n\n+/)) {
      const p = para.trim()
      if (p.length < 24) continue
      const lower = p.toLowerCase()
      const score = terms.reduce((n, t) => n + (lower.split(t).length - 1), 0)
      if (score > 0) scored.push({ score, source: file.replace(paths.root, "~memory"), text: p })
    }
  }
  scored.sort((a, b) => b.score - a.score)
  if (!scored.length) return `no matches for "${query}" in ${ref.slug}`
  let out = ""
  let budget = budgetChars
  for (const hit of scored) {
    const excerpt = hit.text.length > 600 ? hit.text.slice(0, 599) + "…" : hit.text
    const chunk = `\n[source ${hit.source}] (score ${hit.score})\n${excerpt}\n`
    if (chunk.length > budget) break
    out += chunk
    budget -= chunk.length
  }
  return out.trim() || `matches existed but all exceeded budget for "${query}"`
}
