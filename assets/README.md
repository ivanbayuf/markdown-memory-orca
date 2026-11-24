# Assets

- `banner.svg` / `banner.png` (1600×560): repository banner. The SVG is the
  editable source and what the README embeds; the PNG is the shareable /
  social-preview version of the same design.
- `flow.svg` / `flow.png` (1500×560): injection, tool, and cache flow.
  Same layout in both formats.
- `benchmark-chart.svg` / `benchmark-chart.png` (1500×660): injected-block chart from
  `benchmarks/results/orca-2026-11-24.json` (small / medium / large fixtures,
  budget cap at 4,200 chars).

Palette: dark teal (`#071827` → `#0E2F42`) with a cyan accent (`#4DD0C4`),
matching the tagline "Shared memory. Less reorientation." Diagrams use
DejaVu Sans / DejaVu Sans Mono. PNGs are rendered from the same layout
constants as the SVGs; regenerate all five files with
`python3 benchmarks/build_assets.py` (requires Pillow and the benchmark JSON
in `benchmarks/results/`). PNGs are not committed to git. The GitHub
connection used for pushes carries text files only, so re-run the script
after cloning to get the PNG versions locally.
