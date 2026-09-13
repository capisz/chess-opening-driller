#!/usr/bin/env node
/**
 * Builds index.html from src/.
 *
 *   node tools/build.js
 *
 * The app ships as one self-contained file: the shell (markup + CSS), the
 * chess engine, and the app logic are concatenated into a single <script>,
 * with the piece sprite inlined where app.js leaves a placeholder.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const shell = read('src/shell.html');
const engine = read('src/engine.js');
const sprite = read('src/pieces.sprite.json').trim();
const presets = read('src/presets.json').trim();
let app = read('src/app.js');

for (const [marker, value] of [
  ['const SPRITE = {};/*SPRITE*/', 'const SPRITE = ' + sprite + ';'],
  ['const PRESETS = [];/*PRESETS*/', 'const PRESETS = ' + presets + ';']
]) {
  if (app.indexOf(marker) < 0) {
    console.error('src/app.js is missing a placeholder: ' + marker);
    process.exit(1);
  }
  app = app.replace(marker, value);
}

const out = shell + engine + app + '</script>\n</body>\n</html>\n';
fs.writeFileSync(path.join(root, 'index.html'), out);
console.log('index.html written — ' + Math.round(Buffer.byteLength(out) / 1024) + ' KB');
