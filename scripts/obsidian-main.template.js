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
      let savedState = parsed;
      let draftState = parsed;

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
        api.setState(savedState);
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
      let editorLeaf = null;
      const sectionInfo = ctx.getSectionInfo?.(ctx.el);
      const blockLineStart = (sectionInfo && typeof sectionInfo.lineStart === 'number') ? sectionInfo.lineStart : null;
      const ensureBlockId = () => {
        if (!parsed) return null;
        if (!parsed.meta) parsed.meta = { createdAt: new Date().toISOString() };
        if (!parsed.meta.blockId) {
          parsed.meta.blockId = `vb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        }
        return parsed.meta.blockId;
      };
      let sourceText = source;
      const blockId = ensureBlockId();
      const refreshSourceText = (state) => {
        try { sourceText = JSON.stringify(state, null, 2); } catch {}
      };
      const persistSafe = async (nextState, strict = false) => {
        try {
          await this.persistState(ctx, sourceText, nextState, { blockLineStart, blockId, strict });
          refreshSourceText(nextState);
          return;
        } catch (err) {
          if (!strict || !String(err?.message || '').includes('blockId not found')) throw err;
        }
        // Retry once: write with lineStart (if blockId missing), then strict save.
        await this.persistState(ctx, sourceText, nextState, { blockLineStart, forceLineStart: true });
        refreshSourceText(nextState);
        await this.persistState(ctx, sourceText, nextState, { blockLineStart, blockId, strict: true });
        refreshSourceText(nextState);
      };
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
        const leaf = this.app.workspace.getLeaf?.('tab');
        if (leaf) {
          editorLeaf = leaf;
          await leaf.setViewState({ type: 'empty', state: {} });
          hostEl = leaf.view.containerEl;
          hostEl.empty();
          hostEl.style.padding = '0';
          hostEl.style.margin = '0';
          hostEl.style.width = '100%';
          hostEl.style.height = '100%';
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

        api.setState(savedState);

        let dirty = false;
        let btnSaveClose = null;
        const setDirty = (value) => {
          dirty = value;
          if (btnSaveClose) btnSaveClose.textContent = dirty ? 'Salva e chiudi*' : 'Salva e chiudi';
        };

        const scheduleSave = (nextState) => {
          draftState = nextState;
          setDirty(true);
        };

        api.subscribe(scheduleSave);

        const controls = document.createElement('div');
        controls.style.display = 'flex';
        controls.style.gap = '8px';
        controls.style.padding = '10px';
        controls.style.background = 'rgba(0,0,0,0.35)';
        controls.style.borderBottom = '1px solid rgba(255,255,255,0.08)';

        btnSaveClose = document.createElement('button');
        btnSaveClose.textContent = 'Salva e chiudi';
        btnSaveClose.addEventListener('click', async () => {
          try {
            const latest = api.getState ? api.getState() : draftState;
            savedState = latest;
            parsed = savedState;
          } catch {}
          try {
            await persistSafe(savedState, false);
            setDirty(false);
          } catch (e) {
            console.error(e);
            new Notice('VolleyBoard: impossibile salvare (vedi console)');
          }
          if (editorIframe) editorIframe.remove();
          controls.remove();
          if (editorLeaf) {
            editorLeaf.detach();
            editorLeaf = null;
          }
          editorOpen = false;
          // Refresh snapshot after save
          if (wrapper.isConnected) {
            snap.style.display = '';
            await renderSnapshot();
          }
        });
        controls.appendChild(btnSaveClose);

        const btnDiscard = document.createElement('button');
        btnDiscard.textContent = 'Annulla';
        btnDiscard.addEventListener('click', async () => {
          if (editorIframe) editorIframe.remove();
          controls.remove();
          if (editorLeaf) {
            editorLeaf.detach();
            editorLeaf = null;
          }
          editorOpen = false;
          draftState = savedState;
          setDirty(false);
          if (wrapper.isConnected) {
            snap.style.display = '';
            await renderSnapshot();
          }
        });
        controls.appendChild(btnDiscard);

        if (hostEl && hostEl !== wrapper) {
          hostEl.prepend(controls);
        } else {
          wrapper.insertBefore(controls, iframe);
        }
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

  async persistState(ctx, originalSource, nextState, opts = {}) {
    const file = ctx.sourcePath ? this.app.vault.getAbstractFileByPath(ctx.sourcePath) : null;
    if (!file) throw new Error('No file from context');

    const text = await this.app.vault.read(file);
    const normalizedText = text.replace(/\r\n/g, '\n');
    const replacement = '```volleyboard\n' + JSON.stringify(nextState, null, 2) + '\n```';
    const stableStringify = (value) => {
      if (value === null || typeof value !== 'object') return JSON.stringify(value);
      if (Array.isArray(value)) return '[' + value.map((v) => stableStringify(v)).join(',') + ']';
      const keys = Object.keys(value).sort();
      return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
    };
    const normalizeJsonForMatch = (jsonText) => {
      try {
        const obj = JSON.parse(jsonText);
        if (obj && typeof obj === 'object' && obj.meta && typeof obj.meta === 'object') {
          const next = { ...obj, meta: { ...obj.meta } };
          delete next.meta.blockId;
          return stableStringify(next);
        }
        return stableStringify(obj);
      } catch {
        return null;
      }
    };

    const section = ctx.getSectionInfo?.(ctx.el);
    if (typeof opts?.blockLineStart !== 'number') {
      const lineStart = (section && typeof section.lineStart === 'number') ? section.lineStart : null;
      if (typeof lineStart === 'number') opts.blockLineStart = lineStart;
    }
    {
      const lines = normalizedText.split('\n');
      const blocks = [];
      let i = 0;
      while (i < lines.length) {
        const openLine = lines[i];
        const openTrim = openLine.trim();
        if (openTrim === '```volleyboard') {
          const start = i;
          const indent = openLine.match(/^(\s*)/)?.[1] ?? '';
          i += 1;
          const contentStart = i;
          while (i < lines.length && lines[i].trim() !== '```') i += 1;
          const end = Math.min(i, lines.length - 1);
          const content = lines.slice(contentStart, end).map((line) => {
            if (indent && line.startsWith(indent)) return line.slice(indent.length);
            return line;
          }).join('\n').trim();
          let parsedId = null;
          let parsedNorm = null;
          try {
            const parsedObj = JSON.parse(content);
            parsedId = parsedObj?.meta?.blockId ?? null;
            parsedNorm = normalizeJsonForMatch(content);
          } catch {}
          blocks.push({ start, end, content, indent, parsedId, parsedNorm });
        }
        i += 1;
      }
      let match = null;
      const blockId = opts?.blockId;
      const originalNorm = normalizeJsonForMatch(originalSource || '');
      if (blockId) {
        for (const b of blocks) {
          if (b.parsedId === blockId) { match = b; break; }
        }
        if (!match && opts?.strict && typeof opts?.blockLineStart === 'number') {
          const line = opts.blockLineStart;
          const candidate = blocks.find((b) => line >= b.start && line <= b.end);
          if (candidate) {
            const candidateId = candidate.parsedId;
            if (candidateId && candidateId !== blockId) {
              throw new Error('VolleyBoard: blockId not found');
            }
            match = candidate;
          }
        }
        if (!match && opts?.strict) {
          const candidate = originalNorm ? blocks.find((b) => b.parsedNorm && b.parsedNorm === originalNorm) : null;
          if (candidate) {
            const candidateId = candidate.parsedId;
            if (candidateId && candidateId !== blockId) {
              throw new Error('VolleyBoard: blockId not found');
            }
            match = candidate;
          }
        }
        if (!match && opts?.strict) throw new Error('VolleyBoard: blockId not found');
      }
      if (!match && opts?.forceLineStart && typeof opts?.blockLineStart === 'number') {
        const line = opts.blockLineStart;
        match = blocks.find((b) => line >= b.start && line <= b.end);
        if (!match && opts?.strict) throw new Error('VolleyBoard: block line not found');
      }
      if (!match && typeof opts?.blockLineStart === 'number') {
        const line = opts.blockLineStart;
        match = blocks.find((b) => line >= b.start && line <= b.end);
      }
      if (!match && !opts?.strict) {
        const norm = (s) => (s || '').trim();
        const target = norm(originalSource);
        match = blocks.find((b) => norm(b.content) === target);
      }
      if (match) {
        const replLines = replacement.split('\n').map((line) => (match.indent ? `${match.indent}${line}` : line));
        lines.splice(match.start, match.end - match.start + 1, ...replLines);
        await this.app.vault.modify(file, lines.join('\n'));
        return;
      }
    }

    const re = /```volleyboard\s*([\s\S]*?)```/m;
    const m = text.match(re);
    if (!m) throw new Error('No volleyboard block found');
    const nextText = text.replace(re, replacement);
    await this.app.vault.modify(file, nextText);
  }
}

module.exports = VolleyBoardPlugin;
