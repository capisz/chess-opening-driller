const { spawn } = require('child_process');
const fs = require('fs'); const C = require('./engine.js');
const P = JSON.parse(fs.readFileSync('build/presets.json','utf8'));
const roots = [...new Set(P.map(p => {
  const r = C.parsePgn(p.pgn).roots[0].node;
  return C.toFen(r.state).split(' ').slice(0,4).join(' ');
}))];
console.log('unique start positions:', roots.length);
const eng = spawn('node', ['node_modules/stockfish/bin/stockfish-18-lite-single.js']);
let buf='', waiting=null, last=null;
eng.stdout.on('data', d => { buf += d; let i;
  while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0,i).trim(); buf = buf.slice(i+1);
    const m = /score (cp|mate) (-?\d+)/.exec(l);
    if (m) last = m[1]==='cp' ? +m[2] : (+m[2] > 0 ? 2000 : -2000);
    if (l.startsWith('bestmove') && waiting) { const w=waiting; waiting=null; w(last); } } });
const send = s => eng.stdin.write(s+'\n');
(async () => {
  send('uci'); send('isready');
  await new Promise(r => setTimeout(r, 1200));
  const map = {};
  for (const fen of roots) {
    last = null;
    const cp = await new Promise(res => { waiting = res; send('position fen '+fen+' 0 1'); send('go depth 12'); });
    map[fen] = fen.split(' ')[1]==='b' ? -cp : cp;
    console.log('  ', fen.slice(0,30)+'...', map[fen]);
  }
  for (const p of P) {
    const r = C.parsePgn(p.pgn).roots[0].node;
    p.ev0 = map[C.toFen(r.state).split(' ').slice(0,4).join(' ')];
  }
  fs.writeFileSync('build/presets.json', JSON.stringify(P));
  console.log('written:', P.map(p=>p.ev0).join(' '));
  process.exit(0);
})();
