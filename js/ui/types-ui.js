/* ============ types-ui.js — tabla de tipos, pensada para el dedo ============
 * Botón «Tipos» de la barra del menú (la app es táctil: nada depende del ratón).
 * Mismos multiplicadores que la tabla de la web (js/data/types.js): ×1,6 · ×0,6 · ×0,3.
 *
 * Tres pestañas:
 *   Tabla       la matriz 18×18, ajustada para que quepa ENTERA en la pantalla del móvil
 *               (sin desplazarte). Cada casilla lleva un símbolo además del color:
 *               ▲ muy eficaz · ▼ poco eficaz · ✕ casi inmune. Toca una casilla (ese ataque
 *               contra ese tipo), o los nombres de filas / columnas. El detalle sale en un
 *               panel (arriba en vertical, al lado en horizontal). «Ampliar casillas» las
 *               deja grandes, con los multiplicadores a la vista (ahí sí se desplaza).
 *   Calculadora tipos grandes para tocar: uno de ataque y hasta DOS que lo reciben,
 *               y te dice el daño combinado (se multiplican, tope ×2,4 y mínimo ×0,3).
 *   Clima       qué hace cada clima del juego (datos de G.Weather).
 * La selección es la misma en Tabla y Calculadora. Con sólo defensores elegidos te
 * dice de qué son débiles y a qué resisten; con sólo ataque, contra quién va bien.
 */
G.TypesUI = (() => {
  const $ = G.UI.$;
  const ORDER = Object.keys(G.U.TYPE_NAME);
  const COL = G.U.TYPE_COLOR, NAME = G.U.TYPE_NAME;
  let tab = 'chart', atk = null, def = [], big = false;

  G.I18n.add({
    'Ampliar casillas': 'Enlarge cells', 'Reducir casillas': 'Shrink cells',
    'Filas: ataque · columnas: quien lo recibe. Toca una casilla o un nombre.': 'Rows: attack · columns: who receives it. Tap a cell or a name.'
  });

  // Estilos de la tabla (van aquí para que la tabla sea un solo archivo; se aplican por encima de css/style.css).
  const CSS = `
#ty-body .ty-split { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; }
#ty-body .ty-side { display: contents; }
#ty-body .ty-split .ty-read { order: 1; flex: none; height: 92px; overflow: auto; padding: 6px 8px; font-size: 13px; line-height: 1.55; }
#ty-body .ty-bar { order: 2; flex: none; display: flex; align-items: center; gap: 8px; }
#ty-body .ty-bar .ty-help { flex: 1; margin: 0; }
#ty-body .ty-bar .btn { flex: none; min-height: 36px; }
#ty-body .ty-wrap { order: 3; flex: 1; min-height: 0; margin: 0; overflow: hidden; display: flex; justify-content: center; align-items: flex-start; border: 0; background: none; }
#ty-body .ty-wrap.big { display: block; overflow: auto; border: 2px solid var(--edge-in); background: rgba(5,9,22,.6); }
#ty-body .ty-legend { order: 4; flex: none; margin: 0; gap: 4px; }
#ty-body .ty-legend .lg b { margin-right: 4px; }
#ty-body .ty-chart { --cell: 18px; flex: none; table-layout: fixed; border-collapse: separate; border-spacing: 1px; width: calc(32px + var(--cell) * 18 + 19px); }
#ty-body .ty-chart th.corner { width: 32px; }
#ty-body .ty-chart th.c { width: var(--cell); }
#ty-body .ty-chart th { position: static; background: none; }
#ty-body .ty-chart .tb { padding: 0; border-radius: 3px; height: 15px; line-height: 15px; font-size: 8.5px; letter-spacing: -.2px; overflow: hidden; }
#ty-body .ty-chart th.r .tb { height: var(--cell); line-height: var(--cell); font-size: min(10px, calc(var(--cell) * .5)); }
#ty-body .ty-chart td { min-width: 0; width: var(--cell); height: var(--cell); border-radius: 3px; font-size: calc(var(--cell) * .55); line-height: 1; overflow: hidden; }
#ty-body .ty-chart td b { font-weight: 700; }
#ty-body .ty-chart td i, #ty-body .ty-chart .fu { display: none; }
#ty-body .ty-wrap.big .ty-chart { table-layout: auto; width: auto; border-spacing: 3px; }
#ty-body .ty-wrap.big .ty-chart th { position: sticky; z-index: 2; background: #0c1330; }
#ty-body .ty-wrap.big .ty-chart .tb { padding: 7px; height: auto; line-height: normal; font-size: 11px; letter-spacing: 0; }
#ty-body .ty-wrap.big .ty-chart th.c .tb { min-width: 38px; }
#ty-body .ty-wrap.big .ty-chart td { min-width: 46px; width: auto; height: 44px; font-size: 12px; border-radius: 6px; }
#ty-body .ty-wrap.big .ty-chart td b { display: block; font-size: 10px; opacity: .8; }
#ty-body .ty-wrap.big .ty-chart td i { display: block; font-style: normal; }
#ty-body .ty-wrap.big .ty-chart .ab { display: none; }
#ty-body .ty-wrap.big .ty-chart .fu { display: inline; }
@media (min-width: 700px) {
  #ty-body .ty-split { flex-direction: row-reverse; }
  #ty-body .ty-side { display: flex; flex-direction: column; gap: 6px; flex: none; width: 270px; overflow: auto; }
  #ty-body .ty-split .ty-read { height: auto; flex: 1; min-height: 110px; }
  #ty-body .ty-wrap { min-width: 0; }
}`;
  { const st = document.createElement('style'); st.id = 'ty-chart-css'; st.textContent = CSS; document.head.appendChild(st); }

  const num = v => String(Math.round(v * 100) / 100).replace('.', G.I18n.lang === 'en' ? '.' : ',');
  const x = v => '×' + num(v);
  const chip = t => `<span class="type" style="background:${COL[t]}">${NAME[t]}</span>`;
  const cellMult = (a, d) => G.Types.mult(a, [d]);
  const kind = m => m > 1.05 ? 'x16' : m < 0.35 ? 'x03' : m < 0.95 ? 'x06' : '';
  // Texto oscuro sobre colores claros y blanco sobre los oscuros.
  const ink = hex => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) > 150 ? '#10131d' : '#fff'; };

  function init() {
    const b = $('btn-types');
    b.innerHTML = G.Icons.html('cards', 18) + ' <span>Tipos</span>';
    b.onclick = open;
    $('ty-close').onclick = close;
    $('ty-tabs').querySelectorAll('[data-t]').forEach(t => {
      t.onclick = () => { tab = t.dataset.t; G.Audio.sfx('click'); render(); };
    });
    addEventListener('resize', fit);
  }

  function open() { render(); $('scr-types').classList.remove('hidden'); fit(); }
  function close() { $('scr-types').classList.add('hidden'); }

  function render() {
    $('ty-tabs').querySelectorAll('[data-t]').forEach(t => t.classList.toggle('on', t.dataset.t === tab));
    if (tab === 'wx') renderWeather(); else if (tab === 'calc') renderCalc(); else renderChart();
  }

  // ---------------- resultado (común a Tabla y Calculadora) ----------------
  const verdict = m => m > 1.05 ? '<b class="ok">Muy eficaz</b>' : m < 0.95 ? '<b class="bad">Poco eficaz</b>' : '<b>Daño normal</b>';
  const list = (label, arr) => arr.length ? `<div class="ty-line"><span class="lbl">${label}</span>${arr.map(([t, m]) => `${chip(t)}<i>${x(m)}</i>`).join(' ')}</div>` : '';

  function readout() {
    const clear = (atk || def.length) ? '<button class="btn small ty-clear" id="ty-clear">Limpiar</button>' : '';
    if (atk && def.length) {
      const parts = def.map(d => cellMult(atk, d));
      const raw = parts.reduce((a, b) => a * b, 1), m = G.Types.mult(atk, def);
      const how = def.length === 2
        ? `<span class="ty-how">${parts.map(x).join(' · ')} = ${x(raw)}${m !== raw ? ` → <span>${m > raw ? 'mínimo' : 'tope'}</span> ${x(m)}` : ''}</span>` : '';
      return `<div class="ty-line main">${chip(atk)}<span>contra</span>${def.map(chip).join('')}<span class="big">${x(m)}</span>${verdict(m)}${how}${clear}</div>`;
    }
    if (atk) {
      const all = ORDER.map(d => [d, cellMult(atk, d)]);
      return `<div class="ty-line main"><span>Ataque</span>${chip(atk)}${clear}</div>` +
        list('Muy eficaz contra', all.filter(([, m]) => m > 1.05)) +
        list('Poco eficaz contra', all.filter(([, m]) => m < 0.95 && m >= 0.35)) +
        list('Casi inmunes', all.filter(([, m]) => m < 0.35));
    }
    if (def.length) {
      const all = ORDER.map(a => [a, G.Types.mult(a, def)]);
      return `<div class="ty-line main"><span>Defiende</span>${def.map(chip).join('')}${clear}</div>` +
        list('Débil a', all.filter(([, m]) => m > 1.05).sort((p, q) => q[1] - p[1])) +
        list('Resiste', all.filter(([, m]) => m < 0.95 && m >= 0.35).sort((p, q) => p[1] - q[1])) +
        list('Casi inmune a', all.filter(([, m]) => m < 0.35));
    }
    return '<span class="ty-hint">Toca un tipo de ataque y uno o dos tipos que lo reciben para ver el daño.</span>';
  }

  function pickAtk(t) { atk = atk === t ? null : t; }
  function pickDef(t) { def = def.includes(t) ? def.filter(d => d !== t) : [...def, t].slice(-2); }
  function wireClear(after) {
    const c = $('ty-clear');
    if (c) c.onclick = () => { atk = null; def = []; G.Audio.sfx('click'); after(); };
  }

  // ---------------- Tabla ----------------
  const SYM = { x16: '▲', x06: '▼', x03: '✕' };
  const abbr = t => G.T(NAME[t]).slice(0, 3);

  function renderChart() {
    const tag = (t, short) => `<span class="tb" style="background:${COL[t]};color:${ink(COL[t])}">${short ? `<span class="ab">${abbr(t)}</span><span class="fu">${NAME[t]}</span>` : abbr(t)}</span>`;
    const head = ORDER.map(d => `<th class="c" data-d="${d}">${tag(d)}</th>`).join('');
    const rows = ORDER.map(a => `<tr><th class="r" data-a="${a}">${tag(a, true)}</th>${
      ORDER.map(d => { const m = cellMult(a, d), k = kind(m); return `<td class="${k}" data-a="${a}" data-d="${d}">${k ? `<b>${SYM[k]}</b><i>${x(m)}</i>` : ''}</td>`; }).join('')}</tr>`).join('');
    $('ty-body').innerHTML = `
      <div class="ty-split">
        <div class="ty-side">
          <div class="ty-read" id="ty-read"></div>
          <div class="ty-bar"><p class="ty-help">Filas: ataque · columnas: quien lo recibe. Toca una casilla o un nombre.</p><button class="btn small" id="ty-zoom"></button></div>
          <div class="ty-legend"><span class="lg x16"><b>▲</b><span>×1,6 muy eficaz</span></span><span class="lg x06"><b>▼</b><span>×0,6 poco eficaz</span></span><span class="lg x03"><b>✕</b><span>×0,3 casi inmune</span></span><span class="lg"><span>vacío = ×1</span></span></div>
        </div>
        <div class="ty-wrap${big ? ' big' : ''}" id="ty-wrap"><table class="ty-chart" id="ty-chart"><thead><tr><th class="corner"></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
      </div>`;
    const zoom = () => { $('ty-zoom').textContent = big ? 'Reducir casillas' : 'Ampliar casillas'; };
    zoom();
    $('ty-zoom').onclick = () => {
      big = !big; G.Audio.sfx('click');
      $('ty-wrap').classList.toggle('big', big);
      zoom(); fit();
    };
    $('ty-chart').onclick = e => {
      const el = e.target.closest('td, th');
      if (!el || el.classList.contains('corner')) return;
      if (el.tagName === 'TD') { atk = el.dataset.a; def = [el.dataset.d]; }
      else if (el.classList.contains('r')) pickAtk(el.dataset.a);
      else pickDef(el.dataset.d);
      G.Audio.sfx('click');
      paintChart();
    };
    paintChart();
    fit();
  }

  /** Tamaño de casilla para que las 18 columnas y filas quepan enteras (sin desplazarse). */
  function fit() {
    const wrap = $('ty-wrap'), tbl = $('ty-chart');
    if (!wrap || !tbl || big) { if (wrap) wrap.style.overflow = ''; return; }
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    const c = Math.floor(Math.min((w - 32 - 19) / 18, (h - 15 - 19) / 18));
    tbl.style.setProperty('--cell', Math.max(13, Math.min(34, c)) + 'px');
    wrap.style.overflow = c < 13 ? 'auto' : '';      // pantalla muy baja: que se pueda desplazar
  }

  function paintChart() {
    $('ty-chart').querySelectorAll('[data-a], [data-d]').forEach(el => {
      el.classList.toggle('sa', !!atk && el.dataset.a === atk);
      el.classList.toggle('sd', def.length > 0 && def.includes(el.dataset.d));
    });
    $('ty-read').innerHTML = readout();
    wireClear(paintChart);
  }

  // ---------------- Calculadora ----------------
  function renderCalc() {
    const btns = (cls) => ORDER.map(t => `<button class="ty-btn ${cls}" data-t="${t}" style="background:${COL[t]};color:${ink(COL[t])}">${NAME[t]}</button>`).join('');
    $('ty-body').innerHTML = `
      <div class="ty-calc">
        <div class="ty-col"><h3>Ataque</h3><div class="ty-btns" id="ty-atk">${btns('a')}</div></div>
        <div class="ty-mid"><div class="ty-read" id="ty-read"></div></div>
        <div class="ty-col"><h3>Defiende (hasta 2)</h3><div class="ty-btns" id="ty-def">${btns('d')}</div></div>
      </div>`;
    $('ty-atk').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { pickAtk(b.dataset.t); G.Audio.sfx('click'); paintCalc(); } };
    $('ty-def').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { pickDef(b.dataset.t); G.Audio.sfx('click'); paintCalc(); } };
    paintCalc();
  }

  function paintCalc() {
    $('ty-atk').querySelectorAll('[data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === atk));
    $('ty-def').querySelectorAll('[data-t]').forEach(b => b.classList.toggle('on', def.includes(b.dataset.t)));
    $('ty-read').innerHTML = readout();
    wireClear(paintCalc);
  }

  // ---------------- Clima ----------------
  function renderWeather() {
    const cards = Object.values(G.Weather.KINDS).map(k => {
      const fx = Object.entries(k.mult).map(([t, m]) => `${chip(t)}<i class="${m > 1 ? 'ok' : 'bad'}">${x(m)}</i>`).join(' ');
      const extra = (k.safe ? `<div class="sub">Los demás pierden un poco de vida.</div>` : '') + (k.slow ? `<div class="sub">Todo va algo más lento.</div>` : '');
      return `<div class="ty-wx"><div class="ico" style="background:${k.color}33">${G.Icons.html(k.icon, 32)}</div>
        <div class="txt"><div class="nm">${k.name}</div><div class="ds">${fx}</div>${extra}</div></div>`;
    }).join('');
    $('ty-body').innerHTML = `
      <p class="ty-help">De vez en cuando (desde el minuto 2) llega un clima que dura cerca de un minuto. Cambia el daño según el tipo del ataque, para ti y para los enemigos.</p>
      <div class="ty-pane"><div class="ty-wxs">${cards}</div></div>`;
  }

  return { init, open, close };
})();
