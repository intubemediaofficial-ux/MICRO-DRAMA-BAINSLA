"""Generate demo poster/banner artwork for the micro-drama OTT seed content.

Fully procedural (no third-party imagery), 9:16 posters and 16:9 banners.
"""

import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT_TITLE = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
FONT_META = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

PALETTES = {
    "warm": ((28, 12, 10), (196, 84, 52), (255, 196, 120)),
    "night": ((6, 10, 26), (44, 62, 148), (120, 214, 255)),
    "crimson": ((18, 4, 12), (150, 22, 58), (255, 120, 150)),
    "gold": ((20, 14, 4), (152, 108, 24), (255, 216, 130)),
    "emerald": ((4, 18, 16), (18, 110, 92), (140, 255, 220)),
}


def _lerp(a, b, t):
    return tuple(int(round(x + (y - x) * t)) for x, y in zip(a, b))


def _gradient(size, top, bottom):
    w, h = size
    img = Image.new("RGB", (1, h))
    px = img.load()
    for y in range(h):
        px[0, y] = _lerp(top, bottom, y / max(h - 1, 1))
    return img.resize(size, Image.BICUBIC)


def _glow(size, palette, rng):
    w, h = size
    layer = Image.new("RGB", (w, h), (0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for _ in range(6):
        cx = rng.uniform(0.1, 0.9) * w
        cy = rng.uniform(0.05, 0.7) * h
        r = rng.uniform(0.18, 0.5) * w
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=palette[1])
    for _ in range(3):
        cx = rng.uniform(0.2, 0.8) * w
        cy = rng.uniform(0.1, 0.5) * h
        r = rng.uniform(0.05, 0.16) * w
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=palette[2])
    return layer.filter(ImageFilter.GaussianBlur(radius=w // 8))


def _rays(size, palette, rng):
    w, h = size
    layer = Image.new("RGB", (w, h), (0, 0, 0))
    draw = ImageDraw.Draw(layer)
    ox, oy = rng.uniform(0.2, 0.8) * w, -0.1 * h
    for i in range(14):
        ang = math.radians(rng.uniform(55, 125))
        length = h * 1.4
        x2 = ox + math.cos(ang) * length
        y2 = oy + math.sin(ang) * length
        draw.line((ox, oy, x2, y2), fill=palette[2], width=rng.randint(1, 4))
    return layer.filter(ImageFilter.GaussianBlur(radius=max(w // 90, 2)))


def _grain(size, rng, strength=16):
    w, h = size
    noise = Image.new("L", (w // 2, h // 2))
    noise.putdata([rng.randint(128 - strength, 128 + strength) for _ in range(
        (w // 2) * (h // 2))])
    return noise.resize((w, h), Image.BICUBIC).convert("RGB")


def _vignette(size, power=1.6):
    w, h = size
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    steps = 60
    for i in range(steps):
        t = i / steps
        val = int(255 * (1 - t) ** power)
        inset_x = int(t * w * 0.62)
        inset_y = int(t * h * 0.62)
        draw.ellipse((-w * 0.2 + inset_x, -h * 0.15 + inset_y,
                      w * 1.2 - inset_x, h * 1.15 - inset_y), fill=255 - val)
    return mask.filter(ImageFilter.GaussianBlur(radius=w // 12))


def _fit_font(path, text, max_width, start):
    size = start
    while size > 18:
        font = ImageFont.truetype(path, size)
        if font.getbbox(text)[2] <= max_width:
            return font
        size -= 2
    return ImageFont.truetype(path, 18)


def _wrap(text, font, max_width):
    words, lines, cur = text.split(), [], ""
    for word in words:
        trial = f"{cur} {word}".strip()
        if font.getbbox(trial)[2] <= max_width or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def _base(size, palette, seed):
    rng = random.Random(seed)
    img = _gradient(size, palette[0], _lerp(palette[0], palette[1], 0.55))
    img = Image.blend(img, _glow(size, palette, rng), 0.42)
    img = Image.blend(img, _rays(size, palette, rng), 0.12)
    img = Image.blend(img, _grain(size, rng), 0.10)
    dark = Image.new("RGB", size, (0, 0, 0))
    return Image.composite(img, dark, _vignette(size))


def _cover(img, size):
    w, h = size
    scale = max(w / img.width, h / img.height)
    img = img.resize((max(int(img.width * scale), w), max(int(img.height * scale), h)),
                     Image.LANCZOS)
    left = (img.width - w) // 2
    top = int((img.height - h) * 0.35)
    return img.crop((left, top, left + w, top + h))


def _duotone(img, palette, strength=0.82):
    gray = img.convert("L")
    shadow, mid, light = palette[0], palette[1], palette[2]
    ramp = []
    for i in range(256):
        t = i / 255
        if t < 0.55:
            ramp.append(_lerp(shadow, mid, t / 0.55))
        else:
            ramp.append(_lerp(mid, light, (t - 0.55) / 0.45))
    lut = ([c[0] for c in ramp], [c[1] for c in ramp], [c[2] for c in ramp])
    toned = Image.merge("RGB", [gray.point(ch) for ch in lut])
    return Image.blend(img.convert("RGB"), toned, strength)


def _photo_base(size, palette, photo_path, seed):
    rng = random.Random(seed)
    photo = _cover(Image.open(photo_path).convert("RGB"), size)
    img = _duotone(photo, palette)
    img = Image.blend(img, _glow(size, palette, rng), 0.18)
    img = Image.blend(img, _grain(size, rng, 10), 0.08)
    dark = Image.new("RGB", size, (0, 0, 0))
    return Image.composite(img, dark, _vignette(size, power=1.3))


def poster(path, title, genre, episodes, palette_name, seed, size=(720, 1280),
           photo=None):
    palette = PALETTES[palette_name]
    img = (_photo_base(size, palette, photo, seed) if photo
           else _base(size, palette, seed))
    w, h = size
    draw = ImageDraw.Draw(img, "RGBA")

    scrim = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(scrim).rectangle((0, int(h * 0.62), w, h), fill=(0, 0, 0, 150))
    img = Image.alpha_composite(img.convert("RGBA"), scrim.filter(
        ImageFilter.GaussianBlur(radius=h // 30))).convert("RGB")
    draw = ImageDraw.Draw(img, "RGBA")

    margin = int(w * 0.08)
    title_font = ImageFont.truetype(FONT_TITLE, int(w * 0.125))
    lines = _wrap(title.upper(), title_font, w - 2 * margin)
    if len(lines) > 3:
        title_font = ImageFont.truetype(FONT_TITLE, int(w * 0.095))
        lines = _wrap(title.upper(), title_font, w - 2 * margin)
    line_h = int(title_font.size * 1.14)
    y = int(h * 0.80) - line_h * len(lines)
    for line in lines:
        draw.text((margin + 2, y + 2), line, font=title_font, fill=(0, 0, 0, 170))
        draw.text((margin, y), line, font=title_font, fill=(255, 255, 255))
        y += line_h

    meta_font = ImageFont.truetype(FONT_META, int(w * 0.038))
    meta = f"{genre.upper()}  ·  {episodes} EPISODES"
    draw.text((margin, y + int(h * 0.012)), meta, font=meta_font,
              fill=_lerp(palette[2], (255, 255, 255), 0.35))

    chip_font = ImageFont.truetype(FONT_META, int(w * 0.034))
    label = "DEMO ARTWORK"
    tw = chip_font.getbbox(label)[2]
    draw.rounded_rectangle((margin, int(h * 0.055), margin + tw + int(w * 0.06),
                            int(h * 0.055) + int(w * 0.075)),
                           radius=int(w * 0.04), fill=(255, 255, 255, 38))
    draw.text((margin + int(w * 0.03), int(h * 0.055) + int(w * 0.019)), label,
              font=chip_font, fill=(255, 255, 255, 210))

    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, quality=88)
    return path


def banner(path, title, subtitle, palette_name, seed, size=(1600, 900), photo=None):
    palette = PALETTES[palette_name]
    img = (_photo_base(size, palette, photo, seed) if photo
           else _base(size, palette, seed))
    scrim = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(scrim).rectangle((0, int(size[1] * 0.35), size[0], size[1]),
                                    fill=(0, 0, 0, 140))
    img = Image.alpha_composite(img.convert("RGBA"), scrim.filter(
        ImageFilter.GaussianBlur(radius=size[1] // 24))).convert("RGB")
    w, h = size
    draw = ImageDraw.Draw(img, "RGBA")
    margin = int(w * 0.06)
    title_font = _fit_font(FONT_TITLE, title.upper(), int(w * 0.62), int(w * 0.075))
    draw.text((margin, int(h * 0.52)), title.upper(), font=title_font,
              fill=(255, 255, 255))
    sub_font = ImageFont.truetype(FONT_META, int(w * 0.026))
    draw.text((margin, int(h * 0.52) + int(title_font.size * 1.25)), subtitle,
              font=sub_font, fill=_lerp(palette[2], (255, 255, 255), 0.3))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, quality=88)
    return path


def thumb(path, label, palette_name, seed, photo=None, size=(640, 360)):
    palette = PALETTES[palette_name]
    img = (_photo_base(size, palette, photo, seed) if photo
           else _base(size, palette, seed))
    w, h = size
    draw = ImageDraw.Draw(img, "RGBA")
    font = ImageFont.truetype(FONT_META, int(w * 0.075))
    tw = font.getbbox(label)[2]
    pad = int(w * 0.03)
    draw.rounded_rectangle((pad, h - pad - int(w * 0.115), pad * 2 + tw,
                            h - pad), radius=int(w * 0.02),
                           fill=(0, 0, 0, 150))
    draw.text((pad + int(w * 0.018), h - pad - int(w * 0.095)), label,
              font=font, fill=(255, 255, 255))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, quality=86)
    return path


def avatar(path, name, palette_name, seed, size=(512, 512)):
    palette = PALETTES[palette_name]
    rng = random.Random(seed)
    img = _gradient(size, _lerp(palette[0], palette[1], 0.35),
                    _lerp(palette[1], (0, 0, 0), 0.35))
    img = Image.blend(img, _glow(size, palette, rng), 0.35)
    w, h = size
    draw = ImageDraw.Draw(img, "RGBA")
    initials = "".join(part[0] for part in name.split()[:2]).upper()
    font = ImageFont.truetype(FONT_META, int(w * 0.30))
    bbox = font.getbbox(initials)
    draw.text((w // 2 - bbox[2] // 2, h // 2 - int(font.size * 0.66)), initials,
              font=font, fill=(255, 255, 255, 240))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, quality=88)
    return path


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/artwork"
    bg = sys.argv[2] if len(sys.argv) > 2 else "/tmp/bg2"
    poster(f"{out}/second-chance-cafe.jpg", "Second Chance Cafe",
           "Sweet Romance", 60, "warm", 11, photo=f"{bg}/cafe_c.jpg")
    poster(f"{out}/room-404.jpg", "Room 404", "Revenge Thriller", 60,
           "night", 27, photo=f"{bg}/hotel_a.jpg")
    poster(f"{out}/crimson-promises.jpg", "Crimson Promises",
           "Billionaire Boss", 60, "crimson", 5, photo=f"{bg}/office_a.jpg")
    banner(f"{out}/banner-flash-sale.jpg", "Double Coins Weekend",
           "Recharge any bundle and get 2x coins - 48 hours only", "gold", 3,
           photo=f"{bg}/neon_a.jpg")
    banner(f"{out}/banner-hero.jpg", "Tonight on Bullet",
           "Three new vertical dramas, first 5 episodes free", "night", 9,
           photo=f"{bg}/city_b.jpg")
    print("done")
