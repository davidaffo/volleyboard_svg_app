#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const webDir = path.join(root, 'docs');
const pluginDir = path.join(root, 'obsidian-plugin', 'volleyboard-svg');
const templatePath = path.join(root, 'scripts', 'obsidian-main.template.js');

const html = fs.readFileSync(path.join(webDir, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(webDir, 'style.css'), 'utf8');
const js = fs.readFileSync(path.join(webDir, 'app.js'), 'utf8');
const template = fs.readFileSync(templatePath, 'utf8');

const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
if (!bodyMatch) {
  throw new Error('Cannot find <body> in docs/index.html');
}
let body = bodyMatch[1];
// Remove script tags from the docs HTML; we inline app.js ourselves.
body = body.replace(/<script[\s\S]*?<\/script>/gi, '').trim();

const filled = template
  .replace('__WEB_HTML__', () => JSON.stringify(body))
  .replace('__WEB_CSS__', () => JSON.stringify(css))
  .replace('__WEB_JS__', () => JSON.stringify(js));

fs.writeFileSync(path.join(pluginDir, 'main.js'), filled, 'utf8');

console.log('obsidian-plugin/volleyboard-svg/main.js updated');
