// Chess Quest v3.0 — Local storage edition
// All data saved to device localStorage. No login, no Firebase, no network needed.
const { useState, useCallback, useRef, useEffect } = React;

const STORAGE_KEY = "chess_quest_data";

function loadLocal(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e){ return null; }
}

function saveLocal(data){
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch(e){ /* storage full or unavailable */ }
}

// ═══════════════════════════════════════════════════════════
// SOUND ENGINE — Web Audio API, no external files needed
// ═══════════════════════════════════════════════════════════
const AudioCtx = typeof window !== "undefined"
  ? (window.AudioContext || window.webkitAudioContext) : null;

let _ctx = null;
function getCtx(){
  if(!AudioCtx) return null;
  if(!_ctx) _ctx = new AudioCtx();
  if(_ctx.state === "suspended") _ctx.resume();
  return _ctx;
}

function playTone({freq=440, freq2=null, type="sine", vol=0.3, attack=0.01, hold=0.1, decay=0.2, delay=0}={}){
  const ctx = getCtx(); if(!ctx) return;
  setTimeout(()=>{
    const g = ctx.createGain();
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if(freq2) o.frequency.linearRampToValueAtTime(freq2, ctx.currentTime + hold);
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(vol, ctx.currentTime + attack);
    g.gain.setValueAtTime(vol, ctx.currentTime + attack + hold);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + attack + hold + decay);
    o.connect(g); g.connect(ctx.destination);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + attack + hold + decay + 0.05);
  }, delay * 1000);
}

const SFX = {
  // Piece picked up — soft click
  pickup(){ playTone({freq:800, freq2:600, type:"sine", vol:0.15, attack:0.005, hold:0.02, decay:0.08}); },

  // Piece placed — wooden thud
  drop(){
    playTone({freq:180, freq2:120, type:"triangle", vol:0.25, attack:0.005, hold:0.03, decay:0.12});
    playTone({freq:320, type:"triangle", vol:0.1, attack:0.005, hold:0.01, decay:0.06});
  },

  // Wrong move — descending buzz
  wrong(){
    playTone({freq:300, freq2:200, type:"sawtooth", vol:0.2, attack:0.01, hold:0.1, decay:0.15});
  },

  // Hint — soft chime
  hint(){
    playTone({freq:660, type:"sine", vol:0.2, attack:0.01, hold:0.05, decay:0.2});
    playTone({freq:880, type:"sine", vol:0.15, attack:0.01, hold:0.05, decay:0.2, delay:0.1});
  },

  // Button tap — light tick
  tap(){ playTone({freq:1000, type:"sine", vol:0.08, attack:0.003, hold:0.01, decay:0.05}); },

  // Correct / puzzle solved — ascending fanfare
  correct(){
    [{freq:523,d:0},{freq:659,d:0.1},{freq:784,d:0.2},{freq:1047,d:0.3}].forEach(({freq,d})=>{
      playTone({freq, type:"sine", vol:0.25, attack:0.01, hold:0.08, decay:0.2, delay:d});
    });
  },

  // XP collect — sparkle
  collect(){
    [0,0.06,0.12,0.18].forEach((d,i)=>{
      playTone({freq:800+i*200, type:"sine", vol:0.15, attack:0.005, hold:0.04, decay:0.15, delay:d});
    });
  },

  // Zone complete — big fanfare
  zoneComplete(){
    [[523,0],[659,0.1],[784,0.2],[1047,0.35],[1319,0.55]].forEach(([freq,d])=>{
      playTone({freq, type:"sine", vol:0.3, attack:0.01, hold:0.12, decay:0.3, delay:d});
    });
  },

  // Check warning
  check(){
    playTone({freq:440, freq2:350, type:"sawtooth", vol:0.2, attack:0.01, hold:0.08, decay:0.2});
    playTone({freq:440, freq2:350, type:"sawtooth", vol:0.2, attack:0.01, hold:0.08, decay:0.2, delay:0.25});
  },
};

// ═══════════════════════════════════════════════════════════
// PIECE SVGs (cburnett)
// ═══════════════════════════════════════════════════════════
const PIECES = {
  wP:`<path fill="#fff" stroke="#000" stroke-linecap="round" stroke-width="1.5" d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"/>`,
  wR:`<g fill="#fff" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path stroke-linecap="butt" d="M9 39h27v-3H9zm3-3v-4h21v4zm-1-22V9h4v2h5V9h5v2h5V9h4v5"/><path d="m34 14-3 3H14l-3-3"/><path stroke-linecap="butt" stroke-linejoin="miter" d="M31 17v12.5H14V17"/><path d="m31 29.5 1.5 2.5h-20l1.5-2.5"/><path fill="none" stroke-linejoin="miter" d="M11 14h23"/></g>`,
  wN:`<g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path fill="#fff" d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"/><path fill="#fff" d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3"/><path fill="#000" d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0m5.433-9.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5"/></g>`,
  wB:`<g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><g fill="#fff" stroke-linecap="butt"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.35.49-2.32.47-3-.5 1.35-1.94 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/></g><path stroke-linejoin="miter" d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5"/></g>`,
  wQ:`<g fill="#fff" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M8 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0m16.5-4.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0M41 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0M16 8.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0M33 9a2 2 0 1 1-4 0 2 2 0 1 1 4 0"/><path stroke-linecap="butt" d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14z"/><path stroke-linecap="butt" d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z"/><path fill="none" d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0"/></g>`,
  wK:`<g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path stroke-linejoin="miter" d="M22.5 11.63V6M20 8h5"/><path fill="#fff" stroke-linecap="butt" stroke-linejoin="miter" d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"/><path fill="#fff" d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10z"/><path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0"/></g>`,
  bP:`<path stroke="#000" stroke-linecap="round" stroke-width="1.5" d="M22.5 9a4 4 0 0 0-3.22 6.38 6.48 6.48 0 0 0-.87 10.65c-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47a6.46 6.46 0 0 0-.87-10.65A4.01 4.01 0 0 0 22.5 9z"/>`,
  bR:`<g fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path stroke-linecap="butt" d="M9 39h27v-3H9zm3.5-7 1.5-2.5h17l1.5 2.5zm-.5 4v-4h21v4z"/><path stroke-linecap="butt" stroke-linejoin="miter" d="M14 29.5v-13h17v13z"/><path stroke-linecap="butt" d="M14 16.5 11 14h23l-3 2.5zM11 14V9h4v2h5V9h5v2h5V9h4v5z"/><path fill="none" stroke="#ececec" stroke-linejoin="miter" stroke-width="1" d="M12 35.5h21m-20-4h19m-18-2h17m-17-13h17M11 14h23"/></g>`,
  bN:`<g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path fill="#000" d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"/><path fill="#000" d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.04-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-1-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-2 2.5-3c1 0 1 3 1 3"/><path fill="#ececec" stroke="#ececec" d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0m5.43-9.75a.5 1.5 30 1 1-.86-.5.5 1.5 30 1 1 .86.5"/><path fill="#ececec" stroke="none" d="m24.55 10.4-.45 1.45.5.15c3.15 1 5.65 2.49 7.9 6.75S35.75 29.06 35.25 39l-.05.5h2.25l.05-.5c.5-10.06-.88-16.85-3.25-21.34s-5.79-6.64-9.19-7.16z"/></g>`,
  bB:`<g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><g fill="#000" stroke-linecap="butt"><path d="M9 36c3.4-1 10.1.4 13.5-2 3.4 2.4 10.1 1 13.5 2 0 0 1.6.5 3 2-.7 1-1.6 1-3 .5-3.4-1-10.1.5-13.5-1-3.4 1.5-10.1 0-13.5 1-1.4.5-2.3.5-3-.5 1.4-2 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/></g><path stroke="#ececec" stroke-linejoin="miter" d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5"/></g>`,
  bQ:`<g fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><g stroke="none"><circle cx="6" cy="12" r="2.75"/><circle cx="14" cy="9" r="2.75"/><circle cx="22.5" cy="8" r="2.75"/><circle cx="31" cy="9" r="2.75"/><circle cx="39" cy="12" r="2.75"/></g><path stroke-linecap="butt" d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5z"/><path stroke-linecap="butt" d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z"/><path fill="none" stroke-linecap="butt" d="M11 38.5a35 35 1 0 0 23 0"/><path fill="none" stroke="#ececec" d="M11 29a35 35 1 0 1 23 0m-21.5 2.5h20m-21 3a35 35 1 0 0 22 0m-23 3a35 35 1 0 0 24 0"/></g>`,
  bK:`<g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path stroke-linejoin="miter" d="M22.5 11.6V6"/><path fill="#000" stroke-linecap="butt" stroke-linejoin="miter" d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"/><path fill="#000" d="M11.5 37a22.3 22.3 0 0 0 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10z"/><path stroke-linejoin="miter" d="M20 8h5"/><path stroke="#ececec" d="M32 29.5s8.5-4 6-9.7C34.1 14 25 18 22.5 24.6v2.1-2.1C20 18 9.9 14 7 19.9c-2.5 5.6 4.8 9 4.8 9"/><path stroke="#ececec" d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0"/></g>`,
};
const PK=c=>c[0]+c[1].toUpperCase();
function PieceSVG({code}){
  return <svg viewBox="0 0 45 45" width="100%" height="100%" style={{display:"block",userSelect:"none",pointerEvents:"none",filter:"drop-shadow(0 1px 3px rgba(0,0,0,.5))"}} dangerouslySetInnerHTML={{__html:PIECES[PK(code)]}}/>;
}

// ═══════════════════════════════════════════════════════════
// CHESS ENGINE
// ═══════════════════════════════════════════════════════════
const FILES="abcdefgh";
const VALS={p:1,n:3,b:3,r:5,q:9,k:99};
const inb=(r,c)=>r>=0&&r<8&&c>=0&&c<8;
const typ=p=>p?p[1]:null;
const sqN=(r,c)=>FILES[c]+(8-r);
const mine=(p,s)=>p&&p[0]===s;
const enemy=(p,s)=>p&&p[0]!==s;
const cloneB=b=>b.map(r=>r.slice());
const opp=s=>s==="w"?"b":"w";
const INIT=()=>[["br","bn","bb","bq","bk","bb","bn","br"],["bp","bp","bp","bp","bp","bp","bp","bp"],[null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null],["wp","wp","wp","wp","wp","wp","wp","wp"],["wr","wn","wb","wq","wk","wb","wn","wr"]];
function pMoves(board,r,c,side){const p=board[r][c],t=typ(p),moves=[];const add=(rr,cc)=>{if(inb(rr,cc)&&!mine(board[rr][cc],side))moves.push({from:{r,c},to:{r:rr,c:cc},piece:p,captured:board[rr][cc]});};const slide=dirs=>{for(const[dr,dc]of dirs){let rr=r+dr,cc=c+dc;while(inb(rr,cc)){if(!board[rr][cc])add(rr,cc);else{if(enemy(board[rr][cc],side))add(rr,cc);break;}rr+=dr;cc+=dc;}}};if(t==="p"){const dir=side==="w"?-1:1,st=side==="w"?6:1;if(inb(r+dir,c)&&!board[r+dir][c]){add(r+dir,c);if(r===st&&!board[r+2*dir][c])add(r+2*dir,c);}for(const dc of[-1,1]){const rr=r+dir,cc=c+dc;if(inb(rr,cc)&&enemy(board[rr][cc],side))add(rr,cc);}}else if(t==="n"){[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(d=>add(r+d[0],c+d[1]));}else if(t==="b")slide([[-1,-1],[-1,1],[1,-1],[1,1]]);else if(t==="r")slide([[-1,0],[1,0],[0,-1],[0,1]]);else if(t==="q")slide([[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]);else if(t==="k"){for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if(dr||dc)add(r+dr,c+dc);}return moves;}
function applyM(board,m){const b=cloneB(board);b[m.to.r][m.to.c]=m.piece;b[m.from.r][m.from.c]=null;if(m.piece==="wp"&&m.to.r===0)b[m.to.r][m.to.c]="wq";if(m.piece==="bp"&&m.to.r===7)b[m.to.r][m.to.c]="bq";return b;}
function inCheck(board,side){let kr=-1,kc=-1;for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(board[r][c]===side+"k"){kr=r;kc=c;}if(kr<0)return true;const ot=opp(side);for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(mine(board[r][c],ot))if(pMoves(board,r,c,ot).some(m=>m.to.r===kr&&m.to.c===kc))return true;return false;}
function legalFor(board,r,c,side){if(!mine(board[r][c],side))return[];return pMoves(board,r,c,side).filter(m=>!inCheck(applyM(board,m),side));}
function allLegal(board,side){const out=[];for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(mine(board[r][c],side))out.push(...legalFor(board,r,c,side));return out;}
function notation(m){const t=typ(m.piece),cap=m.captured?"x":"",dest=sqN(m.to.r,m.to.c);if(t==="p")return(m.captured?FILES[m.from.c]:"")+cap+dest;return({n:"N",b:"B",r:"R",q:"Q",k:"K"}[t])+cap+dest;}
function isAttBy(board,r,c,side){for(let rr=0;rr<8;rr++)for(let cc=0;cc<8;cc++)if(mine(board[rr][cc],side)&&pMoves(board,rr,cc,side).some(m=>m.to.r===r&&m.to.c===c))return true;return false;}
function hangingFor(board,side){const ot=opp(side),res=[];for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=board[r][c];if(!mine(p,side))continue;if(isAttBy(board,r,c,ot)&&!isAttBy(board,r,c,side))res.push({r,c,piece:p});}return res;}
function threatsFor(board,side){const ot=opp(side),res=[];for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=board[r][c];if(!mine(p,side))continue;const atts=[];for(let rr=0;rr<8;rr++)for(let cc=0;cc<8;cc++)if(mine(board[rr][cc],ot)&&pMoves(board,rr,cc,ot).some(m=>m.to.r===r&&m.to.c===c))atts.push(board[rr][cc]);if(!atts.length)continue;if(!isAttBy(board,r,c,side)||Math.min(...atts.map(a=>VALS[typ(a)]))<VALS[typ(p)])res.push({r,c,piece:p});}return res;}
function findForks(board,side){const ot=opp(side),forks=[];for(let r=0;r<8;r++)for(let c=0;c<8;c++){if(!mine(board[r][c],side))continue;for(const m of legalFor(board,r,c,side)){const nb=applyM(board,m);const att=[];for(let rr=0;rr<8;rr++)for(let cc=0;cc<8;cc++){if(!mine(nb[rr][cc],ot)||VALS[typ(nb[rr][cc])]<3)continue;if(pMoves(nb,m.to.r,m.to.c,side).some(mv=>mv.to.r===rr&&mv.to.c===cc))att.push(nb[rr][cc]);}if(att.length>=2)forks.push({move:m,targets:att});}}return forks;}
function scoreBlack(board,m){let s=0;if(m.captured)s+=VALS[typ(m.captured)]*10;if(["bn","bb"].includes(m.piece)&&m.from.r===0)s+=7;if(m.piece==="bp"&&(m.to.c===3||m.to.c===4))s+=4;if(inCheck(applyM(board,m),"w"))s+=8;return s+Math.random()*3;}
function pickBlack(board){const moves=allLegal(board,"b");if(!moves.length)return null;moves.sort((a,b)=>scoreBlack(board,b)-scoreBlack(board,a));return moves.slice(0,Math.min(6,moves.length))[Math.floor(Math.random()*Math.min(6,moves.length))];}

// ═══════════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════════
const RANKS=[{name:"Pawn",min:0,icon:"♙",color:"#95a5a6"},{name:"Knight",min:300,icon:"♘",color:"#27ae60"},{name:"Bishop",min:600,icon:"♗",color:"#2980b9"},{name:"Rook",min:900,icon:"♖",color:"#8e44ad"},{name:"Queen",min:1200,icon:"♕",color:"#e67e22"},{name:"King",min:1500,icon:"♔",color:"#f1c40f"}];
const getRank=xp=>[...RANKS].reverse().find(r=>xp>=r.min)||RANKS[0];
const getNextRank=xp=>{const i=RANKS.findIndex(r=>r.min>xp);return i>=0?RANKS[i]:null;};

const ZONES=[
  {id:"pieces",  label:"Piece Power",  emoji:"♞",  color:"#e74c3c", light:"#ff6b6b", bg:"#c0392b", desc:"Learn how pieces move!",        stars:6},
  {id:"openings",label:"Openings",     emoji:"🏰", color:"#27ae60", light:"#55efc4", bg:"#1e8449", desc:"Start the game like a champion!", stars:6},
  {id:"tactics", label:"Tactics",      emoji:"⚔️",  color:"#f39c12", light:"#ffd93d", bg:"#e67e22", desc:"Win pieces for free!",           stars:8, locked:true},
  {id:"strategy",label:"Strategy",     emoji:"🧠", color:"#2980b9", light:"#74b9ff", bg:"#1a5276", desc:"Think like a pro!",              stars:8, locked:true},
  {id:"endgame", label:"Endgame",      emoji:"👑", color:"#8e44ad", light:"#a29bfe", bg:"#6c3483", desc:"How to finish and win!",         stars:6, locked:true},
  {id:"rush",    label:"Puzzle Rush",  emoji:"⚡", color:"#e84393", light:"#fd79a8", bg:"#c0136e", desc:"Speed challenges — think fast!",  stars:6, locked:true},
];

const PUZZLES=[
  // Puzzle 1: Qg8# — queen slides up h-file, king cornered at h8, no escape
  // wq=g1(7,6), wk=a1(7,0), bk=h8(0,7)
  // Qg8: queen goes to (0,6). Attacks (0,7)=bk. King can't go to g7(1,6) or h7(1,7) — both covered by queen. CHECKMATE.
  {id:1,zone:"pieces",title:"Checkmate in 1!",desc:"Slide your Queen to g8 to checkmate the King in the corner!",emoji:"⚔️",
    board:[
      [null,null,null,null,null,null,null,"bk"],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      ["wk",null,null,null,null,null,"wq",null]
    ],
    solution:{from:{r:7,c:6},to:{r:0,c:6}},
    hint:"The Queen slides in straight lines — send her all the way to the top!",xp:30},

  // Puzzle 2: Knight Fork — CORRECTED
  // wn=a4(4,0), bk=c8(0,2), br=d5(3,3), wk=h1(7,7)
  // wn moves to b6(2,1). Knight on (2,1) attacks: (0,0),(0,2)=bk✓,(1,3),(3,3)=br✓,(4,0),(4,2)
  // bk at (0,2) cannot reach (2,1) — 2 rows away
  // br at (3,3) cannot reach (2,1) — diagonal, rooks move straight only
  // VALID fork attacking both king and rook safely
  {id:2,zone:"tactics",title:"Fork Attack!",desc:"Jump your Knight to attack BOTH the King and Rook at the same time!",emoji:"🍴",
    board:[
      [null,null,"bk",null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,"br",null,null,null,null],
      ["wn",null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,"wk"]
    ],
    solution:{from:{r:4,c:0},to:{r:2,c:1}},
    hint:"Move the Knight to b6 — it attacks TWO pieces at once! Neither can take it!",xp:40},

  // Puzzle 3: Free Piece — CORRECTED
  // Simple: black knight on e5(3,4) is hanging — not defended by any black piece
  // wq=d1(7,3) can capture it. Nothing defends e5 for black.
  // bk=e8(0,4), bp on d7(1,3) and f7(1,5) but neither defends e5
  // wq at (7,3) takes (3,4): queen moves diagonally — (7,3)→(3,4)? No, that's not straight.
  // Use wp at d4(4,3) captures bn at e5(3,4) diagonally — pawns capture diagonally!
  // Is bn at (3,4) defended? bk at (0,4) — 3 rows away, no. bp at (1,3),(1,5) — 2 rows away, no.
  // VALID
  {id:3,zone:"tactics",title:"Free Piece!",desc:"One of Black's knights is all alone with no protection — grab it with your pawn!",emoji:"🎯",
    board:[
      [null,null,null,null,"bk",null,null,null],
      [null,null,null,"bp",null,"bp",null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,"bn",null,null,null],
      [null,null,null,"wp",null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,"wk",null,null,null]
    ],
    solution:{from:{r:4,c:3},to:{r:3,c:4}},
    hint:"Pawns capture diagonally! Your pawn can take the unprotected knight!",xp:25},

  // Puzzle 4: Knight Jump — learn L-shape movement
  // wn=a8(0,0), star at c7(1,2). Simple move demonstration.
  {id:4,zone:"pieces",title:"Knight Jump!",desc:"Move the Knight to the star square to learn its L-shaped move!",emoji:"♞",
    board:[
      ["wn",null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,"wk",null,null,null]
    ],
    solution:{from:{r:0,c:0},to:{r:1,c:2}},
    targetSq:{r:1,c:2},
    hint:"Knights move in an L: 2 squares one way, 1 square the other!",xp:20},

  // Puzzle 5: Centre control — move e2-e4
  {id:5,zone:"openings",title:"Control the Centre!",desc:"Move your pawn two squares forward to take control of the centre!",emoji:"🏰",
    board:INIT(),
    solution:{from:{r:6,c:4},to:{r:4,c:4}},
    hint:"The best first moves go to the middle — e4 or d4!",xp:20},

  // Puzzle 6: Pin & Win — VERIFIED VALID
  // bk=e8(0,4), br=e5(3,4), wq=e3(5,4), wk=e1(7,4) — all on e-file
  // br is pinned (can't move or wq takes bk... wait wq already attacks bk through br)
  // wq captures br at (3,4). bk at (0,4) is 3 rows from (3,4) — cannot recapture. VALID.
  {id:6,zone:"tactics",title:"Pin & Win!",desc:"The Rook can't move — it's pinned to the King! Capture it with your Queen!",emoji:"📌",
    board:[
      [null,null,null,null,"bk",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,"br",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,"wq",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,"wk",null,null,null]
    ],
    solution:{from:{r:5,c:4},to:{r:3,c:4}},
    hint:"Your Queen lines up perfectly with their King and Rook — just slide forward!",xp:35},

  // Puzzle 7: Openings — develop your knight first move
  // Standard starting position, move knight from g1 to f3 (best opening move)
  // wn=g1(7,6), solution: wn to f3(5,5)
  {id:7,zone:"openings",title:"Knights First!",desc:"The best opening move is to bring out your knight! Move it to f3.",emoji:"♘",
    board:INIT(),
    solution:{from:{r:7,c:6},to:{r:5,c:5}},
    hint:"Knights to f3 or c3 are the best first moves — they control the centre!",xp:20},

  // Puzzle 8: Openings — castle your king to safety
  // Board after a few moves, white can castle kingside
  // wk=e1(7,4), wr=h1(7,7), clear squares f1,g1
  // Solution: king moves to g1 (castling — but we simplify as king side-step to safety)
  // Simpler: move king from e1 to f1 away from centre to demonstrate king safety
  {id:8,zone:"openings",title:"King Safety!",desc:"Your King is safer away from the centre. Move it to safety!",emoji:"🏰",
    board:[
      ["br",null,"bb","bq","bk","bb",null,"br"],
      ["bp","bp","bp","bp",null,"bp","bp","bp"],
      [null,null,"bn",null,null,"bn",null,null],
      [null,null,null,null,"bp",null,null,null],
      [null,null,null,null,"wp",null,null,null],
      [null,null,"wn",null,null,"wn",null,null],
      ["wp","wp","wp","wp",null,"wp","wp","wp"],
      ["wr",null,"wb","wq","wk",null,null,"wr"]
    ],
    solution:{from:{r:7,c:4},to:{r:7,c:6}},
    hint:"Move your King to g1 — it hides in the corner away from danger!",xp:25},

  // Puzzle 9: Pieces — bishop diagonal move
  // wb on c1(7,2), clear diagonal to h6(2,7), no pieces blocking
  // wk=a1(7,0), bk=e8(0,4)
  // Solution: wb from (7,2) to (2,7) — long diagonal
  {id:9,zone:"pieces",title:"Bishop Diagonal!",desc:"Bishops slide diagonally! Move your Bishop all the way to h6.",emoji:"♗",
    board:[
      [null,null,null,null,"bk",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      ["wk",null,"wb",null,null,null,null,null]
    ],
    solution:{from:{r:7,c:2},to:{r:2,c:7}},
    targetSq:{r:2,c:7},
    hint:"Bishops move diagonally — count the squares to the star!",xp:20},

  // Puzzle 10: Tactics — back rank checkmate
  // wq=d8(0,3), bk=h8(0,7), black back rank, wk=a1(7,0)
  // wq moves to h8(0,7) — checkmate! king has no escape (h7 and g8 all covered)
  // Actually: bk at g8(0,6), wq at a8(0,0), wk at f6(2,5) for support
  // wq slides from a8 to g8 — checkmate. g7=null, h8=null. bk on g8, wq to h8 covers g8 diag no wait
  // Clean setup: bk=h8(0,7), black pawns on g7(1,6) and f7(1,5) blocking escape
  // wq=a8(0,0) moves to h8(0,7) — checkmate along rank!
  // wk=a1(7,0) to avoid stalemate. bk trapped by own pawns.
  {id:10,zone:"tactics",title:"Back Rank Mate!",desc:"Slide your Queen along the back rank to checkmate the King!",emoji:"💥",
    board:[
      ["wq",null,null,null,null,null,null,"bk"],
      [null,null,null,null,null,"bp","bp","bp"],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      ["wk",null,null,null,null,null,null,null]
    ],
    solution:{from:{r:0,c:0},to:{r:0,c:7}},
    hint:"Slide the Queen all the way along the top rank — the King is trapped by its own pawns!",xp:40},

  // Puzzle 11: Tactics — queen captures hanging rook
  // br=d5(3,3) totally undefended, wq=d1(7,3) can take straight up d-file
  // bk=e8(0,4), wk=e1(7,4). Check bk doesn't defend d5: (0,4) to (3,3) = 3 rows, no.
  {id:11,zone:"tactics",title:"Grab the Rook!",desc:"The Rook is undefended! Slide your Queen up to capture it!",emoji:"🎯",
    board:[
      [null,null,null,null,"bk",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,"br",null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,"wq",null,"wk",null,null]
    ],
    solution:{from:{r:7,c:3},to:{r:3,c:3}},
    hint:"Your Queen and the Rook are on the same file — slide straight up to capture!",xp:30},

  // Puzzle 12: Pieces — rook controls a file
  // wr=a1(7,0), move to a8(0,0) — demonstrate rook power on open file
  // wk=h1(7,7), bk=e8(0,4)
  {id:12,zone:"pieces",title:"Rook Power!",desc:"Rooks love open files! Slide your Rook all the way up to a8.",emoji:"♜",
    board:[
      [null,null,null,null,"bk",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      ["wr",null,null,null,null,null,null,"wk"]
    ],
    solution:{from:{r:7,c:0},to:{r:0,c:0}},
    targetSq:{r:0,c:0},
    hint:"Rooks move in straight lines — slide all the way up the a-file!",xp:20},

  // ── PUZZLE RUSH — speed/pattern puzzles ──

  // PR1: Smothered king — king trapped in corner by own pieces, knight delivers mate
  // bk=h8(0,7), bp=g7(1,6), bp=h7(1,7) — king smothered
  // wn needs to jump to f7(1,5) — delivers check AND covers g8 and h8
  // From f7, knight attacks: d6,d8,e5,g5,h6,h8 — covers h8=king, so check
  // wk=a1(7,0) for legality
  {id:13,zone:"rush",title:"Smothered Mate!",desc:"The King is trapped by his own pieces! Jump your Knight in for checkmate!",emoji:"⚡",
    board:[
      [null,null,null,null,null,null,null,"bk"],
      [null,null,null,null,null,null,"bp","bp"],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      ["wk",null,null,null,null,"wn",null,null]
    ],
    solution:{from:{r:7,c:5},to:{r:1,c:6}},
    hint:"Knights jump in an L — find the square where your knight attacks the trapped King!",xp:50},

  // PR2: Double attack — queen fork hitting rook and knight simultaneously
  // wq=a1(7,0), br=d4(4,3), bn=g4(4,6), bk=e8(0,4), wk=h1(7,7)
  // wq to d4? No — wq from (7,0) to (4,3) is diagonal — yes! 3 steps diag.
  // From d4(4,3) queen attacks: along rank hits g4(4,6)=bn ✓, along diag up hits... 
  // Actually simpler: wq at a1(7,0) moves to d4(4,3) — diagonal move (3,3) 
  // At d4: attacks g4(4,6) along rank ✓ AND attacks... need another piece
  // Let's put br at d8(0,3) — same file as d4, queen attacks up the d-file
  // wq at d4 attacks: d8(0,3)=br ✓ AND g4(4,6)=bn ✓ (same rank)
  // Can br take wq? br at d8 is 4 squares away, and the queen IS on d4 which is on d-file — yes br could take if unprotected
  // Protect wq: put wp at c3(5,2) — wait, we just need the queen to fork 2 pieces
  // The POINT is it's a fork regardless — black can only save one piece
  {id:14,zone:"rush",title:"Queen Fork!",desc:"Move your Queen to attack TWO pieces at once — a fork!",emoji:"⚡",
    board:[
      [null,null,null,"br",null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,"bn",null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      ["wq",null,null,null,null,null,null,"wk"]
    ],
    solution:{from:{r:7,c:0},to:{r:4,c:3}},
    hint:"Move your Queen to d4 — it attacks the Rook on d8 AND the Knight on g4!",xp:45},

  // PR3: Fastest checkmate (Scholar's mate pattern simplified)
  // bk exposed after bad opening, wq delivers checkmate at f7
  // bk=e8(0,4), wq=h5(3,7), wb=c4(4,2), bp pawns normal minus f7
  // wq from h5(3,7) to f7(1,5) — checkmate! f7 attacked by wb on c4 diag AND wq
  // bk can't escape: d8,d7,e7,f8 — check them
  // Actually wq at f7(1,5): bk at e8(0,4). Is that check? f7 doesn't attack e8 directly... 
  // Simpler setup: wq=d1(7,3) to h5(3,7) — classic scholar's mate threat
  // Instead: clean mate in 1 — wq=h8(0,7) wait bk is there
  // Clean: bk=e8(0,4), clear path, wq=a5(3,0) → e5? No
  // Simple: wq at f3(5,5), move to f7(1,5) — straight up f-file, delivers check
  // bk at e8(0,4) — is f7(1,5) check? No, queen at f7 doesn't directly attack e8
  // OK let's do: bk=f8(0,5), wq=f1(7,5) → f7(1,5) — checkmate along f-file!
  // bk at f8, wq slides to f7. bk can go to e8,g8,e7,g7?
  // e8(0,4): attacked by wq on f7? Diagonally yes. g8(0,6): attacked by wq on f7 diag yes
  // e7(1,4): attacked by wq on f7 along rank. g7(1,6): attacked by wq on f7 along rank
  // So ALL escape squares covered — CHECKMATE! Just need wk not in stalemate position
  {id:15,zone:"rush",title:"File Mate!",desc:"Slide your Queen straight up the f-file for checkmate!",emoji:"⚡",
    board:[
      [null,null,null,null,null,"bk",null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,"wk",null,null,null,"wq",null,null]
    ],
    solution:{from:{r:7,c:5},to:{r:1,c:5}},
    hint:"Rooks AND Queens slide in straight lines — push your Queen all the way up!",xp:45},

  // PR4: Knight outpost — move knight to dominant central square
  // wn=g1(7,6) moves to e5(3,4) — powerful central square
  // Show it attacks many squares from there
  {id:16,zone:"rush",title:"Knight Outpost!",desc:"Plant your Knight in the centre — it controls the whole board from e5!",emoji:"⚡",
    board:[
      [null,null,null,null,"bk",null,null,null],
      ["bp","bp","bp",null,"bp","bp","bp","bp"],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,"wk",null,null,null,null,"wn",null]
    ],
    solution:{from:{r:7,c:6},to:{r:5,c:5}},
    targetSq:{r:5,c:5},
    hint:"Move the Knight toward the centre — it controls far more squares there!",xp:35},

  // ── PIECE POWER (additional) ──
  {id:17,zone:"pieces",title:"Queen Captures!",desc:"Slide your Queen up the d-file to capture the enemy Queen!",emoji:"♛",
    board:[
      [null,null,null,null,"bk",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,"bq",null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,"wq",null,null,null,"wk"]
    ],
    solution:{from:{r:7,c:3},to:{r:3,c:3}},
    hint:"Queens move along files — slide straight up to d5!",xp:25},

  {id:18,zone:"pieces",title:"Pawn Promotion!",desc:"Push your pawn all the way to the end to become a Queen!",emoji:"👑",
    board:[
      [null,null,null,null,null,null,null,"bk"],
      [null,null,null,null,"wp",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      ["wk",null,null,null,null,null,null,null]
    ],
    solution:{from:{r:1,c:4},to:{r:0,c:4}},
    hint:"Pawns that reach the other end become Queens — push to e8!",xp:25},

  {id:19,zone:"pieces",title:"Rook Checkmate!",desc:"Slide your Rook along the back rank to checkmate the King!",emoji:"♖",
    board:[
      ["bk",null,null,null,null,null,null,"wr"],
      ["bp","bn","wk",null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null]
    ],
    solution:{from:{r:0,c:7},to:{r:0,c:1}},
    hint:"The Rook slides along rank 8 — the King is trapped in the corner!",xp:35},

  {id:20,zone:"pieces",title:"King Captures!",desc:"The King can capture undefended pieces too! Take the Bishop!",emoji:"♔",
    board:[
      [null,null,null,null,"bk",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,"bb",null,null,null,null],
      [null,null,null,null,"wk",null,null,null]
    ],
    solution:{from:{r:7,c:4},to:{r:6,c:3}},
    hint:"Kings capture one square at a time — the Bishop on d2 is undefended!",xp:20},

  {id:21,zone:"pieces",title:"Bishop Strike!",desc:"Bishops attack diagonally! Capture the undefended Bishop on f7!",emoji:"♗",
    board:[
      [null,null,null,null,null,null,null,"bk"],
      [null,null,null,null,null,"bb",null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,"wb",null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      ["wk",null,null,null,null,null,null,null]
    ],
    solution:{from:{r:4,c:2},to:{r:1,c:5}},
    hint:"Count the diagonal squares — your Bishop on c4 can reach f7!",xp:25},

  {id:22,zone:"pieces",title:"Back Rank Crush!",desc:"Slide your Rook along the back rank — the King is trapped!",emoji:"♜",
    board:[
      ["bk",null,null,null,null,null,null,"wr"],
      ["bp","bn","wk",null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null]
    ],
    solution:{from:{r:0,c:7},to:{r:0,c:1}},
    hint:"The Rook sweeps the whole rank — the King has nowhere to go!",xp:35},

  // ── OPENINGS (additional) ──
  {id:23,zone:"openings",title:"d4 Opening!",desc:"Control the centre with your d-pawn — push it two squares forward!",emoji:"🏰",
    board:[
      ["br","bn","bb","bq","bk","bb","bn","br"],
      ["bp","bp","bp","bp","bp","bp","bp","bp"],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      ["wp","wp","wp","wp","wp","wp","wp","wp"],
      ["wr","wn","wb","wq","wk","wb","wn","wr"]
    ],
    solution:{from:{r:6,c:3},to:{r:4,c:3}},
    hint:"The d-pawn controls important central squares — push it to d4!",xp:20},

  {id:24,zone:"openings",title:"Italian Game!",desc:"Develop your Bishop to c4 — it eyes the f7 square near the King!",emoji:"♗",
    board:[
      ["br","bn","bb","bq","bk","bb","bn","br"],
      ["bp","bp","bp","bp",null,"bp","bp","bp"],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,"wp",null,null,null],
      [null,null,null,null,null,null,null,null],
      ["wp","wp","wp","wp",null,"wp","wp","wp"],
      ["wr","wn","wb","wq","wk","wb","wn","wr"]
    ],
    solution:{from:{r:7,c:5},to:{r:4,c:2}},
    hint:"The Bishop on c4 is very powerful — it aims at the King's weak point f7!",xp:25},

  {id:25,zone:"openings",title:"King Steps Away!",desc:"Move your King to f1 — it's the first step toward safety!",emoji:"🏰",
    board:[
      ["br",null,"bb","bq","bk",null,null,"br"],
      ["bp","bp","bp","bp",null,"bp","bp","bp"],
      [null,null,"bn",null,null,"bn",null,null],
      [null,null,null,null,"bp",null,null,null],
      [null,null,null,null,"wp",null,null,null],
      [null,null,"wn",null,null,"wn",null,null],
      ["wp","wp","wp","wp",null,"wp","wp","wp"],
      ["wr",null,"wb","wq","wk",null,null,"wr"]
    ],
    solution:{from:{r:7,c:4},to:{r:7,c:5}},
    hint:"Moving the King away from the centre keeps it safer early on!",xp:20},

  {id:26,zone:"openings",title:"Knight to d5!",desc:"Jump your Knight to the powerful d5 square in the centre!",emoji:"♞",
    board:[
      ["br","bn","bb","bq","bk","bb","bn","br"],
      ["bp","bp","bp","bp",null,"bp","bp","bp"],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,"bp",null,null,null],
      [null,null,null,null,"wp",null,null,null],
      [null,null,"wn",null,null,null,null,null],
      ["wp","wp","wp","wp",null,"wp","wp","wp"],
      ["wr",null,"wb","wq","wk","wb","wn","wr"]
    ],
    solution:{from:{r:5,c:2},to:{r:3,c:3}},
    hint:"Knights are strongest in the centre — d5 is a great outpost!",xp:25},

  {id:27,zone:"openings",title:"Central Capture!",desc:"Capture the pawn on d5 to control the centre!",emoji:"⚔️",
    board:[
      ["br","bn","bb","bq","bk","bb","bn","br"],
      ["bp","bp","bp",null,"bp","bp","bp","bp"],
      [null,null,null,null,null,null,null,null],
      [null,null,null,"bp",null,null,null,null],
      [null,null,null,null,"wp",null,null,null],
      [null,null,"wn",null,null,null,null,null],
      ["wp","wp","wp","wp",null,"wp","wp","wp"],
      ["wr",null,"wb","wq","wk","wb","wn","wr"]
    ],
    solution:{from:{r:4,c:4},to:{r:3,c:3}},
    hint:"Pawns capture diagonally — take the pawn on d5 to open the centre!",xp:25},

  {id:28,zone:"openings",title:"Develop the Knight!",desc:"Bring your Queen's Knight out — Knights before Bishops!",emoji:"♘",
    board:[
      ["br","bn","bb","bq","bk","bb","bn","br"],
      ["bp","bp","bp","bp","bp","bp","bp","bp"],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,"wp",null,null,null],
      [null,null,null,null,null,null,null,null],
      ["wp","wp","wp","wp",null,"wp","wp","wp"],
      ["wr","wn","wb","wq","wk","wb","wn","wr"]
    ],
    solution:{from:{r:7,c:1},to:{r:5,c:2}},
    hint:"The Knight on b1 should go to c3 — it controls the centre and develops quickly!",xp:20},

  {id:29,zone:"openings",title:"Queen to f3!",desc:"Move your Queen to f3 — it joins the attack on f7!",emoji:"♛",
    board:[
      ["br","bn","bb","bq","bk","bb",null,"br"],
      ["bp","bp","bp","bp",null,"bp","bp","bp"],
      [null,null,null,null,null,"bn",null,null],
      [null,null,null,null,"bp",null,null,null],
      [null,null,null,null,"wp",null,null,null],
      [null,null,"wn",null,null,null,null,null],
      ["wp","wp","wp","wp",null,"wp","wp","wp"],
      ["wr",null,"wb","wq","wk","wb","wn","wr"]
    ],
    solution:{from:{r:7,c:3},to:{r:5,c:5}},
    hint:"The Queen on f3 eyes the weak f7 pawn near the enemy King!",xp:30},

  // ── TACTICS (additional) ──
  {id:30,zone:"tactics",title:"Queen Swipe!",desc:"Your Queen can slide up the e-file and capture the enemy Queen!",emoji:"⚡",
    board:[
      [null,null,null,null,"bq",null,null,"bk"],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      ["wk",null,null,null,"wq",null,null,null]
    ],
    solution:{from:{r:7,c:4},to:{r:0,c:4}},
    hint:"The Queens are on the same file with nothing between them — take it!",xp:35},

  {id:31,zone:"tactics",title:"Knight Fork!",desc:"Jump your Knight to f6 — it attacks the King AND the Rook at the same time!",emoji:"🍴",
    board:[
      [null,null,null,null,"bk",null,"br",null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,"wn",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      ["wk",null,null,null,null,null,null,null]
    ],
    solution:{from:{r:4,c:4},to:{r:2,c:5}},
    hint:"From f6 the Knight attacks two pieces at once — a fork!",xp:40},

  {id:32,zone:"tactics",title:"Discovered Attack!",desc:"Move your Knight to reveal your Bishop attacking the King!",emoji:"🎯",
    board:[
      [null,null,null,null,null,null,null,"bk"],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,"wn",null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,"wb",null,null,null,null,null,null],
      ["wk",null,null,null,null,null,null,null]
    ],
    solution:{from:{r:4,c:3},to:{r:2,c:4}},
    hint:"Move the Knight out of the way — it uncovers your Bishop's attack on the King!",xp:40},

  {id:33,zone:"tactics",title:"Capture with Check!",desc:"Take the Bishop AND give check at the same time!",emoji:"💥",
    board:[
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,"bk",null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,"bb",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      ["wq",null,null,null,null,null,null,"wk"]
    ],
    solution:{from:{r:7,c:0},to:{r:3,c:4}},
    hint:"Your Queen can capture on e5 and attack the King in the same move!",xp:35},

  {id:34,zone:"tactics",title:"Pin and Win!",desc:"The Rook is pinned to the King — capture it for free!",emoji:"📌",
    board:[
      [null,null,null,null,"bk",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,"br",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      ["wk",null,null,null,"wq",null,null,null]
    ],
    solution:{from:{r:7,c:4},to:{r:3,c:4}},
    hint:"A pinned piece can't move — the Rook on e5 is stuck, take it!",xp:35},

  // ── ENDGAME ──
  {id:35,zone:"endgame",title:"Queen and King Mate!",desc:"Slide your Queen to b7 — the King is trapped in the corner!",emoji:"👑",
    board:[
      ["bk",null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,"wk",null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,"wq",null,null,null,null,null,null]
    ],
    solution:{from:{r:7,c:1},to:{r:1,c:1}},
    hint:"The Queen on b7 gives check — the King at a8 has nowhere to go!",xp:40},

  {id:36,zone:"endgame",title:"Promote to Win!",desc:"Push the pawn to e8 and promote it to a Queen!",emoji:"♛",
    board:[
      [null,null,null,null,null,null,null,"bk"],
      [null,null,null,null,"wp",null,null,null],
      [null,null,null,null,"wk",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null]
    ],
    solution:{from:{r:1,c:4},to:{r:0,c:4}},
    hint:"The pawn is one step from queening — push it!",xp:35},

  {id:37,zone:"endgame",title:"Rook to b8!",desc:"Slide your Rook along the back rank — the King is cornered!",emoji:"♖",
    board:[
      ["bk",null,null,null,null,null,null,"wr"],
      ["bp","bn","wk",null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null]
    ],
    solution:{from:{r:0,c:7},to:{r:0,c:1}},
    hint:"The Rook slides to b8 giving check — the King can't escape!",xp:40},

  {id:38,zone:"endgame",title:"King Marches!",desc:"In endgames the King is a fighter — march it toward the centre!",emoji:"♔",
    board:[
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,"bk",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,"wk",null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null]
    ],
    solution:{from:{r:3,c:2},to:{r:4,c:3}},
    hint:"Activate your King in the endgame — it belongs in the centre!",xp:25},

  {id:39,zone:"endgame",title:"Unstoppable Pawn!",desc:"Push the pawn to e8 — nothing can stop it becoming a Queen!",emoji:"♟️",
    board:[
      [null,null,null,"wk",null,null,null,"bk"],
      [null,null,null,null,"wp",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null]
    ],
    solution:{from:{r:1,c:4},to:{r:0,c:4}},
    hint:"The pawn is safe and the King is close — promote!",xp:35},

  {id:40,zone:"endgame",title:"Stop the Passer!",desc:"Slide your Rook to a7 to block the dangerous passed pawn!",emoji:"🛡️",
    board:[
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,"wr"],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,"wk",null,null,null],
      [null,"bk",null,null,null,null,null,null],
      ["bp",null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null]
    ],
    solution:{from:{r:1,c:7},to:{r:1,c:0}},
    hint:"The Rook on a7 stops the pawn on a2 from promoting!",xp:35},

  {id:41,zone:"endgame",title:"Snatch the Pawn!",desc:"Your Queen can swoop down and capture the passed pawn!",emoji:"🎯",
    board:[
      [null,null,null,"wq",null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,"bk",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,"bp",null,null,null,null],
      ["wk",null,null,null,null,null,null,null]
    ],
    solution:{from:{r:0,c:3},to:{r:6,c:3}},
    hint:"The Queen slides down the d-file and grabs the pawn before it promotes!",xp:30},

  {id:42,zone:"endgame",title:"Cut Off the King!",desc:"Move your Rook to d1 — it checks the King and drives it back!",emoji:"✂️",
    board:[
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,"bk",null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,"wk",null,null],
      [null,null,null,null,null,null,null,null],
      ["wr",null,null,null,null,null,null,null]
    ],
    solution:{from:{r:7,c:0},to:{r:7,c:3}},
    hint:"The Rook slides along rank 1 to d1 — the King on d5 is in check!",xp:30},

  {id:43,zone:"endgame",title:"Pawn to the 7th!",desc:"Advance your pawn to e7 — one step from queening!",emoji:"♟️",
    board:[
      [null,null,null,null,null,null,"bk",null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,"wp",null,null,null],
      [null,null,null,null,"wk",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null]
    ],
    solution:{from:{r:2,c:4},to:{r:1,c:4}},
    hint:"Push the pawn to e7 — the King is right behind it for support!",xp:25},

  {id:44,zone:"endgame",title:"King Takes!",desc:"Your King can capture the last pawn to win the endgame!",emoji:"♔",
    board:[
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,"wk","bp",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,"bk"]
    ],
    solution:{from:{r:4,c:3},to:{r:4,c:4}},
    hint:"The King captures the pawn — removing it clears the path to victory!",xp:25},

  // ── STRATEGY ──
  {id:45,zone:"strategy",title:"Knight Outpost!",desc:"Place your Knight on the powerful e5 square — it controls the whole board!",emoji:"♞",
    board:[
      [null,null,null,null,"bk",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,"wn",null,null],
      [null,null,null,null,null,null,null,null],
      ["wk",null,null,null,null,null,null,null]
    ],
    solution:{from:{r:5,c:5},to:{r:3,c:4}},
    targetSq:{r:3,c:4},
    hint:"Knights love central squares — e5 is the best outpost on the board!",xp:30},

  {id:46,zone:"strategy",title:"Rook on Open File!",desc:"Place your Rook on the open e-file where it has maximum power!",emoji:"♖",
    board:[
      [null,null,null,null,"bk",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      ["wr",null,null,null,null,null,null,"wk"]
    ],
    solution:{from:{r:7,c:0},to:{r:7,c:4}},
    targetSq:{r:7,c:4},
    hint:"Rooks are strongest on open files with no pawns blocking them!",xp:25},

  {id:47,zone:"strategy",title:"Rook Invasion!",desc:"Send your Rook to the 8th rank — it invades the enemy position!",emoji:"⚔️",
    board:[
      [null,null,null,null,"bk",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,"wr",null,null,null],
      ["wr",null,null,null,null,null,null,"wk"]
    ],
    solution:{from:{r:7,c:0},to:{r:0,c:0}},
    hint:"Two Rooks on the 7th and 8th ranks are devastating — invade!",xp:35},

  {id:48,zone:"strategy",title:"Target Weakness!",desc:"The isolated pawn on d5 is weak — capture it with your Queen!",emoji:"🎯",
    board:[
      [null,null,null,null,"bk",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,"bp",null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      ["wk",null,null,"wq",null,null,null,null]
    ],
    solution:{from:{r:7,c:3},to:{r:3,c:3}},
    hint:"Isolated pawns can't be defended by other pawns — attack them!",xp:30},

  {id:49,zone:"strategy",title:"Eliminate the Defender!",desc:"Take the Knight that defends your opponent's position!",emoji:"♗",
    board:[
      [null,null,null,null,null,null,null,"bk"],
      [null,null,null,null,null,"bn",null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,"wb",null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,"wk"]
    ],
    solution:{from:{r:4,c:2},to:{r:1,c:5}},
    hint:"The Knight on f6 defends important squares — capture it with your Bishop!",xp:30},

  {id:50,zone:"strategy",title:"King Safety First!",desc:"Move your King to f1 — away from the centre and the danger!",emoji:"🛡️",
    board:[
      [null,null,null,null,null,null,null,"bk"],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,"bq",null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,"wk",null,null,null]
    ],
    solution:{from:{r:7,c:4},to:{r:7,c:5}},
    hint:"When your King is in danger, move it to safety — f1 is much safer than e1!",xp:25},

  {id:51,zone:"strategy",title:"Minority Attack!",desc:"Advance your b-pawn to create weaknesses in Black's queenside!",emoji:"♟️",
    board:[
      [null,null,null,null,"bk",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,"bp",null,null,null,null,null],
      [null,"wp",null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      ["wk",null,null,null,null,null,null,null]
    ],
    solution:{from:{r:3,c:1},to:{r:2,c:2}},
    hint:"Capture on c6 to create an isolated or backward pawn in Black's camp!",xp:30},

  {id:52,zone:"strategy",title:"Rook Behind Passer!",desc:"Place your Rook behind the passed pawn — it supports and pushes it!",emoji:"♖",
    board:[
      [null,null,null,null,null,null,null,"bk"],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,"wp",null,null,null,null],
      [null,null,null,null,"wk",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,"wr",null,null,null,null]
    ],
    solution:{from:{r:7,c:3},to:{r:5,c:3}},
    targetSq:{r:5,c:3},
    hint:"Rooks belong BEHIND passed pawns — they push them from behind!",xp:30},

  {id:53,zone:"strategy",title:"Win Material!",desc:"Your Queen can capture the undefended Rook — take it!",emoji:"💎",
    board:[
      [null,null,null,null,"bk",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,"br",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      ["wk",null,null,null,"wq",null,null,null]
    ],
    solution:{from:{r:7,c:4},to:{r:3,c:4}},
    hint:"The Rook on e5 is hanging — grab it with your Queen!",xp:30},

  {id:54,zone:"strategy",title:"Centralise the King!",desc:"In the endgame the King is powerful — march it toward the centre!",emoji:"♔",
    board:[
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      ["wk",null,null,null,null,null,null,"bk"]
    ],
    solution:{from:{r:7,c:0},to:{r:6,c:1}},
    hint:"Move the King toward the centre — it will be much more active on b2!",xp:25},

  // ── PUZZLE RUSH (additional) ──
  {id:55,zone:"rush",title:"Arabian Mate!",desc:"Jump your Rook to h7 — the Knight covers all the escape squares!",emoji:"⚡",
    board:[
      [null,null,null,null,null,null,null,"bk"],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,"wn",null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,"wr"],
      ["wk",null,null,null,null,null,null,null]
    ],
    solution:{from:{r:6,c:7},to:{r:1,c:7}},
    hint:"The Rook to h7 gives check — the Knight on f6 covers g8 and the pawns block the rest!",xp:50},

  {id:56,zone:"rush",title:"Queen Sacrifice Mate!",desc:"Slide your Queen to h7 — the Rook on h1 makes it unstoppable!",emoji:"⚡",
    board:[
      [null,null,null,null,null,null,null,"bk"],
      [null,null,null,null,null,null,"bp",null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,"wk",null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,"wq",null,null,null,null,null,"wr"]
    ],
    solution:{from:{r:7,c:1},to:{r:1,c:7}},
    hint:"The Queen on h7 is check and the Rook on h1 protects it — checkmate!",xp:50},

  {id:57,zone:"rush",title:"Speed Grab!",desc:"Spot the hanging piece and capture it instantly!",emoji:"⚡",
    board:[
      [null,null,null,null,"bk",null,"br",null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      ["wk",null,null,null,null,null,null,"wq"]
    ],
    solution:{from:{r:7,c:7},to:{r:3,c:7}},
    hint:"The Rook on h5 is undefended — slide your Queen straight up and grab it!",xp:40},

  {id:58,zone:"rush",title:"Rook and Knight Mate!",desc:"Slide your Rook to h7 — the Knight and Rook deliver checkmate!",emoji:"⚡",
    board:[
      [null,null,null,null,null,null,null,"bk"],
      [null,null,null,null,null,null,"bp","bp"],
      [null,null,null,null,null,"wn",null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      ["wk",null,null,null,null,null,null,"wr"]
    ],
    solution:{from:{r:7,c:7},to:{r:1,c:7}},
    hint:"The Rook to h7 captures the pawn and gives checkmate — the Knight covers g8!",xp:50},

  {id:59,zone:"rush",title:"Queen with Check!",desc:"Capture the Bishop AND give check in the same move!",emoji:"⚡",
    board:[
      [null,null,null,null,null,null,null,"bk"],
      [null,null,null,null,null,null,null,"bb"],
      [null,null,null,null,null,null,"wq",null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      ["wk",null,null,null,null,null,null,null]
    ],
    solution:{from:{r:2,c:6},to:{r:1,c:7}},
    hint:"Your Queen on g6 can take the Bishop on h7 AND check the King in one move!",xp:45},

  {id:60,zone:"rush",title:"Back Rank Blitz!",desc:"Slide your Queen along the back rank for instant checkmate!",emoji:"⚡",
    board:[
      ["bk",null,null,null,null,null,null,"wq"],
      ["bp","bb","wk",null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null]
    ],
    solution:{from:{r:0,c:7},to:{r:0,c:1}},
    hint:"The Queen sweeps the back rank to b8 — the King is trapped in the corner!",xp:50},
];


// ═══════════════════════════════════════════════════════════
// MASCOT — Knight character SVG, reacts to game state
// ═══════════════════════════════════════════════════════════
function KnightMascot({mood="happy", size=80, animate=false}){
  const expressions = {
    happy:      {eyes:"😊", bg:"#4a90e2", extra:""},
    excited:    {eyes:"🤩", bg:"#e74c3c", extra:""},
    thinking:   {eyes:"🤔", bg:"#8e44ad", extra:""},
    celebrating:{eyes:"🎉", bg:"#f39c12", extra:""},
    sad:        {eyes:"😢", bg:"#636e72", extra:""},
    encouraging:{eyes:"💪", bg:"#27ae60", extra:""},
  };
  const e = expressions[mood] || expressions.happy;
  return (
    <div style={{
      width:size, height:size, position:"relative", flexShrink:0,
      animation: animate ? "mascotBounce 0.6s cubic-bezier(.34,1.56,.64,1)" : "mascotFloat 3s ease-in-out infinite",
    }}>
      {/* Knight helmet body */}
      <svg viewBox="0 0 80 80" width={size} height={size}>
        <defs>
          <radialGradient id="helmetG" cx="40%" cy="30%">
            <stop offset="0%" stopColor="#74b9ff"/>
            <stop offset="100%" stopColor="#2980b9"/>
          </radialGradient>
          <radialGradient id="faceG" cx="40%" cy="35%">
            <stop offset="0%" stopColor="#ffeaa7"/>
            <stop offset="100%" stopColor="#fdcb6e"/>
          </radialGradient>
        </defs>
        {/* Body/armour */}
        <ellipse cx="40" cy="68" rx="22" ry="14" fill="#1a5276" opacity=".5"/>
        <rect x="22" y="52" width="36" height="22" rx="8" fill="#2980b9"/>
        <rect x="26" y="52" width="28" height="8" fill="#3498db"/>
        {/* Armour details */}
        <rect x="36" y="54" width="8" height="18" fill="#1a5276" opacity=".4" rx="2"/>
        <rect x="22" y="58" width="36" height="2" fill="#1a5276" opacity=".3"/>
        {/* Helmet */}
        <ellipse cx="40" cy="36" rx="22" ry="24" fill="url(#helmetG)"/>
        <rect x="18" y="28" width="44" height="20" rx="4" fill="url(#helmetG)"/>
        {/* Visor opening - face */}
        <rect x="24" y="30" width="32" height="22" rx="10" fill="url(#faceG)"/>
        {/* Eyes */}
        <circle cx="32" cy="38" r="5" fill="#fff"/>
        <circle cx="48" cy="38" r="5" fill="#fff"/>
        <circle cx="33" cy="39" r="3" fill="#2d3436"/>
        <circle cx="49" cy="39" r="3" fill="#2d3436"/>
        <circle cx="34" cy="38" r="1" fill="#fff"/>
        <circle cx="50" cy="38" r="1" fill="#fff"/>
        {/* Smile */}
        <path d={mood==="sad"?"M32 46 Q40 42 48 46":"M32 44 Q40 50 48 44"} fill="none" stroke="#e17055" strokeWidth="2.5" strokeLinecap="round"/>
        {/* Helmet plume */}
        <ellipse cx="40" cy="14" rx="6" ry="14" fill="#e74c3c"/>
        <ellipse cx="40" cy="14" rx="4" ry="12" fill="#ff6b6b"/>
        {/* Helmet top ridge */}
        <rect x="34" y="12" width="12" height="8" rx="3" fill="#1a5276"/>
        {/* Stars for excited */}
        {mood==="celebrating"&&<>
          <text x="8" y="20" fontSize="12" style={{animation:"spin 1s linear infinite"}}>⭐</text>
          <text x="56" y="18" fontSize="10" style={{animation:"spin 1.5s linear infinite reverse"}}>✨</text>
        </>}
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SPEECH BUBBLE
// ═══════════════════════════════════════════════════════════
function speak(text){
  if(!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.85;   // slightly slower for kids
  u.pitch = 1.1;   // slightly higher, friendlier
  u.volume = 1;
  // Prefer a friendly voice if available
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v=>v.name.includes("Samantha")||v.name.includes("Karen")||v.name.includes("Daniel")||v.lang==="en-GB"||v.lang==="en-US");
  if(preferred) u.voice = preferred;
  window.speechSynthesis.speak(u);
}

function SpeechBubble({msg, mood="happy", showSpeaker=false}){
  const [speaking, setSpeaking] = useState(false);
  const bubbleColors = {
    happy:"#fff", excited:"#fff9e6", thinking:"#f0f0ff",
    celebrating:"#fff9e6", sad:"#fff0f0", encouraging:"#f0fff4"
  };
  const borderColors = {
    happy:"#74b9ff", excited:"#f1c40f", thinking:"#a29bfe",
    celebrating:"#f1c40f", sad:"#ff7675", encouraging:"#00b894"
  };

  const handleSpeak = () => {
    SFX.tap();
    setSpeaking(true);
    speak(msg);
    // Reset icon after estimated speech duration
    const ms = Math.max(1500, msg.length * 60);
    setTimeout(() => setSpeaking(false), ms);
  };

  return (
    <div style={{display:"flex", alignItems:"flex-start", gap:10}}>
      <KnightMascot mood={mood} size={64}/>
      <div style={{flex:1, position:"relative"}}>
        {/* Tail of bubble */}
        <div style={{
          position:"absolute", left:-10, top:16,
          width:0, height:0,
          borderTop:"8px solid transparent",
          borderBottom:"8px solid transparent",
          borderRight:`10px solid ${borderColors[mood]||"#74b9ff"}`,
        }}/>
        <div style={{
          background: bubbleColors[mood]||"#fff",
          border:`3px solid ${borderColors[mood]||"#74b9ff"}`,
          borderRadius:"18px 18px 18px 4px",
          padding:"10px 14px 10px 12px",
          boxShadow:"0 4px 0 rgba(0,0,0,.08)",
          fontSize:14, lineHeight:1.5, color:"#2d3436", fontWeight:600,
          display:"flex", alignItems:"flex-start", gap:8,
        }}>
          <span style={{flex:1}}>{msg}</span>
          {/* Speaker button */}
          <button
            onClick={handleSpeak}
            title="Tap to hear instructions"
            style={{
              flexShrink:0,
              width:34, height:34, borderRadius:"50%",
              background: speaking
                ? "linear-gradient(145deg,#6c5ce7,#a29bfe)"
                : "linear-gradient(145deg,#74b9ff,#0984e3)",
              border:"2px solid rgba(255,255,255,.6)",
              boxShadow: speaking ? "0 0 0 3px rgba(108,92,231,.35)" : "0 3px 0 rgba(0,0,0,.15)",
              cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:16,
              animation: speaking ? "pulse .6s ease-in-out infinite" : "none",
              transition:"all .2s ease",
              marginTop:2,
            }}>
            {speaking ? "🔊" : "🔈"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MINI BOARD
// ═══════════════════════════════════════════════════════════
function MiniBoard({board,onTap,selected,targets,lastMove,highlightSq}){
  const cells=[];for(let r=0;r<8;r++)for(let c=0;c<8;c++)cells.push({r,c});
  const files=["a","b","c","d","e","f","g","h"];
  const coordStyle={fontSize:10,fontWeight:900,lineHeight:1,userSelect:"none",pointerEvents:"none",color:"#555"};
  const boardRef=useRef(null);
  const [dragging,setDragging]=useState(null);   // {r,c,piece,startX,startY}
  const [dragPos,setDragPos]=useState({x:0,y:0});// current pointer position
  const [dragOver,setDragOver]=useState(null);   // {r,c} square pointer is over

  // Convert page coords → board row/col
  const getCellFromPoint=(px,py)=>{
    if(!boardRef.current)return null;
    const rect=boardRef.current.getBoundingClientRect();
    const x=px-rect.left, y=py-rect.top;
    if(x<0||y<0||x>rect.width||y>rect.height)return null;
    const c2=Math.floor((x/rect.width)*8);
    const r2=Math.floor((y/rect.height)*8);
    if(r2<0||r2>7||c2<0||c2>7)return null;
    return {r:r2,c:c2};
  };

  // ── Pointer down on a piece → start drag AND tell parent to select ──
  const onPiecePointerDown=(e,r,c)=>{
    if(!onTap)return;
    e.preventDefault();e.stopPropagation();
    SFX.pickup();
    onTap(r,c); // select the piece (shows dots)
    setDragging({r,c,piece:board[r][c]});
    setDragPos({x:e.clientX,y:e.clientY});
    setDragOver({r,c});
  };

  // ── Pointer move → update ghost position and highlight hovered square ──
  const onPointerMove=useCallback((e)=>{
    if(!dragging)return;
    e.preventDefault();
    const px=e.clientX??e.touches?.[0]?.clientX;
    const py=e.clientY??e.touches?.[0]?.clientY;
    setDragPos({x:px,y:py});
    const cell=getCellFromPoint(px,py);
    setDragOver(cell);
  },[dragging]);

  // ── Pointer up → drop on square ──
  const onPointerUp=useCallback((e)=>{
    if(!dragging)return;
    e.preventDefault();
    const px=e.clientX??e.changedTouches?.[0]?.clientX;
    const py=e.clientY??e.changedTouches?.[0]?.clientY;
    const cell=getCellFromPoint(px,py);
    if(cell&&!(cell.r===dragging.r&&cell.c===dragging.c)){
      SFX.drop();
      onTap&&onTap(cell.r,cell.c); // try to move to drop square
    }
    setDragging(null);setDragOver(null);
  },[dragging,onTap]);

  // Attach move/up listeners to window so drag works outside board
  useEffect(()=>{
    if(!dragging)return;
    window.addEventListener("pointermove",onPointerMove,{passive:false});
    window.addEventListener("pointerup",onPointerUp,{passive:false});
    return()=>{
      window.removeEventListener("pointermove",onPointerMove);
      window.removeEventListener("pointerup",onPointerUp);
    };
  },[dragging,onPointerMove,onPointerUp]);

  const squareSize=boardRef.current
    ? boardRef.current.getBoundingClientRect().width/8 : 44;



  const SZ = 16; // coord strip width in px

  return(
    <div style={{display:"flex",flexDirection:"column",width:"100%",userSelect:"none",gap:2}}>
      {/* Top file labels */}
      <div style={{display:"grid",gridTemplateColumns:`${SZ}px repeat(8,1fr) ${SZ}px`,paddingLeft:0}}>
        <div/>
        {files.map(f=><div key={f} style={{...coordStyle,textAlign:"center"}}>{f.toUpperCase()}</div>)}
        <div/>
      </div>
      <div style={{display:"flex",gap:2}}>
        {/* Left rank labels */}
        <div style={{display:"grid",gridTemplateRows:"repeat(8,1fr)",width:SZ,flexShrink:0}}>
          {[8,7,6,5,4,3,2,1].map(n=><div key={n} style={{...coordStyle,display:"flex",alignItems:"center",justifyContent:"center"}}>{n}</div>)}
        </div>
        {/* Board */}
        <div ref={boardRef} style={{flex:1,aspectRatio:"1/1",borderRadius:10,overflow:"hidden",border:"4px solid #2d3436",boxShadow:"0 6px 0 #1a1a2e,0 10px 20px rgba(0,0,0,.35)",position:"relative",touchAction:"none"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gridTemplateRows:"repeat(8,1fr)",width:"100%",height:"100%"}}>
            {cells.map(({r,c})=>{
              const p=board[r][c];
              const light=(r+c)%2===0;
              const sel=selected&&selected.r===r&&selected.c===c;
              const tgt=targets&&targets.some(m=>m.to.r===r&&m.to.c===c);
              const cap=tgt&&!!p;
              const isLast=lastMove&&((lastMove.from.r===r&&lastMove.from.c===c)||(lastMove.to.r===r&&lastMove.to.c===c));
              const isStar=highlightSq&&highlightSq.r===r&&highlightSq.c===c;
              const isDragSrc=dragging&&dragging.r===r&&dragging.c===c;
              const isDragOver=dragOver&&dragOver.r===r&&dragOver.c===c&&dragging&&!(dragging.r===r&&dragging.c===c);
              const isValidDrop=isDragOver&&tgt;

              let bg=light?"#f0d9b5":"#b58863";
              if(isLast)bg=light?"#f6f669":"#baca2b";
              if(sel)bg=light?"#f6f669":"#baca2b";
              if(isValidDrop)bg=light?"#a8e6a3":"#5ab856";
              if(isDragOver&&!isValidDrop&&dragging)bg=light?"#f8b4a0":"#d4755a";

              return(
                <div
                  key={`${r}-${c}`}
                  onClick={()=>!dragging&&onTap&&onTap(r,c)}
                  style={{position:"relative",background:bg,display:"flex",alignItems:"center",justifyContent:"center",cursor:onTap?(tgt?"crosshair":"grab"):"default",overflow:"hidden",transition:"background .1s"}}
                >
                  {isStar&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"min(5vw,22px)",zIndex:1}}>⭐</div>}
                  {tgt&&!cap&&<div style={{position:"absolute",width:"34%",height:"34%",borderRadius:"50%",background:"rgba(0,0,0,.25)",zIndex:2,pointerEvents:"none"}}/>}
                  {cap&&<div style={{position:"absolute",inset:"6%",borderRadius:"50%",border:"4px solid rgba(0,0,0,.3)",zIndex:2,pointerEvents:"none"}}/>}

                  {p&&!isDragSrc&&(
                    <div
                      onPointerDown={e=>onPiecePointerDown(e,r,c)}
                      style={{zIndex:3,width:"82%",height:"82%",display:"flex",alignItems:"center",justifyContent:"center",cursor:"grab",touchAction:"none",transform:sel?"scale(1.15)":"scale(1)",transition:"transform .1s"}}
                    >
                      <PieceSVG code={p}/>
                    </div>
                  )}
                  {isDragSrc&&p&&(
                    <div style={{zIndex:3,width:"82%",height:"82%",display:"flex",alignItems:"center",justifyContent:"center",opacity:.3}}>
                      <PieceSVG code={p}/>
                    </div>
                  )}
                </div>
              );
            })}
          </div>


        </div>
        {/* Right rank labels */}
        <div style={{display:"grid",gridTemplateRows:"repeat(8,1fr)",width:SZ,flexShrink:0}}>
          {[8,7,6,5,4,3,2,1].map(n=><div key={n} style={{...coordStyle,display:"flex",alignItems:"center",justifyContent:"center"}}>{n}</div>)}
        </div>
      </div>
      {/* Bottom file labels */}
      <div style={{display:"grid",gridTemplateColumns:`${SZ}px repeat(8,1fr) ${SZ}px`}}>
        <div/>
        {files.map(f=><div key={f} style={{...coordStyle,textAlign:"center"}}>{f.toUpperCase()}</div>)}
        <div/>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ZONE ILLUSTRATED ICON
// ═══════════════════════════════════════════════════════════
function ZoneIcon({zone, size=70}){
  const icons = {
    pieces:   {bg:"#e74c3c", light:"#ff6b6b", symbol:"♞", label:"⚔"},
    tactics:  {bg:"#e67e22", light:"#ffd93d", symbol:"⚔️", label:"🗡"},
    openings: {bg:"#27ae60", light:"#55efc4", symbol:"🏰", label:"🏯"},
    endgame:  {bg:"#8e44ad", light:"#a29bfe", symbol:"👑", label:"♔"},
    strategy: {bg:"#2980b9", light:"#74b9ff", symbol:"🧠", label:"🔮"},
  };
  const ic = icons[zone.id] || icons.pieces;
  return (
    <div style={{
      width:size, height:size, borderRadius:size*0.28,
      background:`linear-gradient(145deg,${ic.light},${ic.bg})`,
      display:"flex", alignItems:"center", justifyContent:"center",
      fontSize:size*0.45,
      border:`3px solid rgba(255,255,255,.4)`,
      boxShadow:`0 ${size*0.08}px 0 ${ic.bg}, 0 ${size*0.14}px ${size*0.2}px rgba(0,0,0,.25)`,
      position:"relative", overflow:"hidden",
      animation:"iconFloat 3s ease-in-out infinite",
    }}>
      {/* Shine */}
      <div style={{position:"absolute",top:"8%",left:"12%",width:"30%",height:"30%",borderRadius:"50%",background:"rgba(255,255,255,.35)"}}/>
      <span style={{
        filter:"drop-shadow(0 2px 6px rgba(0,0,0,.3))",
        zIndex:1, display:"inline-block",
        animation:({
          pieces:"shieldWiggle 2.5s ease-in-out infinite",
          openings:"castleShake 3s ease-in-out infinite",
          tactics:"swordSlash 1.5s ease-in-out infinite",
          strategy:"brainPulse 2s ease-in-out infinite",
          endgame:"crownFloat 2.5s ease-in-out infinite",
          rush:"lightningZap 0.8s ease-in-out infinite",
        })[zone.id]||"iconBob 2s ease-in-out infinite",
      }}>{zone.emoji}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// HOME SCREEN — Reading Eggs style
// ═══════════════════════════════════════════════════════════
function HomeScreen({xp, streak, completedPuzzles, onNav, gems, playerName, playerAvatar, playerColor}){
  const rank = getRank(xp);
  const next = getNextRank(xp);
  const xpPct = next ? ((xp-rank.min)/(next.min-rank.min))*100 : 100;

  return (
    <div style={{height:"100%", background:"#5dade2", position:"relative", display:"flex", flexDirection:"column", overflow:"hidden"}}>

      {/* Sky background */}
      <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,#85c1e9 0%,#5dade2 50%,#27ae60 50%,#1e8449 100%)"}}/>

      {/* Clouds */}
      {[[8,8,0.9],[55,5,0.7],[72,12,0.8]].map(([x,y,o],i)=>(
        <div key={i} style={{position:"absolute",left:`${x}%`,top:`${y}%`,opacity:o,animation:`cloudDrift ${6+i*2}s ease-in-out infinite alternate`}}>
          <div style={{position:"relative",width:70+i*20,height:30+i*5}}>
            <div style={{position:"absolute",bottom:0,left:0,right:0,height:"60%",background:"#fff",borderRadius:999}}/>
            <div style={{position:"absolute",bottom:"30%",left:"20%",width:"40%",height:"80%",background:"#fff",borderRadius:"50%"}}/>
            <div style={{position:"absolute",bottom:"30%",right:"20%",width:"35%",height:"70%",background:"#fff",borderRadius:"50%"}}/>
          </div>
        </div>
      ))}

      {/* Curved divider — sky meets grass */}
      <div style={{position:"absolute",top:"38%",left:0,right:0,height:60,overflow:"hidden"}}>
        <svg viewBox="0 0 400 60" preserveAspectRatio="none" style={{width:"100%",height:"100%"}}>
          <path d="M0,30 Q100,0 200,30 Q300,60 400,30 L400,60 L0,60 Z" fill="#27ae60"/>
        </svg>
      </div>

      <div style={{position:"relative",zIndex:1,flex:1,overflowY:"auto",padding:"12px 16px 20px",WebkitOverflowScrolling:"touch"}}>

        {/* Header row */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
          {/* Player avatar bubble */}
          <div style={{
            width:68,height:68,borderRadius:"50%",flexShrink:0,
            background:`linear-gradient(145deg,${playerColor||"#3498db"},${playerColor||"#3498db"}88)`,
            border:"3px solid rgba(255,255,255,.5)",boxShadow:"0 4px 0 rgba(0,0,0,.2)",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:36,
            animation:"mascotFloat 3s ease-in-out infinite",
          }}>{playerAvatar||"♟️"}</div>

          {/* Welcome text */}
          <div style={{flex:1}}>
            <div style={{fontSize:13,color:"rgba(255,255,255,.8)",fontWeight:700}}>Welcome back,</div>
            <div style={{fontSize:26,fontWeight:900,color:"#fff",letterSpacing:"-1px",lineHeight:1.1,textShadow:"0 2px 6px rgba(0,0,0,.25)"}}>{playerName}! 🎉</div>
            <div style={{display:"flex",alignItems:"center",gap:6,marginTop:5,flexWrap:"wrap"}}>
              <div style={{background:"rgba(255,255,255,.25)",backdropFilter:"blur(4px)",borderRadius:20,padding:"4px 12px",border:"2px solid rgba(255,255,255,.4)",fontSize:12,fontWeight:800,color:"#fff"}}>{rank.icon} {rank.name}</div>
              {streak>0&&<div style={{background:"rgba(231,76,60,.8)",borderRadius:20,padding:"4px 12px",border:"2px solid rgba(255,255,255,.3)",fontSize:12,fontWeight:800,color:"#fff"}}><span style={{display:"inline-block",animation:"flameDance 0.8s ease-in-out infinite"}}>🔥</span> {streak} day streak!</div>}
            </div>
          </div>
        </div>

        {/* XP progress */}
        <div style={{background:"rgba(255,255,255,.2)",backdropFilter:"blur(8px)",borderRadius:16,padding:"10px 14px",marginBottom:14,border:"2px solid rgba(255,255,255,.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{fontSize:12,fontWeight:800,color:"#fff"}}>{rank.icon} {rank.name}</span>
            {next&&<span style={{fontSize:12,fontWeight:800,color:"rgba(255,255,255,.8)"}}>→ {next.icon} {next.name} ({next.min-xp} XP)</span>}
          </div>
          <div style={{height:14,background:"rgba(0,0,0,.2)",borderRadius:999,overflow:"hidden",border:"2px solid rgba(255,255,255,.2)"}}>
            <div style={{height:"100%",width:`${xpPct}%`,background:"linear-gradient(90deg,#f1c40f,#fff)",borderRadius:999,transition:"width .8s ease",boxShadow:"0 0 8px rgba(255,255,255,.6)"}}/>
          </div>
        </div>

        {/* Daily Challenge */}
        <div onClick={()=>onNav("zones")} className="tap-target" style={{background:"linear-gradient(135deg,#e74c3c,#c0392b)",borderRadius:20,padding:"14px",marginBottom:14,border:"3px solid rgba(255,255,255,.3)",boxShadow:"0 6px 0 #922b21",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
          <div style={{fontSize:40,filter:"drop-shadow(0 3px 6px rgba(0,0,0,.3))",display:"inline-block",animation:"dailyPulse 1.5s ease-in-out infinite"}}>🎯</div>
          <div style={{flex:1}}>
            <div style={{fontSize:11,color:"rgba(255,255,255,.8)",fontWeight:800,letterSpacing:1}}>⚡ DAILY CHALLENGE</div>
            <div style={{fontSize:15,fontWeight:900,color:"#fff",marginBottom:6}}>Complete 3 puzzles! +50 💎</div>
            <div style={{height:10,background:"rgba(0,0,0,.25)",borderRadius:999,overflow:"hidden",border:"2px solid rgba(255,255,255,.2)"}}>
              <div style={{height:"100%",width:`${(Math.min(completedPuzzles,3)/3)*100}%`,background:"linear-gradient(90deg,#f1c40f,#f39c12)",borderRadius:999}}/>
            </div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.8)",marginTop:3,fontWeight:700}}>{Math.min(completedPuzzles,3)}/3 done</div>
          </div>
          <div style={{fontSize:28,animation:"dailyPulse 0.8s ease-in-out infinite",fontWeight:900}}>→</div>
        </div>

        {/* Stats bubbles */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
          {[
            {v:completedPuzzles,l:"Puzzles",i:"🧩",c:"#8e44ad",s:"#6c3483",anim:"puzzleWiggle 2s ease-in-out infinite"},
            {v:xp,l:"XP",i:"⭐",c:"#e67e22",s:"#ba6b09",anim:"starSpin 3s linear infinite"},
            {v:streak,l:"Streak",i:"🔥",c:"#27ae60",s:"#1e8449",anim:"flameDance 0.8s ease-in-out infinite"},
          ].map(s=>(
            <div key={s.l} className="tap-target" style={{background:`linear-gradient(145deg,${s.c},${s.s})`,borderRadius:20,padding:"14px 8px",textAlign:"center",border:"3px solid rgba(255,255,255,.3)",boxShadow:`0 5px 0 ${s.s}`}}>
              <div style={{fontSize:26,marginBottom:2,filter:"drop-shadow(0 2px 4px rgba(0,0,0,.2))",display:"inline-block",animation:s.anim}}>{s.i}</div>
              <div style={{fontSize:22,fontWeight:900,color:"#fff",textShadow:"0 2px 4px rgba(0,0,0,.2)"}}>{s.v}</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,.8)",fontWeight:800,letterSpacing:.5}}>{s.l.toUpperCase()}</div>
            </div>
          ))}
        </div>

        {/* Zone icons — all 5 zones, locked ones greyed */}
        <div style={{background:"rgba(255,255,255,.15)",backdropFilter:"blur(8px)",borderRadius:24,padding:"16px 12px",border:"2px solid rgba(255,255,255,.3)",marginBottom:8}}>
          <div style={{fontSize:12,fontWeight:900,color:"rgba(255,255,255,.95)",letterSpacing:2,marginBottom:12,textAlign:"center",textShadow:"0 1px 3px rgba(0,0,0,.3)"}}>
            <span style={{display:"inline-block",animation:"swordSlash 1.5s ease-in-out infinite"}}>⚔️</span>
            {" CHESS REALMS "}
            <span style={{display:"inline-block",animation:"swordSlash 1.5s ease-in-out infinite reverse"}}>⚔️</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,justifyItems:"center"}}>
            {ZONES.map(z=>(
              <button key={z.id}
                onClick={()=>!z.locked&&onNav("zone:"+z.id)}
                style={{background:"none",border:"none",cursor:z.locked?"default":"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:0,opacity:z.locked?.4:1,width:"100%"}}>
                <div style={{position:"relative",width:56,height:56}}>
                  <ZoneIcon zone={z} size={56}/>
                  {z.locked&&(
                    <div style={{position:"absolute",inset:0,borderRadius:56*.28,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🔒</div>
                  )}
                </div>
                <div style={{fontSize:10,fontWeight:900,color:z.locked?"rgba(255,255,255,.45)":"#fff",textAlign:"center",textShadow:"0 1px 3px rgba(0,0,0,.4)",lineHeight:1.2,maxWidth:70}}>{z.label}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAP SCREEN — Reading Eggs adventure map style
// ═══════════════════════════════════════════════════════════
function MapScreen({xp, completedPuzzles, onStartPuzzle, playerAvatar, playerColor}){

  const youAreHere = (() => {
    for(let i=0; i<ZONES.length; i++){
      if(ZONES[i].locked) return Math.max(0,i-1);
      const zonePuzzles = PUZZLES.filter(p=>p.zone===ZONES[i].id);
      const done = zonePuzzles.filter(p=>completedPuzzles>=p.id).length;
      if(done < zonePuzzles.length) return i;
    }
    return ZONES.filter(z=>!z.locked).length-1;
  })();

  // 6 zone positions in a winding S-curve within 320x520 canvas
  const nodes=[
    {x:220,y:530},  // 1 Piece Power   — bottom right
    {x: 90,y:450},  // 2 Openings      — mid-low left
    {x:220,y:365},  // 3 Tactics       — mid right
    {x: 90,y:278},  // 4 Strategy      — mid-high left
    {x:220,y:192},  // 5 Endgame       — upper right
    {x: 90,y:115},  // 6 Puzzle Rush   — upper left, well below castle
  ];

  // Smooth bezier S-curve through all 6 nodes
  const pathD = `M220,530 C165,505 130,475 90,450 C55,425 155,390 220,365 C275,340 110,305 90,278 C65,252 160,218 220,192 C275,168 130,138 90,115`;

  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{background:"linear-gradient(135deg,#6c5ce7,#a29bfe)",padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 0 #4a3ab5",flexShrink:0}}>
        <div style={{fontSize:15,fontWeight:900,color:"#fff"}}>🗺️ CHESS REALMS</div>
      </div>
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>

        {/* Coach bubble */}
        <div style={{padding:"10px 14px 8px"}}>
          <SpeechBubble msg="Tap a zone to train! Complete all puzzles to unlock the next world! 🏆" mood="excited"/>
        </div>

        {/* The Map */}
        <div style={{margin:"0 12px 12px",borderRadius:24,overflow:"hidden",border:"4px solid #1a6b32",boxShadow:"0 8px 0 #0f4020, 0 12px 32px rgba(0,0,0,.4)"}}>
          <svg viewBox="0 0 320 600" width="100%" style={{display:"block"}}>
            <defs>
              <linearGradient id="bgTop" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#1a1a3e"/>
                <stop offset="45%"  stopColor="#2d1b69"/>
                <stop offset="100%" stopColor="#1a6b32"/>
              </linearGradient>
              <linearGradient id="groundGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#27ae60"/>
                <stop offset="100%" stopColor="#1a6b32"/>
              </linearGradient>
              <linearGradient id="goldPath" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffe566"/>
                <stop offset="100%" stopColor="#f39c12"/>
              </linearGradient>
              <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fffde7" stopOpacity=".9"/>
                <stop offset="100%" stopColor="#fffde7" stopOpacity="0"/>
              </radialGradient>
              <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#f1c40f" stopOpacity=".6"/>
                <stop offset="100%" stopColor="#f1c40f" stopOpacity="0"/>
              </radialGradient>
              <filter id="softGlow">
                <feGaussianBlur stdDeviation="3" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="shadow">
                <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000" floodOpacity=".4"/>
              </filter>
            </defs>

            {/* ── BACKGROUND ── */}
            <rect width="320" height="500" fill="url(#bgTop)"/>

            {/* Stars in night sky */}
            {[[20,20],[60,12],[110,8],[160,18],[220,6],[270,15],[300,25],[40,45],[140,35],[240,40],[295,50],[80,55]].map(([x,y],i)=>(
              <circle key={i} cx={x} cy={y} r={i%3===0?1.5:1} fill="#fff" opacity={0.5+Math.sin(i)*0.4}/>
            ))}

            {/* Moon */}
            <circle cx="268" cy="38" r="28" fill="url(#moonGlow)"/>
            <circle cx="268" cy="38" r="22" fill="#fffde7" opacity=".95"/>
            <circle cx="278" cy="30" r="16" fill="#2d1b69"/>

            {/* Purple/blue hills in background */}
            <ellipse cx="60"  cy="200" rx="110" ry="70" fill="#1e1060" opacity=".7"/>
            <ellipse cx="270" cy="220" rx="100" ry="65" fill="#1e1060" opacity=".6"/>
            <ellipse cx="160" cy="190" rx="80"  ry="55" fill="#2a1575" opacity=".5"/>

            {/* Distant castle silhouette */}
            <g opacity=".35" transform="translate(110,55)">
              <rect x="0"  y="30" width="80" height="55" fill="#0d0930"/>
              <rect x="-8" y="18" width="20" height="42" fill="#0d0930"/>
              <rect x="68" y="18" width="20" height="42" fill="#0d0930"/>
              <rect x="20" y="8"  width="40" height="50" fill="#120c3a"/>
              {[0,6,12].map(x=><rect key={x} x={x-8}  y={13} width="5" height="8" fill="#0d0930"/>)}
              {[20,27,34,41].map(x=><rect key={x} x={x} y={3}  width="5" height="8" fill="#120c3a"/>)}
              {[68,74,80].map(x=><rect key={x} x={x}   y={13} width="5" height="8" fill="#0d0930"/>)}
            </g>

            {/* Rolling green ground */}
            <ellipse cx="160" cy="600" rx="240" ry="90" fill="url(#groundGrad)"/>
            <rect y="560" width="320" height="40" fill="#1a6b32"/>

            {/* Ground hills */}
            <ellipse cx="40"  cy="575" rx="120" ry="50" fill="#27ae60" opacity=".8"/>
            <ellipse cx="280" cy="570" rx="110" ry="45" fill="#27ae60" opacity=".7"/>

            {/* Trees - left side */}
            {[[18,480],[22,400],[15,325],[20,245],[18,165],[15,90]].map(([x,y],i)=>(
              <g key={`tl${i}`}>
                <rect x={x-3} y={y+18} width="6" height="18" fill="#5d4037" rx="1"/>
                <polygon points={`${x},${y-5} ${x-16},${y+24} ${x+16},${y+24}`} fill={["#1e8449","#27ae60","#145a32","#1a7a40"][i]}/>
                <polygon points={`${x},${y-18} ${x-11},${y+5} ${x+11},${y+5}`}  fill={["#27ae60","#2ecc71","#1e8449","#27ae60"][i]}/>
              </g>
            ))}

            {/* Trees - right side */}
            {[[300,470],[295,390],[302,310],[298,230],[300,155],[296,85]].map(([x,y],i)=>(
              <g key={`tr${i}`}>
                <rect x={x-3} y={y+18} width="6" height="18" fill="#5d4037" rx="1"/>
                <polygon points={`${x},${y-5} ${x-15},${y+22} ${x+15},${y+22}`} fill={["#145a32","#1e8449","#27ae60","#145a32"][i]}/>
                <polygon points={`${x},${y-17} ${x-10},${y+4} ${x+10},${y+4}`}  fill={["#1e8449","#27ae60","#2ecc71","#1e8449"][i]}/>
              </g>
            ))}

            {/* Glowing winding path - shadow */}
            <path d={pathD} fill="none" stroke="rgba(0,0,0,.5)" strokeWidth="22" strokeLinecap="round"/>
            {/* Path base */}
            <path d={pathD} fill="none" stroke="#b8860b" strokeWidth="20" strokeLinecap="round"/>
            {/* Gold fill */}
            <path d={pathD} fill="none" stroke="url(#goldPath)" strokeWidth="16" strokeLinecap="round" filter="url(#softGlow)"/>
            {/* Centre highlight */}
            <path d={pathD} fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeDasharray="8,14" opacity=".5"/>

            {/* ── CASTLE (destination) at top ── */}
            <g transform="translate(120,4)" filter="url(#shadow)">
              {/* Base */}
              <rect x="14" y="38" width="56" height="48" fill="#4a4a8a" rx="2"/>
              {/* Side towers */}
              <rect x="4"  y="24" width="16" height="44" fill="#3a3a7a" rx="2"/>
              <rect x="64" y="24" width="16" height="44" fill="#3a3a7a" rx="2"/>
              {/* Centre tower */}
              <rect x="26" y="12" width="32" height="54" fill="#5a5aaa" rx="2"/>
              {/* Battlements - side left */}
              {[4,10,16].map(x=><rect key={x} x={x}  y={18} width="5" height="8" fill="#3a3a7a" rx="1"/>)}
              {/* Battlements - centre */}
              {[26,32,38,44,50].map(x=><rect key={x} x={x} y={6}  width="5" height="8" fill="#5a5aaa" rx="1"/>)}
              {/* Battlements - side right */}
              {[64,70,75].map(x=><rect key={x} x={x} y={18} width="5" height="8" fill="#3a3a7a" rx="1"/>)}
              {/* Glowing windows */}
              <rect x="30" y="22" width="24" height="16" rx="8" fill="#f1c40f" opacity=".9"/>
              <rect x="6"  y="32" width="12" height="10" rx="3" fill="#ffd700" opacity=".7"/>
              <rect x="66" y="32" width="12" height="10" rx="3" fill="#ffd700" opacity=".7"/>
              {/* Door */}
              <ellipse cx="42" cy="86" rx="10" ry="13" fill="#1a0a2e"/>
              {/* Flag */}
              <line x1="42" y1="6" x2="42" y2="-6" stroke="#e0e0e0" strokeWidth="2"/>
              <polygon points="42,-6 58,0 42,6" fill="#e74c3c"/>
              {/* Castle glow */}
              <rect x="4" y="6" width="76" height="76" fill="none" stroke="#f1c40f" strokeWidth="1" opacity=".3" rx="4"/>
            </g>

            {/* Castle label banner */}
            <rect x="68" y="8" width="184" height="22" rx="11" fill="#2980b9"/>
            <rect x="68" y="8" width="184" height="22" rx="11" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="1.5"/>
            <polygon points="68,8 60,19 68,30"  fill="#1a5276"/>
            <polygon points="252,8 260,19 252,30" fill="#1a5276"/>
            <text x="160" y="23" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="900" fontFamily="sans-serif" letterSpacing="1">👑 GRAND MASTER CASTLE</text>

            {/* ── ZONE NODES ── */}
            {ZONES.map((z,i)=>{
              const n=nodes[i];
              const locked=z.locked;
              const isHere=i===youAreHere;
              const zonePuzzles=PUZZLES.filter(p=>p.zone===z.id);
              const done=zonePuzzles.filter(p=>completedPuzzles>=p.id).length;
              const pct=zonePuzzles.length?(done/zonePuzzles.length)*100:0;

              return(
                <g key={z.id} onClick={()=>!locked&&onStartPuzzle(z.id)} style={{cursor:locked?"default":"pointer"}}>

                  {/* Pulse glow for current zone */}
                  {isHere&&<>
                    <circle cx={n.x} cy={n.y} r="52" fill="url(#nodeGlow)" opacity=".8" style={{animation:"mapPulse 2s ease-in-out infinite"}}/>
                    <circle cx={n.x} cy={n.y} r="42" fill="none" stroke="#f1c40f" strokeWidth="2.5" opacity=".5" style={{animation:"mapPulse 2s ease-in-out infinite"}}/>
                  </>}

                  {/* Shadow */}
                  <ellipse cx={n.x+2} cy={n.y+9} rx="33" ry="10" fill="rgba(0,0,0,.3)"/>

                  {/* Outer ring */}
                  <circle cx={n.x} cy={n.y} r="33" fill={locked?"#2a2a4a":z.color} filter="url(#shadow)"/>
                  {/* Inner circle */}
                  <circle cx={n.x} cy={n.y} r="26" fill={locked?"#1a1a3a":`${z.color}cc`}/>
                  {/* Shine */}
                  <ellipse cx={n.x-8} cy={n.y-10} rx="10" ry="7" fill="rgba(255,255,255,.2)" transform={`rotate(-30,${n.x-8},${n.y-10})`}/>

                  {/* Progress arc */}
                  {!locked&&pct>0&&(
                    <circle cx={n.x} cy={n.y} r="30"
                      fill="none" stroke="#f1c40f" strokeWidth="4"
                      strokeDasharray={`${pct*1.885} 188.5`}
                      strokeDashoffset="47.1"
                      strokeLinecap="round" opacity=".9"
                      transform={`rotate(-90 ${n.x} ${n.y})`}
                      filter="url(#softGlow)"
                    />
                  )}

                  {/* Icon or lock */}
                  {locked
                    ? <text x={n.x} y={n.y+9} textAnchor="middle" fontSize="22" style={{userSelect:"none"}}>🔒</text>
                    : <text x={n.x} y={n.y+10} textAnchor="middle" dominantBaseline="middle" fontSize="26" style={{userSelect:"none"}}>{z.emoji}</text>
                  }

                  {/* Stars earned */}
                  {!locked&&done>0&&(
                    <text x={n.x} y={n.y+24} textAnchor="middle" fontSize="10" fill="#f1c40f" fontWeight="900" fontFamily="sans-serif">
                      {"★".repeat(done)}{"☆".repeat(Math.max(0,zonePuzzles.length-done))}
                    </text>
                  )}

                  {/* Number badge */}
                  <circle cx={n.x+27} cy={n.y-27} r="13" fill={locked?"#3a3a6a":z.color} stroke="#fff" strokeWidth="2.5" filter="url(#shadow)"/>
                  <text x={n.x+27} y={n.y-22} textAnchor="middle" fontSize="11" fill="#fff" fontWeight="900" fontFamily="sans-serif">{i+1}</text>

                  {/* Label pill */}
                  <rect x={n.x-36} y={n.y-56} width="72" height="20" rx="10" fill={locked?"#1a1a3a":z.color} opacity=".95"/>
                  <rect x={n.x-36} y={n.y-56} width="72" height="20" rx="10" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1"/>
                  <text x={n.x} y={n.y-42} textAnchor="middle" fontSize="9.5" fill="#fff" fontWeight="900" fontFamily="sans-serif" letterSpacing=".5">{z.label.toUpperCase()}</text>

                  {/* YOU ARE HERE — player avatar */}
                  {isHere&&(
                    <g style={{animation:"mascotFloat 2s ease-in-out infinite"}}>
                      {/* Pin stem */}
                      <line x1={n.x} y1={n.y-36} x2={n.x} y2={n.y-52} stroke="#f1c40f" strokeWidth="2.5"/>
                      {/* Avatar circle */}
                      <circle cx={n.x} cy={n.y-62} r="16" fill={playerColor||"#e74c3c"} stroke="#fff" strokeWidth="3" filter="url(#shadow)"/>
                      <text x={n.x} y={n.y-56} textAnchor="middle" dominantBaseline="middle" fontSize="18">{playerAvatar||"♟️"}</text>
                      {/* YOU label */}
                      <rect x={n.x-18} y={n.y-86} width="36" height="16" rx="8" fill="#f1c40f"/>
                      <polygon points={`${n.x-4},${n.y-70} ${n.x+4},${n.y-70} ${n.x},${n.y-62}`} fill="#f1c40f"/>
                      <text x={n.x} y={n.y-74} textAnchor="middle" fontSize="8.5" fill="#1a1a2e" fontWeight="900" fontFamily="sans-serif">YOU!</text>
                    </g>
                  )}
                </g>
              );
            })}

          </svg>
        </div>
      </div>

      <style>{`
        @keyframes mapPulse{0%,100%{opacity:.25}50%{opacity:.8}}
        @keyframes mascotFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
      `}</style>
    </div>
  );
}


// Board sized to fit screen with all chrome accounted for
function BoardContainer({children}){
  return(
    <div style={{flex:1,minHeight:0,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 10px",overflow:"hidden"}}>
      <div style={{width:"100%",maxWidth:"100%",aspectRatio:"1/1",maxHeight:"100%",overflow:"visible"}}>
        {children()}
      </div>
    </div>
  );
}

function PuzzleScreen({puzzle, onComplete, onBack}){
  const [board,setBoard]=useState(puzzle.board.map(r=>r.slice()));
  const [selected,setSelected]=useState(null);
  const [targets,setTargets]=useState([]);
  const [phase,setPhase]=useState("play");
  const [hintUsed,setHintUsed]=useState(false);
  const [lastMove,setLastMove]=useState(null);
  const [tries,setTries]=useState(0);
  const earned=hintUsed?Math.floor(puzzle.xp*.7):puzzle.xp;

  const msgs={
    play: puzzle.desc,
    correct: `Incredible! You solved it! ${hintUsed?"Well done even with the hint!":"No hints needed — you're a chess genius!"} 🎉`,
    wrong: tries>=2?"Don't give up! Tap the Hint button for help! 💡":"Not quite — have another go! You can do it! 💪",
    hint: puzzle.hint,
  };
  const moods={play:"thinking",correct:"celebrating",wrong:"encouraging",hint:"thinking"};

  const tap=(r,c)=>{
    if(phase==="correct"||phase==="wrong")return;
    const p=board[r][c];
    if(!selected){if(mine(p,"w")){setSelected({r,c});setTargets(legalFor(board,r,c,"w"));}return;}
    if(mine(p,"w")){setSelected({r,c});setTargets(legalFor(board,r,c,"w"));return;}
    const move=targets.find(m=>m.to.r===r&&m.to.c===c);
    if(!move){setSelected(null);setTargets([]);return;}
    const sol=puzzle.solution;
    const ok=move.from.r===sol.from.r&&move.from.c===sol.from.c&&move.to.r===sol.to.r&&move.to.c===sol.to.c;
    const nb=applyM(board,move);
    setBoard(nb);setLastMove({from:move.from,to:move.to});setSelected(null);setTargets([]);
    if(ok){ SFX.correct(); setPhase("correct"); }
    else{ SFX.wrong(); setTries(t=>t+1);setPhase("wrong");setTimeout(()=>{setBoard(puzzle.board.map(r=>r.slice()));setLastMove(null);setPhase("play");},1800);}
  };

  return(
    <div style={{background:"#f0f4ff",height:"100%",display:"flex",flexDirection:"column",overflow:"hidden",boxSizing:"border-box"}}>

      {/* Header — consistent purple game style */}
      <div style={{background:"linear-gradient(135deg,#6c5ce7,#a29bfe)",padding:"10px 14px",display:"flex",alignItems:"center",gap:10,boxShadow:"0 4px 0 #4a3ab5",flexShrink:0}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,.2)",border:"2px solid rgba(255,255,255,.35)",borderRadius:14,padding:"8px 12px",color:"#fff",fontSize:13,fontWeight:900,boxShadow:"0 3px 0 rgba(0,0,0,.2)"}}>← Back</button>
        <div style={{flex:1,textAlign:"center"}}>
          <div style={{fontSize:15,fontWeight:900,color:"#fff"}}><span style={{display:"inline-block",animation:"puzzleWiggle 2s ease-in-out infinite"}}>{puzzle.emoji}</span> {puzzle.title}</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,.75)",fontWeight:700}}>+{puzzle.xp} 💎 gems</div>
        </div>
        <button onClick={()=>{SFX.hint();setHintUsed(true);setPhase("hint");setTimeout(()=>setPhase("play"),3000);}}
          style={{background:"linear-gradient(145deg,#f1c40f,#f39c12)",border:"none",borderRadius:14,padding:"8px 12px",color:"#1a1a2e",fontSize:13,fontWeight:900,boxShadow:"0 4px 0 #d4ac0d"}}>
          💡 Hint
        </button>
      </div>

      {/* Speech bubble — fixed below header */}
      <div style={{padding:"10px 14px 8px",flexShrink:0}}>
        <SpeechBubble msg={msgs[phase]} mood={moods[phase]} showSpeaker={true}/>
      </div>

      {/* Board — measured container so coords never clip */}
      <BoardContainer>
        {()=><MiniBoard board={board} onTap={tap} selected={selected} targets={targets} lastMove={lastMove} highlightSq={puzzle.targetSq}/>}
      </BoardContainer>

      {/* Full-screen celebration */}
      {phase==="correct"&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",animation:"fadeIn .3s ease"}}>
          {/* Confetti */}
          {Array.from({length:20}).map((_,i)=>(
            <div key={i} style={{
              position:"absolute",
              left:`${Math.random()*100}%`,
              top:`${Math.random()*100}%`,
              fontSize:Math.random()*20+10,
              animation:`confettiFall ${Math.random()*2+1}s ease-in forwards`,
              animationDelay:`${Math.random()*.5}s`,
            }}>
              {["⭐","🎉","✨","💎","🏆","🌟"][i%6]}
            </div>
          ))}
          <div style={{background:"linear-gradient(145deg,#fff,#f8f9fa)",borderRadius:28,padding:"32px 28px",margin:"20px",textAlign:"center",boxShadow:"0 20px 0 rgba(0,0,0,.2)",border:"4px solid #f1c40f",maxWidth:320,animation:"bounceIn .5s cubic-bezier(.34,1.56,.64,1)"}}>
            <KnightMascot mood="celebrating" size={90} animate={true}/>
            <div style={{fontSize:40,display:"inline-block",animation:"trophyBounce 1s ease-in-out infinite"}}>🏆</div>
            <div style={{fontSize:32,fontWeight:900,color:"#e67e22",margin:"4px 0 4px",letterSpacing:"-.5px"}}>BRILLIANT!</div>
            <div style={{fontSize:16,color:"#636e72",marginBottom:16}}>{hintUsed?"Great effort!":"Perfect solve!"}</div>
            <div style={{background:"linear-gradient(135deg,#f1c40f,#e67e22)",borderRadius:20,padding:"14px",marginBottom:16,boxShadow:"0 4px 0 #d4ac0d"}}>
              <div style={{fontSize:36,fontWeight:900,color:"#fff",textShadow:"0 2px 4px rgba(0,0,0,.2)"}}>+{earned} 💎</div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={onBack} style={{flex:1,background:"#dfe6e9",border:"none",borderRadius:14,padding:"14px",color:"#2d3436",fontWeight:800,fontSize:14,cursor:"pointer",boxShadow:"0 4px 0 #b2bec3"}}>← Back</button>
              <button onClick={()=>{SFX.collect();onComplete(earned);}} style={{flex:2,background:"linear-gradient(135deg,#27ae60,#2ecc71)",border:"none",borderRadius:14,padding:"14px",color:"#fff",fontWeight:900,fontSize:16,cursor:"pointer",boxShadow:"0 5px 0 #1e8449",animation:"bounceIn .4s .2s both"}}>
                {(()=>{
                  const zp=PUZZLES.filter(p=>p.zone===puzzle.zone);
                  const idx=zp.findIndex(p=>p.id===puzzle.id);
                  return idx<zp.length-1 ? "Next Puzzle →" : "Zone Complete! 🎉";
                })()}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// FREE PLAY SCREEN
// ═══════════════════════════════════════════════════════════
function PlayScreen({onBack,board,setBoard,turn,setTurn,sel,setSel,tgts,setTgts,hist,setHist,snaps,setSnaps,lastMove,setLastMove,over,setOver,thinking,setThinking,msg,setMsg,mood,setMood}){
  const PNAMES={p:"pawn",n:"knight",b:"bishop",r:"rook",q:"queen",k:"king"};
  const say=(m,mo="happy")=>{setMsg(m);setMood(mo);};

  const afterMove=(nb,move,isMine)=>{
    if(isMine){
      const h=hangingFor(nb,"w");
      if(h.length){say(`Watch out! Your ${PNAMES[typ(h[0].piece)]} on ${sqN(h[0].r,h[0].c).toUpperCase()} is unprotected! 😬`,"sad");return;}
      if(move.captured)say(`Nice! You grabbed their ${PNAMES[typ(move.captured)]}! ⭐`,"excited");
      else if("nb".includes(typ(move.piece)))say(`Great move! Getting pieces out early is smart! 🌟`,"happy");
      else say(`Good move! Look for free pieces to capture! 🎯`,"happy");
    }else{
      if(inCheck(nb,"w")){SFX.check();say(`You're in CHECK! 😮 Move your King, block it, or capture the attacker!`,"sad");return;}
      const t=threatsFor(nb,"w");
      if(t.length){say(`Careful! Your ${PNAMES[typ(t[0].piece)]} on ${sqN(t[0].r,t[0].c).toUpperCase()} is being attacked! 👀`,"thinking");return;}
      const f=findForks(nb,"w");
      if(f.length){say(`Secret tip! 🤫 Fork two pieces with your ${PNAMES[typ(f[0].move.piece)]}!`,"excited");return;}
      say(`Your turn! Look for checks and captures! 🎯`,"happy");
    }
  };

  const tap=useCallback((r,c)=>{
    if(over||turn!=="w")return;
    const p=board[r][c];
    if(!sel){
      if(mine(p,"w")){const l=legalFor(board,r,c,"w");setSel({r,c});setTgts(l);say(l.length?"Tap a glowing dot to move! ✨":"That piece can't move — try another! 😅","thinking");}
      else say("Tap one of YOUR white pieces! ♙","thinking");
      return;
    }
    if(mine(p,"w")){setSel({r,c});setTgts(legalFor(board,r,c,"w"));return;}
    const move=tgts.find(m=>m.to.r===r&&m.to.c===c);
    if(!move){setSel(null);setTgts([]);return;}
    const nb=applyM(board,move);
    setSnaps(s=>[...s,{board,turn,hist,lastMove}]);
    SFX.drop();
    setBoard(nb);setLastMove({from:move.from,to:move.to});
    setHist(h=>[...h,notation(move)]);setSel(null);setTgts([]);
    afterMove(nb,move,true);
    if(!allLegal(nb,"b").length){setOver(true);if(inCheck(nb,"b"))say("CHECKMATE! YOU WIN! 🏆🎉","celebrating");else say("Stalemate — a draw! 🤝","happy");return;}
    setTurn("b");setThinking(true);
    setTimeout(()=>{
      const bm=pickBlack(nb);if(!bm)return;
      const nb2=applyM(nb,bm);
      setBoard(nb2);setLastMove({from:bm.from,to:bm.to});
      setHist(h=>[...h,notation(bm)]);setThinking(false);
      if(!allLegal(nb2,"w").length){setOver(true);if(inCheck(nb2,"w"))say("Oh no, checkmate! 😢 Every champion loses sometimes — try again!","sad");else say("Stalemate — a draw! 🤝","happy");setTurn("w");return;}
      setTurn("w");afterMove(nb2,bm,false);
    },700);
  },[board,turn,sel,tgts,over,hist,lastMove]);

  const newGame=()=>{setBoard(INIT());setTurn("w");setSel(null);setTgts([]);setHist([]);setSnaps([]);setLastMove(null);setOver(false);setThinking(false);setMsg("New game! You play White. Good luck Champion! 🏆");setMood("happy");};
  const undo=()=>{if(!snaps.length){say("Nothing to undo yet!","thinking");return;}const s=snaps[snaps.length-1];setSnaps(sp=>sp.slice(0,-1));setBoard(s.board);setTurn(s.turn);setHist(s.hist);setLastMove(s.lastMove);setSel(null);setTgts([]);setOver(false);setThinking(false);say("Move taken back! Try something different! 🔄","encouraging");};

  const statusCfg=over
    ?{bg:"linear-gradient(135deg,#f1c40f,#e67e22)",shadow:"#d4ac0d",text:"🏆 Game Over!",color:"#1a1a2e"}
    :turn==="b"
      ?{bg:"linear-gradient(135deg,#8e44ad,#6c3483)",shadow:"#512e5f",text:"🤔 Thinking…",color:"#fff"}
      :{bg:"linear-gradient(135deg,#27ae60,#1e8449)",shadow:"#145a32",text:"♙ Your Turn!",color:"#fff"};

  return(
    <div style={{background:"#f0f4ff",height:"100%",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Purple header */}
      <div style={{background:"linear-gradient(135deg,#6c5ce7,#a29bfe)",padding:"10px 14px",display:"flex",alignItems:"center",gap:10,boxShadow:"0 4px 0 #4a3ab5",flexShrink:0}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,.2)",border:"2px solid rgba(255,255,255,.35)",borderRadius:14,padding:"8px 12px",color:"#fff",fontSize:13,fontWeight:900,boxShadow:"0 3px 0 rgba(0,0,0,.2)"}}>{"<"} Back</button>
        <div style={{flex:1,textAlign:"center"}}>
          <div style={{fontSize:15,fontWeight:900,color:"#fff"}}>{"♟️"} FREE PLAY</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,.75)",fontWeight:700}}>You play White</div>
        </div>
        <button onClick={undo} style={{background:"linear-gradient(145deg,#fdcb6e,#e17055)",border:"none",borderRadius:14,padding:"8px 14px",color:"#fff",fontSize:16,fontWeight:900,boxShadow:"0 4px 0 #c0392b"}}>{"↩"}</button>
        <button onClick={newGame} style={{background:"linear-gradient(145deg,#e74c3c,#c0392b)",border:"none",borderRadius:14,padding:"8px 14px",color:"#fff",fontSize:16,fontWeight:900,boxShadow:"0 4px 0 #922b21"}}>{"✦"}</button>
      </div>
      {/* Speech bubble */}
      <div style={{padding:"10px 14px 8px",flexShrink:0}}>
        <SpeechBubble msg={msg} mood={mood} showSpeaker={true}/>
      </div>
      {/* Board */}
      <BoardContainer>
        {()=><MiniBoard board={board} onTap={tap} selected={sel} targets={tgts} lastMove={lastMove}/>}
      </BoardContainer>
      {/* Status */}
      <div style={{margin:"8px 14px 8px",background:statusCfg.bg,borderRadius:20,padding:"12px",fontWeight:900,fontSize:17,color:statusCfg.color,textAlign:"center",boxShadow:"0 5px 0 rgba(0,0,0,.2)",display:"flex",alignItems:"center",justifyContent:"center",gap:10,flexShrink:0}}>
        {thinking&&<span style={{display:"inline-block",width:12,height:12,borderRadius:"50%",background:"rgba(255,255,255,.7)",animation:"pulse .8s ease-in-out infinite"}}/>}
        {statusCfg.text}
        {hist.length>0&&<span style={{fontSize:12,opacity:.8,fontWeight:700}}>{" · Move "}{Math.ceil(hist.length/2)}</span>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// AWARDS SCREEN
// ═══════════════════════════════════════════════════════════
function AwardsScreen({xp, completedPuzzles, streak}){
  const rank=getRank(xp);
  const awards=[
    {title:"First Move!",   desc:"Complete your first puzzle", icon:"🎯", earned:completedPuzzles>=1, color:"#e74c3c", shadow:"#c0392b"},
    {title:"Puzzle Solver", desc:"Complete 3 puzzles",         icon:"🧩", earned:completedPuzzles>=3, color:"#e67e22", shadow:"#ba6b09"},
    {title:"On Fire!",      desc:"3 day streak",               icon:"🔥", earned:streak>=3,           color:"#f39c12", shadow:"#d4890a"},
    {title:"Star Collector",desc:"Earn 100 XP",               icon:"⭐", earned:xp>=100,             color:"#f1c40f", shadow:"#d4ac0d"},
    {title:"Knight Power",  desc:"Earn 250 XP",               icon:"♘", earned:xp>=250,             color:"#27ae60", shadow:"#1e8449"},
    {title:"Tactics Ace",   desc:"Complete 4 puzzles",         icon:"⚔️", earned:completedPuzzles>=4, color:"#00b894", shadow:"#00896e"},
    {title:"Champion!",     desc:"Earn 500 XP",               icon:"♖", earned:xp>=500,             color:"#8e44ad", shadow:"#6c3483"},
    {title:"Grand Master",  desc:"Earn 1000 XP",              icon:"👑", earned:xp>=1000,            color:"#2980b9", shadow:"#1a5276"},
  ];

  const nextRank = getNextRank(xp);
  const xpPct = nextRank ? ((xp - rank.min) / (nextRank.min - rank.min)) * 100 : 100;

  return(
    <div style={{height:"100%",display:"flex",flexDirection:"column",overflow:"hidden",background:"linear-gradient(180deg,#1a1040 0%,#2d1b69 40%,#1a3a6a 100%)"}}>

      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#6c5ce7,#a29bfe)",padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 0 #4a3ab5",flexShrink:0}}>
        <div style={{fontSize:15,fontWeight:900,color:"#fff",display:"flex",alignItems:"center",gap:8}}>
          <span style={{animation:"trophyBounce 2s ease-in-out infinite",display:"inline-block"}}>🏆</span>
          AWARDS & RANKS
          <span style={{animation:"trophyBounce 2s ease-in-out infinite .3s",display:"inline-block"}}>🏆</span>
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"14px 14px 24px"}}>

        {/* ── RANK CARD ── */}
        <div style={{
          background:`linear-gradient(135deg,${rank.color}cc,${rank.color}44)`,
          borderRadius:28,padding:"20px 16px",marginBottom:14,
          border:"3px solid rgba(255,255,255,.25)",
          boxShadow:`0 8px 0 ${rank.color}66, 0 12px 32px rgba(0,0,0,.4)`,
          textAlign:"center",position:"relative",overflow:"hidden",
        }}>
          {/* Big faded background icon */}
          <div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",fontSize:120,opacity:.07,pointerEvents:"none"}}>♔</div>

          {/* Twinkling stars */}
          {[["10%","20%"],["85%","15%"],["15%","75%"],["88%","70%"]].map(([l,t],i)=>(
            <div key={i} style={{position:"absolute",left:l,top:t,fontSize:16,opacity:.4,animation:`pulse ${1.5+i*.3}s ease-in-out infinite`,animationDelay:`${i*.4}s`}}>✨</div>
          ))}

          <KnightMascot mood="celebrating" size={80} animate={true}/>
          <div style={{fontSize:32,fontWeight:900,color:"#fff",marginTop:6,textShadow:"0 3px 8px rgba(0,0,0,.4)",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <span style={{display:"inline-block",animation:"trophyBounce 2s ease-in-out infinite",fontSize:36}}>{rank.icon}</span>
            {rank.name}
          </div>
          <div style={{fontSize:13,color:"rgba(255,255,255,.8)",marginBottom:12,fontWeight:700}}>{xp.toLocaleString()} XP earned</div>

          {/* XP Progress bar */}
          {nextRank&&(
            <div style={{marginBottom:14,padding:"0 8px"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <span style={{fontSize:11,color:"rgba(255,255,255,.7)",fontWeight:700}}>{rank.icon} {rank.name}</span>
                <span style={{fontSize:11,color:"rgba(255,255,255,.7)",fontWeight:700}}>{nextRank.icon} {nextRank.name}</span>
              </div>
              <div style={{height:14,background:"rgba(0,0,0,.3)",borderRadius:999,overflow:"hidden",border:"2px solid rgba(255,255,255,.15)"}}>
                <div style={{height:"100%",width:`${xpPct}%`,background:"linear-gradient(90deg,#f1c40f,#fff)",borderRadius:999,transition:"width 1s ease",boxShadow:"0 0 10px rgba(255,255,255,.6)"}}/>
              </div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.6)",marginTop:4,textAlign:"center",fontWeight:700}}>{nextRank.min - xp} XP to {nextRank.name}</div>
            </div>
          )}

          {/* Rank journey */}
          <div style={{display:"flex",justifyContent:"space-around",alignItems:"center",gap:4}}>
            {RANKS.map((r,i)=>{
              const earned = xp>=r.min;
              const current = rank.name===r.name;
              return(
                <div key={r.name} style={{textAlign:"center",flex:1}}>
                  {i>0&&<div style={{height:2,background:xp>=RANKS[i-1].min?"#f1c40f":"rgba(255,255,255,.2)",marginBottom:6,marginTop:14,borderRadius:999}}/>}
                  <div style={{fontSize:current?28:20,filter:earned?"drop-shadow(0 2px 8px rgba(255,215,0,.8))":"none",opacity:earned?1:.25,transform:current?"scale(1.2)":"scale(1)",transition:"all .3s",display:"block"}}>{r.icon}</div>
                  <div style={{fontSize:7,color:earned?"rgba(255,255,255,.9)":"rgba(255,255,255,.3)",fontWeight:900,marginTop:3,letterSpacing:.5}}>{r.name.slice(0,3).toUpperCase()}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── ACHIEVEMENTS HEADER ── */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
          <div style={{flex:1,height:2,background:"rgba(255,255,255,.15)",borderRadius:999}}/>
          <div style={{fontSize:12,fontWeight:900,color:"rgba(255,255,255,.7)",letterSpacing:2}}>🏅 ACHIEVEMENTS</div>
          <div style={{flex:1,height:2,background:"rgba(255,255,255,.15)",borderRadius:999}}/>
        </div>

        {/* ── ACHIEVEMENT CARDS ── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {awards.map((a,i)=>(
            <div key={i} className="tap-target" style={{
              background:a.earned
                ?`linear-gradient(145deg,${a.color},${a.shadow})`
                :"linear-gradient(145deg,rgba(255,255,255,.08),rgba(255,255,255,.04))",
              borderRadius:22,padding:"16px 12px",
              border:`3px solid ${a.earned?"rgba(255,255,255,.3)":"rgba(255,255,255,.1)"}`,
              boxShadow:a.earned?`0 6px 0 ${a.shadow}88, 0 10px 20px rgba(0,0,0,.3)`:"0 3px 0 rgba(0,0,0,.3)",
              opacity:a.earned?1:.6,
              position:"relative",overflow:"hidden",
              animation:a.earned?`bounceIn .4s cubic-bezier(.34,1.56,.64,1) ${i*0.05}s both`:"none",
            }}>
              {/* Shine on earned cards */}
              {a.earned&&<div style={{position:"absolute",top:-20,left:-20,width:60,height:60,borderRadius:"50%",background:"rgba(255,255,255,.15)"}}/>}
              {/* Lock icon for unearned */}
              {!a.earned&&<div style={{position:"absolute",top:8,right:10,fontSize:14,opacity:.4}}>🔒</div>}

              <div style={{fontSize:34,marginBottom:6,display:"inline-block",filter:a.earned?"drop-shadow(0 3px 6px rgba(0,0,0,.3))":"grayscale(1)",animation:a.earned?`iconBob ${2+i*.1}s ease-in-out infinite`:"none"}}>{a.icon}</div>
              <div style={{fontSize:13,fontWeight:900,color:a.earned?"#fff":"rgba(255,255,255,.4)",marginBottom:2}}>{a.title}</div>
              <div style={{fontSize:10,color:a.earned?"rgba(255,255,255,.8)":"rgba(255,255,255,.3)",lineHeight:1.4}}>{a.desc}</div>
              {a.earned&&(
                <div style={{marginTop:8,background:"rgba(255,255,255,.2)",borderRadius:10,padding:"3px 10px",display:"inline-flex",alignItems:"center",gap:4,fontSize:10,fontWeight:900,color:"#fff"}}>
                  <span>✓</span> EARNED!
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════
// PROFILE SYSTEM
// ═══════════════════════════════════════════════════════════
const AVATARS=["♟️","♞","♝","♜","♛","♚","🦁","🐯","🦊","🐸","🐧","🦄"];
const PROFILE_COLORS=["#e74c3c","#3498db","#27ae60","#f39c12","#8e44ad","#e91e63"];

const DEFAULT_PROFILE={name:"",avatar:"♟️",color:"#3498db",xp:0,gems:0,streak:0,completed:0};

// Shared form used for both Add and Edit
function ProfileForm({title, initial, onSave, onCancel, onDelete}){
  const [name,setName]=useState(initial?.name||"");
  const [avatar,setAvatar]=useState(initial?.avatar||"♟️");
  const [color,setColor]=useState(initial?.color||"#3498db");
  const [confirmDelete,setConfirmDelete]=useState(false);

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20,overflowY:"auto"}}>
      <div style={{background:"#fff",borderRadius:24,padding:24,width:"100%",maxWidth:320,boxShadow:"0 20px 0 rgba(0,0,0,.3)"}}>
        <div style={{fontSize:20,fontWeight:900,color:"#2d3436",marginBottom:16,textAlign:"center"}}>{title}</div>

        {/* Preview */}
        <div style={{textAlign:"center",marginBottom:16}}>
          <div style={{width:70,height:70,borderRadius:"50%",background:`linear-gradient(145deg,${color},${color}88)`,border:"3px solid rgba(0,0,0,.1)",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:38,boxShadow:`0 5px 0 ${color}88`}}>{avatar}</div>
          <div style={{fontSize:16,fontWeight:900,color:"#2d3436",marginTop:8}}>{name||"Your name"}</div>
        </div>

        {/* Name */}
        <input value={name} onChange={e=>setName(e.target.value)}
          placeholder="Enter name..."
          style={{width:"100%",padding:"12px 16px",borderRadius:14,border:"3px solid #dfe6e9",fontSize:16,fontWeight:700,marginBottom:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}
        />

        {/* Avatar */}
        <div style={{fontSize:11,fontWeight:800,color:"#636e72",letterSpacing:1,marginBottom:8}}>PICK YOUR PIECE</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:6,marginBottom:14}}>
          {AVATARS.map(a=>(
            <button key={a} onClick={()=>setAvatar(a)} style={{background:avatar===a?"#f1c40f":"#f8f9fa",border:"2px solid "+(avatar===a?"#f1c40f":"#dfe6e9"),borderRadius:12,padding:"8px 4px",fontSize:22,cursor:"pointer",boxShadow:avatar===a?"0 3px 0 #d4ac0d":"0 2px 0 #dfe6e9"}}>{a}</button>
          ))}
        </div>

        {/* Colour */}
        <div style={{fontSize:11,fontWeight:800,color:"#636e72",letterSpacing:1,marginBottom:8}}>PICK YOUR COLOUR</div>
        <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
          {PROFILE_COLORS.map(col=>(
            <button key={col} onClick={()=>setColor(col)} style={{width:38,height:38,borderRadius:"50%",background:col,border:"3px solid "+(color===col?"#2d3436":"transparent"),cursor:"pointer",flexShrink:0,boxShadow:color===col?"0 0 0 2px #fff, 0 0 0 4px "+col:"0 3px 0 rgba(0,0,0,.2)"}}/>
          ))}
        </div>

        {/* Buttons */}
        <div style={{display:"flex",gap:10,marginBottom:onDelete?10:0}}>
          <button onClick={onCancel} style={{flex:1,background:"#dfe6e9",border:"none",borderRadius:14,padding:14,fontSize:14,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 0 #b2bec3",color:"#636e72"}}>Cancel</button>
          <button onClick={()=>name.trim()&&onSave({name:name.trim(),avatar,color})}
            style={{flex:2,background:name.trim()?"linear-gradient(135deg,#27ae60,#2ecc71)":"#dfe6e9",border:"none",borderRadius:14,padding:14,fontSize:14,fontWeight:900,cursor:name.trim()?"pointer":"default",boxShadow:name.trim()?"0 5px 0 #1e8449":"0 4px 0 #b2bec3",color:name.trim()?"#fff":"#95a5a6"}}>
            Save ✓
          </button>
        </div>

        {/* Delete */}
        {onDelete&&!confirmDelete&&(
          <button onClick={()=>setConfirmDelete(true)} style={{width:"100%",background:"none",border:"2px solid #ff7675",borderRadius:14,padding:"10px",fontSize:13,fontWeight:800,cursor:"pointer",color:"#e74c3c"}}>
            🗑️ Delete Profile
          </button>
        )}
        {onDelete&&confirmDelete&&(
          <div style={{background:"#fff5f5",border:"2px solid #ff7675",borderRadius:14,padding:12,textAlign:"center"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#e74c3c",marginBottom:8}}>Are you sure? This can't be undone!</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setConfirmDelete(false)} style={{flex:1,background:"#dfe6e9",border:"none",borderRadius:10,padding:10,fontSize:13,fontWeight:800,cursor:"pointer",color:"#636e72"}}>Keep it</button>
              <button onClick={onDelete} style={{flex:1,background:"#e74c3c",border:"none",borderRadius:10,padding:10,fontSize:13,fontWeight:900,cursor:"pointer",color:"#fff",boxShadow:"0 3px 0 #c0392b"}}>Yes, delete</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileSelect({profiles, onSelect, onAdd, onEdit, onDelete}){
  const [mode,setMode]=useState(null);

  return(
    <div style={{height:"100dvh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"16px 20px",overflowY:"auto",fontFamily:'"Fredoka One","Nunito",-apple-system,BlinkMacSystemFont,sans-serif',position:"relative",overflow:"hidden"}}>

      {/* Animated background — night sky with stars */}
      <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,#0d1b4b 0%,#1a2a6a 40%,#16355e 70%,#0f4c2a 100%)",zIndex:0}}/>

      {/* Stars */}
      {[...Array(20)].map((_,i)=>(
        <div key={i} style={{
          position:"absolute",
          left:`${(i*47+13)%100}%`,
          top:`${(i*31+7)%55}%`,
          width:i%4===0?4:2, height:i%4===0?4:2,
          borderRadius:"50%",
          background:"#fff",
          opacity:0.4+Math.sin(i)*0.4,
          animation:`pulse ${1.5+i%3}s ease-in-out infinite`,
          animationDelay:`${i*0.15}s`,
          zIndex:1,
        }}/>
      ))}

      {/* Floating chess pieces in background */}
      {["♟","♞","♝","♜","♛"].map((piece,i)=>(
        <div key={i} style={{
          position:"absolute",
          left:`${[8,78,18,65,88][i]}%`,
          top:`${[15,8,72,78,45][i]}%`,
          fontSize:28+i*4,
          opacity:.08,
          color:"#fff",
          animation:`mascotFloat ${3+i}s ease-in-out infinite`,
          animationDelay:`${i*0.6}s`,
          zIndex:1,
          userSelect:"none",
        }}>{piece}</div>
      ))}

      {/* Glowing ground strip */}
      <div style={{position:"absolute",bottom:0,left:0,right:0,height:90,background:"linear-gradient(180deg,transparent,#0f4c2a)",zIndex:1}}/>

      {/* Content */}
      <div style={{position:"relative",zIndex:2,width:"100%",maxWidth:360,display:"flex",flexDirection:"column",alignItems:"center"}}>

        {/* Animated chess piece logo */}
        <div style={{marginBottom:4,position:"relative"}}>
          {/* Glow ring */}
          <div style={{
            position:"absolute",inset:-12,borderRadius:"50%",
            background:"radial-gradient(circle,rgba(241,196,15,.35) 0%,transparent 70%)",
            animation:"pulse 2s ease-in-out infinite",
          }}/>
          <div style={{
            fontSize:80,
            display:"inline-block",
            filter:"drop-shadow(0 6px 24px rgba(241,196,15,.6)) drop-shadow(0 0 40px rgba(241,196,15,.3))",
            animation:"logoBounce 2.5s ease-in-out infinite",
            lineHeight:1,
          }}>♟️</div>
        </div>

        {/* Title */}
        <div style={{textAlign:"center",marginBottom:6}}>
          <div style={{
            fontFamily:'"Fredoka One","Nunito",sans-serif',
            fontSize:52,fontWeight:900,fontStyle:"italic",
            background:"linear-gradient(180deg,#fff 0%,#ffe566 40%,#ffaa22 100%)",
            WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
            letterSpacing:-1,lineHeight:1,
            filter:"drop-shadow(0 4px 0 rgba(0,0,0,.4))",
          }}>Chess Quest</div>

          {/* Animated subtitle badge */}
          <div style={{
            display:"inline-flex",alignItems:"center",gap:6,marginTop:8,
            background:"linear-gradient(135deg,#f1c40f,#e67e22)",
            borderRadius:30,padding:"5px 16px",
            border:"2px solid rgba(255,255,255,.4)",
            boxShadow:"0 4px 0 #c87f00, 0 6px 16px rgba(241,196,15,.4)",
          }}>
            <span style={{fontSize:14,display:"inline-block",animation:"swordSlash 1.5s ease-in-out infinite"}}>⚔️</span>
            <span style={{fontSize:12,fontWeight:900,color:"#1a1a2e",letterSpacing:1}}>WHO IS PLAYING?</span>
            <span style={{fontSize:14,display:"inline-block",animation:"swordSlash 1.5s ease-in-out infinite reverse"}}>⚔️</span>
          </div>
        </div>

        {/* Profile grid */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,width:"100%",marginBottom:12,marginTop:8}}>
          {profiles.map((p,i)=>(
            <div key={i} style={{position:"relative",animation:`bounceIn .4s cubic-bezier(.34,1.56,.64,1) both`,animationDelay:`${i*0.08}s`}}>
              <button onClick={()=>{SFX.tap();onSelect(i);}} style={{
                width:"100%",
                background:`linear-gradient(145deg,${p.color},${p.color}99)`,
                border:"3px solid rgba(255,255,255,.35)",
                borderRadius:24,padding:"20px 12px 16px",
                textAlign:"center",cursor:"pointer",
                boxShadow:`0 7px 0 ${p.color}77, 0 12px 24px rgba(0,0,0,.3)`,
                transition:"transform .12s",
              }}>
                {/* Avatar with glow */}
                <div style={{
                  width:64,height:64,borderRadius:"50%",
                  background:"rgba(255,255,255,.15)",
                  border:"3px solid rgba(255,255,255,.4)",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:36,margin:"0 auto 10px",
                  boxShadow:`0 0 20px ${p.color}88`,
                  animation:"mascotFloat 3s ease-in-out infinite",
                  animationDelay:`${i*0.4}s`,
                }}>{p.avatar}</div>
                <div style={{fontSize:16,fontWeight:900,color:"#fff",textShadow:"0 2px 4px rgba(0,0,0,.4)",marginBottom:4,letterSpacing:.5}}>{p.name}</div>
                <div style={{display:"flex",justifyContent:"center",gap:8}}>
                  <span style={{fontSize:11,color:"rgba(255,255,255,.85)",fontWeight:700,background:"rgba(0,0,0,.2)",borderRadius:10,padding:"2px 8px"}}>⭐ {p.xp}</span>
                  <span style={{fontSize:11,color:"rgba(255,255,255,.85)",fontWeight:700,background:"rgba(0,0,0,.2)",borderRadius:10,padding:"2px 8px"}}>💎 {p.gems}</span>
                </div>
              </button>
              {/* Edit badge */}
              <button onClick={e=>{e.stopPropagation();SFX.tap();setMode({edit:i});}} style={{
                position:"absolute",top:8,right:8,
                width:30,height:30,borderRadius:"50%",
                background:"rgba(0,0,0,.4)",border:"2px solid rgba(255,255,255,.5)",
                fontSize:14,cursor:"pointer",color:"#fff",
                display:"flex",alignItems:"center",justifyContent:"center",
                boxShadow:"0 2px 8px rgba(0,0,0,.4)",
              }}>✏️</button>
            </div>
          ))}

          {/* Add player */}
          {profiles.length<4&&(
            <div style={{animation:"bounceIn .4s cubic-bezier(.34,1.56,.64,1) both",animationDelay:`${profiles.length*0.08}s`}}>
              <button onClick={()=>{SFX.tap();setMode("add");}} style={{
                width:"100%",minHeight:148,
                background:"rgba(255,255,255,.08)",
                border:"3px dashed rgba(255,255,255,.3)",
                borderRadius:24,padding:"20px 12px",
                textAlign:"center",cursor:"pointer",
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,
                boxShadow:"inset 0 0 20px rgba(255,255,255,.04)",
              }}>
                <div style={{
                  width:56,height:56,borderRadius:"50%",
                  background:"linear-gradient(145deg,rgba(255,255,255,.2),rgba(255,255,255,.08))",
                  border:"2px dashed rgba(255,255,255,.4)",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:28,color:"rgba(255,255,255,.7)",
                  animation:"pulse 2s ease-in-out infinite",
                }}>＋</div>
                <div style={{fontSize:13,fontWeight:900,color:"rgba(255,255,255,.7)",letterSpacing:.5}}>Add Player</div>
              </button>
            </div>
          )}
        </div>

        {/* Bottom tagline + sign out */}
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:11,color:"rgba(255,255,255,.4)",fontWeight:700,letterSpacing:1,marginBottom:12}}>
            🏆 LEARN CHESS · EARN GEMS · BECOME A MASTER
          </div>

        </div>
      </div>

      {/* Add form */}
      {mode==="add"&&(
        <ProfileForm
          title="👶 New Player"
          onSave={data=>{onAdd({...DEFAULT_PROFILE,...data});setMode(null);}}
          onCancel={()=>setMode(null)}
        />
      )}

      {/* Edit form */}
      {mode&&mode.edit!==undefined&&(
        <ProfileForm
          title="✏️ Edit Profile"
          initial={profiles[mode.edit]}
          onSave={data=>{onEdit(mode.edit,data);setMode(null);}}
          onCancel={()=>setMode(null)}
          onDelete={profiles.length>1?()=>{onDelete(mode.edit);setMode(null);}:null}
        />
      )}

      <GlobalStyles/>
    </div>
  );
}

function ChessWorld(){
  // ── Local storage — load saved profiles on mount ──
  useEffect(()=>{
    const saved = loadLocal();
    if(saved && saved.profiles && saved.profiles.length > 0){
      setProfiles(saved.profiles);
    }
  },[]);

  const saveLocal_ = (updatedProfiles) => {
    saveLocal({ profiles: updatedProfiles, lastSaved: new Date().toISOString() });
  };

  // Profile system
  const [profiles,setProfiles]=useState([
    {name:"Player 1",avatar:"♞",color:"#e74c3c",xp:0,gems:0,streak:0,completed:0},
    {name:"Player 2",avatar:"♛",color:"#3498db",xp:0,gems:0,streak:0,completed:0},
  ]);
  const [activeProfile,setActiveProfile]=useState(null); // null = profile select screen

  const profile = activeProfile!==null ? profiles[activeProfile] : null;

  const addProfile=p=>{
    const updated=[...profiles,p];
    setProfiles(updated);
    setActiveProfile(profiles.length);
    saveLocal_(updated);
  };

  const editProfile=(i,data)=>{
    const updated=profiles.map((p,idx)=>idx===i?{...p,...data}:p);
    setProfiles(updated);
    saveLocal_(updated);
  };

  const deleteProfile=i=>{
    const updated=profiles.filter((_,idx)=>idx!==i);
    setProfiles(updated);
    if(activeProfile===i) setActiveProfile(null);
    else if(activeProfile>i) setActiveProfile(activeProfile-1);
    saveLocal_(updated);
  };

  const updateProfile=updates=>{
    if(activeProfile===null)return;
    const updated=profiles.map((p,i)=>i===activeProfile?{...p,...updates}:p);
    setProfiles(updated);
    saveLocal_(updated);
  };

  // Game state — derived from active profile
  const xp        = profile?.xp        ?? 0;
  const gems      = profile?.gems       ?? 0;
  const streak    = profile?.streak     ?? 0;
  const completed = profile?.completed  ?? 0;

  const [tab,setTab]=useState("home");
  const [activePuzzle,setActivePuzzle]=useState(null);
  const [showPlay,setShowPlay]=useState(false);
  const [xpPop,setXpPop]=useState(null);
  const [puzzleSource,setPuzzleSource]=useState("zones");
  const [zoneCompleteData,setZoneCompleteData]=useState(null);

  const [showSplash,setShowSplash]=useState(true);
  const [confirmLeavePlay,setConfirmLeavePlay]=useState(false);
  const [showSettings,setShowSettings]=useState(false);

  // Free play state — lifted here so game persists when switching tabs
  const [playBoard,setPlayBoard]=useState(INIT);
  const [playTurn,setPlayTurn]=useState("w");
  const [playSel,setPlaySel]=useState(null);
  const [playTgts,setPlayTgts]=useState([]);
  const [playHist,setPlayHist]=useState([]);
  const [playSnaps,setPlaySnaps]=useState([]);
  const [playLastMove,setPlayLastMove]=useState(null);
  const [playOver,setPlayOver]=useState(false);
  const [playThinking,setPlayThinking]=useState(false);
  const [playMsg,setPlayMsg]=useState("You play White! Tap a piece to start! 🎮");
  const [playMood,setPlayMood]=useState("happy");

  // Show splash screen on first visit
  if(showSplash) return(
    <div style={{height:"100dvh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 20px",position:"relative",overflow:"hidden",fontFamily:'"Fredoka One","Nunito",-apple-system,sans-serif'}}>
      {/* Background */}
      <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,#0d1b4b 0%,#1a2a6a 40%,#0f4c2a 100%)",zIndex:0}}/>
      {/* Stars */}
      {[...Array(20)].map((_,i)=>(
        <div key={i} style={{position:"absolute",left:`${(i*47+13)%100}%`,top:`${(i*31+7)%55}%`,width:i%4===0?4:2,height:i%4===0?4:2,borderRadius:"50%",background:"#fff",opacity:.4+Math.sin(i)*.4,animation:`pulse ${1.5+i%3}s ease-in-out infinite`,animationDelay:`${i*.15}s`,zIndex:1}}/>
      ))}
      {/* Floating pieces */}
      {["♟","♞","♝","♜","♛"].map((p,i)=>(
        <div key={i} style={{position:"absolute",left:`${[8,78,18,65,88][i]}%`,top:`${[15,8,72,78,45][i]}%`,fontSize:28+i*4,opacity:.08,color:"#fff",animation:`mascotFloat ${3+i}s ease-in-out infinite`,animationDelay:`${i*.6}s`,zIndex:1,userSelect:"none"}}>{p}</div>
      ))}
      {/* Content */}
      <div style={{position:"relative",zIndex:2,textAlign:"center",maxWidth:320,width:"100%"}}>
        {/* Animated logo */}
        <div style={{marginBottom:8}}>
          <div style={{position:"relative",display:"inline-block"}}>
            <div style={{position:"absolute",inset:-16,borderRadius:"50%",background:"radial-gradient(circle,rgba(241,196,15,.4) 0%,transparent 70%)",animation:"pulse 2s ease-in-out infinite"}}/>
            <div style={{fontSize:90,display:"inline-block",filter:"drop-shadow(0 6px 24px rgba(241,196,15,.7))",animation:"logoBounce 2.5s ease-in-out infinite",lineHeight:1}}>♟️</div>
          </div>
        </div>
        {/* Title */}
        <div style={{fontFamily:'"Fredoka One",sans-serif',fontSize:56,fontWeight:900,fontStyle:"italic",background:"linear-gradient(180deg,#fff 0%,#ffe566 40%,#ffaa22 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:-1,lineHeight:1.1,filter:"drop-shadow(0 4px 0 rgba(0,0,0,.4))",marginBottom:8}}>Chess Quest</div>
        {/* Tagline */}
        <div style={{fontSize:14,color:"rgba(255,255,255,.7)",fontWeight:700,letterSpacing:1,marginBottom:32}}>🏰 LEARN · PLAY · MASTER ⚔️</div>
        {/* Knight mascot */}
        <div style={{marginBottom:32,animation:"mascotFloat 3s ease-in-out infinite"}}>
          <KnightMascot mood="happy" size={100} animate={true}/>
        </div>
        {/* Start button */}
        <button
          onClick={()=>{SFX.tap();setShowSplash(false);}}
          style={{
            background:"linear-gradient(135deg,#f1c40f,#e67e22)",
            border:"none",borderRadius:24,padding:"18px 48px",
            fontSize:20,fontWeight:900,color:"#1a1a2e",
            boxShadow:"0 8px 0 #d4ac0d, 0 12px 32px rgba(241,196,15,.4)",
            cursor:"pointer",letterSpacing:.5,
            animation:"bounceIn .6s cubic-bezier(.34,1.56,.64,1) .3s both",
            display:"inline-flex",alignItems:"center",gap:10,
          }}>
          <span>▶</span> Let's Play!
        </button>
        <div style={{fontSize:11,color:"rgba(255,255,255,.35)",marginTop:16,fontWeight:700}}>
          Tap to begin your chess adventure
        </div>
      </div>
      <GlobalStyles/>
    </div>
  );

  // Show profile select if no active profile
  if(activeProfile===null) return(
    <ProfileSelect
      profiles={profiles}
      onSelect={i=>{setActiveProfile(i);setTab("home");}}
      onAdd={p=>{addProfile(p);setTab("home");}}
      onEdit={(i,data)=>editProfile(i,data)}
      onDelete={i=>deleteProfile(i)}
    />
  );

  const playInProgress = playHist.length > 0 && !playOver;

  const tryLeavePlay = (onConfirm) => {
    if(playInProgress){
      setConfirmLeavePlay({cb: onConfirm}); // wrap in object so useState doesn't invoke it
    } else {
      onConfirm();
    }
  };

  const earnXp=amount=>{
    updateProfile({xp:xp+amount, gems:gems+amount, completed:completed+1});
    setXpPop(amount);
    setTimeout(()=>setXpPop(null),2500);
  };

  const startZone=(zoneId,source="zones")=>{
    const zp=PUZZLES.filter(p=>p.zone===zoneId);
    if(!zp.length) return;
    // Pick first puzzle the player hasn't completed yet; fall back to first
    const next = zp.find(p=>p.id>completed) || zp[0];
    setActivePuzzle(next);
    setPuzzleSource(source);
  };

  const tabCfg={
    home:  {icon:"🏠", label:"Home",   color:"#6c5ce7"},
    zones: {icon:"🗺️", label:"Map",    color:"#27ae60"},
    play:  {icon:"♟️", label:"Play",   color:"#ff6b6b"},
    awards:{icon:"🏆", label:"Awards", color:"#f39c12"},
  };


  return(
    <div style={APP}>
      {/* Zone Complete Overlay */}
      {zoneCompleteData&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20,animation:"fadeIn .3s ease"}}>
          {/* Confetti */}
          {Array.from({length:24}).map((_,i)=>(
            <div key={i} style={{position:"absolute",left:`${Math.random()*100}%`,top:`${Math.random()*60}%`,fontSize:Math.random()*18+10,animation:`confettiFall ${Math.random()*2+1}s ease-in forwards`,animationDelay:`${Math.random()*.6}s`,pointerEvents:"none"}}>
              {["⭐","🎉","✨","💎","🏆","🌟","🎊","⚡"][i%8]}
            </div>
          ))}
          <div style={{background:"linear-gradient(145deg,#fff,#f8f9fa)",borderRadius:28,padding:"32px 28px",maxWidth:320,width:"100%",textAlign:"center",boxShadow:"0 20px 0 rgba(0,0,0,.25)",border:"4px solid #f1c40f",animation:"bounceIn .5s cubic-bezier(.34,1.56,.64,1)"}}>
            {/* Mascot */}
            <KnightMascot mood="celebrating" size={90} animate={true}/>
            {/* Big emoji */}
            <div style={{fontSize:56,margin:"10px 0 4px",display:"inline-block",animation:"trophyBounce 1s ease-in-out infinite"}}>{zoneCompleteData.emoji}</div>
            {/* Title */}
            <div style={{fontSize:28,fontWeight:900,color:"#6c5ce7",marginBottom:6,letterSpacing:-1}}>Zone Complete!</div>
            <div style={{fontSize:18,fontWeight:800,color:"#2d3436",marginBottom:4}}>{zoneCompleteData.zoneName}</div>
            <div style={{fontSize:14,color:"#636e72",marginBottom:20}}>You mastered this realm! 🗡️</div>
            {/* Stars row */}
            <div style={{fontSize:32,marginBottom:20,letterSpacing:4}}>{"⭐".repeat(3)}</div>
            {/* Buttons */}
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{setZoneCompleteData(null);setTab("home");}} style={{flex:1,background:"#dfe6e9",border:"none",borderRadius:14,padding:14,fontSize:14,fontWeight:800,cursor:"pointer",boxShadow:"0 4px 0 #b2bec3",color:"#2d3436"}}>🏠 Home</button>
              <button onClick={()=>{setZoneCompleteData(null);setTab("zones");}} style={{flex:1,background:"linear-gradient(135deg,#6c5ce7,#a29bfe)",border:"none",borderRadius:14,padding:14,fontSize:14,fontWeight:900,cursor:"pointer",boxShadow:"0 5px 0 #4a3ab5",color:"#fff",animation:"bounceIn .4s .2s both"}}>🗺️ Map</button>
            </div>
          </div>
        </div>
      )}

      {/* XP Popup */}
      {xpPop&&(
        <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",background:"linear-gradient(135deg,#f1c40f,#e67e22)",borderRadius:24,padding:"20px 36px",zIndex:999,boxShadow:"0 8px 0 #d4ac0d,0 12px 40px rgba(241,196,15,.6)",animation:"xpPopIn .4s cubic-bezier(.34,1.56,.64,1)",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:10,border:"3px solid rgba(255,255,255,.4)"}}>
          <span style={{fontSize:26,display:"inline-block",animation:"starSpin 1s linear infinite"}}>⭐</span>
          <span style={{fontSize:22,fontWeight:900,color:"#fff",textShadow:"0 2px 4px rgba(0,0,0,.2)"}}>+{xpPop} XP!</span>
          <span style={{fontSize:26,display:"inline-block",animation:"gemPulse 0.8s ease-in-out infinite"}}>💎</span>
        </div>
      )}

      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#1a3a6a,#0d2040)",padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 4px 0 #091628",flexShrink:0}}>
        {/* Logo */}
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:30,filter:"drop-shadow(0 3px 8px rgba(0,0,0,.5))",display:"inline-block",animation:"logoBounce 2.5s ease-in-out infinite"}}>♟️</span>
          <div style={{position:"relative"}}>
            {/* Cartoon italic bold title */}
            <div style={{
              fontSize:22,fontWeight:900,fontStyle:"italic",
              background:"linear-gradient(180deg,#fff 0%,#ffe066 60%,#ffb347 100%)",
              WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
              letterSpacing:-.5,lineHeight:1,
              filter:"drop-shadow(0 2px 0 rgba(0,0,0,.4))",
            }}>Chess Quest</div>
            <div style={{fontSize:9,color:"rgba(255,255,255,.55)",fontWeight:800,letterSpacing:2,marginTop:1}}>KIDS CHESS ⚔️</div>
          </div>
        </div>
        {/* Stats + settings — simplified */}
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <div style={{background:"linear-gradient(145deg,#f1c40f,#e67e22)",borderRadius:16,padding:"4px 10px",border:"2px solid rgba(255,255,255,.3)",boxShadow:"0 3px 0 #d4ac0d",display:"flex",alignItems:"center",gap:3}}>
            <span style={{fontSize:14,display:"inline-block",animation:"starSpin 4s linear infinite"}}>⭐</span>
            <span style={{fontSize:13,fontWeight:900,color:"#fff"}}>{xp}</span>
          </div>
          <div style={{background:"linear-gradient(145deg,#00b894,#00896e)",borderRadius:16,padding:"4px 10px",border:"2px solid rgba(255,255,255,.3)",boxShadow:"0 3px 0 #006e58",display:"flex",alignItems:"center",gap:3}}>
            <span style={{fontSize:14,display:"inline-block",animation:"gemPulse 2s ease-in-out infinite"}}>💎</span>
            <span style={{fontSize:13,fontWeight:900,color:"#fff"}}>{gems}</span>
          </div>

          {/* Player avatar + settings combined into one tappable button */}
          <button onClick={()=>{SFX.tap();setShowSettings(true);}} style={{
            display:"flex",alignItems:"center",gap:6,
            background:`linear-gradient(145deg,${profile.color},${profile.color}88)`,
            border:"2px solid rgba(255,255,255,.4)",borderRadius:18,
            boxShadow:"0 3px 0 rgba(0,0,0,.3)",
            cursor:"pointer",padding:"4px 10px 4px 4px",
          }}>
            <span style={{
              width:26,height:26,borderRadius:"50%",
              background:"rgba(255,255,255,.2)",
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:15,
            }}>{profile.avatar}</span>
            <span style={{fontSize:15}}>⚙️</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{flex:1,overflow:"hidden",position:"relative"}}>
        {activePuzzle
          ? <PuzzleScreen
              key={activePuzzle.id}
              puzzle={activePuzzle}
              onBack={()=>{setActivePuzzle(null);setTab(puzzleSource);}}
              onComplete={earned=>{
                earnXp(earned);
                const zonePuzzles=PUZZLES.filter(p=>p.zone===activePuzzle.zone);
                const currentIdx=zonePuzzles.findIndex(p=>p.id===activePuzzle.id);
                const nextPuzzle=zonePuzzles[currentIdx+1];
                if(nextPuzzle){
                  setActivePuzzle(nextPuzzle);
                } else {
                  SFX.zoneComplete();
                  const zone = ZONES.find(z=>z.id===activePuzzle.zone);
                  setZoneCompleteData({zoneName:zone?.label||"Zone", emoji:zone?.emoji||"🏆"});
                  setActivePuzzle(null);
                }
              }}
            />
          : showPlay
          ? <PlayScreen
              onBack={()=>tryLeavePlay(()=>setShowPlay(false))}
              board={playBoard} setBoard={setPlayBoard}
              turn={playTurn} setTurn={setPlayTurn}
              sel={playSel} setSel={setPlaySel}
              tgts={playTgts} setTgts={setPlayTgts}
              hist={playHist} setHist={setPlayHist}
              snaps={playSnaps} setSnaps={setPlaySnaps}
              lastMove={playLastMove} setLastMove={setPlayLastMove}
              over={playOver} setOver={setPlayOver}
              thinking={playThinking} setThinking={setPlayThinking}
              msg={playMsg} setMsg={setPlayMsg}
              mood={playMood} setMood={setPlayMood}
            />
          : tab==="home"   ? <HomeScreen xp={xp} streak={streak} completedPuzzles={completed} onNav={t=>{if(t==="play"){setShowPlay(true);}else if(t.startsWith("zone:")){const zid=t.slice(5);startZone(zid,"home");setTab("zones");}else{setTab(t);}}} gems={gems} playerName={profile.name} playerAvatar={profile.avatar} playerColor={profile.color}/>
          : tab==="zones"  ? <MapScreen  xp={xp} completedPuzzles={completed} onStartPuzzle={startZone} playerAvatar={profile.avatar} playerColor={profile.color}/>
          : tab==="awards" ? <AwardsScreen xp={xp} completedPuzzles={completed} streak={streak}/>
          : null
        }
      </div>

      {/* Bottom nav */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",background:"#fff",borderTop:"3px solid #dfe6e9",padding:"8px 0 12px",flexShrink:0,boxShadow:"0 -4px 0 #dfe6e9"}}>
        {Object.entries(tabCfg).map(([id,cfg])=>{
          const active=(id==="play"&&showPlay)||(id==="zones"&&!!activePuzzle)||(id!=="play"&&!activePuzzle&&tab===id);
          return(
            <button key={id} onClick={()=>{
              SFX.tap();
              if(id==="play"){ setShowPlay(true); setActivePuzzle(null); setZoneCompleteData(null); }
              else if(showPlay && id!=="play"){
                tryLeavePlay(()=>{ setTab(id); setShowPlay(false); setActivePuzzle(null); setZoneCompleteData(null); });
              } else { setTab(id); setShowPlay(false); setActivePuzzle(null); setZoneCompleteData(null); }
            }}
              style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"4px 0"}}>
              <div style={{
                width:42,height:42,borderRadius:14,
                background:active?`linear-gradient(145deg,${cfg.color}ee,${cfg.color}aa)`:"transparent",
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,
                boxShadow:active?`0 4px 0 ${cfg.color}88`:"none",
                transform:active?"scale(1.12)":"scale(1)",
                transition:"all .2s cubic-bezier(.34,1.56,.64,1)",
                border:active?"2px solid rgba(255,255,255,.4)":"2px solid transparent",
                animation:active?"navPop 1.5s ease-in-out infinite":"none",
                filter:active?"drop-shadow(0 2px 8px rgba(255,255,255,.3))":"none",
              }}>{cfg.icon}</div>
              <span style={{fontSize:10,color:active?cfg.color:"#95a5a6",fontWeight:active?900:600,transition:"color .2s"}}>{cfg.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── SETTINGS PANEL ── */}
      {showSettings&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20,animation:"fadeIn .2s ease"}} onClick={()=>setShowSettings(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:28,padding:"24px",maxWidth:320,width:"100%",boxShadow:"0 20px 0 rgba(0,0,0,.2)",border:"4px solid #6c5ce7",maxHeight:"80vh",overflowY:"auto"}}>

            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <div style={{fontSize:20,fontWeight:900,color:"#2d3436"}}>⚙️ Settings</div>
              <button onClick={()=>setShowSettings(false)} style={{width:30,height:30,borderRadius:"50%",background:"#dfe6e9",border:"none",fontSize:14,fontWeight:900,color:"#636e72",cursor:"pointer"}}>✕</button>
            </div>

            {/* Current player card */}
            <div style={{background:`linear-gradient(135deg,${profile.color},${profile.color}cc)`,borderRadius:18,padding:16,marginBottom:14,textAlign:"center"}}>
              <div style={{width:54,height:54,borderRadius:"50%",background:"rgba(255,255,255,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,margin:"0 auto 8px"}}>{profile.avatar}</div>
              <div style={{fontSize:16,fontWeight:900,color:"#fff",textShadow:"0 2px 4px rgba(0,0,0,.3)"}}>{profile.name}</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.85)",fontWeight:700,marginTop:2}}>⭐ {xp} XP · 💎 {gems} gems</div>
            </div>

            {/* Switch player */}
            <button onClick={()=>{SFX.tap();setShowSettings(false);setActiveProfile(null);}} style={{width:"100%",background:"#f0f4ff",border:"2px solid #6c5ce7",borderRadius:14,padding:"13px",fontSize:14,fontWeight:900,color:"#6c5ce7",cursor:"pointer",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              👥 Switch Player
            </button>

            {/* Saved locally info */}
            <div style={{background:"#f0fff8",border:"2px solid #00d9a3",borderRadius:16,padding:14,marginBottom:14,textAlign:"center"}}>
              <div style={{fontSize:24,marginBottom:4}}>📱</div>
              <div style={{fontSize:13,fontWeight:800,color:"#2d3436",marginBottom:2}}>Saved on this device</div>
              <div style={{fontSize:11,color:"#636e72",lineHeight:1.5}}>Progress saves automatically whenever you earn XP or complete a puzzle.</div>
            </div>
          </div>
        </div>
      )}

      {/* ── LEAVE GAME CONFIRMATION ── */}
      {confirmLeavePlay&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:24,animation:"fadeIn .2s ease"}}>
          <div style={{background:"#fff",borderRadius:28,padding:"28px 24px",maxWidth:300,width:"100%",textAlign:"center",boxShadow:"0 20px 0 rgba(0,0,0,.2)",border:"4px solid #f1c40f"}}>
            <div style={{fontSize:48,marginBottom:8,animation:"puzzleWiggle 1s ease-in-out infinite"}}>♟️</div>
            <div style={{fontSize:20,fontWeight:900,color:"#2d3436",marginBottom:6}}>Leave the game?</div>
            <div style={{fontSize:14,color:"#636e72",marginBottom:20,lineHeight:1.5}}>Your game is still going! Do you want to keep playing or leave?</div>
            <div style={{display:"flex",gap:10}}>
              <button
                onClick={()=>setConfirmLeavePlay(false)}
                style={{flex:1,background:"linear-gradient(135deg,#6c5ce7,#a29bfe)",border:"none",borderRadius:14,padding:"14px",fontSize:14,fontWeight:900,cursor:"pointer",boxShadow:"0 5px 0 #4a3ab5",color:"#fff"}}>
                ♟️ Keep Playing
              </button>
              <button
                onClick={()=>{
                  // Reset game state when leaving
                  setPlayBoard(INIT()); setPlayTurn("w"); setPlaySel(null); setPlayTgts([]);
                  setPlayHist([]); setPlaySnaps([]); setPlayLastMove(null);
                  setPlayOver(false); setPlayThinking(false);
                  setPlayMsg("You play White! Tap a piece to start! 🎮"); setPlayMood("happy");
                  setConfirmLeavePlay(false);
                  confirmLeavePlay.cb(); // run the original navigation callback
                }}
                style={{flex:1,background:"linear-gradient(135deg,#e74c3c,#c0392b)",border:"none",borderRadius:14,padding:"14px",fontSize:14,fontWeight:900,cursor:"pointer",boxShadow:"0 5px 0 #922b21",color:"#fff"}}>
                🚪 Leave
              </button>
            </div>
          </div>
        </div>
      )}

      <GlobalStyles/>
    </div>
  );
}

function GlobalStyles(){
  return(
    <style>{`
      html,body{height:100%;overflow:hidden;margin:0;padding:0}
      *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
      @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.8)}}
      @keyframes bounceIn{0%{transform:scale(.3);opacity:0}50%{transform:scale(1.12)}70%{transform:scale(.96)}100%{transform:scale(1);opacity:1}}
      @keyframes xpPopIn{0%{transform:translate(-50%,-50%) scale(.3);opacity:0}50%{transform:translate(-50%,-50%) scale(1.15)}70%{transform:translate(-50%,-50%) scale(.97)}100%{transform:translate(-50%,-50%) scale(1);opacity:1}}
      @keyframes wiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-12deg)}75%{transform:rotate(12deg)}}
      @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      @keyframes confettiFall{from{opacity:1;transform:translateY(0) rotate(0deg)}to{opacity:0;transform:translateY(60px) rotate(360deg)}}
      @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
      @keyframes mascotFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
      @keyframes mascotBounce{0%{transform:scale(.3)}60%{transform:scale(1.15)}80%{transform:scale(.95)}100%{transform:scale(1)}}
      @keyframes iconFloat{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-6px) rotate(2deg)}}
      @keyframes iconBob{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-5px) scale(1.1)}}
      @keyframes cloudDrift{from{transform:translateX(0)}to{transform:translateX(12px)}}
      @keyframes bounce{0%,100%{transform:translateX(0)}50%{transform:translateX(5px)}}
      @keyframes mapPulse{0%,100%{opacity:.2}50%{opacity:.7}}
      @keyframes logoBounce{0%,100%{transform:translateY(0) rotate(-4deg) scale(1)}30%{transform:translateY(-10px) rotate(4deg) scale(1.15)}60%{transform:translateY(-5px) rotate(-2deg) scale(1.08)}}
      @keyframes gemPulse{0%,100%{transform:scale(1) rotate(0deg)}50%{transform:scale(1.2) rotate(15deg)}}
      @keyframes flameDance{0%,100%{transform:scaleY(1) rotate(-4deg)}33%{transform:scaleY(1.25) rotate(4deg)}66%{transform:scaleY(.9) rotate(-2deg)}}
      @keyframes starSpin{0%{transform:rotate(0deg) scale(1)}50%{transform:rotate(180deg) scale(1.25)}100%{transform:rotate(360deg) scale(1)}}
      @keyframes trophyBounce{0%,100%{transform:translateY(0)}40%{transform:translateY(-8px)}60%{transform:translateY(-6px)}}
      @keyframes puzzleWiggle{0%,100%{transform:rotate(-6deg) scale(1)}50%{transform:rotate(6deg) scale(1.1)}}
      @keyframes dailyPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
      @keyframes navPop{0%,100%{transform:scale(1.05) translateY(0)}50%{transform:scale(1.15) translateY(-3px)}}
      @keyframes shieldWiggle{0%,100%{transform:rotate(0) scale(1)}25%{transform:rotate(-8deg) scale(1.1)}75%{transform:rotate(8deg) scale(1.1)}}
      @keyframes crownFloat{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-7px) rotate(3deg)}}
      @keyframes swordSlash{0%,100%{transform:rotate(-10deg)}50%{transform:rotate(10deg)}}
      @keyframes brainPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}
      @keyframes lightningZap{0%,100%{transform:scaleY(1) rotate(-5deg)}50%{transform:scaleY(1.2) rotate(5deg)}}
      @keyframes castleShake{0%,100%{transform:rotate(0)}20%,60%{transform:rotate(-3deg)}40%,80%{transform:rotate(3deg)}}
      button{cursor:pointer;transition:transform .12s cubic-bezier(.34,1.56,.64,1),box-shadow .12s ease}
      button:active{transform:scale(.87)!important;box-shadow:none!important}
      .tap-target{transition:transform .12s cubic-bezier(.34,1.56,.64,1)}
      .tap-target:active{transform:scale(.93)!important}
    `}</style>
  );
}

const APP={height:"100dvh",maxHeight:"100dvh",display:"flex",flexDirection:"column",overflow:"hidden",fontFamily:'"Fredoka One","Nunito","SF Pro Rounded",-apple-system,BlinkMacSystemFont,sans-serif',WebkitOverflowScrolling:"touch"};


// Mount the app
const _root = document.getElementById('root');
if(_root) {
  ReactDOM.createRoot(_root).render(React.createElement(ChessWorld));
  if(window.__chessQuestReady) window.__chessQuestReady();
}
