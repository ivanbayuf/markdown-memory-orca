// The panel <-> worker contract, declared once: src/panel.tsx and src/worker.ts both read it.
export {}

declare module 'orca' {
  interface PluginRequests {
    /** Engine mode: no .disabled marker (enabled) and no .auto-off marker (auto). */
    'memory.status': { output: { enabled: boolean; auto: boolean } }
    /** Applies the given flags as marker files and answers the resulting mode. */
    'memory.set': {
      input: { enabled?: boolean; auto?: boolean }
      output: { ok: true; enabled: boolean; auto: boolean }
    }
  }
  interface PluginPanelEvents {
    /** Posted to every open panel when the mode changes outside the panel. */
    'memory.changed': { enabled: boolean; auto: boolean }
  }
}
