/* ============ roguelike.js — Modo Roguelike (la torre) y cartas de Regla ============
 * Este archivo trae DOS cosas (van juntas para poder actualizarlas de una vez):
 *
 * 1) G.Roguelike — el modo de la torre (botón "Modo Roguelike" del menú, sólo en solitario).
 *    La mecánica es la de siempre, con pisos por encima:
 *      - Al empezar eliges la DIFICULTAD (Fácil, Normal, Difícil, ver DIFFS). Cada una
 *        cambia lo flojos que son los enemigos al principio, lo deprisa que suben,
 *        cuántos pisos tiene la torre y el premio final.
 *      - Cada piso dura FLOOR_LEN segundos. Al pasar al siguiente sale el aviso
 *        «Piso N/total», te curas un poco y los enemigos son algo más duros y numerosos.
 *      - Cada BOSS_EVERY pisos aparece un jefe (en vez de los del reloj normal).
 *      - En el ÚLTIMO piso te espera un legendario (distinto cada partida). Si lo
 *        derrotas ganas la torre: premio de tickets y monedas según la dificultad.
 *      - Cada CARD_EVERY pisos superados, tres cartas de rareza a elegir (Común, Rara,
 *        Épica, Legendaria), además de las cartas de nivel de siempre. Cuanto más alto
 *        el piso, más fácil que salgan las mejores. En un piso de jefe siempre sale
 *        al menos una épica o mejor, y cada RULE_EVERY pisos una de las tres es una
 *        carta de Regla.
 *    Una partida de este modo no cuenta para los récords ni para el ranking.
 *
 * 2) G.Relics — las cartas de REGLA, que valen en los DOS modos. Cambian cómo se juega
 *    (explosiones, rayos, escudos...), no sólo los números. Se pueden subir hasta nivel 3.
 *      - Modo Roguelike: salen en las cartas de piso.
 *      - Modo normal: al derrotar a un jefe ganas una; sale entre las cartas de tu
 *        próximo nivel.
 *    Para no tocar otros archivos, se "enganchan" al juego al cargar (ver install()):
 *    reparten las cartas (G.LevelUp.offer), cuentan las bajas (G.Progress.kill), miran
 *    los golpes (Player.hurt / Enemy.hurt), se guardan con la partida (Player.exportRun)
 *    y piden la dificultad antes de empezar (G.Flow.play).
 *
 * Todos los números están aquí arriba para equilibrarlos.
 */
G.Roguelike = (() => {
  const FLOOR_LEN = 75;                // segundos por piso
  const CARD_EVERY = 1;                // cartas de rareza cada N pisos superados
  const BOSS_EVERY = 5;                // un jefe cada N pisos
  const RULE_EVERY = 3;                // una carta de Regla entre las del piso cada N pisos

  // Dificultades. 1 = como la carrera normal.
  //   base  = [vida, daño, cantidad] de los enemigos en el piso 1
  //   per   = lo que suben esos tres por cada piso
  //   heal  = vida que recuperas al pasar de piso (fracción de la máxima)
  //   boss  = [vida, daño] del legendario del último piso
  const DIFFS = [
    { id: 'easy', name: 'Fácil', floors: 10, desc: 'Enemigos flojos y pocos. Para aprender la torre.',
      base: [0.55, 0.5, 0.55], per: [0.04, 0.02, 0.02], heal: 0.4, boss: [9000, 34], prize: { tickets: 3, coins: 150 } },
    { id: 'normal', name: 'Normal', floors: 15, desc: 'Sube despacio y pide buenas cartas.',
      base: [0.65, 0.6, 0.65], per: [0.05, 0.03, 0.03], heal: 0.35, boss: [16000, 46], prize: { tickets: 6, coins: 400 } },
    { id: 'hard', name: 'Difícil', floors: 20, desc: 'Como la carrera normal desde el primer piso, y sube rápido.',
      base: [1, 1, 1], per: [0.08, 0.05, 0.05], heal: 0.2, boss: [26000, 60], prize: { tickets: 12, coins: 1000 } }
  ];
  const BY = {};
  for (const d of DIFFS) BY[d.id] = d;

  let diffId = 'normal';
  let active = false, floor = 1, due = 0, bossDue = 0;
  let t0 = 0, finalDue = false, finalE = null, finalT = 0, won = false;

  const D = () => BY[diffId] || BY.normal;
  const floorAt = t => Math.min(D().floors, 1 + Math.floor(Math.max(0, t) / FLOOR_LEN));
  const pct = x => Math.round(x * 100);

  // n = cuántas mejoras trae la carta, m = lo fuerte que es cada una.
  const RARITY = [
    { id: 'common', name: 'Común',      color: '#9fb1c9', n: 1, m: 1,   w: f => Math.max(18, 64 - 2.5 * f) },
    { id: 'rare',   name: 'Rara',       color: '#4da3ff', n: 1, m: 1.8, w: () => 28 },
    { id: 'epic',   name: 'Épica',      color: '#b36bff', n: 2, m: 1.5, w: f => Math.min(30, 6 + 1.2 * f) },
    { id: 'legend', name: 'Legendaria', color: '#ffb62e', n: 3, m: 2,   w: f => Math.min(14, 1 + 0.45 * f) }
  ];

  const EFFECTS = [
    { id: 'atk', icon: 'fist',   title: 'Potencia',    line: m => `+${pct(0.08 * m)}% de daño`,
      apply: (p, m) => { p.atkMul *= 1 + 0.08 * m; } },
    { id: 'aspd', icon: 'clock', title: 'Reflejos',    line: m => `+${pct(0.07 * m)}% de velocidad de ataque`,
      apply: (p, m) => { p.cdMul = Math.max(0.35, p.cdMul / (1 + 0.07 * m)); } },
    { id: 'spd', icon: 'boot',   title: 'Carrera',     line: m => `+${pct(0.04 * m)}% de velocidad de movimiento`,
      apply: (p, m) => { p.spdMul = Math.min(2.2, p.spdMul * (1 + 0.04 * m)); } },
    { id: 'hp', icon: 'heart',   title: 'Vigor',       line: m => `+${Math.round(15 * m)} de vida máxima`,
      apply: (p, m) => p.addMaxHp(Math.round(15 * m)) },
    { id: 'def', icon: 'shield', title: 'Coraza',      line: m => `+${(2.5 * m).toFixed(1)}% de reducción de daño`,
      apply: (p, m) => { p.dmgReduce = Math.min(0.7, p.dmgReduce + 0.025 * m); } },
    { id: 'rgn', icon: 'sprout', title: 'Síntesis',    line: m => `+${(0.5 * m).toFixed(1)} de vida por segundo`,
      apply: (p, m) => { p.regenFlat += 0.5 * m; } },
    { id: 'mag', icon: 'magnet', title: 'Imán',        line: m => `+${pct(0.15 * m)}% de radio de recogida`,
      apply: (p, m) => { p.magnet = Math.min(78 * 4, p.magnet * (1 + 0.15 * m)); } },
    { id: 'xp', icon: 'book',    title: 'Aprendizaje', line: m => `+${pct(0.05 * m)}% de experiencia`,
      apply: (p, m) => { p.xpMul = Math.min(4, p.xpMul * (1 + 0.05 * m)); } }
  ];

  function reset(on, t = 0) {
    ensure();
    active = !!on; t0 = t;
    floor = active ? floorAt(t) : 1;
    due = 0; bossDue = 0; won = false; finalE = null; finalT = 0;
    finalDue = active && floor >= D().floors;       // partida recuperada ya en el piso final
    G.Relics.reset();
  }

  /** Cada fotograma: ¿hemos pasado de piso? ¿vive el legendario final? */
  function update(dt, t) {
    G.Relics.update(dt);
    if (!active) return;
    const f = floorAt(t);
    while (floor < f) {
      floor++;
      if ((floor - 1) % CARD_EVERY === 0) due++;
      const last = floor >= D().floors;
      if (last) finalDue = true; else if (floor % BOSS_EVERY === 0) bossDue++;
      G.Spawner.say(last ? '¡Piso final! Algo te espera arriba…' : 'Piso ' + floor + '/' + D().floors, 2.8, true);
      G.Audio.sfx('select');
      const pl = G.Game.player;
      if (pl && !pl.dead) pl.heal(Math.round(pl.maxHp * D().heal));
    }
    finalTick(dt);
  }

  // ---------------- el legendario del último piso ----------------
  function spawnFinal() {
    const pl = G.Game.player;
    if (!pl || pl.dead || G.Rift.inArena || G.Judgment.active) return false;     // espera a que se pueda
    const d = D();
    const pool = G.DEX.filter(p => p.leg && G.SPRITE_META[p.dex]);
    if (!pool.length) return false;
    const mon = G.U.pick(pool);
    const def = {
      dex: mon.dex, name: mon.name, hp: d.boss[0], dmg: d.boss[1], xp: 2000,
      spd: Math.round(G.U.clamp(48 + (mon.spd - 78) * 0.6, 48, 105)),
      behavior: mon.types.some(x => ['psychic', 'electric', 'ghost', 'fairy', 'fire', 'water', 'ice', 'dragon'].includes(x)) ? 'ranged' : 'charger',
      shotDmg: Math.round(d.boss[1] * 0.5), shotCd: 0.9, range: 300
    };
    const a = Math.random() * 6.2832, r = G.Camera.outerRadius() + 40;
    const e = new G.Enemy(def, pl.x + Math.cos(a) * r, pl.y + Math.sin(a) * r * 0.9, { hp: 1, spd: 1, dmg: 1 }, true);
    G.EnemyMgr.add(e);
    finalE = e;
    G.Spawner.say('¡' + e.name + ' guarda lo más alto de la torre!', 4, true);
    G.Camera.kick(1.1);
    G.Audio.sfx('boss');
    return true;
  }

  function finalTick(dt) {
    if (won) return;
    if (finalDue && spawnFinal()) finalDue = false;
    if (!finalE) return;
    if (finalE.dead) { victory(); return; }
    // Si el legendario desapareció sin morir (p. ej. al volver de una grieta), vuelve a salir.
    if ((finalT -= dt) <= 0) {
      finalT = 1;
      if (!G.Rift.inArena && !G.Judgment.active && !G.EnemyMgr.all().includes(finalE)) { finalE = null; finalDue = true; }
    }
  }

  function victory() {
    won = true;
    const d = D(), pl = G.Game.player;
    if (pl) { pl.t1 += d.prize.tickets; pl.coins += d.prize.coins; pl.invuln = 5; }
    G.Spawner.say('¡Victoria! Has conquistado la torre', 4, true);
    G.Audio.sfx('levelup');
    setTimeout(() => {
      if (G.Game.state === 'over' || G.Game.state === 'ui') return;
      G.Game.quit();                         // cierra la partida y enseña el resumen…
      const en = G.I18n.lang === 'en';
      const title = document.getElementById('over-title');
      if (title) title.textContent = en ? 'Victory!' : '¡Victoria!';
      const stats = document.getElementById('over-stats');   // …al que le ponemos el título y el premio
      if (stats) stats.insertAdjacentHTML('afterbegin', `<div style="grid-column:1/-1;text-align:center" class="gold">${
        en ? `Tower ${G.T(d.name)} conquered · +${d.prize.tickets} prize tickets` : `Torre ${d.name} conquistada · +${d.prize.tickets} tickets de premio`}</div>`);
    }, 2800);
  }

  // ---------------- cartas de rareza ----------------
  function rollRarity(f) {
    const ws = RARITY.map(r => Math.max(0, r.w(f)));
    let x = Math.random() * ws.reduce((a, b) => a + b, 0), i = 0;
    while (i < RARITY.length - 1 && (x -= ws[i]) > 0) i++;
    return RARITY[i];
  }

  /** Tres cartas de rareza para el piso actual. */
  function offer(pl, n = 3) {
    const cleared = Math.max(1, floor - 1);
    const rar = [];
    for (let i = 0; i < n; i++) rar.push(rollRarity(cleared));
    // Piso de jefe: al menos una épica o mejor.
    if (floor % BOSS_EVERY === 0 && !rar.some(r => r.id === 'epic' || r.id === 'legend')) rar[0] = RARITY[2];
    const cards = rar.map((r, i) => {
      const fx = G.U.pickN(EFFECTS, r.n);
      return {
        w: 1, type: 'rogue', key: 'rogue:' + i, rarity: r.id,
        icon: fx[0].icon, color: r.color, tag: r.name,
        title: fx.map(e => e.title).join(' + '),
        desc: fx.map(e => e.line(r.m)).join('<br>'),
        apply: p => { for (const e of fx) e.apply(p, r.m); }
      };
    });
    // Cada cierto número de pisos (y en los de jefe), una de las tres es una carta de Regla.
    if (floor % RULE_EVERY === 0 || floor % BOSS_EVERY === 0) {
      const rc = G.Relics.rules(pl, 1)[0];
      if (rc) cards[cards.length - 1] = rc;
    }
    return cards;
  }

  /** ¿Toca un jefe de piso? (lo llama el spawner; gasta el aviso) */
  function takeBoss() {
    if (!active || bossDue <= 0) return false;
    bossDue--;
    return true;
  }

  /** Lo que el guardado a medias necesita recordar (extra = 1 si hay unas cartas abiertas sin elegir). */
  function exportRun(extra = 0) { return { due: due + (extra ? 1 : 0), bossDue, diff: diffId, finalDue: finalDue || (!!finalE && !won) }; }
  function importRun(s) {
    if (!s) return;
    if (BY[s.diff]) diffId = s.diff;
    floor = floorAt(t0);                                  // con la dificultad que tenía la partida
    due = Math.max(0, s.due | 0);
    bossDue = Math.max(0, s.bossDue | 0);
    finalDue = !!s.finalDue || floor >= D().floors;
  }

  const k = i => active ? D().base[i] + D().per[i] * (floor - 1) : 1;

  // ---------------- elegir dificultad ----------------
  const CSS = `
#scr-rogue-diff .rg-box { width: min(480px, 100%); display: flex; flex-direction: column; gap: 10px; }
#scr-rogue-diff .rg-help { margin: 0; font-size: 13px; color: var(--muted); line-height: 1.4; }
#scr-rogue-diff .rg-list { display: flex; flex-direction: column; gap: 8px; }
#scr-rogue-diff .rg-d { text-align: left; min-height: 64px; padding: 10px 14px; font-size: 18px; }
#scr-rogue-diff .rg-d small { display: block; margin-top: 2px; font-size: 13px; font-weight: 400; opacity: .8; }
#scr-rogue-diff .rg-d.on { outline: 3px solid var(--gold); }`;

  /** Pregunta la dificultad y, al elegirla, llama a cb(). */
  function pick(cb) {
    let el = document.getElementById('scr-rogue-diff');
    if (!el) {
      const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
      el = document.createElement('section');
      el.id = 'scr-rogue-diff'; el.className = 'scr dim hidden';
      el.innerHTML = `<div class="box rg-box"><h2>Modo Roguelike</h2>
        <p class="rg-help">Sube la torre piso a piso. En el último piso te espera un legendario: derrótalo para ganar.</p>
        <div class="rg-list">${DIFFS.map(d => `<button class="btn rg-d" data-d="${d.id}"><b>${d.name}</b> · <span>${d.floors} pisos</span><small>${d.desc}</small></button>`).join('')}</div>
        <button class="btn small ghost" id="rg-cancel">Cancelar</button></div>`;
      const host = document.getElementById('scr-types');
      (host ? host.parentNode : document.body).appendChild(el);
    }
    el.querySelectorAll('.rg-d').forEach(b => {
      b.classList.toggle('on', b.dataset.d === diffId);
      b.onclick = () => { diffId = b.dataset.d; G.Audio.sfx('confirm'); el.classList.add('hidden'); cb(); };
    });
    document.getElementById('rg-cancel').onclick = () => el.classList.add('hidden');
    el.classList.remove('hidden');
  }

  // ---------------- enganches (se instalan cuando el juego ya está cargado) ----------------
  let installed = false;
  function ensure() {
    if (installed) return;
    if (!(G.Progress && G.Flow && G.LevelUp && G.Player && G.Enemy && G.EnemyMgr && G.Relics)) return;
    installed = true;
    G.Relics.install();
    const F = G.Flow, play = F.play;
    F.play = function (mode) {
      if (mode === 'rogue') { pick(() => play.apply(F, arguments)); return; }
      return play.apply(this, arguments);
    };
  }
  if (document.readyState === 'complete') setTimeout(ensure, 0);
  else { document.addEventListener('DOMContentLoaded', ensure); addEventListener('load', ensure); }

  return {
    reset, update, offer, takeBoss, exportRun, importRun, pick,
    get active() { return active; },
    get floor() { return floor; },
    get due() { return due; },
    set due(v) { due = v; },
    get diff() { return D(); },
    hpK: () => k(0), dmgK: () => k(1), rateK: () => k(2),
    DIFFS, FLOOR_LEN, CARD_EVERY, BOSS_EVERY
  };
})();

/* ============ G.Relics — cartas de Regla (valen en el modo normal y en el Roguelike) ============
 * Cada regla tiene nivel 1–3 (si la vuelves a coger, sube). Sólo en solitario.
 */
G.Relics = (() => {
  const MAX = 3, COLOR = '#ff7ac8';
  const owned = {};                    // id → nivel
  let pending = 0;                     // cartas de Regla ganadas (modo normal) y aún sin elegir
  let killN = 0, stormT = 0, shieldT = 0, shieldOn = false, bloodAcc = 0, bloodT = 0, thornT = 0;

  const lvl = id => owned[id] || 0;
  const solo = () => !G.Coop.active;
  const FX = () => G.FX;

  /** Daño en área (empuja un poco). */
  function boom(x, y, r, dmg, col, knock = 70) {
    for (const e of G.EnemyMgr.queryCircle(x, y, r)) if (e && !e.dead && !e.remote) e.hurt(dmg, col, e.x - x, e.y - y, knock);
    FX().ring(x, y, r * 0.25, r, col, 0.4, 4);
    FX().burst(x, y, col, 10, 150);
  }

  const INT = { storm: [8, 6, 4.5], shield: [28, 20, 14], chain: [12, 9, 7] };

  const DEFS = [
    { id: 'chain', icon: 'bomb', title: 'Explosión en cadena',
      desc: L => `Cada ${INT.chain[L - 1]} enemigos derrotados, el último explota y daña a los de alrededor.` },
    { id: 'blood', icon: 'heart', title: 'Sed de sangre',
      desc: L => `Cada enemigo derrotado te cura un ${(0.4 * L).toFixed(1)}% de tu vida máxima.` },
    { id: 'storm', icon: 'type:electric', title: 'Tormenta',
      desc: L => `Cada ${INT.storm[L - 1]} s cae un rayo sobre 3 enemigos cercanos.`,
      get: () => { stormT = 2; } },
    { id: 'shield', icon: 'shield', title: 'Escudo reactivo',
      desc: L => `Un escudo absorbe el próximo golpe. Se recarga cada ${INT.shield[L - 1]} s.`,
      get: L => { shieldT = Math.min(shieldT || 99, INT.shield[L - 1]); } },
    { id: 'hunter', icon: 'crown', title: 'Cazador de jefes',
      desc: L => `+${[40, 70, 100][L - 1]}% de daño contra jefes.` },
    { id: 'loot', icon: 'star', title: 'Botín',
      desc: L => `${4 * L}% de que un enemigo derrotado suelte monedas extra.` },
    { id: 'pact', icon: 'type:fighting', title: 'Pacto de poder',
      desc: () => '+30% de daño, pero los enemigos tienen +15% de vida.',
      get: (L, pl) => { pl.atkMul *= 1.3; } },
    { id: 'thorns', icon: 'type:poison', title: 'Espinas explosivas',
      desc: () => 'Al recibir un golpe, una onda daña y aparta a los enemigos de alrededor.' }
  ];
  const BY = {};
  for (const d of DEFS) BY[d.id] = d;

  function card(def, fromPending) {
    const L = lvl(def.id) + 1;
    return {
      w: 1, type: 'rogue', key: 'rule:' + def.id, rarity: 'epic',
      icon: def.icon, color: COLOR, tag: L > 1 ? 'Regla · Nv.' + L : 'Regla',
      title: def.title, desc: def.desc(L),
      apply: pl => {
        owned[def.id] = L;
        if (def.get) def.get(L, pl);
        if (fromPending) pending = Math.max(0, pending - 1);
        G.Spawner.say('Regla: ' + def.title, 2.4, true);
      }
    };
  }

  /** n cartas de Regla distintas (las que aún no están al máximo). */
  function rules(pl, n = 3, fromPending = false) {
    const pool = DEFS.filter(d => lvl(d.id) < MAX);
    return G.U.pickN(pool, Math.min(n, pool.length)).map(d => card(d, fromPending));
  }

  function reset() {
    for (const k of Object.keys(owned)) delete owned[k];
    pending = killN = stormT = shieldT = bloodAcc = bloodT = thornT = 0; shieldOn = false;
  }

  /** Cada fotograma (sólo si hay reglas, no cuesta nada). */
  function update(dt) {
    const pl = G.Game.player;
    if (!pl || pl.dead || !solo()) return;
    let L = lvl('storm');
    if (L && (stormT -= dt) <= 0) {
      stormT = INT.storm[L - 1];
      const near = G.EnemyMgr.queryCircle(pl.x, pl.y, 340).filter(e => e && !e.dead && !e.remote);
      for (const e of near.length ? G.U.pickN(near, Math.min(3, near.length)) : []) {
        e.hurt(60 + pl.level * 8, '#ffe14d', 0, -1, 40);
        FX().ring(e.x, e.y, 6, 54, '#ffe14d', 0.3, 3);
        FX().burst(e.x, e.y - 10, '#ffe14d', 8, 160);
      }
    }
    L = lvl('shield');
    if (L && !shieldOn && (shieldT -= dt) <= 0) {
      shieldOn = true;
      FX().dmgText(pl.x, pl.y - pl.bodyH - 18, 'Escudo listo', '#9fd8ff');
      FX().ring(pl.x, pl.y, 8, 50, '#9fd8ff', 0.4, 3);
    }
    if (bloodAcc > 0 && (bloodT -= dt) <= 0) { bloodT = 0.6; pl.heal(bloodAcc); bloodAcc = 0; }
    if (thornT > 0) thornT -= dt;
  }

  /** Cada enemigo derrotado (lo llama G.Progress.kill). */
  function onKill(e) {
    const pl = G.Game.player;
    if (!pl || !solo() || e.remote) return;
    if (e.boss && !e.judge && !G.Roguelike.active) {                       // modo normal: jefe = carta de Regla
      pending++;
      G.Spawner.say('¡Has ganado una carta de Regla! Saldrá en tu próximo nivel.', 3.4, true);
    }
    let L = lvl('chain');
    if (L && ++killN >= INT.chain[L - 1]) { killN = 0; boom(e.x, e.y, 95 + L * 15, 30 + pl.level * 5 * L, '#ff9a3d'); }
    L = lvl('blood');
    if (L) bloodAcc += pl.maxHp * 0.004 * L;
    L = lvl('loot');
    if (L && Math.random() < 0.04 * L) G.Pickups.drop('coin', e.x, e.y, 3);
  }

  /** El escudo se come el golpe (devuelve true si lo absorbió). */
  function absorb(pl) {
    if (!shieldOn || pl.invuln > 0 || pl.dead) return false;
    shieldOn = false; shieldT = INT.shield[Math.max(1, lvl('shield')) - 1];
    pl.invuln = 0.7;
    FX().dmgText(pl.x, pl.y - pl.bodyH - 4, '¡Escudo!', '#9fd8ff', true);
    FX().ring(pl.x, pl.y, 8, 70, '#9fd8ff', 0.45, 4);
    G.Audio.sfx('confirm');
    return true;
  }

  function onHurt(pl) {
    const L = lvl('thorns');
    if (L && thornT <= 0) { thornT = 0.6; boom(pl.x, pl.y, 120 + L * 20, 40 + pl.level * 6 * L, '#c77dff', 170); }
  }

  const exportRun = () => ({ o: Object.assign({}, owned), p: pending });
  function importRun(s) {
    reset();
    if (!s) return;
    for (const d of DEFS) { const v = s.o && s.o[d.id] | 0; if (v > 0) owned[d.id] = Math.min(MAX, v); }
    pending = Math.max(0, s.p | 0);
    shieldT = 5; stormT = 3;                                 // los números de tu Pokémon ya traen sus efectos
  }

  function install() {
    const P = G.Player.prototype, E = G.Enemy.prototype;
    const kill = G.Progress.kill;
    G.Progress.kill = function (e) { kill.apply(this, arguments); onKill(e); };
    const hurt = P.hurt;
    P.hurt = function () {
      if (!this.remote && solo() && lvl('shield') && absorb(this)) return;
      const before = this.hp;
      const r = hurt.apply(this, arguments);
      if (!this.remote && solo() && this.hp < before) onHurt(this);
      return r;
    };
    const eh = E.hurt;
    E.hurt = function (amount) {
      const L = this.boss ? lvl('hunter') : 0;
      if (L) arguments[0] = amount * (1 + [0.4, 0.7, 1][L - 1]);
      return eh.apply(this, arguments);
    };
    const add = G.EnemyMgr.add;
    G.EnemyMgr.add = function (e) {
      const L = lvl('pact');
      if (L && e && !e.boss) { const m = Math.pow(1.15, L); e.hp *= m; e.maxHp *= m; }
      return add.apply(this, arguments);
    };
    const ex = P.exportRun, im = P.importRun;
    P.exportRun = function () { const o = ex.apply(this, arguments); o.relics = exportRun(); return o; };
    P.importRun = function (s) { const r = im.apply(this, arguments); importRun(s && s.relics); return r; };
    const offer = G.LevelUp.offer;
    G.LevelUp.offer = function () {
      const out = offer.apply(this, arguments);
      if (!out || !out.length || pending <= 0 || G.Roguelike.active || !solo()) return out;
      const rc = rules(G.Game.player, 1, true)[0];
      if (rc) out[out.length - 1] = rc;                        // la última carta de nivel cede su sitio
      return out;
    };
  }

  return { reset, update, rules, install, get pending() { return pending; }, owned };
})();

G.I18n.add({
  'Fácil': 'Easy', 'Difícil': 'Hard', '{x} pisos': '{x} floors',
  'Enemigos flojos y pocos. Para aprender la torre.': 'Weak, few enemies. To learn the tower.',
  'Sube despacio y pide buenas cartas.': 'Ramps up slowly and asks for good cards.',
  'Como la carrera normal desde el primer piso, y sube rápido.': 'Like a normal run from the first floor, and ramps up fast.',
  'Sube la torre piso a piso. En el último piso te espera un legendario: derrótalo para ganar.': 'Climb the tower floor by floor. A legendary waits on the last floor: defeat it to win.',
  '¡Piso final! Algo te espera arriba…': 'Final floor! Something waits above…',
  '¡{x} guarda lo más alto de la torre!': '{x} guards the top of the tower!',
  '¡Victoria! Has conquistado la torre': 'Victory! You conquered the tower',
  '¡Victoria!': 'Victory!',
  'Regla': 'Rule', 'Regla · Nv.{x}': 'Rule · Lv.{x}', 'Regla: {x}': 'Rule: {x}',
  '¡Has ganado una carta de Regla! Saldrá en tu próximo nivel.': 'You earned a Rule card! It will show up on your next level-up.',
  'Escudo listo': 'Shield ready', '¡Escudo!': 'Shield!',
  'Explosión en cadena': 'Chain explosion', 'Sed de sangre': 'Bloodthirst', 'Tormenta': 'Storm',
  'Escudo reactivo': 'Reactive shield', 'Cazador de jefes': 'Boss hunter', 'Botín': 'Loot',
  'Pacto de poder': 'Power pact', 'Espinas explosivas': 'Explosive thorns',
  'Cada {x} enemigos derrotados, el último explota y daña a los de alrededor.': 'Every {x} enemies defeated, the last one explodes and damages those around it.',
  'Cada enemigo derrotado te cura un {x}% de tu vida máxima.': 'Each enemy defeated heals {x}% of your max HP.',
  'Cada {x} s cae un rayo sobre 3 enemigos cercanos.': 'Every {x} s lightning strikes 3 nearby enemies.',
  'Un escudo absorbe el próximo golpe. Se recarga cada {x} s.': 'A shield absorbs the next hit. It recharges every {x} s.',
  '+{x}% de daño contra jefes.': '+{x}% damage against bosses.',
  '{x}% de que un enemigo derrotado suelte monedas extra.': '{x}% chance for a defeated enemy to drop extra coins.',
  '+30% de daño, pero los enemigos tienen +15% de vida.': '+30% damage, but enemies have +15% more HP.',
  'Al recibir un golpe, una onda daña y aparta a los enemigos de alrededor.': 'When you take a hit, a shockwave damages and pushes back nearby enemies.'
});
