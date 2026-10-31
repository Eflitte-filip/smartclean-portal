/* Zagon: tema PRED prvim izrisom + upravljanje zagonskega zaslona (splash).
   Zunanja datoteka (ne inline), ker CSP dovoli samo script-src 'self'. */
(function () {
  // 1) Tema pred prvim izrisom — brez preskoka temna→svetla.
  try {
    var p = localStorage.getItem('sc-portal-theme') || 'dark';
    var h = new Date().getHours();
    var eff = p === 'auto' ? ((h >= 7 && h < 19) ? 'light' : 'dark') : (p === 'light' ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', eff);
    var mc = document.querySelector('meta[name="theme-color"]');
    if (mc) mc.setAttribute('content', eff === 'light' ? '#ffffff' : '#0a0a0a');
  } catch (e) {}

  // 1b) Aplikacija z začetnega zaslona: trajen trak na vrhu (#sc-vrh, glej index.html) — pred prvim izrisom.
  try {
    if (window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches))
      document.documentElement.classList.add('sc-sam');
  } catch (e) {}

  // 1c) Zmogljivo: gibanje ostane tudi ob sistemski »Zmanjšaj gibanje« — že od prvega izrisa.
  try {
    var zm = JSON.parse(localStorage.getItem('sc-zmogljivost') || 'null');
    if (zm && zm.nacin === 'polno') document.documentElement.classList.add('zm-polno');
  } catch (e) {}

  // 2) Med splashem zakleni pomikanje strani.
  try { document.documentElement.classList.add('sc-booting'); } catch (e) {}

  // 3) Umik splasha — kliče ga portal.js, ko je portal pripravljen; varovalo po 6 s.
  window.scBootDone = function () {
    try { document.documentElement.classList.remove('sc-booting'); } catch (e) {}
    var b = document.getElementById('scBoot');
    if (!b || b.__d) return;
    b.__d = 1;
    b.classList.add('scBoot-hide');
    b.__t = setTimeout(function () { if (b && b.parentNode) b.parentNode.removeChild(b); }, 560);
  };
  setTimeout(function () { try { window.scBootDone(); } catch (e) {} }, 6000);

  // 4) Po prijavi: isti zaslon z nalagalnim trakom se pretopi čez prijavo in ostane, dokler portal ni sestavljen
  //    (scBootDone ga umakne; varovalo po 12 s). Vrne true, če je bil prikazan na novo.
  window.scBootZnova = function () {
    var b = document.getElementById('scBoot');
    if (b && !b.__d) return false;   // ob zagonu je že prikazan
    if (!b) {
      b = document.createElement('div'); b.id = 'scBoot'; b.setAttribute('aria-hidden', 'true');
      b.innerHTML = '<div class="scBoot-in"><div class="scBoot-wm wordmark">Smart<span>Clean</span></div><div class="scBoot-bar"><i></i></div></div>';
      b.className = 'scBoot-hide';
      document.body.appendChild(b);
    }
    clearTimeout(b.__t); b.__d = 0;
    void b.offsetWidth;
    b.style.transitionDuration = '.22s'; b.classList.remove('scBoot-hide');
    setTimeout(function () { b.style.transitionDuration = ''; }, 240);
    document.documentElement.classList.add('sc-booting');
    setTimeout(function () { try { window.scBootDone(); } catch (e) {} }, 12000);
    return true;
  };
})();
