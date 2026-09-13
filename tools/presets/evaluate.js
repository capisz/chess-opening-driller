/**
 * Evaluates every position in the preset repertoires with Stockfish and writes
 * the results back into presets.json as one array of centipawns per preset,
 * in the same depth-first node order the app walks at runtime.
 *
 *   node evalpresets.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const C = require('./engine.js');

const DEPTH = 12;
const ENGINE = 'node_modules/stockfish/bin/stockfish-18-lite-single.js';
const presets = JSON.parse(fs.readFileSync('build/presets.json', 'utf8'));
const CACHE = 'build/evalcache.json';
const BUDGET = 68000;   // stop and save before the shell call times out
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};

// the walk both sides must agree on: depth first, children in parsed order
function walkNodes(roots, cb) {
  roots.forEach((r) => {
    const go = (n) => { for (const c of n.children) { cb(c); go(c); } };
    go(r.node);
  });
}

const order = [];            // [{preset, fen}] in output order
const unique = new Map();    // fen -> cp, filled in below
for (const p of presets) {
  const roots = C.parsePgn(p.pgn).roots;
  const fens = [];
  walkNodes(roots, (n) => {
    const fen = C.toFen(n.state).split(' ').slice(0, 4).join(' ');
    fens.push(fen);
    if (!unique.has(fen)) unique.set(fen, fen in cache ? cache[fen] : null);
  });
  order.push({ id: p.id, fens });
}
const todo = Array.from(unique.keys()).filter((f) => !(f in cache));
console.log(presets.length + ' presets, ' + order.reduce((a, o) => a + o.fens.length, 0) +
  ' positions, ' + todo.length + ' unique');

const eng = spawn('node', [ENGINE]);
let buf = '', waiting = null, lastScore = null, done = 0;
const t0 = Date.now();

eng.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    const m = /score (cp|mate) (-?\d+)/.exec(line);
    if (m) lastScore = m[1] === 'cp' ? parseInt(m[2], 10)
      : (parseInt(m[2], 10) > 0 ? 2000 : -2000);
    if (line.indexOf('bestmove') === 0 && waiting) {
      const w = waiting; waiting = null;
      w(lastScore === null ? 0 : lastScore);
    }
  }
});

const send = (s) => eng.stdin.write(s + '\n');

function evaluate(fen) {
  return new Promise((res) => {
    lastScore = null;
    waiting = res;
    send('position fen ' + fen + ' 0 1');
    send('go depth ' + DEPTH);
  });
}

(async () => {
  send('uci');
  send('setoption name Hash value 128');
  send('isready');
  await new Promise((r) => setTimeout(r, 1200));

  for (const fen of todo) {
    if (Date.now() - t0 > BUDGET) break;
    const cp = await evaluate(fen);
    // UCI reports from the side to move; store everything from White's side
    const white = fen.split(' ')[1] === 'b' ? -cp : cp;
    unique.set(fen, white);
    cache[fen] = white;
    if (++done % 250 === 0) {
      const rate = done / ((Date.now() - t0) / 1000);
      console.log(done + '/' + todo.length + '  ' + rate.toFixed(1) + '/s  eta ' +
        Math.round((todo.length - done) / rate) + 's');
    }
  }

  fs.writeFileSync(CACHE, JSON.stringify(cache));
  const left = todo.length - done;
  console.log('evaluated ' + done + ' this run, ' + left + ' still missing');
  if (!left) {
    for (const p of presets) {
      const o = order.find((x) => x.id === p.id);
      p.ev = o.fens.map((f) => cache[f]);
    }
    fs.writeFileSync('build/presets.json', JSON.stringify(presets));
    console.log('PRESETS WRITTEN');
  }
  send('quit');
  process.exit(0);
})();
