import { mkdirSync, appendFileSync } from "node:fs"
import { join } from "node:path"
import type { MemoryPaths } from "./paths"

export function logMetric(paths: MemoryPaths, entry: Record<string, unknown>): void {
  try {
    mkdirSync(paths.metricsDir, { recursive: true })
    appendFileSync(join(paths.metricsDir, "opencode.jsonl"), JSON.stringify(entry) + "\n")
  } catch (err) {
    console.error("[memory-engine] metrics write failed:", err)
  }
}
