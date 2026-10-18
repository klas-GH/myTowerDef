#!/usr/bin/env python3
"""Asset generator for myTowerDef v2.3.2."""
import os, math, random
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets')
os.makedirs(OUT, exist_ok=True)
random.seed(42)


def font(size):
    for name in ('DejaVuSans-Bold.ttf', 'DejaVuSans.ttf', 'arial.ttf'):
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            pass
    return ImageFont.load_default()


def shade(hexcolor, amt):
    h = hexcolor.lstrip('#')
    r, g, b = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    r = max(0, min(255, int(r + (255 - r) * amt)))
    g = max(0, min(255, int(g + (255 - g) * amt)))
    b = max(0, min(255, int(b + (255 - b) * amt)))
    return '#%02x%02x%02x' % (r, g, b)


def save(img, name):
    p = os.path.join(OUT, name)
    img.save(p)
    print('wrote', p, img.size)


def draw_rounded_bg(size, ground, road, road_edge, accent):
    w, h = size
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w, h], fill=ground)
    return img, d


# Level background palettes. Each entry has ground, road, road_edge, accent,
# and a list of decorative layer items (name, color, glyph, count).
LEVELS = {
    "jungle": dict(
        ground="#173c35", road="#9b896a", road_edge="#c6b99a", accent="#22c55e",
        layers=[("palm", "#2f8b55", "*", 12), ("flower", "#f9a8d4", "o", 6)],
    ),
    "ocean": dict(
        ground="#174653", road="#c4a878", road_edge="#e8d6ad", accent="#38bdf8",
        layers=[("coral", "#f472b6", "H", 10), ("seaweed", "#22c55e", "W", 8)],
    ),
    "meadow": dict(
        ground="#31533b", road="#b49a6c", road_edge="#dfc88f", accent="#84cc16",
        layers=[("flower", "#f9a8d4", "o", 10), ("butterfly", "#fbbf24", "*", 5)],
    ),
    "desert": dict(
        ground="#8b6841", road="#c6a66b", road_edge="#f0d89b", accent="#f59e0b",
        layers=[("cactus", "#65a30d", "!", 8), ("dune", "#e7c96a", "v", 10)],
    ),
    "autumn": dict(
        ground="#394432", road="#a88b67", road_edge="#d8bd91", accent="#f97316",
        layers=[("leaf", "#f97316", "X", 14), ("acorn", "#a16207", "o", 5)],
    ),
    "snow": dict(
        ground="#425766", road="#b6aa91", road_edge="#e9e4d8", accent="#38bdf8",
        layers=[("snowflake", "#e0f2fe", "*", 12), ("pine", "#166534", "Y", 8)],
    ),
    "swamp": dict(
        ground="#243b28", road="#6b5a3c", road_edge="#9a8a5e", accent="#84cc16",
        layers=[("moss", "#65a30d", "#", 12), ("firefly", "#fbbf24", "*", 6)],
    ),
    "volcano": dict(
        ground="#3a1d18", road="#7a3a2a", road_edge="#b8542a", accent="#ef4444",
        layers=[("lava", "#ef4444", "^", 6), ("ash", "#57534e", "v", 10)],
    ),
    "ruins": dict(
        ground="#3a3828", road="#7a6a44", road_edge="#a89668", accent="#a8a868",
        layers=[("stone", "#57534e", "x", 10), ("ivy", "#65a30d", "Y", 8)],
    ),
    "crystal": dict(
        ground="#1e2a4a", road="#4a5a8a", road_edge="#6a7ab0", accent="#a855f7",
        layers=[("crystal", "#c084fc", "*", 10), ("spark", "#fde68a", "*", 6)],
    ),
    "moon": dict(
        ground="#2a3350", road="#5a6a90", road_edge="#8a9ab0", accent="#e2d3ff",
        layers=[("crater", "#3a4460", "v", 10), ("star", "#fef08a", "*", 8)],
    ),
    "canyon": dict(
        ground="#6b3a24", road="#a86a3c", road_edge="#d8a06a", accent="#f59e0b",
        layers=[("cactus", "#65a30d", "!", 8), ("rock", "#7a4a2a", "x", 10)],
    ),
}


# Level paths (road polylines) matching game.js LEVELS order.
LEVEL_PATHS = {
    "jungle": [(-10, 45), (240, 45), (240, 130), (65, 130), (65, 225), (245, 225), (245, 370)],
    "ocean": [(-10, 70), (75, 70), (75, 150), (230, 150), (230, 55), (275, 55), (275, 255), (90, 255), (90, 370)],
    "meadow": [(-10, 85), (255, 85), (255, 155), (45, 155), (45, 235), (215, 235), (215, 295), (80, 295), (80, 370)],
    "desert": [(-10, 55), (55, 55), (55, 120), (260, 120), (260, 190), (105, 190), (105, 265), (235, 265), (235, 370)],
    "autumn": [(-10, 100), (210, 100), (210, 55), (270, 55), (270, 185), (70, 185), (70, 260), (230, 260), (230, 370)],
    "snow": [(-10, 60), (270, 60), (270, 125), (35, 125), (35, 205), (225, 205), (225, 280), (100, 280), (100, 370)],
    "swamp": [(-10, 90), (250, 90), (250, 160), (60, 160), (60, 240), (240, 240), (240, 310), (80, 310), (80, 370)],
    "volcano": [(-10, 40), (200, 40), (200, 120), (100, 120), (100, 200), (250, 200), (250, 280), (60, 280), (60, 370)],
    "ruins": [(-10, 80), (230, 80), (230, 150), (80, 150), (80, 230), (250, 230), (250, 300), (100, 300), (100, 370)],
    "crystal": [(-10, 70), (260, 70), (260, 140), (50, 140), (50, 220), (240, 220), (240, 290), (90, 290), (90, 370)],
    "moon": [(-10, 60), (250, 60), (250, 130), (60, 130), (60, 210), (230, 210), (230, 280), (110, 280), (110, 370)],
    "canyon": [(-10, 80), (220, 80), (220, 150), (70, 150), (70, 230), (240, 230), (240, 300), (90, 300), (90, 370)],
}


def point_near_polyline(pt, path, clearance):
    for i in range(len(path) - 1):
        a, b = path[i], path[i + 1]
        dx, dy = b[0] - a[0], b[1] - a[1]
        if dx == 0 and dy == 0:
            continue
        t = max(0, min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / (dx * dx + dy * dy)))
        px, py = a[0] + t * dx, a[1] + t * dy
        if math.hypot(pt[0] - px, pt[1] - py) < clearance:
            return True
    return False


def draw_background(theme, size=(300, 360)):
    """Draw a layered themed background PNG. Returns the RGBA image."""
    w, h = size
    p = LEVELS[theme]
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w, h], fill=p['ground'])

    path = LEVEL_PATHS.get(theme)
    if path:
        d.line(path, fill=p['road'], width=30, joint='curve')
        d.line(path, fill=p['road_edge'], width=32, joint='curve')

    for name, color, glyph, count in p['layers']:
        for _ in range(count):
            x = random.randint(8, w - 8)
            y = random.randint(8, h - 8)
            if path and point_near_polyline((x, y), path, 22):
                continue
            d.text((x, y), glyph, fill=color, font=font(12))

    return img


def draw_enemy(kind, color, dark, crown=False):
    """Draw a small enemy icon PNG."""
    s = 28
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = s // 2, s // 2
    if crown:
        # Boss: dark body with crown points.
        d.polygon([(cx, cy - 10), (cx + 8, cy + 2), (cx + 6, cy + 10), (cx - 6, cy + 10), (cx - 8, cy + 2)], fill=dark, outline='#e9d5ff', width=1)
        d.polygon([(cx, cy - 10), (cx + 3, cy - 6), (cx + 6, cy - 4), (cx + 8, cy + 2), (cx + 5, cy + 2), (cx + 3, cy - 2), (cx, cy + 2), (cx - 3, cy - 2), (cx - 5, cy + 2), (cx - 8, cy + 2)], fill=color)
    elif kind == 'runner':
        # Runner: sleek diamond with a speed streak.
        d.polygon([(cx, cy - 8), (cx + 6, cy), (cx, cy + 8), (cx - 6, cy)], fill=color, outline='#1f2937', width=1)
        d.polygon([(cx - 2, cy - 4), (cx + 2, cy - 4), (cx + 4, cy), (cx - 2, cy)], fill=shade(color, -0.3))
    elif kind == 'armored':
        # Armored: heavy hexagon with a plate line.
        d.polygon([(cx, cy - 9), (cx + 7, cy - 4), (cx + 7, cy + 4), (cx, cy + 9), (cx - 7, cy + 4), (cx - 7, cy - 4)], fill=color, outline='#0f172a', width=1)
        d.line([(cx - 5, cy), (cx + 5, cy)], fill=shade(color, -0.3), width=2)
    else:
        # Standard: simple round body.
        d.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], fill=color, outline='#0f172a', width=1)
        d.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=shade(color, -0.3))
    return img


def draw_tower(kind, color, highlight):
    """Draw a small tower icon PNG."""
    s = 28
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = s // 2, s // 2
    # Base platform.
    d.rectangle([cx - 7, cy + 5, cx + 7, cy + 9], fill='#1e293b', outline='#0f172a', width=1)
    if kind == 'archer':
        # Archer: bow shape.
        d.polygon([(cx - 5, cy + 4), (cx - 3, cy - 5), (cx + 4, cy - 7), (cx + 7, cy - 4), (cx + 4, cy - 1), (cx + 2, cy + 5)], fill=color, outline=highlight, width=1)
        d.line([(cx - 5, cy - 1), (cx + 7, cy - 1)], fill=highlight, width=1)
        d.polygon([(cx + 7, cy - 3), (cx + 10, cy - 1), (cx + 7, cy + 1)], fill=highlight)
    elif kind == 'cannon':
        # Cannon: barrel on a swivel.
        d.line([(cx - 4, cy + 5), (cx + 4, cy - 4)], fill='#cbd5e1', width=5)
        d.line([(cx - 4, cy + 5), (cx + 4, cy - 4)], fill=color, width=3)
        d.polygon([(cx + 1, cy - 8), (cx + 8, cy - 1), (cx + 5, cy + 2), (cx - 2, cy - 5)], fill='#334155', outline=highlight, width=1)
        d.ellipse([cx - 3, cy + 6, cx - 1, cy + 8], fill=color)
    else:
        # Magic: crystal with inner facet.
        d.polygon([(cx, cy - 8), (cx + 6, cy - 2), (cx + 4, cy + 6), (cx, cy + 9), (cx - 4, cy + 6), (cx - 6, cy - 2)], fill=color, outline=highlight, width=1)
        d.polygon([(cx, cy - 5), (cx + 3, cy - 1), (cx, cy + 5), (cx - 3, cy - 1)], fill=shade(color, -0.3))
    return img


def main():
    for theme in LEVELS:
        img = draw_background(theme)
        save(img, 'bg_%s.png' % theme)

    # Enemy and tower icons as small PNGs. The game draws these on the canvas
    # via ctx.drawImage, so they are authored at a modest size and upscaled.
    save(draw_enemy('standard', '#ef4444', '#7f1d1d'), 'enemy_standard.png')
    save(draw_enemy('runner', '#f59e0b', '#78350f'), 'enemy_runner.png')
    save(draw_enemy('armored', '#64748b', '#1e293b'), 'enemy_armored.png')
    save(draw_enemy('boss', '#a855f7', '#3b0764', crown=True), 'enemy_boss.png')
    save(draw_tower('archer', '#60a5fa', '#bfdbfe'), 'tower_archer.png')
    save(draw_tower('cannon', '#f97316', '#cbd5e1'), 'tower_cannon.png')
    save(draw_tower('magic', '#a855f7', '#e9d5ff'), 'tower_magic.png')


if __name__ == '__main__':
    main()