const { spawn } = require('child_process');
const fs = require('fs'); const C = require('./engine.js');
const CACHE='build/evalcache.json';
const cache = JSON.parse(fs.readFileSync(CACHE,'utf8'));
const presets = JSON.parse(fs.readFileSync('build/presets.json','utf8'));
const key = s => C.toFen(s).split(' ').slice(0,4).join(' ');

const text = fs.readFileSync('/mnt/user-data/uploads/lichess_study_game-study_by_capiszz_2026_09_13.pgn','utf8');
const games = C.collectGames(text);
const opts = {color:'w', maxPlies:20, minGames:1, topReplies:4, minElo:0, pick:'score', minPick:1};
const t = C.newTally(); C.tallyInto(t, games, 0, games.length, opts);
const pgn = C.treeToPgn(C.pruneTree({root:t.root}, opts), 'w', "Van't Kruijs, b3 setup");
const parsed = C.parsePgn(pgn);
const lines = C.enumerateLines(parsed.roots).filter(l=>l.nodes.some(n=>C.colorOf(n.move.piece)==='w'));
const nodes = []; const go = n => { for (const c of n.children) { nodes.push(c); go(c); } };
parsed.roots.forEach(r => go(r.node));
const need = [...new Set(nodes.map(n=>key(n.state)).concat([key(parsed.roots[0].node.state)]))].filter(f=>!(f in cache));
console.log('lines', lines.length, '| positions', nodes.length, '| new evals needed', need.length, '| parse errors', parsed.errors.length);

const eng = spawn('node',['node_modules/stockfish/bin/stockfish-18-lite-single.js']);
let buf='', waiting=null, last=null;
eng.stdout.on('data', d => { buf+=d; let i;
  while((i=buf.indexOf('\n'))>=0){ const l=buf.slice(0,i).trim(); buf=buf.slice(i+1);
    const m=/score (cp|mate) (-?\d+)/.exec(l);
    if(m) last = m[1]==='cp' ? +m[2] : (+m[2]>0?2000:-2000);
    if(l.startsWith('bestmove') && waiting){ const w=waiting; waiting=null; w(last); } } });
const send = s => eng.stdin.write(s+'\n');
(async () => {
  send('uci'); send('isready');
  await new Promise(r=>setTimeout(r,1200));
  for (const fen of need) {
    last=null;
    const cp = await new Promise(res=>{ waiting=res; send('position fen '+fen+' 0 1'); send('go depth 12'); });
    cache[fen] = fen.split(' ')[1]==='b' ? -cp : cp;
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  const ev = nodes.map(n => cache[key(n.state)]);
  const ev0 = cache[key(parsed.roots[0].node.state)];
  // how would the standard cut treat it?
  const floor = ev0 - 90;
  const worst = Math.min(...lines.map(l => Math.min(...l.nodes.filter(n=>C.colorOf(n.move.piece)==='w').map(n=>n.evTmp = ev[nodes.indexOf(n)]))));
  console.log('start eval', ev0, '| worst after a White move', worst, '| floor', floor, worst<floor?'-> would be cut':'-> passes');
  presets.push({
    id:'vantkruijs', name:"Van't Kruijs, b3 setup", color:'w',
    blurb:'A quiet 1.e3 and b3 system with the bishop on b2. Built from a six-game study, so it is short \u2014 two lines rather than a full tree.',
    lines:lines.length, positions:C.countPositions(parsed.roots), games:games.length, pgn, ev, ev0
  });
  fs.writeFileSync('build/presets.json', JSON.stringify(presets));
  console.log('added. presets now', presets.length, '| json', Math.round(JSON.stringify(presets).length/1024)+'KB');
  process.exit(0);
})();
