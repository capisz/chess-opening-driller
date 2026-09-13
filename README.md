# Chess Opening Driller

A repertoire trainer that makes you play every line back from memory before it
lets you move on to the next one.

Open `index.html` in a browser. There is no build step to run it, no server, and
no account — everything lives in one file and progress is kept in the browser.

## How the drilling works

A repertoire is a PGN with variations. Every root-to-leaf path through that tree
becomes a **line** you drill move by move: the opponent's moves play themselves
and you supply yours.

Each new line is taught first — the panel tells you the move in plain language
("Play the knight to f3", "Castle kingside") — and then immediately asked for
again with no prompts. A single wrong move during that second pass sends you
back to move one. A line is only released once you have played it back clean.

After that it goes on a schedule: clean runs push the next review out along a
1 / 3 / 8 / 20 / 45-day ladder, and a miss drops it back to due immediately.
The Practice tab opens on whatever is due, most overdue first.

You can also flip to the other side of the same tree and drill it as the
defender. That keeps its own separate set of records.

## Loading a repertoire

Two kinds of PGN work:

**A repertoire PGN** — variations in brackets, one or many games, Lichess study
exports. Comments become coaching notes shown while you drill.

**A collection of complete games** — e.g. a database file from pgnmentor. The
app detects this and merges the games into a repertoire tree instead: your side
keeps the most played move at each turn, the opponent keeps every reply seen in
enough games, cut at a depth you choose. A 15,000-game file reduces to roughly
60 drillable lines in a few seconds. Branch points carry the game count and the
score from the source games.

## Layout

    index.html                  the built app — this is what you open or deploy
    src/shell.html              markup and CSS
    src/engine.js               move generation, SAN, PGN parsing, tree building
    src/app.js                  drilling, scheduling, rendering, import
    src/pieces.sprite.json      the piece set, as SVG symbols
    tools/build.js              rebuilds index.html from src/
    tools/engine-test.js        perft and PGN parser tests
    tools/sim.js                drives a full drill against a stub DOM

Edit anything under `src/`, then:

    node tools/build.js

## Tests

    node tools/engine-test.js   # move generation and PGN parsing
    node tools/sim.js           # the drill loop end to end

`engine-test.js` runs perft to depth 4 on five standard positions, so a change
that breaks move generation fails loudly. `sim.js` plays real lines through the
state machine — right moves, wrong moves, restarts, scheduling, both sides — and
checks what lands in the progress records.

## The chess engine

Written from scratch rather than pulled from a package, so the file stays
self-contained with nothing to break later. It handles castling rights, en
passant, promotion, check and mate detection, and SAN disambiguation. The PGN
parser takes nested variations, several games in one file, NAGs, comments, and
`[FEN]` starting positions, and skips a bad branch rather than failing the whole
import.

## Note on the piece set

`src/pieces.sprite.json` was cut from a piece set supplied by hand; its origin
and licence have not been confirmed. Check that before publishing this anywhere
public, and before adding a licence file to this repository — swapping the
sprite is a single file change.
