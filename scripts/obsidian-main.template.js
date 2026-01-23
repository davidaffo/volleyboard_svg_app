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
    const tryResolve = () => {
      const win = iframe.contentWindow;
      if (win && win.VOLLEY_API) {
        resolve(win.VOLLEY_API);
        return true;
      }
      return false;
    };
    if (tryResolve()) return;
    const onLoad = () => {
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        if (tryResolve()) {
          clearInterval(timer);
        } else if (tries > 100) {
          clearInterval(timer);
          resolve(null);
        }
      }, 50);
    };
    iframe.addEventListener('load', onLoad, { once: true });
  });
}

class VolleyBoardPlugin extends Plugin {
  async onload() {
    this.registerMarkdownCodeBlockProcessor('volleyboard', async (source, el, ctx) => {
      el.empty();
      const wrapper = el.createDiv({ cls: 'vb-obsidian-wrapper' });

      let parsed = null;
      try { parsed = JSON.parse(source.trim() || '{}'); } catch { parsed = null; }
      if (!parsed || typeof parsed !== 'object') {
        wrapper.createEl('div', { text: 'VolleyBoard: JSON non valido.', cls: 'vb-error' });
        return;
      }

      const iframe = document.createElement('iframe');
      iframe.className = 'vb-iframe';
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      iframe.setAttribute('loading', 'lazy');
      iframe.setAttribute('referrerpolicy', 'no-referrer');
      iframe.srcdoc = buildSrcDoc();
      iframe.style.width = '100%';
      iframe.style.height = '600px';
      iframe.style.minHeight = '360px';
      iframe.style.border = '0';
      iframe.style.borderRadius = '18px';
      iframe.style.overflow = 'hidden';
      wrapper.appendChild(iframe);

      const api = await waitForApi(iframe);
      if (!api) {
        wrapper.createEl('div', { text: 'VolleyBoard: impossibile inizializzare.', cls: 'vb-error' });
        return;
      }

      api.setState(parsed);

      let saveTimer = null;
      const scheduleSave = (nextState) => {
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
