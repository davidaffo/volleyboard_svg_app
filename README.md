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


## Dominio pubblico

Sito: https://volleyboard.davidaffo.com/

GitHub Pages pubblica dal branch `master`, cartella `/docs`, con Custom domain `volleyboard.davidaffo.com`. Il file `docs/CNAME` conserva il dominio nella sorgente pubblicata.

Su Cloudflare usare un CNAME `volleyboard` verso `davidaffo.github.io`, in modalità DNS only. Abilitare Enforce HTTPS su GitHub quando il certificato è disponibile. I percorsi relativi degli asset supportano la radice del nuovo dominio.

Il nuovo sottodominio ha un archivio del browser separato. I dati del vecchio indirizzo non migrano automaticamente: esportare quelli ancora disponibili e importarli dalla nuova app, quando la funzione è disponibile. Per usare il nuovo indirizzo come PWA, installare l’app dal nuovo dominio.
