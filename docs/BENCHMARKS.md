# Benchmark evidence and reproduction

## Existing README reports

The default-branch README reports an example injection of about 200 tokens compared with an approximately 12,000-token native system prompt, prompt-cache hits observed on opencode-go, and 12 unit tests plus 19 reliability checks. These are **existing README claims**, not measurements independently rerun for this update. The repository has unit tests and shell reliability scripts, but no checked-in raw provider traces or benchmark harness reproducing token and cache figures. Treat the numbers as illustrative, not general performance guarantees.

The configured default budget is 4,200 characters, approximately 1,050 tokens using the implementation's rough chars/4 estimate. A short memory can yield a smaller block. Provider tokenization and cache accounting can differ.

## Available checks

From a checkout with the documented OpenCode dependencies installed:

```sh
node --test test/
bash test/phase4.sh
bash test/phase5.sh
```

These exercise reliability behavior; they do not by themselves reproduce provider prompt-cache billing or the real-session comparison.

## Reproducible token measurement

For a comparable measurement, record provider-reported input tokens for matched requests with the same model, system prompt, user turns, and tool results. Compare native context with Orca enabled over multiple fresh sessions. Report provider/model, plugin version, request count, warm/cold cache state, exact memory fixture, median, and range. Keep estimated character counts separate from provider usage.

- Injection characters: length of the exact appended block.
- Estimated tokens: `ceil(chars / 4)`, the implementation's rough estimator.
- Cache hits: provider cache-read/cache-hit usage field, not repeated text.
- Context savings: matched provider-reported billed input; do not compare unrelated prompt components.

