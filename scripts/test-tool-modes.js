'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

// Exercise the production toolbar and SVG event handlers with lightweight DOM stubs.
const source = fs.readFileSync(require.resolve('../docs/app.js'), 'utf8');
function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
}
function element() {
  const handlers = {};
  return {
    handlers,
    addEventListener: (name, handler) => { handlers[name] = handler; },
    setAttribute() {}, appendChild() {}, removeChild() {}, focus() {},
    setPointerCapture() {}, releasePointerCapture() {},
    style: {},
  };
}
function editor() {
  const buttons = new Map();
  const svg = element();
  let nextId = 0;
  const ctx = {
    $: (selector) => {
      if (!buttons.has(selector)) buttons.set(selector, element());
      return buttons.get(selector);
    },
    svg, document: { createElementNS: element }, svgNS: 'svg',
    state: { mode: 'select', drawings: [], texts: [], draw: {} },
    MODE: { SELECT: 'select', ARROW: 'arrow', FREEHAND: 'freehand', RECT: 'rect', CIRCLE: 'circle', TEXT: 'text', PAN: 'pan' },
    drawingTools: [['#btnArrow', 'arrow'], ['#btnFreehand', 'freehand'], ['#btnRect', 'rect'], ['#btnCircle', 'circle'], ['#btnText', 'text']],
    toolLocked: false, spaceDown: false, toolboxTeam: 'A',
    arrowDraft: null, freehandDraft: null, shapeDraft: null, drag: null, selectionBox: null,
    gDrawings: element(),
    render() {}, commit() {}, setSelection() {},
    startLongPress() {}, cancelLongPress() {},
    svgPointFromClient: (x, y) => ({ x, y }), hitTestTarget: () => null,
    teamColor: () => '#fff', applyStrokeStyle() {}, drawArrowHead() {},
    arrowHeadSize: () => 1, arrowPathFromPoints: () => 'path',
    arrowDirection: () => ({ x: 1, y: 0 }),
    ID: () => String(++nextId), t: () => 'Text',
  };
  ctx.addTextAt = (x, y, text) => ctx.state.texts.push({ x, y, text });
  vm.createContext(ctx);
  vm.runInContext(section('  function setMode(m,', "  $('#btnRotateACW')"), ctx);
  // Only tool placement is needed from pointerdown; selection/dragging is unrelated.
  vm.runInContext(section("  svg.addEventListener('pointerdown', (e) => {\n    e.preventDefault();", '    // select/drag objects') + '\n  });', ctx);
  vm.runInContext(section("  svg.addEventListener('pointerup',", "  svg.addEventListener('dragover',"), ctx);
  return {
    ctx,
    click(selector, locked = false) {
      const b = buttons.get(selector);
      b.handlers.click({ detail: 1 });
      if (locked) {
        b.handlers.click({ detail: 2 });
        b.handlers.dblclick({ preventDefault() {} });
      }
    },
    place() {
      svg.handlers.pointerdown({ preventDefault() {}, pointerId: 1, clientX: 0, clientY: 0 });
      if (ctx.arrowDraft) ctx.arrowDraft.cur = { x: 2, y: 2 };
      if (ctx.freehandDraft) ctx.freehandDraft.points.push({ x: 2, y: 2 });
      if (ctx.shapeDraft) ctx.shapeDraft.cur = { x: 2, y: 2 };
      svg.handlers.pointerup({ preventDefault() {}, pointerId: 1 });
    },
  };
}

for (const [button, mode] of [['#btnArrow', 'arrow'], ['#btnFreehand', 'freehand'], ['#btnRect', 'rect'], ['#btnCircle', 'circle'], ['#btnText', 'text']]) {
  test(mode + ': single click returns to selection after insertion', () => {
    const e = editor();
    e.click(button);
    assert.equal(e.ctx.state.mode, mode);
    e.place();
    assert.equal(e.ctx.state.mode, 'select');
    assert.equal(e.ctx.state.drawings.length + e.ctx.state.texts.length, 1);
  });
  test(mode + ': double click keeps the tool active for successive insertions', () => {
    const e = editor();
    e.click(button, true);
    e.place();
    e.place();
    assert.equal(e.ctx.state.mode, mode);
    assert.equal(e.ctx.state.drawings.length + e.ctx.state.texts.length, 2);
    e.click('#btnSelectMode');
    assert.equal(e.ctx.state.mode, 'select');
    assert.equal(e.ctx.toolLocked, false);
  });
}

test('changing tools clears persistent placement', () => {
  const e = editor();
  e.click('#btnArrow', true);
  e.click('#btnRect');
  e.place();
  assert.equal(e.ctx.state.mode, 'select');
});

test('an empty arrow gesture keeps the tool ready for a valid insertion', () => {
  const e = editor();
  e.click('#btnArrow');
  e.ctx.svg.handlers.pointerdown({ preventDefault() {}, pointerId: 1, clientX: 0, clientY: 0 });
  e.ctx.svg.handlers.pointerup({ preventDefault() {}, pointerId: 1 });
  assert.equal(e.ctx.state.mode, 'arrow');
  assert.equal(e.ctx.state.drawings.length, 0);
});
