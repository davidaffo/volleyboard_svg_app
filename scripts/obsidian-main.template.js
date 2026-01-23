/*
  AUTO-GENERATED FILE
  Source of truth: web/index.html, web/style.css, web/app.js
  Regenerate with: node scripts/sync-plugin.js
*/
const { Plugin, Notice } = require('obsidian');

const WEB_HTML = __WEB_HTML__;
const WEB_CSS = __WEB_CSS__;
const WEB_JS = __WEB_JS__;

function buildSrcDoc() {
  return [
    '<!doctype html>',
    '<html lang="it">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />',
    '<style>',
    WEB_CSS,
    '</style>',
    '<script>window.VOLLEY_EMBED = true;<\/script>',
    '</head>',
    '<body>',
    WEB_HTML,
    '<script>',
    WEB_JS,
    '<\/script>',
    '</body>',
    '</html>'
  ].join('');
}

function waitForApi(iframe) {
  return new Promise((resolve) => {
    let tries = 0;
    const maxTries = 200;
    const timer = setInterval(() => {
      tries += 1;
      const win = iframe.contentWindow;
      if (win && win.VOLLEY_API) {
        clearInterval(timer);
        resolve(win.VOLLEY_API);
        return;
      }
      if (tries > maxTries) {
        clearInterval(timer);
        resolve(null);
      }
    }, 50);
  });
}

class VolleyBoardPlugin extends Plugin {
  async onload() {
    this.registerMarkdownCodeBlockProcessor('volleyboard', async (source, el, ctx) => {
      el.empty();
      const wrapper = el.createDiv({ cls: 'vb-obsidian-wrapper' });
      const style = document.createElement('style');
      style.textContent = `
        .vb-obsidian-wrapper{display:block;}
        .vb-snapshot{border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,.08);box-shadow:0 10px 30px rgba(0,0,0,.35);max-height:360px;}
        .vb-snapshot svg{display:block;width:100%;height:auto;max-height:360px;}
        .vb-notes{margin-top:8px;font-size:12px;color:rgba(255,255,255,.7);white-space:pre-wrap;}
        .vb-error{color:rgba(255,255,255,.75);padding:8px;}
        .vb-editor-frame{width:100%;height:100%;border:0;border-radius:0;}
      `;
      wrapper.appendChild(style);

      const snap = wrapper.createDiv({ cls: 'vb-snapshot' });

      let parsed = null;
      try { parsed = JSON.parse(source.trim() || '{}'); } catch { parsed = null; }
      if (!parsed || typeof parsed !== 'object') {
        wrapper.createEl('div', { text: 'VolleyBoard: JSON non valido.', cls: 'vb-error' });
        return;
      }

      const renderSnapshot = async () => {
        snap.textContent = '';
        const iframe = document.createElement('iframe');
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
        iframe.setAttribute('loading', 'lazy');
        iframe.setAttribute('referrerpolicy', 'no-referrer');
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.style.position = 'absolute';
        iframe.style.opacity = '0';
        iframe.style.pointerEvents = 'none';
        iframe.srcdoc = buildSrcDoc();
        wrapper.appendChild(iframe);

        const api = await waitForApi(iframe);
        if (!api) {
          snap.textContent = 'VolleyBoard: errore inizializzazione.';
          iframe.remove();
          return;
        }
        api.setState(parsed);
        const svg = api.exportSvg ? api.exportSvg() : '';
        iframe.remove();
        if (!svg) {
          snap.textContent = 'VolleyBoard: snapshot non disponibile.';
          return;
        }
        snap.innerHTML = svg;
      };

      await renderSnapshot();

      let editorOpen = false;
      let editorIframe = null;
      const openEditor = async () => {
        if (editorOpen) return;
        editorOpen = true;
        snap.style.display = 'none';

        const iframe = document.createElement('iframe');
        editorIframe = iframe;
        iframe.className = 'vb-editor-frame';
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
        iframe.setAttribute('loading', 'lazy');
        iframe.setAttribute('referrerpolicy', 'no-referrer');
        iframe.srcdoc = buildSrcDoc();

        let hostEl = null;
        const popout = this.app.workspace.getLeaf?.('window');
        if (popout) {
          await popout.setViewState({ type: 'empty', state: {} });
          hostEl = popout.view.containerEl;
          hostEl.empty();
          hostEl.style.padding = '0';
          hostEl.style.margin = '0';
          hostEl.style.width = '100vw';
          hostEl.style.height = '100vh';
          hostEl.style.display = 'flex';
          hostEl.style.flexDirection = 'column';
          iframe.style.flex = '1 1 auto';
        } else {
          hostEl = wrapper;
        }
        hostEl.appendChild(iframe);

        const api = await waitForApi(iframe);
        if (!api) {
          wrapper.createEl('div', { text: 'VolleyBoard: impossibile inizializzare.', cls: 'vb-error' });
          return;
        }

        api.setState(parsed);

        let saveTimer = null;
        const scheduleSave = (nextState) => {
          parsed = nextState;
          if (saveTimer) clearTimeout(saveTimer);
          saveTimer = setTimeout(async () => {
            try {
              await this.persistState(ctx, source, nextState);
            } catch (e) {
              console.error(e);
              new Notice('VolleyBoard: impossibile salvare (vedi console)');
            }
          }, 250);
        };

        api.subscribe(scheduleSave);
      };

      wrapper.addEventListener('click', (e) => {
        if (editorOpen) return;
        openEditor();
      });
    });

    this.addCommand({
      id: 'insert-volleyboard-block',
      name: 'Insert VolleyBoard block',
      editorCallback: (editor) => {
        const block = {
          version: 1,
          meta: { createdAt: new Date().toISOString() },
          layout: 'full-h',
          rotation: 0,
          view: { x: -2, y: -2, w: 22, h: 13 },
          notes: '',
          layers: { players: true, drawings: true, text: true },
          objects: [],
          drawings: [],
          texts: [],
          props: [],
        };
        const md = '```volleyboard\n' + JSON.stringify(block, null, 2) + '\n```\n';
        editor.replaceSelection(md);
      }
    });
  }

  onunload() {}

  async persistState(ctx, originalSource, nextState) {
    const file = ctx.sourcePath ? this.app.vault.getAbstractFileByPath(ctx.sourcePath) : null;
    if (!file) throw new Error('No file from context');

    const text = await this.app.vault.read(file);
    const re = /```volleyboard\s*([\s\S]*?)```/m;
    const m = text.match(re);
    if (!m) throw new Error('No volleyboard block found');
    const replacement = '```volleyboard\n' + JSON.stringify(nextState, null, 2) + '\n```';
    const nextText = text.replace(re, replacement);
    await this.app.vault.modify(file, nextText);
  }
}

module.exports = VolleyBoardPlugin;
