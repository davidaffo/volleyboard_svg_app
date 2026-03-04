/*
  AUTO-GENERATED FILE
  Source of truth: docs/index.html, docs/style.css, docs/app.js
  Regenerate with: node scripts/sync-plugin.js
*/
const { Plugin, Notice, Modal } = require('obsidian');
const fs = require('fs');
const path = require('path');

const WEB_HTML = __WEB_HTML__;
const WEB_CSS = __WEB_CSS__;
const WEB_JS = __WEB_JS__;
const EXCALIFONT_DATA_URI = (() => {
  try {
    const fromCss = WEB_CSS.match(/src:\s*url\((['"]?)(data:font\/woff2;base64,[^)"']+)\1\)\s*format\(['"]woff2['"]\)/i);
    if (fromCss && fromCss[2]) return fromCss[2];
  } catch {}
  try {
    const fontPath = path.join(__dirname, 'assets', 'Excalifont-Regular.woff2');
    const raw = fs.readFileSync(fontPath);
    return `data:font/woff2;base64,${raw.toString('base64')}`;
  } catch {
    return '';
  }
})();

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

function injectSnapshotFont(svgText) {
  if (!svgText || !EXCALIFONT_DATA_URI) return svgText;
  const styleTag = `<style>@font-face{font-family:"Excalifont";src:url("${EXCALIFONT_DATA_URI}") format("woff2");font-weight:400;font-style:normal;font-display:swap;}text,tspan{font-family:"Excalifont","Comic Sans MS","Marker Felt","Bradley Hand","Segoe Print",cursive !important;}</style>`;
  if (/<defs(\s|>)/i.test(svgText)) {
    return svgText.replace(/<defs(\s[^>]*)?>/i, (m) => `${m}${styleTag}`);
  }
  return svgText.replace(/<svg(\s[^>]*)?>/i, (m) => `${m}<defs>${styleTag}</defs>`);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyLineOnlyToSvg(svgEl) {
  if (!svgEl) return;
  const teamTone = (el) => {
    const t = el?.closest?.('[data-team]')?.getAttribute?.('data-team');
    return t === 'B' ? '#666' : '#111';
  };
  svgEl.querySelectorAll('[fill]').forEach((el) => {
    if (el.getAttribute('data-arrow-head') === '1') {
      el.setAttribute('fill', teamTone(el));
      el.setAttribute('stroke', 'none');
      return;
    }
    if (el.classList?.contains('vb-player-base')) {
      el.setAttribute('fill', '#fff');
      el.setAttribute('stroke', teamTone(el));
      return;
    }
    const v = String(el.getAttribute('fill') || '').trim().toLowerCase();
    if (v && v !== 'none') el.setAttribute('fill', 'none');
  });
  svgEl.querySelectorAll('[stroke]').forEach((el) => {
    el.setAttribute('stroke', teamTone(el));
  });
  svgEl.querySelectorAll('text, tspan').forEach((el) => {
    el.setAttribute('fill', teamTone(el));
    el.setAttribute('stroke', 'none');
  });
}

class VolleyBoardPdfModal extends Modal {
  constructor(app, items, onSubmit) {
    super(app);
    this.items = items.map((item, idx) => ({ ...item, enabled: true, order: idx + 1 }));
    this.onSubmit = onSubmit;
    this.dragIndex = null;
    this.columns = 2;
    this.gapMm = 6;
    this.marginMm = 10;
    this.orientation = 'portrait';
    this.lineOnly = false;
    this.fitOnePage = true;
    this.previewEl = null;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Stampa VolleyBoard (A4)' });

    const controls = contentEl.createDiv();
    controls.style.display = 'grid';
    controls.style.gridTemplateColumns = 'repeat(6, minmax(0, 1fr))';
    controls.style.gap = '8px';
    controls.style.marginBottom = '12px';

    const columnsWrap = controls.createDiv();
    columnsWrap.createEl('div', { text: 'Colonne griglia' });
    const columnsSel = columnsWrap.createEl('select');
    [1, 2, 3, 4].forEach((n) => {
      const opt = document.createElement('option');
      opt.value = String(n);
      opt.textContent = String(n);
      if (n === this.columns) opt.selected = true;
      columnsSel.appendChild(opt);
    });

    const gapWrap = controls.createDiv();
    gapWrap.createEl('div', { text: 'Spazio tra board (mm)' });
    const gapInput = gapWrap.createEl('input');
    gapInput.type = 'number';
    gapInput.min = '0';
    gapInput.max = '30';
    gapInput.step = '1';
    gapInput.value = String(this.gapMm);

    const marginWrap = controls.createDiv();
    marginWrap.createEl('div', { text: 'Margine pagina (mm)' });
    const marginInput = marginWrap.createEl('input');
    marginInput.type = 'number';
    marginInput.min = '0';
    marginInput.max = '30';
    marginInput.step = '1';
    marginInput.value = String(this.marginMm);
    marginInput.addEventListener('input', () => { this.marginMm = Number(marginInput.value) || 0; });

    const orientWrap = controls.createDiv();
    orientWrap.createEl('div', { text: 'Orientamento' });
    const orientSel = orientWrap.createEl('select');
    [{ v: 'portrait', t: 'Portrait' }, { v: 'landscape', t: 'Landscape' }].forEach((it) => {
      const opt = document.createElement('option');
      opt.value = it.v;
      opt.textContent = it.t;
      if (it.v === this.orientation) opt.selected = true;
      orientSel.appendChild(opt);
    });
    orientSel.addEventListener('change', () => { this.orientation = orientSel.value || 'portrait'; });

    const styleWrap = controls.createDiv();
    styleWrap.createEl('div', { text: 'Stile stampa' });
    const styleLine = styleWrap.createEl('label');
    styleLine.style.display = 'flex';
    styleLine.style.alignItems = 'center';
    styleLine.style.gap = '6px';
    const styleLineCb = styleLine.createEl('input');
    styleLineCb.type = 'checkbox';
    styleLineCb.checked = this.lineOnly;
    styleLine.createSpan({ text: 'Solo linee (B/N)' });
    styleLineCb.addEventListener('change', () => {
      this.lineOnly = styleLineCb.checked;
      this.renderPreviewGrid();
    });

    const fitWrap = controls.createDiv();
    fitWrap.createEl('div', { text: 'Impaginazione' });
    const fitLbl = fitWrap.createEl('label');
    fitLbl.style.display = 'flex';
    fitLbl.style.alignItems = 'center';
    fitLbl.style.gap = '6px';
    const fitCb = fitLbl.createEl('input');
    fitCb.type = 'checkbox';
    fitCb.checked = this.fitOnePage;
    fitLbl.createSpan({ text: 'Adatta a 1 pagina' });
    fitCb.addEventListener('change', () => { this.fitOnePage = fitCb.checked; });

    columnsSel.addEventListener('change', () => {
      this.columns = Number(columnsSel.value) || 2;
      this.renderPreviewGrid();
    });
    gapInput.addEventListener('input', () => {
      this.gapMm = Number(gapInput.value) || 0;
      this.renderPreviewGrid();
    });

    contentEl.createEl('div', { text: 'Anteprima griglia A4 (trascina i riquadri: header + board si muovono insieme).' });
    this.previewEl = contentEl.createDiv();
    this.previewEl.style.maxHeight = '56vh';
    this.previewEl.style.overflow = 'auto';
    this.previewEl.style.marginTop = '8px';
    this.previewEl.style.border = '1px solid var(--background-modifier-border)';
    this.previewEl.style.borderRadius = '8px';
    this.previewEl.style.padding = '10px';
    this.renderPreviewGrid();

    const actions = contentEl.createDiv();
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '8px';
    actions.style.marginTop = '12px';

    const cancelBtn = actions.createEl('button', { text: 'Annulla' });
    cancelBtn.addEventListener('click', () => this.close());

    const printBtn = actions.createEl('button', { text: 'Esporta PDF' });
    printBtn.addClass('mod-cta');
    printBtn.addEventListener('click', async () => {
      const payload = {
        items: this.items,
        columns: this.columns,
        gapMm: this.gapMm,
        marginMm: this.marginMm,
        orientation: this.orientation,
        lineOnly: this.lineOnly,
        fitOnePage: this.fitOnePage,
      };
      this.close();
      await this.onSubmit(payload);
    });
  }

  renderPreviewGrid() {
    if (!this.previewEl) return;
    this.previewEl.empty();

    const grid = this.previewEl.createDiv();
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = `repeat(${Math.max(1, this.columns)}, minmax(0, 1fr))`;
    grid.style.gridAutoFlow = 'row';
    grid.style.gap = `${Math.max(0, this.gapMm * 3)}px`;

    this.items.forEach((item, idx) => {
      const card = grid.createDiv();
      card.style.border = '1px solid var(--background-modifier-border)';
      card.style.borderRadius = '8px';
      card.style.padding = '8px';
      card.style.background = 'var(--background-primary)';
      card.style.display = 'grid';
      card.style.gap = '6px';
      card.draggable = true;
      card.style.opacity = item.enabled === false ? '0.55' : '1';

      const top = card.createDiv();
      top.style.display = 'grid';
      top.style.gridTemplateColumns = '20px 1fr auto';
      top.style.alignItems = 'center';
      top.style.gap = '6px';

      const include = top.createEl('input');
      include.type = 'checkbox';
      include.checked = item.enabled !== false;
      include.addEventListener('change', () => {
        item.enabled = include.checked;
        this.renderPreviewGrid();
      });

      const label = top.createDiv();
      const title = item.header ? item.header : `VolleyBoard ${idx + 1}`;
      label.textContent = `${idx + 1}. ${title}`;
      label.style.fontWeight = '600';
      label.style.fontSize = '12px';
      label.style.whiteSpace = 'nowrap';
      label.style.overflow = 'hidden';
      label.style.textOverflow = 'ellipsis';

      const move = top.createDiv({ text: '↕' });
      move.style.fontSize = '12px';
      move.style.opacity = '0.7';
      move.style.textAlign = 'right';

      const board = card.createDiv();
      board.style.lineHeight = '0';
      board.style.borderRadius = '6px';
      board.style.overflow = 'hidden';
      board.style.border = '1px solid var(--background-modifier-border)';
      board.innerHTML = item.svg || '';
      const svgEl = board.querySelector('svg');
      if (svgEl) {
        svgEl.style.display = 'block';
        svgEl.style.width = '100%';
        svgEl.style.height = 'auto';
        if (this.lineOnly) applyLineOnlyToSvg(svgEl);
      }

      card.addEventListener('dragstart', (e) => {
        this.dragIndex = idx;
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragover', (e) => e.preventDefault());
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        if (this.dragIndex == null || this.dragIndex === idx) return;
        const moved = this.items.splice(this.dragIndex, 1)[0];
        this.items.splice(idx, 0, moved);
        this.dragIndex = null;
        this.renderPreviewGrid();
      });
      card.addEventListener('dragend', () => { this.dragIndex = null; });
    });
  }
}

class VolleyBoardPlugin extends Plugin {
  async onload() {
    this.registerMarkdownCodeBlockProcessor('volleyboard', async (source, el, ctx) => {
      el.empty();
      const wrapper = el.createDiv({ cls: 'vb-obsidian-wrapper' });
      const style = document.createElement('style');
      style.textContent = `
        ${EXCALIFONT_DATA_URI ? `@font-face{font-family:"Excalifont";src:url("${EXCALIFONT_DATA_URI}") format("woff2");font-weight:400;font-style:normal;font-display:swap;}` : ''}
        .vb-obsidian-wrapper{display:block;}
        .vb-snapshot{display:inline-block;line-height:0;border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,.08);box-shadow:0 10px 30px rgba(0,0,0,.35);width:520px;max-width:100%;}
        .vb-snapshot svg{display:block;width:100% !important;height:auto !important;max-width:100% !important;}
        .vb-snapshot text,.vb-snapshot tspan{font-family:"Excalifont","Comic Sans MS","Marker Felt","Bradley Hand","Segoe Print",cursive !important;}
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
        snap.innerHTML = injectSnapshotFont(svg);
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

    this.addCommand({
      id: 'export-volleyboard-a4-pdf',
      name: 'VolleyBoard: Export A4 PDF from current note',
      callback: async () => {
        await this.exportVolleyBoardsFromActiveFile();
      }
    });
  }

  onunload() {}

  async exportVolleyBoardsFromActiveFile() {
    const file = this.app.workspace.getActiveFile?.();
    if (!file) {
      new Notice('VolleyBoard: nessun file attivo.');
      return;
    }
    const text = await this.app.vault.read(file);
    const blocks = this.extractVolleyboardBlocks(text);
    if (!blocks.length) {
      new Notice('VolleyBoard: nessun blocco volleyboard trovato nella nota.');
      return;
    }
    const blocksWithSvg = await this.buildBoardSnapshots(blocks);
    if (!blocksWithSvg.length) {
      new Notice('VolleyBoard: impossibile generare l\'anteprima delle board.');
      return;
    }
    const modal = new VolleyBoardPdfModal(this.app, blocksWithSvg, async (config) => {
      await this.printVolleyBoardsPdf(config, file.basename);
    });
    modal.open();
  }

  extractVolleyboardBlocks(text) {
    const normalized = String(text || '').replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    const blocks = [];
    let i = 0;
    while (i < lines.length) {
      if (lines[i].trim() !== '```volleyboard') {
        i += 1;
        continue;
      }
      const start = i;
      i += 1;
      const contentStart = i;
      while (i < lines.length && lines[i].trim() !== '```') i += 1;
      const end = Math.min(i, lines.length - 1);
      const jsonText = lines.slice(contentStart, end).join('\n').trim();
      const header = this.findHeaderAbove(lines, start);
      blocks.push({
        id: `vb_${start}_${end}_${blocks.length}`,
        header,
        jsonText,
      });
      i += 1;
    }
    return blocks;
  }

  findHeaderAbove(lines, fromLine) {
    for (let i = fromLine - 1; i >= 0; i -= 1) {
      const t = String(lines[i] || '').trim();
      if (!t) continue;
      const m = t.match(/^(#{1,6})\s+(.+)$/);
      if (m) return m[2].trim();
      if (t.startsWith('```')) return '';
    }
    return '';
  }

  async buildBoardSnapshots(items) {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.position = 'absolute';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.srcdoc = buildSrcDoc();
    document.body.appendChild(iframe);
    try {
      const api = await waitForApi(iframe);
      if (!api) throw new Error('init failed');
      const out = [];
      for (const item of items) {
        if (item.enabled === false) continue;
        let parsed = null;
        try {
          parsed = JSON.parse(item.jsonText || '{}');
        } catch {
          continue;
        }
        if (!parsed || typeof parsed !== 'object') continue;
        api.setState(parsed);
        const svg = api.exportSvg ? api.exportSvg() : '';
        if (!svg) continue;
        out.push({
          ...item,
          svg: injectSnapshotFont(svg),
        });
      }
      return out;
    } finally {
      iframe.remove();
    }
  }

  async printVolleyBoardsPdf(config, filenameBase) {
    const snapshots = (config.items || []).filter((it) => it.enabled !== false && it.svg);
    if (!snapshots.length) {
      new Notice('VolleyBoard: nessuna board selezionata.');
      return;
    }
    const html = this.buildPdfHtml(snapshots, config, filenameBase);
    const directOk = await this.exportPdfDirect(html, config, filenameBase);
    if (directOk) return;
    try {
      await this.printHtmlInIframe(html);
      new Notice('VolleyBoard: export diretto non disponibile, aperta finestra di stampa.');
    } catch (e) {
      console.error(e);
      new Notice('VolleyBoard: impossibile aprire la stampa.');
    }
  }

  buildPdfHtml(snapshots, config, filenameBase) {
    const columns = Math.max(1, Math.min(4, Number(config.columns) || 2));
    const gapMm = Math.max(0, Math.min(30, Number(config.gapMm) || 0));
    const marginMm = Math.max(0, Math.min(30, Number(config.marginMm) || 0));
    const orientation = String(config.orientation || 'portrait') === 'landscape' ? 'landscape' : 'portrait';
    const lineOnly = !!config.lineOnly;
    const fitOnePage = config.fitOnePage !== false;
    const pageHeightMm = orientation === 'landscape' ? 210 : 297;
    const rows = Math.max(1, Math.ceil(snapshots.length / columns));
    const metaMm = 10;
    const usableHeightMm = Math.max(20, pageHeightMm - (marginMm * 2) - metaMm);
    const rowHeightMm = Math.max(10, ((usableHeightMm - (gapMm * (rows - 1))) / rows) * 0.96);
    const now = new Date().toLocaleString();
    const cards = snapshots.map((item, idx) => {
      const title = escapeHtml(item.header || `VolleyBoard ${idx + 1}`);
      return `<article class="card"><h3>${title}</h3><div class="board">${item.svg}</div></article>`;
    }).join('\n');
    const lineOnlyCss = lineOnly ? `
    .board svg [fill]:not([fill="none"]):not([data-arrow-head="1"]):not(.vb-player-base) { fill: none !important; }
    .board svg [stroke] { stroke: #111 !important; }
    .board svg [data-arrow-head="1"] { fill: #111 !important; stroke: none !important; }
    .board svg .vb-player-base { fill: #fff !important; stroke: #111 !important; }
    .board svg [data-team="B"] [stroke] { stroke: #666 !important; }
    .board svg [data-team="B"] [data-arrow-head="1"] { fill: #666 !important; stroke: none !important; }
    .board svg [data-team="B"] text, .board svg [data-team="B"] tspan { fill: #666 !important; }
    .board svg [data-team="B"] .vb-player-base { fill: #fff !important; stroke: #666 !important; }
    .board svg text, .board svg tspan {
      fill: #111 !important;
      stroke: none !important;
    }` : '';
    const fitCss = fitOnePage ? `
    body { height: ${Math.max(20, usableHeightMm + metaMm)}mm; overflow: hidden; }
    .meta { margin: 0 0 2mm 0; }
    .grid { max-height: ${Math.max(10, usableHeightMm)}mm; overflow: hidden; grid-auto-rows: ${rowHeightMm}mm; }
    .card { height: ${rowHeightMm}mm; display: grid; grid-template-rows: auto 1fr; overflow: hidden; }
    .board { min-height: 0; }
    .board svg { width: 100% !important; height: 100% !important; object-fit: contain; }` : '';
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(filenameBase || 'volleyboard')} - PDF</title>
  <style>
    @page { size: A4 ${orientation}; margin: ${marginMm}mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: "Inter", "Segoe UI", Arial, sans-serif; }
    .meta { margin: 0 0 5mm 0; font-size: 11px; color: #666; }
    .grid { display: grid; grid-template-columns: repeat(${columns}, minmax(0, 1fr)); grid-auto-flow: row; gap: ${gapMm}mm; align-items: start; }
    .card { break-inside: avoid; border: 1px solid #d9d9d9; border-radius: 8px; padding: 3mm; }
    .card h3 { margin: 0 0 2mm 0; font-size: 12px; line-height: 1.2; }
    .board { width: 100%; line-height: 0; }
    .board svg { width: 100% !important; height: auto !important; display: block; }
    .board text, .board tspan {
      font-family: "Excalifont","Comic Sans MS","Marker Felt","Bradley Hand","Segoe Print",cursive !important;
    }
    ${lineOnlyCss}
    ${fitCss}
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <p class="meta">${escapeHtml(filenameBase || 'Nota')} · ${escapeHtml(now)}</p>
  <section class="grid">${cards}</section>
</body>
</html>`;
  }

  async exportPdfDirect(html, config, filenameBase) {
    try {
      let remote = null;
      try { remote = require('@electron/remote'); } catch {}
      if (!remote || !remote.BrowserWindow || !remote.dialog) return false;

      const BrowserWindow = remote.BrowserWindow;
      const dialog = remote.dialog;
      const win = new BrowserWindow({
        show: false,
        width: 1280,
        height: 900,
        webPreferences: {
          sandbox: false,
          contextIsolation: false,
          nodeIntegration: false,
        },
      });
      try {
        await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        const pdfBuffer = await win.webContents.printToPDF({
          pageSize: 'A4',
          landscape: String(config.orientation || 'portrait') === 'landscape',
          printBackground: !config.lineOnly,
          marginsType: 1,
          preferCSSPageSize: true,
        });
        const active = this.app.workspace.getActiveFile?.();
        const base = String(filenameBase || 'volleyboard').trim() || 'volleyboard';
        const defaultName = `${base}.pdf`;
        let defaultPath = defaultName;
        try {
          const root = this.app.vault.adapter.getBasePath?.();
          if (root) {
            const folder = active?.parent?.path || '';
            defaultPath = path.join(root, folder, defaultName);
          }
        } catch {}
        const saveRes = await dialog.showSaveDialog(remote.getCurrentWindow?.(), {
          title: 'Salva PDF VolleyBoard',
          defaultPath,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
          properties: ['showOverwriteConfirmation'],
        });
        if (saveRes?.canceled || !saveRes?.filePath) return true;
        fs.writeFileSync(saveRes.filePath, pdfBuffer);
        new Notice(`VolleyBoard: PDF salvato in ${saveRes.filePath}`);
        return true;
      } finally {
        win.destroy();
      }
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  async printHtmlInIframe(html) {
    await new Promise((resolve, reject) => {
      const frame = document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.right = '0';
      frame.style.bottom = '0';
      frame.style.width = '1px';
      frame.style.height = '1px';
      frame.style.opacity = '0';
      frame.style.pointerEvents = 'none';
      const cleanup = () => {
        if (frame.parentNode) frame.parentNode.removeChild(frame);
      };
      frame.onload = () => {
        setTimeout(() => {
          try {
            const w = frame.contentWindow;
            if (!w) throw new Error('print frame unavailable');
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              cleanup();
              resolve();
            };
            w.onafterprint = finish;
            w.focus();
            w.print();
            setTimeout(finish, 1200);
          } catch (err) {
            cleanup();
            reject(err);
          }
        }, 200);
      };
      try {
        frame.srcdoc = html;
        document.body.appendChild(frame);
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  }

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
