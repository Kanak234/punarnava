# scripts/make-icon.py — Punarnava ka original icon banata hai (PIL se, koi trademark nahi).
# Design: renewal ka circular arrow (punarnava = "phir se naya") + beech mein "P".
import math, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
# gradient rounded square
bg = Image.new("RGBA", (S, S))
px = bg.load()
for y in range(S):
    for x in range(S):
        t = (x + y) / (2 * S)
        r = int(14 + (35 - 14) * t); g = int(38 + (108 - 38) * t); b = int(29 + (74 - 29) * t)
        px[x, y] = (r, g, b, 255)
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=220, fill=255)
img.paste(bg, (0, 0), mask)
d = ImageDraw.Draw(img)
cx, cy, R, W = S / 2, S / 2, 330, 64
col = (126, 226, 176, 255)
# renewal arc (gap at top-right) + arrow head
start, end = -50, 250
d.arc([cx - R, cy - R, cx + R, cy + R], start=start, end=end, fill=col, width=W)
a = math.radians(start)
pt = (cx + R * math.cos(a), cy + R * math.sin(a))          # arc ka khula sira
away = (math.sin(a), -math.cos(a))                          # arc se bahar ki disha (tangent)
nrm = (math.cos(a), math.sin(a))                            # radius ki disha
tip = (pt[0] + away[0] * 95, pt[1] + away[1] * 95)
b1 = (pt[0] + nrm[0] * 78, pt[1] + nrm[1] * 78)
b2 = (pt[0] - nrm[0] * 78, pt[1] - nrm[1] * 78)
d.polygon([tip, b1, b2], fill=col)
# P
font = ImageFont.truetype(sys.argv[1], 420)
txt = "P"
bb = d.textbbox((0, 0), txt, font=font)
d.text((cx - (bb[2] - bb[0]) / 2 - bb[0], cy - (bb[3] - bb[1]) / 2 - bb[1]), txt, font=font, fill=(255, 255, 255, 255))
img.resize((256, 256), Image.LANCZOS).save(sys.argv[2])
print("icon written", sys.argv[2])
