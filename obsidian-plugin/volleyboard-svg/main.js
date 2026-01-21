
/*
  VolleyBoard SVG - Obsidian plugin (no build step)
  - Markdown codeblock: ```volleyboard { ...json... }
  - Renders interactive board in reading view
  - Provides command: "Insert VolleyBoard block"
  Note: This plugin keeps everything client-side; state is stored as JSON in the code block.
*/
const { Plugin, MarkdownPostProcessorContext, Notice } = require('obsidian');

function escapeHtml(s){ return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }

class VolleyBoardPlugin extends Plugin {
  async onload() {
    this.registerMarkdownCodeBlockProcessor('volleyboard', async (source, el, ctx) => {
      el.empty();
      const wrapper = el.createDiv({ cls: 'vb-obsidian-wrapper' });

      let parsed = null;
      try { parsed = JSON.parse(source.trim() || '{}'); } catch { parsed = null; }
      if (!parsed) {
        wrapper.createEl('div', { text: 'VolleyBoard: JSON non valido.', cls: 'vb-error' });
        return;
      }

      // Create an iframe-like sandbox using a shadow root for isolation
      const host = wrapper.createDiv({ cls: 'vb-host' });
      const shadow = host.attachShadow({ mode: 'open' });

      const style = document.createElement('style');
      style.textContent = `${VOLLEY_CSS}\n.vb-obsidian-note{font-size:12px;color:rgba(255,255,255,.6)}\n`;
      shadow.appendChild(style);

      const container = document.createElement('div');
      container.className = 'vb-container';
      shadow.appendChild(container);

      // Toolbar (minimal) + stage
      container.innerHTML = VOLLEY_HTML;

      // Mount app
      const api = mountVolleyBoard(container, parsed, async (nextState) => {
        // Persist back into the code block by editing the markdown file
        try {
          await this.persistState(ctx, source, nextState);
          new Notice('VolleyBoard: salvato');
        } catch (e) {
          console.error(e);
          new Notice('VolleyBoard: impossibile salvare (vedi console)');
        }
      });

      // In case user wants to export quickly
      const exportBtn = shadow.getElementById('vbExport');
      exportBtn.addEventListener('click', () => {
        const data = JSON.stringify(api.getState(), null, 2);
        navigator.clipboard.writeText(data).then(() => new Notice('VolleyBoard: JSON copiato')).catch(()=>{});
      });
    });

    this.addCommand({
      id: 'insert-volleyboard-block',
      name: 'Insert VolleyBoard block',
      editorCallback: (editor) => {
        const block = "```volleyboard\n" + JSON.stringify(DEFAULT_STATE(), null, 2) + "\n```\n";
        editor.replaceSelection(block);
      }
    });
  }

  onunload() {}

  async persistState(ctx, originalSource, nextState) {
    const file = ctx.sourcePath ? this.app.vault.getAbstractFileByPath(ctx.sourcePath) : null;
    if (!file) throw new Error('No file from context');

    const text = await this.app.vault.read(file);
    // Replace the first matching volleyboard block that matches the original source.
    // We use a forgiving approach: replace the first volleyboard block in the file.
    const re = /```volleyboard\s*([\s\S]*?)```/m;
    const m = text.match(re);
    if (!m) throw new Error('No volleyboard block found');
    const replacement = "```volleyboard\n" + JSON.stringify(nextState, null, 2) + "\n```";
    const nextText = text.replace(re, replacement);
    await this.app.vault.modify(file, nextText);
  }
}

// Shared web UI embedded
const VOLLEY_HTML = `
  <div class="vbTop">
    <div class="vbTitle">VolleyBoard</div>
    <div class="vbBtns">
      <button class="vbBtn" data-act="addA">+A</button>
      <button class="vbBtn" data-act="addB">+B</button>
      <button class="vbBtn" data-act="ball">⚪</button>
      <button class="vbBtn" data-act="arrow">↗</button>
      <button class="vbBtn" data-act="text">T</button>
      <button class="vbBtn" data-act="undo">↶</button>
      <button class="vbBtn" data-act="redo">↷</button>
      <button class="vbBtn vbBtnPrimary" id="vbExport">Export</button>
    </div>
  </div>
  <div class="vbStage" id="vbStage"></div>
  <div class="vb-obsidian-note">Drag: sposta • Alt+wheel: zoom • Space+drag: pan • Click: seleziona • Delete: elimina</div>
`;

const VOLLEY_CSS = `
  :host{ all: initial; }
  .vb-container{
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial;
    color: #e7eaf0;
    background: radial-gradient(900px 600px at 20% 20%, #12202a 0%, #0d0f12 60%);
    border-radius: 18px;
    border: 1px solid rgba(255,255,255,.08);
    overflow: hidden;
    box-shadow: 0 10px 30px rgba(0,0,0,.35);
    padding: 10px;
  }
  .vbTop{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; }
  .vbTitle{ font-weight:800; letter-spacing:.2px; }
  .vbBtns{ display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
  .vbBtn{
    background: linear-gradient(180deg, rgba(33,42,60,1), rgba(26,33,48,1));
    border: 1px solid rgba(255,255,255,.10);
    color:#e7eaf0;
    padding: 7px 10px;
    border-radius: 12px;
    cursor:pointer;
    user-select:none;
  }
  .vbBtnPrimary{ border-color: rgba(94,234,212,.25); }
  .vbStage{
    height: 480px;
    border-radius: 18px;
    border: 1px solid rgba(255,255,255,.06);
    overflow:hidden;
    background: rgba(255,255,255,.02);
  }
  @media (max-width: 720px){
    .vbStage{ height: 52vh; min-height: 360px; }
  }
  .vb-error{ color: rgba(255,255,255,.75); padding: 8px; }
`;

// Core app logic (adapted from web app, simplified UI, exposes getState + setState)
const COURT_W = 18, COURT_H = 9;
const MODE = { SELECT:'select', ARROW:'arrow', TEXT:'text', PAN:'pan' };
const svgNS = 'http://www.w3.org/2000/svg';
const ID = () => 'id_' + Math.random().toString(16).slice(2) + '_' + Date.now().toString(16);

function DEFAULT_STATE(){
  return {
    version: 1,
    meta: { createdAt: new Date().toISOString() },
    view: { x: -1, y: -1, w: 20, h: 11 },
    layers: { players: true, ball: true, drawings: true, text: true },
    objects: [],
    drawings: [],
    texts: [],
    ball: { id: 'ball', x: 9, y: 4.5, visible: false },
    selection: null,
    mode: MODE.SELECT,
  };
}

function mountVolleyBoard(root, initialState, onSave) {
  let state = normalizeState(structuredClone(initialState || DEFAULT_STATE()));
  const history = [JSON.stringify(state)];
  const future = [];
  const stage = root.querySelector('#vbStage');

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('viewBox', `${state.view.x} ${state.view.y} ${state.view.w} ${state.view.h}`);
  svg.style.touchAction = 'none';
  stage.appendChild(svg);

  const defs = document.createElementNS(svgNS, 'defs');
  defs.innerHTML = `
    <marker id="arrowHead" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"></path>
    </marker>
    <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0.35" stdDeviation="0.35" flood-color="rgba(0,0,0,.55)"/>
    </filter>
  `;
  svg.appendChild(defs);

  const gCourt = document.createElementNS(svgNS, 'g');
  const gDrawings = document.createElementNS(svgNS, 'g');
  const gPlayers = document.createElementNS(svgNS, 'g');
  const gBall = document.createElementNS(svgNS, 'g');
  const gText = document.createElementNS(svgNS, 'g');
  svg.appendChild(gCourt); svg.appendChild(gDrawings); svg.appendChild(gPlayers); svg.appendChild(gBall); svg.appendChild(gText);

  function teamColor(teamId){ return teamId === 'A' ? 'rgba(94,234,212,0.95)' : 'rgba(244,114,182,0.95)'; }
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

  function normalizeState(s){
    if (!s || typeof s !== 'object') return DEFAULT_STATE();
    if (!s.view) s.view = {x:-1,y:-1,w:20,h:11};
    if (!s.layers) s.layers = {players:true, ball:true, drawings:true, text:true};
    if (!Array.isArray(s.objects)) s.objects = [];
    if (!Array.isArray(s.drawings)) s.drawings = [];
    if (!Array.isArray(s.texts)) s.texts = [];
    if (!s.ball) s.ball = {id:'ball',x:9,y:4.5,visible:false};
    if (!('mode' in s)) s.mode = MODE.SELECT;
    return s;
  }

  function setViewBox(v){
    state.view = v;
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
  }

  function svgPointFromClient(clientX, clientY){
    const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
    const ctm = svg.getScreenCTM(); if (!ctm) return {x:0,y:0};
    const inv = ctm.inverse();
    const p = pt.matrixTransform(inv);
    return { x: p.x, y: p.y };
  }

  function objById(id){
    if (!id) return null;
    if (id === 'ball') return state.ball;
    return state.objects.find(o=>o.id===id) || state.drawings.find(d=>d.id===id) || state.texts.find(t=>t.id===id);
  }

  function pushHistory(){
    history.push(JSON.stringify(state));
    if (history.length > 200) history.shift();
    future.length = 0;
  }

  function commit(save=true){
    pushHistory();
    render();
    if (save) onSave?.(state);
  }

  function drawCourt(){
    gCourt.innerHTML = '';
    const add = (tag, attrs={}) => {
      const el = document.createElementNS(svgNS, tag);
      Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, String(v)));
      gCourt.appendChild(el);
      return el;
    };
    add('rect', { x:0, y:0, width:COURT_W, height:COURT_H, rx:0.4, fill:'rgba(255,255,255,0.03)' });
    add('rect', { x:0, y:0, width:COURT_W, height:COURT_H, fill:'none', stroke:'rgba(255,255,255,0.20)', 'stroke-width':0.08 });
    add('line', { x1:COURT_W/2, y1:0, x2:COURT_W/2, y2:COURT_H, stroke:'rgba(255,255,255,0.20)', 'stroke-width':0.08 });
    add('rect', { x:COURT_W/2 - 0.06, y:0, width:0.12, height:COURT_H, fill:'rgba(94,234,212,0.10)' });
    add('line', { x1:COURT_W/2 - 3, y1:0, x2:COURT_W/2 - 3, y2:COURT_H, stroke:'rgba(255,255,255,0.14)', 'stroke-width':0.06, 'stroke-dasharray':'0.25 0.25' });
    add('line', { x1:COURT_W/2 + 3, y1:0, x2:COURT_W/2 + 3, y2:COURT_H, stroke:'rgba(255,255,255,0.14)', 'stroke-width':0.06, 'stroke-dasharray':'0.25 0.25' });
  }

  function renderPlayers(){
    gPlayers.innerHTML = '';
    if (!state.layers.players) return;
    for (const o of state.objects) {
      if (o.type !== 'player') continue;
      const g = document.createElementNS(svgNS, 'g');
      g.setAttribute('data-id', o.id);
      g.setAttribute('transform', `translate(${o.x} ${o.y})`);
      g.style.color = teamColor(o.team || 'A');
      g.style.cursor = 'grab';

      const base = document.createElementNS(svgNS, 'circle');
      base.setAttribute('cx', '0'); base.setAttribute('cy', '0');
      base.setAttribute('r', '0.3');
      base.setAttribute('fill', 'currentColor');
      base.setAttribute('filter', 'url(#softShadow)');
      g.appendChild(base);

      const highlight = document.createElementNS(svgNS, 'circle');
      highlight.setAttribute('cx', '-0.1'); highlight.setAttribute('cy', '-0.1');
      highlight.setAttribute('r', '0.045');
      highlight.setAttribute('fill', 'rgba(255,255,255,.25)');
      g.appendChild(highlight);

      const txt = document.createElementNS(svgNS, 'text');
      txt.setAttribute('x', '0'); txt.setAttribute('y', '-0.06');
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('font-size', '0.23');
      txt.setAttribute('fill', 'rgba(255,255,255,0.96)');
      txt.setAttribute('stroke', 'rgba(0,0,0,0.45)');
      txt.setAttribute('stroke-width', '0.03');
      txt.setAttribute('paint-order', 'stroke');
      txt.setAttribute('font-weight', '700');
      txt.style.pointerEvents = 'none';
      txt.textContent = o.label || '';
      g.appendChild(txt);

      if (state.selection === o.id) {
        const sel = document.createElementNS(svgNS, 'circle');
        sel.setAttribute('cx','0'); sel.setAttribute('cy','0'); sel.setAttribute('r','0.4');
        sel.setAttribute('fill','none'); sel.setAttribute('stroke','rgba(255,255,255,0.65)'); sel.setAttribute('stroke-width','0.06');
        sel.style.pointerEvents = 'none';
        g.insertBefore(sel, base);
      }
      gPlayers.appendChild(g);
    }
  }

  function renderBall(){
    gBall.innerHTML = '';
    if (!state.layers.ball) return;
    if (!state.ball?.visible) return;
    const g = document.createElementNS(svgNS, 'g');
    g.setAttribute('data-id', 'ball');
    g.setAttribute('transform', `translate(${state.ball.x} ${state.ball.y})`);
    g.style.cursor = 'grab';
    const c = document.createElementNS(svgNS, 'circle');
    c.setAttribute('cx','0'); c.setAttribute('cy','0'); c.setAttribute('r','0.28');
    c.setAttribute('fill','#f7f1e5');
    c.setAttribute('stroke','#cbb48e');
    c.setAttribute('stroke-width','0.04');
    c.setAttribute('filter','url(#softShadow)');
    g.appendChild(c);

    const highlight = document.createElementNS(svgNS, 'circle');
    highlight.setAttribute('cx','-0.12'); highlight.setAttribute('cy','-0.12'); highlight.setAttribute('r','0.08');
    highlight.setAttribute('fill','rgba(255,255,255,0.5)');
    g.appendChild(highlight);

    const seams = [
      'M -0.2 -0.1 C -0.05 -0.22 0.1 -0.2 0.2 -0.06',
      'M -0.2 0.12 C -0.04 0.0 0.12 0.0 0.2 0.14',
      'M -0.06 -0.24 C 0.04 -0.1 0.04 0.1 -0.04 0.24',
    ];
    for (const d of seams) {
      const s = document.createElementNS(svgNS, 'path');
      s.setAttribute('d', d);
      s.setAttribute('fill', 'none');
      s.setAttribute('stroke', '#d9c7a7');
      s.setAttribute('stroke-width', '0.035');
      s.setAttribute('stroke-linecap', 'round');
      g.appendChild(s);
    }
    if (state.selection === 'ball') {
      const sel = document.createElementNS(svgNS, 'circle');
      sel.setAttribute('cx','0'); sel.setAttribute('cy','0'); sel.setAttribute('r','0.36');
      sel.setAttribute('fill','none'); sel.setAttribute('stroke','rgba(255,255,255,0.65)'); sel.setAttribute('stroke-width','0.06');
      sel.style.pointerEvents = 'none';
      g.appendChild(sel);
    }
    gBall.appendChild(g);
  }

  function renderDrawings(){
    gDrawings.innerHTML = '';
    if (!state.layers.drawings) return;
    for (const d of state.drawings) {
      const p = document.createElementNS(svgNS, 'path');
      p.setAttribute('data-id', d.id);
      p.setAttribute('d', d.path);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', 'currentColor');
      p.setAttribute('stroke-width', d.style?.width ?? '0.12');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      p.setAttribute('marker-end', 'url(#arrowHead)');
      p.setAttribute('opacity', d.style?.opacity ?? '0.9');
      p.style.color = teamColor(d.team || 'A');
      p.style.cursor = 'pointer';
      gDrawings.appendChild(p);
    }
  }

  function renderTexts(){
    gText.innerHTML = '';
    if (!state.layers.text) return;
    for (const t of state.texts) {
      const el = document.createElementNS(svgNS, 'text');
      el.setAttribute('data-id', t.id);
      el.setAttribute('x', t.x);
      el.setAttribute('y', t.y);
      el.setAttribute('font-size', t.style?.size ?? '0.55');
      el.setAttribute('fill', 'currentColor');
      el.style.color = teamColor(t.team || 'A');
      el.style.cursor = 'grab';
      el.textContent = t.text || '';
      gText.appendChild(el);
    }
  }

  function render(){
    setViewBox(state.view);
    drawCourt();
    renderDrawings();
    renderPlayers();
    renderBall();
    renderTexts();
  }

  // Interaction
  let activePointerId = null;
  let drag = null;
  let arrowDraft = null;
  let spaceDown = false;

  window.addEventListener('keydown', (e)=>{
    if (e.code==='Space') { spaceDown = true; state.mode = MODE.PAN; }
    if (e.key==='Delete' || e.key==='Backspace') {
      if (document.activeElement && ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return;
      removeSelected();
    }
  });
  window.addEventListener('keyup', (e)=>{ if (e.code==='Space') { spaceDown = false; state.mode = MODE.SELECT; } });

  function setSelection(id){ state.selection = id; render(); }
  function removeSelected(){
    const id = state.selection;
    if (!id) return;
    if (id==='ball') { state.ball.visible=false; state.selection=null; commit(true); return; }
    state.objects = state.objects.filter(o=>o.id!==id);
    state.drawings = state.drawings.filter(d=>d.id!==id);
    state.texts = state.texts.filter(t=>t.id!==id);
    state.selection=null;
    commit(true);
  }

  function addPlayer(team, x, y){
    state.objects.push({ id: ID(), type:'player', team, x, y, label:'' });
    commit(true);
  }
  function toggleBall(){ state.ball.visible = !state.ball.visible; state.selection = 'ball'; commit(true); }
  function addTextAt(x,y){
    state.texts.push({ id: ID(), type:'text', x, y, text:'Testo', team:'A', style:{ size:'0.55' } });
    state.selection = state.texts[state.texts.length-1].id;
    commit(true);
  }

  function hitId(target){
    return target?.getAttribute?.('data-id') || target?.closest?.('[data-id]')?.getAttribute('data-id') || null;
  }

  svg.addEventListener('pointerdown', (e)=>{
    svg.setPointerCapture(e.pointerId);
    activePointerId = e.pointerId;

    const pt = svgPointFromClient(e.clientX, e.clientY);
    const id = hitId(e.target);

    if (spaceDown || state.mode === MODE.PAN) {
      drag = { type:'pan', startClientX:e.clientX, startClientY:e.clientY, startView:{...state.view} };
      return;
    }

    if (state.mode === MODE.ARROW) {
      const team = (state.selection && objById(state.selection)?.team) ? objById(state.selection).team : 'A';
      arrowDraft = { team, start: pt, cur: pt };
      const pathEl = document.createElementNS(svgNS, 'path');
      pathEl.setAttribute('d', `M ${pt.x} ${pt.y} L ${pt.x} ${pt.y}`);
      pathEl.setAttribute('fill', 'none');
      pathEl.setAttribute('stroke', 'currentColor');
      pathEl.setAttribute('stroke-width', '0.12');
      pathEl.setAttribute('stroke-linecap', 'round');
      pathEl.setAttribute('stroke-linejoin', 'round');
      pathEl.setAttribute('marker-end', 'url(#arrowHead)');
      pathEl.setAttribute('opacity', '0.9');
      pathEl.style.color = teamColor(team);
      pathEl.style.pointerEvents = 'none';
      gDrawings.appendChild(pathEl);
      arrowDraft.pathEl = pathEl;
      return;
    }

    if (state.mode === MODE.TEXT) {
      addTextAt(pt.x, pt.y);
      state.mode = MODE.SELECT;
      return;
    }

    if (id) {
      setSelection(id);
      const obj = objById(id);
      if (id === 'ball') drag = { type:'move', id:'ball', start: pt, startObj:{ x: state.ball.x, y: state.ball.y } };
      else if (obj?.type === 'player' || obj?.type === 'text') drag = { type:'move', id, start: pt, startObj:{ x: obj.x, y: obj.y } };
      return;
    }
    setSelection(null);
  });

  svg.addEventListener('pointermove', (e)=>{
    if (e.pointerId !== activePointerId) return;
    const pt = svgPointFromClient(e.clientX, e.clientY);

    if (drag?.type==='pan') {
      const dx = (e.clientX - drag.startClientX) * (state.view.w / svg.clientWidth);
      const dy = (e.clientY - drag.startClientY) * (state.view.h / svg.clientHeight);
      state.view = { x: drag.startView.x - dx, y: drag.startView.y - dy, w: drag.startView.w, h: drag.startView.h };
      setViewBox(state.view);
      return;
    }

    if (arrowDraft) {
      arrowDraft.cur = pt;
      const mx = (arrowDraft.start.x + pt.x) / 2;
      const my = (arrowDraft.start.y + pt.y) / 2;
      arrowDraft.pathEl.setAttribute('d', `M ${arrowDraft.start.x} ${arrowDraft.start.y} Q ${mx} ${my} ${pt.x} ${pt.y}`);
      return;
    }

    if (drag?.type==='move') {
      const dx = pt.x - drag.start.x;
      const dy = pt.y - drag.start.y;
      if (drag.id === 'ball') {
        state.ball.x = clamp(drag.startObj.x + dx, 0, COURT_W);
        state.ball.y = clamp(drag.startObj.y + dy, 0, COURT_H);
      } else {
        const obj = objById(drag.id);
        if (obj) {
          obj.x = clamp(drag.startObj.x + dx, 0, COURT_W);
          obj.y = clamp(drag.startObj.y + dy, 0, COURT_H);
        }
      }
      render();
    }
  });

  svg.addEventListener('pointerup', (e)=>{
    if (e.pointerId !== activePointerId) return;
    svg.releasePointerCapture(e.pointerId);
    activePointerId = null;

    if (arrowDraft) {
      const pt = arrowDraft.cur, s = arrowDraft.start;
      const dist = Math.hypot(pt.x - s.x, pt.y - s.y);
      gDrawings.removeChild(arrowDraft.pathEl);
      if (dist > 0.35) {
        const mx = (s.x + pt.x) / 2, my = (s.y + pt.y) / 2;
        const d = `M ${s.x} ${s.y} Q ${mx} ${my} ${pt.x} ${pt.y}`;
        state.drawings.push({ id: ID(), type:'arrow', team: arrowDraft.team, path: d, style:{ width:'0.12', opacity:'0.9' } });
        state.selection = state.drawings[state.drawings.length-1].id;
        arrowDraft = null;
        commit(true);
      } else {
        arrowDraft = null;
        render();
      }
      return;
    }

    if (drag) {
      if (drag.type === 'move') commit(true);
      if (drag.type === 'pan') commit(true);
      drag = null;
    }
  });

  svg.addEventListener('wheel', (e)=>{
    if (!e.altKey) return;
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    const factor = delta > 0 ? 1.08 : 0.92;
    const pt = svgPointFromClient(e.clientX, e.clientY);
    const v = state.view;
    const newW = clamp(v.w * factor, 8, 40);
    const newH = newW * (v.h / v.w);
    const rx = (pt.x - v.x) / v.w;
    const ry = (pt.y - v.y) / v.h;
    const nx = pt.x - rx * newW;
    const ny = pt.y - ry * newH;
    state.view = { x: nx, y: ny, w: newW, h: newH };
    setViewBox(state.view);
  }, { passive:false });

  // Toolbar actions
  root.querySelectorAll('.vbBtn[data-act]').forEach(btn => {
    btn.addEventListener('click', () => {
      const act = btn.getAttribute('data-act');
      if (act === 'addA') addPlayer('A', 4, 4.5);
      if (act === 'addB') addPlayer('B', 14, 4.5);
      if (act === 'ball') toggleBall();
      if (act === 'arrow') { state.mode = (state.mode===MODE.ARROW) ? MODE.SELECT : MODE.ARROW; }
      if (act === 'text') { state.mode = (state.mode===MODE.TEXT) ? MODE.SELECT : MODE.TEXT; }
      if (act === 'undo') {
        if (history.length <= 1) return;
        const cur = history.pop();
        future.push(cur);
        state = normalizeState(JSON.parse(history[history.length-1]));
        render();
        onSave?.(state);
      }
      if (act === 'redo') {
        if (future.length === 0) return;
        const nxt = future.pop();
        history.push(nxt);
        state = normalizeState(JSON.parse(nxt));
        render();
        onSave?.(state);
      }
    });
  });

  render();

  return {
    getState: () => state,
    setState: (s) => { state = normalizeState(structuredClone(s)); pushHistory(); render(); },
  };
}

module.exports = VolleyBoardPlugin;
