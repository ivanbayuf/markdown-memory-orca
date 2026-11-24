// No build step: Orca strips the types and compiles the JSX when the panel loads.
import {
  atom,
  Badge,
  Heading,
  plugin,
  read,
  Row,
  set,
  Stack,
  Switch,
  Text,
  update,
  type PanelContext
} from 'orca'

type Mode = { enabled: boolean | null; auto: boolean }

/** What the worker last reported; null until it answers. */
const state = atom<Mode>('memory.mode', { enabled: null, auto: true })

function apply(next: Mode): void {
  set(state, next)
}

function patch(flags: { enabled?: boolean; auto?: boolean }): void {
  // Optimistic: the switches answer at once, the worker reconciles.
  update(state, (m) => ({ enabled: flags.enabled ?? m.enabled, auto: flags.auto ?? m.auto }))
  plugin
    .request('memory.set', flags)
    .then((answer) => apply({ enabled: answer.enabled, auto: answer.auto }))
    .catch(() => {
      plugin
        .request('memory.status')
        .then((current) => apply({ enabled: current.enabled, auto: current.auto }))
        .catch(() => apply({ enabled: null, auto: true }))
    })
}

/** Runs once before the first render; what it pushes to `subscriptions` ends with the panel. */
export function setup(ctx: PanelContext): void {
  ctx.subscriptions.push(
    plugin.on('memory.changed', (payload) => apply({ enabled: payload.enabled, auto: payload.auto }))
  )
  void plugin
    .request('memory.status')
    .then((answer) => apply({ enabled: answer.enabled, auto: answer.auto }))
    .catch(() => apply({ enabled: null, auto: true }))
}

export default function Panel() {
  const { enabled, auto } = read(state)
  return (
    <Stack gap="md">
      <Row justify="between" align="center">
        <Heading>Memory</Heading>
        {enabled === null ? (
          <Badge tone="neutral">…</Badge>
        ) : enabled ? (
          <Badge tone="success">ON</Badge>
        ) : (
          <Badge tone="danger">OFF</Badge>
        )}
      </Row>
      <Switch
        label="Enabled"
        checked={enabled === true}
        disabled={enabled === null}
        onChange={(next) => patch({ enabled: next })}
      />
      <Switch
        label="Auto-start in new sessions"
        checked={enabled === true && auto}
        disabled={enabled !== true}
        onChange={(next) => patch({ auto: next })}
      />
      <Text muted size="xs">
        Writes the same markers as the memory CLI (~/memory/.disabled, .auto-off). Changes land
        from the next session on; a running session keeps what it started with.
      </Text>
    </Stack>
  )
}
