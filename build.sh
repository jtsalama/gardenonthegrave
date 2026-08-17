#!/bin/sh
# Build the deploy folder from gotg-src.
#
# There is one source file. It is copied unchanged into three folders, and each copy works
# out which language it is from the address it was opened at. Edit gotg-src, run this, then
# drag the whole gotg-riga folder onto Cloudflare Pages.
#
#   gotg-riga/        both languages, English interface   ->  garden.wauhaus.fi/
#   gotg-riga/en/     English only,   English interface   ->  garden.wauhaus.fi/en/
#   gotg-riga/lv/     Latvian only,   Latvian interface   ->  garden.wauhaus.fi/lv/
#   gotg-riga/lv-ad/  Latvian + audio description         ->  garden.wauhaus.fi/lv-ad/

set -e
cd "$(dirname "$0")"

SRC=gotg-src
OUT=gotg-riga

[ -f "$SRC/index.html" ] || { echo "no $SRC/index.html — wrong directory?"; exit 1; }

mkdir -p "$OUT/en" "$OUT/lv" "$OUT/lv-ad"

for d in "$OUT" "$OUT/en" "$OUT/lv" "$OUT/lv-ad"; do
  cp "$SRC/index.html"      "$d/index.html"
  cp "$SRC/sw.js"           "$d/sw.js"
  cp "$SRC/cover.jpg"       "$d/cover.jpg"
  cp "$SRC/artwork-512.jpg" "$d/artwork-512.jpg"   # lock screen player icon
done

echo "built:"
find "$OUT" -type f | sort | sed 's/^/  /'
