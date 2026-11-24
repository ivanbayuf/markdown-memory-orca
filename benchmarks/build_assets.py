"""Regenerate this repo's visual assets (banner, flow, benchmark chart).

PNGs are drawn with PIL (DejaVu fonts) from the same layout constants as the
SVGs; the SVGs are the editable source. Requires Pillow (`pip install pillow`)
and the benchmark JSON in benchmarks/results/ (produced by the benchmark
harness -- see benchmarks/README.md).

Run:  python3 benchmarks/build_assets.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

REVIEW = Path(__file__).resolve().parent.parent
FD = "/usr/share/fonts/truetype/dejavu"
def font(name, size):
    return ImageFont.truetype(f"{FD}/{name}.ttf", size)


F_BOLD = lambda s: font("DejaVuSans-Bold", s)  # noqa: E731
F_REG = lambda s: font("DejaVuSans", s)  # noqa: E731
F_MONO = lambda s: font("DejaVuSansMono", s)  # noqa: E731
F_MONO_B = lambda s: font("DejaVuSansMono-Bold", s)  # noqa: E731


def vgrad(w, h, top, bottom):
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(h - 1, 1)
        d.line([(0, y), (w, y)], fill=tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return img


def glow(img, cx, cy, r, color, alpha=48):
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    for i in range(r, 0, -4):
        a = int(alpha * (1 - i / r) ** 2)
        d.ellipse([cx - i, cy - i, cx + i, cy + i], fill=color + (a,))
    img.paste(Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB"), (0, 0))


def rrect(d, box, radius, fill=None, outline=None, width=1):
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text(d, xy, s, f, fill):
    d.text(xy, s, font=f, fill=fill)


# ---------------------------------------------------------------- banner
def build_banner(cfg):
    W, H = 1600, 560
    img = vgrad(W, H, cfg["bg_top"], cfg["bg_bottom"])
    glow(img, 1450, 80, 420, cfg["glow"], 60)
    glow(img, 120, 520, 300, cfg["glow2"], 40)
    d = ImageDraw.Draw(img, "RGBA")
    # faint dot grid, right half
    for x in range(900, 1560, 36):
        for y in range(40, 520, 36):
            d.ellipse([x, y, x + 3, y + 3], fill=(255, 255, 255, 14))
    # pill
    pill = cfg["pill"]
    pw = d.textlength(pill, font=F_MONO_B(20)) + 44
    rrect(d, [72, 64, 72 + pw, 108], 22, fill=(255, 255, 255, 18), outline=cfg["accent"] + (120,), width=1)
    d.text((94, 75), pill, font=F_MONO_B(20), fill=cfg["accent"])
    d.text((72, 148), cfg["line1"], font=F_BOLD(76), fill=(255, 255, 255))
    d.text((72, 232), cfg["line2"], font=F_BOLD(76), fill=cfg["accent"])
    d.text((74, 336), cfg["sub"], font=F_REG(27), fill=cfg["sub_color"])
    d.text((74, 378), cfg["sub2"], font=F_REG(27), fill=cfg["sub_color"])
    # right card
    rrect(d, [980, 96, 1528, 464], 20, fill=(255, 255, 255, 10), outline=(255, 255, 255, 60), width=1)
    d.text((1012, 118), cfg["card_title"], font=F_MONO_B(21), fill=(255, 255, 255))
    d.line([(1012, 158), (1496, 158)], fill=(255, 255, 255, 50), width=1)
    y = 178
    for line, col in cfg["card_lines"]:
        d.text((1012, y), line, font=F_MONO(20), fill=col)
        y += 34
    d.text((1012, 420), cfg["card_foot"], font=F_MONO(19), fill=cfg["accent"])
    d.text((72, 496), cfg["url"], font=F_MONO(19), fill=cfg["muted"])
    return img


def banner_svg(cfg):
    from xml.sax.saxutils import escape as _esc
    lines = "".join(
        f'<text x="1012" y="{178 + i * 34 + 20}" font-family="monospace" font-size="20" fill="{col}">{_esc(txt)}</text>'
        for i, (txt, col) in enumerate(cfg["card_lines"])
    )
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="560" role="img" aria-label="{cfg["aria"]}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{cfg["bg_top_hex"]}"/><stop offset="1" stop-color="{cfg["bg_bottom_hex"]}"/></linearGradient></defs>
<rect width="1600" height="560" fill="url(#bg)"/>
<rect x="72" y="64" width="560" height="44" rx="22" fill="#ffffff" fill-opacity="0.07" stroke="{cfg["accent_hex"]}" stroke-opacity="0.5"/>
<text x="94" y="93" font-family="monospace" font-size="20" font-weight="bold" fill="{cfg["accent_hex"]}">{cfg["pill"]}</text>
<text x="72" y="210" font-family="sans-serif" font-size="76" font-weight="bold" fill="#ffffff">{cfg["line1"]}</text>
<text x="72" y="294" font-family="sans-serif" font-size="76" font-weight="bold" fill="{cfg["accent_hex"]}">{cfg["line2"]}</text>
<text x="74" y="362" font-family="sans-serif" font-size="27" fill="{cfg["sub_hex"]}">{cfg["sub"]}</text>
<text x="74" y="404" font-family="sans-serif" font-size="27" fill="{cfg["sub_hex"]}">{cfg["sub2"]}</text>
<rect x="980" y="96" width="548" height="368" rx="20" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.25"/>
<text x="1012" y="140" font-family="monospace" font-size="21" font-weight="bold" fill="#ffffff">{cfg["card_title"]}</text>
<line x1="1012" y1="158" x2="1496" y2="158" stroke="#ffffff" stroke-opacity="0.2"/>
{lines}
<text x="1012" y="440" font-family="monospace" font-size="19" fill="{cfg["accent_hex"]}">{cfg["card_foot"]}</text>
<text x="72" y="514" font-family="monospace" font-size="19" fill="{cfg["muted_hex"]}">{cfg["url"]}</text>
</svg>
'''


# ---------------------------------------------------------------- flow
def arrow(d, x1, y1, x2, y2, color, width=3):
    d.line([(x1, y1), (x2, y2)], fill=color, width=width)
    ang = math.atan2(y2 - y1, x2 - x1)
    for da in (2.6, -2.6):
        d.line([(x2, y2), (x2 - 14 * math.cos(ang + da), y2 - 14 * math.sin(ang + da))], fill=color, width=width)


def box(d, xy, w, h, title, sub, accent, title_size=24, sub_size=19):
    x, y = xy
    rrect(d, [x, y, x + w, y + h], 16, fill=(255, 255, 255, 9), outline=accent + (150,), width=2)
    d.text((x + 22, y + 18), title, font=F_BOLD(title_size), fill=(255, 255, 255))
    d.text((x + 22, y + 58), sub, font=F_REG(sub_size), fill=(200, 200, 215))
    if len(sub) > 34:
        pass


def flow_png(cfg):
    W, H = 1500, 560
    img = vgrad(W, H, cfg["bg_top"], cfg["bg_bottom"])
    d = ImageDraw.Draw(img, "RGBA")
    d.text((40, 28), cfg["title"], font=F_BOLD(32), fill=(255, 255, 255))
    d.text((40, 68), cfg["subtitle"], font=F_REG(21), fill=cfg["sub_color"])
    A, B, C = cfg["boxes"]
    y1, y2, bh = 130, 350, 120
    for (x, w, t, s) in [(40, 320, A[0], A[1]), (480, 320, B[0], B[1]), (920, 540, C[0], C[1])]:
        box(d, (x, y1), w, bh, t, s, cfg["accent"])
    for (x, w, t, s) in [(40, 320, cfg["row2"][0][0], cfg["row2"][0][1]), (480, 320, cfg["row2"][1][0], cfg["row2"][1][1]), (920, 540, cfg["row2"][2][0], cfg["row2"][2][1])]:
        box(d, (x, y2), w, bh, t, s, cfg["accent2"])
    ar = cfg["accent"]
    arrow(d, 360, y1 + 60, 470, y1 + 60, ar)
    arrow(d, 800, y1 + 60, 910, y1 + 60, ar)
    # turn-finishes elbow: from C bottom-right down, left, into D top
    d.line([(1400, y1 + bh), (1400, 300), (200, 300), (200, y2)], fill=ar, width=3)
    d.polygon([(192, y2), (208, y2), (200, y2 + 12)], fill=ar)
    d.text((1050, 272), cfg["elbow_label"], font=F_REG(19), fill=cfg["accent"])
    # bottom row left-to-right
    arrow(d, 360, y2 + 60, 470, y2 + 60, cfg["accent2"])
    arrow(d, 800, y2 + 60, 910, y2 + 60, cfg["accent2"])
    return img


def flow_svg(cfg):
    from xml.sax.saxutils import escape as _esc
    def svg_box(x, y, w, t, s, stroke):
        return (f'<rect x="{x}" y="{y}" width="{w}" height="120" rx="16" fill="#ffffff" fill-opacity="0.05" stroke="{stroke}" stroke-width="2"/>'
                f'<text x="{x + 22}" y="{y + 44}" font-family="sans-serif" font-size="24" font-weight="bold" fill="#ffffff">{_esc(t)}</text>'
                f'<text x="{x + 22}" y="{y + 82}" font-family="sans-serif" font-size="19" fill="#c8c8d7">{_esc(s)}</text>')
    A, B, C = cfg["boxes"]
    R = cfg["row2"]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="560" role="img" aria-label="{cfg["title"]}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{cfg["bg_top_hex"]}"/><stop offset="1" stop-color="{cfg["bg_bottom_hex"]}"/></linearGradient>
<marker id="ah" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L9,3 L0,6 z" fill="{cfg["accent_hex"]}"/></marker>
<marker id="ah2" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L9,3 L0,6 z" fill="{cfg["accent2_hex"]}"/></marker></defs>
<rect width="1500" height="560" fill="url(#bg)"/>
<text x="40" y="58" font-family="sans-serif" font-size="32" font-weight="bold" fill="#ffffff">{cfg["title"]}</text>
<text x="40" y="90" font-family="sans-serif" font-size="21" fill="{cfg["sub_hex"]}">{cfg["subtitle"]}</text>
{svg_box(40, 130, 320, A[0], A[1], cfg["accent_hex"])}
{svg_box(480, 130, 320, B[0], B[1], cfg["accent_hex"])}
{svg_box(920, 130, 540, C[0], C[1], cfg["accent_hex"])}
{svg_box(40, 350, 320, R[0][0], R[0][1], cfg["accent2_hex"])}
{svg_box(480, 350, 320, R[1][0], R[1][1], cfg["accent2_hex"])}
{svg_box(920, 350, 540, R[2][0], R[2][1], cfg["accent2_hex"])}
<line x1="360" y1="190" x2="468" y2="190" stroke="{cfg["accent_hex"]}" stroke-width="3" marker-end="url(#ah)"/>
<line x1="800" y1="190" x2="908" y2="190" stroke="{cfg["accent_hex"]}" stroke-width="3" marker-end="url(#ah)"/>
<path d="M1400,250 L1400,300 L200,300 L200,338" fill="none" stroke="{cfg["accent_hex"]}" stroke-width="3" marker-end="url(#ah)"/>
<text x="1050" y="290" font-family="sans-serif" font-size="19" fill="{cfg["accent_hex"]}">{cfg["elbow_label"]}</text>
<line x1="360" y1="410" x2="468" y2="410" stroke="{cfg["accent2_hex"]}" stroke-width="3" marker-end="url(#ah2)"/>
<line x1="800" y1="410" x2="908" y2="410" stroke="{cfg["accent2_hex"]}" stroke-width="3" marker-end="url(#ah2)"/>
</svg>
'''


def orca_chart(data):
    W, H = 1500, 640
    img = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(img)
    d.text((60, 28), "Injected memory block — estimated tokens by fixture size", font=F_BOLD(30), fill=(20, 20, 30))
    d.text((60, 68), "Node v24.22.1  ·  budget 4,200 chars  ·  tokens = ceil(chars / 4), an estimate  ·  2026-11-24", font=F_REG(21), fill=(90, 90, 110))
    L, R, T, Bo = 110, 1440, 130, 500
    ymax = 1200
    def Y(v): return Bo - (Bo - T) * v / ymax
    for v in range(0, 1201, 200):
        d.line([(L, Y(v)), (R, Y(v))], fill=(230, 230, 235), width=1)
        d.text((58, Y(v) - 11), f"{v:,}", font=F_REG(18), fill=(120, 120, 135))
    fx = data["fixtures"]
    bw = 220
    xs = [300, 700, 1100]
    cols = [(13, 110, 122), (13, 110, 122), (13, 110, 122)]
    for x, f, c in zip(xs, fx, cols):
        v = f["injected_tokens_estimate_chars_div_4"]
        d.rectangle([x, Y(v), x + bw, Bo], fill=c)
        if f["fixture"] == "large":
            d.text((x + 58, Y(v) + 14), f"~{v:,}", font=F_BOLD(26), fill=(255, 255, 255))
        else:
            d.text((x + 8, Y(v) - 36), f"~{v:,}", font=F_BOLD(26), fill=(13, 110, 122))
        d.text((x, Bo + 14), f"{f['fixture']}  ({f['current_md_chars']:,} chars in CURRENT.md)", font=F_REG(20), fill=(60, 60, 75))
    # budget cap line at 1050
    d.line([(L, Y(1050)), (R, Y(1050))], fill=(214, 48, 49), width=3)
    d.text((L + 8, Y(1050) - 34), "budget cap: 4,200 chars ≈ 1,050 est. tokens", font=F_BOLD(20), fill=(214, 48, 49))
    d.rounded_rectangle([60, 548, 1440, 622], radius=12, outline=(200, 200, 210), width=1)
    d.text((84, 564), "Byte-stable across 10 calls per fixture; hash busts on exactly one edit, then re-stabilises.", font=F_REG(19), fill=(20, 20, 30))
    d.text((84, 590), "Native system prompt ≈ 12,400 tokens (prior README measurement) — injection is 2.8–8.5% of that.", font=F_REG(19), fill=(20, 20, 30))
    return img


ORCA = {
    "bg_top": (7, 24, 39), "bg_bottom": (14, 47, 66), "glow": (45, 212, 191), "glow2": (56, 189, 248),
    "accent": (77, 208, 196), "accent2": (56, 189, 248), "sub_color": (178, 220, 214), "muted": (120, 160, 175),
    "pill": "MARKDOWN-MEMORY  ·  OPENCODE PLUGIN (ORCA)",
    "line1": "Shared memory.", "line2": "Less reorientation.",
    "sub": "Durable project memory in plain Markdown —", "sub2": "injected before every request, cache-stable.",
    "card_title": "CURRENT.md — project memory",
    "card_lines": [("## Decisions", "#E6F4F1"), ("| D-01 | … | confirmed |", "#B2DCD6"), ("## Blockers", "#E6F4F1"), ("## Next steps", "#E6F4F1"), ("## Notes", "#E6F4F1")],
    "card_foot": "4,200 chars max · byte-stable block",
    "url": "github.com/ivanbayuf/markdown-memory-orca",
    "aria": "markdown-memory-orca banner: shared memory, less reorientation",
    "title": "How a request flows through markdown-memory-orca",
    "subtitle": "Deterministic text processing — no extra LLM call. Memory files live under ~/memory.",
    "boxes": [("Markdown files", "GLOBAL.md · CURRENT.md"), ("Build injection", "resolve · filter roles · budget"), ("Model request", "system prompt + stable block")],
    "row2": [("memory tool", "save · update · read · search"), ("PROJECTS/<slug>/", "CURRENT · HISTORY · ARCHIVE"), ("Prompt cache", "same block → cache hits")],
    "elbow_label": "model calls the memory tool",
}
HEX = lambda t: "#%02x%02x%02x" % t

for cfg in (ORCA,):
    cfg["bg_top_hex"] = HEX(cfg["bg_top"]); cfg["bg_bottom_hex"] = HEX(cfg["bg_bottom"])
    cfg["accent_hex"] = HEX(cfg["accent"]); cfg["accent2_hex"] = HEX(cfg["accent2"])
    cfg["sub_hex"] = HEX(cfg["sub_color"]); cfg["muted_hex"] = HEX(cfg["muted"])

def main():
    root = Path(__file__).resolve().parent.parent
    assets = root / "assets"
    assets.mkdir(exist_ok=True)
    build_banner(ORCA).save(assets / "banner.png")
    (assets / "banner.svg").write_text(banner_svg(ORCA))
    flow_png(ORCA).save(assets / "flow.png")
    (assets / "flow.svg").write_text(flow_svg(ORCA))
    data = json.loads((root / "benchmarks" / "results" / "orca-2026-11-24.json").read_text())
    orca_chart(data).save(assets / "benchmark-chart.png")
    print("assets written to", assets)


if __name__ == "__main__":
    main()
