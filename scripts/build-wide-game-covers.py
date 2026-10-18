"""Build 16:10 storefront covers from the square supplier game images.

Square (1:1) supplier art gets cropped top/bottom in the 16:10 game cards and
the wide home carousel. This composes a wide cover instead: the same art,
blurred and darkened as a full-bleed backdrop, with the original square image
centred on top (rounded, soft shadow). Games with no image get a clean
typographic banner.

Usage:
  python -I scripts/build-wide-game-covers.py <manifest.json> <download_dir> <out_dir>

manifest.json: [{"slug": "...", "name": "...", "img": "https://... or null"}, ...]
Writes <out_dir>/<slug>.webp (1600x1000). Re-runnable; sources are cached in
<download_dir>. Output is versioned in git (public/game-covers/), so reverting
is a git revert plus restoring the DB image_url snapshot.
"""
import hashlib
import io
import json
import os
import sys
import urllib.request

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

W, H = 1600, 1000
FG = 640  # foreground square size
RADIUS = 72
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def fetch(url, cache_dir, slug):
    ext = os.path.splitext(url.split("?")[0])[1].lower() or ".img"
    path = os.path.join(cache_dir, f"{slug}{ext}")
    if not os.path.exists(path):
        req = urllib.request.Request(url, headers={"User-Agent": "echocore-cover-builder"})
        with urllib.request.urlopen(req, timeout=30) as res:
            data = res.read()
        with open(path, "wb") as f:
            f.write(data)
    img = Image.open(path)
    img.load()
    return img.convert("RGBA")


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def average_color(img):
    small = img.convert("RGB").resize((24, 24), Image.LANCZOS)
    px = list(small.get_flattened_data()) if hasattr(small, 'get_flattened_data') else list(small.getdata())
    r = sum(p[0] for p in px) // len(px)
    g = sum(p[1] for p in px) // len(px)
    b = sum(p[2] for p in px) // len(px)
    return r, g, b


def compose_from_art(src):
    rgb = src.convert("RGB")
    # Backdrop: cover-fit, heavy blur, darken, slight saturation boost.
    bg = ImageOps.fit(rgb, (W, H), Image.LANCZOS)
    bg = bg.filter(ImageFilter.GaussianBlur(48))
    bg = ImageEnhance.Color(bg).enhance(1.25)
    bg = ImageEnhance.Brightness(bg).enhance(0.55)

    # Soft glow of the art's own colour behind the foreground.
    r, g, b = average_color(src)
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((W / 2 - 520, H / 2 - 420, W / 2 + 520, H / 2 + 420), fill=(r, g, b, 120))
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    canvas = Image.alpha_composite(bg.convert("RGBA"), glow)

    # Vignette for depth.
    vig = Image.new("L", (W, H), 0)
    ImageDraw.Draw(vig).ellipse((-W * 0.15, -H * 0.25, W * 1.15, H * 1.25), fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(160))
    dark = Image.new("RGBA", (W, H), (0, 0, 0, 150))
    canvas = Image.composite(canvas, Image.alpha_composite(canvas, dark), vig)

    # Foreground: the original square art, rounded, with a drop shadow.
    fg = ImageOps.fit(src, (FG, FG), Image.LANCZOS)
    mask = rounded_mask(FG, RADIUS)
    x, y = (W - FG) // 2, (H - FG) // 2
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((x, y + 24, x + FG, y + FG + 24), radius=RADIUS, fill=(0, 0, 0, 170))
    shadow = shadow.filter(ImageFilter.GaussianBlur(36))
    canvas = Image.alpha_composite(canvas, shadow)
    canvas.paste(fg, (x, y), Image.composite(fg.getchannel("A"), Image.new("L", (FG, FG), 0), mask))

    # Thin highlight ring.
    ring = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(ring).rounded_rectangle((x, y, x + FG - 1, y + FG - 1), radius=RADIUS, outline=(255, 255, 255, 60), width=3)
    return Image.alpha_composite(canvas, ring).convert("RGB")


def load_font(size):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def compose_typographic(name):
    digest = hashlib.sha1(name.encode("utf-8")).digest()
    hue_a, hue_b = digest[0] / 255, digest[1] / 255
    import colorsys
    c1 = tuple(int(v * 255) for v in colorsys.hsv_to_rgb(hue_a, 0.75, 0.55))
    c2 = tuple(int(v * 255) for v in colorsys.hsv_to_rgb((hue_a + 0.12 + hue_b * 0.1) % 1, 0.8, 0.22))
    base = Image.new("RGB", (W, H), c2)
    # Diagonal gradient: average of a vertical and a horizontal ramp (bright top-left).
    vert = Image.linear_gradient("L").resize((W, H))
    horiz = Image.linear_gradient("L").rotate(90).resize((W, H))
    grad = ImageOps.invert(ImageChops.add(vert, horiz, scale=2))
    base = Image.composite(Image.new("RGB", (W, H), c1), base, grad)
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((W * 0.55, -H * 0.3, W * 1.3, H * 0.7), fill=(255, 255, 255, 40))
    canvas = Image.alpha_composite(base.convert("RGBA"), glow.filter(ImageFilter.GaussianBlur(140)))

    draw = ImageDraw.Draw(canvas)
    label = name.strip()
    size = 150
    font = load_font(size)
    while size > 60 and draw.textlength(label, font=font) > W * 0.82:
        size -= 6
        font = load_font(size)
    tw = draw.textlength(label, font=font)
    draw.text(((W - tw) / 2 + 4, H / 2 - size * 0.62 + 6), label, font=font, fill=(0, 0, 0, 90))
    draw.text(((W - tw) / 2, H / 2 - size * 0.62), label, font=font, fill=(255, 255, 255, 245))
    bar_w = min(tw, 420)
    draw.rounded_rectangle(((W - bar_w) / 2, H / 2 + size * 0.85, (W + bar_w) / 2, H / 2 + size * 0.85 + 10), radius=5, fill=(255, 255, 255, 140))
    return canvas.convert("RGB")


def main():
    manifest_path, cache_dir, out_dir = sys.argv[1:4]
    os.makedirs(cache_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)
    with open(manifest_path, encoding="utf-8") as f:
        games = json.load(f)
    results = []
    for game in games:
        slug, name, url = game["slug"], game["name"].strip(), game.get("img")
        try:
            img = compose_from_art(fetch(url, cache_dir, slug)) if url else compose_typographic(name)
            kind = "art" if url else "text"
        except Exception as exc:  # unreachable source → typographic fallback
            img, kind = compose_typographic(name), f"text (source failed: {exc})"
        out = os.path.join(out_dir, f"{slug}.webp")
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=82, method=6)
        with open(out, "wb") as f:
            f.write(buf.getvalue())
        results.append((slug, kind, len(buf.getvalue())))
    for slug, kind, size in results:
        print(f"{slug}\t{kind}\t{size // 1024}KB")


if __name__ == "__main__":
    main()
