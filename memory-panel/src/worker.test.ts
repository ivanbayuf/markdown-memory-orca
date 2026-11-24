// Runs src/worker.ts's activate(orca) with the orca object Orca passes, over a mock host.
// The worker touches the real filesystem, so the test roots it at a temp dir.
import { mkdtempSync, existsSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assert, mockHost, mountWorker, test } from 'orca/testing'
import * as main from './worker'

test('reflects and toggles both markers', async () => {
  const root = mkdtempSync(join(tmpdir(), 'memory-panel-test-'))
  process.env.MEMORY_ROOT = root
  const disabled = join(root, '.disabled')
  const autoOff = join(root, '.auto-off')
  const host = mockHost()
  const worker = await mountWorker(main, { host })
  assert.deepEqual(await worker.request('memory.status'), { enabled: true, auto: true })

  // Turn on -> off
  assert.deepEqual(await worker.request('memory.set', { enabled: false }), {
    ok: true,
    enabled: false,
    auto: true
  })
  assert.equal(existsSync(disabled), true)
  assert.deepEqual(await worker.request('memory.status'), { enabled: false, auto: true })

  // Auto on -> off while the engine is off
  assert.deepEqual(await worker.request('memory.set', { auto: false }), {
    ok: true,
    enabled: false,
    auto: false
  })
  assert.equal(existsSync(autoOff), true)

  // Turn on again keeps auto off
  assert.deepEqual(await worker.request('memory.set', { enabled: true }), {
    ok: true,
    enabled: true,
    auto: false
  })
  assert.equal(existsSync(disabled), false)
  assert.deepEqual(await worker.request('memory.status'), { enabled: true, auto: false })

  // Auto on -> on
  assert.deepEqual(await worker.request('memory.set', { auto: true }), {
    ok: true,
    enabled: true,
    auto: true
  })
  assert.equal(existsSync(autoOff), false)

  // External CLI toggles are mirrored to open panels (.auto-off was removed in step 4).
  writeFileSync(disabled, '')
  await new Promise((resolve) => setTimeout(resolve, 400))
  assert.deepEqual(worker.posts.at(-1), {
    event: 'memory.changed',
    payload: { enabled: false, auto: true }
  })
  rmSync(disabled, { force: true })

  assert.deepEqual(worker.refusals, [])
  await worker.deactivate()
})
