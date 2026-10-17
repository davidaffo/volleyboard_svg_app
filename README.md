# VolleyBoard SVG (Obsidian Plugin)
VolleyBoard is a tactical volleyball whiteboard for Obsidian.

## Obsidian Usage
1. Enable "VolleyBoard" in Settings → Community plugins.
2. Insert a block in any note:
```volleyboard
{ ...json... }
```
3. Or use the command: `Insert VolleyBoard block`.
4. Click the board to open the editor, make your changes, then use `Save and close`.

Changes are saved back to the same block you opened.

## Local plugin sync

Run `sh scripts/copy-plugin.sh` from the project directory to rebuild and install
the plugin into `~/Documents/Obsidian Vault`. For another vault, run:

```sh
sh scripts/copy-plugin.sh "/path/to/vault"
```

The script copies `main.js`, `styles.css`, and `manifest.json` into the vault's
`.obsidian/plugins/volleyboard-svg` folder. In Obsidian, disable and re-enable
**VolleyBoard SVG** under Settings → Community plugins to load the update.

The plugin version is set in `manifest.json`; `versions.json` records the minimum
Obsidian version for each listed release.

## Web App
VolleyBoard is also available as a web app.  
Open `docs/index.html` with a static server (for example: `python -m http.server 8080 -d docs`).
