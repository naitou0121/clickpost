#!/bin/bash
# 共通ファイルを chrome-extension/ に配る。
# ⚠️ 直すのは常にこのフォルダの直下。chrome-extension/ の中は複製なので直接触らない。
set -e
cd "$(dirname "$0")"
for f in app.css app.js parser.js encoding.min.js icon-48.png icon-128.png icon-512.png; do
  cp "$f" "chrome-extension/$f"
done
echo "配布完了: $(date '+%H:%M')"
