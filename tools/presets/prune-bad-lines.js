/**
 * Removes lines the engine rates poorly for whoever is studying them.
 *
 * A Black repertoire sits around -0.4 simply because White moves first, so a
 * fixed cutoff would delete every Black repertoire. The cutoff is therefore
 * measured against each repertoire's own starting evaluation: a line goes if,
 * after one of your own moves, it drops more than MARGIN below that baseline.
 */
const fs = require('fs');
const C = require('./engine.js');

const MARGIN = 90;
const cache = JSON.parse(fs.readFileSync('build/evalcache.json', 'utf8'));
const presets = JSON.parse(fs.readFileSync('build/presets.json', 'utf8'));
const key = (s) => C.toFen(s).split(' ').slice(0, 4).join(' ');

function serialize(root, name) {
  const ser = (node, no, white, force) => {
    const kids = node.children;
    if (!kids.length) return '';
    const main = kids[0];
    let out = (white ? no + '.' : (force ? no + '...' : '')) + main.san;
    if (main.comment) out += ' {' + main.comment + '}';
    for (let i = 1; i < kids.length; i++) {
      const v = kids[i];
      out += ' (' + (white ? no + '.' : no + '...') + v.san +
        (v.comment ? ' {' + v.comment + '}' : '') + ' ' +
        ser(v, white ? no : no + 1, !white, true) + ')';
    }
    out += ' ' + ser(main, white ? no : no + 1, !white, kids.length > 1);
    return out;
  };
  return '[Event "' + name + '"]\n\n' + ser(root, 1, true, false).replace(/\s+/g, ' ').trim() + ' *\n';
}

const report = [];
for (const p of presets) {
  const roots = C.parsePgn(p.pgn).roots;
  let i = 0;
  const attach = (n) => { for (const c of n.children) { c.ev = p.ev[i++]; attach(c); } };
  roots.forEach((r) => attach(r.node));

  const base = p.color === 'w' ? p.ev0 : -p.ev0;   // a normal start, from your side
  const floor = base - MARGIN;
  const mine = (n) => (p.color === 'w' ? n.ev : -n.ev);

  // a line survives if none of your own moves leaves you below the floor
  const before = C.enumerateLines(roots).filter((l) =>
    l.nodes.some((n) => C.colorOf(n.move.piece) === p.color));
  const keep = new Set();
  let dropped = 0;
  before.forEach((l) => {
    const ok = l.nodes.every((n) => C.colorOf(n.move.piece) !== p.color || mine(n) >= floor);
    if (ok) l.nodes.forEach((n) => keep.add(n));
    else dropped++;
  });
  const prune = (n) => {
    n.children = n.children.filter((c) => keep.has(c));
    n.children.forEach(prune);
  };
  roots.forEach((r) => prune(r.node));

  const pgn = serialize(roots[0].node, p.name);
  const fresh = C.parsePgn(pgn);
  const lines = C.enumerateLines(fresh.roots).filter((l) =>
    l.nodes.some((n) => C.colorOf(n.move.piece) === p.color));
  const ev = [];
  let missing = 0;
  const walk = (n) => {
    for (const c of n.children) {
      const k = key(c.state);
      if (!(k in cache)) missing++;
      ev.push(k in cache ? cache[k] : 0);
      walk(c);
    }
  };
  fresh.roots.forEach((r) => walk(r.node));

  // a dropped line means the opponent move leading into it is no longer covered
  let holes = 0;
  const holeWalk = (n, ply) => {
    if (!n.children.length) return;
    n.children.forEach((c) => {
      const wasCovered = C.colorOf(c.move.piece) !== p.color;
      if (wasCovered && !c.children.length && ply < 20) holes++;
      holeWalk(c, ply + 1);
    });
  };
  fresh.roots.forEach((r) => holeWalk(r.node, 0));
  report.push({ name: p.name, was: before.length, now: lines.length, dropped, floor, missing, holes, errs: fresh.errors.length });
  p.pgn = pgn; p.ev = ev; p.lines = lines.length; p.positions = C.countPositions(fresh.roots);
}

fs.writeFileSync('build/presets.json', JSON.stringify(presets));
report.forEach((r) => console.log(
  r.name.padEnd(33) + String(r.was).padStart(4) + ' -> ' + String(r.now).padStart(4) + ' lines' +
  '  dropped ' + String(r.dropped).padStart(3) + '  floor ' + String(r.floor).padStart(5) +
  (r.holes ? '  gaps ' + r.holes : '') +
  (r.missing ? '  MISSING ' + r.missing : '') + (r.errs ? '  ERRORS ' + r.errs : '')));
console.log('total lines now', presets.reduce((a, p) => a + p.lines, 0));
