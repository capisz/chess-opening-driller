const C=require('./engine.js'); const fs=require('fs');
// side is an editorial call per file: a White system against a defence builds a
// White repertoire; a file named for Black's choice builds a Black one.
const jobs=[
 {id:'giuoco',  files:['GiuocoPiano'], color:'w', name:'Giuoco Piano',
  blurb:'The quiet Italian. Build with c3 and d3, castle, and wait for Black to commit before opening the centre.'},
 {id:'ruy',     files:['RuyLopezOther3'], color:'w', name:'Ruy Lopez sidelines',
  blurb:'Everything Black plays on move three apart from 3...a6, answered with a c3 and d4 centre.'},
 {id:'vienna',  files:['Vienna'], color:'w', name:'Vienna Game',
  blurb:'2.Nc3 keeps the centre flexible and sets up f4 or a quick Bc4 without walking into prepared Ruy theory.'},
 {id:'bogo',    files:['Bogo4Bd2'], color:'w', name:'Bogo-Indian, 4.Bd2',
  blurb:'Meet the Bogo check by blocking on d2. Trades come fast and the positions stay easy to handle.'},
 {id:'fradv',   files:['FrenchAdvance'], color:'w', name:'French Advance',
  blurb:'Clamp the centre with 3.e5 and play on the queenside space while Black chips at d4.'},
 {id:'frex',    files:['FrenchExchange'], color:'w', name:'French Exchange',
  blurb:'Open the position on move three. Symmetrical structure, quick development, no forcing theory to memorise.'},
 {id:'frkia',   files:['FrenchKIA'], color:'w', name:"French King's Indian Attack",
  blurb:'A setup rather than a variation: d3, Nd2, g3 and e5, then attack on the kingside.'},
 {id:'ckex',    files:['Caro-KannEx'], color:'w', name:'Caro-Kann Exchange',
  blurb:'Trade on d5 and play the Carlsbad structure with Bd3 and c3 \\u2014 the simplest way to a real game.'},
 {id:'alapin',  files:['SicilianAlapin2d5','SicilianAlapin2Nf6'], color:'w', name:'Sicilian Alapin',
  blurb:'2.c3 builds a big centre and sidesteps every main Sicilian. Both 2...d5 and 2...Nf6 are covered.'},
 {id:'grandpx', files:['SicilianGrandPrix'], color:'w', name:'Sicilian Grand Prix',
  blurb:'Nc3 and f4, then pile onto the kingside. A club-level attacking weapon against the Sicilian.'},
 {id:'sic2f4',  files:['Sicilian2f4'], color:'w', name:'Sicilian, 2.f4',
  blurb:'The direct McDonnell move order: grab kingside space at once and skip the Open Sicilian entirely.'},
 {id:'qga',     files:['QGA3e4'], color:'w', name:"Queen's Gambit Accepted, 3.e4",
  blurb:'Take the whole centre on move three and accept sharp play for the pawn Black grabbed.'},
 {id:'slavex',  files:['SlavExchange'], color:'w', name:'Slav Exchange',
  blurb:'Trade on d5 and squeeze the symmetrical structure. Quiet, low theory, and very hard for Black to win.'},
 {id:'ck4nf6',  files:['Caro-Kann4Nf6'], color:'b', name:'Caro-Kann, 4...Nf6',
  blurb:'The solid classical Caro. Let White break the knight on f6 and get a sound structure with easy plans.'},
 {id:'philidor',files:['Philidor'], color:'b', name:'Philidor Defence',
  blurb:'A compact answer to 1.e4 that avoids the Ruy entirely and gives Black a sturdy, familiar setup.'},
 {id:'slav4a6', files:['Slav4a6'], color:'b', name:'Slav, Chebanenko',
  blurb:'4...a6 before anything else. Black keeps every option and prepares b5 or a quick dxc4.'},
 {id:'baltic',  files:['QGSym-Baltic'], color:'b', name:"Queen's Gambit: Baltic and 2...c5",
  blurb:'Meet 1.d4 d5 2.c4 with immediate activity instead of a wall of Slav and QGD theory.'},
 {id:'nimzo',   files:['Najdorf'], color:'b', name:'Nimzo-Indian',
  blurb:'A Black answer to 1.d4, drawn from the 1,604 tournament games of Miguel Najdorf.'}
];
const out=[];
for(const j of jobs){
  let games=[];
  for(const f of j.files) games=games.concat(C.collectGames(fs.readFileSync('packs/'+f+'.pgn','utf8')));
  const elo = games.length>15000 ? 2400 : games.length>6000 ? 2250 : 0;
  let best=null;
  for(const [min,top] of [[8,4],[6,4],[5,4],[4,3]]){
    const opts={color:j.color,maxPlies:24,minGames:min,topReplies:top,minElo:elo,pick:'score',minPick:25};
    const t=C.newTally(); C.tallyInto(t,games,0,games.length,opts);
    const pgn=C.treeToPgn(C.pruneTree({root:t.root},opts),j.color,j.name);
    const p=C.parsePgn(pgn);
    const lines=C.enumerateLines(p.roots).filter(l=>l.nodes.some(n=>C.colorOf(n.move.piece)===j.color));
    best={pgn,lines:lines.length,positions:C.countPositions(p.roots),used:t.used,roots:p.roots};
    if(lines.length>=30) break;
  }
  let n=best.roots[0].node, main=[];
  while(n.children.length){ n=n.children[0]; main.push(n.san); }
  console.log(`${j.name.padEnd(34)} ${String(best.lines).padStart(3)} lines  ${String(best.positions).padStart(3)} pos  ${String(best.used).padStart(6)} games  elo${elo}`);
  console.log('    ' + main.slice(0,18).join(' '));
  out.push({id:j.id,name:j.name,color:j.color,blurb:j.blurb,lines:best.lines,
            positions:best.positions,games:best.used,pgn:best.pgn});
}
fs.writeFileSync('build/presets.json', JSON.stringify(out));
console.log('\npresets.json', Math.round(JSON.stringify(out).length/1024)+'KB', '| presets', out.length);
