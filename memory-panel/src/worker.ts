// The plugin's worker. It owns the same marker files as bin/memory (.disabled, .auto-off):
// one source of truth, so the panel, the CLI and new opencode sessions always agree.
import { watch, existsSync, mkdirSync, rmSync, writeFileSync, type FSWatcher } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { OrcaWorkerApi } from 'orca/worker'

const memoryRoot = (): string => process.env.MEMORY_ROOT || join(homedir(), 'memory')
const mode = () => ({
  enabled: !existsSync(join(memoryRoot(), '.disabled')),
  auto: !existsSync(join(memoryRoot(), '.auto-off'))
})

export default function activate(orca: OrcaWorkerApi): () => void {
  orca.panels.handle('memory.status', () => mode())

  orca.panels.handle('memory.set', ({ enabled, auto }): { ok: true; enabled: boolean; auto: boolean } => {
    mkdirSync(memoryRoot(), { recursive: true })
    if (enabled === undefined) {
      enabled = mode().enabled
    } else if (enabled) {
      rmSync(join(memoryRoot(), '.disabled'), { force: true })
    } else {
      writeFileSync(join(memoryRoot(), '.disabled'), '')
    }
    if (auto === undefined) {
      auto = mode().auto
    } else if (auto) {
      rmSync(join(memoryRoot(), '.auto-off'), { force: true })
    } else {
      writeFileSync(join(memoryRoot(), '.auto-off'), '')
    }
    const now = mode()
    orca.panels.post('memory.changed', now)
    return { ok: true, ...now }
  })

  // The CLI can flip the markers too; mirror it into open panels.
  let last = JSON.stringify(mode())
  let settle: ReturnType<typeof setTimeout> | undefined
  const watcher: FSWatcher = watch(memoryRoot(), (event, filename) => {
    if (event !== 'rename' && event !== 'change') return
    if (filename && filename !== '.disabled' && filename !== '.auto-off') return
    if (settle) clearTimeout(settle)
    settle = setTimeout(() => {
      settle = undefined
      const now = JSON.stringify(mode())
      if (now === last) return
      last = now
      orca.panels.post('memory.changed', JSON.parse(now))
    }, 100)
  })

  // Orca decides the worker's lifetime; the watcher must not pin the process (a test worker
  // would otherwise never exit).
  watcher.unref()

  orca.log(`memory-panel worker active, root ${memoryRoot()}`)
  return () => watcher.close()
}
