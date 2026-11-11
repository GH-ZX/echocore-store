"""Build the wide banner art for the event looks (src/lib/storeEvents.js EVENT_LOOKS).

Writes public/events/<look>.svg (1600x900, no text, key motif on the left so the title can sit on
the right; the storefront mirrors the art for left-to-right languages). Deterministic: re-running
gives the same files.

Usage: python3 -I scripts/build-event-art.py
"""
import math
import os
import random

W, H = 1600, 900
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "events")


def f(n):
    return f"{n:.1f}".rstrip("0").rstrip(".")


def star_points(cx, cy, r, points=5, inner=0.42, rot=-90):
    out = []
    for i in range(points * 2):
        rad = r if i % 2 == 0 else r * inner
        a = math.radians(rot + i * 180 / points)
        out.append(f"{f(cx + rad * math.cos(a))},{f(cy + rad * math.sin(a))}")
    return " ".join(out)


def star(cx, cy, r, fill, opacity=1, points=5, inner=0.42, rot=-90):
    return f'<polygon points="{star_points(cx, cy, r, points, inner, rot)}" fill="{fill}" opacity="{opacity}"/>'


def sparkle(cx, cy, r, fill, opacity=1):
    k = r * 0.18
    d = (f"M{f(cx)},{f(cy - r)} Q{f(cx + k)},{f(cy - k)} {f(cx + r)},{f(cy)} "
         f"Q{f(cx + k)},{f(cy + k)} {f(cx)},{f(cy + r)} Q{f(cx - k)},{f(cy + k)} {f(cx - r)},{f(cy)} "
         f"Q{f(cx - k)},{f(cy - k)} {f(cx)},{f(cy - r)}Z")
    return f'<path d="{d}" fill="{fill}" opacity="{opacity}"/>'


def balloon(cx, cy, r, color, light, string_to=None, opacity=1):
    ry = r * 1.2
    parts = [f'<g opacity="{opacity}">']
    if string_to:
        sx, sy = string_to
        mid_x = (cx + sx) / 2 + (r * 0.5 if cx < sx else -r * 0.5)
        parts.append(
            f'<path d="M{f(cx)},{f(cy + ry + r * 0.16)} Q{f(mid_x)},{f((cy + ry + sy) / 2)} {f(sx)},{f(sy)}" '
            f'fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2.5" stroke-linecap="round"/>')
    parts.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r)}" ry="{f(ry)}" fill="{color}"/>')
    parts.append(f'<path d="M{f(cx - r * 0.14)},{f(cy + ry - 2)} L{f(cx + r * 0.14)},{f(cy + ry - 2)} '
                 f'L{f(cx + r * 0.2)},{f(cy + ry + r * 0.2)} L{f(cx - r * 0.2)},{f(cy + ry + r * 0.2)}Z" fill="{color}"/>')
    parts.append(f'<ellipse cx="{f(cx - r * 0.36)}" cy="{f(cy - ry * 0.4)}" rx="{f(r * 0.2)}" ry="{f(ry * 0.3)}" '
                 f'fill="{light}" opacity="0.55" transform="rotate(-24 {f(cx - r * 0.36)} {f(cy - ry * 0.4)})"/>')
    parts.append('</g>')
    return "".join(parts)


def cloud(cx, cy, s, fill, opacity):
    c = [(-70, 10, 44), (-26, -18, 58), (34, -8, 50), (78, 14, 38)]
    body = "".join(f'<circle cx="{f(cx + x * s)}" cy="{f(cy + y * s)}" r="{f(r * s)}"/>' for x, y, r in c)
    body += f'<rect x="{f(cx - 110 * s)}" y="{f(cy + 8 * s)}" width="{f(226 * s)}" height="{f(46 * s)}" rx="{f(23 * s)}"/>'
    return f'<g fill="{fill}" opacity="{opacity}">{body}</g>'


def crescent(cx, cy, r, mask_id, fill, cut=(0.42, -0.16, 0.86)):
    dx, dy, k = cut
    return (f'<mask id="{mask_id}"><rect width="{W}" height="{H}" fill="#000"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="#fff"/>'
            f'<circle cx="{f(cx + r * dx)}" cy="{f(cy + r * dy)}" r="{f(r * k)}" fill="#000"/></mask>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{fill}" mask="url(#{mask_id})"/>')


def lantern(cx, top, s, body, glow, line="#ffffff"):
    y = top
    parts = [f'<line x1="{f(cx)}" y1="0" x2="{f(cx)}" y2="{f(y)}" stroke="{line}" stroke-opacity="0.3" stroke-width="2.5"/>']
    parts.append(f'<circle cx="{f(cx)}" cy="{f(y + 8 * s)}" r="{f(8 * s)}" fill="none" stroke="{body}" stroke-width="{f(3 * s)}"/>')
    parts.append(f'<path d="M{f(cx - 22 * s)},{f(y + 34 * s)} L{f(cx)},{f(y + 14 * s)} L{f(cx + 22 * s)},{f(y + 34 * s)}Z" fill="{body}"/>')
    parts.append(f'<path d="M{f(cx - 30 * s)},{f(y + 34 * s)} L{f(cx + 30 * s)},{f(y + 34 * s)} L{f(cx + 40 * s)},{f(y + 84 * s)} '
                 f'L{f(cx + 26 * s)},{f(y + 132 * s)} L{f(cx - 26 * s)},{f(y + 132 * s)} L{f(cx - 40 * s)},{f(y + 84 * s)}Z" fill="{body}"/>')
    parts.append(f'<path d="M{f(cx - 18 * s)},{f(y + 46 * s)} L{f(cx + 18 * s)},{f(y + 46 * s)} L{f(cx + 25 * s)},{f(y + 84 * s)} '
                 f'L{f(cx + 15 * s)},{f(y + 120 * s)} L{f(cx - 15 * s)},{f(y + 120 * s)} L{f(cx - 25 * s)},{f(y + 84 * s)}Z" fill="{glow}" opacity="0.9"/>')
    parts.append(f'<rect x="{f(cx - 20 * s)}" y="{f(y + 132 * s)}" width="{f(40 * s)}" height="{f(10 * s)}" rx="{f(3 * s)}" fill="{body}"/>')
    parts.append(f'<circle cx="{f(cx)}" cy="{f(y + 84 * s)}" r="{f(64 * s)}" fill="{glow}" opacity="0.12"/>')
    return "".join(parts)


def snowflake(cx, cy, r, stroke, opacity):
    lines = []
    for i in range(6):
        a = math.radians(i * 60)
        x2, y2 = cx + r * math.cos(a), cy + r * math.sin(a)
        lines.append(f'<line x1="{f(cx)}" y1="{f(cy)}" x2="{f(x2)}" y2="{f(y2)}"/>')
        for side in (-1, 1):
            b = a + side * math.radians(35)
            bx, by = cx + r * 0.62 * math.cos(a), cy + r * 0.62 * math.sin(a)
            lines.append(f'<line x1="{f(bx)}" y1="{f(by)}" x2="{f(bx + r * 0.3 * math.cos(b))}" y2="{f(by + r * 0.3 * math.sin(b))}"/>')
    return f'<g stroke="{stroke}" stroke-width="{f(max(1.5, r * 0.09))}" stroke-linecap="round" opacity="{opacity}">{"".join(lines)}</g>'


def confetti(rng, n, colors, x_bias=0.6):
    out = []
    for _ in range(n):
        x = (rng.random() ** x_bias) * W
        y = rng.random() * H
        color = rng.choice(colors)
        op = f(0.35 + rng.random() * 0.6)
        kind = rng.random()
        if kind < 0.55:
            w, h, rot = 8 + rng.random() * 16, 5 + rng.random() * 8, rng.random() * 180
            out.append(f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" rx="2" fill="{color}" opacity="{op}" '
                       f'transform="rotate({f(rot)} {f(x)} {f(y)})"/>')
        elif kind < 0.85:
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(3 + rng.random() * 6)}" fill="{color}" opacity="{op}"/>')
        else:
            out.append(sparkle(x, y, 8 + rng.random() * 14, color, op))
    return "".join(out)


def streamer(x, y, length, amp, color, width=6, opacity=0.8):
    d = f"M{f(x)},{f(y)}"
    step = length / 6
    for i in range(6):
        d += f" q{f(step / 2)},{f(amp if i % 2 == 0 else -amp)} {f(step)},0"
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" opacity="{opacity}"/>'


def scatter_stars(rng, n, fill, r_min=2, r_max=6, sparkle_ratio=0.25):
    out = []
    for _ in range(n):
        x, y = rng.random() * W, rng.random() * H
        op = f(0.25 + rng.random() * 0.65)
        if rng.random() < sparkle_ratio:
            out.append(sparkle(x, y, r_max + rng.random() * r_max * 1.6, fill, op))
        else:
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r_min + rng.random() * (r_max - r_min) / 2)}" fill="{fill}" opacity="{op}"/>')
    return "".join(out)


def frame(bg_top, bg_bottom, glows, body, defs=""):
    glow_defs = "".join(
        f'<radialGradient id="g{i}"><stop offset="0" stop-color="{c}" stop-opacity="{o}"/>'
        f'<stop offset="1" stop-color="{c}" stop-opacity="0"/></radialGradient>'
        for i, (_, _, _, c, o) in enumerate(glows))
    glow_shapes = "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="url(#g{i})"/>' for i, (x, y, r, _, _) in enumerate(glows))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice">'
            f'<defs><linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="{bg_top}"/>'
            f'<stop offset="1" stop-color="{bg_bottom}"/></linearGradient>{glow_defs}{defs}</defs>'
            f'<rect width="{W}" height="{H}" fill="url(#bg)"/>{glow_shapes}{body}</svg>\n')


def newborn():
    rng = random.Random(11)
    gold = '<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe9ad"/><stop offset="1" stop-color="#f0b955"/></linearGradient>'
    body = scatter_stars(rng, 70, "#dcecff")
    body += crescent(330, 330, 170, "moon", "url(#gold)")
    body += star(452, 250, 26, "#ffe9ad", 0.95)
    body += sparkle(520, 180, 16, "#ffe9ad", 0.8) + sparkle(210, 130, 12, "#ffffff", 0.7)
    body += cloud(250, 560, 1.5, "#cfe6ff", 0.16) + cloud(560, 640, 1.9, "#cfe6ff", 0.12) + cloud(960, 760, 2.2, "#cfe6ff", 0.08)
    knot = (820, 700)
    body += balloon(700, 300, 78, "#5fb6ff", "#d6edff", knot)
    body += balloon(840, 220, 86, "#f5c76b", "#fff1cc", knot)
    body += balloon(960, 330, 72, "#9bd2ff", "#ffffff", knot)
    body += f'<path d="M{knot[0]},{knot[1]} q-14,70 6,130" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2.5" stroke-linecap="round"/>'
    body += balloon(1330, 170, 46, "#5fb6ff", "#d6edff", None, 0.35) + balloon(1460, 420, 38, "#f5c76b", "#fff1cc", None, 0.28)
    return frame("#0e2140", "#07111f", [(380, 320, 620, "#5fb6ff", 0.32), (1250, 760, 520, "#f5c76b", 0.12)], body, gold)


def celebration():
    rng = random.Random(23)
    colors = ["#f5b83d", "#ffd06b", "#b98cff", "#ffffff", "#ff8fab", "#7fd8ff"]
    body = confetti(rng, 150, colors)
    body += streamer(60, 200, 520, 46, "#f5b83d") + streamer(240, 700, 620, 40, "#b98cff", 5, 0.7)
    knot = (430, 760)
    body += balloon(330, 330, 84, "#f5b83d", "#fff1cc", knot) + balloon(480, 250, 92, "#b98cff", "#eadfff", knot)
    body += balloon(590, 380, 70, "#ff8fab", "#ffe0e8", knot)
    body += sparkle(760, 180, 34, "#ffd06b", 0.9) + sparkle(900, 520, 22, "#ffffff", 0.7) + sparkle(170, 520, 26, "#ffd06b", 0.8)
    return frame("#22113c", "#0d0717", [(420, 330, 640, "#b98cff", 0.3), (1200, 700, 560, "#f5b83d", 0.14)], body)


def eight_star_pattern(color, opacity):
    out = []
    for row in range(0, 6):
        for col in range(0, 9):
            cx, cy = 100 + col * 190 + (95 if row % 2 else 0), 60 + row * 170
            s = 40
            sq = f'<rect x="{cx - s}" y="{cy - s}" width="{s * 2}" height="{s * 2}"/>'
            out.append(f'<g fill="none" stroke="{color}" stroke-width="2" opacity="{opacity}">{sq}'
                       f'<g transform="rotate(45 {cx} {cy})">{sq}</g></g>')
    return "".join(out)


def eid():
    rng = random.Random(31)
    gold = '<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7e0a0"/><stop offset="1" stop-color="#d9a63f"/></linearGradient>'
    body = eight_star_pattern("#2fc48d", 0.09)
    body += scatter_stars(rng, 50, "#f7e0a0")
    body += crescent(350, 380, 190, "moon", "url(#gold)", (0.4, -0.1, 0.84))
    body += star(470, 330, 46, "#f7e0a0", 1)
    body += lantern(760, 150, 1.25, "#d9a63f", "#fff1c2") + lantern(930, 60, 0.95, "#2fc48d", "#d7ffee")
    body += lantern(1090, 220, 0.8, "#d9a63f", "#fff1c2")
    return frame("#0c3024", "#04130f", [(380, 380, 640, "#2fc48d", 0.26), (1220, 240, 520, "#e9c46a", 0.12)], body, gold)


def ramadan():
    rng = random.Random(41)
    gold = '<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbe6a8"/><stop offset="1" stop-color="#d6a036"/></linearGradient>'
    body = scatter_stars(rng, 110, "#e9e6ff", 2, 6, 0.3)
    body += crescent(380, 400, 230, "moon", "url(#gold)", (0.36, -0.12, 0.86))
    body += lantern(720, 110, 1.35, "#e3b454", "#fff1c2") + lantern(900, 250, 1.0, "#7f8cff", "#e3e6ff")
    body += lantern(1060, 60, 0.85, "#e3b454", "#fff1c2")
    body += cloud(260, 760, 2.2, "#b9bcff", 0.08) + cloud(980, 800, 2.6, "#b9bcff", 0.06)
    return frame("#191747", "#0a0920", [(400, 400, 700, "#7f8cff", 0.26), (1250, 200, 520, "#e3b454", 0.12)], body, gold)


def sale():
    rng = random.Random(53)
    stripes = "".join(f'<line x1="{x}" y1="0" x2="{x - 900}" y2="{H}" stroke="#ff5a5f" stroke-width="46" opacity="0.05"/>'
                      for x in range(0, W + 900, 150))
    body = stripes + confetti(rng, 70, ["#ff5a5f", "#ffc145", "#ffffff", "#ff8387"])
    cx, cy = 420, 440
    body += f'<g transform="rotate(-12 {cx} {cy})">'
    body += f'<circle cx="{cx - 130}" cy="{cy - 130}" r="92" fill="none" stroke="#ffc145" stroke-width="44"/>'
    body += f'<circle cx="{cx + 130}" cy="{cy + 130}" r="92" fill="none" stroke="#ffc145" stroke-width="44"/>'
    body += f'<line x1="{cx + 170}" y1="{cy - 250}" x2="{cx - 170}" y2="{cy + 250}" stroke="#ff5a5f" stroke-width="52" stroke-linecap="round"/>'
    body += '</g>'
    body += sparkle(760, 210, 38, "#ffc145", 0.9) + sparkle(880, 600, 24, "#ffffff", 0.7) + sparkle(150, 170, 22, "#ffc145", 0.8)
    return frame("#33111a", "#12070a", [(420, 430, 640, "#ff5a5f", 0.3), (1250, 650, 520, "#ffc145", 0.1)], body)


def winter():
    rng = random.Random(67)
    body = scatter_stars(rng, 90, "#ffffff", 2, 5, 0.1)
    for (x, y, r, o) in [(330, 300, 130, 0.9), (640, 190, 70, 0.75), (720, 470, 96, 0.8), (190, 560, 60, 0.6),
                         (960, 300, 54, 0.55), (1180, 520, 40, 0.4), (1400, 220, 48, 0.35), (520, 690, 44, 0.5)]:
        body += snowflake(x, y, r, "#cfefff", o)
    body += (f'<path d="M0,{H} L0,720 Q260,610 560,720 T1100,700 T{W},690 L{W},{H}Z" fill="#12334c" opacity="0.9"/>'
             f'<path d="M0,{H} L0,800 Q300,700 700,800 T{W},780 L{W},{H}Z" fill="#1a4563" opacity="0.9"/>')
    return frame("#0f2c42", "#06121b", [(360, 320, 640, "#7fd8ff", 0.28), (1240, 240, 480, "#ffffff", 0.08)], body)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, build in [("newborn", newborn), ("celebration", celebration), ("eid", eid),
                        ("ramadan", ramadan), ("sale", sale), ("winter", winter)]:
        path = os.path.join(OUT, f"{name}.svg")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(build())
        print(name, os.path.getsize(path) // 1024, "KB")


if __name__ == "__main__":
    main()
