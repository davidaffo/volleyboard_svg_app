(() => {
  'use strict';

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  // Coordinate system: court in logical units: width=18, height=9.
  // SVG viewBox includes some margin: [-1,-1] -> [20,11]
  const COURT_W = 18;
  const COURT_H = 9;

  const DEFAULT_STATE = () => ({
    version: 1,
    meta: { createdAt: new Date().toISOString() },
    view: { x: -1, y: -1, w: 20, h: 11 }, // viewBox
    notes: '',
    layers: { players: true, ball: true, drawings: true, text: true },
    objects: [], // {id,type,team,x,y,role,label,style,...}
    drawings: [], // {id,type,path,team,style}
    texts: [], // {id,type,x,y,text,team,style}
    ball: { id: 'ball', x: 9, y: 4.5, visible: true },
    selection: null,
  });

  const ID = () => 'id_' + Math.random().toString(16).slice(2) + '_' + Date.now().toString(16);

  const TEAMS = [
    { id: 'A', name: 'Squadra A' },
    { id: 'B', name: 'Squadra B' },
  ];

  const ROLES = [
    { id: 'S', name: 'Palleggiatore (S)' },
    { id: 'OH', name: 'Schiacciatore (OH)' },
    { id: 'MB', name: 'Centrale (MB)' },
    { id: 'OP', name: 'Opposto (OP)' },
    { id: 'L', name: 'Libero (L)' },
    { id: 'X', name: 'Altro (X)' },
  ];

  // Undo/redo
  const history = [];
  const future = [];
  const pushHistory = (state) => {
    history.push(JSON.stringify(state));
    if (history.length > 200) history.shift();
    future.length = 0;
  };
  const undo = () => {
    if (history.length <= 1) return null;
    const cur = history.pop();
    future.push(cur);
    return JSON.parse(history[history.length - 1]);
  };
  const redo = () => {
    if (future.length === 0) return null;
    const next = future.pop();
    history.push(next);
    return JSON.parse(next);
  };

  // Mode
  const MODE = {
    SELECT: 'select',
    ARROW: 'arrow',
    TEXT: 'text',
    PAN: 'pan',
  };

  let state = DEFAULT_STATE();
  pushHistory(state);

  const stage = $('#stage');
  const inspector = $('#inspector');
  const notesEl = $('#notes');
  const statObjects = $('#statObjects');
  const chipMode = $('#chipMode');
  const chipZoom = $('#chipZoom');

  // Build SVG
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'vb');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('viewBox', `${state.view.x} ${state.view.y} ${state.view.w} ${state.view.h}`);
  svg.setAttribute('role', 'img');
  svg.style.touchAction = 'none';

  const defs = document.createElementNS(svgNS, 'defs');
  defs.innerHTML = `
    <marker id="arrowHead" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"></path>
    </marker>
    <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0.35" stdDeviation="0.35" flood-color="rgba(0,0,0,.55)"/>
    </filter>
    <symbol id="playerSymbol" viewBox="-0.6 -0.6 1.2 1.2">
      <circle cx="0" cy="0" r="0.5" fill="currentColor"></circle>
      <circle cx="-0.18" cy="-0.18" r="0.08" fill="rgba(255,255,255,.25)"></circle>
    </symbol>
  `;
  svg.appendChild(defs);

  const gCourt = document.createElementNS(svgNS, 'g');
  const gDrawings = document.createElementNS(svgNS, 'g');
  const gPlayers = document.createElementNS(svgNS, 'g');
  const gBall = document.createElementNS(svgNS, 'g');
  const gText = document.createElementNS(svgNS, 'g');

  gCourt.setAttribute('id', 'court');
  gDrawings.setAttribute('id', 'drawings');
  gPlayers.setAttribute('id', 'players');
  gBall.setAttribute('id', 'ballLayer');
  gText.setAttribute('id', 'textLayer');

  svg.appendChild(gCourt);
  svg.appendChild(gDrawings);
  svg.appendChild(gPlayers);
  svg.appendChild(gBall);
  svg.appendChild(gText);

  stage.appendChild(svg);

  // Court drawing
  function drawCourt() {
    gCourt.innerHTML = '';
    const court = (tag, attrs={}) => {
      const el = document.createElementNS(svgNS, tag);
      for (const [k,v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      gCourt.appendChild(el);
      return el;
    };

    // Background
    court('rect', { x: 0, y: 0, width: COURT_W, height: COURT_H, rx: 0.4, fill: 'rgba(255,255,255,0.03)' });
    // Border
    court('rect', { x: 0, y: 0, width: COURT_W, height: COURT_H, fill: 'none', stroke: 'rgba(255,255,255,0.20)', 'stroke-width': 0.08 });

    // Midline and net
    court('line', { x1: COURT_W/2, y1: 0, x2: COURT_W/2, y2: COURT_H, stroke: 'rgba(255,255,255,0.20)', 'stroke-width': 0.08 });
    court('rect', { x: COURT_W/2 - 0.06, y: 0, width: 0.12, height: COURT_H, fill: 'rgba(94,234,212,0.10)' });

    // 3m lines
    court('line', { x1: 3, y1: 0, x2: 3, y2: COURT_H, stroke: 'rgba(255,255,255,0.14)', 'stroke-width': 0.06, 'stroke-dasharray': '0.25 0.25' });
    court('line', { x1: COURT_W-3, y1: 0, x2: COURT_W-3, y2: COURT_H, stroke: 'rgba(255,255,255,0.14)', 'stroke-width': 0.06, 'stroke-dasharray': '0.25 0.25' });

    // Zones labels (tiny)
    const label = (x,y,t) => {
      const el = document.createElementNS(svgNS, 'text');
      el.setAttribute('x', x);
      el.setAttribute('y', y);
      el.setAttribute('font-size', '0.5');
      el.setAttribute('fill', 'rgba(255,255,255,0.18)');
      el.setAttribute('text-anchor', 'middle');
      el.textContent = t;
      gCourt.appendChild(el);
    };
    // Optional rotation hints
    label(1.5, 1.0, '4');
    label(1.5, 4.8, '3');
    label(1.5, 8.5, '2');
    label(COURT_W-1.5, 1.0, '5');
    label(COURT_W-1.5, 4.8, '6');
    label(COURT_W-1.5, 8.5, '1');
  }

  drawCourt();

  // Helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function setViewBox(v) {
    state.view = v;
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    const zoom = 20 / v.w;
    chipZoom.textContent = `Zoom: ${Math.round(zoom*100)}%`;
  }

  function applyLayerVisibility() {
    gPlayers.style.display = state.layers.players ? '' : 'none';
    gBall.style.display = state.layers.ball ? '' : 'none';
    gDrawings.style.display = state.layers.drawings ? '' : 'none';
    gText.style.display = state.layers.text ? '' : 'none';
  }

  function teamColor(teamId) {
    // Use currentColor on elements; we set style color on group/items
    return teamId === 'A' ? 'rgba(94,234,212,0.95)' : 'rgba(244,114,182,0.95)';
  }

  function objById(id) {
    if (!id) return null;
    if (id === 'ball') return state.ball;
    return state.objects.find(o => o.id === id)
      || state.drawings.find(d => d.id === id)
      || state.texts.find(t => t.id === id);
  }

  function setSelection(id) {
    state.selection = id;
    render();
  }

  function svgPointFromClient(clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const inv = ctm.inverse();
    const p = pt.matrixTransform(inv);
    return { x: p.x, y: p.y };
  }

  // Rendering
  function renderPlayers() {
    gPlayers.innerHTML = '';
    for (const o of state.objects) {
      if (o.type !== 'player') continue;

      const g = document.createElementNS(svgNS, 'g');
      g.setAttribute('data-id', o.id);
      g.setAttribute('transform', `translate(${o.x} ${o.y})`);
      g.style.color = teamColor(o.team);
      g.style.cursor = 'grab';

      const use = document.createElementNS(svgNS, 'use');
      use.setAttribute('href', '#playerSymbol');
      use.setAttribute('filter', 'url(#softShadow)');
      g.appendChild(use);

      const txt = document.createElementNS(svgNS, 'text');
      txt.setAttribute('x', '0');
      txt.setAttribute('y', '0.16');
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('font-size', '0.38');
      txt.setAttribute('fill', 'rgba(0,0,0,0.75)');
      txt.style.pointerEvents = 'none';
      txt.textContent = o.label || '';
      g.appendChild(txt);

      const badge = document.createElementNS(svgNS, 'text');
      badge.setAttribute('x', '0');
      badge.setAttribute('y', '-0.62');
      badge.setAttribute('text-anchor', 'middle');
      badge.setAttribute('font-size', '0.28');
      badge.setAttribute('fill', 'rgba(255,255,255,0.8)');
      badge.style.pointerEvents = 'none';
      badge.textContent = o.role || '';
      g.appendChild(badge);

      if (state.selection === o.id) {
        const sel = document.createElementNS(svgNS, 'circle');
        sel.setAttribute('cx', '0');
        sel.setAttribute('cy', '0');
        sel.setAttribute('r', '0.62');
        sel.setAttribute('fill', 'none');
        sel.setAttribute('stroke', 'rgba(255,255,255,0.65)');
        sel.setAttribute('stroke-width', '0.06');
        sel.style.pointerEvents = 'none';
        g.insertBefore(sel, use);
      }

      gPlayers.appendChild(g);
    }
  }

  function renderBall() {
    gBall.innerHTML = '';
    if (!state.ball.visible) return;

    const g = document.createElementNS(svgNS, 'g');
    g.setAttribute('data-id', 'ball');
    g.setAttribute('transform', `translate(${state.ball.x} ${state.ball.y})`);
    g.style.cursor = 'grab';

    const c = document.createElementNS(svgNS, 'circle');
    c.setAttribute('cx', '0');
    c.setAttribute('cy', '0');
    c.setAttribute('r', '0.22');
    c.setAttribute('fill', 'rgba(255,255,255,0.85)');
    c.setAttribute('stroke', 'rgba(0,0,0,0.35)');
    c.setAttribute('stroke-width', '0.04');
    c.setAttribute('filter', 'url(#softShadow)');
    g.appendChild(c);

    if (state.selection === 'ball') {
      const sel = document.createElementNS(svgNS, 'circle');
      sel.setAttribute('cx', '0');
      sel.setAttribute('cy', '0');
      sel.setAttribute('r', '0.36');
      sel.setAttribute('fill', 'none');
      sel.setAttribute('stroke', 'rgba(255,255,255,0.65)');
      sel.setAttribute('stroke-width', '0.06');
      sel.style.pointerEvents = 'none';
      g.appendChild(sel);
    }

    gBall.appendChild(g);
  }

  function renderDrawings() {
    gDrawings.innerHTML = '';
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
      p.style.color = teamColor(d.team);
      p.style.cursor = 'pointer';
      p.setAttribute('opacity', d.style?.opacity ?? '0.9');

      if (state.selection === d.id) {
        p.setAttribute('stroke-width', '0.18');
        p.setAttribute('opacity', '1');
      }

      gDrawings.appendChild(p);
    }
  }

  function renderTexts() {
    gText.innerHTML = '';
    for (const t of state.texts) {
      const el = document.createElementNS(svgNS, 'text');
      el.setAttribute('data-id', t.id);
      el.setAttribute('x', t.x);
      el.setAttribute('y', t.y);
      el.setAttribute('font-size', t.style?.size ?? '0.55');
      el.setAttribute('fill', 'currentColor');
      el.style.color = teamColor(t.team);
      el.style.cursor = 'grab';
      el.textContent = t.text;

      if (state.selection === t.id) {
        const bb = document.createElementNS(svgNS, 'rect');
        // We'll add bbox after append
        gText.appendChild(el);
        const box = el.getBBox();
        bb.setAttribute('x', box.x - 0.2);
        bb.setAttribute('y', box.y - 0.2);
        bb.setAttribute('width', box.width + 0.4);
        bb.setAttribute('height', box.height + 0.4);
        bb.setAttribute('fill', 'none');
        bb.setAttribute('stroke', 'rgba(255,255,255,0.55)');
        bb.setAttribute('stroke-width', '0.06');
        bb.style.pointerEvents = 'none';
        gText.insertBefore(bb, el);
      } else {
        gText.appendChild(el);
      }
    }
  }

  function renderInspector() {
    const sel = state.selection ? objById(state.selection) : null;
    inspector.innerHTML = '';
    if (!sel) {
      inspector.innerHTML = `<div class="muted">Nessuna selezione</div>`;
      return;
    }

    const row = (label, inputEl) => {
      const r = document.createElement('div');
      r.className = 'row';
      const l = document.createElement('div');
      l.className = 'label';
      l.textContent = label;
      const w = document.createElement('div');
      w.appendChild(inputEl);
      r.appendChild(l);
      r.appendChild(w);
      inspector.appendChild(r);
    };

    const type = sel.type || (sel.id === 'ball' ? 'ball' : 'unknown');
    const typeEl = document.createElement('div');
    typeEl.className = 'muted';
    typeEl.textContent = `Tipo: ${type}`;
    inspector.appendChild(typeEl);

    if (type === 'player') {
      const labelInput = document.createElement('input');
      labelInput.value = sel.label || '';
      labelInput.addEventListener('input', () => { sel.label = labelInput.value; commit(); });
      row('Numero', labelInput);

      const roleSel = document.createElement('select');
      for (const r of ROLES) {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.name;
        roleSel.appendChild(opt);
      }
      roleSel.value = sel.role || 'X';
      roleSel.addEventListener('change', () => { sel.role = roleSel.value; commit(); });
      row('Ruolo', roleSel);

      const teamSel = document.createElement('select');
      for (const t of TEAMS) {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        teamSel.appendChild(opt);
      }
      teamSel.value = sel.team || 'A';
      teamSel.addEventListener('change', () => { sel.team = teamSel.value; commit(); });
      row('Squadra', teamSel);

      const del = document.createElement('button');
      del.className = 'btn btnDanger';
      del.textContent = 'Elimina';
      del.type = 'button';
      del.addEventListener('click', () => { removeSelected(); });
      inspector.appendChild(del);
    }

    if (type === 'arrow') {
      const teamSel = document.createElement('select');
      for (const t of TEAMS) {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        teamSel.appendChild(opt);
      }
      teamSel.value = sel.team || 'A';
      teamSel.addEventListener('change', () => { sel.team = teamSel.value; commit(); });
      row('Squadra', teamSel);

      const opacity = document.createElement('input');
      opacity.type = 'number';
      opacity.min = '0.1';
      opacity.max = '1';
      opacity.step = '0.1';
      opacity.value = sel.style?.opacity ?? 0.9;
      opacity.addEventListener('input', () => {
        sel.style = sel.style || {};
        sel.style.opacity = String(clamp(Number(opacity.value)||0.9, 0.1, 1));
        commit();
      });
      row('Opacità', opacity);

      const del = document.createElement('button');
      del.className = 'btn btnDanger';
      del.textContent = 'Elimina';
      del.type = 'button';
      del.addEventListener('click', () => { removeSelected(); });
      inspector.appendChild(del);
    }

    if (type === 'text') {
      const txt = document.createElement('input');
      txt.value = sel.text || '';
      txt.addEventListener('input', () => { sel.text = txt.value; commit(); });
      row('Testo', txt);

      const size = document.createElement('input');
      size.type = 'number';
      size.min = '0.2';
      size.max = '1.2';
      size.step = '0.05';
      size.value = sel.style?.size ?? 0.55;
      size.addEventListener('input', () => {
        sel.style = sel.style || {};
        sel.style.size = String(clamp(Number(size.value)||0.55, 0.2, 1.2));
        commit();
      });
      row('Dimensione', size);

      const teamSel = document.createElement('select');
      for (const t of TEAMS) {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        teamSel.appendChild(opt);
      }
      teamSel.value = sel.team || 'A';
      teamSel.addEventListener('change', () => { sel.team = teamSel.value; commit(); });
      row('Squadra', teamSel);

      const del = document.createElement('button');
      del.className = 'btn btnDanger';
      del.textContent = 'Elimina';
      del.type = 'button';
      del.addEventListener('click', () => { removeSelected(); });
      inspector.appendChild(del);
    }

    if (type === 'ball') {
      const vis = document.createElement('button');
      vis.className = 'btn';
      vis.textContent = state.ball.visible ? 'Nascondi palla' : 'Mostra palla';
      vis.type = 'button';
      vis.addEventListener('click', () => { state.ball.visible = !state.ball.visible; commit(); });
      inspector.appendChild(vis);
    }
  }

  function renderStats() {
    statObjects.textContent = String(state.objects.length + state.drawings.length + state.texts.length + (state.ball.visible?1:0));
  }

  function render() {
    notesEl.value = state.notes || '';
    applyLayerVisibility();
    setViewBox(state.view);
    renderCourtSelectionHint();
    renderDrawings();
    renderPlayers();
    renderBall();
    renderTexts();
    renderInspector();
    renderStats();
  }

  function renderCourtSelectionHint() {
    // mode chip
    const m = state.mode || MODE.SELECT;
    const label = m === MODE.SELECT ? 'Selezione' : (m === MODE.ARROW ? 'Frecce' : (m === MODE.TEXT ? 'Testo' : 'Pan'));
    chipMode.textContent = `Modalità: ${label}`;
  }

  function commit() {
    pushHistory(state);
    render();
  }

  function replaceState(next) {
    state = next;
    if (!state.view) state.view = { x:-1, y:-1, w:20, h:11 };
    if (!state.layers) state.layers = { players:true, ball:true, drawings:true, text:true };
    if (!state.objects) state.objects = [];
    if (!state.drawings) state.drawings = [];
    if (!state.texts) state.texts = [];
    if (!state.ball) state.ball = { id:'ball', x:9, y:4.5, visible:true };
    pushHistory(state);
    render();
  }

  // Object creation
  function addPlayer(team='A', x= team==='A' ? 4 : 14, y=4.5, label='') {
    state.objects.push({ id: ID(), type:'player', team, x, y, role:'X', label });
    commit();
  }

  function toggleBall() {
    state.ball.visible = !state.ball.visible;
    if (state.ball.visible) state.selection = 'ball';
    commit();
  }

  function addTextAt(x,y, text='Testo', team='A') {
    state.texts.push({ id: ID(), type:'text', x, y, text, team, style:{ size:'0.55' } });
    commit();
  }

  function removeSelected() {
    const id = state.selection;
    if (!id) return;
    if (id === 'ball') { state.ball.visible = false; state.selection = null; commit(); return; }
    state.objects = state.objects.filter(o => o.id !== id);
    state.drawings = state.drawings.filter(d => d.id !== id);
    state.texts = state.texts.filter(t => t.id !== id);
    state.selection = null;
    commit();
  }

  // Presets
  function presetEmpty() {
    state.objects = [];
    state.drawings = [];
    state.texts = [];
    state.ball = { id:'ball', x:9, y:4.5, visible:true };
    state.selection = null;
    commit();
  }

  function preset6v6() {
    presetEmpty();
    // Rough positions in rotation layout
    // Team A (left side)
    const A = [
      {x: 2.0, y: 7.8, n:'1'},
      {x: 2.0, y: 4.5, n:'6'},
      {x: 2.0, y: 1.2, n:'5'},
      {x: 6.0, y: 1.2, n:'4'},
      {x: 6.0, y: 4.5, n:'3'},
      {x: 6.0, y: 7.8, n:'2'},
    ];
    const B = [
      {x: 16.0, y: 7.8, n:'1'},
      {x: 16.0, y: 4.5, n:'6'},
      {x: 16.0, y: 1.2, n:'5'},
      {x: 12.0, y: 1.2, n:'4'},
      {x: 12.0, y: 4.5, n:'3'},
      {x: 12.0, y: 7.8, n:'2'},
    ];
    for (const p of A) state.objects.push({ id: ID(), type:'player', team:'A', x:p.x, y:p.y, role:'X', label:p.n });
    for (const p of B) state.objects.push({ id: ID(), type:'player', team:'B', x:p.x, y:p.y, role:'X', label:p.n });
    state.ball = { id:'ball', x:9, y:4.5, visible:true };
    commit();
  }

  function preset3v3() {
    presetEmpty();
    const A = [{x:3.0,y:2.0,n:'A1'},{x:3.0,y:7.0,n:'A2'},{x:6.0,y:4.5,n:'A3'}];
    const B = [{x:15.0,y:2.0,n:'B1'},{x:15.0,y:7.0,n:'B2'},{x:12.0,y:4.5,n:'B3'}];
    for (const p of A) state.objects.push({ id: ID(), type:'player', team:'A', x:p.x, y:p.y, role:'X', label:p.n });
    for (const p of B) state.objects.push({ id: ID(), type:'player', team:'B', x:p.x, y:p.y, role:'X', label:p.n });
    commit();
  }

  function presetSideout() {
    preset6v6();
    // Add some common arrows (receive -> set -> attack)
    const d1 = `M 1.8 7.8 C 3.5 7.0 4.8 6.2 6.2 5.4`;
    const d2 = `M 6.2 5.4 C 7.0 4.8 7.8 4.5 8.7 4.2`;
    state.drawings.push({ id: ID(), type:'arrow', team:'A', path:d1, style:{ width:'0.12', opacity:'0.9' } });
    state.drawings.push({ id: ID(), type:'arrow', team:'A', path:d2, style:{ width:'0.12', opacity:'0.9' } });
    commit();
  }

  function presetBreakpoint() {
    preset6v6();
    // Block/defense arrows on Team B side
    const d1 = `M 11.8 4.5 C 10.5 4.5 9.8 4.5 9.2 4.5`;
    const d2 = `M 12.0 1.2 C 10.8 2.5 10.2 3.5 9.2 4.5`;
    state.drawings.push({ id: ID(), type:'arrow', team:'B', path:d1, style:{ width:'0.12', opacity:'0.9' } });
    state.drawings.push({ id: ID(), type:'arrow', team:'B', path:d2, style:{ width:'0.12', opacity:'0.9' } });
    commit();
  }

  function rotatePlayers() {
    // Rotate labels 1..6 within each team (simple: reassign labels by nearest rotation spots)
    const spotsA = [
      {x: 2.0, y: 7.8, lab:'1'},
      {x: 2.0, y: 4.5, lab:'6'},
      {x: 2.0, y: 1.2, lab:'5'},
      {x: 6.0, y: 1.2, lab:'4'},
      {x: 6.0, y: 4.5, lab:'3'},
      {x: 6.0, y: 7.8, lab:'2'},
    ];
    const spotsB = [
      {x: 16.0, y: 7.8, lab:'1'},
      {x: 16.0, y: 4.5, lab:'6'},
      {x: 16.0, y: 1.2, lab:'5'},
      {x: 12.0, y: 1.2, lab:'4'},
      {x: 12.0, y: 4.5, lab:'3'},
      {x: 12.0, y: 7.8, lab:'2'},
    ];
    const assign = (team, spots) => {
      const players = state.objects.filter(o => o.type==='player' && o.team===team);
      if (players.length === 0) return;
      // Map player to closest spot
      const closest = (p) => {
        let best = null, bestD = Infinity;
        for (const s of spots) {
          const dx = p.x - s.x, dy = p.y - s.y;
          const d = dx*dx + dy*dy;
          if (d < bestD) { bestD = d; best = s; }
        }
        return best;
      };
      const map = new Map();
      for (const p of players) map.set(p.id, closest(p));

      // Extract label mapping and rotate
      const bySpot = new Map();
      for (const p of players) {
        const s = map.get(p.id);
        const key = s.lab;
        bySpot.set(key, p);
      }
      const order = ['1','6','5','4','3','2']; // rotation path for left team when receiving? It's a simple cycle.
      const nextLabel = {};
      for (let i=0;i<order.length;i++){
        const cur = order[i];
        const nxt = order[(i+1)%order.length];
        nextLabel[cur] = nxt;
      }
      for (const [lab,p] of bySpot.entries()) {
        p.label = nextLabel[lab] || p.label;
      }
    };
    assign('A', spotsA);
    assign('B', spotsB);
    commit();
  }

  // Modes and actions
  state.mode = MODE.SELECT;

  function setMode(m) {
    state.mode = m;
    render();
  }

  // Toolbar buttons
  $('#btnAddPlayer').addEventListener('click', () => {
    // Add to the side closer to current selection/team if possible
    const sel = state.selection ? objById(state.selection) : null;
    const team = (sel && sel.team) ? sel.team : 'A';
    const x = team === 'A' ? 4 : 14;
    addPlayer(team, x, 4.5, '');
  });

  $('#btnAddBall').addEventListener('click', () => toggleBall());

  $('#btnArrow').addEventListener('click', () => {
    setMode(state.mode === MODE.ARROW ? MODE.SELECT : MODE.ARROW);
  });

  $('#btnText').addEventListener('click', () => {
    setMode(state.mode === MODE.TEXT ? MODE.SELECT : MODE.TEXT);
  });

  $('#btnRotate').addEventListener('click', () => rotatePlayers());
  $('#btnUndo').addEventListener('click', () => { const s = undo(); if (s) replaceState(s); });
  $('#btnRedo').addEventListener('click', () => { const s = redo(); if (s) replaceState(s); });

  $('#btnReset').addEventListener('click', () => { replaceState(DEFAULT_STATE()); });

  // Import/Export dialogs
  const dlgIO = $('#dlgIO');
  const dlgTitle = $('#dlgTitle');
  const ioText = $('#ioText');
  const btnIOMain = $('#btnIOMain');

  function openExport() {
    dlgTitle.textContent = 'Export JSON';
    ioText.value = JSON.stringify(state, null, 2);
    btnIOMain.textContent = 'Copia';
    btnIOMain.onclick = async (e) => {
      e.preventDefault();
      try { await navigator.clipboard.writeText(ioText.value); } catch {}
      dlgIO.close();
    };
    dlgIO.showModal();
    ioText.focus();
    ioText.select();
  }

  function openImport() {
    dlgTitle.textContent = 'Import JSON';
    ioText.value = '';
    btnIOMain.textContent = 'Importa';
    btnIOMain.onclick = (e) => {
      e.preventDefault();
      try {
        const next = JSON.parse(ioText.value);
        replaceState(next);
        dlgIO.close();
      } catch (err) {
        alert('JSON non valido');
      }
    };
    dlgIO.showModal();
    ioText.focus();
  }

  $('#btnExport').addEventListener('click', () => openExport());
  $('#btnImport').addEventListener('click', () => openImport());

  // Notes binding
  notesEl.addEventListener('input', () => { state.notes = notesEl.value; commit(); });

  // Preset buttons
  $$('.presetGrid .btn').forEach(b => {
    b.addEventListener('click', () => {
      const p = b.getAttribute('data-preset');
      if (p === 'empty') presetEmpty();
      if (p === '6v6') preset6v6();
      if (p === '3v3') preset3v3();
      if (p === 'sideout') presetSideout();
      if (p === 'breakpoint') presetBreakpoint();
    });
  });

  // Context menu dialog
  const dlgMenu = $('#dlgMenu');
  const menuGrid = $('#menuGrid');
  function openMenuForSelection() {
    const sel = state.selection ? objById(state.selection) : null;
    menuGrid.innerHTML = '';
    const add = (label, fn, cls='btn') => {
      const b = document.createElement('button');
      b.className = cls;
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', () => { fn(); dlgMenu.close(); });
      menuGrid.appendChild(b);
    };
    if (!sel) {
      add('Aggiungi giocatore A', () => addPlayer('A', 4, 4.5, ''), 'btn');
      add('Aggiungi giocatore B', () => addPlayer('B', 14, 4.5, ''), 'btn');
      add('Aggiungi testo', () => { setMode(MODE.TEXT); }, 'btn');
      add('Frecce', () => { setMode(MODE.ARROW); }, 'btn');
      add('Reset', () => replaceState(DEFAULT_STATE()), 'btn btnDanger');
      dlgMenu.showModal();
      return;
    }
    if (sel.type === 'player') {
      add('Duplica', () => { state.objects.push({ ...sel, id: ID(), x: sel.x+0.6, y: sel.y+0.6 }); commit(); }, 'btn');
      add('Cambia squadra', () => { sel.team = sel.team === 'A' ? 'B' : 'A'; commit(); }, 'btn');
      add('Elimina', () => removeSelected(), 'btn btnDanger');
    } else if (sel.type === 'arrow') {
      add('Cambia squadra', () => { sel.team = sel.team === 'A' ? 'B' : 'A'; commit(); }, 'btn');
      add('Elimina', () => removeSelected(), 'btn btnDanger');
    } else if (sel.type === 'text') {
      add('Modifica testo', () => {
        const t = prompt('Testo:', sel.text || '');
        if (t !== null) { sel.text = t; commit(); }
      }, 'btn');
      add('Cambia squadra', () => { sel.team = sel.team === 'A' ? 'B' : 'A'; commit(); }, 'btn');
      add('Elimina', () => removeSelected(), 'btn btnDanger');
    } else if (sel.id === 'ball') {
      add(state.ball.visible ? 'Nascondi palla' : 'Mostra palla', () => { state.ball.visible = !state.ball.visible; commit(); }, 'btn');
    }
    dlgMenu.showModal();
  }

  // Interaction: pointer events for drag, arrow drawing, pan
  let activePointerId = null;
  let drag = null; // {id, startX,startY, objStartX,objStartY}
  let arrowDraft = null; // {team, start, cur, pathEl}
  let longPressTimer = null;
  let spaceDown = false;

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { spaceDown = true; setMode(MODE.PAN); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      const s = undo(); if (s) replaceState(s);
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      const s = redo(); if (s) replaceState(s);
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (document.activeElement && ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return;
      removeSelected();
    }
    if (e.key === 'Escape') { setMode(MODE.SELECT); }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') { spaceDown = false; setMode(MODE.SELECT); }
  });

  function hitTestTarget(el) {
    if (!el) return null;
    const id = el.getAttribute?.('data-id') || el.closest?.('[data-id]')?.getAttribute('data-id');
    return id || null;
  }

  function startLongPress() {
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      openMenuForSelection();
    }, 520);
  }

  function cancelLongPress() {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    activePointerId = e.pointerId;

    const pt = svgPointFromClient(e.clientX, e.clientY);
    const targetId = hitTestTarget(e.target);
    const mode = state.mode;

    startLongPress();

    if (spaceDown || mode === MODE.PAN) {
      drag = { type:'pan', startClientX: e.clientX, startClientY: e.clientY, startView: { ...state.view } };
      cancelLongPress();
      return;
    }

    if (mode === MODE.ARROW) {
      cancelLongPress();
      const sel = state.selection ? objById(state.selection) : null;
      const team = (sel && sel.team) ? sel.team : 'A';
      arrowDraft = { team, start: pt, cur: pt };
      // temp path
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

    if (mode === MODE.TEXT) {
      cancelLongPress();
      addTextAt(pt.x, pt.y, 'Testo', 'A');
      setMode(MODE.SELECT);
      return;
    }

    // select/drag objects
    if (targetId) {
      cancelLongPress();
      setSelection(targetId);
      const obj = objById(targetId);
      if (!obj) return;
      // start drag
      if (targetId === 'ball') {
        drag = { type:'move', id:'ball', start: pt, startObj: { x: state.ball.x, y: state.ball.y } };
      } else if (obj.type === 'player' || obj.type === 'text') {
        drag = { type:'move', id: targetId, start: pt, startObj: { x: obj.x, y: obj.y } };
      }
      return;
    }

    // click on empty court => clear selection
    setSelection(null);
  });

  svg.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activePointerId) return;
    const pt = svgPointFromClient(e.clientX, e.clientY);

    // cancel long press if moved a bit
    if (longPressTimer && drag) cancelLongPress();

    if (drag?.type === 'pan') {
      cancelLongPress();
      const dx = (e.clientX - drag.startClientX) * (state.view.w / svg.clientWidth);
      const dy = (e.clientY - drag.startClientY) * (state.view.h / svg.clientHeight);
      setViewBox({ x: drag.startView.x - dx, y: drag.startView.y - dy, w: drag.startView.w, h: drag.startView.h });
      state.view = { x: drag.startView.x - dx, y: drag.startView.y - dy, w: drag.startView.w, h: drag.startView.h };
      return;
    }

    if (arrowDraft) {
      arrowDraft.cur = pt;
      const mx = (arrowDraft.start.x + pt.x) / 2;
      const my = (arrowDraft.start.y + pt.y) / 2;
      const d = `M ${arrowDraft.start.x} ${arrowDraft.start.y} Q ${mx} ${my} ${pt.x} ${pt.y}`;
      arrowDraft.pathEl.setAttribute('d', d);
      return;
    }

    if (drag?.type === 'move') {
      cancelLongPress();
      const id = drag.id;
      const dx = pt.x - drag.start.x;
      const dy = pt.y - drag.start.y;
      if (id === 'ball') {
        state.ball.x = clamp(drag.startObj.x + dx, 0, COURT_W);
        state.ball.y = clamp(drag.startObj.y + dy, 0, COURT_H);
      } else {
        const obj = objById(id);
        if (obj) {
          obj.x = clamp(drag.startObj.x + dx, 0, COURT_W);
          obj.y = clamp(drag.startObj.y + dy, 0, COURT_H);
        }
      }
      render();
      return;
    }
  });

  svg.addEventListener('pointerup', (e) => {
    if (e.pointerId !== activePointerId) return;
    cancelLongPress();
    svg.releasePointerCapture(e.pointerId);
    activePointerId = null;

    if (arrowDraft) {
      const pt = arrowDraft.cur;
      const s = arrowDraft.start;
      const dist = Math.hypot(pt.x - s.x, pt.y - s.y);
      gDrawings.removeChild(arrowDraft.pathEl);
      if (dist > 0.35) {
        const mx = (s.x + pt.x) / 2;
        const my = (s.y + pt.y) / 2;
        const d = `M ${s.x} ${s.y} Q ${mx} ${my} ${pt.x} ${pt.y}`;
        state.drawings.push({ id: ID(), type:'arrow', team: arrowDraft.team, path: d, style:{ width:'0.12', opacity:'0.9' } });
        state.selection = state.drawings[state.drawings.length - 1].id;
        commit();
      } else {
        render();
      }
      arrowDraft = null;
      return;
    }

    if (drag) {
      if (drag.type === 'move') commit();
      if (drag.type === 'pan') commit();
      drag = null;
    }
  });

  svg.addEventListener('pointercancel', () => {
    cancelLongPress();
    arrowDraft = null;
    drag = null;
    activePointerId = null;
    render();
  });

  // Click selection for drawings
  svg.addEventListener('click', (e) => {
    const id = hitTestTarget(e.target);
    if (!id) return;
    const obj = objById(id);
    if (obj && (obj.type === 'arrow' || obj.type === 'text')) {
      setSelection(id);
    }
  }, true);

  // Wheel zoom (desktop). Use Alt+wheel for zoom, wheel alone scrolls page.
  svg.addEventListener('wheel', (e) => {
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
  }, { passive: false });

  // Tap on empty to set text mode quickly if T is active
  svg.addEventListener('dblclick', (e) => {
    const pt = svgPointFromClient(e.clientX, e.clientY);
    if (hitTestTarget(e.target)) return;
    addTextAt(pt.x, pt.y, 'Testo', 'A');
    setSelection(state.texts[state.texts.length - 1].id);
  });

  // Hit test empty long press to open general menu
  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openMenuForSelection();
  });

  // Select drawings by clicking them (they are paths)
  gDrawings.addEventListener('pointerdown', (e) => {
    const id = hitTestTarget(e.target);
    if (id) setSelection(id);
  }, true);

  gPlayers.addEventListener('pointerdown', (e) => {
    const id = hitTestTarget(e.target);
    if (id) setSelection(id);
  }, true);

  gText.addEventListener('pointerdown', (e) => {
    const id = hitTestTarget(e.target);
    if (id) setSelection(id);
  }, true);

  // Save/load to localStorage for web usage
  const LS_KEY = 'volleyboard_state_v1';
  function saveLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
  }
  function loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      replaceState(JSON.parse(raw));
      return true;
    } catch { return false; }
  }
  window.addEventListener('beforeunload', saveLocal);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveLocal(); });

  // Selection / delete with long press via menu
  // Auto-load state
  if (!loadLocal()) render();

  // Auto commit after first render to have baseline
  pushHistory(state);

})();