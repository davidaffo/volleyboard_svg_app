# VolleyBoard SVG
Web app + plugin Obsidian per lavagna tattica di pallavolo in SVG (responsive desktop/mobile).
## Web app
Apri `web/index.html` con un server statico.
Esempio (Arch):
python -m http.server 8080 -d web
Poi apri http://localhost:8080
## Obsidian plugin
1) Copia la cartella `obsidian-plugin/volleyboard-svg` dentro `.obsidian/plugins/` del vault
2) Abilita il plugin da Settings → Community plugins
3) Inserisci un blocco:
```volleyboard
{ ...json... }
```
Oppure usa il comando: "Insert VolleyBoard block"
Nota: il plugin salva il JSON aggiornando il primo blocco ```volleyboard nel file.
## Gesture
Drag: sposta oggetti
Alt+wheel: zoom
Space+drag: pan
Modalità Frecce: disegna traiettorie
Modalità Testo: tap/click per inserire testo
Delete/Backspace: elimina selezione
