(() => {
  'use strict';

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  // Coordinate system: court in logical units: width=18, height=9.
  // SVG viewBox includes some margin: [-1,-1] -> [20,11]
  const COURT_W = 18;
  const COURT_H = 9;

  const defaultRotationFor = (layoutId) => (layoutId === 'full-v' ? 90 : (layoutId === 'half' ? 270 : 0));


  const LAYOUTS = {
    'full-h': { id: 'full-h', label: 'Campo intero', view: { x: -2, y: -2, w: 22, h: 13 } },
    'full-v': { id: 'full-v', label: 'Campo intero (vert.)', view: { x: -2, y: -2, w: 13, h: 22 } },
    'half': { id: 'half', label: 'Mezzo campo', view: { x: -1, y: -1, w: 11, h: 11 } },
  };

  const DEFAULT_STATE = () => ({
    version: 1,
    meta: { createdAt: new Date().toISOString() },
    layout: 'full-h',
    rotation: 0,
    view: { x: -1, y: -1, w: 20, h: 11 }, // viewBox
    notes: '',
    draw: { color: '#ffffff', width: 0.08, dash: 'solid' },
    layers: { players: true, drawings: true, text: true },
    objects: [], // {id,type,team,x,y,role,label,style,...}
    drawings: [], // {id,type,path,team,style}
    texts: [], // {id,type,x,y,text,team,style}
    props: [], // {id,type,kind,x,y,role,color}
    selection: [],
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
    { id: 'S', name: 'Schiacciatore (S)' },
    { id: 'C', name: 'Centrale (C)' },
    { id: 'L', name: 'Libero (L)' },
    { id: 'X', name: 'Altro (X)' },
  ];

  const TOOLBOX_ITEMS = [
    { id:'player-blank', label:'Gioc', kind:'player', role:'NONE' },
    { id:'role-P', label:'P', kind:'player', role:'P' },
    { id:'role-C', label:'C', kind:'player', role:'C' },
    { id:'role-S', label:'S', kind:'player', role:'S' },
    { id:'role-L', label:'L', kind:'player', role:'L' },
    { id:'role-S1', label:'S1', kind:'player', role:'S1' },
    { id:'role-C2', label:'C2', kind:'player', role:'C2' },
    { id:'role-O', label:'O', kind:'player', role:'O' },
    { id:'role-S2', label:'S2', kind:'player', role:'S2' },
    { id:'role-C1', label:'C1', kind:'player', role:'C1' },
    { id:'ball', label:'Palla', kind:'ball' },
    { id:'cone-red', label:'Cinesino rosso', kind:'cone', color:'#ef4444' },
    { id:'cone-yellow', label:'Cinesino giallo', kind:'cone', color:'#f59e0b' },
    { id:'cone-blue', label:'Cinesino blu', kind:'cone', color:'#3b82f6' },
    { id:'cone-green', label:'Cinesino verde', kind:'cone', color:'#10b981' },
    { id:'ball-cart', label:'Carrello palloni', kind:'ball-cart', previewScale: 0.8 },
    { id:'basket', label:'Canestro', kind:'basket', previewScale: 0.8 },
    { id:'coach', label:'Allenatore', kind:'coach' },
    { id:'ladder', label:'Scaletta', kind:'ladder', previewScale: 0.6 },
    { id:'target', label:'Bersaglio', kind:'target' },
  ];


  const EMBEDDED = !!window.VOLLEY_EMBED;
  const changeListeners = new Set();

  function emitChange() {
    if (!changeListeners.size) return;
    const payload = serializeState();
    for (const cb of changeListeners) {
      try { cb(payload); } catch {}
    }
  }

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
    FREEHAND: 'freehand',
    RECT: 'rect',
    CIRCLE: 'circle',
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
  const toolGrid = $('#toolGrid');
  const drawColorInput = $('#drawColor');
  const ENABLE_LONG_PRESS_MENU = false;

  // Build SVG
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'vb');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('viewBox', `${state.view.x} ${state.view.y} ${state.view.w} ${state.view.h}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('tabindex', '0');
  svg.style.touchAction = 'none';

  const defs = document.createElementNS(svgNS, 'defs');
  defs.innerHTML = `
    <linearGradient id="bgFullH" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f6a12a"></stop>
      <stop offset="100%" stop-color="#db6b06"></stop>
    </linearGradient>
    <linearGradient id="bgFullV" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="#f2a136"></stop>
      <stop offset="100%" stop-color="#d46305"></stop>
    </linearGradient>
    <linearGradient id="bgHalfH" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#f4a738"></stop>
      <stop offset="100%" stop-color="#d76a08"></stop>
    </linearGradient>
    <linearGradient id="bgHalfV" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f6a73e"></stop>
      <stop offset="100%" stop-color="#d06005"></stop>
    </linearGradient>
    <clipPath id="clipFull" clipPathUnits="userSpaceOnUse">
      <rect x="0" y="0" width="18" height="9" rx="0.4"></rect>
    </clipPath>
    <clipPath id="clipHalf" clipPathUnits="userSpaceOnUse">
      <rect x="0" y="0" width="9" height="9" rx="0.4"></rect>
    </clipPath>
  `;
  svg.appendChild(defs);

  const gRoot = document.createElementNS(svgNS, 'g');
  const gScene = document.createElementNS(svgNS, 'g');
  const gCourt = document.createElementNS(svgNS, 'g');
  const gDrawings = document.createElementNS(svgNS, 'g');
  const gProps = document.createElementNS(svgNS, 'g');
  const gPlayers = document.createElementNS(svgNS, 'g');
  const gText = document.createElementNS(svgNS, 'g');
  const gHandles = document.createElementNS(svgNS, 'g');

  gRoot.setAttribute('id', 'root');
  gScene.setAttribute('id', 'scene');
  gCourt.setAttribute('id', 'court');
  gDrawings.setAttribute('id', 'drawings');
  gProps.setAttribute('id', 'props');
  gPlayers.setAttribute('id', 'players');
  gText.setAttribute('id', 'textLayer');
  gHandles.setAttribute('id', 'handles');

  svg.appendChild(gRoot);
  gRoot.appendChild(gScene);
  gScene.appendChild(gCourt);
  gScene.appendChild(gDrawings);
  gScene.appendChild(gProps);
  gScene.appendChild(gPlayers);
  gScene.appendChild(gText);
  gScene.appendChild(gHandles);

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
    court('rect', { x: 0, y: 0, width: courtW, height: COURT_H, rx: 0.4, fill: 'rgba(255,255,255,0.04)' });
    // Border
    court('rect', { x: 0, y: 0, width: courtW, height: COURT_H, fill: 'none', stroke: 'rgba(255,255,255,0.9)', 'stroke-width': 0.08 });

    // Net (midline for full court, boundary for half court)
    if (!isHalf) {
      court('line', { x1: netX, y1: 0, x2: netX, y2: COURT_H, stroke: 'rgba(255,255,255,0.9)', 'stroke-width': 0.08 });
    }
    court('rect', { x: netX - 0.06, y: 0, width: 0.12, height: COURT_H, fill: 'rgba(255,255,255,0.12)' });

    // 3m lines (3m from net)
    court('line', { x1: netX - 3, y1: 0, x2: netX - 3, y2: COURT_H, stroke: 'rgba(255,255,255,0.9)', 'stroke-width': 0.06, 'stroke-dasharray': '0.25 0.25' });
    if (!isHalf) {
      court('line', { x1: netX + 3, y1: 0, x2: netX + 3, y2: COURT_H, stroke: 'rgba(255,255,255,0.9)', 'stroke-width': 0.06, 'stroke-dasharray': '0.25 0.25' });
    }
  }

  drawCourt();

  // Helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function defaultLayoutState(layoutId) {
    const baseView = LAYOUTS[layoutId]?.view || LAYOUTS['full-h'].view;
    const defaultRotation = defaultRotationFor(layoutId);
    return {
      view: { ...baseView },
      rotation: defaultRotation,
      notes: '',
      objects: [],
      drawings: [],
      texts: [],
      props: [],
      selection: [],
    };
  }

  function ensureLayoutState(layoutId) {
    if (!state.layoutStates) state.layoutStates = {};
    if (!state.layoutStates[layoutId]) state.layoutStates[layoutId] = defaultLayoutState(layoutId);
    if (!state.layoutStates[layoutId].view) {
      state.layoutStates[layoutId].view = { ...(LAYOUTS[layoutId]?.view || LAYOUTS['full-h'].view) };
    }
    if (typeof state.layoutStates[layoutId].rotation !== 'number') {
      state.layoutStates[layoutId].rotation = defaultRotationFor(layoutId);
    }
    if (!state.layoutStates[layoutId].props) state.layoutStates[layoutId].props = [];
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
    if (typeof ls.rotation === 'number') state.rotation = ls.rotation;
    state.notes = ls.notes || '';
    state.objects = ls.objects || [];
    state.drawings = ls.drawings || [];
    state.texts = ls.texts || [];
    state.props = ls.props || [];
    // ball is now a prop; legacy data handled in migrateLegacyBall()
    state.selection = normalizeSelection(ls.selection);
  }

  function syncLayoutState() {
    const ls = state.layoutStates?.[state.layout];
    if (!ls) return;
    ls.view = state.view;
    ls.rotation = state.rotation;
    ls.notes = state.notes || '';
    ls.selection = normalizeSelection(state.selection);
    ls.objects = state.objects || [];
    ls.drawings = state.drawings || [];
    ls.texts = state.texts || [];
    ls.props = state.props || [];
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
    const nextView = v;
    state.view = nextView;
    svg.setAttribute('viewBox', `${nextView.x} ${nextView.y} ${nextView.w} ${nextView.h}`);
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
    gRoot.removeAttribute('clip-path');
  }

  function setLayout(layoutId) {
    syncLayoutState();
    const layout = LAYOUTS[layoutId] || LAYOUTS['full-h'];
    state.layout = layout.id;
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
    gDrawings.style.display = state.layers.drawings ? '' : 'none';
    gText.style.display = state.layers.text ? '' : 'none';
  }

  function teamColor(teamId) {
    // Use currentColor on elements; we set style color on group/items
    return teamId === 'A' ? 'rgba(30,58,138,0.95)' : 'rgba(153,27,27,0.95)';
  }

  function currentCourtBounds() {
    return { maxX: state.view.x + state.view.w, maxY: state.view.y + state.view.h, minX: state.view.x, minY: state.view.y };
  }

  function objById(id) {
    if (!id) return null;
    return state.objects.find(o => o.id === id)
      || state.drawings.find(d => d.id === id)
      || state.texts.find(t => t.id === id)
      || state.props.find(p => p.id === id);
  }

  function normalizeSelection(sel) {
    if (Array.isArray(sel)) return sel.filter(Boolean);
    if (sel) return [sel];
    return [];
  }

  function getSelection() {
    return normalizeSelection(state.selection);
  }

  function setSelection(ids) {
    const next = Array.from(new Set(normalizeSelection(ids)));
    state.selection = next;
    const ls = state.layoutStates?.[state.layout];
    if (ls) ls.selection = next;
    render();
  }

  function clearSelection() {
    setSelection([]);
  }

  function toggleSelection(id) {
    if (!id) return;
    const sel = new Set(getSelection());
    if (sel.has(id)) sel.delete(id);
    else sel.add(id);
    setSelection([...sel]);
  }

  function isSelected(id) {
    return getSelection().includes(id);
  }

  function primarySelection() {
    const sel = getSelection();
    return sel.length ? sel[sel.length - 1] : null;
  }

  function getTransformableSelection() {
    return getSelection()
      .map((id) => objById(id))
      .filter((o) => o && (o.type === 'player' || o.type === 'text' || o.type === 'prop'))
      .map((o) => ({ id: o.id, x: o.x, y: o.y, rotation: o.rotation || 0, scale: o.scale || 1 }));
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
      const rot = o.rotation || 0;
      const scale = o.scale || 1;
      g.setAttribute('transform', `translate(${o.x} ${o.y}) rotate(${rot}) scale(${scale})`);
      g.style.color = teamColor(o.team);
      g.style.cursor = 'grab';

      const base = document.createElementNS(svgNS, 'circle');
      base.setAttribute('cx', '0');
      base.setAttribute('cy', '0');
      base.setAttribute('r', '0.38');
      base.setAttribute('fill', 'currentColor');
      base.setAttribute('stroke', 'rgba(0,0,0,0.25)');
      base.setAttribute('stroke-width', '0.03');
      g.appendChild(base);

      const highlight = document.createElementNS(svgNS, 'circle');
      highlight.setAttribute('cx', '-0.1');
      highlight.setAttribute('cy', '-0.1');
      highlight.setAttribute('r', '0.06');
      highlight.setAttribute('fill', 'rgba(255,255,255,.25)');
      g.appendChild(highlight);

      const overrideVal = (o.overrideText || '').trim();
      const labelVal = (o.label || '').trim();
      const roleVal = (o.role || '').trim();
      const showBigLabel = labelVal && !roleVal;
      const showBigRole = roleVal && !labelVal;

      if (overrideVal) {
        const big = document.createElementNS(svgNS, 'text');
        big.setAttribute('x', '0');
        big.setAttribute('y', '0');
        big.setAttribute('text-anchor', 'middle');
        big.setAttribute('dominant-baseline', 'middle');
        big.setAttribute('font-size', '0.36');
        big.setAttribute('fill', 'rgba(255,255,255,0.96)');
        big.setAttribute('stroke', 'rgba(0,0,0,0.45)');
        big.setAttribute('stroke-width', '0.03');
        big.setAttribute('paint-order', 'stroke');
        big.setAttribute('font-weight', '700');
        big.style.pointerEvents = 'none';
        if (angle || rot) big.setAttribute('transform', `rotate(${-(angle) + rot})`);
        big.textContent = overrideVal;
        g.appendChild(big);
      } else if (showBigLabel || showBigRole) {
        const big = document.createElementNS(svgNS, 'text');
        big.setAttribute('x', '0');
        big.setAttribute('y', '0');
        big.setAttribute('text-anchor', 'middle');
        big.setAttribute('dominant-baseline', 'middle');
        big.setAttribute('font-size', '0.36');
        big.setAttribute('fill', 'rgba(255,255,255,0.96)');
        big.setAttribute('stroke', 'rgba(0,0,0,0.45)');
        big.setAttribute('stroke-width', '0.03');
        big.setAttribute('paint-order', 'stroke');
        big.setAttribute('font-weight', '700');
        big.style.pointerEvents = 'none';
        if (angle || rot) big.setAttribute('transform', `rotate(${-(angle) + rot})`);
        big.textContent = showBigLabel ? labelVal : roleVal;
        g.appendChild(big);
      } else {
        const txt = document.createElementNS(svgNS, 'text');
        txt.setAttribute('x', '0');
        txt.setAttribute('y', '-0.08');
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('font-size', '0.26');
        txt.setAttribute('fill', 'rgba(255,255,255,0.96)');
        txt.setAttribute('stroke', 'rgba(0,0,0,0.45)');
        txt.setAttribute('stroke-width', '0.03');
        txt.setAttribute('paint-order', 'stroke');
        txt.setAttribute('font-weight', '700');
        txt.style.pointerEvents = 'none';
        if (angle || rot) txt.setAttribute('transform', `rotate(${-(angle) + rot})`);
        txt.textContent = labelVal;
        g.appendChild(txt);

        const role = document.createElementNS(svgNS, 'text');
        role.setAttribute('x', '0');
        role.setAttribute('y', '0.22');
        role.setAttribute('text-anchor', 'middle');
        role.setAttribute('font-size', '0.20');
        role.setAttribute('fill', 'rgba(255,255,255,0.9)');
        role.setAttribute('stroke', 'rgba(0,0,0,0.45)');
        role.setAttribute('stroke-width', '0.03');
        role.setAttribute('paint-order', 'stroke');
        role.setAttribute('font-weight', '700');
        role.style.pointerEvents = 'none';
        if (angle || rot) role.setAttribute('transform', `rotate(${-(angle) + rot})`);
        role.textContent = roleVal;
        g.appendChild(role);
      }

      if (isSelected(o.id)) {
        const sel = document.createElementNS(svgNS, 'circle');
        sel.setAttribute('cx', '0');
        sel.setAttribute('cy', '0');
        sel.setAttribute('r', '0.5');
        sel.setAttribute('fill', 'none');
        sel.setAttribute('stroke', 'rgba(255,255,255,0.65)');
        sel.setAttribute('stroke-width', '0.06');
        sel.style.pointerEvents = 'none';
        g.insertBefore(sel, base);
      }

      gPlayers.appendChild(g);
    }
  }

  function drawPropShape(g, p) {
    const add = (tag, attrs={}) => {
      const el = document.createElementNS(svgNS, tag);
      for (const [k,v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      g.appendChild(el);
      return el;
    };

    if (p.kind === 'player') {
      add('circle', { cx:0, cy:0, r:0.38, fill:'rgba(30,58,138,0.95)', stroke:'rgba(0,0,0,0.25)', 'stroke-width':0.03 });
      add('circle', { cx:-0.12, cy:-0.12, r:0.06, fill:'rgba(255,255,255,0.25)' });
    } else if (p.kind === 'role') {
      add('rect', { x:-0.5, y:-0.25, width:1.0, height:0.5, rx:0.12, fill:'rgba(12,16,22,0.75)', stroke:'rgba(255,255,255,0.2)', 'stroke-width':0.04 });
      add('rect', { x:-0.32, y:-0.08, width:0.64, height:0.16, rx:0.06, fill:'rgba(255,255,255,0.12)' });
      add('circle', { cx:-0.22, cy:0.08, r:0.04, fill:'rgba(255,255,255,0.35)' });
      add('circle', { cx:0.0, cy:0.08, r:0.04, fill:'rgba(255,255,255,0.35)' });
      add('circle', { cx:0.22, cy:0.08, r:0.04, fill:'rgba(255,255,255,0.35)' });
    } else if (p.kind === 'cone') {
      const color = p.color || '#f97316';
      add('polygon', { points:'0,-0.35 0.38,0.28 -0.38,0.28', fill: color, stroke:'rgba(0,0,0,0.25)', 'stroke-width':0.03 });
      add('rect', { x:-0.35, y:0.22, width:0.7, height:0.12, rx:0.04, fill:'rgba(0,0,0,0.25)' });
    } else if (p.kind === 'ball') {
      add('circle', { cx:0, cy:0, r:0.28, fill:'#f7f1e5', stroke:'rgba(0,0,0,0.25)', 'stroke-width':0.03 });
      add('circle', { cx:-0.12, cy:-0.12, r:0.08, fill:'rgba(255,255,255,0.5)' });
      const seams = [
        'M -0.2 -0.1 C -0.05 -0.22 0.1 -0.2 0.2 -0.06',
        'M -0.2 0.12 C -0.04 0.0 0.12 0.0 0.2 0.14',
        'M -0.06 -0.24 C 0.04 -0.1 0.04 0.1 -0.04 0.24',
      ];
      for (const d of seams) {
        add('path', { d, fill:'none', stroke:'#d9c7a7', 'stroke-width':0.035, 'stroke-linecap':'round' });
      }
    } else if (p.kind === 'ball-cart') {
      add('rect', { x:-0.55, y:-0.15, width:1.1, height:0.45, rx:0.1, fill:'rgba(18,22,30,0.9)', stroke:'rgba(255,255,255,0.25)', 'stroke-width':0.04 });
      add('line', { x1:-0.45, y1:-0.2, x2:-0.15, y2:-0.45, stroke:'rgba(255,255,255,0.35)', 'stroke-width':0.05 });
      add('line', { x1:0.45, y1:-0.2, x2:0.15, y2:-0.45, stroke:'rgba(255,255,255,0.35)', 'stroke-width':0.05 });
      add('circle', { cx:-0.25, cy:0.35, r:0.08, fill:'rgba(255,255,255,0.7)' });
      add('circle', { cx:0.25, cy:0.35, r:0.08, fill:'rgba(255,255,255,0.7)' });
      add('circle', { cx:-0.2, cy:0.02, r:0.12, fill:'rgba(255,255,255,0.95)' });
      add('circle', { cx:0.05, cy:-0.02, r:0.12, fill:'rgba(255,255,255,0.95)' });
      add('circle', { cx:0.25, cy:0.06, r:0.12, fill:'rgba(255,255,255,0.95)' });
    } else if (p.kind === 'basket') {
      add('line', { x1:0.1, y1:-0.85, x2:0.1, y2:0.55, stroke:'rgba(255,255,255,0.6)', 'stroke-width':0.08 });
      add('line', { x1:-0.35, y1:-0.75, x2:0.1, y2:-0.75, stroke:'rgba(255,255,255,0.6)', 'stroke-width':0.08 });
      add('rect', { x:-0.4, y:-0.74, width:0.1, height:0.05, rx:0.02, fill:'rgba(255,255,255,0.7)' });
      add('path', { d:'M -0.35 -0.7 L -0.2 0.1 L 0.05 0.1 L -0.1 -0.7 Z', fill:'rgba(255,255,255,0.15)', stroke:'rgba(255,255,255,0.35)', 'stroke-width':0.03 });
      add('rect', { x:-0.55, y:0.55, width:1.1, height:0.15, rx:0.04, fill:'rgba(255,255,255,0.45)' });
    } else if (p.kind === 'coach') {
      add('circle', { cx:0, cy:-0.2, r:0.16, fill:'rgba(255,255,255,0.9)' });
      add('rect', { x:-0.22, y:-0.05, width:0.44, height:0.4, rx:0.12, fill:'rgba(94,234,212,0.9)' });
      add('rect', { x:-0.08, y:0.04, width:0.16, height:0.26, rx:0.03, fill:'rgba(255,255,255,0.95)' });
      add('rect', { x:-0.16, y:0.04, width:0.32, height:0.06, rx:0.03, fill:'rgba(255,255,255,0.95)' });
    } else if (p.kind === 'ladder') {
      add('rect', { x:-0.2, y:-1.1, width:0.4, height:2.2, rx:0.06, fill:'rgba(255,255,255,0.12)', stroke:'rgba(255,255,255,0.45)', 'stroke-width':0.05 });
      add('line', { x1:-0.16, y1:-0.8, x2:0.16, y2:-0.8, stroke:'rgba(255,255,255,0.45)', 'stroke-width':0.05 });
      add('line', { x1:-0.16, y1:-0.45, x2:0.16, y2:-0.45, stroke:'rgba(255,255,255,0.45)', 'stroke-width':0.05 });
      add('line', { x1:-0.16, y1:-0.1, x2:0.16, y2:-0.1, stroke:'rgba(255,255,255,0.45)', 'stroke-width':0.05 });
      add('line', { x1:-0.16, y1:0.25, x2:0.16, y2:0.25, stroke:'rgba(255,255,255,0.45)', 'stroke-width':0.05 });
      add('line', { x1:-0.16, y1:0.6, x2:0.16, y2:0.6, stroke:'rgba(255,255,255,0.45)', 'stroke-width':0.05 });
    } else if (p.kind === 'target') {
      add('circle', { cx:0, cy:0, r:0.28, fill:'none', stroke:'rgba(255,255,255,0.4)', 'stroke-width':0.04 });
      add('circle', { cx:0, cy:0, r:0.14, fill:'rgba(255,255,255,0.2)' });
    }
  }

  function renderProps() {
    gProps.innerHTML = '';
    const angle = ((state.rotation % 360) + 360) % 360;
    for (const p of state.props) {
      const g = document.createElementNS(svgNS, 'g');
      g.setAttribute('data-id', p.id);
      const rot = p.rotation || 0;
      const scale = p.scale || 1;
      g.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${rot}) scale(${scale})`);
      g.style.cursor = 'grab';
      const gInner = document.createElementNS(svgNS, 'g');
      const counter = -(angle);
      if (angle || rot) gInner.setAttribute('transform', `rotate(${counter + rot})`);
      drawPropShape(gInner, p);

      if (isSelected(p.id)) {
        const sel = document.createElementNS(svgNS, 'circle');
        sel.setAttribute('cx', '0');
        sel.setAttribute('cy', '0');
        sel.setAttribute('r', '0.6');
        sel.setAttribute('fill', 'none');
        sel.setAttribute('stroke', 'rgba(255,255,255,0.6)');
        sel.setAttribute('stroke-width', '0.05');
        gInner.appendChild(sel);
      }

      g.appendChild(gInner);
      gProps.appendChild(g);
    }
  }

  function parsePathNums(path) {
    const nums = (path || '').match(/-?\d*\.?\d+/g);
    return nums ? nums.map(Number) : [];
  }

  function inferArrowKindFromPath(path) {
    if (!path) return 'straight';
    if (/Q/i.test(path)) return 'curve';
    const lCount = (path.match(/L/g) || []).length;
    if (lCount >= 2) return 'angle';
    return 'straight';
  }

  function ensureArrowPoints(d) {
    if (d.points && d.points.start && d.points.end) return d.points;
    const nums = parsePathNums(d.path);
    let points = null;
    if (/Q/i.test(d.path || '') && nums.length >= 6) {
      points = {
        start: { x: nums[0], y: nums[1] },
        mid: { x: nums[2], y: nums[3] },
        end: { x: nums[4], y: nums[5] },
      };
    } else if ((d.path || '').match(/L/g) && nums.length >= 6) {
      points = {
        start: { x: nums[0], y: nums[1] },
        mid: { x: nums[2], y: nums[3] },
        end: { x: nums[4], y: nums[5] },
      };
    } else if (nums.length >= 4) {
      points = {
        start: { x: nums[0], y: nums[1] },
        mid: { x: (nums[0] + nums[2]) / 2, y: (nums[1] + nums[3]) / 2 },
        end: { x: nums[2], y: nums[3] },
      };
    }
    if (!points) {
      points = {
        start: { x: 2, y: 2 },
        mid: { x: 3, y: 2 },
        end: { x: 4, y: 2 },
      };
    }
    d.points = points;
    return points;
  }

  function arrowPathFromPoints(points, kind) {
    const s = points.start;
    const m = points.mid;
    const e = points.end;
    if (kind === 'angle') {
      const v1x = m.x - s.x;
      const v1y = m.y - s.y;
      const v2x = e.x - m.x;
      const v2y = e.y - m.y;
      const len1 = Math.hypot(v1x, v1y);
      const len2 = Math.hypot(v2x, v2y);
      if (len1 < 0.001 || len2 < 0.001) return `M ${s.x} ${s.y} L ${e.x} ${e.y}`;
      const r = Math.min(0.35, len1 * 0.45, len2 * 0.45);
      const n1x = v1x / len1;
      const n1y = v1y / len1;
      const n2x = v2x / len2;
      const n2y = v2y / len2;
      const p1x = m.x - n1x * r;
      const p1y = m.y - n1y * r;
      const p2x = m.x + n2x * r;
      const p2y = m.y + n2y * r;
      return `M ${s.x} ${s.y} L ${p1x} ${p1y} Q ${m.x} ${m.y} ${p2x} ${p2y} L ${e.x} ${e.y}`;
    }
    if (kind === 'curve') return `M ${s.x} ${s.y} Q ${m.x} ${m.y} ${e.x} ${e.y}`;
    return `M ${s.x} ${s.y} L ${e.x} ${e.y}`;
  }

  function arrowDirection(points, kind) {
    const s = points.start;
    const m = points.mid;
    const e = points.end;
    if (kind === 'angle' || kind === 'curve') return { x: e.x - m.x, y: e.y - m.y };
    return { x: e.x - s.x, y: e.y - s.y };
  }

  function applyStrokeStyle(el, style) {
    const dash = style?.dash || 'solid';
    if (dash === 'dash') el.setAttribute('stroke-dasharray', '0.26 0.18');
    else if (dash === 'dot') el.setAttribute('stroke-dasharray', '0.06 0.14');
    else el.removeAttribute('stroke-dasharray');
  }

  function drawArrowHead(headEl, end, dir, size, color) {
    const len = Math.max(0.2, size);
    const w = len * 0.7;
    const mag = Math.hypot(dir.x, dir.y) || 1;
    const ux = dir.x / mag;
    const uy = dir.y / mag;
    const bx = end.x - ux * len;
    const by = end.y - uy * len;
    const px = -uy;
    const py = ux;
    const p1x = bx + px * w * 0.5;
    const p1y = by + py * w * 0.5;
    const p2x = bx - px * w * 0.5;
    const p2y = by - py * w * 0.5;
    headEl.setAttribute('d', `M ${end.x} ${end.y} L ${p1x} ${p1y} L ${p2x} ${p2y} Z`);
    headEl.setAttribute('fill', color);
  }

  function arrowHeadSize(width) {
    const w = Number(width) || 0.08;
    return Math.max(0.34, w * 4.8);
  }

  function shortenArrowEnd(points, kind, size) {
    const len = Math.max(0.18, size * 0.85);
    const s = points.start;
    const m = points.mid;
    const e = points.end;
    if (kind === 'angle' || kind === 'curve') {
      const vx = e.x - m.x;
      const vy = e.y - m.y;
      const mag = Math.hypot(vx, vy) || 1;
      const ux = vx / mag;
      const uy = vy / mag;
      const end = { x: e.x - ux * len, y: e.y - uy * len };
      return { start: { ...s }, mid: { ...m }, end };
    }
    const vx = e.x - s.x;
    const vy = e.y - s.y;
    const mag = Math.hypot(vx, vy) || 1;
    const ux = vx / mag;
    const uy = vy / mag;
    const end = { x: e.x - ux * len, y: e.y - uy * len };
    return { start: { ...s }, mid: { ...m }, end };
  }

  function renderDrawings() {
    gDrawings.innerHTML = '';
    for (const d of state.drawings) {
      if (d.type === 'arrow') {
        const g = document.createElementNS(svgNS, 'g');
        g.setAttribute('data-id', d.id);
        g.style.cursor = 'pointer';
        const points = ensureArrowPoints(d);
        const kind = d.kind || inferArrowKindFromPath(d.path);
        d.kind = kind;
        const width = Number(d.style?.width ?? 0.08);
        const headSize = arrowHeadSize(width);
        const shortened = shortenArrowEnd(points, kind, headSize);
        const path = arrowPathFromPoints(shortened, kind);
        d.path = arrowPathFromPoints(points, kind);

        const p = document.createElementNS(svgNS, 'path');
        p.setAttribute('d', path);
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', 'currentColor');
        p.setAttribute('stroke-width', d.style?.width ?? '0.08');
        p.setAttribute('stroke-linecap', 'round');
        p.setAttribute('stroke-linejoin', 'round');
        applyStrokeStyle(p, d.style);
        p.style.color = teamColor(d.team);
        p.setAttribute('opacity', d.style?.opacity ?? '0.9');
        p.setAttribute('data-id', d.id);

        const head = document.createElementNS(svgNS, 'path');
        head.setAttribute('data-id', d.id);
        const dir = arrowDirection(points, kind);
        drawArrowHead(head, points.end, dir, headSize, teamColor(d.team));
        head.setAttribute('opacity', d.style?.opacity ?? '0.9');

        if (isSelected(d.id)) {
          p.setAttribute('stroke-width', '0.12');
          p.setAttribute('opacity', '1');
          head.setAttribute('opacity', '1');
        }

        g.appendChild(p);
        g.appendChild(head);
        gDrawings.appendChild(g);
      } else {
        const p = document.createElementNS(svgNS, 'path');
        p.setAttribute('data-id', d.id);
        p.setAttribute('d', d.path);
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', 'currentColor');
        p.setAttribute('stroke-width', d.style?.width ?? '0.08');
        p.setAttribute('stroke-linecap', 'round');
        p.setAttribute('stroke-linejoin', 'round');
        applyStrokeStyle(p, d.style);
        p.style.color = d.style?.color ?? teamColor(d.team);
        p.style.cursor = 'pointer';
        p.setAttribute('opacity', d.style?.opacity ?? '0.9');

        if (isSelected(d.id)) {
          p.setAttribute('stroke-width', '0.12');
          p.setAttribute('opacity', '1');
        }

        gDrawings.appendChild(p);
        const rot = d.rotation || 0;
        const scale = d.scale || 1;
        if (rot !== 0 || scale !== 1) {
          const box = p.getBBox();
          const cx = box.x + box.width / 2;
          const cy = box.y + box.height / 2;
          p.setAttribute('transform', `translate(${cx} ${cy}) rotate(${rot}) scale(${scale}) translate(${-cx} ${-cy})`);
        }
      }
    }
  }

  function renderTexts() {
    gText.innerHTML = '';
    const angle = ((state.rotation % 360) + 360) % 360;
    for (const t of state.texts) {
      const g = document.createElementNS(svgNS, 'g');
      g.setAttribute('data-id', t.id);
      const rot = t.rotation || 0;
      const scale = t.scale || 1;
      g.setAttribute('transform', `translate(${t.x} ${t.y}) rotate(${rot}) scale(${scale})`);
      g.style.cursor = 'grab';

      const el = document.createElementNS(svgNS, 'text');
      el.setAttribute('x', '0');
      el.setAttribute('y', '0');
      el.setAttribute('font-size', t.style?.size ?? '0.55');
      el.setAttribute('font-family', `"Excalifont","Comic Sans MS","Marker Felt","Bradley Hand","Segoe Print",cursive`);
      el.setAttribute('fill', 'currentColor');
      el.style.color = t.style?.color ?? teamColor(t.team);
      if (angle || rot) el.setAttribute('transform', `rotate(${-(angle) + rot})`);
      el.textContent = t.text;

      if (isSelected(t.id)) {
        const bb = document.createElementNS(svgNS, 'rect');
        g.appendChild(el);
        const box = el.getBBox();
        bb.setAttribute('x', box.x - 0.2);
        bb.setAttribute('y', box.y - 0.2);
        bb.setAttribute('width', box.width + 0.4);
        bb.setAttribute('height', box.height + 0.4);
        bb.setAttribute('fill', 'none');
        bb.setAttribute('stroke', 'rgba(255,255,255,0.55)');
        bb.setAttribute('stroke-width', '0.06');
        bb.style.pointerEvents = 'none';
        g.insertBefore(bb, el);
      } else {
        g.appendChild(el);
      }
      gText.appendChild(g);
    }
  }

  function elementBBoxInSvg(el) {
    const rect = el.getBoundingClientRect();
    const p1 = svgPointFromClient(rect.left, rect.top);
    const p2 = svgPointFromClient(rect.right, rect.bottom);
    const x = Math.min(p1.x, p2.x);
    const y = Math.min(p1.y, p2.y);
    const w = Math.abs(p2.x - p1.x);
    const h = Math.abs(p2.y - p1.y);
    return { x, y, w, h };
  }

  function selectionBounds(ids) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let found = false;
    for (const id of ids) {
      const el = svg.querySelector(`[data-id="${id}"]`);
      if (!el) continue;
      const box = elementBBoxInSvg(el);
      if (!Number.isFinite(box.x)) continue;
      found = true;
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.w);
      maxY = Math.max(maxY, box.y + box.h);
    }
    if (!found) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  function updateSelectionRect(rectEl, start, cur) {
    const x = Math.min(start.x, cur.x);
    const y = Math.min(start.y, cur.y);
    const w = Math.abs(cur.x - start.x);
    const h = Math.abs(cur.y - start.y);
    rectEl.setAttribute('x', String(x));
    rectEl.setAttribute('y', String(y));
    rectEl.setAttribute('width', String(w));
    rectEl.setAttribute('height', String(h));
    return { x, y, w, h };
  }

  function idsInRect(rect) {
    const ids = [];
    const elements = svg.querySelectorAll('[data-id]');
    elements.forEach((el) => {
      const id = el.getAttribute('data-id');
      if (!id) return;
      const box = elementBBoxInSvg(el);
      const intersects = !(
        box.x > rect.x + rect.w ||
        box.x + box.w < rect.x ||
        box.y > rect.y + rect.h ||
        box.y + box.h < rect.y
      );
      if (intersects) ids.push(id);
    });
    return ids;
  }

  function renderHandles() {
    gHandles.innerHTML = '';
    const selIds = getSelection();
    if (!selIds.length) return;
    if (selIds.length === 1) {
      const id = selIds[0];
      const el = svg.querySelector(`[data-id="${id}"]`);
      if (!el) return;
      const obj = objById(id);
      if (obj && obj.type === 'arrow') {
        const points = ensureArrowPoints(obj);
        const handle = (x, y, type) => {
          const c = document.createElementNS(svgNS, 'circle');
          c.setAttribute('cx', String(x));
          c.setAttribute('cy', String(y));
          c.setAttribute('r', type === 'arrow-mid' ? '0.1' : '0.12');
          c.setAttribute('fill', 'rgba(17,20,26,0.9)');
          c.setAttribute('stroke', 'rgba(255,255,255,0.8)');
          c.setAttribute('stroke-width', '0.04');
          c.setAttribute('data-handle', type);
          c.setAttribute('data-target', id);
          c.style.cursor = 'move';
          gHandles.appendChild(c);
        };
        handle(points.start.x, points.start.y, 'arrow-start');
        handle(points.mid.x, points.mid.y, 'arrow-mid');
        handle(points.end.x, points.end.y, 'arrow-end');
        return;
      }
      const box = elementBBoxInSvg(el);
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      const handle = (x, y, type) => {
        const c = document.createElementNS(svgNS, 'circle');
        c.setAttribute('cx', String(x));
        c.setAttribute('cy', String(y));
        c.setAttribute('r', '0.12');
        c.setAttribute('fill', 'rgba(17,20,26,0.9)');
        c.setAttribute('stroke', 'rgba(255,255,255,0.7)');
        c.setAttribute('stroke-width', '0.04');
        c.setAttribute('data-handle', type);
        c.setAttribute('data-target', id);
        c.style.cursor = type === 'rotate' ? 'crosshair' : 'nwse-resize';
        gHandles.appendChild(c);
      };
      handle(box.x, box.y, 'scale');
      handle(box.x + box.w, box.y, 'scale');
      handle(box.x, box.y + box.h, 'scale');
      handle(box.x + box.w, box.y + box.h, 'scale');
      handle(cx, box.y - 0.4, 'rotate');
      return;
    }

    const box = selectionBounds(selIds);
    if (!box) return;
    const rect = document.createElementNS(svgNS, 'rect');
    rect.setAttribute('x', String(box.x));
    rect.setAttribute('y', String(box.y));
    rect.setAttribute('width', String(box.w));
    rect.setAttribute('height', String(box.h));
    rect.setAttribute('fill', 'none');
    rect.setAttribute('stroke', 'rgba(255,255,255,0.55)');
    rect.setAttribute('stroke-width', '0.05');
    rect.setAttribute('stroke-dasharray', '0.18 0.12');
    rect.style.pointerEvents = 'none';
    gHandles.appendChild(rect);

    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const handle = (x, y, type) => {
      const c = document.createElementNS(svgNS, 'circle');
      c.setAttribute('cx', String(x));
      c.setAttribute('cy', String(y));
      c.setAttribute('r', '0.12');
      c.setAttribute('fill', 'rgba(17,20,26,0.9)');
      c.setAttribute('stroke', 'rgba(255,255,255,0.7)');
      c.setAttribute('stroke-width', '0.04');
      c.setAttribute('data-handle', type);
      c.setAttribute('data-target', '__group__');
      c.style.cursor = type === 'rotate' ? 'crosshair' : 'nwse-resize';
      gHandles.appendChild(c);
    };
    handle(box.x, box.y, 'scale');
    handle(box.x + box.w, box.y, 'scale');
    handle(box.x, box.y + box.h, 'scale');
    handle(box.x + box.w, box.y + box.h, 'scale');
    handle(cx, box.y - 0.4, 'rotate');
  }

  function renderInspector() {
    if (inspectorOverlay) inspectorOverlay.style.display = 'none';
    inspector.innerHTML = '';
    const selIds = getSelection();
    if (!selIds.length) {
      inspector.innerHTML = `<div class="muted">Nessuna selezione</div>`;
      return;
    }
    if (selIds.length > 1) {
      inspector.innerHTML = `<div class="muted">${selIds.length} elementi selezionati</div>`;
      const del = document.createElement('button');
      del.className = 'btn btnDanger';
      del.textContent = 'Elimina selezionati';
      del.type = 'button';
      del.addEventListener('click', () => { removeSelected(); });
      inspector.appendChild(del);
      return;
    }

    const sel = objById(selIds[0]);
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
      const overrideInput = document.createElement('input');
      overrideInput.value = sel.overrideText || '';
      overrideInput.addEventListener('input', () => { sel.overrideText = overrideInput.value; commit(); });
      row('Testo speciale', overrideInput);

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

    if (type === 'arrow' || type === 'freehand' || type === 'rect' || type === 'circle') {
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = sel.style?.color || '#ffffff';
      colorInput.addEventListener('input', () => {
        sel.style = sel.style || {};
        sel.style.color = colorInput.value;
        commit();
      });
      row('Colore', colorInput);

      const widthInput = document.createElement('input');
      widthInput.type = 'number';
      widthInput.min = '0.02';
      widthInput.max = '0.3';
      widthInput.step = '0.01';
      widthInput.value = sel.style?.width ?? 0.08;
      widthInput.addEventListener('input', () => {
        sel.style = sel.style || {};
        sel.style.width = String(clamp(Number(widthInput.value) || 0.08, 0.02, 0.3));
        commit();
      });
      row('Spessore', widthInput);
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

    if (type === 'freehand' || type === 'rect' || type === 'circle') {
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
    statObjects.textContent = String(state.objects.length + state.drawings.length + state.texts.length + state.props.length);
  }

  function render() {
    notesEl.value = state.notes || '';
    if (state.draw && drawColorInput) drawColorInput.value = state.draw.color || '#ffffff';
    applyLayoutTransform();
    applyLayerVisibility();
    setViewBox(state.view);
    updateLayoutTabs();
    renderCourtSelectionHint();
    renderDrawings();
    renderProps();
    renderPlayers();
    renderTexts();
    renderHandles();
    renderInspector();
    renderStats();
  }

  function renderCourtSelectionHint() {
    // mode chip
    const m = state.mode || MODE.SELECT;
    const label = m === MODE.SELECT ? 'Selezione'
      : (m === MODE.ARROW ? 'Frecce'
      : (m === MODE.TEXT ? 'Testo'
      : (m === MODE.FREEHAND ? 'Libera'
      : (m === MODE.RECT ? 'Rettangolo'
      : (m === MODE.CIRCLE ? 'Cerchio' : 'Pan')))));
    chipMode.textContent = `Modalità: ${label}`;
  }

  function commit() {
    syncLayoutState();
    pushHistory(state);
    render();
    emitChange();
  }

  function migrateLegacyBall() {
    const lsMap = state.layoutStates || {};
    for (const key of Object.keys(lsMap)) {
      const ls = lsMap[key];
      if (!ls || !ls.ball) continue;
      const hasPropBall = Array.isArray(ls.props) && ls.props.some(p => p.kind === 'ball');
      if (ls.ball.visible && !hasPropBall) {
        ls.props = Array.isArray(ls.props) ? ls.props : [];
        ls.props.push({ id: ID(), type:'prop', kind:'ball', x: ls.ball.x ?? 9, y: ls.ball.y ?? 4.5 });
      }
      ls.ball.visible = false;
    }
    state.props = lsMap[state.layout]?.props || state.props;
    // legacy ball no longer used
  }

  function replaceState(next) {
    state = next;
    if (!state.layout) state.layout = 'full-h';
    if (!state.rotation && state.rotation !== 0) state.rotation = 0;
    if (!LAYOUTS[state.layout]) state.layout = 'full-h';
    if (!state.layers) state.layers = { players:true, drawings:true, text:true };
    if (!state.mode) state.mode = MODE.SELECT;
    if (!state.draw) state.draw = { color:'#ffffff', width:0.08, dash:'solid' };
    if (!state.draw.dash) state.draw.dash = 'solid';
    state.selection = normalizeSelection(state.selection);
    if (!state.layoutStates) {
      state.layoutStates = {};
      state.layoutStates[state.layout] = {
        view: state.view || { ...(LAYOUTS[state.layout]?.view || LAYOUTS['full-h'].view) },
        rotation: typeof state.rotation === 'number' ? state.rotation : defaultRotationFor(state.layout),
        notes: state.notes || '',
        objects: state.objects || [],
        drawings: state.drawings || [],
        texts: state.texts || [],
        props: state.props || [],
        selection: normalizeSelection(state.selection),
      };
    }
    for (const id of Object.keys(LAYOUTS)) ensureLayoutState(id);
    for (const id of Object.keys(state.layoutStates)) {
      state.layoutStates[id].selection = normalizeSelection(state.layoutStates[id].selection);
    }
    bindLayoutState(state.layout);
    migrateLegacyBall();
    pushHistory(state);
    render();
  }

  // Object creation
  function addPlayer(team='A', x= team==='A' ? 4 : 14, y=4.5, label='', role='X') {
    const bounds = currentCourtBounds();
    const clampedX = clamp(x, bounds.minX ?? 0, bounds.maxX);
    const clampedY = clamp(y, bounds.minY ?? 0, bounds.maxY);
    state.objects.push({ id: ID(), type:'player', team, x: clampedX, y: clampedY, role, label });
    commit();
  }

  function toggleBall() {
    const idx = state.props.findIndex(p => p.kind === 'ball');
    if (idx >= 0) {
      state.props.splice(idx, 1);
      state.selection = [];
      commit();
      return;
    }
    const bounds = currentCourtBounds();
    const x = clamp(9, 0, bounds.maxX);
    const y = clamp(4.5, 0, bounds.maxY);
    addProp('ball', x, y);
  }

  function addTextAt(x,y, text='Testo', team='A') {
    state.texts.push({ id: ID(), type:'text', x, y, text, team, style:{ size:'0.55' } });
    commit();
  }

  function removeSelected() {
    const ids = getSelection();
    if (!ids.length) return;
    state.objects = state.objects.filter(o => !ids.includes(o.id));
    state.drawings = state.drawings.filter(d => !ids.includes(d.id));
    state.texts = state.texts.filter(t => !ids.includes(t.id));
    state.props = state.props.filter(p => !ids.includes(p.id));
    state.selection = [];
    commit();
  }

  function addProp(kind, x, y, opts = {}) {
    const bounds = currentCourtBounds();
    const clampedX = clamp(x, bounds.minX ?? 0, bounds.maxX);
    const clampedY = clamp(y, bounds.minY ?? 0, bounds.maxY);
    state.props.push({ id: ID(), type:'prop', kind, x: clampedX, y: clampedY, role: opts.role, color: opts.color });
    commit();
  }

  function addPlayerFromTool(role, x, y) {
    const sel = primarySelection() ? objById(primarySelection()) : null;
    const team = (sel && sel.team) ? sel.team : 'A';
    const r = role === 'NONE' ? '' : (role || 'X');
    addPlayer(team, x, y, '', r);
  }

  function renderToolbox() {
    if (!toolGrid) return;
    toolGrid.innerHTML = '';
    const iconFor = (item) => {
      if (item.kind === 'role') return item.role || 'R';
      if (item.kind === 'player' && item.role === 'NONE') return 'G';
      if (item.kind === 'ball-cart') return 'CP';
      if (item.kind === 'basket') return 'CAN';
      if (item.kind === 'coach') return 'ALL';
      if (item.kind === 'assistant') return 'ASS';
      if (item.kind === 'ladder') return 'SCL';
      if (item.kind === 'target') return 'BRG';
      return item.label.slice(0, 2).toUpperCase();
    };

    for (const item of TOOLBOX_ITEMS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'toolBtn';
      b.setAttribute('draggable', 'true');
      b.dataset.kind = item.kind;
      if (item.role) b.dataset.role = item.role;
      if (item.color) b.dataset.color = item.color;

      const preview = document.createElementNS(svgNS, 'svg');
      preview.setAttribute('class', 'toolPreview');
      preview.setAttribute('viewBox', '-1 -1 2 2');
      const g = document.createElementNS(svgNS, 'g');
      const p = { kind: item.kind, role: item.role, color: item.color };
      const scale = item.previewScale ?? 1.1;
      g.setAttribute('transform', `scale(${scale})`);
      drawPropShape(g, p);
      preview.appendChild(g);

      const label = document.createElement('span');
      label.className = 'toolLabel';
      label.textContent = item.label;

      b.appendChild(preview);
      b.appendChild(label);

      b.addEventListener('click', () => {
        const v = state.view;
        const cx = v.x + v.w / 2;
        const cy = v.y + v.h / 2;
        if (item.kind === 'player') {
          addPlayerFromTool(item.role, cx, cy);
        } else {
          addProp(item.kind, cx, cy, { role: item.role, color: item.color });
        }
      });

      b.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('application/json', JSON.stringify({
          kind: item.kind,
          role: item.role || '',
          color: item.color || '',
        }));
      });

      toolGrid.appendChild(b);
    }
  }

  // Presets
  function presetEmpty() {
    state.objects = [];
    state.drawings = [];
    state.texts = [];
    state.props = [];
    state.selection = [];
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

  function getDefaultSpots(team) {
    if (state.layout === 'half') return DEFAULT_SPOTS_A;
    return DEFAULT_SPOTS[team] || DEFAULT_SPOTS_A;
  }

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
      for (const p of getDefaultSpots(team)) {
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
    const spots = getDefaultSpots(team);
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
    const sel = primarySelection() ? objById(primarySelection()) : null;
    const team = (sel && sel.team) ? sel.team : 'A';
    const bounds = currentCourtBounds();
    const baseX = team === 'A' ? 4 : 14;
    const x = clamp(baseX, 0, bounds.maxX);
    const y = clamp(4.5, 0, bounds.maxY);
    addPlayer(team, x, y, '', 'X');
  });


  $('#btnArrow').addEventListener('click', () => {
    setMode(state.mode === MODE.ARROW ? MODE.SELECT : MODE.ARROW);
  });

  $('#btnFreehand').addEventListener('click', () => {
    setMode(state.mode === MODE.FREEHAND ? MODE.SELECT : MODE.FREEHAND);
  });

  $('#btnRect').addEventListener('click', () => {
    setMode(state.mode === MODE.RECT ? MODE.SELECT : MODE.RECT);
  });

  $('#btnCircle').addEventListener('click', () => {
    setMode(state.mode === MODE.CIRCLE ? MODE.SELECT : MODE.CIRCLE);
  });

  $('#btnText').addEventListener('click', () => {
    setMode(state.mode === MODE.TEXT ? MODE.SELECT : MODE.TEXT);
  });

  $('#btnSelectMode').addEventListener('click', () => {
    setMode(MODE.SELECT);
  });

  $('#btnRotateACW').addEventListener('click', () => rotateTeam('A', 'cw'));
  $('#btnRotateACCW').addEventListener('click', () => rotateTeam('A', 'ccw'));
  $('#btnRotateBCW').addEventListener('click', () => rotateTeam('B', 'cw'));
  $('#btnRotateBCCW').addEventListener('click', () => rotateTeam('B', 'ccw'));
  $('#btnUndo').addEventListener('click', () => { const s = undo(); if (s) replaceState(s); });
  $('#btnRedo').addEventListener('click', () => { const s = redo(); if (s) replaceState(s); });

  function resetCurrentLayout() {
    const layoutId = state.layout;
    const rotation = state.rotation;
    ensureLayoutState(layoutId);
    const ls = state.layoutStates[layoutId];
    const baseView = getBaseView();
    ls.view = { ...baseView };
    ls.rotation = rotation;
    ls.notes = '';
    ls.objects = [];
    ls.drawings = [];
    ls.texts = [];
    ls.props = [];
    ls.selection = [];
    state.view = { ...baseView };
    state.rotation = rotation;
    state.notes = '';
    state.objects = ls.objects;
    state.drawings = ls.drawings;
    state.texts = ls.texts;
    state.props = ls.props;
    state.selection = [];
    commit();
  }

  $('#btnReset').addEventListener('click', () => { resetCurrentLayout(); });

  function exportFilename(ext) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
    return `volleyboard_${state.layout}_${stamp}.${ext}`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportViewBox() {
    return { ...getBaseView() };
  }

  function buildExportSvg(width, height, viewBox) {
    const clone = svg.cloneNode(true);
    const handles = clone.querySelector('#handles');
    if (handles) handles.remove();
    let defsEl = clone.querySelector('defs');
    if (!defsEl) {
      defsEl = document.createElementNS(svgNS, 'defs');
      clone.insertBefore(defsEl, clone.firstChild);
    }
    if (!defsEl.querySelector('#exportBg')) {
      const exportBg = document.createElementNS(svgNS, 'linearGradient');
      exportBg.setAttribute('id', 'exportBg');
      exportBg.setAttribute('x1', '0');
      exportBg.setAttribute('y1', '0');
      exportBg.setAttribute('x2', '0');
      exportBg.setAttribute('y2', '1');
      exportBg.innerHTML = `
        <stop offset="0%" stop-color="#2d9848"></stop>
        <stop offset="100%" stop-color="#1f502c"></stop>
      `;
      defsEl.appendChild(exportBg);
    }
    const bgRect = document.createElementNS(svgNS, 'rect');
    bgRect.setAttribute('x', String(viewBox.x));
    bgRect.setAttribute('y', String(viewBox.y));
    bgRect.setAttribute('width', String(viewBox.w));
    bgRect.setAttribute('height', String(viewBox.h));
    bgRect.setAttribute('fill', 'url(#exportBg)');
    clone.insertBefore(bgRect, clone.firstChild);
    clone.setAttribute('xmlns', svgNS);
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    clone.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    return new XMLSerializer().serializeToString(clone);
  }

  function getExportSize(viewBox) {
    const baseW = Math.max(1, svg.clientWidth);
    const scale = 2;
    let width = Math.round(baseW * scale);
    let height = Math.round(width * (viewBox.h / viewBox.w));
    const maxDim = 4096;
    if (Math.max(width, height) > maxDim) {
      const k = maxDim / Math.max(width, height);
      width = Math.round(width * k);
      height = Math.round(height * k);
    }
    return { width, height };
  }

  async function exportPng() {
    const prevSelection = getSelection();
    if (prevSelection.length) {
      state.selection = [];
      render();
    }
    const vb = exportViewBox();
    const { width, height } = getExportSize(vb);
    const svgString = buildExportSvg(width, height, vb);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, exportFilename('png'));
        URL.revokeObjectURL(url);
      }, 'image/png');
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
    if (prevSelection.length) {
      state.selection = prevSelection;
      render();
    }
  }

  function exportSvgString() {
    const prevSelection = getSelection();
    if (prevSelection.length) {
      state.selection = [];
      render();
    }
    const vb = exportViewBox();
    const width = 520;
    const height = Math.round(width * (vb.h / vb.w));
    const svgString = buildExportSvg(width, height, vb);
    if (prevSelection.length) {
      state.selection = prevSelection;
      render();
    }
    return svgString;
  }

  function serializeState() {
    const ls = state.layoutStates?.[state.layout] || defaultLayoutState(state.layout);
    return {
      version: state.version || 1,
      meta: state.meta || { createdAt: new Date().toISOString() },
      layout: state.layout,
      rotation: state.rotation,
      view: ls.view,
      notes: ls.notes,
      draw: state.draw,
      layers: state.layers,
      objects: ls.objects,
      drawings: ls.drawings,
      texts: ls.texts,
      props: ls.props,
    };
  }

  function applySerializedState(next) {
    if (!next || typeof next !== 'object') return;
    if (next.layout && LAYOUTS[next.layout]) {
      syncLayoutState();
      state.layout = next.layout;
      bindLayoutState(state.layout);
      updateLayoutTabs();
    }
    ensureLayoutState(state.layout);
    const ls = state.layoutStates[state.layout];
    ls.view = next.view || { ...(LAYOUTS[state.layout]?.view || LAYOUTS['full-h'].view) };
    ls.notes = next.notes || '';
    ls.objects = Array.isArray(next.objects) ? next.objects : [];
    ls.drawings = Array.isArray(next.drawings) ? next.drawings : [];
    ls.texts = Array.isArray(next.texts) ? next.texts : [];
    ls.props = Array.isArray(next.props) ? next.props : [];
    if (next.ball) ls.ball = next.ball;
    ls.selection = [];
    bindLayoutState(state.layout);
    if (typeof next.rotation === 'number') {
      state.rotation = ((next.rotation % 360) + 360) % 360;
      ls.rotation = state.rotation;
    }
    if (next.draw) state.draw = next.draw;
    if (state.draw && !state.draw.dash) state.draw.dash = 'solid';
    if (next.layers) state.layers = next.layers;
    commit();
  }

  // Import/Export dialogs
  const dlgIO = $('#dlgIO');
  const dlgTitle = $('#dlgTitle');
  const ioText = $('#ioText');
  const btnIOMain = $('#btnIOMain');

  function openExport() {
    dlgTitle.textContent = 'Export JSON';
    ioText.value = JSON.stringify(serializeState(), null, 2);
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
        applySerializedState(next);
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
  $('#btnExportImg').addEventListener('click', () => exportPng());

  // Notes binding
  notesEl.addEventListener('input', () => { state.notes = notesEl.value; commit(); });

  if (drawColorInput) {
    drawColorInput.addEventListener('input', () => {
      const value = drawColorInput.value || '#ffffff';
      const selIds = getSelection();
      if (selIds.length === 1) {
        const obj = objById(selIds[0]);
        if (obj) {
          if (obj.type === 'arrow') {
            return;
          }
          if (obj.type === 'freehand' || obj.type === 'rect' || obj.type === 'circle') {
            obj.style = obj.style || {};
            obj.style.color = value;
            commit();
            return;
          }
          if (obj.type === 'prop') {
            obj.color = value;
            commit();
            return;
          }
          if (obj.type === 'text') {
            obj.style = obj.style || {};
            obj.style.color = value;
            commit();
            return;
          }
        }
      }
      state.draw = state.draw || { color: '#ffffff', width: 0.08, dash: 'solid' };
      state.draw.color = value;
    });
  }

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

  // Context menu dropdown
  function closeContextMenu() {
    if (!ctxMenu) return;
    ctxMenu.hidden = true;
    ctxMenu.innerHTML = '';
  }

  function openMenuForSelection(clientX, clientY) {
    if (!ctxMenu) return;
    const selIds = getSelection();
    const sel = selIds.length === 1 ? objById(selIds[0]) : null;
    ctxMenu.innerHTML = '';
    ctxMenu.hidden = false;

    const wrapRect = stage.getBoundingClientRect();
    const left = clamp(clientX - wrapRect.left, 8, wrapRect.width - 8);
    const top = clamp(clientY - wrapRect.top, 8, wrapRect.height - 8);
    ctxMenu.style.left = `${left}px`;
    ctxMenu.style.top = `${top}px`;

    const title = document.createElement('div');
    title.className = 'menuTitle';
    title.textContent = sel ? 'Modifica' : 'Azioni';
    ctxMenu.appendChild(title);

    const row = (label, inputEl) => {
      const r = document.createElement('div');
      r.className = 'menuRow';
      const l = document.createElement('div');
      l.className = 'menuLabel';
      l.textContent = label;
      const w = document.createElement('div');
      w.appendChild(inputEl);
      r.appendChild(l);
      r.appendChild(w);
      ctxMenu.appendChild(r);
    };

    const actions = document.createElement('div');
    actions.className = 'menuActions';
    const addBtn = (label, fn, cls='btn') => {
      const b = document.createElement('button');
      b.className = cls;
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', () => { fn(); closeContextMenu(); });
      actions.appendChild(b);
    };

    if (!sel && selIds.length > 1) {
      addBtn('Elimina selezionati', () => removeSelected(), 'btn btnDanger');
      ctxMenu.appendChild(actions);
      return;
    }

    if (!sel) {
      addBtn('Aggiungi giocatore A', () => addPlayer('A', 4, 4.5, ''), 'btn');
      addBtn('Aggiungi giocatore B', () => addPlayer('B', 14, 4.5, ''), 'btn');
      addBtn('Aggiungi testo', () => { setMode(MODE.TEXT); }, 'btn');
      addBtn('Frecce', () => { setMode(MODE.ARROW); }, 'btn');
      addBtn('Reset', () => replaceState(DEFAULT_STATE()), 'btn btnDanger');
      ctxMenu.appendChild(actions);
      return;
    }

    if (sel.type === 'player') {
      const overrideInput = document.createElement('input');
      overrideInput.value = sel.overrideText || '';
      overrideInput.addEventListener('input', () => { sel.overrideText = overrideInput.value; commit(); });
      row('Testo speciale', overrideInput);

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

      addBtn('Duplica', () => { state.objects.push({ ...sel, id: ID(), x: sel.x+0.6, y: sel.y+0.6 }); commit(); }, 'btn');
      addBtn('Elimina', () => removeSelected(), 'btn btnDanger');
    } else if (sel.type === 'arrow') {
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

      const typeSel = document.createElement('select');
      [
        { id: 'straight', name: 'Dritta' },
        { id: 'curve', name: 'Curva' },
        { id: 'angle', name: 'Angolo' },
      ].forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        typeSel.appendChild(opt);
      });
      sel.kind = sel.kind || inferArrowKindFromPath(sel.path);
      typeSel.value = sel.kind;
      typeSel.addEventListener('change', () => {
        sel.kind = typeSel.value;
        const pts = ensureArrowPoints(sel);
        if (sel.kind === 'straight') {
          pts.mid = { x: (pts.start.x + pts.end.x) / 2, y: (pts.start.y + pts.end.y) / 2 };
        }
        sel.points = pts;
        sel.path = arrowPathFromPoints(pts, sel.kind);
        commit();
      });
      row('Tipo freccia', typeSel);

      const dashSel = document.createElement('select');
      [
        { id: 'solid', name: 'Pieno' },
        { id: 'dash', name: 'Tratteggio' },
        { id: 'dot', name: 'Puntini' },
      ].forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        dashSel.appendChild(opt);
      });
      sel.style = sel.style || {};
      dashSel.value = sel.style.dash || 'solid';
      dashSel.addEventListener('change', () => {
        sel.style = sel.style || {};
        sel.style.dash = dashSel.value;
        commit();
      });
      row('Tratto', dashSel);

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

      addBtn('Elimina', () => removeSelected(), 'btn btnDanger');
    } else if (sel.type === 'text') {
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

      addBtn('Elimina', () => removeSelected(), 'btn btnDanger');
    } else if (sel.type === 'prop') {
      addBtn('Duplica', () => { state.props.push({ ...sel, id: ID(), x: sel.x+0.6, y: sel.y+0.6 }); commit(); }, 'btn');
      addBtn('Elimina', () => removeSelected(), 'btn btnDanger');
    }

    ctxMenu.appendChild(actions);
  }

  // Interaction: pointer events for drag, arrow drawing, pan
  let activePointerId = null;
  let drag = null; // {id, startX,startY, objStartX,objStartY}
  let arrowDraft = null; // {team, start, cur, pathEl}
  let freehandDraft = null; // {points, pathEl, color, width}
  let shapeDraft = null; // {kind, start, cur, pathEl, color, width}
  let selectionBox = null;
  const DRAG_SELECT_PX = 6;
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
    if (!ENABLE_LONG_PRESS_MENU) {
      e.preventDefault();
      return;
    }
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
    if (!ENABLE_LONG_PRESS_MENU) return;
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      openMenuForSelection();
    }, 520);
  }

  function cancelLongPress() {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  gHandles.addEventListener('pointerdown', (e) => {
    const handle = e.target?.getAttribute?.('data-handle');
    const targetId = e.target?.getAttribute?.('data-target');
    if (!handle || !targetId) return;
    e.stopPropagation();
    e.preventDefault();
    gHandles.setPointerCapture(e.pointerId);
    activePointerId = e.pointerId;
    const pt = svgPointFromClient(e.clientX, e.clientY);
    if (handle.startsWith('arrow-')) {
      const obj = objById(targetId);
      if (!obj || obj.type !== 'arrow') return;
      const points = ensureArrowPoints(obj);
      drag = {
        type: 'arrow-point',
        id: targetId,
        point: handle.replace('arrow-', ''),
        start: pt,
        base: {
          start: { ...points.start },
          mid: { ...points.mid },
          end: { ...points.end },
        },
      };
      return;
    }
    if (targetId === '__group__') {
      const box = selectionBounds(getSelection());
      if (!box) return;
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      const items = getTransformableSelection()
        .map((o) => ({ id: o.id, x: o.x, y: o.y, rotation: o.rotation, scale: o.scale }));
      if (!items.length) return;
      if (handle === 'rotate') {
        const startAngle = Math.atan2(pt.y - cy, pt.x - cx) * 180 / Math.PI;
        drag = { type:'rotate-group', center:{x:cx,y:cy}, startAngle, items };
      } else if (handle === 'scale') {
        const startDist = Math.max(0.01, Math.hypot(pt.x - cx, pt.y - cy));
        drag = { type:'scale-group', center:{x:cx,y:cy}, startDist, items };
      }
      return;
    }

    const el = svg.querySelector(`[data-id="${targetId}"]`);
    if (!el) return;
    const box = elementBBoxInSvg(el);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const obj = objById(targetId) || (targetId === 'ball' ? state.ball : null);
    if (!obj) return;
    if (handle === 'rotate') {
      const startAngle = Math.atan2(pt.y - cy, pt.x - cx) * 180 / Math.PI;
      drag = { type:'rotate', id: targetId, center:{x:cx,y:cy}, startAngle, startRot: obj.rotation || 0 };
    } else if (handle === 'scale') {
      const startDist = Math.max(0.01, Math.hypot(pt.x - cx, pt.y - cy));
      drag = { type:'scale', id: targetId, center:{x:cx,y:cy}, startDist, startScale: obj.scale || 1 };
    }
  });

  svg.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    svg.focus();
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
      const sel = primarySelection() ? objById(primarySelection()) : null;
      const team = (sel && sel.team) ? sel.team : 'A';
      const color = teamColor(team);
      const width = state.draw?.width ?? 0.08;
      arrowDraft = {
        team,
        start: pt,
        cur: pt,
        mid: { x: pt.x, y: pt.y },
        color,
        width,
        kind: 'straight',
        dash: state.draw?.dash || 'solid',
      };
      const g = document.createElementNS(svgNS, 'g');
      const pathEl = document.createElementNS(svgNS, 'path');
      pathEl.setAttribute('d', `M ${pt.x} ${pt.y} L ${pt.x} ${pt.y}`);
      pathEl.setAttribute('fill', 'none');
      pathEl.setAttribute('stroke', 'currentColor');
      pathEl.setAttribute('stroke-width', String(width));
      pathEl.setAttribute('stroke-linecap', 'round');
      pathEl.setAttribute('stroke-linejoin', 'round');
      pathEl.setAttribute('opacity', '0.9');
      pathEl.style.color = color || teamColor(team);
      pathEl.style.pointerEvents = 'none';
      applyStrokeStyle(pathEl, { dash: arrowDraft.dash });

      const headEl = document.createElementNS(svgNS, 'path');
      headEl.setAttribute('opacity', '0.9');
      headEl.style.pointerEvents = 'none';
      drawArrowHead(headEl, pt, { x: 1, y: 0 }, arrowHeadSize(width), color || teamColor(team));

      g.appendChild(pathEl);
      g.appendChild(headEl);
      gDrawings.appendChild(g);
      arrowDraft.g = g;
      arrowDraft.pathEl = pathEl;
      arrowDraft.headEl = headEl;
      return;
    }

    if (mode === MODE.FREEHAND) {
      cancelLongPress();
      const color = state.draw?.color || '#ffffff';
      const width = state.draw?.width ?? 0.08;
      const pathEl = document.createElementNS(svgNS, 'path');
      pathEl.setAttribute('d', `M ${pt.x} ${pt.y}`);
      pathEl.setAttribute('fill', 'none');
      pathEl.setAttribute('stroke', color);
      pathEl.setAttribute('stroke-width', String(width));
      pathEl.setAttribute('stroke-linecap', 'round');
      pathEl.setAttribute('stroke-linejoin', 'round');
      pathEl.setAttribute('opacity', '0.9');
      pathEl.style.pointerEvents = 'none';
      gDrawings.appendChild(pathEl);
      freehandDraft = { points: [pt], pathEl, color, width };
      return;
    }

    if (mode === MODE.RECT || mode === MODE.CIRCLE) {
      cancelLongPress();
      const color = state.draw?.color || '#ffffff';
      const width = state.draw?.width ?? 0.08;
      const pathEl = document.createElementNS(svgNS, 'path');
      pathEl.setAttribute('d', `M ${pt.x} ${pt.y} L ${pt.x} ${pt.y}`);
      pathEl.setAttribute('fill', 'none');
      pathEl.setAttribute('stroke', color);
      pathEl.setAttribute('stroke-width', String(width));
      pathEl.setAttribute('stroke-linecap', 'round');
      pathEl.setAttribute('stroke-linejoin', 'round');
      pathEl.setAttribute('opacity', '0.9');
      pathEl.style.pointerEvents = 'none';
      gDrawings.appendChild(pathEl);
      shapeDraft = { kind: mode === MODE.RECT ? 'rect' : 'circle', start: pt, cur: pt, pathEl, color, width };
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
      if (e.shiftKey) {
        toggleSelection(targetId);
        return;
      }
      const selIds = getSelection();
      const isSel = isSelected(targetId);
      if (isSel && selIds.length > 1) {
        const items = selIds
          .map((id) => objById(id))
          .filter((o) => o && (o.type === 'player' || o.type === 'text' || o.type === 'prop'));
        if (items.some((o) => o.id === targetId)) {
          drag = { type:'move-multi', start: pt, items: items.map((o) => ({ id: o.id, x: o.x, y: o.y })) };
          return;
        }
      }
      if (!isSel) {
        drag = { type:'pending-select', id: targetId, start: pt, startClientX: e.clientX, startClientY: e.clientY };
        return;
      }
      const obj = objById(targetId);
      if (!obj) return;
      // start drag
      if (obj.type === 'player' || obj.type === 'text' || obj.type === 'prop') {
        drag = { type:'move', id: targetId, start: pt, startObj: { x: obj.x, y: obj.y } };
      } else if (obj.type === 'arrow') {
        const points = ensureArrowPoints(obj);
        drag = {
          type:'move-arrow',
          id: targetId,
          start: pt,
          base: {
            start: { ...points.start },
            mid: { ...points.mid },
            end: { ...points.end },
          },
        };
      }
      return;
    }

    if (mode === MODE.SELECT) {
      cancelLongPress();
      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('fill', 'rgba(94,234,212,0.12)');
      rect.setAttribute('stroke', 'rgba(94,234,212,0.7)');
      rect.setAttribute('stroke-width', '0.05');
      rect.setAttribute('stroke-dasharray', '0.18 0.12');
      rect.style.pointerEvents = 'none';
      gHandles.appendChild(rect);
      selectionBox = { start: pt, rectEl: rect, additive: e.shiftKey };
      drag = { type:'selectbox', start: pt, additive: e.shiftKey };
      updateSelectionRect(rect, pt, pt);
      return;
    }

    // click on empty court => clear selection
    clearSelection();
  });

  svg.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activePointerId) return;
    e.preventDefault();
    const pt = svgPointFromClient(e.clientX, e.clientY);

    // cancel long press if moved a bit
    if (longPressTimer && drag) cancelLongPress();

    if (drag?.type === 'arrow-point') {
      const obj = objById(drag.id);
      if (!obj) return;
      const points = ensureArrowPoints(obj);
      if (drag.point === 'start') {
        points.start = { ...pt };
      } else if (drag.point === 'end') {
        points.end = { ...pt };
      } else {
        points.mid = { ...pt };
        if (!obj.kind || obj.kind === 'straight') obj.kind = 'angle';
      }
      obj.points = points;
      obj.path = arrowPathFromPoints(points, obj.kind || 'straight');
      render();
      return;
    }

    if (drag?.type === 'move-arrow') {
      const obj = objById(drag.id);
      if (!obj) return;
      const dx = pt.x - drag.start.x;
      const dy = pt.y - drag.start.y;
      const points = ensureArrowPoints(obj);
      points.start = { x: drag.base.start.x + dx, y: drag.base.start.y + dy };
      points.mid = { x: drag.base.mid.x + dx, y: drag.base.mid.y + dy };
      points.end = { x: drag.base.end.x + dx, y: drag.base.end.y + dy };
      obj.points = points;
      obj.path = arrowPathFromPoints(points, obj.kind || 'straight');
      render();
      return;
    }

    if (drag?.type === 'rotate-group') {
      cancelLongPress();
      const cx = drag.center.x;
      const cy = drag.center.y;
      const ang = Math.atan2(pt.y - cy, pt.x - cx) * 180 / Math.PI;
      const delta = ang - drag.startAngle;
      const rad = delta * Math.PI / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      for (const it of drag.items) {
        const obj = objById(it.id);
        if (!obj) continue;
        const dx = it.x - cx;
        const dy = it.y - cy;
        obj.x = cx + dx * cos - dy * sin;
        obj.y = cy + dx * sin + dy * cos;
        obj.rotation = (it.rotation || 0) + delta;
      }
      render();
      return;
    }

    if (drag?.type === 'scale-group') {
      cancelLongPress();
      const cx = drag.center.x;
      const cy = drag.center.y;
      const dist = Math.max(0.01, Math.hypot(pt.x - cx, pt.y - cy));
      const ratio = clamp(dist / Math.max(0.01, drag.startDist), 0.2, 4);
      for (const it of drag.items) {
        const obj = objById(it.id);
        if (!obj) continue;
        const dx = it.x - cx;
        const dy = it.y - cy;
        obj.x = cx + dx * ratio;
        obj.y = cy + dy * ratio;
        obj.scale = clamp((it.scale || 1) * ratio, 0.2, 4);
      }
      render();
      return;
    }

    if (drag?.type === 'rotate' || drag?.type === 'scale') {
      cancelLongPress();
      const obj = objById(drag.id) || (drag.id === 'ball' ? state.ball : null);
      if (!obj) return;
      const cx = drag.center.x;
      const cy = drag.center.y;
      if (drag.type === 'rotate') {
        const ang = Math.atan2(pt.y - cy, pt.x - cx) * 180 / Math.PI;
        obj.rotation = (drag.startRot + (ang - drag.startAngle));
      } else if (drag.type === 'scale') {
        const dist = Math.max(0.01, Math.hypot(pt.x - cx, pt.y - cy));
        const next = (dist / Math.max(0.01, drag.startDist)) * drag.startScale;
        obj.scale = clamp(next, 0.2, 4);
      }
      render();
      return;
    }

    if (drag?.type === 'pan') {
      cancelLongPress();
      const dx = (e.clientX - drag.startClientX) * (state.view.w / svg.clientWidth);
      const dy = (e.clientY - drag.startClientY) * (state.view.h / svg.clientHeight);
      setViewBox({ x: drag.startView.x - dx, y: drag.startView.y - dy, w: drag.startView.w, h: drag.startView.h });
      state.view = { x: drag.startView.x - dx, y: drag.startView.y - dy, w: drag.startView.w, h: drag.startView.h };
      return;
    }

    if (drag?.type === 'selectbox' && selectionBox) {
      cancelLongPress();
      updateSelectionRect(selectionBox.rectEl, selectionBox.start, pt);
      return;
    }

    if (drag?.type === 'pending-select') {
      cancelLongPress();
      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      const dist = Math.hypot(dx, dy);
      if (dist >= DRAG_SELECT_PX) {
        const rect = document.createElementNS(svgNS, 'rect');
        rect.setAttribute('fill', 'rgba(94,234,212,0.12)');
        rect.setAttribute('stroke', 'rgba(94,234,212,0.7)');
        rect.setAttribute('stroke-width', '0.05');
        rect.setAttribute('stroke-dasharray', '0.18 0.12');
        rect.style.pointerEvents = 'none';
        gHandles.appendChild(rect);
        selectionBox = { start: drag.start, rectEl: rect, additive: false };
        drag = { type:'selectbox', start: drag.start, additive: false };
        updateSelectionRect(rect, drag.start, pt);
      }
      return;
    }

    if (arrowDraft) {
      arrowDraft.cur = pt;
      arrowDraft.mid = { x: (arrowDraft.start.x + pt.x) / 2, y: (arrowDraft.start.y + pt.y) / 2 };
      const points = { start: arrowDraft.start, mid: arrowDraft.mid, end: pt };
      const d = arrowPathFromPoints(points, arrowDraft.kind || 'straight');
      arrowDraft.pathEl.setAttribute('d', d);
      const dir = arrowDirection(points, arrowDraft.kind || 'straight');
      drawArrowHead(arrowDraft.headEl, pt, dir, arrowHeadSize(arrowDraft.width ?? 0.08), arrowDraft.color || teamColor(arrowDraft.team));
      return;
    }

    if (freehandDraft) {
      const last = freehandDraft.points[freehandDraft.points.length - 1];
      if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) > 0.04) {
        freehandDraft.points.push(pt);
        const d = freehandDraft.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        freehandDraft.pathEl.setAttribute('d', d);
      }
      return;
    }

    if (shapeDraft) {
      shapeDraft.cur = pt;
      const x1 = shapeDraft.start.x;
      const y1 = shapeDraft.start.y;
      const x2 = pt.x;
      const y2 = pt.y;
      if (shapeDraft.kind === 'rect') {
        const d = `M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2} L ${x1} ${y2} Z`;
        shapeDraft.pathEl.setAttribute('d', d);
      } else {
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const rx = Math.abs(x2 - x1) / 2;
        const ry = Math.abs(y2 - y1) / 2;
        const d = `M ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy}`;
        shapeDraft.pathEl.setAttribute('d', d);
      }
      return;
    }

    if (drag?.type === 'move-multi') {
      cancelLongPress();
      const dx = pt.x - drag.start.x;
      const dy = pt.y - drag.start.y;
      const bounds = currentCourtBounds();
      for (const it of drag.items) {
        const obj = objById(it.id);
        if (!obj) continue;
        obj.x = clamp(it.x + dx, bounds.minX ?? 0, bounds.maxX);
        obj.y = clamp(it.y + dy, bounds.minY ?? 0, bounds.maxY);
      }
      render();
      return;
    }

    if (drag?.type === 'move') {
      cancelLongPress();
      const id = drag.id;
      const dx = pt.x - drag.start.x;
      const dy = pt.y - drag.start.y;
      const bounds = currentCourtBounds();
      const obj = objById(id);
      if (obj) {
        obj.x = clamp(drag.startObj.x + dx, bounds.minX ?? 0, bounds.maxX);
        obj.y = clamp(drag.startObj.y + dy, bounds.minY ?? 0, bounds.maxY);
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

    if (drag?.type === 'pending-select') {
      setSelection(drag.id);
      drag = null;
      return;
    }

    if (drag?.type === 'selectbox' && selectionBox) {
      const pt = svgPointFromClient(e.clientX, e.clientY);
      const rect = updateSelectionRect(selectionBox.rectEl, selectionBox.start, pt);
      selectionBox.rectEl.remove();
      selectionBox = null;
      const minSize = 0.2;
      if (rect.w < minSize && rect.h < minSize) {
        if (!drag.additive) clearSelection();
      } else {
        const ids = idsInRect(rect);
        if (drag.additive) setSelection([...getSelection(), ...ids]);
        else setSelection(ids);
      }
      drag = null;
      return;
    }

    if (arrowDraft) {
      const pt = arrowDraft.cur;
      const s = arrowDraft.start;
      const dist = Math.hypot(pt.x - s.x, pt.y - s.y);
      if (arrowDraft.g) gDrawings.removeChild(arrowDraft.g);
      if (dist > 0.35) {
        const points = {
          start: { x: s.x, y: s.y },
          mid: { x: (s.x + pt.x) / 2, y: (s.y + pt.y) / 2 },
          end: { x: pt.x, y: pt.y },
        };
        const kind = arrowDraft.kind || 'straight';
        const d = arrowPathFromPoints(points, kind);
        state.drawings.push({
          id: ID(),
          type:'arrow',
          team: arrowDraft.team,
          path: d,
          points,
          kind,
          style:{ width: String(arrowDraft.width ?? 0.08), opacity:'0.9', dash: arrowDraft.dash || 'solid' },
        });
        setSelection(state.drawings[state.drawings.length - 1].id);
        commit();
      } else {
        render();
      }
      arrowDraft = null;
      return;
    }

    if (freehandDraft) {
      const pts = freehandDraft.points;
      gDrawings.removeChild(freehandDraft.pathEl);
      if (pts.length > 1) {
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        state.drawings.push({ id: ID(), type:'freehand', path: d, style:{ width: String(freehandDraft.width ?? 0.08), opacity:'0.9', color: freehandDraft.color } });
        setSelection(state.drawings[state.drawings.length - 1].id);
        commit();
      } else {
        render();
      }
      freehandDraft = null;
      return;
    }

    if (shapeDraft) {
      const x1 = shapeDraft.start.x;
      const y1 = shapeDraft.start.y;
      const x2 = shapeDraft.cur.x;
      const y2 = shapeDraft.cur.y;
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      gDrawings.removeChild(shapeDraft.pathEl);
      if (w > 0.2 || h > 0.2) {
        let d = '';
        if (shapeDraft.kind === 'rect') {
          d = `M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2} L ${x1} ${y2} Z`;
        } else {
          const cx = (x1 + x2) / 2;
          const cy = (y1 + y2) / 2;
          const rx = Math.abs(x2 - x1) / 2;
          const ry = Math.abs(y2 - y1) / 2;
          d = `M ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy}`;
        }
        state.drawings.push({ id: ID(), type: shapeDraft.kind, path: d, style:{ width: String(shapeDraft.width ?? 0.08), opacity:'0.9', color: shapeDraft.color } });
        setSelection(state.drawings[state.drawings.length - 1].id);
        commit();
      } else {
        render();
      }
      shapeDraft = null;
      return;
    }

    if (drag) {
      if (drag.type === 'move' || drag.type === 'move-multi') commit();
      if (drag.type === 'arrow-point' || drag.type === 'move-arrow') commit();
      if (drag.type === 'pan') commit();
      if (drag.type === 'rotate' || drag.type === 'scale' || drag.type === 'rotate-group' || drag.type === 'scale-group') commit();
      drag = null;
    }
  });

  svg.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  svg.addEventListener('drop', (e) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      const pt = svgPointFromClient(e.clientX, e.clientY);
      if (data.kind === 'player') {
        addPlayerFromTool(data.role, pt.x, pt.y);
      } else {
        addProp(data.kind, pt.x, pt.y, { role: data.role, color: data.color });
      }
    } catch {}
  });

  svg.addEventListener('pointercancel', () => {
    cancelLongPress();
    arrowDraft = null;
    freehandDraft = null;
    shapeDraft = null;
    if (selectionBox?.rectEl) selectionBox.rectEl.remove();
    selectionBox = null;
    drag = null;
    activePointerId = null;
    render();
  });

  // Click selection for drawings
  svg.addEventListener('click', (e) => {
    if (e.shiftKey) return;
    const id = hitTestTarget(e.target);
    if (!id) return;
    const obj = objById(id);
    if (obj && (obj.type === 'arrow' || obj.type === 'text')) {
      setSelection(id);
    }
  }, true);

  // Wheel zoom disabled

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
    const targetId = hitTestTarget(e.target);
    if (targetId) {
      if (e.shiftKey) toggleSelection(targetId);
      else setSelection(targetId);
    }
    openMenuForSelection(e.clientX, e.clientY);
  });

  stage.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  window.addEventListener('pointerdown', (e) => {
    if (!ctxMenu || ctxMenu.hidden) return;
    if (!ctxMenu.contains(e.target)) closeContextMenu();
  });

  // Select drawings by clicking them (they are paths)
  gDrawings.addEventListener('pointerdown', (e) => {
    if (e.shiftKey) return;
    const id = hitTestTarget(e.target);
    if (id) {
      if (getSelection().length > 1 && isSelected(id)) return;
      setSelection(id);
    }
  }, true);

  gPlayers.addEventListener('pointerdown', (e) => {
    if (e.shiftKey) return;
    const id = hitTestTarget(e.target);
    if (id) {
      if (getSelection().length > 1 && isSelected(id)) return;
      setSelection(id);
    }
  }, true);

  gProps.addEventListener('pointerdown', (e) => {
    if (e.shiftKey) return;
    const id = hitTestTarget(e.target);
    if (id) {
      if (getSelection().length > 1 && isSelected(id)) return;
      setSelection(id);
    }
  }, true);

  gText.addEventListener('pointerdown', (e) => {
    if (e.shiftKey) return;
    const id = hitTestTarget(e.target);
    if (id) {
      if (getSelection().length > 1 && isSelected(id)) return;
      setSelection(id);
    }
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
  if (!EMBEDDED) {
    window.addEventListener('beforeunload', saveLocal);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveLocal(); });
  }

  function resetLayoutRotationsToDefaults() {
    if (!state.layoutStates) return;
    for (const id of Object.keys(state.layoutStates)) {
      state.layoutStates[id].rotation = defaultRotationFor(id);
    }
    state.rotation = state.layoutStates[state.layout]?.rotation ?? defaultRotationFor(state.layout);
  }

  function removePlaceholderTexts() {
    const isPlaceholder = (t) => (t.text || '') === 'Testo'
      && (t.team || 'A') === 'A'
      && (t.style?.size ?? 0.55) === 0.55;
    let changed = false;
    const lsMap = state.layoutStates || {};
    for (const key of Object.keys(lsMap)) {
      const ls = lsMap[key];
      if (!Array.isArray(ls.texts)) continue;
      const before = ls.texts.length;
      ls.texts = ls.texts.filter((t) => !isPlaceholder(t));
      if (before !== ls.texts.length) changed = true;
    }
    state.texts = lsMap[state.layout]?.texts || state.texts;
    return changed;
  }

  // Selection / delete with long press via menu
  // Auto-load state
  renderToolbox();
  const loaded = EMBEDDED ? false : loadLocal();
  if (loaded) {
    resetLayoutRotationsToDefaults();
    removePlaceholderTexts();
    render();
  } else {
    render();
  }
  updateLayoutTabs();

  // Auto commit after first render to have baseline
  pushHistory(state);

  window.VOLLEY_API = {
    getState: () => serializeState(),
    setState: (next) => applySerializedState(next),
    exportSvg: () => exportSvgString(),
    subscribe: (fn) => {
      if (typeof fn !== 'function') return () => {};
      changeListeners.add(fn);
      return () => changeListeners.delete(fn);
    },
  };
  window.VOLLEY_READY = true;
  try { window.dispatchEvent(new Event('volleyboard-ready')); } catch {}

})();
