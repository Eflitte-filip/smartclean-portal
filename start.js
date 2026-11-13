/* Zagonska diagnostika.
   Če se glavna skripta ne naloži ali ne prevede — na primer na starejšem
   brskalniku — uporabnik ne sme ostati pred gumbom, ki tiho ne dela nič.
   Ta datoteka je namenoma napisana v stari skladnji, da se naloži povsod. */
(function () {
  window.__SC = { ok: false, napake: [] };

  window.addEventListener('error', function (e) {
    var kje = (e.filename || '').split('/').pop();
    window.__SC.napake.push((e.message || 'napaka') + (kje ? ' [' + kje + ':' + (e.lineno || 0) + ']' : ''));
  }, true);

  /* Sporočilo je v okvirju prijave, ki je sprva skrit — brez tega napaka ni bila vidna
     in je ostal le napis »Peremo, vi pa blestite.«. */
  function odpriOkvir() {
    var pp = document.getElementById('profilePicker'), ab = document.getElementById('authBox');
    if (pp) pp.className = pp.className.replace(/\bhidden\b/, '') + ' hidden';
    if (ab) ab.className = ab.className.replace(/\bhidden\b/g, '');
  }
  function pokazi() {
    if (window.__SC.ok) return;
    try { if (window.scBootDone) window.scBootDone(); } catch (e) {}   // umakni splash, da je napaka vidna
    var m = document.getElementById('loginMsg');
    if (!m) return;
    odpriOkvir();
    var t = 'Portal se na tej napravi ni zagnal.';
    if (!window.supabase) t += ' Knjižnica se ni naložila.';
    if (window.__SC.napake.length) t += ' ' + window.__SC.napake[0];
    if (/Unexpected token/.test(window.__SC.napake[0] || ''))
      t += ' Verjetno stara datoteka iz predpomnilnika — počistite podatke strani.';
    var ua = navigator.userAgent || '';
    var ch = ua.match(/Chrome\/(\d+)/);
    t += ' Brskalnik: ' + (ch ? 'Chrome ' + ch[1] : ua.slice(0, 60));
    m.className = 'msg bad show';
    m.textContent = t;
    var b = document.getElementById('loginBtn');
    if (b) b.disabled = true;
  }

  /* Varovalo: skripta teče, a po 15 s še ni izbran noben zaslon (prijava, profili ali
     portal) — npr. strežnik ne odgovori. Pokaži prijavo s pojasnilom, ne golega napisa. */
  function varovalo() {
    if (!window.__SC.ok) return;
    if (window.__SC.zaganjam) { setTimeout(varovalo, 3000); return; }   // portal se še zaganja (morda čaka na povezavo — piše na zagonskem zaslonu)
    var auth = document.getElementById('auth'), pp = document.getElementById('profilePicker'), ab = document.getElementById('authBox');
    if (!auth || auth.style.display === 'none' || !pp || !ab) return;
    if (!/\bhidden\b/.test(pp.className) || !/\bhidden\b/.test(ab.className)) return;
    try { if (window.scBootDone) window.scBootDone(); } catch (e) {}
    odpriOkvir();
    var m = document.getElementById('loginMsg');
    if (m) {
      m.className = 'msg bad show';
      m.textContent = navigator.onLine === false
        ? 'Ta naprava nima interneta. Povežite jo z omrežjem z internetom in osvežite stran.'
        : 'Strežnik se ne odziva. Preverite, ali ima naprava internet (ne samo WiFi tiskalnika), in osvežite stran.';
    }
  }
  function ob(f, ms) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(f, ms); });
    else setTimeout(f, ms);
  }
  ob(pokazi, 2500);
  ob(varovalo, 15000);
})();

/* PWA: registriraj service worker (namestljiv portal na Androidu/iPhonu).
   Nov SW je network-first za HTML, zato posodobitve niso zaklenjene v predpomnilnik.
   Stara napačna registracija se ob tem posodobi z novo (isti obseg). */
(function () {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  });
})();
