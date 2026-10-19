/* ============ roguelike.js — Modo Roguelike: pisos y cartas de rareza ============
 * Un modo aparte (botón "Modo Roguelike" del menú), sólo en solitario. La
 * mecánica es la de siempre, con pisos por encima:
 *
 *   - Cada piso dura FLOOR_LEN segundos. Al pasar al siguiente sale el aviso
 *     «Piso N» y los enemigos son un poco más duros y numerosos.
 *   - Cada BOSS_EVERY pisos aparece un jefe (en vez de los del reloj normal).
 *   - Cada CARD_EVERY pisos superados, tres cartas de rareza a elegir
 *     (Común, Rara, Épica, Legendaria), además de las cartas de nivel de siempre.
 *     Cuanto más alto el piso, más fácil que salgan las mejores. Las épicas y
 *     legendarias dan varias mejoras a la vez. En un piso de jefe, siempre sale
 *     al menos una épica o mejor.
 *
 * Es una primera versión: todos los números están aquí arriba para equilibrarlos.
 * Una partida de este modo no cuenta para los récords ni para el ranking.
 */
G.Roguelike = (() => {
  const FLOOR_LEN = 75;                // segundos por piso
  const CARD_EVERY = 3;                // cartas de rareza cada N pisos superados
  const BOSS_EVERY = 5;                // un jefe cada N pisos
  const HP_PER_FLOOR = 0.07, DMG_PER_FLOOR = 0.04, RATE_PER_FLOOR = 0.04;   // dificultad extra por piso

  let active = false, floor = 1, due = 0, bossDue = 0;

  const floorAt = t => 1 + Math.floor(Math.max(0, t) / FLOOR_LEN);
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
    active = !!on;
    floor = active ? floorAt(t) : 1;
    due = 0; bossDue = 0;
  }

  /** Cada fotograma: ¿hemos pasado de piso? */
  function update(dt, t) {
    if (!active) return;
    const f = floorAt(t);
    while (floor < f) {
      floor++;
      if ((floor - 1) % CARD_EVERY === 0) due++;
      if (floor % BOSS_EVERY === 0) bossDue++;
      G.Spawner.say('Piso ' + floor, 2.6, true);
      G.Audio.sfx('select');
    }
  }

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
    return rar.map((r, i) => {
      const fx = G.U.pickN(EFFECTS, r.n);
      return {
        w: 1, type: 'rogue', key: 'rogue:' + i, rarity: r.id,
        icon: fx[0].icon, color: r.color, tag: r.name,
        title: fx.map(e => e.title).join(' + '),
        desc: fx.map(e => e.line(r.m)).join('<br>'),
        apply: p => { for (const e of fx) e.apply(p, r.m); }
      };
    });
  }

  /** ¿Toca un jefe de piso? (lo llama el spawner; gasta el aviso) */
  function takeBoss() {
    if (!active || bossDue <= 0) return false;
    bossDue--;
    return true;
  }

  /** Lo que el guardado a medias necesita recordar (extra = 1 si hay unas cartas abiertas sin elegir). */
  function exportRun(extra = 0) { return { due: due + (extra ? 1 : 0), bossDue }; }
  function importRun(s) {
    if (!s) return;
    due = Math.max(0, s.due | 0);
    bossDue = Math.max(0, s.bossDue | 0);
  }

  const k = per => active ? 1 + per * (floor - 1) : 1;

  return {
    reset, update, offer, takeBoss, exportRun, importRun,
    get active() { return active; },
    get floor() { return floor; },
    get due() { return due; },
    set due(v) { due = v; },
    hpK: () => k(HP_PER_FLOOR), dmgK: () => k(DMG_PER_FLOOR), rateK: () => k(RATE_PER_FLOOR),
    FLOOR_LEN, CARD_EVERY, BOSS_EVERY
  };
})();
