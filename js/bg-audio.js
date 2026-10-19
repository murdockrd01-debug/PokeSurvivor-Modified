/* ============ bg-audio.js — sin sonido en segundo plano ============
 * Se carga ANTES del juego. Envuelve AudioContext para saber cuáles hay y
 * callarlos cuando la app pasa a segundo plano (o se apaga la pantalla), y
 * reanudarlos al volver. No toca el código del juego.
 * La app de Android (MainActivity) también llama a window.PSAudioBg.pause()
 * y .resume(), porque el WebView no siempre avisa de que la app se oculta.
 */
(function () {
  'use strict';
  var Base = window.AudioContext || window.webkitAudioContext;
  if (!Base) return;
  var all = [], paused = false;

  class PSAudioContext extends Base {
    constructor(opts) {
      super(opts);
      all.push(this);
      if (paused) { try { super.suspend().catch(function () {}); } catch (e) {} }
    }
    // Mientras la app está en segundo plano, nadie puede reanudar el sonido.
    resume() { return paused ? Promise.resolve() : super.resume(); }
  }

  function each(fn) {
    for (var i = 0; i < all.length; i++) { try { if (all[i].state !== 'closed') fn(all[i]); } catch (e) {} }
  }
  function pause() {
    paused = true;
    each(function (c) { if (c.state !== 'suspended') Base.prototype.suspend.call(c).catch(function () {}); });
  }
  function resume() {
    paused = false;
    each(function (c) { if (c.state !== 'running') Base.prototype.resume.call(c).catch(function () {}); });
  }

  window.AudioContext = PSAudioContext;
  window.webkitAudioContext = PSAudioContext;
  window.PSAudioBg = { pause: pause, resume: resume };

  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); else resume(); });
  addEventListener('pagehide', pause);
  addEventListener('pageshow', function () { if (!document.hidden) resume(); });
})();
