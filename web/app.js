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
    layers: { players: true, drawings: true, text: true },
    objects: [], // {id,type,team,x,y,role,label,style,...}
    drawings: [], // {id,type,path,team,style}
    texts: [], // {id,type,x,y,text,team,style}
    props: [], // {id,type,kind,x,y,role,color}
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

  const TOOLBOX_ITEMS = [
    { id:'role-P', label:'P', kind:'player', role:'P' },
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
  const toolGrid = $('#toolGrid');
  const zoomSlider = $('#zoomSlider');
  const ENABLE_LONG_PRESS_MENU = false;

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
    <marker id="arrowHead" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"></path>
    </marker>
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
      selection: null,
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
    state.selection = ls.selection || null;
  }

  function syncLayoutState() {
    const ls = state.layoutStates?.[state.layout];
    if (!ls) return;
    ls.view = state.view;
    ls.rotation = state.rotation;
    ls.notes = state.notes || '';
    ls.selection = state.selection || null;
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
    const zoom = baseView.w / nextView.w;
    chipZoom.textContent = `Zoom: ${Math.round(zoom*100)}%`;
    if (zoomSlider) zoomSlider.value = String(Math.round(zoom*100));
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
    return teamId === 'A' ? 'rgba(94,234,212,0.95)' : 'rgba(244,114,182,0.95)';
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
      const rot = o.rotation || 0;
      const scale = o.scale || 1;
      g.setAttribute('transform', `translate(${o.x} ${o.y}) rotate(${rot}) scale(${scale})`);
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
        big.setAttribute('font-size', '0.32');
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
        big.setAttribute('font-size', '0.32');
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
        txt.setAttribute('y', '-0.06');
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('font-size', '0.23');
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
        role.setAttribute('y', '0.18');
        role.setAttribute('text-anchor', 'middle');
        role.setAttribute('font-size', '0.17');
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

  function drawPropShape(g, p) {
    const add = (tag, attrs={}) => {
      const el = document.createElementNS(svgNS, tag);
      for (const [k,v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      g.appendChild(el);
      return el;
    };

    if (p.kind === 'player') {
      add('circle', { cx:0, cy:0, r:0.32, fill:'rgba(94,234,212,0.9)', stroke:'rgba(0,0,0,0.25)', 'stroke-width':0.03 });
      add('circle', { cx:-0.1, cy:-0.1, r:0.05, fill:'rgba(255,255,255,0.25)' });
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

      if (state.selection === p.id) {
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
      el.setAttribute('fill', 'currentColor');
      el.style.color = teamColor(t.team);
      if (angle || rot) el.setAttribute('transform', `rotate(${-(angle) + rot})`);
      el.textContent = t.text;

      if (state.selection === t.id) {
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

  function renderHandles() {
    gHandles.innerHTML = '';
    const id = state.selection;
    if (!id) return;
    const el = svg.querySelector(`[data-id="${id}"]`);
    if (!el) return;
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
  }

  function renderInspector() {
    if (inspectorOverlay) inspectorOverlay.style.display = 'none';
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
    statObjects.textContent = String(state.objects.length + state.drawings.length + state.texts.length + state.props.length);
  }

  function render() {
    notesEl.value = state.notes || '';
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
    const label = m === MODE.SELECT ? 'Selezione' : (m === MODE.ARROW ? 'Frecce' : (m === MODE.TEXT ? 'Testo' : 'Pan'));
    chipMode.textContent = `Modalità: ${label}`;
  }

  function commit() {
    syncLayoutState();
    pushHistory(state);
    render();
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
        selection: state.selection || null,
      };
    }
    for (const id of Object.keys(LAYOUTS)) ensureLayoutState(id);
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
      state.selection = null;
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
    const id = state.selection;
    if (!id) return;
    if (id === 'ball') { state.ball.visible = false; state.selection = null; commit(); return; }
    state.objects = state.objects.filter(o => o.id !== id);
    state.drawings = state.drawings.filter(d => d.id !== id);
    state.texts = state.texts.filter(t => t.id !== id);
    state.props = state.props.filter(p => p.id !== id);
    state.selection = null;
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
    const sel = state.selection ? objById(state.selection) : null;
    const team = (sel && sel.team) ? sel.team : 'A';
    addPlayer(team, x, y, '', role || 'X');
  }

  function renderToolbox() {
    if (!toolGrid) return;
    toolGrid.innerHTML = '';
    const iconFor = (item) => {
      if (item.kind === 'role') return item.role || 'R';
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
    const prevSelection = state.selection;
    if (prevSelection) {
      state.selection = null;
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
    if (prevSelection) {
      state.selection = prevSelection;
      render();
    }
  }

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
      props: ls.props,
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
        ls.props = Array.isArray(next.props) ? next.props : [];
        if (next.ball) ls.ball = next.ball;
        ls.selection = null;
        bindLayoutState(state.layout);
        if (typeof next.rotation === 'number') {
          state.rotation = ((next.rotation % 360) + 360) % 360;
          ls.rotation = state.rotation;
        }
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
  $('#btnExportImg').addEventListener('click', () => exportPng());

  if (zoomSlider) {
    zoomSlider.addEventListener('input', () => {
      const base = getBaseView();
      const z = clamp(Number(zoomSlider.value) / 100, 0.5, 2);
      const w = base.w / z;
      const h = base.h / z;
      const cx = state.view.x + state.view.w / 2;
      const cy = state.view.y + state.view.h / 2;
      setViewBox({ x: cx - w / 2, y: cy - h / 2, w, h });
      state.view = { x: cx - w / 2, y: cy - h / 2, w, h };
      commit();
    });
  }

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

  // Context menu dropdown
  function closeContextMenu() {
    if (!ctxMenu) return;
    ctxMenu.hidden = true;
    ctxMenu.innerHTML = '';
  }

  function openMenuForSelection(clientX, clientY) {
    if (!ctxMenu) return;
    const sel = state.selection ? objById(state.selection) : null;
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
      const startDist = Math.hypot(pt.x - cx, pt.y - cy);
      drag = { type:'scale', id: targetId, center:{x:cx,y:cy}, startDist, startScale: obj.scale || 1 };
    }
  });

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
      if (obj.type === 'player' || obj.type === 'text' || obj.type === 'prop') {
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
      if (drag.type === 'rotate' || drag.type === 'scale') commit();
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
    const targetId = hitTestTarget(e.target);
    if (targetId) setSelection(targetId);
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
    const id = hitTestTarget(e.target);
    if (id) setSelection(id);
  }, true);

  gPlayers.addEventListener('pointerdown', (e) => {
    const id = hitTestTarget(e.target);
    if (id) setSelection(id);
  }, true);

  gProps.addEventListener('pointerdown', (e) => {
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
  const loaded = loadLocal();
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

})();
