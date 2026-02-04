#!/usr/bin/env sh
set -eu

SRC_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"


DEST_DIR="~/Coding/volleyboard_svg_app/"

mkdir -p "$DEST_DIR"

# Copy plugin contents
rsync -a --delete "$SRC_DIR/" "$DEST_DIR/"

echo "Copied VolleyBoard plugin to: $DEST_DIR"
