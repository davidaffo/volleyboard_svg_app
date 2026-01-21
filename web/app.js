(() => {
  'use strict';

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  // Coordinate system: court in logical units: width=18, height=9.
  // SVG viewBox includes some margin: [-1,-1] -> [20,11]
  const COURT_W = 18;
  const COURT_H = 9;

  const LAYOUTS = {
    'full-h': { id: 'full-h', label: 'Campo intero', view: { x: -1, y: -1, w: 20, h: 11 } },
    'full-v': { id: 'full-v', label: 'Campo intero (vert.)', view: { x: -1, y: -1, w: 11, h: 20 } },
    'half': { id: 'half', label: 'Mezzo campo', view: { x: 0, y: 0, w: 9, h: 9 } },
  };

  const DEFAULT_STATE = () => ({
    version: 1,
    meta: { createdAt: new Date().toISOString() },
    layout: 'full-h',
    rotation: 0,
    view: { x: -1, y: -1, w: 20, h: 11 }, // viewBox
    notes: '',
    layers: { players: true, ball: true, drawings: true, text: true },
    objects: [], // {id,type,team,x,y,role,label,style,...}
    drawings: [], // {id,type,path,team,style}
    texts: [], // {id,type,x,y,text,team,style}
    ball: { id: 'ball', x: 9, y: 4.5, visible: false },
    selection: null,
  });

  const ID = () => 'id_' + Math.random().toString(16).slice(2) + '_' + Date.now().toString(16);

  const TEAMS = [
    { id: 'A', name: 'Squadra A' },
    { id: 'B', name: 'Squadra B' },
  ];

  const ROLES = [
    { id: 'P', name: 'Palleggiatore (P)' },
    { id: 'S1', name: 'Schiacciatore 1 (S1)' },
    { id: 'C2', name: 'Centrale 2 (C2)' },
    { id: 'O', name: 'Opposto (O)' },
    { id: 'S2', name: 'Schiacciatore 2 (S2)' },
    { id: 'C1', name: 'Centrale 1 (C1)' },
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
  state.layoutStates = {};
  ensureLayoutState(state.layout);
  bindLayoutState(state.layout);
  pushHistory(state);

  const stage = $('#stage');
  const inspector = $('#inspector');
  const inspectorOverlay = $('#inspectorOverlay');
  const inspectorHandle = $('#inspectorHandle');
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
    <linearGradient id="bgFullH" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f1f2b"></stop>
      <stop offset="100%" stop-color="#0b1218"></stop>
    </linearGradient>
    <linearGradient id="bgFullV" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="#1a1f1a"></stop>
      <stop offset="100%" stop-color="#0e1410"></stop>
    </linearGradient>
    <linearGradient id="bgHalfH" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#1d1612"></stop>
      <stop offset="100%" stop-color="#0e0b0a"></stop>
    </linearGradient>
    <linearGradient id="bgHalfV" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#121625"></stop>
      <stop offset="100%" stop-color="#0b0e19"></stop>
    </linearGradient>
    <clipPath id="clipFull" clipPathUnits="userSpaceOnUse">
      <rect x="0" y="0" width="18" height="9" rx="0.4"></rect>
    </clipPath>
    <clipPath id="clipHalf" clipPathUnits="userSpaceOnUse">
      <rect x="0" y="0" width="9" height="9" rx="0.4"></rect>
    </clipPath>
    <marker id="arrowHead" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"></path>
    </marker>
  `;
  svg.appendChild(defs);

  const gRoot = document.createElementNS(svgNS, 'g');
  const gScene = document.createElementNS(svgNS, 'g');
  const gCourt = document.createElementNS(svgNS, 'g');
  const gDrawings = document.createElementNS(svgNS, 'g');
  const gPlayers = document.createElementNS(svgNS, 'g');
  const gBall = document.createElementNS(svgNS, 'g');
  const gText = document.createElementNS(svgNS, 'g');

  gRoot.setAttribute('id', 'root');
  gScene.setAttribute('id', 'scene');
  gCourt.setAttribute('id', 'court');
  gDrawings.setAttribute('id', 'drawings');
  gPlayers.setAttribute('id', 'players');
  gBall.setAttribute('id', 'ballLayer');
  gText.setAttribute('id', 'textLayer');

  svg.appendChild(gRoot);
  gRoot.appendChild(gScene);
  gScene.appendChild(gCourt);
  gScene.appendChild(gDrawings);
  gScene.appendChild(gPlayers);
  gScene.appendChild(gBall);
  gScene.appendChild(gText);

  stage.appendChild(svg);

  // Court drawing
  function drawCourt() {
    gCourt.innerHTML = '';
    const isHalf = state.layout === 'half';
    const courtW = isHalf ? COURT_W / 2 : COURT_W;
    const netX = isHalf ? courtW : COURT_W / 2;
    const angle = ((state.rotation % 360) + 360) % 360;
    const isVertical = angle === 90 || angle === 270;
    const bgId = state.layout === 'half'
      ? (isVertical ? 'bgHalfV' : 'bgHalfH')
      : (isVertical ? 'bgFullV' : 'bgFullH');
    const court = (tag, attrs={}) => {
      const el = document.createElementNS(svgNS, tag);
      for (const [k,v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      gCourt.appendChild(el);
      return el;
    };

    // Background
    court('rect', { x: 0, y: 0, width: courtW, height: COURT_H, rx: 0.4, fill: `url(#${bgId})` });
    court('rect', { x: 0, y: 0, width: courtW, height: COURT_H, rx: 0.4, fill: 'rgba(255,255,255,0.03)' });
    // Border
    court('rect', { x: 0, y: 0, width: courtW, height: COURT_H, fill: 'none', stroke: 'rgba(255,255,255,0.20)', 'stroke-width': 0.08 });

    // Net (midline for full court, boundary for half court)
    if (!isHalf) {
      court('line', { x1: netX, y1: 0, x2: netX, y2: COURT_H, stroke: 'rgba(255,255,255,0.20)', 'stroke-width': 0.08 });
    }
    court('rect', { x: netX - 0.06, y: 0, width: 0.12, height: COURT_H, fill: 'rgba(94,234,212,0.10)' });

    // 3m lines (3m from net)
    court('line', { x1: netX - 3, y1: 0, x2: netX - 3, y2: COURT_H, stroke: 'rgba(255,255,255,0.14)', 'stroke-width': 0.06, 'stroke-dasharray': '0.25 0.25' });
    if (!isHalf) {
      court('line', { x1: netX + 3, y1: 0, x2: netX + 3, y2: COURT_H, stroke: 'rgba(255,255,255,0.14)', 'stroke-width': 0.06, 'stroke-dasharray': '0.25 0.25' });
    }
  }

  drawCourt();

  // Helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function defaultLayoutState(layoutId) {
    const baseView = LAYOUTS[layoutId]?.view || LAYOUTS['full-h'].view;
    return {
      view: { ...baseView },
      notes: '',
      objects: [],
      drawings: [],
      texts: [],
      ball: { id: 'ball', x: 9, y: 4.5, visible: false },
      selection: null,
    };
  }

  function ensureLayoutState(layoutId) {
    if (!state.layoutStates) state.layoutStates = {};
    if (!state.layoutStates[layoutId]) state.layoutStates[layoutId] = defaultLayoutState(layoutId);
    if (!state.layoutStates[layoutId].view) {
      state.layoutStates[layoutId].view = { ...(LAYOUTS[layoutId]?.view || LAYOUTS['full-h'].view) };
    }
  }

  function bindLayoutState(layoutId) {
    ensureLayoutState(layoutId);
    const ls = state.layoutStates[layoutId];
    const baseView = LAYOUTS[layoutId]?.view || LAYOUTS['full-h'].view;
    const isHalf = layoutId === 'half';
    if (isHalf) {
      ls.view = { ...baseView };
    } else if (!ls.view || ls.view.w > baseView.w * 1.05 || ls.view.h > baseView.h * 1.05) {
      ls.view = { ...baseView };
    }
    state.view = ls.view;
    state.notes = ls.notes || '';
    state.objects = ls.objects || [];
    state.drawings = ls.drawings || [];
    state.texts = ls.texts || [];
    state.ball = ls.ball || { id:'ball', x:9, y:4.5, visible:false };
    state.selection = ls.selection || null;
  }

  function syncLayoutState() {
    const ls = state.layoutStates?.[state.layout];
    if (!ls) return;
    ls.view = state.view;
    ls.notes = state.notes || '';
    ls.selection = state.selection || null;
    ls.ball = state.ball;
  }

  function getBaseView() {
    const isHalf = state.layout === 'half';
    if (isHalf) return LAYOUTS['half'].view;
    const angle = ((state.rotation % 360) + 360) % 360;
    const isVertical = angle === 90 || angle === 270;
    return isVertical ? LAYOUTS['full-v'].view : LAYOUTS['full-h'].view;
  }

  function setViewBox(v) {
    const layout = LAYOUTS[state.layout] || LAYOUTS['full-h'];
    const isHalf = state.layout === 'half';
    const baseView = getBaseView();
    const nextView = isHalf ? { ...layout.view } : v;
    state.view = nextView;
    svg.setAttribute('viewBox', `${nextView.x} ${nextView.y} ${nextView.w} ${nextView.h}`);
    const zoom = baseView.w / nextView.w;
    chipZoom.textContent = `Zoom: ${Math.round(zoom*100)}%`;
  }

  function applyLayoutTransform() {
    const isHalf = state.layout === 'half';
    const w = isHalf ? COURT_W / 2 : COURT_W;
    const h = COURT_H;
    const angle = ((state.rotation % 360) + 360) % 360;
    if (angle === 90) {
      gScene.setAttribute('transform', `translate(${h} 0) rotate(90)`);
    } else if (angle === 180) {
      gScene.setAttribute('transform', `translate(${w} ${h}) rotate(180)`);
    } else if (angle === 270) {
      gScene.setAttribute('transform', `translate(0 ${w}) rotate(270)`);
    } else {
      gScene.removeAttribute('transform');
    }
    gRoot.setAttribute('clip-path', `url(#${isHalf ? 'clipHalf' : 'clipFull'})`);
  }

  function setLayout(layoutId) {
    syncLayoutState();
    const layout = LAYOUTS[layoutId] || LAYOUTS['full-h'];
    state.layout = layout.id;
    if (layoutId === 'full-h') state.rotation = 0;
    if (layoutId === 'full-v') state.rotation = 90;
    bindLayoutState(layout.id);
    state.view = { ...getBaseView() };
    setViewBox({ ...state.view });
    applyLayoutTransform();
    updateLayoutTabs();
    commit();
  }

  function updateLayoutTabs() {
    $$('.layoutTabs .tab').forEach((btn) => {
      const layoutId = btn.getAttribute('data-layout');
      const isActive = layoutId ? layoutId === state.layout : false;
      btn.classList.toggle('isActive', isActive);
    });
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

  function currentCourtBounds() {
    const isHalf = state.layout === 'half';
    return { maxX: isHalf ? COURT_W / 2 : COURT_W, maxY: COURT_H };
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
    const ls = state.layoutStates?.[state.layout];
    if (ls) ls.selection = id;
    render();
  }

  function svgPointFromClient(clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = gScene.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const inv = ctm.inverse();
    const p = pt.matrixTransform(inv);
    return { x: p.x, y: p.y };
  }

  // Rendering
  function renderPlayers() {
    gPlayers.innerHTML = '';
    const angle = ((state.rotation % 360) + 360) % 360;
    for (const o of state.objects) {
      if (o.type !== 'player') continue;

      const g = document.createElementNS(svgNS, 'g');
      g.setAttribute('data-id', o.id);
      g.setAttribute('transform', `translate(${o.x} ${o.y})`);
      g.style.color = teamColor(o.team);
      g.style.cursor = 'grab';

      const base = document.createElementNS(svgNS, 'circle');
      base.setAttribute('cx', '0');
      base.setAttribute('cy', '0');
      base.setAttribute('r', '0.3');
      base.setAttribute('fill', 'currentColor');
      base.setAttribute('stroke', 'rgba(0,0,0,0.25)');
      base.setAttribute('stroke-width', '0.03');
      g.appendChild(base);

      const highlight = document.createElementNS(svgNS, 'circle');
      highlight.setAttribute('cx', '-0.1');
      highlight.setAttribute('cy', '-0.1');
      highlight.setAttribute('r', '0.045');
      highlight.setAttribute('fill', 'rgba(255,255,255,.25)');
      g.appendChild(highlight);

      const labelVal = (o.label || '').trim();
      const roleVal = (o.role || '').trim();
      const showBigLabel = labelVal && !roleVal;
      const showBigRole = roleVal && !labelVal;

      if (showBigLabel || showBigRole) {
        const big = document.createElementNS(svgNS, 'text');
        big.setAttribute('x', '0');
        big.setAttribute('y', '0');
        big.setAttribute('text-anchor', 'middle');
        big.setAttribute('dominant-baseline', 'middle');
        big.setAttribute('font-size', '0.32');
        big.setAttribute('fill', 'rgba(255,255,255,0.96)');
        big.setAttribute('stroke', 'rgba(0,0,0,0.45)');
        big.setAttribute('stroke-width', '0.03');
        big.setAttribute('paint-order', 'stroke');
        big.setAttribute('font-weight', '700');
        big.style.pointerEvents = 'none';
        if (angle) big.setAttribute('transform', `rotate(${-angle})`);
        big.textContent = showBigLabel ? labelVal : roleVal;
        g.appendChild(big);
      } else {
        const txt = document.createElementNS(svgNS, 'text');
        txt.setAttribute('x', '0');
        txt.setAttribute('y', '-0.06');
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('font-size', '0.23');
        txt.setAttribute('fill', 'rgba(255,255,255,0.96)');
        txt.setAttribute('stroke', 'rgba(0,0,0,0.45)');
        txt.setAttribute('stroke-width', '0.03');
        txt.setAttribute('paint-order', 'stroke');
        txt.setAttribute('font-weight', '700');
        txt.style.pointerEvents = 'none';
        if (angle) txt.setAttribute('transform', `rotate(${-angle})`);
        txt.textContent = labelVal;
        g.appendChild(txt);

        const role = document.createElementNS(svgNS, 'text');
        role.setAttribute('x', '0');
        role.setAttribute('y', '0.18');
        role.setAttribute('text-anchor', 'middle');
        role.setAttribute('font-size', '0.17');
        role.setAttribute('fill', 'rgba(255,255,255,0.9)');
        role.setAttribute('stroke', 'rgba(0,0,0,0.45)');
        role.setAttribute('stroke-width', '0.03');
        role.setAttribute('paint-order', 'stroke');
        role.setAttribute('font-weight', '700');
        role.style.pointerEvents = 'none';
        if (angle) role.setAttribute('transform', `rotate(${-angle})`);
        role.textContent = roleVal;
        g.appendChild(role);
      }

      if (state.selection === o.id) {
        const sel = document.createElementNS(svgNS, 'circle');
        sel.setAttribute('cx', '0');
        sel.setAttribute('cy', '0');
        sel.setAttribute('r', '0.4');
        sel.setAttribute('fill', 'none');
        sel.setAttribute('stroke', 'rgba(255,255,255,0.65)');
        sel.setAttribute('stroke-width', '0.06');
        sel.style.pointerEvents = 'none';
        g.insertBefore(sel, base);
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
    c.setAttribute('r', '0.28');
    c.setAttribute('fill', '#f7f1e5');
    c.setAttribute('stroke', '#cbb48e');
    c.setAttribute('stroke-width', '0.04');
    c.setAttribute('stroke', 'rgba(0,0,0,0.25)');
    c.setAttribute('stroke-width', '0.03');
    g.appendChild(c);

    const highlight = document.createElementNS(svgNS, 'circle');
    highlight.setAttribute('cx', '-0.12');
    highlight.setAttribute('cy', '-0.12');
    highlight.setAttribute('r', '0.08');
    highlight.setAttribute('fill', 'rgba(255,255,255,0.5)');
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
    const angle = ((state.rotation % 360) + 360) % 360;
    for (const t of state.texts) {
      const el = document.createElementNS(svgNS, 'text');
      el.setAttribute('data-id', t.id);
      el.setAttribute('x', t.x);
      el.setAttribute('y', t.y);
      el.setAttribute('font-size', t.style?.size ?? '0.55');
      el.setAttribute('fill', 'currentColor');
      el.style.color = teamColor(t.team);
      el.style.cursor = 'grab';
      if (angle) el.setAttribute('transform', `rotate(${-angle}, ${t.x}, ${t.y})`);
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
    applyLayoutTransform();
    applyLayerVisibility();
    setViewBox(state.view);
    updateLayoutTabs();
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
    syncLayoutState();
    pushHistory(state);
    render();
  }

  function replaceState(next) {
    state = next;
    if (!state.layout) state.layout = 'full-h';
    if (!state.rotation && state.rotation !== 0) state.rotation = 0;
    if (!LAYOUTS[state.layout]) state.layout = 'full-h';
    if (!state.layers) state.layers = { players:true, ball:true, drawings:true, text:true };
    if (!state.layoutStates) {
      state.layoutStates = {};
      state.layoutStates[state.layout] = {
        view: state.view || { ...(LAYOUTS[state.layout]?.view || LAYOUTS['full-h'].view) },
        notes: state.notes || '',
        objects: state.objects || [],
        drawings: state.drawings || [],
        texts: state.texts || [],
        ball: state.ball || { id:'ball', x:9, y:4.5, visible:false },
        selection: state.selection || null,
      };
    }
    for (const id of Object.keys(LAYOUTS)) ensureLayoutState(id);
    bindLayoutState(state.layout);
    pushHistory(state);
    render();
  }

  // Object creation
  function addPlayer(team='A', x= team==='A' ? 4 : 14, y=4.5, label='', role='X') {
    const bounds = currentCourtBounds();
    const clampedX = clamp(x, 0, bounds.maxX);
    const clampedY = clamp(y, 0, bounds.maxY);
    state.objects.push({ id: ID(), type:'player', team, x: clampedX, y: clampedY, role, label });
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
    state.ball = { id:'ball', x:9, y:4.5, visible:false };
    state.selection = null;
    commit();
  }

  const DEFAULT_SPOTS_A = [
    {x: 2.0, y: 7.8, n:'1'},
    {x: 2.0, y: 4.5, n:'6'},
    {x: 2.0, y: 1.2, n:'5'},
    {x: 6.0, y: 1.2, n:'4'},
    {x: 6.0, y: 4.5, n:'3'},
    {x: 6.0, y: 7.8, n:'2'},
  ];
  const DEFAULT_SPOTS = {
    A: DEFAULT_SPOTS_A,
    B: DEFAULT_SPOTS_A.map((p) => ({ x: COURT_W - p.x, y: COURT_H - p.y, n: p.n })),
  };

  const DEFAULT_ROLE_BY_LABEL = {
    '1': 'P',
    '2': 'S1',
    '3': 'C2',
    '4': 'O',
    '5': 'S2',
    '6': 'C1',
  };

  function insertDefaultTeams(mode) {
    presetEmpty();
    const addTeam = (team) => {
      for (const p of DEFAULT_SPOTS[team]) {
        const role = DEFAULT_ROLE_BY_LABEL[p.n] || 'X';
        state.objects.push({ id: ID(), type:'player', team, x:p.x, y:p.y, role, label:'' });
      }
    };
    if (mode === 'A' || mode === 'both') addTeam('A');
    if (mode === 'B' || mode === 'both') addTeam('B');
    state.ball = { id:'ball', x:9, y:4.5, visible:false };
    commit();
  }

  function rotateTeam(team, dir = 'cw') {
    const spots = DEFAULT_SPOTS[team];
    if (!spots) return;
    const players = state.objects.filter(o => o.type==='player' && o.team===team);
    if (players.length === 0) return;

    const orderCW = ['1','6','5','4','3','2'];
    const order = dir === 'ccw' ? [...orderCW].reverse() : orderCW;
    const spotByLab = new Map(spots.map((s) => [s.n, s]));

    const closest = (p) => {
      let best = null, bestD = Infinity;
      for (const s of spots) {
        const dx = p.x - s.x, dy = p.y - s.y;
        const d = dx*dx + dy*dy;
        if (d < bestD) { bestD = d; best = s; }
      }
      return best;
    };

    const playerByLab = new Map();
    for (const p of players) {
      const s = closest(p);
      if (s) playerByLab.set(s.n, p);
    }

    for (let i = 0; i < order.length; i++) {
      const curLab = order[i];
      const nextLab = order[(i + 1) % order.length];
      const p = playerByLab.get(curLab);
      const nextSpot = spotByLab.get(nextLab);
      if (!p || !nextSpot) continue;
      p.x = nextSpot.x;
      p.y = nextSpot.y;
    }

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
    const bounds = currentCourtBounds();
    const baseX = team === 'A' ? 4 : 14;
    const x = clamp(baseX, 0, bounds.maxX);
    const y = clamp(4.5, 0, bounds.maxY);
    addPlayer(team, x, y, '', 'X');
  });

  $('#btnAddBall').addEventListener('click', () => toggleBall());

  $('#btnArrow').addEventListener('click', () => {
    setMode(state.mode === MODE.ARROW ? MODE.SELECT : MODE.ARROW);
  });

  $('#btnText').addEventListener('click', () => {
    setMode(state.mode === MODE.TEXT ? MODE.SELECT : MODE.TEXT);
  });

  $('#btnRotateACW').addEventListener('click', () => rotateTeam('A', 'cw'));
  $('#btnRotateACCW').addEventListener('click', () => rotateTeam('A', 'ccw'));
  $('#btnRotateBCW').addEventListener('click', () => rotateTeam('B', 'cw'));
  $('#btnRotateBCCW').addEventListener('click', () => rotateTeam('B', 'ccw'));
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
    const ls = state.layoutStates?.[state.layout] || defaultLayoutState(state.layout);
    const payload = {
      version: state.version || 1,
      meta: state.meta || { createdAt: new Date().toISOString() },
      layout: state.layout,
      rotation: state.rotation,
      view: ls.view,
      notes: ls.notes,
      layers: state.layers,
      objects: ls.objects,
      drawings: ls.drawings,
      texts: ls.texts,
      ball: ls.ball,
    };
    ioText.value = JSON.stringify(payload, null, 2);
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
        ensureLayoutState(state.layout);
        const ls = state.layoutStates[state.layout];
        ls.view = next.view || { ...(LAYOUTS[state.layout]?.view || LAYOUTS['full-h'].view) };
        ls.notes = next.notes || '';
        ls.objects = Array.isArray(next.objects) ? next.objects : [];
        ls.drawings = Array.isArray(next.drawings) ? next.drawings : [];
        ls.texts = Array.isArray(next.texts) ? next.texts : [];
        ls.ball = next.ball || { id:'ball', x:9, y:4.5, visible:false };
        ls.selection = null;
        bindLayoutState(state.layout);
        if (typeof next.rotation === 'number') state.rotation = ((next.rotation % 360) + 360) % 360;
        if (next.layers) state.layers = next.layers;
        commit();
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

  // Layout tabs
  $$('.layoutTabs .tab').forEach((b) => {
    b.addEventListener('click', () => {
      const layoutId = b.getAttribute('data-layout');
      if (layoutId) setLayout(layoutId);
    });
  });
  $('#btnRotateLeft').addEventListener('click', () => {
    state.rotation = (state.rotation + 270) % 360;
    state.view = { ...getBaseView() };
    setViewBox({ ...state.view });
    applyLayoutTransform();
    commit();
  });
  $('#btnRotateRight').addEventListener('click', () => {
    state.rotation = (state.rotation + 90) % 360;
    state.view = { ...getBaseView() };
    setViewBox({ ...state.view });
    applyLayoutTransform();
    commit();
  });

  // Default teams + empty
  $$('.presetGrid .btn').forEach(b => {
    b.addEventListener('click', () => {
      const p = b.getAttribute('data-preset');
      if (p === 'empty') presetEmpty();
      if (p === 'teamA') insertDefaultTeams('A');
      if (p === 'teamB') insertDefaultTeams('B');
      if (p === 'teams') insertDefaultTeams('both');
    });
  });

  // Add player by role
  const addTeamSel = $('#addTeam');
  const addRoleSel = $('#addRole');
  const addNumberInput = $('#addNumber');
  const fillSelect = (sel, items, getValue) => {
    sel.innerHTML = '';
    for (const item of items) {
      const opt = document.createElement('option');
      opt.value = getValue(item);
      opt.textContent = item.name;
      sel.appendChild(opt);
    }
  };
  fillSelect(addTeamSel, TEAMS, (t) => t.id);
  fillSelect(addRoleSel, ROLES, (r) => r.id);
  addTeamSel.value = 'A';
  addRoleSel.value = 'X';
  $('#btnAddRolePlayer').addEventListener('click', () => {
    const team = addTeamSel.value || 'A';
    const role = addRoleSel.value || 'X';
    const label = (addNumberInput.value || '').trim();
    const bounds = currentCourtBounds();
    const baseX = team === 'A' ? 4 : 14;
    const x = clamp(baseX, 0, bounds.maxX);
    const y = clamp(4.5, 0, bounds.maxY);
    addPlayer(team, x, y, label, role);
    addNumberInput.value = '';
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
  let overlayDrag = null;

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

  // Draggable inspector overlay
  inspectorHandle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    inspectorOverlay.setPointerCapture(e.pointerId);
    const wrapRect = stage.getBoundingClientRect();
    const rect = inspectorOverlay.getBoundingClientRect();
    inspectorOverlay.style.right = '';
    inspectorOverlay.style.bottom = '';
    overlayDrag = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left - wrapRect.left,
      startTop: rect.top - wrapRect.top,
      wrapRect,
    };
    inspectorOverlay.style.left = `${overlayDrag.startLeft}px`;
    inspectorOverlay.style.top = `${overlayDrag.startTop}px`;
  });

  window.addEventListener('pointermove', (e) => {
    if (!overlayDrag || e.pointerId !== overlayDrag.id) return;
    const dx = e.clientX - overlayDrag.startX;
    const dy = e.clientY - overlayDrag.startY;
    const maxLeft = overlayDrag.wrapRect.width - inspectorOverlay.offsetWidth;
    const maxTop = overlayDrag.wrapRect.height - inspectorOverlay.offsetHeight;
    const left = clamp(overlayDrag.startLeft + dx, 0, Math.max(0, maxLeft));
    const top = clamp(overlayDrag.startTop + dy, 0, Math.max(0, maxTop));
    inspectorOverlay.style.left = `${left}px`;
    inspectorOverlay.style.top = `${top}px`;
  });

  window.addEventListener('pointerup', (e) => {
    if (!overlayDrag || e.pointerId !== overlayDrag.id) return;
    inspectorOverlay.releasePointerCapture(e.pointerId);
    overlayDrag = null;
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
    e.preventDefault();
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
    e.preventDefault();
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
      const bounds = currentCourtBounds();
      if (id === 'ball') {
        state.ball.x = clamp(drag.startObj.x + dx, 0, bounds.maxX);
        state.ball.y = clamp(drag.startObj.y + dy, 0, bounds.maxY);
      } else {
        const obj = objById(id);
        if (obj) {
          obj.x = clamp(drag.startObj.x + dx, 0, bounds.maxX);
          obj.y = clamp(drag.startObj.y + dy, 0, bounds.maxY);
        }
      }
      render();
      return;
    }
  });

  svg.addEventListener('pointerup', (e) => {
    if (e.pointerId !== activePointerId) return;
    e.preventDefault();
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
    if (drag) return;
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
    e.preventDefault();
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
  updateLayoutTabs();

  // Auto commit after first render to have baseline
  pushHistory(state);

})();
