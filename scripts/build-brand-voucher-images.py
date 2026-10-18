"""Card logos + wide covers for voucher products that had no supplier image.

Logos are public-domain wordmarks from Wikimedia Commons (and the official
App Store icon for Yalla). Each product gets:
  public/game-logos/<slug>.webp   800x800  (home / catalog card, square)
  public/game-covers/<slug>.webp  1600x1000 (carousel / game page hero)

Usage:
  python -I scripts/build-brand-voucher-images.py <logos_dir> <repo_public_dir>
<logos_dir> holds <slug>.png|jpg source logos (see SOURCES below).
"""
import os
import sys

from PIL import Image, ImageFilter, ImageOps

SOURCES = {
    # slug: (background RGB, recolor logo to white?, mode)
    "cards-115-xbox-gift-card-turkey": ((16, 124, 16), True, "logo"),
    "cards-45-psn-turkey": ((0, 67, 156), True, "logo"),
    "cards-139-razer-gold-turkey": ((10, 10, 10), False, "logo"),
    "cards-145-netflix-saudi-arabia-ksa": ((12, 12, 12), False, "logo"),
    "cards-140-minecraft": ((38, 74, 28), False, "logo"),
    "cards-169-noon-uae": ((254, 238, 0), False, "logo"),
    "cards-95-apple-itunes-turkey": ((242, 242, 247), False, "logo"),
    "cards-149-yalla-live": (None, False, "art"),
    "cards-3-itunes-usa": ((242, 242, 247), False, "logo"),
}
# Fraction of the canvas the logo may use (cards crop a square to 16:10, so
# keep the logo inside the middle band).
CARD = (800, 800, 0.70, 0.40)
COVER = (1600, 1000, 0.52, 0.42)


def load(path):
    img = Image.open(path)
    img.load()
    return img.convert("RGBA")


def trim(img):
    bbox = img.getchannel("A").getbbox()
    return img.crop(bbox) if bbox else img


def to_white(img):
    white = Image.new("RGBA", img.size, (255, 255, 255, 255))
    white.putalpha(img.getchannel("A"))
    return white


def place_logo(bg, logo, w, h, fw, fh):
    canvas = Image.new("RGBA", (w, h), bg + (255,))
    # Subtle top light for depth.
    glow = Image.new("RGBA", (w, h), (255, 255, 255, 0))
    glow.paste((255, 255, 255, 28), (0, 0, w, int(h * 0.45)))
    canvas = Image.alpha_composite(canvas, glow.filter(ImageFilter.GaussianBlur(h * 0.25)))
    lg = logo.copy()
    lg.thumbnail((int(w * fw), int(h * fh)), Image.LANCZOS)
    canvas.paste(lg, ((w - lg.width) // 2, (h - lg.height) // 2), lg)
    return canvas.convert("RGB")


def art_square(src, size):
    return ImageOps.fit(src.convert("RGB"), (size, size), Image.LANCZOS)


def art_cover(src, w, h, fg_frac=0.64):
    rgb = src.convert("RGB")
    bg = ImageOps.fit(rgb, (w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(48))
    bg = Image.eval(bg, lambda v: int(v * 0.55)).convert("RGBA")
    fg_size = int(h * fg_frac)
    fg = ImageOps.fit(rgb, (fg_size, fg_size), Image.LANCZOS)
    mask = Image.new("L", (fg_size, fg_size), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, fg_size - 1, fg_size - 1), radius=72, fill=255)
    bg.paste(fg, ((w - fg_size) // 2, (h - fg_size) // 2), mask)
    return bg.convert("RGB")


def main():
    logos_dir, public_dir = sys.argv[1:3]
    out_logo = os.path.join(public_dir, "game-logos")
    out_cover = os.path.join(public_dir, "game-covers")
    os.makedirs(out_logo, exist_ok=True)
    os.makedirs(out_cover, exist_ok=True)
    for slug, (bg, white, mode) in SOURCES.items():
        src_path = next(
            (os.path.join(logos_dir, slug + ext) for ext in (".png", ".jpg", ".jpeg", ".webp")
             if os.path.exists(os.path.join(logos_dir, slug + ext))),
            None,
        )
        if not src_path:
            print(f"skip {slug}: no source")
            continue
        src = load(src_path)
        if mode == "art":
            # Framed so the 16:10 card crop never cuts the art.
            card = art_cover(src, CARD[0], CARD[1], fg_frac=0.56)
            cover = art_cover(src, COVER[0], COVER[1])
        else:
            logo = trim(src)
            if white:
                logo = to_white(logo)
            card = place_logo(bg, logo, *CARD)
            cover = place_logo(bg, logo, *COVER)
        card.save(os.path.join(out_logo, f"{slug}.webp"), "WEBP", quality=85, method=6)
        cover.save(os.path.join(out_cover, f"{slug}.webp"), "WEBP", quality=85, method=6)
        print(f"{slug}\t{mode}")


if __name__ == "__main__":
    main()
