// `orca plugin check` renders the panel once per scenario, each with the worker on a fresh
// host. The worker reads the real memory root read-only, so one fresh scenario suffices.
import { defineCheck } from 'orca/testing'

export default defineCheck({
  fresh: {}
})
