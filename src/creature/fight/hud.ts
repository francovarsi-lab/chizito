import type { Match } from './engine';
import { FIGHT } from './tuning';
import { QUAD_KEYS, type Quad } from '../zones';

/**
 * HUD de juego de pelea (HTML sobre el canvas): barras de vida con daño "fantasma", reloj, rounds ganados, nombres,
 * carteles del locutor (ROUND · ¡A PELEAR! · K.O.), combos, números de daño, menú de pausa y de fin de pelea, y la ayuda
 * de controles (se va sola al rato). Nada de paneles técnicos: eso queda para `?dev`.
 */
const css = `
#cfh{position:fixed;inset:0;z-index:60;pointer-events:none;user-select:none;font-family:"Baloo 2","Nunito",system-ui,sans-serif;color:#fff;
  --ink:#0d1024;--gold:#ffd23f;--amber:#ff9f1c;--hot:#ff3b5c;--leaf:#7bdc4f;--panel:rgba(13,16,36,.82)}
#cfh[hidden]{display:none}
#cfh .top{position:absolute;top:18px;left:50%;transform:translateX(-50%);width:min(1180px,95vw);display:grid;grid-template-columns:1fr auto 1fr;gap:14px;align-items:start}
#cfh .side{display:flex;flex-direction:column;gap:6px}
#cfh .side.r{align-items:flex-end}
#cfh .bar{position:relative;width:100%;height:30px;transform:skewX(-16deg);background:linear-gradient(#3a1022,#16060e 60%,#24091a);border:3px solid var(--ink);
  border-radius:7px;box-shadow:0 0 0 2px rgba(255,255,255,.9),0 0 0 5px rgba(13,16,36,.55),0 10px 24px rgba(13,16,36,.5),inset 0 2px 6px rgba(0,0,0,.6);overflow:hidden}
#cfh .bar::after{content:'';position:absolute;inset:0;z-index:2;pointer-events:none;background:repeating-linear-gradient(90deg,transparent 0 calc(10% - 2px),rgba(13,16,36,.38) calc(10% - 2px) 10%),linear-gradient(rgba(255,255,255,.42),rgba(255,255,255,0) 42%,rgba(0,0,0,0) 70%,rgba(0,0,0,.22))}
#cfh .bar i,#cfh .bar b{position:absolute;top:0;bottom:0;width:100%}
#cfh .side.l .bar i,#cfh .side.l .bar b{left:0;transform-origin:left}
#cfh .side.r .bar i,#cfh .side.r .bar b{right:0;transform-origin:right}
#cfh .bar b{background:linear-gradient(#ffffff,#ff7a8e 40%,var(--hot));transition:transform .55s cubic-bezier(.4,0,.2,1) .35s}
#cfh .bar i{background:linear-gradient(#fff9c4 0%,#ffe04a 30%,#ffb51f 62%,#f07a12 100%);box-shadow:inset 0 -7px 10px rgba(170,60,0,.4),inset 0 3px 0 rgba(255,255,255,.7);transition:transform .08s linear}
#cfh .side.r .bar i{background:linear-gradient(#e9ffc4 0%,#a8ec5a 32%,#5cc435 64%,#2f8f2a 100%);box-shadow:inset 0 -7px 10px rgba(20,80,10,.4),inset 0 3px 0 rgba(255,255,255,.7)}
#cfh .bar.low i{background:linear-gradient(#ffd0a8,#ff6a3c 45%,#e0241d);animation:cfh-low .5s ease-in-out infinite alternate}
#cfh .bar .shine{position:absolute;inset:0;background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.35) 45%,transparent 60%);background-size:300% 100%;animation:cfh-shine 3.2s linear infinite}
@keyframes cfh-low{to{filter:brightness(1.35)}}
#cfh .gauges{display:flex;gap:8px;width:100%;margin:6px 0 2px;transform:skewX(-16deg)}
#cfh .side.r .gauges{flex-direction:row-reverse}#cfh .side.r .gauge span{place-items:center end}
#cfh .gauge{position:relative;height:18px;border:2px solid var(--ink);border-radius:4px;background:linear-gradient(#0b0e22,#1c2150);box-shadow:0 0 0 2px rgba(255,255,255,.75),inset 0 2px 4px rgba(0,0,0,.6);overflow:hidden}
#cfh .gauge.pow{flex:1}
#cfh .gauge i{position:absolute;inset:0;transform-origin:left;transition:transform .1s linear}
#cfh .side.r .gauge i{transform-origin:right}
#cfh .gauge.pow i{background:linear-gradient(#d6f6ff,#45c3ff 40%,#3d6bff 70%,#7b3cff);box-shadow:inset 0 2px 0 rgba(255,255,255,.55)}
#cfh .gauge.pow.full i{background:linear-gradient(#ffe0ff,#ff5fd2 40%,#c02cff 75%,#6a1cff)}
#cfh .gauge.pow.full i{animation:cfh-pow .5s ease-in-out infinite alternate}
#cfh .gauge.pow::after{content:'';position:absolute;left:50%;top:-1px;bottom:-1px;width:3px;margin-left:-1.5px;background:#fff;box-shadow:0 0 0 1px var(--ink);z-index:1}
#cfh .gauge.pow.half,#cfh .gauge.pow.full{box-shadow:0 0 0 2px #fff,0 0 14px rgba(90,170,255,.9)}#cfh .gauge.pow.full{box-shadow:0 0 0 2px #fff,0 0 18px rgba(255,80,210,.95)}
@keyframes cfh-pow{from{filter:brightness(1)}to{filter:brightness(1.6) saturate(1.3)}}
#cfh .gauge span{position:absolute;inset:0;z-index:2;display:grid;place-items:center start;padding:0 14px;font:400 10px/1 "Bungee",Impact,sans-serif;letter-spacing:.1em;color:#fff;transform:skewX(16deg);
  text-shadow:1px 1px 0 var(--ink),-1px 1px 0 var(--ink),1px -1px 0 var(--ink),-1px -1px 0 var(--ink),0 2px 0 var(--ink),0 0 6px rgba(13,16,36,.9)}
#cfh .pop.power{font-size:44px;color:#fff3b0;-webkit-text-stroke-color:#a3420a}
@keyframes cfh-shine{from{background-position:120% 0}to{background-position:-120% 0}}
#cfh .meta{display:flex;align-items:center;gap:10px}
#cfh .face{width:48px;height:48px;border-radius:50%;background:#14172b center/cover;border:3px solid var(--ink);box-shadow:0 0 0 2px #fff,0 6px 16px rgba(13,16,36,.5);margin-top:-2px;display:none}#cfh .face.on{display:block;animation:cfh-pop .3s cubic-bezier(.2,1.6,.4,1) both}#cfh .side.l .face{border-color:var(--gold)}#cfh .side.r .face{border-color:var(--leaf)}
#cfh .side.r .meta{flex-direction:row-reverse}
#cfh .name{font:400 17px/1 "Bungee",Impact,sans-serif;letter-spacing:.04em;padding:6px 12px 5px;background:var(--panel);border-radius:6px;transform:skewX(-16deg);
  border-left:5px solid var(--gold);text-shadow:0 2px 0 var(--ink)}
#cfh .side.r .name{border-left:0;border-right:5px solid var(--leaf)}
#cfh .pips{display:flex;gap:6px}
#cfh .pips span{width:14px;height:14px;border-radius:50%;border:3px solid var(--ink);background:rgba(255,255,255,.35);box-shadow:0 0 0 2px rgba(255,255,255,.85)}
#cfh .pips span.on{background:radial-gradient(circle at 35% 35%,#fff6b0,var(--gold) 45%,var(--amber));box-shadow:0 0 0 2px #fff,0 0 12px var(--gold)}
#cfh .clock{min-width:78px;height:62px;display:grid;place-items:center;background:var(--panel);border:3px solid var(--ink);border-radius:12px;
  box-shadow:0 0 0 2px rgba(255,255,255,.85),0 8px 22px rgba(13,16,36,.45);font:400 34px/1 "Bungee",Impact,sans-serif;color:#fff;text-shadow:0 3px 0 var(--ink)}
#cfh .clock.hurry{color:var(--hot);animation:cfh-low .4s ease-in-out infinite alternate}
#cfh .clock{overflow:hidden}#cfh .clock span{display:block;animation:cfh-tick .32s cubic-bezier(.2,1.5,.4,1) both}#cfh .clock.hurry span{animation-duration:.45s;animation-name:cfh-tick-hot}
@keyframes cfh-tick{from{transform:translateY(-55%) scale(1.15);opacity:0}to{transform:none;opacity:1}}@keyframes cfh-tick-hot{0%{transform:scale(1.7)}100%{transform:none}}
#cfh .round{text-align:center;font:400 11px/1 "Bungee",sans-serif;letter-spacing:.12em;margin-top:6px;color:#fff;text-shadow:0 2px 0 var(--ink)}
#cfh .status{position:absolute;top:108px;font:800 15px/1 "Baloo 2",sans-serif;letter-spacing:.03em;display:flex;flex-direction:column;gap:6px}
#cfh .status.l{left:max(2.5vw,calc(50% - 590px))}#cfh .status.r{right:max(2.5vw,calc(50% - 590px));align-items:flex-end}
#cfh .status em{font-style:normal;padding:3px 10px;border-radius:999px;background:var(--panel);box-shadow:0 0 0 2px rgba(255,255,255,.7)}
#cfh .status em.bleed{color:#ff8fa0}#cfh .status em.dizzy{color:var(--gold)}#cfh .status em.shield{color:#aee8ff}
#cfh .combo{position:absolute;top:30%;font:400 46px/0.9 "Bungee",Impact,sans-serif;color:var(--gold);-webkit-text-stroke:2px var(--ink);text-shadow:0 5px 0 var(--ink),0 0 24px rgba(255,159,28,.6);opacity:0;transition:opacity .25s}
#cfh .combo small{display:block;font-size:18px;color:#fff;letter-spacing:.12em}
#cfh .combo.l{left:4vw;transform:rotate(-6deg)}#cfh .combo.r{right:4vw;text-align:right;transform:rotate(6deg)}
#cfh .combo.show{opacity:1;animation:cfh-pop .22s cubic-bezier(.2,1.6,.4,1)}
@keyframes cfh-pop{from{scale:1.6}to{scale:1}}
#cfh .ann{position:absolute;left:0;right:0;top:34%;text-align:center;pointer-events:none}
#cfh .ann h1{display:inline-block;margin:0;font:400 min(15vh,140px)/1 "Bungee",Impact,sans-serif;letter-spacing:.02em;
  background:linear-gradient(#fffbe0 10%,var(--gold) 45%,var(--amber) 80%);-webkit-background-clip:text;background-clip:text;color:transparent;
  -webkit-text-stroke:3px var(--ink);filter:drop-shadow(0 7px 0 var(--ink)) drop-shadow(0 0 28px rgba(255,180,40,.55));transform:skewX(-8deg)}
#cfh .ann h1.red{background-image:linear-gradient(#fff 5%,#ff8a8a 40%,#e0102c 85%)}
#cfh .ann h1.go{animation:cfh-in .45s cubic-bezier(.2,1.5,.4,1) both}
#cfh .ann p{margin:8px 0 0;font:400 min(4.2vh,34px)/1 "Bungee",sans-serif;color:#fff;text-shadow:0 4px 0 var(--ink),0 0 18px rgba(13,16,36,.5)}
@keyframes cfh-in{from{transform:skewX(-8deg) scale(2.4);opacity:0}to{transform:skewX(-8deg) scale(1);opacity:1}}
#cfh .pop{position:absolute;transform:translate(-50%,-50%);font:400 28px/1 "Bungee",Impact,sans-serif;color:#fff;-webkit-text-stroke:2px var(--ink);text-shadow:0 4px 0 var(--ink);white-space:nowrap;text-align:center}
#cfh .pop small{display:block;font-size:12px;letter-spacing:.1em;-webkit-text-stroke:0;color:var(--gold)}
#cfh .pop.heavy{font-size:40px;color:var(--gold)}
#cfh .pop.shout,#cfh .pop.whiff{z-index:3;font-size:58px;color:#ffe14d;-webkit-text-stroke:3px #b3121f;paint-order:stroke fill;text-shadow:0 5px 0 #5a0710,0 0 26px rgba(255,90,40,.7);animation:cfh-shout .45s cubic-bezier(.2,1.7,.4,1) both}#cfh .pop.pimba{color:#8fe9ff;-webkit-text-stroke-color:#0f3f7a;text-shadow:0 5px 0 #08224a,0 0 26px rgba(60,170,255,.7)}#cfh .pop.soplamoco{font-size:50px;color:#c5ff6e;-webkit-text-stroke-color:#24601a;text-shadow:0 5px 0 #123a0c,0 0 26px rgba(150,255,80,.6)}#cfh .pop.whiff{font-size:40px;color:#f2f2f2;-webkit-text-stroke:3px #3d3d55;text-shadow:0 4px 0 #1d1d2e;animation-name:cfh-whiff}@keyframes cfh-whiff{0%{transform:translate(-50%,-50%) scale(.3) rotate(10deg)}100%{transform:translate(-50%,-50%) scale(1) rotate(4deg)}}
@keyframes cfh-shout{0%{transform:translate(-50%,-50%) scale(.2) rotate(-14deg)}100%{transform:translate(-50%,-50%) scale(1) rotate(-6deg)}}#cfh .pop.hint{z-index:3;font:800 16px/1.2 "Nunito",sans-serif;-webkit-text-stroke:0;color:#fff;background:rgba(13,16,36,.75);padding:6px 12px;border-radius:999px;text-shadow:none;letter-spacing:.06em}#cfh .pop.cut{color:#ff9fb0}#cfh .pop.block{color:#aee8ff;font-size:20px}
#cfh .warn{position:absolute;top:120px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:6px;align-items:center;transition:opacity .6s}
#cfh .warn b{font:800 15px/1.2 "Baloo 2",sans-serif;padding:7px 16px;border-radius:999px;background:var(--panel);box-shadow:0 0 0 2px var(--gold)}
#cfh .keys{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);transition:opacity .8s,transform .8s}
#cfh .ctl,#cfh .mute{pointer-events:auto;display:flex;align-items:center;gap:8px;border:0;cursor:pointer;padding:9px 16px 8px;border-radius:12px;font:400 14px/1 "Bungee",Impact,sans-serif;letter-spacing:.05em;color:var(--ink);background:linear-gradient(#fff,#e6e8f5);box-shadow:0 0 0 3px var(--ink),0 5px 0 3px var(--ink);transition:transform .12s,filter .15s}
#cfh .ctl:hover,#cfh .mute:hover{transform:translateY(-2px);filter:brightness(1.05)}
#cfh .mute{position:absolute;right:22px;bottom:22px;font-size:12px;padding:8px 12px 7px}#cfh .mute .x{display:none}#cfh .mute.on{color:#fff;background:linear-gradient(#ff5b6e,#d3122c)}#cfh .mute.on .x{display:inline}#cfh .mute.on .w{display:none}
#cfh.presenting .mute{opacity:1!important}#cfh.presenting .ctl{pointer-events:none}
#cfh .keys.off{opacity:0;transform:translate(-50%,14px);pointer-events:none}#cfh .keys.off .ctl{pointer-events:none}#cfh .keys.mini:not(.off){opacity:.7;transform:translateX(-50%) scale(.85);transform-origin:50% 100%}
#cfh .intro{position:absolute;left:6vw;bottom:13vh;max-width:70vw;opacity:0;transform:translateX(-60px);transition:opacity .3s,transform .5s cubic-bezier(.2,1.4,.4,1);pointer-events:none}
#cfh .intro.r{left:auto;right:6vw;text-align:right;transform:translateX(60px)}
#cfh .intro.on{opacity:1;transform:none}#cfh .intro.on h1{animation:cfh-slam .42s cubic-bezier(.2,1.6,.35,1) both}@keyframes cfh-slam{0%{transform:scale(2.6) rotate(-4deg);opacity:0}60%{opacity:1}100%{transform:none}}#cfh .intro.vs{left:50%;right:auto;bottom:auto;top:50%;transform:translate(-50%,-50%) scale(.6);text-align:center}#cfh .intro.vs.on{transform:translate(-50%,-50%)}#cfh .intro.vs h1{font-size:clamp(70px,13vw,170px);color:#fff;text-shadow:0 8px 0 var(--ink),0 0 50px rgba(255,80,40,.8)}#cfh .bars{position:absolute;inset:0;pointer-events:none;z-index:2}#cfh .subs{position:absolute;left:50%;bottom:12.5vh;z-index:3;transform:translate(-50%,8px);max-width:min(760px,86vw);text-align:center;opacity:0;transition:opacity .45s,transform .6s cubic-bezier(.2,.8,.2,1);pointer-events:none}#cfh .subs.on{opacity:1;transform:translate(-50%,0)}#cfh .subs b{display:block;margin-bottom:6px;font:800 12px/1 "Nunito",sans-serif;letter-spacing:.22em;color:#9df06a;text-shadow:0 1px 0 #000}#cfh .subs span{font:800 clamp(18px,2.2vw,28px)/1.3 "Nunito",sans-serif;color:#fff;text-shadow:0 2px 0 #000,0 0 18px rgba(0,0,0,.9);letter-spacing:.02em}#cfh .intro,#cfh .skip{z-index:3}#cfh .bars:before,#cfh .bars:after{content:'';position:absolute;left:0;right:0;height:9vh;background:#05060c;transition:transform .5s cubic-bezier(.3,.7,.2,1);z-index:2}#cfh .bars:before{top:0;transform:translateY(-100%)}#cfh .bars:after{bottom:0;transform:translateY(100%)}#cfh.presenting .bars:before,#cfh.presenting .bars:after{transform:none}
#cfh .intro h1{margin:0;font:400 clamp(40px,7.4vw,96px)/.92 "Bungee",Impact,sans-serif;color:#ffe14d;-webkit-text-stroke:3px var(--ink);text-shadow:0 7px 0 var(--ink),0 0 34px rgba(255,159,28,.55)}
#cfh .intro.r h1{color:#9df06a;text-shadow:0 7px 0 var(--ink),0 0 34px rgba(80,200,60,.5)}
#cfh .intro p{margin:12px 0 0;font:800 clamp(14px,1.6vw,20px)/1.25 "Nunito",sans-serif;color:#fff;letter-spacing:.06em;text-shadow:0 2px 0 var(--ink),0 0 10px rgba(13,16,36,.6)}
#cfh .skip{position:absolute;right:22px;bottom:18px;font:800 12px/1 "Nunito",sans-serif;letter-spacing:.06em;color:rgba(255,255,255,.75);opacity:0;transition:opacity .3s}
#cfh.presenting .skip{opacity:1}
#cfh.presenting .top,#cfh.presenting .pad,#cfh.presenting .keys,#cfh.presenting .warn{opacity:0!important}
#cfh .pad{position:absolute;left:22px;bottom:22px;width:78px;height:146px;pointer-events:none}
#cfh .pad .cap{position:absolute;inset:0;border-radius:39px;overflow:hidden;background:linear-gradient(90deg,#e8ad2c,#f6cb43 38%,#fbe189 58%,#f0bb36);box-shadow:0 0 0 3px #fff,0 0 0 6px var(--ink),0 6px 0 6px var(--ink)}
#cfh .pad .ln{position:absolute;left:0;right:0;border-top:2px dashed rgba(13,16,36,.55)}
#cfh .pad .vl{position:absolute;top:19%;bottom:0;left:50%;border-left:2px dashed rgba(13,16,36,.55)}
#cfh .pad .hd{position:absolute;top:5%;left:0;right:0;text-align:center;font:800 9px/1 "Nunito",sans-serif;letter-spacing:.08em;color:rgba(13,16,36,.55)}
#cfh .pad .q{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font:400 18px/1 "Bungee",Impact,sans-serif;color:var(--ink)}
#cfh .pad .q small{font:800 8px/1 "Nunito",sans-serif;letter-spacing:.04em;opacity:.75}
#cfh .pad .q.empty{opacity:.28}
#cfh .pad .q.hit{animation:cfh-q .28s ease-out}
@keyframes cfh-q{0%{background:rgba(255,255,255,.85);transform:scale(1.15)}100%{background:transparent;transform:scale(1)}}
#cfh kbd{display:inline-block;min-width:22px;padding:2px 6px 1px;margin-right:4px;border-radius:6px;background:#fff;color:var(--ink);font:400 12px/1.4 "Bungee",sans-serif;text-align:center;box-shadow:0 3px 0 #9aa0c0}
#cfh .menu{position:absolute;inset:0;display:none;place-items:center;background:radial-gradient(ellipse at center,rgba(13,16,36,.35),rgba(13,16,36,.78));pointer-events:auto}
#cfh .menu.on{display:grid}
#cfh .card{min-width:min(420px,90vw);padding:26px 30px 24px;border-radius:20px;background:linear-gradient(#1b2048,#0d1024);box-shadow:0 0 0 3px #fff,0 0 0 7px var(--ink),0 30px 80px rgba(0,0,0,.5);text-align:center}
#cfh .card h2{margin:0 0 4px;font:400 44px/1 "Bungee",sans-serif;color:var(--gold);text-shadow:0 4px 0 #000}
#cfh .card p{margin:0 0 18px;font:700 16px/1.3 "Baloo 2",sans-serif;color:#cfd3f5}
#cfh .card button{display:block;width:100%;margin:10px 0 0;padding:12px 18px;border:0;border-radius:12px;cursor:pointer;font:400 17px/1 "Bungee",sans-serif;letter-spacing:.03em;
  color:var(--ink);background:linear-gradient(#fff7a8,var(--gold) 50%,var(--amber));box-shadow:0 5px 0 #a35a00;transition:transform .08s,filter .15s}
#cfh .card button.alt{color:#fff;background:linear-gradient(#3a4180,#262b5c);box-shadow:0 5px 0 #111433}
#cfh .card button:hover,#cfh .card button.sel{filter:brightness(1.12);transform:translateY(-2px)}
#cfh .card .grid{display:grid;grid-template-columns:auto auto;gap:6px 14px;text-align:left;margin:16px auto 0;font:700 14px/1.3 "Baloo 2",sans-serif;color:#e8eaff;width:max-content}
#cfh .flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none}
`;

export type MenuAction = 'resume' | 'again' | 'next' | 'exit';

export class FightHud {
  /** Qué luchador es el jugador de esta pantalla (contra un amigo, el invitado es el 1). */
  me: 0 | 1 = 0;
  readonly root: HTMLElement;
  private readonly style: HTMLStyleElement;
  private readonly fill: HTMLElement[];
  private readonly ghost: HTMLElement[];
  private readonly bars: HTMLElement[];
  private readonly pips: HTMLElement[];
  private readonly names: HTMLElement[];
  private readonly faces: HTMLElement[];
  private readonly status: HTMLElement[];
  private readonly combos: HTMLElement[];
  private readonly clock: HTMLElement;
  private readonly roundEl: HTMLElement;
  private readonly ann: HTMLElement;
  private readonly keys: HTMLElement;
  private readonly quads: Record<Quad, HTMLElement>;
  private readonly warn: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly flashEl: HTMLElement;
  private readonly pows: HTMLElement[];
  private comboT = [0, 0];
  private annT = 0;
  private menuSel = 0;
  private pops: { el: HTMLElement; life: number; x: number; y: number; dur: number; rise: number }[] = [];
  onMenu: (a: MenuAction) => void = () => {};
  /** Botón CONTROLES: abre la pausa con la lista de teclas. */
  onControls: () => void = () => {};
  /** Botón CENSURAR: calla las frases del villano (suena un pitido) y tapa sus subtítulos. */
  onCensor: (on: boolean) => void = () => {};
  censored = false;

  constructor(host: HTMLElement = document.body) {
    this.style = document.createElement('style');
    this.style.textContent = css;
    document.head.appendChild(this.style);
    const r = document.createElement('div');
    r.id = 'cfh';
    r.hidden = true;
    const side = (s: 'l' | 'r') => `<div class="side ${s}"><div class="bar"><b></b><i></i><div class="shine"></div></div><div class="gauges"><div class="gauge pow"><i></i><span>PODER</span></div></div><div class="meta"><i class="face"></i><div class="name"></div><div class="pips"></div></div></div>`;
    r.innerHTML = `<div class="top">${side('l')}<div><div class="clock">90</div><div class="round">ROUND 1</div></div>${side('r')}</div>
<div class="status l"></div><div class="status r"></div><div class="combo l"></div><div class="combo r"></div><div class="warn"></div>
<div class="ann"></div><div class="flash"></div>
<div class="keys"><button class="ctl" type="button"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>CONTROLES</button></div><button class="mute" type="button" title="Censurar al villano"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path class="w" d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/><path class="x" d="m16 9 6 6M22 9l-6 6"/></svg><span>CENSURAR</span></button>
<div class="pad"><div class="cap"><div class="ln" style="top:19%"></div><div class="ln" style="top:75%"></div><div class="vl"></div><div class="hd">cabeza</div>
<div class="q" data-q="LA" style="left:0;top:19%;width:50%;height:56%"></div><div class="q" data-q="RA" style="left:50%;top:19%;width:50%;height:56%"></div>
<div class="q" data-q="LL" style="left:0;top:75%;width:50%;height:25%"></div><div class="q" data-q="RL" style="left:50%;top:75%;width:50%;height:25%"></div></div></div>
<div class="bars"></div><div class="subs"><b></b><span></span></div><div class="intro"><h1></h1><p></p></div><div class="skip">cualquier tecla para saltear la presentación</div>
<div class="menu"><div class="card"></div></div>`;
    host.appendChild(r);
    this.root = r;
    const q = <T extends HTMLElement>(s: string): T => r.querySelector(s) as T;
    const qa = (s: string): HTMLElement[] => [...r.querySelectorAll<HTMLElement>(s)];
    this.bars = qa('.bar');
    this.fill = qa('.bar i');
    this.ghost = qa('.bar b');
    this.pips = qa('.pips');
    this.pows = qa('.gauge.pow');
    this.names = qa('.name');
    this.faces = qa('.face');
    this.status = [q('.status.l'), q('.status.r')];
    this.combos = [q('.combo.l'), q('.combo.r')];
    this.clock = q('.clock');
    this.roundEl = q('.round');
    this.ann = q('.ann');
    this.keys = q('.keys');
    this.quads = Object.fromEntries(qa('.pad .q').map((e) => [e.dataset.q!, e])) as Record<Quad, HTMLElement>;
    this.warn = q('.warn');
    this.menu = q('.menu');
    this.flashEl = q('.flash');
    q('.ctl').addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).blur();
      this.onControls();
    });
    q('.mute').addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).blur();
      this.setCensor(!this.censored);
      this.onCensor(this.censored);
    });
    this.menu.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('button')?.dataset.a as MenuAction | undefined;
      if (a) this.onMenu(a);
    });
  }

  /** Retrato de cada luchador (una foto de su cara sacada en la pelea). */
  portrait(i: 0 | 1, url: string): void {
    this.faces[i].style.backgroundImage = `url(${url})`;
    this.faces[i].classList.add('on');
  }

  show(names: [string, string], warnings: string[]): void {
    this.root.hidden = false;
    this.names[0].textContent = names[0];
    this.names[1].textContent = names[1];
    this.faces.forEach((f) => f.classList.remove('on'));
    for (const p of this.pips) p.innerHTML = '<span></span>'.repeat(FIGHT.roundsToWin);
    this.warn.innerHTML = warnings.map((w) => `<b>${w}</b>`).join('');
    this.warn.style.opacity = '1';
    window.setTimeout(() => (this.warn.style.opacity = '0'), 5200);
    this.keys.classList.remove('off', 'mini');
    this.hideMenu();
    this.ann.innerHTML = '';
    this.combos.forEach((c) => c.classList.remove('show'));
  }

  hide(): void {
    this.root.hidden = true;
    for (const p of this.pops) p.el.remove();
    this.pops = [];
  }

  /** Carteles grandes del locutor. */
  announce(text: string, sub = '', red = false, seconds = 1.4): void {
    this.ann.innerHTML = `<h1 class="go${red ? ' red' : ''}">${text}</h1>${sub ? `<p>${sub}</p>` : ''}`;
    this.annT = seconds;
  }

  flash(strength = 0.6): void {
    this.flashEl.style.transition = 'none';
    this.flashEl.style.opacity = String(strength);
    void this.flashEl.offsetWidth;
    this.flashEl.style.transition = 'opacity .35s ease-out';
    this.flashEl.style.opacity = '0';
  }

  /**
   * El chizito dividido como se armó (de frente): Q/W brazos izq/der, A/S piernas izq/der (pedazo chico), la cabeza sin botón. En
   * cada cuadrante, cuántas extremidades tiene (el botón las usa de a una); vacío = apagado.
   */
  pad(counts: Record<Quad, number>): void {
    for (const [qd, el] of Object.entries(this.quads) as [Quad, HTMLElement][]) {
      el.innerHTML = `${QUAD_KEYS[qd]}<small>${counts[qd] ? `${qd[1] === 'A' ? 'brazo' : 'pierna'}${counts[qd] > 1 ? `s ×${counts[qd]}` : ''}` : 'nada'}</small>`;
      el.classList.toggle('empty', !counts[qd]);
    }
  }

  padHit(qd: Quad): void {
    const el = this.quads[qd];
    el.classList.remove('hit');
    void el.offsetWidth;
    el.classList.add('hit');
  }

  /** Presentación de un luchador (nombre grande y una línea); `side` null la saca. */
  present(side: 0 | 1 | 2 | null, title = '', sub = ''): void {
    const el = this.root.querySelector<HTMLElement>('.intro')!;
    this.root.classList.toggle('presenting', side !== null);
    // La guía de teclas no aparece durante la presentación (vuelve al terminar).
    this.keys.classList.toggle('off', side !== null);
    if (side === null || !title) {
      // Sin título: la presentación sigue (barras de cine) pero sin cartel.
      el.classList.remove('on');
      el.dataset.side = '';
      return;
    }
    if (el.dataset.side === String(side) && el.classList.contains('on')) return;
    el.dataset.side = String(side);
    el.classList.remove('on', 'r', 'vs');
    if (side === 1) el.classList.add('r');
    if (side === 2) el.classList.add('vs');
    el.querySelector('h1')!.textContent = title;
    el.querySelector('p')!.textContent = sub;
    void el.offsetWidth;
    el.classList.add('on');
  }

  /** Pasados unos segundos, la guía de teclas queda chica y transparente (no desaparece: siempre se puede mirar). */
  /** Subtítulo de lo que dice un personaje (null lo saca). */
  setCensor(on: boolean): void {
    this.censored = on;
    this.root.querySelector('.mute')!.classList.toggle('on', on);
  }

  sub(who: string | null, text = ''): void {
    // Censurado: las palabras del villano salen como insultos de historieta.
    if (this.censored && who && who !== 'CONEXIÓN') text = text.replace(/[A-Za-zÁÉÍÓÚÑáéíóúñ]/g, (_, i: number) => '#@$%&*!'[i % 7]);
    const el = this.root.querySelector<HTMLElement>('.subs')!;
    if (!who) {
      el.classList.remove('on');
      return;
    }
    el.querySelector('b')!.textContent = who;
    el.querySelector('span')!.textContent = text;
    el.classList.add('on');
  }

  hideKeys(): void {
    this.keys.classList.add('mini');
  }

  /** Contador de golpes seguidos y, si los encadenó como combinación, su nombre (UNO-DOS, RÁFAGA…) en grande. */
  combo(side: 0 | 1, n: number, name: string | null = null): void {
    if (n < 2 && !name) return;
    const c = this.combos[side];
    c.innerHTML = name ? `${name}<small>${n >= 2 ? `${n} GOLPES` : 'COMBINACIÓN'}</small>` : `${n}<small>GOLPES</small>`;
    c.classList.remove('show');
    void c.offsetWidth;
    c.classList.add('show');
    this.comboT[side] = 1.3;
  }

  /** Número de daño que sube desde el punto de impacto (coordenadas de pantalla). */
  popup(x: number, y: number, text: string, label: string, cls: string): void {
    const el = document.createElement('div');
    el.className = `pop ${cls}`;
    el.innerHTML = `${text}${label ? `<small>${label}</small>` : ''}`;
    this.root.insertBefore(el, this.menu);
    // Las palabras de historieta quedan quietas y se leen (1,4 s); los números de daño suben rápido y se van.
    const word = /shout|whiff|hint/.test(cls);
    this.pops.push({ el, life: 0, x, y, dur: word ? 1.4 : 0.95, rise: word ? 10 : 70 });
    while (this.pops.length > 5) this.pops.shift()!.el.remove();
  }

  menuOpen(): boolean {
    return this.menu.classList.contains('on');
  }

  showMenu(title: string, sub: string, buttons: { a: MenuAction; label: string; alt?: boolean }[], withKeys = false): void {
    const card = this.menu.querySelector('.card') as HTMLElement;
    const grid = withKeys
      ? `<div class="grid"><span><kbd>Q</kbd> <kbd>W</kbd></span><span>brazos izquierdos / derechos (como armaste el chizito, de frente): cada toque usa el siguiente de ese lado</span><span><kbd>A</kbd> <kbd>S</kbd></span><span>piernas izquierdas / derechas (la parte de abajo del chizito)</span><span><kbd>Q</kbd> mantener</span><span>GOLPE CARGADO: el brazo tiembla atrás y pega hasta 1,6 veces; la carga completa rompe la guardia. Tocar y soltar = golpe RÁPIDO</span><span><kbd>↓</kbd>+<kbd>Q</kbd></span><span>GANCHO: levanta al rival y lo podés seguir en el aire (3 golpes)</span><span><kbd>↓</kbd>+<kbd>A</kbd></span><span>BARRIDA: lo tira al piso</span><span><kbd>→</kbd><kbd>→</kbd></span><span>PASITO (hacia atrás, esquiva)</span><span><kbd>D</kbd></span><span>guardia (mantener): los brazos tapan. Apretada justo antes del golpe = ATAJADA (no recibís nada y el otro queda abierto). 4 bloqueos seguidos rompen la guardia</span><span><kbd>E</kbd></span><span>PODER: con media barra, OLOR A PATA (marea y queda flotando); con la barra llena, la CALESITA DEL DOLOR (tres vueltas que pegan). Justo después de acertar sale como remate. La barra se llena pegando y recibiendo</span><span><kbd>V</kbd></span><span>cámara: lateral, aérea o primera persona</span><span><kbd>Esc</kbd></span><span>pausa</span><span><kbd>←</kbd><kbd>→</kbd></span><span>moverse</span><span><kbd>↑</kbd></span><span>saltar (brazo en el aire = en picada)</span><span><kbd>↓</kbd></span><span>agacharse</span><span><kbd>Q</kbd> <kbd>W</kbd></span><span>UNO-DOS: si la piña acierta, otra enseguida (con 3 brazos, RÁFAGA)</span><span><kbd>Q</kbd> <kbd>A</kbd></span><span>PIÑA Y PATADA: si la piña acierta, patada parado en la otra pierna</span><span><kbd>D</kbd> → <kbd>Q</kbd></span><span>CONTRA: bloqueá y soltá una piña enseguida</span><span>cabeza</span><span>lo que tenga arriba pesa y protege</span></div>`
      : '';
    card.innerHTML = `<h2>${title}</h2><p>${sub}</p>${buttons.map((b, i) => `<button data-a="${b.a}" class="${b.alt ? 'alt' : ''}${i === 0 ? ' sel' : ''}">${b.label}</button>`).join('')}${grid}`;
    this.menuSel = 0;
    this.menu.classList.add('on');
    this.ann.innerHTML = '';
    this.annT = 0;
    this.keys.classList.add('off');
  }

  hideMenu(): void {
    this.menu.classList.remove('on');
    this.keys.classList.remove('off');
  }

  /** Flechas ↑/↓ y Enter en los menús. */
  menuKey(code: string): void {
    const btns = [...this.menu.querySelectorAll<HTMLButtonElement>('button')];
    if (!btns.length) return;
    if (code === 'ArrowDown' || code === 'ArrowUp') {
      this.menuSel = (this.menuSel + (code === 'ArrowDown' ? 1 : btns.length - 1)) % btns.length;
      btns.forEach((b, i) => b.classList.toggle('sel', i === this.menuSel));
    }
    if (code === 'Enter' || code === 'Space' || code === 'KeyZ') this.onMenu(btns[this.menuSel].dataset.a as MenuAction);
  }

  update(m: Match, dt: number, project: (x: number, y: number) => [number, number] | null): void {
    m.f.forEach((f, i) => {
      const k = Math.max(0, f.hp) / FIGHT.hp;
      this.fill[i].style.transform = `scaleX(${k})`;
      this.ghost[i].style.transform = `scaleX(${k})`;
      this.bars[i].classList.toggle('low', k < 0.25);
      [...this.pips[i].children].forEach((p, n) => p.classList.toggle('on', n < m.wins[i]));
      // PODER: llena, titila (E lo suelta).
      (this.pows[i].firstElementChild as HTMLElement).style.transform = `scaleX(${f.meter / FIGHT.power.max})`;
      // Partida en dos (TU CHIZITO): media barra = el poder de lo que armó; llena = OLOR A PATA. Los rivales: un poder, lleno.
      const mine = f.model.power === 'queso';
      const full = f.meter >= FIGHT.power.max;
      const half = !full && mine && f.meter >= FIGHT.powerUse.half;
      const you = i === this.me;
      const label = full ? (mine ? 'CALESITA DEL DOLOR' : '¡PODER!') + (you ? ' · E' : '') : half ? `OLOR A PATA${you ? ' · E' : ''}` : 'PODER';
      this.pows[i].classList.toggle('full', full);
      this.pows[i].classList.toggle('half', half);
      const sp = this.pows[i].lastElementChild as HTMLElement;
      if (sp.textContent !== label) sp.textContent = label;
      const st: string[] = [];
      if (f.bleed.length) st.push(`<em class="bleed">SANGRA ×${f.bleed.length}</em>`);
      const sh = Object.keys(f.shields).filter((id) => !f.broken.includes(id));
      if (sh.length) st.push(`<em class="shield">ESCUDO ${sh.map((id) => '▮'.repeat(Math.max(0, f.shields[id]))).join(' ')}</em>`);
      const html = st.join('');
      if (this.status[i].innerHTML !== html) this.status[i].innerHTML = html;
    });
    const secs = Math.max(0, Math.ceil(m.timer / 60));
    const txt = String(secs);
    // Cada dígito nuevo entra cayendo desde arriba (un elemento nuevo reinicia la animación); en los últimos 10 s, golpea.
    if (this.clock.textContent !== txt) this.clock.innerHTML = `<span>${txt}</span>`;
    this.clock.classList.toggle('hurry', m.phase === 'fight' && secs <= 10);
    const rt = `ROUND ${m.round}`;
    if (this.roundEl.textContent !== rt) this.roundEl.textContent = rt;
    for (const s of [0, 1] as const) {
      if (this.comboT[s] > 0 && (this.comboT[s] -= dt) <= 0) this.combos[s].classList.remove('show');
    }
    if (this.annT > 0 && (this.annT -= dt) <= 0) this.ann.innerHTML = '';
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.life += dt;
      const sp = project(p.x, p.y);
      if (sp) {
        // Siempre dentro de la pantalla y por debajo de las barras de vida.
        const w = p.el.offsetWidth / 2 + 12;
        p.el.style.left = `${Math.min(innerWidth - w, Math.max(w, sp[0]))}px`;
        p.el.style.top = `${Math.max(140, sp[1] - p.life * p.rise)}px`;
      }
      p.el.style.opacity = String(Math.max(0, 1 - Math.max(0, p.life - (p.dur - 0.5)) / 0.5));
      if (p.life > p.dur) {
        p.el.remove();
        this.pops.splice(i, 1);
      }
    }
  }

  destroy(): void {
    this.root.remove();
    this.style.remove();
  }
}
