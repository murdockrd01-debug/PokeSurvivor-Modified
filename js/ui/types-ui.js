/* ============ types-ui.js — tabla de tipos, pensada para el dedo ============
 * Botón «Tipos» de la barra del menú (la app es táctil: nada depende del ratón).
 * Mismos multiplicadores que la tabla de la web (js/data/types.js): ×1,6 · ×0,6 · ×0,3.
 *
 * Tres pestañas:
 *   Tabla       la matriz 18×18. Toca una casilla (ese ataque contra ese tipo), o los
 *               nombres de las filas / columnas, que se quedan fijos al desplazarte.
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
  let tab = 'chart', atk = null, def = [];

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
  }

  function open() { render(); $('scr-types').classList.remove('hidden'); }
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
  function renderChart() {
    const head = ORDER.map(d => `<th class="c" data-d="${d}"><span class="tb" style="background:${COL[d]};color:${ink(COL[d])}">${NAME[d].slice(0, 3)}</span></th>`).join('');
    const rows = ORDER.map(a => `<tr><th class="r" data-a="${a}"><span class="tb" style="background:${COL[a]};color:${ink(COL[a])}">${NAME[a]}</span></th>${
      ORDER.map(d => { const m = cellMult(a, d), k = kind(m); return `<td class="${k}" data-a="${a}" data-d="${d}">${k ? x(m) : ''}</td>`; }).join('')}</tr>`).join('');
    $('ty-body').innerHTML = `
      <div class="ty-read" id="ty-read"></div>
      <p class="ty-help">Filas: ataque · columnas: quien lo recibe. Toca una casilla para ver el daño; toca los nombres para elegir tipos.</p>
      <div class="ty-wrap"><table class="ty-chart" id="ty-chart"><thead><tr><th class="corner"></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
      <div class="ty-legend"><span class="lg x16">×1,6 muy eficaz</span><span class="lg x06">×0,6 poco eficaz</span><span class="lg x03">×0,3 casi inmune</span><span class="lg">vacío = ×1</span></div>`;
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
