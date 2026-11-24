// `orca plugin test .` runs this in Node with the same runtime and checks Orca uses.
import { assert, mockHost, mount, test } from 'orca/testing'
import * as panel from './panel'

test('shows the memory mode and toggles both switches', async () => {
  // The worker's mode: one mutable truth the requests and the event both answer from.
  const mode = { enabled: true, auto: true }
  const requests: { name: string; input: unknown }[] = []
  const host = mockHost({
    requests: {
      'memory.status': () => ({ ...mode }),
      'memory.set': (input: { enabled?: boolean; auto?: boolean }) => {
        requests.push({ name: 'memory.set', input })
        if (input.enabled !== undefined) mode.enabled = input.enabled
        if (input.auto !== undefined) mode.auto = input.auto
        return { ok: true, ...mode }
      }
    }
  })
  const view = await mount(panel, { host })
  assert.equal(view.find({ role: 'status' })?.text, 'ON')

  // Turn on -> off
  await view.toggle({ label: 'Enabled' })
  assert.equal(view.find({ role: 'status' })?.text, 'OFF')
  assert.deepEqual(requests.at(-1), { name: 'memory.set', input: { enabled: false } })

  // An external CLI toggle is mirrored into the panel (engine on, auto off).
  mode.enabled = true
  mode.auto = false
  await view.post('memory.changed', { ...mode })
  assert.equal(view.find({ role: 'status' })?.text, 'ON')

  // Auto off -> on
  await view.toggle({ label: 'Auto-start in new sessions' })
  assert.deepEqual(requests.at(-1), { name: 'memory.set', input: { auto: true } })
  assert.equal(view.find({ role: 'status' })?.text, 'ON')

  // Auto on -> off
  await view.toggle({ label: 'Auto-start in new sessions' })
  assert.deepEqual(requests.at(-1), { name: 'memory.set', input: { auto: false } })

  assert.deepEqual(view.errors, [])
  assert.deepEqual(view.refusals, [])
  await view.unmount()
})
