/* Headless simulation of the drill loop against a stub DOM */
const fs = require('fs');
const vm = require('vm');

class El {
  constructor(tag) {
    this.tagName = (tag || 'div').toUpperCase();
    this.children = []; this.dataset = {}; this._html = ''; this.textContent = '';
    this.style = { setProperty() {}, width: '', fontSize: '', left: '', top: '', transform: '', transition: '' };
    this.classList = {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      contains(c) { return this._s.has(c); },
      toggle() {}
    };
    this.hidden = false; this.clientWidth = 480; this.offsetWidth = 480;
    this.onclick = null; this.disabled = false; this.className = '';
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = v; this.children = []; }
  setAttribute(k, v) { this[k] = v; }
  appendChild(c) { this.children.push(c); return c; }
  removeChild() {} remove() {}
  addEventListener(t, f) { (this._ev || (this._ev = {}))[t] = f; }
  setPointerCapture() {}
  insertAdjacentHTML() {}
  get lastChild(){ return new El('svg'); }
  get firstChild(){ return new El('use'); }
  querySelector() { return new El('div'); }
  querySelectorAll() { return []; }
  select() {}
  closest() { return null; }
  focus() {}
}

const nodes = new Map();
const document = {
  querySelector(sel) { if (!nodes.has(sel)) nodes.set(sel, new El('div')); return nodes.get(sel); },
  querySelectorAll() { return []; },
  createElement(t) { return new El(t); },
  addEventListener() {},
  elementFromPoint() { return null; },
  body: new El('body'),
  documentElement: new El('html'),
  getElementById(id) { return document.querySelector('#' + id); }
};
const tabs = document.querySelector('#seg');
tabs.children = ['learn', 'practice', 'lines'].map((m) => { const e = new El('button'); e.dataset.mode = m; return e; });

let store = {};
const ctx = {
  document, console,
  window: { matchMedia: () => ({ matches: true }) },
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; }
  },
  ResizeObserver: class { observe() {} },
  requestAnimationFrame: (f) => setTimeout(f, 0),
  setTimeout, clearTimeout, Math, Date, JSON, Array, Object, String, Number, RegExp, Error, isNaN, parseInt, parseFloat
};
ctx.globalThis = ctx; ctx.self = ctx;

const engine = fs.readFileSync(__dirname + '/../src/engine.js', 'utf8');
let app = fs.readFileSync(__dirname + '/../src/app.js', 'utf8');
const sprite = fs.readFileSync(__dirname + '/../src/pieces.sprite.json', 'utf8');
app = app.replace('const SPRITE = {};/*SPRITE*/', 'const SPRITE = ' + sprite + ';');
const hook = `
globalThis.__t = {
  get run(){return run}, get ses(){return ses}, get R(){return R}, get db(){return db},
  attempt, startSession, openRep, addRepDirect(name,color,pgn){
    const rep={id:'test',name,color,pgn,created:1}; db.reps.push(rep); save(); openRep('test');
  },
  primary(){ const a=document.querySelector('#acts'); const b=a.children.find(x=>/primary/.test(x.className)&&!x.disabled); if(b&&b.onclick) b.onclick(); return b&&b.textContent; },
  hint
};`;
vm.createContext(ctx);
vm.runInContext(engine + '\n' + app.replace('})();', hook + '\n})();'), ctx);

const T = ctx.__t;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const idx = (n) => (8 - parseInt(n[1], 10)) * 8 + 'abcdefgh'.indexOf(n[0]);

const PGN = `1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 (3... Nf6 4. d3 Bc5) 4. c3 Nf6 *
1. e4 c5 2. Nf3 d6 3. d4 *`;

let fails = 0;
const check = (label, cond, extra) => {
  if (!cond) { fails++; console.log('FAIL ' + label, extra === undefined ? '' : extra); }
  else console.log('ok   ' + label);
};

// play the expected move of the current line
async function playRight() {
  const r = T.run;
  const node = r.line.nodes[r.ply];
  T.attempt(node.move.from, node.move.to);
  await wait(60);
}
async function playWrong(from, to) {
  T.attempt(idx(from), idx(to));
  await wait(60);
}
async function settle() { await wait(700); }

(async () => {
  T.addRepDirect('Test', 'w', PGN);
  await settle();
  check('lines enumerated', T.R.lines.length === 3, T.R.lines.map((l) => l.nodes.map((n) => n.san).join(' ')));
  check('starts in teach phase', T.run.phase === 'teach', T.run && T.run.phase);
  check('white to move, awaiting user at ply 0', T.run.await === true && T.run.ply === 0);

  // wrong move in teach mode: stays on the same ply, no failure recorded
  await playWrong('d2', 'd4');
  check('wrong move in teach keeps ply', T.run.ply === 0 && /not the move/.test(T.run.msg), T.run.msg);
  await wait(1100);
  check('teach re-opens for another try', T.run.await === true);

  // play the whole first line
  let guard = 0;
  while (!T.run.done && guard++ < 40) { await playRight(); await settle(); }
  check('teach pass completes line', T.run.done === true && /no prompts/.test(T.run.msg), T.run.msg);
  check('not yet discovered after teach pass', T.db.progress.test[T.R.lines[0].key] === undefined ||
    T.db.progress.test[T.R.lines[0].key].d === false);

  // move into the recall pass
  T.primary();
  await settle();
  check('recall phase started', T.run.phase === 'recall' && T.run.ply === 0);

  // a wrong move during recall forces a restart
  const firstLine = T.run.line.key;
  await playWrong('d2', 'd4');
  check('recall failure blocks progress', T.run.needRestart === true && T.run.await === false, T.run.msg);
  check('streak reset on failure', T.db.progress.test[firstLine].s === 0);
  const label = T.primary();
  check('restart button offered', /again/i.test(label || ''), label);
  await settle();
  check('restarted at ply 0 with failure remembered', T.run.ply === 0 && T.run.failures === 1);

  guard = 0;
  while (!T.run.done && guard++ < 40) { await playRight(); await settle(); }
  check('clean recall run clears the line', T.run.done === true && /cleared/i.test(T.run.msg), T.run.msg);
  check('line marked discovered, streak 1 after a failure', T.db.progress.test[firstLine].d === true &&
    T.db.progress.test[firstLine].s === 1, T.db.progress.test[firstLine]);
  check('failed line requeued for later in the session', T.ses.queue.length === 4, T.ses.queue);

  // next line
  T.primary();
  await settle();
  check('advanced to a different line', T.run.line.key !== firstLine, T.run.line.nodes.map((n) => n.san).join(' '));

  // learn + clean recall on the remaining lines
  guard = 0;
  while (guard++ < 60 && T.run) {
    if (T.run.done) { T.primary(); await settle(); continue; }
    if (T.run.needRestart) { T.primary(); await settle(); continue; }
    if (T.run.await) { await playRight(); await settle(); continue; }
    await settle();
  }
  const p = T.db.progress.test;
  const keys = T.R.lines.map((l) => l.key);
  check('every line discovered', keys.every((k) => p[k] && p[k].d), keys.map((k) => p[k] && p[k].s));
  check('each line has at least one clean run after Learn', keys.every((k) => p[k].s >= 1),
    keys.map((k) => p[k].s));

  check('cleared lines are scheduled into the future', keys.some((k) => p[k].due > Date.now() + 0.4 * 86400000),
    keys.map((k) => Math.round((p[k].due - Date.now()) / 3600000) + 'h'));

  // drilling the same tree from the other side keeps its own record
  T.startSession('learn', null, { side: 'b' });
  await settle();
  check('other side starts a fresh line', T.ses.side === 'b' && T.run && T.run.phase === 'teach',
    { side: T.ses && T.ses.side, phase: T.run && T.run.phase });
  guard = 0;
  while (!T.run.done && guard++ < 40) { await playRight(); await settle(); }
  T.primary(); await settle();
  guard = 0;
  while (!T.run.done && guard++ < 40) { await playRight(); await settle(); }
  check('other side records under its own key',
    Object.keys(T.db.progress.test).some((k) => k.indexOf('x|') === 0),
    Object.keys(T.db.progress.test).filter((k) => k.indexOf('x|') === 0).length);

  // practice session picks the weakest line first
  T.startSession('practice', null, { side: 'w' });
  await settle();
  check('practice session runs in recall phase', T.run && T.run.phase === 'recall', T.run && T.run.phase);
  check('weakest line first', T.run.line.key === keys.find((k) => p[k].s === Math.min(...keys.map((x) => p[x].s))),
    T.run.line.nodes.map((n) => n.san).join(' '));

  // black repertoire: opponent moves first and are auto-played
  T.db.reps.length = 0; T.db.progress.test = undefined;
  T.addRepDirect('Black test', 'b', '1. e4 c5 2. Nf3 d6 3. d4 cxd4 *');
  await settle();
  check('black: white opening move auto-played', T.run.ply === 1 && T.run.await === true,
    { ply: T.run.ply, await: T.run.await });
  await playRight();                       // 1...c5
  await settle();
  check('black: user move accepted, reply auto-played', T.run.ply === 3, T.run.ply);
  guard = 0;
  while (!T.run.done && guard++ < 20) { await playRight(); await settle(); }
  check('black line completes', T.run.done === true, T.run.msg);

  store = {};
  console.log(fails ? '\n' + fails + ' FAILURES' : '\nALL SIM CHECKS PASSED');
  process.exit(fails ? 1 : 0);
})();
