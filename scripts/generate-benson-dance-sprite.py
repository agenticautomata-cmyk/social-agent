#!/usr/bin/env python3
"""Generate Benson dance sprite sheet from benson-logo.png + mascot limbs."""

from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "dashboard" / "public" / "icons" / "benson-logo.png"
OUT_DIR = ROOT / "dashboard" / "public" / "animations"

FRAME_SIZE = 128
FRAME_COUNT = 24
FPS = 12

# Keyframe samples matching dashboard/app/globals.css choreography (scale=1 @ 72px)
KF = [
    # t, body_x, body_rot, arm_l, arm_l_y, arm_r, arm_r_y, leg_l, leg_l_y, leg_r, leg_r_y, shadow_sx, torso_y, torso_scale
    (0.00, 0, 0, 20, 0, -20, 0, 8, 0, -8, 0, 1.0, 0, 1.0),
    (0.25, -8, -6, -55, -4, 55, -4, -28, -3, 28, 2, 0.75, -5, 1.03),
    (0.50, 0, 0, 35, 0, -35, 0, 12, 0, -12, 0, 1.0, 0, 1.0),
    (0.75, 8, 6, -40, 0, 40, 0, -18, 2, 18, -3, 0.8, -3, 1.02),
    (1.00, 0, 0, 20, 0, -20, 0, 8, 0, -8, 0, 1.0, 0, 1.0),
]


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def sample_pose(frame_idx: int) -> dict[str, float]:
    t = frame_idx / FRAME_COUNT
    for i in range(len(KF) - 1):
        t0, *v0 = KF[i]
        t1, *v1 = KF[i + 1]
        if t0 <= t <= t1 or (i == len(KF) - 2 and t >= t1):
            span = t1 - t0
            u = 0 if span == 0 else (t - t0) / span
            if t >= t1 and i == len(KF) - 2:
                u = 1
            keys = [
                "body_x",
                "body_rot",
                "arm_l",
                "arm_l_y",
                "arm_r",
                "arm_r_y",
                "leg_l",
                "leg_l_y",
                "leg_r",
                "leg_r_y",
                "shadow_sx",
                "torso_y",
                "torso_scale",
            ]
            return {k: lerp(v0[j], v1[j], u) for j, k in enumerate(keys)}
    _, *v = KF[-1]
    keys = [
        "body_x",
        "body_rot",
        "arm_l",
        "arm_l_y",
        "arm_r",
        "arm_r_y",
        "leg_l",
        "leg_l_y",
        "leg_r",
        "leg_r_y",
        "shadow_sx",
        "torso_y",
        "torso_scale",
    ]
    return dict(zip(keys, v))


def draw_gradient_limb(w: int, h: int, color_top: tuple[int, int, int], color_bottom: tuple[int, int, int]) -> Image.Image:
    limb = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(limb)
    for y in range(h):
        u = y / max(h - 1, 1)
        r = int(lerp(color_top[0], color_bottom[0], u))
        g = int(lerp(color_top[1], color_bottom[1], u))
        b = int(lerp(color_top[2], color_bottom[2], u))
        draw.line([(0, y), (w, y)], fill=(r, g, b, 240))
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=w // 2, fill=255)
    limb.putalpha(mask)
    return limb


def paste_rotated(
    canvas: Image.Image,
    patch: Image.Image,
    cx: float,
    cy: float,
    angle_deg: float,
    offset_y: float = 0,
) -> None:
    rotated = patch.rotate(-angle_deg, expand=True, resample=Image.Resampling.BICUBIC)
    px = int(cx - rotated.width / 2)
    py = int(cy - rotated.height / 2 + offset_y)
    canvas.alpha_composite(rotated, (px, py))


def render_frame(logo: Image.Image, pose: dict[str, float]) -> Image.Image:
    scale = FRAME_SIZE / 72
    frame = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))

    shadow = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sx = int(52 * scale * pose["shadow_sx"])
    sy = int(10 * scale)
    sh_x = FRAME_SIZE // 2 - sx // 2 + int(pose["body_x"] * scale)
    sh_y = FRAME_SIZE - sy - int(8 * scale)
    sd.ellipse(
        [sh_x, sh_y, sh_x + sx, sh_y + sy],
        fill=(168, 85, 247, int(90 * (0.55 + 0.3 * pose["shadow_sx"]))),
    )
    frame.alpha_composite(shadow)

    body = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    cx = FRAME_SIZE / 2 + pose["body_x"] * scale
    torso_cy = FRAME_SIZE * 0.42 + pose["torso_y"] * scale

    pink = (236, 72, 153)
    violet = (124, 58, 237)
    arm_w = max(2, int(7 * scale))
    arm_h = max(6, int(28 * scale))
    leg_w = max(2, int(9 * scale))
    leg_h = max(6, int(30 * scale))

    arm_patch = draw_gradient_limb(arm_w, arm_h, pink, violet)
    leg_patch = draw_gradient_limb(leg_w, leg_h, pink, violet)

    leg_l_x = cx - 14 * scale
    leg_r_x = cx + 14 * scale
    leg_cy = torso_cy + int(logo.height * pose["torso_scale"] * 0.35)
    paste_rotated(body, leg_patch, leg_l_x, leg_cy, pose["leg_l"], pose["leg_l_y"] * scale)
    paste_rotated(body, leg_patch, leg_r_x, leg_cy, pose["leg_r"], pose["leg_r_y"] * scale)

    arm_l_x = cx - 8 * scale
    arm_r_x = cx + 8 * scale
    arm_cy = torso_cy + int(18 * scale)
    paste_rotated(body, arm_patch, arm_l_x, arm_cy, pose["arm_l"], pose["arm_l_y"] * scale)
    paste_rotated(body, arm_patch, arm_r_x, arm_cy, pose["arm_r"], pose["arm_r_y"] * scale)

    logo_size = int(FRAME_SIZE * 0.62 * pose["torso_scale"])
    fitted = ImageOps.contain(logo, (logo_size, logo_size), Image.Resampling.LANCZOS)
    glow = fitted.filter(ImageFilter.GaussianBlur(radius=2))
    glow_canvas = Image.new("RGBA", fitted.size, (0, 0, 0, 0))
    glow_tint = Image.new("RGBA", fitted.size, (168, 85, 247, 80))
    glow_canvas = Image.alpha_composite(glow_canvas, Image.blend(glow, glow_tint, 0.5))
    lx = int(cx - fitted.width / 2)
    ly = int(torso_cy - fitted.height / 2)
    body.alpha_composite(glow_canvas, (lx - 1, ly - 1))
    body.alpha_composite(fitted, (lx, ly))

    if pose["body_rot"] != 0:
        body = body.rotate(-pose["body_rot"], resample=Image.Resampling.BICUBIC, center=(cx, leg_cy))

    frame.alpha_composite(body)
    return frame


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Missing source: {SRC}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    logo = Image.open(SRC).convert("RGBA")

    frames: list[Image.Image] = []
    for i in range(FRAME_COUNT):
        pose = sample_pose(i)
        frames.append(render_frame(logo, pose))

    strip_w = FRAME_SIZE * FRAME_COUNT
    strip = Image.new("RGBA", (strip_w, FRAME_SIZE), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        strip.paste(fr, (i * FRAME_SIZE, 0), fr)

    webp_path = OUT_DIR / "benson-dance.webp"
    strip.save(webp_path, format="WEBP", quality=92, method=6)

    manifest = {
        "frameWidth": FRAME_SIZE,
        "frameHeight": FRAME_SIZE,
        "frameCount": FRAME_COUNT,
        "fps": FPS,
        "src": "/animations/benson-dance.webp",
    }
    (OUT_DIR / "benson-dance.json").write_text(json.dumps(manifest, indent=2) + "\n")

    print(f"Generated {FRAME_COUNT} frames → {webp_path} ({strip_w}×{FRAME_SIZE})")


if __name__ == "__main__":
    main()
