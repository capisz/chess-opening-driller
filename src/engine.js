/* ===== Minimal chess engine + PGN (with variations) parser ===== */
(function (global) {
  const FILES = 'abcdefgh';
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  const idx = (r, c) => r * 8 + c;
  const sqName = (i) => FILES[i & 7] + (8 - (i >> 3));
  const sqIdx = (n) => (8 - parseInt(n[1], 10)) * 8 + FILES.indexOf(n[0]);
  const colorOf = (p) => (p === p.toUpperCase() ? 'w' : 'b');
  const other = (c) => (c === 'w' ? 'b' : 'w');

  const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function parseFen(fen) {
    const parts = String(fen).trim().split(/\s+/);
    const board = new Array(64).fill(null);
    let r = 0, c = 0;
    for (const ch of parts[0]) {
      if (ch === '/') { r++; c = 0; }
      else if (/\d/.test(ch)) c += parseInt(ch, 10);
      else { if (r < 8 && c < 8) board[idx(r, c)] = ch; c++; }
    }
    return {
      board,
      turn: parts[1] === 'b' ? 'b' : 'w',
      castling: parts[2] && parts[2] !== '-' ? parts[2] : '',
      ep: parts[3] && parts[3] !== '-' ? sqIdx(parts[3]) : -1,
      half: parts[4] ? +parts[4] : 0,
      full: parts[5] ? +parts[5] : 1
    };
  }

  function toFen(s) {
    let rows = [];
    for (let r = 0; r < 8; r++) {
      let row = '', empty = 0;
      for (let c = 0; c < 8; c++) {
        const p = s.board[idx(r, c)];
        if (!p) empty++;
        else { if (empty) { row += empty; empty = 0; } row += p; }
      }
      if (empty) row += empty;
      rows.push(row);
    }
    return rows.join('/') + ' ' + s.turn + ' ' + (s.castling || '-') + ' ' +
      (s.ep >= 0 ? sqName(s.ep) : '-') + ' ' + s.half + ' ' + s.full;
  }

  const cloneState = (s) => ({
    board: s.board.slice(), turn: s.turn, castling: s.castling,
    ep: s.ep, half: s.half, full: s.full
  });

  function isAttacked(board, sq, by) {
    const r = sq >> 3, c = sq & 7;
    const pawnRow = by === 'w' ? r + 1 : r - 1;
    if (pawnRow >= 0 && pawnRow < 8) {
      for (const dc of [-1, 1]) {
        const cc = c + dc;
        if (cc < 0 || cc > 7) continue;
        const p = board[idx(pawnRow, cc)];
        if (p && p === (by === 'w' ? 'P' : 'p')) return true;
      }
    }
    for (const [dr, dc] of KNIGHT) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
      const p = board[idx(rr, cc)];
      if (p && p === (by === 'w' ? 'N' : 'n')) return true;
    }
    for (const [dr, dc] of KING) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
      const p = board[idx(rr, cc)];
      if (p && p === (by === 'w' ? 'K' : 'k')) return true;
    }
    const scan = (dirs, set) => {
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
          const p = board[idx(rr, cc)];
          if (p) {
            if (colorOf(p) === by && set.includes(p.toUpperCase())) return true;
            break;
          }
          rr += dr; cc += dc;
        }
      }
      return false;
    };
    if (scan(DIAG, ['B', 'Q'])) return true;
    if (scan(ORTH, ['R', 'Q'])) return true;
    return false;
  }

  function kingSquare(board, color) {
    const k = color === 'w' ? 'K' : 'k';
    for (let i = 0; i < 64; i++) if (board[i] === k) return i;
    return -1;
  }

  function inCheck(s) {
    const k = kingSquare(s.board, s.turn);
    return k >= 0 && isAttacked(s.board, k, other(s.turn));
  }

  function makeMove(s, m) {
    const n = cloneState(s);
    const us = s.turn;
    n.board[m.from] = null;
    n.board[m.to] = m.promotion ? (us === 'w' ? m.promotion.toUpperCase() : m.promotion.toLowerCase()) : m.piece;
    if (m.ep) n.board[us === 'w' ? m.to + 8 : m.to - 8] = null;
    if (m.castle) {
      if (m.castle === 'k') { n.board[m.to + 1] = null; n.board[m.to - 1] = us === 'w' ? 'R' : 'r'; }
      else { n.board[m.to - 2] = null; n.board[m.to + 1] = us === 'w' ? 'R' : 'r'; }
    }
    let cast = n.castling;
    const drop = (ch) => { cast = cast.replace(ch, ''); };
    if (m.piece === 'K') { drop('K'); drop('Q'); }
    if (m.piece === 'k') { drop('k'); drop('q'); }
    if (m.from === 56 || m.to === 56) drop('Q');
    if (m.from === 63 || m.to === 63) drop('K');
    if (m.from === 0 || m.to === 0) drop('q');
    if (m.from === 7 || m.to === 7) drop('k');
    n.castling = cast;
    n.ep = m.double ? (m.from + m.to) / 2 : -1;
    n.half = (m.piece.toUpperCase() === 'P' || m.captured) ? 0 : s.half + 1;
    if (us === 'b') n.full = s.full + 1;
    n.turn = other(us);
    return n;
  }

  function genMoves(s, legalOnly) {
    if (legalOnly === undefined) legalOnly = true;
    const us = s.turn, them = other(us);
    const out = [];
    const push = (from, to, extra) => {
      out.push(Object.assign({
        from, to, piece: s.board[from], captured: s.board[to] || null,
        promotion: null, castle: null, ep: false, double: false
      }, extra || {}));
    };
    const leaper = (from, r, c, dirs) => {
      for (const [dr, dc] of dirs) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
        const t = idx(rr, cc), tp = s.board[t];
        if (tp && colorOf(tp) === us) continue;
        push(from, t);
      }
    };
    const slider = (from, r, c, dirs) => {
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
          const t = idx(rr, cc), tp = s.board[t];
          if (tp) { if (colorOf(tp) !== us) push(from, t); break; }
          push(from, t);
          rr += dr; cc += dc;
        }
      }
    };

    for (let from = 0; from < 64; from++) {
      const p = s.board[from];
      if (!p || colorOf(p) !== us) continue;
      const r = from >> 3, c = from & 7, up = p.toUpperCase();
      if (up === 'P') {
        const dir = us === 'w' ? -1 : 1;
        const startRow = us === 'w' ? 6 : 1;
        const promoRow = us === 'w' ? 0 : 7;
        const r1 = r + dir;
        if (r1 >= 0 && r1 < 8 && !s.board[idx(r1, c)]) {
          if (r1 === promoRow) { for (const q of ['q', 'r', 'b', 'n']) push(from, idx(r1, c), { promotion: q }); }
          else {
            push(from, idx(r1, c));
            if (r === startRow && !s.board[idx(r + 2 * dir, c)]) push(from, idx(r + 2 * dir, c), { double: true });
          }
        }
        for (const dc of [-1, 1]) {
          const cc = c + dc;
          if (cc < 0 || cc > 7 || r1 < 0 || r1 > 7) continue;
          const t = idx(r1, cc), tp = s.board[t];
          if (tp && colorOf(tp) === them) {
            if (r1 === promoRow) { for (const q of ['q', 'r', 'b', 'n']) push(from, t, { promotion: q }); }
            else push(from, t);
          } else if (!tp && t === s.ep) {
            push(from, t, { ep: true, captured: us === 'w' ? 'p' : 'P' });
          }
        }
      } else if (up === 'N') leaper(from, r, c, KNIGHT);
      else if (up === 'K') leaper(from, r, c, KING);
      else if (up === 'B') slider(from, r, c, DIAG);
      else if (up === 'R') slider(from, r, c, ORTH);
      else if (up === 'Q') { slider(from, r, c, DIAG); slider(from, r, c, ORTH); }
    }

    // castling
    const home = us === 'w' ? 56 : 0;
    const kSq = home + 4;
    const rights = s.castling;
    const kingChar = us === 'w' ? 'K' : 'k';
    if (s.board[kSq] === kingChar && !isAttacked(s.board, kSq, them)) {
      const rookChar = us === 'w' ? 'R' : 'r';
      if (rights.includes(us === 'w' ? 'K' : 'k') && s.board[home + 7] === rookChar &&
        !s.board[home + 5] && !s.board[home + 6] &&
        !isAttacked(s.board, home + 5, them) && !isAttacked(s.board, home + 6, them)) {
        push(kSq, home + 6, { castle: 'k' });
      }
      if (rights.includes(us === 'w' ? 'Q' : 'q') && s.board[home] === rookChar &&
        !s.board[home + 1] && !s.board[home + 2] && !s.board[home + 3] &&
        !isAttacked(s.board, home + 3, them) && !isAttacked(s.board, home + 2, them)) {
        push(kSq, home + 2, { castle: 'q' });
      }
    }

    if (!legalOnly) return out;
    return out.filter((m) => {
      const n = makeMove(s, m);
      const k = kingSquare(n.board, us);
      return k >= 0 && !isAttacked(n.board, k, them);
    });
  }

  function sanOf(s, m, legal) {
    const moves = legal || genMoves(s);
    let san;
    if (m.castle) san = m.castle === 'k' ? 'O-O' : 'O-O-O';
    else {
      const up = m.piece.toUpperCase();
      if (up === 'P') {
        san = (m.captured || m.ep) ? FILES[m.from & 7] + 'x' + sqName(m.to) : sqName(m.to);
        if (m.promotion) san += '=' + m.promotion.toUpperCase();
      } else {
        let dis = '';
        const amb = moves.filter((x) => x.piece === m.piece && x.to === m.to && x.from !== m.from);
        if (amb.length) {
          const sameFile = amb.some((x) => (x.from & 7) === (m.from & 7));
          const sameRank = amb.some((x) => (x.from >> 3) === (m.from >> 3));
          if (!sameFile) dis = FILES[m.from & 7];
          else if (!sameRank) dis = String(8 - (m.from >> 3));
          else dis = sqName(m.from);
        }
        san = up + dis + (m.captured ? 'x' : '') + sqName(m.to);
      }
    }
    const after = makeMove(s, m);
    if (inCheck(after)) san += genMoves(after).length ? '+' : '#';
    return san;
  }

  const normSan = (t) => String(t)
    .replace(/[!?]+/g, '')
    .replace(/[+#]+$/g, '')
    .replace(/\u2013|\u2014|\u2212/g, '-')
    .replace(/^0-0-0$/i, 'O-O-O')
    .replace(/^0-0$/i, 'O-O')
    .replace(/^o-o-o$/i, 'O-O-O')
    .replace(/^o-o$/i, 'O-O')
    .replace(/e\.p\.?$/i, '')
    .trim();

  function moveFromSan(s, san) {
    const want = normSan(san);
    const legal = genMoves(s);
    for (const m of legal) {
      if (normSan(sanOf(s, m, legal)) === want) return m;
    }
    return null;
  }

  function movesBetween(s, from, to) {
    return genMoves(s).filter((m) => m.from === from && m.to === to);
  }

  /* ---------- PGN ---------- */

  const TOKEN_RE = /(\[[^\]\n]*\])|(\{[^}]*\})|(;[^\n]*)|(\()|(\))|(\$\d+)|(1-0|0-1|1\/2-1\/2|\*)|(\d+)\s*\.(?:\s*\.\.)?|([KQRBNOo0][^\s()\[\]{};$]*|[a-h][^\s()\[\]{};$]*)/g;

  function tokenize(text) {
    const toks = [];
    let m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(text)) !== null) {
      if (m[1]) toks.push({ t: 'header', v: m[1] });
      else if (m[2] || m[3]) toks.push({
        t: 'comment',
        v: (m[2] || m[3]).replace(/^[{;]|}$/g, '').replace(/\[%[^\]]*\]/g, '').replace(/\s+/g, ' ').trim()
      });
      else if (m[4]) toks.push({ t: 'open' });
      else if (m[5]) toks.push({ t: 'close' });
      else if (m[6]) toks.push({ t: 'nag', v: m[6] });
      else if (m[7]) toks.push({ t: 'result', v: m[7] });
      else if (m[8]) toks.push({ t: 'num', v: parseInt(m[8], 10) });
      else if (m[9]) toks.push({ t: 'san', v: m[9] });
    }
    return toks;
  }

  let NODE_ID = 0;
  function makeNode(parent, san, move, state) {
    return {
      id: ++NODE_ID, san, move, state, parent,
      children: [], comment: '', ply: parent ? parent.ply + 1 : 0
    };
  }

  // Parses a PGN that may contain many games and many variations.
  // Returns { roots: [{fen, node}], errors: [] }
  function parsePgn(text) {
    const toks = tokenize(text);
    const roots = [];
    const errors = [];
    let headers = {};
    let seenMoves = false;
    let gameOver = false;
    let root = null, cur = null;
    let dead = -1; // depth of a branch we gave up on, so one bad move doesn't poison the rest
    const stack = [];

    const rootFor = () => {
      const fen = headers.FEN && /\d/.test(headers.FEN) ? headers.FEN : START_FEN;
      let existing = roots.find((r) => r.fen === fen);
      if (!existing) {
        existing = { fen, node: makeNode(null, null, null, parseFen(fen)) };
        roots.push(existing);
      }
      return existing.node;
    };

    const startGame = () => {
      root = rootFor();
      cur = root;
      stack.length = 0;
      seenMoves = false;
      gameOver = false;
      dead = -1;
    };

    startGame();

    for (const tk of toks) {
      if (tk.t === 'header') {
        if (seenMoves) { headers = {}; startGame(); }
        const hm = /^\[\s*(\w+)\s+"([^"]*)"/.exec(tk.v);
        if (hm) headers[hm[1]] = hm[2];
        if (hm && hm[1] === 'FEN') { root = rootFor(); cur = root; }
        continue;
      }
      if (tk.t === 'nag') continue;
      if (tk.t === 'num') {
        // "1." at the top level means another line is starting from the root
        if (tk.v === 1 && stack.length === 0 && cur !== root) { cur = root; dead = -1; }
        continue;
      }
      if (tk.t === 'comment') { if (cur && cur !== root && !cur.comment) cur.comment = tk.v; continue; }
      if (tk.t === 'result') { if (stack.length === 0) { seenMoves = true; gameOver = true; dead = -1; } continue; }
      if (tk.t === 'open') {
        stack.push(cur);
        if (dead < 0) cur = cur.parent || cur;
        continue;
      }
      if (tk.t === 'close') {
        if (stack.length) cur = stack.pop();
        if (dead >= 0 && stack.length < dead) dead = -1;
        continue;
      }
      if (tk.t === 'san') {
        if (dead >= 0) continue;
        if (gameOver && stack.length === 0) { cur = root; gameOver = false; }
        const san = normSan(tk.v);
        if (!san || /^[a-h]$/.test(san)) continue;
        const existing = cur.children.find((c) => normSan(c.san) === san);
        if (existing) { cur = existing; seenMoves = true; continue; }
        const mv = moveFromSan(cur.state, san);
        if (!mv) {
          const where = pathOf(cur).map((n) => n.san).join(' ');
          errors.push(tk.v + (where ? ' after ' + where : ' at the start'));
          dead = stack.length;
          continue;
        }
        const node = makeNode(cur, sanOf(cur.state, mv), mv, makeMove(cur.state, mv));
        cur.children.push(node);
        cur = node;
        seenMoves = true;
      }
    }
    return { roots, errors };
  }

  function pathOf(node) {
    const out = [];
    let n = node;
    while (n && n.parent) { out.unshift(n); n = n.parent; }
    return out;
  }

  // Every root-to-leaf path is one drillable line.
  function enumerateLines(roots) {
    const lines = [];
    roots.forEach((r, ri) => {
      const walk = (node, acc) => {
        if (!node.children.length) {
          if (acc.length) lines.push({ rootIndex: ri, fen: r.fen, nodes: acc.slice() });
          return;
        }
        for (const ch of node.children) { acc.push(ch); walk(ch, acc); acc.pop(); }
      };
      walk(r.node, []);
    });
    return lines;
  }

  function countPositions(roots) {
    let n = 0;
    const walk = (node) => { for (const c of node.children) { n++; walk(c); } };
    roots.forEach((r) => walk(r.node));
    return n;
  }

  const API = {
    START_FEN, FILES, parseFen, toFen, cloneState, genMoves, makeMove, sanOf,
    moveFromSan, movesBetween, inCheck, isAttacked, sqName, sqIdx, colorOf,
    parsePgn, enumerateLines, countPositions, pathOf, normSan, kingSquare
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.Chess = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ===== Building a repertoire tree out of a game collection ===== */
(function (global) {
  const C = global.Chess;
  const SAN_RE = /^([KQRBN])?([a-h])?([1-8])?x?([a-h][1-8])(?:=?([QRBNqrbn]))?/;

  // Same result as moveFromSan, but skips generating SAN for every legal move.
  function fastMove(s, san) {
    san = san.replace(/[!?+#]+/g, '');
    const us = s.turn;
    if (/^(O-O-O|0-0-0)$/.test(san) || /^(O-O|0-0)$/.test(san)) {
      const side = /-O-O$|-0-0$/.test(san) ? 'q' : 'k';
      return C.genMoves(s).find((m) => m.castle === side) || null;
    }
    const m = SAN_RE.exec(san);
    if (!m) return null;
    const type = m[1] || 'P';
    const file = m[2] ? 'abcdefgh'.indexOf(m[2]) : -1;
    const rank = m[3] ? 8 - parseInt(m[3], 10) : -1;
    const to = C.sqIdx(m[4]);
    const promo = m[5] ? m[5].toLowerCase() : null;
    const want = us === 'w' ? type : type.toLowerCase();
    const cands = C.genMoves(s, false).filter((mv) =>
      mv.to === to && mv.piece === want &&
      (file < 0 || (mv.from & 7) === file) &&
      (rank < 0 || (mv.from >> 3) === rank) &&
      (!promo || mv.promotion === promo) &&
      (promo || !mv.promotion));
    if (!cands.length) return null;
    if (cands.length === 1) return cands[0];
    const them = us === 'w' ? 'b' : 'w';
    return cands.find((mv) => {
      const n = C.makeMove(s, mv);
      return !C.isAttacked(n.board, C.kingSquare(n.board, us), them);
    }) || null;
  }

  function eachGame(text, cb) {
    const lines = text.split(/\r?\n/);
    let headers = {}, moves = [], inMoves = false, n = 0;
    const flush = () => {
      if (moves.length) { cb(headers, moves.join(' '), n++); }
      headers = {}; moves = [];
    };
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (ln.charCodeAt(0) === 91) { // '['
        if (inMoves) { flush(); inMoves = false; }
        const h = /^\[(\w+)\s+"([^"]*)"/.exec(ln);
        if (h) headers[h[1]] = h[2];
      } else if (ln.trim()) { inMoves = true; moves.push(ln.trim()); }
    }
    flush();
    return n;
  }

  function gameTokens(movetext, limit) {
    const clean = movetext.replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ')
      .replace(/\$\d+/g, ' ').replace(/\d+\s*\.(\s*\.\.)?/g, ' ');
    const out = [];
    const parts = clean.split(/\s+/);
    for (let i = 0; i < parts.length && out.length < limit; i++) {
      const p = parts[i];
      if (!p || p === '*' || p === '1-0' || p === '0-1' || p === '1/2-1/2') continue;
      out.push(p);
    }
    return out;
  }

  // Pulls the games out of a collection as light records, so a tally can run in chunks.
  function collectGames(text, maxGames) {
    const out = [];
    eachGame(text, (h, mt) => {
      if (maxGames && out.length >= maxGames) return;
      out.push({
        r: h.Result === '1-0' ? 1 : h.Result === '0-1' ? 0 : 0.5,
        e: Math.max(parseInt(h.WhiteElo, 10) || 0, parseInt(h.BlackElo, 10) || 0),
        m: mt
      });
    });
    return out;
  }

  const newTally = () => ({ root: { san: null, n: 0, sc: 0, kids: new Map() }, used: 0 });

  function tallyInto(tally, games, from, to, opts) {
    const maxPlies = opts.maxPlies || 24;
    const minElo = opts.minElo || 0;
    for (let g = from; g < to && g < games.length; g++) {
      const game = games[g];
      if (minElo && game.e < minElo) continue;
      const toks = gameTokens(game.m, maxPlies);
      let s = C.parseFen(C.START_FEN), node = tally.root;
      tally.root.n++; tally.root.sc += game.r;
      tally.used++;
      for (let i = 0; i < toks.length; i++) {
        const mv = fastMove(s, toks[i]);
        if (!mv) break;
        const san = toks[i].replace(/[!?]+/g, '');
        let kid = node.kids.get(san);
        if (!kid) { kid = { san, n: 0, sc: 0, kids: new Map() }; node.kids.set(san, kid); }
        kid.n++; kid.sc += game.r;
        node = kid;
        s = C.makeMove(s, mv);
      }
    }
    return tally;
  }

  function tallyGames(text, opts) {
    const games = collectGames(text, opts.maxGames);
    const t = newTally();
    tallyInto(t, games, 0, games.length, opts);
    return { root: t.root, games: t.used };
  }

  // Keeps one move for you at every turn, and the popular replies for the opponent.
  function pruneTree(tally, opts) {
    const color = opts.color || 'w';
    const maxPlies = opts.maxPlies || 24;
    const minGames = opts.minGames || 8;
    const topReplies = opts.topReplies || 3;
    const stopAt = opts.stopAt || 0.04; // ignore replies under this share of the position

    const out = { san: null, children: [], n: tally.root.n, sc: tally.root.sc };
    const walk = (src, dst, state, ply) => {
      if (ply >= maxPlies) return;
      const kids = Array.from(src.kids.values()).sort((a, b) => b.n - a.n);
      if (!kids.length) return;
      const mine = state.turn === color;
      let keep;
      if (mine) {
        keep = [kids[0]];
      } else {
        keep = kids.filter((k) => k.n >= minGames && k.n / src.n >= stopAt).slice(0, topReplies);
        if (!keep.length) return;
      }
      for (const k of keep) {
        const mv = fastMove(state, k.san);
        if (!mv) continue;
        const node = { san: C.sanOf(state, mv), children: [], n: k.n, sc: k.sc, mine };
        dst.children.push(node);
        walk(k, node, C.makeMove(state, mv), ply + 1);
      }
    };
    walk(tally.root, out, C.parseFen(C.START_FEN), 0);
    return out;
  }

  // Turns the pruned tree back into a normal PGN so it can be stored and re-read.
  function treeToPgn(root, color, note) {
    const pct = (n) => Math.round(n * 100);
    const label = (nd) => {
      const share = nd.n;
      const score = nd.sc / nd.n;
      const w = color === 'w' ? score : 1 - score;
      return share + ' games, you score ' + pct(w) + '%';
    };
    const ser = (node, no, white, force) => {
      const kids = node.children;
      if (!kids.length) return '';
      let out = '';
      const main = kids[0];
      const branch = kids.length > 1; // only annotate where the game actually divided
      out += (white ? no + '.' : (force ? no + '...' : '')) + main.san;
      if (branch && main.n) out += ' {' + label(main) + '}';
      for (let i = 1; i < kids.length; i++) {
        const v = kids[i];
        out += ' (' + (white ? no + '.' : no + '...') + v.san +
          (v.n ? ' {' + label(v) + '}' : '') + ' ' +
          ser(v, white ? no : no + 1, !white, true) + ')';
      }
      out += ' ' + ser(main, white ? no : no + 1, !white, branch);
      return out;
    };
    return '[Event "' + (note || 'Repertoire') + '"]\n\n' +
      ser(root, 1, true, false).replace(/\s+/g, ' ').trim() + ' *\n';
  }

  C.fastMove = fastMove;
  C.collectGames = collectGames;
  C.newTally = newTally;
  C.tallyInto = tallyInto;
  C.tallyGames = tallyGames;
  C.pruneTree = pruneTree;
  C.treeToPgn = treeToPgn;
  C.eachGame = eachGame;
})(typeof globalThis !== 'undefined' ? globalThis : this);
