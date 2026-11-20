#!/usr/bin/env bash
# Записывает два демо-видео (методист и сотрудник) на отдельной тестовой БД → demo-videos/*.mp4
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/frontend"
rm -rf test-results/demo
"$ROOT/scripts/e2e.sh" -c playwright.demo.config.ts
mkdir -p "$ROOT/demo-videos"
FFMPEG="$("$ROOT/backend/.venv/bin/python" -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())')"
conv() {  # webm → mp4 (H.264), совместимо с любым плеером
  "$FFMPEG" -y -loglevel error -i "$1" -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart "$2"
}
M=$(ls test-results/demo/*Методист*/video.webm 2>/dev/null || find test-results/demo -path '*1-methodist*' -name video.webm | head -1)
E=$(ls test-results/demo/*Сотрудник*/video.webm 2>/dev/null || find test-results/demo -path '*2-employee*' -name video.webm | head -1)
conv "$M" "$ROOT/demo-videos/dolce-learn-metodist.mp4"
conv "$E" "$ROOT/demo-videos/dolce-learn-sotrudnik.mp4"
ls -lh "$ROOT/demo-videos"
