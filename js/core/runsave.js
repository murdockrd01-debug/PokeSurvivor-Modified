/* ============ runsave.js — guardar la partida a medias ============
 * Si cierras el juego a mitad de una run (o pulsas "Guardar y salir" en la
 * pausa), se guarda una foto de cómo ibas y en el menú sale "Continuar partida".
 *
 * Qué vuelve: tu Pokémon (nivel, vida, movimientos y sus mejoras, objeto,
 * vínculos...), el mapa (misma semilla), el tiempo, el elenco de enemigos, los
 * jefes que faltan y tu posición. Qué no: los enemigos y objetos que había
 * sueltos por el suelo en ese momento, ni las rocas ya rotas.
 *
 * Sólo en solitario y con cuenta (el invitado no guarda nada). Vive en el
 * navegador (localStorage), no en la nube. Sólo hay una por cuenta.
 * Una partida recuperada no entra en el ranking (para que nadie repita una
 * partida hasta que le salga bien).
 */
G.RunSave = (() => {
  const VERSION = 1, MAX_AGE = 14 * 86400e3;      // se olvida a los 14 días

  function key() {
    const u = G.DB && G.DB.user;
    return u && !G.DB.guest ? 'ps.run.' + G.DB.mode + '.' + String(u).toLowerCase() : null;
  }

  function read() {
    const k = key();
    if (!k) return null;
    try {
      const raw = localStorage.getItem(k);
      if (!raw) return null;
      const s = JSON.parse(raw);
      const ok = s && s.v === VERSION && s.player && s.player.dex && G.DEX_BY[s.player.dex] &&
        Number.isFinite(s.time) && s.time >= 0 && Number.isFinite(s.seed) &&
        Array.isArray(s.player.moves) && s.player.moves.length && Date.now() - (s.saved || 0) < MAX_AGE;
      if (!ok) { localStorage.removeItem(k); return null; }
      return s;
    } catch (e) {
      try { localStorage.removeItem(k); } catch (e2) { /* nada */ }
      return null;
    }
  }

  return {
    /** Guarda (sustituye a la anterior). Devuelve true si se pudo. */
    save(snap) {
      const k = key();
      if (!k) return false;
      try {
        localStorage.setItem(k, JSON.stringify(Object.assign({ v: VERSION, saved: Date.now() }, snap)));
        return true;
      } catch (e) { return false; }
    },
    /** La partida guardada completa, o null. */
    load: read,
    /** Resumen para el menú (o null si no hay): { dex, level, time, mode }. */
    peek() {
      const s = read();
      return s ? { dex: s.player.dex, level: (s.player.f && s.player.f.level) || 1, time: s.time, mode: s.mode || 'normal' } : null;
    },
    has() { return !!read(); },
    clear() {
      const k = key();
      if (k) try { localStorage.removeItem(k); } catch (e) { /* nada */ }
    }
  };
})();
