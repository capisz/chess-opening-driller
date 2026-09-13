/* ===== Repertoire Drill ===== */
(function () {
  'use strict';
  const C = Chess;
  const $ = (s, r) => (r || document).querySelector(s);
  const KEY = 'odrill.v2';
  const SPRITE = {};/*SPRITE*/
  (function () {
    let s = '';
    for (const k in SPRITE) s += '<symbol id="p-' + k + '" viewBox="' + SPRITE[k].vb + '">' + SPRITE[k].body + '</symbol>';
    const el = document.getElementById('sprite');
    if (el) el.innerHTML = s;
  })();
  const XLINK = 'http://www.w3.org/1999/xlink';
  const pieceId = (p) => '#p-' + (p === p.toUpperCase() ? 'w' : 'b') + p.toUpperCase();

  /* ---------- storage ---------- */
  const fresh = () => ({ reps: [], progress: {}, settings: { target: 2, speed: 300, theme: '' }, active: null });
  let db = fresh();
  try { const raw = localStorage.getItem(KEY); if (raw) db = Object.assign(fresh(), JSON.parse(raw)); }
  catch (e) { /* no storage: run for this session only */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { } }

  let R = null, ses = null, run = null, sel = null, drag = null;
  let imp = { text: '', info: null, building: null, built: null, fileName: '' };

  const prog = () => (db.progress[R.rep.id] || (db.progress[R.rep.id] = {}));
  function lp(key) {
    const p = prog();
    return p[key] || (p[key] = { d: false, s: 0, a: 0, f: 0, t: 0, due: 0, iv: 0 });
  }
  // drilling the other side of the same tree keeps its own record
  const pk = (l) => (ses && ses.side && R && ses.side !== R.rep.color ? 'x|' : '') + l.key;
  const userColor = () => (ses && ses.side ? ses.side : (R ? R.rep.color : 'w'));
  const DAY = 86400000;
  const LADDER = [1, 3, 8, 20, 45];
  const isDue = (p) => p.d && (p.due || 0) <= Date.now();
  function schedule(p, clean) {
    p.iv = clean ? LADDER[Math.min(p.s, LADDER.length) - 1] : 0;
    p.due = Date.now() + p.iv * DAY;
  }
  function dueInfo() {
    let due = 0, next = Infinity;
    R.lines.forEach((l) => {
      const p = lp(pk(l));
      if (!p.d) return;
      if (isDue(p)) due++; else next = Math.min(next, p.due);
    });
    return { due, next: next === Infinity ? 0 : next };
  }
  function untilText(ts) {
    const ms = ts - Date.now();
    if (ms <= 0) return 'now';
    const h = ms / 3600000;
    if (h < 24) return 'in ' + Math.max(1, Math.round(h)) + ' hour' + (Math.round(h) === 1 ? '' : 's');
    const d = Math.round(h / 24);
    return 'in ' + d + ' day' + (d === 1 ? '' : 's');
  }
  const target = () => db.settings.target;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pieceSvg = (p, cls) => '<svg class="pc' + (cls ? ' ' + cls : '') +
    '" viewBox="0 0 100 100"><use width="100" height="100" href="' + pieceId(p) +
    '" xlink:href="' + pieceId(p) + '"/></svg>';

  /* ---------- repertoire ---------- */
  function openRep(id) {
    const rep = db.reps.find((r) => r.id === id);
    if (!rep) return home();
    const parsed = C.parsePgn(rep.pgn);
    const lines = [];
    C.enumerateLines(parsed.roots).forEach((l) => {
      l.nodes.forEach((n) => { n.side = C.colorOf(n.move.piece); });
      if (!l.nodes.some((n) => n.side === rep.color)) return;
      lines.push({
        rootIndex: l.rootIndex, fen: l.fen, nodes: l.nodes,
        key: l.rootIndex + ':' + l.nodes.map((n) => n.san).join(' ')
      });
    });
    R = { rep, roots: parsed.roots, lines, errors: parsed.errors, positions: C.countPositions(parsed.roots) };
    db.active = id; save();
    ses = null;               // a new repertoire starts on its own side
    startSession('learn');
  }

  function stats() {
    const t = target();
    let discovered = 0, mastered = 0;
    R.lines.forEach((l) => { const p = lp(pk(l)); if (p.d) discovered++; if (p.d && p.s >= t) mastered++; });
    return { total: R.lines.length, discovered, mastered };
  }

  /* ---------- session ---------- */
  function buildQueue(mode) {
    const t = target();
    const all = R.lines.map((_, i) => i);
    if (mode === 'learn') return all.filter((i) => !lp(pk(R.lines[i])).d);
    let q = all.filter((i) => { const p = lp(pk(R.lines[i])); return p.d && p.s < t; });
    if (!q.length) q = all.filter((i) => lp(pk(R.lines[i])).d);
    return q.sort((a, b) => {
      const A = lp(R.lines[a].key), B = lp(R.lines[b].key);
      return A.s - B.s || A.t - B.t;
    });
  }

  function startSession(mode, onlyLine, opts) {
    const side = (opts && opts.side) || (ses && ses.side) || R.rep.color;
    ses = { mode, side, queue: [], qi: 0, single: onlyLine != null, force: !!(opts && opts.force) };
    ses.queue = onlyLine != null ? [onlyLine] : buildQueue(mode);
    show('train');
    setSeg(mode);
    renderSideSeg();
    $('#sessionDone').hidden = true;
    $('#stage').hidden = false;
    if (!ses.queue.length) { run = null; sessionDone(false); return; }
    openLine(ses.queue[0]);
  }

  function openLine(i) { startRun(i, lp(pk(R.lines[i])).d ? 'recall' : 'teach', 0); }

  function startRun(i, phase, failures) {
    run = {
      i, line: R.lines[i], phase, failures: failures || 0,
      ply: 0, state: C.parseFen(R.lines[i].fen),
      await: false, lock: false, done: false, needRestart: false, hint: 0,
      last: null, anim: null, arrows: [], badSq: null, msg: '', msgKind: ''
    };
    sel = null;
    render();
    setTimeout(step, 110);
  }

  function step() {
    if (!run) return;
    const nodes = run.line.nodes;
    if (run.ply >= nodes.length) return finishLine();
    const node = nodes[run.ply];
    if (node.side !== userColor()) {
      run.lock = true; run.await = false; render();
      const mine = run;
      setTimeout(() => {
        if (run !== mine) return;
        play(node); run.lock = false; render(); step();
      }, db.settings.speed);
    } else { run.await = true; run.lock = false; render(); }
  }

  function play(node) {
    run.anim = { from: node.move.from, to: node.move.to };
    run.state = C.makeMove(run.state, node.move);
    run.last = { from: node.move.from, to: node.move.to };
    run.ply++;
  }

  function attempt(from, to) {
    if (!run || run.lock || !run.await) return;
    const node = run.line.nodes[run.ply];
    const cands = C.movesBetween(run.state, from, to);
    if (!cands.length) { sel = null; paint(); return; }
    let mv = cands.find((m) => C.sanOf(run.state, m) === node.san) ||
      cands.find((m) => !m.promotion || m.promotion === 'q') || cands[0];
    const san = C.sanOf(run.state, mv);
    sel = null;
    if (san === node.san) {
      run.await = false; run.hint = 0; run.arrows = []; run.badSq = null;
      run.msg = ''; run.msgKind = '';
      play(node); render();
      step();
    } else wrong(mv, san, node);
  }

  function wrong(mv, san, node) {
    run.await = false;
    run.badSq = mv.to;
    run.arrows = [{ from: mv.from, to: mv.to, color: 'rust' }];
    const sib = (node.parent && node.parent.children || []).find((c) => c.san === san && c !== node);
    const msg = sib
      ? '<b>' + san + '</b> is in your repertoire, but on a different line. Here you play <b>' + node.san + '</b>.'
      : '<b>' + san + '</b> is not the move. This line plays <b>' + node.san + '</b>.';
    if (run.phase === 'teach') {
      run.hint = 2;
      run.arrows.push({ from: node.move.from, to: node.move.to, color: 'brass' });
      run.msg = msg; run.msgKind = 'err';
      render();
      const mine = run;
      setTimeout(() => {
        if (run !== mine || run.done) return;
        run.badSq = null;
        run.arrows = run.arrows.filter((a) => a.color === 'brass');
        run.await = true; render();
      }, 900);
    } else {
      run.failures++;
      run.arrows.push({ from: node.move.from, to: node.move.to, color: 'brass' });
      run.msg = msg + ' Play the line again from the start.';
      run.msgKind = 'err';
      run.needRestart = true;
      const p = lp(pk(run.line)); p.s = 0; p.f++; schedule(p, false); save();
      render();
    }
  }

  function finishLine() {
    run.done = true; run.await = false;
    if (run.phase === 'teach') {
      run.msg = 'That is the whole line. Now play it back with no prompts.';
      run.msgKind = 'ok';
      render(); return;
    }
    const p = lp(pk(run.line));
    p.a++; p.t = Date.now(); p.d = true;
    p.s = run.failures === 0 ? p.s + 1 : 1;
    schedule(p, true);
    save();
    const left = target() - p.s;
    run.msg = (left <= 0 ? 'Line cleared and mastered.'
      : 'Line cleared. ' + left + ' more clean run' + (left === 1 ? '' : 's') + ' to master it.') +
      ' Back ' + untilText(p.due) + '.';
    run.msgKind = 'ok';
    if (run.failures > 0 && !ses.single) ses.queue.push(run.i);
    render();
  }

  function nextLine() {
    ses.qi++;
    if (ses.qi >= ses.queue.length) {
      const more = ses.single ? [] : buildQueue(ses.mode).filter((i) => ses.queue.indexOf(i) < 0);
      if (more.length) ses.queue = ses.queue.concat(more);
      else { run = null; sessionDone(true); return; }
    }
    openLine(ses.queue[ses.qi]);
  }

  function sessionDone(finished) {
    const st = stats(), d = dueInfo();
    const card = $('#sessionDone');
    $('#stage').hidden = true;
    card.hidden = false;
    const head = finished ? 'Session done'
      : ses.mode === 'learn' ? 'Every line has been learned' : 'Nothing due right now';
    let body = st.mastered + ' of ' + st.total + ' lines mastered, ' + st.discovered + ' seen at least once.';
    if (d.due) body += ' ' + d.due + ' line' + (d.due === 1 ? '' : 's') + ' ready for review.';
    else if (d.next) body += ' The next review comes up ' + untilText(d.next) + '.';
    card.innerHTML = '<h2>' + head + '</h2><p>' + body + '</p><div class="acts"></div>';
    const acts = card.querySelector('.acts');
    const mk = (cls, label, fn) => {
      const b = document.createElement('button');
      b.className = 'btn ' + cls; b.textContent = label; b.onclick = fn; acts.appendChild(b);
    };
    if (d.due) mk('primary', 'Review ' + d.due + ' line' + (d.due === 1 ? '' : 's'), () => startSession('practice'));
    if (st.discovered < st.total) mk(d.due ? '' : 'primary', 'Learn a new line', () => startSession('learn'));
    if (!d.due && st.discovered) mk('', 'Practice anyway', () => startSession('practice', null, { force: true }));
    mk('', 'All lines', showLines);
    mk('quiet', 'Repertoires', home);
    renderCount();
  }

  /* ---------- board ---------- */
  const boardEl = $('#board');

  function sqPoint(i) {
    let r = i >> 3, c = i & 7;
    if (userColor() === 'b') { r = 7 - r; c = 7 - c; }
    return [c + 0.5, r + 0.5];
  }

  function arrowsSvg() {
    if (!run || !run.arrows.length) return '';
    const col = { rust: '#C8553D', brass: '#E0A94A' };
    const body = run.arrows.map((a) => {
      const [x1, y1] = sqPoint(a.from), [x2, y2] = sqPoint(a.to);
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len, px = -uy, py = ux, w = 0.18;
      const bx = x1 + ux * 0.3, by = y1 + uy * 0.3;
      const hx = x2 - ux * 0.34, hy = y2 - uy * 0.34;
      const tx = x2 - ux * 0.04, ty = y2 - uy * 0.04;
      const c = col[a.color];
      return '<line x1="' + bx + '" y1="' + by + '" x2="' + hx + '" y2="' + hy + '" stroke="' + c +
        '" stroke-width="0.13" stroke-linecap="round" opacity="0.95"/><polygon points="' + tx + ',' + ty + ' ' +
        (hx + px * w) + ',' + (hy + py * w) + ' ' + (hx - px * w) + ',' + (hy - py * w) +
        '" fill="' + c + '" opacity="0.95"/>';
    }).join('');
    return '<svg class="arrows" viewBox="0 0 8 8">' + body + '</svg>';
  }

  let cells = [], uses = [], pcs = [], boardFlip = null;

  function buildBoard() {
    const flip = userColor() === 'b';
    let html = '';
    for (let vr = 0; vr < 8; vr++) {
      for (let vc = 0; vc < 8; vc++) {
        const r = flip ? 7 - vr : vr, c = flip ? 7 - vc : vc;
        html += '<div class="sq ' + ((r + c) % 2 ? 'd' : '') + '" data-i="' + (r * 8 + c) +
          '"><span class="dot"></span><svg class="pc off" viewBox="0 0 100 100">' +
          '<use width="100" height="100"/></svg></div>';
      }
    }
    boardEl.innerHTML = html;
    cells = new Array(64); uses = new Array(64); pcs = new Array(64);
    for (let k = 0; k < boardEl.children.length; k++) {
      const el = boardEl.children[k], i = +el.dataset.i;
      cells[i] = el; pcs[i] = el.lastChild; uses[i] = el.lastChild.firstChild; el._p = '';
    }
    boardFlip = flip;
    let rk = '', fl = '';
    for (let k = 0; k < 8; k++) {
      rk += '<span>' + (flip ? k + 1 : 8 - k) + '</span>';
      fl += '<span>' + C.FILES[flip ? 7 - k : k] + '</span>';
    }
    const rEl = $('#ranks'), fEl = $('#files');
    if (rEl) rEl.innerHTML = rk;
    if (fEl) fEl.innerHTML = fl;
  }

  function paint() {
    if (!run) return;
    if (!cells.length || boardFlip !== (userColor() === 'b')) buildBoard();
    const st = run.state;
    const tgt = sel != null ? C.genMoves(st).filter((m) => m.from === sel).map((m) => m.to) : [];
    const kingSq = C.inCheck(st) ? C.kingSquare(st.board, st.turn) : -1;
    for (let i = 0; i < 64; i++) {
      const cell = cells[i];
      if (!cell || !cell.classList) continue;
      const p = st.board[i] || '';
      if (cell._p !== p) {
        cell._p = p;
        if (p) {
          uses[i].setAttribute('href', pieceId(p));
          if (uses[i].setAttributeNS) uses[i].setAttributeNS(XLINK, 'xlink:href', pieceId(p));
          pcs[i].classList.remove('off');
        } else pcs[i].classList.add('off');
      }
      const cl = cell.classList, isT = tgt.indexOf(i) >= 0;
      cl.toggle('last', !!(run.last && (run.last.from === i || run.last.to === i)));
      cl.toggle('sel', sel === i);
      cl.toggle('bad', run.badSq === i);
      cl.toggle('chk', kingSq === i);
      cl.toggle('tgt', isT);
      cl.toggle('occ', isT && !!p);
      cl.toggle('mine', !!p && C.colorOf(p) === userColor() && !!run.await);
      if (sel !== i && pcs[i].classList.contains('lift')) pcs[i].classList.remove('lift');
    }
    const svg = arrowsSvg();
    let ov = boardEl.querySelector('.arrows');
    if (svg) { if (ov) ov.outerHTML = svg; else boardEl.insertAdjacentHTML('beforeend', svg); }
    else if (ov && ov.remove) ov.remove();

    if (run.anim) {
      const an = run.anim; run.anim = null;
      const el = pcs[an.to];
      if (el && el.style && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
        const size = boardEl.clientWidth / 8;
        let dr = (an.from >> 3) - (an.to >> 3), dc = (an.from & 7) - (an.to & 7);
        if (boardFlip) { dr = -dr; dc = -dc; }
        el.style.transition = 'none';
        el.style.transform = 'translate(' + dc * size + 'px,' + dr * size + 'px)';
        requestAnimationFrame(() => { el.style.transition = ''; el.style.transform = ''; });
      }
    }
  }

  /* ---------- panel ---------- */
  function describe(mv, san) {
    const names = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };
    if (mv.castle) return mv.castle === 'k' ? 'Castle kingside.' : 'Castle queenside.';
    const to = C.sqName(mv.to), from = C.sqName(mv.from), up = mv.piece.toUpperCase();
    let s;
    if (up === 'P') {
      s = (mv.captured || mv.ep) ? 'Take on ' + to + ' with the ' + from[0] + '-pawn'
        : 'Push the ' + from[0] + '-pawn to ' + to;
      if (mv.promotion) s += ' and promote to a ' + names[mv.promotion.toUpperCase()];
    } else {
      s = mv.captured ? 'Take on ' + to + ' with the ' + names[up] : 'Play the ' + names[up] + ' to ' + to;
      if (/^[KQRBN][a-h1-8]/.test(san)) s += ' (the one on ' + from + ')';
    }
    if (/#$/.test(san)) s += ', delivering mate';
    else if (/\+$/.test(san)) s += ', with check';
    return s + '.';
  }

  // https://lichess.org/analysis/pgn/1.d4+d5+2.Bf4?color=white#4
  function lichessUrl() {
    if (!run) return '';
    const upto = run.done ? run.line.nodes.length : run.ply;
    if (!upto) return '';
    const start = C.parseFen(run.line.fen);
    let num = start.full, parts = [];
    for (let j = 0; j < upto; j++) {
      const n = run.line.nodes[j];
      const san = n.san.replace(/[+#]/g, '');   // lichess re-derives check marks
      if (n.side === 'w') parts.push(num + '.' + san);
      else { parts.push((j === 0 ? num + '...' : '') + san); num++; }
    }
    let path = parts.join('+');
    if (run.line.fen !== C.START_FEN) path = '[FEN+"' + run.line.fen.replace(/ /g, '+') + '"]+' + path;
    return 'https://lichess.org/analysis/pgn/' + path +
      '?color=' + (userColor() === 'w' ? 'white' : 'black') + '#' + upto;
  }

  function renderSheet() {
    const box = $('#sheet');
    if (!run) { box.innerHTML = ''; return; }
    const nodes = run.line.nodes;
    const start = C.parseFen(run.line.fen);
    let num = start.full, html = '', col = start.turn === 'b' ? 1 : 0;
    if (col === 1) html += '<span class="n">' + num + '</span><span class="c"></span>';
    nodes.forEach((n, j) => {
      if (col === 0) html += '<span class="n">' + num + '</span>';
      const mine = n.side === userColor();
      let cell;
      if (j < run.ply || run.done) cell = '<span class="c ' + (mine ? 'mine' : 'theirs') + '">' + n.san + '</span>';
      else if (j === run.ply) {
        const shown = (run.phase === 'teach' && run.hint >= 1) ? n.san : '\u00b7 \u00b7 \u00b7';
        cell = '<span class="c now">' + shown + '</span>';
      } else cell = '<span class="c hid">' + n.san + '</span>';
      html += cell;
      if (col === 1) num++;
      col = 1 - col;
    });
    if (col === 1) html += '<span class="c"></span>';
    box.innerHTML = html;
    const now = box.querySelector('.now');
    if (now && now.offsetTop !== undefined) box.scrollTop = Math.max(0, now.offsetTop - 90);
  }

  function renderStrip() {
    const strip = $('#strip');
    if (!R) { strip.innerHTML = ''; return; }
    const t = target();
    strip.innerHTML = R.lines.map((l, i) => {
      const p = lp(pk(l));
      const cls = isDue(p) ? 'due' : p.d && p.s >= t ? 'mast' : p.d ? 'seen' : '';
      const here = run && run.i === i ? ' here' : '';
      return '<button class="lsq ' + cls + here + '" data-line="' + i + '" title="Line ' + (i + 1) + '"></button>';
    }).join('');
    const st = stats(), d = dueInfo();
    $('#stripLbl').textContent = st.total + ' lines \u00b7 ' + st.mastered + ' mastered \u00b7 ' +
      (st.discovered - st.mastered) + ' in progress \u00b7 ' + (st.total - st.discovered) + ' untouched' +
      (d.due ? ' \u00b7 ' + d.due + ' due now' : d.next ? ' \u00b7 next review ' + untilText(d.next) : '');
  }

  function renderCount() {
    if (!R) return;
    const st = stats(), d = dueInfo();
    $('#count').innerHTML = '<b>' + st.mastered + '</b> / ' + st.total + ' mastered' +
      (d.due ? ' &nbsp;·&nbsp; <b>' + d.due + '</b> due' : '');
  }

  function renderPanel() {
    $('#counter').textContent = ses.single ? 'single line'
      : 'line ' + Math.min(ses.qi + 1, ses.queue.length) + ' of ' + ses.queue.length;
    $('#phase').textContent = run
      ? (run.phase === 'teach' ? 'learning' : ses.mode === 'learn' ? 'from memory' : 'practice') : '';

    const say = $('#say'), note = $('#note'), fb = $('#fb'), acts = $('#acts');
    const node = run && run.ply < run.line.nodes.length ? run.line.nodes[run.ply] : null;
    const prev = run && run.ply > 0 ? run.line.nodes[run.ply - 1] : null;
    const comment = (node && node.comment) || (prev && prev.comment) || '';
    note.hidden = !comment || !run || run.done;
    note.textContent = comment;

    if (!run) say.textContent = '';
    else if (run.done) say.textContent = run.phase === 'teach'
      ? 'That is the full line.' : 'Line complete.';
    else if (run.lock) say.innerHTML = '<span class="soft">' +
      (userColor() === 'w' ? 'Black' : 'White') + ' replies\u2026</span>';
    else if (node) {
      if (run.phase === 'teach' || run.hint >= 2) say.textContent = describe(node.move, node.san);
      else if (run.hint === 1) say.innerHTML = 'Your move as ' + (userColor() === 'w' ? 'White' : 'Black') +
        '. <span class="soft">Move the highlighted piece.</span>';
      else say.textContent = 'Your move as ' + (userColor() === 'w' ? 'White' : 'Black') + '.';
    }

    fb.className = 'fb' + (run && run.msgKind ? ' ' + run.msgKind : '');
    fb.innerHTML = run ? run.msg : '';

    const btns = [];
    if (run && run.done && run.phase === 'teach') btns.push(['primary', 'Play it from memory', () => startRun(run.i, 'recall', 0)]);
    else if (run && run.done) btns.push(['primary', ses.single ? 'Back to lines' : 'Next line', () => (ses.single ? showLines() : nextLine())]);
    else if (run && run.needRestart) btns.push(['primary', 'Run it again', () => startRun(run.i, 'recall', run.failures)]);
    else if (run) {
      btns.push(['', run.hint >= 2 ? 'Hint shown' : 'Hint', hint, run.phase === 'teach' || run.hint >= 2]);
      btns.push(['', 'Restart line', () => startRun(run.i, run.phase, run.failures)]);
    }
    if (run && !run.done) btns.push(['quiet', 'Skip', () => (ses.single ? showLines() : nextLine())]);
    acts.innerHTML = '';
    btns.forEach((b) => {
      const el = document.createElement('button');
      el.className = 'btn ' + b[0]; el.textContent = b[1];
      if (b[3]) el.disabled = true; else el.onclick = b[2];
      acts.appendChild(el);
    });
    const url = lichessUrl();
    if (url) {
      const a = document.createElement('a');
      a.className = 'btn quiet ext';
      a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.title = 'Open this position on the Lichess analysis board';
      a.innerHTML = 'Lichess <svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/></svg>';
      acts.appendChild(a);
    }

    const pips = $('#pips');
    if (run) {
      const p = lp(pk(run.line)), t = target();
      let h = '';
      for (let k = 0; k < t; k++) h += '<span class="pip' + (k < p.s ? ' on' : '') + '"></span>';
      pips.innerHTML = h + '<span style="margin-left:9px">' +
        (p.s >= t ? 'mastered' : p.d ? 'clean runs ' + p.s + ' of ' + t : 'new line') + '</span>';
    } else pips.innerHTML = '';
  }

  function render() { paint(); renderSheet(); renderPanel(); renderStrip(); renderCount(); }

  function hint() {
    if (!run || run.done) return;
    run.hint = Math.min(2, run.hint + 1);
    const n = run.line.nodes[run.ply];
    if (run.hint === 1) sel = n.move.from;
    if (run.hint === 2) {
      run.arrows = [{ from: n.move.from, to: n.move.to, color: 'brass' }];
      const p = lp(pk(run.line)); p.s = 0; save();
    }
    render();
  }

  /* ---------- views ---------- */
  function show(which) {
    $('#viewLibrary').hidden = which !== 'library';
    $('#viewTrain').hidden = which !== 'train';
    $('#viewLines').hidden = which !== 'lines';
    $('#subbar').hidden = which === 'library';
    if ($('#mark').style) $('#mark').style.visibility = which === 'library' ? 'hidden' : 'visible';
    $('#markTitle').textContent = which === 'library' || !R ? 'Repertoire Drill' : R.rep.name;
    $('#markSub').textContent = which === 'library' || !R ? 'openings, one line at a time'
      : (R.rep.color === 'w' ? 'White' : 'Black') + ' \u00b7 ' + R.lines.length + ' lines';
  }
  function renderSideSeg() {
    const box = $('#sideSeg');
    if (!box || !R) return;
    const side = userColor();
    box.innerHTML = ['w', 'b'].map((s) =>
      '<button data-side="' + s + '" aria-selected="' + (s === side) + '">' +
      (s === 'w' ? 'As White' : 'As Black') + '</button>').join('');
    box.querySelectorAll('[data-side]').forEach((b) => {
      b.onclick = () => {
        if (b.dataset.side === userColor()) return;
        startSession(ses && ses.mode !== 'lines' ? ses.mode : 'learn', null, { side: b.dataset.side });
      };
    });
  }

  function setSeg(mode) {
    const kids = $('#seg').children;
    for (let i = 0; i < kids.length; i++) kids[i].setAttribute('aria-selected', String(kids[i].dataset.mode === mode));
  }

  function home() { run = null; ses = null; show('library'); renderLibrary(); }

  function showLines() {
    show('lines'); setSeg('lines');
    const t = target();
    const rows = R.lines.map((l, i) => {
      const p = lp(pk(l));
      const state = !p.d ? 'new' : isDue(p) ? 'due now' : p.s >= t ? 'mastered' : 'clean ' + p.s + '/' + t;
      let pips = '';
      for (let k = 0; k < t; k++) pips += '<span class="pip' + (k < p.s ? ' on' : '') + '"></span>';
      return '<div class="lrow' + (p.s >= t ? ' mast' : '') + (isDue(p) ? ' due' : '') + '">' +
        '<span class="n">' + (i + 1) + '</span>' +
        '<span class="sans">' + sanWithNumbers(l) + '</span>' +
        '<span class="miss">' + (p.f ? p.f + (p.f === 1 ? ' miss' : ' misses') : '') + '</span>' +
        '<span class="pips" style="margin:0">' + pips + '</span><span class="st">' + state + '</span>' +
        '<button class="btn" data-drill="' + i + '">Drill</button></div>';
    }).join('');
    $('#viewLines').innerHTML = '<div class="lede" style="margin-bottom:22px"><h1 style="font-size:27px">' +
      esc(R.rep.name) + '</h1><p>' + R.lines.length + ' lines \u00b7 ' + R.positions + ' positions' +
      (R.errors.length ? ' \u00b7 ' + R.errors.length + ' moves skipped' : '') + '</p></div>' +
      '<div id="exportBox"></div><div class="lines">' + rows + '</div><div class="acts" style="margin-top:20px">' +
      '<button class="btn" id="lnLearn">Learn new lines</button>' +
      '<button class="btn" id="lnPractice">Practice</button>' +
      '<button class="btn" id="lnExport">Export PGN</button>' +
      '<button class="btn quiet" id="lnReset">Reset progress</button>' +
      '<button class="btn quiet" id="lnHome">Repertoires</button></div>';
    const v = $('#viewLines');
    v.querySelectorAll('[data-drill]').forEach((b) => { b.onclick = () => startSession('practice', +b.dataset.drill); });
    $('#lnLearn').onclick = () => startSession('learn');
    $('#lnPractice').onclick = () => startSession('practice');
    $('#lnHome').onclick = home;
    $('#lnExport').onclick = showExport;
    $('#lnReset').onclick = (e) => {
      const b = e.currentTarget;
      if (b.dataset.armed !== '1') {
        b.dataset.armed = '1'; b.textContent = 'Reset every line?';
        setTimeout(() => { b.dataset.armed = '0'; b.textContent = 'Reset progress'; }, 4000);
        return;
      }
      db.progress[R.rep.id] = {}; save(); showLines();
    };
  }

  async function showExport() {
    const box = $('#exportBox');
    if (!box) return;
    const text = R.rep.pgn;
    box.innerHTML = '<div class="banner"><h3>Your repertoire as PGN</h3>' +
      '<p>Paste this into a Lichess study or hand it to a student.</p>' +
      '<textarea id="exTa" readonly style="margin-top:10px;min-height:130px"></textarea>' +
      '<div class="acts" style="margin-top:10px"><button class="btn primary" id="exCopy">Copy</button>' +
      '<button class="btn" id="exSave" hidden>Download file</button>' +
      '<button class="btn quiet" id="exClose">Close</button></div></div>';
    $('#exTa').value = text;
    $('#exClose').onclick = () => { box.innerHTML = ''; };
    $('#exCopy').onclick = async () => {
      const btn = $('#exCopy');
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
        else { $('#exTa').select(); document.execCommand('copy'); }
        btn.textContent = 'Copied';
      } catch (e) {
        $('#exTa').select();
        btn.textContent = 'Press Cmd+C';
      }
      setTimeout(() => { btn.textContent = 'Copy'; }, 2500);
    };
    const dl = (window.claude && window.claude.use) ? await window.claude.use('downloads').catch(() => null) : null;
    const saveBtn = $('#exSave');
    if (dl && saveBtn) {
      saveBtn.hidden = false;
      saveBtn.onclick = async () => {
        const name = (R.rep.name || 'repertoire').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        try {
          await dl.save({ filename: name + '.pgn.txt', data: text });
          saveBtn.textContent = 'Saved';
        } catch (err) {
          saveBtn.textContent = err && err.code === 'declined' ? 'Download file' : 'Could not save';
        }
        setTimeout(() => { saveBtn.textContent = 'Download file'; }, 2500);
      };
    }
  }

  function sanWithNumbers(l) {
    let num = C.parseFen(l.fen).full;
    const out = [];
    l.nodes.forEach((n, j) => {
      if (n.side === 'w') out.push(num + '.' + n.san);
      else { out.push((j === 0 ? num + '...' : '') + n.san); num++; }
    });
    return out.join(' ');
  }

  /* ---------- library + import ---------- */
  function renderLibrary() {
    const v = $('#viewLibrary');
    let reps = '';
    if (db.reps.length) {
      reps = '<div class="reps">' + db.reps.map((rep) => {
        const parsed = C.parsePgn(rep.pgn);
        const lines = C.enumerateLines(parsed.roots).filter((l) =>
          l.nodes.some((n) => C.colorOf(n.move.piece) === rep.color));
        const p = db.progress[rep.id] || {};
        let mastered = 0, seen = 0;
        lines.forEach((l) => {
          const e = p[l.rootIndex + ':' + l.nodes.map((n) => n.san).join(' ')];
          if (!e || !e.d) return;
          seen++; if (e.s >= target()) mastered++;
        });
        return '<div class="rep"><span class="icon">' + pieceSvg(rep.color === 'w' ? 'K' : 'k') + '</span>' +
          '<div class="grow"><div class="nm">' + esc(rep.name) + '</div><div class="sub">' +
          lines.length + ' lines \u00b7 ' + mastered + ' mastered \u00b7 ' + seen + ' seen</div></div>' +
          '<button class="btn primary" data-open="' + rep.id + '">Drill</button>' +
          '<button class="btn quiet" data-del="' + rep.id + '">Delete</button></div>';
      }).join('') + '</div>';
    }
    v.innerHTML = '<div class="lede"><h1>Drill your openings until the moves are automatic.</h1>' +
      '<p>Load a repertoire and every branch becomes a line you play move by move. A line only makes way ' +
      'for the next one once you have played it back from memory with no prompts.</p></div>' + reps +
      '<div class="form"><h2>' + (db.reps.length ? 'Add another repertoire' : 'Load your first repertoire') + '</h2>' +
      '<div class="row"><div class="field"><label for="fName">Name</label>' +
      '<input id="fName" type="text" placeholder="White \u2014 London System"></div>' +
      '<div class="field" style="max-width:170px"><label for="fSide">You play</label>' +
      '<select id="fSide"><option value="w">White</option><option value="b">Black</option></select></div></div>' +
      '<div class="drop" id="drop"><button class="btn" id="fPick">Choose a PGN file</button>' +
      '<div>or drop one here, paste below, or <button class="btn quiet" id="fSample" ' +
      'style="padding:0 2px;text-decoration:underline">try a sample</button></div>' +
      '<input type="file" id="fFile" accept=".pgn,.txt,text/plain" style="display:none"></div>' +
      '<div class="field"><label for="fPgn">PGN</label><textarea id="fPgn" spellcheck="false" ' +
      'placeholder="1. d4 Nf6 2. Bf4 e6 (2... g6 3. Nc3) 3. e3 ..."></textarea>' +
      '<p class="hint">A repertoire PGN with variations in brackets works directly. A collection of whole ' +
      'games gets turned into a repertoire tree.</p></div><div id="importState"></div></div>';

    v.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => openRep(b.dataset.open); });
    v.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = () => {
        if (b.dataset.armed !== '1') {
          b.dataset.armed = '1'; b.textContent = 'Delete for good';
          setTimeout(() => { b.dataset.armed = '0'; b.textContent = 'Delete'; }, 4000);
          return;
        }
        db.reps = db.reps.filter((r) => r.id !== b.dataset.del);
        delete db.progress[b.dataset.del];
        save(); renderLibrary();
      };
    });

    const file = $('#fFile'), drop = $('#drop'), area = $('#fPgn');
    $('#fPick').onclick = () => file.click();
    file.onchange = () => { if (file.files && file.files[0]) readFile(file.files[0]); };
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault(); drop.classList.remove('over');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
    });
    let t = null;
    area.oninput = () => {
      clearTimeout(t);
      t = setTimeout(() => { setSource(area.value, ''); }, 350);
    };
    $('#fSample').onclick = () => { area.value = SAMPLE; setSource(SAMPLE, ''); };
    if (imp.text) renderImport();
  }

  function readFile(f) {
    const fr = new FileReader();
    fr.onload = () => {
      const name = f.name.replace(/\.[^.]+$/, '');
      if (!$('#fName').value) $('#fName').value = name.replace(/[_-]+/g, ' ');
      setSource(String(fr.result), f.name);
      $('#fPgn').value = fr.result.length > 200000
        ? '(' + f.name + ' loaded \u2014 ' + Math.round(fr.result.length / 1e6 * 10) / 10 + ' MB, too large to show here)'
        : String(fr.result);
    };
    fr.readAsText(f);
  }

  function setSource(text, fileName) {
    imp.text = text || '';
    imp.fileName = fileName || '';
    imp.built = null; imp.building = null;
    imp.info = imp.text ? analyze(imp.text) : null;
    renderImport();
  }

  function analyze(text) {
    const games = (text.match(/\[Event\s/g) || []).length || 1;
    const head = text.slice(0, 300000);
    const hasVars = /\(\s*\d*\s*\.{0,3}\s*[KQRBNOa-h]/.test(head);
    let plies = 0, n = 0;
    C.eachGame(head, (h, mt) => {
      if (n >= 6) return;
      plies += (mt.match(/[a-hKQRBNO][^\s]*/g) || []).length; n++;
    });
    const avg = n ? plies / n : 0;
    return { games, hasVars, avg, collection: games >= 6 && !hasVars && avg > 34 };
  }

  function renderImport() {
    const box = $('#importState');
    if (!box) return;
    if (!imp.text) { box.innerHTML = ''; return; }
    const a = imp.info;

    if (imp.building) {
      const b = imp.building;
      box.innerHTML = '<div class="banner"><h3>Reading games</h3><p id="bLbl">' +
        b.i.toLocaleString() + ' of ' + b.games.length.toLocaleString() + '</p>' +
        '<div class="bar"><i id="bBar" style="width:' + (b.i / b.games.length * 100) + '%"></i></div></div>';
      return;
    }

    if (imp.built) {
      const t = imp.built;
      box.innerHTML = '<div class="banner"><h3>' + t.lines + ' lines, ' + t.positions + ' positions</h3>' +
        '<p>Built from ' + t.used.toLocaleString() + ' games, ' + (t.opts.maxPlies / 2) +
        ' moves deep. You always answer with the most played move; your opponent keeps every reply seen in at ' +
        'least ' + t.opts.minGames + ' games.</p></div><div class="acts">' +
        '<button class="btn primary" id="bUse">Start drilling</button>' +
        '<button class="btn" id="bAgain">Change the settings</button></div>';
      $('#bUse').onclick = () => addRep(imp.built.pgn);
      $('#bAgain').onclick = () => { imp.built = null; renderImport(); };
      return;
    }

    if (a.collection) {
      box.innerHTML = '<div class="banner"><h3>' + a.games.toLocaleString() +
        ' complete games, no variations</h3><p>This is a game collection, not a repertoire. Merge the games ' +
        'into a tree: your side keeps the most played move at each turn, the other side keeps every popular reply.</p>' +
        '</div><div class="row">' +
        '<div class="field"><label for="oDepth">Moves deep</label>' +
        '<input id="oDepth" type="number" min="4" max="25" value="12"></div>' +
        '<div class="field"><label for="oMin">Games needed for a reply</label>' +
        '<input id="oMin" type="number" min="1" max="500" value="12"></div>' +
        '<div class="field"><label for="oTop">Replies kept per position</label>' +
        '<input id="oTop" type="number" min="1" max="6" value="3"></div>' +
        '<div class="field"><label for="oElo">Rating filter</label><select id="oElo">' +
        '<option value="0">Any game</option><option value="2200">2200 and up</option>' +
        '<option value="2400">2400 and up</option><option value="2600">2600 and up</option></select></div>' +
        '</div><div class="acts"><button class="btn primary" id="bBuild">Build the repertoire</button>' +
        '<button class="btn quiet" id="bRaw">It is already a repertoire</button></div>';
      $('#bBuild').onclick = startBuild;
      $('#bRaw').onclick = () => { imp.info.collection = false; renderImport(); };
      return;
    }

    const parsed = C.parsePgn(imp.text);
    const color = $('#fSide').value;
    const lines = C.enumerateLines(parsed.roots).filter((l) => l.nodes.some((n) => C.colorOf(n.move.piece) === color));
    box.innerHTML = '<div class="banner' + (lines.length ? '' : ' warn') + '"><h3>' +
      (lines.length ? lines.length + ' lines for ' + (color === 'w' ? 'White' : 'Black')
        : 'No lines for ' + (color === 'w' ? 'White' : 'Black')) + '</h3><p>' +
      (lines.length ? C.countPositions(parsed.roots) + ' positions in the tree.'
        : 'Check the PGN, or switch the side you play.') +
      (parsed.errors.length ? '<ul><li>' + parsed.errors.slice(0, 4).map(esc).join('</li><li>') +
        '</li></ul>' : '') + '</p></div><div class="acts">' +
      '<button class="btn primary" id="bAdd"' + (lines.length ? '' : ' disabled') + '>Add repertoire</button>' +
      (a.games >= 6 ? '<button class="btn quiet" id="bColl">Treat it as a game collection</button>' : '') + '</div>';
    if (lines.length) $('#bAdd').onclick = () => addRep(imp.text);
    if ($('#bColl')) $('#bColl').onclick = () => { imp.info.collection = true; renderImport(); };
  }

  function startBuild() {
    const opts = {
      color: $('#fSide').value,
      maxPlies: Math.max(4, Math.min(25, +$('#oDepth').value || 12)) * 2,
      minGames: Math.max(1, +$('#oMin').value || 12),
      topReplies: Math.max(1, Math.min(6, +$('#oTop').value || 3)),
      minElo: +$('#oElo').value || 0
    };
    imp.building = { games: C.collectGames(imp.text), i: 0, tally: C.newTally(), opts };
    renderImport();
    setTimeout(tick, 30);
  }

  function tick() {
    const b = imp.building;
    if (!b) return;
    const end = Math.min(b.i + 400, b.games.length);
    C.tallyInto(b.tally, b.games, b.i, end, b.opts);
    b.i = end;
    const bar = $('#bBar'), lbl = $('#bLbl');
    if (bar && bar.style) bar.style.width = (b.i / b.games.length * 100) + '%';
    if (lbl) lbl.textContent = b.i.toLocaleString() + ' of ' + b.games.length.toLocaleString();
    if (b.i < b.games.length) setTimeout(tick, 0);
    else finishBuild();
  }

  function finishBuild() {
    const b = imp.building;
    imp.building = null;
    const tree = C.pruneTree({ root: b.tally.root }, b.opts);
    const name = $('#fName').value.trim() || 'Repertoire';
    const pgn = C.treeToPgn(tree, b.opts.color, name);
    const parsed = C.parsePgn(pgn);
    const lines = C.enumerateLines(parsed.roots).filter((l) =>
      l.nodes.some((n) => C.colorOf(n.move.piece) === b.opts.color));
    imp.built = {
      pgn, lines: lines.length, positions: C.countPositions(parsed.roots),
      used: b.tally.used, opts: b.opts
    };
    renderImport();
  }

  function addRep(pgn) {
    const rep = {
      id: 'r' + Date.now().toString(36),
      name: $('#fName').value.trim() || 'Untitled repertoire',
      color: $('#fSide').value,
      pgn: pgn, created: Date.now()
    };
    db.reps.push(rep); save();
    imp = { text: '', info: null, building: null, built: null, fileName: '' };
    openRep(rep.id);
  }

  /* ---------- input ---------- */
  function sqAt(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const sq = el && el.closest ? el.closest('.sq') : null;
    return sq ? +sq.dataset.i : null;
  }

  boardEl.addEventListener('pointerdown', (e) => {
    if (drag) { drag.ghost.remove(); drag = null; boardEl.classList.remove('dragging'); }
    if (!run || run.lock || !run.await) return;
    const cell = e.target.closest ? e.target.closest('.sq') : null;
    if (!cell) return;
    const i = +cell.dataset.i;
    const piece = run.state.board[i];
    if (piece && C.colorOf(piece) === userColor()) {
      e.preventDefault();
      sel = i; paint();
      const pc = pcs[i];
      if (!pc || !pc.classList) return;
      pc.classList.add('lift');
      boardEl.classList.add('dragging');
      const size = boardEl.clientWidth / 8;
      const ghost = document.createElement('div');
      ghost.className = 'ghost';
      ghost.style.width = size + 'px'; ghost.style.height = size + 'px';
      ghost.innerHTML = '<svg viewBox="0 0 100 100" style="width:100%;height:100%;display:block">' +
        '<use width="100" height="100" href="' + pieceId(piece) + '" xlink:href="' + pieceId(piece) + '"/></svg>';
      ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
      document.body.appendChild(ghost);
      drag = { from: i, ghost };
      if (boardEl.setPointerCapture) boardEl.setPointerCapture(e.pointerId);
    } else if (sel != null) attempt(sel, i);
  });

  boardEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.ghost.style.left = e.clientX + 'px';
    drag.ghost.style.top = e.clientY + 'px';
  });

  function endDrag(e) {
    if (!drag) return;
    const d = drag; drag = null;
    d.ghost.remove();
    if (boardEl.classList) boardEl.classList.remove('dragging');
    if (pcs[d.from] && pcs[d.from].classList) pcs[d.from].classList.remove('lift');
    const to = sqAt(e);
    if (to != null && to !== d.from) attempt(d.from, to);
    else paint();
  }
  boardEl.addEventListener('pointerup', endDrag);
  boardEl.addEventListener('pointercancel', endDrag);

  $('#strip').addEventListener('click', (e) => {
    const b = e.target.closest ? e.target.closest('.lsq') : null;
    if (b) startSession('practice', +b.dataset.line);
  });

  document.addEventListener('keydown', (e) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === 'Enter') { const b = $('#acts .primary'); if (b) { e.preventDefault(); b.click(); } }
    else if (e.key === 'h' && run && !run.done) { e.preventDefault(); hint(); }
    else if (e.key === 'r' && run) { e.preventDefault(); startRun(run.i, run.phase, run.failures); }
  });

  $('#mark').onclick = home;
  function applyTheme() {
    const t = db.settings.theme ||
      (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if (document.documentElement.setAttribute) document.documentElement.setAttribute('data-theme', t);
  }
  $('#theme').onclick = () => {
    const cur = db.settings.theme ||
      (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    db.settings.theme = cur === 'dark' ? 'light' : 'dark';
    save(); applyTheme();
  };
  applyTheme();
  const segKids = $('#seg').children;
  for (let i = 0; i < segKids.length; i++) {
    segKids[i].onclick = function () {
      if (!R) return;
      if (this.dataset.mode === 'lines') showLines();
      else startSession(this.dataset.mode);
    };
  }

  if (window.ResizeObserver) {
    new ResizeObserver(() => {
      boardEl.style.setProperty('--sq', boardEl.clientWidth / 8 + 'px');
    }).observe(boardEl);
  }

  /* ---------- sample ---------- */
  const SAMPLE = [
    '[Event "Sample: White \u2014 London System"]',
    '',
    '1. d4 d5 2. Bf4 {The London. Bishop out before e3, then a solid c3 and Nbd2 setup.}',
    '2... Nf6 3. e3 e6 4. Nf3 Bd6 5. Bg3 O-O 6. Nbd2 c5 7. c3 Nc6 8. Bd3',
    '(2... c5 3. e3 Nc6 4. c3 Nf6 5. Nd2 e6 6. Ngf3 Bd6 7. Bg3)',
    '(2... e6 3. e3 Nf6 4. Nf3 Be7 5. Nbd2 O-O 6. Bd3 c5 7. c3) *',
    '',
    '1. d4 Nf6 2. Bf4 g6 {Against the fianchetto, take the centre with e3 and h3.} 3. e3 Bg7 4. Nf3 O-O',
    '5. h3 d6 6. Be2 Nbd7 7. O-O *',
    '',
    '1. d4 Nf6 2. Bf4 e6 3. e3 c5 4. c3 Qb6 {The critical queen sortie. Defend b2 with Qc1.} 5. Qc1 Nc6 6. Nf3 d5 7. Nbd2 *'
  ].join('\n');

  /* ---------- boot ---------- */
  if (db.active && db.reps.some((r) => r.id === db.active)) openRep(db.active);
  else home();
})();
