import { tool } from "@opencode-ai/plugin"
import { z } from "zod"
import { memoryPaths, memoryMode, resolveProject, type Role } from "./lib/paths.ts"
import { buildInjection } from "./lib/inject.ts"
import { save, updateSection, read, search, MemoryError, type Kind, type Status, type Section } from "./lib/store.ts"
import { logMetric } from "./lib/metrics.ts"

export interface MemoryEngineOptions {
  memoryRoot?: string
  role?: Role
  injectBudgetChars?: number
  disabled?: boolean
}

export const MemoryEnginePlugin = async (input: { worktree: string; directory: string }, options?: MemoryEngineOptions) => {
  const opts = options ?? {}
  if (opts.disabled) return {}
  const paths = memoryPaths({ memoryRoot: opts.memoryRoot, worktree: input.worktree })
  // Mode markers: `memory off` drops .disabled (engine inert); `memory auto off`
  // drops .auto-off (memory tool stays, no injection). Both live in the memory root.
  const mode = memoryMode(paths)
  if (!mode.enabled) return {}
  const role: Role = opts.role ?? ((process.env.MEMORY_ROLE as Role) ?? "general")
  const budget = opts.injectBudgetChars ?? 4200

  return {
    "experimental.chat.system.transform": async (
      hookInput: { sessionID?: string },
      output: { system: string[] },
    ) => {
      try {
        const ref = resolveProject(input.worktree || input.directory, paths)
        // 1.19.6 can invoke this hook twice per request on the same array;
        // a duplicate block would double-charge and break cache stability.
        const already = output.system.some((s) => s.startsWith("External memory (engine: markdown-memory"))
        const before = output.system.reduce((n, s) => n + s.length, 0)
        const inj = already || !mode.auto ? null : buildInjection(paths, ref.slug, role, budget)
        if (inj) output.system.push(inj.block)
        logMetric(paths, {
          ts: new Date().toISOString(),
          kind: "inject",
          sessionID: hookInput.sessionID,
          slug: ref.slug,
          role,
          injectedTokens: inj?.tokens ?? 0,
          hash: inj?.hash ?? null,
          systemCharsBefore: before,
          systemCharsAfter: output.system.reduce((n, s) => n + s.length, 0),
        })
      } catch (err) {
        console.error("[memory-engine] inject failed, failing open:", err)
      }
    },

    "experimental.session.compacting": async (
      _hookInput: { sessionID: string },
      output: { context: string[] },
    ) => {
      try {
        const ref = resolveProject(input.worktree || input.directory, paths)
        if (!output.context.some((s) => s.includes("External memory: project"))) {
          logMetric(paths, { ts: new Date().toISOString(), kind: "compact", sessionID: _hookInput.sessionID, slug: ref.slug })
          output.context.push(
            `External memory: project "${ref.slug}" has durable state in ${ref.path}/CURRENT.md ` +
              `(decisions, goals, blockers, next steps). Preserve project decisions, blockers and pending ` +
              `work in the compaction summary; the memory tool can retrieve more if needed.`,
          )
        }
      } catch (err) {
        console.error("[memory-engine] compaction hook failed, failing open:", err)
      }
    },

    tool: {
      memory: tool({
        description:
          "Shared cross-session project memory (markdown files under ~/memory). " +
          "Save ONLY meaningful, reusable information: decisions, milestones, discoveries, requirements, unresolved issues. " +
          "Never save routine tool activity, debugging output, or transient state. " +
          "Actions: save (kind=decision|milestone|discovery|issue|requirement; status=confirmed|assumption|proposal; supersedes=D-xx to replace a confirmed decision explicitly), " +
          "update (rewrite a CURRENT.md section: Goals|Blockers|Next steps|Notes — never decisions), " +
          "read (target=current|global|history; lines for history tail), " +
          "search (query against GLOBAL.md, project HISTORY.md and ARCHIVE/, returns excerpts within budget). " +
          "Writes are scoped to the current project; pass scope only to verify a slug.",
        args: {
          action: z.enum(["save", "update", "search", "read"]),
          content: z.string().optional(),
          kind: z.enum(["decision", "milestone", "discovery", "issue", "requirement"]).optional(),
          status: z.enum(["confirmed", "assumption", "proposal"]).optional(),
          supersedes: z.string().optional(),
          section: z.enum(["Goals", "Blockers", "Next steps", "Notes"]).optional(),
          target: z.enum(["current", "global", "history"]).optional(),
          lines: z.number().int().positive().optional(),
          query: z.string().optional(),
          budgetChars: z.number().int().positive().optional(),
          scope: z.string().optional(),
        },
        execute: async (args, context) => {
          try {
            const ref = resolveProject(context.worktree || context.directory, paths)
            if (args.scope && args.scope !== ref.slug)
              return `ERROR: requested scope "${args.scope}" does not match the current project "${ref.slug}"; nothing written.`
            switch (args.action) {
              case "save": {
                if (!args.kind) return "ERROR: save requires kind (decision|milestone|discovery|issue|requirement)."
                const res = save(paths, ref, {
                  kind: args.kind as Kind,
                  content: args.content ?? "",
                  status: args.status as Status | undefined,
                  supersedes: args.supersedes,
                  sessionID: context.sessionID,
                })
                logMetric(paths, { ts: new Date().toISOString(), kind: "tool.save", sessionID: context.sessionID, slug: ref.slug, detail: res })
                return res
              }
              case "update": {
                if (!args.section) return "ERROR: update requires section (Goals|Blockers|Next steps|Notes)."
                const res = updateSection(paths, ref, args.section as Section, args.content ?? "")
                logMetric(paths, { ts: new Date().toISOString(), kind: "tool.update", sessionID: context.sessionID, slug: ref.slug, section: args.section })
                return res
              }
              case "read": {
                const res = read(paths, ref, args.target ?? "current", args.lines)
                logMetric(paths, { ts: new Date().toISOString(), kind: "tool.read", sessionID: context.sessionID, slug: ref.slug, target: args.target ?? "current" })
                return res
              }
              case "search": {
                const res = search(paths, ref, args.query ?? "", args.budgetChars)
                logMetric(paths, { ts: new Date().toISOString(), kind: "tool.search", sessionID: context.sessionID, slug: ref.slug, query: args.query })
                return res
              }
            }
          } catch (err) {
            if (err instanceof MemoryError) return `ERROR: ${err.message}`
            console.error("[memory-engine] memory tool failed, failing open:", err)
            return `ERROR: memory tool failed: ${err}`
          }
        },
      }),
    },
  }
}

// @opencode-ai/plugin@1.19.6 loads V1-style plugins: a default-exported
// function receiving { client, project, directory, worktree, ... }.
// The V2 ctx.session.hook("context") API is not available in 1.19.6; the
// experimental.chat.system.transform hook used here runs at the same pipeline
// position (immediately before each agent-loop model request) and the internal
// shape mirrors it, so the upgrade is a small adapter.
const MemoryEngine = (input: any, options?: MemoryEngineOptions) => MemoryEnginePlugin(input, options)

export default MemoryEngine
export { MemoryEngine }
