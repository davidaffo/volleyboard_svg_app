#!/usr/bin/env sh
set -eu

SRC_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"

VAULT_DIR="${1:-$HOME/Documents/Obsidian Vault}"
if [ ! -d "$VAULT_DIR/.obsidian" ]; then
  echo "Obsidian vault not found: $VAULT_DIR" >&2
  echo "Usage: sh scripts/copy-plugin.sh /path/to/vault" >&2
  exit 1
fi

node "$SRC_DIR/scripts/sync-plugin.js"
node --check "$SRC_DIR/main.js"
PLUGIN_ID="$(node -p 'require(process.argv[1]).id' "$SRC_DIR/manifest.json")"
DEST_DIR="$VAULT_DIR/.obsidian/plugins/$PLUGIN_ID"
mkdir -p "$DEST_DIR"
for file in main.js styles.css manifest.json; do
  cp "$SRC_DIR/$file" "$DEST_DIR/$file"
done

echo "Copied VolleyBoard plugin to: $DEST_DIR"
echo "Reload the plugin in Obsidian to apply the update."
