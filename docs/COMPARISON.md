# Comparison: Orca, Hermes, RTK, and Graphify

This comparison is based on the checked-in Orca and Hermes code and READMEs, plus the linked public project documentation.

| Tool | Main input | Where it acts | Persistent result | Main job |
|---|---|---|---|---|
| markdown-memory-orca | Explicit Markdown project/global memory | Before OpenCode model requests; memory tool on demand | Shared `CURRENT.md`, `HISTORY.md`, archive | Carry decisions and active project state across sessions and agents |
| markdown-memory-hermes | Hermes conversation history | Before each Hermes request; on turn completion | Per-session rolling `state.md` and append-only `transcript.md` | Bound old conversation replay while preserving retrievable history |
| RTK | Shell commands and their output | CLI proxy at command execution | Not a project-memory archive | Reduce noisy command output before it enters agent context |
| Graphify | Source code and supported project materials | Graph build plus explicit or installed query workflows | Queryable codebase graph and reports | Answer structural questions about code concepts and relationships |

## How they compose

RTK can reduce tool output before it enters a conversation. Graphify can answer code-structure questions without repeatedly sending broad source excerpts. Hermes can then bound accumulated conversation history. Orca can persist a distilled decision or next step across sessions. These are compatible layers, but savings do not automatically add linearly; measure the full workflow.

## Verified distinctions and caveats

- Orca stores intentional, cross-project Markdown state. It does not automatically archive every conversation turn.
- Hermes archives completed session turns and replaces earlier request history; it is not a shared cross-project decision ledger.
- RTK transforms command output; it does not implement the same memory lifecycle.
- Graphify's public documentation describes a queryable knowledge graph and local AST-based code parsing. Its documentation says semantic processing for documents and media can use a model backend.
- Integrations, cache behavior, token counts, and retrieval quality depend on host and configuration and should be validated in a controlled run.

## Sources

- [Orca](https://github.com/ivanbayuf/markdown-memory-orca)
- [Hermes](https://github.com/ivanbayuf/markdown-memory-hermes)
- [RTK](https://github.com/rtk-ai/rtk)
- [Graphify](https://github.com/Graphify-Labs/graphify)

