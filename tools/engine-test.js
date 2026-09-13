const C = require('../src/engine.js');

function perft(s, d) {
  const moves = C.genMoves(s);
  if (d === 1) return moves.length;
  let n = 0;
  for (const m of moves) n += perft(C.makeMove(s, m), d - 1);
  return n;
}

const cases = [
  ['start', C.START_FEN, [20, 400, 8902, 197281]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['pos3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['pos4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['pos5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]]
];

let ok = true;
for (const [name, fen, expect] of cases) {
  const s = C.parseFen(fen);
  expect.forEach((exp, i) => {
    const got = perft(s, i + 1);
    const pass = got === exp;
    if (!pass) ok = false;
    console.log((pass ? 'ok  ' : 'FAIL') + ` perft ${name} d${i + 1}: ${got} (want ${exp})`);
  });
}

// SAN round trip through a real game with disambiguation, castling, promotion
const sanLine = 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Nb8 d4 Nbd7';
let st = C.parseFen(C.START_FEN);
for (const san of sanLine.split(' ')) {
  const m = C.moveFromSan(st, san);
  if (!m) { console.log('FAIL san parse: ' + san); ok = false; break; }
  const back = C.sanOf(st, m);
  if (C.normSan(back) !== C.normSan(san)) { console.log(`FAIL san round trip: ${san} -> ${back}`); ok = false; }
  st = C.makeMove(st, m);
}
console.log('ok   san round trip (Ruy Lopez 20 plies)');

// en passant + promotion + underpromotion mate
let ep = C.parseFen('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3');
const epm = C.moveFromSan(ep, 'exf6');
console.log((epm && epm.ep ? 'ok  ' : 'FAIL') + ' en passant capture parsed');
let pr = C.parseFen('8/P6k/8/8/8/8/7K/8 w - - 0 1');
console.log((C.moveFromSan(pr, 'a8=N') ? 'ok  ' : 'FAIL') + ' underpromotion parsed');

// PGN with nested variations + multiple games + comments + NAGs
const pgn = `
[Event "Repertoire"]
[White "Me"]

1. e4 {King's pawn} e5 $1 2. Nf3 Nc6 3. Bb5 (3. Bc4 Bc5 (3... Nf6 4. Ng5) 4. c3) 3... a6
4. Ba4 Nf6 5. O-O Be7 1-0

[Event "Repertoire 2"]

1. e4 c5 2. Nf3 d6 (2... Nc6 3. d4) 3. d4 cxd4 4. Nxd4 *
`;
const { roots, errors } = C.parsePgn(pgn);
const lines = C.enumerateLines(roots);
console.log('errors:', errors);
console.log('roots:', roots.length, 'positions:', C.countPositions(roots), 'lines:', lines.length);
lines.forEach((l) => console.log('  line:', l.nodes.map((n) => n.san).join(' ')));

// FEN-start game
const fenPgn = `[FEN "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3"]
[SetUp "1"]

3... Bc5 4. c3 Nf6 *`;
const r2 = C.parsePgn(fenPgn);
console.log('fen-start lines:', C.enumerateLines(r2.roots).map((l) => l.nodes.map((n) => n.san).join(' ')), r2.errors);

console.log(ok ? '\nALL CORE TESTS PASSED' : '\nSOME TESTS FAILED');
