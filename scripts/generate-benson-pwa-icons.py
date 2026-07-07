#!/usr/bin/env python3
"""Generate PWA icons from dashboard/public/icons/benson-logo.png."""

from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "dashboard" / "public" / "icons"
PUBLIC = ROOT / "dashboard" / "public"
SRC = ICONS / "benson-logo.png"


def fit_on_canvas(img: Image.Image, size: int, bg: tuple[int, int, int], padding_ratio: float) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (*bg, 255))
    pad = int(size * padding_ratio)
    inner = size - pad * 2
    fitted = ImageOps.contain(img.convert("RGBA"), (inner, inner), Image.Resampling.LANCZOS)
    if fitted.width < inner * 0.85:
        sharp = ImageEnhance.Sharpness(fitted).enhance(1.15)
        contrast = ImageEnhance.Contrast(sharp).enhance(1.05)
        fitted = contrast
    ox = (size - fitted.width) // 2
    oy = (size - fitted.height) // 2
    canvas.paste(fitted, (ox, oy), fitted)
    return canvas


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Missing source: {SRC}")

    src = Image.open(SRC).convert("RGBA")
    white = (255, 255, 255)

    fit_on_canvas(src, 192, white, 0.08).convert("RGB").save(ICONS / "icon-192.png", optimize=True)
    fit_on_canvas(src, 512, white, 0.08).convert("RGB").save(ICONS / "icon-512.png", optimize=True)
    fit_on_canvas(src, 180, white, 0.08).convert("RGB").save(ICONS / "apple-touch-icon.png", optimize=True)
    # Maskable: extra padding for Android safe zone
    fit_on_canvas(src, 512, white, 0.18).convert("RGB").save(ICONS / "icon-512-maskable.png", optimize=True)

    fav16 = fit_on_canvas(src, 16, white, 0.06).convert("RGB")
    fav32 = fit_on_canvas(src, 32, white, 0.06).convert("RGB")
    fav16.save(
        PUBLIC / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32)],
        append_images=[fav32],
    )

    print("Generated PWA icons from", SRC)


if __name__ == "__main__":
    main()
