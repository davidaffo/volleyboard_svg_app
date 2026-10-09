'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const sandbox = {
  module: { exports: {} },
  require: () => ({ Plugin: class {}, Modal: class {} }),
};
vm.runInNewContext(fs.readFileSync(require.resolve('../main.js'), 'utf8'), sandbox);
const Plugin = sandbox.module.exports;
const board = (notes, blockId) => ({ version: 1, meta: { createdAt: 'test', ...(blockId ? { blockId } : {}) }, notes });
const fence = (state) => '```volleyboard\n' + JSON.stringify(state, null, 2) + '\n```';

function fixture(text) {
  let writes = 0;
  const plugin = new Plugin();
  plugin.app = { vault: {
    getAbstractFileByPath: () => ({}),
    process: async (_file, transform) => { text = transform(text); writes++; },
  } };
  return {
    save: (source, state, opts) => plugin.persistState({ sourcePath: 'note.md' }, JSON.stringify(source), state, opts),
    text: () => text,
    writes: () => writes,
  };
}

test('a wrong section line cannot overwrite the board above', async () => {
  const first = board('first');
  const second = board('second');
  const f = fixture(fence(first) + '\n\n' + fence(second));
  const next = board('edited', 'new-id');
  await f.save(second, next, { blockLineStart: 0, blockId: 'new-id' });
  assert.equal(f.text(), fence(first) + '\n\n' + fence(next));
});

test('a stable ID follows a board when note lines change', async () => {
  const first = board('first', 'one');
  const second = board('second', 'two');
  const prefix = 'Added text\n\n';
  const f = fixture(prefix + fence(first) + '\n' + fence(second));
  const next = board('edited', 'two');
  await f.save(second, next, { blockLineStart: 0, blockId: 'two' });
  assert.equal(f.text(), prefix + fence(first) + '\n' + fence(next));
});

test('identical legacy boards use the clicked block line', async () => {
  const same = board('same');
  const start = fence(same).split('\n').length + 1;
  const f = fixture(fence(same) + '\n\n' + fence(same));
  const next = board('edited', 'new-id');
  await f.save(same, next, { blockLineStart: start, blockId: 'new-id' });
  assert.equal(f.text(), fence(same) + '\n\n' + fence(next));
});

test('duplicate IDs require a matching source instead of picking the first', async () => {
  const first = board('first', 'copied');
  const second = board('second', 'copied');
  const f = fixture(fence(first) + '\n' + fence(second));
  const next = board('edited', 'copied');
  await f.save(second, next, { blockLineStart: 0, blockId: 'copied' });
  assert.equal(f.text(), fence(first) + '\n' + fence(next));
});

test('missing or ambiguous targets leave the note untouched', async () => {
  const same = board('same');
  const text = fence(same) + '\n' + fence(same);
  for (const source of [same, board('removed')]) {
    const f = fixture(text);
    await assert.rejects(f.save(source, board('edited'), { blockId: 'missing' }), /ambiguo/);
    assert.equal(f.text(), text);
    assert.equal(f.writes(), 0);
  }
});

test('a foreign ID at the old position cannot be replaced', async () => {
  const original = board('same', 'original');
  const other = board('same', 'other');
  const f = fixture(fence(other));
  await assert.rejects(f.save(original, board('edited', 'original'), { blockLineStart: 0, blockId: 'original' }));
  assert.equal(f.text(), fence(other));
});

test('indented blocks and Windows newlines are preserved', async () => {
  const original = board('original');
  const next = board('edited', 'new-id');
  const indent = (text) => text.split('\n').map((line) => '  ' + line).join('\r\n');
  const f = fixture('Intro\r\n' + indent(fence(original)) + '\r\nEnd');
  await f.save(original, next, { blockId: 'new-id' });
  assert.equal(f.text(), 'Intro\r\n' + indent(fence(next)) + '\r\nEnd');
});

test('an unclosed fence cannot be overwritten', async () => {
  const original = board('original');
  const text = '```volleyboard\n' + JSON.stringify(original);
  const f = fixture(text);
  await assert.rejects(f.save(original, board('edited'), { blockLineStart: 0 }));
  assert.equal(f.text(), text);
});
