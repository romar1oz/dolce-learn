"""Генерирует демонстрационные ассеты: обложки курсов (PNG) и короткое ТЕСТОВОЕ видео (MP4).

Видео — синтетическое (слайды с текстом), предназначено только для проверки плеера, загрузки и офлайн-режима.
Запуск: .venv/bin/python scripts/make_demo_assets.py   (нужны pillow и imageio-ffmpeg)
"""
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "app" / "assets" / "demo"
FONTS = ROOT / "app" / "assets" / "fonts"
OUT.mkdir(parents=True, exist_ok=True)

DARK, DEEP, ACCENT, LIGHT = (6, 78, 59), (6, 95, 70), (16, 185, 129), (209, 250, 229)


def font(size, bold=False):
    return ImageFont.truetype(str(FONTS / ("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf")), size)


def gradient(w, h, c1, c2):
    img = Image.new("RGB", (w, h), c1)
    d = ImageDraw.Draw(img)
    for x in range(w):
        t = x / w
        d.line([(x, 0), (x, h)], fill=tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3)))
    return img


def wrap(draw, text, fnt, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        test = (cur + " " + w).strip()
        if draw.textlength(test, font=fnt) <= width:
            cur = test
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    return lines


def cover(name, title, tag, motif):
    w, h = 1200, 675
    img = gradient(w, h, DARK, DEEP)
    d = ImageDraw.Draw(img, "RGBA")
    # декоративные круги
    d.ellipse([w - 420, -160, w + 160, 420], fill=(16, 185, 129, 60))
    d.ellipse([w - 300, 330, w + 40, 670], fill=(209, 250, 229, 40))
    # мотив
    cx, cy = w - 230, 330
    if motif == "shield":
        d.polygon([(cx, cy - 120), (cx + 100, cy - 80), (cx + 90, cy + 40), (cx, cy + 120), (cx - 90, cy + 40),
                   (cx - 100, cy - 80)], fill=(255, 255, 255, 230))
        d.line([(cx - 40, cy), (cx - 10, cy + 35), (cx + 50, cy - 35)], fill=ACCENT + (255,), width=18)
    elif motif == "doc":
        d.rounded_rectangle([cx - 85, cy - 115, cx + 85, cy + 115], 18, fill=(255, 255, 255, 235))
        for i in range(5):
            d.rounded_rectangle([cx - 55, cy - 70 + i * 32, cx + (55 if i % 2 else 25), cy - 56 + i * 32], 6,
                                fill=ACCENT + (255,))
    elif motif == "flask":
        d.polygon([(cx - 30, cy - 120), (cx + 30, cy - 120), (cx + 30, cy - 40), (cx + 110, cy + 110),
                   (cx - 110, cy + 110), (cx - 30, cy - 40)], fill=(255, 255, 255, 235))
        d.polygon([(cx - 70, cy + 40), (cx + 70, cy + 40), (cx + 110, cy + 110), (cx - 110, cy + 110)],
                  fill=ACCENT + (255,))
    else:
        d.ellipse([cx - 110, cy - 110, cx + 110, cy + 110], fill=(255, 255, 255, 235))
        d.ellipse([cx - 45, cy - 45, cx + 45, cy + 45], fill=ACCENT + (255,))
    d.rounded_rectangle([60, 70, 60 + d.textlength(tag, font=font(26, True)) + 40, 120], 25,
                        fill=(209, 250, 229, 255))
    d.text((80, 78), tag, font=font(26, True), fill=DARK)
    y = 190
    for line in wrap(d, title, font(60, True), 640):
        d.text((60, y), line, font=font(60, True), fill="white")
        y += 74
    d.text((60, h - 90), "Dolce Learn · Dolce Pharm", font=font(26), fill=LIGHT)
    img.save(OUT / name, "PNG", optimize=True)


def video():
    w, h, fps, seconds = 960, 540, 10, 24
    slides = [
        ("ТЕСТОВОЕ ВИДЕО", "Демонстрационный файл для проверки видеоплеера и офлайн-режима Dolce Learn. "
                           "Замените его собственной видеозаписью через кабинет методиста."),
        ("Шаг 1. Средства защиты", "Перед входом в чистую зону наденьте халат, бахилы, шапочку, маску и перчатки."),
        ("Шаг 2. Проверка", "Проверьте целостность СИЗ и отсутствие украшений. Обработайте руки антисептиком."),
        ("Шаг 3. Шлюз", "Проходите через воздушный шлюз только после закрытия предыдущей двери."),
    ]
    ffmpeg = __import__("imageio_ffmpeg").get_ffmpeg_exe()
    dest = OUT / "demo_test_video.mp4"
    cmd = [ffmpeg, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-r",
           str(fps), "-i", "-", "-f", "lavfi", "-i", f"sine=frequency=440:sample_rate=22050:duration={seconds}",
           "-filter:a", "volume=0.05", "-c:v", "libx264", "-preset", "veryslow", "-crf", "30", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "48k", "-shortest", "-movflags", "+faststart", str(dest)]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    per = seconds * fps // len(slides)
    for si, (title, body) in enumerate(slides):
        for f in range(per):
            img = gradient(w, h, DARK, DEEP)
            d = ImageDraw.Draw(img, "RGBA")
            prog = (si * per + f) / (seconds * fps)
            d.rectangle([0, h - 10, int(w * prog), h], fill=ACCENT)
            d.text((50, 40), "Dolce Learn · тестовое видео", font=font(22), fill=LIGHT)
            d.text((50, 150), title, font=font(46, True), fill="white")
            y = 230
            for line in wrap(d, body, font(28), w - 120):
                d.text((50, y), line, font=font(28), fill=(236, 253, 245))
                y += 40
            t = (si * per + f) / fps
            d.text((w - 140, 40), f"{int(t // 60):02d}:{int(t % 60):02d}", font=font(22), fill=LIGHT)
            proc.stdin.write(img.tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        sys.exit("ffmpeg failed")
    print("video", dest, dest.stat().st_size)


if __name__ == "__main__":
    cover("cover_safety.png", "Техника безопасности на производстве", "Обязательный", "shield")
    cover("cover_sop.png", "СОП: вход в чистые помещения", "СОП", "doc")
    cover("cover_gmp.png", "Основы GMP фармацевтического производства", "Производство", "flask")
    cover("cover_quality.png", "Документирование и data integrity", "Качество", "circle")
    cover("cover_service.png", "Коммуникация с внутренним клиентом", "Soft skills", "circle")
    video()
