import type { Role } from "./paths.ts"
import { createHash } from "node:crypto"
import { readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import type { MemoryPaths } from "./paths.ts"

export function tokensEstimate(chars: number): number {
  return Math.ceil(chars / 4)
}

export function filterRoles(md: string, role: Role | null): string {
  const out: string[] = []
  let region: { allowed: boolean; buf: string[] } | null = null
  const flush = () => {
    if (region && region.allowed) out.push(...region.buf)
    region = null
  }
  for (const line of md.split("\n")) {
    const open = line.match(/<!--\s*memory:roles\s*=\s*"([^"]+)"\s*-->/)
    if (open) {
      flush()
      const roles = open[1].split(",").map((s) => s.trim().toLowerCase())
      region = { allowed: role === "orchestration" || roles.includes(role ?? "general"), buf: [] }
      continue
    }
    if (/<!--\s*\/memory:roles\s*-->/.test(line)) {
      flush()
      continue
    }
    if (region) region.buf.push(line)
    else out.push(line)
  }
  flush()
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export interface InjectResult {
  block: string
  hash: string
  chars: number
  tokens: number
}

function readOpt(path: string): string {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return ""
  }
}

function statKey(path: string): string {
  try {
    const s = statSync(path)
    return `${s.mtimeMs}:${s.size}`
  } catch {
    return "-"
  }
}

// The injected block must stay byte-identical across turns of one session so
// the provider prompt cache keeps hitting; it only changes when a source file
// does. mtime+size gate the re-read so we also avoid repeated fs reads.
const cache = new Map<string, { key: string; result: InjectResult | null }>()

export function buildInjection(
  paths: MemoryPaths,
  slug: string,
  role: Role | null,
  budgetChars: number,
): InjectResult | null {
  const globalMd = join(paths.globalMd)
  const currentMd = join(paths.projectsDir, slug, "CURRENT.md")
  const statKey_ = `${statKey(globalMd)}|${statKey(currentMd)}`
  const cacheKey = `${slug}|${role ?? ""}|${budgetChars}`
  const hit = cache.get(cacheKey)
  if (hit && hit.key === statKey_) return hit.result

  let result: InjectResult | null = null
  const g = filterRoles(readOpt(globalMd), role)
  const c = filterRoles(readOpt(currentMd), role)
  if (g || c) {
    let body = ""
    if (g) body += `<global-memory>\n${g}\n</global-memory>\n\n`
    if (c) body += `<project-memory project="${slug}">\n${c}\n</project-memory>`
    if (body.length > budgetChars) body = body.slice(0, budgetChars - 1) + "\n…(truncated)"
    let block = [
      `External memory (engine: markdown-memory, project: ${slug}${role ? `, role: ${role}` : ""}).`,
      "This is durable cross-session state, not conversation history. Use the memory tool to save or query more.",
      body,
    ].join("\n")
    if (block.length > budgetChars) {
      const suffix = "\n…(truncated)"
      block =
        budgetChars > suffix.length + 8
          ? block.slice(0, budgetChars - suffix.length) + suffix
          : block.slice(0, budgetChars)
    }
    const hash = createHash("sha1").update(block).digest("hex").slice(0, 12)
    result = { block, hash, chars: block.length, tokens: tokensEstimate(block.length) }
  }
  cache.set(cacheKey, { key: statKey_, result })
  return result
}
