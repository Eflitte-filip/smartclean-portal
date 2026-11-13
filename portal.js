/* SmartClean portal */
(function () {

  const $ = id => document.getElementById(id);
  // različica strani (index.html naloži portal.js?v=…): primerja se z APP_VERZIJA — stara stran z novo kodo se enkrat naloži znova
  var _STRAN_V = (function () { try { var m = /[?&]v=([^&#]+)/.exec((document.currentScript && document.currentScript.src) || ''); return m ? decodeURIComponent(m[1]) : ''; } catch (e) { return ''; } })();
  // Stara ikona na začetnem zaslonu (»black-translucent«): trak na vrhu je višji od 12 px (sega pod uro).
  try { var _vrh = document.getElementById('sc-vrh'); if (_vrh && _vrh.getBoundingClientRect().height > 20) document.documentElement.classList.add('sc-pod-uro'); } catch (e) {}
  const cfg = window.SC_CONFIG || {};
  const createClient = window.supabase.createClient;
  function escape_(s) {
    return String(s !== null && s !== void 0 ? s : '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[c]);
  }
  const stevilo = n => Number(n || 0).toLocaleString('sl-SI');
  const datum = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('sl-SI', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }) : '—';
  const datumcas = d => d ? new Date(d).toLocaleString('sl-SI', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : '';

  /* ── tema (svetlo / temno / samodejno) ────────────────────────────── */
  function temaPref() { try { return localStorage.getItem('sc-portal-theme') || 'dark'; } catch (e) { return 'dark'; } }
  function autoTemna() { const h = new Date().getHours(); return !(h >= 7 && h < 19); }
  function uporabiTemo() {
    const p = temaPref();
    const eff = p === 'auto' ? (autoTemna() ? 'dark' : 'light') : (p === 'light' ? 'light' : 'dark');
    var de = document.documentElement;
    if (de.dataset.theme && de.dataset.theme !== eff) {
      // Prehod teme (4.67, od začetka): ne prehaja vsak element posebej (podedovana barva besedila je zato zaostajala),
      // ampak se zvezno spremenijo SAMI barvni žetoni (--bg, --ink, --surface …, registrirani z @property v portal.css).
      // Vsi elementi v vsakem trenutku dobijo isto vmesno barvo → cel zaslon hkrati. Barva sistemskih pasov
      // (theme-color) se med prehodom posodablja sproti z isto krivuljo; na koncu Safari pasova še enkrat vzorči.
      var mirno = false; try { mirno = !de.classList.contains('zm-polno') && (matchMedia('(prefers-reduced-motion: reduce)').matches || de.classList.contains('zm-brez-anim')); } catch (e) {}
      var animira = !mirno && _temaZetoniAnimirani();
      clearTimeout(de._temaUra); cancelAnimationFrame(de._temaRaf || 0);
      if (!animira) {
        de.classList.add('sc-notrans');
        de.dataset.theme = eff; nastaviPas(eff === 'light' ? '#ffffff' : '#0a0a0a');
        void de.offsetWidth; osveziPasove();
        requestAnimationFrame(function () { requestAnimationFrame(function () { de.classList.remove('sc-notrans'); }); });
        return;
      }
      var od = getComputedStyle(de).getPropertyValue('--bg').trim() || (eff === 'light' ? '#0a0a0a' : '#ffffff');
      var cilj = eff === 'light' ? '#ffffff' : '#0a0a0a', t0 = performance.now(), D = TEMA_MS;
      de.classList.add('sc-tema-anim');
      void de.offsetWidth;
      de.dataset.theme = eff;
      // Vrstico z uro v aplikaciji z začetnega zaslona barva sistem po theme-color → sproti z isto krivuljo.
      // V Safariju pas vzorči stran sam (sproti); sprotno menjanje theme-color bi tam prehod strani zmotilo.
      if (de.classList.contains('sc-sam')) (function korak(now) {
        var x = Math.min(1, (now - t0) / D);
        nastaviPas(mesajBarvo(od, cilj, temaKrivulja(x)));
        if (x < 1) de._temaRaf = requestAnimationFrame(korak);
      })(t0);
      de._temaUra = setTimeout(function () { de.classList.remove('sc-tema-anim'); nastaviPas(cilj); osveziPasove(); }, D + 60);
    } else {
      de.dataset.theme = eff; nastaviPas(eff === 'light' ? '#ffffff' : '#0a0a0a');
    }
  }
  var TEMA_MS = 320;
  // ista krivulja kot prehod žetonov v CSS (cubic-bezier(.4,0,.2,1)) — pas ob uri in stran se spreminjata skupaj
  function temaKrivulja(x) {
    var lo = 0, hi = 1, t = x;
    for (var i = 0; i < 20; i++) { var u = 1 - t, bx = 3 * u * u * t * .4 + 3 * u * t * t * .2 + t * t * t; if (Math.abs(bx - x) < 1e-4) break; if (bx < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    var v = 1 - t; return 3 * v * t * t * 1 + t * t * t + 0 * v * v * t;
  }
  function hexRgb(c) {
    c = String(c).trim();
    var m = c.match(/^#([0-9a-f]{6})$/i); if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    m = c.match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i); if (m) return [+m[1], +m[2], +m[3]];
    return [10, 10, 10];
  }
  function mesajBarvo(a, b, t) {
    var x = hexRgb(a), y = hexRgb(b);
    return '#' + [0, 1, 2].map(function (k) { return ('0' + Math.round(x[k] + (y[k] - x[k]) * t).toString(16)).slice(-2); }).join('');
  }
  function nastaviPas(barva) { try { var mc = document.querySelector('meta[name="theme-color"]'); if (mc) mc.setAttribute('content', barva); } catch (e) {} }
  // ali brskalnik zna zvezno spreminjati registrirane barvne žetone (@property): sicer hipna menjava
  function _temaZetoniAnimirani() {
    if (_temaZetoniAnimirani.v != null) return _temaZetoniAnimirani.v;
    var v = false;
    try { v = !!(window.CSS && CSS.registerProperty) && getComputedStyle(document.documentElement).getPropertyValue('--tema-test').trim() === 'rgb(1, 2, 3)'; } catch (e) {}
    return (_temaZetoniAnimirani.v = v);
  }
  // Safari (iPhone) barve spodnjega pasu po spremembi teme sam ne osveži: vzame jo iz fiksnega elementa ob
  // spodnjem robu (odprt meni) ali iz strani in jo ponovno oceni šele ob spremembi geometrije ali pomiku.
  // Neviden sunek (1 px za en okvir) ga prisili, da pas pobarva v novo barvo.
  function osveziPasove() {
    try {
      var sd = $('side'); if (sd && sd.classList.contains('on')) { sd.style.visibility = 'hidden'; requestAnimationFrame(function () { requestAnimationFrame(function () { sd.style.visibility = ''; }); }); }
      var y = window.scrollY, gor = y > 0 ? -1 : 1;
      window.scrollTo(0, y + gor); requestAnimationFrame(function () { window.scrollTo(0, y); });
    } catch (e) {}
  }
  function oznaciTemo() {
    const p = temaPref();
    document.querySelectorAll('[data-tema]').forEach(b => b.classList.toggle('on', b.dataset.tema === p));
  }
  function nastaviTemo(pref) { try { localStorage.setItem('sc-portal-theme', pref); } catch (e) {} uporabiTemo(); oznaciTemo(); if (typeof shraniNastavitve === 'function') shraniNastavitve(); }
  uporabiTemo();

  /* ── PWA namestitev ──────────────────────────────────────────────── */
  let _pwaPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _pwaPrompt = e;
    const b = $('pwaInstall');
    if (b) b.style.display = '';
  });
  window.addEventListener('appinstalled', () => {
    _pwaPrompt = null;
    const b = $('pwaInstall'); if (b) b.style.display = 'none';
    const h = $('pwaHint'); if (h) h.textContent = 'Aplikacija je nameščena.';
  });

  $('themeBtn').addEventListener('click', () => {
    nastaviTemo(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
  { var _tba = $('themeBtnAuth'); if (_tba) _tba.addEventListener('click', () => { nastaviTemo(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); }); }

  /* ── samodejna prijava (segment kot redni/izredni na tablici) ─────── */
  function autoLoginOn() { try { return localStorage.getItem('sc-autologin') !== '0'; } catch (e) { return true; } }
  function nastaviAuto(on) { try { localStorage.setItem('sc-autologin', on ? '1' : '0'); } catch (e) {} }
  function osveziAutoSege() {
    const on = autoLoginOn();
    document.querySelectorAll('.auto-seg').forEach(seg => {
      seg.querySelectorAll('.seg-b').forEach(b => b.classList.toggle('on', (b.dataset.auto === '1') === on));
    });
  }
  (function initAutoSeg() {
    document.querySelectorAll('.auto-seg .seg-b').forEach(b => b.addEventListener('click', () => {
      nastaviAuto(b.dataset.auto === '1');
      osveziAutoSege();
    }));
    osveziAutoSege();
  })();

  /* ── pogled: seznam / mreža (Arhiv, Fakture, Ceniki, Stranke) ─────── */
  function pogledPref() { try { return localStorage.getItem('sc-view') === 'grid' ? 'grid' : 'list'; } catch (e) { return 'list'; } }
  function uporabiPogled() {
    var de = document.documentElement, prej = de.dataset.view, v = pogledPref();
    de.dataset.view = v;
    // Prisotnost ima v mreži drugačno zgradbo kartic (naslovnica) kot strnjen seznam → ob preklopu jo izriši znova
    if (prej && prej !== v) { var pl = document.getElementById('prisList'); if (pl && pl.querySelector('.pris-zap')) prisRender(); }
  }
  function osveziPogledSege() {
    const v = pogledPref();
    document.querySelectorAll('.pogled-seg').forEach(seg => seg.querySelectorAll('.seg-b').forEach(b => b.classList.toggle('on', b.dataset.view === v)));
  }
  function nastaviPogled(v) { try { localStorage.setItem('sc-view', v === 'grid' ? 'grid' : 'list'); } catch (e) {} uporabiPogled(); osveziPogledSege(); { const _s = document.querySelector('.sec:not(.hidden)'); if (_s) secVstop(_s, 'sec-pogled'); } if (typeof shraniNastavitve === 'function') shraniNastavitve(); }
  (function initPogled() {
    document.querySelectorAll('.pogled-seg .seg-b').forEach(b => b.addEventListener('click', () => nastaviPogled(b.dataset.view)));
    uporabiPogled(); osveziPogledSege();
  })();
  /* ── Zmogljivost (le na tej napravi, ne sinhronizira se): drsnik Varčno / Uravnoteženo / Zmogljivo ──
     Varčno izklopi animacije, zameglitev (backdrop-filter je za šibke grafične čipe najdražji), teksturo
     kartic (šum SVG z mešanjem barv na vsaki kartici) in nalaganje razdelkov vnaprej (podatki ob zagonu).
     Uravnoteženo (prej Samodejno): šibka naprava (≤ 1 GB pomnilnika, 2–3 GB s ≤ 4 jedri ali ≤ 2 jedri) vse izklopi; varčevanje s podatki
     izklopi le nalaganje vnaprej, želja po manj gibanja le animacije. Jedra na napravah Apple ne štejejo (iOS jih
     skriva in vrne 2), Chrome pomnilnik zaokroži navzdol (3 GB → 2). */
  var ZM_KLJUCI = ['anim', 'steklo', 'tekstura', 'vnaprej'];
  function zmSibka() {
    try {
      var mem = navigator.deviceMemory, jed = navigator.hardwareConcurrency, apple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent || '');
      if (mem && mem < 2) return true;
      if (mem && mem <= 2 && jed && jed <= 4) return true;
      if (!apple && jed && jed <= 2) return true;
    } catch (e) {}
    return false;
  }
  function zmSamodejno() {
    var s = zmSibka(), p = false, m = false;
    try { p = !!(navigator.connection && navigator.connection.saveData); m = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
    return { anim: !s && !m, steklo: !s, tekstura: !s, vnaprej: !s && !p };
  }
  function zmBeri() {
    var z = null; try { z = JSON.parse(localStorage.getItem('sc-zmogljivost') || 'null'); } catch (e) {}
    if (!z || ['auto', 'polno', 'varcno'].indexOf(z.nacin) < 0) z = { nacin: 'auto' };   // »po meri« (stikala do 4.80) → Uravnoteženo
    var vse = z.nacin === 'polno' ? true : z.nacin === 'varcno' ? false : null, sam = z.nacin === 'auto' ? zmSamodejno() : null;
    var r = { nacin: z.nacin };
    ZM_KLJUCI.forEach(function (k) { r[k] = sam ? sam[k] : vse != null ? vse : z[k] !== false; });
    return r;
  }
  function zmUporabi() {
    var z = zmBeri(), de = document.documentElement;
    de.classList.toggle('zm-brez-anim', !z.anim);
    de.classList.toggle('zm-polno', z.nacin === 'polno');
    de.classList.toggle('zm-brez-stekla', !z.steklo);
    de.classList.toggle('zm-brez-teksture', !z.tekstura);
    return z;
  }
  // manj gibanja: sistemska želja ali Zmogljivost → Animacije izklopljene (vse animacije v JS to preverijo); Zmogljivo ima prednost pred sistemsko željo
  function manjGibanja() { try { var de = document.documentElement; if (de.classList.contains('zm-polno')) return false; return de.classList.contains('zm-brez-anim') || !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
  var GIB_KRIVULJA = 'cubic-bezier(.32,.72,0,1)';   // ista kot --gib v portal.css
  // Zavihki, segmenti, izbira teme: poudarek zdrsne od prejšnjega gumba do novega, namesto da bi ena podlaga ugasnila in druga zasvetila.
  // Izmerimo ob kliku, tablet postavimo tik pred izrisom, po koncu ga ni več — zavihkov ni treba prilagajati.
  document.addEventListener('click', function (e) {
    var g = e.target.closest && e.target.closest('.pris-tab,.seg-b,.tema-b'), sk = g && g.parentElement;
    if (!g || !sk.matches('.pris-tabs,.seg,.tema-izbira') || manjGibanja()) return;
    var star = sk.querySelector(':scope > .on'), tece = sk.querySelector(':scope > .gib-tablet');
    if (!star || star === g) return;
    var x0 = star.offsetLeft, y0 = star.offsetTop, w0 = star.offsetWidth;
    if (tece) { var r = tece.getBoundingClientRect(), k = sk.getBoundingClientRect(); x0 = r.left - k.left; y0 = r.top - k.top; w0 = r.width; tece.remove(); }
    requestAnimationFrame(function () {
      var sk2 = sk.matches('.sk-tabs') ? document.querySelector('.sec:not(.hidden) .sk-tabs') : sk;   // zavihki skupine so v vsakem razdelku svoji
      var nov = sk2 && sk2.isConnected && sk2.querySelector(':scope > .on'); if (!nov) return;
      var x = nov.offsetLeft, y = nov.offsetTop, w = nov.offsetWidth; if (x === x0 && y === y0) return;
      var t = document.createElement('i'); t.className = 'gib-tablet';
      t.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + nov.offsetHeight + 'px';
      sk2.classList.add('gib-drsi'); sk2.appendChild(t);
      var konec = function () { if (!t.parentNode) return; sk2.classList.add('gib-mir'); sk2.classList.remove('gib-drsi'); t.remove(); void sk2.offsetWidth; sk2.classList.remove('gib-mir'); };
      t.animate([{ transform: 'translate(' + (x0 - x) + 'px,' + (y0 - y) + 'px)', width: w0 + 'px' }, { transform: 'none', width: w + 'px' }], { duration: 400, easing: GIB_KRIVULJA }).finished.then(konec, konec);
    });
  }, true);
  document.addEventListener('touchstart', function () {}, { passive: true });   // brez tega iOS na dotik ne vklopi :active (odziv gumbov in kartic)
  // drsnik: Varčno = vse izklopljeno, Uravnoteženo = vse, kar naprava zmore (zmSamodejno), Zmogljivo = vse vklopljeno
  var ZM_STOPNJE = ['varcno', 'auto', 'polno'], ZM_IMENA = ['Varčno', 'Uravnoteženo', 'Zmogljivo'];
  function zmOznaci() {
    var z = zmBeri(), i = ZM_STOPNJE.indexOf(z.nacin), dr = document.getElementById('zmDrsnik');
    document.querySelectorAll('[data-zm]').forEach(function (b) { b.classList.toggle('on', b.dataset.zm === z.nacin); });
    if (dr) { dr.style.setProperty('--zm-x', i / 2); dr.setAttribute('aria-valuenow', i); dr.setAttribute('aria-valuetext', ZM_IMENA[i]); }
  }
  function zmNastavi(nacin) {
    try { localStorage.setItem('sc-zmogljivost', JSON.stringify({ nacin: nacin })); } catch (e) {}
    zmUporabi(); zmOznaci();
  }
  (function initZmogljivost() {
    zmUporabi();
    document.querySelectorAll('[data-zm]').forEach(function (b) { b.addEventListener('click', function () { zmNastavi(b.dataset.zm); }); });   // tudi glasovno upravljanje (»klikni Varčno«)
    var dr = document.getElementById('zmDrsnik');
    if (dr) {   // stopnja najbližje prstu ali miški; puščice, Home in End s tipkovnico
      var izberi = function (i) { i = Math.max(0, Math.min(2, i)); if (ZM_STOPNJE[i] !== zmBeri().nacin) zmNastavi(ZM_STOPNJE[i]); };
      var izX = function (x) { var r = dr.getBoundingClientRect(), rob = parseFloat(getComputedStyle(dr).getPropertyValue('--zm-rob')) || 36; return Math.round(Math.max(0, Math.min(1, (x - r.left - rob) / Math.max(1, r.width - 2 * rob))) * 2); };
      // miška: izbira ob pritisku in vleka z gumbom; prst: dotik ali vodoravna vleka (navpično se stran pomika naprej)
      var st = null, konec = function () { st = null; dr.classList.remove('vlecem'); };
      var vleci = function (e) { st.vlece = true; dr.classList.add('vlecem'); try { dr.setPointerCapture(e.pointerId); } catch (x) {} };
      dr.addEventListener('pointerdown', function (e) {
        if (e.button) return;
        st = { id: e.pointerId, x: e.clientX, y: e.clientY, mis: e.pointerType === 'mouse', vlece: false };
        if (st.mis) { vleci(e); izberi(izX(e.clientX)); }
      });
      dr.addEventListener('pointermove', function (e) {
        if (!st || e.pointerId !== st.id) return;
        if (st.mis && !(e.buttons & 1)) { konec(); return; }
        if (!st.vlece) { var dx = Math.abs(e.clientX - st.x); if (dx > 8 && dx > Math.abs(e.clientY - st.y)) vleci(e); else return; }
        izberi(izX(e.clientX));
      });
      dr.addEventListener('pointerup', function (e) {
        if (!st || e.pointerId !== st.id) return;
        if (!st.vlece && Math.abs(e.clientX - st.x) < 8 && Math.abs(e.clientY - st.y) < 8) izberi(izX(e.clientX));   // dotik
        konec();
      });
      dr.addEventListener('pointercancel', konec);
      dr.addEventListener('lostpointercapture', function (e) { if (e.target === dr && st && st.vlece) konec(); });   // ne ob prevzemu od stopnje (prst jo zajame sam)
      dr.addEventListener('keydown', function (e) {
        var i = ZM_STOPNJE.indexOf(zmBeri().nacin);
        var k = { ArrowLeft: i - 1, ArrowDown: i - 1, ArrowRight: i + 1, ArrowUp: i + 1, Home: 0, End: 2 }[e.key];
        if (k != null) { e.preventDefault(); izberi(k); }
      });
    }
    zmOznaci();
  })();
  // ── Sinhronizacija nastavitev med napravami (shranjeno v profil uporabnika) ──
  var SINH_KLJUCI = ['sc-portal-theme', 'sc-view', 'sc-menu-order', 'sc-cust-order', 'sc-cenik-order'];
  function zberiNastavitve() { var o = {}; SINH_KLJUCI.forEach(function (k) { try { var v = localStorage.getItem(k); if (v != null) o[k] = v; } catch (e) {} }); return o; }
  function uporabiNastavitve(o) { if (!o || typeof o !== 'object') return; SINH_KLJUCI.forEach(function (k) { if (o[k] != null) { try { localStorage.setItem(k, o[k]); } catch (e) {} } }); }
  var _shraniNastT = null;
  function shraniNastavitve() {
    if (!JAZ) return;
    clearTimeout(_shraniNastT);
    _shraniNastT = setTimeout(function () {
      var n = zberiNastavitve();
      try {
        sb.rpc('shrani_nastavitve', { n: n }).then(function (r) {
          if (r && r.error) { try { sb.from('profiles').update({ nastavitve: n }).eq('id', JAZ).then(function () {}, function () {}); } catch (e) {} }
        }, function () {});
      } catch (e) {}
    }, 400);
  }

  /* ── nastavitve ───────────────────────────────────────────────────── */
  let KEY = cfg.key && !cfg.key.startsWith('TUKAJ') ? cfg.key : null;
  let URL_ = cfg.url || null;
  if (!KEY) {
    try {
      KEY = localStorage.getItem('sc-portal-key');
    } catch (e) {}
  }
  if (!URL_) {
    try {
      URL_ = localStorage.getItem('sc-portal-url');
    } catch (e) {}
  }
  if (!KEY || !URL_) {
    $('loginForm').style.display = 'none';
    const box = document.createElement('div');
    box.innerHTML = '<div class="field"><label for="kUrl">Naslov projekta</label>' + '<input type="text" id="kUrl" value="' + escape_(URL_ || '') + '" placeholder="https://….supabase.co"/></div>' + '<div class="field"><label for="kKey">Publishable key</label>' + '<input type="text" id="kKey" placeholder="sb_publishable_…"/></div>' + '<button type="button" class="btn" id="kSave">Shrani in nadaljuj</button>';
    $('loginForm').parentNode.insertBefore(box, $('loginMsg'));
    { const _sub = document.querySelector('.sub'); if (_sub) _sub.textContent = 'Portal še ne ve, kje je vaša baza. Vpišite podatke iz Supabase → Project Settings → API Keys.'; }
    $('kSave').addEventListener('click', () => {
      const u = document.getElementById('kUrl').value.trim();
      const k = document.getElementById('kKey').value.trim();
      if (!/^https:\/\/.+\.supabase\.co\/?$/.test(u) || !k.startsWith('sb_publishable_')) {
        const m = $('loginMsg');
        m.className = 'msg bad show';
        m.textContent = !k.startsWith('sb_publishable_') ? 'Ključ se mora začeti s sb_publishable_. Če se začne s sb_secret_, je napačen in ne sme v brskalnik.' : 'Naslov mora izgledati kot https://nekaj.supabase.co';
        return;
      }
      try {
        localStorage.setItem('sc-portal-url', u.replace(/\/$/, ''));
        localStorage.setItem('sc-portal-key', k);
      } catch (e) {}
      location.reload();
    });
  }
  /* ══════════ POVEZAVA (kot Discord) ══════════
     Ko baza ni dosegljiva (brez interneta, prekinjena povezava), je pod zgornjo vrstico trak »Ni povezave«.
     Portal sam preverja čez 2, 4, 8 … do 10 s, med zagonom do 4 s (»Poskusi zdaj« takoj); ob vrnitvi trak za trenutek pozeleni
     in podatki se osvežijo (seznami, čipi, živi kanal). Zazna: »offline« brskalnika in neuspel klic v bazo.
     Počasna povezava: ko zahteva visi več kot 6 s ali živi kanal ne dobi odgovora na utrip, portal izmeri
     majhno zahtevo (zdravje baze); traja več kot 2,5 s → trak »Počasna povezava« (počasna poizvedba na
     hitri povezavi traku ne prižge).
     Trak je v zgornji vrstici, nikoli čez zgornji rob zaslona (iOS, #sc-vrh). */
  var POV = { stanje: 'ok', cakaj: 2000, ura: null, tik: null, do: 0, el: null, merim: false, pocasiUra: null, vidno: 0 };
  var _izvFetch = window.fetch.bind(window);
  // Branje (GET, bralne funkcije) ob izpadu ne vrne napake: počaka, da je povezava spet tu, in se ponovi — nalaganje teče,
  // trak pove, zakaj (kot v aplikacijah). Prej je razdelek pokazal »Napaka: Load failed«, zagon pa prijavo.
  // Pisanje se ne ponavlja samo (napaka gre uporabniku, ki odloči).
  function povFetch(vir, opt) { return jeVarnoPonoviti(vir, opt) ? povBeriVztrajno(vir, opt) : povFetchEnkrat(vir, opt); }
  function jeVarnoPonoviti(vir, opt) {
    var u = String((vir && vir.url) || vir || '');
    if (!URL_ || u.indexOf(URL_) !== 0 || u.indexOf('/functions/v1/') >= 0) return false;
    var m = String((opt && opt.method) || (vir && vir.method) || 'GET').toUpperCase();
    if (m === 'GET' || m === 'HEAD') return true;
    var i = u.indexOf('/rest/v1/rpc/'); if (i < 0) return false;
    var fn = u.slice(i + 13).split('?')[0];
    return !!DELI_BRALNE[fn] && fn.indexOf('touch_') !== 0;   // utrip prisotnosti se ne nabira med izpadom
  }
  var _povCakalci = [];
  function povObNazaj(f) { _povCakalci.push(f); return function () { var i = _povCakalci.indexOf(f); if (i >= 0) _povCakalci.splice(i, 1); }; }
  function povJavi() { _povCakalci.splice(0).forEach(function (f) { try { f(); } catch (e) {} }); }
  // počakaj, da baza spet odgovarja: med izpadom do vrnitve povezave; po eni spodleteli zahteva preveri bazo
  // (dosegljiva → znova po kratkem, rastočem premoru; sicer izpad in čakanje)
  function povPocakaj(premor) {
    return new Promise(function (ok) {
      var enkrat = false;
      function naprej(ms) { if (enkrat) return; enkrat = true; setTimeout(ok, ms); }
      if (POV.stanje === 'ni' || POV.stanje === 'povezujem') { povObNazaj(function () { naprej(300); }); return; }
      povPreveri(8000).then(function (dela) {
        if (dela) { naprej(premor || 800); return; }
        povIzpad(); povObNazaj(function () { naprej(300); });
      });
    });
  }
  function povBeriVztrajno(vir, opt) {
    var zunanji = opt && opt.signal;
    return new Promise(function (ok, ne) {
      var konec = false, ctl = null, sami = false, odj = null, premor = 800, t0 = 0;
      function zakljuci(f, v) { if (konec) return; konec = true; if (odj) odj(); if (zunanji) zunanji.removeEventListener('abort', prekinjeno); f(v); }
      function prekinjeno() { sami = false; if (ctl) ctl.abort(); zakljuci(ne, new DOMException('Prekinjeno', 'AbortError')); }
      if (zunanji) { if (zunanji.aborted) { ne(new DOMException('Prekinjeno', 'AbortError')); return; } zunanji.addEventListener('abort', prekinjeno); }
      function poskusi() {
        if (konec) return;
        ctl = new AbortController(); sami = false; t0 = Date.now();
        // zahteva, ki visi iz časa izpada: ko se povezava vrne, jo prekini in pošlji znova
        if (odj) odj();
        odj = povObNazaj(function () { odj = null; if (!konec && Date.now() - t0 > 1500) { sami = true; ctl.abort(); } });
        povFetchEnkrat(vir, Object.assign({}, opt || {}, { signal: ctl.signal })).then(function (r) { zakljuci(ok, r); }, function (e) {
          if (konec) return;
          if (sami) { poskusi(); return; }
          if ((zunanji && zunanji.aborted) || (e && e.name === 'AbortError')) { zakljuci(ne, e); return; }
          if (premor >= 3200) povPocasi();   // baza odgovarja na preverjanje, ta zahteva pa ponavljajo pada: vsaj povej, da traja
          povPocakaj(premor).then(function () { premor = Math.min(15000, premor * 2); poskusi(); });
        });
      }
      poskusi();
    });
  }
  function povFetchEnkrat(vir, opt) {
    var visi = setTimeout(povMeri, window.__SC && window.__SC.zaganjam ? 3000 : 6000), pise = jePisanje(vir, opt);   // med zagonom čaka zagonski zaslon: hitreje povej, zakaj
    return _izvFetch(vir, opt).then(function (r) { clearTimeout(visi); if (pise) pozabiDeli(); if (POV.stanje === 'ni' || POV.stanje === 'povezujem') povNazaj(); return r; },
      function (e) { clearTimeout(visi); if (pise) pozabiDeli(); if (!(e && e.name === 'AbortError')) povNapaka(); throw e; });
  }
  // ena spodletela zahteva še ni izpad (iOS jo ob vrnitvi v aplikacijo rad zavrne, branje se samo ponovi): najprej izmeri
  function povNapaka() { if (navigator.onLine === false) povIzpad(); else povMeri(); }
  async function povMeri() {
    if (POV.merim || (POV.stanje !== 'ok' && POV.stanje !== 'pocasi')) return;
    POV.merim = true;
    // odgovor, ki ne pride v 2,5 s, je že počasna povezava — ni treba čakati do konca meritve
    var t0 = Date.now(), pocasiUra = setTimeout(function () { if (POV.merim) povPocasi(); }, 2500), ok = await povPreveri(10000);
    clearTimeout(pocasiUra);
    POV.merim = false;
    if (!ok) { povIzpad(); return; }
    if (Date.now() - t0 > 2500) povPocasi();
  }
  function povPocasi() {
    if (POV.stanje !== 'ok' && POV.stanje !== 'pocasi') return;
    POV.stanje = 'pocasi'; povRisi();
    clearTimeout(POV.pocasiUra);
    POV.pocasiUra = setTimeout(function () { if (POV.stanje === 'pocasi') { POV.stanje = 'ok'; povRisi(); } }, 20000);
  }
  // utrip živega kanala (vsakih ~25 s): brez odgovora ali odgovor po več kot 4 s → izmeri. Čas utripa teče od pošiljanja,
  // zato šteje tudi čas, ko je bila stran v ozadju ali zamrznjena — tak utrip ne pove nič o povezavi.
  function povUtrip(st, ms) {
    if (document.hidden || Date.now() - POV.vidno < (ms || 0) + 1000) return;
    if (st === 'timeout' || (st === 'ok' && ms > 4000)) povMeri();
  }
  function povTrak() {
    if (!POV.el) {
      POV.el = document.createElement('div'); POV.el.className = 'pov-trak'; POV.el.setAttribute('role', 'status'); POV.el.setAttribute('aria-live', 'polite');
      POV.el.innerHTML = '<span class="pov-t"></span><button type="button" class="pov-zdaj">Poskusi znova</button>';
      POV.el.querySelector('.pov-zdaj').addEventListener('click', function () { povPoskus(); });
    }
    // med zagonom (in po prijavi) je čez vse zagonski zaslon: trak je tam, pod nalagalnim trakom
    var zag = document.getElementById('scBoot'), zagIn = zag && !zag.classList.contains('scBoot-hide') && zag.querySelector('.scBoot-in');
    var glava = zagIn || [document.querySelector('#app .topbar'), document.querySelector('#auth .auth-top')].filter(function (h) { return h && h.getClientRects().length > 0; })[0];   // offsetParent je pri pritrjeni (fixed) vrstici vedno null
    if (glava && POV.el.parentNode !== glava) {
      if (POV.el.parentNode) POV.el.parentNode.classList.remove('z-pov');
      glava.appendChild(POV.el); glava.classList.add('z-pov');
    }
    return POV.el;
  }
  function povRisi() {
    var el = povTrak(), t = el.querySelector('.pov-t'), z = el.querySelector('.pov-zdaj');
    el.dataset.st = POV.stanje;
    document.documentElement.classList.toggle('pov-vidno', POV.stanje !== 'ok');
    if (POV.stanje === 'ok') { el.classList.remove('show'); return; }
    el.classList.add('show');
    // en miren napis brez odštevanja; med ponovnim poskusom ostane »Ni povezave« (prej je napis vsakih nekaj sekund preskakoval)
    if (POV.stanje === 'spet') { t.textContent = 'Spet povezano'; z.hidden = true; }
    else if (POV.stanje === 'pocasi') { t.textContent = 'Počasna povezava'; z.hidden = true; }
    else { t.textContent = 'Ni povezave'; z.hidden = false; z.disabled = POV.stanje === 'povezujem'; }
  }
  function povIzpad() {
    if (POV.stanje === 'ni' || POV.stanje === 'povezujem') return;
    POV.stanje = 'ni'; POV.cakaj = 2000; povNacrtuj();
  }
  function povNacrtuj() {
    clearTimeout(POV.ura); clearInterval(POV.tik);
    POV.do = Date.now() + POV.cakaj;
    POV.ura = setTimeout(povPoskus, POV.cakaj);
    povRisi();
  }
  async function povPreveri(rok) {
    if (!URL_) return navigator.onLine !== false;
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, rok || 6000);
    try { var r = await _izvFetch(URL_ + '/auth/v1/health', { headers: { apikey: KEY }, cache: 'no-store', signal: ctl.signal }); return r.status < 500; }
    catch (e) { return false; } finally { clearTimeout(t); }
  }
  async function povPoskus() {
    if (POV.stanje === 'ok' || POV.stanje === 'spet') return;
    clearTimeout(POV.ura); clearInterval(POV.tik);
    POV.stanje = 'povezujem'; povRisi();
    var ok = await povPreveri();
    if (POV.stanje !== 'povezujem') return;   // vmes je uspela druga zahteva (trak je že »Spet povezano«)
    if (ok) { povNazaj(); return; }
    // med zagonom (zagonski zaslon čaka) pogosteje, sicer največ na 10 s — vrnitev povezave mora biti hitro vidna
    POV.stanje = 'ni'; POV.cakaj = Math.min(window.__SC && window.__SC.zaganjam ? 4000 : 10000, POV.cakaj * 2); povNacrtuj();
  }
  function povNazaj() {
    if (POV.stanje === 'ok' || POV.stanje === 'spet') return;
    clearTimeout(POV.ura); clearInterval(POV.tik);
    POV.stanje = 'spet'; povRisi();
    povJavi();   // branja, ki čakajo na povezavo, gredo znova
    try { if (sb && sb.realtime) sb.realtime.connect(); } catch (e) {}
    try { if (typeof OSEBJE !== 'undefined' && OSEBJE) { zivListi(); zivCipi(); } } catch (e) {}
    setTimeout(function () { if (POV.stanje === 'spet') { POV.stanje = 'ok'; povRisi(); } }, 1800);
  }
  window.addEventListener('offline', povIzpad);
  window.addEventListener('online', function () { if (POV.stanje === 'ni') povPoskus(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { POV.vidno = Date.now(); if (navigator.onLine === false) povIzpad(); } });
  document.addEventListener('resume', function () { POV.vidno = Date.now(); });   // zamrznjena stran (Chrome) se je zbudila
  if (navigator.onLine === false) setTimeout(povIzpad, 0);

  const sb = URL_ && KEY ? createClient(URL_, KEY, { global: { fetch: povFetch }, realtime: { heartbeatCallback: povUtrip } }) : null;

  /* ══════════ ISTI PODATKI ENKRAT ══════════
     Ob zagonu portal v ozadju pripravi razdelke (prednaloziRazdelke) in vsak je sam bral iste tabele
     (artikli, cenik, liste obdobja za obračun) — 2- do 4-krat v nekaj sekundah. Zahteva z istim ključem, ki
     pravkar teče ali je tekla pred manj kot 8 s, se ne ponovi. Vsako pisanje iz portala (insert, update,
     upsert, delete, klic funkcije v bazi) in vsaka sprememba v živem toku to pozabita: po spremembi se vedno
     bere znova, prav tako ob poznejšem odpiranju razdelka. */
  var _DELI = {}, DELI_MS = 8000;
  function deli(kljuc, fn) {
    var z = _DELI[kljuc];
    if (z && (z.teka || Date.now() - z.cas < DELI_MS)) return z.p;
    var v = { teka: true, cas: 0, p: null };
    v.p = Promise.resolve().then(fn).then(function (r) { v.teka = false; v.cas = Date.now(); if (r && r.error && _DELI[kljuc] === v) delete _DELI[kljuc]; return r; },
      function (e) { if (_DELI[kljuc] === v) delete _DELI[kljuc]; throw e; });
    _DELI[kljuc] = v;
    return v.p;
  }
  var DELI_GEN = 0;   // poveča se ob vsakem pisanju (začetek in konec): branje, med katerim se je kaj zapisalo, ni zanesljivo
  function pozabiDeli() { _DELI = {}; DELI_GEN++; }
  var DELI_BRALNE = { touch_seen: 1, touch_last_login: 1, stranka_kosi: 1, app_prosta_stevilka: 1, app_pini_nastavljeni: 1, dn_weight: 1, rfid_po_strankah: 1, app_stevilke_pregled: 1 };   // klici, ki le berejo
  // zahteva v bazo, ki piše (fetch odjemalca): ob koncu še enkrat pozabi — branje, ki se je začelo med pisanjem, bi sicer 8 s hranilo staro
  function jePisanje(vir, opt) {
    var m = String((opt && opt.method) || (vir && vir.method) || 'GET').toUpperCase();
    if (m === 'GET' || m === 'HEAD') return false;
    var u = String((vir && vir.url) || vir || ''), i = u.indexOf('/rest/v1/');
    if (i < 0) return false;
    var pot = u.slice(i + 9).split('?')[0];
    return !(pot.indexOf('rpc/') === 0 && DELI_BRALNE[pot.slice(4)]);
  }
  if (sb) {
    var _sbFrom = sb.from.bind(sb), _sbRpc = sb.rpc.bind(sb);
    sb.from = function (t) {
      var q = _sbFrom(t);
      ['insert', 'update', 'upsert', 'delete'].forEach(function (m) { var f = q[m]; if (typeof f === 'function') q[m] = function () { pozabiDeli(); return f.apply(q, arguments); }; });
      return q;
    };
    sb.rpc = function (ime) { if (!DELI_BRALNE[ime]) pozabiDeli(); return _sbRpc.apply(null, arguments); };
  }

  /* ══════════ PRIJAVA ══════════ */
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!sb) return;
    const m = $('loginMsg'),
      btn = $('loginBtn');
    btn.disabled = true;
    btn.textContent = 'Prijavljam …';
    m.className = 'msg';
    const {
      error
    } = await sb.auth.signInWithPassword({
      email: $('email').value.trim(),
      password: $('password').value
    });
    btn.disabled = false;
    btn.textContent = 'Prijavi se';
    if (error) {
      m.className = 'msg bad show';
      m.textContent = /invalid/i.test(error.message) ? 'E-naslov ali geslo se ne ujemata.' : /confirm/i.test(error.message) ? 'Ta račun še ni potrjen. Javite se administratorju.' : 'Prijava ni uspela: ' + error.message;
      return;
    }
    if (await start() === false) { m.className = 'msg bad show'; m.textContent = zagonSporocilo(); }
  });
  var AUTH_NASLOVI = { loginForm: 'Dobrodošli nazaj', regForm: 'Ustvarite račun', gesloForm: 'Novo geslo', newPwForm: 'Novo geslo' };
  var AUTH_TOK = 0;   // vsaka menjava na prijavnem zaslonu (podokno, korak nazaj): odgovor, ki pride pozneje, se ne uporabi
  function showAuthPane(which) {
    AUTH_TOK++;
    ['loginForm', 'regForm', 'gesloForm', 'newPwForm'].forEach(id => {
      const el = $(id);
      if (el) el.classList.toggle('hidden', id !== which);
    });
    ['loginPod', 'regOdpri'].forEach(id => { const el = $(id); if (el) el.classList.toggle('hidden', which !== 'loginForm'); });
    const bp = $('backToPickerBtn');
    if (bp && which !== 'loginForm') bp.style.display = 'none';
    const h = $('authNaslov'); if (h) h.textContent = AUTH_NASLOVI[which] || AUTH_NASLOVI.loginForm;
    const m = $('loginMsg');
    if (m) m.className = 'msg';
  }
  function authMsg(t, slabo) { const m = $('loginMsg'); if (!m) return; m.className = t ? 'msg show' + (slabo ? ' bad' : '') : 'msg'; m.textContent = t || ''; }
  $('forgotBtn').addEventListener('click', () => { if (REG_IMA) gesloZacni($('email').value.trim()); else location.reload(); });
  if ($('backToPickerBtn')) $('backToPickerBtn').addEventListener('click', () => {
    pokaziIzbirnik();
  });

  /* ══════════ REGISTRACIJA S POVABILOM IN POZABLJENO GESLO ══════════
     Strežniška funkcija »registracija« (79_povabila.sql): koda povabila → ime, e-naslov, geslo → 6-mestna koda
     po e-pošti → račun z vlogo iz povabila → prijava → fotografija (neobvezno) → portal.
     Pozabljeno geslo: e-naslov → koda po e-pošti in novo geslo → prijava. */
  // starejša stran (predpomnilnik, med objavo) nima obrazcev: brez tega bi se ustavil ves portal
  var REG_IMA = !!($('regForm') && $('gesloForm') && $('regOdpri'));   // starejša stran: brez registracije (ponovna naložitev: glej APP_VERZIJA)
  var REG = { korak: 'koda', koda: '', povabilo: null, ime: '', email: '', geslo: '', znovaDo: 0, slika: false };
  var REG_KORAKI = ['koda', 'podatki', 'potrdi', 'slika'];
  async function regKlic(telo) {
    try {
      var r = await sb.functions.invoke('registracija', { body: telo });
      if (!r.error) return r.data || {};
      var c = r.error.context;
      if (c && typeof c.json === 'function') { try { var j = await c.json(); if (j && j.napaka) return j; } catch (e) {} }
      return { napaka: jeOmreznaNapaka(r.error) || /fetch|network/i.test(String(r.error.message)) ? 'Ni povezave z internetom.' : 'Strežnik ni dosegljiv. Poskusite znova.' };
    } catch (e) { return { napaka: 'Ni povezave z internetom.' }; }
  }
  function kodaPrikaz(k) { k = String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10); return k.length > 5 ? k.slice(0, 5) + '-' + k.slice(5) : k; }
  // moč gesla 0–4 (dolžina, črke, številke, mešano, simboli); strežnik zahteva vsaj 10 znakov s črkami in številkami
  function gesloMoc(g) { if (!g) return 0; var t = 0; if (g.length >= 10) t++; if (g.length >= 14) t++; if (/[a-zčšž]/.test(g) && /[A-ZČŠŽ]/.test(g)) t++; if (/\d/.test(g) && /[^\p{L}\d]/u.test(g)) t++; return Math.max(1, t); }
  function gesloNapaka(g) { if (g.length < 10) return 'Geslo naj ima vsaj 10 znakov.'; if (!/\p{L}/u.test(g) || !/\d/.test(g)) return 'Geslo naj vsebuje črke in številke.'; return ''; }
  function mocVezi(vnos, trak) { if (!vnos || !trak) return; vnos.addEventListener('input', function () { trak.dataset.m = vnos.value ? gesloMoc(vnos.value) : ''; }); }
  mocVezi($('regGeslo'), $('regMoc')); mocVezi($('gGeslo'), $('gMoc'));
  function regOdpri(koda) {
    $('profilePicker').classList.add('hidden'); $('authBox').classList.remove('hidden');
    REG = { korak: 'koda', koda: '', povabilo: null, ime: '', email: '', geslo: '', znovaDo: 0, slika: false };
    ['regKoda', 'regIme', 'regEmail', 'regGeslo', 'regOtp', 'regGeslo2'].forEach(function (id) { if ($(id)) $(id).value = ''; });
    $('regMoc').dataset.m = '';
    showAuthPane('regForm'); regKorak('koda');
    if (koda) { $('regKoda').value = kodaPrikaz(koda); regNaprej(); }
  }
  function regKorak(k) {
    REG.korak = k;
    document.querySelectorAll('#regForm .reg-korak').forEach(function (el) { el.classList.toggle('hidden', el.dataset.korak !== k); });
    var i = REG_KORAKI.indexOf(k);
    document.querySelectorAll('#regForm .reg-koraki i').forEach(function (el, j) { el.classList.toggle('on', k === 'konec' || j <= i); });
    var b = $('regBtn');
    b.textContent = { koda: 'Naprej', podatki: 'Naprej', potrdi: 'Potrdi', slika: REG.slika ? 'Naprej' : 'Preskoči', konec: 'Odpri portal' }[k];
    $('regNazaj').classList.toggle('hidden', k === 'slika' || k === 'konec');
    $('regNazaj').textContent = k === 'koda' ? 'Nazaj na prijavo' : 'Nazaj';
    $('regZnova').classList.toggle('hidden', k !== 'potrdi');
    if (k === 'konec') $('authNaslov').textContent = 'Dobrodošli, ' + (REG.ime.split(' ')[0] || '') + '.';
    else if (k === 'slika') $('authNaslov').textContent = 'Vaša fotografija';
    else $('authNaslov').textContent = AUTH_NASLOVI.regForm;
    authMsg('');
    var f = { koda: 'regKoda', podatki: 'regIme', potrdi: 'regOtp' }[k];
    if (f) setTimeout(function () { try { $(f).focus(); } catch (e) {} }, 60);
  }
  function znovaOdstevaj(gumb, stanje) {
    clearInterval(gumb._t);
    var tik = function () {
      var s = Math.ceil((stanje.znovaDo - Date.now()) / 1000);
      gumb.disabled = s > 0; gumb.textContent = s > 0 ? 'Pošlji znova čez ' + s + ' s' : 'Pošlji znova';
      if (s <= 0) clearInterval(gumb._t);
    };
    tik(); gumb._t = setInterval(tik, 1000);
  }
  async function regNaprej() {
    var b = $('regBtn'); if (b.disabled) return;
    var k = REG.korak;
    if (k === 'konec') { b.disabled = true; b.classList.add('nalaga'); try { if (await start() === false) { authMsg(zagonSporocilo(), true); } } finally { b.disabled = false; b.classList.remove('nalaga'); } return; }
    if (k === 'slika') { regKorak('konec'); return; }
    var tok = AUTH_TOK, ziv = function () { return tok === AUTH_TOK; };
    b.disabled = true; b.classList.add('nalaga');
    try {
      if (k === 'koda') {
        var koda = $('regKoda').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (koda.length !== 10) { authMsg('Koda ima 10 znakov.', true); return; }
        var r = await regKlic({ dejanje: 'preveri', koda: koda });
        if (!ziv()) return;
        if (r.napaka) { authMsg(r.napaka, true); return; }
        REG.koda = koda; REG.povabilo = r;
        $('regPovabilo').innerHTML = IKO_KLJUKICA + '<span>' + escape_([r.vlogaIme || roleIme(r.vloga), r.stranka].filter(Boolean).join(' · ')) + '</span>';
        regKorak('podatki');
      } else if (k === 'podatki') {
        var ime = $('regIme').value.trim().replace(/\s+/g, ' '), email = $('regEmail').value.trim().toLowerCase(), geslo = $('regGeslo').value;
        if (ime.length < 2) { authMsg('Vpišite ime in priimek.', true); $('regIme').focus(); return; }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) { authMsg('E-naslov ni veljaven.', true); $('regEmail').focus(); return; }
        var gn = gesloNapaka(geslo); if (gn) { authMsg(gn, true); $('regGeslo').focus(); return; }
        if (email === REG.email && ime === REG.ime && REG.koda === REG.kodaZacni && Date.now() - (REG.poslanoOb || 0) < 14 * 60000) {
          REG.geslo = geslo; $('regOtp').value = ''; $('regGeslo2Polje').classList.add('hidden'); regKorak('potrdi'); znovaOdstevaj($('regZnova'), REG); return;
        }
        var r2 = await regKlic({ dejanje: 'zacni', koda: REG.koda, ime: ime, email: email, geslo: geslo });
        if (!ziv()) return;
        if (r2.napaka) { authMsg(r2.napaka, true); if (r2.polje) { var pf = { ime: 'regIme', email: 'regEmail', geslo: 'regGeslo' }[r2.polje]; if (pf) $(pf).focus(); } return; }
        REG.ime = ime; REG.email = email; REG.geslo = geslo; REG.znovaDo = Date.now() + 60000; REG.poslanoOb = Date.now(); REG.kodaZacni = REG.koda;
        $('regPoslano').innerHTML = 'Koda je na poti na <b>' + escape_(email) + '</b>.';
        $('regGeslo2Polje').classList.add('hidden'); $('regOtp').value = '';
        regKorak('potrdi'); znovaOdstevaj($('regZnova'), REG);
      } else if (k === 'potrdi') {
        var otp = $('regOtp').value.replace(/\D/g, '');
        if (otp.length !== 6) { authMsg('Koda ima 6 števk.', true); $('regOtp').focus(); return; }
        if (!$('regGeslo2Polje').classList.contains('hidden')) {   // strežnik je geslo zavrnil: novo
          var g2 = $('regGeslo2').value, gn2 = gesloNapaka(g2); if (gn2) { authMsg(gn2, true); $('regGeslo2').focus(); return; }
          REG.geslo = g2;
        }
        var r3 = await regKlic({ dejanje: 'potrdi', email: REG.email, koda: otp, geslo: REG.geslo });
        if (!r3.napaka && !ziv()) { pokaziPrijavo(REG.email, 'Račun je ustvarjen. Prijavite se.'); return; }   // oseba je vmes odšla: račun vseeno obstaja
        if (!ziv()) return;
        if (r3.napaka && /ni več veljavna|ni več odprta/i.test(r3.napaka)) REG.poslanoOb = 0;   // Naprej znova pošlje kodo
        if (r3.napaka) {
          authMsg(r3.napaka, true);
          if (r3.polje === 'geslo') { $('regGeslo2Polje').classList.remove('hidden'); $('regGeslo2').value = ''; $('regGeslo2').focus(); }
          else $('regOtp').select();
          return;
        }
        var pr = await sb.auth.signInWithPassword({ email: REG.email, password: REG.geslo });
        if (pr.error) { pokaziPrijavo(REG.email, 'Račun je ustvarjen. Prijavite se.'); return; }
        REG.geslo = '';
        $('regAv').innerHTML = '<span>' + escape_(zacetnice(REG.ime)) + '</span>'; $('regAv').style.backgroundImage = ''; $('regAv').classList.remove('ima');
        regKorak('slika');
      }
    } finally { b.disabled = false; b.classList.remove('nalaga'); }
  }
  // privzeta profilna slika: prva črka imena in priimka (enako v aplikaciji RFID in aplikaciji za spremne liste)
  function zacetnice(ime) {
    var d = String(ime || '').trim().split(/\s+/).filter(Boolean);
    return ((d[0] || '?').charAt(0) + (d.length > 1 ? d[d.length - 1].charAt(0) : '')).toUpperCase();
  }
  if (REG_IMA) $('regForm').addEventListener('submit', function (e) { e.preventDefault(); regNaprej(); });
  if (REG_IMA) $('regOdpri').addEventListener('click', function () { regOdpri(''); });
  if (REG_IMA) $('regNazaj').addEventListener('click', function () {
    AUTH_TOK++;
    if (REG.korak === 'podatki' || REG.korak === 'potrdi') { regKorak(REG.korak === 'potrdi' ? 'podatki' : 'koda'); return; }
    pokaziPrijavo('');
  });
  if (REG_IMA) $('regKoda').addEventListener('input', function (e) { if (e.isComposing) return; var v = kodaPrikaz(this.value); if (v !== this.value) this.value = v; });
  if (REG_IMA) $('regKoda').addEventListener('compositionend', function () { var v = kodaPrikaz(this.value); if (v !== this.value) this.value = v; });
  if (REG_IMA) $('regOtp').addEventListener('input', function () { var v = this.value.replace(/\D/g, '').slice(0, 6); if (v !== this.value) this.value = v; if (v.length === 6 && $('regGeslo2Polje').classList.contains('hidden')) regNaprej(); });
  if (REG_IMA) $('regZnova').addEventListener('click', async function () {
    var g = this; g.disabled = true;
    var r = await regKlic({ dejanje: 'znova', email: REG.email });
    if (r.napaka) { authMsg(r.napaka, true); g.disabled = false; return; }
    REG.znovaDo = Date.now() + 60000; znovaOdstevaj(g, REG); authMsg('Nova koda je na poti.');
  });
  // fotografija: takoj po prijavi (seja obstaja), pomanjšana na 512 px
  if (REG_IMA) $('regAv').addEventListener('click', function () { $('regSlikaDat').click(); });
  if (REG_IMA) $('regSlikaDat').addEventListener('change', async function () {
    var f = this.files && this.files[0]; this.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type)) { authMsg('Izberite sliko.', true); return; }
    var av = $('regAv'), b = $('regBtn');
    av.classList.add('nalaga'); b.disabled = true;
    try {
      var u = (await sb.auth.getUser()).data.user; if (!u) throw new Error('Ni seje.');
      var blob = await pomanjsajSliko(f, 512).catch(function () { return f; });
      var ct = blob.type || 'image/jpeg', pot = u.id + '/avatar.' + (ct === 'image/png' ? 'png' : 'jpg');
      var up = await sb.storage.from('avatars').upload(pot, blob, { upsert: true, contentType: ct, cacheControl: '3600' });
      if (up.error) throw up.error;
      var url = sb.storage.from('avatars').getPublicUrl(pot).data.publicUrl + '?v=' + Date.now();
      var upd = await sb.from('profiles').update({ avatar_url: url }).eq('id', u.id);
      if (upd.error) throw upd.error;
      av.style.backgroundImage = 'url("' + url + '")'; av.classList.add('ima'); REG.slika = true;
      regKorak('slika');
    } catch (e) { authMsg('Fotografije ni bilo mogoče naložiti. Lahko jo dodate pozneje v Mojem računu.', true); }
    finally { av.classList.remove('nalaga'); b.disabled = false; }
  });

  // ── pozabljeno geslo ──
  var GES = { korak: 'email', email: '', znovaDo: 0 };
  function gesloZacni(email) {
    $('profilePicker').classList.add('hidden'); $('authBox').classList.remove('hidden');
    GES = { korak: 'email', email: '', znovaDo: 0 };
    $('gEmail').value = email || ''; $('gOtp').value = ''; $('gGeslo').value = ''; $('gMoc').dataset.m = '';
    showAuthPane('gesloForm'); gesloKorak('email');
  }
  function gesloKorak(k) {
    GES.korak = k;
    document.querySelectorAll('#gesloForm .reg-korak').forEach(function (el) { el.classList.toggle('hidden', el.dataset.korak !== k); });
    $('gBtn').textContent = k === 'email' ? 'Pošlji kodo' : 'Nastavi geslo';
    $('gZnova').classList.toggle('hidden', k !== 'koda');
    $('gNazaj').textContent = k === 'email' ? 'Nazaj na prijavo' : 'Nazaj';
    authMsg('');
    setTimeout(function () { try { $(k === 'email' ? 'gEmail' : 'gOtp').focus(); } catch (e) {} }, 60);
  }
  if (REG_IMA) $('gesloForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var b = $('gBtn'); if (b.disabled) return;
    var tok = AUTH_TOK, ziv = function () { return tok === AUTH_TOK; };
    b.disabled = true; b.classList.add('nalaga');
    try {
      if (GES.korak === 'email') {
        var email = $('gEmail').value.trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) { authMsg('E-naslov ni veljaven.', true); return; }
        var r = await regKlic({ dejanje: 'pozabljeno', email: email });
        if (!ziv()) return;
        if (r.koda === 'NI_EPOSTE') {   // e-pošta s kodo še ni nastavljena (RESEND_API_KEY): povezava prek Supabase kot doslej
          var rp = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
          authMsg(rp.error ? (/rate|limit/i.test(rp.error.message) ? 'Preveč poskusov zapored. Poskusite čez nekaj minut.' : 'Pošiljanje ni uspelo.') : 'Če račun obstaja, je povezava za novo geslo na poti.', !!rp.error);
          return;
        }
        if (r.napaka) { authMsg(r.napaka, true); return; }
        GES.email = email; GES.znovaDo = Date.now() + 60000;
        $('gPoslano').innerHTML = 'Če račun za <b>' + escape_(email) + '</b> obstaja, je koda na poti.';
        gesloKorak('koda'); znovaOdstevaj($('gZnova'), GES);
      } else {
        var otp = $('gOtp').value.replace(/\D/g, ''), geslo = $('gGeslo').value;
        if (otp.length !== 6) { authMsg('Koda ima 6 števk.', true); $('gOtp').focus(); return; }
        var gn = gesloNapaka(geslo); if (gn) { authMsg(gn, true); $('gGeslo').focus(); return; }
        var r2 = await regKlic({ dejanje: 'ponastavi', email: GES.email, koda: otp, geslo: geslo });
        if (!ziv()) return;
        if (r2.napaka) { authMsg(r2.napaka, true); (r2.polje === 'geslo' ? $('gGeslo') : $('gOtp')).focus(); return; }
        var pr = await sb.auth.signInWithPassword({ email: GES.email, password: geslo });
        if (pr.error) { pokaziPrijavo(GES.email, 'Geslo je nastavljeno. Prijavite se.'); return; }
        authMsg('Geslo je nastavljeno.');
        if (await start() === false) authMsg(zagonSporocilo(), true);
      }
    } finally { b.disabled = false; b.classList.remove('nalaga'); }
  });
  if (REG_IMA) $('gNazaj').addEventListener('click', function () { AUTH_TOK++; if (GES.korak === 'koda') { gesloKorak('email'); return; } pokaziPrijavo($('gEmail').value.trim()); });
  if (REG_IMA) $('gOtp').addEventListener('input', function () { var v = this.value.replace(/\D/g, '').slice(0, 6); if (v !== this.value) this.value = v; });
  if (REG_IMA) $('gZnova').addEventListener('click', async function () {
    var g = this; g.disabled = true;
    var r = await regKlic({ dejanje: 'pozabljeno', email: GES.email });
    if (r.napaka) { authMsg(r.napaka, true); g.disabled = false; return; }
    GES.znovaDo = Date.now() + 60000; znovaOdstevaj(g, GES); authMsg('Nova koda je na poti.');
  });
  $('newPwForm').addEventListener('submit', async e => {
    e.preventDefault();
    const m = $('loginMsg'),
      btn = $('newPwBtn');
    const p1 = $('newPw1').value,
      p2 = $('newPw2').value;
    if (p1 !== p2) {
      m.className = 'msg bad show';
      m.textContent = 'Gesli se ne ujemata.';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Shranjujem …';
    const {
      error
    } = await sb.auth.updateUser({
      password: p1
    });
    btn.disabled = false;
    btn.textContent = 'Nastavi geslo';
    if (error) {
      m.className = 'msg bad show';
      m.textContent = /weak|short|password/i.test(error.message) ? 'Geslo je prešibko. Uporabite vsaj 12 znakov, z velikimi in malimi črkami, številko in simbolom.' : 'Ni uspelo: ' + error.message;
      return;
    }
    m.className = 'msg show';
    m.textContent = 'Geslo je nastavljeno. Odpiram portal …';
    setTimeout(start, 900);
  });
  $('logoutBtn').addEventListener('click', async () => {
    ustaviUtrip();
    // Odjava VEDNO popolnoma ukine sejo (kot pri velikih). Ob vrnitvi te spusti noter
    // biometrija (strežniški WebAuthn izda novo sejo) ali geslo. Osvežitev strani te
    // NE odjavi — to ureja obnovitev seje ob nalaganju.
    // samo ta naprava (scope local): privzeto (global) je ukinilo VSE seje uporabnika — tudi tablico
    // v pralnici, ki je nato nehala pošiljati liste, dokler je nekdo ni znova prijavil
    try { await sb.auth.signOut({ scope: 'local' }); } catch (e) {}
    location.reload();
  });

  // Ura in datum na sredini glave
  (function () {
    var el = document.getElementById('clock'); if (!el) return;
    function tick() {
      var d = new Date();
      var cas = d.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
      var dat = d.toLocaleDateString('sl-SI', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      el.innerHTML = '<span class="clk-time">' + cas + '</span><span class="clk-date">' + dat + '</span>';
    }
    tick(); setInterval(tick, 15000);
  })();

  /* ── Prisotnost / zadnja prijava ─────────────────────────────────
     last_login = čas prijave; last_seen = zadnji utrip (na spletu, če < 2 min).
     Uporabimo varno RPC funkcijo, z rezervo na neposredni zapis (osebje sme). */
  var _utripTimer = null;
  // touch_last_login / touch_seen zapišeta čas v profil (security definer, le za prijavljenega);
  // prejšnja dodatna neposredna posodobitev profila je isto zapisala še enkrat (3 pisanja ob vsakem zagonu)
  function zabeleziPrijavo(uid) {
    try { sb.rpc('touch_last_login').then(function () {}, function () {}); } catch (e) {}
  }
  function utripni(uid) {
    try { sb.rpc('touch_seen').then(function () {}, function () {}); } catch (e) {}
  }
  function zacniUtrip(uid) {
    ustaviUtrip();
    utripni(uid);
    _utripTimer = setInterval(function () { if (!document.hidden) utripni(uid); }, 45000);
    document.addEventListener('visibilitychange', _vis);
    function _vis() { if (!document.hidden && JAZ) utripni(JAZ); }
    zacniUtrip._vis = _vis;
  }
  function ustaviUtrip() {
    if (_utripTimer) { clearInterval(_utripTimer); _utripTimer = null; }
    if (zacniUtrip._vis) { document.removeEventListener('visibilitychange', zacniUtrip._vis); zacniUtrip._vis = null; }
  }

  /* ══════════ STANJE ══════════ */
  let JAZ = null,
    JAZIME = '',
    JAZMAIL = '',
    OSEBJE = false,
    MOJEPODJETJE = null;
  var MOJPROFIL = {};
  var APP_VERZIJA = '5.04 · BETA';
  // stran in koda iste različice; sicer (objava v teku, star predpomnilnik) enkrat znova na različico — brez zanke
  (function () {
    var v = APP_VERZIJA.split(' ')[0], k = 'sc-stara-stran';
    try {
      if (_STRAN_V === v) { sessionStorage.removeItem(k); return; }
      if (sessionStorage.getItem(k) === v) return;
      sessionStorage.setItem(k, v); location.reload();
    } catch (e) {}
  })();
  var NALAGANJE = '<div class="sc-load" aria-hidden="true"><span class="sc-load-line"></span></div>';
  // Stale-while-revalidate: ob ponovnem obisku razdelka NE pobriši vsebine v nalagalnik —
  // obdrži prejšnjo (takojšen prikaz) in jo osveži v ozadju. Trak le ob prvem nalaganju.
  function pokaziNalaganje(box) { if (box && !box.dataset.loaded) box.innerHTML = NALAGANJE; }
  var _reloadVal = null;   // vrednost 'reload' ob nalaganju (za potisnjeno osvežitev)
  const JE_LASTNIK = () => (JAZMAIL || '').trim().toLowerCase() === 'filip@eflitte.si';
  // Super admin = lastnik ali profil s super_admin=true. Samo super admin vidi Fakture.
  const JE_SUPER = () => JE_LASTNIK() || !!(MOJPROFIL && MOJPROFIL.super_admin);
  const JE_ZAPOSLENI = () => !OSEBJE && !!(MOJPROFIL && MOJPROFIL.zaposleni);
  // Rang vloge (za hierarhijo urejanja): super=4, admin=3, osebje=2, zaposleni=1, stranka=0.
  function vlogaRang(v) { return v === 'super' ? 4 : v === 'admin' ? 3 : v === 'osebje' ? 2 : v === 'zaposleni' ? 1 : 0; }
  function mojRang() { if (JE_LASTNIK()) return 99; if (MOJPROFIL && MOJPROFIL.super_admin) return 3; if (OSEBJE) return 2; if (JE_ZAPOSLENI()) return 1; return 0; }

  /* ══════════ VLOGE & PRAVICE (Admin — ureja samo lastnik) ══════════ */
  // Razdelki, katerih vidnost/pravice je mogoče nastavljati po vlogah.
  var ADMIN_RAZDELKI = [
    ['domov', 'Domov'], ['dokumenti', 'Dokumenti'], ['prisotnost', 'Prisotnost'], ['stranke', 'Stranke'],
    ['arhiv', 'Spremni listi'], ['cipi', 'Čipi'], ['artikli', 'Cenik & artikli'], ['fakture', 'Fakture'], ['uporabniki', 'Uporabniki'],
    ['statistika', 'Statistika'], ['gorivo', 'Gorivo'], ['konzola', 'Konzola'], ['aplikacija', 'Aplikacije'], ['katalog', 'Katalog']
  ];
  var ADMIN_VLOGE = ['super', 'admin', 'osebje', 'zaposleni', 'stranka'];
  var ADMIN_IMENA_PRIVZ = { super: 'Super admin', admin: 'Admin', osebje: 'Osebje', zaposleni: 'Zaposleni', stranka: 'Stranka' };
  // Privzete vidne pravice (r,w,x,d) — ujemajo se z obstajajočim obnašanjem.
  function _perm(r, w, x, d) { return { r: !!r, w: !!w, x: !!x, d: !!d }; }
  var ADMIN_PRIVZ = {
    super: { cipi: _perm(1, 1, 1, 1), gorivo: _perm(1, 1, 1, 1), domov: _perm(1, 1, 1, 1), prisotnost: _perm(1, 1, 1, 1), arhiv: _perm(1, 1, 1, 1), katalog: _perm(0, 0, 0, 0), statistika: _perm(1, 1, 1, 1), artikli: _perm(1, 1, 1, 1), stranke: _perm(1, 1, 1, 1), dokumenti: _perm(1, 1, 1, 1), aplikacija: _perm(1, 1, 1, 1), fakture: _perm(1, 1, 1, 1), uporabniki: _perm(1, 1, 1, 1) },
    admin: { cipi: _perm(1, 1, 1, 1), gorivo: _perm(1, 1, 1, 1), domov: _perm(1, 1, 1, 1), prisotnost: _perm(1, 1, 1, 1), arhiv: _perm(1, 1, 1, 1), katalog: _perm(0, 0, 0, 0), statistika: _perm(1, 1, 1, 1), artikli: _perm(1, 1, 1, 1), stranke: _perm(1, 1, 1, 1), dokumenti: _perm(1, 1, 1, 1), aplikacija: _perm(1, 1, 1, 1), fakture: _perm(1, 1, 1, 1), uporabniki: _perm(1, 1, 1, 1) },
    osebje: { cipi: _perm(1, 1, 1, 1), gorivo: _perm(0, 0, 0, 0), domov: _perm(1, 1, 1, 1), prisotnost: _perm(1, 1, 1, 1), arhiv: _perm(1, 1, 1, 1), katalog: _perm(0, 0, 0, 0), statistika: _perm(1, 1, 1, 1), artikli: _perm(1, 1, 1, 1), stranke: _perm(1, 1, 1, 1), dokumenti: _perm(1, 1, 1, 1), aplikacija: _perm(1, 1, 1, 1), fakture: _perm(0, 0, 0, 0), uporabniki: _perm(0, 0, 0, 0) },
    zaposleni: { cipi: _perm(0, 0, 0, 0), gorivo: _perm(0, 0, 0, 0), domov: _perm(1, 0, 0, 0), prisotnost: _perm(1, 0, 0, 1), arhiv: _perm(0, 0, 0, 0), katalog: _perm(0, 0, 0, 0), statistika: _perm(0, 0, 0, 0), artikli: _perm(0, 0, 0, 0), stranke: _perm(0, 0, 0, 0), dokumenti: _perm(0, 0, 0, 0), aplikacija: _perm(0, 0, 0, 0), fakture: _perm(0, 0, 0, 0), uporabniki: _perm(0, 0, 0, 0) },
    stranka: { cipi: _perm(0, 0, 0, 0), gorivo: _perm(0, 0, 0, 0), domov: _perm(1, 0, 0, 0), prisotnost: _perm(0, 0, 0, 0), arhiv: _perm(1, 0, 0, 1), katalog: _perm(1, 0, 0, 0), statistika: _perm(0, 0, 0, 0), artikli: _perm(0, 0, 0, 0), stranke: _perm(0, 0, 0, 0), dokumenti: _perm(0, 0, 0, 0), aplikacija: _perm(0, 0, 0, 0), fakture: _perm(0, 0, 0, 0), uporabniki: _perm(0, 0, 0, 0) }
  };
  var ROLE_CFG = null;  // { imena:{...}, perm:{ vloga:{ razdelek:{r,w,x,d} } } }
  function roleIme(v) { return (ROLE_CFG && ROLE_CFG.imena && ROLE_CFG.imena[v]) || ADMIN_IMENA_PRIVZ[v] || v; }
  function rolePerm(v, razdelek, vrsta) {
    var base = (ROLE_CFG && ROLE_CFG.perm && ROLE_CFG.perm[v] && ROLE_CFG.perm[v][razdelek]) || (ADMIN_PRIVZ[v] && ADMIN_PRIVZ[v][razdelek]) || _perm(0, 0, 0, 0);
    return !!base[vrsta || 'r'];
  }
  function mojaVloga() { if (JE_LASTNIK()) return 'super'; if (MOJPROFIL && MOJPROFIL.super_admin) return 'admin'; if (OSEBJE) return 'osebje'; if (JE_ZAPOSLENI()) return 'zaposleni'; return 'stranka'; }
  // Sme trenutni uporabnik? Lastnik vedno; sicer po konfiguraciji vloge.
  function sme(razdelek, vrsta) { if (JE_LASTNIK()) return true; return rolePerm(mojaVloga(), razdelek, vrsta); }
  async function naloziRoleCfg() {
    // POZOR: če to ne uspe, portal MOLČE dela po ADMIN_PRIVZ (privzetih pravicah),
    // zato razlog vedno zabeležimo.
    try {
      var r = await sb.from('app_config').select('vrednost').eq('kljuc', 'role_config').maybeSingle();
      if (r && r.error) throw r.error;
      if (r && r.data && r.data.vrednost) {
        var o = JSON.parse(r.data.vrednost);
        if (o && typeof o === 'object') { ROLE_CFG = o; return; }
        throw new Error('role_config ni veljaven objekt');
      }
    } catch (e) {
      ROLE_CFG = null;
      try { console.warn('[vloge] nastavitev pravic ni bilo mogoče naložiti, veljajo PRIVZETE pravice. Razlog:', (e && e.message) || e); } catch (_) {}
    }
  }
  // Dnevnik sprememb — zapiši dejanje (tiho; če tabele ni, se ne zgodi nič).
  // Napake se ne prikažejo uporabniku, a se zapišejo v konzolo — če dnevnik
  // ostane prazen, tu vidiš razlog (npr. manjka RLS pravilo → zaženi 33_audit_log.sql).
  function logDodaj(razdelek, akcija, opis) {
    try {
      sb.from('audit_log').insert({ razdelek: razdelek, akcija: akcija, opis: (opis || '').slice(0, 500), kdo_ime: JAZIME || JAZMAIL || 'osebje' })
        .then(function (r) { if (r && r.error) { try { console.warn('[audit_log] vpis zavrnjen:', r.error.message || r.error, '— preveri 33_audit_log.sql (RLS/pravice).'); } catch (e) {} } },
              function (e) { try { console.warn('[audit_log] vpis ni uspel:', e); } catch (_) {} });
    } catch (e) {}
  }
  function nastaviWho(ime) {
    $('who').innerHTML = '<span class="who-name">' + escape_(ime || '') + '</span>' + (OSEBJE ? '<span class="who-role">osebje</span>' : '');
  }
  function prvoIme() {
    let n = (JAZIME || '').trim();
    if (!n) return 'ekipa';
    if (n.indexOf('@') >= 0 && n.indexOf(' ') < 0) n = n.split('@')[0];
    n = n.split(/\s+/)[0].replace(/[._-]+/g, ' ').split(' ')[0];
    return n ? n.charAt(0).toUpperCase() + n.slice(1) : 'ekipa';
  }
  let ORGSEZNAM = [],
    ORGIME = {},
    ORGNEAKT = {},          // neaktivne stranke (baza jim ne ustvarja listov iz čipov)
    LISTI = [],
    LISTI_NAPAKA = false,   // true = nalaganje ni uspelo (loči napako od praznega arhiva)
    VSEHLISTOV = 0,
    _softDelDN = true,      // ali obstaja stolpec delivery_notes.deleted_at (migracija 50)
    _softDelDoc = true,     // ali obstaja stolpec documents.deleted_at (migracija 50)
    STAR_SET = new Set();   // note_id-ji, ki vsebujejo star zapis (postavka brez article_id)
  var MANJKA = [], BREZ_LISTA = [], _mkRisi = null;   // številke brez spremnega lista: nerešene in označene z »Ni lista«

  async function naloziOrge() {
    // skrij izbrisane stranke; če stolpca še ni, beri vse. Stranično (brez meje 1000).
    let r = await vseVrstice(function (a, b) { return sb.from('orgs').select('id,name,legal_name,address,vat_id,sort_order,active').is('deleted_at', null).order('name').range(a, b); });
    if (r.error) r = await vseVrstice(function (a, b) { return sb.from('orgs').select('id,name,legal_name,address,vat_id').order('name').range(a, b); });
    // Če tudi rezerva pade, ostane seznam prazen — brez te vrstice je videti kot »ni strank«.
    if (r.error) { try { console.warn('[stranke] seznama strank ni bilo mogoče naložiti:', (r.error.message || r.error)); } catch (_) {} }
    // Vedno po abecedi. orgs.sort_order je ostanek ročnega razvrščanja strank, ki ga v
    // portalu ni več; stare vrednosti so nekatere stranke (npr. Gostišče Jezersko) vlekle na vrh.
    ORGSEZNAM = razvrstiStranke(r.data || [], 'abeceda');
    ORGIME = {}; ORGNEAKT = {};
    ORGSEZNAM.forEach(o => { ORGIME[o.id] = o.name; if (o.active === false) ORGNEAKT[o.id] = 1; });
    return ORGSEZNAM;
  }
  /* ── vlečenje za razvrščanje (miška + dotik), prek namenskega ročaja ── */
  function dndSort(container, itemSel, handleSel, onDrop) {
    if (!container) return;
    container.querySelectorAll(handleSel).forEach(function (handle) {
      if (handle.dataset.dndWired) return;   // varno za večkraten klic (dinamično dodane vrstice)
      handle.dataset.dndWired = '1';
      handle.style.touchAction = 'none';
      handle.addEventListener('pointerdown', function (e) {
        var item = handle.closest(itemSel); if (!item) return;
        e.preventDefault(); e.stopPropagation();
        if (item.setPointerCapture) { try { item.setPointerCapture(e.pointerId); } catch (er) {} }
        var startY = e.clientY, startX = e.clientX;
        var rect = item.getBoundingClientRect();
        var cs = getComputedStyle(item);
        // rezervni prostor (placeholder) na mestu elementa
        var ph = document.createElement(item.tagName);
        ph.className = 'dnd-ph';
        ph.style.height = rect.height + 'px';
        ph.style.margin = cs.margin;
        item.parentNode.insertBefore(ph, item);
        // dvigni element, da sledi kazalcu (brez preračunavanja postavitve seznama)
        item.classList.add('dnd-lift');
        item.style.width = rect.width + 'px';
        item.style.height = rect.height + 'px';
        item.style.position = 'fixed';
        item.style.left = rect.left + 'px';
        item.style.top = rect.top + 'px';
        item.style.margin = '0';
        var moved = false;
        function reals() {
          return [].slice.call(container.querySelectorAll(itemSel)).filter(function (el) { return el !== item && !el.classList.contains('dnd-ph'); });
        }
        function move(ev) {
          moved = true; if (ev.cancelable) ev.preventDefault();
          item.style.transform = 'translate(' + (ev.clientX - startX) + 'px,' + (ev.clientY - startY) + 'px)';
          var list = reals(); if (!list.length) return;
          // ZAZNAVA cilja iz POSTAVITVE (offset*), ne iz getBoundingClientRect —
          // ker transformi med FLIP-animacijo NE vplivajo na offset, se cilj ne trese.
          var op = ph.offsetParent || container;
          var opr = op.getBoundingClientRect();
          var px = ev.clientX - opr.left + op.scrollLeft;
          var py = ev.clientY - opr.top + op.scrollTop;
          var boxes = list.map(function (el) { return { el: el, L: el.offsetLeft, T: el.offsetTop, W: el.offsetWidth, H: el.offsetHeight }; });
          var isGrid = boxes.length > 1 && Math.abs(boxes[0].T - boxes[1].T) < boxes[0].H / 2;
          var target = null;
          for (var i = 0; i < boxes.length; i++) {
            var b = boxes[i], cy = b.T + b.H / 2, cx = b.L + b.W / 2, after;
            if (!isGrid) { after = py < cy; }
            else { after = (b.T > py + 1) || (Math.abs(cy - py) <= b.H / 2 && cx > px); }
            if (after) { target = b.el; break; }
          }
          // če je rezervni prostor že na pravem mestu, ne premikaj (prepreči utripanje)
          var refNow = ph.nextElementSibling; while (refNow === item) { refNow = refNow ? refNow.nextElementSibling : null; }
          if (refNow === (target || null)) return;
          // FLIP: zabeleži prikazane pozicije, premakni placeholder, animiraj razliko
          var before = list.map(function (el) { return el.getBoundingClientRect(); });
          if (target) container.insertBefore(ph, target); else container.appendChild(ph);
          list.forEach(function (el, idx) {
            var nb = el.getBoundingClientRect(); var dX = before[idx].left - nb.left, dY = before[idx].top - nb.top;
            if (dX || dY) { el.style.transition = 'none'; el.style.transform = 'translate(' + dX + 'px,' + dY + 'px)';
              requestAnimationFrame(function () { el.style.transition = 'transform .18s cubic-bezier(.2,0,0,1)'; el.style.transform = ''; }); }
          });
        }
        function up() {
          document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
          // posedi element na mesto placeholderja (mehak doskok — X in Y, tudi v mreži)
          var endRect = ph.getBoundingClientRect();
          item.style.transition = 'transform .18s cubic-bezier(.2,0,0,1)';
          item.style.transform = 'translate(' + (endRect.left - rect.left) + 'px,' + (endRect.top - rect.top) + 'px)';
          var done = function () {
            if (ph.parentNode) ph.parentNode.insertBefore(item, ph);
            if (ph.parentNode) ph.parentNode.removeChild(ph);
            item.classList.remove('dnd-lift');
            item.style.position = ''; item.style.left = ''; item.style.top = ''; item.style.width = '';
            item.style.height = ''; item.style.margin = ''; item.style.transform = ''; item.style.transition = '';
            // počisti morebitne preostale prehode/transforme na sosedih
            reals().forEach(function (el) { el.style.transition = ''; el.style.transform = ''; });
            if (moved && onDrop) onDrop([].slice.call(container.querySelectorAll(itemSel)));
          };
          if (moved) setTimeout(done, 180); else done();
        }
        document.addEventListener('pointermove', move, { passive: false }); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
      });
    });
  }
  var DND_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
  // Drobne ikone v besedilu (namesto znakov ✎ ⚠ ✚ 📁): ena debelina črte, barva iz besedila.
  function ikoT(pot) { return '<svg class="iko-t" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + pot + '</svg>'; }
  var IKO_T_POZOR = ikoT('<path d="M10.3 4.2 2.6 17.6A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-2.9L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4.2M12 16.9v.1"/>');
  var IKO_T_SVINC = ikoT('<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="m13.5 8.5 3 3"/>');
  var IKO_T_PLUS = ikoT('<path d="M12 5v14M5 12h14"/>');
  var IKO_ZAPRI = '<svg class="iko-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M17 7 7 17M7 7l10 10"/></svg>';
  var IKO_NAZAJ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18 9 12l6-6"/></svg>';
  function ikoG(pot) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + pot + '</svg>'; }
  var IKO_TISK = ikoG('<path d="M7 8.5V3.5h10v5"/><rect x="3.5" y="8.5" width="17" height="8.5" rx="2"/><path d="M7 14h10v6.5H7z"/><path d="M17 11.5h.01"/>');
  var IKO_UREDI = ikoG('<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="m13.5 8.5 3 3"/>');
  var IKO_KOS = ikoG('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6"/>');
  var IKO_PRENOS = ikoG('<path d="M12 4v12M7 11l5 5 5-5"/><path d="M5 20h14"/>');
  var IKO_KLJUKICA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
  var IKO_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  var IKO_ZGOD = ikoG('<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4.5V9H8"/><path d="M12 8v4.5l3 2"/>');   // star zapis
  var IKO_KLICAJ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 6.5v7M12 17.5v.01"/></svg>';
  var IKO_TOCKA = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>';
  var IKO_T_NAZAJ = ikoT('<path d="M15 6l-6 6 6 6"/>');
  var IKO_T_MAPA = ikoT('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>');
  // Oceni postavko: RDEČ, če ni izbran artikel; ORANŽEN, če je artikel brez količine.
  function _ocenaPostavke(row) {
    if (!row) return;
    var sel = row.querySelector('[data-pn]'), pk = row.querySelector('[data-pk]');
    var hasArt = !!(sel && (sel.value || '').trim());
    var qv = pk ? (pk.value || '').trim() : '';
    var hasQty = qv !== '' && Number(qv) > 0;
    if (sel) sel.classList.toggle('post-err', !hasArt);
    var btn = row.querySelector('[data-artbtn]'); if (btn) btn.classList.toggle('post-err', !hasArt);   // rdeč okvir na po meri izbirniku
    if (pk) pk.classList.toggle('post-warn', hasArt && !hasQty);
  }
  // Izolirani okvirček z ID izbranega artikla (levo od imena); prazen, dokler ni izbire.
  function _osveziPid(row) {
    if (!row) return;
    var sel = row.querySelector('[data-pn]'), pid = row.querySelector('[data-pid]');
    if (!sel || !pid) return;
    var o = sel.options[sel.selectedIndex] || null;
    pid.textContent = (o && o.value) ? (o.getAttribute('data-koda') || '') : '';
  }
  // Vnos količin kot v Excelu: stolpec količin je ena »kolona«.
  //  Enter / ↓ / Tab → naslednja vrstica · Shift+Enter / ↑ / Shift+Tab → prejšnja
  //  (↑↓ prej spreminjala število — nevarno), Backspace/Delete pobriše CELO število,
  //  lepljenje stolpca iz Excela se razporedi po vrsticah navzdol.
  function _pkSosed(inp, smer) {
    var el = inp && inp.closest ? inp.closest('.ur-post') : null;
    while (el) {
      el = smer > 0 ? el.nextElementSibling : el.previousElementSibling;
      if (el && el.classList && el.classList.contains('ur-post')) return el.querySelector('[data-pk]');
    }
    return null;
  }
  function _pkPojdi(inp, smer) { var n = _pkSosed(inp, smer); if (!n) return false; n.focus(); try { n.select(); } catch (e) {} return true; }
  function _pkEnter(e) {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      if (e.target.value !== '') { e.target.value = ''; e.target.dispatchEvent(new Event('input', { bubbles: true })); }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); _pkPojdi(e.target, e.key === 'ArrowDown' ? 1 : -1); return; }
    if (e.key === 'Tab') { if (_pkPojdi(e.target, e.shiftKey ? -1 : 1)) e.preventDefault(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!_pkPojdi(e.target, e.shiftKey ? -1 : 1)) { try { e.target.blur(); } catch (e3) {} }
  }
  document.addEventListener('paste', function (e) {
    var t = e.target; if (!(t && t.matches && t.matches('.ur-post input[data-pk]'))) return;
    var txt = ((e.clipboardData || window.clipboardData) || { getData: function () { return ''; } }).getData('text') || '';
    var vr = txt.split(/[\r\n\t]+/).map(function (x) { return x.trim(); }).filter(function (x) { return x !== ''; });
    if (vr.length < 2) return;   // ena vrednost: običajno lepljenje
    e.preventDefault();
    var inp = t, n = 0;
    for (var i = 0; i < vr.length && inp; i++) {
      var v = parseInt(vr[i].replace(/[^\d]/g, ''), 10);
      inp.value = isNaN(v) ? '' : String(v); inp.dispatchEvent(new Event('input', { bubbles: true })); n++;
      if (i < vr.length - 1) inp = _pkSosed(inp, 1);
    }
    toast('Prilepljeno: ' + n + (n === 1 ? ' količina' : (n === 2 ? ' količini' : (n < 5 ? ' količine' : ' količin'))) + (n < vr.length ? ' (zmanjkalo je vrstic)' : ''));
  });
  // Ob fokusu količine se CELOTNO število označi — jasno se vidi, katero celico urejaš,
  // tipkanje pa število nadomesti (kot v Excelu). setTimeout, da klik ne razveljavi označbe.
  document.addEventListener('focusin', function (e) {
    var t = e.target;
    if (t && t.matches && t.matches('.ur-post input[data-pk]')) {
      setTimeout(function () { try { t.select(); } catch (e2) {} }, 0);
    }
  });
  // Po meri izdelan izbirnik artikla: skrit <select data-pn> ostane vir resnice (vsa
  // ostala logika bere njega); zgoraj narišemo gumb + meni z ID v okvirčku levo (kot katalog).
  function artPickWire(row) {
    var pick = row && row.querySelector('[data-artpick]'); if (!pick || pick._wired) return;
    var sel = pick.querySelector('[data-pn]'), btn = pick.querySelector('[data-artbtn]'), menu = pick.querySelector('[data-artmenu]');
    if (!sel || !btn || !menu) return;
    pick._wired = true;
    function sync() {
      var o = sel.options[sel.selectedIndex] || null;
      var koda = o ? (o.getAttribute('data-koda') || '') : '';
      var t = btn.querySelector('.ur-artbtn-txt');
      if (o && o.value) t.innerHTML = (koda ? '<span class="ur-opt-id">' + escape_(koda) + '</span>' : '') + '<span class="ur-opt-nm">' + escape_(o.value) + '</span>';
      else t.innerHTML = '<span class="ur-artbtn-ph">' + escape_(o ? o.textContent : '— izberi artikel —') + '</span>';
      btn.classList.toggle('ima', !!(o && o.value));
    }
    function zapri() { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', vzunaj, true); }
    function vzunaj(e) { if (!pick.contains(e.target)) zapri(); }
    function odpri() {
      var html = '';
      for (var i = 0; i < sel.options.length; i++) {
        var o = sel.options[i];
        var koda = o.getAttribute('data-koda') || '';
        var ime = o.value || o.textContent;
        html += '<button type="button" class="ur-artopt' + (i === sel.selectedIndex ? ' sel' : '') + '" role="option" data-i="' + i + '">' +
          '<span class="ur-opt-id' + (koda ? '' : ' prazno') + '">' + escape_(koda) + '</span>' +
          '<span class="ur-opt-nm">' + escape_(ime) + '</span></button>';
      }
      menu.innerHTML = html; menu.hidden = false; btn.setAttribute('aria-expanded', 'true');
      var s = menu.querySelector('.ur-artopt.sel'); if (s) { try { s.scrollIntoView({ block: 'nearest' }); } catch (e) {} }
      setTimeout(function () { document.addEventListener('click', vzunaj, true); }, 0);
    }
    btn.addEventListener('click', function (e) { e.stopPropagation(); if (menu.hidden) odpri(); else zapri(); });
    menu.addEventListener('click', function (e) {
      var it = e.target.closest ? e.target.closest('.ur-artopt') : null; if (!it) return;
      sel.selectedIndex = parseInt(it.getAttribute('data-i'), 10);
      zapri();
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      sync();
    });
    sel.addEventListener('change', sync);
    sync();
  }
  // Ključ artikla v vrstici (sifra > article_id > ime) — za zaznavo dvojnikov.
  function _artKljuc(row) {
    var sel = row && row.querySelector('[data-pn]'); if (!sel) return '';
    var opt = sel.selectedOptions && sel.selectedOptions[0];
    var sif = opt && opt.dataset.sifra ? opt.dataset.sifra : '';
    var aid = opt && opt.dataset.aid ? opt.dataset.aid : '';
    var nm = (sel.value || '').trim().toLowerCase();
    if (sif) return 's' + sif; if (aid) return 'a' + aid; return nm ? ('n' + nm) : '';
  }
  // Če je isti artikel že v drugi vrstici: scrolla do nje, obrobo utripne in vrne true.
  function _dvojnikArtikla(row) {
    var k = _artKljuc(row); if (!k) return false;
    var cont = row.closest('[data-postavke]') || row.parentNode; if (!cont) return false;
    var rows = [].slice.call(cont.querySelectorAll('.ur-post'));
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] === row) continue;
      if (_artKljuc(rows[i]) === k) {
        var obst = rows[i];
        try { obst.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
        obst.classList.remove('post-flash'); void obst.offsetWidth; obst.classList.add('post-flash');
        setTimeout(function () { obst.classList.remove('post-flash'); }, 1400);
        return true;
      }
    }
    return false;
  }
  var EYE_ON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="2.6"/></svg>';
  var EYE_OFF = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 4l16 16"/><path d="M9.5 5.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.6"/><path d="M6.2 7.3A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 3.3-.6"/></svg>';

  /* ══════════ ZAGON ══════════ */
  // umakni zagonski zaslon; trak povezave (če je prižgan) gre iz njega v glavo
  function zagonKonec() {
    try { if (window.__SC) window.__SC.zaganjam = false; } catch (e) {}
    try { if (window.scBootDone) window.scBootDone(); } catch (e) {}
    if (POV.stanje !== 'ok') povRisi();
  }
  // Vrne false, če uporabnika ni mogoče preveriti (ni povezave, seja potekla/preklicana);
  // razlog je v ZAGON_NAPAKA. Prej je tiho končala in portal je obstal na golem
  // prijavnem zaslonu (»Peremo, vi pa blestite.«) brez obrazca.
  var ZAGON_NAPAKA = null;
  async function start() {
    ZAGON_NAPAKA = null;
    let _gu = null;
    // brez povezave (ali osvežitev seje ne uspe zaradi omrežja): zagonski zaslon pove stanje in počaka — ne prijava
    for (;;) {
      try { _gu = await sb.auth.getUser(); } catch (e) { if (jeOmreznaNapaka(e)) { await povPocakaj(1500); continue; } ZAGON_NAPAKA = e; return false; }
      if (_gu && _gu.error && jeOmreznaNapaka(_gu.error)) { await povPocakaj(1500); continue; }
      break;
    }
    const user = _gu && _gu.data && _gu.data.user;
    if (!user) { ZAGON_NAPAKA = (_gu && _gu.error) || new Error('ni uporabnika'); return false; }
    JAZ = user.id;
    let profil = null;
    { const _pr = await sb.from('profiles').select('full_name,is_staff,super_admin,zaposleni,nastavitve,avatar_url,phone,contact_email').eq('id', user.id).maybeSingle();
      profil = _pr && _pr.data ? _pr.data : null;
      if (_pr && _pr.error) { const _pr2 = await sb.from('profiles').select('full_name,is_staff').eq('id', user.id).maybeSingle(); profil = _pr2 && _pr2.data ? _pr2.data : null; } }
    MOJPROFIL = profil || {};
    prednaloziAvatar(MOJPROFIL.avatar_url);   // Moj račun: slika je ob odprtju že naložena in dekodirana
    // uveljavi sinhronizirane nastavitve (tema, pogled, vrstni red menija, razvrstitve)
    if (profil && profil.nastavitve) { uporabiNastavitve(profil.nastavitve); uporabiTemo(); oznaciTemo(); uporabiPogled(); osveziPogledSege(); }
    OSEBJE = !!(profil !== null && profil !== void 0 && profil.is_staff);
    nastaviWho((profil && profil.full_name) || user.email);
    JAZIME = (profil && profil.full_name) || user.email;
    JAZMAIL = user.email || '';
    zapomniProfil({ email: user.email, name: JAZIME, avatar: (profil && profil.avatar_url) || '', uid: user.id });
    $('racunPod').textContent = user.email;
    /* Zabeleži čas te prijave in začni sporočati prisotnost (kdo je na spletu). */
    zabeleziPrijavo(user.id);
    zacniUtrip(user.id);
    /* Naslov nastavimo že pred prikazom, da za trenutek ne utripne »Pregled«. */
    if ($('domovNaslov')) $('domovNaslov').textContent = OSEBJE ? (pozdrav() + ', ' + prvoIme()) : 'Vaš pregled';
    if (window.scBootZnova && window.scBootZnova()) await new Promise(ok => setTimeout(ok, 220));   // po prijavi se nalagalni zaslon pretopi čez prijavo (ob zagonu je že prikazan)
    $('auth').style.display = 'none';
    $('app').classList.add('show');
    if (POV.stanje !== 'ok') povRisi();   // trak iz (zdaj skrite) glave prijave v glavo portala
    await naloziOrge();
    if (!OSEBJE && ORGSEZNAM.length === 1) MOJEPODJETJE = ORGSEZNAM[0];
    try { await naloziRoleCfg(); } catch (e) {}
    meni();
    await naloziListe();
    pojdi(zacetniRazdelek());   // ob ponovnem nalaganju ostane isti razdelek (#arhiv …), sicer Domov
    // Portal je sestavljen in prva stran izrisana → gladko umakni zagonski zaslon.
    try { requestAnimationFrame(zagonKonec); } catch (e) { zagonKonec(); }
    zazeniCustomSelecte();
    try { pokaziObvestila(); } catch (e) {}
    try { narociObvestila(); } catch (e) {}
    try { narociZivo(); } catch (e) {}
    try { preberiReload(); } catch (e) {}
    try { morebitiPromoBio(); } catch (e) {}
    // V OZADJU prednaloži razdelke, do katerih ima uporabnik dostop, da se ob
    // kliku odprejo TAKOJ (brez nalagalnega traku). Zamik, da ne moti prvega izrisa.
    try { setTimeout(prednaloziRazdelke, 700); } catch (e) {}
  }
  // Prednalaganje: renderira razdelke v skrite bloke (nastavi dataset.loaded), zamaknjeno,
  // da ne pošljemo vseh poizvedb naenkrat. Napake tiho spregleda.
  function prednaloziRazdelke() {
    if (!zmBeri().vnaprej) return;   // Zmogljivost: brez nalaganja vnaprej (razdelek se naloži ob odprtju)
    var op = [];
    try {
      if (OSEBJE) {
        op.push(risiArhiv);
        if (sme('prisotnost', 'r')) op.push(risiPrisotnost);
        if (sme('statistika', 'r')) op.push(function () { return risiUcinek(true); });
        if (sme('stranke', 'r')) op.push(risiStranke);
        if (sme('artikli', 'r')) op.push(risiArtikli);
        if (JE_SUPER()) op.push(risiFakture);
        if (sme('uporabniki', 'r')) op.push(loadUsers);
        if (sme('dokumenti', 'r')) op.push(function () { return risiDokumenti(true); });
        if (sme('cipi', 'r')) op.push(function () { return risiCipe(true); });
      } else if (JE_ZAPOSLENI()) {
        op.push(risiPrisotnost);
      } else if (MOJEPODJETJE) {
        op.push(risiKatalog);
      }
    } catch (e) {}
    var i = 0;
    (function naprej() {
      if (i >= op.length) return;
      var fn = op[i++];
      try { Promise.resolve(fn()).catch(function () {}); } catch (e) {}
      setTimeout(naprej, 450);   // zamik med razdelki
    })();
  }

  /* ══════════ STRANSKI MENI ══════════ */
  const IKONE = {
    domov: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/>',
    arhiv: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v10.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V8"/><path d="M10 12h4"/>',
    stranke: '<path d="M3 20h18"/><path d="M5 20V6l7-3 7 3v14"/><path d="M9.5 20v-4h5v4"/>',
    katalog: '<path d="M4 5.5h7v13H4Z"/><path d="M13 5.5h7v13h-7Z"/>',
    uporabniki: '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17.5" cy="10" r="2.4"/><path d="M15.5 19a4.5 4.5 0 0 1 5-4.4"/>',
    racun: '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
    uvoz: '<path d="M12 3v11"/><path d="M8 10.5 12 14.5l4-4"/><path d="M4 16v3.5h16V16"/>',
    fakture: '<path d="M6 3h9l3 3v15l-2.5-1.5L13 22l-2.5-1.5L8 22l-2-1.5L6 3Z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    statistika: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="7" rx="1"/><rect x="12" y="7" width="3" height="11" rx="1"/><rect x="17" y="14" width="3" height="4" rx="1"/>',
    ceniki: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V4a1 1 0 0 1 1-1h8a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6Z"/><circle cx="7.5" cy="7.5" r="1.4"/>',
    prijave: '<circle cx="12" cy="8" r="3.4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/><path d="M12 8v0"/>',
    prisotnost: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    ucinek: '<path d="M4 15a8 8 0 0 1 16 0"/><path d="M12 15l4-4"/><circle cx="12" cy="15" r="1.3"/>',
    artikli: '<path d="M3 12l8.5-8.5a2 2 0 0 1 1.4-.5H19a2 2 0 0 1 2 2v6.1a2 2 0 0 1-.6 1.4L12 21Z"/><circle cx="16.5" cy="7.5" r="1.3"/>',
    aplikacija: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 5.5h3"/><path d="M12 18.2h.01"/>',
    dokumenti: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/>',
    cipi: '<path d="M9 8.5a5 5 0 0 1 0 7"/><path d="M12.5 6a8.5 8.5 0 0 1 0 12"/><path d="M16 3.5a12 12 0 0 1 0 17"/><circle cx="5.5" cy="12" r="1.3"/>',
    konzola: '<path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1Z"/><path d="M15 8a4 4 0 0 1 0 8"/><path d="M18 5a8 8 0 0 1 0 14"/>',
    nastavitve: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    admin: '<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path d="M9.5 12.2l1.8 1.8 3.4-3.6"/>',
    gorivo: '<path d="M4 20V5.5A1.5 1.5 0 0 1 5.5 4h6A1.5 1.5 0 0 1 13 5.5V20"/><path d="M3 20h11"/><path d="M6 8h4"/><path d="M13 10h3.5a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 0 3 0V9l-2.5-2.5"/>'
  };
  const ikona = k => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' + 'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IKONE[k] + '</svg>';
  // Osnovni (privzeti) glavni razdelki menija za trenutnega uporabnika.
  function glavniMeni() {
    // Lastnik: vedno vse (Admin ureja pravice ostalih, sebi jih ne more odvzeti).
    if (JE_LASTNIK()) {
      return [['domov', 'Domov'], ['dokumenti', 'Dokumenti'], ['prisotnost', 'Prisotnost'], ['stranke', 'Stranke'],
        ['arhiv', 'Spremni listi'], ['cipi', 'Čipi'], ['artikli', 'Cenik & artikli'], ['fakture', 'Fakture'], ['uporabniki', 'Uporabniki'],
        ['statistika', 'Statistika']];
    }
    // Ostali: vidnost razdelkov po pravicah vloge (nastavljivo v Admin).
    var vl = mojaVloga(), out = [];
    ADMIN_RAZDELKI.forEach(function (s) { if (s[0] !== 'konzola' && s[0] !== 'aplikacija' && rolePerm(vl, s[0], 'r')) out.push(s); });
    if (!out.some(function (x) { return x[0] === 'domov'; })) out.unshift(['domov', 'Domov']);
    // Gorivo je zavihek v Statistiki (samostojno v meniju le, če Statistike ne sme videti)
    if (out.some(function (x) { return x[0] === 'statistika'; })) out = out.filter(function (x) { return x[0] !== 'gorivo'; });
    return out;
  }
  // Sorodni razdelki so en vnos v meniju z zavihki na vrhu razdelka (meni 15 → 11).
  var SKUPINE = {
    uporabniki: { ime: 'Uporabniki', clani: [['uporabniki', 'Uporabniki'], ['admin', 'Admin'], ['konzola', 'Konzola']] },
    statistika: { ime: 'Statistika', clani: [['statistika', 'Statistika'], ['gorivo', 'Gorivo']] },
    nastavitve: { ime: 'Nastavitve', clani: [['nastavitve', 'Splošno'], ['racun', 'Moj račun'], ['aplikacija', 'Aplikacije']] }
  };
  function smeRazdelek(k) {
    if (k === 'admin' || k === 'konzola') return JE_LASTNIK();
    if (k === 'racun') return true;
    if (k === 'nastavitve') return OSEBJE || JE_LASTNIK();
    if (JE_ZAPOSLENI()) return false;
    return sme(k, 'r');
  }
  function claniSkupine(g) { return SKUPINE[g] ? SKUPINE[g].clani.filter(function (x) { return smeRazdelek(x[0]); }) : []; }
  function skupinaOd(k) { for (var g in SKUPINE) { if (SKUPINE[g].clani.some(function (x) { return x[0] === k; })) return g; } return k; }
  // Zavihki skupine na vrhu razdelka (pod naslovom); naslov razdelka = ime skupine.
  function risiSkupino(kam) {
    var g = skupinaOd(kam), clani = claniSkupine(g), sec = document.getElementById('sec-' + kam); if (!sec) return;
    var h2 = sec.querySelector('.head h2'), tabs = sec.querySelector('.sk-tabs');
    if (h2 && !h2.dataset.izv) h2.dataset.izv = h2.textContent;
    if (!SKUPINE[g] || clani.length < 2) { if (tabs) tabs.remove(); if (h2) h2.textContent = h2.dataset.izv; return; }
    if (h2) h2.textContent = SKUPINE[g].ime;
    if (!tabs) { tabs = document.createElement('div'); tabs.className = 'pris-tabs sk-tabs'; tabs.setAttribute('role', 'tablist'); sec.querySelector('.head').insertAdjacentElement('afterend', tabs); }
    tabs.innerHTML = clani.map(function (x) { return '<button type="button" role="tab" class="pris-tab' + (x[0] === kam ? ' on' : '') + '" aria-selected="' + (x[0] === kam) + '" data-sk="' + x[0] + '">' + escape_(x[1]) + '</button>'; }).join('');
  }
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.sk-tabs [data-sk]'); if (b && !b.classList.contains('on')) pojdi(b.dataset.sk); });
  // Bližnjice (računalnik): »/« ali Ctrl/⌘+K = iskanje na strani, »N« = glavno dejanje strani (Nov …).
  // Ne med tipkanjem v polje in ne, ko je odprto okno ali potrditev.
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.isComposing) return;
    var t = e.target, tip = t && (t.tagName || '');
    if (tip === 'INPUT' || tip === 'TEXTAREA' || tip === 'SELECT' || (t && t.isContentEditable)) return;
    if (_okno || document.querySelector('.sc-modal-back, .dok-lb')) return;
    var sec = document.querySelector('.sec:not(.hidden)'); if (!sec) return;
    var iskanje = (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) || ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K'));
    if (iskanje) {
      var f = sec.querySelector('.filtri input[type="search"], .filtri input[type="text"], .head input[type="search"]');
      if (f && f.offsetParent) { e.preventDefault(); f.focus(); f.select && f.select(); }
      return;
    }
    if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      var g = sec.querySelector('.head-akc .btn.tb-prim');
      if (g && g.offsetParent && !g.disabled) { e.preventDefault(); g.click(); }
    }
  });
  function menijVrstni() { try { return JSON.parse(localStorage.getItem('sc-menu-order') || '[]') || []; } catch (e) { return []; } }
  // Uporabi shranjeni vrstni red; nove razdelke pripni na konec, neveljavne izpusti.
  // »Pregled« (domov) je vedno prvi in ga ni mogoče premakniti.
  function urediGlavni(g) {
    var ord = menijVrstni();
    var out;
    if (!ord.length) { out = g.slice(); }
    else {
      var poK = {}; g.forEach(function (x) { poK[x[0]] = x; });
      out = [];
      ord.forEach(function (k) { if (poK[k]) { out.push(poK[k]); delete poK[k]; } });
      g.forEach(function (x) { if (poK[x[0]]) out.push(x); });
    }
    // Prisili »domov« na prvo mesto.
    var di = out.findIndex(function (x) { return x[0] === 'domov'; });
    if (di > 0) { var d = out.splice(di, 1)[0]; out.unshift(d); }
    return out;
  }
  function meni() {
    let glavni, nast;
    glavni = urediGlavni(glavniMeni());
    var _ns = claniSkupine('nastavitve');
    nast = _ns.length > 1 ? [[_ns[0][0], 'Nastavitve', 'nastavitve']] : [['racun', 'Moj račun']];
    const veja = ([k, l, ik]) => `<a data-go="${k}">${ikona(ik || k)}${l}</a>`;
    $('side').innerHTML = '<span class="side-slider" aria-hidden="true"></span>' + glavni.map(veja).join('') + '<div class="side-sep"></div>' + nast.map(veja).join('') +
      '<div class="side-foot"><button type="button" class="side-ver" title="Kaj je novega — vse posodobitve">Različica ' + escape_(APP_VERZIJA) + '</button><a class="side-eflitte" href="https://eflitte.si" target="_blank" rel="noopener" aria-label="Izdelava eflitte">Izdelava <svg class="ef-logo" viewBox="0 0 437.86 136.56" aria-hidden="true"><use href="#efLogo"/></svg></a></div>';
    const _side = $('side');
    const _sl = _side.querySelector('.side-slider');
    const premakniDrsnik = a => {
      if (!_sl || !a) return;
      _sl.style.transform = 'translateY(' + a.offsetTop + 'px)';
      _sl.style.left = a.offsetLeft + 'px';
      _sl.style.width = a.offsetWidth + 'px';
      _sl.style.height = a.offsetHeight + 'px';
      _side.classList.add('sl-on');
    };
    meni._drsnik = () => { premakniDrsnik(_side.querySelector('a.on')); };
    _side.querySelectorAll('a[data-go]').forEach(a => {
      a.addEventListener('click', () => { pojdi(a.dataset.go); zapriMeni(); });
      a.addEventListener('mouseenter', () => premakniDrsnik(a));
    });
    _side.addEventListener('mouseleave', () => meni._drsnik());
  }
  function zapriMeni() {
    $('side').classList.remove('on');
    $('scrim').classList.remove('on');
    $('burger').classList.remove('open');
    $('burger').setAttribute('aria-expanded', 'false');
    document.body.classList.remove('meni-odprt');
  }
  $('burger').addEventListener('click', () => {
    const on = $('side').classList.toggle('on');
    $('scrim').classList.toggle('on', on);
    $('burger').classList.toggle('open', on);
    $('burger').setAttribute('aria-expanded', on ? 'true' : 'false');
    document.body.classList.toggle('meni-odprt', on);
  });
  $('scrim').addEventListener('click', zapriMeni);
  // ── Prijava na nizkih telefonih: ob dotiku polja se slogan skrije, da polja ostanejo nad tipkovnico ──
  // (iPhone bi sicer stran ob vsakem polju premaknil gor in nazaj dol). Samo ob dotiku — ne ob
  // samodejnem fokusu ob odprtju; med poljema (Naprej) razred ostane.
  (function () {
    var a = $('auth'); if (!a) return;
    var dotik = 0, ura = null;
    var jePolje = function (x) { return x && /^(INPUT|TEXTAREA|SELECT)$/.test(x.tagName); };
    a.addEventListener('touchstart', function (e) { if (jePolje(e.target)) dotik = Date.now(); }, { passive: true, capture: true });
    a.addEventListener('focusin', function (e) {
      if (!jePolje(e.target)) return;
      clearTimeout(ura);
      if (Date.now() - dotik < 1200 && window.innerHeight < 780) a.classList.add('auth-tipk');
    });
    a.addEventListener('focusout', function () {
      clearTimeout(ura);
      ura = setTimeout(function () { if (!jePolje(document.activeElement) || !a.contains(document.activeElement)) a.classList.remove('auth-tipk'); }, 300);
    });
  })();
  // ── Prijava: naslovnica je svila, ki počasi valovi (WebGL), v tonih teme. Riše le, ko je vidna (po prijavi
  // sprosti sliko); manj gibanja (Varčno, sistemska želja) → en mirujoč posnetek; brez WebGL ostane podlaga. ──
  (function () {
    var cv = document.querySelector('.auth-svila'); if (!cv) return;
    // senca, sredina, luč, odsev, zastor pod sloganom; moč odseva, sijaj pobočij, vinjeta, moč zastora — temna in svetla tema
    var TEMI = [
      [[1, 2, 2], [14, 17, 16], [74, 81, 78], [226, 238, 232], [1, 2, 2], .7, .1, .2, .62],
      [[180, 186, 183], [228, 231, 230], [250, 251, 251], [255, 255, 255], [248, 249, 249], .4, .1, .1, .66]
    ];
    var FS = [
      '#ifdef GL_FRAGMENT_PRECISION_HIGH', 'precision highp float;', '#else', 'precision mediump float;', '#endif',
      'uniform vec2 uR;uniform float uT,uI,uB,uV,uZa;uniform vec3 uS,uM,uL,uH,uZ;',
      // višina tkanine: gube čez smer u, vzdolž v počasi vijugajo
      'float vis(vec2 p,float t){',
      '  float u=p.x*.80+p.y*.60, v=-p.x*.60+p.y*.80;',
      '  float w=sin(v*1.05+t*.9)*.55+sin(v*.42-t*.6+1.3)*.95;',
      '  return sin(u*2.2+w)*.5+sin(u*1.0-w*.7+t*.35)*.85+sin(u*4.4+w*1.6-t*.5)*.07;',
      '}',
      'void main(){',
      '  vec2 du=vec2(.80,.60), dv=vec2(-.60,.80);',
      '  vec2 p=(gl_FragCoord.xy-.5*uR)/max(uR.x,uR.y)*6.;',
      '  float e=.003, h=vis(p,uT);',
      '  float hu=(vis(p+du*e,uT)-h)/e, hv=(vis(p+dv*e,uT)-h)/e;',
      // odsev raztegnjen vzdolž gub (kot pri svili): naklon vzdolž gube šteje manj
      '  vec3 m=normalize(vec3(-hu*2.2,-hv*.55,1.));',
      '  vec3 n=vec3(m.x*du+m.y*dv,m.z);',
      '  vec3 L=normalize(vec3(-.45,.62,.64));',
      '  float d=dot(n,L)*.5+.5; d=d*d*(3.-2.*d);',
      '  float nh=max(dot(n,normalize(L+vec3(0.,0.,1.))),0.);',
      '  vec3 c=mix(uS,uM,d); c=mix(c,uL,smoothstep(.55,1.,d)*.7+pow(1.-n.z,2.)*uB);',
      '  c+=uH*(pow(nh,60.)*uI+pow(nh,10.8)*.12);',
      '  vec2 g=gl_FragCoord.xy/uR; c*=1.-uV+uV*smoothstep(1.25,.15,length(g-vec2(.62,.70)));',
      // zastor spodaj levo, da je slogan berljiv tudi, ko čezenj zdrsne odsev
      '  c=mix(c,uZ,(1.-smoothstep(0.,.66,g.y))*(1.-.5*smoothstep(.3,1.,g.x))*uZa);',
      // tresenje proti stopnicam v prelivih
      '  c+=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)/255.;',
      '  gl_FragColor=vec4(c,1.);',
      '}'].join('\n');
    var gl = null, U = {}, zanka = 0, zadnji = 0, t0 = 0, tema = null, vidna = false, sw = 0, sh = 0;
    var svetla = function () { return document.documentElement.getAttribute('data-theme') === 'light' ? 1 : 0; };
    function zacni() {
      try { gl = cv.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' }); } catch (e) { gl = null; }
      if (!gl) return false;
      var senc = function (vrsta, izv) { var o = gl.createShader(vrsta); gl.shaderSource(o, izv); gl.compileShader(o); return gl.getShaderParameter(o, gl.COMPILE_STATUS) ? o : null; };
      var vs = senc(gl.VERTEX_SHADER, 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}'), fs = senc(gl.FRAGMENT_SHADER, FS);
      if (!vs || !fs) { gl = null; return false; }
      var pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { gl = null; return false; }
      gl.useProgram(pr);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // en trikotnik čez celo platno
      var a = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      ['uR', 'uT', 'uI', 'uB', 'uV', 'uZa', 'uS', 'uM', 'uL', 'uH', 'uZ'].forEach(function (k) { U[k] = gl.getUniformLocation(pr, k); });
      sw = sh = 0;
      return true;
    }
    function narisi(zdaj) {
      if (!gl || gl.isContextLost()) return;
      var w = cv.clientWidth, h = cv.clientHeight; if (w < 2 || h < 2) return;
      var k = Math.max(1, Math.min(2, window.devicePixelRatio || 1) * .65);   // svila je mehka: manjša ločljivost zadošča
      var W = Math.round(w * k), H = Math.round(h * k);
      if (W !== sw || H !== sh) { cv.width = sw = W; cv.height = sh = H; gl.viewport(0, 0, W, H); }
      // prehod teme sledi žetonom (.32 s), brez skoka
      var cilj = svetla(), dt = zadnji ? Math.min(.1, (zdaj - zadnji) / 1000) : 1;
      tema = tema == null || manjGibanja() ? cilj : tema + Math.max(-dt / .32, Math.min(dt / .32, cilj - tema));
      var m = function (i) { var A = TEMI[0][i], B = TEMI[1][i]; return typeof A === 'number' ? A + (B - A) * tema : [0, 1, 2].map(function (j) { return (A[j] + (B[j] - A[j]) * tema) / 255; }); };
      gl.uniform2f(U.uR, W, H);
      gl.uniform1f(U.uT, 1 + (manjGibanja() ? 0 : ((zdaj - t0) / 1000) * .07 % 600));
      gl.uniform3fv(U.uS, m(0)); gl.uniform3fv(U.uM, m(1)); gl.uniform3fv(U.uL, m(2)); gl.uniform3fv(U.uH, m(3)); gl.uniform3fv(U.uZ, m(4));
      gl.uniform1f(U.uI, m(5)); gl.uniform1f(U.uB, m(6)); gl.uniform1f(U.uV, m(7)); gl.uniform1f(U.uZa, m(8));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      zadnji = zdaj;
      if (!cv.classList.contains('ziva')) cv.classList.add('ziva');
    }
    function korak(zdaj) {
      zanka = 0;
      if (!vidna || !gl) return;
      if (zdaj - zadnji >= 30 || tema !== svetla()) narisi(zdaj);   // ~30 sličic na sekundo zadošča za počasno valovanje
      if (!manjGibanja() || tema !== svetla()) zanka = requestAnimationFrame(korak);
    }
    function pozeni() { if (!zanka && vidna && gl) zanka = requestAnimationFrame(korak); }
    if (!zacni()) return;
    t0 = performance.now();
    cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); if (zanka) cancelAnimationFrame(zanka); zanka = 0; });
    cv.addEventListener('webglcontextrestored', function () { if (zacni()) { zadnji = 0; pozeni(); } });
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (v) {
        vidna = v[v.length - 1].isIntersecting;
        if (vidna) { zadnji = 0; pozeni(); }
        else if ($('auth').style.display === 'none') { cv.width = cv.height = 1; sw = sh = 0; }   // portal odprt: sprosti sliko
      }).observe(cv);
    } else { vidna = true; pozeni(); }
    if (window.ResizeObserver) new ResizeObserver(function () { if (manjGibanja()) { zadnji = 0; pozeni(); } }).observe(cv);
    new MutationObserver(pozeni).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  })();
  // ── Različica v meniju: pritisk pokaže vse posodobitve (spremembe.json, ob objavi dodaj vnos) ──
  var _spremembeOdpiram = false;
  async function odpriSpremembe() {
    if (_spremembeOdpiram || document.querySelector('.spr-modal')) return;
    _spremembeOdpiram = true;
    var seznam;
    try {
      var r = await fetch('spremembe.json?v=' + encodeURIComponent(APP_VERZIJA), { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      seznam = await r.json();
    } catch (e) { toast('Seznama posodobitev ni bilo mogoče naložiti.'); return; }
    finally { _spremembeOdpiram = false; }
    zapriMeni();
    var zdaj = String(APP_VERZIJA).split(' ')[0];
    var dat = function (d) { var p = String(d || '').split('-'); return p.length === 3 ? (+p[2]) + '. ' + (+p[1]) + '. ' + p[0] : ''; };
    // čas objave po slovenskem času s časovnim pasom: »20. 10. 2026 ob 19:58 · CEST (UTC+2)«
    var casObjave = function (x) {
      var t = x.c ? new Date(x.c) : null; if (!t || isNaN(t)) return dat(x.d);
      var tz = 'Europe/Ljubljana', oz = '';
      try {
        var off = (new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(t).find(function (p) { return p.type === 'timeZoneName'; }) || {}).value || '';
        var m = /GMT([+-]\d+)/.exec(off), u = m ? +m[1] : null;
        oz = u === 2 ? 'CEST (UTC+2)' : u === 1 ? 'CET (UTC+1)' : off;
      } catch (e) {}
      return t.toLocaleDateString('sl-SI', { timeZone: tz, day: 'numeric', month: 'numeric', year: 'numeric' }) + ' ob ' +
        t.toLocaleTimeString('sl-SI', { timeZone: tz, hour: '2-digit', minute: '2-digit' }) + (oz ? ' · ' + oz : '');
    };
    var back = document.createElement('div'); back.className = 'sc-modal-back';
    back.innerHTML = '<div class="sc-modal spr-modal" role="dialog" aria-modal="true" aria-label="Posodobitve">' +
      '<div class="spr-glava"><h4>Posodobitve</h4><button type="button" class="spr-x" aria-label="Zapri">' + IKO_ZAPRI + '</button></div>' +
      '<p class="spr-pod">Trenutna različica ' + escape_(APP_VERZIJA) + '</p>' +
      '<div class="spr-seznam">' + (Array.isArray(seznam) ? seznam : []).map(function (x) {
        var tr = String(x.v) === zdaj;
        return '<section class="spr-v' + (tr ? ' zdaj' : '') + '"><div class="spr-vh"><b>' + escape_(String(x.v)) + '</b>' + (tr ? '<span class="spr-oz">Trenutna</span>' : '') +
          '<span class="spr-d">' + escape_(casObjave(x)) + '</span></div>' +
          '<ul>' + (x.t || []).map(function (t) { return '<li>' + escape_(String(t)) + '</li>'; }).join('') + '</ul></section>';
      }).join('') + '</div></div>';
    document.body.appendChild(back);
    requestAnimationFrame(function () { back.classList.add('show'); });
    function zapri() { back.classList.remove('show'); document.removeEventListener('keydown', onKey); setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); }
    function onKey(e) { if (e.key === 'Escape') zapri(); }
    document.addEventListener('keydown', onKey);
    back.querySelector('.spr-x').addEventListener('click', zapri);
    back.addEventListener('click', function (e) { if (e.target === back) zapri(); });
  }
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.side-ver')) odpriSpremembe(); });
  // Klik na logotip (zgoraj levo) → Domov.
  { var _hl = $('homeLogo'); if (_hl) { _hl.style.cursor = 'pointer'; _hl.addEventListener('click', function () { pojdi('domov'); }); _hl.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pojdi('domov'); } }); } }
  // Onemogoči nehoteno spreminjanje števil s kolescem miške (scroll) — velja povsod.
  // Ko z miško podrsaš nad izbranim number poljem, se polje odjavi (blur) in stran se normalno pomika, vrednost pa ostane.
  document.addEventListener('wheel', function (e) {
    var t = e.target;
    if (t && t.tagName === 'INPUT' && (t.type === 'number') && t === document.activeElement) { t.blur(); }
  }, { passive: true });

  /* ══════════ USMERJANJE ══════════ */
  /* ── Naslov razdelka ostane viden med pomikanjem (telefon/tablica ≤ 900 px) ── */
  var _pgMiniRaf = 0;
  function pgMiniOsvezi() {
    _pgMiniRaf = 0;
    var el = $('pgMini'); if (!el) return;
    var ozko = window.matchMedia && matchMedia('(max-width:900px)').matches;
    var h2 = ozko ? document.querySelector('.sec:not(.hidden) .head h2') : null;
    var tb = document.querySelector('.topbar'), meja = tb ? tb.getBoundingClientRect().bottom : 64;
    // naslov v pasu je ime razdelka (Domov), ne pozdrav »Dober dan, …«
    var t = h2 ? (h2.closest('#sec-domov') ? 'Domov' : h2.textContent.trim()) : '';
    var pokazi = !!(t && h2.getBoundingClientRect().bottom < meja + 2);
    if (pokazi && $('pgMiniT').textContent !== t) $('pgMiniT').textContent = t;
    el.classList.toggle('vidna', pokazi);
  }
  function pgMiniZahtevaj() { if (!_pgMiniRaf) _pgMiniRaf = requestAnimationFrame(pgMiniOsvezi); }
  window.addEventListener('scroll', pgMiniZahtevaj, { passive: true });
  window.addEventListener('resize', pgMiniZahtevaj);
  { const pm = $('pgMini'); if (pm) pm.addEventListener('click', function () { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); } }); }

  // Fakture → »N listov še ni potrjenih · preglej«: Arhiv s to stranko in samo nepotrjenimi
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-faknep]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var org = b.dataset.faknep;
    ['arhivIsci', 'arhivOd', 'arhivDo'].forEach(function (i) { var x = $(i); if (x) x.value = ''; });
    ARH_NEPOTRJENI = true; pojdi('arhiv');
    var o = $('arhivOrg'); if (o && org) { o.value = org; o.dispatchEvent(new Event('change')); }
  }, true);
  function zacetniRazdelek() {
    var h = String(location.hash || '').replace(/^#/, '').split('/')[0];   // #dokumenti/Mapa → dokumenti
    return /^[a-z]+$/.test(h) && document.getElementById('sec-' + h) ? h : 'domov';
  }
  var _secZdaj = null;
  var GIB_SEZNAMI = '.rows,.fak-grid,.art-skupine';
  // Razdelek pokaže kartice prejšnjega obiska in jih izriše znova, ko pridejo sveži podatki. Nove kartice zato ne začnejo vala
  // od začetka (dvojna animacija), ampak tam, kjer je bil (--gib-tek). Če kartic še ni (nalagalni trak), se val začne ob prvem izrisu.
  function secVstop(el, smer) {
    if (el._gibKonec) el._gibKonec();
    void el.offsetWidth;
    el.classList.add('sec-anim'); if (smer) el.classList.add(smer);
    var polni = function (s) { return s.children.length > 0; };
    var t0 = [].some.call(el.querySelectorAll(GIB_SEZNAMI), polni) ? performance.now() : 0, ura;
    var mo = new MutationObserver(function (zapisi) {
      var novi = [];
      zapisi.forEach(function (z) {
        [].forEach.call(z.addedNodes, function (n) {
          if (n.nodeType !== 1) return;
          if (n.matches(GIB_SEZNAMI)) novi.push(n);
          else if (z.target.matches(GIB_SEZNAMI)) novi.push(z.target);
          else novi.push.apply(novi, n.querySelectorAll(GIB_SEZNAMI));
        });
      });
      novi = novi.filter(polni); if (!novi.length) return;
      if (!t0) { t0 = performance.now(); clearTimeout(ura); ura = setTimeout(konec, 1000); return; }
      var tek = Math.round(performance.now() - t0) + 'ms';
      novi.forEach(function (s) { s.style.setProperty('--gib-tek', tek); });
    });
    var konec = el._gibKonec = function () {   // razred mora iti, sicer bi se vsak kasnejši izris seznama znova animiral
      clearTimeout(ura); mo.disconnect(); el._gibKonec = null;
      el.classList.remove('sec-anim', 'sec-levo', 'sec-desno', 'sec-pogled');
      el.querySelectorAll('[style*="--gib-tek"]').forEach(function (s) { s.style.removeProperty('--gib-tek'); });
    };
    mo.observe(el, { childList: true, subtree: true });
    ura = setTimeout(konec, t0 ? 1000 : 6000);
  }
  function pojdi(kam) {
    if (_okno) oknoZapri(true);
    // Admin & Konzola: samo lastnik.
    if ((kam === 'admin' || kam === 'konzola') && !JE_LASTNIK()) kam = 'domov';
    // Fakture so na voljo samo super adminom.
    if (kam === 'fakture' && !JE_SUPER()) kam = 'domov';
    // Dostop do razdelka po pravicah vloge (lastnik ima vedno vse).
    if (!JE_LASTNIK() && ['racun', 'nastavitve', 'ceniki', 'ucinek'].indexOf(kam) < 0) {
      var _r = ADMIN_RAZDELKI.some(function (s) { return s[0] === kam; });
      if (_r && !sme(kam, 'r')) kam = 'domov';
    }
    // Zaposleni vidi samo Pregled, Prisotnost in Moj račun.
    if (JE_ZAPOSLENI() && ['domov', 'prisotnost', 'racun'].indexOf(kam) < 0) kam = 'domov';
    // razdelek v naslovu (#arhiv): osvežitev ali ponovni zagon aplikacije na začetnem zaslonu ostane tu
    try { var _h = kam === 'domov' ? location.pathname + location.search : '#' + kam; if ((location.hash || '') !== (kam === 'domov' ? '' : '#' + kam)) history.replaceState(null, '', _h); } catch (e) {}
    document.querySelectorAll('.sec').forEach(s => {
      s.classList.toggle('hidden', s.id !== 'sec-' + kam);
    });
    // Gladek prehod na novo prikazani razdelek. Med zavihki iste skupine glava stoji, vsebina pride s strani, v smeri zavihka.
    var _ns = document.getElementById('sec-' + kam);
    if (_ns && kam !== _secZdaj) {
      var _cl = _secZdaj && skupinaOd(_secZdaj) === skupinaOd(kam) ? claniSkupine(skupinaOd(kam)).map(function (x) { return x[0]; }) : [];
      var _sm = _cl.indexOf(kam) - _cl.indexOf(_secZdaj);
      secVstop(_ns, _cl.length ? (_sm > 0 ? 'sec-desno' : 'sec-levo') : '');
    }
    _secZdaj = kam;
    document.querySelectorAll('#side a[data-go]').forEach(a => {
      a.classList.toggle('on', skupinaOd(a.dataset.go) === skupinaOd(kam));
    });
    risiSkupino(kam);
    if (meni._drsnik) meni._drsnik();
    window.scrollTo(0, 0);
    pgMiniZahtevaj();
    if (kam !== 'arhiv') arhIzbiraKonec();   // način »Izberi« velja le v Arhivu
    if (kam === 'domov') risiPregled();
    if (kam === 'arhiv') risiArhiv();
    if (kam === 'fakture') risiFakture();
    if (kam === 'stranke') risiStranke();
    if (kam === 'katalog') risiKatalog();
    if (kam === 'uporabniki') loadUsers();
    if (kam === 'nastavitve') { risiNastavitve(); napolniBio(); }
    if (kam === 'racun') { napolniProfil(); }
    if (kam === 'konzola') { risiKonzola(); }
    if (kam === 'aplikacija') risiAplikacijo();
    if (kam === 'dokumenti') risiDokumenti();
    if (kam === 'cipi') risiCipe();
    if (kam === 'ceniki') risiCeniki();
    if (kam === 'prisotnost') risiPrisotnost();
    if (kam === 'statistika' || kam === 'ucinek') risiUcinek();
    if (kam === 'artikli') risiArtikli();
    if (kam === 'gorivo') risiGorivo();
    if (kam === 'admin') risiAdmin();
  }

  /* ══════════ GORIVO (tankanja + računi) ══════════
     Eno vozilo. Poraba se računa iz razlike stanj števca med zaporednima
     tankanjema in litrov POZNEJŠEGA tankanja — standardni način »od polnega
     do polnega«. Ob delnem tankanju je posamezen odsek previsok ali prenizek,
     povprečje čez več tankanj pa se izravna; v kartici to tudi piše.
     Računi so v svojem bucketu »gorivo« (glej baza/55_gorivo.sql), ne med
     Dokumenti — tam ima pravila vse osebje, Gorivo pa je samo za vodstvo. */
  var GORIVO = null, GOR_NAPAKA = null, GOR_URL = {}, _gorLeto = 'vse';
  var GOR_CENE = null, GOR_CENE_NAPAKA = null, _gorCeneTecejo = false, _gorCeneZadnjiPoskus = 0;
  var GOR_MAX_MB = 10, GOR_DDV = 22;

  // Znesek na računu je Z DDV; neto izpeljemo. Stopnja je shranjena pri zapisu,
  // zato sprememba DDV ne premakne preteklih tankanj.
  function gorNeto(znesek, ddv) { var d = (ddv == null ? GOR_DDV : Number(ddv)); return (Number(znesek) || 0) / (1 + d / 100); }
  function gorEurPar(bruto, ddv) { return cenaFmt(bruto) + '<small class="gor-neto">' + cenaFmt(gorNeto(bruto, ddv)) + ' brez DDV</small>'; }
  // Uradna cena je objavljena na tri decimalke (2,012 €/l) — zaokrožitev na dve
  // bi jo popačila prav tam, kjer se primerja s plačano.
  function gorCena3(v) { return (Number(v) || 0).toLocaleString('sl-SI', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' €'; }

  // Uradna (najvišja dovoljena) maloprodajna cena dizla za ta dan — z gov.si.
  // Ni nujno cena, ki si jo plačal: servis sme prodajati ceneje, avtocestni dražje.
  function gorUradnaCena(dat) {
    if (!dat) return null;
    var c = (GOR_CENE || []).find(function (x) { return x.velja_od <= dat && dat <= x.velja_do; });
    return c || null;
  }

  async function naloziCeneGoriva() {
    try {
      var r = await sb.from('fuel_prices').select('velja_od,velja_do,dizel,nmb95,ddv')
        .order('velja_od', { ascending: false }).limit(500);
      if (r.error) throw r.error;
      GOR_CENE = r.data || []; GOR_CENE_NAPAKA = null;
    } catch (e) {
      GOR_CENE = []; GOR_CENE_NAPAKA = (e && e.message) || String(e);
    }
  }

  // Sveže cene rabimo takrat, ko za DANES nimamo nobene — torej v trenutku, ko
  // se izteče zadnje objavljeno obdobje.
  //
  // Prej je bil pogoj »najnovejša je starejša od dveh dni«. Ker vlada objavlja
  // po tednih, je to pomenilo do dva dni brez cene: staro obdobje se je izteklo,
  // novega pa še nismo pobrali, ker »še ni dovolj staro«. Prvi dnevi vsakega
  // novega tedna bi bili brez predloga v obrazcu.
  function gorRabiSveze(zadnjaVeljaDo, danes) {
    if (!zadnjaVeljaDo) return true;
    return zadnjaVeljaDo < danes;
  }

  // Osveži z gov.si. Urnika ni treba nastavljati — preverimo ob vsakem odprtju
  // razdelka, klic pa je poceni, ker funkcija piše samo spremembe.
  async function osveziCeneGoriva() {
    if (_gorCeneTecejo) return false;
    var zadnja = (GOR_CENE || [])[0];
    if (!gorRabiSveze(zadnja && zadnja.velja_do, danes10())) return false;
    // Kadar vlada novega obdobja še ni objavila, ne trkamo ob vsakem odprtju.
    if (Date.now() - _gorCeneZadnjiPoskus < 30 * 60 * 1000) return false;
    _gorCeneZadnjiPoskus = Date.now();
    _gorCeneTecejo = true;
    try {
      var r = await sb.functions.invoke('cene-goriva', { body: {} });
      if (r && r.data && r.data.ok) { await naloziCeneGoriva(); return true; }
      GOR_CENE_NAPAKA = (r && r.data && r.data.error) || 'cen ni bilo mogoče osvežiti';
    } catch (e) {
      GOR_CENE_NAPAKA = (e && e.message) || String(e);
    } finally { _gorCeneTecejo = false; }
    return false;
  }

  function gorLitriFmt(l) { return (Number(l) || 0).toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' l'; }
  function gorKmFmt(km) { return km == null ? '—' : stevilo(km) + ' km'; }

  async function naloziGorivo() {
    try {
      var r = await sb.from('fuel_logs')
        .select('id,datum,litri,znesek,ddv,km,tankal,opomba,storage_path,mime,velikost,created_at,popravil,popravljeno_at')
        .is('deleted_at', null).order('datum', { ascending: false }).order('created_at', { ascending: false });
      if (r.error) throw r.error;
      GORIVO = (r.data || []).map(function (x) {
        return { id: x.id, datum: x.datum, litri: parseFloat(x.litri) || 0, znesek: parseFloat(x.znesek) || 0,
          ddv: (x.ddv == null ? GOR_DDV : parseFloat(x.ddv)),
          km: (x.km == null ? null : parseInt(x.km, 10)), tankal: x.tankal || '', opomba: x.opomba || '',
          storage_path: x.storage_path || '', mime: x.mime || '', velikost: x.velikost || 0,
          popravil: x.popravil || '', popravljeno_at: x.popravljeno_at || null };
      });
      GOR_NAPAKA = null;
    } catch (e) {
      // Prej bi seznam ostal prazen in videti bi bilo, kot da ni tankanj.
      GORIVO = []; GOR_NAPAKA = (e && e.message) || String(e);
    }
  }

  // Poraba na odsek: tankanja uredi po števcu naraščajoče in vsakemu pripiši
  // prevožene km od prejšnjega ter l/100 km. Odsek brez enega od stanj števca
  // ali z nesmiselno razliko ostane brez izračuna.
  function gorPoraba(vrstice) {
    var s = vrstice.filter(function (x) { return x.km != null; })
      .slice().sort(function (a, b) { return a.km - b.km; });
    var po = {};
    for (var i = 1; i < s.length; i++) {
      var d = s[i].km - s[i - 1].km;
      if (d > 0 && s[i].litri > 0) po[s[i].id] = { km: d, l100: s[i].litri / d * 100 };
    }
    return po;
  }

  function gorLeta() {
    var l = {};
    (GORIVO || []).forEach(function (x) { if (x.datum) l[x.datum.slice(0, 4)] = 1; });
    return Object.keys(l).sort().reverse();
  }
  function gorIzbrane() {
    var v = GORIVO || [];
    return _gorLeto === 'vse' ? v : v.filter(function (x) { return (x.datum || '').slice(0, 4) === _gorLeto; });
  }

  // Poraba in €/km se računata SAMO iz tankanj, ki imajo izmerjen odsek —
  // prvo tankanje in tista brez stanja števca nimajo prevoženih km, zato bi
  // njihovi litri in evri spačili razmerje.
  function gorPovzetek(vrstice, poraba) {
    var litri = 0, znesek = 0, neto = 0, kmSkup = 0, litriMer = 0, znesekMer = 0, netoMer = 0;
    vrstice.forEach(function (x) {
      var n = gorNeto(x.znesek, x.ddv);
      litri += x.litri; znesek += x.znesek; neto += n;
      var p = poraba[x.id];
      if (p) { kmSkup += p.km; litriMer += x.litri; znesekMer += x.znesek; netoMer += n; }
    });
    return {
      litri: litri, znesek: znesek, neto: neto, km: kmSkup,
      cenaL: litri > 0 ? znesek / litri : null,
      cenaLneto: litri > 0 ? neto / litri : null,
      l100: kmSkup > 0 ? litriMer / kmSkup * 100 : null,
      eurKm: kmSkup > 0 ? znesekMer / kmSkup : null,
      eurKmNeto: kmSkup > 0 ? netoMer / kmSkup : null
    };
  }

  async function gorPodpisiUrl(pot) {
    if (!pot) return null;
    if (GOR_URL[pot]) return GOR_URL[pot];
    try {
      var s = await sb.storage.from('gorivo').createSignedUrl(pot, 3600);
      if (s && s.data && s.data.signedUrl) { GOR_URL[pot] = s.data.signedUrl; return GOR_URL[pot]; }
    } catch (e) {}
    return null;
  }

  async function risiGorivo() {
    var box = $('gorList'); if (!box) return;
    if (!sme('gorivo', 'r')) { box.innerHTML = '<p class="u-sub">Za to vlogo Gorivo ni na voljo.</p>'; return; }
    if (GORIVO === null) {
      box.innerHTML = '<p class="u-sub" style="padding:8px 2px">Nalagam …</p>';
      await naloziGorivo();
    }
    if (GOR_CENE === null) await naloziCeneGoriva();
    gorRisi();
    // Uradne cene dopolnimo v ozadju — izris ne čaka na gov.si.
    osveziCeneGoriva().then(function (novo) { if (novo) gorRisi(); });
  }

  function gorRisi() {
    var box = $('gorList'); if (!box) return;
    if (GOR_NAPAKA) {
      box.innerHTML = '<div class="pris-card"><p class="msg bad show">Tankanj ni bilo mogoče naložiti: ' + escape_(GOR_NAPAKA) + '</p></div>';
      return;
    }
    var vse = gorIzbrane();
    var poraba = gorPoraba(GORIVO || []);
    var p = gorPovzetek(vse, poraba);
    var lahkoPise = sme('gorivo', 'w');

    var leta = gorLeta();
    var letoSel = '<select class="gor-leto" aria-label="Leto"><option value="vse"' + (_gorLeto === 'vse' ? ' selected' : '') + '>Vsa leta</option>' +
      leta.map(function (l) { return '<option value="' + l + '"' + (_gorLeto === l ? ' selected' : '') + '>' + l + '</option>'; }).join('') + '</select>';

    var kart = '<div class="gor-stat">' +
      '<div class="gor-s"><span>Skupaj gorivo</span><b>' + gorLitriFmt(p.litri) + '</b></div>' +
      '<div class="gor-s"><span>Skupaj strošek</span><b>' + cenaFmt(p.znesek) + '</b><small>' + cenaFmt(p.neto) + ' brez DDV</small></div>' +
      '<div class="gor-s"><span>Povprečna cena</span><b>' + (p.cenaL != null ? cenaFmt(p.cenaL) + '/l' : '—') + '</b>' +
      (p.cenaLneto != null ? '<small>' + cenaFmt(p.cenaLneto) + '/l brez DDV</small>' : '') + '</div>' +
      '<div class="gor-s"><span>Povprečna poraba</span><b>' + (p.l100 != null ? fmtStevilo1(p.l100) + ' l/100 km' : '—') + '</b>' +
      (p.km > 0 ? '<small>' + stevilo(p.km) + ' km' + (p.eurKm != null ? ' · ' + cenaFmt(p.eurKm) + '/km · ' + cenaFmt(p.eurKmNeto) + '/km brez DDV' : '') + '</small>' : '') + '</div>' +
      '</div>';

    var vrstice = vse.map(function (x) {
      var po = poraba[x.id];
      var racun = x.storage_path
        ? '<button type="button" class="gor-rac" data-rac="' + escape_(x.id) + '" title="Odpri račun">' + GOR_IKONA_PDF + '</button>'
        : '<span class="u-sub gor-brez" title="Račun ni priložen">—</span>';
      return '<tr' + (x.storage_path ? '' : ' class="gor-nerac"') + '>' +
        '<td>' + datum(x.datum) + '</td>' +
        '<td class="pris-ure">' + gorLitriFmt(x.litri) + '</td>' +
        '<td class="pris-ure">' + gorEurPar(x.znesek, x.ddv) + '</td>' +
        '<td class="pris-ure">' + (x.litri > 0 ? gorEurPar(x.znesek / x.litri, x.ddv) : '—') + '</td>' +
        '<td class="pris-ure">' + gorKmFmt(x.km) + '</td>' +
        '<td class="pris-ure">' + (po ? fmtStevilo1(po.l100) : '<span class="u-sub">—</span>') + '</td>' +
        '<td>' + escape_(x.tankal || '—') + '</td>' +
        '<td class="gor-c">' + racun + '</td>' +
        (lahkoPise ? '<td class="gor-c"><button type="button" class="gor-ur" data-ur="' + escape_(x.id) + '" title="Uredi">Uredi</button></td>' : '') +
        '</tr>';
    }).join('');

    var glave = '<tr><th>Datum</th><th>Litri</th><th>Znesek<small>z DDV / brez</small></th><th>€/l<small>z DDV / brez</small></th><th>Števec</th><th>l/100&nbsp;km</th><th>Tankal</th><th class="gor-c">Račun</th>' +
      (lahkoPise ? '<th></th>' : '') + '</tr>';
    var stolpcev = lahkoPise ? 9 : 8;
    var tbl = '<div class="gor-scroll"><table class="pris-tbl gor-tbl"><thead>' + glave + '</thead><tbody>' +
      (vrstice || '<tr><td colspan="' + stolpcev + '" class="u-sub">V izbranem obdobju ni tankanj.</td></tr>') + '</tbody></table></div>';

    box.innerHTML = kart +
      '<div class="pris-card"><div class="pris-h">' +
      '<div><h3 class="sec-h">Tankanja</h3></div>' +
      '<span class="pris-hbtns">' + letoSel +
      (lahkoPise ? '<button type="button" class="cgrp-btn gor-novo tb-ikona" title="Novo tankanje" aria-label="Novo tankanje"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>' : '') + '</span></div>' +
      tbl + '</div>';

    var ls = box.querySelector('.gor-leto');
    if (ls) ls.addEventListener('change', function () { _gorLeto = this.value; gorRisi(); });
    var nb = box.querySelector('.gor-novo');
    if (nb) nb.addEventListener('click', function () { gorObrazec(null); });
    box.querySelectorAll('[data-ur]').forEach(function (b) {
      b.addEventListener('click', function () { gorObrazec((GORIVO || []).find(function (x) { return x.id === b.dataset.ur; }) || null); });
    });
    box.querySelectorAll('[data-rac]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var rec = (GORIVO || []).find(function (x) { return x.id === b.dataset.rac; });
        if (!rec) return;
        var url = await gorPodpisiUrl(rec.storage_path);
        if (!url) { toast('Računa ni bilo mogoče odpreti.'); return; }
        window.open(url, '_blank', 'noopener');
      });
    });
  }

  var GOR_IKONA_PDF = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 14h6"/><path d="M9 17h4"/></svg>';

  /* Obrazec za novo tankanje ali urejanje obstoječega. rec = null → novo. */
  function gorObrazec(rec) {
    if (!sme('gorivo', 'w')) { toast('Za to vlogo vnos ni dovoljen.'); return; }
    var nov = !rec;
    var back = document.createElement('div');
    back.className = 'sc-modal-back show';
    back.innerHTML = '<div class="sc-modal gor-modal" role="dialog" aria-modal="true">' +
      '<h4>' + (nov ? 'Novo tankanje' : 'Uredi tankanje') + '</h4>' +
      '<div class="ur-form">' +
      '<div class="ur-grid ur-grid-3">' +
      '<label class="ur-f"><span>Datum</span><input type="date" data-datum value="' + escape_(nov ? danes10() : rec.datum) + '"></label>' +
      '<label class="ur-f"><span>Litri</span><input type="number" step="0.01" min="0" inputmode="decimal" data-litri value="' + (nov ? '' : rec.litri) + '"></label>' +
      '<label class="ur-f"><span>Cena na liter (€ z DDV)</span><input type="number" step="0.001" min="0" inputmode="decimal" data-cenal></label>' +
      '</div>' +
      '<div class="ur-grid ur-grid-3">' +
      '<label class="ur-f"><span>Znesek (€ z DDV)</span><input type="number" step="0.01" min="0" inputmode="decimal" data-znesek value="' + (nov ? '' : rec.znesek) + '"></label>' +
      '<label class="ur-f"><span>Brez DDV (' + fmtStevilo1(GOR_DDV) + ' %)</span><output class="ur-kg-auto" data-neto>—</output></label>' +
      '<label class="ur-f"><span>Stanje števca (km)</span><input type="number" step="1" min="0" inputmode="numeric" data-km value="' + (nov || rec.km == null ? '' : rec.km) + '"></label>' +
      '</div>' +
      '<p class="u-sub gor-uradna" data-uradna></p>' +
      '<label class="ur-f"><span>Tankal</span><input type="text" data-tankal maxlength="60" value="' + escape_(nov ? (JAZIME || '') : rec.tankal) + '"></label>' +
      '<label class="ur-f"><span>Opomba</span><input type="text" data-opomba maxlength="200" value="' + escape_(nov ? '' : rec.opomba) + '"></label>' +
      '<label class="ur-f"><span>Račun (PDF ali slika, do ' + GOR_MAX_MB + ' MB)</span>' +
      '<input type="file" data-rac accept="application/pdf,image/*"></label>' +
      '<p class="u-sub gor-rac-stanje" data-racst></p>' +
      '<p class="u-sub ur-msg" data-msg></p>' +
      '</div>' +
      '<div class="sc-modal-acts">' +
      (nov ? '' : '<button type="button" class="sc-modal-btn danger" data-brisi>Izbriši</button>') +
      '<button type="button" class="sc-modal-btn ghost" data-no>Prekliči</button>' +
      '<button type="button" class="sc-modal-btn primary" data-yes>' + (nov ? 'Shrani' : 'Shrani spremembe') + '</button>' +
      '</div></div>';
    document.body.appendChild(back);
    _modalA11y(back);

    var q = function (s2) { return back.querySelector(s2); };
    var msg = q('[data-msg]'), racst = q('[data-racst]');
    function zapri() { back.remove(); _modalVrniFokus(); }

    // Cena se predizpolni z uradno za izbrani dan, znesek pa sledi litrom —
    // dokler ju uporabnik ne vpiše sam. Ko vpiše, portal njegove vrednosti ne
    // povozi več: na računu je merodajen znesek, uradna cena je le najvišja
    // dovoljena in je servis lahko prodajal ceneje.
    var cenaRocno = !nov, znesekRocno = !nov;

    function osveziNeto() {
      var z = parseFloat(q('[data-znesek]').value);
      q('[data-neto]').textContent = (z >= 0 && !isNaN(z)) ? cenaFmt(gorNeto(z, GOR_DDV)) : '—';
    }
    function osveziUradno() {
      var c = gorUradnaCena(q('[data-datum]').value);
      var el = q('[data-uradna]');
      if (c) {
        el.innerHTML = 'Uradna cena dizla za ta dan: <b>' + gorCena3(c.dizel) + '/l</b> z DDV · ' +
          gorCena3(gorNeto(c.dizel, c.ddv)) + '/l brez · velja ' + datum(c.velja_od) + '–' + datum(c.velja_do) +
          ' <span class="gor-uradna-op">(najvišja dovoljena zunaj avtocest)</span>';
      } else if (GOR_CENE_NAPAKA) {
        el.textContent = 'Uradnih cen ni bilo mogoče naložiti: ' + GOR_CENE_NAPAKA;
      } else {
        el.textContent = 'Za ta dan uradne cene ni.';
      }
      return c;
    }
    function izracunajZnesek() {
      if (znesekRocno) return;
      var l = parseFloat(q('[data-litri]').value), c = parseFloat(q('[data-cenal]').value);
      if (l > 0 && c > 0) { q('[data-znesek]').value = (Math.round(l * c * 100) / 100).toFixed(2); osveziNeto(); }
    }
    function nastaviUradnoCeno() {
      var c = osveziUradno();
      if (!cenaRocno) { q('[data-cenal]').value = c ? c.dizel : ''; izracunajZnesek(); }
    }

    if (!nov) q('[data-cenal]').value = rec.litri > 0 ? (Math.round(rec.znesek / rec.litri * 1000) / 1000) : '';
    nastaviUradnoCeno();
    osveziNeto();

    q('[data-datum]').addEventListener('change', nastaviUradnoCeno);
    q('[data-litri]').addEventListener('input', izracunajZnesek);
    q('[data-cenal]').addEventListener('input', function () { cenaRocno = true; izracunajZnesek(); });
    q('[data-znesek]').addEventListener('input', function () {
      znesekRocno = true; cenaRocno = true;
      var l = parseFloat(q('[data-litri]').value), z = parseFloat(q('[data-znesek]').value);
      if (l > 0 && z >= 0 && !isNaN(z)) q('[data-cenal]').value = Math.round(z / l * 1000) / 1000;
      osveziNeto();
    });

    if (!nov && rec.storage_path) {
      racst.innerHTML = 'Priložen je račun. Če izbereš novo datoteko, stara se zamenja. ' +
        '<button type="button" class="gor-odstrani" data-odstrani>Odstrani račun</button>';
      var _odstranjen = false;
      racst.querySelector('[data-odstrani]').addEventListener('click', function () {
        _odstranjen = true; racst.textContent = 'Račun bo odstranjen ob shranjevanju.';
        back._odstraniRacun = true;
      });
    }

    q('[data-no]').addEventListener('click', zapri);
    back.addEventListener('click', function (e) { if (e.target === back) zapri(); });

    var brisi = q('[data-brisi]');
    if (brisi) brisi.addEventListener('click', async function () {
      var ok = await potrdiModal({ naslov: 'Izbrišem tankanje?', nevarno: true,
        sporocilo: datum(rec.datum) + ' · ' + gorLitriFmt(rec.litri) + ' · ' + cenaFmt(rec.znesek), potrdi: 'Izbriši' });
      if (!ok) return;
      msg.textContent = 'Brišem …';
      var r = await sb.from('fuel_logs').update({ deleted_at: new Date().toISOString() }).eq('id', rec.id);
      if (r.error) { msg.textContent = napakaBesedilo(r.error); return; }
      logDodaj('Gorivo', 'Izbrisano', 'Tankanje ' + datum(rec.datum) + ' · ' + gorLitriFmt(rec.litri));
      GORIVO = (GORIVO || []).filter(function (x) { return x.id !== rec.id; });
      zapri(); toast('Tankanje izbrisano.'); gorRisi();
    });

    q('[data-yes]').addEventListener('click', async function () {
      var dat = q('[data-datum]').value;
      var litri = parseFloat(q('[data-litri]').value);
      var znesek = parseFloat(q('[data-znesek]').value);
      var kmStr = q('[data-km]').value.trim();
      var km = kmStr === '' ? null : parseInt(kmStr, 10);
      var tankal = q('[data-tankal]').value.trim();
      var opomba = q('[data-opomba]').value.trim();
      var dat10 = danes10();

      if (!dat) { msg.textContent = 'Vpiši datum.'; return; }
      if (dat > dat10) { msg.textContent = 'Datum je v prihodnosti.'; return; }
      if (!(litri > 0)) { msg.textContent = 'Vpiši litre.'; return; }
      if (!(znesek >= 0) || isNaN(znesek)) { msg.textContent = 'Vpiši znesek.'; return; }
      if (kmStr !== '' && (isNaN(km) || km < 0)) { msg.textContent = 'Stanje števca ni veljavno.'; return; }

      // Števec ne sme nazaj: to bi pokvarilo izračun porabe, zato raje opozorimo.
      if (km != null) {
        var prej = (GORIVO || []).filter(function (x) { return x.id !== (rec && rec.id) && x.km != null && x.datum <= dat; })
          .sort(function (a, b) { return a.datum < b.datum ? 1 : -1; })[0];
        if (prej && km < prej.km) {
          var vseeno = await potrdiModal({ naslov: 'Števec gre nazaj', potrdi: 'Vseeno shrani',
            sporocilo: 'Zadnje zabeleženo stanje (' + datum(prej.datum) + ') je ' + stevilo(prej.km) + ' km, tu pa ' + stevilo(km) + ' km. Poraba za ta odsek se ne bo izračunala.' });
          if (!vseeno) return;
        }
      }

      var f = q('[data-rac]').files && q('[data-rac]').files[0];
      if (f && f.size > GOR_MAX_MB * 1024 * 1024) { msg.textContent = 'Račun je večji od ' + GOR_MAX_MB + ' MB.'; return; }

      msg.textContent = nov ? 'Shranjujem …' : 'Posodabljam …';
      try {
        var polja = { datum: dat, litri: litri, znesek: znesek, ddv: (nov ? GOR_DDV : (rec.ddv != null ? rec.ddv : GOR_DDV)), km: km, tankal: tankal || null, opomba: opomba || null };

        var novaPot = null;
        if (f) {
          var konc = (f.name.match(/\.[A-Za-z0-9]+$/) || [''])[0].toLowerCase() || (f.type === 'application/pdf' ? '.pdf' : '');
          novaPot = 'racuni/' + dat.slice(0, 4) + '/' + dat + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + konc;
          var up = await sb.storage.from('gorivo').upload(novaPot, f, { contentType: f.type || 'application/octet-stream', cacheControl: '3600', upsert: false });
          if (up.error) throw up.error;
          polja.storage_path = novaPot; polja.mime = f.type || ''; polja.velikost = f.size;
        } else if (back._odstraniRacun) {
          polja.storage_path = null; polja.mime = null; polja.velikost = null;
        }

        var staraPot = rec && rec.storage_path;
        var res;
        if (nov) {
          res = await sb.from('fuel_logs').insert(polja).select('id,datum,litri,znesek,ddv,km,tankal,opomba,storage_path,mime,velikost,popravil,popravljeno_at').single();
        } else {
          polja.popravil = JAZIME || 'osebje';
          polja.popravljeno_at = new Date().toISOString();
          res = await sb.from('fuel_logs').update(polja).eq('id', rec.id).select('id,datum,litri,znesek,ddv,km,tankal,opomba,storage_path,mime,velikost,popravil,popravljeno_at').single();
        }
        if (res.error) {
          // Vrstica ni nastala — naložene datoteke ne puščamo za sabo.
          if (novaPot) { try { await sb.storage.from('gorivo').remove([novaPot]); } catch (e2) {} }
          throw res.error;
        }
        // Šele ko je zapis res shranjen, pospravimo staro datoteko.
        if (staraPot && (novaPot || back._odstraniRacun)) { try { await sb.storage.from('gorivo').remove([staraPot]); } catch (e3) {} delete GOR_URL[staraPot]; }

        var d2 = res.data;
        var vrsta = { id: d2.id, datum: d2.datum, litri: parseFloat(d2.litri) || 0, znesek: parseFloat(d2.znesek) || 0,
          ddv: (d2.ddv == null ? GOR_DDV : parseFloat(d2.ddv)),
          km: (d2.km == null ? null : parseInt(d2.km, 10)), tankal: d2.tankal || '', opomba: d2.opomba || '',
          storage_path: d2.storage_path || '', mime: d2.mime || '', velikost: d2.velikost || 0,
          popravil: d2.popravil || '', popravljeno_at: d2.popravljeno_at || null };
        GORIVO = GORIVO || [];
        if (nov) GORIVO.push(vrsta);
        else GORIVO = GORIVO.map(function (x) { return x.id === vrsta.id ? vrsta : x; });
        GORIVO.sort(function (a, b) { return a.datum < b.datum ? 1 : (a.datum > b.datum ? -1 : 0); });

        logDodaj('Gorivo', nov ? 'Dodano' : 'Urejeno', 'Tankanje ' + datum(dat) + ' · ' + gorLitriFmt(litri) + ' · ' + cenaFmt(znesek));
        zapri();
        toast(nov ? 'Tankanje shranjeno.' : 'Tankanje posodobljeno.');
        gorRisi();
      } catch (e) {
        msg.textContent = napakaBesedilo(e);
      }
    });

    setTimeout(function () { try { q('[data-litri]').focus(); } catch (e) {} }, 60);
  }

  /* ══════════ PRISOTNOST (registracija delovnega časa) ══════════ */
  var ZAPOSLENI = null, PRISDOG = null, _prisDan = null, _prisMesec = false;
  var PRIS_UPO = [], PRIS_UPO_MAP = {};   // uporabniki portala (za povezavo zaposleni ↔ uporabnik)
  var _prisView = 'dan', _prisOseba = null;   // pogled: 'dan' | 'mesec' | 'oseba'
  function dniVMesecu(kljuc7) { var l = kljuc7.split('-'); return new Date(+l[0], +l[1], 0).getDate(); }
  // Premik obdobja: v dnevnem pogledu ±1 dan, v mesečnem/osebnem ±1 mesec.
  function prisPremakni(delta) {
    if (!_prisDan) _prisDan = danes10();
    var d;
    if (_prisView === 'dan') { d = new Date(_prisDan + 'T00:00:00'); d.setDate(d.getDate() + delta); }
    else { var p = _prisDan.slice(0, 7).split('-'); d = new Date(+p[0], (+p[1] - 1) + delta, 1); }
    _prisDan = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    prisObdobje();
  }
  var DNEVI_KR = ['ned', 'pon', 'tor', 'sre', 'čet', 'pet', 'sob'];

  function prisOrg() {
    if (ZAPOSLENI && ZAPOSLENI.length && ZAPOSLENI[0].org_id) return ZAPOSLENI[0].org_id;
    return (ORGSEZNAM && ORGSEZNAM[0]) ? ORGSEZNAM[0].id : null;
  }
  function isoLokalno(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function danes10() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function uraMin(ts) { return new Date(ts).toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' }); }
  function trajanjeH(sek) { var m = Math.round(sek / 60); var h = Math.floor(m / 60); m = m % 60; if (!h) return m + 'min'; if (!m) return h + 'h'; return h + 'h ' + m + 'min'; }

  // Spodnja meja nalaganja dogodkov: začetek PRIKAZANEGA meseca ALI zadnjih 62 dni (kar je prej),
  // da so vidni tudi starejši meseci (npr. julij), tabela »Trenutno prisotni« pa ostane sveža.
  function _prisMejaISO() {
    var baseDan = (_prisDan && _prisDan.length >= 7) ? _prisDan : danes10();
    var monthStart = baseDan.slice(0, 7) + '-01';
    var r = new Date(Date.now() - 62 * 24 * 3600 * 1000);
    var recent = r.getFullYear() + '-' + ('0' + (r.getMonth() + 1)).slice(-2) + '-' + ('0' + r.getDate()).slice(-2);
    var dan = monthStart < recent ? monthStart : recent;   // ISO nizi se primerjajo leksikografsko
    return new Date(dan + 'T00:00:00Z').toISOString();
  }
  async function naloziPrisDog() {
    var meja = _prisMejaISO();
    var r = await vseVrstice(function (a, b) {
      return sb.from('att_events').select('id,employee_id,terminal_id,ts,type,source,potrjeno').gte('ts', meja).order('ts', { ascending: true }).range(a, b);
    });
    PRISDOG = (r && r.data) ? r.data : [];
  }
  // Po menjavi obdobja (mesec/dan): donaloži dogodke za prikazano obdobje in znova izriši.
  async function prisObdobje() {
    try { await naloziPrisDog(); } catch (e) {}
    prisRender();
  }
  async function naloziPrisotnost() {
    // žeton kartice ni berljiv (68_kartice_skrite.sql) — portal vidi le, ali je kartica dodeljena
    var e = await sb.from('employees').select('id,org_id,ime,ima_kartico,active,created_at,profile_id').order('ime');
    if (e.error && /profile_id|column|schema/i.test(e.error.message || '')) {
      e = await sb.from('employees').select('id,org_id,ime,ima_kartico,active,created_at').order('ime');   // pred migracijo 48
    }
    ZAPOSLENI = e.error ? [] : (e.data || []);
    // Uporabniki portala (e-pošta + geslo) — za povezavo z zaposlenim. Napake tiho spregledamo.
    try {
      var pu = await sb.from('profiles').select('id,email,full_name').order('email');
      PRIS_UPO = pu.error ? [] : (pu.data || []);
    } catch (e2) { PRIS_UPO = []; }
    PRIS_UPO_MAP = {}; PRIS_UPO.forEach(function (u) { PRIS_UPO_MAP[u.id] = u; });
    await naloziPrisDog();
  }
  function prisZadnji(empId) {
    var last = null;
    for (var i = 0; i < PRISDOG.length; i++) { var d = PRISDOG[i]; if (d.employee_id === empId && (!last || d.ts > last.ts)) last = d; }
    return last;
  }
  // Pari prihod/odhod za ključ dneva ('YYYY-MM-DD') ali meseca ('YYYY-MM').
  function prisPari(empId, kljuc) {
    var evs = PRISDOG.filter(function (d) { return d.employee_id === empId && d.ts.slice(0, kljuc.length) === kljuc; })
      .sort(function (a, b) { return a.ts < b.ts ? -1 : 1; });
    var pari = [], odprt = null, sek = 0;
    evs.forEach(function (d) {
      if (d.type === 'in') { if (!odprt) odprt = d; }
      else if (d.type === 'out') { if (odprt) { pari.push([odprt, d]); sek += (new Date(d.ts) - new Date(odprt.ts)) / 1000; odprt = null; } }
    });
    return { pari: pari, odprt: odprt, sek: sek };
  }
  // Povzetek obdobja (dan ali mesec) za enega zaposlenega: št. dni + skupne sekunde.
  function prisPovzetek(empId, kljuc) {
    var r = prisPari(empId, kljuc);
    var dnevi = {}; r.pari.forEach(function (p) { dnevi[p[0].ts.slice(0, 10)] = true; });
    return { dni: Object.keys(dnevi).length, sek: r.sek, pari: r.pari, odprt: r.odprt };
  }
  // Ali ima zaposleni kakršenkoli dogodek v obdobju (kljuc = dan 'YYYY-MM-DD' ali mesec 'YYYY-MM').
  function prisImaDogodke(empId, kljuc) {
    for (var i = 0; i < PRISDOG.length; i++) { var d = PRISDOG[i]; if (d.employee_id === empId && d.ts.slice(0, kljuc.length) === kljuc) return true; }
    return false;
  }
  // Zaposleni za prikaz v Evidenci: aktivni + deaktivirani, ki imajo v obdobju ure.
  function prisOsebeZaEvidenco(kljuc) {
    return (ZAPOSLENI || []).filter(function (z) { return z.active || prisImaDogodke(z.id, kljuc); });
  }
  // Čipi prihod–odhod za en dan enega zaposlenega (za urejanje). Vrne {html, sek}.
  function prisChipiDan(empId, dayISO) {
    var r = prisPari(empId, dayISO);
    var chips = r.pari.map(function (p) {
      var ids = p[0].id + ',' + p[1].id;
      var pot = !!(p[0].potrjeno && p[1].potrjeno);
      return '<span class="pris-chip pris-pair ' + (pot ? 'pot-ok' : 'pot-ni') + '">' +
        '<input type="checkbox" class="pris-pair-chk" data-cpair="' + ids + '"' + (pot ? ' checked' : '') + ' title="Potrdi uro">' +
        '<button type="button" class="pris-chip-t" data-editpair="' + ids + '" title="Uredi vpis">' + uraMin(p[0].ts) + '–' + uraMin(p[1].ts) + '</button>' +
        '<button type="button" class="pris-chip-x" data-delpair="' + ids + '" title="Izbriši vpis" aria-label="Izbriši vpis">' + IKO_ZAPRI + '</button></span>';
    });
    if (r.odprt) chips.push('<span class="pris-chip open"><button type="button" class="pris-chip-t" data-editpair="' + r.odprt.id + '" title="Uredi vpis">' + uraMin(r.odprt.ts) + ' → v teku</button>' +
      '<button type="button" class="pris-chip-x" data-delpair="' + r.odprt.id + '" title="Izbriši prihod" aria-label="Izbriši prihod">' + IKO_ZAPRI + '</button></span>');
    return { html: chips.join(' ') || '<span class="u-sub">—</span>', sek: r.sek };
  }
  function decimalneUre(sek) { return (Math.round(sek / 3600 * 100) / 100).toString().replace('.', ','); }
  function csvC(s) { s = String(s == null ? '' : s); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

  /* \u2500\u2500 Minimalni zapisovalnik XLSX (pravi Excel, brez knji\u017enice) \u2500\u2500 */
  function _xCrc32(buf) { var crc = 0xFFFFFFFF; for (var i = 0; i < buf.length; i++) { crc ^= buf[i]; for (var j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1)); } return (crc ^ 0xFFFFFFFF) >>> 0; }
  function _xB(s) { return new TextEncoder().encode(s); }
  function _xU16(n) { return [n & 255, (n >> 8) & 255]; }
  function _xU32(n) { return [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255]; }
  function _xZip(files) {
    var chunks = [], central = [], offset = 0;
    files.forEach(function (f) {
      var crc = _xCrc32(f.data), nb = _xB(f.name), sz = f.data.length;
      var lh = [].concat(_xU32(0x04034b50), _xU16(20), _xU16(0), _xU16(0), _xU16(0), _xU16(0), _xU32(crc), _xU32(sz), _xU32(sz), _xU16(nb.length), _xU16(0));
      var lhb = new Uint8Array(lh.length + nb.length + sz); lhb.set(lh, 0); lhb.set(nb, lh.length); lhb.set(f.data, lh.length + nb.length);
      chunks.push(lhb);
      var cd = [].concat(_xU32(0x02014b50), _xU16(20), _xU16(20), _xU16(0), _xU16(0), _xU16(0), _xU16(0), _xU32(crc), _xU32(sz), _xU32(sz), _xU16(nb.length), _xU16(0), _xU16(0), _xU16(0), _xU16(0), _xU32(0), _xU32(offset));
      var cdb = new Uint8Array(cd.length + nb.length); cdb.set(cd, 0); cdb.set(nb, cd.length); central.push(cdb);
      offset += lhb.length;
    });
    var cdSize = 0; central.forEach(function (c) { cdSize += c.length; });
    var eocd = new Uint8Array([].concat(_xU32(0x06054b50), _xU16(0), _xU16(0), _xU16(files.length), _xU16(files.length), _xU32(cdSize), _xU32(offset), _xU16(0)));
    var total = offset + cdSize + eocd.length, out = new Uint8Array(total), pos = 0;
    chunks.forEach(function (c) { out.set(c, pos); pos += c.length; });
    central.forEach(function (c) { out.set(c, pos); pos += c.length; });
    out.set(eocd, pos); return out;
  }
  function _xEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function _xCol(c) { var s = ''; c++; while (c) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = (c - m - 1) / 26; } return s; }
  // Slogi: s=1 glava (krepko + siva podlaga), s=2 krepko (skupaj vrstica).
  function _xSheet(rows, freeze) {
    var widths = [];
    rows.forEach(function (row) { (row || []).forEach(function (cell, ci) { var t = (cell && typeof cell === 'object') ? String(cell.v) : String(cell == null ? '' : cell); widths[ci] = Math.max(widths[ci] || 0, t.length); }); });
    var cols = widths.length ? '<cols>' + widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + Math.min(Math.max((w || 8) + 3, 11), 46) + '" customWidth="1"/>'; }).join('') + '</cols>' : '';
    var body = '';
    rows.forEach(function (row, ri) {
      var cells = '';
      (row || []).forEach(function (cell, ci) {
        var ref = _xCol(ci) + (ri + 1);
        if (cell === null || cell === undefined || cell === '') return;
        var val, s = 0, isNum;
        if (cell && typeof cell === 'object') { val = cell.v; s = cell.s || (cell.bold ? 1 : 0); isNum = (typeof val === 'number'); }
        else { val = cell; isNum = (typeof cell === 'number'); }
        var sAttr = s ? (' s="' + s + '"') : '';
        if (isNum) { cells += '<c r="' + ref + '"' + sAttr + '><v>' + val + '</v></c>'; }
        else { cells += '<c r="' + ref + '"' + sAttr + ' t="inlineStr"><is><t xml:space="preserve">' + _xEsc(val) + '</t></is></c>'; }
      });
      body += '<row r="' + (ri + 1) + '">' + cells + '</row>';
    });
    var views = freeze ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView></sheetViews>' : '';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + views + cols + '<sheetData>' + body + '</sheetData></worksheet>';
  }
  var _XSTYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.00&quot; €&quot;"/><numFmt numFmtId="165" formatCode="#,##0"/><numFmt numFmtId="166" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDF2F0"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="9"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs></styleSheet>';
  function _xImeSheeta(ime, i, vzeti) {
    var n = String(ime || ('List ' + (i + 1))).replace(/[\\\/\?\*\[\]:]/g, ' ').trim().slice(0, 31) || ('List ' + (i + 1));
    var base = n, k = 2;
    while (vzeti[n.toLowerCase()]) { n = (base.slice(0, 28) + ' ' + k).slice(0, 31); k++; }
    vzeti[n.toLowerCase()] = true; return n;
  }
  // Zapiši .xlsx z več sheeti: sheets = [{name, rows, freeze?}]
  function prenesiXlsx(ime, sheets) {
    var vzeti = {}, ct = '', wbSheets = '', wbRels = '', wsFiles = [];
    sheets.forEach(function (s, i) {
      var n = i + 1, nm = _xImeSheeta(s.name, i, vzeti);
      ct += '<Override PartName="/xl/worksheets/sheet' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      wbSheets += '<sheet name="' + _xEsc(nm) + '" sheetId="' + n + '" r:id="rId' + n + '"/>';
      wbRels += '<Relationship Id="rId' + n + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + n + '.xml"/>';
      wsFiles.push({ name: 'xl/worksheets/sheet' + n + '.xml', data: _xB(_xSheet(s.rows, s.freeze !== false)) });
    });
    var stylesRid = sheets.length + 1;
    wbRels += '<Relationship Id="rId' + stylesRid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
    var files = [
      { name: '[Content_Types].xml', data: _xB('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + ct + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>') },
      { name: '_rels/.rels', data: _xB('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
      { name: 'xl/workbook.xml', data: _xB('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + wbSheets + '</sheets></workbook>') },
      { name: 'xl/_rels/workbook.xml.rels', data: _xB('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + wbRels + '</Relationships>') },
      { name: 'xl/styles.xml', data: _xB(_XSTYLES) }
    ].concat(wsFiles);
    var bytes = _xZip(files);
    var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = ime; document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 100);
  }
  function _mesecLabel(kljuc) { try { return new Date(kljuc + '-01T00:00:00').toLocaleDateString('sl-SI', { month: 'long', year: 'numeric' }); } catch (e) { return kljuc; } }

  // Izvoz ur ZA IZBRANI MESEC v pravi Excel (.xlsx): povzetek + sheet za vsako zaposleno.
  async function prisIzvoz() {
    var mesecKljuc = _prisDan.slice(0, 7);
    // Zagotovi, da so naloženi dogodki za izvoženi mesec (tudi če PRISDOG še ne pokriva tega meseca).
    try { await naloziPrisDog(); } catch (e) {}
    // Izvozimo ISTE zaposlene kot v Evidenci: aktivne + deaktivirane, ki imajo v tem mesecu ure
    // (prej so bili v izvozu samo aktivni → deaktivirani z urami, npr. sezonci, so manjkali).
    var osebe = prisOsebeZaEvidenco(mesecKljuc);
    var B = function (t) { return { v: t, bold: true }; };      // glava
    var T = function (t) { return { v: t, s: 2 }; };            // krepko (skupaj)
    var dec = function (sek) { return Math.round(sek / 3600 * 100) / 100; };
    var mesecIme = _mesecLabel(mesecKljuc);
    var sheets = [];
    var imeIzvoz = function (z) { return z.ime + (z.active ? '' : ' (neaktiven)'); };
    // 1) Povzetek — vse zaposlene skupaj
    var pov = [[{ v: 'Povzetek ur — ' + mesecIme, s: 2 }], [], [B('Zaposleni'), B('Dni'), B('Ure'), B('Ure (decimalno)')]];
    var skupSek = 0, skupDni = 0;
    osebe.forEach(function (z) {
      var p = prisPovzetek(z.id, mesecKljuc);
      skupSek += p.sek; skupDni += p.dni;
      pov.push([imeIzvoz(z), p.dni, trajanjeH(p.sek), { v: dec(p.sek) }]);
    });
    pov.push([]);
    pov.push([T('SKUPAJ'), T(skupDni), T(trajanjeH(skupSek)), { v: dec(skupSek), s: 2 }]);
    sheets.push({ name: 'Povzetek', rows: pov, freeze: false });
    // 2) Sheet za vsako zaposleno — dnevne ure
    osebe.forEach(function (z) {
      var rows = [[B('Datum'), B('Prihod'), B('Odhod'), B('Ure'), B('Ure (decimalno)')]];
      var r = prisPari(z.id, mesecKljuc);
      r.pari.forEach(function (p) {
        var sek = (new Date(p[1].ts) - new Date(p[0].ts)) / 1000;
        rows.push([p[0].ts.slice(0, 10), uraMin(p[0].ts), uraMin(p[1].ts), trajanjeH(sek), dec(sek)]);
      });
      var pv = prisPovzetek(z.id, mesecKljuc);
      rows.push([]);
      rows.push([T('Skupaj (' + pv.dni + ' dni)'), '', '', T(trajanjeH(pv.sek)), { v: dec(pv.sek), s: 2 }]);
      sheets.push({ name: z.ime, rows: rows });
    });
    prenesiXlsx('ure_' + mesecKljuc + '.xlsx', sheets);
    toast('Izvoz pripravljen: ure_' + mesecKljuc + '.xlsx');
  }

  // ── Listi za ročni vpis ur (natisni) ──
  // Za vsako izbrano zaposleno en list A4 na papirju podjetja (glava z logotipom): za vsak
  // dan v mesecu razen nedelje vrstica Prihod / Odhod / Podpis. Prazniki so označeni.
  function velikaNoc(Y) {   // gregorijanski izračun (Meeus/Jones/Butcher)
    var a = Y % 19, b = Math.floor(Y / 100), c = Y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), n = h + l - 7 * m + 114;
    return new Date(Y, Math.floor(n / 31) - 1, (n % 31) + 1);
  }
  // Dela prosti dnevi v Sloveniji (ki niso nujno nedelja); velikonočni ponedeljek se izračuna.
  function jePraznik(iso) {
    if (['01-01', '01-02', '02-08', '04-27', '05-01', '05-02', '06-25', '08-15', '10-31', '11-01', '12-25', '12-26'].indexOf(iso.slice(5)) >= 0) return true;
    var v = velikaNoc(+iso.slice(0, 4)), pon = new Date(v.getFullYear(), v.getMonth(), v.getDate() + 1);
    return iso === pon.getFullYear() + '-' + ('0' + (pon.getMonth() + 1)).slice(-2) + '-' + ('0' + pon.getDate()).slice(-2);
  }
  // Delovni dnevi meseca (vsi razen nedelje): [{ iso, oznaka: »sre 1. 10.«, sob, praznik }]
  function urDnevi(mesec) {
    var out = [], n = dniVMesecu(mesec), mm = +mesec.slice(5, 7);
    for (var d = 1; d <= n; d++) {
      var iso = mesec + '-' + ('0' + d).slice(-2), wd = new Date(iso + 'T00:00:00').getDay();
      if (wd === 0) continue;
      out.push({ iso: iso, oznaka: DNEVI_KR[wd] + ' ' + d + '. ' + mm + '.', sob: wd === 6, praznik: jePraznik(iso) });
    }
    return out;
  }
  function urListHtml(z, mesec) {
    var vrstice = urDnevi(mesec).map(function (d) {
      return '<tr class="' + (d.sob ? 'sob' : '') + (d.praznik ? ' praz' : '') + '"><td class="ur-dan">' + d.oznaka + (d.praznik ? '<span class="ur-praz">praznik</span>' : '') + '</td><td></td><td></td><td></td></tr>';
    }).join('');
    return '<section>' +
      '<div class="sc-box sc-num"><span>Evidenca delovnega časa</span><span class="sc-obd">' + escape_(_mesecLabel(mesec)) + '</span></div>' +
      '<div class="sc-box sc-client"><div class="cl"><b>Zaposleni:</b> <span class="cname">' + escape_(z.ime || '') + '</span></div></div>' +
      '<table class="sc-table ur-tbl"><thead><tr><th class="l">Dan</th><th>Prihod</th><th>Odhod</th><th>Podpis</th></tr></thead><tbody>' + vrstice + '</tbody></table>' +
      '</section>';
  }
  // PDF: enaka postavitev kot predogled (glava, naslov, ime, mreža za ročni vpis).
  function urPdfStran(doc, z, mesec) {
    var M = DPDF.M, R = doc.W - M, y = dpdfGlava(doc);
    y = dpdfNaslovOkvir(doc, y, 'Evidenca delovnega časa', _mesecLabel(mesec));
    var fs = 12 * PT, lh = 12 * 1.2 * PT, h = 20 * PT + lh;
    dpdfOkvir(doc, y, h);
    var osn = dpdfOsnova(y + 10 * PT, fs, lh), x = M + 14 * PT;
    var w1 = doc.text(x, osn, 'Zaposleni: ', { size: fs, bold: true, color: DPDF.INK });
    var w2 = doc.text(x + w1, osn, z.ime || '', { size: fs, bold: true, color: DPDF.INK });
    doc.line(x + w1 - 2 * PT, osn + 3.5 * PT, x + w1 + w2 + 2 * PT, osn + 3.5 * PT, { width: 2 * PT, color: DPDF.INK });
    y += h + 14 * PT;
    var W = R - M, kol = [M, M + W * 0.24, M + W * 0.41, M + W * 0.58, R];   // Dan | Prihod | Odhod | Podpis
    var st = [{ t: 'Dan', x: M + 8 * PT }, { t: 'Prihod', x: (kol[1] + kol[2]) / 2, align: 'center' }, { t: 'Odhod', x: (kol[2] + kol[3]) / 2, align: 'center' }, { t: 'Podpis', x: (kol[3] + kol[4]) / 2, align: 'center' }];
    y = dpdfTabGlava(doc, y, st);
    var dni = urDnevi(mesec), vrsta = 7.2 * 72 / 25.4, top = y, SIVA = [207 / 255, 207 / 255, 207 / 255];
    dni.forEach(function (d) {
      if (d.praznik) doc.rect(M, y, W, vrsta, { fill: [246 / 255, 246 / 255, 246 / 255] });
      var o = dpdfOsnova(y, 10 * PT, vrsta);
      var wd = doc.text(M + 8 * PT, o, d.oznaka, { size: 10 * PT, weight: 600, color: d.sob ? DPDF.SIVA : DPDF.INK });
      if (d.praznik) doc.text(M + 8 * PT + wd + 6 * PT, o, 'PRAZNIK', { size: 7.5 * PT, weight: 600, spacing: 0.06, color: DPDF.POZOR });
      y += vrsta;
      doc.line(M, y, R, y, { width: 0.75 * PT, color: SIVA });
    });
    [kol[1], kol[2], kol[3]].forEach(function (cx) { doc.line(cx, top, cx, y, { width: 0.75 * PT, color: SIVA }); });
    doc.line(M, top, M, y, { width: 0.75 * PT, color: SIVA }); doc.line(R, top, R, y, { width: 0.75 * PT, color: SIVA });
  }
  async function urPdfPrenesi(osebe, mesec) {
    if (!(await pdfPripravljen())) return;
    var doc = new PDFDoc();
    osebe.forEach(function (z) { doc.addPage(); urPdfStran(doc, z, mesec); });
    pdfIzhod(doc, 'listi_ure_' + mesec + '.pdf');
  }
  // Okno: mesec + zaposleni (aktivni izbrani) → predogled (Natisni / Shrani kot PDF).
  function urListiModal() {
    var zap = (ZAPOSLENI || []).filter(function (z) { return z.active; }).sort(function (a, b) { return (a.ime || '').localeCompare(b.ime || '', 'sl', { sensitivity: 'base' }); });
    var back = document.createElement('div'); back.className = 'sc-modal-back';
    var checks = zap.map(function (z) { return '<label class="fx-cli"><input type="checkbox" class="fx-org" value="' + escape_(z.id) + '" checked><span>' + escape_(z.ime) + '</span></label>'; }).join('') || '<p class="u-sub">Ni aktivnih zaposlenih.</p>';
    back.innerHTML = '<div class="sc-modal sc-modal-wide" role="dialog" aria-modal="true">' +
      '<h4>Listi za vpis ur</h4>' +
      '<div class="fx-dates"><label>Mesec<input type="month" class="sc-modal-input ur-mesec"></label></div>' +
      '<div class="fx-cli-head"><span>Zaposleni</span><label class="fx-all"><input type="checkbox" class="fx-vse" checked><span>Vse</span></label></div>' +
      '<div class="fx-cli-list">' + checks + '</div>' +
      '<div class="fx-msg msg"></div>' +
      '<div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" data-no>Prekliči</button><button type="button" class="sc-modal-btn primary" data-yes>Predogled</button></div>' +
      '</div>';
    document.body.appendChild(back);
    var mI = back.querySelector('.ur-mesec'); mI.value = (_prisDan || danes10()).slice(0, 7);
    var vse = back.querySelector('.fx-vse');
    var izb = function () { return Array.prototype.slice.call(back.querySelectorAll('.fx-org')); };
    vse.addEventListener('change', function () { izb().forEach(function (c) { c.checked = vse.checked; }); });
    back.querySelector('.fx-cli-list').addEventListener('change', function () { vse.checked = izb().every(function (c) { return c.checked; }); });
    requestAnimationFrame(function () { back.classList.add('show'); });
    var done = false;
    function zapri() { if (done) return; done = true; back.classList.remove('show'); document.removeEventListener('keydown', onKey); setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); }
    function onKey(e) { if (e.key === 'Escape') zapri(); }
    back.querySelector('[data-no]').addEventListener('click', zapri);
    back.addEventListener('click', function (e) { if (e.target === back) zapri(); });
    document.addEventListener('keydown', onKey);
    var msg = back.querySelector('.fx-msg');
    back.querySelector('[data-yes]').addEventListener('click', function () {
      var mesec = mI.value;
      if (!/^\d{4}-\d{2}$/.test(mesec)) { msg.className = 'fx-msg msg bad show'; msg.textContent = 'Izberi mesec.'; return; }
      var ids = izb().filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
      var osebe = zap.filter(function (z) { return ids.indexOf(z.id) >= 0; });
      if (!osebe.length) { msg.className = 'fx-msg msg bad show'; msg.textContent = 'Izberi vsaj eno zaposleno.'; return; }
      zapri();
      predogledDokument({
        naslov: 'Listi za vpis ur — ' + _mesecLabel(mesec),
        docHtml: dokHtml('Evidenca delovnega časa — ' + _mesecLabel(mesec), osebe.map(function (z) { return urListHtml(z, mesec); })),
        pdf: function () { return urPdfPrenesi(osebe, mesec); }
      });
    });
  }

  // »Odjavi« (zaposleni je pozabil tapniti odhod): isto okno za vnos ur, odprta izmena
  // dobi odhod = zdaj — ostane le še Shrani.
  function prisOdjavi(empId) {
    var l = prisZadnji(empId);
    if (!l || l.type !== 'in') { toast('Ta oseba ni prijavljena.'); return; }
    prisVnosUr(empId, danLocal(l.ts), { fokus: { odhod: true } });
  }
  var _prisTimer = null;
  // Samodejno osveževanje table "Trenutno prisotni" (brez ročnega refresha).
  function prisAuto() {
    var sec = document.getElementById('sec-prisotnost');
    if (!sec || sec.classList.contains('hidden')) return;      // ni odprto
    if (document.hidden) return;                                // zavihek v ozadju → ne obremenjuj baze
    if (_okno || document.querySelector('.sc-modal-back')) return;   // odprto okno ali modal → ne moti
    var ae = document.activeElement;                            // uporabnik nekaj tipka → ne moti
    if (ae && sec.contains(ae) && /INPUT|SELECT|TEXTAREA/.test(ae.tagName)) return;
    naloziPrisotnost().then(function () {
      if (!Array.isArray(ZAPOSLENI)) ZAPOSLENI = [];
      if (!Array.isArray(PRISDOG)) PRISDOG = [];
      prisRender();
    }).catch(function () {});
  }
  async function risiPrisotnost() {
    var box = $('prisList'); if (!box) return;
    pokaziNalaganje(box);
    try {
      await naloziPrisotnost();
      if (!Array.isArray(ZAPOSLENI)) ZAPOSLENI = [];
      if (!Array.isArray(PRISDOG)) PRISDOG = [];
      if (!_prisDan) _prisDan = danes10();
      prisRender();
      box.dataset.loaded = '1';
      if (!_prisTimer) {
        _prisTimer = setInterval(prisAuto, 12000);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) prisAuto(); });   // ob vrnitvi takoj sveže
      }
    } catch (e) {
      if (!box.dataset.loaded) box.innerHTML = '<div class="pris-card"><p class="u-sub">Napake pri nalaganju: ' + escape_(e && e.message ? e.message : e) + '</p></div>';
    }
  }
  function prisRender() {
    var box = $('prisList'); if (!box) return;
    var _sy = window.scrollY;
    // Zaposleni vidi SAMO svoje ure (oseben pregled, brez ostalih).
    if (JE_ZAPOSLENI()) { prisRenderMoje(box, _sy); return; }
    var aktivni = (ZAPOSLENI || []).filter(function (z) { return z.active; });
    // ── Blok 1: zaposleni (trenutno stanje + upravljanje) ──
    // Ena kartica namesto »Trenutno prisotni« + »Zaposleni«: vsak zaposleni je okvirček
    // (Seznam ali Mreža po nastavitvi Pogled), klik odpre okno s stanjem in dejanji.
    var danesD = danes10();
    var zapUrejeni = (ZAPOSLENI || []).slice().sort(function (a, b) { return (b.active ? 1 : 0) - (a.active ? 1 : 0); });   // aktivni najprej; sicer vrstni red ostane
    var prisotnihN = 0;
    var zapMreza = pogledPref() === 'grid';
    // Barva vsakega zaposlenega: povezan z računom ima barvo osebe iz Uporabnikov (in je nima nihče drug),
    // ostali dobijo preostale barve po vrstnem redu na zaslonu — sosednji kartici nista nikoli enaki.
    var zapBarve = {}, zasedene = {};
    zapUrejeni.forEach(function (z) { var b = barvaOsebe(z.profile_id, PRIS_UPO); if (b) { zapBarve[z.id] = b; zasedene[b[0]] = 1; } });
    var proste = BARVE_OSEB.filter(function (b) { return !zasedene[b[0]]; });
    if (!proste.length) proste = BARVE_OSEB;
    zapUrejeni.forEach(function (z, i) { if (!zapBarve[z.id]) zapBarve[z.id] = proste[i % proste.length]; });
    var zapKartice = zapUrejeni.map(function (z, i) {
      var l = prisZadnji(z.id); var notri = !!(z.active && l && l.type === 'in');
      // prihod s prejšnjega dne brez odhoda: ni »prisoten«, ampak pozabljena odjava (prej »od 06:30«, kot da je tu zdaj)
      var brezOdhoda = notri && isoLokalno(new Date(l.ts)) < danesD;
      var odhodTxt = brezOdhoda ? 'ni odhoda · ' + datum(isoLokalno(new Date(l.ts))).replace(/ \d{4}$/, '') + ' ' + uraMin(l.ts) : '';
      if (notri && !brezOdhoda) prisotnihN++;
      var upo = z.profile_id ? PRIS_UPO_MAP[z.profile_id] : null;
      var upoLbl = upo ? (upo.email || upo.full_name || 'povezan') : '';
      var dan = prisPari(z.id, danesD);
      var danUre = dan.sek ? trajanjeH(dan.sek) : '';
      var intervali = dan.pari.map(function (p) { return uraMin(p[0].ts) + '–' + uraMin(p[1].ts); });
      if (dan.odprt) intervali.push(uraMin(dan.odprt.ts) + ' → v teku');
      var znak = !z.active ? '<span class="pris-badge out">neaktiven</span>' : (brezOdhoda ? '<span class="pris-badge warn">' + odhodTxt + '</span>' : notri ? '<span class="pris-badge in">prisoten · od ' + uraMin(l.ts) + '</span>' : '<span class="pris-badge out">odsoten</span>');
      var pod = upoLbl || (z.ima_kartico ? 'kartica dodeljena' : 'brez kartice');
      var det = '<dl class="pris-zap-dl">' +
          (notri ? '<dt>Stanje</dt><dd>' + znak + ' <button type="button" class="cgrp-btn ghost pris-odjavi" data-odjavi="' + z.id + '">' + (brezOdhoda ? 'Vpiši odhod' : 'Odjavi') + '</button></dd>' : '') +
          '<dt>Danes</dt><dd>' + (intervali.length ? escape_(intervali.join(', ')) + (danUre ? ' · <b>' + danUre + '</b>' : '') : '<span class="u-sub">ni vpisov</span>') + '</dd>' +
          '<dt>Uporabnik</dt><dd>' + (upoLbl ? escape_(upoLbl) : '<span class="u-sub">ni povezan</span>') + '</dd>' +
          '<dt>Kartica</dt><dd>' + (z.ima_kartico ? 'dodeljena' : '<span class="u-sub">ni dodeljena</span>') + '</dd>' +
        '</dl>' +
        '<div class="pris-emp-act pris-zap-act">' +
          '<button type="button" class="cgrp-btn" data-vnosur="' + z.id + '">Vnesi ure</button>' +
          '<button type="button" class="cgrp-btn ghost" data-uredi="' + z.id + '">Uredi</button>' +
          '<button type="button" class="cgrp-btn ghost' + (z.profile_id ? ' on' : '') + '" data-uporabnik="' + z.id + '">' + (z.profile_id ? 'Uporabnik povezan' : 'Poveži uporabnika') + '</button>' +
          '<button type="button" class="cgrp-btn ghost" data-aktiv="' + z.id + '" data-v="' + (z.active ? '0' : '1') + '">' + (z.active ? 'Deaktiviraj' : 'Aktiviraj') + '</button>' +
          '<button type="button" class="cgrp-btn danger" data-izbrisi="' + z.id + '">Izbriši</button>' +
        '</div>';
      // Mreža: naslovnica z imenom (barva osebe) → ure danes → stanje
      var barva = zapBarve[z.id];
      if (zapMreza) {
        var stanje = !z.active ? 'Neaktiven' : brezOdhoda ? 'Ni odhoda · ' + odhodTxt.replace(/^ni odhoda · /, '') : notri ? 'Prisoten od ' + uraMin(l.ts) : 'Odsoten';
        var danesTxt = 'danes ' + (danUre || (notri && !brezOdhoda ? 'v teku' : 'ni vpisov'));
        return '<div class="lcell pz-cell' + (z.active ? '' : ' pris-neakt') + '"><button class="row pz" type="button" data-zid="' + z.id + '" aria-haspopup="dialog" title="' + escape_(pod) + '" style="' + naslovnica(barva, z.id) + '">' +
          '<span><span class="row-name"><span class="row-nm">' + escape_(z.ime) + '</span></span><span class="row-legal">' + escape_(stanje) + '</span></span>' +
          '<span class="num pris-zap-ure">' + escape_(danesTxt) + '</span><span class="chev" aria-hidden="true">›</span></button>' +
          '<div class="arts pris-zap-det">' + det + '</div></div>';
      }
      // ENA vrstica na zaposlenega: ime · stanje · ure danes (prej tri: ime, kartica, značka —
      // do mesečne evidence je bilo treba dolgo drseti). Kartica in uporabnik sta v oknu.
      var stKr = !z.active ? '<span class="pz-st off">neaktiven</span>' : (brezOdhoda ? '<span class="pz-st warn">' + odhodTxt + '</span>' : notri ? '<span class="pz-st in">od ' + uraMin(l.ts) + '</span>' : '<span class="pz-st">odsoten</span>');
      return '<div class="pz-cell' + (z.active ? '' : ' pris-neakt') + '"><button class="row pz" type="button" data-zid="' + z.id + '" aria-haspopup="dialog" title="' + escape_(pod) + '" style="' + naslovnica(barva, z.id) + '">' +
        '<span class="pz-ime"><span class="row-name"><span class="row-nm">' + escape_(z.ime) + '</span></span>' + stKr + '</span>' +
        '<span class="num pris-zap-ure" title="Danes">' + (danUre || '—') + '</span><span class="chev" aria-hidden="true">›</span></button>' +
        '<div class="arts pris-zap-det">' + det + '</div></div>';
    }).join('');
    var aktivnihN = aktivni.length;
    var blok1 = '<div class="pris-card pris-zap-card"><div class="pris-h"><h3 class="sec-h">Zaposleni</h3>' +
      '<span class="pris-count" title="Prisotni / aktivni">' + prisotnihN + ' / ' + aktivnihN + ' prisotnih</span></div>' +
      (zapKartice ? '<div class="pris-zap ' + (zapMreza ? 'rows pz-mreza' : 'pz-seznam') + '">' + zapKartice + '</div>' : '<p class="u-sub" style="padding:10px 2px">Še ni zaposlenih.</p>') +
      '<div class="pris-add"><input type="text" class="pris-new" placeholder="Ime in priimek"><button type="button" class="cgrp-btn pris-add-btn">' + IKO_T_PLUS + 'Dodaj</button></div></div>';

    // ── Blok 2: evidenca (dan/mesec/oseba) ──
    var mesecni = (_prisView === 'mesec' || _prisView === 'oseba');
    var kljuc = mesecni ? _prisDan.slice(0, 7) : _prisDan;
    var telo;
    if (_prisView === 'oseba') {
      var mk = _prisDan.slice(0, 7);
      var zsel = (ZAPOSLENI || []).find(function (z) { return z.id === _prisOseba; }) || aktivni[0] || (ZAPOSLENI || [])[0] || null;
      if (zsel) _prisOseba = zsel.id;
      var opts = (ZAPOSLENI || []).map(function (z) {
        return '<option value="' + z.id + '"' + (zsel && z.id === zsel.id ? ' selected' : '') + '>' + escape_(z.ime) + (z.active ? '' : ' (neaktiven)') + '</option>';
      }).join('');
      var oRows = '', oTot = 0, oDni = 0;
      if (zsel) {
        var nDni = dniVMesecu(mk);
        for (var di = 1; di <= nDni; di++) {
          var dayISO = mk + '-' + ('0' + di).slice(-2);
          var wd = new Date(dayISO + 'T00:00:00').getDay();
          var c = prisChipiDan(zsel.id, dayISO); oTot += c.sek; if (c.sek) oDni++;
          oRows += '<tr' + (wd === 0 || wd === 6 ? ' class="pris-vikend"' : '') + '>' +
            '<td class="pris-dan-c">' + DNEVI_KR[wd] + ' ' + di + '.</td>' +
            '<td class="pris-pairs">' + c.html + '</td>' +
            '<td class="pris-ure">' + (c.sek ? trajanjeH(c.sek) : '—') + '</td>' +
            '<td class="pris-act"><button type="button" class="cgrp-btn ghost" data-rocniday="' + zsel.id + '|' + dayISO + '" title="Ročni vnos ur">+<span class="pris-rocno-t"> ročno</span></button></td></tr>';
        }
      }
      telo = '<div class="pris-oseba-sel"><select id="prisOsebaSel" class="sc-modal-input">' + (opts || '') + '</select></div>' +
        '<div class="pris-scroll"><table class="pris-tbl pris-tbl-oseba"><thead><tr><th>Dan</th><th>Prihod–odhod</th><th>Ur</th><th></th></tr></thead><tbody>' +
        (oRows || '<tr><td colspan="4" class="u-sub">Ni zaposlenih.</td></tr>') + '</tbody>' +
        '<tfoot><tr><td>Skupaj (' + oDni + ' dni)</td><td></td><td class="pris-ure">' + (oTot ? trajanjeH(oTot) : '—') + '</td><td></td></tr></tfoot></table></div>';
    } else if (_prisView === 'mesec') {
      var mSek = 0, mDni = 0;
      var mVrst = prisOsebeZaEvidenco(kljuc).map(function (z) {
        var pov = prisPovzetek(z.id, kljuc);
        mSek += pov.sek; mDni += pov.dni;
        return '<tr><td>' + escape_(z.ime) + (z.active ? '' : ' <span class="u-sub">(neaktiven)</span>') + '</td><td class="pris-ure">' + pov.dni + '</td><td class="pris-ure">' + (pov.sek ? trajanjeH(pov.sek) : '—') + '</td></tr>';
      }).join('');
      telo = '<div class="pris-scroll"><table class="pris-tbl"><thead><tr><th>Zaposleni</th><th>Dni</th><th>Ur skupaj</th></tr></thead><tbody>' +
        (mVrst || '<tr><td colspan="3" class="u-sub">Ni podatkov.</td></tr>') + '</tbody>' +
        (mVrst ? '<tfoot><tr><td>Skupaj</td><td class="pris-ure">' + mDni + '</td><td class="pris-ure">' + (mSek ? trajanjeH(mSek) : '—') + '</td></tr></tfoot>' : '') +
        '</table></div>';
    } else {
      var dSek = 0;
      var dVrst = prisOsebeZaEvidenco(kljuc).map(function (z) {
        var c = prisChipiDan(z.id, kljuc);
        dSek += c.sek;
        return '<tr><td>' + escape_(z.ime) + (z.active ? '' : ' <span class="u-sub">(neaktiven)</span>') + '</td><td class="pris-pairs">' + c.html + '</td><td class="pris-ure">' + (c.sek ? trajanjeH(c.sek) : '—') + '</td>' +
          '<td class="pris-act"><button type="button" class="cgrp-btn ghost" data-rocni="' + z.id + '" title="Ročni vnos ur">+<span class="pris-rocno-t"> ročno</span></button></td></tr>';
      }).join('');
      telo = '<div class="pris-scroll"><table class="pris-tbl pris-tbl-dan"><thead><tr><th>Zaposleni</th><th>Prihod–odhod</th><th>Ur skupaj</th><th></th></tr></thead><tbody>' +
        (dVrst || '<tr><td colspan="4" class="u-sub">Ni podatkov.</td></tr>') + '</tbody>' +
        (dVrst ? '<tfoot><tr><td>Skupaj</td><td></td><td class="pris-ure">' + (dSek ? trajanjeH(dSek) : '—') + '</td><td></td></tr></tfoot>' : '') +
        '</table></div>';
    }
    var blok2 = '<div class="pris-card"><div class="pris-h"><h3 class="sec-h">Evidenca</h3>' +
      '<span class="pris-hbtns"><button type="button" class="cgrp-btn ghost pris-ure-listi" title="Natisni liste za ure">' + IKO_TISK + 'Listi za ure</button>' +
      '<button type="button" class="cgrp-btn ghost pris-izvoz">Izvozi ' + escape_(_mesecLabel(_prisDan.slice(0, 7))) + '</button></span></div>' +
      '<div class="pris-barvrsta">' +
        '<div class="pris-datum">' +
          '<button type="button" class="pris-nav" data-nav="-1" aria-label="Prejšnji"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg></button>' +
          '<input type="' + (mesecni ? 'month' : 'date') + '" id="prisDatum" value="' + (mesecni ? _prisDan.slice(0, 7) : _prisDan) + '">' +
          '<button type="button" class="pris-nav" data-nav="1" aria-label="Naslednji"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>' +
          ((mesecni ? (_prisDan.slice(0, 7) === danes10().slice(0, 7)) : (_prisDan === danes10())) ? '' : '<button type="button" class="dat-danes" id="prisDanes" title="Nazaj na danes">Danes</button>') +
        '</div>' +
        '<span class="pris-tabs"><button type="button" class="pris-tab' + (_prisView === 'dan' ? ' on' : '') + '" data-obd="dan">Dan</button>' +
        '<button type="button" class="pris-tab' + (_prisView === 'mesec' ? ' on' : '') + '" data-obd="mesec">Mesec</button>' +
        '<button type="button" class="pris-tab' + (_prisView === 'oseba' ? ' on' : '') + '" data-obd="oseba">Oseba</button></span>' +
      '</div>' +
      telo + '</div>';

    box.innerHTML = blok1 + blok2;

    var dat = $('prisDatum'); if (dat) dat.addEventListener('change', function () { var v = this.value || danes10(); if (v.length === 7) v += '-01'; _prisDan = v; prisObdobje(); });
    { var pdn = $('prisDanes'); if (pdn) pdn.addEventListener('click', function () { _prisDan = danes10(); prisObdobje(); }); }
    box.querySelectorAll('[data-obd]').forEach(function (b) { b.addEventListener('click', function () { _prisView = b.dataset.obd; _prisMesec = (_prisView !== 'dan'); prisRender(); }); });
    box.querySelectorAll('[data-nav]').forEach(function (b) { b.addEventListener('click', function () { prisPremakni(parseInt(b.dataset.nav, 10)); }); });
    { var os = $('prisOsebaSel'); if (os) os.addEventListener('change', function () { _prisOseba = this.value; prisRender(); }); }
    box.querySelectorAll('[data-rocniday]').forEach(function (b) { b.addEventListener('click', function () { var p = String(b.dataset.rocniday).split('|'); prisRocni(p[0], p[1]); }); });
    { var ib = box.querySelector('.pris-izvoz'); if (ib) ib.addEventListener('click', prisIzvoz); }
    { var ul = box.querySelector('.pris-ure-listi'); if (ul) ul.addEventListener('click', urListiModal); }
    box.querySelectorAll('[data-odjavi]').forEach(function (b) { b.addEventListener('click', function () { prisOdjavi(b.dataset.odjavi); }); });
    box.querySelectorAll('[data-rocni]').forEach(function (b) { b.addEventListener('click', function () { prisRocni(b.dataset.rocni); }); });
    box.querySelectorAll('[data-vnosur]').forEach(function (b) { b.addEventListener('click', function () { prisVnosUr(b.dataset.vnosur, danes10()); }); });
    box.querySelectorAll('[data-delpair]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); prisIzbrisiPar(b.dataset.delpair); }); });
    box.querySelectorAll('[data-cpair]').forEach(function (cb) { cb.addEventListener('click', function (e) { e.stopPropagation(); }); cb.addEventListener('change', function (e) { e.stopPropagation(); prisPotrdiPar(cb.dataset.cpair, cb.checked); }); });
    box.querySelectorAll('[data-editpair]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); prisUrediPar(b.dataset.editpair); }); });
    box.querySelectorAll('[data-aktiv]').forEach(function (b) { b.addEventListener('click', function () { prisAktiv(b.dataset.aktiv, b.dataset.v === '1'); }); });
    box.querySelectorAll('[data-uredi]').forEach(function (b) { b.addEventListener('click', function () { prisPreimenuj(b.dataset.uredi); }); });
    box.querySelectorAll('[data-uporabnik]').forEach(function (b) { b.addEventListener('click', function () { prisPoveziUporabnika(b.dataset.uporabnik); }); });
    box.querySelectorAll('[data-izbrisi]').forEach(function (b) { b.addEventListener('click', function () { prisIzbrisi(b.dataset.izbrisi); }); });
    var nb = box.querySelector('.pris-add-btn'), ni = box.querySelector('.pris-new');
    if (nb && ni) { nb.addEventListener('click', function () { prisDodajZap(ni.value); }); ni.addEventListener('keydown', function (e) { if (e.key === 'Enter') prisDodajZap(ni.value); }); }
    box.querySelectorAll('.pris-zap .row[data-zid]').forEach(function (b) { b.addEventListener('click', function () { prisOdpriZap(b); }); });
    requestAnimationFrame(function () { window.scrollTo(0, _sy); });
    oknoPoIzrisu();   // samodejna osvežitev (vsakih 12 s) in dejanja: okno dobi sveže stanje ali se zapre
  }
  function prisNajdiZap(id) { return document.querySelector('#prisList .pris-zap .row[data-zid="' + String(id).replace(/"/g, '\\"') + '"]'); }
  function prisOdpriZap(btn) {
    if (_okno) return;
    var id = btn.dataset.zid;
    oknoOdpri(btn, btn.nextElementSibling, function () { return prisNajdiZap(id); }, {
      osvezi: function (k) { return k.nextElementSibling; }
    });
  }
  // Oseben pregled ur za vlogo »Zaposleni«.
  function prisRenderMoje(box, _sy) {
    var mk = _prisDan.slice(0, 7);
    var moj = (ZAPOSLENI || []).find(function (z) { return (z.ime || '').trim().toLowerCase() === (JAZIME || '').trim().toLowerCase(); });
    var telo;
    if (!moj) {
      telo = '<p class="u-sub" style="padding:8px 2px">Profil ni povezan z evidenco ur.</p>';
    } else {
      var rows = '', tot = 0, dni = 0, nDni = dniVMesecu(mk);
      for (var di = 1; di <= nDni; di++) {
        var dayISO = mk + '-' + ('0' + di).slice(-2);
        var wd = new Date(dayISO + 'T00:00:00').getDay();
        var c = prisChipiDan(moj.id, dayISO); tot += c.sek; if (c.sek) dni++;
        rows += '<tr' + (wd === 0 || wd === 6 ? ' class="pris-vikend"' : '') + '><td class="pris-dan-c">' + DNEVI_KR[wd] + ' ' + di + '.</td><td class="pris-pairs">' + c.html + '</td><td class="pris-ure">' + (c.sek ? trajanjeH(c.sek) : '—') + '</td></tr>';
      }
      telo = '<div class="pris-scroll"><table class="pris-tbl pris-tbl-oseba"><thead><tr><th>Dan</th><th>Prihod–odhod</th><th>Ur</th></tr></thead><tbody>' + rows + '</tbody><tfoot><tr><td>Skupaj (' + dni + ' dni)</td><td></td><td class="pris-ure">' + (tot ? trajanjeH(tot) : '—') + '</td></tr></tfoot></table></div>';
    }
    box.innerHTML = '<div class="pris-card"><div class="pris-h"><h3 class="sec-h">Moje ure — ' + escape_(_mesecLabel(mk)) + '</h3></div>' +
      '<div class="pris-barvrsta"><div class="pris-datum">' +
      '<button type="button" class="pris-nav" data-mnav="-1" aria-label="Prejšnji"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg></button>' +
      '<input type="month" id="prisDatumMoj" value="' + mk + '">' +
      '<button type="button" class="pris-nav" data-mnav="1" aria-label="Naslednji"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>' +
      '</div></div>' + telo + '</div>';
    function skoci(delta) { var d = new Date(mk + '-01T00:00:00'); d.setMonth(d.getMonth() + delta); _prisDan = isoLokalno(d); prisRender(); }   // lokalni datum (toISOString je v UTC: 1. 11. → 31. 10.)
    var dm = $('prisDatumMoj'); if (dm) dm.addEventListener('change', function () { var v = this.value; if (v) { _prisDan = v + '-01'; prisRender(); } });
    box.querySelectorAll('[data-mnav]').forEach(function (b) { b.addEventListener('click', function () { skoci(parseInt(b.dataset.mnav, 10)); }); });
    requestAnimationFrame(function () { window.scrollTo(0, _sy); });
  }
  async function prisDodajZap(ime) {
    ime = (ime || '').trim(); if (!ime) { toast('Vpiši ime.'); return; }
    var org = prisOrg(); if (!org) { toast('Ni organizacije za zaposlenega.'); return; }
    var ins = await sb.from('employees').insert({ org_id: org, ime: ime, active: true }).select('id').maybeSingle();
    if (ins.error) { toast(napakaBesedilo(ins.error)); return; }
    toast('Zaposleni dodan.'); await risiPrisotnost();
  }
  async function prisAktiv(empId, on) {
    var up = await sb.from('employees').update({ active: on }).eq('id', empId);
    if (up.error) { toast(napakaBesedilo(up.error)); return; }
    await risiPrisotnost();
  }
  async function prisPreimenuj(empId) {
    var z = (ZAPOSLENI || []).find(function (x) { return x.id === empId; }); if (!z) return;
    var novo = await vnesiModal({ naslov: 'Preimenuj zaposlenega', privzeto: z.ime, placeholder: 'Ime in priimek', potrdi: 'Shrani' });
    if (novo === null) return;
    novo = novo.trim(); if (!novo) { toast('Ime ne sme biti prazno.'); return; }
    var up = await sb.from('employees').update({ ime: novo }).eq('id', empId);
    if (up.error) { toast(napakaBesedilo(up.error)); return; }
    toast('Ime posodobljeno.'); await risiPrisotnost();
  }
  // Poveži zaposlenega (evidenca ur) z uporabnikom portala (e-pošta + geslo).
  function prisPoveziUporabnika(empId) {
    var z = (ZAPOSLENI || []).find(function (x) { return x.id === empId; }); if (!z) return;
    if (!PRIS_UPO || !PRIS_UPO.length) { toast('Ni uporabnikov portala za povezavo.'); return; }
    var opts = '<option value="">— brez povezave —</option>' + PRIS_UPO.map(function (u) {
      var lbl = (u.full_name ? u.full_name + ' · ' : '') + (u.email || u.id);
      return '<option value="' + u.id + '"' + (z.profile_id === u.id ? ' selected' : '') + '>' + escape_(lbl) + '</option>';
    }).join('');
    var back = document.createElement('div'); back.className = 'sc-modal-back';
    back.innerHTML = '<div class="sc-modal" role="dialog" aria-modal="true"><h4>Poveži z uporabnikom — ' + escape_(z.ime) + '</h4>' +
      '<label class="pris-lab">Uporabnik</label><select class="pu-sel sc-modal-input">' + opts + '</select>' +
      '<div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" data-no>Prekliči</button><button type="button" class="sc-modal-btn primary" data-yes>Shrani</button></div></div>';
    document.body.appendChild(back);
    requestAnimationFrame(function () { back.classList.add('show'); });
    function zapri() { back.classList.remove('show'); setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); }
    back.querySelector('[data-no]').addEventListener('click', zapri);
    back.addEventListener('click', function (e) { if (e.target === back) zapri(); });
    back.querySelector('[data-yes]').addEventListener('click', async function () {
      var val = back.querySelector('.pu-sel').value || null;
      if (val) { var ze = (ZAPOSLENI || []).find(function (x) { return x.profile_id === val && x.id !== empId; }); if (ze) { toast('Ta uporabnik je že povezan z: ' + ze.ime); return; } }
      var up = await sb.from('employees').update({ profile_id: val }).eq('id', empId);
      if (up.error) { toast(napakaBesedilo(up.error)); return; }
      logDodaj('Prisotnost', 'Urejeno', 'Zaposleni »' + z.ime + '« ' + (val ? 'povezan z uporabnikom ' + ((PRIS_UPO_MAP[val] && PRIS_UPO_MAP[val].email) || '') : 'odvezan od uporabnika'));
      toast(val ? 'Uporabnik povezan.' : 'Povezava odstranjena.'); zapri(); await risiPrisotnost();
    });
  }
  async function prisIzbrisi(empId) {
    var z = (ZAPOSLENI || []).find(function (x) { return x.id === empId; }); if (!z) return;
    var ok = await potrdiModal({ naslov: 'Izbriši zaposlenega', sporocilo: 'Res izbrišem »' + z.ime + '«? Izbrišejo se tudi vsi njegovi vpisi ur — tega ni mogoče razveljaviti.', potrdi: 'Izbriši', preklici: 'Prekliči', nevarno: true });
    if (!ok) return;
    var del = await sb.from('employees').delete().eq('id', empId);
    if (del.error) { toast(napakaBesedilo(del.error)); return; }
    toast('Zaposleni izbrisan.'); await risiPrisotnost();
  }
  // Kartice zaposlenim dodaja le skrbnik na C72 (aplikacija RFID → Kartica zaposlenega); portal pokaže, ali jo ima.
  // Potrdi/prekliči uro (par prihod–odhod). Označi obe (prihod + odhod).
  async function prisPotrdiPar(idsStr, on) {
    var ids = String(idsStr || '').split(',').filter(Boolean);
    if (!ids.length) return;
    var up = await sb.from('att_events').update({ potrjeno: on }).in('id', ids);
    if (up.error) { toast(napakaBesedilo(up.error)); return; }
    ids.forEach(function (id) { var d = prisDogById(id); if (d) d.potrjeno = on; });
    prisRender();
  }
  async function prisIzbrisiPar(idsStr) {
    var ids = String(idsStr || '').split(',').filter(Boolean);
    if (!ids.length) return;
    var ok = await potrdiModal({ naslov: 'Izbriši vpis', sporocilo: 'Izbrišem ta vpis ur (prihod' + (ids.length > 1 ? ' in odhod' : '') + ')? Tega ni mogoče razveljaviti.', potrdi: 'Izbriši', preklici: 'Prekliči', nevarno: true });
    if (!ok) return;
    var del = await sb.from('att_events').delete().in('id', ids);
    if (del.error) { toast(napakaBesedilo(del.error)); return; }
    toast('Vpis izbrisan.'); await risiPrisotnost();
  }
  function hmLocal(ts) { var d = new Date(ts); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function danLocal(ts) { var d = new Date(ts); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function prisDogById(id) { return (PRISDOG || []).find(function (d) { return d.id === id; }); }
  // ══ VNOS UR — eno okno za vse ročne vpise ══
  // Prej so bila za isto opravilo tri različna okna (»+ ročno«, »Odjavi«, urejanje vpisa ✎).
  // Zdaj vse odpre to okno: izmene izbranega dne (obstoječe so že vpisane), ‹ › za prejšnji/
  // naslednji dan (ob premiku se spremembe shranijo — hitro prepisovanje lista z ur), ure se
  // tipkajo s številkami (730 → 07:30, 1530 → 15:30), »Zdaj« za odhod današnje izmene.
  // ── Izbirnik ure kot pri budilki: kolesi za uro in minute (pomik s prstom/kolescem, puščice, klik, tipkanje številk),
  // ob vsakem preskoku rahel tresljaj (Android: vibrate; iPhone: sistemski »haptic« stikala, kjer ga Safari dovoli).
  var VU_H = 40, _hapt = null;
  function haptika() {
    try { if (navigator.vibrate) { navigator.vibrate(5); return; } } catch (e) {}
    try {
      if (!_hapt) {
        _hapt = document.createElement('label'); _hapt.setAttribute('aria-hidden', 'true');
        _hapt.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;';
        var c = document.createElement('input'); c.type = 'checkbox'; c.setAttribute('switch', ''); c.tabIndex = -1;
        _hapt.appendChild(c); document.body.appendChild(_hapt);
      }
      _hapt.click();
    } catch (e) {}
  }
  function dvo(n) { return ('0' + n).slice(-2); }
  // Kolo kot pri budilki: vrti se v krogu (za 59 pride 00). Seznam je sedemkrat ponovljen; ko se kolo ustavi
  // zunaj srednje ponovitve, ga neopazno prestavimo nazaj na sredino (ista vrednost, isti videz).
  function vuKolo(n, val, ime, ob) {
    var K = 7, SRED = 3;
    var el = document.createElement('div'); el.className = 'vu-kolo'; el.tabIndex = 0;
    el.setAttribute('role', 'spinbutton'); el.setAttribute('aria-label', ime);
    el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', String(n - 1));
    var html = '<div class="vu-kolo-pad"></div>';
    for (var k = 0; k < K; k++) for (var i = 0; i < n; i++) html += '<div class="vu-kolo-i" data-v="' + i + '"' + (k === SRED ? '' : ' aria-hidden="true"') + '>' + dvo(i) + '</div>';
    el.innerHTML = html + '<div class="vu-kolo-pad"></div>';
    var cur = -1, poz = -1, buf = '', bufT = null, mirT = null;
    function sredina(v) { return SRED * n + v; }
    function oznaci(p) {   // p = mesto v ponovljenem seznamu; vrne true, če se je spremenila vrednost
      if (p === poz) return false;
      var s0 = el.children[poz + 1]; if (s0) s0.classList.remove('on');
      poz = p; var t = el.children[p + 1]; if (t) t.classList.add('on');
      var v = p % n; if (v === cur) return false;
      cur = v; el.setAttribute('aria-valuenow', String(v)); el.setAttribute('aria-valuetext', dvo(v));
      return true;
    }
    function pojdi(p, gladko) { el.scrollTo({ top: p * VU_H, behavior: gladko ? 'smooth' : 'auto' }); }
    function naSredino() { if (Math.floor(poz / n) === SRED) return; var p = sredina(cur); oznaci(p); el.scrollTop = p * VU_H; }
    el.addEventListener('scroll', function () {
      var p = Math.max(0, Math.min(K * n - 1, Math.round(el.scrollTop / VU_H)));
      if (oznaci(p)) { haptika(); ob(cur); }
      clearTimeout(mirT); mirT = setTimeout(naSredino, 160);   // šele ko se kolo ustavi (vztrajnost na telefonu)
    }, { passive: true });
    el.addEventListener('click', function (e) { var t = e.target.closest('.vu-kolo-i'); if (t) pojdi([].indexOf.call(el.children, t) - 1, true); });
    el.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : e.key === 'PageDown' ? 5 : e.key === 'PageUp' ? -5 : 0;
      if (d) { e.preventDefault(); pojdi(poz + d, true); return; }
      if (/^[0-9]$/.test(e.key)) {   // tipkanje na računalniku: »7«, »15«, »30« — dve številki ali kratek premor
        e.preventDefault(); buf += e.key; clearTimeout(bufT);
        var v = +buf; if (v < n) pojdi(sredina(v), false);
        if (buf.length >= 2 || v * 10 >= n) {
          buf = '';
          var vsa = [].slice.call(el.closest('.vu-izm, .sc-modal').querySelectorAll('.vu-kolo')), ix = vsa.indexOf(el);
          if (vsa[ix + 1]) vsa[ix + 1].focus();
        } else bufT = setTimeout(function () { buf = ''; }, 900);
      }
    });
    el._nastavi = function (i) { var p = sredina(i); oznaci(p); el.scrollTop = p * VU_H; };
    el._nastavi(val);
    return el;
  }
  // Računalnik (miška, tipkovnica): polje ure s segmentoma kot v macOS — dvopičje je stalno, številke se tipkajo
  // (»7« → 07, »15« → 15, nato samodejno minute), ↑/↓ in kolesce miške spreminjata (minute po 5, s Shift po 1).
  function vuSeg(n, val, ime, ob, korak) {
    var el = document.createElement('span'); el.className = 'vu-seg'; el.tabIndex = 0;
    el.setAttribute('role', 'spinbutton'); el.setAttribute('aria-label', ime); el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', String(n - 1));
    var cur = val, buf = '', bufT = null;
    function nastavi(v, tiho) { cur = ((v % n) + n) % n; el.textContent = dvo(cur); el.setAttribute('aria-valuenow', String(cur)); if (!tiho) ob(cur); }
    function naprej() { var vsa = [].slice.call(el.closest('.vu-izm, .sc-modal').querySelectorAll('.vu-seg')), ix = vsa.indexOf(el); if (vsa[ix + 1]) vsa[ix + 1].focus(); }
    el.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); buf = ''; nastavi(cur + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 1 : korak)); return; }
      if (e.key === 'ArrowRight' || e.key === ':') { e.preventDefault(); naprej(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); var vsa = [].slice.call(el.closest('.vu-izm, .sc-modal').querySelectorAll('.vu-seg')), ix = vsa.indexOf(el); if (vsa[ix - 1]) vsa[ix - 1].focus(); return; }
      if (e.key === 'Backspace') { e.preventDefault(); buf = ''; nastavi(0); return; }
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault(); buf += e.key; clearTimeout(bufT);
        var v = +buf; if (v < n) nastavi(v); else { buf = e.key; nastavi(+e.key); }
        if (buf.length >= 2 || +buf * 10 >= n) { buf = ''; naprej(); } else bufT = setTimeout(function () { buf = ''; }, 1000);
      }
    });
    el.addEventListener('wheel', function (e) { if (Math.abs(e.deltaY) < 1) return; e.preventDefault(); nastavi(cur + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 1 : korak)); }, { passive: false });
    el.addEventListener('focus', function () { buf = ''; });
    el._nastavi = function (v) { nastavi(v, true); };
    nastavi(val, true);
    return el;
  }
  var VU_DOTIK = (function () { try { return matchMedia('(pointer:coarse)').matches; } catch (e) { return false; } })();
  // Ura »HH:MM« v škatli: telefon/tablica kolesi (budilka), računalnik polje s segmentoma; ob(hm) ob vsaki spremembi
  function vuUra(box, hm, ob) {
    var p = String(hm || '07:00').split(':'), h = +p[0] || 0, m = +p[1] || 0;
    if (!VU_DOTIK) {
      var sh = vuSeg(24, h, 'Ura', function (v) { h = v; ob(dvo(h) + ':' + dvo(m)); }, 1);
      var sm = vuSeg(60, m, 'Minute', function (v) { m = v; ob(dvo(h) + ':' + dvo(m)); }, 5);
      box.innerHTML = ''; box.classList.add('vu-polje'); box.appendChild(sh); box.insertAdjacentHTML('beforeend', '<span class="vu-dvo" aria-hidden="true">:</span>'); box.appendChild(sm);
      box._nastavi = function (v) { var q = String(v).split(':'); h = +q[0]; m = +q[1]; sh._nastavi(h); sm._nastavi(m); };
      return;
    }
    var kh = vuKolo(24, h, 'Ura', function (v) { h = v; ob(dvo(h) + ':' + dvo(m)); });
    var km = vuKolo(60, m, 'Minute', function (v) { m = v; ob(dvo(h) + ':' + dvo(m)); });
    box.innerHTML = ''; box.appendChild(kh); box.insertAdjacentHTML('beforeend', '<span class="vu-dvo" aria-hidden="true">:</span>'); box.appendChild(km);
    box._nastavi = function (v) { var q = String(v).split(':'); h = +q[0]; m = +q[1]; kh._nastavi(h); km._nastavi(m); };
    requestAnimationFrame(function () { kh._nastavi(h); km._nastavi(m); });   // scrollTop velja šele, ko je element postavljen
  }
  function vuPlusMin(hm, min) { var p = String(hm).split(':'), t = Math.min(23 * 60 + 59, Math.max(0, (+p[0]) * 60 + (+p[1]) + min)); return dvo(Math.floor(t / 60)) + ':' + dvo(t % 60); }
  function vuDanPlus(dan, n) { var d = new Date(dan + 'T12:00:00'); d.setDate(d.getDate() + n); return danLocal(d); }
  function vuDanNaziv(dan) {
    var d = new Date(dan + 'T12:00:00');
    var s = d.toLocaleDateString('sl-SI', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  // Izmene enega dne (lokalni dan), po istih pravilih kot prisPari: odvečen prihod med odprto
  // izmeno in osamljen odhod se ne prikažeta (in ostaneta nedotaknjena).
  function vuPari(evs) {
    var pari = [], odprt = null;
    evs.slice().sort(function (a, b) { return a.ts < b.ts ? -1 : 1; }).forEach(function (d) {
      if (d.type === 'in') { if (!odprt) odprt = d; }
      else if (d.type === 'out' && odprt) { pari.push({ in: odprt, out: d }); odprt = null; }
    });
    if (odprt) pari.push({ in: odprt, out: null });
    return pari;
  }
  // Izmene enega dne iz baze (neodvisno od naloženega obdobja v PRISDOG).
  async function vuNaloziPari(empId, dan) {
    var od = new Date(dan + 'T00:00:00').toISOString(), doo = new Date(vuDanPlus(dan, 1) + 'T00:00:00').toISOString();
    var r = await sb.from('att_events').select('id,employee_id,terminal_id,ts,type,source,potrjeno').eq('employee_id', empId).gte('ts', od).lt('ts', doo).order('ts', { ascending: true });
    if (r.error) throw r.error;
    return vuPari(r.data || []);
  }
  var _vuOdpiram = false;
  async function prisVnosUr(empId, danArg, opt) {
    opt = opt || {};
    var z = (ZAPOSLENI || []).find(function (x) { return x.id === empId; }); if (!z) return;
    var dan = (danArg && danArg.length === 10) ? danArg : ((_prisMesec || !_prisDan || _prisDan.length !== 10) ? danes10() : _prisDan);
    // Najprej podatki, nato okno — odpre se takoj v končni velikosti (prej je raslo po nalaganju).
    if (_vuOdpiram) return;
    _vuOdpiram = true;
    var pari;
    try { pari = await vuNaloziPari(z.id, dan); }
    catch (e) { toast('Ur ni bilo mogoče naložiti: ' + ((e && e.message) || e)); return; }
    finally { _vuOdpiram = false; }
    var dotaknjeno = false, shranjeno = false, zaseden = false;
    var back = document.createElement('div'); back.className = 'sc-modal-back';
    back.innerHTML = '<div class="sc-modal vu-modal" role="dialog" aria-modal="true" aria-label="Vnos ur">' +
      '<h4>Vnos ur — ' + escape_(z.ime) + '</h4>' +
      '<div class="vu-dan"><button type="button" class="pris-nav" data-dan="-1" aria-label="Prejšnji dan"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg></button>' +
      '<label class="vu-dan-l"><span class="vu-dan-t"></span><input type="date" class="vu-dan-in" aria-label="Datum"></label>' +
      '<button type="button" class="pris-nav" data-dan="1" aria-label="Naslednji dan"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button></div>' +
      '<div class="vu-vrste"></div>' +
      '<button type="button" class="pris-int-add vu-dodaj">' + IKO_T_PLUS + 'Dodaj izmeno</button>' +
      '<div class="vu-skupaj"></div>' +
      '<div class="fx-msg msg" role="alert"></div>' +
      '<div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" data-no>Zapri</button><button type="button" class="sc-modal-btn primary" data-yes>Shrani</button></div></div>';
    document.body.appendChild(back);
    requestAnimationFrame(function () { back.classList.add('show'); });   // vrstice se izrišejo še v tem koraku (risiVrste spodaj)
    var q = function (s) { return back.querySelector(s); };
    var lst = q('.vu-vrste'), msg = q('.fx-msg'), dIn = q('.vu-dan-in');
    function sporoci(t) { msg.className = 'fx-msg msg' + (t ? ' bad show' : ''); msg.textContent = t || ''; }
    // Izmena: prihod in odhod kot kolesi (budilka). Odprta izmena (brez odhoda) ima namesto koles eno polje »Vpiši odhod«
    // (danes: trenutni čas, sicer prihod + 8 h — kolo se pokaže in se da popraviti); nad njim »v teku« / »ni odhoda«.
    // Prej sta bila v polju stisnjena »Zdaj« in »Vpiši« — na telefonu nejasno.
    function izmena(i, inv, outv) {
      var r = document.createElement('div'); r.className = 'vu-izm'; r.dataset.i = i; r._in = inv; r._out = outv || '';
      r.innerHTML = '<div class="vu-sk" data-k="in"><span class="vu-sk-t">Prihod</span><div class="vu-cas"></div></div>' +
        '<div class="vu-sk" data-k="out"><span class="vu-sk-t">Odhod<span class="vu-teku"></span><button type="button" class="vu-odhod-x">Še dela</button></span><div class="vu-cas"></div>' +
          '<div class="vu-brez"><button type="button" class="vu-odhod-dodaj">Vpiši odhod</button></div></div>' +
        '<button type="button" class="pris-int-del vu-x" aria-label="Odstrani izmeno" title="Odstrani izmeno">' + IKO_ZAPRI + '</button>';
      vuUra(r.querySelector('[data-k="in"] .vu-cas'), inv, function (v) { r._in = v; dotakni(); });
      r._postaviOdhod = function () {
        var sk = r.querySelector('[data-k="out"]'), box = sk.querySelector('.vu-cas');
        sk.classList.toggle('prazno', !r._out);
        if (r._out) { if (!box.firstChild) vuUra(box, r._out, function (v) { r._out = v; dotakni(); }); else box._nastavi(r._out); }
        else box.innerHTML = '';
      };
      r._postaviOdhod();
      return r;
    }
    function vrste() { return [].slice.call(lst.querySelectorAll('.vu-izm')); }
    function dotakni() { dotaknjeno = true; sporoci(''); osveziStanje(); }
    function privzeta() {   // nova izmena: za zadnjo izmeno dneva, sicer 07:00–15:00
      var zad = vrste().map(function (r) { return r._out || r._in; }).filter(Boolean).sort().pop();
      var od = zad || '07:00'; return { in: od, out: vuPlusMin(od, 8 * 60) };
    }
    function osveziStanje() {
      var danes = dan === danes10(), sek = 0, vs = vrste();
      vs.forEach(function (r, ix) {
        r.querySelector('.vu-teku').textContent = danes ? 'v teku' : 'ni odhoda';
        r.querySelector('.vu-odhod-x').hidden = !(danes && r._out && ix === vs.length - 1);   // odprta je lahko le zadnja izmena
        if (r._in && r._out && r._out > r._in) sek += (new Date('2000-01-01T' + r._out) - new Date('2000-01-01T' + r._in)) / 1000;
      });
      q('.vu-skupaj').textContent = sek ? 'Skupaj ' + trajanjeH(sek) : '';
    }
    function risiVrste(fokus) {
      lst.innerHTML = '';
      pari.forEach(function (p, i) { lst.appendChild(izmena(i, hmLocal(p.in.ts), p.out ? hmLocal(p.out.ts) : '')); });
      if (!pari.length) { var pv = privzeta(); lst.appendChild(izmena('n0', pv.in, pv.out)); }   // privzeto ena izmena
      q('.vu-dan-t').textContent = vuDanNaziv(dan); dIn.value = dan;
      dotaknjeno = false; sporoci(''); osveziStanje();
      var el = null;
      if (fokus && fokus.id) { var ix = pari.findIndex(function (p) { return p.in.id === fokus.id || (p.out && p.out.id === fokus.id); }); if (ix >= 0) el = lst.querySelector('[data-i="' + ix + '"]'); }
      if (fokus && fokus.odhod) {   // »Odjavi«: odprta izmena dobi odhod = zdaj, ostane le še Shrani
        var od = pari.findIndex(function (p) { return !p.out; });
        if (od >= 0 && dan === danes10()) { el = lst.querySelector('[data-i="' + od + '"]'); el._out = hmLocal(new Date()); el._postaviOdhod(); dotakni(); }
      }
      if (el) { el.classList.add('vu-poudari'); setTimeout(function () { try { el.scrollIntoView({ block: 'nearest' }); } catch (e) {} }, 60); }
    }
    // Menjava dneva: stare vrstice ostanejo (zbledele), dokler ne pridejo nove — brez praznega »Nalagam …«.
    async function naloziDan(fokus) {
      zaseden = true; lst.classList.add('vu-nalaga');
      try { pari = await vuNaloziPari(z.id, dan); }
      catch (e) { sporoci('Nalaganje ni uspelo. ' + napakaBesedilo(e)); return; }
      finally { zaseden = false; lst.classList.remove('vu-nalaga'); }
      risiVrste(fokus);
    }
    // Shrani izbrani dan: posodobi spremenjene, dodaj nove, izbriši odstranjene izmene.
    async function shrani() {
      var izm = [];
      var rv = vrste();
      rv.forEach(function (r) { r.classList.remove('napaka'); });
      for (var i = 0; i < rv.length; i++) {
        var r = rv[i], a = r._in, b = r._out;
        if (b && b <= a) { sporoci('Odhod mora biti za prihodom (' + a + '–' + b + ').'); r.classList.add('napaka'); return false; }
        izm.push({ i: r.dataset.i, in: a, out: b });
      }
      izm.sort(function (x, y) { return x.in < y.in ? -1 : 1; });
      for (var k = 0; k < izm.length; k++) {
        if (!izm[k].out && k < izm.length - 1) { sporoci('Brez odhoda je lahko le zadnja izmena dneva.'); return false; }
        if (k && izm[k].in < izm[k - 1].out) { sporoci('Izmeni ' + izm[k - 1].in + '–' + izm[k - 1].out + ' in ' + izm[k].in + '–' + (izm[k].out || '…') + ' se prekrivata.'); return false; }
      }
      var ts = function (hm) { return new Date(dan + 'T' + hm + ':00').toISOString(); };
      var ops = [], vstavi = [], ohranjeni = {};
      izm.forEach(function (x) {
        var p = (x.i !== 'n' && pari[+x.i]) ? pari[+x.i] : null;
        if (!p) {
          vstavi.push({ org_id: z.org_id, employee_id: z.id, type: 'in', source: 'manual', ts: ts(x.in) });
          if (x.out) vstavi.push({ org_id: z.org_id, employee_id: z.id, type: 'out', source: 'manual', ts: ts(x.out) });
          return;
        }
        ohranjeni[x.i] = true;
        if (hmLocal(p.in.ts) !== x.in) ops.push(sb.from('att_events').update({ ts: ts(x.in) }).eq('id', p.in.id));
        if (p.out && !x.out) ops.push(sb.from('att_events').delete().eq('id', p.out.id));
        else if (p.out && hmLocal(p.out.ts) !== x.out) ops.push(sb.from('att_events').update({ ts: ts(x.out) }).eq('id', p.out.id));
        else if (!p.out && x.out) vstavi.push({ org_id: z.org_id, employee_id: z.id, type: 'out', source: 'manual', ts: ts(x.out) });
      });
      var brisi = [];
      pari.forEach(function (p, i) { if (!ohranjeni[i]) { brisi.push(p.in.id); if (p.out) brisi.push(p.out.id); } });
      if (brisi.length) ops.push(sb.from('att_events').delete().in('id', brisi));
      if (vstavi.length) ops.push(sb.from('att_events').insert(vstavi));
      if (!ops.length) return true;   // nič spremenjenega
      var gumb = q('[data-yes]'); gumb.disabled = true;
      var res = await Promise.all(ops);
      gumb.disabled = false;
      var nap = res.filter(function (x) { return x && x.error; })[0];
      if (nap) { sporoci(napakaBesedilo(nap.error)); await naloziDan(); return false; }
      shranjeno = true;
      try { logDodaj('Prisotnost', 'Vnos ur', z.ime + ' · ' + dan + ' · ' + (izm.map(function (x) { return x.in + '–' + (x.out || '…'); }).join(', ') || 'brez izmen')); } catch (e) {}
      try { await naloziPrisDog(); prisRender(); } catch (e) {}
      return true;
    }
    async function pojdiNa(novDan) {
      if (zaseden || !novDan) return;
      if (dotaknjeno) { if (!(await shrani())) return; toast('Shranjeno · ' + vuDanNaziv(dan)); }
      dan = novDan; naloziDan();
    }
    function zapri() {
      back.classList.remove('show'); document.removeEventListener('keydown', onKey);
      setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180);
    }
    function onKey(e) { if (e.key === 'Escape') zapri(); }
    document.addEventListener('keydown', onKey);
    q('[data-no]').addEventListener('click', zapri);
    back.addEventListener('click', function (e) { if (e.target === back) zapri(); });
    back.querySelectorAll('[data-dan]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = parseInt(b.dataset.dan, 10), n = vuDanPlus(dan, d);
        if (new Date(n + 'T12:00:00').getDay() === 0) n = vuDanPlus(n, d);   // nedelja se preskoči (kot na listu za ure)
        pojdiNa(n);
      });
    });
    dIn.addEventListener('change', function () { if (dIn.value && dIn.value !== dan) pojdiNa(dIn.value); else dIn.value = dan; });
    dIn.addEventListener('click', function () { try { if (dIn.showPicker) dIn.showPicker(); } catch (e) {} });   // računalnik: klik kjerkoli odpre koledar
    q('.vu-dodaj').addEventListener('click', function () {
      var n = lst.querySelectorAll('.vu-izm[data-i^="n"]').length, pv = privzeta();
      var r = izmena('n' + n, pv.in, pv.out); lst.appendChild(r); dotakni();
      setTimeout(function () { try { r.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {} }, 30);
    });
    lst.addEventListener('click', function (e) {
      var r = e.target.closest('.vu-izm'); if (!r) return;
      if (e.target.closest('.vu-odhod-dodaj')) {
        if (dan === danes10()) { r._out = hmLocal(new Date()); if (r._out <= r._in) r._out = vuPlusMin(r._in, 1); }
        else r._out = vuPlusMin(r._in, 8 * 60);
        r._postaviOdhod(); dotakni(); return;
      }
      if (e.target.closest('.vu-odhod-x')) { r._out = ''; r._postaviOdhod(); dotakni(); return; }
      if (e.target.closest('.vu-x')) { r.parentNode.removeChild(r); dotakni(); }
    });
    q('[data-yes]').addEventListener('click', async function () {
      if (zaseden) return;
      // Shrani shrani, kar je v oknu (tudi privzeto izmeno praznega dne); brez sprememb samo zapre
      if (!dotaknjeno && !lst.querySelector('.vu-izm[data-i^="n"]')) { zapri(); return; }
      if (await shrani()) { toast('Ure shranjene · ' + z.ime); zapri(); }
    });
    risiVrste(opt.fokus);   // podatki so že naloženi
  }
  // Vsi trije vstopi odprejo isto okno.
  function prisRocni(empId, danArg) { prisVnosUr(empId, danArg); }
  function prisUrediPar(idsStr) {
    var ids = String(idsStr || '').split(',').filter(Boolean);
    var ev = prisDogById(ids[0]); if (!ev) { toast('Vpisa ni več.'); return; }
    prisVnosUr(ev.employee_id, danLocal(ev.ts), { fokus: { id: ev.id } });
  }

  /* ══════════ ARTIKLI (katalog po skupinah ID + teža + dodeljevanje) ══════════ */
  var _artOpen = {}, SKUPINE_IME = {};
  function artPrefix(koda) { var s = normId(koda); return /^[A-ZČŠŽ]{2}[0-9]{3}$/.test(s) ? s.slice(0, 2) : '—'; }
  function imeSkupine(pre) { return SKUPINE_IME[pre] || (pre === 'SC' ? 'Splošni cenik' : 'Skupina ' + pre); }
  // Naziv, zapisan z VELIKIMI ČRKAMI (iz registra), za prikaz v običajnem zapisu: »PLANINSKO DRUŠTVO JEZERSKO« →
  // »Planinsko Društvo Jezersko«, pravne oblike (d.o.o., s.p. …) z malimi. Točen zapis ostane v oknu stranke in v title.
  var PRAVNE_OBLIKE = /^(d\.o\.o\.|d\.d\.|s\.p\.|k\.d\.|d\.n\.o\.|z\.o\.o\.|so\.p\.|z\.b\.o\.)[,.]?$/i;
  var MALE_BESEDE = { in: 1, na: 1, za: 1, pri: 1, od: 1, do: 1, ter: 1, ali: 1, iz: 1, po: 1, z: 1, s: 1, v: 1, k: 1, o: 1 };
  function lepNaziv(s) {
    s = String(s || '');
    var brezOblik = s.split(/\s+/).filter(function (w) { return !PRAVNE_OBLIKE.test(w); }).join(' ');
    if (!s || /\p{Ll}/u.test(brezOblik) || (brezOblik.match(/\p{L}/gu) || []).length < 4) return s;
    var prva = true;
    return s.split(/(\s+|-)/).map(function (w) {
      if (!w.trim() || w === '-') return w;
      if (PRAVNE_OBLIKE.test(w)) return w.toLowerCase();
      var m = w.toLowerCase(), gola = m.replace(/[^\p{L}]/gu, '');
      var izid = (!prva && MALE_BESEDE[gola]) ? m : m.replace(/\p{L}/u, function (c) { return c.toUpperCase(); });
      prva = false; return izid;
    }).join('');
  }
  async function naloziSkupineImena() {
    try { var r = await deli('skupine', function () { return sb.from('article_groups').select('prefix,name'); }); if (!r.error) { SKUPINE_IME = {}; (r.data || []).forEach(function (x) { if (x.name) SKUPINE_IME[x.prefix] = x.name; }); } } catch (e) {}
  }
  // Enoten prikaz teže: brez presledka, vejica, nad 1000 kg v tonah.
  // 1kg · 12,45kg · 123,45kg · 1,2345t · 12,345t
  function tezaFmt(kg) {
    kg = Math.round((Number(kg) || 0) * 100) / 100;
    var v, u;
    if (kg >= 1000) { v = kg / 1000; u = 't'; } else { v = kg; u = 'kg'; }
    var s = v.toFixed(2);                 // max 2 decimalki povsod (kg in t)
    s = s.replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
    return s + '\u00a0' + u;   // nedeljiv presledek: »88,1 kg« (število in enota ostaneta skupaj)
  }
  function fmtTeza(t) { return tezaFmt(t); }
  function artNextNum(pre) { var max = 0; (CENIK || []).forEach(function (x) { var s = normId(x.koda); if (s.slice(0, 2) === pre) { var n = parseInt(s.slice(2), 10); if (!isNaN(n) && n > max) max = n; } }); return pad3(max + 1); }
  function artikliGrupe() {
    var g = {};
    (CENIK || []).forEach(function (x) { if (x.deleted_at) return; var pre = artPrefix(x.koda); (g[pre] = g[pre] || []).push(x); });
    Object.keys(g).forEach(function (k) { g[k].sort(cenikSort); });
    return g;
  }
  /* ══ Naslovnica kartice: matirana podlaga z zrnom in dvema mehkima madežema. Barva ima pomen samo tam, kjer kaj pove:
     spremni listi po stanju (zelena = pregledano, oranžna = nepregledano, rdeča = prazno), uporabniki vsak svojo;
     stranke, fakture in ceniki so sivi — razlikujejo se po vzorcu (razpored in velikost madežev iz semena). ══ */
  var BARVA_SIVA = ['#8f979e', '#cdd3d8'];
  var BARVE_STANJA = { green: ['#2fa36b', '#9fe0c0'], yellow: ['#e08a1e', '#f6c98a'], red: ['#d9534f', '#f3aaa3'] };
  var BARVE_OSEB = [['#2f6fe0', '#8fb8ff'], ['#e0568a', '#ffb3cf'], ['#e08a1e', '#ffd08a'], ['#7a5ae0', '#c8b0ff'], ['#149aa6', '#8ee8ef'],
    ['#2fa36b', '#9fe0c0'], ['#c9a227', '#f0dc8c'], ['#d9534f', '#f3aaa3'], ['#4b5bd6', '#b3bcff'], ['#a3479c', '#e9b3e4']];
  // Barva osebe: ista v Uporabnikih in Prisotnosti (povezan zaposleni = isti človek). Mesto računa med vsemi računi,
  // kot jih vrne baza po e-pošti — obe strani berete profile v tem vrstnem redu, zato ima vsak svojo, dokler jih je do 10.
  function barvaOsebe(id, racuni) {
    if (!id || !racuni) return null;
    for (var i = 0; i < racuni.length; i++) if (racuni[i] && racuni[i].id === id) return BARVE_OSEB[i % BARVE_OSEB.length];
    return null;
  }
  function zgoscek(s) { var h = 2166136261; s = String(s || ''); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  // barva: par [temnejša, svetlejša] ali null (siva); seme: stalen vzorec za isto stvar
  function naslovnica(barva, seme) {
    var b = barva || BARVA_SIVA, h = zgoscek(seme), h2 = zgoscek(h + ':' + seme);
    return '--c1:' + b[0] + ';--c2:' + b[1] + ';--j:' + (barva ? 1 : .9) +
      ';--p1:' + (6 + h % 52) + '% ' + (4 + (h >>> 7) % 46) + '%;--p2:' + (44 + (h >>> 13) % 52) + '% ' + (50 + (h >>> 19) % 48) + '%' +
      ';--r1:' + (48 + h2 % 40) + '% ' + (62 + (h2 >>> 6) % 50) + '%;--r2:' + (56 + (h2 >>> 12) % 44) + '% ' + (70 + (h2 >>> 18) % 40) + '%';
  }
  function cenikStrankeIme(orgId) {
    if (!CLANI) return '';
    var pre = strankaSkupina(orgId);
    if (pre) return imeSkupine(pre);
    // brez enotne skupine: artikli s cenami iz več skupin = lasten cenik; brez cen = brez cenika
    return CLANI.some(function (a) { return a.org_id === orgId && a.cena_sifra != null; }) ? 'Lasten cenik' : 'Brez cenika';
  }
  // Barve so znane, ko so naloženi cenik in artikli strank — takrat pobarvaj že izrisane kartice.
  var _barveObljuba = null;
  function zagotoviBarve() {
    if (!OSEBJE || (CENIK && CLANI)) return Promise.resolve();
    if (!_barveObljuba) _barveObljuba = Promise.all([nalozicenik(), naloziClane(), naloziSkupineImena()]).then(pobarvajNaslovnice, function () {}).then(function () { _barveObljuba = null; });
    return _barveObljuba;
  }
  function pobarvajNaslovnice() {
    document.querySelectorAll('[data-cenik-org]').forEach(function (el) { var t = cenikStrankeIme(el.getAttribute('data-cenik-org')); el.textContent = t; el.hidden = !t; });
  }
  function strankaSkupina(orgId) {
    if (!CLANI) return null;
    var priced = CLANI.filter(function (a) { return a.org_id === orgId && a.cena_sifra != null; });
    if (!priced.length) return null;
    var prefs = {};
    for (var i = 0; i < priced.length; i++) { var p = CENIKMAP[priced[i].cena_sifra]; if (!p) return null; prefs[artPrefix(p.koda)] = 1; }
    var ks = Object.keys(prefs); return ks.length === 1 ? ks[0] : null;
  }
  // Artikli, ki jih portal strankam doda MNOŽIČNO (cenik skupine, splošni cenik, nov artikel za
  // vse, uvoz), so v aplikaciji skriti (viden_app: false), dokler jih stranka ne dobi na spremni
  // list (sprožilec iz 45_skrij_neuporabljene.sql) ali jih kdo ne obkljuka »app«. Artikel, ki ga
  // dodaš ročno ENI stranki, je viden. Prej je bil vsak nov artikel viden pri vseh strankah.
  // Zamenja cenik stranke z danimi šiframi (prazen seznam → izprazni).
  // Vsak napačen odgovor baze VRŽE napako (klicatelj jo mora prestreči in prikazati) —
  // prej se je tiho pogoltnila, zato je »dodal« lokalno, v bazi pa ne.
  async function nastaviSkupinoStranki(orgId, ciljneSifre) {
    ciljneSifre = ciljneSifre || [];
    var obst = {}; (CLANI || []).forEach(function (a) { if (a.org_id === orgId && a.cena_sifra != null) obst[a.cena_sifra] = a; });
    var vstavi = [];
    for (var j = 0; j < ciljneSifre.length; j++) {
      var sif = ciljneSifre[j];
      if (obst[sif]) { var u = await sb.from('articles').update({ sort_order: j }).eq('org_id', orgId).eq('cena_sifra', sif); if (u.error) throw u.error; obst[sif].sort_order = j; delete obst[sif]; }
      else { var p = CENIKMAP[sif]; vstavi.push({ org_id: orgId, name: (p ? p.naziv : '') || '', cena_sifra: sif, sort_order: j, viden_app: false }); }
    }
    // Manjkajoče artikle vstavi v ENEM zahtevku (hitro + brez delnega stanja).
    if (vstavi.length) {
      var ins = await sb.from('articles').insert(vstavi).select('id,org_id,name,cena_sifra,sort_order');
      if (ins.error) throw ins.error;
      if (CLANI && ins.data) ins.data.forEach(function (r) { CLANI.push(r); });
    }
    var odstrani = Object.keys(obst);
    for (var k = 0; k < odstrani.length; k++) {
      var s2 = parseInt(odstrani[k], 10);
      var d = await sb.from('articles').delete().eq('org_id', orgId).eq('cena_sifra', s2);
      if (d.error) throw d.error;
      if (CLANI) CLANI = CLANI.filter(function (a) { return !(a.org_id === orgId && a.cena_sifra === s2); });
    }
    var brez = (CLANI || []).filter(function (a) { return a.org_id === orgId && a.cena_sifra == null && a.id != null; });
    for (var m = 0; m < brez.length; m++) { var d2 = await sb.from('articles').delete().eq('id', brez[m].id); if (d2.error) throw d2.error; }
    if (CLANI) CLANI = CLANI.filter(function (a) { return !(a.org_id === orgId && a.cena_sifra == null); });
  }
  async function risiArtikli() {
    var box = $('artList'); if (!box) return;
    pokaziNalaganje(box);
    try {
      await nalozicenik(true);
      await naloziClane(true);
      await naloziSkupineImena();
      artRender();
      box.dataset.loaded = '1';
    } catch (e) { if (!box.dataset.loaded) box.innerHTML = '<div class="pris-card"><p class="u-sub">Napaka pri nalaganju: ' + escape_(e && e.message ? e.message : e) + '</p></div>'; }
  }
  function artRender() {
    var box = $('artList'); if (!box) return;
    var _sy = window.scrollY;
    var grupe = artikliGrupe();
    var preSet = {}; Object.keys(grupe).forEach(function (k) { if (k !== '—') preSet[k] = 1; }); Object.keys(SKUPINE_IME).forEach(function (k) { preSet[k] = 1; });
    var prefs = Object.keys(preSet).sort(function (x, y) { return x === 'SC' ? -1 : y === 'SC' ? 1 : x.localeCompare(y); });
    if (grupe['—']) prefs.push('—');
    var strPoGrupi = {}; (ORGSEZNAM || []).forEach(function (o) { var g = strankaSkupina(o.id); if (g) (strPoGrupi[g] = strPoGrupi[g] || []).push(o); });
    // Gumba »+ Nov cenik« in »Uskladi artikle« sta v glavi razdelka (enotna orodna vrstica), ne več v seznamu.
    // Skupine se odpirajo v OKNU. _artOpen je zdaj le zahteva »odpri to skupino« (nov cenik,
    // dodan artikel, »Uredi v Ceniku ›« iz stranke) — v seznamu so skupine vedno zaprte.
    var zahtevana = Object.keys(_artOpen).filter(function (k) { return _artOpen[k]; })[0] || null;
    _artOpen = {};
    box.innerHTML = (prefs.length ? '<div class="art-skupine">' + prefs.map(function (pre) {
      var arts = grupe[pre] || []; var open = false; var str = strPoGrupi[pre] || [];
      var rows = arts.map(function (x) {
        var c = Number(x.cena1) || 0;
        var pot = !!x.cena_potrjena;
        var stanje = c <= 0 ? 'cena-nic' : (pot ? 'cena-ok' : 'cena-ni');   // rdeča / zelena / oranžna
        return '<div class="art-row ' + stanje + '" data-s="' + x.sifra + '"><span class="art-r-id">' + escape_(normId(x.koda) || '—') + '</span>' +
          '<span class="art-r-nm">' + escape_(x.naziv || '') + '</span>' +
          '<span class="art-r-cena">' + cenaFmt(x.cena1) + '</span>' +
          '<span class="art-r-acts">' +
            '<label class="art-chk' + (c <= 0 ? ' dis' : '') + '" title="' + (c <= 0 ? 'Ni cene' : 'Cena potrjena') + '"><input type="checkbox" data-cpot="' + x.sifra + '"' + (pot ? ' checked' : '') + (c <= 0 ? ' disabled' : '') + '><span class="art-chk-box"></span></label>' +
            '<button type="button" class="art-grip dnd-handle" title="Povleci za razvrščanje" aria-label="Razvrsti">' + DND_ICON + '</button><button type="button" class="art-r-edit" data-aedit="' + x.sifra + '" title="Uredi" aria-label="Uredi">' + IKO_T_SVINC + '</button><button type="button" class="art-r-del" data-adel="' + x.sifra + '" title="Izbriši artikel" aria-label="Izbriši artikel">' + IKO_KOS + '</button></span></div>';
      }).join('');
      var chips = str.length ? str.map(function (o) { return '<span class="pris-chip"><span class="pris-chip-t" style="cursor:default">' + escape_(ORGIME[o.id] || o.name) + '</span></span>'; }).join(' ') : '<span class="u-sub">Ni dodeljenih strank.</span>';
      return '<div class="cgrp' + (open ? ' open' : '') + '" data-pre="' + escape_(pre) + '"><div class="cgrp-head-row"><button type="button" class="cgrp-h' + (open ? ' open' : '') + '" data-artgrp="' + escape_(pre) + '" style="' + naslovnica(null, pre) + '">' +
        '<span class="cgrp-name"><span class="cgrp-nm">' + escape_(imeSkupine(pre)) + '</span><span class="cgrp-sub">' + escape_(pre) + ' · ' + str.length + ' ' + (str.length === 1 ? 'stranka' : 'strank') + '</span></span>' +
        '<span class="cgrp-count">' + sklonArtiklov(arts.length) + '</span><span class="cgrp-chev" aria-hidden="true">›</span></button></div>' +
        '<div class="cgrp-body' + (open ? ' show' : '') + '">' +
        '<div class="art-assign"><div class="art-assign-str">' + chips + '</div><div class="art-assign-acts"><button type="button" class="cgrp-btn ghost art-preime" data-pre="' + escape_(pre) + '">Preimenuj</button><button type="button" class="cgrp-btn ghost art-dodeli" data-pre="' + escape_(pre) + '">Uredi stranke</button><button type="button" class="cgrp-btn danger art-delskup" data-pre="' + escape_(pre) + '">Izbriši skupino</button></div></div>' +
        '<div class="art-thead"><span>ID</span><span>Naziv</span><span>Cena</span><span></span></div><div class="art-rows">' + rows + '</div>' +
        '<div class="art-add-new"><input type="text" class="art-nn-nm" placeholder="Nov artikel"><input type="text" class="art-nn-id" maxlength="5" value="' + escape_(pre + artNextNum(pre)) + '"><input type="text" inputmode="decimal" class="art-nn-cena" placeholder="€"><button type="button" class="cgrp-btn art-nn-btn" data-pre="' + escape_(pre) + '">' + IKO_T_PLUS + 'Dodaj</button></div>' +
        '</div></div>';
    }).join('') + '</div>' : '<div class="pris-card"><p class="u-sub">Ni artiklov.</p></div>');

    box.querySelectorAll('[data-artgrp]').forEach(function (h) { h.addEventListener('click', function () { artOdpriSkupino(h.dataset.artgrp); }); });
    box.querySelectorAll('[data-aedit]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); artUredi(parseInt(b.dataset.aedit, 10)); }); });
    box.querySelectorAll('[data-adel]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); artIzbrisi(parseInt(b.dataset.adel, 10)); }); });
    box.querySelectorAll('.art-dodeli').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); artDodeli(b.dataset.pre); }); });
    box.querySelectorAll('.art-preime').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); artPreimenujSkupino(b.dataset.pre); }); });
    box.querySelectorAll('.art-delskup').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); artIzbrisiSkupino(b.dataset.pre); }); });
    box.querySelectorAll('.art-nn-btn').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); artDodajNov(b.dataset.pre, b.closest('.art-add-new')); }); });
    box.querySelectorAll('[data-cpot]').forEach(function (cb) { cb.addEventListener('click', function (e) { e.stopPropagation(); }); cb.addEventListener('change', function (e) { e.stopPropagation(); artPotrdiCeno(parseInt(cb.dataset.cpot, 10), cb.checked); }); });
    box.querySelectorAll('.art-rows').forEach(function (rw) { dndSort(rw, '.art-row', '.art-grip', function () { artShraniVrstniRed(rw); }); });
    requestAnimationFrame(function () { window.scrollTo(0, _sy); });
    oknoPoIzrisu();   // odprto okno skupine dobi svežo vsebino (ali se zapre, če skupine ni več)
    if (zahtevana && !_okno) artOdpriSkupino(zahtevana);
  }
  { const _an = $('artNovaBtn'); if (_an) _an.addEventListener('click', function () { artNovCenik(); }); }
  { const _au = $('artUskladiBtn'); if (_au) _au.addEventListener('click', function () { artUskladiVse(); }); }
  function artNajdiSkupino(pre) { return document.querySelector('#artList .cgrp[data-pre="' + String(pre).replace(/"/g, '\\"') + '"]'); }
  // Glava okna skupine: ime cenika, predpona, število strank in artiklov (iz trenutne kartice).
  function artGlavaOkna(k) {
    var d = document.createElement('div');
    var nm = k && k.querySelector('.cgrp-nm'), sub = k && k.querySelector('.cgrp-sub'), cnt = k && k.querySelector('.cgrp-count');
    d.innerHTML = '<h3 class="sec-h">' + escape_(nm ? nm.textContent : '') + '</h3>' +
      '<div class="okno-glava-sub">' + escape_([sub ? sub.textContent : '', cnt ? cnt.textContent : ''].filter(Boolean).join(' · ')) + '</div>';
    return d;
  }
  function artOdpriSkupino(pre) {
    if (_okno) return;
    var k = artNajdiSkupino(pre); if (!k) return;
    var body = k.querySelector('.cgrp-body'); if (!body) return;
    oknoOdpri(k, body, function () { return artNajdiSkupino(pre); }, {
      glava: artGlavaOkna,
      osvezi: function (k2) { return k2.querySelector('.cgrp-body'); }
    });
  }
  async function artPotrdiCeno(sifra, on) {
    var rec = CENIKMAP[sifra];
    var up = await sb.from('pricelist').update({ cena_potrjena: on, updated_at: new Date().toISOString() }).eq('sifra', sifra);
    if (up.error) { toast(napakaBesedilo(up.error)); artRender(); return; }
    if (rec) rec.cena_potrjena = on;
    var rec2 = (CENIK || []).find(function (p) { return p.sifra === sifra; }); if (rec2) rec2.cena_potrjena = on;
    var row = document.querySelector('.art-row[data-s="' + sifra + '"]');
    if (row) {
      var c = Number(rec ? rec.cena1 : 0) || 0;
      row.classList.remove('cena-ok', 'cena-ni', 'cena-nic');
      row.classList.add(c <= 0 ? 'cena-nic' : (on ? 'cena-ok' : 'cena-ni'));
    }
  }
  async function artShraniVrstniRed(container) {
    var els = [].slice.call(container.querySelectorAll('.art-row'));
    if (!els.length) return;
    var upd = [];
    els.forEach(function (el, i) {
      var sif = parseInt(el.dataset.s, 10); if (isNaN(sif)) return;
      upd.push(sb.from('pricelist').update({ sort_order: i }).eq('sifra', sif));
      // vrstni red prenesi tudi na artikle vseh strank (to bere tablica)
      upd.push(sb.from('articles').update({ sort_order: i }).eq('cena_sifra', sif));
      if (CENIKMAP[sif]) CENIKMAP[sif].sort_order = i;
      var rec = (CENIK || []).find(function (p) { return p.sifra === sif; }); if (rec) rec.sort_order = i;
      (CLANI || []).forEach(function (a) { if (a.cena_sifra === sif) a.sort_order = i; });
    });
    try {
      var res = await Promise.all(upd);
      if (res.some(function (r) { return r.error; })) toast('Vrstni red morda ni v celoti shranjen.');
      else toast('Vrstni red shranjen.');
    } catch (e) { toast('Napaka pri shranjevanju vrstnega reda.'); }
  }
  function artUredi(sifra) {
    var rec = CENIKMAP[sifra]; if (!rec) return;
    var row = document.querySelector('.art-row[data-s="' + sifra + '"]'); if (!row) return;
    row.classList.add('art-row-edit');
    row.innerHTML = '<div class="art-edit-form">' +
      '<label class="ae-lab ae-lab-nm">Naziv artikla<input type="text" class="ae-nm" placeholder="Naziv artikla"></label>' +
      '<div class="art-edit-r">' +
      '<label class="ae-lab">Šifra (ID)<input type="text" class="ae-id" maxlength="5" placeholder="ID"></label>' +
      '<label class="ae-lab">Cena (€)<input type="text" inputmode="decimal" class="ae-cena" placeholder="0,00"></label>' +
      '<button type="button" class="btn-mini ae-save">Shrani</button><button type="button" class="cenik-x ae-cancel" title="Prekliči">' + IKO_ZAPRI + '</button></div></div>';
    row.querySelector('.ae-nm').value = rec.naziv || '';
    row.querySelector('.ae-id').value = normId(rec.koda);
    row.querySelector('.ae-cena').value = String(rec.cena1 != null ? rec.cena1 : '').replace('.', ',');
    row.querySelector('.ae-cancel').addEventListener('click', function () { artRender(); });
    row.querySelector('.ae-save').addEventListener('click', async function () {
      var nm = row.querySelector('.ae-nm').value.trim();
      var nid = normId(row.querySelector('.ae-id').value);
      var cRaw = row.querySelector('.ae-cena').value.trim();
      if (!nm) { toast('Vpiši naziv.'); return; }
      if (nid && !veljavenId(nid)) { toast('ID mora biti 2 črki + 3 številke.'); return; }
      if (nid && nid !== normId(rec.koda)) { var z = idZaseden(nid, sifra); if (z) { toast('ID ' + nid + ' že obstaja.'); return; } }
      var cena = cRaw === '' ? (rec.cena1 || 0) : parseFloat(cRaw.replace(',', '.'));
      if (isNaN(cena) || cena < 0) { toast('Neveljavna cena.'); return; }
      var patch = { naziv: nm, cena1: cena, updated_at: new Date().toISOString() };
      if (nid && nid !== normId(rec.koda)) patch.koda = nid;
      if (cena !== rec.cena1) patch.cena_potrjena = false;   // spremenjena cena → znova potrebna potrditev (oranžna)
      var e1 = (await sb.from('pricelist').update(patch).eq('sifra', sifra)).error;
      if (e1) { toast(napakaBesedilo(e1)); return; }
      if (nm !== rec.naziv) await posodobiImeArtikla(sifra, nm);
      var _spr = []; if (nm !== rec.naziv) _spr.push('naziv'); if (cena !== rec.cena1) _spr.push('cena ' + cenaFmt(cena));
      rec.naziv = nm; rec.cena1 = cena; if (patch.koda) rec.koda = nid; if ('cena_potrjena' in patch) rec.cena_potrjena = false; zgradiCenikMap();
      logDodaj('Artikli', 'Urejeno', 'Artikel »' + nm + '«' + (_spr.length ? ' (' + _spr.join(', ') + ')' : ''));
      toast('Shranjeno.'); artRender();
    });
  }
  async function artIzbrisi(sifra) {
    var rec = CENIKMAP[sifra]; if (!rec) return;
    var ok = await potrdiModal({ naslov: 'Izbriši artikel', sporocilo: 'Izbrišem artikel »' + (rec.naziv || ('#' + sifra)) + '«? Odstrani se iz kataloga in iz cenikov vseh strank (obnovljivo 30 dni).', potrdi: 'Izbriši', preklici: 'Prekliči', nevarno: true });
    if (!ok) return;
    await sb.from('articles').delete().eq('cena_sifra', sifra);
    await sb.from('pricelist').update({ deleted_at: new Date().toISOString() }).eq('sifra', sifra);
    if (CLANI) CLANI = CLANI.filter(function (a) { return a.cena_sifra !== sifra; });
    CENIK = CENIK.filter(function (x) { return x.sifra !== sifra; }); zgradiCenikMap();
    logDodaj('Artikli', 'Izbrisano', 'Artikel »' + (rec.naziv || ('#' + sifra)) + '«');
    toast('Artikel izbrisan.'); artRender();
  }
  async function artDodajNov(pre, wrap) {
    if (!wrap) return;
    var nm = wrap.querySelector('.art-nn-nm').value.trim();
    var id = normId(wrap.querySelector('.art-nn-id').value) || (pre + artNextNum(pre));
    var cRaw = wrap.querySelector('.art-nn-cena').value.trim();
    if (!nm) { toast('Vpiši naziv.'); return; }
    if (!veljavenId(id)) { toast('ID mora biti 2 črki + 3 številke.'); return; }
    if (idZaseden(id, null)) { toast('ID ' + id + ' že obstaja.'); return; }
    var cena = cRaw === '' ? 0 : parseFloat(cRaw.replace(',', '.'));
    if (isNaN(cena) || cena < 0) cena = 0;
    var sifra = await naslednjaSifra();
    var rec = { sifra: sifra, koda: id, naziv: nm, em: 'kos', cena1: cena, cena2: cena, org_id: null, sort_order: (CENIK ? CENIK.length : 0) };
    var e = (await sb.from('pricelist').insert(rec)).error;
    if (e) { toast(napakaBesedilo(e)); return; }
    CENIK.push(rec); zgradiCenikMap();
    // PROPAGACIJA: dodaj artikel vsem strankam, ki že uporabljajo to skupino
    var ciljOrgi = (ORGSEZNAM || []).filter(function (o) { return strankaSkupina(o.id) === pre; });
    var dodanih = 0;
    for (var ci = 0; ci < ciljOrgi.length; ci++) {
      var oid = ciljOrgi[ci].id;
      var maxo = -1; (CLANI || []).forEach(function (a) { if (a.org_id === oid && typeof a.sort_order === 'number' && a.sort_order > maxo) maxo = a.sort_order; });
      var ins = await sb.from('articles').insert({ org_id: oid, name: nm, cena_sifra: sifra, sort_order: maxo + 1, viden_app: false }).select('id').maybeSingle();
      if (!(ins && ins.error)) { if (CLANI) CLANI.push({ id: ins && ins.data ? ins.data.id : null, org_id: oid, name: nm, cena_sifra: sifra, sort_order: maxo + 1 }); dodanih++; }
    }
    _artOpen = {}; _artOpen[pre] = true; logDodaj('Artikli', 'Dodano', 'Artikel »' + nm + '« (' + id + ')'); toast('Artikel dodan' + (dodanih ? ' · propagirano ' + dodanih + ' strankam' : '') + '.'); artRender();
  }
  // Modal »Nov cenik (skupina)«. opts.ime = predizpolnjeno ime; opts.onCreated(pre, ime)
  // se pokliče po uspešnem ustvarjanju (če ni podan, osveži pogled Artikli).
  function novCenikModal(opts) {
    opts = opts || {};
    var imeVal = opts.ime ? escape_(opts.ime) : '';
    var back = document.createElement('div'); back.className = 'sc-modal-back';
    back.innerHTML = '<div class="sc-modal" role="dialog" aria-modal="true"><h4>Nov cenik (skupina)</h4>' +
      '<label class="pris-lab">Ime cenika</label><input type="text" class="nc-ime sc-modal-input" value="' + imeVal + '">' +
      '<label class="pris-lab">Predpona ID</label><input type="text" class="nc-pre sc-modal-input" maxlength="2" placeholder="PO" style="text-transform:uppercase;font-family:var(--mono)">' +
      '<div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" data-no>Prekliči</button><button type="button" class="sc-modal-btn primary" data-yes>Ustvari</button></div></div>';
    document.body.appendChild(back); requestAnimationFrame(function () { back.classList.add('show'); });
    function zapri() { back.classList.remove('show'); setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); }
    back.querySelector('[data-no]').addEventListener('click', zapri);
    back.addEventListener('click', function (e) { if (e.target === back) zapri(); });
    // Če je ime že predizpolnjeno (npr. iz naziva stranke), skoči na predpono.
    setTimeout(function () { var el = back.querySelector(opts.ime ? '.nc-pre' : '.nc-ime'); if (el) el.focus(); }, 60);
    back.querySelector('[data-yes]').addEventListener('click', async function () {
      var ime = back.querySelector('.nc-ime').value.trim();
      var pre = normId(back.querySelector('.nc-pre').value);
      if (!/^[A-ZČŠŽ]{2}$/.test(pre)) { toast('Predpona morata biti 2 črki (npr. PO).'); return; }
      var obst = {}; (CENIK || []).forEach(function (x) { obst[artPrefix(x.koda)] = 1; }); Object.keys(SKUPINE_IME).forEach(function (k) { obst[k] = 1; });
      if (obst[pre]) { toast('Predpona ' + pre + ' že obstaja.'); return; }
      var r = await sb.from('article_groups').upsert({ prefix: pre, name: ime || null, updated_at: new Date().toISOString() }, { onConflict: 'prefix' });
      if (r.error) { toast(napakaBesedilo(r.error) + (/relation|does not exist/i.test(r.error.message) ? ' (poženi migracijo 13_skupine.sql)' : '')); return; }
      if (ime) SKUPINE_IME[pre] = ime;
      zapri();
      if (typeof opts.onCreated === 'function') { opts.onCreated(pre, ime); }
      else { _artOpen = {}; _artOpen[pre] = true; toast('Cenik ustvarjen. Dodaj artikle.'); artRender(); }
    });
  }
  function artNovCenik() { novCenikModal({}); }
  async function artPreimenujSkupino(pre) {
    var novo = await vnesiModal({ naslov: 'Ime skupine ' + pre, privzeto: SKUPINE_IME[pre] || '', placeholder: 'Skupina ' + pre, potrdi: 'Shrani' });
    if (novo === null) return;
    novo = novo.trim();
    var r = await sb.from('article_groups').upsert({ prefix: pre, name: novo || null, updated_at: new Date().toISOString() }, { onConflict: 'prefix' });
    if (r.error) { toast(napakaBesedilo(r.error) + (/relation|does not exist/i.test(r.error.message) ? ' (poženi migracijo 13_skupine.sql)' : '')); return; }
    if (novo) SKUPINE_IME[pre] = novo; else delete SKUPINE_IME[pre];
    toast('Ime skupine shranjeno.'); artRender();
  }
  async function artIzbrisiSkupino(pre) {
    var grupe = artikliGrupe(); var arts = grupe[pre] || []; if (!arts.length) { toast('Skupina je prazna.'); return; }
    var ok = await potrdiModal({ naslov: 'Izbriši skupino ' + pre, sporocilo: 'Izbrišem celo skupino »' + imeSkupine(pre) + '« (' + arts.length + ' artiklov)? Vsi ti artikli se odstranijo iz kataloga in iz cenikov vseh strank. (obnovljivo 30 dni)', potrdi: 'Izbriši skupino', preklici: 'Prekliči', nevarno: true });
    if (!ok) return;
    toast('Brišem skupino …');
    var sifre = arts.map(function (x) { return x.sifra; });
    var e1 = (await sb.from('articles').delete().in('cena_sifra', sifre)).error;
    if (e1) { toast(napakaBesedilo(e1)); return; }
    var e2 = (await sb.from('pricelist').update({ deleted_at: new Date().toISOString() }).in('sifra', sifre)).error;
    if (e2) { toast(napakaBesedilo(e2)); return; }
    try { await sb.from('article_groups').delete().eq('prefix', pre); } catch (e) {}
    var setSif = {}; sifre.forEach(function (s) { setSif[s] = 1; });
    if (CLANI) CLANI = CLANI.filter(function (a) { return !setSif[a.cena_sifra]; });
    CENIK = CENIK.filter(function (x) { return !setSif[x.sifra]; }); zgradiCenikMap();
    delete SKUPINE_IME[pre]; delete _artOpen[pre];
    logDodaj('Artikli', 'Izbrisano', 'Skupina/cenik »' + pre + '« (' + sklonArtiklov(arts.length) + ')'); toast('Skupina izbrisana (' + sklonArtiklov(arts.length) + ').'); artRender();
  }
  function artDodeli(pre) {
    var grupe = artikliGrupe(); var arts = grupe[pre] || []; var sifre = arts.map(function (x) { return x.sifra; });
    var seznam = (ORGSEZNAM || []).slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'sl'); });
    var back = document.createElement('div'); back.className = 'sc-modal-back';
    var rows = seznam.map(function (o) { var checked = strankaSkupina(o.id) === pre; return '<label class="assign-chk"><input type="checkbox" data-org="' + o.id + '"' + (checked ? ' checked' : '') + '><span>' + escape_(o.name || '') + '</span></label>'; }).join('') || '<p class="u-sub">Ni strank.</p>';
    back.innerHTML = '<div class="sc-modal" role="dialog" aria-modal="true"><h4>Dodeli skupino ' + escape_(pre) + ' strankam</h4>' +
      '<div class="art-chk-list">' + rows + '</div>' +
      '<div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" data-no>Prekliči</button><button type="button" class="sc-modal-btn primary" data-yes>Shrani</button></div></div>';
    document.body.appendChild(back); requestAnimationFrame(function () { back.classList.add('show'); });
    function zapri() { back.classList.remove('show'); setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); }
    back.querySelector('[data-no]').addEventListener('click', zapri);
    back.addEventListener('click', function (e) { if (e.target === back) zapri(); });
    back.querySelector('[data-yes]').addEventListener('click', async function () {
      var checks = [].slice.call(back.querySelectorAll('.assign-chk input'));
      zapri(); toast('Posodabljam cenike …');
      try {
        for (var i = 0; i < checks.length; i++) {
          var org = checks[i].dataset.org, wasP = strankaSkupina(org) === pre, isC = checks[i].checked;
          if (isC) await nastaviSkupinoStranki(org, sifre);        // uskladi (doda manjkajoče, popravi vrstni red)
          else if (wasP) await nastaviSkupinoStranki(org, []);     // odstrani skupino
        }
        await naloziClane(true);                                  // uskladi lokalno stanje z bazo (resnica)
        toast('Stranke posodobljene.');
      } catch (e) {
        try { await naloziClane(true); } catch (e2) {}
        toast(napakaBesedilo(e));
      }
      artRender();
    });
  }
  // Poskrbi, da ima vsaka stranka natanko vse artikle svojega cenika (doda manjkajoče).
  async function artUskladiVse() {
    var ok = await potrdiModal({ naslov: 'Uskladi artikle', sporocilo: 'Vsaki stranki uskladim artikle z njenim cenikom — doda manjkajoče in odstrani odvečne. Nadaljujem?', potrdi: 'Uskladi', preklici: 'Prekliči' });
    if (!ok) return;
    toast('Usklajujem …');
    var grupe = artikliGrupe();
    var dodanih = 0, obdelanih = 0;
    for (var oi = 0; oi < (ORGSEZNAM || []).length; oi++) {
      var org = ORGSEZNAM[oi];
      var pre = strankaSkupina(org.id);
      if (!pre) continue;
      var arts = grupe[pre] || [];
      var sifre = arts.map(function (x) { return x.sifra; });
      var prej = (CLANI || []).filter(function (a) { return a.org_id === org.id && a.cena_sifra != null; }).length;
      try { await nastaviSkupinoStranki(org.id, sifre); } catch (e) {}
      var potem = (CLANI || []).filter(function (a) { return a.org_id === org.id && a.cena_sifra != null; }).length;
      if (potem > prej) dodanih += (potem - prej);
      obdelanih++;
    }
    logDodaj('Artikli', 'Urejeno', 'Uskladitev artiklov (' + obdelanih + ' strank, +' + dodanih + ' artiklov)');
    toast(dodanih ? ('Usklajeno · dodanih ' + dodanih + ' artiklov.') : 'Vse stranke so že usklajene.');
    artRender();
  }

  /* ══════════ UČINKOVITOST (kilaža + produktivnost) ══════════ */
  var UCEN_LISTI = null, UCEN_DOG = null, _ucDan = null, _ucMesec = false;
  var _ucSort = 'kg_desc';   // Evidenca kg: <stolpec>_<smer> — ime_az|ime_za|kg_desc|kg_asc|eur_desc|eur_asc
  var _ucDonutRange = '3m', _uc3dAnim = false, _kgVseMap = null, _ucDonutMonth = null, _uc3dTweenFromSegs = null;
  var _ucLestSort = 'desc';   // lestvica kg/uro po dnevih: 'desc' padajoče / 'asc' naraščajoče
  var _ucLestEurSort = 'desc'; // lestvica €/kg po strankah: 'desc' padajoče / 'asc' naraščajoče
  // Prihodek po strankah za OBSEG diagrama (Mesec/3m/Vse) — ločeno od Evidence kg.
  var _ucDonutFak = {}, _ucDonutEurTot = null, _ucDonutEurKg = null, _ucDonutEurKljuc = null, _ucDonutEurLoading = false;
  function ucDonutObdobje() {
    var r = _ucDonutRange;
    if (r === 'mesec') {
      var mk = _ucDonutMonth || danes10().slice(0, 7);
      var y = parseInt(mk.slice(0, 4), 10), m = parseInt(mk.slice(5, 7), 10);
      var last = new Date(y, m, 0).getDate();
      return { od: mk + '-01', do: mk + '-' + ('0' + last).slice(-2), key: 'M' + mk };
    }
    if (r === 'vse') return { od: '2000-01-01', do: danes10(), key: 'V' };
    var d = new Date(), f = new Date(d.getFullYear(), d.getMonth() - 2, 1);
    return { od: f.getFullYear() + '-' + ('0' + (f.getMonth() + 1)).slice(-2) + '-01', do: danes10(), key: '3M' };
  }
  /* Vrstice lestvice €/kg po strankah — na osnovi OPRANEGA perila v obsegu diagrama.
     kg iz istega vira kot diagram (ucKgObseg), €/kg iz prihodka za isto obdobje. */
  function ucLestEurRows() {
    var o = ucDonutObdobje(), ready = _ucDonutEurKljuc === o.key;
    if (!ready) return '<p class="u-sub" style="padding:10px 2px">Računam prihodek…</p>';
    // Lestvica po SKUPNEM PRIHODKU (€) stranke; pod imenom kg in €/kg kot dodatek.
    var arr = Object.keys(_ucDonutFak).map(function (id) {
      var f = _ucDonutFak[id];
      return { id: id, ime: ORGIME[id] || '—', kg: f.kg, neto: f.neto, eur: (f.kg > 0 ? f.neto / f.kg : null) };
    }).filter(function (x) { return x.neto > 0 || x.kg > 0; });
    if (!arr.length) return '<p class="u-sub" style="padding:10px 2px">Ni podatkov v izbranem obdobju.</p>';
    arr.sort(function (a, b) { return _ucLestEurSort === 'asc' ? a.neto - b.neto : b.neto - a.neto; });
    function eurKg(v) { return v == null ? '—' : (Math.round(v * 100) / 100).toFixed(2).replace('.', ',') + ' €/kg'; }
    return arr.map(function (o2, i) {
      return '<div class="uc-lest-row"><span class="uc-lest-rank">' + (i + 1) + '.</span>' +
        '<span class="uc-lest-dan">' + escape_(o2.ime) + '</span>' +
        '<span class="uc-lest-sub">' + fmtKg(o2.kg) + ' · ' + eurKg(o2.eur) + '</span>' +
        '<b class="uc-lest-v">' + cenaFmt(o2.neto) + '</b></div>';
    }).join('');
  }
  function ucLestEurTot() {
    var o = ucDonutObdobje();
    if (_ucDonutEurKljuc !== o.key || _ucDonutEurTot == null) return '';
    return '<span class="uc-lest-foot-k">Skupni promet</span><b class="uc-lest-foot-v">' + cenaFmt(_ucDonutEurTot) + '</b>';
  }
  async function ucNaloziPrihodekObseg() {
    var o = ucDonutObdobje();
    if (_ucDonutEurKljuc === o.key || _ucDonutEurLoading) return;
    _ucDonutEurLoading = true;
    var m = {}, tot = 0, tn = 0, tk = 0;
    try {
      var res = await fakZberi(o.od, o.do, null);
      if (res && res.skupine) res.skupine.forEach(function (g) {
        m[g.org_id] = { kg: g.kg || 0, neto: (g.neto != null ? g.neto : 0) };
        tot += g.neto || 0; tn += g.neto || 0; tk += g.kg || 0;
      });
    } catch (e) {}
    _ucDonutFak = m; _ucDonutEurTot = tot; _ucDonutEurKg = (tk > 0 ? tn / tk : null);
    _ucDonutEurKljuc = o.key; _ucDonutEurLoading = false;
    var box = $('ucList'), sec = $('sec-statistika');
    if (box && sec && !sec.classList.contains('hidden')) {
      var l = box.querySelector('.uc-lest-eur-list'); if (l) l.innerHTML = ucLestEurRows();
      var t = box.querySelector('.uc-lest-eur-tot'); if (t) t.innerHTML = ucLestEurTot();
      /* Dopolni SAMO stolpec €/kg v Evidenci kg — ne prezidaj kartice, sicer
         prekinemo animacijo tortnega diagrama. */
      var cela = function (v) { return v != null ? cenaFmt(v) : '<span class="u-sub">—</span>'; };
      box.querySelectorAll('.uc-eur[data-org]').forEach(function (td) {
        var f = m[td.getAttribute('data-org')];
        td.innerHTML = cela(f && f.kg > 0 && f.neto != null ? f.neto / f.kg : null);
      });
      var tt = box.querySelector('.uc-eur-tot'); if (tt) tt.innerHTML = cela(_ucDonutEurKg);
    }
  }

  async function naloziUcinek() {
    var meja = danLocal(new Date(Date.now() - 400 * 24 * 3600 * 1000).getTime());
    // osebje ima v LISTI že vse liste (brez izbrisanih, živo osveženo) — iste vrstice, brez še ene poizvedbe
    var izListi = OSEBJE && Array.isArray(LISTI) && !LISTI_NAPAKA;
    if (izListi) {
      UCEN_LISTI = LISTI.filter(function (l) { return l.doc_date && l.doc_date >= meja; })
        .map(function (l) { return { id: l.id, org_id: l.org_id, doc_date: l.doc_date, weight_kg: l.weight_kg }; })
        .sort(function (a, b) { return a.doc_date < b.doc_date ? -1 : a.doc_date > b.doc_date ? 1 : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
    } else {
      var rl = await vseVrstice(function (a, b) { return sb.from('delivery_notes').select('id,org_id,doc_date,weight_kg').is('deleted_at', null).gte('doc_date', meja).order('doc_date', { ascending: true }).range(a, b); });
      UCEN_LISTI = (rl && rl.data) ? rl.data : [];
    }
    var rd = await vseVrstice(function (a, b) { return sb.from('att_events').select('id,employee_id,ts,type').gte('ts', meja + 'T00:00:00Z').order('ts', { ascending: true }).range(a, b); });
    UCEN_DOG = (rd && rd.data) ? rd.data : [];
    // Vsota kg po strankah za VES čas (za 3D krog »Vse«).
    try {
      var vse = izListi ? LISTI : ((await vseVrstice(function (a, b) { return sb.from('delivery_notes').select('org_id,weight_kg').is('deleted_at', null).range(a, b); })).data || []);
      var m = {}; vse.forEach(function (l) { if (l.org_id) m[l.org_id] = (m[l.org_id] || 0) + (parseFloat(l.weight_kg) || 0); });
      _kgVseMap = m;
    } catch (e) { _kgVseMap = null; }
  }
  // kg po strankah za obseg 3D kroga: '3m', 'vse' ali 'mesec' (izbran mesec).
  function ucKgObseg(range) {
    if (range === 'vse') return _kgVseMap || ucKgMesecev(3);
    if (range === 'mesec') { var mk = _ucDonutMonth || danes10().slice(0, 7); var m = {}; (UCEN_LISTI || []).forEach(function (l) { if (l.doc_date && l.doc_date.slice(0, 7) === mk) m[l.org_id] = (m[l.org_id] || 0) + (parseFloat(l.weight_kg) || 0); }); return m; }
    return ucKgMesecev(3);
  }
  function ucKgMesecev(nMes) {
    var d = new Date(); var floor = new Date(d.getFullYear(), d.getMonth() - (nMes - 1), 1);
    var fk = floor.getFullYear() + '-' + ('0' + (floor.getMonth() + 1)).slice(-2) + '-01';
    var m = {};
    (UCEN_LISTI || []).forEach(function (l) { if (l.doc_date && l.doc_date.slice(0, 10) >= fk) m[l.org_id] = (m[l.org_id] || 0) + (parseFloat(l.weight_kg) || 0); });
    return m;
  }
  function ucKgPoStranki(kljuc) {
    var m = {};
    (UCEN_LISTI || []).forEach(function (l) { if (l.doc_date && l.doc_date.slice(0, kljuc.length) === kljuc) m[l.org_id] = (m[l.org_id] || 0) + (parseFloat(l.weight_kg) || 0); });
    return m;
  }
  // Napis obdobja, ki velja za CELO stran Statistika (izbirnik Mesec / 3 meseci / Vse).
  function ucObdobjeLbl() {
    if (_ucDonutRange === 'vse') return 'ves čas';
    if (_ucDonutRange === 'mesec') return ucMesecIme(_ucDonutMonth || danes10().slice(0, 7));
    return 'zadnji 3 meseci';
  }
  // Skupni vir podatkov za Evidenco kg (tabela + izvoz): kg + €/kg po strankah.
  //
  // Prej je imela Evidenca svoj izbirnik obdobja (Dan/Mesec/Vse) in svoje branje
  // prihodka. Dve obdobji na eni strani sta se razhajali in ni bilo razvidno, katero
  // velja za katero številko. Odslej velja eno samo — tisto iz glave strani:
  // kilaža iz ucKgObseg (isti vir kot tortni diagram in stolpčni graf), €/kg pa iz
  // istega izračuna prihodka kot lestvica »Promet po strankah«.
  function ucEvidencaData() {
    var o = ucDonutObdobje();
    var mapK = ucKgObseg(_ucDonutRange) || {};
    var obKratko = _ucDonutRange === 'vse' ? 'vse' : (_ucDonutRange === 'mesec' ? (_ucDonutMonth || danes10().slice(0, 7)) : '3m');
    var eurReady = _ucDonutEurKljuc === o.key;
    var arr = Object.keys(mapK).map(function (id) {
      var f = eurReady ? _ucDonutFak[id] : null;
      return {
        id: id, ime: ORGIME[id] || '—', kg: mapK[id],
        eur: (f && f.kg > 0 && f.neto != null) ? f.neto / f.kg : null
      };
    }).filter(function (x) { return x.kg > 0; });
    var del = String(_ucSort || 'kg_desc').split('_'), kol = del[0], smer = del[1];
    arr.sort(function (a, b) {
      if (kol === 'ime') { var c = String(a.ime).localeCompare(String(b.ime), 'sl', { sensitivity: 'base' }); return smer === 'za' ? -c : c; }
      // Stranke brez izračunanega €/kg gredo na konec OBEH smeri: »ni podatka«
      // ni isto kot »najceneje«, prej pa je pri naraščajočem vodila prav ta skupina.
      if (kol === 'eur') {
        if (a.eur == null || b.eur == null) return (a.eur == null ? 1 : 0) - (b.eur == null ? 1 : 0);
        return smer === 'asc' ? a.eur - b.eur : b.eur - a.eur;
      }
      return smer === 'asc' ? a.kg - b.kg : b.kg - a.kg;
    });
    var kgSkup = arr.reduce(function (s, x) { return s + x.kg; }, 0);
    return {
      arr: arr, kgSkup: kgSkup, eurReady: eurReady,
      eurTot: (eurReady ? _ucDonutEurKg : null),
      obLabel: ucObdobjeLbl(), obKratko: obKratko, ekljuc: o.key
    };
  }
  function ucUreSek(kljuc) {
    var byEmp = {};
    (UCEN_DOG || []).forEach(function (d) { if (d.ts.slice(0, kljuc.length) === kljuc) (byEmp[d.employee_id] = byEmp[d.employee_id] || []).push(d); });
    var sek = 0;
    Object.keys(byEmp).forEach(function (eid) {
      var evs = byEmp[eid].sort(function (a, b) { return a.ts < b.ts ? -1 : 1; }); var odprt = null;
      evs.forEach(function (d) { if (d.type === 'in') { if (!odprt) odprt = d; } else if (d.type === 'out') { if (odprt) { sek += (new Date(d.ts) - new Date(odprt.ts)) / 1000; odprt = null; } } });
    });
    return sek;
  }
  // ── Stolpčni graf se ravna po izbirniku obdobja na vrhu strani ─────────
  // Gostota se prilagodi: mesec → dnevi, 3 meseci → tedni, vse → meseci.
  function _ucK(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function _ucMesLab(mk) { var m = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec']; return m[+mk.slice(5, 7) - 1] + ' ' + mk.slice(2, 4); }
  function ucBarsGostota(n) { return { gap: n <= 14 ? 12 : (n <= 24 ? 6 : 3) }; }
  // Napisi se izrišejo VSI, nato jih po dejanski meritvi toliko skrijemo, da se
  // preostali ne prekrivajo — fiksni korak tega ne zna, ker ob izrisu širine
  // kartice še ne poznamo.
  var _barsFitT = null;
  window.addEventListener('resize', function () {
    clearTimeout(_barsFitT);
    _barsFitT = setTimeout(function () { try { ucBarsFit(document); } catch (e) {} }, 150);
  });
  // Napis je celica mreže in se razpotegne čez ves stolpec, zato scrollWidth vrne
  // ŠIRINO STOLPCA, ne besedila — po njem je bil korak skoraj vedno 2, razmiki pa
  // neenakomerni. Tule izmerimo besedilo samo.
  function _barsTxtW(e) {
    try {
      var r = document.createRange();
      r.selectNodeContents(e);
      var w = r.getBoundingClientRect().width;
      return w > 0 ? w : e.scrollWidth;
    } catch (_) { return e.scrollWidth; }
  }
  var BARS_RAZMIK = 10;   // najmanjši vodoravni presledek med sosednjima napisoma (px)
  var _barsFitCakaPisave = false;
  function ucBarsFit(scope) {
    var rows = (scope || document).querySelectorAll('.bars-row');
    // Archivo se naloži šele po prvem izrisu. Dokler teče nadomestna pisava, so
    // črke drugače široke in meritev besedila zgreši — pri grafu po tednih je
    // ostal en sam napis od štirinajstih. Zato po naloženih pisavah izmerimo še
    // enkrat; takrat je status 'loaded' in se to ne ponovi.
    if (!_barsFitCakaPisave && document.fonts && document.fonts.status !== 'loaded') {
      _barsFitCakaPisave = true;
      try { document.fonts.ready.then(function () { try { ucBarsFit(document); } catch (e) {} }); } catch (e) {}
    }
    [].forEach.call(rows, function (row) {
      var cols = [].slice.call(row.querySelectorAll('.bars-col'));
      // Brez širine (skrit razdelek) bi bila meritev napačna in bi poskrili vse.
      if (!cols.length || !row.clientWidth) return;
      var colW = row.clientWidth / cols.length;
      ['.bars-lab', '.bars-val'].forEach(function (sel) {
        var els = cols.map(function (c) { return c.querySelector(sel); }).filter(Boolean);
        if (!els.length) return;
        els.forEach(function (e) { e.style.visibility = ''; });
        var w = 1;
        els.forEach(function (e) { if (e.textContent.trim()) { var t = _barsTxtW(e); if (t > w) w = t; } });
        var step = Math.max(1, Math.ceil((w + BARS_RAZMIK) / Math.max(colW, 1)));
        if (step === 1) return;
        // Zadnji stolpec je koristen (konec obdobja), a le če se ne zlepi s prejšnjim
        // prikazanim — prav zaradi tega sta se prej dotikala »367« in »—«.
        var zadnji = els.length - 1;
        var zadnjiPoKoraku = Math.floor(zadnji / step) * step;
        var kaziZadnjega = (zadnji - zadnjiPoKoraku) * colW >= w + BARS_RAZMIK;
        els.forEach(function (e, i) {
          var kaze = (i % step === 0) || (i === zadnji && kaziZadnjega);
          if (!kaze) e.style.visibility = 'hidden';
        });
      });
    });
  }
  function ucSerija(range) {
    var rows = [], naslov = '', idx = {};
    if (range === 'mesec') {
      var mk = _ucDonutMonth || danes10().slice(0, 7);
      var dni = new Date(+mk.slice(0, 4), +mk.slice(5, 7), 0).getDate();
      for (var i = 1; i <= dni; i++) { var k = mk + '-' + ('0' + i).slice(-2); rows.push({ key: k, lab: String(i), kg: 0, opis: datum(k) }); }
      rows.forEach(function (o) { idx[o.key] = o; });
      (UCEN_LISTI || []).forEach(function (l) { var kk = l.doc_date && l.doc_date.slice(0, 10); if (idx[kk]) idx[kk].kg += (parseFloat(l.weight_kg) || 0); });
      naslov = 'kg po dnevih · ' + ucMesecIme(mk);
    } else if (range === 'vse') {
      var kljuci = (UCEN_LISTI || []).map(function (l) { return l.doc_date ? l.doc_date.slice(0, 7) : null; }).filter(Boolean).sort();
      if (!kljuci.length) return { rows: [], naslov: 'kg po mesecih · ves čas' };
      var kon = kljuci[kljuci.length - 1], cy = +kljuci[0].slice(0, 4), cm = +kljuci[0].slice(5, 7);
      while (cy * 12 + cm <= +kon.slice(0, 4) * 12 + +kon.slice(5, 7)) {
        var mk2 = cy + '-' + ('0' + cm).slice(-2);
        rows.push({ key: mk2, lab: _ucMesLab(mk2), kg: 0, opis: ucMesecIme(mk2) });
        cm++; if (cm > 12) { cm = 1; cy++; }
      }
      rows.forEach(function (o) { idx[o.key] = o; });
      (UCEN_LISTI || []).forEach(function (l) { var km = l.doc_date && l.doc_date.slice(0, 7); if (idx[km]) idx[km].kg += (parseFloat(l.weight_kg) || 0); });
      naslov = 'kg po mesecih · ves čas';
    } else {
      var d = new Date(), fl = new Date(d.getFullYear(), d.getMonth() - 2, 1);
      var st = new Date(fl); st.setDate(st.getDate() - ((st.getDay() + 6) % 7));
      for (var c = new Date(st); c <= d; c.setDate(c.getDate() + 7)) {
        var k1 = _ucK(c), e = new Date(c); e.setDate(e.getDate() + 6);
        rows.push({ key: k1, kon: _ucK(e), lab: ('0' + c.getDate()).slice(-2) + '.' + ('0' + (c.getMonth() + 1)).slice(-2) + '.', kg: 0, opis: 'teden ' + datum(k1) + ' – ' + datum(_ucK(e)) });
      }
      (UCEN_LISTI || []).forEach(function (l) {
        var kd = l.doc_date && l.doc_date.slice(0, 10); if (!kd) return;
        for (var j = rows.length - 1; j >= 0; j--) { if (kd >= rows[j].key && kd <= rows[j].kon) { rows[j].kg += (parseFloat(l.weight_kg) || 0); break; } }
      });
      naslov = 'kg po tednih · zadnji 3 meseci';
    }
    return { rows: rows, naslov: naslov };
  }
  function ucUreSekObseg(range) {
    if (range === 'mesec') return ucUreSek(_ucDonutMonth || danes10().slice(0, 7));
    if (range === 'vse') return ucUreSek('');
    var d = new Date(), fl = new Date(d.getFullYear(), d.getMonth() - 2, 1);
    return ucUreSekOd(_ucK(fl));
  }
  function ucUreSekOd(odKljuc) {
    var byEmp = {};
    (UCEN_DOG || []).forEach(function (d) { if (d.ts.slice(0, 10) >= odKljuc) (byEmp[d.employee_id] = byEmp[d.employee_id] || []).push(d); });
    var sek = 0;
    Object.keys(byEmp).forEach(function (eid) {
      var evs = byEmp[eid].sort(function (a, b) { return a.ts < b.ts ? -1 : 1; }); var odprt = null;
      evs.forEach(function (d) { if (d.type === 'in') { if (!odprt) odprt = d; } else if (d.type === 'out') { if (odprt) { sek += (new Date(d.ts) - new Date(odprt.ts)) / 1000; odprt = null; } } });
    });
    return sek;
  }
  function ucMesecIme(mk) { var p = mk.split('-'); var mes = ['januar', 'februar', 'marec', 'april', 'maj', 'junij', 'julij', 'avgust', 'september', 'oktober', 'november', 'december']; return (mes[parseInt(p[1], 10) - 1] || '') + ' ' + p[0]; }
  // Lestvica kg/uro po dnevih izbranega meseca (samo dnevi z opranim in odprtimi urami).
  function ucKgUroPoDnevih(mk) {
    var dni = {};
    (UCEN_LISTI || []).forEach(function (l) { var k = l.doc_date && l.doc_date.slice(0, 10); if (k && k.slice(0, 7) === mk) dni[k] = (dni[k] || 0) + (parseFloat(l.weight_kg) || 0); });
    var out = [];
    Object.keys(dni).forEach(function (k) { var kg = dni[k]; var ure = ucUreSek(k) / 3600; if (ure > 0 && kg > 0) out.push({ dan: k, kg: kg, ure: ure, kgh: kg / ure }); });
    return out;
  }
  function danKratek(iso) { var p = String(iso).split('-'); return p.length === 3 ? (parseInt(p[2], 10) + '. ' + parseInt(p[1], 10) + '.') : iso; }
  function fmtStevilo1(n) { return (Math.round((n || 0) * 10) / 10).toLocaleString('sl-SI', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  /* ══════════ DELEŽ KG PO STRANKAH — ploščat krog (prej 3D, ki je deleže popačil) ══════════
     Najvišjih 5 strank + »Ostalo« (sivo). Barva sledi stranki, ne mestu: stranke, ki so največje v celem obdobju,
     imajo stalno barvo (Mesec / 3 meseci / Vse); paleta preverjena za barvno slepoto (dataviz validator, svetlo
     in temno). Sredina: skupaj kg, ob dotiku/miški ime in delež. Seznam ob krogu nosi vse številke (tudi brez barv). */
  var KROG_N = 5;
  function ucDonutSegs(range) {
    var map = ucKgObseg(range) || {};
    var arr = Object.keys(map).map(function (id) { return { id: id, ime: ORGIME[id] || '—', kg: map[id] }; }).filter(function (x) { return x.kg > 0; }).sort(function (a, b) { return b.kg - a.kg; });
    var total = arr.reduce(function (s, x) { return s + x.kg; }, 0);
    if (!total) return { segs: [], total: 0 };
    var vse = ucKgObseg('vse') || {};
    var stalni = Object.keys(vse).sort(function (a, b) { return (vse[b] || 0) - (vse[a] || 0); }).slice(0, KROG_N);
    var prikaz = arr.slice(0, KROG_N), zasedeni = {};
    prikaz.forEach(function (x) { var ix = stalni.indexOf(x.id); if (ix >= 0) { x.slot = ix + 1; zasedeni[x.slot] = 1; } });
    var prosti = [1, 2, 3, 4, 5].filter(function (n) { return !zasedeni[n]; });
    prikaz.forEach(function (x) { if (!x.slot) x.slot = prosti.shift(); });
    var segs = prikaz.map(function (x) { return { ime: x.ime, kg: x.kg, slot: x.slot }; });
    var ostalo = total - segs.reduce(function (s, x) { return s + x.kg; }, 0);
    if (ostalo > 0.0001) segs.push({ ime: 'Ostalo', kg: ostalo, slot: 0, n: arr.length - prikaz.length });
    return { segs: segs, total: total };
  }
  var _uc3dRAF = null;   // združljivost: ni več animacije po okvirjih
  function ucKrogHtml(d) {
    if (!d.total) return '<p class="uc-krog-prazno">Ni podatkov za izbrano obdobje.</p>';
    var R = 78, C = 2 * Math.PI * R, rez = d.segs.length > 1 ? 2.4 : 0, off = 0, krogi = '';
    d.segs.forEach(function (sg, i) {
      var len = sg.kg / d.total * C, vid = Math.max(0.6, len - rez);
      krogi += '<circle class="uc-krog-s" data-i="' + i + '" cx="100" cy="100" r="' + R + '" style="stroke:var(--krog-' + sg.slot + ');stroke-dasharray:' + vid.toFixed(2) + ' ' + (C - vid).toFixed(2) + ';stroke-dashoffset:' + (-off).toFixed(2) + '"/>';
      off += len;
    });
    var vrste = d.segs.map(function (sg, i) {
      var pct = sg.kg / d.total * 100;
      return '<li class="uc-krog-v" data-i="' + i + '" tabindex="0"><span class="uc-krog-pika" style="background:var(--krog-' + sg.slot + ')"></span>' +
        '<span class="uc-krog-ime">' + escape_(sg.ime) + (sg.n ? '<span class="uc-krog-n"> · ' + sg.n + '</span>' : '') + '</span>' +
        '<span class="uc-krog-kg">' + escape_(fmtKg(sg.kg)) + '</span><b class="uc-krog-pct">' + (pct < 1 ? '<1' : Math.round(pct)) + ' %</b></li>';
    }).join('');
    return '<div class="uc-krog"><div class="uc-krog-g">' +
      '<svg class="uc-krog-svg" viewBox="0 0 200 200" role="img" aria-label="Delež kg po strankah"><defs><mask id="ucKrogMaska"><circle class="uc-krog-maska" cx="100" cy="100" r="' + R + '" style="stroke-dasharray:' + C.toFixed(2) + ';stroke-dashoffset:0"/></mask></defs>' +
      '<g mask="url(#ucKrogMaska)" transform="rotate(-90 100 100)">' + krogi + '</g></svg>' +
      '<div class="uc-krog-sred" aria-live="polite"><b class="uc-krog-st">' + escape_(fmtKg(d.total)) + '</b><span class="uc-krog-op">skupaj</span></div></div>' +
      '<ol class="uc-krog-leg">' + vrste + '</ol></div>';
  }
  function ucKrogPovezi(stage, d, animiraj) {
    var root = stage.querySelector('.uc-krog'); if (!root) return;
    var st = root.querySelector('.uc-krog-st'), op = root.querySelector('.uc-krog-op'), skupaj = fmtKg(d.total);
    function poudari(i) {
      root.classList.toggle('hot', i != null);
      root.querySelectorAll('[data-i]').forEach(function (el) { el.classList.toggle('on', i != null && el.dataset.i === String(i)); });
      if (i == null) { st.textContent = skupaj; op.textContent = 'skupaj'; return; }
      var sg = d.segs[+i]; st.textContent = Math.round(sg.kg / d.total * 100) + ' %'; op.textContent = sg.ime;
    }
    root.querySelectorAll('[data-i]').forEach(function (el) {
      el.addEventListener('pointerenter', function () { poudari(el.dataset.i); });
      el.addEventListener('pointerleave', function () { poudari(null); });
      el.addEventListener('focus', function () { poudari(el.dataset.i); });
      el.addEventListener('blur', function () { poudari(null); });
      el.addEventListener('click', function () { poudari(root.querySelector('[data-i="' + el.dataset.i + '"].on.uc-krog-s') && el.classList.contains('uc-krog-s') ? null : el.dataset.i); });
    });
    var reduce = manjGibanja();
    if (_ucKrogIo) { _ucKrogIo.disconnect(); _ucKrogIo = null; }
    // osvežitev, ko krog še čaka na vstop, ga ne sme pokazati končanega
    if ((animiraj || _ucKrogCaka) && !reduce) {   // krog se izriše v smeri urinega kazalca, seznam se pojavi za njim
      var m = root.querySelector('.uc-krog-maska'), C = parseFloat(m.style.strokeDasharray);
      m.style.strokeDashoffset = C; root.classList.add('vstop');
      var zacni = function () {
        _ucKrogCaka = false; _uc3dMirno = Date.now() + 1000;   // osvežitev s svežimi podatki počaka konec animacije (ucPoAnimaciji)
        requestAnimationFrame(function () { requestAnimationFrame(function () { m.style.transition = 'stroke-dashoffset .9s cubic-bezier(.22,.61,.36,1)'; m.style.strokeDashoffset = 0; root.classList.remove('vstop'); }); });
      };
      if (!window.IntersectionObserver) { zacni(); return; }
      // krog je lahko pod robom zaslona: brez čakanja bi se animiral neviden in uporabnik bi ga videl že končanega
      _ucKrogCaka = true;
      _ucKrogIo = new IntersectionObserver(function (v, io) { if (!v[v.length - 1].isIntersecting) return; io.disconnect(); _ucKrogIo = null; zacni(); }, { threshold: .35 });
      _ucKrogIo.observe(root);
    }
  }
  var _ucKrogIo = null, _ucKrogCaka = false;
  window.addEventListener('beforeprint', function () { var m = document.querySelector('.uc-krog.vstop .uc-krog-maska'); if (m) { m.style.strokeDashoffset = 0; m.closest('.uc-krog').classList.remove('vstop'); } });
  function uc3dAnimate(stage, range, animate) { var d = ucDonutSegs(range); stage.innerHTML = ucKrogHtml(d); ucKrogPovezi(stage, d, animate); }
  function uc3dTween(stage, from, to) { stage.innerHTML = ucKrogHtml(to); ucKrogPovezi(stage, to, true); }
  // Odtis podatkov Statistike: ali se je po osvežitvi v ozadju kaj spremenilo.
  function ucOdtis() {
    var kg = 0; (UCEN_LISTI || []).forEach(function (l) { kg += parseFloat(l.weight_kg) || 0; });
    var vse = 0; if (_kgVseMap) Object.keys(_kgVseMap).forEach(function (k) { vse += _kgVseMap[k] || 0; });
    var dog = UCEN_DOG || [];
    return [(UCEN_LISTI || []).length, Math.round(kg * 100), dog.length, dog.length ? dog[dog.length - 1].id : '', Math.round(vse * 100)].join('|');
  }
  // Animacija diagrama se je včasih pokvarila: (1) osvežitev v ozadju je diagram izrisala
  // znova sredi animacije (skok na konec), (2) prednalaganje in odprtje razdelka sta hkrati
  // nalagala in izrisovala (animacija je skočila ali stekla dvakrat). Zdaj: ena poizvedba
  // naenkrat (ucNalozi), izriše le zadnji klic (_ucGen), osvežitev počaka konec animacije.
  var _ucNal = null, _ucGen = 0, _uc3dMirno = 0;
  function ucNalozi() {
    if (!_ucNal) _ucNal = naloziUcinek().then(function (v) { _ucNal = null; return v; }, function (e) { _ucNal = null; throw e; });
    return _ucNal;
  }
  function ucPoAnimaciji(fn) {
    var t0 = Date.now();
    (function cakaj() {
      if ((_uc3dRAF || _ucKrogCaka || Date.now() < _uc3dMirno) && Date.now() - t0 < 8000) { setTimeout(cakaj, 120); return; }
      fn();
    })();
  }
  async function risiUcinek(prefetch) {
    var box = $('ucList'); if (!box) return;
    if (prefetch && _ucNal) return;   // že nalaga
    var gen = ++_ucGen;
    // Podatki so že naloženi (prednalaganje ob prijavi ali prejšnji obisk): diagram nariši in
    // animiraj TAKOJ, sveže podatke naloži v ozadju. Prej se je ob vsakem odprtju čakalo na
    // bazo in diagrama za trenutek sploh ni bilo.
    if (!prefetch && box.dataset.loaded) {
      if (!_ucDan) _ucDan = danes10();
      _uc3dAnim = true; ucRender();
      try {
        var prej = ucOdtis(), prejSegs = ucDonutSegs(_ucDonutRange);
        await ucNalozi();
        if (gen !== _ucGen || ucOdtis() === prej) return;
        // spremembe pokaži šele po koncu animacije; diagram se le preoblikuje (brez ponovne animacije)
        ucPoAnimaciji(function () {
          if (gen !== _ucGen) return;
          var nov = ucDonutSegs(_ucDonutRange);
          _uc3dTweenFromSegs = JSON.stringify(nov) === JSON.stringify(prejSegs) ? null : prejSegs;
          _uc3dAnim = false; ucRender();
        });
      } catch (e) {}
      return;
    }
    // Prepreči »najprej final, nato animacija«: ob ODPRTJU sinhrono zbriši morebitni že
    // prednaloženi (končni) diagram, da se med čakanjem na podatke ne izriše in nato reset.
    if (!prefetch) { var _pre = box.querySelector('.uc-krog-oder'); if (_pre) _pre.innerHTML = ''; }
    pokaziNalaganje(box);
    try {
      await ucNalozi();
      if (gen !== _ucGen) return;   // medtem je razdelek odprt znova (npr. med prednalaganjem) — izriše tisti klic
      if (!_ucDan) _ucDan = danes10();
      _uc3dAnim = !prefetch;   // med prednalaganjem (skrito) NE animiramo; animira se šele ob odprtju
      ucRender();
      box.dataset.loaded = '1';
    } catch (e) { if (!box.dataset.loaded) box.innerHTML = '<div class="uc-card"><p class="u-sub">Napaka pri nalaganju: ' + escape_(e && e.message ? e.message : e) + '</p></div>'; }
  }
  function ucRender() {
    var box = $('ucList'); if (!box) return;
    var _sy = window.scrollY;
    if (!_ucDonutMonth) _ucDonutMonth = danes10().slice(0, 7);
    var mesecKljuc = _ucDan.slice(0, 7);   // še vedno za lestvico kg/uro po dnevih
    // »Skupna učinkovitost« se ravna po izbirniku obdobja na vrhu strani.
    // Prej je brala _ucDan — to je stanje razdelka Evidenca kg, ne te glave.
    var mapMon = ucKgObseg(_ucDonutRange) || {};
    var kgMon = Object.keys(mapMon).reduce(function (s, k) { return s + mapMon[k]; }, 0);
    var ureMon = ucUreSekObseg(_ucDonutRange) / 3600;
    var kgh = ureMon > 0 ? kgMon / ureMon : 0;
    var ser = ucSerija(_ucDonutRange);
    var naj = Math.max.apply(null, ser.rows.map(function (o) { return o.kg; }).concat([1]));
    var gost = ucBarsGostota(ser.rows.length);

    var rangeLbl = _ucDonutRange === 'vse' ? 'ves čas' : (_ucDonutRange === 'mesec' ? ucMesecIme(_ucDonutMonth) : 'zadnji 3 meseci');
    var mesecInput = _ucDonutRange === 'mesec' ? '<input type="month" id="ucDonutMesec" class="uc-d3-month" value="' + escape_(_ucDonutMonth) + '">' : '';
    // Glava strani Statistika: en sam izbirnik obdobja (Mesec / 3 meseci / Vse) na vrhu.
    var rangeTabs = '<span class="pris-tabs">' +
      '<button type="button" class="pris-tab' + (_ucDonutRange === 'mesec' ? ' on' : '') + '" data-ucrange="mesec">Mesec</button>' +
      '<button type="button" class="pris-tab' + (_ucDonutRange === '3m' ? ' on' : '') + '" data-ucrange="3m">3 meseci</button>' +
      '<button type="button" class="pris-tab' + (_ucDonutRange === 'vse' ? ' on' : '') + '" data-ucrange="vse">Vse</button></span>';
    var pageHead = '<div class="uc-page-head"><div><p class="uc-range-lbl">' + rangeLbl + '</p></div>' +
      '<div class="uc-d3-ctrl">' + mesecInput + rangeTabs + '</div></div>';
    var cardDonut = '<div class="uc-card uc-donut3d-card">' +
      '<h3 class="sec-h">Delež kg po strankah</h3>' +
      '<div class="uc-d3-stage uc-krog-oder"></div></div>';
    var cardBars = '<div class="uc-card"><h3 class="sec-h">' + escape_(ser.naslov) + '</h3>' +
      (ser.rows.length ? '<div class="bars-row" style="margin-top:14px;column-gap:' + gost.gap + 'px">' +
        ser.rows.map(function (o) {
          return '<div class="bars-col" title="' + escape_(o.opis + ' · ' + fmtKg(o.kg)) + '">' +
            '<span class="bars-val">' + (o.kg ? Math.round(o.kg) : '&nbsp;') + '</span>' +
            '<div class="bars-bar" style="--v:' + (o.kg / naj).toFixed(4) + '"></div>' +
            '<span class="bars-lab">' + escape_(o.lab) + '</span></div>';
        }).join('') + '</div>'
      : '<p class="u-sub" style="margin:14px 0 0">V izbranem obdobju ni podatkov.</p>') + '</div>';
    var cardProd = '<div class="uc-card uc-stat"><h3 class="sec-h">Skupna učinkovitost</h3><div class="uc-big">' + (kgh ? fmtStevilo1(kgh) : '—') + ' <span>kg/uro</span></div>' +
      '<p class="u-sub">' + fmtKg(kgMon) + ' · ' + stevilo(Math.round(ureMon)) + ' delovnih ur · ' + escape_(rangeLbl) + '</p></div>';
    // Lestvica kg/uro po dnevih (izbran mesec) — naraščajoče/padajoče.
    var lestDni = ucKgUroPoDnevih(mesecKljuc);
    lestDni.sort(function (a, b) { return _ucLestSort === 'asc' ? a.kgh - b.kgh : b.kgh - a.kgh; });
    var lestVrst = lestDni.length ? lestDni.map(function (o, i) {
      return '<div class="uc-lest-row"><span class="uc-lest-rank">' + (i + 1) + '.</span>' +
        '<span class="uc-lest-dan">' + danKratek(o.dan) + '</span>' +
        '<span class="uc-lest-sub">' + tezaFmt(o.kg) + ' · ' + fmtStevilo1(o.ure) + ' h</span>' +
        '<b class="uc-lest-v">' + fmtStevilo1(o.kgh) + '<span> kg/uro</span></b></div>';
    }).join('') : '<p class="u-sub" style="padding:8px 2px">Ni dni z opranim perilom in odprtimi urami v tem mesecu.</p>';
    var cardLestvica = '<div class="uc-card uc-lest-card"><div class="uc-lest-h"><h3 class="sec-h">kg/uro po dnevih</h3>' +
      '<button type="button" class="pris-tab uc-lest-toggle" data-uclest>' + (_ucLestSort === 'desc' ? 'Padajoče' : 'Naraščajoče') + '</button></div>' +
      '<div class="uc-lest-list">' + lestVrst + '</div></div>';
    // Lestvica €/kg po strankah — DESNO od tortnega diagrama (na osnovi opranega perila).
    var cardLestEur = '<div class="uc-card uc-lest-card uc-lest-eur"><div class="uc-lest-h"><h3 class="sec-h">Promet po strankah</h3>' +
      '<button type="button" class="pris-tab uc-lest-toggle" data-uclesteur>' + (_ucLestEurSort === 'desc' ? 'Padajoče' : 'Naraščajoče') + '</button></div>' +
      '<div class="uc-lest-list uc-lest-eur-list">' + ucLestEurRows() + '</div>' +
      '<div class="uc-lest-foot uc-lest-eur-tot">' + ucLestEurTot() + '</div></div>';
    // Zgoraj: diagram LEVO + lestvica €/kg po strankah DESNO. Spodaj: kg 7 dni + učinkovitost.
    // (Kartica »kg/uro po dnevih« odstranjena — nadomešča jo lestvica €/kg po strankah desno.)
    void cardLestvica;
    var top = pageHead + '<div class="uc-donut-row">' + cardDonut + cardLestEur + '</div>' +
      '<div class="uc-top uc-top2">' + cardBars + cardProd + '</div>';

    var d = ucEvidencaData();
    var eurReady = d.eurReady;
    function eurCela(v) { return !eurReady ? '<span class="u-sub">…</span>' : (v != null ? cenaFmt(v) : '<span class="u-sub">—</span>'); }
    var rows = d.arr.map(function (x) { return '<tr><td>' + escape_(x.ime) + '</td><td class="pris-ure">' + fmtKg(x.kg) + '</td><td class="pris-ure uc-eur" data-org="' + escape_(x.id) + '">' + eurCela(x.eur) + '</td></tr>'; }).join('');
    // Razvrščanje s klikom na naslov stolpca: prvi klik izbere stolpec, vsak naslednji
    // obrne smer. Puščico rišemo s tisto ikono, ki jo uporabljajo spustni meniji —
    // znaka ↓/↑ sta v tej pisavi višja od besedila in sedita pod črkovno črto.
    function thRazvrsti(kljuc, naslov, privzeta, razred) {
      var del = String(_ucSort || 'kg_desc').split('_');
      var na = del[0] === kljuc, smer = na ? del[1] : privzeta;
      var gor = (smer === 'asc' || smer === 'az');
      return '<th' + (razred ? ' class="' + razred + '"' : '') + (na ? ' aria-sort="' + (gor ? 'ascending' : 'descending') + '"' : '') + '>' +
        '<button type="button" class="uc-th' + (na ? ' on' + (gor ? ' gor' : '') : '') + '" data-sort="' + kljuc + '"' +
        ' title="Razvrsti po ' + escape_(naslov.toLowerCase()) + '">' + escape_(naslov) +
        '<svg class="uc-th-p" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>' +
        '</button></th>';
    }
    var tbl = '<table class="pris-tbl uc-ev-tbl"><thead><tr>' +
      thRazvrsti('ime', 'Stranka', 'az') + thRazvrsti('kg', 'Kilaža', 'desc') + thRazvrsti('eur', '€/kg', 'desc') +
      '</tr></thead><tbody>' +
      (rows || '<tr><td colspan="3" class="u-sub">Ni podatkov v izbranem obdobju.</td></tr>') + '</tbody>' +
      (rows ? '<tfoot><tr><td>Skupaj</td><td class="pris-ure">' + fmtKg(d.kgSkup) + '</td><td class="pris-ure uc-eur uc-eur-tot">' + eurCela(d.eurTot) + '</td></tr></tfoot>' : '') + '</table>';
    var ev = '<div class="pris-card"><div class="pris-h">' +
      '<div><h3 class="sec-h">Evidenca kg</h3><p class="uc-obd-lbl">' + escape_(rangeLbl) + '</p></div>' +
      '<span class="pris-hbtns"><button type="button" class="cgrp-btn ghost uc-izvoz">Izvozi</button></span></div>' +
      tbl + '</div>';

    box.innerHTML = top + ev;
    // Napisi se redčijo po dejanski širini — šele ko je vsebina v dokumentu.
    try { ucBarsFit(box); } catch (e) {}
    var _svg3d = box.querySelector('.uc-krog-oder');
    if (_svg3d) {
      if (_uc3dTweenFromSegs) { uc3dTween(_svg3d, _uc3dTweenFromSegs, ucDonutSegs(_ucDonutRange)); _uc3dTweenFromSegs = null; }
      else uc3dAnimate(_svg3d, _ucDonutRange, _uc3dAnim);
    }
    _uc3dAnim = false;
    box.querySelectorAll('[data-ucrange]').forEach(function (b) { b.addEventListener('click', function () { if (_ucDonutRange === b.dataset.ucrange) return; _uc3dTweenFromSegs = ucDonutSegs(_ucDonutRange); _ucDonutRange = b.dataset.ucrange; _uc3dAnim = false; ucRender(); }); });
    { var _lt = box.querySelector('[data-uclest]'); if (_lt) _lt.addEventListener('click', function () { _ucLestSort = (_ucLestSort === 'desc' ? 'asc' : 'desc'); ucRender(); }); }
    { var _le = box.querySelector('[data-uclesteur]'); if (_le) _le.addEventListener('click', function () { _ucLestEurSort = (_ucLestEurSort === 'desc' ? 'asc' : 'desc'); var l = box.querySelector('.uc-lest-eur-list'); if (l) l.innerHTML = ucLestEurRows(); this.textContent = (_ucLestEurSort === 'desc' ? 'Padajoče' : 'Naraščajoče'); }); }
    var _dm = $('ucDonutMesec'); if (_dm) _dm.addEventListener('change', function () { if (!this.value) return; _uc3dTweenFromSegs = ucDonutSegs(_ucDonutRange); _ucDonutMonth = this.value; _uc3dAnim = false; ucRender(); });
    var ib = box.querySelector('.uc-izvoz'); if (ib) ib.addEventListener('click', ucIzvozOdpri);
    box.querySelectorAll('.uc-th[data-sort]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.dataset.sort;
        var obrni = (k === 'ime') ? { az: 'za', za: 'az' } : { desc: 'asc', asc: 'desc' };
        var privzeta = (k === 'ime') ? 'az' : 'desc';
        var del = String(_ucSort || 'kg_desc').split('_');
        _ucSort = k + '_' + (del[0] === k ? (obrni[del[1]] || privzeta) : privzeta);
        ucRender();
      });
    });
    ucNaloziPrihodekObseg();   // prihodek in €/kg za obdobje strani (lestvica + Evidenca kg)
    requestAnimationFrame(function () { window.scrollTo(0, _sy); });
  }
  // ── Izvoz Evidence kg: predogled + Excel ali PDF (za izbrano obdobje dan/mesec/vse) ──
  function ucIzvozOdpri() {
    var d = ucEvidencaData();
    if (!d.arr.length) { toast('Ni podatkov za izvoz.'); return; }
    predogledDokument({
      naslov: 'Evidenca kg · ' + d.obLabel,
      docHtml: ucKgDocHtml(d),
      xlsx: function () { ucKgXlsx(d); },
      pdf: function () { return ucKgPdf(d); }
    });
  }
  function _ucEurStr(v) { return v == null ? '—' : (Math.round(v * 100) / 100).toFixed(2).replace('.', ',') + ' €'; }
  function ucKgFileBase(d) { return 'evidenca_kg_' + (d.obKratko || 'obdobje').replace(/[^0-9A-Za-z-]/g, '_'); }
  // Predogled (HTML) — skupni slog dokumentov (glava z logotipom portala, tabela kot spremni list).
  function ucKgDocHtml(d) {
    var rows = d.arr.map(function (x) {
      return '<tr><td class="an">' + escape_(x.ime) + '</td><td class="r b">' + fmtKg(x.kg) + '</td><td class="r b">' + _ucEurStr(x.eur) + '</td></tr>';
    }).join('');
    return dokHtml('Evidenca kg ' + d.obLabel,
      '<div class="sc-box sc-num"><span>Evidenca kg</span><span class="sc-obd">' + escape_(d.obLabel) + '</span></div>' +
      '<table class="sc-table"><thead><tr><th class="l">Stranka</th><th class="r">Kilaža</th><th class="r">&euro;/kg</th></tr></thead><tbody>' + rows + '</tbody>' +
      '<tfoot><tr><td class="an">Skupaj</td><td class="r b">' + fmtKg(d.kgSkup) + '</td><td class="r b">' + _ucEurStr(d.eurTot) + '</td></tr></tfoot></table>');
  }
  // Excel (.xlsx)
  function ucKgXlsx(d) {
    var B = function (t) { return { v: t, bold: true }; };
    var T = function (t) { return { v: t, s: 2 }; };
    var rows = [[{ v: 'Evidenca kg — ' + d.obLabel, s: 2 }], [], [B('Stranka'), B('Kilaža (kg)'), B('€/kg')]];
    d.arr.forEach(function (x) { rows.push([x.ime, { v: Math.round(x.kg * 100) / 100 }, x.eur != null ? { v: Math.round(x.eur * 100) / 100 } : '—']); });
    rows.push([]);
    rows.push([T('SKUPAJ'), { v: Math.round(d.kgSkup * 100) / 100, s: 2 }, d.eurTot != null ? { v: Math.round(d.eurTot * 100) / 100, s: 2 } : '—']);
    prenesiXlsx(ucKgFileBase(d) + '.xlsx', [{ name: 'Evidenca kg', rows: rows }]);
    toast('Excel pripravljen.');
  }
  // PDF (prava datoteka, vektorsko) — isti slog kot predogled.
  async function ucKgPdf(d) {
    if (!(await pdfPripravljen())) return;
    var doc = new PDFDoc(); doc.addPage();
    var M = DPDF.M, R = doc.W - M;
    var y = dpdfGlava(doc);
    y = dpdfNaslovOkvir(doc, y, 'Evidenca kg', d.obLabel);
    var cKg = R - 6 - 110, cEur = R - 6;
    var st = [{ t: 'Stranka', x: M + 6 }, { t: 'Kilaža', x: cKg, align: 'right' }, { t: '€/kg', x: cEur, align: 'right' }];
    y += 4 * PT; y = dpdfTabGlava(doc, y, st);
    y = dpdfTabela(doc, y, st, d.arr.map(function (x) {
      return [{ t: x.ime, x: M + 6, w: 600 }, { t: fmtKg(x.kg), x: cKg, align: 'right', w: 700 }, { t: _ucEurStr(x.eur), x: cEur, align: 'right', w: 700 }];
    }), 30, 'Evidenca kg · ' + d.obLabel);
    doc.line(M, y + 0.56, R, y + 0.56, { width: 1.5 * PT, color: DPDF.INK });
    var osn = dpdfOsnova(y + 8 * PT, 10 * PT, 15 * PT);
    doc.text(M + 6, osn, 'Skupaj', { size: 10 * PT, bold: true, color: DPDF.INK });
    doc.text(cKg, osn, fmtKg(d.kgSkup), { size: 10 * PT, bold: true, align: 'right', color: DPDF.INK });
    doc.text(cEur, osn, _ucEurStr(d.eurTot), { size: 10 * PT, bold: true, align: 'right', color: DPDF.INK });
    pdfIzhod(doc, ucKgFileBase(d) + '.pdf');
  }

  /* ══════════ SPREMNI LISTI ══════════ */
  async function naloziListe() {
    // Stranka bere prek pogleda brez internih stolpcev (66_listi_stranke.sql): interna
    // opomba, pisna opomba osebja in dnevnik popravkov ne pridejo v njen brskalnik.
    if (!OSEBJE && !MOJPROFIL.super_admin) {
      const rs = await vseVrstice((od, do_) => sb.from('listi_stranke').select('id,number,doc_date,total_pieces,weight_kg,org_id,issued_name,popravil,popravljeno_at,source,transport,potrjeno,legacy_id,opomba_stranka').order('doc_date', { ascending: false }).order('id', { ascending: false }).range(od, do_));
      LISTI_NAPAKA = !!(rs && rs.error);
      LISTI = (rs && !rs.error && rs.data) ? rs.data : [];
      VSEHLISTOV = LISTI.length;
      STAR_SET = new Set();
      return;
    }
    const _mk = naloziManjkajoce();
    // Beri VSE liste po straneh (brez 1000-vrstičnega limita — mora delati še čez leta).
    // Stabilna paginacija: doc_date + id kot razločevalo.
    const _kol = 'id,number,doc_date,total_pieces,weight_kg,org_id,issued_name,popravil,popravljeno_at,popravki,source,transport,potrjeno,legacy_id,opomba,opomba_avtor,opomba_at,opomba_stranka,opomba_evidenca';
    let r = await vseVrstice((od, do_) => sb.from('delivery_notes').select(_kol).is('deleted_at', null).order('doc_date', { ascending: false }).order('id', { ascending: false }).range(od, do_));
    // Rezerva: če stolpci za opombo/popravke še niso dodani, naloži brez njih.
    if (r.error) {
      r = await vseVrstice((od, do_) => sb.from('delivery_notes').select('id,number,doc_date,total_pieces,weight_kg,org_id,issued_name,popravil,popravljeno_at,source,transport,potrjeno,legacy_id').is('deleted_at', null).order('doc_date', { ascending: false }).order('id', { ascending: false }).range(od, do_));
    }
    // Rezerva 2: SAMO če stolpca deleted_at res ni (migracija 50 ni zagnana) → beri brez tega filtra.
    // Prej je ta preklop sprožila katerakoli napaka — tudi izpad povezave — in brisanje je nato
    // liste brisalo DOKONČNO (brez koša), čeprav je okno obljubljalo 30-dnevno obnovo.
    if (r.error && /deleted_at/i.test(r.error.message || '') && /column|stolp|exist/i.test(r.error.message || '')) {
      _softDelDN = false;
      r = await vseVrstice((od, do_) => sb.from('delivery_notes').select('id,number,doc_date,total_pieces,weight_kg,org_id,issued_name,popravil,popravljeno_at,source,transport,potrjeno,legacy_id').order('doc_date', { ascending: false }).order('id', { ascending: false }).range(od, do_));
    }
    LISTI_NAPAKA = !!(r && r.error);
    LISTI = (r && !r.error && r.data) ? r.data : [];
    const {
      count
    } = await sb.from('delivery_notes').select('id', {
      count: 'exact',
      head: true
    }).is('deleted_at', null);
    VSEHLISTOV = count || 0;
    await Promise.race([_mk, new Promise(ok => setTimeout(ok, 1500))]);   // počasen odgovor le pozneje posodobi stanje na Domovu
    // Zberi liste s starim zapisom (postavka brez povezave na artikel → article_id IS NULL)
    // Pregled CELE tabele postavk je daleč najdražja poizvedba ob prijavi, rabimo
    // pa jo le za oznako »star zapis« in števec nepotrjenih — zato v ozadje.
    // nabor ostane do novega (živo osveževanje bi sicer oznake za trenutek skrilo)
    if (OSEBJE) naloziStarSet();
  }
  var _starP = null, _starZadnji = 0;
  function naloziStarSet() {
    if (_starP) return _starP;
    if (Date.now() - _starZadnji < 120000) return Promise.resolve();   // najdražja poizvedba: ob živem osveževanju največ vsaki 2 min
    _starZadnji = Date.now();
    _starP = (async function () {
      try {
        const rs = await vseVrstice((od, do_) =>
          sb.from('delivery_note_items').select('note_id').is('article_id', null).range(od, do_));
        if (rs && rs.error) throw rs.error;
        const set = new Set();
        (rs && rs.data ? rs.data : []).forEach(r => { if (r && r.note_id) set.add(r.note_id); });
        STAR_SET = set;
        try { zivNarisi([]); } catch (e) {}   // le viden razdelek in šele, ko nihče ne ureja
      } catch (e) {
        _starZadnji = 0;
        STAR_SET = new Set();
        try { console.warn('[star_set] oznak »star zapis« ni bilo mogoče naložiti:', (e && e.message) || e); } catch (_) {}
      } finally { _starP = null; }
    })();
    return _starP;
  }
  const prazniListi = kdo => '<div class="rows"><div class="empty"><h3>Spremnih listov še ni</h3></div></div>';
  // Ločeno stanje za NAPAKO pri nalaganju (ne prikazuj kot »prazno«) — z gumbom za ponovni poskus.
  const napakaListi = '<div class="rows"><div class="empty"><h3>Nalaganje ni uspelo</h3><button type="button" class="btn ghost" data-act="liste-ponovi" style="margin-top:14px">Poskusi znova</button></div></div>';
  document.addEventListener('click', async function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-act="liste-ponovi"]') : null;
    if (!b) return;
    b.disabled = true; b.textContent = 'Nalagam …';
    try { await naloziListe(); } catch (_) {}
    try { risiArhiv(); } catch (_) {}
    try { risiPregled(); } catch (_) {}
  });

  /* ══════════ PREGLED ══════════ */
  // Oblikovanje števke v KPI ploščici. Teža med štetjem ostane v enoti in decimalkah končne vrednosti (cilj),
  // da ne skače »0,08 t« → »142,6 kg«.
  function _fmtStat(v, fmt, konec, cilj) {
    if (fmt === 'tona') {
      if (konec) return fmtTona(v);
      var kon = fmtTona(cilj == null ? v : cilj), tone = /\st$/.test(kon), dec = ((kon.split(',')[1] || '').match(/\d/g) || []).length;
      return (tone ? v / 1000 : v).toLocaleString('sl-SI', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: false }) + '\u00a0' + (tone ? 't' : 'kg');
    }
    return stevilo(Math.round(v));
  }
  // »Big-tech« štetje do cilja (od 0 ali od prejšnje vrednosti).
  function _countUp(el, target, fmt, dur, od) {
    dur = dur || 900; od = od || 0; var t0 = 0; el._v = od; el.textContent = _fmtStat(od, fmt, false, target);
    function ease(x) { return 1 - Math.pow(1 - x, 3); }
    function fr(now) { if (!t0) t0 = now; var p = Math.min(1, (now - t0) / dur); el._v = od + (target - od) * ease(p); el.textContent = _fmtStat(el._v, fmt, false, target); if (p < 1) requestAnimationFrame(fr); else el.textContent = _fmtStat(target, fmt, true); }
    requestAnimationFrame(fr);
  }
  function _brezGibanja() { return manjGibanja(); }
  // prej = vrednosti pred osvežitvijo v živo: brez nove vstopne animacije, šteje le številka, ki se je spremenila.
  // Osvežitev med vstopno animacijo (npr. zakasnjena poizvedba ob zagonu) jo nadaljuje, ne začne znova.
  var _statT0 = 0;
  function _animStat(grid, prej) {
    if (!grid) return;
    var reduce = _brezGibanja(), pret = Date.now() - _statT0;
    if (!prej) _statT0 = Date.now();
    if (!prej || pret < 1000) [].slice.call(grid.querySelectorAll('.stat')).forEach(function (t, i) { t.style.setProperty('--si', i); if (prej) t.style.animationDelay = (i * 70 - pret) + 'ms'; t.classList.add('stat-in'); });
    grid.querySelectorAll('.stat-num[data-count]').forEach(function (el) {
      var target = parseFloat(el.getAttribute('data-count')) || 0, fmt = el.getAttribute('data-fmt') || 'int';
      var p = prej && prej[el.getAttribute('data-k')], od = p ? parseFloat(p.c) : NaN;
      if (reduce || (prej && (isNaN(od) || od === target))) { el.textContent = _fmtStat(target, fmt, true); return; }
      if (prej) _countUp(el, target, fmt, 600, od); else _countUp(el, target, fmt);
    });
  }
  // Oddelane ure (tekoči mesec) — iz att_events; par in/out po zaposlenih.
  async function _domUreSek() {
    var mk = danes10().slice(0, 7), evs;
    if (UCEN_DOG) { evs = UCEN_DOG.filter(function (d) { return d.ts && d.ts.slice(0, 7) === mk; }); }
    else { var r = await deli('ure|' + mk, function () { return vseVrstice(function (a, b) { return sb.from('att_events').select('employee_id,ts,type').gte('ts', mk + '-01T00:00:00Z').order('ts', { ascending: true }).order('id', { ascending: true }).range(a, b); }); }); evs = (r && r.data) ? r.data : []; }
    var byEmp = {}; evs.forEach(function (d) { (byEmp[d.employee_id] = byEmp[d.employee_id] || []).push(d); });
    var sek = 0;
    Object.keys(byEmp).forEach(function (eid) { var a = byEmp[eid].sort(function (x, y) { return x.ts < y.ts ? -1 : 1; }); var odprt = null; a.forEach(function (d) { if (d.type === 'in') { if (!odprt) odprt = d; } else if (d.type === 'out') { if (odprt) { sek += (new Date(d.ts) - new Date(odprt.ts)) / 1000; odprt = null; } } }); });
    return sek;
  }
  async function _domUreFill() {
    var el = document.querySelector('#statGrid .stat-num[data-pending="ure"]'); if (!el) return;
    var sek = 0; try { sek = await _domUreSek(); } catch (e) {}
    var ure = Math.round(sek / 3600), od = parseFloat(el.getAttribute('data-od'));
    if (!document.body.contains(el)) return;
    el.setAttribute('data-count', ure); el.setAttribute('data-fmt', 'int'); el.removeAttribute('data-pending'); el.removeAttribute('data-od');
    if (_brezGibanja() || od === ure) el.textContent = stevilo(ure); else if (!isNaN(od)) _countUp(el, ure, 'int', 600, od); else _countUp(el, ure, 'int');
  }
  // Po potrditvi na Domov: osveži pasico in seznam (le če je Domov odprt).
  // 1 list še ni potrjen · 2 lista še nista potrjena · 3 listi še niso potrjeni · 5 listov še ni potrjenih
  function nepotrjeniBesedilo(n) {
    var m = n % 100;
    return stevilo(n) + (m === 1 ? ' list še ni potrjen' : m === 2 ? ' lista še nista potrjena' : (m === 3 || m === 4) ? ' listi še niso potrjeni' : ' listov še ni potrjenih');
  }
  // ── Manjkajoče številke spremnih listov (baza: 20261102120000_manjkajoce_stevilke.sql) ──
  async function naloziManjkajoce() {
    try {
      var r = await sb.rpc('app_stevilke_pregled');
      if (!r || r.error || !Array.isArray(r.data)) return;
      MANJKA = r.data.filter(function (x) { return !x.brez_lista; });
      BREZ_LISTA = r.data.filter(function (x) { return x.brez_lista; });
      var b = $('arhivBrezBtn'); if (b) b.classList.toggle('hidden', !BREZ_LISTA.length);
      if (LISTI.length) risiDomovStatus();
      if (_mkRisi) _mkRisi();
    } catch (e) {}
  }
  function manjkaBesedilo(m) {
    var n = m.length, d = n % 100, st = m.map(function (x) { return x.stevilka; });
    var gl = d === 2 ? 'Manjkata' : (d === 3 || d === 4) ? 'Manjkajo' : 'Manjka', sam = d === 1 ? 'številka' : d === 2 ? 'številki' : (d === 3 || d === 4) ? 'številke' : 'številk';
    return n > 4 ? gl + ' <b>' + stevilo(n) + ' ' + sam + '</b> spremnih listov' : gl + ' ' + sam + ' <b>' + (n === 2 ? st.join('</b> in <b>') : st.join(', ')) + '</b>';
  }
  // Stanje na Domovu (samo osebje): zadnji list naj bo od včeraj (razen če je bila včeraj nedelja → sobota), vsi listi potrjeni, nobena številka ne manjka.
  function risiDomovStatus() {
    var el = $('domovStatus'); if (!el) return;
    var html = '';
    if (OSEBJE && LISTI.length) {
      var _iso = function (dt) { return dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2) + '-' + ('0' + dt.getDate()).slice(-2); };
      var zadnjiDatum = LISTI.reduce(function (m, l) { return (l.doc_date && l.doc_date > m) ? l.doc_date : m; }, '');
      var _d = new Date(); _d.setHours(0, 0, 0, 0); _d.setDate(_d.getDate() - 1); if (_d.getDay() === 0) _d.setDate(_d.getDate() - 1);
      var azuren = zadnjiDatum && zadnjiDatum >= _iso(_d);
      var nepotrjeni = LISTI.filter(function (l) { return (l.total_pieces > 0) && l.potrjeno !== true && !STAR_SET.has(l.id); }).length;
      var opozori = function (podatek, ik, vsebina, naslov) { return '<div class="preg-status ps-warn ps-klik" role="button" tabindex="0" ' + podatek + (naslov ? ' title="' + naslov + '"' : '') + '><span class="ps-ik">' + ik + '</span><span>' + vsebina + '</span></div>'; };
      if (!azuren) html = opozori('data-arhiv', IKO_KLICAJ, 'Zadnji spremni list je od <b>' + (zadnjiDatum ? datum(zadnjiDatum) : '—') + '</b> — morda manjkajo novejši.');
      else if (nepotrjeni > 0) html = opozori('data-nepotrjeni', IKO_TOCKA, '<b>' + nepotrjeniBesedilo(nepotrjeni) + '</b>', 'Pokaži nepotrjene');
      else if (!MANJKA.length) html = '<div class="preg-status ps-ok"><span class="ps-ik">' + IKO_KLJUKICA + '</span><span>Vse pregledano in dodano · zadnji list <b>' + (zadnjiDatum ? datum(zadnjiDatum) : '—') + '</b>.</span></div>';
      if (MANJKA.length) html += opozori('data-manjka', IKO_KLICAJ, manjkaBesedilo(MANJKA));
    }
    if (el._html === html) return;
    el._html = html; el.innerHTML = html;
    el.querySelectorAll('.ps-klik').forEach(function (p) {
      var odpri = function () { if (p.hasAttribute('data-manjka')) { manjkaOdpri(); return; } if (p.hasAttribute('data-nepotrjeni')) ARH_NEPOTRJENI = true; pojdi('arhiv'); };
      p.addEventListener('click', odpri);
      p.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); odpri(); } });
    });
  }
  // Vsaka manjkajoča številka: Dodaj list (obrazec s to številko) ali Ni lista (ne opozarja več, Vrni jo vrne).
  function manjkaOdpri() {
    if (document.querySelector('.mk-modal')) return;
    var w = sme('arhiv', 'w');
    var back = document.createElement('div'); back.className = 'sc-modal-back';
    back.innerHTML = '<div class="sc-modal mk-modal" role="dialog" aria-modal="true"><h4></h4><div class="mk-seznam"></div>' +
      '<div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" data-zapri>Zapri</button></div></div>';
    var sez = back.querySelector('.mk-seznam');
    var vrsta = function (x, meta, gumbi) {
      return '<div class="mk-vr"><div class="mk-st"><b>' + x.stevilka + '/' + x.leto + '</b>' + (meta ? '<span>' + escape_(meta) + '</span>' : '') + '</div>' + (w ? '<div class="mk-akc" data-k="' + x.leto + '/' + x.stevilka + '">' + gumbi + '</div>' : '') + '</div>';
    };
    var najdi = function (k) { return MANJKA.concat(BREZ_LISTA).filter(function (x) { return x.leto + '/' + x.stevilka === k; })[0]; };
    _mkRisi = function () {
      if (!MANJKA.length && !BREZ_LISTA.length) { zapri(); return; }
      back.querySelector('h4').textContent = MANJKA.length ? 'Manjkajoče številke' : 'Številke brez lista';
      sez.innerHTML = MANJKA.map(function (x) {
        return vrsta(x, x.prej_datum ? 'Prejšnji list ' + datum(x.prej_datum) : '', '<button type="button" class="cgrp-btn ghost" data-ni>Ni lista</button><button type="button" class="cgrp-btn" data-dodaj>Dodaj list</button>');
      }).join('') + (BREZ_LISTA.length && MANJKA.length ? '<p class="u-sub mk-pod">Ni lista</p>' : '') + BREZ_LISTA.map(function (x) {
        return vrsta(x, (x.oznacil ? x.oznacil + ' · ' : '') + (x.oznaceno ? datum(x.oznaceno.slice(0, 10)) : ''), '<button type="button" class="cgrp-btn ghost" data-vrni>Vrni</button>');
      }).join('');
    };
    var done = false;
    function zapri() {
      if (done) return; done = true; _mkRisi = null; back.classList.remove('show'); document.removeEventListener('keydown', onKey, true);
      setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); _modalVrniFokus();
    }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); zapri(); } }
    var tRazpored = 0;   // vrstice se po označitvi premaknejo: drugi dotik dvojnega pritiska ne sme zadeti naslednje številke
    sez.addEventListener('click', async function (e) {
      var g = e.target.closest('button'), ak = g && g.closest('.mk-akc'); if (!ak || Date.now() - tRazpored < 450) return;
      var x = najdi(ak.dataset.k); if (!x) return;
      if (g.hasAttribute('data-dodaj')) {
        var vDomov = !$('sec-domov').classList.contains('hidden');
        zapri(); novList(vDomov ? $('domovNovBtn') : null, x);
        return;
      }
      var brez = g.hasAttribute('data-ni');
      ak.querySelectorAll('button').forEach(function (b) { b.disabled = true; }); g.classList.add('nalaga');
      if (!await manjkaOznaci(x, brez)) { ak.querySelectorAll('button').forEach(function (b) { b.disabled = false; }); g.classList.remove('nalaga'); return; }
      tRazpored = Date.now();
      if (brez) toast('Številka ' + x.stevilka + ': ni lista', { besedilo: 'Razveljavi', ob: function () { manjkaOznaci(x, false); } });
    });
    back.querySelector('[data-zapri]').addEventListener('click', zapri);
    back.addEventListener('click', function (e) { if (e.target === back) zapri(); });
    document.addEventListener('keydown', onKey, true);
    _mkRisi();
    document.body.appendChild(back);
    _modalA11y(back);
    requestAnimationFrame(function () { back.classList.add('show'); });
  }
  async function manjkaOznaci(x, brez) {
    var r = await sb.rpc('app_stevilka_brez_lista', { p_leto: x.leto, p_stevilka: x.stevilka, p_brez: brez });
    if (r.error) { toast(napakaBesedilo(r.error)); return false; }
    if (r.data === false) { toast('List s številko ' + x.stevilka + ' že obstaja.'); await naloziListe(); risiDomovStatus(); return false; }
    logDodaj('Arhiv', brez ? 'Številka brez lista' : 'Številka spet manjka', x.stevilka + '/' + x.leto);
    await naloziManjkajoce();
    return true;
  }
  function risiPregledStatus() { if ($('sec-domov') && !$('sec-domov').classList.contains('hidden') && !_okno) risiPregled(true); }
  // tiho = osvežitev v živo (druga naprava, ponovna povezava, potrditev): brez ponovne vstopne animacije
  function risiPregled(tiho) {
    const zdaj = new Date();
    const _dan = zdaj.toLocaleDateString('sl-SI', { weekday: 'long', day: 'numeric', month: 'long' });
    $('domovNaslov').textContent = (OSEBJE || (JAZIME || '').trim()) ? (pozdrav() + ', ' + prvoIme()) : pozdrav();
    $('domovPod').textContent = [_dan.charAt(0).toUpperCase() + _dan.slice(1), !OSEBJE && MOJEPODJETJE ? MOJEPODJETJE.name : ''].filter(Boolean).join(' · ');
    { const _ak = $('domovAkc'); if (_ak) _ak.classList.toggle('hidden', !OSEBJE); }
    const zacetekMeseca = new Date(zdaj.getFullYear(), zdaj.getMonth(), 1);
    const vMesecu = LISTI.filter(l => new Date(l.doc_date) >= zacetekMeseca);
    const kosovMesec = vMesecu.reduce((s, l) => s + (l.total_pieces || 0), 0);
    const kgMesec = vMesecu.reduce((s, l) => s + (parseFloat(l.weight_kg) || 0), 0);
    const zadnji = LISTI[0];
    // ena kartica za tekoči mesec: štiri številke, pod njimi zadnjih šest mesecev
    const _zadnjiKratko = zadnji ? (function (d) { return d.getDate() + '. ' + d.toLocaleDateString('sl-SI', { month: 'short' }); })(new Date(zadnji.doc_date)) : '—';
    const kartice = [
      { lab: 'Spremni listi', num: vMesecu.length, fmt: 'int' },
      { lab: 'Kosi', num: kosovMesec, fmt: 'int' },
      { lab: 'Teža', num: kgMesec, fmt: 'tona' },
      OSEBJE ? { lab: 'Ure', pending: 'ure' } : { lab: 'Zadnji spremni list', text: _zadnjiKratko }
    ];
    const _mesec = zdaj.toLocaleDateString('sl-SI', { month: 'long' });
    var prej = null;
    if (tiho) { prej = {}; [].forEach.call($('statGrid').querySelectorAll('.stat-num[data-k]'), function (el) { prej[el.getAttribute('data-k')] = { c: el._v != null ? el._v : el.getAttribute('data-count'), t: el.textContent }; }); }
    $('statGrid').innerHTML = '<div class="dom-kart-h">' + escape_(_mesec.charAt(0).toUpperCase() + _mesec.slice(1)) + '</div>' + kartice.map(function (k) {
      var num, pp = prej && prej[k.lab];
      if (k.text != null) num = escape_(k.text);
      else if (k.pending) num = (pp && pp.c != null) ? escape_(pp.t) : '<span class="stat-dots">···</span>';
      else num = escape_(_fmtStat(k.num, k.fmt, true));
      var attr = (k.pending) ? ' data-pending="' + k.pending + '"' + ((pp && pp.c != null) ? ' data-od="' + escape_(pp.c) + '"' : '') : ((k.text == null) ? ' data-count="' + k.num + '" data-fmt="' + k.fmt + '"' : '');
      return '<div class="stat"><div class="stat-num" data-k="' + escape_(k.lab) + '"' + attr + '>' + num + '</div>' +
        '<div class="stat-lab">' + escape_(k.lab) + '</div><div class="stat-sub">' + escape_(k.sub || '') + '</div></div>';
    }).join('');
    _animStat($('statGrid'), prej);
    if (OSEBJE) _domUreFill();

    /* zadnjih šest mesecev */
    risiDomovStatus();
    if (!LISTI.length) {
      $('mesecni').innerHTML = '';
      $('zadnji').innerHTML = LISTI_NAPAKA ? napakaListi : prazniListi(OSEBJE ? 'osebje' : 'stranka');
      return;
    }
    const meseci = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(zdaj.getFullYear(), zdaj.getMonth() - i, 1);
      const konec = new Date(zdaj.getFullYear(), zdaj.getMonth() - i + 1, 1);
      const kos = LISTI.filter(l => {
        const x = new Date(l.doc_date);
        return x >= d && x < konec;
      }).reduce((s, l) => s + (l.total_pieces || 0), 0);
      meseci.push({
        ime: d.toLocaleDateString('sl-SI', {
          month: 'short'
        }),
        kos
      });
    }
    const naj = Math.max(...meseci.map(m => m.kos), 1);
    $('mesecni').innerHTML = '<div class="bars"><h3 class="sec-h">Kosov po mesecih</h3><div class="bars-row">' + meseci.map((m, i) => `<div class="bars-col${i === meseci.length - 1 ? ' zdaj' : ''}">
        <span class="bars-val">${m.kos ? stevilo(m.kos) : ''}</span>
        <div class="bars-bar" style="--v:${(m.kos / naj).toFixed(4)}"></div>
        <span class="bars-lab">${escape_(m.ime)}</span></div>`).join('') + '</div></div>';
    const stKljuc = l => { const d = String(l.number || '').split('/'); return (parseInt(d[1], 10) || 0) * 1e7 + (parseInt(d[0], 10) || 0); };
    const razvrsceni = LISTI.slice().sort((a, b) => stKljuc(b) - stKljuc(a));
    const zadnjiListi = razvrsceni.slice(0, 6).sort((a, b) => String(b.doc_date || '').localeCompare(String(a.doc_date || '')) || stKljuc(b) - stKljuc(a));
    $('zadnji').innerHTML = '<div class="dom-zadnji-h"><h3 class="sec-h">Zadnji spremni listi</h3>' +
      (razvrsceni.length > zadnjiListi.length ? '<button type="button" class="link-btn" data-vsi>Vsi spremni listi</button>' : '') + '</div>' + tabelaListov(zadnjiListi, true, null, true);
    { const _v = $('zadnji').querySelector('[data-vsi]'); if (_v) _v.addEventListener('click', () => pojdi('arhiv')); }
    $('zadnji').querySelectorAll('.a-row').forEach(b => b.addEventListener('click', () => odpriList(b)));
    $('zadnji').querySelectorAll('.arh-chk.clk').forEach(c => {
      c.addEventListener('click', e => { e.stopPropagation(); potrdiList(c).then(risiPregledStatus); });
      c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); potrdiList(c).then(risiPregledStatus); } });
    });
    prednaloziPostavke(zadnjiListi);
  }

  /* ══════════ OKNO: kartica se razpre v okno (Arhiv, Stranke) ══════════
     Vsebina kartice (.a-det / .arts) se za čas odprtja PRESELI v okno in se ob
     zaprtju vrne na svoje mesto — urejanje, tisk, opombe in brisanje delajo naprej
     na istem elementu. Okno zraste iz kartice in se vanjo vrne: premik + clip-path,
     ne scale, zato se besedilo med animacijo ne razteguje. */
  var _okno = null;
  var OKNO_KRIVULJA = GIB_KRIVULJA;
  var OKNO_RAST_MS = 480, OKNO_KRCENJE_MS = 340, OKNO_POJAV_MS = 600;   // pojav = --gib-t4, kot .sc-modal
  // telefon: okno v mirovanju nima zaobljenih robov, med rastjo in krčenjem pa jih ima (kartica je zaobljena)
  function oknoRobovi(panel, odpri, ms) {
    if (parseFloat(getComputedStyle(panel).borderTopLeftRadius)) return;
    panel.animate(odpri ? [{ borderRadius: '30px' }, { borderRadius: '0px' }] : [{ borderRadius: '0px' }, { borderRadius: '30px' }], { duration: ms, easing: OKNO_KRIVULJA, fill: odpri ? 'none' : 'forwards' });
  }
  function oknoMirno() { return manjGibanja(); }
  // Glava okna je kopija kartice (isti podatki, ista statusna barva), postavljena za okno.
  function oknoGlava() {
    var o = _okno; if (!o) return;
    if (o.glavaFn) {   // okno brez kartice (npr. nov spremni list iz gumba): naslov + ×
      o.glava.className = 'okno-glava okno-glava-naslov';
      var n = o.glavaFn(o.kartica);
      o.glava.innerHTML = ''; o.glava.appendChild(n); o.glava.appendChild(o.x);
      o.panel.setAttribute('aria-label', n.textContent.trim());
      return;
    }
    var k = o.kartica, cel = k.closest('.lcell');
    o.glava.className = 'okno-glava' + (cel ? ' ' + [].filter.call(cel.classList, function (c) { return c !== 'lcell' && c !== 'open'; }).join(' ') : '');
    var kop = document.createElement('div');
    kop.className = [].filter.call(k.classList, function (c) { return c !== 'okno-vir' && c !== 'arh-flash'; }).join(' ') + ' okno-kartica';
    kop.innerHTML = k.innerHTML;
    kop.querySelectorAll('[style]').forEach(function (el) { el.removeAttribute('style'); });   // odvito ime (marquee) ob hoverju
    var chk = kop.querySelector('.arh-chk.clk');
    if (chk) {
      var klik = function (e) {
        e.preventDefault(); e.stopPropagation();
        var izv = _okno && _okno.kartica.querySelector('.arh-chk.clk'); if (!izv) return;
        var p = potrdiList(izv); oknoGlava(); p.then(oknoGlava, oknoGlava);   // ob napaki potrdiList vrne stanje nazaj
      };
      chk.addEventListener('click', klik);
      chk.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') klik(e); });
    }
    // telefon: naslovnica kartice kot pasica na vrhu okna (okno čez cel zaslon, × v pasici levo zgoraj)
    var pas = document.createElement('div'); pas.className = 'okno-pasica'; pas.setAttribute('aria-hidden', 'true');
    var st = k.getAttribute('style'); if (st) pas.setAttribute('style', st);
    o.glava.innerHTML = ''; o.glava.appendChild(pas); o.glava.appendChild(kop); o.glava.appendChild(o.nz); o.glava.appendChild(o.x);
    var nasl = k.querySelector('.a-num, .row-nm');
    o.panel.setAttribute('aria-label', nasl ? nasl.textContent.trim() : 'Podrobnosti');
  }
  // Kartica na mestu, kjer je okno nastalo: od tam okno zraste in tja se vrne.
  // Raste OKNO SAMO (z vsebino in senco), a le s transform: okno se razteguje, njegova
  // vsebina pa z NASPROTNIM raztegom ostane v pravi velikosti in se razkriva z robom okna.
  // Vse to izvaja grafična kartica — brez ponovnega izrisa vsebine (clip-path ga je zahteval)
  // in brez ločene površine, za katero je senca okna zamujala.
  // Nasprotni razteg je pravilen le, če je v vsakem trenutku točno 1/s, zato ključe
  // izračunamo v 40 korakih z isto krivuljo (linearno med koraki).
  function oknoKrivulja(x1, y1, x2, y2) {
    function b(t, a1, a2) { var u = 1 - t; return 3 * u * u * t * a1 + 3 * u * t * t * a2 + t * t * t; }
    return function (x) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      var lo = 0, hi = 1, t = x;
      for (var i = 0; i < 28; i++) { var bx = b(t, x1, x2); if (Math.abs(bx - x) < 1e-5) break; if (bx < x) lo = t; else hi = t; t = (lo + hi) / 2; }
      return b(t, y1, y2);
    };
  }
  var OKNO_ODPRI = oknoKrivulja(.32, .72, 0, 1), OKNO_ZAPRI = OKNO_ODPRI;
  function oknoKljuci(o, krivulja, zapri) {
    var c = o.kartica.getBoundingClientRect(), p = o.panel.getBoundingClientRect();
    var sx0 = Math.max(0.02, c.width / p.width), sy0 = Math.max(0.02, c.height / p.height);
    var dx = c.left - p.left, dy = c.top - p.top, N = 40, okno = [], notr = [];
    for (var i = 0; i <= N; i++) {
      var t = i / N, e = krivulja(t);
      var f = zapri ? e : 1 - e;   // delež »kartice«: 1 = kartica, 0 = okno
      var sx = 1 + (sx0 - 1) * f, sy = 1 + (sy0 - 1) * f;
      okno.push({ offset: t, transform: 'translate(' + (dx * f) + 'px,' + (dy * f) + 'px) scale(' + sx + ',' + sy + ')' });
      // Nasprotni razteg omejen na 1/0,5: dokler je okno manjše od 50 %, je vsebina prosojna
      // (ob odpiranju se pretopi šele po 110 ms, ob zapiranju izgine v 110 ms) — kadar je vidna,
      // je vedno v pravi velikosti (preverjeno za kartice od 1 % do 50 % velikosti okna).
      // Brez omejitve je bil razteg pri majhni kartici tudi 8-kraten in brskalnik je moral
      // vsebino izrisati v 8-kratni velikosti: dvakrat več dela in zatikanje na počasnejših napravah.
      notr.push({ offset: t, transform: 'scale(' + (1 / Math.max(sx, 0.5)) + ',' + (1 / Math.max(sy, 0.5)) + ')' });
    }
    return { okno: okno, notr: notr };
  }
  // Kopija leži v oknu (zunaj seznama), zato nanjo ne delujejo pravila, ki veljajo le znotraj
  // seznama (npr. kompaktne vrstice v Prisotnosti: ».pz-seznam .row.pz«) — brez tega je bil prvi
  // okvir odpiranja in zadnji zapiranja drugačen od kartice (poskok). Zato vsak element kopije
  // dobi izračunani slog izvirnika (tudi stanje »miška nad njo«).
  var OKNO_DUH_SLOG = ['display', 'box-sizing', 'grid-template-columns', 'grid-template-rows', 'grid-template-areas',
    'grid-row-start', 'grid-row-end', 'grid-column-start', 'grid-column-end', 'row-gap', 'column-gap',
    'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-items', 'align-self', 'justify-content', 'justify-self', 'order',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'min-width', 'max-width', 'min-height', 'position', 'top', 'right', 'bottom', 'left', 'transform',
    'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align', 'text-transform', 'text-overflow',
    'white-space', 'overflow-x', 'overflow-y', 'color', 'opacity', 'visibility', 'vertical-align', 'font-variant-numeric',
    'background-color', 'background-image', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius', 'box-shadow',
    '-webkit-line-clamp', '-webkit-box-orient', 'text-decoration-line'];
  // Kopija je že v dokumentu: prepišemo le lastnosti, ki se od izvirnika razlikujejo (od zgoraj
  // navzdol, da otroci podedujejo popravke staršev) — enake ostanejo nedotaknjene, brez zaokroževanja.
  function oknoDuhSlog(izv, kop, koren) {
    var a = getComputedStyle(izv), b = getComputedStyle(kop), imaSlog = izv.hasAttribute('style');
    // element z lastno animacijo (utripajoča pika »na spletu«): ne zamrzni trenutne faze, kopija je mirna
    var anim = izv.getAnimations && izv.getAnimations().some(function (x) { return x.playState === 'running' && x.effect && x.effect.getComputedTiming().iterations === Infinity; });
    for (var i = 0; i < OKNO_DUH_SLOG.length && !anim; i++) {
      var p = OKNO_DUH_SLOG[i];
      // koren: velikost in mesto določa ovoj; vsebina z lastnim slogom (odvito ime ob hoverju) ostane na začetku
      if (koren && /^(min-height|margin|top|right|bottom|left|transform)/.test(p)) continue;
      if (!koren && imaSlog && /^(transform|left|margin)/.test(p)) continue;
      var v = a.getPropertyValue(p); if (b.getPropertyValue(p) !== v) kop.style.setProperty(p, v);
    }
    if (izv instanceof SVGElement) return;
    for (var j = 0; j < izv.children.length && j < kop.children.length; j++) oknoDuhSlog(izv.children[j], kop.children[j], false);
  }
  // Natančna kopija kartice na njenem mestu med animacijo: prvi okvir odpiranja in zadnji
  // okvir zapiranja sta videti kot kartica sama — kartica se poveča v okno (in skrči nazaj),
  // namesto da bi nad njo zrasla kopija, ona pa izginila šele na koncu.
  function oknoDuh(o) {
    // Ovoj dobi razrede starša kartice (.lcell s statusom, mreža skupin …), da kopijo
    // oblikujejo ista pravila kot kartico v seznamu.
    var k = o.kartica, r = k.getBoundingClientRect(), star = k.parentElement;
    var ovoj = document.createElement('div');
    ovoj.className = (star ? [].filter.call(star.classList, function (c) { return c !== 'open' && c !== 'hidden'; }).join(' ') + ' ' : '') + 'okno-duh';
    ovoj.style.left = r.left + 'px'; ovoj.style.top = r.top + 'px';
    ovoj.style.width = r.width + 'px'; ovoj.style.height = r.height + 'px';
    ovoj.setAttribute('aria-hidden', 'true');
    // Videz kartice v trenutku klika (tudi stanje »miška nad njo«: ozadje, obroba, senca),
    // sicer bi kopija ob kliku za trenutek utripnila v videz brez hoverja.
    var kop = k.cloneNode(true);
    kop.classList.remove('okno-vir', 'arh-flash');
    ['id', 'data-id', 'data-i', 'aria-expanded', 'style'].forEach(function (a) { kop.removeAttribute(a); });
    kop.querySelectorAll('[style],[data-pot],[tabindex]').forEach(function (el) { el.removeAttribute('style'); el.removeAttribute('data-pot'); el.removeAttribute('tabindex'); });
    kop.setAttribute('tabindex', '-1');
    // brez prehodov: kopija naj takoj prevzame videz kartice (tudi barve »miška nad njo«), ne pa animira do njega
    kop.style.transition = 'none'; kop.style.animation = 'none';
    kop.querySelectorAll('*').forEach(function (el) { el.style.transition = 'none'; el.style.animation = 'none'; });
    ovoj.appendChild(kop);
    o.back.appendChild(ovoj);   // nad oknom: prvi okvir odpiranja / zadnji zapiranja je kartica
    // ob zapiranju je kartica že skrita (okno-vir) — slog beremo, kot da je vidna (isti korak, brez izrisa)
    var vir = k.classList.contains('okno-vir'); if (vir) k.classList.remove('okno-vir');
    oknoDuhSlog(k, kop, true);
    if (vir) k.classList.add('okno-vir');
    return ovoj;
  }
  // moznosti.glava: funkcija(kartica), ki vrne element glave (sicer kopija kartice);
  // moznosti.obZaprtju: klic, ko je okno zaprto in vsebina vrnjena na svoje mesto;
  // moznosti.osvezi: funkcija(nova kartica) → nova vsebina po ponovnem izrisu seznama
  //   (za razdelke, ki ob vsaki spremembi izrišejo vse na novo, npr. Cenik & Artikli).
  function oknoOdpri(kartica, vsebina, najdi, moznosti) {
    moznosti = moznosti || {};
    if (_okno) oknoZapri(true);
    var back = document.createElement('div'); back.className = 'okno-back';
    var zatemni = document.createElement('div'); zatemni.className = 'okno-zatemni'; back.appendChild(zatemni);
    var panel = document.createElement('div'); panel.className = 'okno';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.tabIndex = -1;
    var notr = document.createElement('div'); notr.className = 'okno-notr';
    var glava = document.createElement('div');
    var telo = document.createElement('div'); telo.className = 'okno-telo';
    var x = document.createElement('button'); x.type = 'button'; x.className = 'doc-x okno-x'; x.setAttribute('aria-label', 'Zapri'); x.innerHTML = IKO_ZAPRI;
    // telefon: Nazaj levo (iz urejanja na podrobnosti, sicer zapre), × desno
    var nz = document.createElement('button'); nz.type = 'button'; nz.className = 'doc-x okno-nazaj'; nz.setAttribute('aria-label', 'Nazaj'); nz.innerHTML = IKO_NAZAJ;
    nz.addEventListener('click', function () { var p = telo.querySelector('[data-preklici]'); if (p && p.offsetParent) p.click(); else oknoKoncaj(); });
    notr.appendChild(glava); notr.appendChild(telo); panel.appendChild(notr); back.appendChild(panel);
    var o = _okno = { back: back, panel: panel, notr: notr, glava: glava, telo: telo, x: x, nz: nz, kartica: kartica, vsebina: vsebina, najdi: najdi,
      id: kartica.dataset.id, dom: { parent: vsebina.parentNode, next: vsebina.nextSibling, id: vsebina.id },
      glavaFn: moznosti.glava || null, obZaprtju: moznosti.obZaprtju || null, osvezi: moznosti.osvezi || null,
      varuj: moznosti.varuj || null, zavrzi: moznosti.zavrzi || null, odtis: null };
    if (o.varuj) o.odtis = oknoOdtis(o);
    oknoGlava();
    vsebina.removeAttribute('id');   // po ponovnem izrisu ima nova kartica element z istim id-jem
    vsebina.classList.add('show');
    telo.appendChild(vsebina);       // ponovna vstavitev znova sproži animacijo razkritja vsebine (adReveal)
    // Stran pod oknom naj ne drsi; širino drsnika nadomesti odmik, da se nič ne premakne.
    var drsnik = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.classList.add('okno-zaklep');
    if (drsnik > 0) document.documentElement.style.paddingRight = drsnik + 'px';
    document.body.appendChild(back);
    x.addEventListener('click', function () { oknoKoncaj(); });
    // Zapri ob kliku na ozadje — a ne, če se je izbira besedila začela v oknu in končala zunaj.
    back.addEventListener('mousedown', function (e) { o.zunaj = e.target === back; });
    back.addEventListener('click', function (e) { if (e.target === back && o.zunaj) oknoKoncaj(); o.zunaj = false; });
    document.addEventListener('keydown', oknoTipka, true);
    o.visina = panel.offsetHeight;
    o.vvPoln = window.visualViewport ? window.visualViewport.height : 0;
    o.sy = window.scrollY;
    // Menjava vsebine (podrobnosti ↔ urejanje, nalaganje) naj višino okna spremeni gladko.
    if (window.ResizeObserver && !oknoMirno()) {
      o.ro = new ResizeObserver(function () {
        var h = panel.offsetHeight;
        if (!o.morf && !o.zapiram && Math.abs(h - o.visina) > 2 && panel.animate && !back.classList.contains('okno-tipk')) {
          panel.animate([{ height: o.visina + 'px' }, { height: h + 'px' }], { duration: 340, easing: OKNO_KRIVULJA });
        }
        o.visina = h;
      });
      o.ro.observe(vsebina);
    }
    void back.offsetWidth; back.classList.add('show');   // zatemnitev začne takoj (brez čakanja na naslednji okvir)
    // Okno iz gumba + ne raste iz drobnega kroga (pomanjšano okno je bilo raztegnjen pravokotnik z odrezano vsebino):
    // pride kot pogovorna okna portala — iz rahle pomanjšave, kratka pot navzgor, gumb ostane na mestu.
    o.pojav = !!(moznosti.pojav || kartica.classList.contains('tb-prim'));
    if (oknoMirno() || !panel.animate) { if (!o.pojav) kartica.classList.add('okno-vir'); back.classList.add('okno-cel'); oknoFokus(o); return; }
    o.morf = true;
    if (o.pojav) {
      var konecPojava = function () { o.morf = false; if (o.zapiram) return; o.visina = panel.offsetHeight; back.classList.add('okno-cel'); oknoVidno(); };
      oknoRobovi(panel, true, OKNO_POJAV_MS);
      panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: 40, easing: 'ease', fill: 'backwards' });   // stran se najprej zatemni, nato pride okno
      panel.animate([{ transform: 'translate3d(0,14px,0) scale(.965)' }, { transform: 'none' }], { duration: OKNO_POJAV_MS, easing: OKNO_KRIVULJA }).finished.then(konecPojava, konecPojava);
      oknoFokus(o);
      return;
    }
    var kl = oknoKljuci(o, OKNO_ODPRI, false);
    var duh = oknoDuh(o);
    kartica.classList.add('okno-vir');   // kartica se spremeni v okno: njeno mesto se izprazni takoj
    // Okno (s senco) raste iz kartice; kopija kartice nad njim izgine; vsebina se pretopi.
    panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 70, easing: 'linear' });
    duh.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 130, delay: 30, easing: 'ease', fill: 'forwards' });
    notr.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: 70, easing: 'ease', fill: 'backwards' });
    notr.animate(kl.notr, { duration: OKNO_RAST_MS, easing: 'linear' });
    var konecRasti = function () { duh.remove(); o.morf = false; o.visina = panel.offsetHeight; back.classList.add('okno-cel'); oknoVidno(); };   // odprto: telefon — polno ozadje (Safari po njem pobarva pasova); tipkovnica, odprta med rastjo
    oknoRobovi(panel, true, OKNO_RAST_MS);
    panel.animate(kl.okno, { duration: OKNO_RAST_MS, easing: 'linear' }).finished.then(konecRasti, konecRasti);
    oknoFokus(o);
  }
  // ── Okno in tipkovnica ──
  // iOS ob vpisu v polje premakne celo stran (tudi zaklenjeno), pritrjeno okno pa pusti na starem mestu: okno zdrsne
  // navzgor (glava izgine), vrstica z gumbi obvisi sredi zaslona, pod oknom se skozi prosojno tipkovnico vidi Domov.
  // Puščici nad tipkovnico skočita le na vidna polja, zato sta preskočili vrstico pod vrstico z gumbi. Okno zato, dokler
  // je tipkovnica odprta, pokrije natanko vidni del nad njo; polje z vnosom in sosednji vrstici ostanejo nad vrstico z gumbi.
  // iPhone polje ob dotiku postavi na sredino vidnega dela in stran premakne z lastno animacijo, ki ji okno ne more slediti
  // (poskoči in zdrsne nazaj). Zato polje na sredino postavimo sami, že ob dotiku: iOS potem nima česa premikati.
  var _tipkH = {};   // izmerjene višine tipkovnic po vrsti (številčnica, števila, črke)
  try { _tipkH = JSON.parse(localStorage.getItem('sc-tipk') || '{}') || {}; } catch (e) { _tipkH = {}; }
  var _dotikT = 0;   // puščici nad tipkovnico nista dotik strani
  document.addEventListener('touchstart', function () { _dotikT = Date.now(); }, { passive: true, capture: true });
  function oknoTipkPolje(el) { return !!(el && el.matches && el.matches('input:not([type]),input[type=text],input[type=number],input[type=email],input[type=tel],input[type=search],input[type=password],input[type=url],textarea')); }
  function oknoTipkVrsta(el) {
    if (el.tagName === 'TEXTAREA') return 'crke';
    if (/^(numeric|decimal|tel)$/.test(el.inputMode || '') || el.type === 'tel') return 'stevilcnica';
    return el.type === 'number' ? 'stevila' : 'crke';
  }
  function oknoTipk(o, y, h) {
    o.back.classList.add('okno-tipk');
    o.back.style.setProperty('--tipk-y', Math.round(y) + 'px');
    o.back.style.setProperty('--tipk-h', Math.round(h) + 'px');
    o.tipkVis = Math.round(h);
    o.visina = o.panel.offsetHeight;
  }
  function oknoTipkKonec(o) {
    clearTimeout(o.tipkZapUra);
    if (!o.back.classList.contains('okno-tipk')) return;
    o.back.classList.remove('okno-tipk');
    ['--tipk-y', '--tipk-h', '--tipk-rob'].forEach(function (p) { o.back.style.removeProperty(p); });
    o.tipkVis = 0; o.rob = 0;
    o.visina = o.panel.offsetHeight;
    oknoStranNazaj(o);
  }
  // Stran pod oknom je iOS med vnosom morda premaknil (pod oknom se ne vidi): nazaj, kjer je bila ob odprtju.
  function oknoStranNazaj(o) { if (o.sy != null && Math.abs(window.scrollY - o.sy) > 1) window.scrollTo(0, o.sy); }
  function oknoVidno() {
    var o = _okno, vv = window.visualViewport; if (!o || !vv || o.zapiram || o.morf) return;
    var akt = document.activeElement, vnos = oknoTipkPolje(akt) && o.panel.contains(akt);
    var tipk = o.back.classList.contains('okno-tipk');
    o.vvPoln = vnos ? Math.max(o.vvPoln || 0, vv.height) : vv.height;
    if (!(vnos && vv.height < o.vvPoln - 100)) {
      if (o.tipkNapoved) return;
      if (vnos && tipk) {
        // ob prehodu na drugo polje (puščici) iOS za hip javi, da tipkovnice ni: okno ostane, sledi le premiku
        o.back.style.setProperty('--tipk-y', Math.round(vv.offsetTop) + 'px');
        clearTimeout(o.tipkZapUra);
        o.tipkZapUra = setTimeout(function () {
          var v = window.visualViewport;
          if (_okno === o && !o.zapiram && v && v.height >= o.vvPoln - 100) oknoTipkKonec(o);
        }, 350);
        return;
      }
      oknoTipkKonec(o); return;
    }
    var bilo = tipk && !o.tipkNapoved ? o.tipkVis : 0;
    o.tipkNapoved = false; clearTimeout(o.tipkUra); clearTimeout(o.tipkZapUra);
    var h = Math.round(o.vvPoln - vv.height), vrsta = oknoTipkVrsta(akt);
    if (_tipkH[vrsta] !== h) { _tipkH[vrsta] = h; try { localStorage.setItem('sc-tipk', JSON.stringify(_tipkH)); } catch (e) {} }
    oknoTipk(o, vv.offsetTop, vv.height);
    if (Math.abs(bilo - o.tipkVis) > 1) oknoPokaziPolje(akt);   // le ob spremembi višine — ne med uporabnikovim drsenjem
  }
  // Polje z vnosom na sredino vidnega dela. Zadnjim poljem doda prostor nad vrstico z gumbi, da pridejo do sredine.
  function oknoNaSredino(o, el, gladko) {
    var telo = o.telo; if (!telo.contains(el)) return;
    var b = o.back.getBoundingClientRect(), r = el.getBoundingClientRect();
    var vis = el.tagName === 'TEXTAREA' ? Math.min(r.height, 44) : r.height;   // večvrstično polje: šteje prva vrstica (kazalček)
    var d = Math.round(r.top + vis / 2 - (b.top + (o.tipkVis || b.height) / 2));
    var pros = telo.scrollHeight - telo.clientHeight - telo.scrollTop;
    if (d > pros) { o.rob = (o.rob || 0) + Math.ceil(d - pros); o.back.style.setProperty('--tipk-rob', o.rob + 'px'); }
    if (Math.abs(d) < 1) return;
    if (gladko && !manjGibanja()) { oknoDrsi(telo, telo.scrollTop + d); return; }
    telo._drsi = null; telo.scrollTop += d;
  }
  // Gladek premik seznama (puščici nad tipkovnico); brskalnikov gladki pomik iOS ob menjavi polja prekine.
  function oknoDrsi(telo, cilj) {
    var od = telo.scrollTop, t0 = performance.now(), dotik = _dotikT, tok = telo._drsi = {};
    (function korak(t) {
      if (telo._drsi !== tok || _dotikT !== dotik) return;   // nov premik ali prst na zaslonu: ustavi se
      var p = Math.min(1, Math.max(0, (t - t0) / 320));
      telo.scrollTop = od + (cilj - od) * OKNO_ODPRI(p);
      if (p < 1) requestAnimationFrame(korak); else telo._drsi = null;
    })(t0);
  }
  // Polje z vnosom naj bo vidno nad vrstico z gumbi, pri količinah tudi vrstici nad in pod njim.
  function oknoPokaziPolje(el) {
    var o = _okno; if (!o || !el || !o.telo.contains(el)) return;
    var telo = o.telo, vr = el.closest('.ur-post') || el, r = vr.getBoundingClientRect(), t = telo.getBoundingClientRect();
    var vrh = t.top + 8, dno = t.bottom, bar = telo.querySelector('.u-acts.nl-akc');
    if (bar && bar.offsetParent && !bar.contains(el)) dno = Math.min(dno, bar.getBoundingClientRect().top);
    dno -= 8;
    var sos = function (x) { return x && x.classList && x.classList.contains('ur-post') ? x : null; };
    var nas = vr !== el ? sos(vr.nextElementSibling) : null, pre = vr !== el ? sos(vr.previousElementSibling) : null;
    var spodaj = nas ? nas.getBoundingClientRect().bottom : r.bottom, zgoraj = pre ? pre.getBoundingClientRect().top : r.top, d = 0;
    if (spodaj > dno) d = spodaj - dno; else if (zgoraj < vrh) d = zgoraj - vrh;
    if (r.top - d < vrh) d = r.top - vrh;   // vrstica z vnosom ima prednost pred sosednjima
    if (r.bottom - d > dno) d = r.bottom - dno;
    if (Math.abs(d) >= 1) telo.scrollTop += d;
  }
  document.addEventListener('focusin', function (e) {
    var o = _okno, el = e.target, vv = window.visualViewport;
    if (!o || o.zapiram || o.morf || !o.panel.contains(el) || !oknoTipkPolje(el)) return;
    clearTimeout(o.tipkZapUra);
    var tipk = o.back.classList.contains('okno-tipk');
    // telefon: okno se skrči že ob dotiku, na pričakovano višino tipkovnice, polje gre na sredino — iOS strani ne premakne
    if (vv && !tipk && Date.now() - _dotikT < 1500 && matchMedia('(max-width:560px) and (pointer:coarse)').matches) {   // brez dotika iOS tipkovnice ne odpre
      var h = _tipkH[oknoTipkVrsta(el)] || _tipkH.stevilcnica || _tipkH.crke || _tipkH.stevila || Math.round(vv.height * 0.46);
      if (vv.height - h > 200) {
        o.tipkNapoved = true; oknoTipk(o, vv.offsetTop, vv.height - h);
        clearTimeout(o.tipkUra); o.tipkUra = setTimeout(function () { o.tipkNapoved = false; oknoVidno(); }, 2000);   // tipkovnice ni (zunanja): nazaj
        oknoNaSredino(o, el, false);
        return;
      }
    }
    if (tipk) oknoNaSredino(o, el, Date.now() - _dotikT > 700);   // puščici: gladko; dotik: takoj, preden polje premakne iOS
    else oknoPokaziPolje(el);
  });
  if (window.visualViewport) { window.visualViewport.addEventListener('resize', oknoVidno); window.visualViewport.addEventListener('scroll', oknoVidno); }
  // Fokus na okno samo (bralnik zaslona prebere naslov okna, Tab gre na prvi gumb v njem).
  // Prej je bil na gumbu × — Safari je ob odprtju okoli njega izrisal debel obroč.
  function oknoFokus(o) { try { o.panel.focus({ preventScroll: true }); } catch (e) {} }
  function oknoTipka(e) {
    if (e.key !== 'Escape' || !_okno) return;
    // Najprej naj se zapre tisto, kar je odprto NAD oknom (potrditev, predogled, spustni meni).
    if (document.querySelector('.sc-modal-back, .dok-lb, .cs-open')) return;
    e.preventDefault(); oknoKoncaj();
  }
  // Okno z obrazcem (moznosti.varuj = naslov vprašanja): odtis je stanje polj ob zadnjem shranjenem izrisu, null = obrazec se še nalaga.
  function oknoOdtis(o) {
    var d = [].map.call(o.vsebina.querySelectorAll('input:not([type="hidden"]),select,textarea'), function (f) { return f.type === 'checkbox' || f.type === 'radio' ? f.checked : f.value; });
    [].forEach.call(o.vsebina.querySelectorAll('.seg-b.on'), function (b) { d.push(b.textContent); });
    return d.join('\u0001');
  }
  function oknoNeshranjeno(o) { return !!(o && o.varuj && o.odtis != null && oknoOdtis(o) !== o.odtis); }
  // Obrazec je pravkar izrisan ali shranjen: to je novo izhodišče. Če je shranjevanje sprožilo vprašanje ob zapiranju, se okno zdaj zapre.
  function oknoZapomni(vsebina, nalaga) {
    var o = _okno; if (!o || o.vsebina !== vsebina || !o.varuj) return;
    o.odtis = nalaga ? null : oknoOdtis(o);
    if (!nalaga && o.poShranitvi) { o.poShranitvi = false; setTimeout(function () { if (_okno === o) oknoZapri(); }); }
  }
  function oknoVprasaj(o) {
    return new Promise(function (resolve) {
      var back = document.createElement('div'); back.className = 'sc-modal-back';
      back.innerHTML = '<div class="sc-modal okno-vpr" role="dialog" aria-modal="true"><h4></h4><div class="sc-modal-acts">' +
        '<button type="button" class="sc-modal-btn ghost nevarno" data-v="zavrzi">Zavrzi</button><button type="button" class="sc-modal-btn ghost" data-v="">Nadaljuj</button><button type="button" class="sc-modal-btn primary" data-v="shrani">Shrani</button></div></div>';
      back.querySelector('h4').textContent = o.varuj;
      document.body.appendChild(back);
      _modalA11y(back);
      requestAnimationFrame(function () { back.classList.add('show'); });
      var done = false;
      function zapri(v) {
        if (done) return; done = true; back.classList.remove('show'); document.removeEventListener('keydown', onKey, true);
        setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); _modalVrniFokus(); resolve(v);
      }
      function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); zapri(''); } }
      document.addEventListener('keydown', onKey, true);
      back.addEventListener('click', function (e) { if (e.target === back) zapri(''); });
      back.querySelectorAll('[data-v]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); zapri(b.dataset.v); }); });
      back.querySelector('[data-v="shrani"]').focus({ preventScroll: true });
    });
  }
  // Zapiranje, ki ga sproži uporabnik (mimo okna, ×, Esc, Nazaj, Prekliči). kon = kaj namesto zapiranja okna (npr. nazaj na podrobnosti).
  async function oknoKoncaj(kon) {
    var o = _okno; if (!o || o.zapiram || o.sprasujem) return;
    if (!oknoNeshranjeno(o)) { if (kon) kon(); else oknoZapri(); return; }
    if (o.vsebina.querySelector('button.nalaga,[data-pv-ustvari]:disabled')) return;   // shranjevanje že teče
    o.sprasujem = true;
    if (o.back.classList.contains('okno-tipk')) { try { document.activeElement.blur(); } catch (e) {} await new Promise(function (ok) { setTimeout(ok, 380); }); }
    var izbira = await oknoVprasaj(o);
    o.sprasujem = false;
    if (_okno !== o) return;
    if (izbira === 'zavrzi') { o.odtis = null; if (kon) kon(); else { if (o.zavrzi) o.zavrzi(); oknoZapri(); } return; }
    if (izbira !== 'shrani') return;
    var g = [].filter.call(o.vsebina.querySelectorAll('[data-pv-ustvari],[data-shrani],[data-opomba-shrani]'), function (b) { return b.offsetParent; })[0];
    if (g) { o.poShranitvi = true; g.click(); }
  }
  function oknoZapri(takoj) {
    var o = _okno; if (!o || o.zapiram) return;
    o.zapiram = true;
    var tipk = o.back.classList.contains('okno-tipk');
    clearTimeout(o.tipkUra);
    if (tipk) { try { document.activeElement.blur(); } catch (e) {} }
    o.back.classList.remove('okno-cel');
    document.removeEventListener('keydown', oknoTipka, true);
    if (o.ro) o.ro.disconnect();
    var k = (o.najdi && o.najdi()) || null;   // po ponovnem izrisu je kartica nov element
    var konec = function () {
      if (o.koncano) return; o.koncano = true;
      if (tipk) oknoStranNazaj(o);
      o.back.remove();
      var v = o.vsebina;
      v.classList.remove('show'); if (o.dom.id) v.id = o.dom.id;
      // Vsebino vrni na njeno mesto; če je seznam medtem izrisan na novo, je stara odveč.
      if (o.dom.parent && o.dom.parent.isConnected) o.dom.parent.insertBefore(v, (o.dom.next && o.dom.next.parentNode === o.dom.parent) ? o.dom.next : null);
      else v.remove();
      if (!_okno || _okno === o) {
        document.querySelectorAll('.okno-vir').forEach(function (el) { el.classList.remove('okno-vir'); });
        document.documentElement.classList.remove('okno-zaklep');
        document.documentElement.style.paddingRight = '';
      } else if (o.kartica && o.kartica !== _okno.kartica) {
        // med zapiranjem je že odprto novo okno: pospravi le svoje, novega (izvor, zaklep strani) ne
        o.kartica.classList.remove('okno-vir');
      }
      if (_okno === o) _okno = null;
      if (k && !takoj) { try { k.focus({ preventScroll: true }); } catch (e) {} }
      if (o.obZaprtju) { try { o.obZaprtju(k); } catch (e) {} }
    };
    if (takoj || oknoMirno() || !o.panel.animate) { konec(); return; }
    o.back.classList.remove('show');
    if (o.pojav && !tipk) {   // okno iz gumba +: odide tako, kot je prišlo (izhod pogovornih oken portala)
      o.panel.getAnimations().forEach(function (a) { a.cancel(); });
      oknoRobovi(o.panel, false, 220);
      o.panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease', fill: 'forwards' });
      o.panel.animate([{ transform: 'none' }, { transform: 'translate3d(0,14px,0) scale(.965)' }], { duration: 220, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).finished.then(konec, konec);
      return;
    }
    if (!k || tipk) {   // kartice ni več (izbrisana, izpadla iz filtra) ali se zapira tipkovnica → okno samo izgine
      o.panel.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px) scale(.98)' }], { duration: 200, easing: 'ease', fill: 'forwards' }).finished.then(konec, konec);
      return;
    }
    if (o.kartica !== k) o.kartica.classList.remove('okno-vir');   // okno gre drugam (npr. gumb → kartica novega lista): izvor se vrne takoj
    o.kartica = k;
    k.classList.add('okno-vir');   // med krčenjem je mesto še prazno; kartica se vrne, ko je okno spet ona
    // Kartica mora biti na zaslonu, sicer bi se okno skrčilo nekam izven pogleda.
    var r = k.getBoundingClientRect(), tb = document.querySelector('.topbar'), vrh = tb ? tb.offsetHeight : 0;
    if (r.bottom < vrh || r.top > window.innerHeight) { try { k.scrollIntoView({ block: 'center' }); } catch (e) {} }
    // Morebitna še tekoča rast ali sprememba višine: izhodišče mora biti mirujoče okno.
    o.panel.getAnimations().forEach(function (a) { a.cancel(); });
    o.notr.getAnimations().forEach(function (a) { a.cancel(); });
    var kl = oknoKljuci(o, OKNO_ZAPRI, true);
    var duh = oknoDuh(o);
    o.notr.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, easing: 'ease', fill: 'forwards' });
    o.notr.animate(kl.notr, { duration: OKNO_KRCENJE_MS, easing: 'linear', fill: 'forwards' });
    duh.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 130, delay: 60, easing: 'ease', fill: 'both' });
    o.panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, delay: 130, easing: 'linear', fill: 'forwards' });   // senca okna ugasne, ko je okno že kartica
    oknoRobovi(o.panel, false, OKNO_KRCENJE_MS);
    o.panel.animate(kl.okno, { duration: OKNO_KRCENJE_MS, easing: 'linear', fill: 'forwards' }).finished.then(konec, konec);
  }
  // Seznam pod oknom je bil izrisan na novo (shranjevanje, brisanje, osvežitev):
  // poveži okno z novo kartico ali ga zapri, če kartice ni več.
  function oknoPoIzrisu() {
    var o = _okno; if (!o || o.zapiram) return;
    var k = o.najdi && o.najdi();
    if (!k) { if (!oknoNeshranjeno(o)) oknoZapri(); return; }   // neshranjeno urejanje ne izgine zaradi osvežitve seznama
    if (k !== o.kartica) { o.kartica = k; if (!o.morf) k.classList.add('okno-vir'); }
    if (o.osvezi) { var nova = o.osvezi(k); if (nova && nova !== o.vsebina) oknoZamenjajVsebino(nova); }
    if ('_kartica' in o.vsebina) o.vsebina._kartica = k;
    oknoGlava();
  }
  // Seznam je izrisan na novo in ima svežo vsebino za odprto okno: zamenjaj jo v oknu.
  // Stara vsebina je odveč; ob zaprtju se nova vrne na mesto v novem izrisu.
  function oknoZamenjajVsebino(nova) {
    var o = _okno; if (!o) return;
    if (o.ro) o.ro.unobserve(o.vsebina);
    o.vsebina.remove();
    o.dom = { parent: nova.parentNode, next: nova.nextSibling, id: nova.id };
    nova.removeAttribute('id'); nova.classList.add('show');
    o.telo.appendChild(nova); o.vsebina = nova;
    if (o.ro) o.ro.observe(nova);
  }

  /* ══════════ ARHIV ══════════ */
  // mera: 'kg' / 'cena' — ob razvrščanju po teži ali vrednosti kartica pokaže še to vrednost.
  // Naslov dneva nad spremnimi listi: »Danes, 21. oktober«, »Včeraj, …«, »Torek, 14. oktober« (leto le, če ni letošnje).
  function danNaslov(iso) {
    var s = String(iso || '').slice(0, 10); if (!s) return '—';
    var d = new Date(s + 'T12:00:00'), z = new Date(); z.setHours(12, 0, 0, 0);
    var razlika = Math.round((z - d) / 864e5);
    var dm = d.toLocaleDateString('sl-SI', { day: 'numeric', month: 'long' }) + (d.getFullYear() !== z.getFullYear() ? ' ' + d.getFullYear() : '');
    if (razlika === 0) return 'Danes, ' + dm;
    if (razlika === 1) return 'Včeraj, ' + dm;
    var dan = d.toLocaleDateString('sl-SI', { weekday: 'long' });
    return dan.charAt(0).toUpperCase() + dan.slice(1) + ', ' + dm;
  }
  // poDnevih: listi so razvrščeni po datumu → nad vsakim dnem naslov dneva (datum ni več na kartici)
  function tabelaListov(vrstice, klikljivo, mera, poDnevih) {
    if (!vrstice.length) return LISTI_NAPAKA ? napakaListi : prazniListi(OSEBJE ? 'osebje' : 'stranka');
    var _zadnjiDan = null;
    return '<div class="rows' + (poDnevih ? ' po-dnevih' : '') + '">' + vrstice.map((l, i) => {
      var _dan = String(l.doc_date || '').slice(0, 10), _glava = '';
      if (poDnevih && _dan !== _zadnjiDan) { _glava = '<div class="a-dan" role="heading" aria-level="3">' + escape_(danNaslov(_dan)) + '</div>'; _zadnjiDan = _dan; }
      let mer = '';
      if (mera === 'kg') mer = '<span class="num a-mer">' + (l.weight_kg != null ? tezaFmt(l.weight_kg) : '—') + '</span>';
      else if (mera === 'cena') {
        const v = arhVrednost(l);
        mer = '<span class="num a-mer" title="' + (v == null ? 'vrednost še ni izračunana' : 'vrednost po ceniku brez DDV' + (v.brez ? ' · ' + v.brez + ' postavk brez cene ni všteto' : '')) + '">' + (v == null ? '—' : cenaFmt(v.neto) + (v.brez ? '*' : '')) + '</span>';
      }
      const prazno = !(l.total_pieces > 0);
      const legacy = STAR_SET.has(l.id);   // vsebuje star zapis (postavka brez povezave na artikel)
      const pot = l.potrjeno === true;
      const stat = prazno ? 'red' : (pot ? 'green' : 'yellow');
      const zaklep = prazno || legacy;                 // ni mogoče potrditi
      const clk = OSEBJE && !zaklep;
      const chkTitle = legacy ? 'star zapis (postavka brez artikla) — ni mogoče potrditi' : (prazno ? 'prazen list — ni mogoče potrditi' : (pot ? 'potrjeno — klikni za preklic' : 'klikni za potrditev (urejeno)'));
      const chk = '<span class="arh-chk' + (pot ? ' on' : '') + (clk ? ' clk' : ' dis') + (legacy && !prazno ? ' leg' : '') + '"' + (clk ? ' data-pot="' + l.id + '" role="button" tabindex="0"' : '') + ' title="' + chkTitle + '">' + (pot ? IKO_KLJUKICA : (legacy && !prazno ? IKO_ZGOD : '')) + '</span>';
      // krožec za izbiro več listov (viden le v načinu »Izberi«, na mestu kljukice)
      const izbran = klikljivo && ARH_IZB && ARH_IZB.has(l.id);
      return _glava + `<div class="lcell arh-${stat}${izbran ? ' izbran' : ''}">
    <button class="a-row" type="button" data-i="${i}" data-id="${l.id}" style="${naslovnica(BARVE_STANJA[stat], l.id)}" aria-expanded="false"${klikljivo && ARH_IZB ? ' aria-pressed="' + (izbran ? 'true' : 'false') + '"' : ''}
      ${klikljivo ? '' : 'style="cursor:default"'}>
      ${klikljivo ? '<span class="a-sel" aria-hidden="true"></span>' : ''}${chk}<span class="a-num">${escape_(l.number || '—')}${OSEBJE && l.popravljeno_at ? '<span class="a-pop" title="Popravljeno v aplikaciji' + (l.popravil ? ' · ' + escape_(l.popravil) : '') + '">' + IKO_T_SVINC + '</span>' : ''}</span>
      <span class="a-cli">${escape_(OSEBJE ? ORGIME[l.org_id] || '—' : l.issued_name || '')}${l.transport === 'izredni' ? '<span class="a-izr" title="Izredni prevoz">Izredni</span>' : ''}</span>
      <span class="a-foot${mer ? ' z-mero' : ''}"><span class="num a-date">${datum(l.doc_date)}</span>${OSEBJE && l.issued_name ? '<span class="a-izdal" title="Izdelal spremni list">' + escape_(l.issued_name) + '</span>' : ''}<span class="num a-qty">${stevilo(l.total_pieces)} kos</span>${mer}</span>
      <span class="chev" aria-hidden="true">${klikljivo ? '›' : ''}</span>
    </button>
    <div class="a-det" id="det${i}"></div></div>`;
    }).join('') + '</div>';
  }
  // ── Prekrivanja (offline urejanje na tablici) ──────────────────────────
  var KONFLIKTI = [];
  async function naloziKonflikte() {
    if (!OSEBJE) { KONFLIKTI = []; return; }
    try {
      var r = await sb.from('delivery_note_conflicts').select('*').order('created_at', { ascending: true });
      KONFLIKTI = (r && !r.error && r.data) ? r.data : [];
    } catch (e) { KONFLIKTI = []; }
  }
  function risiKonflikti() {
    var box = $('arhivKonflikti'); if (!box) return;
    if (!OSEBJE || !KONFLIKTI.length) { box.innerHTML = ''; box.className = ''; box.removeAttribute('data-open'); return; }
    var open = box.dataset.open === '1';
    box.className = 'konf-card';
    box.innerHTML = '<div class="konf-head"><span class="konf-warn">' + IKO_T_POZOR + KONFLIKTI.length + ' ' + (KONFLIKTI.length === 1 ? 'prekrivanje' : 'prekrivanj') + ' · urejeno na tablici brez povezave</span><button type="button" class="btn-mini konf-toggle">' + (open ? 'Skrij' : 'Reši') + '</button></div>' +
      (open ? '<div class="konf-list">' + KONFLIKTI.map(risiEnKonflikt).join('') + '</div>' : '');
    box.querySelector('.konf-toggle').addEventListener('click', function () { box.dataset.open = open ? '0' : '1'; risiKonflikti(); });
    if (open) box.querySelectorAll('[data-keep]').forEach(function (b) { b.addEventListener('click', function () { resiKonflikt(b.dataset.id, b.dataset.keep); }); });
  }
  function risiEnKonflikt(k) {
    var post = Array.isArray(k.postavke) ? k.postavke : [];
    var tItems = post.length ? post.map(function (p) { return '<li><span>' + escape_(p.naziv) + '</span><b>' + stevilo(p.kosov) + '</b></li>'; }).join('') : '<li class="u-sub">brez postavk</li>';
    var pn = (LISTI || []).find(function (l) { return l.id === k.note_id; });
    var ime = k.org_name || (pn ? (ORGIME[pn.org_id] || '') : '');
    return '<div class="konf-row"><div class="konf-title">' + escape_(k.number || '—') + ' · ' + escape_(ime) + '</div><div class="konf-cols">' +
      '<div class="konf-col"><div class="konf-h">Portal (trenutno)</div>' + (pn ? ('<div class="u-sub">' + stevilo(pn.total_pieces) + ' kos · ' + (pn.weight_kg != null ? tezaFmt(pn.weight_kg) : '—') + ' · ' + (pn.transport === 'izredni' ? 'izredni' : 'redni') + '</div>') : '<div class="u-sub">list ni najden</div>') + '<button type="button" class="btn-mini konf-keep" data-keep="portal" data-id="' + escape_(String(k.id)) + '">Obdrži portal</button></div>' +
      '<div class="konf-col"><div class="konf-h">Tablica' + (k.popravil ? ' · ' + escape_(k.popravil) : '') + '</div><ul class="konf-items">' + tItems + '</ul><div class="u-sub">teža ' + (k.weight_kg != null ? tezaFmt(k.weight_kg) : '—') + ' · ' + (k.transport === 'izredni' ? 'izredni' : 'redni') + '</div>' + (k.popravki ? '<div class="konf-log">' + escape_(k.popravki).replace(/\n/g, '<br>') + '</div>' : '') + '<button type="button" class="btn-mini primary konf-keep" data-keep="tablica" data-id="' + escape_(String(k.id)) + '">Obdrži tablico</button></div>' +
      '</div></div>';
  }
  async function resiKonflikt(id, keep) {
    var k = KONFLIKTI.find(function (x) { return String(x.id) === String(id); }); if (!k) return;
    var ok = await potrdiModal({ naslov: keep === 'tablica' ? 'Obdrži tablično verzijo' : 'Obdrži portalno verzijo', sporocilo: keep === 'tablica' ? ('Spremni list ' + (k.number || '') + ' se prepiše z verzijo s tablice. Nadaljujem?') : ('Obdržim trenutno portalno verzijo in zavržem tablično. Nadaljujem?'), potrdi: 'Potrdi', preklici: 'Prekliči' });
    if (!ok) return;
    try {
      if (keep === 'tablica' && k.note_id) {
        var patch = { weight_kg: k.weight_kg, transport: (k.transport === 'izredni' ? 'izredni' : 'redni'), issued_name: k.issued_name, popravil: k.popravil, popravljeno_at: new Date().toISOString(), popravki: k.popravki || null };
        var items = (Array.isArray(k.postavke) ? k.postavke : []).filter(function (p) { return p && p.naziv; }).map(function (p, i) { return { article_name: String(p.naziv), pieces: Number(p.kosov) || 0, sort_order: i }; });
        var e1 = (await sb.rpc('app_shrani_list', { p_id: k.note_id, p_list: patch, p_postavke: items, p_tudi_potrjen: true })).error; if (e1) throw e1;
        delete _POST_CACHE[k.note_id];   // osveži predpomnjene postavke tega lista
        pozabiPostavke(k.note_id);
        logDodaj('Arhiv', 'Urejeno', 'Prekrivanje rešeno (tablica) · ' + (k.number || ''));
      } else {
        logDodaj('Arhiv', 'Urejeno', 'Prekrivanje rešeno (portal) · ' + (k.number || ''));
      }
      await sb.from('delivery_note_conflicts').delete().eq('id', k.id);
      toast('Prekrivanje rešeno.');
      await naloziListe(); await naloziKonflikte(); risiArhiv();
    } catch (e) { toast(napakaBesedilo(e)); }
  }
  // ── Razvrščanje po vrednosti (Arhiv → »Cena«) ──
  // Vrednost lista = vsota (cena po ceniku × kosov) brez DDV, izračunana enako kot v Fakturah:
  // postavka → artikel (article_id, sicer ime pri stranki) → šifra cenika → cena1.
  // Cene vidi le, kdor sme v Fakture. Postavke se berejo v _POST_CACHE (isti kot ob odpiranju lista),
  // zato po urejanju lista (pozabiPostavke) vrednost tistega lista samodejno izračunamo znova.
  var _arhArtMap = null, _arhCeneP = null, _arhCeneNapaka = false;
  function arhSmeCene() { return sme('fakture'); }
  function arhSortMoznosti() {
    var s = $('arhivSort'); if (!s) return;
    var ima = !!s.querySelector('option[value="cena_desc"]'), sme_ = arhSmeCene();
    if (sme_ && !ima) {
      [['cena_desc', 'Cena ↓'], ['cena_asc', 'Cena ↑']].forEach(function (o) {
        var e = document.createElement('option'); e.value = o[0]; e.textContent = o[1]; s.appendChild(e);
      });
    } else if (!sme_ && ima) {
      if (/^cena_/.test(s.value)) s.value = 'st_desc';
      s.querySelectorAll('option[value^="cena_"]').forEach(function (e) { e.remove(); });
    }
  }
  function arhCenePripravljene(listi) { return !!(_arhArtMap && CENIKMAP) && listi.every(function (l) { return _POST_CACHE[l.id]; }); }
  function arhVrednost(l) {
    var p = _POST_CACHE[l.id]; if (!p || !_arhArtMap || !CENIKMAP) return null;
    var neto = 0, brez = 0;
    p.forEach(function (it) {
      var byId = (it.artId && _arhArtMap.__byId) ? _arhArtMap.__byId[it.artId] : null;
      var sif = (byId && byId.sifra != null) ? byId.sifra : _arhArtMap[l.org_id + '|' + String(it.naziv || '').trim().toLowerCase()];
      var c = cenaZaArtikel(sif);
      if (c != null) neto += c * (it.kosov || 0); else if (it.kosov) brez++;
    });
    return { neto: Math.round(neto * 100) / 100, brez: brez };
  }
  // Naloži cenik, povezave artikel → cenik in postavke listov, ki jih še ni v predpomnilniku.
  function arhCeneNalozi(listi) {
    if (_arhCeneP) return _arhCeneP;
    _arhCeneP = (async function () {
      try {
        var c = await nalozicenik(); if (!c || !c.ok) throw new Error('cenik');
        if (!_arhArtMap) _arhArtMap = await naloziArtMap(null);
        var ids = listi.map(function (l) { return l.id; }).filter(function (id) { return id && !_POST_CACHE[id]; });
        if (ids.length) {
          var zs = postStanje(ids), izb = 'id,note_id,article_name,article_id,pieces,sort_order';
          // Malo listov → samo njihove postavke; sicer vse naenkrat (seznam ID-jev v naslovu bi bil predolg).
          var r = await vseVrstice(function (a, b) {
            var q = sb.from('delivery_note_items').select(izb);
            if (ids.length <= 60) q = q.in('note_id', ids);
            return q.order('note_id', { ascending: true }).order('sort_order', { ascending: true }).order('id', { ascending: true }).range(a, b);
          });
          if (r.error) throw r.error;
          var by = {};
          (r.data || []).forEach(function (it) { (by[it.note_id] = by[it.note_id] || []).push({ naziv: it.article_name, kosov: it.pieces, artId: it.article_id }); });
          ids.forEach(function (id) { if (!_POST_CACHE[id] && postVelja(zs, id)) _POST_CACHE[id] = by[id] || []; });
        }
        _arhCeneNapaka = false;
        return true;
      } catch (e) {
        _arhCeneNapaka = true;
        return false;
      } finally { _arhCeneP = null; }
    })();
    return _arhCeneP;
  }
  var ARH_NA_STRAN = 60, _arhStran = 0, _arhKljuc = null;
  // Številčenje strani: ‹ 1 … 4 5 6 … 15 ›  ·  61–120 od 852
  function arhStraniHtml(n, zac, vseh) {
    if (n <= 1) return '';
    var cur = _arhStran, b = [], prej = -1;
    b.push('<button type="button" class="arh-str arh-str-nav" data-str="' + (cur - 1) + '"' + (cur === 0 ? ' disabled' : '') + ' aria-label="Prejšnja stran">‹</button>');
    for (var i = 0; i < n; i++) {
      if (!(i === 0 || i === n - 1 || Math.abs(i - cur) <= 1)) continue;
      if (i - prej > 1) b.push('<span class="arh-str-tri" aria-hidden="true">…</span>');
      b.push('<button type="button" class="arh-str' + (i === cur ? ' on' : '') + '" data-str="' + i + '"' + (i === cur ? ' aria-current="page"' : '') + ' aria-label="Stran ' + (i + 1) + '">' + (i + 1) + '</button>');
      prej = i;
    }
    b.push('<button type="button" class="arh-str arh-str-nav" data-str="' + (cur + 1) + '"' + (cur >= n - 1 ? ' disabled' : '') + ' aria-label="Naslednja stran">›</button>');
    return '<nav class="arh-strani" aria-label="Strani arhiva"><div class="arh-str-gumbi">' + b.join('') + '</div>' +
      '<span class="arh-str-info">' + stevilo(zac + 1) + '–' + stevilo(Math.min(zac + ARH_NA_STRAN, vseh)) + ' od ' + stevilo(vseh) + '</span></nav>';
  }
  function risiArhiv() {
    arhSortMoznosti();
    if (OSEBJE) {
      const sel = $('arhivOrg');
      sel.classList.remove('hidden');
      const _ab = $('arhivActBar'); if (_ab) _ab.classList.remove('hidden');
      const _kp = $('arhivKosPov'); if (_kp) _kp.classList.remove('hidden');   // »Nedavno brisani« pod seznamom (samo osebje)
      if (!sel.options.length) {
        sel.innerHTML = '<option value="">Vse stranke</option>' + ORGSEZNAM.map(o => `<option value="${o.id}">${escape_(o.name)}</option>`).join('');
        sel.addEventListener('change', risiArhiv);
      }
    }
    const q = $('arhivIsci').value.trim().toLowerCase();
    const org = OSEBJE ? $('arhivOrg').value : '';
    // obdobje od–do (posamičen dan = od == do); prazno = vse
    let _od = ($('arhivOd') && $('arhivOd').value) || '';
    let _do = ($('arhivDo') && $('arhivDo').value) || '';
    if (_od && _do && _od > _do) { const _t = _od; _od = _do; _do = _t; }
    { const xb = $('arhivObdX'); if (xb) xb.classList.toggle('hidden', !(_od || _do)); }
    const vDan = d => { const s = String(d || '').slice(0, 10); return (!_od || s >= _od) && (!_do || s <= _do); };
    const vrstice = LISTI.filter(l => (!org || l.org_id === org) && vDan(l.doc_date) && (!ARH_NEPOTRJENI || jeZaPotrditev(l)) && (!q || (l.number || '').toLowerCase().includes(q) || (ORGIME[l.org_id] || '').toLowerCase().includes(q)));
    const sortv = ($('arhivSort') && $('arhivSort').value) || 'st_desc';
    const imeStr = l => (OSEBJE ? (ORGIME[l.org_id] || '') : (l.issued_name || ''));
    const stK = l => { const d = String(l.number || '').split('/'); return (parseInt(d[1], 10) || 0) * 1e7 + (parseInt(d[0], 10) || 0); };
    // Po teži / vrednosti: listi brez podatka gredo na konec v obeh smereh, enaki po številki (novejši prej).
    const poMeri = (mera, smer) => vrstice.sort((a, b) => {
      const x = mera(a), y = mera(b);
      if (x == null || y == null) return (x == null) - (y == null) || stK(b) - stK(a);
      return (x - y) * smer || stK(b) - stK(a);
    });
    const kgM = l => (l.weight_kg != null && !isNaN(parseFloat(l.weight_kg))) ? parseFloat(l.weight_kg) : null;
    const cenaM = l => { const v = arhVrednost(l); return v ? v.neto : null; };
    const poCeni = sortv === 'cena_desc' || sortv === 'cena_asc';
    const ceneManjkajo = poCeni && !arhCenePripravljene(vrstice);
    const dK = l => String(l.doc_date || '').slice(0, 10);
    const poDnevih = !poCeni && (sortv === 'st_asc' || sortv === 'st_desc' || sortv === 'datum');
    if (sortv === 'st_asc') vrstice.sort((a, b) => dK(a).localeCompare(dK(b)) || stK(a) - stK(b));
    else if (sortv === 'st_desc' || sortv === 'datum') vrstice.sort((a, b) => dK(b).localeCompare(dK(a)) || stK(b) - stK(a));
    else if (ceneManjkajo) vrstice.sort((a, b) => stK(b) - stK(a));
    else if (sortv === 'stranka_az') vrstice.sort((a, b) => imeStr(a).localeCompare(imeStr(b), 'sl', { sensitivity: 'base' }));
    else if (sortv === 'stranka_za') vrstice.sort((a, b) => imeStr(b).localeCompare(imeStr(a), 'sl', { sensitivity: 'base' }));
    else if (sortv === 'kg_desc') poMeri(kgM, -1);
    else if (sortv === 'kg_asc') poMeri(kgM, 1);
    else if (sortv === 'cena_desc') poMeri(cenaM, -1);
    else if (sortv === 'cena_asc') poMeri(cenaM, 1);
    $('arhivPod').textContent = LISTI.length ? vrstice.length + ' od ' + stevilo(VSEHLISTOV) + ' spremnih listov' + (ceneManjkajo ? (_arhCeneNapaka ? ' · vrednosti ni bilo mogoče izračunati' : ' · računam vrednosti …') : '') : 'v bazi še ni spremnih listov';
    // ── strani: največ ARH_NA_STRAN listov naenkrat (prej vsi na eni strani — pri tisočih počasno).
    // Iskanje, filtri in razvrščanje veljajo za CEL arhiv; ob njihovi spremembi nazaj na 1. stran.
    const kljucF = [q, org, _od, _do, sortv, ARH_NEPOTRJENI].join('|');
    arhFilterOznaka(vrstice.length);
    if (kljucF !== _arhKljuc) { _arhKljuc = kljucF; _arhStran = 0; }
    const nStrani = Math.max(1, Math.ceil(vrstice.length / ARH_NA_STRAN));
    if (_arhStran > nStrani - 1) _arhStran = nStrani - 1;
    if (_arhStran < 0) _arhStran = 0;
    const zac = _arhStran * ARH_NA_STRAN, stran = vrstice.slice(zac, zac + ARH_NA_STRAN);
    ARH_VIDNI = stran;   // »Izberi vse« = listi na tej strani
    if (ARH_IZB) { const _obst = new Set(LISTI.map(l => l.id)); ARH_IZB.forEach(id => { if (!_obst.has(id)) ARH_IZB.delete(id); }); }   // medtem izbrisani
    if (!vrstice.length && LISTI.length && !LISTI_NAPAKA && ARH_NEPOTRJENI && !q && !org && !_od && !_do) {
      $('arhivList').innerHTML = '<div class="rows"><div class="empty"><h3>Vse je potrjeno</h3><button type="button" class="btn btn-narrow btn-alt" data-pocisti>Pokaži vse liste</button></div></div>';
      $('arhivList').querySelector('[data-pocisti]').addEventListener('click', () => { ARH_NEPOTRJENI = false; risiArhiv(); });
    } else if (!vrstice.length && LISTI.length && !LISTI_NAPAKA) {
      // iskanje/filtri ne najdejo ničesar (prej: »Spremnih listov še ni« — zavajajoče)
      $('arhivList').innerHTML = '<div class="rows"><div class="empty"><h3>Ni zadetkov</h3><button type="button" class="btn btn-narrow btn-alt" data-pocisti>Počisti filtre</button></div></div>';
      $('arhivList').querySelector('[data-pocisti]').addEventListener('click', () => {
        ['arhivIsci', 'arhivOd', 'arhivDo'].forEach(i => { const e = $(i); if (e) e.value = ''; });
        const o = $('arhivOrg'); if (o) { o.value = ''; o.dispatchEvent(new Event('change')); }
        ARH_NEPOTRJENI = false; risiArhiv();
      });
    } else
    $('arhivList').innerHTML = tabelaListov(stran, true, (sortv === 'kg_desc' || sortv === 'kg_asc') ? 'kg' : (poCeni && !ceneManjkajo ? 'cena' : null), poDnevih) + arhStraniHtml(nStrani, zac, vrstice.length);
    $('arhivList').querySelectorAll('[data-str]').forEach(b => b.addEventListener('click', () => {
      _arhStran = parseInt(b.dataset.str, 10) || 0; risiArhiv();
      const l = $('arhivList'); if (l) try { l.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
    }));
    if (ceneManjkajo && !_arhCeneNapaka) arhCeneNalozi(vrstice).then(ok => { if (ok && /^cena_/.test(($('arhivSort') || {}).value || '')) risiArhiv(); });
    $('arhivList').classList.toggle('izbira', !!ARH_IZB);
    prednaloziPostavke(stran);   // v ozadju pripravi postavke → prvo razpiranje je takoj gladko
    naloziKonflikte().then(risiKonflikti);
    document.querySelectorAll('#arhivList .a-row').forEach(b => {
      b.addEventListener('click', () => { if (ARH_IZB) arhIzbiraPreklopi(b); else odpriList(b); });
    });
    document.querySelectorAll('#arhivList .arh-chk.clk').forEach(c => {
      c.addEventListener('click', e => { if (ARH_IZB) return; e.stopPropagation(); potrdiList(c); });
      c.addEventListener('keydown', e => { if (ARH_IZB) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); potrdiList(c); } });
    });
    arhIzbiraRisi();
    oknoPoIzrisu();
  }
  function arhFilterOznaka(n) {
    var el = $('arhivFiltOzn');
    if (!el) { el = document.createElement('div'); el.id = 'arhivFiltOzn'; el.className = 'arh-ozn-vrsta'; $('arhivList').parentNode.insertBefore(el, $('arhivList')); }
    if (!ARH_NEPOTRJENI) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = '<button type="button" class="arh-ozn" title="Prikaži vse liste">Samo nepotrjeni · ' + stevilo(n) + IKO_ZAPRI + '</button>';
    el.firstChild.addEventListener('click', function () { ARH_NEPOTRJENI = false; risiArhiv(); });
  }
  // stanje kartice takoj ob dotiku: razred in barva naslovnice (CSS jo zvezno prelije, @property --c1/--c2)
  function arhStanjeKartice(lcell, potrjen) {
    if (!lcell) return;
    var stat = potrjen ? 'green' : 'yellow', b = BARVE_STANJA[stat], r = lcell.querySelector('.a-row');
    lcell.classList.remove('arh-green', 'arh-yellow'); lcell.classList.add('arh-' + stat);
    if (r && b) { r.style.setProperty('--c1', b[0]); r.style.setProperty('--c2', b[1]); }
  }
  async function potrdiList(chk) {
    const id = chk.dataset.pot; if (!id) return;
    const naVkljuceno = !chk.classList.contains('on');
    chk.classList.toggle('on', naVkljuceno);
    chk.innerHTML = naVkljuceno ? IKO_KLJUKICA : '';
    const lcell = chk.closest('.lcell');
    arhStanjeKartice(lcell, naVkljuceno);
    chk.title = naVkljuceno ? 'potrjeno — klikni za preklic' : 'klikni za potrditev (urejeno)';
    const rec0 = (LISTI || []).find(x => x.id === id); if (rec0) rec0.potrjeno = naVkljuceno;   // osvežitev med čakanjem ne vrne stare barve
    const { error } = await sb.from('delivery_notes').update({ potrjeno: naVkljuceno }).eq('id', id);
    if (error) { toast(napakaBesedilo(error)); if (rec0) rec0.potrjeno = !naVkljuceno; chk.classList.toggle('on', !naVkljuceno); chk.innerHTML = !naVkljuceno ? IKO_KLJUKICA : ''; arhStanjeKartice(lcell, !naVkljuceno); return; }
    const rec = (LISTI || []).find(x => x.id === id); if (rec) rec.potrjeno = naVkljuceno;
    toast(naVkljuceno ? 'Potrjeno kot urejeno.' : 'Potrditev preklicana.');
  }
  // ── Izbira več spremnih listov (kot »Izberi« na iPhonu) → skupen tisk ──
  // Gumb »Izberi« v orodni vrstici: dotik kartice jo izbere (namesto da jo odpre), spodaj se
  // pokaže vrstica s številom izbranih, »Izberi vse« (vidne po filtru) in »Natisni«.
  // Izbira ostane ob menjavi filtrov; izhod: »Prekliči«, Esc ali drug razdelek.
  var ARH_IZB = null, ARH_VIDNI = [], _arhBar = null;
  // Filter »Samo nepotrjeni« (vklopi ga pasica na Domov); viden kot oznaka z × nad seznamom.
  var ARH_NEPOTRJENI = false;
  function jeZaPotrditev(l) { return (l.total_pieces > 0) && l.potrjeno !== true && !STAR_SET.has(l.id); }
  // Gumb »Izberi«: kljukica + Izberi; med izbiranjem × + Prekliči.
  function arhIzbiraGumb(vkljuceno) {
    var b = $('arhivIzberiBtn'); if (!b) return;
    b.innerHTML = vkljuceno ? IKO_X + '<span class="tb-lbl">Prekliči</span>' : IKO_KLJUKICA + '<span class="tb-lbl">Izberi</span>';
    b.setAttribute('aria-label', vkljuceno ? 'Prekliči izbiro' : 'Izberi več spremnih listov');
    b.setAttribute('aria-pressed', vkljuceno ? 'true' : 'false');
    b.classList.toggle('on', !!vkljuceno);
  }
  function arhIzbiraZacni() {
    if (_okno) oknoZapri(true);
    ARH_IZB = new Set();
    arhIzbiraGumb(true);
    arhIzbiraBar().classList.add('show');
    risiArhiv();
  }
  function arhIzbiraKonec() {
    if (!ARH_IZB) return;
    ARH_IZB = null;
    arhIzbiraGumb(false);
    if (_arhBar) _arhBar.classList.remove('show');
    var l = $('arhivList');
    if (l) {
      l.classList.remove('izbira');
      l.querySelectorAll('.lcell.izbran').forEach(c => c.classList.remove('izbran'));
      l.querySelectorAll('.a-row[aria-pressed]').forEach(r => r.removeAttribute('aria-pressed'));
    }
  }
  function arhIzbiraBar() {
    if (_arhBar) return _arhBar;
    var d = document.createElement('div');
    d.className = 'arh-izbira'; d.setAttribute('role', 'toolbar'); d.setAttribute('aria-label', 'Izbrani spremni listi');
    d.innerHTML = '<span class="arh-izb-n" aria-live="polite"></span>' +
      '<button type="button" class="btn btn-narrow btn-alt" data-vse>Izberi vse</button>' +
      (OSEBJE ? '<button type="button" class="btn btn-narrow btn-alt arh-potrdi" data-potrdi title="Potrdi izbrane">' + IKO_KLJUKICA + '<span>Potrdi</span></button>' : '') +
      '<button type="button" class="btn btn-narrow arh-tisk" data-tisk title="Natisni izbrane" aria-label="Natisni izbrane">' + IKO_TISK + '<span class="arh-tisk-n"></span></button>';
    document.body.appendChild(d);
    d.querySelector('[data-vse]').addEventListener('click', function () {
      if (!ARH_IZB) return;
      var vsi = ARH_VIDNI.length && ARH_VIDNI.every(l => ARH_IZB.has(l.id));
      ARH_VIDNI.forEach(l => { if (vsi) ARH_IZB.delete(l.id); else ARH_IZB.add(l.id); });
      document.querySelectorAll('#arhivList .a-row').forEach(r => {
        var on = ARH_IZB.has(r.dataset.id);
        r.closest('.lcell').classList.toggle('izbran', on); r.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      arhIzbiraRisi();
    });
    d.querySelector('[data-tisk]').addEventListener('click', arhIzbiraNatisni);
    var bp = d.querySelector('[data-potrdi]'); if (bp) bp.addEventListener('click', arhIzbiraPotrdi);
    _arhBar = d;
    return d;
  }
  function arhIzbiraRisi() {
    if (!ARH_IZB || !_arhBar) return;
    var n = ARH_IZB.size, vsi = ARH_VIDNI.length && ARH_VIDNI.every(l => ARH_IZB.has(l.id));
    _arhBar.querySelector('.arh-izb-n').textContent = n ? 'Izbrano: ' + sklonListov(n) : 'Izberi spremne liste';
    var bv = _arhBar.querySelector('[data-vse]'); bv.textContent = vsi ? 'Počisti' : 'Izberi vse'; bv.disabled = !ARH_VIDNI.length;
    var bp = _arhBar.querySelector('[data-potrdi]');
    if (bp && !bp._tece) { var np = LISTI.filter(l => ARH_IZB.has(l.id) && jeZaPotrditev(l)).length; bp.disabled = !np; bp.querySelector('span').textContent = np ? 'Potrdi ' + np : 'Potrdi'; }
    var bt = _arhBar.querySelector('[data-tisk]'); if (!bt._tece) { bt.disabled = !n; bt.querySelector('.arh-tisk-n').textContent = n ? String(n) : ''; }
  }
  function arhIzbiraPreklopi(btn) {
    var id = btn.dataset.id; if (!id || !ARH_IZB) return;
    if (ARH_IZB.has(id)) ARH_IZB.delete(id); else ARH_IZB.add(id);
    var on = ARH_IZB.has(id);
    btn.closest('.lcell').classList.toggle('izbran', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    arhIzbiraRisi();
  }
  // Potrdi vse izbrane, ki jih je mogoče potrditi (ne prazni, ne stari zapisi) — en klic v bazo.
  async function arhIzbiraPotrdi() {
    if (!ARH_IZB) return;
    var bp = _arhBar.querySelector('[data-potrdi]');
    var ids = LISTI.filter(l => ARH_IZB.has(l.id) && jeZaPotrditev(l)).map(l => l.id);
    if (!ids.length) return;
    bp._tece = true; bp.disabled = true; bp.classList.add('nalaga');
    // kartice se prebarvajo takoj (prehod), seznam se izriše znova šele, ko je prehod končan
    var celice = ids.map(function (id) { var a = document.querySelector('#arhivList .a-row[data-id="' + id + '"]'); return a && a.closest('.lcell'); });
    celice.forEach(function (c) { arhStanjeKartice(c, true); });
    var _zac = Date.now();
    try {
      var r = await sb.from('delivery_notes').update({ potrjeno: true }).in('id', ids);
      if (r.error) { celice.forEach(function (c) { arhStanjeKartice(c, false); }); toast('Potrjevanje ni uspelo. Poskusi znova.'); console.warn(r.error); return; }
      LISTI.forEach(l => { if (ids.indexOf(l.id) >= 0) l.potrjeno = true; });
      ids.forEach(id => ARH_IZB.delete(id));
      logDodaj('Arhiv', 'Potrjeno', sklonListov(ids.length));
      toast('Potrjeno: ' + sklonListov(ids.length) + '.');
    } finally {
      bp._tece = false; bp.classList.remove('nalaga');
      setTimeout(risiArhiv, Math.max(0, 650 - (Date.now() - _zac)));
    }
  }
  // Izbrani listi v enem dokumentu (vsak na svoji strani A4), po številki naraščajoče.
  async function arhIzbiraNatisni() {
    if (!ARH_IZB || !ARH_IZB.size) return;
    var bt = _arhBar.querySelector('[data-tisk]');
    bt._tece = true; bt.disabled = true; bt.classList.add('nalaga');   // ikona ostane, gumb utripa
    try {
      var stK = l => { var d = String(l.number || '').split('/'); return (parseInt(d[1], 10) || 0) * 1e7 + (parseInt(d[0], 10) || 0); };
      var listi = LISTI.filter(l => ARH_IZB.has(l.id)).sort((a, b) => stK(a) - stK(b));
      if (!listi.length) { toast('Izbrani spremni listi niso več v arhivu.'); return; }
      await arhPostavke(listi.map(l => l.id));
      var boxi = listi.map(l => ({ _note: l, _items: _POST_CACHE[l.id] || [] }));
      var en = boxi.length === 1, naslov = en ? 'Spremni list ' + (listi[0].number || '') : sklonListov(boxi.length);
      predogledDokument({ naslov: naslov, docHtml: dokHtml(en ? naslov : 'Spremni listi', boxi.map(spremniTeloHtml)), pdf: function () { return spremniPdfDownload(boxi); } });
    } catch (e) { toast(napakaBesedilo(e)); }
    finally { bt._tece = false; bt.classList.remove('nalaga'); arhIzbiraRisi(); }
  }
  // Postavke več listov naenkrat (predpomnilnik ima le prvih 80 iz seznama).
  async function arhPostavke(ids, poskus) {
    var manjka = ids.filter(id => !_POST_CACHE[id]);
    for (var i = 0; i < manjka.length; i += 100) {
      var del = manjka.slice(i, i + 100), z = postStanje(del);
      var r = await vseVrstice(function (a, b) {
        return sb.from('delivery_note_items').select('note_id,article_name,article_id,pieces,sort_order').in('note_id', del).order('note_id', { ascending: true }).order('sort_order', { ascending: true }).range(a, b);
      });
      if (r.error) throw r.error;
      var by = {}; (r.data || []).forEach(it => { (by[it.note_id] = by[it.note_id] || []).push({ naziv: it.article_name, kosov: it.pieces, artId: it.article_id }); });
      del.forEach(id => { if (postVelja(z, id) || (poskus || 0) >= 2) _POST_CACHE[id] = by[id] || []; });   // tretjič: kar je v bazi zdaj (izpis nikoli prazen)
    }
    // med branjem spremenjeni listi (natisne se, kar je zdaj v bazi): še enkrat
    if ((poskus || 0) < 2 && ids.some(id => !_POST_CACHE[id])) return arhPostavke(ids, (poskus || 0) + 1);
  }
  { const ib = $('arhivIzberiBtn'); if (ib) ib.addEventListener('click', () => { if (ARH_IZB) arhIzbiraKonec(); else arhIzbiraZacni(); }); }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && ARH_IZB && !document.querySelector('.sc-modal-back, .okno-back')) arhIzbiraKonec(); });
  $('arhivIsci').addEventListener('input', risiArhiv);
  { const ss = $('arhivSort'); if (ss) ss.addEventListener('change', () => {
    // Ob vsaki izbiri »Cena« sveže povezave artikel → cenik (medtem so jih morda uredili v Strankah).
    if (/^cena_/.test(ss.value)) { _arhArtMap = null; _arhCeneNapaka = false; }
    risiArhiv();
  }); }
  { const od = $('arhivOd'); if (od) od.addEventListener('change', risiArhiv); }
  { const dd = $('arhivDo'); if (dd) dd.addEventListener('change', risiArhiv); }
  { const xb = $('arhivObdX'); if (xb) xb.addEventListener('click', () => { const a = $('arhivOd'), b = $('arhivDo'); if (a) a.value = ''; if (b) b.value = ''; risiArhiv(); }); }
  { const _nb = $('arhivNovBtn'); if (_nb) _nb.addEventListener('click', () => novList()); }
  // Domov: isti nov spremni list — odpre se v Spremnih listih (okno zraste iz tamkajšnjega gumba, nov list se pokaže v seznamu)
  { const _db = $('domovNovBtn'); if (_db) _db.addEventListener('click', () => novList(_db)); }
  { const _bl = $('arhivBrezBtn'); if (_bl) _bl.addEventListener('click', () => manjkaOdpri()); }
  { const _kb = $('arhivKosBtn'); if (_kb) _kb.addEventListener('click', () => arhivKos()); }
  // ── Koš spremnih listov (Nedavno brisani — obnovljivi) ──
  async function arhivKos() {
    arhIzbiraKonec();
    var box = $('arhivList'); if (!box) return;
    { var _kp = $('arhivKosPov'); if (_kp) _kp.classList.add('hidden'); }   // v košu povezava ni potrebna (vrne jo risiArhiv)
    box.innerHTML = NALAGANJE;
    var mejnik = new Date(Date.now() - 30 * 864e5).toISOString();
    var r = await sb.from('delivery_notes').select('id,number,doc_date,org_id,weight_kg,total_pieces,deleted_at')
      .not('deleted_at', 'is', null).gte('deleted_at', mejnik).order('deleted_at', { ascending: false });
    var arr = (r && !r.error) ? (r.data || []) : [];
    var html = '<div class="cgrp-bar"><button type="button" class="cgrp-btn ghost" id="kosNazajArhiv">' + IKO_T_NAZAJ + 'Nazaj na arhiv</button></div>' +
      '<h3 class="sec-h" style="margin:6px 0 10px">Nedavno brisani spremni listi</h3>';
    if (r && r.error) html += '<div class="msg bad show">Napaka: ' + escape_(r.error.message) + '</div>';
    else if (!arr.length) html += '<div class="empty"><h3>Koš je prazen</h3></div>';
    else html += '<div class="cenik">' + arr.map(function (l) {
      return '<div class="cenik-row"><div class="cenik-nm">' + escape_(l.number || '—') + ' · ' + escape_(ORGIME[l.org_id] || '—') + '</div>' +
        '<div class="cenik-meta">' + datum(l.doc_date) + ' · ' + stevilo(l.total_pieces || 0) + ' kos' + (l.weight_kg != null && l.weight_kg !== '' ? ' · ' + tezaFmt(l.weight_kg) : '') + ' · izbrisan ' + datumcas(l.deleted_at) + '</div>' +
        '<div class="cenik-cena"><button type="button" class="btn-mini cenik-restore" data-obnovi="' + l.id + '">Obnovi</button> ' +
        '<button type="button" class="btn-mini danger" data-dokoncno="' + l.id + '" title="Izbriši dokončno">Izbriši dokončno</button></div></div>';
    }).join('') + '</div>';
    box.innerHTML = html;
    var nz = document.getElementById('kosNazajArhiv'); if (nz) nz.addEventListener('click', function () { risiArhiv(); });
    box.querySelectorAll('[data-obnovi]').forEach(function (bn) { bn.addEventListener('click', function () { spremniObnovi(bn.dataset.obnovi); }); });
    box.querySelectorAll('[data-dokoncno]').forEach(function (bn) { bn.addEventListener('click', function () { spremniIzbrisiDokoncno(bn.dataset.dokoncno); }); });
  }
  // Številka lista v košu je prosta (61_stevilke_kos.sql). Če jo je medtem dobil drug list,
  // obnova ponudi naslednjo prosto številko, namesto napake »duplicate key«.
  async function spremniObnovi(id, vArhiv) {
    var r = await sb.from('delivery_notes').update({ deleted_at: null }).eq('id', id);
    if (r.error && /duplicate|unique/i.test(r.error.message || '')) {
      var st = (await sb.from('delivery_notes').select('doc_year,doc_seq').eq('id', id).maybeSingle()).data;
      var nx = st ? await sb.rpc('app_prosta_stevilka', { p_leto: st.doc_year }) : null;
      var nova = nx && !nx.error ? nx.data : null;
      if (!st || !nova) { toast('Številko tega lista ima medtem drug spremni list.'); return; }
      var ok = await potrdiModal({ naslov: 'Številka je zasedena', sporocilo: 'Številko ' + st.doc_seq + '/' + st.doc_year + ' ima medtem drug spremni list. Obnovim ta list s številko ' + nova + '/' + st.doc_year + '?', potrdi: 'Obnovi kot ' + nova + '/' + st.doc_year, preklici: 'Prekliči' });
      if (!ok) return;
      r = await sb.from('delivery_notes').update({ deleted_at: null, doc_seq: nova }).eq('id', id);
    }
    if (r.error) { toast(napakaBesedilo(r.error)); return; }
    logDodaj('Arhiv', 'Obnovljeno', 'Spremni list obnovljen iz koša');
    toast('Spremni list obnovljen'); await naloziListe(); if (vArhiv) risiArhiv(); else arhivKos();
  }
  async function spremniIzbrisiDokoncno(id) {
    var ok = await potrdiModal({ naslov: 'Izbriši dokončno', sporocilo: 'Dokončno izbrišem ta spremni list? Tega ni mogoče razveljaviti.', potrdi: 'Izbriši dokončno', preklici: 'Prekliči', nevarno: true });
    if (!ok) return;
    try {
      var r2 = await sb.from('delivery_notes').delete().eq('id', id); if (r2.error) throw r2.error;   // postavke izbriše baza (ON DELETE CASCADE)
      delete _POST_CACHE[id];
      pozabiPostavke(id);
      logDodaj('Arhiv', 'Izbrisano dokončno', 'Spremni list dokončno izbrisan iz koša');
      toast('Dokončno izbrisano'); arhivKos();
    } catch (e) { toast(napakaBesedilo(e)); }
  }
  // Predpomnilnik postavk (za takojšnje, gladko razpiranje kartic — brez skoka).
  var _POST_CACHE = {};
  // Postavke spremnega lista so predpomnjene. Po VSAKI spremembi je treba vnos
  // pozabiti, sicer se ob ponovnem odprtju lista prikažejo stare količine,
  // čeprav je shranjevanje uspelo. Brez argumenta počisti vse.
  // Branje, ki se je začelo pred pozabo (sprememba v živo, shranjevanje), se ne zapiše v predpomnilnik — sicer bi
  // počasnejše staro branje vrnilo stare količine (postStanje ob začetku, postVelja ob koncu).
  var _POST_GEN = 0, _POST_ZAB = {};
  function pozabiPostavke(id) {
    if (id) { delete _POST_CACHE[id]; delete _POST_NALAGA[id]; _POST_ZAB[id] = (_POST_ZAB[id] || 0) + 1; }
    else { _POST_CACHE = {}; _POST_NALAGA = {}; _POST_GEN++; }
  }
  function postStanje(ids) { var z = { g: _POST_GEN, n: {} }; ids.forEach(function (id) { z.n[id] = _POST_ZAB[id] || 0; }); return z; }
  function postVelja(z, id) { return z.g === _POST_GEN && (_POST_ZAB[id] || 0) === z.n[id]; }
  var _POST_NALAGA = {};   // listi, katerih postavke se ravno nalagajo (dva klica ob zagonu)
  async function prednaloziPostavke(listi) {
    var ids = (listi || []).map(function (l) { return l.id; }).filter(function (id) { return id && !_POST_CACHE[id] && !_POST_NALAGA[id]; }).slice(0, 80);
    if (!ids.length) return;
    var tok = {}, z = postStanje(ids);
    ids.forEach(function (id) { _POST_NALAGA[id] = tok; });
    try {
      // Stranično (brez meje 1000): pri 80 listih bi vsota postavk lahko presegla privzeto mejo in bi kateri list dobil nepopolne postavke.
      var r = await vseVrstice(function (a, b) {
        return sb.from('delivery_note_items').select('note_id,article_name,article_id,pieces,sort_order').in('note_id', ids).order('note_id', { ascending: true }).order('sort_order', { ascending: true }).range(a, b);
      });
      if (r && !r.error) {
        var by = {}; (r.data || []).forEach(function (it) { (by[it.note_id] = by[it.note_id] || []).push({ naziv: it.article_name, kosov: it.pieces, artId: it.article_id }); });
        ids.forEach(function (id) { if (postVelja(z, id)) _POST_CACHE[id] = by[id] || []; });
      }
    } catch (e) {}
    finally { ids.forEach(function (id) { if (_POST_NALAGA[id] === tok) delete _POST_NALAGA[id]; }); }
  }
  // Postavke lista v okvir: iz predpomnilnika (takoj) ali z enim poizvedovanjem.
  async function naloziDetajl(box, id) {
    box._id = id;
    box._note = LISTI.find(l => l.id === id) || {};
    if (!_POST_CACHE[id]) {
      const z = postStanje([id]);
      const { data, error } = await sb.from('delivery_note_items').select('article_name,article_id,pieces,sort_order').eq('note_id', id).order('sort_order');
      if (error) { box.innerHTML = '<div class="a-det-in"><div class="a-det-pad"><p class="u-sub">Napaka: ' + escape_(error.message) + '</p></div></div>'; return; }
      const post = (data || []).map(p => ({ naziv: p.article_name, kosov: p.pieces, artId: p.article_id }));
      if (postVelja(z, id)) _POST_CACHE[id] = post;
      box._items = post;
    } else box._items = _POST_CACHE[id];
    risiListDetajl(box);
    box.dataset.loaded = '1';
  }
  // Spremni list se odpre v OKNU (prej se je razprl v mreži). Vsebina se naloži
  // PRED odprtjem, da okno zraste naravnost v pravo višino.
  async function odpriList(btn) {
    if (_okno || btn._nalagam) return;
    const box = btn.nextElementSibling && btn.nextElementSibling.classList.contains('a-det') ? btn.nextElementSibling : $('det' + btn.dataset.i);
    const id = btn.dataset.id;
    if (!box.dataset.loaded) {
      btn._nalagam = true; btn.classList.add('nalaga');
      try { await naloziDetajl(box, id); }
      catch (e) { box.innerHTML = '<div class="a-det-in"><div class="a-det-pad"><p class="u-sub">Napaka pri nalaganju.</p></div></div>'; }
      btn._nalagam = false; btn.classList.remove('nalaga');
      if (!btn.isConnected || _okno) return;   // vmes izrisano na novo ali že odprto
    }
    const kont = btn.closest('#zadnji') ? '#zadnji' : '#arhivList';   // tudi zadnji listi na Domov
    oknoOdpri(btn, box, () => document.querySelector(kont + ' .a-row[data-id="' + String(id).replace(/"/g, '\\"') + '"]'), { varuj: 'Shranim spremembe?', zavrzi: () => risiListDetajl(box) });
  }

  // Po shranjevanju se arhiv izriše na novo in razprta kartica se ob tem zapre.
  // Stran je doslej obstala na isti točkovni višini, kjer je bila po ponovnem
  // izrisu že povsem druga vsebina — videti je bilo, kot da nas je vrglo nekam
  // nižje. Zato shranjeni list poiščemo, ga razpremo in pripeljemo nazaj predse.
  async function pokaziList(id) {
    if (!id) return;
    const row = document.querySelector('#arhivList .a-row[data-id="' + String(id).replace(/"/g, '\\"') + '"]');
    if (!row) {
      // Po spremembi datuma ali stranke je list lahko padel iz trenutnega filtra.
      const l = $('arhivList'); if (l) try { l.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
      return;
    }
    // Urejeni list: okno ostane odprto in pokaže shranjeno stanje.
    const vOknu = !!(_okno && _okno.id === String(id));
    if (vOknu) { try { await naloziDetajl(_okno.vsebina, String(id)); } catch (e) {} }
    // Merimo in poudarimo VRSTICO, ne ovojnice .lcell — ta je v seznamskem pogledu
    // display:contents in nima okvirja, zato bi bile njene mere same ničle.
    // Kartica naj bo na sredini zaslona: pri novem listu jo vidiš takoj, pri urejenem
    // pa se okno ob zaprtju vrne vanjo na pravem mestu.
    try {
      const tb = document.querySelector('.topbar');
      const odmik = (tb ? tb.offsetHeight : 0) + 14;          // lepljiva glava (na telefonu) ne sme prekriti vrstice
      const visina = row.offsetHeight;
      const prostor = window.innerHeight - odmik;
      let vrh = row.getBoundingClientRect().top + window.pageYOffset - odmik;
      if (visina > 0 && visina < prostor) vrh -= (prostor - visina) / 2;
      window.scrollTo({ top: Math.max(0, vrh), behavior: vOknu ? 'auto' : 'smooth' });
    } catch (e) { try { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e2) {} }
    if (vOknu) return;
    row.classList.add('arh-flash');
    setTimeout(function () { row.classList.remove('arh-flash'); }, 1700);
  }

  /* prikaz postavk + (samo osebje) gumbi Uredi / Izbriši */
  function risiListDetajl(box) {
    const items = box._items || [];
    const n = box._note || {};
    const seznam = items.length ? '<ul>' + items.map(p => `<li><span title="${escape_(p.naziv)}">${escape_(p.naziv)}</span><b>${stevilo(p.kosov)}</b></li>`).join('') + '</ul>' : '<p class="u-sub">Ta spremni list nima postavk.</p>';
    const prevozV = `<span class="prevoz-znak ${n.transport === 'izredni' ? 'izr' : 'red'}">${n.transport === 'izredni' ? 'Izredni prevoz' : 'Redni prevoz'}</span>`;
    const izdalV = `<p class="u-sub" style="margin-top:8px">${prevozV}${n.issued_name ? ' · Izdal: ' + escape_(n.issued_name) : ''}</p>`;
    const popravek = OSEBJE && n.popravljeno_at ? `<div class="ur-popravek">${IKO_T_SVINC}Popravljeno · ${escape_(n.popravil || 'osebje')} · ${datumcas(n.popravljeno_at)}${n.popravki ? '<div class="ur-popravki">' + escape_(n.popravki).replace(/\n/g, '<br>') + '</div>' : ''}</div>` : '';
    const ustvarjenoV = n.source === 'portal' ? `<p class="ur-ustvarjeno">${IKO_T_PLUS}Ustvarjeno v portalu${n.issued_name ? ' · ' + escape_(n.issued_name) : ''}</p>` : '';
    const gumbi = '<div class="u-acts a-ikone"><button type="button" data-natisni title="Natisni" aria-label="Natisni">' + IKO_TISK + '</button>' +
      (OSEBJE ? '<button type="button" data-uredi title="Uredi" aria-label="Uredi">' + IKO_UREDI + '</button><button type="button" class="danger" data-izbrisi title="Izbriši" aria-label="Izbriši">' + IKO_KOS + '</button>' : '') + '</div>';
    box.innerHTML = '<div class="a-det-in"><div class="a-det-pad">' + seznam + izdalV + ustvarjenoV + popravek + opombeAppHtml(n) + opombaHtml(n) + gumbi + '</div></div>';
    box.querySelector('[data-natisni]').addEventListener('click', () => natisniList(box));
    if (OSEBJE) {
      box.querySelector('[data-uredi]').addEventListener('click', () => urediList(box));
      box.querySelector('[data-izbrisi]').addEventListener('click', () => izbrisiList(box));
    }
    wireOpomba(box);
    oknoZapomni(box);
  }

  /* ── Opombi iz aplikacije (za stranko + za evidenco), samo prikaz ── */
  function opombeAppHtml(n) {
    n = n || {};
    var out = '';
    if (n.opomba_stranka) out += '<div class="opomba-blok"><div class="opomba-h">Opomba na spremnem listu</div>' +
      '<div class="opomba-prikaz"><div class="opomba-besedilo" style="white-space:pre-wrap">' + escape_(n.opomba_stranka) + '</div></div></div>';
    if (n.opomba_evidenca) out += '<div class="opomba-blok"><div class="opomba-h">Interna opomba</div>' +
      '<div class="opomba-prikaz"><div class="opomba-besedilo" style="white-space:pre-wrap">' + escape_(n.opomba_evidenca) + '</div></div></div>';
    return out;
  }

  /* ── Zapisek osebja na spremnem listu (z avtorjem) ── */
  function opombaHtml(n) {
    n = n || {};
    var obst = n.opomba ? '<div class="opomba-prikaz"><div class="opomba-besedilo">' + escape_(n.opomba) + '</div>' +
      '<div class="opomba-avtor">— ' + escape_(n.opomba_avtor || 'osebje') + (n.opomba_at ? ' · ' + datumcas(n.opomba_at) : '') + '</div></div>' : '';
    if (!OSEBJE) {
      return obst ? '<div class="opomba-blok"><div class="opomba-h">Zapisek</div>' + obst + '</div>' : '';
    }
    return '<div class="opomba-blok"><div class="opomba-h">Zapisek</div>' + obst +
      '<textarea class="opomba-vnos" data-opomba rows="2" maxlength="600" placeholder="Dodaj zapisek …">' + escape_(n.opomba || '') + '</textarea>' +
      '<div class="opomba-acts"><button type="button" class="opomba-save" data-opomba-shrani>' + (n.opomba ? 'Posodobi zapisek' : 'Shrani zapisek') + '</button>' +
      (n.opomba ? '<button type="button" class="opomba-remove" data-opomba-brisi>Odstrani zapisek</button>' : '') +
      '</div><div class="msg" data-opomba-msg role="status" aria-live="polite"></div></div>';
  }
  function wireOpomba(box) {
    if (!OSEBJE) return;
    var sh = box.querySelector('[data-opomba-shrani]');
    if (sh) sh.addEventListener('click', function () { shraniOpombo(box, false); });
    var br = box.querySelector('[data-opomba-brisi]');
    if (br) br.addEventListener('click', function () { shraniOpombo(box, true); });
  }
  async function shraniOpombo(box, izbrisi) {
    var ta = box.querySelector('[data-opomba]');
    var m = box.querySelector('[data-opomba-msg]');
    var txt = izbrisi ? '' : (ta ? ta.value.trim() : '');
    if (m) { m.className = 'msg show'; m.textContent = 'Shranjujem …'; }
    var novo = {
      opomba: txt || null,
      opomba_avtor: txt ? (JAZIME || 'osebje') : null,
      opomba_at: txt ? new Date().toISOString() : null
    };
    var r = await sb.from('delivery_notes').update(novo).eq('id', box._id);
    if (r && r.error) { if (m) { m.className = 'msg bad show'; m.textContent = napakaBesedilo(r.error); } return; }
    // Posodobi lokalno stanje in ponovno izriši detajl.
    Object.assign(box._note, novo);
    var li = LISTI.find(function (l) { return l.id === box._id; }); if (li) Object.assign(li, novo);
    logDodaj('Arhiv', izbrisi ? 'Zapisek odstranjen' : 'Zapisek', 'Spremni list ' + ((box._note && box._note.number) || '') + (txt ? ': »' + txt + '«' : ''));
    risiListDetajl(box);
  }

  function razcleniStevilko(s) {
    const d = String(s || '').split(/[\/\-]/).map(x => parseInt(x, 10)).filter(x => !isNaN(x));
    const letos = new Date().getFullYear();
    let seq, leto;
    if (d.length >= 2) {
      if (d[0] >= 2000 && d[1] < 2000) { leto = d[0]; seq = d[1]; } else { seq = d[0]; leto = d[1]; }
    } else { seq = d[0] || ''; leto = letos; }
    return { seq: seq || '', leto: leto || letos };
  }

  async function izbrisiList(box) {
    var _ok = await potrdiModal({ naslov: 'Izbriši spremni list', sporocilo: 'Izbrišem spremni list ' + (box._note.number || '') + '? Shrani se v »Nedavno brisani« in ga je mogoče 30 dni obnoviti.', potrdi: 'Izbriši', preklici: 'Prekliči', nevarno: true });
    if (!_ok) return;
    box.innerHTML = '<p class="u-sub">Brišem …</p>';
    try {
      if (_softDelDN) {
        // Soft-delete (koš): podatek OSTANE, samo skrit. Postavke pustimo (za obnovitev).
        var r = await sb.from('delivery_notes').update({ deleted_at: new Date().toISOString() }).eq('id', box._id);
        if (r.error) throw r.error;
      } else {
        // Rezerva, če migracija 50 (deleted_at) še ni zagnana → staro dokončno brisanje.
        var r2 = await sb.from('delivery_notes').delete().eq('id', box._id);   // postavke izbriše baza (ON DELETE CASCADE)
        if (r2.error) throw r2.error;
      }
      pozabiPostavke(box._id);
      logDodaj('Arhiv', 'Izbrisano', 'Spremni list ' + ((box._note && box._note.number) || '') + (_softDelDN ? ' (v koš)' : ''));
      { const _izbId = box._id; toast(_softDelDN ? 'Spremni list izbrisan' : 'Spremni list izbrisan', _softDelDN ? { besedilo: 'Razveljavi', ob: () => spremniObnovi(_izbId, true) } : null); }
      await naloziListe();
      risiArhiv();
    } catch (e) {
      box.innerHTML = '<p class="u-sub">Napaka pri brisanju: ' + escape_(e.message || e) + '</p>';
    }
  }

  // Naloži artikle stranke (id, naziv, koda) za spustni seznam postavk v Arhivu.
  async function nalozArtSez(box) {
    const os = box.querySelector('[data-org]');
    const org_id = os ? os.value : '';
    box._arts = [];
    box._artsOrg = org_id;        // za katero stranko je ta seznam
    box._artsNapaka = null;
    if (!org_id) return;
    await nalozicenik();
    try {
      let data;
      const _r = await sb.from('articles').select('id,name,cena_sifra,teza').eq('org_id', org_id).order('sort_order');
      if (_r.error) { data = (await sb.from('articles').select('id,name,cena_sifra').eq('org_id', org_id).order('sort_order')).data; }
      else data = _r.data;
      var vid = {};
      box._arts = [];
      (data || []).forEach(function (a) {
        if (a.cena_sifra != null) { if (vid[a.cena_sifra]) return; vid[a.cena_sifra] = true; } // brez podvojenih (isti artikel)
        box._arts.push({ id: a.id, name: a.name || '', koda: (a.cena_sifra != null && CENIKMAP && CENIKMAP[a.cena_sifra]) ? normId(CENIKMAP[a.cena_sifra].koda) : '', sifra: a.cena_sifra, teza: (a.teza != null && a.teza !== '') ? parseFloat(a.teza) : null });
      });
      // dodaj LASTNE artikle stranke (pricelist z org_id te stranke), ki še nimajo članstva
      (CENIK || []).forEach(function (x) {
        if (x.org_id === org_id && !vid[x.sifra]) { vid[x.sifra] = true; box._arts.push({ id: null, name: x.naziv || '', koda: normId(x.koda), sifra: x.sifra, teza: (x.teza != null && x.teza !== '') ? parseFloat(x.teza) : null }); }
      });
      // UPORABA PO STRANKI iz obstoječe evidence: skupno opranih kosov na artikel
      // (RPC stranka_kosi — isti podatek kot v razdelku Stranke). Uporabo uporabimo le
      // za FILTER (skrij artikle, ki jih stranka (skoraj) ne uporablja), VRSTNI RED pa
      // ostane enak kot v ceniku (sort_order) — ne po pogostosti.
      try {
        var kosMap = {};
        var _kr = await sb.rpc('stranka_kosi', { p_org: org_id });
        if (_kr && !_kr.error) (_kr.data || []).forEach(function (x) { kosMap[x.article_id] = Number(x.kosov) || 0; });
        box._arts.forEach(function (a, i) { a._u = (a.id && kosMap[a.id]) ? kosMap[a.id] : 0; a._i0 = i; });
        box._imaUporabo = box._arts.some(function (a) { return a._u > 0; });
        box._arts.sort(function (x2, y2) { return x2._i0 - y2._i0; });   // vrstni red kot v ceniku
      } catch (e2) { box._imaUporabo = false; }
    } catch (e) {
      // Prej se je napaka požrla in seznam je ostal prazen — videti je bilo, kot da
      // stranka nima artiklov. Zdaj razlog zabeležimo in ga tudi pokažemo.
      box._arts = [];
      box._artsNapaka = (e && e.message) || String(e);
      try { console.warn('[artikli] seznama za stranko ni bilo mogoče naložiti:', e); } catch (_) {}
    }
  }
  // Polje »Leto« je skrito — letnica je že v datumu — shranjevanje pa ga bere,
  // zato sledi datumu. Velja za nov list in za urejanje obstoječega.
  function letoIzDatuma(box) {
    const dIn = box.querySelector('[data-datum]');
    const lIn = box.querySelector('[data-leto]');
    if (!dIn || !lIn) return;
    const uskladi = function () {
      const l = (dIn.value || '').slice(0, 4);
      if (/^\d{4}$/.test(l)) lIn.value = l;
    };
    dIn.addEventListener('input', uskladi);
    dIn.addEventListener('change', uskladi);
  }

  // ── Glava lista pred postavkami (samo NOV list) ─────────────────────────
  // Pri NOVEM listu se stranka, datum in številka privzamejo (prazna, danes,
  // naslednja prosta) in jih je lahko spregledati. List, vpisan za nazaj, pod
  // napačno številko ali na napačno stranko, tiho pristane v napačnem
  // obračunskem obdobju ali pri napačnem naročniku — pri fakturah se to pokaže
  // šele, ko je račun že zunaj. Zato so postavke zaklenjene, dokler niso
  // potrjena vsa tri polja: sprememba vrednosti je potrditev sama po sebi,
  // sicer je tu kljukica. Letnica ostane vidna v kljukici pri številki.
  //
  // Pri UREJANJU teh vrat ni: vsa tri polja so bila zahtevana že ob nastanku
  // lista, zato bi bila ponovna potrditev ob vsakem popravku le napoto.
  function vnosVrata(box) {
    const pBox = box.querySelector('[data-postavke]');
    if (!pBox) return;
    const oIn = box.querySelector('[data-org]');
    const dIn = box.querySelector('[data-datum]');
    const sIn = box.querySelector('[data-seq]');
    const lIn = box.querySelector('[data-leto]');
    const dodaj = box.querySelector('[data-dodaj]');
    const dnes = danes10();   // lokalni datum (UTC bi med 0. in 2. uro vrnil včeraj)

    const vrata = document.createElement('div');
    vrata.className = 'ur-dv';
    vrata.innerHTML = '<span class="ur-dv-txt">Potrdi</span>'
      + '<span class="ur-dv-polja"></span>';
    pBox.parentNode.insertBefore(vrata, pBox);
    const polja = vrata.querySelector('.ur-dv-polja');

    letoIzDatuma(box);

    const kosi = [];
    const vsiOsvezi = function () { kosi.forEach(function (k) { k.osvezi(); }); };
    const potrdi = function (k) {
      if (!k.el.value || k.ok) return;
      k.ok = true;
      k.gumb.classList.add('on');
      k.gumb.setAttribute('aria-pressed', 'true');
      k.el.classList.remove('dv-treba');
      vsiOsvezi();
      if (kosi.every(function (x) { return x.ok; })) odkleni();
    };
    const odkleni = function () {
      box._glavaOk = true;
      vrata.remove();
      pBox.classList.remove('ur-zaklep');
      try { pBox.inert = false; } catch (_) {}
      if (dodaj) dodaj.disabled = false;
      kosi.forEach(function (k) { k.el.classList.remove('dv-treba'); });
      // takoj na prvo količino — vnos se nadaljuje brez dodatnega klika (kot v Excelu)
      setTimeout(function () {
        var p1 = pBox.querySelector('.ur-post input[data-pk]');
        if (p1) { try { p1.focus({ preventScroll: true }); p1.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {} }
      }, 60);
    };
    const kos = function (el, ime, besedilo) {
      if (!el) return;
      const gumb = document.createElement('button');
      gumb.type = 'button';
      gumb.className = 'ur-dv-ok';
      gumb.setAttribute('aria-pressed', 'false');
      polja.appendChild(gumb);
      const k = { el: el, gumb: gumb, ok: false };
      k.osvezi = function () {
        gumb.disabled = !el.value;
        gumb.innerHTML = '<span class="ur-dv-kljuk" aria-hidden="true">' + (k.ok ? IKO_KLJUKICA : '') + '</span>'
          + escape_(ime + ' ' + (el.value ? besedilo() : '—'));
      };
      k.osvezi();
      el.classList.add('dv-treba');
      gumb.addEventListener('click', function () { potrdi(k); });
      el.addEventListener('input', vsiOsvezi);
      el.addEventListener('change', function () { potrdi(k); vsiOsvezi(); });
      kosi.push(k);
    };

    box._glavaOk = false;
    pBox.classList.add('ur-zaklep');
    try { pBox.inert = true; } catch (_) {}
    if (dodaj) dodaj.disabled = true;

    kos(oIn, 'Stranka', function () { const o = oIn.options[oIn.selectedIndex]; return o ? o.textContent : ''; });
    kos(dIn, 'Datum', function () { return dIn.value === dnes ? datum(dIn.value) + ' · danes' : datum(dIn.value); });
    kos(sIn, 'Št.', function () { return sIn.value + (lIn && lIn.value ? '/' + lIn.value : ''); });
    if (!kosi.length) { vrata.remove(); odkleni(); }
  }
  async function urediList(box) {
    oknoZapomni(box, true);
    const n = box._note;
    const st = razcleniStevilko(n.number);
    const dnes = n.doc_date || danes10();
    const orgOpt = ORGSEZNAM.map(o => `<option value="${o.id}"${o.id === n.org_id ? ' selected' : ''}>${escape_(o.name)}</option>`).join('');
    box.innerHTML = `<div class="ur-form">
      <label class="ur-f"><span>Stranka</span><select data-org>${orgOpt}</select></label>
      <div class="ur-grid nl-2">
        <label class="ur-f"><span>Št.</span><input type="number" data-seq value="${st.seq}"></label>
        <label class="ur-f" hidden><span>Leto</span><input type="number" data-leto value="${st.leto}"></label>
        <label class="ur-f"><span>Datum</span><input type="date" data-datum value="${escape_(dnes)}"></label>
      </div>
      <p class="nl-izdal">Izdal: <b>${escape_(n.issued_name || '—')}</b><input type="hidden" data-izdal value="${escape_(n.issued_name || '')}"></p>
      <div class="ur-f"><span>Vrsta prevoza</span>${segPrevoz(n.transport)}</div>
      <p class="u-sub" style="margin:10px 0 4px">Postavke</p>
      <div data-postavke></div>
      <button type="button" class="ur-add" data-dodaj>${IKO_T_PLUS}Dodaj postavko</button>
      <div class="u-acts nl-akc"><div class="nl-sum"><b data-sum-kos>0 kos</b> · <output class="ur-kg-auto" data-teza-auto>—</output></div><button type="button" class="ur-save" data-shrani>Shrani</button><button type="button" data-preklici>Prekliči</button></div>
      <p class="u-sub ur-msg" data-msg></p></div>`;
    const pBox = box.querySelector('[data-postavke]');
    await nalozArtSez(box);
    function napolniPn(sel, curName, curId) {
      var arts = box._arts || [];
      // Najprej poveži po ID artikla — preimenovan artikel se prepozna in dobi novo ime (brez »star zapis«).
      var poId = null;
      if (curId != null && curId !== '') { for (var _i = 0; _i < arts.length; _i++) { if (arts[_i].id != null && String(arts[_i].id) === String(curId)) { poId = arts[_i]; break; } } }
      var matched = !!poId || arts.some(function (a) { return a.name === curName; });
      var opts = '';
      if (curName && !matched) opts += '<option value="' + escape_(curName) + '" data-aid="" selected>' + escape_(curName) + ' — star zapis</option>';
      opts += '<option value="">— izberi artikel —</option>';
      arts.forEach(function (a) {
        var lab = a.name;
        var izb = poId ? (a === poId) : (a.name === curName);
        opts += '<option value="' + escape_(a.name) + '" data-aid="' + escape_(String(a.id || '')) + '" data-sifra="' + escape_(String(a.sifra != null ? a.sifra : '')) + '" data-teza="' + escape_(String(a.teza != null ? a.teza : '')) + '" data-koda="' + escape_(a.koda || '') + '"' + (izb ? ' selected' : '') + '>' + escape_(lab) + '</option>';
      });
      sel.innerHTML = opts;
    }
    const osveziKg = () => osveziKgPrikaz(box);
    const dodajVrstico = (naziv = '', kosov = '', artId = '') => {
      const row = document.createElement('div');
      row.className = 'ur-post';
      row.innerHTML = `<button type="button" class="ur-grip dnd-handle" tabindex="-1" title="Povleci za razvrščanje" aria-label="Razvrsti">${DND_ICON}</button><span class="ur-pid" data-pid aria-hidden="true"></span><select data-pn class="ur-pn" aria-label="Artikel"></select><input type="number" inputmode="numeric" min="0" step="1" aria-label="Količina (kosov)" data-pk placeholder="kos" value="${kosov}"><button type="button" class="ur-del" data-del tabindex="-1" title="Odstrani vrstico" aria-label="Odstrani vrstico">${IKO_ZAPRI}</button>`;
      napolniPn(row.querySelector('[data-pn]'), naziv, artId);
      _osveziPid(row);
      row.querySelector('[data-del]').addEventListener('click', () => { row.remove(); osveziKg(); });
      row.querySelector('[data-pn]').addEventListener('change', () => { if (_dvojnikArtikla(row)) { var s = row.querySelector('[data-pn]'); if (s) s.value = ''; toast('Ta artikel je že na seznamu.'); } osveziKg(); _ocenaPostavke(row); _osveziPid(row); });
      row.querySelector('[data-pk]').addEventListener('input', () => { osveziKg(); _ocenaPostavke(row); });
      row.querySelector('[data-pk]').addEventListener('keydown', _pkEnter);
      pBox.appendChild(row);
      _ocenaPostavke(row);
      dndSort(pBox, '.ur-post', '.ur-grip', osveziKg);   // povleci za vrstni red
    };
    (box._items || []).forEach(p => dodajVrstico(p.naziv, p.kosov, p.artId));
    if (!(box._items || []).length) dodajVrstico();
    osveziKg();
    box.querySelector('[data-dodaj]').addEventListener('click', () => dodajVrstico());
    box.querySelector('[data-preklici]').addEventListener('click', () => oknoKoncaj(() => risiListDetajl(box)));
    box.querySelector('[data-shrani]').addEventListener('click', () => shraniList(box));
    wireSeg(box);
    letoIzDatuma(box);   // vrat s kljukicami tu ni — polja so bila zahtevana že ob nastanku lista
    // Menjava stranke med urejanjem: VEDNO svež premade seznam izbrane stranke s praznimi
    // količinami (tudi ob preklopu nazaj na izvirno stranko) — stare postavke in številke ne ostanejo.
    { const _os = box.querySelector('[data-org]'); if (_os) _os.addEventListener('change', async () => {
        // Nalaganje artiklov so tri omrežne poizvedbe. Ob hitri dvojni menjavi stranke
        // sta se dve nalaganji prekrivali in kasnejši odgovor je povozil prejšnjega —
        // seznam je pripadal napačni stranki ali pa je ostal prazen. Zato si zapomnimo,
        // katero stranko smo hoteli, in zastarel odgovor zavržemo.
        const _zelena = _os.value;
        box._artsSeq = (box._artsSeq || 0) + 1;
        const _mojaSeq = box._artsSeq;
        pBox.innerHTML = '<p class="u-sub" style="padding:6px 2px">Nalagam artikle …</p>';
        await nalozArtSez(box);
        if (_mojaSeq !== box._artsSeq || _os.value !== _zelena) return;   // vmes spet zamenjana
        pBox.innerHTML = '';
        if (box._artsNapaka) {
          pBox.innerHTML = '<p class="msg bad show" style="margin:6px 0">Artiklov ni bilo mogoče naložiti: ' + escape_(box._artsNapaka) + '</p>';
          dodajVrstico(); osveziKg();
          return;
        }
        const arts = box._arts || [];
        let izbor = box._imaUporabo ? arts.filter(a => a._u > 0) : arts;
        if (!izbor.length) izbor = arts;
        const vid = {};
        izbor.forEach(a => {
          if (!a.name) return;
          const k = (a.sifra != null && !isNaN(a.sifra)) ? ('s' + a.sifra) : (a.id ? ('a' + a.id) : ('n' + a.name.trim().toLowerCase()));
          if (vid[k]) return; vid[k] = 1; dodajVrstico(a.name, '');
        });
        if (!pBox.children.length) dodajVrstico();
        osveziKg();
      }); }
    oknoZapomni(box);
  }

  async function shraniList(box) {
    const q = s => box.querySelector(s);
    const msg = q('[data-msg]');
    const org_id = q('[data-org]').value;
    const seq = parseInt(q('[data-seq]').value, 10);
    const leto = parseInt(q('[data-leto]').value, 10);
    const doc_date = q('[data-datum]').value;
    const _kgEl = q('[data-teza-auto]');
    const _kgAuto = _kgEl && _kgEl.dataset.kg !== '' && _kgEl.dataset.kg != null ? Number(_kgEl.dataset.kg) : null;
    if (!org_id) { msg.textContent = 'Izberi stranko.'; return; }
    if (!seq || !leto) { msg.textContent = 'Vpiši številko in leto.'; return; }
    if (!doc_date) { msg.textContent = 'Vpiši datum.'; return; }
    const postavke = zdruziPodvojene([...box.querySelectorAll('.ur-post')].map(r => {
      const sel = r.querySelector('[data-pn]');
      const opt = sel && sel.selectedOptions && sel.selectedOptions[0];
      return {
        naziv: (sel ? sel.value : '').trim(),
        artId: opt && opt.dataset.aid ? opt.dataset.aid : null,
        sifra: opt && opt.dataset.sifra ? parseInt(opt.dataset.sifra, 10) : null,
        kosov: parseInt(r.querySelector('[data-pk]').value, 10) || 0
      };
    }).filter(p => p.naziv && p.kosov > 0));   // prazne premade vrstice (brez količine) preskočimo — enako kot pri novem listu
    if (!postavke.length) { msg.textContent = 'Vpiši količino vsaj pri enem artiklu.'; return; }
    msg.textContent = 'Shranjujem …';
    try {
      const { data: arts } = await sb.from('articles').select('id,name').eq('org_id', org_id);
      const poImenu = {};
      (arts || []).forEach(a => { poImenu[(a.name || '').trim().toLowerCase()] = a.id; });
      // za izbrane LASTNE artikle brez članstva ustvari povezavo (veljaven article_id)
      for (const p of postavke) {
        if (!p.artId && p.sifra != null && !isNaN(p.sifra)) {
          const ins = await sb.from('articles').insert({ org_id, name: p.naziv, cena_sifra: p.sifra }).select('id').maybeSingle();
          if (ins && ins.data) { p.artId = ins.data.id; if (CLANI) CLANI.push({ id: ins.data.id, org_id: org_id, name: p.naziv, cena_sifra: p.sifra, sort_order: null }); }
        }
      }
      const rows = postavke.map(p => ({
        article_name: p.naziv,
        article_id: p.artId || poImenu[p.naziv.toLowerCase()] || null,
        pieces: p.kosov
      }));
      // list in postavke v eni transakciji (65_shrani_list.sql)
      const r = await sb.rpc('app_shrani_list', { p_id: box._id, p_tudi_potrjen: true, p_postavke: rows, p_list: {
        org_id, doc_seq: seq, doc_year: leto, doc_date,
        weight_kg: _kgAuto,
        transport: beriPrevoz(box),
        popravil: JAZIME || 'osebje',
        popravljeno_at: new Date().toISOString()
      } });
      if (r.error) throw r.error;
      delete _POST_CACHE[box._id];   // KLJUČNO: sicer ponovni prikaz/urejanje pokaže stare postavke in jih ob shranjevanju zapiše nazaj
      pozabiPostavke(box._id);
      logDodaj('Arhiv', 'Urejeno', 'Spremni list ' + ((box._note && box._note.number) || ''));
      toast('Spremni list shranjen');
      const _vrniSe = box._id;
      await naloziListe();
      risiArhiv();
      pokaziList(_vrniSe);
    } catch (e) {
      msg.textContent = /duplicate|unique/i.test(e.message || '') ? 'Številka ' + seq + '/' + leto + ' je že uporabljena za drug spremni list.' : napakaBesedilo(e);
    }
  }

  /* ══════════ DOKUMENTI (predogled, tisk, PDF) — en slog za vse ══════════
     Vzor je spremni list (enak izgled kot v aplikaciji na tablici). Logotip je povsod ISTI
     kot v portalu (.wordmark): Playfair Display 700, razmik -0,03 em, »Smart« #0d1f17,
     »Clean« #1a6644 — v HTML kot besedilo v pisavi iz fonts/, v PDF kot vektorsko besedilo
     v isti pisavi (pdfgen.js). Nikoli slika ali nadomestna pisava. Logotip je na dokumentu
     ENKRAT, na vrhu. */
  var DOK_BIZ = ['BSMART d.o.o.', 'Škalska cesta 6, 3210 Slovenske Konjice', '+386 41 209 676', '+386 68 693 988', 'blanka.kovacic1@gmail.com'];
  // Absolutni naslovi pisav: delujejo tudi v tiskalnem oknu brez osnovnega naslova.
  function _dokPis(ime) { return new URL('fonts/' + ime, location.href).href; }
  var _DOK_LAT = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
  var _DOK_EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
  function dokCss() {
    // font-display:block — dokument nikoli ne pokaže (ali natisne) nadomestne pisave.
    return "@font-face{font-family:'Archivo';font-style:normal;font-weight:100 900;font-display:block;src:url('" + _dokPis('archivo-latin-wght-normal.woff2') + "') format('woff2');unicode-range:" + _DOK_LAT + "}" +
      "@font-face{font-family:'Archivo';font-style:normal;font-weight:100 900;font-display:block;src:url('" + _dokPis('archivo-latin-ext-wght-normal.woff2') + "') format('woff2');unicode-range:" + _DOK_EXT + "}" +
      "@font-face{font-family:'Playfair Display';font-style:normal;font-weight:700;font-display:block;src:url('" + _dokPis('playfair-display-latin-700-normal.woff2') + "') format('woff2');unicode-range:" + _DOK_LAT + "}" +
      "@font-face{font-family:'Playfair Display';font-style:normal;font-weight:700;font-display:block;src:url('" + _dokPis('playfair-display-latin-ext-700-normal.woff2') + "') format('woff2');unicode-range:" + _DOK_EXT + "}" +
      `@page{size:A4;margin:0}
      *{box-sizing:border-box}
      html{background:#e9edeb}
      body{margin:0;background:#e9edeb;color:#0a0a0a;font-family:'Archivo',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
      .a4{position:relative;padding:12mm 12mm 14mm;color:#0a0a0a;background:#fff;min-height:297mm;break-after:page}
      .a4:last-child{break-after:auto}
      .a4+.a4{margin-top:14px}
      @media print{html,body{background:#fff}.a4{min-height:0}.a4+.a4{margin-top:0}}
      .sc-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:18px;padding-bottom:14px;border-bottom:1.5px solid #0a0a0a}
      .sc-wm{font-family:'Playfair Display',serif;font-weight:700;letter-spacing:-.03em;line-height:.9;font-size:32px;color:#0d1f17;white-space:nowrap}
      .sc-wm span{color:#1a6644}
      .sc-biz{font-size:9px;line-height:1.6;text-align:right;color:#666;white-space:nowrap;font-weight:500}
      .sc-box{border:1px solid #dcdcdc;border-radius:9px;padding:10px 14px;margin-bottom:10px}
      .sc-num{font-size:13px;font-weight:700;display:flex;justify-content:space-between;align-items:baseline;gap:12px}
      .sc-num b{font-variant-numeric:tabular-nums;letter-spacing:.01em}
      .sc-num .sc-obd{font-size:11px;font-weight:500;color:#666;font-variant-numeric:tabular-nums}
      .sc-client{display:flex;justify-content:space-between;gap:14px}
      .sc-client .cl{font-size:12px}
      .sc-client .cname{font-weight:700;border-bottom:2px solid #0a0a0a;padding:0 2px}
      .sc-client .cname-sec{font-weight:400;color:#6b7280;font-size:.85em;margin-left:4px}
      .sc-client .sc-addr{margin-top:6px;font-size:11px;color:#666}
      .sc-client .sc-dates{margin-top:10px;font-size:11px;color:#666}
      .sc-sign{border-left:1px solid #dcdcdc;padding-left:16px;font-weight:600;font-size:12px;min-width:110px;color:#666}
      table.sc-table{width:100%;border-collapse:collapse;font-size:10px;margin-top:4px}
      table.sc-table th{color:#0a0a0a;font-weight:700;font-size:9px;letter-spacing:.09em;text-transform:uppercase;padding:0 8px 8px;text-align:center;border-bottom:1.5px solid #0a0a0a}
      table.sc-table th.l{text-align:left}
      table.sc-table th.r,table.sc-table td.r{text-align:right}
      table.sc-table td{border-bottom:1px solid #ececec;padding:5px 8px;height:15px;font-variant-numeric:tabular-nums}
      table.sc-table td.an{color:#0a0a0a;font-weight:600;text-align:left}
      table.sc-table td.qty{text-align:center;font-weight:700;width:34%;color:#0a0a0a}
      table.sc-table td.b{font-weight:700}
      table.sc-table tfoot td{border-top:1.5px solid #0a0a0a;border-bottom:none;font-weight:700;padding-top:8px}
      .sc-weight{margin-top:12px;font-size:12px;color:#0a0a0a;text-align:right;font-weight:600}
      .sc-note{margin-top:10px;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:12px;white-space:pre-wrap}
      .sc-tot{margin:12px 0 0 auto;width:55%;font-size:11px}
      .sc-tot div{display:flex;justify-content:space-between;gap:12px;padding:5px 8px;border-bottom:1px solid #ececec}
      .sc-tot div span{color:#666}
      .sc-tot div b{font-variant-numeric:tabular-nums}
      .sc-tot .bruto{border-top:1.5px solid #0a0a0a;border-bottom:none;margin-top:4px;padding-top:8px;font-size:13px}
      .sc-tot .bruto span{color:#0a0a0a;font-weight:700}
      .sc-pozor{margin-top:10px;font-size:10px;color:#8a5a00}
      table.ur-tbl{table-layout:fixed;margin-top:6px}
      table.ur-tbl th:nth-child(1){width:24%}
      table.ur-tbl th:nth-child(2),table.ur-tbl th:nth-child(3){width:17%}
      table.ur-tbl td{height:7.2mm;padding:0 8px;border:1px solid #cfcfcf;border-top:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      table.ur-tbl td.ur-dan{font-weight:600;white-space:nowrap}
      table.ur-tbl tr.sob td.ur-dan{color:#666}
      table.ur-tbl tr.praz td{background:#f6f6f6}
      .ur-praz{margin-left:6px;font-size:7.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#8a5a00}`;
  }
  function dokGlavaHtml() {
    return '<div class="sc-head"><div class="sc-wm">Smart<span>Clean</span></div><div class="sc-biz">' + DOK_BIZ.map(escape_).join('<br>') + '</div></div>';
  }
  // telo: en list ali seznam listov — vsak list A4 ima glavo z logotipom enkrat, na vrhu.
  function dokHtml(naslov, telo) {
    var listi = Array.isArray(telo) ? telo : [telo];
    return '<!DOCTYPE html><html lang="sl"><head><meta charset="utf-8"><title>' + escape_(naslov) + '</title><style>' + dokCss() + '</style></head><body>' +
      listi.map(function (t) { return '<div class="a4">' + dokGlavaHtml() + t + '</div>'; }).join('') + '</body></html>';
  }
  function sklonListov(n) { var m = n % 100; return stevilo(n) + ' ' + (m === 1 ? 'spremni list' : m === 2 ? 'spremna lista' : (m === 3 || m === 4) ? 'spremni listi' : 'spremnih listov'); }
  function sklonArtiklov(n) { var m = n % 100; return stevilo(n) + ' ' + (m === 1 ? 'artikel' : m === 2 ? 'artikla' : (m === 3 || m === 4) ? 'artikli' : 'artiklov'); }
  function sklonKosov(n) { var m = n % 100; return stevilo(n) + ' ' + (m === 1 ? 'kos' : m === 2 ? 'kosa' : (m === 3 || m === 4) ? 'kosi' : 'kosov'); }
  // »1 redni prevoz«, »2 redna prevoza«, »3 redni prevozi«, »5 rednih prevozov« (vrsta: 'redni' / 'izredni').
  function sklonPrevoz(n, vrsta) {
    var m = n % 100;
    var pr = m === 1 ? vrsta : m === 2 ? vrsta.replace(/i$/, 'a') : (m === 3 || m === 4) ? vrsta : vrsta.replace(/i$/, 'ih');
    return stevilo(n) + ' ' + pr + ' ' + (m === 1 ? 'prevoz' : m === 2 ? 'prevoza' : (m === 3 || m === 4) ? 'prevozi' : 'prevozov');
  }
  function fakPrevozi(g) { return sklonPrevoz(g.redni || 0, 'redni') + (g.izredni ? ' · ' + sklonPrevoz(g.izredni, 'izredni') : ''); }

  // ── PDF v istem slogu: izris je v spremni-pdf.js (ena koda s aplikacijo za spremne liste) ──
  // Konstante ostanejo tudi tu (graditelji faktur, ur in evidence kg); pomočniki se povežejo,
  // ko zagotoviPdf() naloži pdfgen.js in spremni-pdf.js — vsak graditelj ga pokliče najprej.
  var PT = 0.75;
  var DPDF = { M: 34.02, SP: 39.69, INK: [10 / 255, 10 / 255, 10 / 255], SIVA: [102 / 255, 102 / 255, 102 / 255], SIVA2: [107 / 255, 114 / 255, 128 / 255],
    CRTA: [236 / 255, 236 / 255, 236 / 255], OKVIR: [220 / 255, 220 / 255, 220 / 255], OKVIR2: [221 / 255, 221 / 255, 221 / 255],
    POZOR: [138 / 255, 90 / 255, 0] };
  var DPDF_VRSTA = 26 * PT;
  var dpdfOsnova, dpdfGlava, dpdfOkvir, dpdfVrstice, dpdfTabGlava, dpdfTabVrsta, dpdfTabela, dpdfNadaljevanje, dpdfNovaStran, dpdfProstor, dpdfNarocnik;
  function pdfPovezi() {
    var P = window.SpremniPdf; P.BIZ = DOK_BIZ;
    dpdfOsnova = P.dpdfOsnova; dpdfGlava = P.dpdfGlava; dpdfOkvir = P.dpdfOkvir; dpdfVrstice = P.dpdfVrstice;
    dpdfTabGlava = P.dpdfTabGlava; dpdfTabVrsta = P.dpdfTabVrsta; dpdfTabela = P.dpdfTabela; dpdfNadaljevanje = P.dpdfNadaljevanje;
    dpdfNovaStran = P.dpdfNovaStran; dpdfProstor = P.dpdfProstor; dpdfNarocnik = P.dpdfNarocnik;
  }

  function spremniDocHtml(box) {
    return dokHtml('Spremni list ' + ((box._note || {}).number || ''), spremniTeloHtml(box));
  }
  // Vsebina enega spremnega lista (brez ovoja dokumenta) — za en list ali več izbranih v enem tisku.
  function spremniTeloHtml(box) {
    const n = box._note || {};
    const items = box._items || [];
    const org = ORGSEZNAM.find(o => o.id === n.org_id) || {};
    const naziv = org.legal_name || org.name || ORGIME[n.org_id] || '—';
    const nazivSek = (org.legal_name && org.name && org.name !== org.legal_name) ? org.name : '';
    const rows = items.length
      ? items.map(p => `<tr><td class="an">${escape_(p.naziv)}</td><td class="qty">${stevilo(p.kosov)}</td></tr>`).join('')
      : '<tr><td class="an" colspan="2" style="color:var(--mid)">Ni postavk</td></tr>';
    const izdal = n.issued_name ? ` &nbsp;·&nbsp; Izdal: ${escape_(n.issued_name)}` : '';
    const prevozP = ` &nbsp;·&nbsp; ${n.transport === 'izredni' ? 'Izredni prevoz' : 'Redni prevoz'}`;
    const kg = (n.weight_kg != null && n.weight_kg !== '') ? `<div class="sc-weight">Skupaj teža perila: <b>${tezaFmt(n.weight_kg)}</b></div>` : '';
    // Na spremni list se tiska SAMO opomba za stranko (interna opomba ostane le v portalu) — enako kot v spletni aplikaciji.
    const opombaP = n.opomba_stranka ? `<div class="sc-note"><b>Opomba:</b> ${escape_(n.opomba_stranka)}</div>` : '';
    return `<div class="sc-box sc-num"><span>Št. spremnega lista: <b>${escape_(n.number || '—')}</b></span></div>
      <div class="sc-box sc-client"><div class="cl"><div><b>Naročnik storitve:</b> <span class="cname">${escape_(naziv)}</span>${nazivSek ? ' <span class="cname-sec">(' + escape_(nazivSek) + ')</span>' : ''}</div><div class="sc-dates">Oddaja: ${datum(n.doc_date)}${izdal}${prevozP}</div></div><div class="sc-sign">Podpis:</div></div>
      <table class="sc-table"><thead><tr><th class="l">Naziv Artikla</th><th>Oddaja (št. kosov)</th></tr></thead><tbody>${rows}</tbody></table>
      ${kg}${opombaP}`;
  }
  function natisniList(box) {
    predogledDokument({ naslov: 'Spremni list ' + escape_((box._note || {}).number || ''), docHtml: spremniDocHtml(box), pdf: function () { return spremniPdfDownload(box); } });
  }

  function segPrevoz(val) {
    const v = val === 'izredni' ? 'izredni' : 'redni';
    return `<div class="seg" data-transport>
      <button type="button" class="seg-b${v === 'redni' ? ' on' : ''}" data-tv="redni">Redni</button>
      <button type="button" class="seg-b${v === 'izredni' ? ' on' : ''}" data-tv="izredni">Izredni prevoz</button>
    </div>`;
  }
  function wireSeg(box) {
    const seg = box.querySelector('[data-transport]');
    if (!seg) return;
    seg.querySelectorAll('.seg-b').forEach(b => b.addEventListener('click', () => {
      seg.querySelectorAll('.seg-b').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    }));
  }
  function beriPrevoz(box) {
    const on = box.querySelector('[data-transport] .seg-b.on');
    return on && on.dataset.tv === 'izredni' ? 'izredni' : 'redni';
  }

  // samodejni izračun teže iz artiklov: Σ(teža na kos × kosov); teža živi na ceniku (cena_sifra)
  function vsotaKgPostavk(box) {
    var kg = 0, ima = false;
    box.querySelectorAll('.ur-post').forEach(function (r) {
      var sel = r.querySelector('[data-pn]'); var opt = sel && sel.selectedOptions && sel.selectedOptions[0];
      var kos = parseInt(r.querySelector('[data-pk]').value, 10) || 0;
      var t = (opt && opt.dataset.teza !== '' && opt.dataset.teza != null) ? parseFloat(opt.dataset.teza) : null;
      if (t != null && !isNaN(t)) { kg += t * kos; ima = true; }
    });
    return { kg: kg, ima: ima };
  }
  function osveziKgPrikaz(box) {
    var sk = box.querySelector('[data-sum-kos]');
    if (sk) { var n = 0; box.querySelectorAll('[data-pk]').forEach(function (i) { var v = parseInt(i.value, 10); if (v > 0) n += v; }); sk.textContent = stevilo(n) + ' kos'; }
    var el = box.querySelector('[data-teza-auto]'); if (!el) return;
    var r = vsotaKgPostavk(box);
    el.textContent = r.ima ? tezaFmt(r.kg) : '—';
    el.dataset.kg = r.ima ? String(Math.round(r.kg * 1000) / 1000) : '';
  }
  // Nov spremni list se odpre v OKNU, ki zraste iz gumba »+ Nov spremni list«.
  // Po shranjevanju se okno skrči v kartico novega lista, ob preklicu nazaj v gumb.
  // ×, Esc ali klik na ozadje okno le zaprejo — vpisano ostane in se ob ponovnem
  // odprtju pokaže (nenameren klik ob okno ne izbriše vnosa).
  function novListOkno(box, vir) {
    const gumb = vir || $('arhivNovBtn');
    oknoOdpri(gumb, box, () => gumb, {
      glava: () => { const h = document.createElement('h3'); h.className = 'sec-h'; h.textContent = box.querySelector('.nl-pregled') ? 'Predogled spremnega lista' : 'Nov spremni list'; return h; },
      varuj: 'Shranim spremni list?',
      obZaprtju: () => { box.innerHTML = ''; box.style.minHeight = ''; }   // brez osnutka: + vedno začne s praznim obrazcem
    });
  }
  function novListZapri(box) {
    if (_okno && _okno.vsebina === box) oknoZapri();
    else { box.innerHTML = ''; box.classList.remove('show'); }
  }
  let _novListNalog = 0;
  // pred = manjkajoča številka (leto, stevilka, prej_datum): obrazec z njo in z datumom prejšnjega lista
  async function novList(vir, pred) {
    const box = $('novListBox');
    if (!box || _okno) return;
    // okno se odpre takoj z nalagalnim trakom; obrazec se pokaže, ko je pripravljen
    box.innerHTML = NALAGANJE; box.style.minHeight = 'min(60vh, 520px)';
    novListOkno(box, vir);
    oknoZapomni(box, true);
    const nalog = ++_novListNalog, zaprto = () => nalog !== _novListNalog || !_okno || _okno.vsebina !== box;
    const letos = pred ? pred.leto : new Date().getFullYear();
    let maxSeq = 0;
    LISTI.forEach(l => { const d = String(l.number || '').split('/'); if ((parseInt(d[1], 10) || 0) === letos) { const sq = parseInt(d[0], 10) || 0; if (sq > maxSeq) maxSeq = sq; } });
    // baza pozna tudi številke, ki jih je tablica rezervirala in še ne poslala (70_rezervacija_stevilk.sql)
    try { const r = await Promise.race([sb.rpc('app_prosta_stevilka', { p_leto: letos }), new Promise(ok => setTimeout(() => ok(null), 2500))]); if (r && typeof r.data === 'number' && r.data - 1 > maxSeq) maxSeq = r.data - 1; } catch (e) {}
    if (zaprto()) return;
    const dnes = danes10();   // lokalni datum (UTC bi med 0. in 2. uro vrnil včeraj)
    const orgOpt = '<option value="">— izberi stranko —</option>' + ORGSEZNAM.map(o => `<option value="${o.id}">${escape_(o.name)}</option>`).join('');
    box.innerHTML = `<div class="ur-form">
      <label class="ur-f"><span>Stranka</span><select data-org>${orgOpt}</select></label>
      <div class="ur-grid nl-2">
        <label class="ur-f"><span>Št.</span><input type="number" data-seq value="${pred ? pred.stevilka : maxSeq + 1}"></label>
        <label class="ur-f" hidden><span>Leto</span><input type="number" data-leto value="${letos}"></label>
        <label class="ur-f"><span>Datum</span><input type="date" data-datum value="${(pred && pred.prej_datum) || dnes}"></label>
      </div>
      <p class="nl-izdal">Izdal: <b>${escape_(JAZIME || '—')}</b><input type="hidden" data-izdal value="${escape_(JAZIME || '')}"></p>
      <div class="ur-f"><span>Vrsta prevoza</span>${segPrevoz('redni')}</div>
      <p class="u-sub" style="margin:10px 0 4px">Postavke</p>
      <div data-postavke></div>
      <button type="button" class="ur-add" data-dodaj>${IKO_T_PLUS}Dodaj postavko (izven seznama)</button>
      <div class="ur-opomba">
        <label class="ur-f"><span>Opomba na spremnem listu</span><textarea class="ur-opomba-txt" data-opomba-stranka rows="2" maxlength="600"></textarea></label>
        <label class="ur-f"><span>Interna opomba</span><textarea class="ur-opomba-txt" data-opomba-interno rows="2" maxlength="600"></textarea></label>
      </div>
      <div class="u-acts nl-akc"><div class="nl-sum"><b data-sum-kos>0 kos</b> · <output class="ur-kg-auto" data-teza-auto>—</output></div><button type="button" class="ur-save" data-shrani>Naprej</button><button type="button" data-preklici>Prekliči</button></div>
      <p class="u-sub ur-msg" data-msg></p></div>`;
    const pBox = box.querySelector('[data-postavke]');
    const obrazec = box.querySelector('.ur-form'), nalTrak = document.createElement('div');
    nalTrak.innerHTML = NALAGANJE; box.insertBefore(nalTrak, obrazec); obrazec.style.display = 'none';
    await nalozArtSez(box);
    if (zaprto()) return;
    function napolniPn(sel, curName) {
      var arts = box._arts || [];
      var matched = arts.some(function (a) { return a.name === curName; });
      var opts = '';
      if (curName && !matched) opts += '<option value="' + escape_(curName) + '" data-aid="" selected>' + escape_(curName) + ' — ročno</option>';
      opts += '<option value="">— izberi artikel —</option>';
      arts.forEach(function (a) {
        var lab = a.name;
        opts += '<option value="' + escape_(a.name) + '" data-aid="' + escape_(String(a.id || '')) + '" data-sifra="' + escape_(String(a.sifra != null ? a.sifra : '')) + '" data-teza="' + escape_(String(a.teza != null ? a.teza : '')) + '" data-koda="' + escape_(a.koda || '') + '"' + (a.name === curName ? ' selected' : '') + '>' + escape_(lab) + '</option>';
      });
      sel.innerHTML = opts;
    }
    const osveziKg = () => osveziKgPrikaz(box);
    const dodajVrstico = (naziv = '', kosov = '') => {
      const row = document.createElement('div');
      row.className = 'ur-post';
      row.innerHTML = `<button type="button" class="ur-grip dnd-handle" tabindex="-1" title="Povleci za razvrščanje" aria-label="Razvrsti">${DND_ICON}</button><span class="ur-pid" data-pid aria-hidden="true"></span><select data-pn class="ur-pn" aria-label="Artikel"></select><input type="number" inputmode="numeric" min="0" step="1" aria-label="Količina (kosov)" data-pk placeholder="kos" value="${kosov}"><button type="button" class="ur-del" data-del tabindex="-1" title="Odstrani vrstico" aria-label="Odstrani vrstico">${IKO_ZAPRI}</button>`;
      napolniPn(row.querySelector('[data-pn]'), naziv);
      _osveziPid(row);
      row.querySelector('[data-del]').addEventListener('click', () => { row.remove(); osveziKg(); });
      row.querySelector('[data-pn]').addEventListener('change', () => { if (_dvojnikArtikla(row)) { var s = row.querySelector('[data-pn]'); if (s) s.value = ''; toast('Ta artikel je že na seznamu.'); } osveziKg(); _ocenaPostavke(row); _osveziPid(row); });
      row.querySelector('[data-pk]').addEventListener('input', () => { _vnosRed(box, row); osveziKg(); _ocenaPostavke(row); });
      row.querySelector('[data-pk]').addEventListener('keydown', _pkEnter);
      pBox.appendChild(row);
      _vnosRed(box, row);
      _ocenaPostavke(row);
      dndSort(pBox, '.ur-post', '.ur-grip', osveziKg);   // povleci za vrstni red
      osveziKg();
    };
    // »Premade« seznam: ob izbiri stranke se postavke samodejno napolnijo z VSEMI
    // artikli iz kataloga te stranke (brez količin) — uporabnik samo vpiše številke.
    // Nov artikel, dodan stranki, se samodejno pojavi tu naslednjič. Prazne vrstice se ob shranjevanju preskočijo.
    const napolniPremade = () => {
      pBox.innerHTML = '';
      const arts = box._arts || [];
      if (!arts.length) { dodajVrstico(); return; }     // ni izbrane stranke / prazen katalog → ena prazna vrstica
      // Če stranka ima zgodovino, pokaži SAMO najbolj uporabljene (že razvrščene po pogostosti);
      // sicer (nova stranka brez zgodovine) pokaži cel katalog.
      var izbor = box._imaUporabo ? arts.filter(function (a) { return a._u > 0; }) : arts;
      if (!izbor.length) izbor = arts;
      var vid = {};
      izbor.forEach(function (a) {
        if (!a.name) return;
        var k = (a.sifra != null && !isNaN(a.sifra)) ? ('s' + a.sifra) : (a.id ? ('a' + a.id) : ('n' + a.name.trim().toLowerCase()));
        if (vid[k]) return; vid[k] = true;             // brez dvojnikov v premade seznamu
        dodajVrstico(a.name, '');
      });
      osveziKg();
    };
    napolniPremade();
    box.querySelector('[data-dodaj]').addEventListener('click', () => dodajVrstico());
    box.querySelector('[data-preklici]').addEventListener('click', () => oknoKoncaj(() => novListZapri(box)));
    box.querySelector('[data-shrani]').addEventListener('click', () => shraniNovList(box));
    wireSeg(box);
    vnosVrata(box);
    { const _os = box.querySelector('[data-org]'); if (_os) _os.addEventListener('change', async () => { await nalozArtSez(box); napolniPremade(); osveziKgPrikaz(box); }); }
    nalTrak.remove(); obrazec.style.display = ''; box.style.minHeight = '';
    if (!manjGibanja() && obrazec.animate) obrazec.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: 'ease' });   // obrazec namesto nalagalnega traku: brez preskoka
    oknoZapomni(box);
  }

  // Vrstni red vnosa (nov spremni list): vrstica dobi zaporedno številko, ko ji prvič vpišeš količino;
  // če količino pobrišeš, jo izgubi. Predogled in shranjeni list sta v tem vrstnem redu.
  function _vnosRed(box, row) {
    var v = parseInt((row.querySelector('[data-pk]') || {}).value, 10) || 0;
    if (v > 0) { if (!row.dataset.vnos) row.dataset.vnos = String(box._vnosSt = (box._vnosSt || 0) + 1); }
    else delete row.dataset.vnos;
  }
  function _postavkeNovega(box) {
    const vrste = [...box.querySelectorAll('.ur-post')].map((r, i) => ({ r, i, v: parseInt(r.dataset.vnos, 10) || Infinity }));
    vrste.sort((a, b) => a.v - b.v || a.i - b.i);
    return zdruziPodvojene(vrste.map(({ r }) => {
      const sel = r.querySelector('[data-pn]');
      const opt = sel && sel.selectedOptions && sel.selectedOptions[0];
      return {
        naziv: (sel ? sel.value : '').trim(),
        artId: opt && opt.dataset.aid ? opt.dataset.aid : null,
        sifra: opt && opt.dataset.sifra ? parseInt(opt.dataset.sifra, 10) : null,
        koda: opt && opt.value ? (opt.getAttribute('data-koda') || '') : '',
        kosov: parseInt(r.querySelector('[data-pk]').value, 10) || 0
      };
    }).filter(p => p.naziv && p.kosov > 0));   // premade prazne vrstice (brez količine) preskočimo
  }
  // Pregled pred shranjevanjem je pravi spremni list na papirju (ista koda kot tisk), da se očitno loči od obrazca.
  // Nazaj vrne v obrazec (vse ostane), Ustvari shrani in zapre okno.
  var NL_PAPIR_CSS = ":host{display:block}" +
    ".a4{min-height:auto;aspect-ratio:210/297;padding:34px 36px 40px;font-family:'Archivo',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}" +
    ".sc-num{font-size:15px}.sc-client .cl{font-size:13px}.sc-client .sc-addr,.sc-client .sc-dates{font-size:12px}" +
    "table.sc-table{font-size:13px}table.sc-table th{font-size:10px;white-space:nowrap}table.sc-table td{height:auto;padding:8px}.sc-weight,.sc-note{font-size:13px}" +
    "@media(max-width:560px){.a4{padding:20px 16px 24px}.sc-wm{font-size:26px}.sc-biz{font-size:8px}.sc-head{gap:10px;margin-bottom:14px}.sc-wm{flex:none}.sc-biz{white-space:normal;min-width:0}.sc-box{padding:9px 11px}.sc-sign{min-width:76px;padding-left:10px}}";
  function nlPregled(box, d) {
    var obr = box.querySelector('.ur-form'); if (!obr) return;
    var star = box.querySelector('.nl-pregled'); if (star) star.remove();
    var pv = document.createElement('div'); pv.className = 'nl-pregled';
    var kos = d.postavke.reduce(function (s2, p) { return s2 + p.kosov; }, 0);
    pv.innerHTML = '<div class="nl-miza"><div class="nl-papir"></div></div>' +
      (d.opInterno ? '<div class="ur-f nl-interna"><span>Interna opomba</span><div class="nl-pv nl-pv-txt">' + escape_(d.opInterno) + '</div></div>' : '') +
      '<div class="u-acts nl-akc"><div class="nl-sum"><b>' + stevilo(kos) + ' kos</b> · ' + escape_(d.kgTxt || '—') + '</div><button type="button" class="ur-save" data-pv-ustvari>Ustvari<span class="nl-dolgo"> spremni list</span></button><button type="button" data-pv-nazaj>Nazaj</button></div>' +
      '<p class="u-sub ur-msg" data-msg></p>';
    var list = { _note: { number: d.seq + '/' + d.leto, org_id: d.org_id, doc_date: d.doc_date, issued_name: d.izdal, weight_kg: d.kg, transport: d.prevoz, opomba_stranka: d.opStranka || null }, _items: d.postavke };
    pv.querySelector('.nl-papir').attachShadow({ mode: 'open' }).innerHTML = '<style>' + dokCss() + NL_PAPIR_CSS + '</style><div class="a4">' + dokGlavaHtml() + spremniTeloHtml(list) + '</div>';   // CSS dokumenta velja le za papir
    obr.hidden = true; box.appendChild(pv); oknoGlava();
    var t0 = Date.now();   // drugi dotik dvojnega pritiska na Naprej ne sme shraniti brez pregleda
    pv.querySelector('[data-pv-nazaj]').addEventListener('click', function () { if (!this.disabled) nlObrazec(box); });
    pv.querySelector('[data-pv-ustvari]').addEventListener('click', function () { if (Date.now() - t0 >= 400) shraniNovList(box, true); });
    nlNaVrh(box);
    // Enter na tipkovnici; na dotik ne, ker Safari ob fokusu iz kode okoli gumba izriše debel obroč
    if (matchMedia('(hover:hover)').matches) setTimeout(function () { try { pv.querySelector('[data-pv-ustvari]').focus({ preventScroll: true }); } catch (e) {} }, 60);
  }
  function nlObrazec(box) { var pv = box.querySelector('.nl-pregled'); if (pv) pv.remove(); var obr = box.querySelector('.ur-form'); if (obr) obr.hidden = false; oknoGlava(); nlNaVrh(box); }
  function nlNaVrh(box) { var t = box.closest('.okno-telo'); if (t) t.scrollTop = 0; }
  async function shraniNovList(box, potrjeno) {
    const q = s => box.querySelector(s);
    const pv = potrjeno ? q('.nl-pregled') : null;
    const msg = (pv && pv.querySelector('[data-msg]')) || q('.ur-form [data-msg]') || q('[data-msg]');
    const org_id = q('[data-org]').value;
    const seq = parseInt(q('[data-seq]').value, 10);
    const leto = parseInt(q('[data-leto]').value, 10);
    const doc_date = q('[data-datum]').value;
    const _kgEl = q('[data-teza-auto]');
    const _kgAuto = _kgEl && _kgEl.dataset.kg !== '' && _kgEl.dataset.kg != null ? Number(_kgEl.dataset.kg) : null;
    const izdal = q('[data-izdal]').value.trim() || (JAZIME || null);
    const opStranka = q('[data-opomba-stranka]') ? q('[data-opomba-stranka]').value.trim() : '';
    const opInterno = q('[data-opomba-interno]') ? q('[data-opomba-interno]').value.trim() : '';
    if (!org_id) { msg.textContent = 'Izberi stranko.'; return; }
    if (!seq || !leto) { msg.textContent = 'Vpiši številko in leto.'; return; }
    if (!doc_date) { msg.textContent = 'Vpiši datum.'; return; }
    if (box._glavaOk === false) { msg.textContent = 'Najprej potrdi stranko, datum in številko zgoraj.'; return; }
    const postavke = _postavkeNovega(box);
    if (!postavke.length) { msg.textContent = 'Vpiši količino vsaj pri enem artiklu.'; return; }
    msg.textContent = '';
    if (!potrjeno) {   // najprej predogled lista, shrani šele Ustvari v predogledu
      nlPregled(box, { org_id, seq, leto, doc_date, izdal, prevoz: beriPrevoz(box), postavke, opStranka, opInterno, kg: _kgAuto, kgTxt: _kgEl ? _kgEl.textContent.trim() : '' });
      return;
    }
    const gUst = pv && pv.querySelector('[data-pv-ustvari]'), gNaz = pv && pv.querySelector('[data-pv-nazaj]');
    if (gUst) { if (gUst.disabled) return; gUst.disabled = true; gUst.classList.add('nalaga'); }   // dvojni klik ne ustvari dveh listov
    if (gNaz) gNaz.disabled = true;   // med shranjevanjem ostane pregled (sicer bi se napaka izpisala v odstranjen pregled)
    msg.textContent = 'Ustvarjam …';
    try {
      const { data: arts } = await sb.from('articles').select('id,name').eq('org_id', org_id);
      const poImenu = {};
      (arts || []).forEach(a => { poImenu[(a.name || '').trim().toLowerCase()] = a.id; });
      // za izbrane LASTNE artikle brez članstva ustvari povezavo (veljaven article_id)
      for (const p of postavke) {
        if (!p.artId && p.sifra != null && !isNaN(p.sifra)) {
          const ins = await sb.from('articles').insert({ org_id, name: p.naziv, cena_sifra: p.sifra }).select('id').maybeSingle();
          if (ins && ins.data) { p.artId = ins.data.id; if (CLANI) CLANI.push({ id: ins.data.id, org_id: org_id, name: p.naziv, cena_sifra: p.sifra, sort_order: null }); }
        }
      }
      const rows = postavke.map(p => ({ article_name: p.naziv, article_id: p.artId || poImenu[p.naziv.toLowerCase()] || null, pieces: p.kosov }));
      // list in postavke v eni transakciji (65_shrani_list.sql)
      const { data: novId, error } = await sb.rpc('app_shrani_list', { p_id: null, p_postavke: rows, p_list: {
        org_id, doc_seq: seq, doc_year: leto, doc_date,
        weight_kg: _kgAuto,
        transport: beriPrevoz(box),
        issued_name: izdal, source: 'portal',
        opomba_stranka: opStranka || null,
        opomba_evidenca: opInterno || null,
        legacy_id: 'portal-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
      } });
      if (error && (error.code === '23505' || /doc_seq_aktivni|duplicate key/i.test(error.message || ''))) {
        // številko je medtem dobil drug list (tablica, drug zavihek) — predlagaj naslednjo prosto, potrdi jo uporabnik
        let prosta = seq + 1;
        try { const r = await sb.rpc('app_prosta_stevilka', { p_leto: leto }); if (r && typeof r.data === 'number') prosta = Math.max(prosta, r.data); } catch (e) {}
        nlObrazec(box);   // številka se spremeni: nazaj v obrazec, kjer jo potrdiš
        const vSeq = q('[data-seq]'); vSeq.value = prosta;
        vSeq.dispatchEvent(new Event('input', { bubbles: true })); vSeq.dispatchEvent(new Event('change', { bubbles: true }));
        q('.ur-form [data-msg]').textContent = 'Številka ' + seq + '/' + leto + ' je medtem zasedena. Predlagana je ' + prosta + '/' + leto + '.';
        return;
      }
      if (error) throw error;
      const nova = { id: novId };
      logDodaj('Arhiv', 'Dodano', 'Spremni list ' + seq + '/' + leto + ' · ' + (ORGIME[org_id] || ''));
      const _zaTisk = { _note: { id: novId, number: seq + '/' + leto, org_id, doc_date, issued_name: izdal, weight_kg: _kgAuto, transport: beriPrevoz(box), opomba_stranka: opStranka || null },
        _items: postavke.map(p => ({ naziv: p.naziv, kosov: p.kosov })) };
      toast('Spremni list ' + seq + '/' + leto + ' ustvarjen', { besedilo: 'Natisni', ob: () => natisniList(_zaTisk) });
      await naloziListe();
      _arhStran = 0;   // nov list je na vrhu prve strani
      risiArhiv();
      const nid = nova && nova.id;
      if (_okno && _okno.vsebina === box) {
        // Okno se skrči naravnost v kartico novega lista (če je v trenutnem filtru), sicer nazaj v gumb.
        const najdiNov = () => nid ? document.querySelector('#arhivList .a-row[data-id="' + String(nid).replace(/"/g, '\\"') + '"]') : null;
        if (najdiNov() && !$('sec-arhiv').classList.contains('hidden')) {
          _okno.najdi = najdiNov; _okno.id = String(nid);
          const prej = _okno.obZaprtju;
          _okno.obZaprtju = function (k) { prej(k); if (k) { k.classList.add('arh-flash'); setTimeout(function () { k.classList.remove('arh-flash'); }, 1700); } };
        }
        novListZapri(box);
        if (!$('sec-domov').classList.contains('hidden')) risiPregled();   // ustvarjeno z Domova: ostane na Domovu
      } else {
        box.innerHTML = ''; box.classList.remove('show');
        pokaziList(nid);
      }
    } catch (e) {
      msg.textContent = /duplicate|unique/i.test(e.message || '') ? 'Številka ' + seq + '/' + leto + ' je že uporabljena za drug spremni list.' : napakaBesedilo(e);
      if (gUst) { gUst.disabled = false; gUst.classList.remove('nalaga'); }   // v pregledu: poskusi znova ali Nazaj
      if (gNaz) gNaz.disabled = false;
    }
  }

  async function osveziArtikleDatalist(box) {
    const os = box.querySelector('[data-org]');
    const org_id = os ? os.value : '';
    let dl = document.getElementById('artikliDatalist');
    if (!dl) { dl = document.createElement('datalist'); dl.id = 'artikliDatalist'; document.body.appendChild(dl); }
    dl.innerHTML = '';
    if (!org_id) return;
    try {
      const { data } = await sb.from('articles').select('name').eq('org_id', org_id).order('sort_order');
      dl.innerHTML = (data || []).map(a => `<option value="${escape_(a.name)}"></option>`).join('');
    } catch (e) {}
  }

  /* ══════════ FAKTURE (osnova za račun) ══════════ */
  let FAK_ZADNJI = null;
  function fakDatumOK(od, doo) { return od && doo && od <= doo; }
  function risiFakture() {
    const sel = $('fakOrg');
    if (sel && sel.options.length <= 1) {
      sel.innerHTML = '<option value="">Vse stranke</option>' + ORGSEZNAM.map(o => `<option value="${o.id}">${escape_(o.name)}</option>`).join('');
    }
    const od = $('fakOd'), doo = $('fakDo');
    if (od && !od.value) {
      const d = _fakDefault();
      od.value = d.od; doo.value = d.doo;
    }
    if (!risiFakture._wired) {
      $('fakBtn').addEventListener('click', () => { nalozifakture(); _fakObdToggle(); });
      var _fox = $('fakObdX'); if (_fox) _fox.addEventListener('click', function () { var d = _fakDefault(); if ($('fakOd')) $('fakOd').value = d.od; if ($('fakDo')) $('fakDo').value = d.doo; nalozifakture(); _fakObdToggle(); });
      // Sprememba obdobja (ali stranke) mora TAKOJ osvežiti rezultate.
      // Prej se je osvežilo šele na »Prikaži«: na zaslonu so ostale kartice
      // prejšnjega obdobja, FAK_ZADNJI pa je držal staro obdobje — gumb
      // »Natisni osnovo za račun« je zato tiskal številke prejšnjega obdobja,
      // čeprav sta polji kazali novo. Dve različni obdobji sta dali isto vsoto.
      var _fakT = null;
      function _fakOsveziKmalu() {
        _fakObdToggle();
        clearTimeout(_fakT);
        _fakT = setTimeout(function () {
          var o = $('fakOd'), d = $('fakDo');
          if (o && d && fakDatumOK(o.value, d.value)) nalozifakture();
        }, 250);
      }
      if ($('fakOd')) $('fakOd').addEventListener('change', _fakOsveziKmalu);
      if ($('fakDo')) $('fakDo').addEventListener('change', _fakOsveziKmalu);
      if ($('fakOrg')) $('fakOrg').addEventListener('change', _fakOsveziKmalu);
      var _fx = $('fakXlsxBtn'); if (_fx) _fx.addEventListener('click', () => fakIzvozModal('xlsx'));
      var _fp = $('fakPdfBtn'); if (_fp) _fp.addEventListener('click', () => fakIzvozModal('pdf'));
      risiFakture._wired = true;
    }
    nalozifakture(true);
    _fakObdToggle();
  }
  // Privzeto obdobje Faktur = tekoči mesec (1. → danes). Gumb × ponastavi nanj.
  function _fakDefault() {
    var z = new Date(), pad = function (n) { return String(n).padStart(2, '0'); };
    var iso = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
    // prvih 10 dni v mesecu se fakturira pretekli mesec → ta je privzet (prej vedno tekoči)
    if (z.getDate() <= 10) return { od: iso(new Date(z.getFullYear(), z.getMonth() - 1, 1)), doo: iso(new Date(z.getFullYear(), z.getMonth(), 0)) };
    return { od: iso(new Date(z.getFullYear(), z.getMonth(), 1)), doo: iso(z) };
  }
  function _fakObdToggle() {
    var x = $('fakObdX'); if (!x) return;
    var d = _fakDefault();
    var neDef = (($('fakOd') && $('fakOd').value) !== d.od) || (($('fakDo') && $('fakDo').value) !== d.doo);
    x.classList.toggle('hidden', !neDef);
  }
  // Zberi in izračunaj skupine po strankah za obdobje (orgIds: null/[] = vse, sicer seznam ID-jev).
  async function fakZberi(od, doo, orgIds) {
    // Naloži VSE spremne liste v obdobju (stranično), brez trde meje — da noben list/stranka ne izpade iz obračuna.
    const r = await deli('fak|' + od + '|' + doo + '|' + (orgIds && orgIds.length ? orgIds.slice().sort().join(',') : ''), () => vseVrstice(function (a, b) {
      let q = sb.from('delivery_notes')
        .select('id,number,doc_date,weight_kg,total_pieces,org_id,transport,potrjeno,delivery_note_items(article_name,article_id,pieces)')
        .is('deleted_at', null)
        .gte('doc_date', od).lte('doc_date', doo)
        .order('doc_date', { ascending: true }).order('id', { ascending: true }).range(a, b);
      if (orgIds && orgIds.length === 1) q = q.eq('org_id', orgIds[0]);
      else if (orgIds && orgIds.length) q = q.in('org_id', orgIds);
      return q;
    }));
    if (r.error) return { error: r.error };
    const notes = r.data || [];
    const poOrg = {};
    notes.forEach(n => {
      const oid = n.org_id || '—';
      if (!poOrg[oid]) poOrg[oid] = { org_id: oid, listov: 0, kg: 0, kosov: 0, redni: 0, izredni: 0, artikli: {}, artAid: {} };
      const g = poOrg[oid];
      g.listov++;
      if (n.potrjeno !== true && (n.total_pieces || 0) > 0) g.nepotrjenih = (g.nepotrjenih || 0) + 1;   // opozorilo na kartici
      if (n.transport === 'izredni') g.izredni++; else g.redni++;
      g.kg += parseFloat(n.weight_kg) || 0;
      g.kosov += n.total_pieces || 0;
      (n.delivery_note_items || []).forEach(it => {
        const ime = (it.article_name || '—').trim() || '—';
        g.kosovPostavke = (g.kosovPostavke || 0) + (it.pieces || 0);
        g.artikli[ime] = (g.artikli[ime] || 0) + (it.pieces || 0);
        if (it.article_id && !g.artAid[ime]) g.artAid[ime] = it.article_id;
      });
    });
    const skupine = Object.values(poOrg).sort((a, b) => (ORGIME[a.org_id] || '').localeCompare(ORGIME[b.org_id] || '', 'sl', { sensitivity: 'base' }));
    // ── cene: poveži postavke s cenikom (prek povezave artikel → cenik) ──
    // vedno sveže: cene se v živo ne osvežujejo, portal pa je lahko odprt več dni
    await nalozicenik(true);
    const artmap = await naloziArtMap(orgIds && orgIds.length === 1 ? orgIds[0] : null);
    const cenikOn = !!(CENIK && CENIK.length);
    skupine.forEach(g => {
      g.postavke = Object.entries(g.artikli).map(([nm, q]) => {
        const key = g.org_id + '|' + nm.trim().toLowerCase();
        const aid = g.artAid ? g.artAid[nm] : null;
        const byId = (aid && artmap.__byId) ? artmap.__byId[aid] : null;
        // primarno prek article_id (zanesljivo), sicer po imenu
        const s = (byId && byId.sifra != null) ? byId.sifra : artmap[key];
        const cena = cenaZaArtikel(s);
        const tzKos = (byId && byId.teza != null) ? byId.teza : (artmap.__teza ? artmap.__teza[key] : null);
        const teza = (tzKos != null && !isNaN(tzKos)) ? Math.round(tzKos * q * 1000) / 1000 : null;
        return { nm, q, cena, teza, znesek: cena != null ? Math.round(Math.round(cena * 100) * q) / 100 : null };
      }).sort((a, b) => a.nm.localeCompare(b.nm, 'sl', { sensitivity: 'base' }));
      g.cenikOn = cenikOn;
      // računamo v celih centih: lebdeča vejica je pol centa kdaj zaokrožila navzdol (5,75 € → DDV 1,26 namesto 1,27 €)
      const netoC = g.postavke.reduce((sm, p) => sm + Math.round((p.znesek || 0) * 100), 0), ddvC = Math.round(netoC * Math.round(DDV_STOPNJA * 100) / 100);
      g.neto = netoC / 100;
      g.ddv = ddvC / 100;
      g.bruto = (netoC + ddvC) / 100;
      g.brezCene = g.postavke.filter(p => !p.cena && p.q > 0).length;   // tudi cena 0 €: artikel je dan, a se ne zaračuna
      // »Skupaj kosov« bere delivery_notes.total_pieces, postavke pa so seštevek
      // delivery_note_items.pieces. Če se razideta, je račun notranje neskladen
      // (star ali nepopoln zapis). Doslej se to nikjer ni videlo — zdaj povemo.
      g.kosovPostavke = g.kosovPostavke || 0;
      g.neskladje = (g.kosov || 0) - g.kosovPostavke;
    });
    return { skupine: skupine };
  }
  // tiho: ponovno odprtje zavihka — prejšnji izris ostane brez zatemnitve, isti podatki se ne izrišejo znova (sicer vse utripne)
  let _fakNalog = 0;
  async function nalozifakture(tiho) {
    const list = $('fakList'), nalog = ++_fakNalog;
    const od = $('fakOd').value, doo = $('fakDo').value, orgFilter = $('fakOrg').value;
    if (!fakDatumOK(od, doo)) { list.innerHTML = '<div class="panel"><p class="u-sub">Datum »od« mora biti pred datumom »do«.</p></div>'; list._html = ''; FAK_ZADNJI = null; return; }
    // FAK_ZADNJI takoj razveljavimo: dokler se novo obdobje ne naloži, ne sme
    // nihče natisniti podatkov prejšnjega.
    FAK_ZADNJI = null;
    pokaziNalaganje(list);
    // Stare kartice zatemni le, če nalaganje traja opazno dlje. Prej so bile ob vsakem
    // odprtju zavihka za trenutek na 45 % — videti zamegljene, tudi ko je bilo nalaganje hipno.
    const _zatemni = tiho ? 0 : setTimeout(function () { list.style.opacity = '.45'; }, 350);
    const res = await fakZberi(od, doo, orgFilter ? [orgFilter] : null);
    clearTimeout(_zatemni);
    if (nalog !== _fakNalog) return;   // obdobje je medtem spremenjeno: počasnejši stari odgovor ne sme prepisati novega
    list.style.opacity = '';
    if (res.error) { list.innerHTML = '<div class="panel"><p class="u-sub">Napaka: ' + escape_(res.error.message) + '</p></div>'; list._html = ''; return; }
    const skupine = res.skupine;
    list.style.opacity = '';
    FAK_ZADNJI = { od, doo, skupine };
    $('fakPod').textContent = skupine.length ? '' : 'V izbranem obdobju ni spremnih listov';
    if (!skupine.length) { list.innerHTML = '<div class="panel"><p class="u-sub">V izbranem obdobju ni spremnih listov.</p></div>'; list._html = ''; return; }
    const html = '<div class="fak-grid">' + skupine.map((g, gi) => fakKartica(g, gi)).join('') + '</div>';
    if (list._html === html && list.firstElementChild && list.firstElementChild.classList.contains('fak-grid')) { oknoPoIzrisu(); return; }
    list.innerHTML = html; list._html = html;
    list.dataset.loaded = '1';
    list.querySelectorAll('[data-fakprint]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); natisniFakturo(parseInt(b.dataset.fakprint, 10)); }));
    // Klik kjerkoli na kartici (ne le na napisu): prej je poslušala samo notranja vrstica z besedilom,
    // zato robovi in prazen prostor kartice niso odprli okna.
    list.querySelectorAll('.fak-card').forEach(c => {
      c.addEventListener('click', e => { if (e.target.closest('.fak-body, button, a, input, select')) return; fakOdpri(c); });
      c.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === c) { e.preventDefault(); fakOdpri(c); } });
    });
    oknoPoIzrisu();
  }
  // Osnova za račun se odpre v OKNU (prej se je kartica razprla v mreži).
  // Kartico iščemo po stranki: po novem izrisu ima ista zaporedna številka lahko drugo stranko.
  function fakNajdi(org) { return document.querySelector('#fakList .fak-card[data-org="' + String(org).replace(/"/g, '\\"') + '"]'); }
  function fakGlavaOkna(k) {
    var d = document.createElement('div');
    var h = k && k.querySelector('.fak-card-info h3'), p = k && k.querySelector('.fak-card-info .u-sub'), n = k && k.querySelector('.fak-card-info .fak-noga');
    var deli = (p ? [].map.call(p.children.length ? p.children : [p], function (x) { return x.textContent; }) : []).concat(n ? [n.textContent.replace(/\s+/g, ' ').trim()] : [])
      .filter(Boolean).map(escape_);
    d.innerHTML = '<h3 class="sec-h">' + escape_(h ? h.textContent : '') + '</h3><div class="okno-glava-sub">' + deli.join(' · ') + '</div>';   // naše oznake (escape_ že uporabljen)
    return d;
  }
  function fakOdpri(card) {
    if (_okno || !card) return;
    var body = card.querySelector('.fak-body'); if (!body) return;
    var org = card.dataset.org;
    oknoOdpri(card, body, function () { return fakNajdi(org); }, {
      glava: fakGlavaOkna,
      osvezi: function (k) { return k.querySelector('.fak-body'); }
    });
  }
  function fakKg(kg) { return kg ? tezaFmt(kg) : '—'; }
  function fakBrezCene(g) { return 'Znesek ne vsebuje artiklov brez cene: ' + stevilo(g.brezCene); }
  function fakNeskladje(g) { return 'Seštevek postavk je ' + stevilo(g.kosovPostavke) + ' kosov, spremni listi navajajo ' + stevilo(g.kosov); }
  // Enaka opozorila na kartici, pri tisku, v PDF-ju in Excelu. Opozorilo le na eni poti pomeni, da nekdo izvozi napačno vsoto, ne da bi vedel.
  function fakOpozorila(g, money) {
    var o = [];
    if (g.neskladje) o.push(fakNeskladje(g));
    if (money && g.brezCene) o.push(fakBrezCene(g));
    if (g.nepotrjenih) o.push(nepotrjeniBesedilo(g.nepotrjenih));
    return o;
  }
  function fakKartica(g, gi) {
    const ime = ORGIME[g.org_id] || 'Brez stranke';
    const post = g.postavke || Object.entries(g.artikli).map(([nm, q]) => ({ nm, q, cena: null, znesek: null }));
    const money = !!g.cenikOn;
    const rows = post.length ? post.map(p =>
      `<div class="fak-line"><span class="fak-l-nm">${escape_(p.nm)}</span>` +
      (money ? `<span class="fak-l-c">${p.cena != null ? cenaFmt(p.cena) : '—'}</span>` : '') +
      `<b class="fak-l-q">${stevilo(p.q)}</b>` +
      `<span class="fak-l-t">${p.teza != null ? tezaFmt(p.teza) : '—'}</span>` +
      (money ? `<b class="fak-l-z">${p.znesek != null ? cenaFmt(p.znesek) : '—'}</b>` : '') +
      `</div>`).join('') : '<div class="fak-line fak-line-empty"><span class="u-sub">Brez postavk</span></div>';
    const prevoz = `<div class="fak-tot-r"><span>Prevozi</span><b>${stevilo(g.redni)} redni${g.izredni ? ' · ' + stevilo(g.izredni) + ' izredni' : ''}</b></div>` +
      (g.nepotrjenih ? `<div class="fak-tot-r"><button type="button" class="fak-nep" data-faknep="${escape_(String(g.org_id || ''))}">${IKO_T_POZOR}${nepotrjeniBesedilo(g.nepotrjenih)} · preglej</button><b></b></div>` : '');
    const head = money
      ? `<div class="fak-head fak-head-m"><span>Artikel</span><span>Cena</span><span>Kol.</span><span>Teža</span><span>Znesek</span></div>`
      : `<div class="fak-head fak-head-nm"><span>Artikel</span><span>Količina</span><span>Teža</span></div>`;
    const denar = money ? `
            <div class="fak-tot-r"><span>Neto skupaj</span><b>${cenaFmt(g.neto)}</b></div>
            <div class="fak-tot-r"><span>DDV (22 %)</span><b>${cenaFmt(g.ddv)}</b></div>
            <div class="fak-tot-r fak-tot-bruto"><span>Za plačilo (z DDV)</span><b>${cenaFmt(g.bruto)}</b></div>
            ${g.brezCene ? `<div class="fak-tot-r"><span class="fak-warn">${fakBrezCene(g)}</span><b></b></div>` : ''}` : '';
    // Pod imenom: ena siva vrstica (listi · kosi · teža) in ENO glavno število z oznako — znesek z DDV
    // (brez cenika: kosi). Prej sta bili teža in znesek enako veliki drug ob drugem in brez oznake, »—« za manjkajočo težo.
    const meta = [sklonListov(g.listov)].concat(money ? [sklonKosov(g.kosov)] : []).concat(g.kg ? [tezaFmt(g.kg)] : [])
      .concat(g.izredni ? [stevilo(g.izredni) + '× izredni prevoz'] : []).map(t => '<span>' + t + '</span>').join('');   // ločila » · « nariše CSS (na začetku vrstice skrita)
    const glavno = money ? `<b>${cenaFmt(g.bruto)}</b> <span>z DDV</span>` : `<b>${sklonKosov(g.kosov)}</b>`;
    return `<div class="fak-card" data-org="${escape_(String(g.org_id || ''))}" style="${naslovnica(null, g.org_id)}" role="button" tabindex="0" aria-label="${escape_(ime)} — osnova za račun">
      <div class="fak-card-h" data-faktoggle="${gi}">
        <div class="fak-card-info"><h3>${escape_(ime)}</h3><p class="u-sub fak-meta">${meta}</p><p class="fak-noga">${glavno}</p></div>
        <span class="fak-chev" aria-hidden="true">›</span>
      </div>
      <div class="fak-body" id="fakbody${gi}">
        <div class="fak-inner">
          ${head}
          <div class="fak-lines${money ? ' fak-lines-m' : ' fak-lines-nm'}">${rows}</div>
          <div class="fak-tot">
            ${g.neskladje ? `<div class="fak-tot-r"><span class="fak-warn">${fakNeskladje(g)}</span><b></b></div>` : ''}
            <div class="fak-tot-r"><span>Skupaj kosov</span><b>${stevilo(g.kosov)}</b></div>
            <div class="fak-tot-r"><span>Skupaj teža perila</span><b>${fakKg(g.kg)}</b></div>
            ${prevoz}
            ${denar}
          </div>
          <div class="fak-body-acts"><button type="button" class="btn-mini fak-print" data-fakprint="${gi}" title="Natisni osnovo za račun">${IKO_TISK}Osnova za račun</button></div>
        </div>
      </div>
    </div>`;
  }
  // Osnova za račun: vsaka stranka na svojem listu A4 (glava z logotipom enkrat, na vrhu lista).
  function fakSekcijaHtml(g, od, doo) {
    const org = ORGSEZNAM.find(o => o.id === g.org_id) || {};
    const naziv = org.legal_name || org.name || ORGIME[g.org_id] || '—';
    const naslov = [org.address, org.vat_id ? 'ID za DDV: ' + org.vat_id : ''].filter(Boolean).join(' · ');
    const money = !!g.cenikOn;
    const post = g.postavke || Object.entries(g.artikli).map(([nm, q]) => ({ nm, q, cena: null, znesek: null }));
    const kolonc = money ? 4 : 2;
    const rows = post.length ? post.map(p => money
      ? `<tr><td class="an">${escape_(p.nm)}</td><td class="r">${p.cena != null ? cenaFmt(p.cena) : '—'}</td><td class="r b">${stevilo(p.q)}</td><td class="r b">${p.znesek != null ? cenaFmt(p.znesek) : '—'}</td></tr>`
      : `<tr><td class="an">${escape_(p.nm)}</td><td class="r b">${stevilo(p.q)}</td></tr>`).join('') : `<tr><td class="an" colspan="${kolonc}" style="color:var(--mid)">Ni postavk</td></tr>`;
    const tot = `<div><span>Skupaj kosov</span><b>${stevilo(g.kosov)}</b></div><div><span>Skupaj teža perila</span><b>${fakKg(g.kg)}</b></div>` +
      (money ? `<div><span>Neto skupaj</span><b>${cenaFmt(g.neto)}</b></div><div><span>DDV (22 %)</span><b>${cenaFmt(g.ddv)}</b></div><div class="bruto"><span>Za plačilo (z DDV)</span><b>${cenaFmt(g.bruto)}</b></div>` : '');
    return `<section>
      <div class="sc-box sc-num"><span>Osnova za račun</span><span class="sc-obd">${datum(od)} – ${datum(doo)}</span></div>
      <div class="sc-box sc-client"><div class="cl"><div><b>Naročnik storitve:</b> <span class="cname">${escape_(naziv)}</span></div>${naslov ? '<div class="sc-addr">' + escape_(naslov) + '</div>' : ''}<div class="sc-dates">${sklonListov(g.listov)} · ${fakPrevozi(g)}</div></div></div>
      <table class="sc-table"><thead>${money
        ? '<tr><th class="l">Naziv artikla</th><th class="r">Cena/kos</th><th class="r">Količina</th><th class="r">Znesek</th></tr>'
        : '<tr><th class="l">Naziv artikla</th><th class="r">Količina (kos)</th></tr>'}</thead><tbody>${rows}</tbody></table>
      <div class="sc-tot">${tot}</div>
      ${fakOpozorila(g, money).map(t => `<div class="sc-pozor">${escape_(t)}</div>`).join('')}
    </section>`;
  }
  function fakDokumentHtml(skupine, od, doo, naslovDok) {
    return dokHtml(naslovDok || 'Osnova za račun', skupine.map(g => fakSekcijaHtml(g, od, doo)));
  }
  function natisniFakturo(gi) {
    if (!FAK_ZADNJI || !FAK_ZADNJI.skupine[gi]) return;
    const g = FAK_ZADNJI.skupine[gi];
    predogledDokument({
      naslov: 'Osnova za račun · ' + (ORGIME[g.org_id] || ''),
      docHtml: fakDokumentHtml([g], FAK_ZADNJI.od, FAK_ZADNJI.doo, 'Osnova za račun'),
      pdf: function () { return fakPdfDownload([g], FAK_ZADNJI.od, FAK_ZADNJI.doo); }
    });
  }

  /* ══════════ PDF (pravi prenos, brez knjižnice — pdfgen.js) ══════════ */
  /* pdfgen.js se naloži ŠELE ob prvi uporabi (~80 kB manj ob vsakem zagonu).
     index.html ga namenoma ne nalaga — brez tega nalagalnika PDF ne deluje. */
  var _pdfP = null;
  function naloziSkript(pot) {
    return new Promise(function (resolve, reject) {
      var sc = document.createElement('script');
      sc.src = pot; sc.onload = resolve;
      sc.onerror = function () { reject(new Error(pot + ' se ni naložil')); };
      document.head.appendChild(sc);
    });
  }
  function zagotoviPdf() {
    if (typeof PDFDoc !== 'undefined' && window.SpremniPdf) return Promise.resolve(true);
    if (_pdfP) return _pdfP;
    _pdfP = (typeof PDFDoc !== 'undefined' ? Promise.resolve() : naloziSkript('pdfgen.js'))
      .then(function () { return window.SpremniPdf ? null : naloziSkript('spremni-pdf.js'); })
      .then(function () {
        if (typeof PDFDoc === 'undefined' || !window.SpremniPdf) throw new Error('PDF modula nista na voljo');
        pdfPovezi(); return true;
      });
    _pdfP.catch(function () { _pdfP = null; });
    return _pdfP;
  }
  // PDF iz graditeljev (spremni listi, fakture, ure, kg) gre v prenos — razen ko ga predogled
  // zajame kot datoteko (pdfKotDatoteka) za meni Deli na iPhonu (tam window.print() ne deluje).
  var _pdfZajem = null;
  function pdfIzhod(doc, ime) {
    if (_pdfZajem) { var z = _pdfZajem; _pdfZajem = null; z(new File([doc.build()], ime, { type: 'application/pdf' })); return; }
    doc.save(ime);
  }
  function pdfKotDatoteka(gradi) {
    return new Promise(function (resolve, reject) {
      _pdfZajem = resolve;
      Promise.resolve().then(gradi).then(function () {
        if (_pdfZajem === resolve) { _pdfZajem = null; reject(new Error('PDF ni nastal')); }
      }, function (e) { if (_pdfZajem === resolve) _pdfZajem = null; reject(e); });
    });
  }
  async function pdfPripravljen() {
    try { await zagotoviPdf(); return true; }
    catch (e) { toast('PDF modula ni bilo mogoče naložiti. Preveri povezavo in poskusi znova.'); return false; }
  }
  // Okvir z naslovom dokumenta (.sc-box.sc-num): levo naslov, desno (neobvezno) obdobje.
  function dpdfNaslovOkvir(doc, y, levo, desno) {
    var h = 10 * PT * 2 + 13 * 1.2 * PT;
    dpdfOkvir(doc, y, h);
    var osn = dpdfOsnova(y + 10 * PT, 13 * PT, 13 * 1.2 * PT);
    doc.text(DPDF.M + 14 * PT, osn, levo, { size: 13 * PT, bold: true, color: DPDF.INK });
    if (desno) doc.text(doc.W - DPDF.M - 14 * PT, osn, desno, { size: 11 * PT, weight: 600, color: DPDF.SIVA, align: 'right' });
    return y + h + 10 * PT;
  }
  function dpdfSestevkiVisina(vrstice) {
    var h = 12 * PT;
    vrstice.forEach(function (v) { h += v.bruto ? 4 * PT + 1.5 * PT + 8 * PT + 13 * 1.2 * PT + 5 * PT : 10 * PT + 11 * PT * 1.2 + 1 * PT; });
    return h;
  }
  // Seštevki (.sc-tot): desna polovica, vrstice z oznako in vrednostjo; zadnja (bruto) poudarjena.
  function dpdfSestevki(doc, y, vrstice) {
    var R = doc.W - DPDF.M, L = R - (doc.W - 2 * DPDF.M) * 0.55, fs = 11 * PT;
    y += 12 * PT;
    vrstice.forEach(function (v) {
      if (v.bruto) {
        y += 4 * PT; doc.line(L, y + 0.56, R, y + 0.56, { width: 1.5 * PT, color: DPDF.INK }); y += 1.5 * PT;
        var o = dpdfOsnova(y + 8 * PT, 13 * PT, 13 * 1.2 * PT);
        doc.text(L + 8 * PT, o, v.l, { size: 13 * PT, bold: true, color: DPDF.INK });
        doc.text(R - 8 * PT, o, v.v, { size: 13 * PT, bold: true, align: 'right', color: DPDF.INK });
        y += 8 * PT + 13 * 1.2 * PT + 5 * PT;
      } else {
        var os = dpdfOsnova(y + 5 * PT, fs, fs * 1.2);
        doc.text(L + 8 * PT, os, v.l, { size: fs, color: DPDF.SIVA });
        doc.text(R - 8 * PT, os, v.v, { size: fs, bold: true, align: 'right', color: DPDF.INK });
        y += 10 * PT + fs * 1.2;
        doc.line(L, y + 0.37, R, y + 0.37, { width: 1 * PT, color: DPDF.CRTA }); y += 1 * PT;
      }
    });
    return y;
  }
  function dpdfOdstavek(doc, y, besedilo, o) {
    var M = DPDF.M, maxW = doc.W - 2 * M, fs = o.size || 10 * PT;
    dpdfVrstice(doc, besedilo, fs, maxW, o).forEach(function (vr) {
      if (!dpdfProstor(doc, y, fs * 1.4)) y = dpdfNovaStran(doc);
      doc.text(M, dpdfOsnova(y, fs, fs * 1.4), vr, { size: fs, color: o.color || DPDF.INK, weight: o.weight });
      y += fs * 1.4;
    });
    return y;
  }
  // Osnova za račun (fakture) → prava .pdf datoteka, isti slog kot predogled. Vsaka stranka
  // na svojem A4 z glavo (logotip enkrat, na vrhu); nadaljevanje iste stranke je brez glave.
  async function fakPdfDownload(skupine, od, doo) {
    if (!(await pdfPripravljen())) return;
    var doc = new PDFDoc();
    var M = DPDF.M, R = doc.W - M, y;
    skupine.forEach(function (g) {
      var money = !!g.cenikOn, post = g.postavke || [];
      doc.addPage(); y = dpdfGlava(doc);
      var org = ORGSEZNAM.find(function (o) { return o.id === g.org_id; }) || {};
      var naziv = org.legal_name || org.name || ORGIME[g.org_id] || '—';
      var naslov = [org.address, org.vat_id ? 'ID za DDV: ' + org.vat_id : ''].filter(Boolean).join(' · ');
      y = dpdfNaslovOkvir(doc, y, 'Osnova za račun', datum(od) + ' – ' + datum(doo));
      var vr = [];
      if (naslov) vr.push({ t: naslov, razmik: 6 * PT });
      vr.push({ t: sklonListov(g.listov) + ' · ' + fakPrevozi(g), razmik: naslov ? 4 * PT : 10 * PT });
      y = dpdfNarocnik(doc, y, naziv, '', vr, false);
      var cZ = R - 8 * PT, cK = cZ - 92, cC = cK - 92;
      var st = money ? [{ t: 'Naziv artikla', x: M + 8 * PT }, { t: 'Cena/kos', x: cC, align: 'right' }, { t: 'Količina', x: cK, align: 'right' }, { t: 'Znesek', x: cZ, align: 'right' }]
        : [{ t: 'Naziv artikla', x: M + 8 * PT }, { t: 'Količina (kos)', x: cZ, align: 'right' }];
      var sk = [{ l: 'Skupaj kosov', v: stevilo(g.kosov) }, { l: 'Skupaj teža perila', v: fakKg(g.kg) }];
      if (money) sk.push({ l: 'Neto skupaj', v: cenaFmt(g.neto) }, { l: 'DDV (22 %)', v: cenaFmt(g.ddv) }, { l: 'Za plačilo (z DDV)', v: cenaFmt(g.bruto), bruto: true });
      var vrs = post.length ? post.map(function (p) {
        var cel = [{ t: p.nm, x: M + 8 * PT, w: 600 }];
        if (money) cel.push({ t: p.cena != null ? cenaFmt(p.cena) : '—', x: cC, align: 'right' }, { t: stevilo(p.q), x: cK, align: 'right', w: 700 }, { t: p.znesek != null ? cenaFmt(p.znesek) : '—', x: cZ, align: 'right', w: 700 });
        else cel.push({ t: stevilo(p.q), x: cZ, align: 'right', w: 700 });
        return cel;
      }) : [[{ t: 'Ni postavk', x: M + 8 * PT }]];
      y += 4 * PT; y = dpdfTabGlava(doc, y, st);
      y = dpdfTabela(doc, y, st, vrs, dpdfSestevkiVisina(sk), 'Osnova za račun · ' + (ORGIME[g.org_id] || naziv));
      y = dpdfSestevki(doc, y, sk);
      fakOpozorila(g, money).forEach(function (t, i) { y += (i ? 6 : 10) * PT; y = dpdfOdstavek(doc, y, t, { size: 10 * PT, color: DPDF.POZOR }); });
    });
    pdfIzhod(doc, 'fakture_' + od + '_' + doo + '.pdf');
  }
  // Spremni list → prava .pdf datoteka, isti slog kot predogled (in aplikacija na tablici).
  // En list ali seznam izbranih (Arhiv → Izberi): vsak se začne na svoji strani, ena datoteka.
  async function spremniPdfDownload(boxi) {
    if (!(await pdfPripravljen())) return;
    var seznam = Array.isArray(boxi) ? boxi : [boxi];
    var doc = new PDFDoc();
    seznam.forEach(function (box) { doc.addPage(); spremniPdfStran(doc, box); });
    var ime = function (b) { return String(((b && b._note) || {}).number || 'brez').replace(/[\/\\:]+/g, '-'); };   // »1664/2026« → 1664-2026 (poševnica ni dovoljena v imenu datoteke)
    pdfIzhod(doc, seznam.length === 1 ? 'spremni_list_' + ime(seznam[0]) + '.pdf' : 'spremni_listi_' + ime(seznam[0]) + '_do_' + ime(seznam[seznam.length - 1]) + '.pdf');
  }
  function spremniPdfStran(doc, box) {
    var n = box._note || {}, items = box._items || [];
    var org = ORGSEZNAM.find(function (o) { return o.id === n.org_id; }) || {};
    window.SpremniPdf.stran(doc, {
      stevilka: n.number || '',
      naziv: org.legal_name || org.name || ORGIME[n.org_id] || '—',
      nazivSek: (org.legal_name && org.name && org.name !== org.legal_name) ? org.name : '',
      oddaja: 'Oddaja: ' + datum(n.doc_date) + (n.issued_name ? '  ·  Izdal: ' + n.issued_name : '') + '  ·  ' + (n.transport === 'izredni' ? 'Izredni prevoz' : 'Redni prevoz'),
      postavke: items.map(function (p) { return { naziv: p.naziv, kosov: stevilo(p.kosov) }; }),
      kg: (n.weight_kg != null && n.weight_kg !== '') ? tezaFmt(n.weight_kg) : '',
      opomba: n.opomba_stranka || '',   // tiska se SAMO opomba za stranko (interna ostane v portalu)
    });
  }

  /* ══════════ TISK V GLAVNEM OKNU (telefoni, tablice) ══════════
     Iz iframe-a natisne dokument pravilno le brskalnik na računalniku. Safari na iPhonu/iPadu in
     Chrome na Androidu natisneta portal za predogledom ali prazno stran. Zato je dokument, dokler
     je predogled odprt, tudi v skriti plasti #sc-tisk glavnega okna (shadow DOM — slog portala
     nanj ne vpliva). Pri tisku je vidna samo ta plast (portal.css → html.sc-tisk-on) — tudi ko
     tiskaš iz menija brskalnika (iPhone: Deli → Natisni, računalnik: ⌘P / Ctrl+P). */
  var _tisk = null;
  function jeMobilnaNaprava() {
    var ua = navigator.userAgent || '';
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);   // iPad se predstavi kot Mac
  }
  // iPhone / iPad, portal kot aplikacija na začetnem zaslonu: iOS tam window.print() prezre
  // (preverjeno v simulatorju iOS 27: ni dialoga, ni dogodka beforeprint — tudi takoj ob dotiku).
  function jeIosSam() {
    var ua = navigator.userAgent || '';
    var ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    var sam = navigator.standalone === true || !!(window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    return ios && sam;
  }
  // Pozdrav na Domov (prej »Pozdravljen/a« — poševnica je delovala nedokončano)
  function pozdrav() { var h = new Date().getHours(); return h < 10 ? 'Dobro jutro' : h < 18 ? 'Dober dan' : 'Dober večer'; }
  function tiskNativni() { try { var C = window.Capacitor; return (C && C.Plugins && C.Plugins.PralnicaPrint) || null; } catch (e) { return null; } }
  function tiskPlastPostavi(docHtml) {
    tiskPlastOdstrani();
    try {
      var d = new DOMParser().parseFromString(docHtml || '', 'text/html');
      var css = Array.prototype.map.call(d.querySelectorAll('style'), function (s) { return s.textContent; }).join('\n');
      var glob = [];
      // @font-face in @page v shadow DOM ne delujeta → v glavni dokument.
      css = css.replace(/@font-face\s*\{[^}]*\}/g, function (m) { glob.push(m); return ''; })
        .replace(/@page\s*\{[^}]*\}/g, function (m) { glob.push(m); return ''; })
        // html / body dokumenta → ovoja v plasti
        .replace(/(^|[\s,{}>+~(])(html|body)(?=[\s,{.:#\[>+~)])/g, '$1.dok-$2');
      var slog = document.createElement('style'); slog.id = 'sc-tisk-slog'; slog.textContent = glob.join('\n');
      document.head.appendChild(slog);
      var host = document.createElement('div'); host.id = 'sc-tisk'; host.setAttribute('aria-hidden', 'true');
      host.attachShadow({ mode: 'open' }).innerHTML = '<style>:host{all:initial;display:block}' + css + '</style><div class="dok-html"><div class="dok-body">' + d.body.innerHTML + '</div></div>';
      document.body.appendChild(host);
      document.documentElement.classList.add('sc-tisk-on');
      _tisk = { host: host, slog: slog };
    } catch (e) { tiskPlastOdstrani(); }
  }
  function tiskPlastOdstrani() {
    document.documentElement.classList.remove('sc-tisk-on');
    if (_tisk) { [_tisk.host, _tisk.slog].forEach(function (n) { if (n && n.parentNode) n.parentNode.removeChild(n); }); }
    _tisk = null;
  }
  // Pisave dokumenta (logotip!) morajo biti naložene pred tiskom — nikoli nadomestna pisava.
  function tiskPisave() {
    var f = document.fonts; if (!f || !f.load) return Promise.resolve();
    var t = 'SmartClean AaČčŠšŽž0123';
    try { if (f.check('400 12px Archivo', t) && f.check('700 12px Archivo', t) && f.check('700 32px "Playfair Display"', t)) return null; } catch (e) {}
    var vse = Promise.all([f.load('400 12px Archivo', t), f.load('700 12px Archivo', t), f.load('700 32px "Playfair Display"', t)]).then(function () { return f.ready; });
    return Promise.race([vse, new Promise(function (r) { setTimeout(r, 4000); })]).catch(function () {});
  }
  function tiskGlavno() {
    if (!_tisk) { toast('Tiskanje ni uspelo — zapri predogled in poskusi znova.'); return; }
    var tiskaj = function () { try { window.print(); } catch (e) { toast('Tiskanje ni uspelo.'); } };
    var p = tiskPisave();
    if (!p) { tiskaj(); return; }   // pisave so že naložene: dialog takoj (prej 2–3 s čakanja)
    p.then(tiskaj);
  }

  /* ══════════ PREDOGLED DOKUMENTA (skupni pop-up: natisni / shrani) ══════════ */
  function predogledDokument(opt) {
    opt = opt || {};
    var back = document.createElement('div'); back.className = 'sc-modal-back';
    var xlsxBtn = opt.xlsx ? '<button type="button" class="sc-modal-btn primary" data-xlsx title="Shrani kot Excel">' + IKO_PRENOS + 'Excel</button>' : '';
    var pdfBtn = opt.pdf ? '<button type="button" class="sc-modal-btn primary" data-pdf title="Shrani kot PDF">' + IKO_PRENOS + 'PDF</button>' : '';
    back.innerHTML = '<div class="sc-modal doc-modal" role="dialog" aria-modal="true">' +
      '<div class="doc-head"><h4></h4><button type="button" class="doc-x" aria-label="Zapri">' + IKO_ZAPRI + '</button></div>' +
      '<div class="doc-stage"><div class="doc-scaler"><iframe class="doc-frame" title="Predogled"></iframe></div></div>' +
      '<div class="sc-modal-acts doc-acts"><button type="button" class="sc-modal-btn ghost doc-tisk" data-print title="Natisni" aria-label="Natisni">' + IKO_TISK + '</button>' + xlsxBtn + pdfBtn + '</div></div>';
    back.querySelector('h4').textContent = opt.naslov || 'Predogled';
    document.body.appendChild(back);
    var fr = back.querySelector('.doc-frame');
    var scaler = back.querySelector('.doc-scaler');
    var stage = back.querySelector('.doc-stage');
    var A4W = 794;   // 210 mm @ 96 dpi
    function prilagodiA4() {
      try {
        var doc = fr.contentDocument; if (!doc || !doc.body) return;
        var ch = Math.max(doc.body.scrollHeight, 1123);   // vsaj ena A4 stran
        fr.style.width = A4W + 'px'; fr.style.height = ch + 'px'; fr.style.transformOrigin = 'top left';
        var cs = getComputedStyle(stage);
        var sw = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        var k = sw / A4W; if (!isFinite(k) || k <= 0) k = 1; if (k > 1.8) k = 1.8;   // po širini (večji, z drsenjem)
        fr.style.transform = 'scale(' + k + ')';
        scaler.style.width = (A4W * k) + 'px'; scaler.style.height = (ch * k) + 'px';
      } catch (e) {}
    }
    fr.addEventListener('load', function () { prilagodiA4(); setTimeout(prilagodiA4, 60); });
    window.addEventListener('resize', prilagodiA4);
    fr.srcdoc = opt.docHtml || '';
    tiskPlastPostavi(opt.docHtml);
    // Aplikacija na začetnem zaslonu iPhona: tisk in PDF gresta prek menija Deli (»Natisni«,
    // »Shrani v Datoteke«). PDF se pripravi takoj ob odprtju predogleda, ker iOS meni Deli
    // odpre le neposredno ob dotiku — ne po čakanju na izdelavo PDF-ja.
    var iosDeli = !tiskNativni() && jeIosSam() && !!opt.pdf && !!navigator.share;
    var pdfDat = null, pdfNapaka = null;
    if (iosDeli) {
      back.querySelectorAll('[data-print],[data-pdf]').forEach(function (b) { b.disabled = true; b.classList.add('nalaga'); });
      pdfKotDatoteka(opt.pdf).then(function (f) { pdfDat = f; }, function (e) { pdfNapaka = e; })
        .then(function () { back.querySelectorAll('[data-print],[data-pdf]').forEach(function (b) { b.disabled = false; b.classList.remove('nalaga'); }); });
    }
    function deliPdf() {
      if (!pdfDat) { toast(pdfNapaka ? 'PDF ni uspel: ' + (pdfNapaka.message || pdfNapaka) : 'PDF se še pripravlja …'); return; }
      if (navigator.canShare && !navigator.canShare({ files: [pdfDat] })) { toast('Ta naprava ne zna deliti PDF-ja.'); return; }
      navigator.share({ files: [pdfDat], title: opt.naslov || 'SmartClean' }).catch(function (e) {
        if (e && e.name !== 'AbortError') toast('Meni Deli se ni odprl: ' + (e.message || e.name));
      });
    }
    requestAnimationFrame(function () { back.classList.add('show'); setTimeout(prilagodiA4, 40); });
    var done = false;
    function zapri() { if (done) return; done = true; tiskPlastOdstrani(); window.removeEventListener('resize', prilagodiA4); back.classList.remove('show'); document.removeEventListener('keydown', onKey); setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); }
    function onKey(e) { if (e.key === 'Escape') zapri(); }
    back.querySelector('.doc-x').addEventListener('click', zapri);
    back.addEventListener('click', function (e) { if (e.target === back) zapri(); });
    document.addEventListener('keydown', onKey);
    back.querySelector('[data-print]').addEventListener('click', function () {
      if (iosDeli) { deliPdf(); return; }
      // Aplikacija na tablici: domači tisk Androida (WebView window.print() ne pozna).
      var P = tiskNativni();
      if (!P && jeIosSam()) { toast('Na začetnem zaslonu iPhona tega dokumenta ni mogoče natisniti — odpri portal v Safariju.'); return; }
      if (P) { P.print({ html: opt.docHtml || '', jobName: opt.naslov || 'SmartClean' }).catch(function () { toast('Tiskanje ni uspelo.'); }); return; }
      // Telefon / tablica v brskalniku: tisk glavnega okna (iz iframe-a ne deluje).
      if (jeMobilnaNaprava()) { tiskGlavno(); return; }
      // Računalnik: iframe (preverjeno). Natisni šele, ko so pisave dokumenta (tudi logotip) naložene.
      var natisni = function () { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { tiskGlavno(); } };
      try { var fd = fr.contentDocument && fr.contentDocument.fonts; if (fd && fd.ready) { fd.ready.then(natisni, natisni); return; } } catch (e) {}
      natisni();
    });
    var pb = back.querySelector('[data-pdf]');
    if (pb) pb.addEventListener('click', async function () {
      if (!opt.pdf) return;
      if (iosDeli) { deliPdf(); return; }
      var t = this.textContent; this.disabled = true; this.textContent = 'Pripravljam …';
      try { await opt.pdf(); } catch (e) { toast('PDF ni uspel: ' + (e && e.message ? e.message : e)); }
      this.disabled = false; this.textContent = t;
    });
    var xb = back.querySelector('[data-xlsx]');
    if (xb) xb.addEventListener('click', function () { try { opt.xlsx(); } catch (e) { toast('Excel ni uspel.'); } });
    document.addEventListener('keydown', onKey);
  }
  // ── Izvoz (Excel / PDF): pojavno okno z izbiro obdobja in strank ──
  // Predogled Excel vsebine kot HTML tabele (za pop-up predogled).
  function fakXlsxPreviewHtml(skupine, od, doo) {
    const obd = datum(od) + ' – ' + datum(doo);
    const anyMoney = skupine.some(g => g.cenikOn);
    const nd = n => escape_(String(n));
    const kgSt = n => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });   // kot v datoteki: stolpec je v kg, ne v t
    let povR = '';
    let sL = 0, sK = 0, sKg = 0, sN = 0, sD = 0, sB = 0;
    skupine.forEach(g => {
      const ime = ORGIME[g.org_id] || 'Brez stranke';
      sL += g.listov; sK += g.kosov; sKg += g.kg;
      let r = '<tr><td>' + nd(ime) + '</td><td class="n">' + stevilo(g.listov) + '</td><td class="n">' + stevilo(g.kosov) + '</td><td class="n">' + nd(kgSt(g.kg)) + '</td>';
      if (anyMoney) {
        sN += g.neto || 0; sD += g.ddv || 0; sB += g.bruto || 0;
        r += '<td class="n">' + (g.cenikOn ? nd(cenaFmt(g.neto)) : '—') + '</td><td class="n">' + (g.cenikOn ? nd(cenaFmt(g.ddv)) : '—') + '</td><td class="n">' + (g.cenikOn ? nd(cenaFmt(g.bruto)) : '—') + '</td>';
      }
      povR += r + '</tr>';
    });
    let povHead = '<tr><th>Stranka</th><th class="n">Spr. listov</th><th class="n">Kosov</th><th class="n">Teža (kg)</th>' + (anyMoney ? '<th class="n">Neto</th><th class="n">DDV</th><th class="n">Za plačilo z DDV</th>' : '') + '</tr>';
    let povSk = '<tr class="sk"><td>SKUPAJ</td><td class="n">' + stevilo(sL) + '</td><td class="n">' + stevilo(sK) + '</td><td class="n">' + nd(kgSt(sKg)) + '</td>' + (anyMoney ? '<td class="n">' + nd(cenaFmt(sN)) + '</td><td class="n">' + nd(cenaFmt(sD)) + '</td><td class="n">' + nd(cenaFmt(sB)) + '</td>' : '') + '</tr>';
    let listi = '<div class="sheet"><div class="tab">Povzetek</div><table>' + povHead + povR + povSk + '</table></div>';
    skupine.forEach(g => {
      const ime = ORGIME[g.org_id] || 'Brez stranke';
      const money = !!g.cenikOn;
      const post = g.postavke || [];
      let head = money ? '<tr><th>Artikel</th><th class="n">Cena/kos</th><th class="n">Količina</th><th class="n">Znesek</th></tr>' : '<tr><th>Artikel</th><th class="n">Količina</th></tr>';
      let rows = post.length ? post.map(p => money
        ? '<tr><td>' + nd(p.nm) + '</td><td class="n">' + (p.cena != null ? nd(cenaFmt(p.cena)) : '—') + '</td><td class="n">' + stevilo(p.q) + '</td><td class="n">' + (p.znesek != null ? nd(cenaFmt(p.znesek)) : '—') + '</td></tr>'
        : '<tr><td>' + nd(p.nm) + '</td><td class="n">' + stevilo(p.q) + '</td></tr>').join('') : '<tr><td colspan="' + (money ? 4 : 2) + '" class="empty">Brez postavk</td></tr>';
      let tot = money
        ? '<tr class="sk"><td>Skupaj kosov</td><td class="n"></td><td class="n">' + stevilo(g.kosov) + '</td><td class="n"></td></tr>' +
          '<tr class="sk"><td>Teža perila (kg)</td><td class="n"></td><td class="n">' + nd(kgSt(g.kg)) + '</td><td class="n"></td></tr>' +
          '<tr class="sk"><td>Neto skupaj</td><td class="n"></td><td class="n"></td><td class="n">' + nd(cenaFmt(g.neto)) + '</td></tr>' +
          '<tr class="sk"><td>DDV (22 %)</td><td class="n"></td><td class="n"></td><td class="n">' + nd(cenaFmt(g.ddv)) + '</td></tr>' +
          '<tr class="sk bruto"><td>Za plačilo (z DDV)</td><td class="n"></td><td class="n"></td><td class="n">' + nd(cenaFmt(g.bruto)) + '</td></tr>'
        : '<tr class="sk"><td>Skupaj kosov</td><td class="n">' + stevilo(g.kosov) + '</td></tr><tr class="sk"><td>Teža perila (kg)</td><td class="n">' + nd(kgSt(g.kg)) + '</td></tr>';
      // Predogled mora pokazati ISTA opozorila kot shranjena datoteka — sicer
      // uporabnik pregleda predogled, ne vidi težave, in vseeno izvozi prenizko vsoto.
      var opoz = fakOpozorila(g, money).map(function (t) { return '<div class="per">' + nd(t) + '</div>'; }).join('');
      listi += '<div class="sheet"><div class="tab">' + nd(ime) + '</div><div class="per">Obdobje: ' + nd(obd) + '</div><table>' + head + rows + tot + '</table>' + opoz + '</div>';
    });
    return '<!DOCTYPE html><html lang="sl"><head><meta charset="utf-8"><style>' +
      "*{box-sizing:border-box;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#16202b}" +
      'body{margin:0;font-size:12.5px;padding:16px;background:#fff}' +
      '.sheet{margin:0 0 26px}' +
      '.tab{display:inline-block;background:#1a6644;color:#fff;font-weight:700;font-size:11.5px;padding:5px 12px;border-radius:6px 6px 0 0}' +
      '.per{color:#5c6873;font-size:11px;margin:4px 0 6px}' +
      'table{border-collapse:collapse;width:100%}' +
      'th,td{border:1px solid #d7dedb;padding:5px 10px;text-align:left;white-space:nowrap}' +
      'th{background:#eef3f1;font-size:10px;text-transform:uppercase;letter-spacing:.03em}' +
      'td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}' +
      'td.empty{color:#8a97a0;text-align:left}' +
      'tr.sk td{font-weight:700;background:#f6f9f8}' +
      'tr.bruto td{border-top:2px solid #1a6644}' +
      '</style></head><body>' + listi + '</body></html>';
  }
  // Povzetek opozoril za eno stranko — v listu »Povzetek« se takoj vidi, pri
  // kateri stranki je z vsoto kaj narobe, brez odpiranja njenega lista.
  function _fakOpoz(g) { return fakOpozorila(g, !!g.cenikOn).join(' · '); }
  function fakIzvozXlsx(od, doo, skupine) {
    const B = t => ({ v: t, bold: true });          // glava
    const T = t => ({ v: t, s: 2 });                 // krepko besedilo
    const EUR = n => ({ v: Math.round((Number(n) || 0) * 100) / 100, s: 3 });
    const EURb = n => ({ v: Math.round((Number(n) || 0) * 100) / 100, s: 4 });
    const INT = n => ({ v: Number(n) || 0, s: 5 });
    const INTb = n => ({ v: Number(n) || 0, s: 6 });
    const KG = n => ({ v: Math.round((Number(n) || 0) * 100) / 100, s: 7 });
    const KGb = n => ({ v: Math.round((Number(n) || 0) * 100) / 100, s: 8 });
    const obd = datum(od) + ' – ' + datum(doo);
    const anyMoney = skupine.some(g => g.cenikOn);
    const sheets = [];
    // 1) Povzetek — vse stranke skupaj
    let pov = [[{ v: 'Fakture — povzetek', s: 2 }], ['Obdobje:', obd], []];
    pov.push(anyMoney
      ? [B('Stranka'), B('Spr. listov'), B('Kosov'), B('Teža (kg)'), B('Neto'), B('DDV'), B('Za plačilo z DDV'), B('Opozorila')]
      : [B('Stranka'), B('Spr. listov'), B('Kosov'), B('Teža (kg)'), B('Opozorila')]);
    let sL = 0, sK = 0, sKg = 0, sN = 0, sD = 0, sB = 0;
    skupine.forEach(g => {
      const ime = ORGIME[g.org_id] || 'Brez stranke';
      sL += g.listov; sK += g.kosov; sKg += g.kg;
      if (anyMoney) {
        sN += g.neto || 0; sD += g.ddv || 0; sB += g.bruto || 0;
        pov.push([ime, INT(g.listov), INT(g.kosov), KG(g.kg), g.cenikOn ? EUR(g.neto) : '—', g.cenikOn ? EUR(g.ddv) : '—', g.cenikOn ? EUR(g.bruto) : '—', _fakOpoz(g)]);
      } else pov.push([ime, INT(g.listov), INT(g.kosov), KG(g.kg), _fakOpoz(g)]);
    });
    pov.push([]);
    pov.push(anyMoney
      ? [T('SKUPAJ'), INTb(sL), INTb(sK), KGb(sKg), EURb(sN), EURb(sD), EURb(sB)]
      : [T('SKUPAJ'), INTb(sL), INTb(sK), KGb(sKg)]);
    sheets.push({ name: 'Povzetek', rows: pov, freeze: false });
    // 2) Sheet za vsako stranko — celoten izpis artiklov + skupna cena
    skupine.forEach(g => {
      const ime = ORGIME[g.org_id] || 'Brez stranke';
      const money = !!g.cenikOn;
      const post = g.postavke || [];
      let rows = [[{ v: ime + ' — osnova za račun', s: 2 }], ['Obdobje:', obd],
        ['Spremnih listov:', INT(g.listov), '', 'Prevozi:', stevilo(g.redni) + ' redni' + (g.izredni ? ' · ' + stevilo(g.izredni) + ' izredni' : '')], []];
      rows.push(money ? [B('Artikel'), B('Cena/kos'), B('Količina'), B('Znesek')] : [B('Artikel'), B('Količina')]);
      if (post.length) post.forEach(p => {
        rows.push(money
          ? [p.nm, p.cena != null ? EUR(p.cena) : '—', INT(p.q), p.znesek != null ? EUR(p.znesek) : '—']
          : [p.nm, INT(p.q)]);
      });
      else rows.push(['Brez postavk']);
      rows.push([]);
      if (money) {
        rows.push([T('Skupaj kosov'), '', INTb(g.kosov), '']);
        rows.push([T('Teža perila (kg)'), '', KGb(g.kg), '']);
        rows.push([T('Neto skupaj'), '', '', EURb(g.neto)]);
        rows.push([T('DDV (22 %)'), '', '', EURb(g.ddv)]);
        rows.push([T('Za plačilo (z DDV)'), '', '', EURb(g.bruto)]);
      } else {
        rows.push([T('Skupaj kosov'), INTb(g.kosov)]);
        rows.push([T('Teža perila (kg)'), KGb(g.kg)]);
      }
      fakOpozorila(g, money).forEach(function (t) { rows.push([{ v: t, s: 0 }]); });
      sheets.push({ name: ime, rows: rows });
    });
    prenesiXlsx('fakture_' + od + '_' + doo + '.xlsx', sheets);
  }
  function fakIzvozModal(nacin) {
    const orgs = ORGSEZNAM.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'sl', { sensitivity: 'base' }));
    const pad = n => String(n).padStart(2, '0');
    const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    let od0 = ($('fakOd') && $('fakOd').value) || '', do0 = ($('fakDo') && $('fakDo').value) || '';
    if (!od0 || !do0) { const z = new Date(); od0 = iso(new Date(z.getFullYear(), z.getMonth(), 1)); do0 = iso(z); }
    const jePdf = nacin === 'pdf';
    const back = document.createElement('div'); back.className = 'sc-modal-back';
    const checks = orgs.map(o => `<label class="fx-cli"><input type="checkbox" class="fx-org" value="${escape_(o.id)}" checked><span>${escape_(o.name)}</span></label>`).join('') || '<p class="u-sub">Ni strank.</p>';
    back.innerHTML = '<div class="sc-modal sc-modal-wide" role="dialog" aria-modal="true">'
      + '<h4>' + (jePdf ? 'Izvoz v PDF — osnova za račun' : 'Izvoz v Excel') + '</h4>'
      + '<div class="fx-dates"><label>Od<input type="date" class="sc-modal-input fx-od"></label><label>Do<input type="date" class="sc-modal-input fx-do"></label></div>'
      + '<div class="fx-cli-head"><span>Stranke</span><label class="fx-all"><input type="checkbox" class="fx-vse" checked><span>Vse</span></label></div>'
      + '<div class="fx-cli-list">' + checks + '</div>'
      + '<div class="fx-msg msg"></div>'
      + '<div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" data-no>Prekliči</button><button type="button" class="sc-modal-btn primary" data-yes>' + (jePdf ? 'Predogled' : 'Izvozi Excel') + '</button></div>'
      + '</div>';
    document.body.appendChild(back);
    const odI = back.querySelector('.fx-od'), doI = back.querySelector('.fx-do');
    odI.value = od0; doI.value = do0;
    const vse = back.querySelector('.fx-vse');
    const orgi = () => Array.prototype.slice.call(back.querySelectorAll('.fx-org'));
    vse.addEventListener('change', () => orgi().forEach(c => { c.checked = vse.checked; }));
    back.querySelector('.fx-cli-list').addEventListener('change', () => { vse.checked = orgi().every(c => c.checked); });
    requestAnimationFrame(() => back.classList.add('show'));
    let done = false;
    function zapri() { if (done) return; done = true; back.classList.remove('show'); document.removeEventListener('keydown', onKey); setTimeout(() => { if (back.parentNode) back.parentNode.removeChild(back); }, 180); }
    function onKey(e) { if (e.key === 'Escape') zapri(); }
    back.querySelector('[data-no]').addEventListener('click', zapri);
    back.addEventListener('click', e => { if (e.target === back) zapri(); });
    document.addEventListener('keydown', onKey);
    const msg = back.querySelector('.fx-msg');
    back.querySelector('[data-yes]').addEventListener('click', async function () {
      const od = odI.value, doo = doI.value;
      if (!fakDatumOK(od, doo)) { msg.className = 'fx-msg msg bad show'; msg.textContent = 'Datum »od« mora biti pred datumom »do«.'; return; }
      const izbrani = orgi().filter(c => c.checked).map(c => c.value);
      if (!izbrani.length) { msg.className = 'fx-msg msg bad show'; msg.textContent = 'Izberi vsaj eno stranko.'; return; }
      const vseIzbrane = izbrani.length === orgi().length;
      const btn = this; btn.disabled = true; btn.textContent = 'Pripravljam …';
      msg.className = 'fx-msg msg'; msg.textContent = '';
      const res = await fakZberi(od, doo, vseIzbrane ? null : izbrani);
      btn.disabled = false; btn.textContent = jePdf ? 'Predogled' : 'Izvozi Excel';
      if (res.error) { msg.className = 'fx-msg msg bad show'; msg.textContent = napakaBesedilo(res.error); return; }
      const skupine = res.skupine || [];
      if (!skupine.length) { msg.className = 'fx-msg msg bad show'; msg.textContent = 'V izbranem obdobju ni spremnih listov.'; return; }
      zapri();
      if (jePdf) {
        predogledDokument({
          naslov: 'Osnova za račun — ' + (vseIzbrane ? 'vse stranke' : (izbrani.length + ' strank')),
          docHtml: fakDokumentHtml(skupine, od, doo, 'Osnova za račun'),
          pdf: function () { return fakPdfDownload(skupine, od, doo); }
        });
      } else {
        predogledDokument({
          naslov: 'Izvoz v Excel — ' + (vseIzbrane ? 'vse stranke' : (izbrani.length + ' strank')),
          docHtml: fakXlsxPreviewHtml(skupine, od, doo),
          xlsx: function () { fakIzvozXlsx(od, doo, skupine); }
        });
      }
    });
  }

  /* ══════════ NASTAVITVE ══════════ */
  /* ══════════ CENIKI ══════════ */
  let CENIK = null;
  let CENIKMAP = null;
  let CLANI = null; // članstva: povezave stranka↔artikel (articles), za skupni katalog
  let _cenikPreCount = {};
  let _cenikOpen = {};
  const DDV_STOPNJA = 0.22;
  function cenaFmt(n) { return (Number(n) || 0).toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
  // Preimenuj artikel povsod: članstva + arhivske postavke zadnjih 3 mesecev (ID ostane isti).
  async function posodobiImeArtikla(sifra, nm) {
    var pr = await sb.rpc('posodobi_ime_artikla', { p_sifra: sifra, p_ime: nm });
    if (pr && pr.error) { await sb.from('articles').update({ name: nm }).eq('cena_sifra', sifra); }
    if (CLANI) CLANI.forEach(function (a) { if (a.cena_sifra === sifra) a.name = nm; });
    pozabiPostavke();   // postavke listov so v pomnilniku s starim imenom — ob naslednjem odprtju se preberejo znova
  }
  // Isti artikel (ID) sme biti na spremnem listu le 1×: podvojene združi (sešteje kose).
  function zdruziPodvojene(arr) {
    var videni = {}, out = [];
    (arr || []).forEach(function (p) {
      var kljuc = (p.sifra != null && !isNaN(p.sifra)) ? ('s' + p.sifra) : (p.artId ? ('a' + p.artId) : ('n' + (p.naziv || '').trim().toLowerCase()));
      if (videni[kljuc]) { videni[kljuc].kosov = (videni[kljuc].kosov || 0) + (p.kosov || 0); }
      else { videni[kljuc] = p; out.push(p); }
    });
    return out;
  }
  var CENIK_RX = /^([A-ZČŠŽĐ][A-ZČŠŽĐ0-9.\s]*?)\s*-\s+\S/;
  function cenikSkupina(naziv) { var m = (naziv || '').match(CENIK_RX); return m ? m[1].trim() : null; }
  function zgradiCenikMap() {
    CENIKMAP = {}; _cenikPreCount = {};
    (CENIK || []).forEach(function (x) {
      CENIKMAP[x.sifra] = x;
      if (!(x.org_id && ORGIME[x.org_id])) { var p = cenikSkupina(x.naziv); if (p) _cenikPreCount[p] = (_cenikPreCount[p] || 0) + 1; }
    });
  }
  function cenikGroupKey(x) {
    if (x.org_id && ORGIME[x.org_id]) return 'org:' + x.org_id;
    return 'splosno';
  }
  // Vrstni red strank: skupna nastavitev (ureja se v Strankah), Cenik jo lahko lokalno prepiše.
  function custOrderMode() { try { return localStorage.getItem('sc-cust-order') || 'promet'; } catch (e) { return 'promet'; } }
  function cenikOrderMode() { try { return localStorage.getItem('sc-cenik-order') || 'sledi'; } catch (e) { return 'sledi'; } }
  function razvrstiStranke(list, mode, kgm) {
    var arr = list.slice();
    if (mode === 'abeceda') {
      arr.sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'sl', { sensitivity: 'base' }); });
    } else {
      arr.sort(function (a, b) { return ((kgm && kgm[b.id]) || 0) - ((kgm && kgm[a.id]) || 0) || (a.name || '').localeCompare(b.name || '', 'sl', { sensitivity: 'base' }); });
    }
    return arr;
  }
  function cenikSort(a, b) {
    var sa = a.sort_order, sb2 = b.sort_order;
    if (sa != null && sb2 != null && sa !== sb2) return sa - sb2;
    if (sa != null && sb2 == null) return -1;
    if (sa == null && sb2 != null) return 1;
    return (a.naziv || '').localeCompare(b.naziv || '', 'sl');
  }
  async function nalozicenik(force) {
    if (CENIK && CENIKMAP && !force) return { ok: true };
    return deli('cenik', _naloziCenik);
  }
  async function _naloziCenik() {
    for (var i = 0; i < 2; i++) {
      var g = DELI_GEN, r = await vseVrstice(function (a, b) { return sb.from('pricelist').select('sifra,koda,naziv,em,cena1,cena2,teza,org_id,sort_order,deleted_at,cena_potrjena').is('deleted_at', null).order('naziv').range(a, b); });
      if (r.error) {
        var r2 = await vseVrstice(function (a, b) { return sb.from('pricelist').select('sifra,koda,naziv,em,cena1,cena2').order('naziv').range(a, b); });
        if (r2.error) return { ok: false, missing: true, error: r2.error };   // deli() napake ne hrani
        if (g !== DELI_GEN && i === 0) continue;
        CENIK = (r2.data || []).map(function (x) { return Object.assign({ org_id: null, sort_order: null }, x); });
        zgradiCenikMap(); return { ok: true, noext: true };
      }
      if (g !== DELI_GEN && i === 0) continue;   // med branjem se je kaj zapisalo → še enkrat
      CENIK = r.data || []; zgradiCenikMap(); return { ok: true };
    }
  }
  // Naloži VSE vrstice (Supabase privzeto vrne le 1000) — po straneh.
  async function vseVrstice(qFn) {
    var all = [], od = 0, kos = 1000;
    while (true) {
      var r = await qFn(od, od + kos - 1);
      if (r.error) return { error: r.error, data: all };
      var d = r.data || [];
      all = all.concat(d);
      if (d.length < kos) break;
      od += kos;
    }
    return { data: all };
  }
  async function naloziClane(force) {
    if (CLANI && !force) return CLANI;
    return deli('clani', async function () {
      for (var i = 0; i < 2; i++) {
        var g = DELI_GEN, r = await vseVrstice(function (a, b) { return sb.from('articles').select('id,org_id,name,cena_sifra,sort_order,teza').order('id').range(a, b); });
        if (r.error) return { error: r.error };   // dosedanji artikli ostanejo; deli() napake ne hrani
        if (g === DELI_GEN || i === 1) { CLANI = r.data || []; return CLANI; }   // med branjem se je kaj zapisalo → še enkrat (ne prepiši pravkar shranjenega)
      }
    });
  }
  function produktPoId(id) { id = normId(id); if (!id || !CENIK) return null; return CENIK.find(function (x) { return normId(x.koda) === id; }) || null; }
  async function naloziArtMap(orgFilter) {
    // Vsi artikli (po straneh, ne le 1000) — iz skupnega seznama, ki si ga v 8 s delijo Statistika, Fakture in Artikli.
    // Vrstni red po id kot prej v poizvedbi: pri dveh artiklih stranke z istim imenom obvelja zadnji.
    await naloziClane(true);
    const data = (CLANI || []).filter(function (a) { return !orgFilter || a.org_id === orgFilter; })
      .sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    const map = {}; const tez = {}; const byId = {};
    data.forEach(a => {
      var key = a.org_id + '|' + String(a.name || '').trim().toLowerCase();
      if (a.cena_sifra != null) map[key] = a.cena_sifra;
      if (a.teza != null && a.teza !== '') tez[key] = parseFloat(a.teza);
      if (a.id) byId[a.id] = { sifra: a.cena_sifra, teza: (a.teza != null && a.teza !== '') ? parseFloat(a.teza) : null };
    });
    map.__teza = tez;
    map.__byId = byId;
    return map;
  }
  function cenaZaArtikel(sifra) { return (sifra != null && CENIKMAP && CENIKMAP[sifra]) ? CENIKMAP[sifra].cena1 : null; }
  // ── ID artiklov: 2 črki + 3 številke (npr. PV001). Uporabnik jih dodeljuje sam. ──
  function normId(s) { return String(s == null ? '' : s).trim().toUpperCase(); }
  function jeSc(koda) { return normId(koda).indexOf('SC') === 0; }
  // Stranka »uporablja splošni cenik«: ima vsaj en artikel s ceno in vsi so SC-artikli.
  function strankaSplosni(orgId) {
    if (!CLANI) return false;
    var priced = CLANI.filter(function (a) { return a.org_id === orgId && a.cena_sifra != null; });
    if (!priced.length) return false;
    return priced.every(function (a) { var p = CENIKMAP[a.cena_sifra]; return p && jeSc(p.koda); });
  }
  function veljavenId(s) { return /^[A-ZČŠŽ]{2}[0-9]{3}$/.test(normId(s)); }
  function idZaseden(id, exceptSifra) { id = normId(id); if (!id || !CENIK) return null; var hit = CENIK.find(function (x) { return x.sifra !== exceptSifra && normId(x.koda) === id; }); return hit || null; }
  function pad3(n) { n = String(n); while (n.length < 3) n = '0' + n; return n; }
  function nextPref(p) { var a = p.charCodeAt(0), b = p.charCodeAt(1) + 1; if (b > 90) { b = 65; a++; if (a > 90) a = 65; } return String.fromCharCode(a) + String.fromCharCode(b); }
  function predlagajId() {
    var best = null;
    (CENIK || []).forEach(function (x) { var m = normId(x.koda).match(/^([A-Z]{2})([0-9]{3})$/); if (m) { var pref = m[1], num = parseInt(m[2], 10); if (!best || pref > best.pref || (pref === best.pref && num > best.num)) best = { pref: pref, num: num }; } });
    if (!best) return '';
    var num = best.num + 1, pref = best.pref; if (num > 999) { num = 1; pref = nextPref(pref); }
    return pref + pad3(num);
  }
  // Naslednji prost SC-ID (SC001, SC002 …) za splošni cenik.
  function nextSc() {
    var max = 0;
    (CENIK || []).forEach(function (x) { var m = normId(x.koda).match(/^SC([0-9]{3})$/); if (m) { var n = parseInt(m[1], 10); if (n > max) max = n; } });
    var n = max + 1; if (n > 999) n = 999;
    return 'SC' + pad3(n);
  }
  // Dodaj SKUPNI (deljeni) standardni artikel v splošni cenik (org_id = null → velja za vse).
  async function dodajSplosniArtikel(name, id) {
    await nalozicenik();
    if (!/^SC[0-9]{3}$/.test(id)) { toast('ID splošnega artikla mora biti SC + 3 številke (npr. SC001).'); return; }
    if (idZaseden(id, null)) { toast('ID ' + id + ' že obstaja.'); return; }
    var sifra = await naslednjaSifra();
    // vrstni red: ohrani trenutni prikaz obstoječih SC in dodaj NOVEGA na konec
    var scList = (CENIK || []).filter(function (x) { return jeSc(x.koda); }).slice().sort(cenikSort);
    var rec = { sifra: sifra, koda: id, naziv: name, em: 'kos', cena1: 0, cena2: 0, org_id: null, sort_order: scList.length };
    var e = (await sb.from('pricelist').insert(rec)).error;
    if (e) { toast(napakaBesedilo(e)); return; }
    CENIK.push(rec);
    // normaliziraj sort_order vseh SC (obstoječi po trenutnem vrstnem redu, nov na koncu) → stabilen vrstni red
    var koncni = scList.concat([rec]); var ups = [];
    koncni.forEach(function (p, i) { if (p.sort_order !== i) { p.sort_order = i; ups.push(sb.from('pricelist').update({ sort_order: i }).eq('sifra', p.sifra)); } });
    zgradiCenikMap();
    _cenikOpen['splosni'] = true;
    if (ups.length) await Promise.all(ups);
    // PROPAGACIJA: dodaj nov artikel VSEM strankam, ki imajo splošni cenik vklopljen
    var ciljOrgi = (ORGSEZNAM || []).filter(function (o) { return strankaSplosni(o.id); });
    var dodanih = 0;
    for (var ci = 0; ci < ciljOrgi.length; ci++) {
      var oid = ciljOrgi[ci].id;
      var maxo = -1; (CLANI || []).forEach(function (a) { if (a.org_id === oid && typeof a.sort_order === 'number' && a.sort_order > maxo) maxo = a.sort_order; });
      var ins = await sb.from('articles').insert({ org_id: oid, name: name, cena_sifra: sifra, sort_order: maxo + 1, viden_app: false }).select('id').maybeSingle();
      if (!(ins && ins.error)) { if (CLANI) CLANI.push({ id: ins && ins.data ? ins.data.id : null, org_id: oid, name: name, cena_sifra: sifra, sort_order: maxo + 1 }); dodanih++; }
    }
    toast('Dodano v splošni cenik: ' + id + (dodanih ? ' · dodano ' + dodanih + ' strankam' : ''));
    cenikRender();
  }
  // Naslednja prosta šifra (PK) v ceniku — upošteva TUDI mehko izbrisane vrstice, da ne pride do trka.
  async function naslednjaSifra() {
    var maxS = 900000;
    try { var r = await sb.from('pricelist').select('sifra').order('sifra', { ascending: false }).limit(1);
      if (!r.error && r.data && r.data[0] && typeof r.data[0].sifra === 'number') maxS = Math.max(maxS, r.data[0].sifra); } catch (e) {}
    (CENIK || []).forEach(function (x) { if (x.sifra > maxS) maxS = x.sifra; });
    return maxS + 1;
  }
  function orgPodatki(orgId) {
    var o = ORGSEZNAM.find(function (x) { return x.id === orgId; }); if (!o) return '';
    return [o.legal_name, o.vat_id ? ('ID DDV: ' + o.vat_id) : '', o.address].filter(Boolean).map(escape_).join(' · ');
  }
  async function risiCeniki() {
    const box = $('cenikList'); if (!box) return;
    if (!risiCeniki._wired) {
      const si = $('cenikIsci'); if (si) si.addEventListener('input', () => cenikRender());
      const ib = $('cenikUvoz'); if (ib) ib.addEventListener('click', () => uvoziCenik());
      const kb = $('cenikKos'); if (kb) kb.addEventListener('click', () => risiKos());
      const cs = $('cenikSort2'); if (cs) { cs.value = cenikOrderMode(); cs.addEventListener('change', function () { try { localStorage.setItem('sc-cenik-order', cs.value); } catch (e) {} shraniNastavitve(); cenikRender(); }); }
      risiCeniki._wired = true;
    }
    box.innerHTML = NALAGANJE;
    const res = await nalozicenik(true);
    if (!res.ok) {
      CENIK = null;
      box.innerHTML = '<div class="msg bad show">Tabele cenika ni v bazi.</div>';
      if ($('cenikPod')) $('cenikPod').textContent = '';
      return;
    }
    await naloziClane(true);
    cenikRender();
  }
  function cenikVrsticaHtml(x, orgId, artId) {
    var nm = x.naziv || '';
    return '<div class="cenik-row" data-s="' + x.sifra + '" data-org="' + escape_(orgId || '') + '" data-art="' + (artId != null ? escape_(String(artId)) : '') + '"><div class="cenik-nm">' + escape_(nm) + '</div>' +
      '<div class="cenik-meta">' + (x.koda ? escape_(normId(x.koda)) : 'brez ID') + ' · ' + escape_(x.em || 'kos') + '</div>' +
      '<div class="cenik-cena"><span class="cenik-val">' + cenaFmt(x.cena1) + '</span>' +
      (OSEBJE ? '<span class="cenik-acts"><button type="button" class="cenik-grip dnd-handle" title="Povleci za razvrščanje" aria-label="Razvrsti">' + DND_ICON + '</button><button type="button" class="cenik-edit" data-cedit="' + x.sifra + '" title="Uredi ceno" aria-label="Uredi">' + IKO_T_SVINC + '</button></span>' : '') +
      '</div></div>';
  }
  function cenikRender() {
    const box = $('cenikList'); if (!box) return;
    var _sy = window.scrollY;
    const q = (($('cenikIsci') && $('cenikIsci').value) || '').trim().toLowerCase();
    if ($('cenikPod')) $('cenikPod').textContent = (CENIK && CENIK.length) ? (stevilo(CENIK.length) + ' artiklov · cene neto na kos') : '';
    if (!CENIK) { box.innerHTML = '<div class="empty"><h3>Cenik ni na voljo</h3></div>'; return; }
    function matchesQ(x) { return !q || (x.naziv || '').toLowerCase().includes(q) || normId(x.koda).toLowerCase().includes(q) || String(x.sifra) === q; }
    // Skupni katalog: vsak izdelek je en zapis (pricelist); stranke so nanj POVEZANE prek članstev (articles).
    var grupe = {};
    function grp(orgId) { var k = 'org:' + orgId; if (!grupe[k]) grupe[k] = { key: k, org_id: orgId, label: ORGIME[orgId] || 'stranka', items: [], _seen: {} }; return grupe[k]; }
    function pushItem(orgId, p, artId, ord) {
      if (!(orgId && ORGIME[orgId])) return;
      var g = grp(orgId);
      if (g._seen[p.sifra]) { if (artId != null && g._seen[p.sifra].artId == null) { g._seen[p.sifra].artId = artId; g._seen[p.sifra].ord = (ord != null ? ord : g._seen[p.sifra].ord); } return; }
      var it = { p: p, artId: (artId != null ? artId : null), ord: (ord != null ? ord : 1e9) };
      g._seen[p.sifra] = it; g.items.push(it);
    }
    (CLANI || []).forEach(function (a) { if (a.cena_sifra == null) return; var p = CENIKMAP[a.cena_sifra]; if (!p || !matchesQ(p)) return; pushItem(a.org_id, p, a.id, a.sort_order); });
    (CENIK || []).forEach(function (x) { if (x.org_id && ORGIME[x.org_id] && matchesQ(x)) pushItem(x.org_id, x, null, x.sort_order); });
    if (!q && OSEBJE) ORGSEZNAM.forEach(function (o) { grp(o.id); });
    if (q) { var any = Object.keys(grupe).some(function (k) { return grupe[k].items.length; }); if (!any) { box.innerHTML = '<div class="empty"><h3>Ni zadetkov</h3></div>'; return; } }
    var _effMode = cenikOrderMode(); if (_effMode === 'sledi') _effMode = custOrderMode();
    var _kgm = (typeof kgPoStrankiMesec === 'function') ? kgPoStrankiMesec() : {};
    var ordOrg = {}; razvrstiStranke(ORGSEZNAM, _effMode, _kgm).forEach(function (o, i) { ordOrg[o.id] = i; });
    var arr = Object.keys(grupe).map(function (k) { return grupe[k]; });
    if (!arr.length) { box.innerHTML = '<div class="empty"><h3>Cenik je prazen</h3></div>'; return; }
    arr.sort(function (a, b) { var d = (ordOrg[a.org_id] || 0) - (ordOrg[b.org_id] || 0); if (d) return d; return (a.label || '').localeCompare(b.label || '', 'sl'); });
    // Splošni cenik — izoliran katalog vseh artiklov z ID, ki se začne s "SC"
    var scItems = (CENIK || []).filter(function (x) { return normId(x.koda).indexOf('SC') === 0 && matchesQ(x); }).sort(cenikSort);
    var scOpen = !!q || _cenikOpen['splosni'];
    var scRows = scItems.map(function (p) { return cenikVrsticaHtml(p, '', null); }).join('');
    var scAdd = OSEBJE ? ('<div class="art-add sc-add"><input type="text" class="sc-new" placeholder="Nov standardni artikel"><input type="text" class="sc-id-new" placeholder="ID" maxlength="5" value="' + escape_(nextSc()) + '"><button type="button" class="btn btn-narrow sc-add-btn">+ Dodaj</button></div>') : '';
    var scBody = (scRows || '<p class="u-sub" style="padding:12px 16px 4px">Ni artiklov.</p>') + scAdd;
    var scCard = OSEBJE ? ('<div class="cgrp splosni' + (scOpen ? ' open' : '') + '" data-key="splosni"><div class="cgrp-head-row"><button type="button" class="cgrp-h' + (scOpen ? ' open' : '') + '" data-cgrp="splosni" style="' + naslovnica(null, 'SC') + '"><span class="cgrp-name"><span class="cgrp-nm">Splošni cenik</span><span class="cgrp-sub">Standardni artikli za vse stranke</span></span><span class="cgrp-count">' + sklonArtiklov(scItems.length) + '</span><span class="cgrp-chev" aria-hidden="true">›</span></button></div><div class="cgrp-body' + (scOpen ? ' show' : '') + '">' + scBody + '</div></div>') : '';
    var scWrap = scCard ? ('<div class="sc-isolate">' + scCard + '</div>') : '';
    var stHead = (OSEBJE && arr.length) ? '<div class="cenik-sec-head">Ceniki po strankah</div>' : '';
    box.innerHTML = scWrap + stHead + arr.map(function (g) {
      var list = g.items.slice().sort(function (x, y) { return (x.ord || 0) - (y.ord || 0) || cenikSort(x.p, y.p); });
      var rows = list.map(function (it) { return cenikVrsticaHtml(it.p, g.org_id, it.artId); }).join('');
      var open = !!q || _cenikOpen[g.key];
      var jeSpl = list.length && list.every(function (it) { return jeSc(it.p.koda); });
      var sub = ''; var pod = orgPodatki(g.org_id); if (pod) sub = '<span class="cgrp-sub">' + pod + '</span>';
      var splBtn = '<button type="button" class="cgrp-btn ghost sc-toggle' + (jeSpl ? ' on' : '') + '" data-splorg="' + g.org_id + '" data-splon="' + (jeSpl ? '1' : '0') + '">' + (jeSpl ? 'Splošni cenik: vklopljen' : 'Vklopi splošni cenik') + '</button>';
      var bar = OSEBJE ? '<div class="cgrp-bar"><button type="button" class="cgrp-btn ghost" data-izvozorg="' + g.org_id + '">Izvozi</button><button type="button" class="cgrp-btn ghost" data-uvozorg="' + g.org_id + '">Uvozi</button>' + splBtn + '</div>' : '';
      return '<div class="cgrp' + (open ? ' open' : '') + '" data-key="' + escape_(g.key) + '" data-org="' + escape_(g.org_id) + '"><div class="cgrp-head-row"><button type="button" class="cgrp-h' + (open ? ' open' : '') + '" data-cgrp="' + escape_(g.key) + '" style="' + naslovnica(null, g.org_id) + '">' +
        '<span class="cgrp-name"><span class="cgrp-nm">' + escape_(g.label) + '</span>' + sub + '</span>' +
        '<span class="cgrp-count">' + (jeSpl ? 'Splošni cenik · ' : '') + sklonArtiklov(list.length) + '</span><span class="cgrp-chev" aria-hidden="true">›</span></button></div>' +
        '<div class="cgrp-body' + (open ? ' show' : '') + '">' + bar + rows + '</div></div>';
    }).join('');
    box.querySelectorAll('[data-cgrp]').forEach(function (h) {
      h.addEventListener('click', function () {
        var k = h.dataset.cgrp; var willOpen = !h.classList.contains('open');
        if (willOpen) { // naenkrat naj bo odprta samo ena skupina
          box.querySelectorAll('.cgrp-h.open').forEach(function (o) {
            if (o !== h) { o.classList.remove('open'); _cenikOpen[o.dataset.cgrp] = false; var g2 = o.closest('.cgrp'); if (g2) { g2.classList.remove('open'); var b2 = g2.querySelector('.cgrp-body'); if (b2) b2.classList.remove('show'); } }
          });
        }
        _cenikOpen[k] = willOpen; h.classList.toggle('open', willOpen);
        var g = h.closest('.cgrp'); if (g) g.classList.toggle('open', willOpen);
        var b = g ? g.querySelector('.cgrp-body') : null;
        if (b) b.classList.toggle('show', willOpen);
      });
    });
    box.querySelectorAll('[data-cedit]').forEach(bn => bn.addEventListener('click', e => { e.stopPropagation(); cenikUredi(bn); }));
    box.querySelectorAll('[data-cdel]').forEach(bn => bn.addEventListener('click', e => { e.stopPropagation(); var row = bn.closest('.cenik-row'); cenikIzbrisi(parseInt(bn.dataset.cdel, 10), row ? row.dataset.org : null); }));
    // vlečenje artiklov znotraj skupine → vrstni red članstva te stranke
    box.querySelectorAll('.cgrp-body').forEach(function (body) {
      dndSort(body, '.cenik-row', '.cenik-grip', function () { cenikShraniVrstniRed(body); });
    });
    box.querySelectorAll('[data-neworg]').forEach(bn => bn.addEventListener('click', e => { e.stopPropagation(); cenikNov(bn.dataset.neworg, bn); }));
    box.querySelectorAll('[data-addexist]').forEach(bn => bn.addEventListener('click', e => { e.stopPropagation(); dodajObstojec(bn.dataset.addexist, bn); }));
    box.querySelectorAll('[data-izvozorg]').forEach(bn => bn.addEventListener('click', e => { e.stopPropagation(); izvoziCenik(bn.dataset.izvozorg); }));
    box.querySelectorAll('[data-uvozorg]').forEach(bn => bn.addEventListener('click', e => { e.stopPropagation(); uvoziVStranko(bn.dataset.uvozorg); }));
    box.querySelectorAll('[data-splorg]').forEach(bn => bn.addEventListener('click', e => { e.stopPropagation(); preklopiSplosni(bn.dataset.splorg, bn.dataset.splon !== '1'); }));
    { // dodajanje standardnih artiklov naravnost v splošni cenik
      var _scNew = box.querySelector('.sc-new'), _scId = box.querySelector('.sc-id-new'), _scBtn = box.querySelector('.sc-add-btn');
      var _scDodaj = function () { var nm = (_scNew.value || '').trim(); if (!nm) return; var id = normId(_scId.value) || nextSc(); dodajSplosniArtikel(nm, id); };
      if (_scBtn) _scBtn.addEventListener('click', function (e) { e.stopPropagation(); _scDodaj(); });
      [_scNew, _scId].forEach(function (el) { if (!el) return; el.addEventListener('click', function (e) { e.stopPropagation(); }); el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); _scDodaj(); } }); });
    }
    requestAnimationFrame(function () { window.scrollTo(0, _sy); });
  }
  function izvoziCenik(orgId) {
    var o = ORGSEZNAM.find(function (x) { return x.id === orgId; }) || {};
    var ime = o.name || 'stranka';
    // enak nabor kot v prikazu Cenika: članstva (CLANI) + lastni artikli, brez podvajanj, po vrstnem redu
    var _seen = {}, _items = [];
    (CLANI || []).forEach(function (a) { if (a.org_id === orgId && a.cena_sifra != null) { var p = CENIKMAP[a.cena_sifra]; if (p && !_seen[p.sifra]) { _seen[p.sifra] = true; _items.push({ p: p, ord: (a.sort_order != null ? a.sort_order : 1e9) }); } } });
    (CENIK || []).forEach(function (x) { if (x.org_id === orgId && !_seen[x.sifra]) { _seen[x.sifra] = true; _items.push({ p: x, ord: (x.sort_order != null ? x.sort_order : 1e9) }); } });
    _items.sort(function (a, b) { return (a.ord - b.ord) || cenikSort(a.p, b.p); });
    var rows = _items.map(function (it) { return it.p; });
    var payload = { _sc: 'SMARTCLEAN_CENIK', v: 1, izvozeno: new Date().toISOString(),
      stranka: { naziv: o.name || '', podjetje: o.legal_name || '', ddv: o.vat_id || '' },
      artikli: rows.map(function (x) { return { id: normId(x.koda), naziv: x.naziv || '', em: x.em || 'kos', cena: (x.cena1 != null ? x.cena1 : 0) }; }) };
    var json = JSON.stringify(payload).replace(/</g, '\\u003c');
    var vrst = rows.map(function (x) { return '<tr><td class="id">' + escape_(normId(x.koda) || '—') + '</td><td>' + escape_(x.naziv || '') + '</td><td>' + escape_(x.em || 'kos') + '</td><td class="c">' + cenaFmt(x.cena1) + '</td></tr>'; }).join('');
    var datum = new Date().toLocaleDateString('sl-SI');
    var css = 'body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:0;padding:32px;background:#f4f5f6}' +
      '.wrap{max-width:760px;margin:0 auto;background:#fff;border:1px solid #e2e5e8;border-radius:12px;padding:28px 30px}' +
      '.head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:18px}' +
      'h1{margin:0;font-size:26px;letter-spacing:-.01em}.sub{color:#333;font-size:15px;margin-top:4px;font-weight:600}.sub2{color:#777;font-size:12px;margin-top:3px}' +
      '.print{border:1px solid #111;background:#111;color:#fff;border-radius:100px;padding:9px 18px;font-size:13px;cursor:pointer}' +
      'table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:9px 10px;border-bottom:1px solid #e6e9ec}' +
      'th{background:#f2f4f5;text-transform:uppercase;font-size:11px;letter-spacing:.05em;color:#555}' +
      'td.id{font-family:ui-monospace,Menlo,Consolas,monospace;color:#333;white-space:nowrap}td.c,th.c{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}' +
      '.empty{color:#999;text-align:center;padding:20px}.foot{margin-top:14px;color:#777;font-size:12px;text-align:right}' +
      '@media print{body{background:#fff;padding:0}.wrap{border:none;border-radius:0;max-width:none;padding:0}.print{display:none}}';
    var doc = '<!doctype html><html lang="sl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cenik — ' + escape_(ime) + '</title><style>' + css + '</style></head><body><div class="wrap">' +
      '<div class="head"><div><h1>Cenik</h1><div class="sub">' + escape_(ime) + (o.legal_name ? ' · ' + escape_(o.legal_name) : '') + '</div><div class="sub2">Izvoženo ' + escape_(datum) + ' · SmartClean</div></div><button class="print" onclick="window.print()">Natisni</button></div>' +
      '<table><thead><tr><th>ID</th><th>Artikel</th><th>EM</th><th class="c">Cena (neto/kos)</th></tr></thead><tbody>' + (vrst || '<tr><td colspan="4" class="empty">Prazen cenik</td></tr>') + '</tbody></table>' +
      '<div class="foot">Skupaj artiklov: ' + rows.length + '</div></div>' +
      '<script type="application/json" id="sc-cenik-data">' + json + '<\/script></body></html>';
    var blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'cenik-' + String(o.name || 'stranka').replace(/[^a-zA-Z0-9._-]+/g, '_') + '.html';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    toast('Cenik izvožen (' + sklonArtiklov(rows.length) + ')');
  }
  function izbrisiStranko(orgId, btn) {
    const bar = btn.closest('.cgrp-bar');
    if (bar.nextElementSibling && bar.nextElementSibling.classList && bar.nextElementSibling.classList.contains('cenik-delconf')) { cenikRender(); return; }
    const ime = ORGIME[orgId] || 'stranko';
    bar.insertAdjacentHTML('afterend', '<div class="cenik-delconf"><p class="cenik-warn">' + IKO_T_POZOR + 'Res izbrišem stranko <b>' + escape_(ime) + '</b>? Skrita bo iz Strank, Faktur in cenika. Artikli in spremni listi ostanejo. Obnoviš jo lahko 30 dni v »Nedavno brisani«.</p><div class="cgrp-bar"><button type="button" class="cgrp-btn ghost cenik-delconf-no">Prekliči</button><button type="button" class="cgrp-btn danger cenik-delconf-yes">Izbriši</button></div></div>');
    const wrap = bar.nextElementSibling;
    wrap.querySelector('.cenik-delconf-no').addEventListener('click', e => { e.stopPropagation(); cenikRender(); });
    wrap.querySelector('.cenik-delconf-yes').addEventListener('click', async e => {
      e.stopPropagation();
      const { error } = await sb.from('orgs').update({ deleted_at: new Date().toISOString() }).eq('id', orgId);
      if (error) { toast(napakaBesedilo(error)); return; }
      ORGSEZNAM = ORGSEZNAM.filter(o => o.id !== orgId); delete ORGIME[orgId]; zgradiCenikMap();
      toast('Stranka izbrisana (obnovljiva 30 dni)');
      cenikRender();
    });
  }
  async function cenikShraniVrstniRed(body) {
    var g = body.closest ? body.closest('.cgrp') : null;
    var orgId = g ? g.dataset.org : null;
    var els = [].slice.call(body.querySelectorAll('.cenik-row'));
    if (!els.length) return;
    // Splošni cenik: vrstni red je skupen → shrani v pricelist.sort_order
    if (g && g.dataset.key === 'splosni') {
      var supd = [];
      els.forEach(function (el, i) { var sif = parseInt(el.dataset.s, 10); if (isNaN(sif)) return; supd.push(sb.from('pricelist').update({ sort_order: i }).eq('sifra', sif)); if (CENIKMAP[sif]) CENIKMAP[sif].sort_order = i; });
      var sres = await Promise.all(supd);
      if (sres.some(function (r) { return r.error; })) toast('Vrstni red morda ni v celoti shranjen.');
      return;
    }
    if (!orgId) return;
    var updates = [];
    els.forEach(function (el, i) {
      var sif = parseInt(el.dataset.s, 10); if (isNaN(sif)) return;
      // vrstni red je per-stranka → shrani v članstvo (articles.sort_order)
      updates.push(sb.from('articles').update({ sort_order: i }).eq('org_id', orgId).eq('cena_sifra', sif));
      if (CLANI) CLANI.forEach(function (a) { if (a.org_id === orgId && a.cena_sifra === sif) a.sort_order = i; });
      if (CENIKMAP[sif] && CENIKMAP[sif].org_id === orgId) CENIKMAP[sif].sort_order = i;
    });
    var res = await Promise.all(updates);
    if (res.some(function (r) { return r.error; })) toast('Vrstni red morda ni v celoti shranjen.');
  }
  function izbrisiSkupino(prefix, btn) {
    const bar = btn.closest('.cgrp-bar');
    if (bar.nextElementSibling && bar.nextElementSibling.classList && bar.nextElementSibling.classList.contains('cenik-delconf')) { cenikRender(); return; }
    const sifre = CENIK.filter(x => !x.org_id && cenikSkupina(x.naziv) === prefix).map(x => x.sifra);
    bar.insertAdjacentHTML('afterend', '<div class="cenik-delconf"><p class="cenik-warn">' + IKO_T_POZOR + 'Izbrišem celotno skupino <b>' + escape_(prefix) + '</b> (' + sifre.length + ' artiklov)? Gredo v koš — obnoviš jih lahko 30 dni v »Nedavno brisani«.</p><div class="cgrp-bar"><button type="button" class="cgrp-btn ghost cenik-delconf-no">Prekliči</button><button type="button" class="cgrp-btn danger cenik-delconf-yes">Izbriši ' + sifre.length + ' art.</button></div></div>');
    const wrap = bar.nextElementSibling;
    wrap.querySelector('.cenik-delconf-no').addEventListener('click', e => { e.stopPropagation(); cenikRender(); });
    wrap.querySelector('.cenik-delconf-yes').addEventListener('click', async e => {
      e.stopPropagation();
      if (!sifre.length) { cenikRender(); return; }
      const { error } = await sb.from('pricelist').update({ deleted_at: new Date().toISOString() }).in('sifra', sifre);
      if (error) { toast(napakaBesedilo(error)); return; }
      CENIK = CENIK.filter(x => sifre.indexOf(x.sifra) < 0); zgradiCenikMap();
      toast('Skupina izbrisana (' + sklonArtiklov(sifre.length) + ', obnovljivo 30 dni)');
      cenikRender();
    });
  }
  function cenikUredi(btn) {
    const s = parseInt(btn.dataset.cedit, 10);
    const rec = CENIKMAP[s]; if (!rec) return;
    const row = btn.closest('.cenik-row');
    row.innerHTML = '<div class="cenik-edit-form"><input type="text" class="cenik-nm-in" placeholder="Naziv artikla">' +
      '<div class="cenik-edit-r"><label class="cenik-mini-lab">ID<input type="text" class="cenik-id-in" maxlength="5" placeholder="PV001"></label>' +
      '<label class="cenik-mini-lab">Cena €<input type="text" class="cenik-in" inputmode="decimal" placeholder="0,00"></label>' +
      '<button type="button" class="btn-mini cenik-save">Shrani</button><button type="button" class="cenik-x cenik-cancel" title="Prekliči">' + IKO_ZAPRI + '</button></div></div>';
    const nmIn = row.querySelector('.cenik-nm-in'), cIn = row.querySelector('.cenik-in'), idIn = row.querySelector('.cenik-id-in');
    nmIn.value = rec.naziv || ''; cIn.value = String(rec.cena1).replace('.', ','); idIn.value = normId(rec.koda);
    nmIn.focus();
    [nmIn, cIn, idIn].forEach(el => el.addEventListener('click', e => e.stopPropagation()));
    const shrani = async () => {
      const nm = nmIn.value.trim();
      const v = parseFloat(String(cIn.value).replace(',', '.'));
      const novId = normId(idIn.value);
      const curId = normId(rec.koda);
      if (!nm) { toast('Vpiši naziv'); return; }
      if (isNaN(v) || v < 0) { toast('Neveljavna cena'); return; }
      if (novId && !veljavenId(novId)) { toast('ID mora biti 2 črki + 3 številke (npr. PV001).'); idIn.focus(); return; }
      if (novId && novId !== curId) { const z = idZaseden(novId, s); if (z) { toast('ID ' + novId + ' že uporablja: ' + (z.naziv || '#' + z.sifra)); idIn.focus(); return; } }
      const patch = { naziv: nm, cena1: v, updated_at: new Date().toISOString() };
      if (novId !== curId) patch.koda = novId;
      const { error } = await sb.from('pricelist').update(patch).eq('sifra', s);
      if (error) { toast(napakaBesedilo(error)); return; }
      if (nm !== rec.naziv) { await posodobiImeArtikla(s, nm); }
      rec.naziv = nm; rec.cena1 = v; if (novId !== curId) rec.koda = novId; zgradiCenikMap();
      toast('Shranjeno.');
      cenikRender();
    };
    row.querySelector('.cenik-save').addEventListener('click', e => { e.stopPropagation(); shrani(); });
    row.querySelector('.cenik-cancel').addEventListener('click', e => { e.stopPropagation(); cenikRender(); });
    cIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); shrani(); } else if (e.key === 'Escape') { cenikRender(); } });
    idIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); shrani(); } });
    nmIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); cIn.focus(); } });
  }
  async function cenikIzbrisi(s, orgId) {
    s = parseInt(s, 10);
    const rec = CENIKMAP[s]; if (!rec) return;
    var _ok = await potrdiModal({ naslov: 'Odstrani artikel', sporocilo: 'Odstranim artikel »' + (rec.naziv || ('#' + s)) + '«' + (orgId ? ' iz cenika te stranke' : '') + '?', potrdi: 'Odstrani', preklici: 'Prekliči', nevarno: true });
    if (!_ok) return;
    // odstrani povezavo (članstvo) te stranke z artiklom
    if (orgId) {
      const e1 = (await sb.from('articles').delete().eq('org_id', orgId).eq('cena_sifra', s)).error;
      if (e1) { toast(napakaBesedilo(e1)); return; }
      if (CLANI) CLANI = CLANI.filter(function (a) { return !(a.org_id === orgId && a.cena_sifra === s); });
    }
    // če je artikel LASTEN tej stranki (ni deljen), ga tudi mehko izbriši iz kataloga
    if (rec.org_id === orgId) {
      await sb.from('pricelist').update({ deleted_at: new Date().toISOString() }).eq('sifra', s);
      CENIK = CENIK.filter(function (x) { return x.sifra !== s; }); zgradiCenikMap();
      toast('Artikel odstranjen (obnovljiv 30 dni)');
    } else {
      toast('Artikel odstranjen iz cenika stranke');
    }
    cenikRender();
  }
  function cenikNov(orgId, btn) {
    const bar = btn.closest('.cgrp-bar');
    if (bar.nextElementSibling && bar.nextElementSibling.classList && bar.nextElementSibling.classList.contains('cenik-nov')) { cenikRender(); return; }
    bar.insertAdjacentHTML('afterend', '<div class="cenik-nov"><input type="text" class="cenik-nov-nm" placeholder="Naziv novega artikla"><div class="cenik-nov-r"><input type="text" class="cenik-nov-c" inputmode="decimal" placeholder="Cena €"><button type="button" class="btn-mini cenik-nov-save">Ustvari</button><button type="button" class="cenik-x cenik-nov-cancel">' + IKO_ZAPRI + '</button></div></div>');
    const wrap = bar.nextElementSibling;
    const nmIn = wrap.querySelector('.cenik-nov-nm'), cIn = wrap.querySelector('.cenik-nov-c');
    nmIn.focus();
    [nmIn, cIn].forEach(el => el.addEventListener('click', e => e.stopPropagation()));
    const ustvari = async () => {
      const nm = nmIn.value.trim(); const v = parseFloat(String(cIn.value).replace(',', '.')) || 0;
      if (!nm) { toast('Vpiši naziv'); return; }
      const nova = await naslednjaSifra();
      const key = orgId ? ('org:' + orgId) : 'splosno';
      const sibs = CENIK.filter(x => cenikGroupKey(x) === key);
      const so = sibs.reduce((m, x) => Math.max(m, x.sort_order != null ? x.sort_order : 0), 0) + 1;
      const novaRec = { sifra: nova, koda: '', naziv: nm, em: 'kos', cena1: v, cena2: 0, org_id: orgId || null, sort_order: so };
      const { error } = await sb.from('pricelist').insert(novaRec);
      if (error) { toast(napakaBesedilo(error)); return; }
      if (orgId) {
        const { data: maxd } = await sb.from('articles').select('sort_order').eq('org_id', orgId).order('sort_order', { ascending: false }).limit(1);
        const aOrder = ((maxd && maxd[0] && maxd[0].sort_order) || 0) + 1;
        const ai = await sb.from('articles').insert({ org_id: orgId, name: nm, sort_order: aOrder, cena_sifra: nova, viden_app: true }).select('id').maybeSingle();
        if (CLANI) CLANI.push({ id: ai.data ? ai.data.id : null, org_id: orgId, name: nm, cena_sifra: nova, sort_order: aOrder });
      }
      CENIK.push(novaRec); zgradiCenikMap();
      _cenikOpen[key] = true;
      toast(orgId ? 'Artikel ustvarjen in povezan s stranko' : 'Artikel ustvarjen');
      cenikRender();
    };
    wrap.querySelector('.cenik-nov-save').addEventListener('click', e => { e.stopPropagation(); ustvari(); });
    wrap.querySelector('.cenik-nov-cancel').addEventListener('click', e => { e.stopPropagation(); cenikRender(); });
    cIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ustvari(); } });
    nmIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); cIn.focus(); } });
  }
  // Dodaj OBSTOJEČ artikel (že v bazi) tej stranki — deljeni katalog: le povezava, brez kopije.
  function dodajObstojec(orgId, btn) {
    const bar = btn.closest('.cgrp-bar');
    if (bar.nextElementSibling && bar.nextElementSibling.classList && bar.nextElementSibling.classList.contains('cenik-pick')) { cenikRender(); return; }
    bar.insertAdjacentHTML('afterend', '<div class="cenik-pick"><input type="text" class="cenik-pick-in" placeholder="Iskanje po ID ali nazivu …"><div class="cenik-pick-list"></div><div class="cgrp-bar"><button type="button" class="cgrp-btn ghost cenik-pick-cancel">Zapri</button></div></div>');
    const wrap = bar.nextElementSibling, inp = wrap.querySelector('.cenik-pick-in'), listEl = wrap.querySelector('.cenik-pick-list');
    inp.addEventListener('click', e => e.stopPropagation()); inp.focus();
    var ze = {}; (CLANI || []).forEach(function (a) { if (a.org_id === orgId && a.cena_sifra != null) ze[a.cena_sifra] = true; }); (CENIK || []).forEach(function (x) { if (x.org_id === orgId) ze[x.sifra] = true; });
    function render() {
      var qq = inp.value.trim().toLowerCase();
      var seen = {}, prods = [];
      (CENIK || []).forEach(function (x) {
        if (ze[x.sifra] || seen[x.sifra]) return; seen[x.sifra] = true;
        if (qq && !((x.naziv || '').toLowerCase().includes(qq) || normId(x.koda).toLowerCase().includes(qq))) return;
        prods.push(x);
      });
      prods.sort(function (a, b) { return (a.naziv || '').localeCompare(b.naziv || '', 'sl'); });
      prods = prods.slice(0, 80);
      listEl.innerHTML = prods.length ? prods.map(function (x) { return '<button type="button" class="cenik-pick-item" data-s="' + x.sifra + '"><span class="pk-id">' + escape_(normId(x.koda) || '—') + '</span><span class="pk-nm">' + escape_(x.naziv || '') + '</span><b class="pk-c">' + cenaFmt(x.cena1) + '</b></button>'; }).join('') : '<p class="u-sub" style="padding:10px 4px">Ni artiklov za dodati.</p>';
      listEl.querySelectorAll('.cenik-pick-item').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); izberi(parseInt(b.dataset.s, 10)); }); });
    }
    async function izberi(sif) {
      var p = CENIKMAP[sif]; if (!p) return;
      var maxo = 0; (CLANI || []).forEach(function (a) { if (a.org_id === orgId && a.sort_order != null && a.sort_order > maxo) maxo = a.sort_order; });
      var ins = await sb.from('articles').insert({ org_id: orgId, name: p.naziv || '', cena_sifra: sif, sort_order: maxo + 1, viden_app: true }).select('id').maybeSingle();
      if (ins.error) { toast(napakaBesedilo(ins.error)); return; }
      if (CLANI) CLANI.push({ id: ins.data ? ins.data.id : null, org_id: orgId, name: p.naziv || '', cena_sifra: sif, sort_order: maxo + 1 });
      _cenikOpen['org:' + orgId] = true;
      toast('Artikel dodan stranki');
      cenikRender();
    }
    inp.addEventListener('input', render);
    wrap.querySelector('.cenik-pick-cancel').addEventListener('click', function (e) { e.stopPropagation(); cenikRender(); });
    render();
  }
  // Uvoz cenika iz portalskega HTML izvoza v izbrano stranko (nadomesti njen cenik).
  function uvoziVStranko(orgId) {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.html,text/html'; inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0]; document.body.removeChild(inp);
      if (!f) return;
      if (!/\.html?$/i.test(f.name)) { toast('Napačna datoteka: dovoljen je samo portalski izvoz cenika (.html).'); return; }
      var rd = new FileReader();
      rd.onload = function () {
        var txt = String(rd.result || '');
        var m = txt.match(/<script[^>]*id="sc-cenik-data"[^>]*>([\s\S]*?)<\/script>/i);
        var data = null; if (m) { try { data = JSON.parse(m[1].replace(/\\u003c/gi, '<')); } catch (e) { data = null; } }
        if (!data || data._sc !== 'SMARTCLEAN_CENIK' || !Array.isArray(data.artikli)) { toast('Datoteka ni veljaven izvoz cenika iz portala.'); return; }
        uporabiUvoz(orgId, data);
      };
      rd.readAsText(f);
    });
    inp.click();
  }
  async function uporabiUvoz(orgId, data) {
    var o = ORGSEZNAM.find(function (x) { return x.id === orgId; }) || {};
    var ok0 = await potrdiModal({
      naslov: 'Uvozi cenik',
      sporocilo: 'Uvozim ' + data.artikli.length + ' artiklov v cenik stranke »' + (o.name || '') + '«? Obstoječi cenik te stranke bo nadomeščen (artikli se povežejo po ID). Cene in nazivi so skupni za vse stranke z istim ID.',
      potrdi: 'Uvozi', nevarno: true
    });
    if (!ok0) return;
    toast('Uvažam …');
    var ciljneSifre = [];
    for (var i = 0; i < data.artikli.length; i++) {
      var a = data.artikli[i]; var id = normId(a.id);
      var naziv = String(a.naziv || '').trim(); var cena = (typeof a.cena === 'number') ? a.cena : (parseFloat(String(a.cena).replace(',', '.')) || 0);
      var em = String(a.em || 'kos');
      var prod = id ? produktPoId(id) : null;
      if (prod) {
        // obstoječ skupni artikel → posodobi naziv+ceno (velja za vse)
        if (prod.naziv !== naziv || prod.cena1 !== cena) { await sb.from('pricelist').update({ naziv: naziv, cena1: cena, em: em }).eq('sifra', prod.sifra); prod.naziv = naziv; prod.cena1 = cena; prod.em = em; }
        ciljneSifre.push(prod.sifra);
      } else {
        var nova = await naslednjaSifra();
        var rec = { sifra: nova, koda: id, naziv: naziv, em: em, cena1: cena, cena2: 0, org_id: null, sort_order: null };
        var pe = await sb.from('pricelist').insert(rec).error;
        if (pe) { toast('Napaka pri artiklu ' + (id || naziv) + ': ' + pe.message); continue; }
        CENIK.push(rec); zgradiCenikMap();
        ciljneSifre.push(nova);
      }
    }
    // trenutna članstva te stranke
    var obst = {}; (CLANI || []).forEach(function (a) { if (a.org_id === orgId && a.cena_sifra != null) obst[a.cena_sifra] = a; });
    // dodaj manjkajoča članstva (po vrsti iz datoteke)
    for (var j = 0; j < ciljneSifre.length; j++) {
      var sif = ciljneSifre[j];
      if (obst[sif]) { await sb.from('articles').update({ sort_order: j }).eq('org_id', orgId).eq('cena_sifra', sif); obst[sif].sort_order = j; delete obst[sif]; }
      else { var p = CENIKMAP[sif]; var ins = await sb.from('articles').insert({ org_id: orgId, name: (p ? p.naziv : '') || '', cena_sifra: sif, sort_order: j, viden_app: false }).select('id').maybeSingle(); if (CLANI) CLANI.push({ id: ins.data ? ins.data.id : null, org_id: orgId, name: (p ? p.naziv : '') || '', cena_sifra: sif, sort_order: j }); }
    }
    // odstrani članstva, ki jih v datoteki ni
    var odstrani = Object.keys(obst);
    for (var k = 0; k < odstrani.length; k++) {
      var s2 = parseInt(odstrani[k], 10);
      await sb.from('articles').delete().eq('org_id', orgId).eq('cena_sifra', s2);
      if (CLANI) CLANI = CLANI.filter(function (a) { return !(a.org_id === orgId && a.cena_sifra === s2); });
      var rec2 = CENIKMAP[s2]; if (rec2 && rec2.org_id === orgId) { await sb.from('pricelist').update({ deleted_at: new Date().toISOString() }).eq('sifra', s2); CENIK = CENIK.filter(function (x) { return x.sifra !== s2; }); zgradiCenikMap(); }
    }
    _cenikOpen['org:' + orgId] = true;
    toast('Uvoženo: ' + ciljneSifre.length + ' artiklov');
    cenikRender();
  }
  // JEDRO: vklopi/izklopi splošni cenik za stranko (spremeni bazo + CENIK/CLANI).
  //  on=true  → stranki dodeli VSE SC-artikle (nadomesti obstoječe cene).
  //  on=false → seznam artiklov stranke se ISPRAZNI (odstrani vsa članstva in lastne artikle).
  async function nastaviSplosni(orgId, on) {
    if (on) {
      var sc = (CENIK || []).filter(function (x) { return jeSc(x.koda); }).slice().sort(cenikSort);
      if (!sc.length) { toast('Splošni cenik je prazen (ni artiklov z ID SC…).'); return false; }
      var ciljneSifre = sc.map(function (x) { return x.sifra; });
      var obst = {}; (CLANI || []).forEach(function (a) { if (a.org_id === orgId && a.cena_sifra != null) obst[a.cena_sifra] = a; });
      for (var j = 0; j < ciljneSifre.length; j++) {
        var sif = ciljneSifre[j];
        if (obst[sif]) { await sb.from('articles').update({ sort_order: j }).eq('org_id', orgId).eq('cena_sifra', sif); obst[sif].sort_order = j; delete obst[sif]; }
        else { var p = CENIKMAP[sif]; var ins = await sb.from('articles').insert({ org_id: orgId, name: (p ? p.naziv : '') || '', cena_sifra: sif, sort_order: j, viden_app: false }).select('id').maybeSingle(); if (CLANI) CLANI.push({ id: ins.data ? ins.data.id : null, org_id: orgId, name: (p ? p.naziv : '') || '', cena_sifra: sif, sort_order: j }); }
      }
      var odstrani = Object.keys(obst);
      for (var k = 0; k < odstrani.length; k++) {
        var s2 = parseInt(odstrani[k], 10);
        await sb.from('articles').delete().eq('org_id', orgId).eq('cena_sifra', s2);
        if (CLANI) CLANI = CLANI.filter(function (a) { return !(a.org_id === orgId && a.cena_sifra === s2); });
        var rec2 = CENIKMAP[s2]; if (rec2 && rec2.org_id === orgId) { await sb.from('pricelist').update({ deleted_at: new Date().toISOString() }).eq('sifra', s2); CENIK = CENIK.filter(function (x) { return x.sifra !== s2; }); zgradiCenikMap(); }
      }
      var brez = (CLANI || []).filter(function (a) { return a.org_id === orgId && a.cena_sifra == null && a.id != null; });
      for (var m = 0; m < brez.length; m++) { await sb.from('articles').delete().eq('id', brez[m].id); }
      if (CLANI) CLANI = CLANI.filter(function (a) { return !(a.org_id === orgId && a.cena_sifra == null); });
      return true;
    } else {
      // IZKLOP → prazen seznam: odstrani vsa članstva stranke in njene lastne NE-SC artikle.
      // SC-artiklov (splošni cenik) NIKOLI ne brišemo — so skupni in veljajo za vse.
      var lastni = (CENIK || []).filter(function (x) { return x.org_id === orgId && !jeSc(x.koda); }).map(function (x) { return x.sifra; });
      await sb.from('articles').delete().eq('org_id', orgId);
      if (CLANI) CLANI = CLANI.filter(function (a) { return a.org_id !== orgId; });
      for (var i2 = 0; i2 < lastni.length; i2++) { await sb.from('pricelist').update({ deleted_at: new Date().toISOString() }).eq('sifra', lastni[i2]); }
      if (lastni.length) { var _ls = {}; lastni.forEach(function (s) { _ls[s] = 1; }); CENIK = CENIK.filter(function (x) { return !_ls[x.sifra]; }); zgradiCenikMap(); }
      return true;
    }
  }
  // Preklop iz Ceniki (z opozorilom) — vklop nadomesti cene, izklop izprazni seznam.
  async function preklopiSplosni(orgId, on) {
    var o = ORGSEZNAM.find(function (x) { return x.id === orgId; }) || {};
    var ime = o.name || 'stranko';
    var ok0 = await potrdiModal(on ? {
      naslov: 'Vklopi splošni cenik',
      sporocilo: 'Vklopim splošni cenik za »' + ime + '«? To nadomesti obstoječe cene in artikle te stranke s splošnim cenikom.',
      potrdi: 'Vklopi'
    } : {
      naslov: 'Izklopi splošni cenik',
      sporocilo: 'Izklopim splošni cenik za »' + ime + '«? Seznam artiklov te stranke bo prazen.',
      potrdi: 'Izklopi in izprazni', nevarno: true
    });
    if (!ok0) return;
    toast(on ? 'Vklapljam splošni cenik …' : 'Izklapljam …');
    _cenikOpen['org:' + orgId] = true;
    var ok = await nastaviSplosni(orgId, on);
    if (ok === false) return;
    toast(on ? 'Splošni cenik vklopljen' : 'Splošni cenik izklopljen (seznam prazen)');
    cenikRender();
  }
  function cenikPoveziPrefix(prefix, btn) {
    const bar = btn.closest('.cgrp-bar');
    if (bar.nextElementSibling && bar.nextElementSibling.classList && bar.nextElementSibling.classList.contains('cenik-orgpick')) { cenikRender(); return; }
    bar.insertAdjacentHTML('afterend', '<div class="cenik-orgpick"><input type="text" class="cenik-org-in" placeholder="Iskanje stranke …"><div class="cenik-org-list"></div><div class="cgrp-bar"><button type="button" class="cgrp-btn ghost cenik-org-cancel">Prekliči</button></div></div>');
    const wrap = bar.nextElementSibling;
    const inp = wrap.querySelector('.cenik-org-in'), listEl = wrap.querySelector('.cenik-org-list');
    inp.focus(); inp.addEventListener('click', e => e.stopPropagation());
    function render() {
      const qq = inp.value.trim().toLowerCase();
      let orgs = ORGSEZNAM.filter(o => !qq || (o.name || '').toLowerCase().includes(qq) || (o.legal_name || '').toLowerCase().includes(qq));
      orgs = orgs.slice(0, 40);
      listEl.innerHTML = orgs.length ? orgs.map(o => '<button type="button" class="cenik-org-item" data-o="' + o.id + '"><span>' + escape_(o.name) + '</span><small>' + escape_(o.legal_name || '') + '</small></button>').join('') : '<p class="u-sub" style="padding:10px 4px">Ni strank.</p>';
      listEl.querySelectorAll('.cenik-org-item').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); izberi(b.dataset.o); }));
    }
    async function izberi(orgId) {
      const sifre = CENIK.filter(x => !x.org_id && cenikSkupina(x.naziv) === prefix).map(x => x.sifra);
      if (!sifre.length) { toast('Ni artiklov za povezavo'); return; }
      const { error } = await sb.from('pricelist').update({ org_id: orgId }).in('sifra', sifre);
      if (error) { toast(napakaBesedilo(error)); return; }
      CENIK.forEach(x => { if (sifre.indexOf(x.sifra) >= 0) x.org_id = orgId; }); zgradiCenikMap();
      _cenikOpen['org:' + orgId] = true;
      toast('Povezano z ' + (ORGIME[orgId] || 'stranko') + ' (' + sklonArtiklov(sifre.length) + ')');
      cenikRender();
    }
    wrap.querySelector('.cenik-org-cancel').addEventListener('click', e => { e.stopPropagation(); cenikRender(); });
    inp.addEventListener('input', render);
    render();
  }
  async function cenikOdvezi(orgId) {
    const sifre = CENIK.filter(x => x.org_id === orgId).map(x => x.sifra);
    if (!sifre.length) return;
    const { error } = await sb.from('pricelist').update({ org_id: null }).in('sifra', sifre);
    if (error) { toast(napakaBesedilo(error)); return; }
    CENIK.forEach(x => { if (x.org_id === orgId) x.org_id = null; }); zgradiCenikMap();
    toast('Povezava s stranko preklicana');
    cenikRender();
  }
  async function risiKos() {
    const box = $('cenikList'); if (!box) return;
    box.innerHTML = NALAGANJE;
    if ($('cenikPod')) $('cenikPod').textContent = 'Nedavno brisani';
    const mejnik = new Date(Date.now() - 30 * 864e5).toISOString();
    let orgsDel = [];
    { const ro = await sb.from('orgs').select('id,name,legal_name,deleted_at').not('deleted_at', 'is', null).gte('deleted_at', mejnik).order('deleted_at', { ascending: false }); if (!ro.error) orgsDel = ro.data || []; }
    const ra = await sb.from('pricelist').select('sifra,koda,naziv,em,cena1,deleted_at').not('deleted_at', 'is', null).gte('deleted_at', mejnik).order('deleted_at', { ascending: false });
    const arr = ra.error ? [] : (ra.data || []);
    let html = '<div class="cgrp-bar"><button type="button" class="cgrp-btn ghost" id="kosNazaj">' + IKO_T_NAZAJ + 'Nazaj na cenik</button></div>';
    if (orgsDel.length) {
      html += '<h3 class="sec-h" style="margin:6px 0 8px">Izbrisane stranke</h3><div class="cenik" style="margin-bottom:18px">' + orgsDel.map(function (o) {
        return '<div class="cenik-row"><div class="cenik-nm">' + escape_(o.name) + '</div>' +
          '<div class="cenik-meta">' + escape_(o.legal_name || '') + ' · izbrisana ' + datumcas(o.deleted_at) + '</div>' +
          '<div class="cenik-cena"><button type="button" class="btn-mini cenik-restore" data-restoreorg="' + o.id + '">Obnovi</button></div></div>';
      }).join('') + '</div>';
    }
    html += '<h3 class="sec-h" style="margin:6px 0 8px">Izbrisani artikli</h3>';
    if (ra.error) html += '<div class="msg bad show">Napaka: ' + escape_(ra.error.message) + '</div>';
    else if (!arr.length) html += '<div class="empty"><h3>Ni brisanih artiklov</h3></div>';
    else html += '<div class="cenik">' + arr.map(function (x) {
      return '<div class="cenik-row"><div class="cenik-nm">' + escape_(x.naziv) + '</div>' +
        '<div class="cenik-meta">' + (x.koda ? escape_(normId(x.koda)) + ' · ' : '') + 'izbrisan ' + datumcas(x.deleted_at) + '</div>' +
        '<div class="cenik-cena"><span class="cenik-val">' + cenaFmt(x.cena1) + '</span><button type="button" class="btn-mini cenik-restore" data-restore="' + x.sifra + '">Obnovi</button></div></div>';
    }).join('') + '</div>';
    box.innerHTML = html;
    var nz = document.getElementById('kosNazaj'); if (nz) nz.addEventListener('click', () => risiCeniki());
    box.querySelectorAll('[data-restore]').forEach(bn => bn.addEventListener('click', () => cenikObnovi(parseInt(bn.dataset.restore, 10))));
    box.querySelectorAll('[data-restoreorg]').forEach(bn => bn.addEventListener('click', () => cenikObnoviOrg(bn.dataset.restoreorg)));
  }
  async function cenikObnovi(s) {
    const { error } = await sb.from('pricelist').update({ deleted_at: null }).eq('sifra', s);
    if (error) { toast(napakaBesedilo(error)); return; }
    toast('Artikel obnovljen'); CENIK = null; CENIKMAP = null;
    risiKos();
  }
  async function cenikObnoviOrg(id) {
    const { error } = await sb.from('orgs').update({ deleted_at: null }).eq('id', id);
    if (error) { toast(napakaBesedilo(error)); return; }
    await naloziOrge(); zgradiCenikMap();
    toast('Stranka obnovljena'); risiKos();
  }
  async function uvoziCenik() {
    const b = $('cenikUvoz'); if (!b) return;
    b.disabled = true; b.textContent = 'Uvažam …';
    try {
      const r = await fetch('ceniki.json', { cache: 'no-cache' });
      const j = await r.json();
      const rows = (j.postavke || []).map(x => ({ sifra: x.s, koda: x.k, naziv: x.n, em: x.e, cena1: x.c1, cena2: x.c2 }));
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await sb.from('pricelist').upsert(rows.slice(i, i + 200), { onConflict: 'sifra', ignoreDuplicates: true });
        if (error) throw error;
      }
      toast('Cenik uvožen (' + rows.length + ' artiklov)');
      await risiCeniki();
    } catch (e) {
      toast('Uvoz ni uspel: ' + (e.message || e));
    }
    b.disabled = false; b.textContent = 'Uvozi cenik iz PDF-ja';
  }

  function risiNastavitve() {
    oznaciTemo();
    if (!risiNastavitve._wired) {
      document.querySelectorAll('#sec-nastavitve [data-tema]').forEach(b => {
        b.addEventListener('click', () => nastaviTemo(b.dataset.tema));
      });
      risiNastavitve._wired = true;
    }
    risiMenijRed();
  }
  // Razvrščanje razdelkov levega menija (povleci; isti drag & drop kot pri artiklih).
  function risiMenijRed() {
    var sec = $('sec-nastavitve'); if (!sec) return;
    var panel = sec.querySelector('.menu-order-panel');
    if (!panel) {
      panel = document.createElement('div'); panel.className = 'panel menu-order-panel';
      panel.innerHTML = '<h3 class="sec-h">Vrstni red menija</h3><ul class="menu-order-list"></ul><button type="button" class="btn btn-narrow ghost menu-order-reset" style="margin-top:12px">Ponastavi privzeti vrstni red</button>';
      sec.appendChild(panel);
      panel.querySelector('.menu-order-reset').addEventListener('click', function () {
        try { localStorage.removeItem('sc-menu-order'); } catch (e) {} shraniNastavitve();
        meni(); if (meni._drsnik) meni._drsnik(); risiMenijRed(); toast('Vrstni red menija ponastavljen');
      });
    }
    var ul = panel.querySelector('.menu-order-list');
    var g = urediGlavni(glavniMeni());
    ul.innerHTML = g.map(function (x) {
      var zaklenjen = x[0] === 'domov';
      if (zaklenjen) {
        return '<li class="mo-locked" data-k="' + escape_(x[0]) + '"><span class="art-grip mo-spacer" aria-hidden="true"></span><span class="mo-ikona" aria-hidden="true">' + ikona(x[0]) + '</span><span class="mo-ime">' + escape_(x[1]) + '</span></li>';
      }
      return '<li data-k="' + escape_(x[0]) + '"><button type="button" class="art-grip dnd-handle" title="Povleci za razvrščanje" aria-label="Razvrsti">' + DND_ICON + '</button><span class="mo-ikona" aria-hidden="true">' + ikona(x[0]) + '</span><span class="mo-ime">' + escape_(x[1]) + '</span></li>';
    }).join('');
    dndSort(ul, 'li', '.dnd-handle', function (items) {
      // »domov« ostane vedno prvi, ne glede na položaj v seznamu.
      var red = items.map(function (li) { return li.dataset.k; }).filter(function (k) { return k !== 'domov'; });
      red.unshift('domov');
      try { localStorage.setItem('sc-menu-order', JSON.stringify(red)); } catch (e) {} shraniNastavitve();
      meni(); if (meni._drsnik) meni._drsnik();
      risiMenijRed(); // ponovno izriši, da »Pregled« vedno ostane na vrhu
    });
  }

  let _toastEl = null;
  // Napaka iz baze/omrežja → kratek slovenski stavek za uporabnika. Slovenska sporočila iz baze
  // (prožilci: »Lastnih pravic ni mogoče spremeniti.«) ostanejo; tehnična podrobnost gre v konzolo,
  // lastniku pa še v oklepaj (prej je vsak videl npr. »duplicate key value violates …«).
  function napakaBesedilo(e) {
    var m = String((e && (e.message || e.error_description || e.details)) || e || '').trim();
    var k = String((e && e.code) || '');
    var teh = /[a-z]+_[a-z]+|permission|row-level|policy|violates|relation|column|syntax|function|null value|duplicate|fetch|jwt|token|constraint|undefined|TypeError|[{}]/i;
    // naše sporočilo = slovensko (prožilec v bazi ali Error iz portala), brez tehničnih izrazov
    var slo = /[čšžČŠŽ]/.test(m) || /(^|\s)(ni|niso|je|za|na|se|lahko|najprej|nimate|nista)(\s|[.,]|$)/i.test(m);
    var nasa = m && slo && !teh.test(m) && /^[A-ZČŠŽ]/.test(m) && m.length < 160;
    var t;
    if (k === 'TIMEOUT') t = 'Ni odgovora. Preveri povezavo in poskusi znova.';
    else if (/failed to fetch|networkerror|load failed|network request failed|timeout/i.test(m)) t = 'Ni povezave z internetom. Poskusi znova.';
    else if (/jwt expired|invalid jwt|refresh token|not authenticated/i.test(m)) t = 'Seja je potekla. Odjavi se in prijavi znova.';
    else if (k === '23505' || /duplicate key|already exists/i.test(m)) t = 'Tak vnos že obstaja.';
    else if (k === '23503' || /foreign key/i.test(m)) t = 'Vnos je povezan z drugimi podatki, zato tega ni mogoče narediti.';
    else if (k === '23514' || k === '23502' || /check constraint|null value/i.test(m)) t = 'Vpisani podatki niso popolni ali veljavni.';
    else if (nasa) t = m;
    else if (k === '42501' || /row-level security|permission denied/i.test(m)) t = 'Za to nimate dovoljenja.';
    else t = 'Ni uspelo. Poskusi znova.';
    try { console.warn('[SmartClean] napaka:', e); } catch (_) {}
    if (t !== m && m && JE_LASTNIK()) t += ' (' + m.slice(0, 120) + ')';
    return t;
  }
  // toast(besedilo [, { besedilo, ob }]) — z dejanjem (npr. Natisni, Razveljavi) ostane dlje
  function toast(t, akcija) {
    if (!_toastEl) {
      _toastEl = document.createElement('div');
      _toastEl.className = 'sc-toast';
      _toastEl.setAttribute('role', 'status');
      _toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(_toastEl);
    }
    _toastEl.textContent = t;
    _toastEl._n = (_toastEl._n || 0) + 1;
    _toastEl.classList.toggle('z-akcijo', !!akcija);
    if (akcija) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'sc-toast-akc'; b.textContent = akcija.besedilo;
      b.addEventListener('click', function () { toastSkrij(); try { akcija.ob(); } catch (e) {} });
      _toastEl.appendChild(b);
    }
    var akc = document.getElementById('rfAkc'), sc = $('sec-cipi'), r = akc && sc && !sc.classList.contains('hidden') ? akc.getBoundingClientRect() : null;
    _toastEl.style.bottom = r && r.height && r.top < innerHeight ? Math.max(24, innerHeight - r.top + 12) + 'px' : '';   // Čipi: nad vrstico z gumbi
    _toastEl.classList.add('show');
    clearTimeout(_toastEl._h);
    _toastEl._h = setTimeout(toastSkrij, akcija ? 7000 : 2600);
  }
  // po izginotju brez gumba: skrit »Razveljavi« ne sme ostati pod prstom (npr. čez Potrdi)
  function toastSkrij() {
    if (!_toastEl) return;
    var n = _toastEl._n; _toastEl.classList.remove('show');
    setTimeout(function () { if (_toastEl._n !== n || _toastEl.classList.contains('show')) return; _toastEl.classList.remove('z-akcijo'); var b = _toastEl.querySelector('.sc-toast-akc'); if (b) b.remove(); }, 260);
  }
  // Dostopnost modalnih oken: ujemi fokus znotraj okna (Tab kroži) in ga ob
  // zaprtju vrni na element, ki je okno odprl (kot pri velikih ponudnikih).
  var _modalPrevFocus = null;
  function _modalA11y(back) {
    _modalPrevFocus = document.activeElement;
    var okno = back.querySelector('.sc-modal');
    var h = back.querySelector('h4');
    if (okno && h && h.textContent) {
      var mid = 'scm-' + Math.random().toString(36).slice(2, 8);
      h.id = mid; okno.setAttribute('aria-labelledby', mid);
    }
    function ostri() {
      return Array.prototype.filter.call(
        back.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'),
        function (el) { return !el.disabled && el.offsetParent !== null; }
      );
    }
    back._trap = function (e) {
      if (e.key !== 'Tab') return;
      var f = ostri(); if (!f.length) return;
      var prvi = f[0], zadnji = f[f.length - 1];
      if (e.shiftKey && document.activeElement === prvi) { e.preventDefault(); zadnji.focus(); }
      else if (!e.shiftKey && document.activeElement === zadnji) { e.preventDefault(); prvi.focus(); }
    };
    back.addEventListener('keydown', back._trap);
  }
  function _modalVrniFokus() {
    try { if (_modalPrevFocus && _modalPrevFocus.focus) _modalPrevFocus.focus(); } catch (e) {}
    _modalPrevFocus = null;
  }
  // Potrditveno okno V PORTALU (namesto brskalnikovega confirm). Vrne Promise<boolean>.
  function potrdiModal(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var danger = !!opts.nevarno;
      var back = document.createElement('div');
      back.className = 'sc-modal-back';
      back.innerHTML = '<div class="sc-modal" role="dialog" aria-modal="true"><h4></h4><p></p><div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" data-no></button><button type="button" class="sc-modal-btn ' + (danger ? 'danger' : 'primary') + '" data-yes></button></div></div>';
      back.querySelector('h4').textContent = opts.naslov || 'Potrditev';
      back.querySelector('p').textContent = opts.sporocilo || '';
      back.querySelector('[data-no]').textContent = opts.preklici || 'Prekliči';
      back.querySelector('[data-yes]').textContent = opts.potrdi || 'Potrdi';
      document.body.appendChild(back);
      _modalA11y(back);
      requestAnimationFrame(function () { back.classList.add('show'); });
      var done = false;
      function zapri(val) { if (done) return; done = true; back.classList.remove('show'); document.removeEventListener('keydown', onKey); setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); _modalVrniFokus(); resolve(val); }
      function onKey(e) { if (e.key === 'Escape') zapri(false); else if (e.key === 'Enter') zapri(true); }
      back.querySelector('[data-no]').addEventListener('click', function (e) { e.stopPropagation(); zapri(false); });
      back.querySelector('[data-yes]').addEventListener('click', function (e) { e.stopPropagation(); zapri(true); });
      back.addEventListener('click', function (e) { if (e.target === back) zapri(false); });
      document.addEventListener('keydown', onKey);
      var yb = back.querySelector('[data-yes]'); if (yb) yb.focus();
    });
  }
  // Vnosno okno (nadomešča window.prompt) — vrne niz ali null (preklic).
  function vnesiModal(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var back = document.createElement('div');
      back.className = 'sc-modal-back';
      back.innerHTML = '<div class="sc-modal" role="dialog" aria-modal="true"><h4></h4><p></p><input type="text" class="sc-modal-input"><div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" data-no></button><button type="button" class="sc-modal-btn primary" data-yes></button></div></div>';
      back.querySelector('h4').textContent = opts.naslov || 'Vnos';
      var pEl = back.querySelector('p'); if (opts.sporocilo) pEl.textContent = opts.sporocilo; else pEl.style.display = 'none';
      var inp = back.querySelector('.sc-modal-input');
      inp.value = opts.privzeto || ''; if (opts.placeholder) inp.placeholder = opts.placeholder;
      back.querySelector('[data-no]').textContent = opts.preklici || 'Prekliči';
      back.querySelector('[data-yes]').textContent = opts.potrdi || 'Shrani';
      document.body.appendChild(back);
      _modalA11y(back);
      requestAnimationFrame(function () { back.classList.add('show'); });
      var done = false;
      function zapri(val) { if (done) return; done = true; back.classList.remove('show'); document.removeEventListener('keydown', onKey); setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); _modalVrniFokus(); resolve(val); }
      function onKey(e) { if (e.key === 'Escape') zapri(null); else if (e.key === 'Enter') { e.preventDefault(); zapri(inp.value); } }
      back.querySelector('[data-no]').addEventListener('click', function (e) { e.stopPropagation(); zapri(null); });
      back.querySelector('[data-yes]').addEventListener('click', function (e) { e.stopPropagation(); zapri(inp.value); });
      back.addEventListener('click', function (e) { if (e.target === back) zapri(null); });
      document.addEventListener('keydown', onKey);
      setTimeout(function () { inp.focus(); inp.select(); }, 60);
    });
  }
  // ── Enotni spustni meniji (custom select) po standardu portala ──────────
  // Nativni <select> ostane (skrit) — vsa obstoječa logika (value/change) dela naprej.
  // Končni ↓/↑ v besedilu možnosti nariše kot SVG: znak iz pisave sedi na osnovni črti
  // in je videti zamaknjen navzdol. Nativni <option> obdrži znak (rezerva brez JS).
  var CS_SMER = { '↓': '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="6 13 12 19 18 13"/>',
                  '↑': '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="6 11 12 5 18 11"/>' };
  function csNapis(el, besedilo) {
    var m = /^(.*\S)\s*([↓↑])$/.exec(besedilo || '');
    el.textContent = m ? m[1] : (besedilo || '');
    if (m) el.insertAdjacentHTML('beforeend', '<svg class="cs-smer" role="img" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-label="' + (m[2] === '↓' ? 'padajoče' : 'naraščajoče') + '">' + CS_SMER[m[2]] + '</svg>');
  }
  function olepsajSelect(sel) {
    try {
      if (!sel || sel._cs || sel.multiple || sel.dataset.noCs === '1') return;
      var wrap = document.createElement('div'); wrap.className = 'cs';
      if (sel.id) wrap.dataset.za = sel.id;   // za slog (npr. postavitev orodne vrstice na telefonu)
      sel.parentNode.insertBefore(wrap, sel); wrap.appendChild(sel);
      var trig = document.createElement('button'); trig.type = 'button'; trig.className = 'cs-trigger';
      trig.innerHTML = '<span class="cs-val"></span><span class="cs-arr" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>';
      wrap.appendChild(trig);
      if (sel.closest && sel.closest('.ur-post')) trig.tabIndex = -1;   // vrstica postavke: Tab/puščice iPhona med količinami
      sel._cs = true; sel.classList.add('cs-native');
      var valEl = trig.querySelector('.cs-val');
      function syncVal() { var o = sel.options[sel.selectedIndex]; csNapis(valEl, o ? o.textContent : ''); }
      syncVal();
      var panel = null;
      function zapri() { if (panel) { panel.remove(); panel = null; } wrap.classList.remove('cs-open'); document.removeEventListener('mousedown', ven, true); document.removeEventListener('keydown', tipka, true); }
      function ven(e) { if (!wrap.contains(e.target)) zapri(); }
      function tipka(e) { if (e.key === 'Escape') zapri(); }
      function odpri() {
        if (panel) { zapri(); return; }
        if (sel.disabled) return;
        panel = document.createElement('div'); panel.className = 'cs-panel';
        for (var i = 0; i < sel.options.length; i++) {
          var o = sel.options[i];
          var it = document.createElement('div'); it.className = 'cs-opt' + (i === sel.selectedIndex ? ' sel' : '') + (o.disabled ? ' dis' : '');
          csNapis(it, o.textContent); it.dataset.i = i; panel.appendChild(it);
        }
        panel.addEventListener('mousedown', function (e) { e.preventDefault(); var it = e.target.closest('.cs-opt'); if (!it || it.classList.contains('dis')) return; sel.selectedIndex = parseInt(it.dataset.i, 10); syncVal(); sel.dispatchEvent(new Event('change', { bubbles: true })); zapri(); });
        wrap.appendChild(panel); wrap.classList.add('cs-open');
        var s = panel.querySelector('.cs-opt.sel'); if (s) s.scrollIntoView({ block: 'nearest' });
        document.addEventListener('mousedown', ven, true); document.addEventListener('keydown', tipka, true);
      }
      trig.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); odpri(); });
      // onemogočen izbirnik (npr. med klicem): tudi lepši gumb
      var dis = function () { trig.disabled = sel.disabled; wrap.classList.toggle('cs-dis', sel.disabled); if (sel.disabled) zapri(); };
      dis(); try { new MutationObserver(dis).observe(sel, { attributes: true, attributeFilter: ['disabled'] }); } catch (e) {}
      sel.addEventListener('change', syncVal);
      try { var mo = new MutationObserver(syncVal); mo.observe(sel, { childList: true, attributes: true, attributeFilter: ['value'] }); } catch (e) {}
    } catch (e) {}
  }
  function olepsajVse(root) { (root || document).querySelectorAll('select:not(.cs-native)').forEach(olepsajSelect); }
  function zazeniCustomSelecte() {
    olepsajVse(document);
    try {
      var mo = new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          (m.addedNodes || []).forEach(function (n) {
            if (n.nodeType !== 1) return;
            if (n.tagName === 'SELECT') olepsajSelect(n);
            else if (n.querySelectorAll) n.querySelectorAll('select:not(.cs-native)').forEach(olepsajSelect);
          });
        });
      });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }

  /* ══════════ STRANKE (osebje) ══════════ */
  let ARTSTEVILO = {};
  function fmtKg(kg) { return tezaFmt(kg); }
  function fmtTona(kg) { return tezaFmt(kg); }
  function kgPoStrankiMesec() {
    const z = new Date(), y = z.getFullYear(), m = z.getMonth(), map = {};
    LISTI.forEach(l => {
      const d = new Date(String(l.doc_date || '') + 'T00:00:00');
      if (d.getFullYear() === y && d.getMonth() === m) map[l.org_id] = (map[l.org_id] || 0) + (parseFloat(l.weight_kg) || 0);
    });
    return map;
  }
  async function risiStranke() {
    if (OSEBJE) { const b = $('novaStrankaBtn'); if (b) b.classList.remove('hidden'); }
    render();
  }
  function render() {
    var _sy = window.scrollY;
    const q = $('search').value.trim().toLowerCase();
    const kgm = kgPoStrankiMesec();
    // razvrstitev strank (skupna nastavitev; velja tudi za Cenik) — po prometu ali abecedno
    const ss = $('strankeSort'); if (ss) ss.value = custOrderMode();
    let list = q ? ORGSEZNAM.filter(o => (o.name + ' ' + (o.legal_name || '')).toLowerCase().includes(q)) : ORGSEZNAM.slice();
    list = razvrstiStranke(list, custOrderMode(), kgm);
    const skupajKg = ORGSEZNAM.reduce((s, o) => s + (kgm[o.id] || 0), 0);
    $('count').textContent = ORGSEZNAM.length + ' strank · ' + fmtKg(skupajKg) + ' opranega ta mesec';
    if (!list.length) {
      $('content').innerHTML = '<div class="rows"><div class="empty"><h3>Nič se ne ujema</h3></div></div>';
      oknoPoIzrisu();
      return;
    }
    const naj = Math.max(...ORGSEZNAM.map(o => kgm[o.id] || 0), 1);
    $('content').innerHTML = '<div class="rows">' + list.map((o, i) => {
      const kg = kgm[o.id] || 0;
      const _cen = cenikStrankeIme(o.id);
      return `<div class="lcell"><button class="row" type="button" data-id="${o.id}" data-i="${i}" style="${naslovnica(null, o.id)}" aria-expanded="false">
      <span><span class="row-name"><span class="row-nm">${escape_(o.name)}</span></span><br><span class="row-legal" title="${escape_(o.legal_name || '')}">${escape_(lepNaziv(o.legal_name || o.name))}</span><span class="row-cenik" data-cenik-org="${o.id}"${_cen ? '' : ' hidden'}>${escape_(_cen)}</span></span>
      <span class="row-pct" title="Delež vseh količin ta mesec">${skupajKg ? (Math.round(kg / skupajKg * 1000) / 10).toLocaleString('sl-SI') + ' %' : '—'}</span>
      <span class="num${kg ? '' : ' nic'}">${fmtKg(kg)}</span>
      <span class="chev" aria-hidden="true">›</span>
    </button><div class="arts" id="a${i}"></div></div>`;
    }).join('') + '</div>';
    document.querySelectorAll('#content .row').forEach(b => { b.addEventListener('click', () => toggle(b)); strankaPredNalozi(b); });
    zagotoviBarve();
    oknoPoIzrisu();
    requestAnimationFrame(function () { window.scrollTo(0, _sy); });
  }
  $('search').addEventListener('input', render);
  { const ss = $('strankeSort'); if (ss) { ss.value = custOrderMode(); ss.addEventListener('change', function () { try { localStorage.setItem('sc-cust-order', ss.value); } catch (e) {} shraniNastavitve(); render(); }); } }
  { const b = $('novaStrankaBtn'); if (b) b.addEventListener('click', () => novaStranka()); }

  // Stranka se odpre v OKNU (prej se je razprla v mreži). Artikli se naložijo PRED
  // odprtjem — okno zraste naravnost v končno velikost, namesto da bi se odprlo prazno
  // (»Nalagam …«) in se artikli pojavili šele za njim.
  function strankaNalozi(btn) {
    const box = $('a' + btn.dataset.i);
    if (!box) return Promise.resolve();
    box._kartica = btn;   // značko »Splošni cenik« sinhroniziramo na kartici, ne na sosednjem elementu (ta je v oknu drug)
    if (box.dataset.loaded) return Promise.resolve();
    if (!box._nalaganje) {
      // loaded nastavi risiArtikleBox sam, le ob uspehu — po napaki se ob naslednjem odprtju poskusi znova.
      box._nalaganje = risiArtikleBox(box, btn.dataset.id, true)
        .then(null, function () {})
        .then(function () { box._nalaganje = null; });
    }
    return box._nalaganje;
  }
  async function toggle(btn) {
    if (_okno || btn._nalagam) return;
    const box = $('a' + btn.dataset.i);
    const id = btn.dataset.id;
    if (!box.dataset.loaded) {
      btn._nalagam = true; btn.classList.add('nalaga');
      await strankaNalozi(btn);
      btn._nalagam = false; btn.classList.remove('nalaga');
      if (!btn.isConnected || _okno) return;   // vmes izrisano na novo ali že odprto
    }
    box._kartica = btn;
    oknoOdpri(btn, box, () => document.querySelector('#content .row[data-id="' + String(id).replace(/"/g, '\\"') + '"]'));
  }
  // Ko se miška za trenutek ustavi nad kartico, začni nalagati artikle — do klika so
  // navadno že pripravljeni. Zamik, da prelet čez mrežo ne sproži desetin poizvedb.
  function strankaPredNalozi(btn) {
    var t = null;
    btn.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'mouse') return; t = setTimeout(function () { strankaNalozi(btn); }, 140); });
    btn.addEventListener('pointerleave', function () { clearTimeout(t); });
    btn.addEventListener('pointerdown', function () { strankaNalozi(btn); });   // dotik: začni že ob pritisku
  }
  // brezPomika: nalaganje v ozadju (pred odprtjem okna) — ne vračaj strani na staro višino,
  // sicer bi te med drsenjem vrglo nazaj, ko se nalaganje konča.
  async function risiArtikleBox(box, orgId, brezPomika) {
    var _sy = window.scrollY;
    // ob osvežitvi (box že ima vsebino) ne pokaži »Nalagam« — brez utripa
    if (!box.dataset.loaded) box.innerHTML = NALAGANJE;
    const org = ORGSEZNAM.find(o => o.id === orgId) || {};
    await nalozicenik();
    let arts;
    const r = await sb.from('articles').select('id,name,cena_sifra,aktiven,teza,viden_app').eq('org_id', orgId).order('sort_order');
    if (r.error) {
      const r1b = await sb.from('articles').select('id,name,cena_sifra').eq('org_id', orgId).order('sort_order');
      if (r1b.error) {
        const r2 = await sb.from('articles').select('id,name').eq('org_id', orgId).order('sort_order');
        if (r2.error) { box.innerHTML = '<p class="meta">Napaka: ' + escape_(r2.error.message) + '</p>'; return; }
        arts = r2.data || [];
      } else arts = r1b.data || [];
    } else arts = r.data || [];
    // isti vrstni red kot v Ceniku: razvrsti po sort_order povezane cene (pricelist)
    arts.sort(function (a, b) {
      var pa = (a.cena_sifra != null && CENIKMAP && CENIKMAP[a.cena_sifra]) ? CENIKMAP[a.cena_sifra].sort_order : null;
      var pb = (b.cena_sifra != null && CENIKMAP && CENIKMAP[b.cena_sifra]) ? CENIKMAP[b.cena_sifra].sort_order : null;
      if (pa != null && pb != null && pa !== pb) return pa - pb;
      if (pa != null && pb == null) return -1;
      if (pa == null && pb != null) return 1;
      return (a.name || '').localeCompare(b.name || '', 'sl');
    });
    // Skupno število opranih kosov posameznega artikla (vseh časov) — prek RPC.
    var kosMap = {};
    try { var _kr = await sb.rpc('stranka_kosi', { p_org: orgId }); if (_kr && !_kr.error) (_kr.data || []).forEach(function (x) { kosMap[x.article_id] = Number(x.kosov) || 0; }); } catch (e) {}
    const meta = [org.vat_id ? 'Davčna <b>' + escape_(org.vat_id) + '</b>' : 'Brez davčne številke', org.address ? escape_(org.address) : 'Brez naslova'].join(' · ');
    let html = '<p class="meta">' + meta + '</p>';
    if (OSEBJE) html += `<div class="u-acts" style="margin:2px 0 10px"><button type="button" class="str-edit">Uredi podatke stranke</button></div>`;
    function cenaOznaka(a) {
      const c = cenaZaArtikel(a.cena_sifra);
      if (c != null) return '<span class="art-cena on" title="' + escape_((CENIKMAP[a.cena_sifra] && CENIKMAP[a.cena_sifra].naziv) || '') + '">' + cenaFmt(c) + '</span>';
      return '<span class="art-cena">ni cene</span>';
    }
    function idOznaka(a) {
      const k = (a.cena_sifra != null && CENIKMAP[a.cena_sifra]) ? CENIKMAP[a.cena_sifra].koda : null;
      return k ? '<span class="art-id">' + escape_(normId(k)) + '</span>' : '<span class="art-id art-id-none">brez ID</span>';
    }
    var _na = arts.length;
    var _besed = _na === 1 ? 'artikel' : (_na === 2 ? 'artikla' : ((_na === 3 || _na === 4) ? 'artikli' : 'artiklov'));
    // seznam artiklov z urejanjem teže (teža je NA ARTIKLU — pri vsaki stranki svoja)
    function tezaOznaka(a, idx) {
      if (OSEBJE) {
        var tv = (a.teza != null && a.teza !== '') ? String(a.teza).replace('.', ',') : '';
        return '<span class="str-art-teza"><input type="text" inputmode="decimal" class="str-teza-in" data-idx="' + idx + '" value="' + escape_(tv) + '" placeholder="0,00" aria-label="Teža na kos"><span class="str-teza-u">kg</span></span>';
      }
      return '<span class="str-art-teza u-sub">' + (a.teza != null && a.teza !== '' ? fmtTeza(a.teza) : '—') + '</span>';
    }
    function kosovOznaka(a) {
      var n = kosMap[a.id] || 0;
      return '<span class="str-art-kos" title="Skupno opranih kosov (vseh časov)">' + (n ? stevilo(n) + ' kos' : '—') + '</span>';
    }
    function appOznaka(a, idx) {
      var on = a.viden_app !== false;
      if (OSEBJE) return '<label class="str-art-app" title="Viden v aplikaciji za to stranko"><input type="checkbox" class="str-app-chk" data-idx="' + idx + '"' + (on ? ' checked' : '') + '><span>app</span></label>';
      return on ? '' : '<span class="str-art-app off" title="Skrit v aplikaciji">skrit</span>';
    }
    var artRows = arts.map(function (a, i) {
      return '<div class="str-art">' + idOznaka(a) + '<span class="str-art-nm">' + escape_(a.name || '') + '</span>' + kosovOznaka(a) + tezaOznaka(a, i) + appOznaka(a, i) + '</div>';
    }).join('');
    html += '<div class="str-arts">' + (arts.length ? artRows : '<p class="meta">Brez artiklov v ceniku.</p>') + '</div>';
    html += `<p class="art-cenik-hint">${_na ? _na + ' ' + _besed + ' v ceniku' : ''}${OSEBJE ? `${_na ? ' · ' : ''}<button type="button" class="art-to-cenik" data-org="${orgId}">Uredi v Ceniku ›</button>` : ''}</p>`;
    if (OSEBJE) html += '<div class="str-rfid"></div>';
    box.innerHTML = html;
    if (OSEBJE) rfStrankaBlok(box.querySelector('.str-rfid'), orgId);
    if (OSEBJE) {
      { const eb = box.querySelector('.str-edit'); if (eb) eb.addEventListener('click', e => { e.stopPropagation(); urediStranko(box, orgId); }); }
      { const cl = box.querySelector('.art-to-cenik'); if (cl) cl.addEventListener('click', e => { e.stopPropagation(); var pre = strankaSkupina(orgId); _artOpen = {}; if (pre) _artOpen[pre] = true; pojdi('artikli'); }); }
      box.querySelectorAll('.str-teza-in').forEach(function (inp) {
        inp.addEventListener('click', function (e) { e.stopPropagation(); });
        inp.addEventListener('change', async function () {
          var a = arts[+inp.dataset.idx]; if (!a) return;
          var raw = inp.value.trim().replace(',', '.');
          var teza = raw === '' ? null : parseFloat(raw);
          if (teza != null && (isNaN(teza) || teza < 0)) { toast('Neveljavna teža.'); return; }
          var e1 = (await sb.from('articles').update({ teza: teza }).eq('id', a.id)).error;
          if (e1) { toast(napakaBesedilo(e1)); return; }
          a.teza = teza;
          logDodaj('Artikli', 'Urejeno', 'Teža »' + (a.name || '') + '« · ' + (teza != null ? tezaFmt(teza) : '—'));
          toast('Teža shranjena.');
        });
      });
      box.querySelectorAll('.str-app-chk').forEach(function (chk) {
        chk.addEventListener('click', function (e) { e.stopPropagation(); });
        chk.addEventListener('change', async function () {
          var a = arts[+chk.dataset.idx]; if (!a) return;
          var val = chk.checked;
          var e1 = (await sb.from('articles').update({ viden_app: val }).eq('id', a.id)).error;
          if (e1) { toast(napakaBesedilo(e1)); chk.checked = !val; return; }
          a.viden_app = val;
          logDodaj('Artikli', 'Urejeno', (val ? 'Viden v app' : 'Skrit v app') + ' · »' + (a.name || '') + '«');
          toast(val ? 'Artikel viden v aplikaciji.' : 'Artikel skrit v aplikaciji.');
        });
      });
    }
    // sinhroniziraj značko »Splošni cenik« na vrstici stranke (živo, ob vsaki spremembi artiklov)
    try {
      var _row = box._kartica || box.previousElementSibling;
      if (_row && _row.classList && _row.classList.contains('row')) {
        var _priced = arts.filter(function (a) { return a.cena_sifra != null; });
        var _spl = _priced.length > 0 && _priced.every(function (a) { var p = CENIKMAP[a.cena_sifra]; return p && jeSc(p.koda); });
        void _spl;
        if (CLANI) { CLANI = CLANI.filter(function (a) { return a.org_id !== orgId; }).concat(arts.map(function (a) { return { id: a.id, org_id: orgId, name: a.name, cena_sifra: a.cena_sifra, sort_order: a.sort_order }; })); }
        var _cn = _row.querySelector('.row-cenik'); if (_cn) { var _t = cenikStrankeIme(orgId); _cn.textContent = _t; _cn.hidden = !_t; }
        if (_okno && _okno.vsebina === box) oknoGlava();
      }
    } catch (e) {}
    box.dataset.loaded = '1';
    if (!brezPomika) requestAnimationFrame(function () { window.scrollTo(0, _sy); });
  }
  // Dodaj OBSTOJEČ artikel (deljeni katalog) tej stranki — v razdelku Stranke.
  async function dodajObstojecStranka(orgId, box) {
    await nalozicenik();
    const host = box.querySelector('.art-exist-box'); if (!host) return;
    if (host.dataset.open) { host.innerHTML = ''; host.removeAttribute('data-open'); return; }
    host.dataset.open = '1';
    var ex = {};
    var r = await sb.from('articles').select('cena_sifra').eq('org_id', orgId);
    if (!r.error) (r.data || []).forEach(function (a) { if (a.cena_sifra != null) ex[a.cena_sifra] = true; });
    (CENIK || []).forEach(function (x) { if (x.org_id === orgId) ex[x.sifra] = true; });
    host.innerHTML = '<div class="cenik-pick" style="border:1px solid var(--line);border-radius:12px;margin-top:10px"><input type="text" class="cenik-pick-in" placeholder="Iskanje obstoječega artikla po ID ali nazivu …"><div class="cenik-pick-list"></div></div>';
    var inp = host.querySelector('.cenik-pick-in'), listEl = host.querySelector('.cenik-pick-list');
    inp.addEventListener('click', function (e) { e.stopPropagation(); }); inp.focus();
    function render() {
      var qq = inp.value.trim().toLowerCase(), seen = {}, prods = [];
      (CENIK || []).forEach(function (x) { if (ex[x.sifra] || seen[x.sifra]) return; seen[x.sifra] = true; if (qq && !((x.naziv || '').toLowerCase().includes(qq) || normId(x.koda).toLowerCase().includes(qq))) return; prods.push(x); });
      prods.sort(function (a, b) { return (a.naziv || '').localeCompare(b.naziv || '', 'sl'); }); prods = prods.slice(0, 80);
      listEl.innerHTML = prods.length ? prods.map(function (x) { return '<button type="button" class="cenik-pick-item" data-s="' + x.sifra + '"><span class="pk-id">' + escape_(normId(x.koda) || '—') + '</span><span class="pk-nm">' + escape_(x.naziv || '') + '</span><b class="pk-c">' + cenaFmt(x.cena1) + '</b></button>'; }).join('') : '<p class="u-sub" style="padding:10px 4px">Ni artiklov za dodati.</p>';
      listEl.querySelectorAll('.cenik-pick-item').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); izberi(parseInt(b.dataset.s, 10)); }); });
    }
    async function izberi(sif) {
      var p = CENIKMAP[sif]; if (!p) return;
      var mx = await sb.from('articles').select('sort_order').eq('org_id', orgId).order('sort_order', { ascending: false }).limit(1);
      var so = ((mx.data && mx.data[0] && mx.data[0].sort_order) || 0) + 1;
      var ins = await sb.from('articles').insert({ org_id: orgId, name: p.naziv || '', cena_sifra: sif, sort_order: so });
      if (ins.error) { toast(napakaBesedilo(ins.error)); return; }
      if (CLANI) CLANI.push({ org_id: orgId, name: p.naziv || '', cena_sifra: sif, sort_order: so });
      toast('Artikel dodan stranki');
      risiArtikleBox(box, orgId);
    }
    inp.addEventListener('input', render); render();
  }
  async function shraniArtVrstniRed(ul) {
    const lis = [].slice.call(ul.querySelectorAll('li'));
    if (!lis.length) return;
    // Zapiši vrstni red v pricelist.sort_order (skupni vir za Cenik in Stranke) + v articles.sort_order.
    const artUpd = [], priceUpd = [];
    lis.forEach((el, i) => {
      if (el.dataset.artid) artUpd.push(sb.from('articles').update({ sort_order: i }).eq('id', el.dataset.artid));
      const s = el.dataset.s ? parseInt(el.dataset.s, 10) : null;
      if (s != null && !isNaN(s)) { priceUpd.push(sb.from('pricelist').update({ sort_order: i }).eq('sifra', s)); if (CENIKMAP && CENIKMAP[s]) CENIKMAP[s].sort_order = i; }
    });
    const res = await Promise.all(artUpd.concat(priceUpd));
    if (res.some(r => r.error)) toast('Vrstni red ni v celoti shranjen.'); else toast('Vrstni red shranjen');
  }
  function poveziArtikel(btn, box, orgId) {
    const li = btn.closest('li');
    const artId = btn.dataset.art;
    const curS = btn.dataset.s !== '' ? parseInt(btn.dataset.s, 10) : null;
    const org = ORGSEZNAM.find(o => o.id === orgId) || {};
    if (!CENIK || !CENIK.length) { toast('Cenik je prazen — najprej ustvari artikle v razdelku Ceniki.'); return; }
    li.innerHTML = '<div class="art-pick"><input type="text" class="art-pick-in" placeholder="Iskanje po ceniku …">' +
      '<div class="art-pick-list"></div><div class="art-pick-acts">' +
      (curS != null ? '<button type="button" class="art-pick-clear">Odveži</button>' : '') +
      '<button type="button" class="art-pick-cancel">Prekliči</button></div></div>';
    const inp = li.querySelector('.art-pick-in'), listEl = li.querySelector('.art-pick-list');
    inp.addEventListener('click', e => e.stopPropagation());
    inp.focus();
    // artikli te stranke iz cenika (org_id) — »manj stvari«; iskanje pa gre čez cel cenik
    const lastni = CENIK.filter(x => x.org_id === orgId);
    const imaLastne = lastni.length > 0;
    function render() {
      const q = inp.value.trim().toLowerCase();
      let items;
      if (q) items = CENIK.filter(x => (x.naziv || '').toLowerCase().includes(q) || (x.koda || '').toLowerCase().includes(q) || String(x.sifra) === q);
      else items = imaLastne ? lastni : CENIK;
      items = items.slice(0, 60);
      listEl.innerHTML = (items.length ? items.map(x => '<button type="button" class="art-pick-item' + (x.sifra === curS ? ' on' : '') + '" data-s="' + x.sifra + '"><span>' + escape_(x.naziv) + '</span><b>' + cenaFmt(x.cena1) + '</b></button>').join('') : '<p class="u-sub" style="padding:10px 4px">Ni zadetkov.</p>');
      listEl.querySelectorAll('.art-pick-item').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); izberi(parseInt(b.dataset.s, 10)); }));
    }
    async function izberi(sifra) {
      const { error } = await sb.from('articles').update({ cena_sifra: sifra }).eq('id', artId);
      if (error) { toast(napakaBesedilo(error)); return; }
      toast('Cena povezana'); risiArtikleBox(box, orgId);
    }
    li.querySelector('.art-pick-cancel').addEventListener('click', e => { e.stopPropagation(); risiArtikleBox(box, orgId); });
    const clr = li.querySelector('.art-pick-clear');
    if (clr) clr.addEventListener('click', async e => { e.stopPropagation(); const { error } = await sb.from('articles').update({ cena_sifra: null }).eq('id', artId); if (error) { toast(napakaBesedilo(error)); return; } toast('Odvezano'); risiArtikleBox(box, orgId); });
    inp.addEventListener('input', render);
    render();
  }
  async function dodajArtikel(orgId, name, box, id) {
    await nalozicenik();
    id = normId(id);
    if (id && idZaseden(id, null)) { toast('ID ' + id + ' je že v uporabi.'); return; }
    // Ustvari tudi zapis v ceniku (pricelist), da je artikel viden v razdelku Ceniki, kjer se doda cena.
    var novaSif = null;
    if (CENIK) {
      novaSif = await naslednjaSifra();
      var sibs = CENIK.filter(function (x) { return x.org_id === orgId; });
      var so = sibs.reduce(function (m, x) { return Math.max(m, x.sort_order != null ? x.sort_order : 0); }, 0) + 1;
      var novaRec = { sifra: novaSif, koda: (id || ''), naziv: name, em: 'kos', cena1: 0, cena2: 0, org_id: orgId, sort_order: so };
      var pe = await sb.from('pricelist').insert(novaRec);
      if (pe.error) { novaSif = null; } // cenik brez razširitve (org_id) — nadaljuj le z artiklom
      else { CENIK.push(novaRec); zgradiCenikMap(); }
    }
    const { data: maxd } = await sb.from('articles').select('sort_order').eq('org_id', orgId).order('sort_order', { ascending: false }).limit(1);
    const nextOrder = ((maxd && maxd[0] && maxd[0].sort_order) || 0) + 1;
    var artRec = { org_id: orgId, name, sort_order: nextOrder };
    if (novaSif != null) artRec.cena_sifra = novaSif;
    const { error } = await sb.from('articles').insert(artRec);
    if (error) { toast(napakaBesedilo(error)); return; }
    toast(novaSif != null ? 'Artikel dodan (viden tudi v Ceniku)' : 'Artikel dodan');
    await risiArtikleBox(box, orgId);
  }
  // Vklop/izklop vidnosti artikla v aplikaciji (tablici). Ne briše — samo skrije.
  async function preklopiArtikelViden(artId, on, box, orgId) {
    const { error } = await sb.from('articles').update({ aktiven: on }).eq('id', artId);
    if (error) { toast(/aktiven/.test(error.message || '') ? 'Najprej zaženi migracijo (stolpec »aktiven«).' : napakaBesedilo(error)); return; }
    toast(on ? 'Artikel viden v aplikaciji' : 'Artikel skrit v aplikaciji');
    await risiArtikleBox(box, orgId);
  }
  async function izbrisiArtikel(artId, box, orgId) {
    var _li = box.querySelector('li[data-artid="' + artId + '"]');
    var _nm = (_li && _li.querySelector('.art-nm')) ? _li.querySelector('.art-nm').textContent.trim() : '';
    var _ok = await potrdiModal({ naslov: 'Odstrani artikel', sporocilo: _nm ? ('Odstranim artikel »' + _nm + '« iz cenika te stranke?') : 'Odstranim ta artikel iz cenika te stranke?', potrdi: 'Odstrani', preklici: 'Prekliči', nevarno: true });
    if (!_ok) return;
    // če je artikel povezan z lastno ceno te stranke, jo mehko izbriši tudi iz cenika
    var sif = null;
    const ad = await sb.from('articles').select('cena_sifra').eq('id', artId).maybeSingle();
    if (ad && ad.data) sif = ad.data.cena_sifra;
    const { error } = await sb.from('articles').delete().eq('id', artId);
    if (error) { toast(napakaBesedilo(error)); return; }
    if (sif != null && CENIKMAP && CENIKMAP[sif] && CENIKMAP[sif].org_id === orgId) {
      await sb.from('pricelist').update({ deleted_at: new Date().toISOString() }).eq('sifra', sif);
      if (CENIK) { CENIK = CENIK.filter(function (x) { return x.sifra !== sif; }); zgradiCenikMap(); }
    }
    toast('Artikel odstranjen');
    await risiArtikleBox(box, orgId);
  }
  function preimenujArtikel(btn, box, orgId) {
    const li = btn.closest('li');
    const id = btn.dataset.art, cur = btn.dataset.nm || '';
    const sif = li.dataset.s ? parseInt(li.dataset.s, 10) : null;
    const curId = (sif != null && CENIKMAP && CENIKMAP[sif]) ? normId(CENIKMAP[sif].koda) : '';
    li.innerHTML = '<div class="art-edit"><input type="text" class="art-ren-in" placeholder="Naziv artikla">' +
      '<div class="art-edit-r"><input type="text" class="art-id-in" placeholder="ID (PV001)" maxlength="5">' +
      '<button type="button" class="btn-mini art-ren-save">Shrani</button>' +
      '<button type="button" class="art-del art-ren-cancel" title="Prekliči" aria-label="Prekliči">' + IKO_ZAPRI + '</button></div></div>';
    const inp = li.querySelector('.art-ren-in'), idInp = li.querySelector('.art-id-in');
    inp.value = cur; idInp.value = curId;
    [inp, idInp].forEach(el => el.addEventListener('click', e => e.stopPropagation()));
    inp.focus();
    const konec = () => risiArtikleBox(box, orgId);
    li.querySelector('.art-ren-cancel').addEventListener('click', e => { e.stopPropagation(); konec(); });
    const shrani = async () => {
      const nm = inp.value.trim(); const novId = normId(idInp.value);
      if (!nm) { toast('Vpiši naziv.'); return; }
      if (novId && !veljavenId(novId)) { toast('ID mora biti 2 črki + 3 številke (npr. PV001).'); idInp.focus(); return; }
      if (novId && novId !== curId) { const z = idZaseden(novId, sif); if (z) { toast('ID ' + novId + ' že uporablja: ' + (z.naziv || '#' + z.sifra)); idInp.focus(); return; } }
      if (nm !== cur) {
        const e1 = (await sb.from('articles').update({ name: nm }).eq('id', id)).error;
        if (e1) { toast(napakaBesedilo(e1)); return; }
      }
      if (sif != null && CENIKMAP && CENIKMAP[sif] && CENIKMAP[sif].org_id === orgId) {
        // artikel že ima svoj zapis v ceniku → posodobi naziv + ID
        const patch = {}; if (nm !== cur) patch.naziv = nm; if (novId !== curId) patch.koda = novId;
        if (Object.keys(patch).length) {
          const e2 = (await sb.from('pricelist').update(patch).eq('sifra', sif)).error;
          if (e2) { toast(napakaBesedilo(e2)); return; }
          if (patch.naziv != null) CENIKMAP[sif].naziv = patch.naziv;
          if (patch.koda != null) CENIKMAP[sif].koda = patch.koda;
        }
      } else if (novId) {
        // artikel še nima zapisa v ceniku → ustvari ga, da lahko nosi ID (in ceno)
        await nalozicenik();
        var sibs = (CENIK || []).filter(function (x) { return x.org_id === orgId; });
        var so = sibs.reduce(function (m, x) { return Math.max(m, x.sort_order != null ? x.sort_order : 0); }, 0) + 1;
        var rec = null, e3 = null;
        for (var t = 0; t < 4; t++) {
          var newSif = (await naslednjaSifra()) + t;
          rec = { sifra: newSif, koda: novId, naziv: nm, em: 'kos', cena1: 0, cena2: 0, org_id: orgId, sort_order: so };
          e3 = (await sb.from('pricelist').insert(rec)).error;
          if (!e3) break;
          if (!/duplicat|unique|primary|already exists/i.test(e3.message || '')) break; // druga napaka → ne ponavljaj
        }
        if (e3) { toast('ID ni bilo mogoče shraniti: ' + e3.message); return; }
        const e4 = (await sb.from('articles').update({ cena_sifra: rec.sifra }).eq('id', id)).error;
        if (e4) { toast('Povezovanje ni uspelo. ' + napakaBesedilo(e4)); return; }
        if (CENIK) { CENIK.push(rec); zgradiCenikMap(); }
        toast('ID ' + novId + ' shranjen');
        await konec();
        return;
      }
      toast('Artikel shranjen');
      await konec();
    };
    li.querySelector('.art-ren-save').addEventListener('click', e => { e.stopPropagation(); shrani(); });
    [inp, idInp].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); shrani(); } else if (e.key === 'Escape') { konec(); } }));
  }
  function urediStranko(box, orgId) {
    const o = ORGSEZNAM.find(x => x.id === orgId) || {};
    box.innerHTML = `<div class="ur-form" style="border:none;padding:0;background:none">
      <label class="ur-f"><span>Naziv *</span><input type="text" data-e-naziv value="${escape_(o.name || '')}"></label>
      <div class="ur-grid">
        <label class="ur-f"><span>Podjetje</span><input type="text" data-e-podjetje value="${escape_(o.legal_name || '')}"></label>
        <label class="ur-f"><span>Davčna</span><input type="text" data-e-davcna value="${escape_(o.vat_id || '')}"></label>
      </div>
      <label class="ur-f"><span>Naslov</span><input type="text" data-e-naslov value="${escape_(o.address || '')}"></label>
      <div class="u-acts" style="margin-top:12px"><button type="button" class="danger" data-e-izbrisi>Izbriši stranko</button><button type="button" class="ur-save" data-e-shrani>Shrani</button><button type="button" data-e-preklici>Prekliči</button></div>
      <p class="u-sub ur-msg" data-e-msg></p></div>`;
    box.querySelector('[data-e-naziv]').addEventListener('click', e => e.stopPropagation());
    box.querySelector('[data-e-preklici]').addEventListener('click', e => { e.stopPropagation(); risiArtikleBox(box, orgId); });
    box.querySelector('[data-e-shrani]').addEventListener('click', e => { e.stopPropagation(); shraniStranko(box, orgId); });
    box.querySelector('[data-e-izbrisi]').addEventListener('click', e => { e.stopPropagation(); izbrisiStrankoStranke(orgId, box); });
  }
  async function shraniStranko(box, orgId) {
    const g = s => box.querySelector(s);
    const naziv = g('[data-e-naziv]').value.trim();
    const msg = g('[data-e-msg]');
    if (!naziv) { msg.textContent = 'Vpiši naziv.'; return; }
    if (ORGSEZNAM.some(o => o.id !== orgId && (o.name || '').toLowerCase() === naziv.toLowerCase())) { msg.textContent = 'Druga stranka že ima ta naziv.'; return; }
    const patch = { name: naziv, legal_name: g('[data-e-podjetje]').value.trim() || null, vat_id: g('[data-e-davcna]').value.trim() || null, address: g('[data-e-naslov]').value.trim() || null };
    msg.textContent = 'Shranjujem …';
    const { error } = await sb.from('orgs').update(patch).eq('id', orgId);
    if (error) { msg.textContent = napakaBesedilo(error); return; }
    const o = ORGSEZNAM.find(x => x.id === orgId);
    if (o) { o.name = patch.name; o.legal_name = patch.legal_name; o.vat_id = patch.vat_id; o.address = patch.address; }
    ORGIME[orgId] = patch.name;
    toast('Podatki shranjeni');
    await risiArtikleBox(box, orgId);
    render();
  }
  function izbrisiStrankoStranke(orgId, box) {
    const ime = ORGIME[orgId] || 'stranko';
    box.innerHTML = '<div class="str-delconf"><p class="cenik-warn">' + IKO_T_POZOR + 'Res izbrišem stranko <b>' + escape_(ime) + '</b>? Skrita bo iz Strank, Faktur in cenika. Artikli in spremni listi ostanejo. Obnoviš jo lahko 30 dni v Ceniki → »Nedavno brisani«.</p><div class="u-acts"><button type="button" class="cgrp-btn ghost" data-no>Prekliči</button><button type="button" class="cgrp-btn danger" data-yes>Izbriši</button></div></div>';
    box.querySelector('[data-no]').addEventListener('click', e => { e.stopPropagation(); risiArtikleBox(box, orgId); });
    box.querySelector('[data-yes]').addEventListener('click', async e => {
      e.stopPropagation();
      const { error } = await sb.from('orgs').update({ deleted_at: new Date().toISOString() }).eq('id', orgId);
      if (error) { toast(napakaBesedilo(error)); return; }
      ORGSEZNAM = ORGSEZNAM.filter(o => o.id !== orgId); delete ORGIME[orgId];
      if (typeof CENIK !== 'undefined' && CENIK) zgradiCenikMap();
      toast('Stranka izbrisana (obnovljiva 30 dni)');
      render();
    });
  }
  // Nova stranka se odpre v OKNU (kot nov spremni list) — skupaj s cenikom: splošni, skupina ali brez.
  async function novaStranka() {
    const box = $('novaStrankaBox');
    if (!box || _okno) return;
    const gumb = $('novaStrankaBtn'); if (gumb) gumb.classList.add('nalaga');
    try { await nalozicenik(); await naloziClane(); await naloziSkupineImena(); } catch (e) {}
    if (gumb) gumb.classList.remove('nalaga');
    const grupe = artikliGrupe();
    const kljuci = Object.keys(grupe).filter(k => k !== '—' && (grupe[k] || []).length)
      .sort((a, b) => a === 'SC' ? -1 : b === 'SC' ? 1 : a.localeCompare(b, 'sl'));
    const imeCenika = k => k === 'SC' ? 'Splošni cenik' : imeSkupine(k);
    const opcije = kljuci.map(k => `<option value="${escape_(k)}">${escape_(imeCenika(k))} · ${escape_(sklonArtiklov(grupe[k].length))}</option>`).join('') +
      '<option value="">Brez cenika</option>';
    box.innerHTML = `<div class="ur-form">
      <label class="ur-f"><span>Naziv</span><input type="text" data-naziv autocomplete="off"></label>
      <div class="ur-grid nl-2">
        <label class="ur-f"><span>Podjetje</span><input type="text" data-podjetje autocomplete="off"></label>
        <label class="ur-f"><span>Davčna</span><input type="text" data-davcna autocomplete="off"></label>
      </div>
      <label class="ur-f"><span>Naslov</span><input type="text" data-naslov autocomplete="off"></label>
      <label class="ur-f"><span>Cenik</span><select data-cenik>${opcije}</select></label>
      <p class="u-sub ur-msg" data-msg role="status" aria-live="polite"></p>
      <div class="u-acts"><button type="button" data-preklici>Prekliči</button><button type="button" class="ur-save" data-shrani>Ustvari</button></div></div>`;
    box._grupe = grupe; box._imeCenika = imeCenika;
    box.querySelector('[data-preklici]').addEventListener('click', () => oknoKoncaj());
    box.querySelector('[data-shrani]').addEventListener('click', () => shraniNovaStranka(box));
    box.querySelector('[data-naziv]').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); shraniNovaStranka(box); } });
    oknoOdpri(gumb, box, () => $('novaStrankaBtn'), {
      glava: () => { const h = document.createElement('h3'); h.className = 'sec-h'; h.textContent = 'Nova stranka'; return h; },
      varuj: 'Shranim stranko?',
      obZaprtju: () => { box.innerHTML = ''; }
    });
    setTimeout(() => { const n = box.querySelector('[data-naziv]'); if (n) n.focus(); }, 380);
  }
  async function shraniNovaStranka(box) {
    const g = s => box.querySelector(s);
    const naziv = g('[data-naziv]').value.trim();
    const msg = g('[data-msg]');
    if (!naziv) { msg.textContent = 'Vpiši naziv.'; return; }
    if (ORGSEZNAM.some(o => (o.name || '').toLowerCase() === naziv.toLowerCase())) { msg.textContent = 'Stranka s tem nazivom že obstaja.'; return; }
    const podjetje = g('[data-podjetje]').value.trim();
    const davcna = g('[data-davcna]').value.trim();
    const naslov = g('[data-naslov]').value.trim();
    msg.textContent = 'Shranjujem …';
    try {
      const legacyId = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
      const { data: novOrg, error: e1 } = await sb.from('orgs').insert({ name: naziv, legal_name: podjetje || null, address: naslov || null, vat_id: davcna || null, legacy_id: legacyId }).select('id,name,legal_name,address,vat_id').single();
      if (e1) throw e1;
      ORGSEZNAM.push(novOrg); ORGIME[novOrg.id] = novOrg.name;
      // cenik: stranka dobi artikle izbrane skupine (enako kot »Dodeli skupino« v Ceniku)
      const pre = g('[data-cenik]') ? g('[data-cenik]').value : '';
      const arts = pre && box._grupe ? (box._grupe[pre] || []) : [];
      let cenikNapaka = null;
      if (arts.length) {
        msg.textContent = 'Dodajam cenik …';
        try { await nastaviSkupinoStranki(novOrg.id, arts.map(x => x.sifra)); await naloziClane(true); }
        catch (e2) { cenikNapaka = e2; }
      }
      logDodaj('Stranke', 'Dodano', 'Stranka »' + novOrg.name + '«' + (arts.length ? ' · ' + box._imeCenika(pre) : ''));
      if (_okno && _okno.vsebina === box) oknoZapri();
      toast(cenikNapaka ? 'Stranka ustvarjena — cenika ni bilo mogoče dodati: ' + napakaBesedilo(cenikNapaka) : 'Stranka ' + novOrg.name + ' ustvarjena' + (arts.length ? ' · ' + box._imeCenika(pre) : ''));
      render();
    } catch (e) {
      msg.textContent = napakaBesedilo(e);
    }
  }

  /* ══════════ KATALOG (stranka) ══════════ */
  async function risiKatalog() {
    if (!MOJEPODJETJE) {
      $('katalogList').innerHTML = '<div class="rows"><div class="empty">' + '<h3>Račun ni povezan s podjetjem</h3></div></div>';
      return;
    }
    var kbox = $('katalogList');
    pokaziNalaganje(kbox);
    const {
      data, error
    } = await sb.from('articles').select('name').eq('org_id', MOJEPODJETJE.id).order('sort_order');
    if (error) {
      if (!kbox.dataset.loaded) {
        $('katalogPod').textContent = '';
        kbox.innerHTML = '<div class="rows"><div class="empty"><h3>Nalaganje ni uspelo</h3><button type="button" class="btn ghost" data-act="katalog-ponovi" style="margin-top:14px">Poskusi znova</button></div></div>';
        var _kp = kbox.querySelector('[data-act="katalog-ponovi"]');
        if (_kp) _kp.addEventListener('click', function () { risiKatalog(); });
      }
      return;
    }
    $('katalogPod').textContent = ((data === null || data === void 0 ? void 0 : data.length) || 0) + ' artiklov';
    kbox.innerHTML = '<div class="rows"><div class="arts show" style="border:none">' + (data !== null && data !== void 0 && data.length ? '<ul>' + data.map(a => '<li>' + escape_(a.name) + '</li>').join('') + '</ul>' : '<p class="none">Katalog še ni izpolnjen.</p>') + '</div></div>';
    kbox.dataset.loaded = '1';
  }

  /* ══════════ UVOZ S TABLICE ══════════
     Aplikacija Pralnica piše JSON v mapo Documents. Tu ga preberemo in
     prenesemo v bazo. Vsak zapis ima svoj id, ki ga shranimo kot legacy_id,
     zato ponoven uvoz iste datoteke ne podvaja — le dopolni. */
  let UVOZ_PODATKI = null;
  if ($('uvozFile')) $('uvozFile').addEventListener('change', async () => {
    const f = $('uvozFile').files[0];
    const m = $('uvozMsg');
    $('uvozPor').innerHTML = '';
    UVOZ_PODATKI = null;
    $('uvozBtn').disabled = true;
    if (!f) return;
    try {
      const txt = await f.text();
      let d = JSON.parse(txt);
      if (d && !Array.isArray(d) && Array.isArray(d.entries)) d = d.entries;
      if (!Array.isArray(d)) throw new Error('oblika');
      const veljavni = d.filter(e => e && e.stevilka && e.datum);
      if (!veljavni.length) throw new Error('prazno');
      UVOZ_PODATKI = veljavni;
      $('uvozBtn').disabled = false;
      m.className = 'msg show';
      m.textContent = 'Prebrano: ' + veljavni.length + ' spremnih listov iz datoteke ' + f.name + '. Kliknite Uvozi.';
    } catch (err) {
      m.className = 'msg bad show';
      m.textContent = err.message === 'prazno' ? 'V datoteki ni nobenega spremnega lista.' : 'To ni datoteka s spremnimi listi. Na tablici izberite pralnica_entries.json.';
    }
  });
  if ($('uvozBtn')) $('uvozBtn').addEventListener('click', async () => {
    if (!UVOZ_PODATKI) return;
    const m = $('uvozMsg'),
      btn = $('uvozBtn');
    btn.disabled = true;
    btn.textContent = 'Uvažam …';
    m.className = 'msg show';
    m.textContent = 'Uvažam, ne zapirajte strani …';
    const por = {
      listov: 0,
      posodobljenih: 0,
      postavk: 0,
      novihStrank: 0,
      novihArtiklov: 0,
      tezav: []
    };
    try {
      /* ── 1. stranke ─────────────────────────────────────────────── */
      const poLegacy = {},
        poImenu = {};
      const obstojece = (await vseVrstice((o, d) => sb.from('orgs').select('id,name,legacy_id').order('id', { ascending: true }).range(o, d))).data || [];
      (obstojece || []).forEach(o => {
        if (o.legacy_id) poLegacy[o.legacy_id] = o.id;
        poImenu[(o.name || '').toLowerCase()] = o.id;
      });
      for (const e of UVOZ_PODATKI) {
        const lid = e.strankaId,
          ime = (e.strankaNaziv || '').trim();
        if (!lid || poLegacy[lid]) continue;
        if (ime && poImenu[ime.toLowerCase()]) {
          poLegacy[lid] = poImenu[ime.toLowerCase()];
          continue;
        }
        const {
          data: nova,
          error
        } = await sb.from('orgs').insert({
          name: ime || lid,
          legal_name: e.strankaPodjetje || null,
          address: e.strankaNaslov || null,
          vat_id: e.strankaDavcna || null,
          legacy_id: lid
        }).select('id').single();
        if (error) {
          por.tezav.push('stranke ' + ime + ' ni bilo mogoče dodati');
          continue;
        }
        poLegacy[lid] = nova.id;
        poImenu[(ime || '').toLowerCase()] = nova.id;
        por.novihStrank++;
      }

      /* ── 2. artikli ─────────────────────────────────────────────── */
      const artPoOrg = {};
      const vsiArt = (await vseVrstice((o, d) => sb.from('articles').select('id,org_id,name,legacy_id').order('id', { ascending: true }).range(o, d))).data || [];
      (vsiArt || []).forEach(a => {
        artPoOrg[a.org_id] = artPoOrg[a.org_id] || {
          legacy: {},
          ime: {}
        };
        if (a.legacy_id) artPoOrg[a.org_id].legacy[a.legacy_id] = a.id;
        artPoOrg[a.org_id].ime[(a.name || '').toLowerCase()] = a.id;
      });
      const manjkajoci = [];
      for (const e of UVOZ_PODATKI) {
        const org = poLegacy[e.strankaId];
        if (!org) continue;
        artPoOrg[org] = artPoOrg[org] || {
          legacy: {},
          ime: {}
        };
        for (const p of e.postavke || []) {
          const ime = (p.naziv || '').trim();
          if (!ime) continue;
          const naslo = p.id && artPoOrg[org].legacy[p.id] || artPoOrg[org].ime[ime.toLowerCase()];
          if (!naslo && !manjkajoci.some(x => x.org_id === org && x.name === ime)) {
            manjkajoci.push({
              org_id: org,
              name: ime,
              legacy_id: p.id || null,
              sort_order: 999
            });
          }
        }
      }
      for (let i = 0; i < manjkajoci.length; i += 200) {
        const {
          data,
          error
        } = await sb.from('articles').insert(manjkajoci.slice(i, i + 200)).select('id,org_id,name,legacy_id');
        if (error) {
          por.tezav.push('nekaj artiklov ni bilo mogoče dodati: ' + error.message);
          break;
        }
        (data || []).forEach(a => {
          artPoOrg[a.org_id].ime[(a.name || '').toLowerCase()] = a.id;
          if (a.legacy_id) artPoOrg[a.org_id].legacy[a.legacy_id] = a.id;
        });
        por.novihArtiklov += (data || []).length;
      }

      /* ── 3. spremni listi ───────────────────────────────────────── */
      const ze = (await vseVrstice((o, d) => sb.from('delivery_notes').select('id,legacy_id').order('id', { ascending: true }).range(o, d))).data || [];
      const zeIma = {};
      (ze || []).forEach(n => {
        if (n.legacy_id) zeIma[n.legacy_id] = n.id;
      });
      for (const e of UVOZ_PODATKI) {
        const org = poLegacy[e.strankaId];
        if (!org) {
          por.tezav.push('list ' + e.stevilka + ': stranke ni bilo mogoče najti');
          continue;
        }
        const del = String(e.stevilka).split('/');
        const seq = parseInt(del[0], 10);
        const leto = parseInt(del[1], 10) || new Date(e.datum).getFullYear();
        if (!seq) {
          por.tezav.push('list ' + e.stevilka + ': številke ni bilo mogoče razbrati');
          continue;
        }
        const vrstica = {
          org_id: org,
          doc_year: leto,
          doc_seq: seq,
          doc_date: e.datum,
          issued_name: e.izdal || null,
          weight_kg: e.kg || null,
          transport: e.prevoz === 'izredni' ? 'izredni' : 'redni',
          source: 'tablet',
          legacy_id: e.id || e.stevilka + '@' + e.datum
        };
        const post = (e.postavke || []).filter(p => p && p.naziv).map(p => ({
          article_id: p.id && artPoOrg[org].legacy[p.id] || artPoOrg[org].ime[(p.naziv || '').trim().toLowerCase()] || null,
          article_name: p.naziv,
          pieces: Number(p.kosov) || 0
        }));
        // list in postavke v eni transakciji (65_shrani_list.sql)
        const obstaja = !!zeIma[vrstica.legacy_id];
        const { error } = await sb.rpc('app_shrani_list', { p_id: zeIma[vrstica.legacy_id] || null, p_list: vrstica, p_postavke: post, p_tudi_potrjen: true });
        if (error) {
          por.tezav.push('list ' + e.stevilka + ': ' + (/duplicate|unique/i.test(error.message) ? 'številka ' + seq + '/' + leto + ' je v bazi že zasedena' : error.message));
          continue;
        }
        if (obstaja) { pozabiPostavke(); por.posodobljenih++; } else por.listov++;
        por.postavk += post.length;
      }

      /* ── 4. poročilo ────────────────────────────────────────────── */
      m.className = 'msg show';
      m.textContent = 'Uvoz je končan.';
      $('uvozPor').innerHTML = '<div class="por">' + [['Novih spremnih listov', por.listov], ['Posodobljenih', por.posodobljenih], ['Postavk', por.postavk], ['Novih strank', por.novihStrank], ['Novih artiklov', por.novihArtiklov]].map(([k, v]) => `<div class="por-v"><span>${k}</span><b>${stevilo(v)}</b></div>`).join('') + (por.tezav.length ? '<div class="por-op"><b>Preskočeno (' + por.tezav.length + '):</b><br>' + por.tezav.slice(0, 12).map(escape_).join('<br>') + (por.tezav.length > 12 ? '<br>… in še ' + (por.tezav.length - 12) : '') + '</div>' : '<div class="por-op">Brez težav — vsi zapisi so prišli skozi.</div>') + '</div>';
      ARTSTEVILO = {};
      await naloziListe();
      const {
        data: sveze
      } = await vseVrstice(function (a, b) { return sb.from('orgs').select('id,name,legal_name,address,vat_id,sort_order').is('deleted_at', null).order('name').range(a, b); });   // brez strank iz koša (kot ob zagonu)
      ORGSEZNAM = sveze || ORGSEZNAM;
      ORGIME = {};
      ORGSEZNAM.forEach(o => {
        ORGIME[o.id] = o.name;
      });
    } catch (err) {
      m.className = 'msg bad show';
      m.textContent = 'Uvoz se je ustavil: ' + (err.message || err);
    }
    btn.disabled = false;
    btn.textContent = 'Uvozi';
  });


  /* ══════════ APLIKACIJA ZA TABLICO ══════════
     Namestitveni paket leži poleg spletne različice, ne v kodi portala.
     Če ga še ni, to tu tudi piše — namesto strani 404. */
  // ?v= ob vsaki novi različici aplikacije (aplikacija/zgradi.py): brskalnik in predpomnilnik vzameta nov paket.
  var APK_POT = 'tablica/Pralnica-sync.apk?v=11.12';
  var RFID_APK_POT = 'rfid/SmartClean-RFID.apk?v=1.7';   // aplikacija-rfid/zgradi.py (VERZIJA)

  function wirePwa(scope) {
    var pb = (scope || document).querySelector('#pwaInstall');
    if (!pb) return;
    if (_pwaPrompt) pb.style.display = '';
    pb.addEventListener('click', async function () {
      if (!_pwaPrompt) return;
      _pwaPrompt.prompt();
      try { await _pwaPrompt.userChoice; } catch (e) {}
      _pwaPrompt = null;
      pb.style.display = 'none';
    });
  }
  function risiAplikacijo() {
    var p = document.getElementById('apkPanel');
    if (!p) return;
    var url = new URL(APK_POT, location.href).href;

    var IKO_WEB = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8.5 20.5h7M12 17v3.5"/></svg>';
    var IKO_DL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v11"/><path d="m7.5 10 4.5 4.5 4.5-4.5"/><path d="M4.5 20.5h15"/></svg>';
    var IKO_OUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>';
    function _progCard(ico, naslov, opis, akcija, id) {
      return '<div class="prog-card"' + (id ? ' id="' + id + '"' : '') + '>' +
        '<span class="prog-ico">' + ico + '</span>' +
        '<h3 class="prog-t">' + naslov + '</h3>' +
        '<p class="prog-d">' + opis + '</p>' + akcija + '</div>';
    }
    var _odpri = '<a class="btn prog-act" href="mobile/" target="_blank" rel="noopener">' + IKO_OUT + 'Odpri</a>';

    var ver = function (pot) { var v = (/[?&]v=([^&]+)/.exec(pot) || [])[1]; return v ? 'Različica ' + escape_(v) : ''; };
    var prenesi = function (u) { return '<a class="btn prog-act apk-dl" href="' + escape_(u) + '" download>' + IKO_DL + 'Prenesi<span class="apk-mb"></span></a>'; };
    var rfidUrl = new URL(RFID_APK_POT, location.href).href;
    p.innerHTML = '<div class="prog-grid">' +
      _progCard(IKO_WEB, 'Spletna aplikacija', '', _odpri) +
      _progCard(IKO_DL, 'Tablica (Android)', ver(APK_POT), prenesi(url), 'apkTablet') +
      (sme('cipi', 'r') ? _progCard('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + IKONE.cipi + '</svg>', 'SmartClean RFID (Android)', ver(RFID_APK_POT), prenesi(rfidUrl), 'apkRfid') : '') +
      '</div>';

    // Gumb »Prenesi« je viden TAKOJ (skupaj z ostalimi); velikost (MB) se le pripiše, ko HEAD odgovori.
    [[url, 'apkTablet'], [rfidUrl, 'apkRfid']].forEach(function (a) {
      if (!document.getElementById(a[1])) return;
      fetch(a[0], { method: 'HEAD' }).then(function (r) {
        if (!r.ok) throw new Error('ni ga');
        var mb = Number(r.headers.get('content-length') || 0) / 1048576;
        var t = document.getElementById(a[1]); if (!t) return;
        var mbEl = t.querySelector('.apk-mb');
        if (mbEl && mb) mbEl.textContent = ' · ' + mb.toFixed(1) + ' MB';
      }).catch(function () {
        var t = document.getElementById(a[1]); if (!t) return;
        var dl = t.querySelector('.apk-dl');
        if (dl) dl.outerHTML = '<span class="prog-badge off">Trenutno ni na voljo</span>';
      });
    });
  }

  /* ══════════ DOKUMENTI (4.67) — mape in datoteke ══════════
     Model: tabela documents (mapa = pot nadrejene mape, '' = koren; ime; je_mapa), datoteke v zasebnem bucketu
     »dokumenti«. Varnost je v bazi (71_dokumenti_varnost.sql): dostop le aktivno osebje in lastnik, zaklenjene mape
     ni mogoče brisati/premikati, premik mape je ena transakcija (dok_premakni), imena so v mapi unikatna.
     Videz: kartice z naslovnico kot drugod (slika = predogled, ostalo = vrsta na sivi podlagi), datoteka se odpre
     v oknu (predogled, podatki, dejanja). Pot mape je v naslovu strani (#dokumenti/Mapa/Podmapa) — nazaj deluje. */
  var DOKUMENTI = null, _dokPot = '', _dokNalagam = false, _dokVKosu = false;
  var DOK_URL = {}, DOK_URL_DO = {};   // podpisane povezave (le za prikazane slike) in njihov iztek
  var DOK_MAX_MB = 25;
  var DOK_DOVOLJENE = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'];
  var IKO_MAPA = ikoG('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>');
  var IKO_KLJUC = ikoG('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>');
  var IKO_VEC = ikoG('<path d="M5 12h.01M12 12h.01M19 12h.01"/>');
  var IKO_KAMERA = ikoG('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>');
  var IKO_NALOZI = ikoG('<path d="M12 16V5M7 10l5-5 5 5"/><path d="M5 20h14"/>');
  var IKO_ODPRI = ikoG('<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>');
  var _dokZacetnaPot = dokPotIzHash();   // globoka povezava (#dokumenti/Računi) — pojdi() naslov skrajša, zato jo shranimo takoj

  function dokPotIzHash() {
    var h = location.hash || ''; if (h.indexOf('#dokumenti') !== 0) return null;
    var r = h.slice(10).replace(/^\//, '');
    return r ? r.split('/').map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } }).join('/') : '';
  }
  function dokHash(pot) { return '#dokumenti' + (pot ? '/' + pot.split('/').map(encodeURIComponent).join('/') : ''); }
  function dokPojdi(pot, zamenjaj) {
    _dokPot = pot || ''; _dokVKosu = false;
    try { history[zamenjaj ? 'replaceState' : 'pushState'](null, '', dokHash(_dokPot)); } catch (e) {}
    if ($('dokIsci')) $('dokIsci').value = '';
    dokRisi(); window.scrollTo(0, 0);
  }
  window.addEventListener('popstate', function () {
    var p = dokPotIzHash(); if (p == null) return;
    var sec = $('sec-dokumenti');
    if (!sec || sec.classList.contains('hidden')) { if (sec && sme('dokumenti', 'r')) { _dokZacetnaPot = p; pojdi('dokumenti'); } return; }
    if (_okno) oknoZapri(true);
    dokZapriMeni();
    _dokPot = p; _dokVKosu = false; if ($('dokKosPov')) $('dokKosPov').hidden = !sme('dokumenti', 'x'); dokRisi();
  });

  function dokImeRow(r) { return r.ime || r.opomba || (r.storage_path ? r.storage_path.split('/').pop().replace(/^\d+_/, '') : 'datoteka'); }
  function dokPotMape(r) { return (r.mapa ? r.mapa + '/' : '') + dokImeRow(r); }
  function dokPripona(r) { var m = /\.([a-z0-9]+)$/i.exec(dokImeRow(r)); return (m ? m[1] : '').toLowerCase(); }
  function dokVrsta(r) {
    var e = dokPripona(r), mime = (r.mime || '').toLowerCase();
    if (/^image\//.test(mime) || /^(jpe?g|png|gif|webp|heic|heif)$/.test(e)) return 'slika';
    if (e === 'pdf' || mime.indexOf('pdf') >= 0) return 'pdf';
    return 'datoteka';
  }
  function dokOznaka(r) { var e = dokPripona(r); return (e || (dokVrsta(r) === 'pdf' ? 'pdf' : 'dat')).toUpperCase().slice(0, 4); }
  function dokVelikost(b) { if (b == null || b === '') return ''; b = Number(b) || 0; if (b < 1024) return b + ' B'; if (b < 1048576) return Math.round(b / 1024) + ' KB'; return (Math.round(b / 104857.6) / 10).toLocaleString('sl-SI') + ' MB'; }
  function dokTranslit(s) { return String(s == null ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D'); }
  function dokVarnoIme(s) { var v = dokTranslit(s).replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').replace(/^[_.]+|_+$/g, ''); return v || 'datoteka'; }
  function dokStoragePot(cilj, ime) {
    var seg = String(cilj || '').split('/').filter(Boolean).map(dokVarnoIme);
    return (seg.length ? seg.join('/') + '/' : '') + Date.now() + '_' + Math.random().toString(36).slice(2, 6) + '_' + dokVarnoIme(ime);
  }
  // Ime (mape ali datoteke) iz vnosa: brez / in \, ne samo pike, največ 200 znakov
  function dokPocistiIme(s) { s = String(s == null ? '' : s).replace(/[\/\\]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200); return /^\.*$/.test(s) ? '' : s; }
  function dokObstaja(ime, cilj, jeMapa, razenId) {
    var k = dokTranslit(ime).toLowerCase();
    return (DOKUMENTI || []).some(function (x) { return x.id !== razenId && (x.mapa || '') === (cilj || '') && !!x.je_mapa === !!jeMapa && dokTranslit(dokImeRow(x)).toLowerCase() === k; });
  }
  function dokUnikatnoImeV(name, cilj, jeMapa) {
    if (!dokObstaja(name, cilj, jeMapa)) return name;
    var m = /^(.*?)(\.[a-z0-9]+)?$/i.exec(name), baza = m[1], ext = m[2] || '', i = 2;
    while (dokObstaja(baza + ' (' + i + ')' + ext, cilj, jeMapa)) i++;
    return baza + ' (' + i + ')' + ext;
  }
  function dokZaklenjen(r) {   // r ali katera od nadrejenih map je zaklenjena (enako preverja baza)
    if (r.je_mapa && r.zaklenjeno) return true;
    var mp = r.mapa || '';
    return (DOKUMENTI || []).some(function (f) { if (!f.je_mapa || !f.zaklenjeno) return false; var p = dokPotMape(f); return mp === p || mp.indexOf(p + '/') === 0; });
  }
  function dokOtroci(r) { var p = dokPotMape(r); return (DOKUMENTI || []).filter(function (x) { return x.id !== r.id && ((x.mapa || '') === p || (x.mapa || '').indexOf(p + '/') === 0); }); }
  function dokNajdi(id) { return (DOKUMENTI || []).filter(function (x) { return x.id === id; })[0] || null; }

  // ── nalaganje seznama: brez traku nalaganja — prikaže zadnje znano, osveži v ozadju ──
  var _dokGen = 0;
  async function risiDokumenti(prednalozi) {
    var box = $('dokList'), sec = $('sec-dokumenti'); if (!box) return;
    if (prednalozi && sec && !sec.classList.contains('hidden')) prednalozi = false;   // razdelek je že odprt: izriši
    var w = sme('dokumenti', 'w'), x = sme('dokumenti', 'x');
    ['dokNovaMapa', 'dokNaloziBtn', 'dokSkenirajBtn'].forEach(function (id) { var b = $(id); if (b) b.hidden = !w; });
    if ($('dokKosPov')) $('dokKosPov').hidden = !x;
    if (!prednalozi && _dokZacetnaPot != null) { _dokPot = _dokZacetnaPot; _dokZacetnaPot = null; try { history.replaceState(null, '', dokHash(_dokPot)); } catch (e) {} }
    else if (!prednalozi) { var hp = dokPotIzHash(); if (hp != null && hp !== _dokPot) _dokPot = hp; else if (hp == null) try { history.replaceState(null, '', dokHash(_dokPot)); } catch (e) {} }
    if (DOKUMENTI && !prednalozi && !_dokVKosu) dokRisi();
    var gen = ++_dokGen, res;
    try {
      res = await vseVrstice(function (a, b) {
        return sb.from('documents').select('id,storage_path,mime,velikost,created_at,mapa,ime,je_mapa,zaklenjeno,opomba')
          .is('deleted_at', null).order('created_at', { ascending: false }).order('id', { ascending: false }).range(a, b);
      });
    } catch (e) { res = { error: e }; }
    if (gen !== _dokGen) return;
    if (res.error) {
      if (!DOKUMENTI && !prednalozi) {
        box.innerHTML = '<div class="rows"><div class="empty"><h3>Nalaganje ni uspelo</h3><p class="u-sub">' + escape_(napakaBesedilo(res.error)) + '</p><button type="button" class="btn ghost" data-dok-ponovi style="margin-top:14px">Poskusi znova</button></div></div>';
        var pb = box.querySelector('[data-dok-ponovi]'); if (pb) pb.addEventListener('click', function () { risiDokumenti(); });
      }
      return;
    }
    DOKUMENTI = (res.data || []).map(function (r) { if (r.mapa == null) r.mapa = ''; return r; });
    if (prednalozi) dokPodpisi(DOKUMENTI.filter(function (r) { return (r.mapa || '') === _dokPot; }));   // sličice so ob odprtju že podpisane
    else if (!_dokVKosu) dokRisi();
  }

  // podpiše le slike, ki so prikazane (sličice); povezave veljajo 1 h, obnovijo se 5 min pred iztekom
  async function dokPodpisi(vrstice) {
    var zdaj = Date.now();
    var poti = vrstice.filter(function (r) { return r.storage_path && dokVrsta(r) === 'slika' && !(DOK_URL[r.storage_path] && DOK_URL_DO[r.storage_path] > zdaj + 300000); }).map(function (r) { return r.storage_path; });
    if (!poti.length) return false;
    try {
      var su = await sb.storage.from('dokumenti').createSignedUrls(poti, 3600);
      (su && su.data ? su.data : []).forEach(function (x) { if (x && x.path && x.signedUrl) { DOK_URL[x.path] = x.signedUrl; DOK_URL_DO[x.path] = zdaj + 3600000; } });
      return true;
    } catch (e) { return false; }
  }
  async function dokPovezava(r, sekund, prenos) {
    var opt = prenos ? { download: dokImeRow(r) } : undefined;
    var s = await sb.storage.from('dokumenti').createSignedUrl(r.storage_path, sekund || 300, opt);
    if (s.error || !s.data) throw s.error || new Error('Povezave ni bilo mogoče ustvariti.');
    return s.data.signedUrl;
  }

  function dokVrstice() {
    var q = dokTranslit(($('dokIsci') && $('dokIsci').value) || '').trim().toLowerCase();
    var vsi = DOKUMENTI || [], sort = ($('dokSort') && $('dokSort').value) || 'novi';
    var mape, dat;
    if (q) {
      var ujema = function (r) { return dokTranslit(dokImeRow(r)).toLowerCase().indexOf(q) >= 0; };
      mape = vsi.filter(function (r) { return r.je_mapa && ujema(r); });
      dat = vsi.filter(function (r) { return !r.je_mapa && ujema(r); });
    } else {
      var v = vsi.filter(function (r) { return (r.mapa || '') === _dokPot; });
      mape = v.filter(function (r) { return r.je_mapa; }); dat = v.filter(function (r) { return !r.je_mapa; });
    }
    var poImenu = function (a, b) { return dokImeRow(a).localeCompare(dokImeRow(b), 'sl', { numeric: true, sensitivity: 'base' }); };
    mape.sort(poImenu);
    if (sort === 'ime') dat.sort(poImenu);
    else if (sort === 'vel') dat.sort(function (a, b) { return (Number(b.velikost) || 0) - (Number(a.velikost) || 0); });
    else dat.sort(function (a, b) { return String(b.created_at || '').localeCompare(String(a.created_at || '')); });
    return { mape: mape, dat: dat, q: q };
  }
  function dokMetaMape(r) {
    var p = dokPotMape(r), n = (DOKUMENTI || []).filter(function (x) { return (x.mapa || '') === p; }).length;
    return n === 0 ? 'Prazna' : n + ' ' + (n === 1 ? 'element' : n === 2 ? 'elementa' : (n === 3 || n === 4) ? 'elementi' : 'elementov');
  }
  function dokMetaDat(r, zPotjo) {
    var d = [dokOznaka(r), dokVelikost(r.velikost), r.created_at ? datum(String(r.created_at).slice(0, 10)) : ''].filter(Boolean);
    if (zPotjo) d.push(r.mapa ? r.mapa.replace(/\//g, ' › ') : 'Dokumenti');
    return d.join(' · ');
  }

  function dokRisi() {
    var box = $('dokList'); if (!box || !DOKUMENTI) return;
    var r = dokVrstice(), w = sme('dokumenti', 'w'), x = sme('dokumenti', 'x');
    var pod = $('dokPod');
    if (pod) { var nd = DOKUMENTI.filter(function (q) { return !q.je_mapa; }).length, m = nd % 100; pod.textContent = nd ? stevilo(nd) + ' ' + (m === 1 ? 'dokument' : m === 2 ? 'dokumenta' : (m === 3 || m === 4) ? 'dokumenti' : 'dokumentov') : ''; }
    // pot (le v podmapi)
    var potEl = $('dokPot');
    if (potEl) {
      var deli = _dokPot ? _dokPot.split('/') : [], acc = '';
      potEl.hidden = !deli.length || !!r.q;
      potEl.innerHTML = '<button type="button" class="dk-crumb" data-pot="">Dokumenti</button>' + deli.map(function (d, i) {
        acc = acc ? acc + '/' + d : d;
        return '<span class="dk-sep" aria-hidden="true">›</span>' + (i === deli.length - 1 ? '<span class="dk-crumb on" aria-current="page">' + escape_(d) + '</span>' : '<button type="button" class="dk-crumb" data-pot="' + escape_(acc) + '">' + escape_(d) + '</button>');
      }).join('');
    }
    if (!r.mape.length && !r.dat.length) {
      box.innerHTML = '<div class="rows"><div class="empty"><h3>' + (r.q ? 'Ni zadetkov' : 'Prazna mapa') + '</h3></div></div>';
      box._dkOdtis = '';
      return;
    }
    // kartica = .row kot drugod (seznam in mreža z naslovnico); »⋯« je sosednji gumb (ne gumb v gumbu)
    var imaVec = w || x || sme('dokumenti', 'd');
    var kartica = function (rr, razred, nasl, meta) {
      return '<div class="lcell dk-cell"><button type="button" class="row dk-kart ' + razred + '" data-id="' + escape_(rr.id) + '" style="' + naslovnica(null, rr.je_mapa ? 'mapa:' + dokPotMape(rr) : rr.id) + '">' +
        nasl + '<span class="dk-tx"><span class="dk-ime">' + dokImeHtml(dokImeRow(rr)) + '</span><span class="dk-meta">' + escape_(meta) + '</span></span></button>' +
        (imaVec ? '<button type="button" class="dk-vec" data-id="' + escape_(rr.id) + '" aria-label="Možnosti za ' + escape_(dokImeRow(rr)) + '" aria-haspopup="menu" aria-expanded="false">' + IKO_VEC + '</button>' : '') + '</div>';
    };
    var html = '<div class="rows dk-rows">';
    r.mape.forEach(function (m) {
      html += kartica(m, 'dk-mapa', '<span class="dk-nasl"><span class="dk-ik">' + IKO_MAPA + '</span>' + (m.zaklenjeno ? '<span class="dk-zakl" title="Zaklenjeno">' + IKO_KLJUC + '</span>' : '') + '</span>',
        r.q ? (m.mapa ? m.mapa.replace(/\//g, ' › ') : 'Dokumenti') : dokMetaMape(m));
    });
    r.dat.forEach(function (d) {
      var slika = dokVrsta(d) === 'slika', url = slika ? DOK_URL[d.storage_path] : '';
      html += kartica(d, 'dk-dat', '<span class="dk-nasl' + (slika ? ' dk-slika' : '') + '">' + (url ? '<img src="' + escape_(url) + '" alt="" decoding="async">' : '<span class="dk-vrsta">' + escape_(dokOznaka(d)) + '</span>') + '</span>', dokMetaDat(d, !!r.q));
    });
    html += '</div>';
    var odtis = html.replace(/<img [^>]*>/g, '');   // brez povezav (te se obnavljajo) — enak seznam se ne izriše znova
    if (box._dkOdtis === odtis && box.querySelector('.dk-rows')) return;
    box._dkOdtis = odtis;
    box.innerHTML = html;
    dokSlikePokazi(box);
    box.querySelectorAll('.dk-kart').forEach(function (k) {
      k.addEventListener('click', function () {
        var rr = dokNajdi(k.dataset.id); if (!rr) return;
        if (rr.je_mapa) dokPojdi(dokPotMape(rr)); else dokOdpri(k, rr);
      });
      k.addEventListener('contextmenu', function (e) { var v = k.parentNode.querySelector('.dk-vec'); if (!v) return; e.preventDefault(); dokMeni(v, k.dataset.id); });
    });
    box.querySelectorAll('.dk-vec').forEach(function (v) { v.addEventListener('click', function (e) { e.stopPropagation(); dokMeni(v, v.dataset.id); }); });
    // sličice: podpiši prikazane slike, nato jih vstavi (brez ponovnega izrisa seznama)
    dokPodpisi(r.dat).then(function (nove) {
      if (!nove) return;
      box.querySelectorAll('.dk-dat').forEach(function (k) {
        var rr = dokNajdi(k.dataset.id), n = k.querySelector('.dk-nasl.dk-slika'); if (!rr || !n || n.querySelector('img')) return;
        var u = DOK_URL[rr.storage_path]; if (u) n.innerHTML = '<img src="' + escape_(u) + '" alt="" decoding="async">';
      });
      dokSlikePokazi(box);
    });
  }
  // ime s puščico: zadnjih nekaj znakov in › ostanejo skupaj (puščica nikoli sama v novi vrstici)
  function dokImeHtml(ime) {
    var m = /^([\s\S]*\s)?(\S+)$/.exec(ime) || [null, '', ime], gl = m[1] || '', zad = m[2];
    if (zad.length > 12) { gl += zad.slice(0, -5); zad = zad.slice(-5); }
    return escape_(gl) + '<span class="dk-zad">' + escape_(zad) + '<span class="dk-chev" aria-hidden="true">›</span></span>';
  }
  // sličica se pokaže, ko je naložena (brez utripa napol izrisane slike)
  function dokSlikePokazi(box) {
    box.querySelectorAll('.dk-nasl img:not(.ok)').forEach(function (im) {
      if (im.complete && im.naturalWidth) { im.classList.add('ok'); return; }
      im.addEventListener('load', function () { im.classList.add('ok'); }, { once: true });
      im.addEventListener('error', function () {   // povezava je potekla ali slike ni: pokaži vrsto, povezava se ob naslednjem izrisu obnovi
        var k = im.closest('.dk-kart'), rr = k && dokNajdi(k.dataset.id), n = im.parentNode;
        if (rr) delete DOK_URL[rr.storage_path];
        if (n) n.innerHTML = '<span class="dk-vrsta">' + escape_(rr ? dokOznaka(rr) : 'IMG') + '</span>';
      }, { once: true });
    });
  }

  // ── datoteka v oknu: predogled, podatki, dejanja ──
  function dokOdpri(kartica, r) {
    var box = document.createElement('div'); box.className = 'dk-okno';
    var slika = dokVrsta(r) === 'slika', pdf = dokVrsta(r) === 'pdf';
    var w = sme('dokumenti', 'w'), x = sme('dokumenti', 'x'), dl = sme('dokumenti', 'd'), zakl = dokZaklenjen(r);
    box.innerHTML = '<div class="dk-pred' + (slika ? ' dk-pred-slika' : '') + '" style="' + naslovnica(null, r.id) + '">' + (slika ? '' : '<span class="dk-vrsta">' + escape_(dokOznaka(r)) + '</span>') + '</div>' +
      '<dl class="okno-dl"><dt>Vrsta</dt><dd>' + escape_(dokOznaka(r)) + '</dd><dt>Velikost</dt><dd>' + escape_(dokVelikost(r.velikost) || '—') + '</dd>' +
      '<dt>Naloženo</dt><dd>' + (r.created_at ? escape_(datumcas(r.created_at)) : '—') + '</dd><dt>Mapa</dt><dd>' + escape_(r.mapa ? r.mapa.replace(/\//g, ' › ') : 'Dokumenti') + '</dd></dl>' +
      '<div class="u-acts">' +
        (x ? '<button type="button" class="danger" data-a="izbrisi"' + (zakl ? ' disabled title="V zaklenjeni mapi"' : '') + '>Izbriši</button>' : '') +
        (w ? '<button type="button" data-a="preime"' + (zakl ? ' disabled' : '') + '>Preimenuj</button><button type="button" data-a="premakni"' + (zakl ? ' disabled' : '') + '>Premakni</button><button type="button" data-a="kopiraj">Kopiraj</button>' : '') +
        (dl && pdf ? '<button type="button" data-a="odpri">' + IKO_ODPRI + 'Odpri</button>' : '') +
        (dl ? '<button type="button" class="ur-save" data-a="prenesi">' + IKO_PRENOS + 'Prenesi</button>' : '') +
      '</div>';
    oknoOdpri(kartica, box, function () { return document.querySelector('#dokList .dk-kart[data-id="' + String(r.id).replace(/"/g, '\\"') + '"]'); }, {
      glava: function () { var h = document.createElement('h3'); h.className = 'sec-h'; h.textContent = dokImeRow(r); return h; }
    });
    if (slika) {
      var pr = box.querySelector('.dk-pred');
      (DOK_URL[r.storage_path] && DOK_URL_DO[r.storage_path] > Date.now() + 60000 ? Promise.resolve(DOK_URL[r.storage_path]) : dokPovezava(r, 3600)).then(function (u) {
        pr.innerHTML = '<img src="' + escape_(u) + '" alt="' + escape_(dokImeRow(r)) + '">';
        pr.querySelector('img').addEventListener('click', function () { dokLightbox(u, dokImeRow(r)); });
      }).catch(function () {});
    }
    box.querySelectorAll('[data-a]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.dataset.a;
        if (a === 'prenesi') dokPrenesi(r, b);
        else if (a === 'odpri') dokOdpriVZavihku(r);
        else { oknoZapri(true); dokAkcija(a, r); }
      });
    });
  }
  function dokLightbox(url, ime) {
    var back = document.createElement('div'); back.className = 'dok-lb'; back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true'); back.setAttribute('aria-label', ime || 'Slika');
    back.innerHTML = '<button type="button" class="dok-lb-x" aria-label="Zapri">' + IKO_ZAPRI + '</button><img src="' + escape_(url) + '" alt="' + escape_(ime || '') + '">';
    document.body.appendChild(back);
    requestAnimationFrame(function () { back.classList.add('show'); back.querySelector('.dok-lb-x').focus(); });
    function zapri() { back.classList.remove('show'); document.removeEventListener('keydown', onk, true); setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); }
    function onk(e) { if (e.key === 'Escape') { e.stopPropagation(); zapri(); } }
    back.addEventListener('click', function (e) { if (e.target === back || e.target.closest('.dok-lb-x')) zapri(); });
    document.addEventListener('keydown', onk, true);
  }

  // ── meni ⋯ (mape in hitra dejanja za datoteke) ──
  function dokZapriMeni() {
    var m = document.querySelector('.dk-meni'); if (m) { var izv = m._izvor; m.remove(); if (izv) { izv.setAttribute('aria-expanded', 'false'); } }
    document.removeEventListener('pointerdown', _dokMeniZunaj, true); document.removeEventListener('keydown', _dokMeniTipka, true); window.removeEventListener('resize', dokZapriMeni);
  }
  function _dokMeniZunaj(e) { if (!e.target.closest('.dk-meni')) dokZapriMeni(); }
  function _dokMeniTipka(e) {
    var m = document.querySelector('.dk-meni'); if (!m) return;
    var gumbi = [].slice.call(m.querySelectorAll('button:not([disabled])')), i = gumbi.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); var izv = m._izvor; dokZapriMeni(); if (izv) izv.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); (gumbi[i + 1] || gumbi[0]).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (gumbi[i - 1] || gumbi[gumbi.length - 1]).focus(); }
  }
  function dokMeni(izvor, id) {
    var odprt = document.querySelector('.dk-meni'); var isti = odprt && odprt._izvor === izvor; dokZapriMeni(); if (isti) return;
    var r = dokNajdi(id); if (!r) return;
    var w = sme('dokumenti', 'w'), x = sme('dokumenti', 'x'), d = sme('dokumenti', 'd'), zakl = dokZaklenjen(r), it = [];
    if (!r.je_mapa && d) it.push(['prenesi', 'Prenesi']);
    if (w) { it.push(['preime', 'Preimenuj', zakl]); it.push(['premakni', 'Premakni', zakl]); it.push(['kopiraj', 'Kopiraj']); }
    if (r.je_mapa && w) it.push(['zakleni', r.zaklenjeno ? 'Odkleni' : 'Zakleni']);
    if (x) it.push(['izbrisi', 'Izbriši', zakl, 'danger']);
    if (!it.length) return;
    var m = document.createElement('div'); m.className = 'dk-meni'; m.setAttribute('role', 'menu'); m._izvor = izvor;
    m.innerHTML = it.map(function (a) { return '<button type="button" role="menuitem" class="' + (a[3] || '') + '" data-a="' + a[0] + '"' + (a[2] ? ' disabled title="Mapa je zaklenjena"' : '') + '>' + escape_(a[1]) + '</button>'; }).join('');
    document.body.appendChild(m); izvor.setAttribute('aria-expanded', 'true');
    var rc = izvor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
    var top = rc.bottom + 6; if (top + mh > window.innerHeight - 8) top = Math.max(8, rc.top - mh - 6);
    m.style.top = (top + window.scrollY) + 'px';
    m.style.left = (Math.max(8, Math.min(rc.right - mw, document.documentElement.clientWidth - mw - 8)) + window.scrollX) + 'px';
    m.querySelectorAll('[data-a]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); dokZapriMeni(); dokAkcija(b.dataset.a, r, izvor); }); });
    var prvi = m.querySelector('button:not([disabled])'); if (prvi) prvi.focus({ preventScroll: true });
    setTimeout(function () { document.addEventListener('pointerdown', _dokMeniZunaj, true); document.addEventListener('keydown', _dokMeniTipka, true); window.addEventListener('resize', dokZapriMeni); }, 0);
  }
  function dokAkcija(a, r, izvor) {
    if (a === 'prenesi') dokPrenesi(r, izvor);
    else if (a === 'preime') dokPreimenuj(r);
    else if (a === 'premakni') dokPremakniKam(r, false);
    else if (a === 'kopiraj') dokPremakniKam(r, true);
    else if (a === 'zakleni') dokZakleni(r);
    else if (a === 'izbrisi') dokIzbrisi(r);
  }

  // ── dejanja ──
  async function dokZakleni(r) {
    if (!sme('dokumenti', 'w')) return;
    var nov = !r.zaklenjeno;
    var u = await sb.from('documents').update({ zaklenjeno: nov }).eq('id', r.id);
    if (u.error) { toast(napakaBesedilo(u.error)); return; }
    r.zaklenjeno = nov; logDodaj('Dokumenti', nov ? 'Zaklenjeno' : 'Odklenjeno', 'Mapa »' + dokPotMape(r) + '«');
    dokRisi(); toast(nov ? 'Mapa zaklenjena' : 'Mapa odklenjena');
  }
  async function dokPreimenuj(r) {
    if (!sme('dokumenti', 'w')) return;
    var staro = dokImeRow(r), ext = r.je_mapa ? '' : (/(\.[a-z0-9]+)$/i.exec(staro) || ['', ''])[1];
    var vnos = await vnesiModal({ naslov: r.je_mapa ? 'Preimenuj mapo' : 'Preimenuj datoteko', privzeto: ext ? staro.slice(0, -ext.length) : staro, potrdi: 'Shrani', preklici: 'Prekliči' });
    if (vnos == null) return;
    var novo = dokPocistiIme(vnos); if (!novo) { toast('Vpiši ime.'); return; }
    if (ext && novo.toLowerCase().slice(-ext.length) !== ext.toLowerCase()) novo += ext;   // pripona ostane (sicer se datoteka ne odpre pravilno)
    if (novo === staro) return;
    if (dokObstaja(novo, r.mapa || '', r.je_mapa, r.id)) { toast((r.je_mapa ? 'Mapa' : 'Datoteka') + ' s tem imenom že obstaja.'); return; }
    var e = (await sb.rpc('dok_premakni', { p_id: r.id, p_mapa: r.mapa || '', p_ime: novo })).error;
    if (e) { toast(napakaBesedilo(e)); return; }
    var stariPot = dokPotMape(r);
    r.ime = novo;
    if (r.je_mapa) { var nov = dokPotMape(r); dokOtroci({ id: r.id, mapa: r.mapa, ime: staro }).forEach(function (c) { c.mapa = nov + (c.mapa || '').slice(stariPot.length); }); if (_dokPot === stariPot || _dokPot.indexOf(stariPot + '/') === 0) { _dokPot = nov + _dokPot.slice(stariPot.length); try { history.replaceState(null, '', dokHash(_dokPot)); } catch (er) {} } }
    logDodaj('Dokumenti', 'Preimenovano', '»' + staro + '« → »' + novo + '«');
    dokRisi(); toast('Preimenovano');
  }
  function dokMapeSeznam(izkljuci) {
    var out = [{ pot: '', label: 'Dokumenti' }];
    (DOKUMENTI || []).filter(function (x) { return x.je_mapa; }).forEach(function (f) {
      var pot = dokPotMape(f);
      if (izkljuci && (pot === izkljuci || pot.indexOf(izkljuci + '/') === 0)) return;
      out.push({ pot: pot, label: 'Dokumenti › ' + pot.replace(/\//g, ' › ') });
    });
    out.sort(function (a, b) { return a.label.localeCompare(b.label, 'sl', { numeric: true }); });
    return out;
  }
  function dokIzberiMapo(naslov, potrdi, izkljuci, privzeta) {
    return new Promise(function (resolve) {
      var mape = dokMapeSeznam(izkljuci);
      var back = document.createElement('div'); back.className = 'sc-modal-back';
      back.innerHTML = '<div class="sc-modal dk-izbira" role="dialog" aria-modal="true" aria-label="' + escape_(naslov) + '"><h4>' + escape_(naslov) + '</h4>' +
        '<div class="dk-mape" role="listbox">' + mape.map(function (m) { return '<button type="button" role="option" class="dk-mapa-i' + (m.pot === privzeta ? ' on' : '') + '" aria-selected="' + (m.pot === privzeta) + '" data-pot="' + escape_(m.pot) + '">' + IKO_MAPA + '<span>' + escape_(m.label) + '</span></button>'; }).join('') + '</div>' +
        '<div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" data-no>Prekliči</button><button type="button" class="sc-modal-btn primary" data-yes>' + escape_(potrdi) + '</button></div></div>';
      document.body.appendChild(back); _modalA11y(back); requestAnimationFrame(function () { back.classList.add('show'); });
      var izbrano = privzeta == null ? '' : privzeta, done = false;
      function zapri(v) { if (done) return; done = true; back.classList.remove('show'); document.removeEventListener('keydown', onk, true); setTimeout(function () { back.remove(); }, 180); _modalVrniFokus(); resolve(v); }
      function onk(e) { if (e.key === 'Escape') { e.stopPropagation(); zapri(null); } }
      back.querySelectorAll('.dk-mapa-i').forEach(function (b) { b.addEventListener('click', function () { izbrano = b.dataset.pot; back.querySelectorAll('.dk-mapa-i').forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); }); }); b.addEventListener('dblclick', function () { zapri(b.dataset.pot); }); });
      back.querySelector('[data-no]').addEventListener('click', function () { zapri(null); });
      back.querySelector('[data-yes]').addEventListener('click', function () { zapri(izbrano); });
      back.addEventListener('click', function (e) { if (e.target === back) zapri(null); });
      document.addEventListener('keydown', onk, true);
      var prvi = back.querySelector('.dk-mapa-i.on') || back.querySelector('.dk-mapa-i');
      setTimeout(function () { if (prvi) { prvi.focus({ preventScroll: true }); prvi.scrollIntoView({ block: 'nearest' }); } }, 60);
    });
  }
  async function dokPremakniKam(r, kopija) {
    if (!sme('dokumenti', 'w')) return;
    var cilj = await dokIzberiMapo(kopija ? 'Kopiraj v mapo' : 'Premakni v mapo', kopija ? 'Kopiraj' : 'Premakni', r.je_mapa ? dokPotMape(r) : null, r.mapa || '');
    if (cilj == null) return;
    if (!kopija && cilj === (r.mapa || '')) return;
    if (kopija) { await dokKopirajV(r, cilj); dokRisi(); return; }
    var ime = dokUnikatnoImeV(dokImeRow(r), cilj, r.je_mapa), stariPot = dokPotMape(r);
    var e = (await sb.rpc('dok_premakni', { p_id: r.id, p_mapa: cilj, p_ime: ime })).error;
    if (e) { toast(napakaBesedilo(e)); return; }
    var otroci = r.je_mapa ? dokOtroci(r) : [];
    r.mapa = cilj; r.ime = ime;
    if (r.je_mapa) { var nov = dokPotMape(r); otroci.forEach(function (c) { c.mapa = nov + (c.mapa || '').slice(stariPot.length); }); }
    logDodaj('Dokumenti', 'Premaknjeno', '»' + stariPot + '« → »' + (cilj || 'Dokumenti') + '«');
    dokRisi(); toast('Premaknjeno v »' + (cilj ? cilj.split('/').pop() : 'Dokumenti') + '«');
  }
  async function dokKopirajV(r, cilj, globina) {
    var ime = dokUnikatnoImeV(dokImeRow(r), cilj, r.je_mapa);
    try {
      if (!r.je_mapa) {
        var pot = dokStoragePot(cilj, ime);
        var cp = await sb.storage.from('dokumenti').copy(r.storage_path, pot); if (cp.error) throw cp.error;
        var ins = await sb.from('documents').insert({ mapa: cilj, ime: ime, storage_path: pot, mime: r.mime || '', velikost: r.velikost || null, je_mapa: false }).select('id,mapa,ime,storage_path,mime,velikost,je_mapa,zaklenjeno,created_at').single();
        if (ins.error) { try { await sb.storage.from('dokumenti').remove([pot]); } catch (e2) {} throw ins.error; }
        DOKUMENTI.unshift(ins.data);
      } else {
        var im = await sb.from('documents').insert({ mapa: cilj, ime: ime, je_mapa: true, storage_path: '' }).select('id,mapa,ime,je_mapa,storage_path,zaklenjeno,created_at').single();
        if (im.error) throw im.error;
        DOKUMENTI.unshift(im.data);
        var stari = dokPotMape(r), novi = dokPotMape(im.data);
        var neposredni = (DOKUMENTI || []).filter(function (x) { return x.id !== im.data.id && (x.mapa || '') === stari; });
        for (var i = 0; i < neposredni.length; i++) await dokKopirajV(neposredni[i], novi, (globina || 0) + 1);
      }
      if (!globina) { logDodaj('Dokumenti', 'Kopirano', '»' + dokPotMape(r) + '« → »' + (cilj || 'Dokumenti') + '«'); toast('Kopirano v »' + (cilj ? cilj.split('/').pop() : 'Dokumenti') + '«'); }
    } catch (e) { toast(napakaBesedilo(e)); throw e; }
  }
  async function dokIzbrisi(r) {
    if (!sme('dokumenti', 'x')) return;
    if (dokZaklenjen(r)) { toast(r.je_mapa && r.zaklenjeno ? 'Mapa je zaklenjena.' : 'Element je v zaklenjeni mapi.'); return; }
    var otroci = r.je_mapa ? dokOtroci(r) : [];
    var ok = await potrdiModal({ naslov: r.je_mapa ? 'Izbriši mapo' : 'Izbriši datoteko', sporocilo: 'Izbrišem »' + dokImeRow(r) + '«' + (otroci.length ? ' z vsebino (' + otroci.length + ')' : '') + '? Ostane 30 dni med nedavno brisanimi.', potrdi: 'Izbriši', preklici: 'Prekliči', nevarno: true });
    if (!ok) return;
    var ids = [r.id].concat(otroci.map(function (c) { return c.id; })), kdaj = new Date().toISOString();
    var u = await sb.from('documents').update({ deleted_at: kdaj }).in('id', ids);
    if (u.error) { toast(napakaBesedilo(u.error)); return; }
    DOKUMENTI = DOKUMENTI.filter(function (x) { return ids.indexOf(x.id) < 0; });
    logDodaj('Dokumenti', 'Izbrisano', '»' + dokPotMape(r) + '«' + (otroci.length ? ' z vsebino (' + otroci.length + ')' : ''));
    dokRisi();
    toast('Izbrisano', { besedilo: 'Razveljavi', ob: async function () {
      var o = await sb.from('documents').update({ deleted_at: null }).in('id', ids).eq('deleted_at', kdaj);
      if (o.error) { toast(napakaBesedilo(o.error)); return; }
      await risiDokumenti(); toast('Obnovljeno');
    } });
  }

  // ── koš: skupine, izbrisane hkrati (mapa z vsebino je ena vrstica) ──
  async function dokKos() {
    var box = $('dokList'); if (!box || !sme('dokumenti', 'x')) return;
    _dokVKosu = true;
    var mejnik = new Date(Date.now() - 30 * 864e5).toISOString();
    var q = await vseVrstice(function (a, b) { return sb.from('documents').select('id,ime,mapa,storage_path,je_mapa,deleted_at,velikost,mime').not('deleted_at', 'is', null).gte('deleted_at', mejnik).order('deleted_at', { ascending: false }).range(a, b); });
    if ($('dokPot')) $('dokPot').hidden = true;
    if ($('dokKosPov')) $('dokKosPov').hidden = true;
    var arr = q.error ? [] : (q.data || []), skupine = {};
    arr.forEach(function (d) { (skupine[d.deleted_at] = skupine[d.deleted_at] || []).push(d); });
    var vrh = [];
    Object.keys(skupine).forEach(function (k) {
      var g = skupine[k], poti = {}; g.forEach(function (d) { if (d.je_mapa) poti[dokPotMape(d)] = 1; });
      g.forEach(function (d) { if (!poti[d.mapa || '']) vrh.push({ r: d, n: g.length - 1, kdaj: k }); });
    });
    var html = '<div class="cgrp-bar"><button type="button" class="cgrp-btn ghost" id="kosNazajDok">' + IKO_T_NAZAJ + 'Nazaj na dokumente</button></div>' +
      '<h3 class="sec-h" style="margin:6px 0 10px">Nedavno brisani dokumenti</h3>';
    if (q.error) html += '<div class="rows"><div class="empty"><h3>Nalaganje ni uspelo</h3><p class="u-sub">' + escape_(napakaBesedilo(q.error)) + '</p></div></div>';
    else if (!vrh.length) html += '<div class="empty"><h3>Koš je prazen</h3></div>';
    else html += '<div class="cenik dk-kos">' + vrh.map(function (v) {
      var d = v.r;
      return '<div class="cenik-row"><div class="cenik-nm">' + escape_(dokImeRow(d)) + '</div>' +
        '<div class="cenik-meta">' + escape_([d.je_mapa ? 'Mapa' + (v.n ? ' z vsebino (' + v.n + ')' : '') : dokOznaka(d), d.mapa ? d.mapa.replace(/\//g, ' › ') : 'Dokumenti', 'izbrisano ' + datumcas(v.kdaj)].join(' · ')) + '</div>' +
        '<div class="cenik-cena"><button type="button" class="btn-mini cenik-restore" data-obnovi="' + escape_(v.kdaj) + '" data-id="' + escape_(d.id) + '">Obnovi</button> ' +
        '<button type="button" class="btn-mini danger" data-dokoncno="' + escape_(v.kdaj) + '" data-id="' + escape_(d.id) + '">Izbriši dokončno</button></div></div>';
    }).join('') + '</div>';
    box.innerHTML = html;
    $('kosNazajDok').addEventListener('click', function () { _dokVKosu = false; if ($('dokKosPov')) $('dokKosPov').hidden = !sme('dokumenti', 'x'); dokRisi(); });
    function skupina(kdaj, id) {
      var g = skupine[kdaj] || [], glava = g.filter(function (d) { return d.id === id; })[0]; if (!glava) return [];
      if (!glava.je_mapa) return [glava];
      var p = dokPotMape(glava); return g.filter(function (d) { return d.id === id || (d.mapa || '') === p || (d.mapa || '').indexOf(p + '/') === 0; });
    }
    box.querySelectorAll('[data-obnovi]').forEach(function (b) { b.addEventListener('click', function () { dokObnovi(skupina(b.dataset.obnovi, b.dataset.id)); }); });
    box.querySelectorAll('[data-dokoncno]').forEach(function (b) { b.addEventListener('click', function () { dokIzbrisiDokoncno(skupina(b.dataset.dokoncno, b.dataset.id)); }); });
  }
  async function dokObnovi(g) {
    if (!g.length) return;
    var glava = g[0];
    // manjkajoče nadrejene mape: obnovi iz koša ali ustvari znova
    var potrebne = [], deli = (glava.mapa || '').split('/').filter(Boolean), acc = '';
    deli.forEach(function (d) { acc = acc ? acc + '/' + d : d; potrebne.push(acc); });
    var obstojece = {}; (DOKUMENTI || []).forEach(function (f) { if (f.je_mapa) obstojece[dokPotMape(f)] = 1; });
    for (var i = 0; i < potrebne.length; i++) {
      var p = potrebne[i]; if (obstojece[p]) continue;
      var stars = p.lastIndexOf('/') >= 0 ? p.slice(0, p.lastIndexOf('/')) : '', ime = p.slice(p.lastIndexOf('/') + 1);
      var iz = await sb.from('documents').select('id').eq('je_mapa', true).eq('mapa', stars).eq('ime', ime).not('deleted_at', 'is', null).limit(1);
      var e = iz.data && iz.data[0] ? (await sb.from('documents').update({ deleted_at: null }).eq('id', iz.data[0].id)).error
        : (await sb.from('documents').insert({ mapa: stars, ime: ime, je_mapa: true, storage_path: '' })).error;
      if (e) { toast(napakaBesedilo(e)); return; }
      obstojece[p] = 1;
    }
    var u = await sb.from('documents').update({ deleted_at: null }).in('id', g.map(function (d) { return d.id; }));
    if (u.error) { toast(u.error.code === '23505' ? 'V mapi že obstaja element z enakim imenom. Najprej ga preimenuj.' : napakaBesedilo(u.error)); return; }
    logDodaj('Dokumenti', 'Obnovljeno', '»' + dokPotMape(glava) + '«');
    toast('Obnovljeno');
    await risiDokumenti(true); dokKos();
  }
  async function dokIzbrisiDokoncno(g) {
    if (!g.length) return;
    var ok = await potrdiModal({ naslov: 'Izbriši dokončno', sporocilo: 'Dokončno izbrišem »' + dokImeRow(g[0]) + '«' + (g.length > 1 ? ' z vsebino' : '') + '? Tega ni mogoče razveljaviti.', potrdi: 'Izbriši dokončno', preklici: 'Prekliči', nevarno: true });
    if (!ok) return;
    var d = await sb.from('documents').delete().in('id', g.map(function (x) { return x.id; }));   // najprej zapis, nato datoteke
    if (d.error) { toast(napakaBesedilo(d.error)); return; }
    var poti = g.map(function (x) { return x.storage_path; }).filter(Boolean);
    if (poti.length) { try { await sb.storage.from('dokumenti').remove(poti); } catch (e) {} }
    logDodaj('Dokumenti', 'Dokončno izbrisano', '»' + dokPotMape(g[0]) + '«');
    toast('Dokončno izbrisano'); dokKos();
  }

  // ── prenos in odpiranje ──
  function dokJeIosApp() { return document.documentElement.classList.contains('sc-sam') && /iP(hone|ad|od)/.test(navigator.userAgent); }
  async function dokPrenesi(r, gumb) {
    if (!sme('dokumenti', 'd') || !r.storage_path) return;
    var ime = dokImeRow(r);
    if (gumb) gumb.classList.add('nalaga');
    try {
      var dl = await sb.storage.from('dokumenti').download(r.storage_path);
      if (dl.error || !dl.data) throw dl.error || new Error('Prenos ni uspel.');
      var blob = dl.data;
      // aplikacija na začetnem zaslonu iPhona: prenos prek menija Deli (povezava za prenos tam ne deluje)
      if (dokJeIosApp() && navigator.canShare) {
        var f = new File([blob], ime, { type: blob.type || r.mime || 'application/octet-stream' });
        if (navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f] }); } catch (e) {} return; }
      }
      var u = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = u; a.download = ime; document.body.appendChild(a); a.click();
      setTimeout(function () { a.remove(); URL.revokeObjectURL(u); }, 4000);
    } catch (e) { toast(napakaBesedilo(e)); }
    finally { if (gumb) gumb.classList.remove('nalaga'); }
  }
  async function dokOdpriVZavihku(r) {
    var okno = window.open('', '_blank');   // odpri takoj (sicer brskalnik okno blokira), naslov nastavi, ko je povezava znana
    try { if (okno) okno.opener = null; } catch (e) {}   // odprta datoteka nima dostopa do portala
    try { var u = await dokPovezava(r, 600); if (okno) okno.location.href = u; else window.location.href = u; }
    catch (e) { if (okno) okno.close(); toast(napakaBesedilo(e)); }
  }

  async function dokNovaMapa() {
    if (!sme('dokumenti', 'w')) return;
    var vnos = await vnesiModal({ naslov: 'Nova mapa', placeholder: 'Ime mape', potrdi: 'Ustvari', preklici: 'Prekliči' });
    if (vnos == null) return;
    var ime = dokPocistiIme(vnos); if (!ime) { toast('Vpiši ime mape.'); return; }
    if (dokObstaja(ime, _dokPot, true)) { toast('Mapa s tem imenom že obstaja.'); return; }
    var ins = await sb.from('documents').insert({ mapa: _dokPot, ime: ime, je_mapa: true, storage_path: '' }).select('id,mapa,ime,je_mapa,storage_path,zaklenjeno,created_at').single();
    if (ins.error) { toast(napakaBesedilo(ins.error)); return; }
    DOKUMENTI.unshift(ins.data); logDodaj('Dokumenti', 'Nova mapa', '»' + dokPotMape(ins.data) + '«');
    dokRisi();
  }

  // ── nalaganje datotek ──
  function dokPripIme(n) { return ((/\.([a-z0-9]+)$/i.exec(n || '') || [])[1] || '').toLowerCase(); }
  function dokTipOk(f) { var e = dokPripIme(f.name); return DOK_DOVOLJENE.indexOf(e) >= 0 && !/svg/i.test(f.type || ''); }
  // Fotografije zmanjša (najv. 2000 px, JPEG 0,82). Majhne slike, PNG z grafiko in GIF ostanejo, kot so.
  async function dokStisniSliko(file) {
    var e = dokPripIme(file.name), heic = e === 'heic' || e === 'heif';
    if (!/^(jpe?g|png|webp|heic|heif)$/.test(e)) return null;
    if (!heic && file.size < 1.5 * 1048576) return null;
    try {
      var bmp = await createImageBitmap(file);
      var s = Math.min(1, 2000 / Math.max(bmp.width, bmp.height)), w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(bmp, 0, 0, w, h); if (bmp.close) bmp.close();
      var blob = await new Promise(function (ok) { cv.toBlob(ok, 'image/jpeg', 0.82); });
      if (!blob || (!heic && blob.size >= file.size)) return null;
      return { blob: blob, ime: (file.name || 'slika').replace(/\.[a-z0-9]+$/i, '') + '.jpg', mime: 'image/jpeg' };
    } catch (er) { return null; }
  }
  function dokKonfliktModal(ime) {
    return new Promise(function (resolve) {
      var back = document.createElement('div'); back.className = 'sc-modal-back';
      back.innerHTML = '<div class="sc-modal" role="dialog" aria-modal="true"><h4>»' + escape_(ime) + '« že obstaja</h4><div class="sc-modal-acts" style="flex-wrap:wrap;justify-content:flex-end"><button type="button" class="sc-modal-btn ghost" data-x>Preskoči</button><button type="button" class="sc-modal-btn ghost" data-novo>Shrani kot novo</button><button type="button" class="sc-modal-btn primary" data-pos>Zamenjaj</button></div></div>';
      document.body.appendChild(back); _modalA11y(back); requestAnimationFrame(function () { back.classList.add('show'); });
      var done = false;
      function zapri(v) { if (done) return; done = true; back.classList.remove('show'); document.removeEventListener('keydown', onKey, true); setTimeout(function () { back.remove(); }, 180); _modalVrniFokus(); resolve(v); }
      function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); zapri(null); } }
      back.querySelector('[data-x]').addEventListener('click', function () { zapri(null); });
      back.querySelector('[data-novo]').addEventListener('click', function () { zapri('novo'); });
      back.querySelector('[data-pos]').addEventListener('click', function () { zapri('posodobi'); });
      back.addEventListener('click', function (e) { if (e.target === back) zapri(null); });
      document.addEventListener('keydown', onKey, true);
      setTimeout(function () { var b = back.querySelector('[data-pos]'); if (b) b.focus(); }, 60);
    });
  }
  function dokGumbStanje(t) {
    var b = $('dokNaloziBtn'); if (!b) return;
    var l = b.querySelector('.tb-lbl'); if (l) l.textContent = t || 'Naloži';
    b.disabled = !!t; b.classList.toggle('nalaga', !!t); b.title = t || 'Naloži datoteke';
  }
  async function dokNalozi(files) {
    if (!files || !files.length || !sme('dokumenti', 'w')) return;
    if (_dokNalagam) { toast('Nalaganje že poteka.'); return; }
    files = Array.prototype.slice.call(files);
    var cilj = _dokPot, zavrnjene = [], napake = [], n = 0;
    files = files.filter(function (f) {
      if (!dokTipOk(f)) { zavrnjene.push(f.name + ' (vrsta)'); return false; }
      if (f.size > DOK_MAX_MB * 1048576) { zavrnjene.push(f.name + ' (večja od ' + DOK_MAX_MB + ' MB)'); return false; }
      return true;
    });
    _dokNalagam = true;
    try {
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        dokGumbStanje('Nalagam ' + (i + 1) + '/' + files.length);
        var st = await dokStisniSliko(f);
        var blob = st ? st.blob : f, ime = dokPocistiIme(st ? st.ime : f.name) || 'datoteka', mime = st ? st.mime : (f.type || 'application/octet-stream');
        var posodobi = null;
        var obst = (DOKUMENTI || []).filter(function (x) { return !x.je_mapa && (x.mapa || '') === cilj && dokTranslit(dokImeRow(x)).toLowerCase() === dokTranslit(ime).toLowerCase(); })[0];
        if (obst) {
          var izb = await dokKonfliktModal(ime);
          if (izb == null) continue;
          if (izb === 'posodobi') { if (dokZaklenjen(obst)) { napake.push(ime + ' (zaklenjeno)'); continue; } posodobi = obst; }
          else ime = dokUnikatnoImeV(ime, cilj, false);
        }
        var pot = dokStoragePot(cilj, ime);
        try {
          var up = await sb.storage.from('dokumenti').upload(pot, blob, { contentType: mime, cacheControl: '3600', upsert: false });
          if (up.error) throw up.error;
          var q = posodobi
            ? sb.from('documents').update({ storage_path: pot, mime: mime, velikost: blob.size }).eq('id', posodobi.id)
            : sb.from('documents').insert({ mapa: cilj, ime: ime, storage_path: pot, mime: mime, velikost: blob.size, je_mapa: false });
          var res = await q.select('id,mapa,ime,storage_path,mime,velikost,je_mapa,zaklenjeno,created_at').single();
          if (res.error) { try { await sb.storage.from('dokumenti').remove([pot]); } catch (e2) {} throw res.error; }   // brez osirotelih datotek
          if (posodobi) {
            var stara = posodobi.storage_path;
            Object.assign(posodobi, res.data);
            if (stara) { try { await sb.storage.from('dokumenti').remove([stara]); } catch (e3) {} delete DOK_URL[stara]; }
          } else DOKUMENTI.unshift(res.data);
          n++;
          logDodaj('Dokumenti', posodobi ? 'Zamenjano' : 'Naloženo', '»' + (cilj ? cilj + '/' : '') + ime + '« · ' + dokVelikost(blob.size));
        } catch (e) { napake.push(ime + ' (' + napakaBesedilo(e).replace(/\.$/, '').toLowerCase() + ')'); }
        if (cilj === _dokPot && !_dokVKosu) dokRisi();
      }
    } finally { _dokNalagam = false; dokGumbStanje(''); }
    if (!_dokVKosu) dokRisi();
    var tez = zavrnjene.concat(napake);
    if (n && !tez.length) toast(n === 1 ? 'Naloženo' : 'Naloženih ' + n);
    else if (tez.length) toast((n ? 'Naloženih ' + n + ' · ' : '') + 'Ni naloženo: ' + tez.slice(0, 3).join(', ') + (tez.length > 3 ? ' …' : ''));
  }

  // ── skeniranje: strani s kamero → en PDF ──
  var _skenSlike = [];
  async function dokSkenSlika(f) {   // zajeto stran zmanjša takoj (manj pomnilnika na telefonu)
    try {
      var bmp = await createImageBitmap(f);
      var s = Math.min(1, 2000 / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(bmp, 0, 0, w, h); if (bmp.close) bmp.close();
      return cv.toDataURL('image/jpeg', 0.85);
    } catch (e) { return null; }
  }
  async function dokSlikeVPdf(urls) {
    await zagotoviPdf();
    var doc = new PDFDoc(), M = 28, W = doc.W, H = doc.H;
    for (var i = 0; i < urls.length; i++) {
      var j = await PDFDoc.imageToJpeg(urls[i], 1600);
      var sc = Math.min((W - 2 * M) / j.w, (H - 2 * M) / j.h); if (sc > 1) sc = 1;
      var dw = j.w * sc, dh = j.h * sc;
      doc.addPage(); doc.image(j.bytes, (W - dw) / 2, (H - dh) / 2, dw, dh, j.w, j.h);
    }
    return doc.build();
  }
  function dokSkenirajOdpri() {
    if (!sme('dokumenti', 'w')) return;
    zagotoviPdf().catch(function () {});
    _skenSlike = [];
    var mape = dokMapeSeznam(), kam = $('dokKamera'), lib = $('dokKameraLib');
    var back = document.createElement('div'); back.className = 'sc-modal-back sken-back';
    back.innerHTML = '<div class="sc-modal sken-modal" role="dialog" aria-modal="true" aria-label="Skeniraj račun"><h4>Skeniraj račun</h4>' +
      '<div class="sken-strani" id="skenStrani"></div>' +
      '<div class="sken-add-row"><button type="button" class="cgrp-btn ghost" id="skenDodaj">' + IKO_KAMERA + 'Slikaj stran</button><button type="button" class="cgrp-btn ghost" id="skenIzDat">' + IKO_NALOZI + 'Iz datotek</button></div>' +
      '<div class="sken-polja"><label class="ur-f"><span>Ime</span><input type="text" class="sc-modal-input" id="skenIme" value="Račun ' + escape_(datum(danes10())) + '"></label>' +
      '<label class="ur-f"><span>Mapa</span><select id="skenMapa">' + mape.map(function (m) { return '<option value="' + escape_(m.pot) + '"' + (m.pot === _dokPot ? ' selected' : '') + '>' + escape_(m.label) + '</option>'; }).join('') + '</select></label></div>' +
      '<div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" id="skenPreklici">Prekliči</button><button type="button" class="sc-modal-btn primary" id="skenShrani" disabled>Shrani PDF</button></div></div>';
    document.body.appendChild(back); _modalA11y(back); requestAnimationFrame(function () { back.classList.add('show'); });
    var zaprto = false;
    function zapri() { if (zaprto) return; zaprto = true; _modalVrniFokus(); back.classList.remove('show'); document.removeEventListener('keydown', onk, true); if (kam) kam.onchange = null; if (lib) lib.onchange = null; setTimeout(function () { back.remove(); }, 180); _skenSlike = []; }
    async function zapriVprasaj() { if (!_skenSlike.length || await potrdiModal({ naslov: 'Zavrzi skene?', sporocilo: 'Zajete strani (' + _skenSlike.length + ') se ne shranijo.', potrdi: 'Zavrzi', preklici: 'Nazaj', nevarno: true })) zapri(); }
    function onk(e) { if (e.key === 'Escape' && !document.querySelector('.sc-modal-back:not(.sken-back)')) { e.stopPropagation(); zapriVprasaj(); } }
    async function dodaj(files) {
      var arr = Array.prototype.slice.call(files || []), napak = 0;
      for (var i = 0; i < arr.length; i++) { var u = await dokSkenSlika(arr[i]); if (u) _skenSlike.push(u); else napak++; }
      if (napak) toast(napak === 1 ? 'Slike ni bilo mogoče prebrati.' : napak + ' slik ni bilo mogoče prebrati.');
      osvezi();
    }
    function osvezi() {
      var wrap = back.querySelector('#skenStrani');
      wrap.innerHTML = _skenSlike.length ? _skenSlike.map(function (s, i) { return '<div class="sken-th"><img src="' + escape_(s) + '" alt="Stran ' + (i + 1) + '"><button type="button" class="sken-th-x" data-i="' + i + '" aria-label="Odstrani stran ' + (i + 1) + '">' + IKO_ZAPRI + '</button><span class="sken-th-n">' + (i + 1) + '</span></div>'; }).join('') : '<button type="button" class="sken-prazno" aria-label="Slikaj stran">' + IKO_KAMERA + '</button>';
      wrap.querySelectorAll('.sken-th-x').forEach(function (b) { b.addEventListener('click', function () { _skenSlike.splice(+b.dataset.i, 1); osvezi(); }); });
      var pr = wrap.querySelector('.sken-prazno'); if (pr) pr.addEventListener('click', function () { if (kam) { kam.value = ''; kam.click(); } });
      back.querySelector('#skenShrani').disabled = !_skenSlike.length;
    }
    osvezi();
    back.querySelector('#skenDodaj').addEventListener('click', function () { if (kam) { kam.value = ''; kam.click(); } });
    back.querySelector('#skenIzDat').addEventListener('click', function () { if (lib) { lib.value = ''; lib.click(); } });
    if (kam) kam.onchange = function () { dodaj(this.files); this.value = ''; };
    if (lib) lib.onchange = function () { dodaj(this.files); this.value = ''; };
    back.querySelector('#skenPreklici').addEventListener('click', zapriVprasaj);
    back.addEventListener('click', function (e) { if (e.target === back) zapriVprasaj(); });
    document.addEventListener('keydown', onk, true);
    back.querySelector('#skenShrani').addEventListener('click', async function () {
      var btn = this; if (!_skenSlike.length) return;
      var ime = dokPocistiIme(back.querySelector('#skenIme').value) || 'Račun'; if (!/\.pdf$/i.test(ime)) ime += '.pdf';
      var cilj = back.querySelector('#skenMapa').value || '';
      btn.disabled = true; btn.textContent = 'Shranjujem …';
      try {
        var bytes = await dokSlikeVPdf(_skenSlike);
        ime = dokUnikatnoImeV(ime, cilj, false);
        var pot = dokStoragePot(cilj, ime), blob = new Blob([bytes], { type: 'application/pdf' });
        var up = await sb.storage.from('dokumenti').upload(pot, blob, { contentType: 'application/pdf', cacheControl: '3600', upsert: false });
        if (up.error) throw up.error;
        var ins = await sb.from('documents').insert({ mapa: cilj, ime: ime, storage_path: pot, mime: 'application/pdf', velikost: blob.size, je_mapa: false }).select('id,mapa,ime,storage_path,mime,velikost,je_mapa,zaklenjeno,created_at').single();
        if (ins.error) { try { await sb.storage.from('dokumenti').remove([pot]); } catch (e2) {} throw ins.error; }
        DOKUMENTI.unshift(ins.data); logDodaj('Dokumenti', 'Skenirano', '»' + (cilj ? cilj + '/' : '') + ime + '« · ' + _skenSlike.length + ' str.');
        zapri(); dokPojdi(cilj); toast('Shranjeno: ' + ime);
      } catch (e) { btn.disabled = false; btn.textContent = 'Shrani PDF'; toast(napakaBesedilo(e)); }
    });
  }

  { var _dkDi = $('dokIsci'); if (_dkDi) _dkDi.addEventListener('input', function () { if (!_dokVKosu) dokRisi(); }); }
  { var _dkDs = $('dokSort'); if (_dkDs) _dkDs.addEventListener('change', function () { if (!_dokVKosu) dokRisi(); }); }
  { var _dkDp = $('dokPot'); if (_dkDp) _dkDp.addEventListener('click', function (e) { var b = e.target.closest('button.dk-crumb'); if (b) dokPojdi(b.dataset.pot); }); }
  { var _dkNm = $('dokNovaMapa'); if (_dkNm) _dkNm.addEventListener('click', dokNovaMapa); }
  { var _dkNb = $('dokNaloziBtn'), _dkFi = $('dokFile'); if (_dkNb && _dkFi) { _dkNb.addEventListener('click', function () { if (!_dokNalagam) _dkFi.click(); }); _dkFi.addEventListener('change', function () { dokNalozi(this.files); this.value = ''; }); } }
  { var _dkSk = $('dokSkenirajBtn'); if (_dkSk) _dkSk.addEventListener('click', dokSkenirajOdpri); }
  { var _dkKb = $('dokKosBtn'); if (_dkKb) _dkKb.addEventListener('click', dokKos); }
  { var _dkSd = $('sec-dokumenti'), _dkGl = 0; if (_dkSd) {
    var _dkSkrij = function () { _dkGl = 0; var h = $('dokDropHint'); if (h) h.hidden = true; };
    _dkSd.addEventListener('dragenter', function (e) { if (!sme('dokumenti', 'w') || _dokVKosu || !(e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], 'Files') >= 0)) return; e.preventDefault(); _dkGl++; var h = $('dokDropHint'); if (h) h.hidden = false; });
    _dkSd.addEventListener('dragover', function (e) { if (_dkGl) e.preventDefault(); });
    _dkSd.addEventListener('dragleave', function () { if (_dkGl && --_dkGl <= 0) _dkSkrij(); });
    _dkSd.addEventListener('drop', function (e) { if (!_dkGl) return; e.preventDefault(); _dkSkrij(); if (e.dataTransfer && e.dataTransfer.files) dokNalozi(e.dataTransfer.files); });
  } }

  /* ══════════ ČIPI (UHF RFID) — perilo s čipi ══════════
     Kos perila = čip (EPC) pri stranki + artikel te stranke (72_rfid.sql). Čitalec (Chainway C72 z aplikacijo
     Keyboard Emulator, R1 na računalniku) vtipka EPC in Enter v polje za skeniranje.
     Oddaja / Prevzem: skeniraš vse naenkrat (lahko več strank); portal kose razvrsti po strankah, Potrdi jih
     zabeleži in pri oddaji vsaki stranki sam ustvari spremni list (rfid_potrdi — ena transakcija, ključ
     potrditve prepreči dvojne liste). Označi: čipi izbrane stranke dobijo artikel. Kosi: pregled stranke.
     V portalu sta od 4.94 le Evidenca (kosi) in Označi: oddajo in prevzem skenira aplikacija na C72.
     Skeniranje se hrani na napravi — osvežitev strani ga ne izgubi. */
  var RF = { org: null, nacin: 'kosi', idx: {}, vprasan: {}, sken: [], skenSet: {}, kljuc: null, art: '', arts: [], kosi: null, gen: 0, rezultat: null,
    izlocene: {}, vkl: { prest: false, drugje: false }, isciGen: 0, isciNapake: 0, oznacujem: false, potrjujem: false };
  try {
    RF.org = localStorage.getItem('sc-rfid-org') || null;
    if (localStorage.getItem('sc-rfid-nacin') !== 'kosi') localStorage.setItem('sc-rfid-nacin', 'kosi');   // portal ima le Evidenco (od 5.04)
    var _rfs = JSON.parse(localStorage.getItem('sc-rfid-sken') || 'null');
    if (_rfs && Array.isArray(_rfs.sken)) { RF.sken = _rfs.sken.filter(function (e) { return /^[0-9A-F]{8,64}$/.test(e); }); RF.kljuc = _rfs.kljuc || null; RF.sken.forEach(function (e) { RF.skenSet[e] = 1; }); if (_rfs.izlocene) RF.izlocene = _rfs.izlocene; }
  } catch (e) {}
  // Od 5.04 le Evidenca: čipe označuje aplikacija na C72 (namizni čitalec R1 je bil vrnjen, brez njega Označi v portalu ni uporaben).
  // Koda za Označi, Oddajo in Prevzem ostaja, a ni dosegljiva.
  var RF_NACINI = [['kosi', 'Evidenca']];
  var RF_PRALNICA_DNI = 3, RF_NEVIDEN_DNI = 45;   // pogrešan: v pralnici dlje kot 3 dni ali 45 dni brez skeniranja

  function rfEpc(s) { var e = String(s || '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase(); return /^[0-9A-F]{8,64}$/.test(e) ? e : null; }
  function rfKratko(epc) { return '…' + String(epc || '').slice(-8); }
  function rfDatum(ts) { return ts ? datum(isoLokalno(new Date(ts))) : ''; }
  function rfKljuc() { try { return crypto.randomUUID(); } catch (e) { return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, function () { return (Math.random() * 16 | 0).toString(16); }); } }
  function rfShrani() { try { localStorage.setItem('sc-rfid-sken', JSON.stringify({ sken: RF.sken, kljuc: RF.kljuc, izlocene: RF.izlocene })); } catch (e) {} }
  // čitalec kot tipkovnica: le čista številka (24+ šestnajstiških znakov, cele besede po 4) — »EPC:…«, pol številke ali dve skupaj ne
  function rfEpcVnos(s) { var e = String(s || '').replace(/\s+/g, ''); return /^[0-9A-Fa-f]+$/.test(e) && e.length >= 24 && e.length <= 64 && e.length % 4 === 0 ? e.toUpperCase() : null; }
  function rfZnan(e) { return !!(RF.vprasan[e] || RF.idx[e]); }
  // vrstice čipa pri živih strankah (izbrisane in neaktivne stranke baza preskoči, odpisani kosi ne štejejo)
  function rfZivi(e) { return (RF.idx[e] || []).filter(function (k) { return k.stanje !== 'odpisan' && ORGIME[k.org_id] && !ORGNEAKT[k.org_id]; }); }
  // stranka, ki jo je oseba v tem skeniranju odstranila (sosednji voziček): njeni čipi se ne štejejo in ne pošljejo
  function rfIzlocen(e) { var v = rfZivi(e); return !!(v.length && v.every(function (k) { return RF.izlocene[k.org_id]; })); }
  function rfZaPoslati() { return RF.sken.filter(function (e) { return !rfIzlocen(e); }); }
  function rfZeOddan(k) { return k.zadnji_tip === 'oddaja' && k.zadnjic && Date.now() - new Date(k.zadnjic).getTime() < 432e5; }   // 12 h, kot baza
  function rfUra(ts) {
    if (!ts) return '';
    var d = new Date(ts), u = d.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === new Date().toDateString()) return 'ob ' + u;
    if (d.toDateString() === new Date(Date.now() - 864e5).toDateString()) return 'včeraj ob ' + u;
    return rfDatum(ts) + ' ob ' + u;
  }
  function rfZeBesedilo(g) {
    var m = g.ze % 100;
    return (g.ze === g.n ? 'Že oddano' : stevilo(g.ze) + ' ' + (m === 1 ? 'že oddan' : m === 2 ? 'že oddana' : (m === 3 || m === 4) ? 'že oddani' : 'že oddanih')) + ' ' + rfUra(g.zeCas);
  }
  function rfListovToz(n) { var m = n % 100; return stevilo(n) + ' ' + (m === 1 ? 'spremni list' : m === 2 ? 'spremna lista' : (m === 3 || m === 4) ? 'spremne liste' : 'spremnih listov'); }
  function rfListov(n) { var m = n % 100; return stevilo(n) + ' ' + (m === 1 ? 'spremni list' : m === 2 ? 'spremna lista' : (m === 3 || m === 4) ? 'spremni listi' : 'spremnih listov'); }
  function rfPogresan(k) {   // razlog ali ''
    if (k.stanje !== 'aktiven' || !k.zadnjic) return '';
    var dni = (Date.now() - new Date(k.zadnjic).getTime()) / 864e5;
    if (k.zadnji_tip === 'prevzem' && dni > RF_PRALNICA_DNI) return 'v pralnici od ' + rfDatum(k.zadnjic);
    if (dni > RF_NEVIDEN_DNI) return 'nazadnje ' + rfDatum(k.zadnjic);
    return '';
  }
  function rfKje(k) {
    if (k.stanje === 'izgubljen') return 'izgubljen';
    if (k.stanje === 'odpisan') return 'odpisan';
    return (k.zadnji_tip === 'prevzem' ? 'v pralnici' : 'pri stranki') + (k.zadnjic ? ' · ' + rfDatum(k.zadnjic) : '');
  }
  function rfArtIme(k) { var a = RF.arts.filter(function (x) { return x.id === k.article_id; })[0]; return a ? a.name : k.naziv; }
  function rfStranka() { return RF.nacin === 'oznaci' || RF.nacin === 'kosi'; }   // ta načina potrebujeta izbrano stranko
  // polje takoj v fokusu: računalnik (R1) in ročni čitalec Chainway (tam tipkovnica ne moti, telefon je ne odpre sam)
  var RF_CITALEC = /\bC7\d\b|\bC6\d\b|Chainway/i.test(navigator.userAgent || '');
  function rfFokus() { var i = $('rfVnos'); if (i && (RF_CITALEC || matchMedia('(pointer:fine)').matches)) i.focus({ preventScroll: true }); }

  // kosi stranke (Označi, Kosi) in njeni artikli
  async function rfNalozi(org) {
    var gen = ++RF.gen;
    var rez = await Promise.all([
      vseVrstice(function (a, b) { return sb.from('rfid_kosi').select('id,epc,org_id,article_id,naziv,stanje,pranj,zadnji_tip,zadnjic,created_at').eq('org_id', org).order('created_at').order('id').range(a, b); }),
      sb.from('articles').select('id,name,aktiven,sort_order').eq('org_id', org).order('sort_order')
    ]);
    if (gen !== RF.gen) return false;
    if (rez[0].error) throw rez[0].error;
    RF.kosi = rez[0].data || [];
    RF.arts = (rez[1].data || []).filter(function (a) { return a.aktiven !== false && a.name; });
    if (RF.art && !RF.arts.some(function (a) { return a.id === RF.art; })) RF.art = '';
    return true;
  }
  // čipi → kosi (vse stranke; isti EPC je lahko pri več strankah). Sproti, po 200 naenkrat.
  var _rfIsciT = null, _rfIscem = null;
  function rfIsci(takoj) {
    clearTimeout(_rfIsciT);
    var izvedi = function () {
      if (_rfIscem) return _rfIscem;
      var manjka = RF.sken.filter(function (e) { return !RF.vprasan[e]; }).slice(0, 150);   // ~150 EPC na zahtevo (dolžina naslova)
      if (!manjka.length) return Promise.resolve();
      var g0 = RF.isciGen, ctl = new AbortController(), rok = setTimeout(function () { ctl.abort(); }, 15000);
      _rfIscem = (async function () {
        var r = await sb.from('rfid_kosi').select('id,epc,org_id,article_id,naziv,stanje,zadnji_tip,zadnjic').in('epc', manjka).abortSignal(ctl.signal);
        if (r.error) throw r.error;
        var nov = {}; (r.data || []).forEach(function (k) { (nov[k.epc] = nov[k.epc] || []).push(k); });
        manjka.forEach(function (e) { RF.idx[e] = nov[e] || []; if (RF.isciGen === g0) RF.vprasan[e] = 1; });   // vmes osveženo: vprašaj znova
      })().then(function () { clearTimeout(rok); _rfIscem = null; RF.isciNapake = 0; rfOsvezi(); if (RF.sken.some(function (e) { return !RF.vprasan[e]; })) return izvedi(); },
        function (e) { clearTimeout(rok); _rfIscem = null; throw e; });
      return _rfIscem;
    };
    if (takoj) return izvedi();
    _rfIsciT = setTimeout(function () { izvedi().catch(rfIsciNapaka); }, 300);
    return null;
  }
  function rfIsciNapaka(e, vedno) {
    if (!RF.isciNapake || vedno) toast((e && e.name === 'AbortError') ? 'Ni povezave z internetom.' : napakaBesedilo(e));
    RF.isciNapake++;
    clearTimeout(_rfIsciT);
    _rfIsciT = setTimeout(function () { if (RF.sken.some(function (x) { return !rfZnan(x); })) { var p = rfIsci(true); if (p && p.catch) p.catch(rfIsciNapaka); } }, Math.min(30000, 2000 * Math.pow(2, RF.isciNapake - 1)));
  }
  // znova vprašaj bazo; stari podatki ostanejo do novih (brez utripanja) — vse: pozabi tudi te
  function rfPozabi(epcs, vse) { RF.isciGen++; epcs.forEach(function (e) { delete RF.vprasan[e]; if (vse) delete RF.idx[e]; }); }
  // klic z rokom: brez odgovora v 30 s se prekine (gumb ne ostane v nalaganju; ključ potrditve ostane za ponovitev)
  function zRokom(q, ms) {
    var ctl = new AbortController(), t = null;
    if (q && typeof q.abortSignal === 'function') q = q.abortSignal(ctl.signal);
    var rok = new Promise(function (r) { t = setTimeout(function () { ctl.abort(); r({ data: null, error: { message: 'Ni odgovora strežnika.', code: 'TIMEOUT' } }); }, ms || 30000); });
    return Promise.race([Promise.resolve(q), rok]).then(function (r) { clearTimeout(t); return r; }, function (e) { clearTimeout(t); throw e; });
  }

  async function risiCipe(prednalozi) {
    var sel = $('rfOrg'), telo = $('cipiVsebina'); if (!sel || !telo) return;
    var opt = rfOrgOpcije();
    if (sel.innerHTML !== opt) sel.innerHTML = opt;
    if (RF.org && !ORGSEZNAM.some(function (o) { return o.id === RF.org; })) RF.org = null;
    if (!telo.dataset.zgr) {
      telo.dataset.zgr = '1';
      telo.innerHTML = (RF_NACINI.length > 1 ? '<span class="pris-tabs rf-nacini" role="tablist">' + RF_NACINI.map(function (n) {
        return '<button type="button" role="tab" class="pris-tab' + (n[0] === RF.nacin ? ' on' : '') + '" data-nacin="' + n[0] + '" aria-selected="' + (n[0] === RF.nacin) + '">' + n[1] + '</button>';
      }).join('') + '</span>' : '') + '<div id="rfTelo"></div>';
      telo.querySelectorAll('[data-nacin]').forEach(function (b) { b.addEventListener('click', function () { rfNacin(b.dataset.nacin); }); });
      sel.addEventListener('change', function (e) { if (!e.rfTiho) rfIzberiStranko(sel.value); });
      var isc = $('rfIsciStr'); if (isc) isc.addEventListener('input', function () { var t0 = $('rfTelo'); if (t0 && rfStranka() && !RF.org && !RF.rezultat) rfRisiStranke(t0); });
    }
    rfFiltri();
    if (prednalozi) { rfPod(); return; }
    rfRisi(); rfPod();
    if (RF.sken.length) rfIsci();
    if (rfStranka() && RF.org && !RF.kosi) {
      try { if (await rfNalozi(RF.org)) { rfRisi(); rfPod(); } }
      catch (e) { var t0 = $('rfTelo'); if (t0) t0.innerHTML = '<div class="rows"><div class="empty"><h3>Nalaganje ni uspelo</h3><p class="u-sub">' + escape_(napakaBesedilo(e)) + '</p></div></div>'; }
    }
  }
  // izbira stranke v glavi le, ko je stranka že izbrana (menjava); brez nje je izbira v kartici (rfRisi)
  // brez izbrane stranke: iskanje po mreži strank; z izbrano: menjava stranke v izbirniku
  function rfFiltri() { var f = $('rfOrg') && $('rfOrg').closest('.filtri'); if (!f) return; f.hidden = !rfStranka(); f.classList.toggle('rf-izbira', !RF.org); }
  function rfOrgOpcije() { return '<option value="">Izberi stranko</option>' + ORGSEZNAM.map(function (o) { return '<option value="' + escape_(o.id) + '"' + (o.id === RF.org ? ' selected' : '') + '>' + escape_(o.name) + '</option>'; }).join(''); }
  function rfPod() {
    var p = $('cipiPod'); if (!p) return;
    if (rfStranka() && RF.org && RF.kosi) { var akt = RF.kosi.filter(function (k) { return k.stanje === 'aktiven'; }).length; p.textContent = akt ? sklonKosov(akt) + ' s čipi' : 'Brez označenega perila'; }
    else if (rfStranka() && !RF.org && RF.poStr) { var vs = 0; Object.keys(RF.poStr).forEach(function (o) { vs += RF.poStr[o].aktivnih || 0; }); p.textContent = vs ? sklonKosov(vs) + ' s čipi' : 'Brez označenega perila'; }
    else p.textContent = '';
  }
  async function rfIzberiStranko(org) {
    RF.org = org || null; RF.kosi = null; RF.arts = []; RF.art = '';
    try { if (RF.org) localStorage.setItem('sc-rfid-org', RF.org); else localStorage.removeItem('sc-rfid-org'); } catch (e) {}
    var so = $('rfOrg'); if (so && so.value !== (RF.org || '')) { so.value = RF.org || ''; var ev = new Event('change'); ev.rfTiho = true; so.dispatchEvent(ev); }   // izbrano v kartici: tudi napis v glavi
    rfRisi(); rfPod();
    if (!RF.org) return;
    try { if (await rfNalozi(RF.org)) { rfRisi(); rfPod(); } } catch (e) { toast(napakaBesedilo(e)); }
  }
  function rfNacin(n) {
    if (n === RF.nacin || RF.potrjujem || RF.oznacujem) return;
    if (!RF_NACINI.some(function (x) { return x[0] === n; })) return;   // način, ki ga portal nima več (Označi je na C72)
    // v Označi gredo le neoznačeni čipi: že označen kos bi se sicer potiho prestavil na drug artikel
    if (n === 'oznaci' && RF.sken.length) { RF.sken = RF.sken.filter(function (e) { return rfZnan(e) && !rfZivi(e).length; }); RF.skenSet = {}; RF.sken.forEach(function (e) { RF.skenSet[e] = 1; }); }
    RF.kljuc = null; RF.vkl = { prest: false, drugje: false }; rfShrani();
    RF.nacin = n; RF.rezultat = null;
    try { localStorage.setItem('sc-rfid-nacin', n); } catch (e) {}
    document.querySelectorAll('.rf-nacini [data-nacin]').forEach(function (b) { var on = b.dataset.nacin === n; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    rfFiltri(); rfRisi(); rfPod();
    if (rfStranka() && RF.org && !RF.kosi) rfIzberiStranko(RF.org);
  }

  function rfRisi() {
    var t = $('rfTelo'); if (!t) return;
    rfFiltri();
    if (RF.rezultat) { rfRisiRezultat(t); return; }
    if (rfStranka() && !RF.org) { rfRisiStranke(t); return; }
    if (RF.nacin === 'kosi') { rfRisiKosi(t); return; }
    rfRisiSken(t);
  }

  // ── izbira stranke: iste kartice kot v Strankah (naslovnica, seznam/mreža), pod imenom število kosov s čipi ──
  function rfRisiStranke(t) {
    var q = (($('rfIsciStr') || {}).value || '').trim().toLowerCase();
    var list = q ? ORGSEZNAM.filter(function (o) { return (o.name + ' ' + (o.legal_name || '')).toLowerCase().indexOf(q) >= 0; }) : ORGSEZNAM.slice();
    list = razvrstiStranke(list, custOrderMode(), kgPoStrankiMesec());
    if (!list.length) { t.innerHTML = '<div class="rows"><div class="empty"><h3>' + (ORGSEZNAM.length ? 'Nič se ne ujema' : 'Ni strank') + '</h3></div></div>'; return; }
    var ps = RF.poStr;
    t.innerHTML = '<div class="rows rf-stranke">' + list.map(function (o) {
      var x = ps && ps[o.id], n = x ? x.aktivnih : 0, meta = ps ? (n ? sklonKosov(n) + ' s čipi' : 'Brez čipov') : '';
      return '<div class="lcell"><button class="row" type="button" data-rf-org="' + escape_(o.id) + '" style="' + naslovnica(null, o.id) + '">' +
        '<span><span class="row-name"><span class="row-nm">' + escape_(o.name) + '</span></span><br><span class="row-legal">' + escape_(lepNaziv(o.legal_name || o.name)) + '</span></span>' +
        '<span class="num">' + escape_(meta) + '</span><span class="chev" aria-hidden="true">›</span></button></div>';
    }).join('') + '</div>';
    t.querySelectorAll('[data-rf-org]').forEach(function (b) { b.addEventListener('click', function () { rfIzberiStranko(b.dataset.rfOrg); }); });
    if (!RF.poStrCas || Date.now() - RF.poStrCas > 60000) rfNaloziPoStrankah();
  }
  async function rfNaloziPoStrankah() {
    RF.poStrCas = Date.now();
    try {
      var r = await zRokom(sb.rpc('rfid_po_strankah'), 15000); if (r.error) return;
      var m = {}; (Array.isArray(r.data) ? r.data : []).forEach(function (x) { m[x.org] = x; }); RF.poStr = m;
      var t = $('rfTelo'); if (t && rfStranka() && !RF.org && !RF.rezultat) { rfRisiStranke(t); rfPod(); }
    } catch (e) {}
  }

  // ── skeniranje ──
  function rfRisiSken(t) {
    var oz = RF.nacin === 'oznaci', w = sme('cipi', 'w');
    var artSel = oz ? '<label class="ur-f rf-art"><span>Artikel</span><select id="rfArt"><option value="">Izberi artikel</option>' +
      RF.arts.map(function (a) { return '<option value="' + escape_(a.id) + '"' + (a.id === RF.art ? ' selected' : '') + '>' + escape_(a.name) + '</option>'; }).join('') + '</select></label>' : '';
    t.innerHTML = '<div class="uc-card rf-sken">' + artSel +
      '<div class="rf-stevec" aria-live="polite"><b id="rfN">0</b><span id="rfNlab"></span></div>' +
      '<input type="text" id="rfVnos" class="sc-modal-input rf-vnos" placeholder="Skeniraj čip" aria-label="Skeniraj čip" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" enterkeyhint="enter"></div>' +
      '<div class="rf-rez" id="rfRez"></div>' + (w ? '<div class="u-acts rf-akc" id="rfAkc"></div>' : '');
    var as = $('rfArt'); if (as) as.addEventListener('change', function () { RF.art = as.value; RF.vkl = { prest: false, drugje: false }; rfOsvezi(); rfFokus(); });
    rfVhod($('rfVnos'), rfDodaj);
    rfOsvezi();
    rfFokus();
  }
  // Čitalec kot tipkovnica: EPC in Enter (ali Tab, presledek). Prilepljen seznam razdeli. Brez končnega znaka
  // sprejme polno številko (24+ znakov) po kratkem premoru.
  function rfVhod(inp, ob) {
    if (!inp) return;
    var t = null;
    function obdelaj(vse) {
      clearTimeout(t);
      var v = inp.value; if (!v) return;
      var deli = v.split(/[\s,;]+/), zadnji = /[\s,;]$/.test(v) || vse ? '' : deli.pop();
      deli.forEach(function (d) { var e = rfEpcVnos(d); if (e) ob(e); });
      inp.value = zadnji || '';
      if (zadnji) t = setTimeout(function () { var e = rfEpcVnos(inp.value); if (e) { inp.value = ''; ob(e); } }, 500);
    }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === 'Tab') { if (inp.value) { e.preventDefault(); obdelaj(true); } } });
    inp.addEventListener('input', function () { obdelaj(false); });
  }
  // Čitalec tipka, a polje ni v fokusu (npr. po dotiku seznama): znake preusmeri v polje.
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || !/^[0-9A-Fa-f]$/.test(e.key)) return;
    var sec = $('sec-cipi'), inp = $('rfVnos'); if (!sec || sec.classList.contains('hidden') || !inp) return;
    var a = document.activeElement, tip = a && a.tagName;
    if (a === inp || tip === 'INPUT' || tip === 'TEXTAREA' || (a && a.isContentEditable)) return;
    if (tip === 'SELECT' && !sec.contains(a)) return;   // seznam v Čipih (stranka, artikel): znaki gredo v polje, ne v izbiro
    if (_okno || document.querySelector('.sc-modal-back')) return;
    inp.focus({ preventScroll: true });
  }, true);

  var _rfRaf = 0;
  function rfDodaj(epc) {
    if (RF.nacin === 'kosi') {
      var k = (RF.kosi || []).filter(function (x) { return x.epc === epc; })[0];
      var star = document.querySelector('.rf-kos-modal [data-zapri]'); if (star) star.click();   // eno okno naenkrat (zapre se pravilno)
      if (k) rfKosOdpri(k); else toast('Čip ' + rfKratko(epc) + ' ni označen pri tej stranki.'); return;
    }
    if (RF.skenSet[epc]) return;
    if (!RF.potrjujem) RF.kljuc = null;   // drugačno skeniranje = nov ključ potrditve; med klicem ostane (ponovitev po izpadu ne sme dobiti novega)
    RF.skenSet[epc] = 1; RF.sken.push(epc); delete RF.vprasan[epc]; rfShrani();   // podatek iz prejšnjega skeniranja je lahko star
    try { haptika(); } catch (e) {}
    if (!_rfRaf) _rfRaf = requestAnimationFrame(function () { _rfRaf = 0; rfOsvezi(); });
    rfIsci();
  }
  // razvrstitev skeniranih: znani po strankah, neoznačeni, pri več strankah (ne štejejo)
  function rfRazvrsti() {
    var str = {}, nezn = [], dvo = [], cakam = 0, znanih = 0, izl = {};
    RF.sken.forEach(function (e) {
      if (!rfZnan(e)) { cakam++; return; }
      if (rfIzlocen(e)) { var o = rfZivi(e)[0].org_id; izl[o] = (izl[o] || 0) + 1; return; }
      var vsi = rfZivi(e);
      if (!vsi.length) { nezn.push(e); return; }
      var orgi = {}; vsi.forEach(function (k) { orgi[k.org_id] = 1; });
      if (Object.keys(orgi).length > 1) { dvo.push(e); return; }
      var k = vsi[0], g = str[k.org_id] || (str[k.org_id] = { org: k.org_id, ime: ORGIME[k.org_id] || 'Stranka', n: 0, art: {}, ze: 0, zeCas: '' });
      g.n++; g.art[k.naziv] = (g.art[k.naziv] || 0) + 1; znanih++;
      if (rfZeOddan(k)) { g.ze++; if (String(k.zadnjic) > g.zeCas) g.zeCas = String(k.zadnjic); }
    });
    var seznam = Object.keys(str).map(function (o) { return str[o]; }).sort(function (a, b) { return a.ime.localeCompare(b.ime, 'sl'); });
    return { stranke: seznam, nezn: nezn, dvo: dvo, cakam: cakam, znanih: znanih, izl: izl };
  }
  // med klicem: zavihki in izbira stranke/artikla zaklenjeni (tudi na zaslonu z ustvarjenimi listi)
  function rfZaklep() {
    var zaseden = RF.potrjujem || RF.oznacujem;
    document.querySelectorAll('.rf-nacini [data-nacin]').forEach(function (b) { b.disabled = zaseden; });
    ['rfOrg', 'rfArt'].forEach(function (id) { var s = $(id); if (s) s.disabled = zaseden; });
  }
  function rfOsvezi() {
    rfZaklep();
    var rez = $('rfRez'), nEl = $('rfN'), lab = $('rfNlab'); if (!rez || !nEl) return;
    var akc = $('rfAkc'), w = sme('cipi', 'w'), vrst = [], zaseden = RF.potrjujem || RF.oznacujem, dis = zaseden ? ' disabled' : '';
    var vr = function (ime, n, razred, opis, gumb) {
      return '<div class="rf-vr' + (razred ? ' ' + razred : '') + '"><span class="rf-vr-t"><span class="rf-vr-ime">' + escape_(ime) + '</span>' + (opis ? '<span class="rf-vr-op">' + escape_(opis) + '</span>' : '') + '</span>' +
        (gumb || '') + '<b>' + stevilo(n) + '</b></div>';
    };
    var pocisti = '<button type="button" data-rf="pocisti"' + (RF.sken.length && !zaseden ? '' : ' disabled') + '>Počisti</button>';
    if (RF.nacin === 'oznaci') {
      if (!RF.org) return;
      var novi = 0, enaki = 0, prest = {}, znova = 0, drugje = {}, cilj = (RF.arts.filter(function (x) { return x.id === RF.art; })[0] || {}).name || 'izbrani artikel';
      RF.sken.forEach(function (e) {
        if (!rfZnan(e)) return;
        var vsi = RF.idx[e] || [], moj = vsi.filter(function (k) { return k.org_id === RF.org; })[0], tuj = false;
        rfZivi(e).forEach(function (k) { if (k.org_id !== RF.org) { tuj = true; var s2 = ORGIME[k.org_id]; drugje[s2] = (drugje[s2] || 0) + 1; } });
        if (!moj) { if (!tuj) novi++; }
        else if (RF.art && moj.article_id === RF.art) { if (moj.stanje !== 'aktiven') znova++; else enaki++; }
        else { var i = rfArtIme(moj); prest[i] = (prest[i] || 0) + 1; }
      });
      var n = rfZaOznaciti().length, ta = ORGIME[RF.org] || 'izbrana stranka', cakaO = RF.sken.some(function (e) { return !rfZnan(e); });
      var vklGumb = function (k) { var on = RF.vkl[k]; return '<button type="button" class="cgrp-btn ghost' + (on ? ' on' : '') + '" data-rf="vkl-' + k + '" aria-pressed="' + on + '"' + dis + '>' + (on ? 'Vključeno' : (k === 'drugje' ? 'Preseli' : 'Prestavi')) + '</button>'; };
      nEl.textContent = stevilo(n); lab.textContent = 'za označiti';
      if (novi) vrst.push(vr('Novi čipi', novi));
      if (znova) vrst.push(vr('Znova v uporabi', znova, '', 'odpisani ali izgubljeni'));
      Object.keys(prest).forEach(function (i, ix) { vrst.push(vr('Drug artikel', prest[i], RF.vkl.prest ? '' : 'opoz', i + ' → ' + cilj, ix || !w ? '' : vklGumb('prest'))); });
      Object.keys(drugje).forEach(function (s2, ix) { vrst.push(vr('Pri drugi stranki', drugje[s2], RF.vkl.drugje ? '' : 'opoz', s2 + ' → ' + ta, ix || !w ? '' : vklGumb('drugje'))); });
      if (enaki) vrst.push(vr('Že označeni', enaki, 'tiho'));
      if (akc) akc.innerHTML = pocisti + '<button type="button" class="ur-save' + (RF.oznacujem ? ' nalaga' : '') + '" data-rf="oznaci"' + (n && RF.art && !cakaO && !RF.oznacujem ? '' : ' disabled') + '>' + (n ? 'Označi ' + sklonKosov(n) : 'Označi') + '</button>';
    } else {
      var r = rfRazvrsti(), odd = RF.nacin === 'oddaja', zn = r.znanih % 100;
      nEl.textContent = stevilo(r.znanih);
      lab.textContent = (zn === 1 ? 'kos' : zn === 2 ? 'kosa' : (zn === 3 || zn === 4) ? 'kosi' : 'kosov') + (r.stranke.length > 1 ? ' · ' + r.stranke.length + ' stranke' : '');
      r.stranke.forEach(function (g) {
        var arti = Object.keys(g.art).sort(function (a, b) { return g.art[b] - g.art[a] || a.localeCompare(b, 'sl'); });
        var ze = odd && g.ze ? '<div class="rf-str-ze">' + escape_(rfZeBesedilo(g)) + '</div>' : '';
        vrst.push('<div class="rf-str' + (ze ? ' opoz' : '') + '"><div class="rf-str-h"><span>' + escape_(g.ime) + '</span>' + (w ? '<button type="button" class="cgrp-btn ghost" data-rf="odstrani" data-org="' + escape_(g.org) + '"' + dis + '>Odstrani</button>' : '') + '<b>' + stevilo(g.n) + '</b></div>' + ze +
          arti.map(function (i) { return '<div class="rf-str-a"><span>' + escape_(i) + '</span><span>' + stevilo(g.art[i]) + '</span></div>'; }).join('') + '</div>');
      });
      if (r.nezn.length) vrst.push(vr('Neoznačeni', r.nezn.length, 'opoz', '', w ? '<button type="button" class="cgrp-btn ghost" data-rf="v-oznaci"' + dis + '>Označi</button>' : ''));
      if (r.dvo.length) vrst.push(vr('Čip pri več strankah', r.dvo.length, 'opoz'));
      Object.keys(r.izl).forEach(function (o) { vrst.push(vr(ORGIME[o] || 'Stranka', r.izl[o], 'tiho', 'izločeno', w ? '<button type="button" class="cgrp-btn ghost" data-rf="vrni" data-org="' + escape_(o) + '"' + dis + '>Vrni</button>' : '')); });
      var ns = r.stranke.length;
      if (akc) akc.innerHTML = pocisti + '<button type="button" class="ur-save' + (RF.potrjujem ? ' nalaga' : '') + '" data-rf="potrdi"' + (r.znanih && !r.cakam && !RF.potrjujem ? '' : ' disabled') + '>' +
        (odd ? (ns > 1 ? 'Potrdi<span class="rf-akc-dod"> · ' + rfListov(ns) + '</span>' : 'Potrdi oddajo') : 'Potrdi prevzem') + '</button>';
    }
    rez.innerHTML = vrst.join('');
    [akc, rez].forEach(function (host) { if (host) host.querySelectorAll('[data-rf]').forEach(function (b) { b.addEventListener('click', function () { rfAkcija(b.dataset.rf, b); }); }); });
  }
  function rfPocisti() { RF.sken = []; RF.skenSet = {}; RF.kljuc = null; RF.izlocene = {}; RF.vkl = { prest: false, drugje: false }; rfShrani(); rfOsvezi(); }
  function rfVrni(epci) { epci.forEach(function (e) { if (!RF.skenSet[e]) { RF.skenSet[e] = 1; RF.sken.push(e); } }); }
  // po uspehu odstrani skeniranje, kot je bilo ob klicu (čipi, prebrani med klicem, ostanejo)
  function rfOdstraniPoslane(posnetek) {
    var m = {}; posnetek.forEach(function (e) { m[e] = 1; });
    rfPozabi(posnetek, true);
    RF.sken = RF.sken.filter(function (e) { return !m[e]; }); RF.skenSet = {}; RF.sken.forEach(function (e) { RF.skenSet[e] = 1; });
    RF.kljuc = null; RF.izlocene = {}; RF.vkl = { prest: false, drugje: false };   // izločitev in vklop veljata le za to potrditev (sicer bi naslednji voziček te stranke tiho izpustil)
    rfShrani();
  }
  // Označi: novi, znova v uporabi; drug artikel in tuji kosi le, ko jih oseba izrecno vključi
  function rfZaOznaciti() {
    return RF.sken.filter(function (e) {
      if (!rfZnan(e)) return false;
      var vsi = RF.idx[e] || [], moj = vsi.filter(function (k) { return k.org_id === RF.org; })[0];
      var tuji = rfZivi(e).some(function (k) { return k.org_id !== RF.org; });
      if (tuji && !RF.vkl.drugje) return false;
      if (moj && moj.article_id !== RF.art && !RF.vkl.prest) return false;   // drug artikel (tudi odpisan ali izgubljen kos) le s »Prestavi«
      return !moj || moj.article_id !== RF.art || moj.stanje !== 'aktiven' || tuji;
    });
  }
  async function rfAkcija(a, gumb) {
    if (a === 'pocisti') {
      var prej = RF.sken.slice(), kl = RF.kljuc, izl = RF.izlocene; rfPocisti();
      toast('Počiščeno', { besedilo: 'Razveljavi', ob: function () { if (RF.potrjujem || RF.oznacujem) return; rfVrni(prej); RF.kljuc = kl; RF.izlocene = izl; rfShrani(); rfOsvezi(); } });
      return;
    }
    if (a === 'v-oznaci') {   // neoznačeni so najverjetneje iz istega vozička: ista stranka
      if (RF.potrjujem || RF.oznacujem) return;
      var rr = rfRazvrsti();
      if (rr.stranke.length === 1 && rr.stranke[0].org !== RF.org) {
        RF.org = rr.stranke[0].org; RF.kosi = null; RF.art = ''; try { localStorage.setItem('sc-rfid-org', RF.org); } catch (e) {}
        var so = $('rfOrg'); if (so) { so.value = RF.org; var ev = new Event('change'); ev.rfTiho = true; so.dispatchEvent(ev); }   // napis seznama strank (nalaganje sproži rfNacin)
      }
      rfNacin('oznaci'); return;
    }
    if (a === 'vrni') { delete RF.izlocene[gumb.dataset.org]; RF.kljuc = null; rfShrani(); rfOsvezi(); return; }
    if (a === 'vkl-prest' || a === 'vkl-drugje') { var kk = a.slice(4); RF.vkl[kk] = !RF.vkl[kk]; rfOsvezi(); return; }
    if (a === 'odstrani') {   // čipi sosednjega vozička (čitalec bere nekaj metrov daleč): stranka ostane izločena
      var org = gumb.dataset.org;
      RF.izlocene[org] = 1; RF.kljuc = null; rfShrani(); rfOsvezi();
      toast((ORGIME[org] || 'Stranka') + ' odstranjena', { besedilo: 'Razveljavi', ob: function () { if (RF.potrjujem || RF.oznacujem) return; delete RF.izlocene[org]; RF.kljuc = null; rfShrani(); rfOsvezi(); } });
      return;
    }
    if (!sme('cipi', 'w')) return;
    if (a === 'potrdi') { rfPotrdi(); return; }
    if (a === 'oznaci') {
      if (RF.oznacujem || RF.potrjujem) return;
      toastSkrij();
      var prej = rfZaOznaciti().slice().sort().join();   // prikazani nabor (ne le število na gumbu)
      RF.oznacujem = true; rfOsvezi();
      try {
        rfPozabi(RF.sken);   // vsi čipi znova, ne le nevprašani
        try { await rfIsci(true); } catch (e) { rfIsciNapaka(e, true); return; }   // pošlje se točno to, kar je prikazano
        var org2 = RF.org, epcs = rfZaOznaciti(), posnetek = RF.sken.slice();
        if (!org2 || !RF.art || !epcs.length) return;
        if (epcs.slice().sort().join() !== prej) { toast('Stanje čipov se je vmes spremenilo'); return; }   // prikaz se osveži; oseba potrdi znova
        var r = await zRokom(sb.rpc('rfid_oznaci', { p_org: org2, p_article: RF.art, p_epcs: epcs, p_preseli: !!RF.vkl.drugje }));
        if (r.error) throw r.error;
        var d = r.data || {}, n = (d.novih || 0) + (d.prestavljenih || 0) + (d.preseljenih || 0), art = (RF.arts.filter(function (x) { return x.id === RF.art; })[0] || {}).name || '';
        var drugje = Array.isArray(d.drugje) ? d.drugje : [], dm = {}; drugje.forEach(function (e) { dm[e] = 1; });
        logDodaj('Čipi', 'Označeno', (ORGIME[org2] || '') + ' · ' + art + ' · ' + sklonKosov(n) + (d.preseljenih ? ' · ' + d.preseljenih + ' od druge stranke' : '') + (d.odpisanih ? ' · ' + d.odpisanih + ' odpisanih drugje' : ''));
        rfOdstraniPoslane(posnetek.filter(function (e) { return !dm[e]; }));   // tisti, ki jih je medtem označila druga naprava, ostanejo
        if (drugje.length) { rfPozabi(drugje); var pp = rfIsci(true); if (pp && pp.catch) pp.catch(rfIsciNapaka); }
        RF.poStrCas = 0;   // števila v mreži strank
        RF.oznacujem = false; rfOsvezi();   // sporočilo šele po izrisu (stoji nad vrstico z gumbi)
        toast((n ? 'Označeno: ' + sklonKosov(n) + (art ? ' · ' + art : '') : 'Označeno') + (d.preseljenih ? ' · ' + stevilo(d.preseljenih) + ' od druge stranke' : '') +
          (drugje.length ? ' · ' + stevilo(drugje.length) + ' pri drugi stranki' : ''));
        if (org2 === RF.org) rfNalozi(org2).then(function () { if (org2 === RF.org) rfPod(); }, function () {});   // v ozadju; polje za skeniranje ostane (čitalec morda ravno tipka)
      } catch (e) { toast(napakaBesedilo(e)); }
      finally { RF.oznacujem = false; rfOsvezi(); }
    }
  }
  // okno s seznamom (potrditev, že oddano). Enter ne potrdi: čitalec kot tipkovnica konča vsak čip z Enter.
  function rfOkno(o) {
    return new Promise(function (resolve) {
      var back = document.createElement('div'); back.className = 'sc-modal-back';
      back.innerHTML = '<div class="sc-modal rf-okno-p" role="dialog" aria-modal="true"><h4></h4><div class="rf-pv"></div><div class="sc-modal-acts"></div></div>';
      back.querySelector('h4').textContent = o.naslov || '';
      back.querySelector('.rf-pv').innerHTML = (o.vrstice || []).map(function (v) {
        return '<div class="rf-pv-v' + (v.cls ? ' ' + v.cls : '') + '"><span class="rf-pv-t"><span class="rf-pv-ime">' + escape_(v.ime) + '</span>' + (v.opis ? '<span class="rf-pv-op">' + escape_(v.opis) + '</span>' : '') + '</span><b>' + stevilo(v.n) + '</b></div>';
      }).join('');
      var akc = back.querySelector('.sc-modal-acts'), gumbi = o.gumbi || [], prvi = gumbi.length ? gumbi[0].v : false;
      gumbi.forEach(function (g) { var b = document.createElement('button'); b.type = 'button'; b.className = 'sc-modal-btn ' + (g.glavni ? 'primary' : 'ghost'); b.textContent = g.t; b.addEventListener('click', function () { zapri(g.v); }); akc.appendChild(b); });
      document.body.appendChild(back); _modalA11y(back);
      requestAnimationFrame(function () { back.classList.add('show'); });
      var done = false, t0 = Date.now();
      function zapri(v) { if (done) return; done = true; back.classList.remove('show'); document.removeEventListener('keydown', tipka, true); setTimeout(function () { back.remove(); }, 180); _modalVrniFokus(); resolve(v); }
      function tipka(e) { if (e.key === 'Escape') { e.stopPropagation(); zapri(prvi); } else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); } }
      back.addEventListener('click', function (e) { if (Date.now() - t0 < 350) { e.stopPropagation(); return; } if (e.target === back) zapri(prvi); }, true);   // drugi dotik dvojnega pritiska na Potrdi
      document.addEventListener('keydown', tipka, true);
    });
  }
  // Potrdi: pregled po strankah → baza zabeleži in pri oddaji ustvari spremne liste
  async function rfPotrdi() {
    if (RF.potrjujem || RF.oznacujem) return;   // drugi dotik, osvežitev ali živi tok med klicem: en sam
    toastSkrij();   // »Razveljavi« ne sme ostati nad oknom
    RF.potrjujem = true; rfOsvezi();
    try {
      rfPozabi(RF.sken);   // vsi čipi znova (vmes označeni pri drugi stranki, izbrisana stranka …); prikaz ostane do novih podatkov
      try { await rfIsci(true); } catch (e) { rfIsciNapaka(e, true); return; }
      var r = rfRazvrsti(), odd = RF.nacin === 'oddaja'; if (!r.znanih) return;
      // izbor = točno to, kar okno pokaže; čipi, prebrani pozneje, gredo v naslednje skeniranje
      var izbor = { posnetek: RF.sken.slice(), epcs: rfZaPoslati() };
      var vrst = r.stranke.map(function (g) { var z = odd && g.ze; return { ime: g.ime, n: g.n, opis: z ? rfZeBesedilo(g) : '', cls: z ? 'opoz' : '' }; });
      if (r.nezn.length + r.dvo.length) vrst.push({ ime: 'Ne šteje se', n: r.nezn.length + r.dvo.length, cls: 'tiho',
        opis: [r.nezn.length ? stevilo(r.nezn.length) + ' neoznačenih' : '', r.dvo.length ? stevilo(r.dvo.length) + ' pri več strankah' : ''].filter(Boolean).join(' · ') });
      var ok = await rfOkno({ naslov: odd ? 'Ustvari ' + rfListovToz(r.stranke.length) : 'Zabeleži prevzem', vrstice: vrst,
        gumbi: [{ t: 'Nazaj', v: false }, { t: odd ? 'Ustvari' : 'Zabeleži', v: true, glavni: true }] });
      if (ok) await rfPotrdiIzvedi(true, 0, izbor);
    } finally { RF.potrjujem = false; rfOsvezi(); }
  }
  async function rfPotrdiIzvedi(preveri, poskus, izbor) {
    var odd = RF.nacin === 'oddaja', d = null, napaka = null, posnetek = izbor.posnetek, epcs = izbor.epcs;
    if (!epcs.length) return;
    if (!RF.kljuc) { RF.kljuc = rfKljuc(); rfShrani(); }   // shranjen PRED klicem: ponovitev po izpadu ga uporabi znova
    try {
      var x = await zRokom(sb.rpc('rfid_potrdi', { p_tip: odd ? 'oddaja' : 'prevzem', p_epcs: epcs, p_kljuc: RF.kljuc, p_izdal: JAZIME || null, p_preveri: !!preveri }));
      if (x.error) throw x.error;
      d = x.data || {};
    } catch (e) { napaka = e; }   // ključ ostane: ponovna potrditev ne ustvari dvojnih listov
    if (napaka) {
      if (/kljuc_porabljen/.test(String(napaka.message || '')) && !poskus) { RF.kljuc = rfKljuc(); rfShrani(); return rfPotrdiIzvedi(true, 1, izbor); }
      toast(napakaBesedilo(napaka)); return;
    }
    if (Array.isArray(d.ze_oddano) && d.ze_oddano.length) { await rfZeOddano(d.ze_oddano, izbor); return; }
    if (!(odd ? (d.listi || []).length : (d.kosov || 0))) {   // strežnik ni ustvaril ničesar (stranka vmes izbrisana, čip pri več strankah …): skeniranje ostane
      toast('Nič ni bilo zabeleženo: stanje čipov se je vmes spremenilo'); RF.kljuc = null; rfShrani();
      rfPozabi(RF.sken); var pz = rfIsci(true); if (pz && pz.catch) pz.catch(rfIsciNapaka); return;
    }
    var listi = d.listi || [];
    logDodaj('Čipi', odd ? 'Oddaja' : 'Prevzem', listi.map(function (l) { return (ORGIME[l.org] || '') + ' ' + sklonKosov(l.kosov) + (l.stevilka ? ' · ' + l.stevilka : ''); }).join(', '));
    rfOdstraniPoslane(posnetek); RF.kosi = null;
    if (odd) { RF.rezultat = { listi: listi, nalaganje: naloziListe().catch(function () {}) }; rfRisi(); }
    else { toast('Prevzem zabeležen: ' + sklonKosov(d.kosov || 0)); rfOsvezi(); }
  }
  // šteje kose po strankah le v izboru (ne v vsem, kar je bilo prebrano pozneje)
  function rfStejIzbor(epcs) {
    var po = {}, n = 0;
    epcs.forEach(function (e) { var v = rfZivi(e), orgi = {}; v.forEach(function (k) { orgi[k.org_id] = 1; }); if (Object.keys(orgi).length !== 1) return; po[v[0].org_id] = (po[v[0].org_id] || 0) + 1; n++; });
    return { po: po, n: n };
  }
  // baza: del kosov je bil v zadnjih 12 urah že oddan (isti ali sosednji voziček, druga naprava)
  async function rfZeOddano(ze, izbor) {
    var ven = {}; ze.forEach(function (z) { (z.epc || []).forEach(function (e) { ven[e] = 1; }); });
    var ostali = izbor.epcs.filter(function (e) { return !ven[e]; });
    var ostane = rfStejIzbor(ostali).n, vsehStr = rfStejIzbor(izbor.epcs).po;
    var izb = await rfOkno({ naslov: 'Že oddano', vrstice: ze.map(function (z) {
        var vseh = vsehStr[z.org] || 0;
        return { ime: z.ime || ORGIME[z.org] || 'Stranka', n: z.kosov, cls: 'opoz',
          opis: [vseh > z.kosov ? stevilo(z.kosov) + ' od ' + stevilo(vseh) : '', (z.listi || []).map(function (l) { return l.stevilka; }).filter(Boolean).join(', '), rfUra(z.cas)].filter(Boolean).join(' · ') };
      }),
      gumbi: [{ t: 'Nazaj', v: 0 }, { t: 'Vseeno ustvari', v: 2 }, { t: ostane ? 'Izloči in ustvari' : 'Izloči', v: 1, glavni: true }] });
    if (izb === 2) { await rfPotrdiIzvedi(false, 0, izbor); return; }
    if (izb !== 1) return;
    RF.kljuc = null; rfShrani();   // druga vsebina = nov ključ
    if (ostane) { await rfPotrdiIzvedi(true, 0, { posnetek: izbor.posnetek, epcs: ostali }); return; }
    var listi = [];
    ze.forEach(function (z) { (z.listi || []).forEach(function (l) { listi.push({ org: z.org, note: l.note, stevilka: l.stevilka, kosov: (z.listi || []).length === 1 ? z.kosov : null }); }); });
    rfOdstraniPoslane(izbor.posnetek);   // čipi, prebrani med klicem, ostanejo
    RF.rezultat = { listi: listi, ze: true }; rfRisi();
  }
  var IKO_RF_KLJUKA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var IKO_RF_ZE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 7v6M12 17h.01"/></svg>';
  var _rfArhivTok = 0;
  function rfRisiRezultat(t) {
    var listi = RF.rezultat.listi, ze = !!RF.rezultat.ze;
    var naslov = ze ? 'Že oddano' : listi.length === 1 ? 'Spremni list ustvarjen' : 'Ustvarjeni spremni listi';
    t.innerHTML = '<div class="uc-card rf-rezultat' + (ze ? ' ze' : '') + '"><div class="rf-uspeh"><span class="rf-uspeh-i" aria-hidden="true">' + (ze ? IKO_RF_ZE : IKO_RF_KLJUKA) + '</span><h3 class="sec-h">' + naslov + '</h3></div>' +
      '<div class="rf-listi">' + listi.map(function (l) { return '<div class="rf-list"><b>' + escape_(l.stevilka || '') + '</b><span>' + escape_(ORGIME[l.org] || '') + '</span><span class="u-sub">' + (l.kosov != null ? sklonKosov(l.kosov) : '') + '</span></div>'; }).join('') + '</div>' +
      '<div class="rf-rez-akc"><button type="button" class="ur-save" data-rf-tisk>' + IKO_TISK + 'Natisni</button><button type="button" data-rf-arhiv>Spremni listi</button><button type="button" data-rf-nova>Novo skeniranje</button></div></div>';
    t.querySelector('[data-rf-nova]').addEventListener('click', function () { _rfArhivTok++; RF.rezultat = null; rfRisi(); });   // rfRisiSken sam postavi fokus
    t.querySelector('[data-rf-arhiv]').addEventListener('click', function () {   // počaka na sveže liste; če oseba vmes odide drugam, ne preskoči
      var g = this, tk = ++_rfArhivTok, p = RF.rezultat && RF.rezultat.nalaganje;
      g.disabled = true; g.classList.add('nalaga');
      Promise.resolve(p).then(function () { if (tk !== _rfArhivTok || $('sec-cipi').classList.contains('hidden')) return; RF.rezultat = null; pojdi('arhiv'); });
    });
    t.querySelector('[data-rf-tisk]').addEventListener('click', function () { rfNatisni(listi.map(function (l) { return l.note; }).filter(Boolean), this); });
  }
  async function rfNatisni(ids, gumb) {
    if (!ids.length) return;
    gumb.disabled = true; gumb.classList.add('nalaga');
    try {
      if (ids.some(function (id) { return !LISTI.some(function (l) { return l.id === id; }); })) await naloziListe();
      var stK = function (l) { var d = String(l.number || '').split('/'); return (parseInt(d[1], 10) || 0) * 1e7 + (parseInt(d[0], 10) || 0); };
      var listi = LISTI.filter(function (l) { return ids.indexOf(l.id) >= 0; }).sort(function (a, b) { return stK(a) - stK(b); });
      if (!listi.length) { toast('Spremnih listov ni bilo mogoče naložiti.'); return; }
      await arhPostavke(listi.map(function (l) { return l.id; }));
      var boxi = listi.map(function (l) { return { _note: l, _items: _POST_CACHE[l.id] || [] }; });
      var en = boxi.length === 1, naslov = en ? 'Spremni list ' + (listi[0].number || '') : sklonListov(boxi.length);
      predogledDokument({ naslov: naslov, docHtml: dokHtml(en ? naslov : 'Spremni listi', boxi.map(spremniTeloHtml)), pdf: function () { return spremniPdfDownload(boxi); } });
    } catch (e) { toast(napakaBesedilo(e)); }
    finally { gumb.disabled = false; gumb.classList.remove('nalaga'); }
  }

  // ── kosi stranke: po artiklih, pogrešani, zgodovina ──
  function rfSkupine() {
    var akt = RF.kosi.filter(function (k) { return k.stanje === 'aktiven'; }), poArt = {};
    akt.forEach(function (k) {
      var i = rfArtIme(k), kl = (k.article_id || '') + '|' + i;
      var g = poArt[kl] || (poArt[kl] = { ime: i, kosi: [], pranj: 0, pog: 0 });
      g.kosi.push(k); g.pranj += k.pranj || 0; if (rfPogresan(k)) g.pog++;
    });
    return { akt: akt, poArt: poArt,
      pog: akt.filter(function (k) { return rfPogresan(k); }),
      izg: RF.kosi.filter(function (k) { return k.stanje === 'izgubljen'; }),
      odp: RF.kosi.filter(function (k) { return k.stanje === 'odpisan'; }) };
  }
  function rfRisiKosi(t) {
    if (!RF.kosi) { t.innerHTML = ''; return; }
    var s = rfSkupine(), sk = Object.keys(s.poArt).map(function (x) { return s.poArt[x]; }).sort(function (a, b) { return b.kosi.length - a.kosi.length || a.ime.localeCompare(b.ime, 'sl'); });
    var povp = s.akt.length ? Math.round(s.akt.reduce(function (x, k) { return x + (k.pranj || 0); }, 0) / s.akt.length) : 0;
    var vrstica = function (kljuc, ime, n, meta, razred) {
      return '<button type="button" class="rf-tv' + (razred ? ' ' + razred : '') + '" data-sk="' + escape_(kljuc) + '"><span class="rf-tv-ime">' + escape_(ime) + '</span><span class="rf-tv-meta">' + escape_(meta) + '</span><b>' + stevilo(n) + '</b><span class="chev" aria-hidden="true">›</span></button>';
    };
    var html = '<input type="text" id="rfVnos" class="sc-modal-input rf-vnos rf-isci" placeholder="Skeniraj čip" aria-label="Poišči kos s čipom" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false">';
    if (!RF.kosi.length) html += '<div class="rows"><div class="empty"><h3>Brez označenega perila</h3></div></div>';
    else {
      html += '<div class="rf-povz"><div class="stat"><div class="stat-num">' + stevilo(s.akt.length) + '</div><div class="stat-lab">Kosov</div></div>' +
        '<div class="stat"><div class="stat-num">' + stevilo(povp) + '</div><div class="stat-lab">Pranj na kos</div></div>' +
        '<div class="stat"><div class="stat-num' + (s.pog.length ? ' rf-st-opoz' : '') + '">' + stevilo(s.pog.length) + '</div><div class="stat-lab">Pogrešani</div></div></div>';
      html += '<div class="rf-tab">';
      if (s.pog.length) html += vrstica('pog', 'Pogrešani', s.pog.length, '', 'opoz');
      sk.forEach(function (g, i) { html += vrstica('a' + i, g.ime, g.kosi.length, 'povprečno ' + stevilo(Math.round(g.pranj / g.kosi.length)) + ' pranj' + (g.pog ? ' · pogrešani ' + g.pog : '')); });
      if (s.izg.length) html += vrstica('izg', 'Izgubljeni', s.izg.length, '', 'tiho');
      if (s.odp.length) html += vrstica('odp', 'Odpisani', s.odp.length, '', 'tiho');
      html += '</div>';
    }
    t.innerHTML = html;
    rfVhod($('rfVnos'), rfDodaj);
    t.querySelectorAll('.rf-tv').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.dataset.sk, seznam, naslov;
        if (k === 'pog') { seznam = s.pog; naslov = 'Pogrešani'; }
        else if (k === 'izg') { seznam = s.izg; naslov = 'Izgubljeni'; }
        else if (k === 'odp') { seznam = s.odp; naslov = 'Odpisani'; }
        else { var g = sk[+k.slice(1)]; seznam = g.kosi; naslov = g.ime; }
        rfSeznamOdpri(b, naslov, seznam);
      });
    });
  }
  function rfSeznamOdpri(gumb, naslov, seznam) {
    var box = document.createElement('div'); box.className = 'rf-okno';
    var urejeni = seznam.slice().sort(function (a, b) { return String(b.zadnjic || '').localeCompare(String(a.zadnjic || '')); });
    box.innerHTML = '<div class="rf-kosi">' + urejeni.map(function (k) {
      var p = rfPogresan(k);
      return '<button type="button" class="rf-kos" data-id="' + escape_(k.id) + '"><span class="rf-kos-epc">' + escape_(rfKratko(k.epc)) + '</span>' +
        '<span class="rf-kos-kje' + (p ? ' opoz' : '') + '">' + escape_(p || rfKje(k)) + '</span><span class="rf-kos-pr">' + stevilo(k.pranj || 0) + ' pranj</span></button>';
    }).join('') + '</div>';
    oknoOdpri(gumb, box, function () { return document.querySelector('.rf-tv[data-sk="' + gumb.dataset.sk + '"]'); }, {
      glava: function () { var h = document.createElement('h3'); h.className = 'sec-h'; h.textContent = naslov + ' · ' + sklonKosov(seznam.length); return h; }
    });
    box.querySelectorAll('.rf-kos').forEach(function (b) { b.addEventListener('click', function () { var k = RF.kosi.filter(function (x) { return x.id === b.dataset.id; })[0]; if (k) rfKosOdpri(k); }); });
  }
  var RF_TIPI = { oznacevanje: 'Označen', prevzem: 'Prevzem', oddaja: 'Oddaja', oznacen: 'Prestavljen', stanje: 'Stanje' };
  async function rfKosOdpri(k) {
    var w = sme('cipi', 'w');
    var back = document.createElement('div'); back.className = 'sc-modal-back';
    back.innerHTML = '<div class="sc-modal rf-kos-modal" role="dialog" aria-modal="true"><h4>' + escape_(rfArtIme(k)) + '</h4>' +
      '<dl class="okno-dl"><dt>Čip</dt><dd class="rf-epc">' + escape_(k.epc) + '</dd><dt>Stranka</dt><dd>' + escape_(ORGIME[k.org_id || RF.org] || '') + '</dd>' +
      '<dt>Pranj</dt><dd>' + stevilo(k.pranj || 0) + '</dd><dt>Kje</dt><dd>' + escape_(rfPogresan(k) || rfKje(k)) + '</dd><dt>Označen</dt><dd>' + escape_(rfDatum(k.created_at)) + '</dd></dl>' +
      '<div class="rf-zgod"></div>' +
      '<div class="sc-modal-acts">' + (w ? (k.stanje !== 'aktiven' ? '<button type="button" class="sc-modal-btn ghost" data-st="aktiven">Spet v uporabi</button>' : '<button type="button" class="sc-modal-btn ghost" data-st="izgubljen">Izgubljen</button><button type="button" class="sc-modal-btn ghost" data-st="odpisan">Odpiši</button>') : '') +
      '<button type="button" class="sc-modal-btn primary" data-zapri>Zapri</button></div></div>';
    document.body.appendChild(back); _modalA11y(back); requestAnimationFrame(function () { back.classList.add('show'); });
    var done = false;
    function zapri() { if (done) return; done = true; back.classList.remove('show'); document.removeEventListener('keydown', onk, true); setTimeout(function () { back.remove(); }, 180); _modalVrniFokus(); }
    function onk(e) { if (e.key === 'Escape') { e.stopPropagation(); zapri(); } }
    document.addEventListener('keydown', onk, true);
    back.addEventListener('click', function (e) { if (e.target === back) zapri(); });
    back.querySelector('[data-zapri]').addEventListener('click', zapri);
    back.querySelectorAll('[data-st]').forEach(function (b) {
      b.addEventListener('click', async function () {
        b.disabled = true;
        var r = await sb.rpc('rfid_stanje', { p_kos: k.id, p_stanje: b.dataset.st });
        if (r.error) { toast(napakaBesedilo(r.error)); b.disabled = false; return; }
        logDodaj('Čipi', 'Stanje', (ORGIME[k.org_id || RF.org] || '') + ' · ' + rfArtIme(k) + ' ' + rfKratko(k.epc) + ' · ' + b.dataset.st);
        k.stanje = b.dataset.st; zapri(); if (_okno) oknoZapri(true); rfRisi(); rfPod();
      });
    });
    // zgodovina: skeniranja, ki vsebujejo kos (z morebitnim spremnim listom) + redki dogodki
    var rez = await Promise.all([
      sb.from('rfid_seje').select('tip,created_at,note_id').contains('kosi', [k.id]).order('created_at', { ascending: false }).limit(40),
      sb.from('rfid_dogodki').select('tip,opis,created_at').eq('kos_id', k.id).order('created_at', { ascending: false }).limit(40)
    ]);
    var host = back.querySelector('.rf-zgod'); if (!host || rez[0].error || rez[1].error) return;
    var vse = (rez[0].data || []).map(function (x) { var l = x.note_id && LISTI.filter(function (q) { return q.id === x.note_id; })[0]; return { tip: x.tip, opis: l ? 'spremni list ' + l.number : '', t: x.created_at }; })
      .concat((rez[1].data || []).map(function (x) { return { tip: x.tip, opis: x.opis || '', t: x.created_at }; }))
      .sort(function (a, b) { return String(b.t).localeCompare(String(a.t)); }).slice(0, 40);
    host.innerHTML = vse.map(function (d) {
      return '<div class="rf-zg"><span>' + escape_(RF_TIPI[d.tip] || d.tip) + (d.opis ? ' · ' + escape_(d.opis) : '') + '</span><span class="u-sub">' + escape_(datumcas(d.t)) + '</span></div>';
    }).join('');
  }

  // ── Stranke: perilo s čipi v oknu stranke ──
  async function rfStrankaBlok(el, orgId) {
    if (!el) return;
    if (!sme('cipi', 'r')) { el.remove(); return; }
    var r = await vseVrstice(function (a, b) { return sb.from('rfid_kosi').select('article_id,naziv,stanje,pranj,zadnji_tip,zadnjic').eq('org_id', orgId).range(a, b); });
    if (r.error || !(r.data || []).length) { el.remove(); return; }
    var akt = r.data.filter(function (k) { return k.stanje === 'aktiven'; }), po = {}, pog = 0;
    akt.forEach(function (k) { var g = po[k.naziv] || (po[k.naziv] = { n: 0, pr: 0 }); g.n++; g.pr += k.pranj || 0; if (rfPogresan(k)) pog++; });
    var imena = Object.keys(po).sort(function (a, b) { return po[b].n - po[a].n; });
    el.innerHTML = '<div class="str-rfid-h"><span class="sec-h">Perilo s čipi</span><span class="u-sub">' + sklonKosov(akt.length) + (pog ? ' · pogrešani ' + pog : '') + '</span></div>' +
      imena.map(function (i) { return '<div class="str-rfid-v"><span>' + escape_(i) + '</span><span class="u-sub">' + stevilo(po[i].n) + ' · povprečno ' + stevilo(Math.round(po[i].pr / po[i].n)) + ' pranj</span></div>'; }).join('') +
      '<p class="art-cenik-hint"><button type="button" class="art-to-cenik" data-rf-odpri>Odpri v Čipih ›</button></p>';
    el.querySelector('[data-rf-odpri]').addEventListener('click', function (e) {
      e.stopPropagation();
      try { localStorage.setItem('sc-rfid-nacin', 'kosi'); localStorage.setItem('sc-rfid-org', orgId); } catch (x) {}
      if (RF.org !== orgId) { RF.org = orgId; RF.kosi = null; RF.arts = []; RF.art = ''; }
      RF.nacin = 'kosi'; RF.rezultat = null;
      document.querySelectorAll('.rf-nacini [data-nacin]').forEach(function (b) { var on = b.dataset.nacin === 'kosi'; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      pojdi('cipi');
    });
  }

  /* ══════════ MOJ RAČUN ══════════ */
  /* ── Moj profil: prikaz avatarja + polj ── */
  // Slika je ozadje kroga; brskalnik je začel nalagati šele, ko se je Moj račun prikazal
  // (skritih ozadij ne nalaga) — krog je bil za trenutek prazen. Zato jo naložimo in
  // dekodiramo že ob prijavi; referenca ostane, da je brskalnik ne zavrže.
  var _avatarSlika = null;
  function prednaloziAvatar(url) {
    if (!url) return;
    try { var im = new Image(); im.decoding = 'async'; im.src = url; if (im.decode) im.decode().catch(function () {}); _avatarSlika = im; } catch (e) {}
  }
  function narisiProfAvatar() {
    var box = $('profAvatar'), del = $('profAvDel');
    if (!box) return;
    var url = MOJPROFIL && MOJPROFIL.avatar_url;
    if (url) {
      box.style.backgroundImage = 'url(' + encodeURI(url).replace(/"/g, '%22') + ')';
      box.classList.add('has-img'); box.classList.remove('av-ini');
      var ini = $('profAvInit'); if (ini) ini.style.display = 'none';
      if (del) del.style.display = '';
    } else {
      box.style.backgroundImage = '';
      box.classList.remove('has-img'); box.classList.add('av-ini');
      var ini2 = $('profAvInit'); if (ini2) { ini2.style.display = ''; ini2.textContent = zacetnice(JAZIME); }
      if (del) del.style.display = 'none';
    }
  }
  function napolniProfil() {
    var mi = $('mojeIme'); if (mi) mi.value = (JAZIME && JAZIME.indexOf('@') < 0) ? JAZIME : '';
    var t = $('mojTel'); if (t) t.value = (MOJPROFIL && MOJPROFIL.phone) || '';
    var k = $('mojKontaktMail'); if (k) k.value = (MOJPROFIL && MOJPROFIL.contact_email) || '';
    narisiProfAvatar();
  }

  { const _if = $('imeForm'); if (_if) _if.addEventListener('submit', async e => {
    e.preventDefault();
    const m = $('imeMsg'), btn = $('imeBtn');
    const ime = $('mojeIme').value.trim();
    const tel = ($('mojTel') ? $('mojTel').value.trim() : '');
    const kmail = ($('mojKontaktMail') ? $('mojKontaktMail').value.trim() : '');
    if (!ime) { m.className = 'msg bad show'; m.textContent = 'Vpiši prikazano ime.'; return; }
    if (kmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(kmail)) { m.className = 'msg bad show'; m.textContent = 'Kontaktni e-naslov ni veljaven.'; return; }
    btn.disabled = true; btn.textContent = 'Shranjujem …';
    const { error } = await sb.from('profiles').update({ full_name: ime, phone: tel || null, contact_email: kmail || null }).eq('id', JAZ);
    btn.disabled = false; btn.textContent = 'Shrani profil';
    if (error) { m.className = 'msg bad show'; m.textContent = napakaBesedilo(error); return; }
    JAZIME = ime;
    MOJPROFIL.full_name = ime; MOJPROFIL.phone = tel || null; MOJPROFIL.contact_email = kmail || null;
    nastaviWho(ime);
    narisiProfAvatar();   // začetnice sledijo imenu
    zapomniProfil({ email: JAZMAIL, name: ime, avatar: MOJPROFIL.avatar_url || '', uid: JAZ });
    if ($('domovNaslov') && !$('sec-domov').classList.contains('hidden')) $('domovNaslov').textContent = OSEBJE ? (pozdrav() + ', ' + prvoIme()) : $('domovNaslov').textContent;
    m.className = 'msg show'; m.textContent = 'Profil shranjen.';
  }); }

  /* ── Avatar: naloži / odstrani ── */
  { const _ab = $('profAvBtn'); if (_ab) _ab.addEventListener('click', function () { if ($('profAvFile')) $('profAvFile').click(); }); }
  { const _af = $('profAvFile'); if (_af) _af.addEventListener('change', async function () {
    var m = $('imeMsg');
    var f = this.files && this.files[0];
    if (!f) return;
    if (!/^image\//.test(f.type)) { m.className = 'msg bad show'; m.textContent = 'Izberi slikovno datoteko.'; this.value = ''; return; }
    if (f.size > 5 * 1024 * 1024) { m.className = 'msg bad show'; m.textContent = 'Slika je prevelika (največ 5 MB).'; this.value = ''; return; }
    m.className = 'msg show'; m.textContent = 'Nalagam sliko …';
    try {
      var blob = await pomanjsajSliko(f, 512).catch(function () { return f; });
      var ct = blob.type || 'image/jpeg';
      var ext = (ct === 'image/png') ? 'png' : 'jpg';
      var pot = JAZ + '/avatar.' + ext;
      var up = await sb.storage.from('avatars').upload(pot, blob, { upsert: true, contentType: ct, cacheControl: '3600' });
      if (up.error) throw up.error;
      var pub = sb.storage.from('avatars').getPublicUrl(pot);
      var url = (pub && pub.data && pub.data.publicUrl) + '?v=' + Date.now();
      var upd = await sb.from('profiles').update({ avatar_url: url }).eq('id', JAZ);
      if (upd.error) throw upd.error;
      MOJPROFIL.avatar_url = url;
      prednaloziAvatar(url);
      narisiProfAvatar();
      zapomniProfil({ email: JAZMAIL, name: JAZIME, avatar: url, uid: JAZ });
      m.className = 'msg show'; m.textContent = 'Slika shranjena.';
    } catch (err) {
      m.className = 'msg bad show'; m.textContent = 'Nalaganje ni uspelo: ' + (err && err.message ? err.message : err);
    }
    this.value = '';
  }); }
  { const _ad = $('profAvDel'); if (_ad) _ad.addEventListener('click', async function () {
    var m = $('imeMsg');
    m.className = 'msg show'; m.textContent = 'Odstranjujem …';
    try {
      try { await sb.storage.from('avatars').remove([JAZ + '/avatar.jpg', JAZ + '/avatar.png']); } catch (e) {}
      var upd = await sb.from('profiles').update({ avatar_url: null }).eq('id', JAZ);
      if (upd.error) throw upd.error;
      MOJPROFIL.avatar_url = null;
      narisiProfAvatar();
      zapomniProfil({ email: JAZMAIL, name: JAZIME, avatar: '', uid: JAZ });
      m.className = 'msg show'; m.textContent = 'Slika odstranjena.';
    } catch (err) {
      m.className = 'msg bad show'; m.textContent = 'Ni uspelo: ' + (err && err.message ? err.message : err);
    }
  }); }

  /* Pomanjša in stisne sliko v kvadrat (za manjše datoteke in hitrejši prikaz). */
  function pomanjsajSliko(file, rob) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        try {
          var s = Math.min(img.width, img.height);
          var sx = (img.width - s) / 2, sy = (img.height - s) / 2;
          var c = document.createElement('canvas');
          c.width = c.height = rob;
          var ctx = c.getContext('2d');
          ctx.drawImage(img, sx, sy, s, s, 0, 0, rob, rob);
          URL.revokeObjectURL(url);
          c.toBlob(function (b) { b ? resolve(b) : reject(new Error('canvas')); }, 'image/jpeg', 0.85);
        } catch (e) { reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('slika')); };
      img.src = url;
    });
  }

  $('changePwForm').addEventListener('submit', async e => {
    e.preventDefault();
    const m = $('pwMsg'),
      btn = $('chPwBtn');
    const cur = $('curPw').value,
      p1 = $('chPw1').value,
      p2 = $('chPw2').value;
    if (p1 !== p2) {
      m.className = 'msg bad show';
      m.textContent = 'Novi gesli se ne ujemata.';
      return;
    }
    if (p1 === cur) {
      m.className = 'msg bad show';
      m.textContent = 'Novo geslo mora biti drugačno od starega.';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Shranjujem …';
    const {
      data: {
        user
      }
    } = await sb.auth.getUser();
    const check = await sb.auth.signInWithPassword({
      email: user.email,
      password: cur
    });
    if (check.error) {
      btn.disabled = false;
      btn.textContent = 'Shrani novo geslo';
      m.className = 'msg bad show';
      m.textContent = 'Trenutno geslo ni pravilno.';
      return;
    }
    const {
      error
    } = await sb.auth.updateUser({
      password: p1
    });
    btn.disabled = false;
    btn.textContent = 'Shrani novo geslo';
    if (error) {
      m.className = 'msg bad show';
      var em = (error.message || '') + '';
      m.textContent = /same.*password|different/i.test(em) ? 'Novo geslo mora biti drugačno od starega.'
        : /weak|short|at least|length|characters/i.test(em) ? ('Geslo ni sprejeto: ' + em + ' (poskusi daljše/močnejše geslo).')
        : /reauth/i.test(em) ? 'Za spremembo gesla je potrebna ponovna potrditev. Odjavi se in znova prijavi, nato poskusi.'
        : ('Ni uspelo: ' + em);
      return;
    }
    ['curPw', 'chPw1', 'chPw2'].forEach(id => { $(id).value = ''; });
    m.className = 'msg show';
    m.textContent = 'Geslo je spremenjeno.';
  });

  /* ══════════ UPORABNIKI (osebje) ══════════ */
  // Koda (PIN) za aplikacijo: PBKDF2-HMAC-SHA256, 100.000 ponovitev, 16 B soli — isti zapis preveri
  // tablica brez povezave (67_app_pini.sql); koda sama nikoli ne zapusti brskalnika.
  async function pinZgosti(pin) {
    var b64 = function (buf) { var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); };
    var sol = crypto.getRandomValues(new Uint8Array(16)), it = 100000;
    var kljuc = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
    var bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sol, iterations: it }, kljuc, 256);
    return 'pbkdf2$sha256$' + it + '$' + b64(sol) + '$' + b64(bits);
  }
  // sporočila dejanj nad uporabniki (prej v skritem obrazcu »Nov uporabnik«, zato nevidna): kratko obvestilo
  function uMsg(txt) {
    toast(new DOMParser().parseFromString(String(txt).replace(/<br\s*\/?>/gi, ' '), 'text/html').body.textContent);
  }
  async function klic(telo) {
    const {
      data,
      error
    } = await sb.functions.invoke('uporabniki', {
      body: telo
    });
    if (!error) return data;
    try {
      const r = error.context;
      if (r && typeof r.json === 'function') {
        const j = await r.json();
        if (j && j.napaka) return {
          napaka: j.napaka
        };
        return {
          napaka: 'Strežnik je vrnil ' + (r.status || '?') + ': ' + JSON.stringify(j).slice(0, 140)
        };
      }
      if (r && r.status) return {
        napaka: 'Strežnik je vrnil kodo ' + r.status + '.'
      };
    } catch (e) {}
    return {
      napaka: 'Klic ni uspel (' + (error.name || 'napaka') + '): ' + (error.message || 'brez podrobnosti')
    };
  }
  async function loadUsers() {
    pokaziNalaganje($('usersList'));
    { var _no = $('nuOdpri'); if (_no) _no.classList.toggle('hidden', !smeVabiti()); }
    const [rLjudje, {
      data: clanstva
    }, rPini, rPov] = await Promise.all([sb.from('profiles').select('id,email,full_name,is_staff,super_admin,zaposleni,active,last_login,last_seen,web_dostop,rfid_dostop').order('email'), sb.from('memberships').select('user_id,org_id'),
      sb.rpc('app_pini_nastavljeni'),
      smeVabiti() ? sb.from('povabila').select('id,koda,vloga,org_id,rfid_dostop,opomba,ustvarjeno,velja_do').is('porabljeno', null).is('preklicano', null).gt('velja_do', new Date().toISOString()).order('ustvarjeno', { ascending: false }) : Promise.resolve({ data: [] })]);
    POVABILA = (rPov && !rPov.error && rPov.data) || [];
    const sPini = new Set(((rPini && rPini.data) || []).map(x => typeof x === 'string' ? x : (x && (x.app_pini_nastavljeni || x.user_id))));
    let ljudje = rLjudje.data;
    if (rLjudje.error) { /* super_admin/zaposleni ali last_seen še ni — beri brez njih */
      const fb = await sb.from('profiles').select('id,email,full_name,is_staff,active,last_login').order('email');
      if (fb.error) { const fb2 = await sb.from('profiles').select('id,email,full_name,is_staff,active').order('email'); ljudje = fb2.data; }
      else ljudje = fb.data;
    }
    if (!ljudje) {   // vsi poskusi branja niso uspeli → napaka, ne prazno
      if (!$('usersList').dataset.loaded) {
        $('usersList').innerHTML = '<div class="empty"><h3>Nalaganje ni uspelo</h3><button type="button" class="btn ghost" data-act="users-ponovi" style="margin-top:14px">Poskusi znova</button></div>';
        var _up = $('usersList').querySelector('[data-act="users-ponovi"]');
        if (_up) _up.addEventListener('click', function () { loadUsers(); });
      }
      return;
    }
    const clanPo = {};
    (clanstva || []).forEach(c => {
      clanPo[c.user_id] = ORGIME[c.org_id];
    });
    const jeLastnik = JE_LASTNIK();
    const mr = mojRang();
    const jeSuperLastnik = function (u) { return (u.email || '').trim().toLowerCase() === 'filip@eflitte.si'; };
    // »super« (Super admin) je samo lastnik — ni ga mogoče dodeliti; dodeljive so admin in nižje.
    const VLOGE = [['admin', roleIme('admin'), 3], ['osebje', roleIme('osebje'), 2], ['zaposleni', roleIme('zaposleni'), 1], ['stranka', roleIme('stranka'), 0]];
    $('usersList').innerHTML = '<div class="rows u-mreza">' + POVABILA.map(povKartica).join('') + (ljudje || []).map((u, ui) => {
      const jaz = u.id === JAZ;
      const jeLastnikU = jeSuperLastnik(u);
      const vlogaVal = jeLastnikU ? 'super' : u.super_admin ? 'admin' : u.is_staff ? 'osebje' : u.zaposleni ? 'zaposleni' : 'stranka';
      const ur = vlogaRang(vlogaVal);
      const lahkoUredi = !jaz && !jeLastnikU && mr > ur;   // nadrejeni ureja podrejene; lastnika nihče
      const naSpletu = !jaz && u.last_seen && (Date.now() - new Date(u.last_seen).getTime()) < 120000;   // pri sebi »vi« (na spletu ste vedno)
      const webOn = u.web_dostop !== false;   // privzeto vključen
      const pinSet = sPini.has(u.id);   // ali je PIN nastavljen (koda sama je zgoščena in je portal ne vidi)
      const roleOpts = VLOGE.filter(r => r[2] < mr).sort((a, b) => b[2] - a[2]).map(r => `<option value="${r[0]}"${vlogaVal === r[0] ? ' selected' : ''}>${r[1]}</option>`).join('');
      // Okvirček (Seznam/Mreža po nastavitvi Pogled); klik odpre okno z vlogo, podatki in dejanji.
      // vsak ima značko vloge (vse kartice enako visoke); stranka z imenom podjetja
      const vlogaNapis = vlogaVal === 'stranka' && clanPo[u.id] ? roleIme('stranka') + ' · ' + clanPo[u.id] : roleIme(vlogaVal);
      const znacke = (naSpletu ? '<span class="pill pill-on"><span class="dot-on"></span>na spletu</span>' : '') +
        '<span class="pill' + (vlogaVal === 'super' || vlogaVal === 'admin' ? ' pill-super' : '') + '">' + escape_(vlogaNapis) + '</span>' +
        (jaz ? '<span class="pill u-vi">vi</span>' : '') +
        (u.active ? '' : '<span class="pill">izklopljen</span>');
      const ime = u.full_name || u.email || '—';
      const prijava = u.last_login ? datumcas(u.last_login) : '';
      return `<div class="lcell${u.active ? '' : ' u-off'}"><button class="row has-tag" type="button" data-uid="${u.id}" style="${naslovnica(barvaOsebe(u.id, ljudje), u.id)}" aria-haspopup="dialog">
      <span><span class="row-name"><span class="row-nm">${escape_(ime)}</span></span><br><span class="row-legal">${escape_(u.email || '—')}</span>${znacke ? '<span class="u-znacke">' + znacke + '</span>' : ''}</span>
      <span class="row-pct"></span><span class="num u-prijava" title="Zadnja prijava">${prijava ? escape_(prijava.split(',')[0]) : '—'}</span><span class="chev" aria-hidden="true">›</span></button>
      <div class="arts u-det">
        ${lahkoUredi ? `<div class="u-role-wrap">
          <select class="u-role" data-role="${u.id}" data-cur="${vlogaVal}" data-ime="${escape_(u.full_name || '')}" aria-label="Vloga">${roleOpts}</select>
          ${vlogaVal === 'stranka' ? `<select class="u-org" data-org="${u.id}" aria-label="Podjetje">
             <option value="">— izberi podjetje —</option>
             ${ORGSEZNAM.map(o => `<option value="${o.id}"${clanPo[u.id] === o.name ? ' selected' : ''}>${escape_(o.name)}</option>`).join('')}
           </select>` : ''}
        </div>` : ''}
        <dl class="okno-dl">
          <dt>Vloga</dt><dd>${escape_(roleIme(vlogaVal))}${vlogaVal === 'stranka' && clanPo[u.id] ? ' · ' + escape_(clanPo[u.id]) : ''}</dd>
          <dt>E-pošta</dt><dd>${escape_(u.email || '—')}</dd>
          <dt>Zadnja prijava</dt><dd>${prijava ? escape_(prijava) : '<span class="u-sub">še nikoli</span>'}</dd>
        </dl>
        <div class="u-acts">
        ${(jaz || lahkoUredi) ? `<button data-act="ime" data-id="${u.id}" data-ime="${escape_(u.full_name || '')}">Preimenuj</button>` : ''}
        ${(jaz || lahkoUredi) ? `<button class="u-web${webOn ? ' on' : ''}" data-act="web" data-id="${u.id}" data-v="${webOn ? 0 : 1}">${webOn ? 'Aplikacija: dovoljena' : 'Aplikacija: ne'}</button>` : ''}
        ${(lahkoUredi && JE_SUPER() && vlogaVal === 'zaposleni') ? `<button class="u-web${u.rfid_dostop ? ' on' : ''}" data-act="rfid" data-id="${u.id}" data-v="${u.rfid_dostop ? 0 : 1}">${u.rfid_dostop ? 'RFID: dovoljena' : 'RFID: ne'}</button>` : ''}
        ${lahkoUredi ? `<button data-act="active" data-id="${u.id}" data-v="${u.active ? 0 : 1}">${u.active ? 'Izklopi' : 'Vklopi'}</button>` : ''}
        ${(jaz || lahkoUredi) ? `<button data-act="pw" data-id="${u.id}">Novo geslo</button>` : ''}
        ${(jaz || lahkoUredi) ? `<button class="u-pin${pinSet ? ' on' : ''}" data-act="pin" data-id="${u.id}" data-ime="${escape_(u.full_name || '')}">${pinSet ? 'PIN nastavljen' : 'PIN za app'}</button>` : ''}
        ${(jeLastnik && !jaz) ? `<button class="danger" data-act="del" data-id="${u.id}" data-m="${escape_(u.email || '')}">Izbriši</button>` : ''}
        </div>
      </div></div>`;
    }).join('') + '</div>';
    if (!(ljudje || []).length) $('usersList').innerHTML = '<p class="u-sub">Ni uporabnikov.</p>';
    $('usersList').dataset.loaded = '1';
    document.querySelectorAll('#usersList select[data-role]').forEach(sel => {
      sel.addEventListener('change', () => spremeniVlogo(sel));
    });
    document.querySelectorAll('#usersList select[data-org]').forEach(sel => {
      sel.addEventListener('change', () => nastaviStranko(sel.dataset.org, sel.value));
    });
    document.querySelectorAll('#usersList button[data-act]').forEach(b => {
      b.addEventListener('click', () => dejanje(b));
    });
    document.querySelectorAll('#usersList .u-mreza .row[data-uid]').forEach(b => b.addEventListener('click', () => uporabnikOdpri(b)));
    document.querySelectorAll('#usersList .u-mreza .row[data-pov]').forEach(b => b.addEventListener('click', () => povOdpri(b)));
    oknoPoIzrisu();   // po dejanju (vloga, PIN, izklop …) okno pokaže sveže stanje ali se zapre
    // osveži prisotnost vsakih 30 s, dokler je seznam viden — a ne med odprtim oknom
    // (osvežitev bi zaprla izbirnik vloge sredi urejanja).
    if (loadUsers._t) { clearTimeout(loadUsers._t); loadUsers._t = null; }
    loadUsers._t = setTimeout(function ponovi() {
      const el = $('usersList');
      if (!el || el.offsetParent === null) return;
      if (_okno) { loadUsers._t = setTimeout(ponovi, 30000); return; }
      loadUsers();
    }, 30000);
  }
  function uporabnikNajdi(uid) { return document.querySelector('#usersList .u-mreza .row[data-uid="' + String(uid).replace(/"/g, '\\"') + '"]'); }
  function uporabnikOdpri(btn) {
    if (_okno) return;
    var uid = btn.dataset.uid;
    oknoOdpri(btn, btn.nextElementSibling, function () { return uporabnikNajdi(uid); }, {
      osvezi: function (k) { return k.nextElementSibling; }
    });
  }
  function opisVloge(v) {
    if (v === 'super') return 'Super admin — najvišja raven (samo lastnik). Vedno vse pravice.';
    if (v === 'admin') return 'Admin — pod super adminom; privzeto vidi in ureja vse razen upravljanja pravic.';
    if (v === 'osebje') return 'Osebje — vidi vse stranke, arhiv, statistiko, prisotnost in katalog. Brez Faktur in Uporabnikov.';
    if (v === 'zaposleni') return 'Zaposleni — vidi samo svojo prisotnost (svoje ure). Brez ostalih razdelkov.';
    return 'Stranka — vidi samo svoj arhiv in katalog svojega podjetja. Brez dostopa do osebja.';
  }
  async function spremeniVlogo(sel) {
    var uid = sel.dataset.role, stara = sel.dataset.cur, nova = sel.value;
    if (!uid || nova === stara) return;
    var ok = await potrdiModal({
      naslov: 'Sprememba vloge',
      sporocilo: 'Zdaj: ' + opisVloge(stara) + '\n\nNova vloga: ' + opisVloge(nova) + '\n\nŽeliš spremeniti vlogo tega uporabnika?',
      potrdi: 'Spremeni vlogo', preklici: 'Prekliči'
    });
    if (!ok) { loadUsers(); return; }
    var ime = sel.dataset.ime || '';   // ime iz izbirnika (seznam je zdaj v okvirčkih, izbirnik v oknu)
    await nastaviVlogo(uid, nova, ime);
  }
  async function nastaviVlogo(uid, vloga, ime) {
    var staff = (vloga === 'admin' || vloga === 'osebje' || vloga === 'super');
    var patch = { is_staff: staff, super_admin: (vloga === 'admin' || vloga === 'super'), zaposleni: vloga === 'zaposleni' };
    var r = await sb.from('profiles').update(patch).eq('id', uid);
    if (r && r.error && /(super_admin|zaposleni)/i.test(r.error.message || '')) {
      // stolpec super_admin ali zaposleni še ne obstaja → shrani vsaj is_staff in opozori
      r = await sb.from('profiles').update({ is_staff: staff }).eq('id', uid);
      var manjka = (vloga === 'super' || vloga === 'admin') ? '27_super_admin.sql' : vloga === 'zaposleni' ? '28_zaposleni.sql' : null;
      if (manjka) { if (vloga !== 'stranka') { try { await sb.from('memberships').delete().eq('user_id', uid); } catch (e) {} } uMsg('Vloga delno spremenjena — najprej zaženi ' + manjka + ' v Supabase.', true); loadUsers(); return; }
    }
    if (r && r.error) { uMsg('Ni uspelo: ' + escape_(r.error.message), true); loadUsers(); return; }
    if (vloga !== 'stranka') { try { await sb.from('memberships').delete().eq('user_id', uid); } catch (e) {} }
    logDodaj('Uporabniki', 'Vloga', (ime ? ime + ': ' : '') + 'nova vloga ' + roleIme(vloga));
    uMsg('Vloga je spremenjena.');
    loadUsers();
  }
  async function nastaviStranko(userId, orgId) {
    await sb.from('memberships').delete().eq('user_id', userId);
    if (orgId) {
      const {
        error
      } = await sb.from('memberships').insert({
        user_id: userId,
        org_id: orgId,
        role: 'owner'
      });
      if (error) {
        uMsg('Ni uspelo: ' + escape_(error.message), true);
        return;
      }
    }
    logDodaj('Uporabniki', 'Stranka', orgId ? ('Dodeljeno podjetje ' + (ORGIME[orgId] || '')) : 'Odvzet dostop do podjetja');
    uMsg(orgId ? 'Dostop je dodeljen.' : 'Dostop je odvzet.');
    loadUsers();
  }
  async function dejanje(btn) {
    const id = btn.dataset.id,
      act = btn.dataset.act;
    btn.disabled = true;
    if (act === 'ime') {
      const novo = await vnesiModal({ naslov: 'Ime uporabnika', placeholder: 'Ime in priimek', privzeto: btn.dataset.ime || '', potrdi: 'Shrani' });
      btn.disabled = false;
      if (novo === null) return;
      const ime = novo.trim();
      const { error } = await sb.from('profiles').update({ full_name: ime || null }).eq('id', id);
      if (!error && id === JAZ) { JAZIME = ime || JAZMAIL; nastaviWho(JAZIME); }
      uMsg(error ? 'Ni uspelo: ' + escape_(error.message) : 'Ime shranjeno.', !!error);
      loadUsers();
      return;
    }
    if (act === 'staff') {
      const {
        error
      } = await sb.from('profiles').update({
        is_staff: btn.dataset.v === '1'
      }).eq('id', id);
      if (btn.dataset.v === '1') await sb.from('memberships').delete().eq('user_id', id);
      uMsg(error ? 'Ni uspelo: ' + escape_(error.message) : 'Vloga je spremenjena.', !!error);
      loadUsers();
      return;
    }
    if (act === 'rfid') {   // aplikacija SmartClean RFID na C72 (74_rfid_aplikacija.sql); osebje in admin jo imajo po vlogi
      const { error } = await sb.from('profiles').update({ rfid_dostop: btn.dataset.v === '1' }).eq('id', id);
      uMsg(error ? 'Ni uspelo: ' + escape_(error.message) : (btn.dataset.v === '1' ? 'Aplikacija RFID vključena.' : 'Aplikacija RFID izključena.'), !!error);
      loadUsers();
      return;
    }
    if (act === 'web') {
      const { error } = await sb.from('profiles').update({ web_dostop: btn.dataset.v === '1' }).eq('id', id);
      uMsg(error ? 'Ni uspelo: ' + escape_(error.message) : (btn.dataset.v === '1' ? 'Dostop do aplikacije vključen.' : 'Dostop do aplikacije izključen.'), !!error);
      loadUsers();
      return;
    }
    if (act === 'active') {
      const {
        error
      } = await sb.from('profiles').update({
        active: btn.dataset.v === '1'
      }).eq('id', id);
      uMsg(error ? 'Ni uspelo: ' + escape_(error.message) : btn.dataset.v === '1' ? 'Račun je vklopljen.' : 'Račun je izklopljen — dostopa nima več.', !!error);
      loadUsers();
      return;
    }
    if (act === 'super') {
      const { error } = await sb.from('profiles').update({ super_admin: btn.dataset.v === '1' }).eq('id', id);
      uMsg(error ? (/super_admin/i.test(error.message) ? 'Najprej zaženi 27_super_admin.sql v Supabase.' : 'Ni uspelo: ' + escape_(error.message)) : btn.dataset.v === '1' ? 'Uporabnik je zdaj Admin (ima Fakture).' : 'Admin odvzet.', !!error);
      loadUsers();
      return;
    }
    if (act === 'pin') {
      const jeNastavljen = btn.classList.contains('on');
      const novo = await vnesiModal({ naslov: jeNastavljen ? 'Spremeni PIN za aplikacijo' : 'Nastavi PIN za aplikacijo', placeholder: '4-mestni PIN', potrdi: 'Shrani' });
      btn.disabled = false;
      if (novo === null) return;
      const pin = String(novo || '').replace(/\D/g, '').slice(0, 4);
      if (pin && pin.length !== 4) { uMsg('PIN mora imeti 4 števke.', true); return; }
      let error = null;
      try { error = (await sb.rpc('nastavi_app_pin', { p_user: id, p_hash: pin ? await pinZgosti(pin) : null })).error; }
      catch (e) { error = { message: (e && e.message) || 'napaka' }; }
      uMsg(error ? 'Ni uspelo: ' + escape_(error.message) : (pin ? 'PIN nastavljen.' : 'PIN odstranjen.'), !!error);
      if (!error) loadUsers();   // osveži seznam, da se oznaka »PIN nastavljen« takoj posodobi
      return;
    }
    if (act === 'pw') {
      const r = await klic({
        dejanje: 'geslo',
        id
      });
      btn.disabled = false;
      if (r.napaka) {
        uMsg(escape_(r.napaka), true);
        return;
      }
      while (await potrdiModal({ naslov: 'Novo geslo', sporocilo: r.geslo + '\n\nPrikaže se samo zdaj.', potrdi: 'Kopiraj', preklici: 'Zapri' })) {
        try { await navigator.clipboard.writeText(r.geslo); toast('Geslo kopirano'); break; } catch (e) { toast('Kopiranje ni uspelo — geslo si prepišite'); }
      }
      return;
    }
    if (act === 'del') {
      const _ok = await potrdiModal({ naslov: 'Izbriši račun', sporocilo: 'Res izbrisati račun ' + (btn.dataset.m || '') + '? Tega ni mogoče razveljaviti.', potrdi: 'Izbriši', preklici: 'Prekliči', nevarno: true });
      if (!_ok) {
        btn.disabled = false;
        return;
      }
      const r = await klic({
        dejanje: 'izbrisi',
        id
      });
      if (r.napaka) {
        btn.disabled = false;
        uMsg(escape_(r.napaka), true);
        return;
      }
      uMsg('Račun je izbrisan.');
      loadUsers();
      return;
    }
  }
  /* ══════════ POVABILA ══════════
     Namesto računa z geslom od skrbnika: povabilo z vlogo (in stranko, aplikacijo RFID) → koda, povezava in koda QR.
     Oseba se registrira sama (prijavni zaslon → Imam aktivacijsko kodo). Koda velja 7 dni in samo enkrat.
     Čakajoča povabila so na vrhu seznama uporabnikov; klik odpre kodo QR in deljenje. */
  var POVABILA = [];
  function smeVabiti() { return JE_LASTNIK() || !!(MOJPROFIL && MOJPROFIL.super_admin && MOJPROFIL.active !== false); }
  function povVlogaNapis(p) { return roleIme(p.vloga) + (p.vloga === 'stranka' && ORGIME[p.org_id] ? ' · ' + ORGIME[p.org_id] : '') + (p.rfid_dostop ? ' · RFID' : ''); }
  function povPovezava(k) { return location.origin + location.pathname + '?koda=' + k; }
  function povKartica(p) {
    return '<div class="lcell u-pov"><button class="row has-tag" type="button" data-pov="' + escape_(p.id) + '" style="' + naslovnica(null, p.id) + '" aria-haspopup="dialog">' +
      '<span><span class="row-name"><span class="row-nm">' + escape_(p.opomba || 'Povabilo') + '</span></span><br><span class="row-legal">' + escape_(kodaPrikaz(p.koda)) + '</span>' +
      '<span class="u-znacke"><span class="pill">' + escape_(povVlogaNapis(p)) + '</span><span class="pill pill-cak">Čaka</span></span></span>' +
      '<span class="row-pct"></span><span class="num u-prijava" title="Velja do">do ' + escape_(datumcas(p.velja_do).split(',')[0]) + '</span><span class="chev" aria-hidden="true">›</span></button><div class="pov-vsebina"></div></div>';
  }
  function povVsebina(p) {
    var deli = !!navigator.share;
    return '<div class="pov-okno"><div class="pov-qr">' + qrSvg(povPovezava(p.koda)) + '</div>' +
      '<button type="button" class="pov-koda" data-pov-koda title="Kopiraj kodo">' + escape_(kodaPrikaz(p.koda)) + '</button>' +
      '<p class="pov-meta">' + escape_(povVlogaNapis(p)) + ' · velja do ' + escape_(datumcas(p.velja_do).split(',')[0]) + '</p>' +
      '<div class="u-acts pov-akc"><button type="button" class="ur-save" data-pov-deli>' + (deli ? 'Deli' : 'Kopiraj povezavo') + '</button>' +
      (deli ? '<button type="button" data-pov-kopiraj>Kopiraj povezavo</button>' : '') +
      '<button type="button" class="danger" data-pov-preklici>Prekliči povabilo</button></div></div>';
  }
  async function kopiraj(t, sporocilo) { try { await navigator.clipboard.writeText(t); toast(sporocilo); } catch (e) { toast('Kopiranje ni uspelo'); } }
  function povVezi(box, p) {
    var url = povPovezava(p.koda), q = function (s) { return box.querySelector(s); };
    q('[data-pov-koda]').addEventListener('click', function () { kopiraj(kodaPrikaz(p.koda), 'Koda kopirana'); });
    q('[data-pov-deli]').addEventListener('click', function () {
      if (!navigator.share) { kopiraj(url, 'Povezava kopirana'); return; }
      navigator.share({ title: 'Povabilo v SmartClean', text: 'Aktivacijska koda: ' + kodaPrikaz(p.koda), url: url }).catch(function () {});
    });
    if (q('[data-pov-kopiraj]')) q('[data-pov-kopiraj]').addEventListener('click', function () { kopiraj(url, 'Povezava kopirana'); });
    q('[data-pov-preklici]').addEventListener('click', async function () {
      var ok = await potrdiModal({ naslov: 'Prekliči povabilo', sporocilo: 'Koda ' + kodaPrikaz(p.koda) + ' ne bo več veljala.', potrdi: 'Prekliči povabilo', preklici: 'Nazaj', nevarno: true });
      if (!ok) return;
      var r = await sb.rpc('povabilo_preklici', { p_id: p.id });
      if (r.error) { toast(napakaBesedilo(r.error)); return; }
      toast(r.data === false ? 'Povabilo ni več aktivno' : 'Povabilo preklicano'); if (_okno) oknoZapri(); loadUsers();
    });
  }
  function povOdpri(btn) {
    if (_okno) return;
    var p = POVABILA.filter(function (x) { return x.id === btn.dataset.pov; })[0]; if (!p) return;
    var box = btn.nextElementSibling; box.innerHTML = povVsebina(p); povVezi(box, p);
    oknoOdpri(btn, box, function () { return document.querySelector('#usersList .row[data-pov="' + String(p.id).replace(/"/g, '\\"') + '"]'); }, {
      glava: function () { var h = document.createElement('h3'); h.className = 'sec-h'; h.textContent = p.opomba || 'Povabilo'; return h; },
      osvezi: function (k) { var b = k.nextElementSibling; b.innerHTML = povVsebina(p); povVezi(b, p); return b; },   // seznam se je osvežil: novo kartico napolni
      obZaprtju: function () { document.querySelectorAll('#usersList .pov-vsebina').forEach(function (x) { x.innerHTML = ''; }); }
    });
  }
  // novo povabilo: vloga → (stranka | aplikacija RFID) → za koga → koda QR v istem oknu
  function povNovo(gumb) {
    if (_okno) return;
    var box = document.createElement('div'), naslov = 'Novo povabilo';
    box.className = 'pov-vsebina';
    var vloge = (JE_LASTNIK() ? ['admin'] : []).concat(['osebje', 'zaposleni', 'stranka']);   // admina povabi le lastnik (80_varnost_povabil.sql)
    box.innerHTML = '<div class="ur-form pov-nov">' +
      '<label class="ur-f"><span>Vloga</span><select data-pov-vloga>' + vloge.map(function (v) { return '<option value="' + v + '"' + (v === 'stranka' ? ' selected' : '') + '>' + escape_(roleIme(v)) + '</option>'; }).join('') + '</select></label>' +
      '<label class="ur-f" data-pov-org-polje><span>Stranka</span><select data-pov-org><option value="">Izberi stranko</option>' + ORGSEZNAM.map(function (o) { return '<option value="' + escape_(o.id) + '">' + escape_(o.name) + '</option>'; }).join('') + '</select></label>' +
      '<div class="ur-f" data-pov-rfid-polje hidden><span id="povRfidNaslov">Aplikacija RFID</span><div class="u-acts"><button type="button" class="u-web" data-pov-rfid aria-pressed="false" aria-labelledby="povRfidNaslov">Ne</button></div></div>' +
      '<label class="ur-f"><span>Za koga</span><input type="text" data-pov-opomba maxlength="80" autocomplete="off"></label>' +
      '<p class="u-sub ur-msg" data-msg role="status" aria-live="polite"></p>' +
      '<div class="u-acts"><button type="button" data-preklici>Prekliči</button><button type="button" class="ur-save" data-ustvari>Ustvari povabilo</button></div></div>';
    var q = function (s) { return box.querySelector(s); };
    var osvezi = function () { var v = q('[data-pov-vloga]').value; q('[data-pov-org-polje]').hidden = v !== 'stranka'; q('[data-pov-rfid-polje]').hidden = v === 'stranka'; };
    q('[data-pov-vloga]').addEventListener('change', osvezi); osvezi();
    q('[data-pov-rfid]').addEventListener('click', function () { var on = this.getAttribute('aria-pressed') !== 'true'; this.setAttribute('aria-pressed', on); this.classList.toggle('on', on); this.textContent = on ? 'Dovoljena' : 'Ne'; });
    q('[data-preklici]').addEventListener('click', function () { oknoZapri(); });
    q('[data-ustvari]').addEventListener('click', async function () {
      var b = this, v = q('[data-pov-vloga]').value, org = q('[data-pov-org]').value, msg = q('[data-msg]');
      if (v === 'stranka' && !org) { msg.textContent = 'Izberi stranko.'; return; }
      b.disabled = true; b.classList.add('nalaga'); msg.textContent = '';
      var r = await sb.rpc('povabilo_ustvari', { p_vloga: v, p_org: v === 'stranka' ? org : null, p_rfid: v !== 'stranka' && q('[data-pov-rfid]').getAttribute('aria-pressed') === 'true', p_opomba: q('[data-pov-opomba]').value.trim() || null });
      b.disabled = false; b.classList.remove('nalaga');
      if (r.error) { msg.textContent = napakaBesedilo(r.error); return; }
      var p = { id: r.data.id, koda: r.data.koda, velja_do: r.data.velja_do, vloga: v, org_id: v === 'stranka' ? org : null, rfid_dostop: v !== 'stranka' && q('[data-pov-rfid]').getAttribute('aria-pressed') === 'true', opomba: q('[data-pov-opomba]').value.trim() || null };
      box.innerHTML = povVsebina(p); povVezi(box, p);
      naslov = p.opomba || 'Povabilo';   // tudi ob ponovnem izrisu glave (seznam se osveži)
      var h = _okno && _okno.glava && _okno.glava.querySelector('.sec-h'); if (h) h.textContent = naslov;
      logDodaj('Uporabniki', 'Povabilo', povVlogaNapis(p) + (p.opomba ? ' · ' + p.opomba : ''));
      loadUsers();
    });
    oknoOdpri(gumb, box, function () { return $('nuOdpri'); }, {
      glava: function () { var h = document.createElement('h3'); h.className = 'sec-h'; h.textContent = naslov; return h; },
      obZaprtju: function () { box.innerHTML = ''; }
    });
  }
  { var _no = $('nuOdpri'); if (_no) _no.addEventListener('click', function () { povNovo(_no); }); }
  /* ══════════ KODA QR (povabila) ══════════
     Zlog (UTF-8), popravljanje napak M, različice 1–10 (do 213 bajtov), maska z najnižjo kaznijo.
     Po specifikaciji ISO/IEC 18004 (postopek kot v znani odprtokodni izvedbi Nayuki). Vrne matriko (true = temno). */
  function qrMatrika(besedilo) {
    var ECC = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26], BLOKI = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
    var bajti = Array.from(new TextEncoder().encode(String(besedilo)));
    var surovi = function (v) { var r = (16 * v + 128) * v + 64; if (v >= 2) { var na = Math.floor(v / 7) + 2; r -= (25 * na - 10) * na - 55; if (v >= 7) r -= 36; } return r; };
    var podatkovni = function (v) { return Math.floor(surovi(v) / 8) - ECC[v] * BLOKI[v]; };
    var ver = 0;
    for (var v = 1; v <= 10; v++) if (4 + (v < 10 ? 8 : 16) + 8 * bajti.length <= podatkovni(v) * 8) { ver = v; break; }
    if (!ver) throw new Error('Predolgo za kodo QR.');
    // biti: način (zlog), dolžina, podatki, zaključek, polnila
    var bb = [], dodaj = function (val, n) { for (var i = n - 1; i >= 0; i--) bb.push((val >>> i) & 1); };
    dodaj(4, 4); dodaj(bajti.length, ver < 10 ? 8 : 16); bajti.forEach(function (b) { dodaj(b, 8); });
    var kap = podatkovni(ver) * 8;
    dodaj(0, Math.min(4, kap - bb.length)); dodaj(0, (8 - bb.length % 8) % 8);
    for (var p = 0xEC; bb.length < kap; p ^= 0xEC ^ 0x11) dodaj(p, 8);
    var cw = []; for (var i = 0; i < bb.length; i += 8) { var x = 0; for (var j = 0; j < 8; j++) x = (x << 1) | bb[i + j]; cw.push(x); }
    // Reed-Solomon v GF(256), polinom 0x11D
    var mnozi = function (a, b) { var z = 0; for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((b >>> i) & 1) * a; } return z; };
    var delitelj = function (st) { var r = []; for (var i = 0; i < st - 1; i++) r.push(0); r.push(1); var k = 1; for (i = 0; i < st; i++) { for (var j = 0; j < r.length; j++) { r[j] = mnozi(r[j], k); if (j + 1 < r.length) r[j] ^= r[j + 1]; } k = mnozi(k, 0x02); } return r; };
    var ostanek = function (pod, del) { var r = del.map(function () { return 0; }); pod.forEach(function (b) { var f = b ^ r.shift(); r.push(0); del.forEach(function (c, i) { r[i] ^= mnozi(c, f); }); }); return r; };
    var nb = BLOKI[ver], el = ECC[ver], vsi = Math.floor(surovi(ver) / 8), kratki = nb - vsi % nb, kd = Math.floor(vsi / nb), del = delitelj(el), bloki = [];
    for (var b = 0, k = 0; b < nb; b++) { var d = cw.slice(k, k + kd - el + (b < kratki ? 0 : 1)); k += d.length; var e = ostanek(d, del); if (b < kratki) d.push(0); bloki.push(d.concat(e)); }
    var vse = [];
    for (i = 0; i < bloki[0].length; i++) for (b = 0; b < nb; b++) if (i !== kd - el || b >= kratki) vse.push(bloki[b][i]);
    // vzorci
    var n = ver * 4 + 17, m = [], f = [];
    for (i = 0; i < n; i++) { m.push(new Array(n).fill(false)); f.push(new Array(n).fill(false)); }
    var postavi = function (x, y, t) { m[y][x] = t; f[y][x] = true; };
    for (i = 0; i < n; i++) { postavi(6, i, i % 2 === 0); postavi(i, 6, i % 2 === 0); }
    var iskalo = function (x, y) { for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) { var r = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy; if (xx >= 0 && xx < n && yy >= 0 && yy < n) postavi(xx, yy, r !== 2 && r !== 4); } };
    iskalo(3, 3); iskalo(n - 4, 3); iskalo(3, n - 4);
    var por = []; if (ver > 1) { var na = Math.floor(ver / 7) + 2, korak = Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2; por = [6]; for (var q = n - 7; por.length < na; q -= korak) por.splice(1, 0, q); }
    por.forEach(function (ax, ai) { por.forEach(function (ay, aj) { if ((ai === 0 && aj === 0) || (ai === 0 && aj === por.length - 1) || (ai === por.length - 1 && aj === 0)) return; for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) postavi(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }); });
    var oblika = function (maska) {
      var dat = (0 << 3) | maska, r = dat; for (var i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      var bit = ((dat << 10) | r) ^ 0x5412, g = function (i) { return ((bit >>> i) & 1) !== 0; };
      for (i = 0; i <= 5; i++) postavi(8, i, g(i));
      postavi(8, 7, g(6)); postavi(8, 8, g(7)); postavi(7, 8, g(8));
      for (i = 9; i < 15; i++) postavi(14 - i, 8, g(i));
      for (i = 0; i < 8; i++) postavi(n - 1 - i, 8, g(i));
      for (i = 8; i < 15; i++) postavi(8, n - 15 + i, g(i));
      postavi(8, n - 8, true);
    };
    oblika(0);
    if (ver >= 7) { var rv = ver; for (i = 0; i < 12; i++) rv = (rv << 1) ^ ((rv >>> 11) * 0x1F25); var vb = (ver << 12) | rv; for (i = 0; i < 18; i++) { var t = ((vb >>> i) & 1) !== 0, a = n - 11 + i % 3, c = Math.floor(i / 3); postavi(a, c, t); postavi(c, a, t); } }
    // podatki v cikcak (desno levo, gor dol)
    var bi = 0;
    for (var desno = n - 1; desno >= 1; desno -= 2) {
      if (desno === 6) desno = 5;
      for (var vv = 0; vv < n; vv++) for (j = 0; j < 2; j++) {
        var xx = desno - j, gor = ((desno + 1) & 2) === 0, yy = gor ? n - 1 - vv : vv;
        if (!f[yy][xx] && bi < vse.length * 8) { m[yy][xx] = ((vse[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0; bi++; }
      }
    }
    var maske = [function (x, y) { return (x + y) % 2 === 0; }, function (x, y) { return y % 2 === 0; }, function (x) { return x % 3 === 0; }, function (x, y) { return (x + y) % 3 === 0; },
      function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; }, function (x, y) { return x * y % 2 + x * y % 3 === 0; },
      function (x, y) { return (x * y % 2 + x * y % 3) % 2 === 0; }, function (x, y) { return ((x + y) % 2 + x * y % 3) % 2 === 0; }];
    var maskiraj = function (k) { for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (!f[y][x] && maske[k](x, y)) m[y][x] = !m[y][x]; };
    var kazen = function () {
      var s = 0, temnih = 0, zgod, vrsta, barva, dolz, x, y;
      var stej = function (z) { var nn = z[1], jedro = nn > 0 && z[2] === nn && z[3] === nn * 3 && z[4] === nn && z[5] === nn; return (jedro && z[0] >= nn * 4 && z[6] >= nn ? 1 : 0) + (jedro && z[6] >= nn * 4 && z[0] >= nn ? 1 : 0); };
      var vpisi = function (d, z) { if (z[0] === 0) d += n; z.pop(); z.unshift(d); };
      var konec = function (b, d, z) { if (b) { vpisi(d, z); d = 0; } d += n; vpisi(d, z); return stej(z); };
      for (var smer = 0; smer < 2; smer++) for (var a = 0; a < n; a++) {
        barva = false; dolz = 0; zgod = [0, 0, 0, 0, 0, 0, 0];
        for (var b2 = 0; b2 < n; b2++) {
          var c = smer ? m[b2][a] : m[a][b2];
          if (c === barva) { dolz++; if (dolz === 5) s += 3; else if (dolz > 5) s++; }
          else { vpisi(dolz, zgod); if (!barva) s += stej(zgod) * 40; barva = c; dolz = 1; }
        }
        s += konec(barva, dolz, zgod) * 40;
      }
      for (y = 0; y < n - 1; y++) for (x = 0; x < n - 1; x++) { var c0 = m[y][x]; if (c0 === m[y][x + 1] && c0 === m[y + 1][x] && c0 === m[y + 1][x + 1]) s += 3; }
      for (y = 0; y < n; y++) for (x = 0; x < n; x++) if (m[y][x]) temnih++;
      var vseh = n * n; s += (Math.ceil(Math.abs(temnih * 20 - vseh * 10) / vseh) - 1) * 10;
      return s;
    };
    var naj = 0, najK = Infinity;
    for (k = 0; k < 8; k++) { maskiraj(k); oblika(k); var kz = kazen(); if (kz < najK) { najK = kz; naj = k; } maskiraj(k); }
    maskiraj(naj); oblika(naj);
    return m;
  }
  // SVG s tihim robom 4 modulov; ena pot (vrstice zaporednih modulov)
  function qrSvg(besedilo) {
    var m = qrMatrika(besedilo), n = m.length, d = '';
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (m[y][x]) { var z = x; while (x + 1 < n && m[y][x + 1]) x++; d += 'M' + (z + 4) + ' ' + (y + 4) + 'h' + (x - z + 1) + 'v1h-' + (x - z + 1) + 'z'; }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (n + 8) + ' ' + (n + 8) + '" shape-rendering="crispEdges" role="img" aria-label="Koda QR"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }

  /* ══════════ ZAPOMNJENI PROFILI (izbirnik prijave) ══════════ */
  function beriProfile() {
    try { var a = JSON.parse(localStorage.getItem('sc-profiles') || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function shraniProfile(a) { try { localStorage.setItem('sc-profiles', JSON.stringify(a || [])); } catch (e) {} }
  function zapomniProfil(p) {
    if (!p || !p.email) return;
    var a = beriProfile();
    a = a.filter(function (x) { return (x.email || '').toLowerCase() !== (p.email || '').toLowerCase(); });
    var bio = false; try { bio = !!(p.uid && bioVklopljen(p.uid)); } catch (e) {}
    a.unshift({ email: p.email, name: p.name || p.email, avatar: p.avatar || '', uid: p.uid || '', bio: bio });
    if (a.length > 8) a = a.slice(0, 8);
    shraniProfile(a);
  }
  function pozabiProfil(email) {
    var a = beriProfile().filter(function (x) { return (x.email || '').toLowerCase() !== (email || '').toLowerCase(); });
    shraniProfile(a);
  }
  function ppAvatarHtml(p, cls) {
    if (p && p.avatar) return '<span class="' + cls + '" style="background-image:url(' + encodeURI(p.avatar).replace(/"/g, '%22') + ')"></span>';
    return '<span class="' + cls + ' av-ini" aria-hidden="true">' + escape_(zacetnice(p && (p.name || p.email))) + '</span>';   // privzeta profilna slika
  }
  function narisiIzbirnik() {
    var grid = $('ppGrid'); if (!grid) return;
    var prof = beriProfile();
    // znak biometrije na kartici: obraz (Face ID, Windows Hello) ali prstni odtis
    var BIO_IKONA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      ({ ios: 1, win: 1 }[bioNaprava()]
        ? '<path d="M4 8.5v-2A2.5 2.5 0 0 1 6.5 4h2M15.5 4h2A2.5 2.5 0 0 1 20 6.5v2M20 15.5v2a2.5 2.5 0 0 1-2.5 2.5h-2M8.5 20h-2A2.5 2.5 0 0 1 4 17.5v-2"/><path d="M9 9.5v1.2M15 9.5v1.2"/><path d="M12.2 9.5v3.6h-1"/><path d="M9.3 15.6a4 4 0 0 0 5.4 0"/>'
        : '<path d="M5.6 6.8A9.4 9.4 0 0 1 12 4.3a9.4 9.4 0 0 1 7.3 3.4"/><path d="M4.8 16.5c.3-1 .5-2 .5-3a6.7 6.7 0 0 1 12-4.1"/><path d="M18.7 12c.1.5.1 1 .1 1.5 0 2.2-.3 4.3-.8 6.2"/><path d="M7.5 19.5c.6-1.8 1-3.8 1-6a3.5 3.5 0 0 1 7 0c0 1.3-.1 2.6-.3 3.8"/><path d="M12 13.5c0 2.7-.3 5.2-1 7.5"/>') + '</svg>';
    // kartica z naslovnico kot drugod (siva z zrnom, vzorec po osebi): v njej profilna slika, pod njo ime
    var html = prof.map(function (p) {
      var imaBio = bioPodprt() && p.uid && bioVklopljen(p.uid);
      var badge = imaBio ? '<span class="pp-bio" title="' + bioIme() + '">' + BIO_IKONA + '</span>' : '';
      return '<div class="pp-tile-wrap">' +
        '<button type="button" class="pp-tile" data-email="' + escape_(p.email) + '">' +
        '<span class="pp-cov" style="' + naslovnica(null, p.uid || p.email) + '">' +
        ppAvatarHtml(p, 'pp-av') + badge + '<span class="pp-nm">' + escape_(p.name || p.email) + '</span></span></button>' +
        '<button type="button" class="pp-tile-x" data-forget="' + escape_(p.email) + '" aria-label="Odstrani profil" title="Odstrani profil">' + IKO_ZAPRI + '</button>' +
        '</div>';
    }).join('');
    html += '<button type="button" class="pp-tile pp-add" id="ppAdd"><span class="pp-cov" style="' + naslovnica(null, 'drug-uporabnik') + '">' +
      '<span class="pp-plus">' + IKO_T_PLUS + '</span><span class="pp-nm">Drug uporabnik</span></span></button>';
    grid.innerHTML = html;
    grid.querySelectorAll('.pp-tile[data-email]').forEach(function (b) {
      b.addEventListener('click', function () { izberiProfil(b.dataset.email); });
    });
    grid.querySelectorAll('.pp-tile-x').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        pozabiProfil(b.dataset.forget);
        if (beriProfile().length) narisiIzbirnik(); else pokaziPrijavo('');
      });
    });
    var add = $('ppAdd');
    if (add) add.addEventListener('click', function () { pokaziPrijavo(''); });
    // Stalni gumb pod karticami: »Prijava z geslom« — vedno na voljo (če biometrija ne dela ali je nočeš).
    var pk = $('profilePicker');
    if (pk) {
      var lp = $('ppLoginPass');
      if (!lp) {
        lp = document.createElement('button');
        lp.id = 'ppLoginPass'; lp.type = 'button'; lp.className = 'pp-loginpass';
        lp.textContent = 'Prijava z geslom';
        lp.style.cssText = 'display:block;margin:22px auto 0;background:none;border:none;color:var(--accent,#777);font-size:.92rem;cursor:pointer;text-decoration:underline;text-underline-offset:3px;padding:8px 12px;border-radius:8px;';
        if (grid.parentNode) grid.parentNode.insertBefore(lp, grid.nextSibling);
        lp.addEventListener('click', function () { pokaziPrijavo(''); });
      }
      lp.classList.remove('hidden');
    }
  }
  function jeOmreznaNapaka(e) {
    var t = String((e && (e.name + ' ' + e.message)) || e || '');
    return (navigator.onLine === false) || !!(e && e.code === 'TIMEOUT') || /fetch|network|retryable|load failed|timeout|timed out/i.test(t);
  }
  function zagonSporocilo() {
    if (jeOmreznaNapaka(ZAGON_NAPAKA)) return 'Ni povezave s strežnikom. Preverite, ali ima ta naprava internet (ne samo WiFi tiskalnika), nato se prijavite znova.';
    return 'Prijava na tej napravi je potekla ali je bila preklicana — prijavite se znova.';
  }
  function pokaziIzbirnik() {
    narisiIzbirnik();
    // Sveže stanje: počisti sporočilo (stari, neuporabljeni gumb skrij, če obstaja v HTML).
    var _pp = $('ppPass'); if (_pp) _pp.classList.add('hidden');
    var _pm = $('ppMsg'); if (_pm) { _pm.className = 'msg'; _pm.textContent = ''; }
    $('profilePicker').classList.remove('hidden');
    $('authBox').classList.add('hidden');
  }
  function pokaziPrijavo(email, sporocilo) {
    $('profilePicker').classList.add('hidden');
    $('authBox').classList.remove('hidden');
    showAuthPane('loginForm');
    if ($('email')) $('email').value = email || '';
    var back = $('backToPickerBtn');
    if (back) back.style.display = beriProfile().length ? '' : 'none';
    var lm = $('loginMsg');
    if (lm) { if (sporocilo) { lm.className = 'msg show'; lm.textContent = sporocilo; } else { lm.className = 'msg'; lm.textContent = ''; } }
    setTimeout(function () { try { (email ? $('password') : $('email')).focus(); } catch (e) {} }, 40);
  }
  async function izberiProfil(email) {
    var p = beriProfile().filter(function (x) { return (x.email || '').toLowerCase() === (email || '').toLowerCase(); })[0];
    var seja = null;
    try { var s = await sb.auth.getSession(); seja = s && s.data && s.data.session; } catch (e) {}
    var sejaTaUporabnik = seja && seja.user && (seja.user.email || '').toLowerCase() === (email || '').toLowerCase();
    // 1) Face ID OMOGOČEN za ta profil → VEDNO zahtevaj Face ID; ob neuspehu geslo.
    //    NIKOLI tihega vstopa (varnost). Face ID se sam NE izklopi (ne poteče) —
    //    izklopi se le ročno v Nastavitvah (»Odstrani s te naprave«).
    if (p && p.uid && bioPodprt() && bioVklopljen(p.uid)) {
      // stanje v sami kartici: nič se ne premakne in nič ne pade pod rob zaslona
      var kart = [].filter.call(document.querySelectorAll('#ppGrid .pp-tile[data-email]'), function (b) { return b.dataset.email === email; })[0];
      var nm = kart && kart.querySelector('.pp-nm'), ime = nm ? nm.textContent : '';
      var odklep = function (da) { if (!kart) return; kart.classList.toggle('odklepam', da); if (da) nm.innerHTML = '<span class="bio-pulse"></span>Odkleni ' + bioZ() + ' …'; else nm.textContent = ime; };
      odklep(true);
      try {
        var ok = await bioOdkleni(p.uid, email);
        if (!ok) { odklep(false); pokaziPrijavo(email); return; }
        // Seja JE vzpostavljena (verifyOtp). Če izris aplikacije spodleti (prehodno),
        // NE vračaj na prijavo — seja je veljavna → osveži, obnovitev seje jo pobere.
        try { if (await start() === false) pokaziPrijavo(email, zagonSporocilo()); }
        catch (se) { try { console.warn('[bio] start() po uspešni prijavi ni uspel:', se); } catch (_) {} location.reload(); }
        return;
      } catch (e) {
        try { console.warn('[bio] prijava z biometrijo ni uspela:', (e && (e.name + ': ' + e.message)) || e); } catch (_) {}
        var preklic = /NotAllowed|AbortError|abort|timed|timeout|cancel/i.test(((e && e.name) || '') + ' ' + ((e && e.message) || ''));
        // Preklic → tiho nazaj na izbirnik (spodaj je stalni gumb »Prijava z geslom«).
        // Prava napaka → naravnost na vpis gesla, prijazno.
        odklep(false);
        if (!preklic) pokaziPrijavo(email, 'Poskusi znova ali vpiši geslo.');
        return;
      }
    }
    // 2) Brez Face ID: VEDNO zahtevaj geslo (nič tihega vstopa, tudi če je seja še živa) —
    //    prijavni zaslon je varnostna vrata. (Ko oseba vklopi biometrijo, je to Touch ID.)
    pokaziPrijavo(email);
  }

  /* ══════════ FACE ID / PRSTNI ODTIS (WebAuthn) ══════════ */
  // Ime biometrije, kot ga uporablja naprava (na Androidu ni Face ID, na Macu je Touch ID …)
  function bioNaprava() {
    var ua = navigator.userAgent || '', pl = navigator.platform || '';
    if (/iPhone|iPad|iPod/.test(ua) || (pl === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
    if (/Android/.test(ua)) return 'android';
    if (/Mac/.test(pl)) return 'mac';
    if (/Win/.test(pl)) return 'win';
    return '';
  }
  function bioZ() { return { ios: 's Face ID', android: 's prstnim odtisom', mac: 's Touch ID', win: 'z Windows Hello' }[bioNaprava()] || 's prstnim odtisom ali obrazom'; }
  function bioIme() { return { ios: 'Face ID', android: 'Prstni odtis', mac: 'Touch ID', win: 'Windows Hello' }[bioNaprava()] || 'Prstni odtis'; }
  document.querySelectorAll('[data-bio-naslov]').forEach(function (h) { h.textContent = 'Prijava ' + bioZ(); });
  function bioPodprt() {
    try { return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create); }
    catch (e) { return false; }
  }
  function b64u(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function odB64u(str) {
    str = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    var bin = atob(str), b = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return b.buffer;
  }
  function nakljucje(n) { var a = new Uint8Array(n || 32); (window.crypto || {}).getRandomValues && window.crypto.getRandomValues(a); return a; }
  /* Vpis (credId) je LOČEN od žetona. Za vsakega uporabnika hranimo NJEGOV žeton,
     da na skupni napravi z več uporabniki biometrija obnovi PRAVEGA uporabnika. */
  /* ── STREŽNIŠKI WebAuthn (kot velika podjetja) ──────────────────────────
     Javni ključi so v bazi; podpis preveri Edge Function »webauthn«. Odjemalec
     ne hrani žetonov ne referenc — le majhno UI zastavico »bio vklopljen«.   */
  function bioVklopljen(uid) { try { return !!(uid && localStorage.getItem('sc-bioon-' + uid)); } catch (e) { return false; } }
  function bioOznaci(uid, on) { try { if (on) localStorage.setItem('sc-bioon-' + uid, '1'); else localStorage.removeItem('sc-bioon-' + uid); } catch (e) {} }
  function bioOsveziZetone() { /* ni več lokalnih žetonov — strežnik obvlada sejo */ }
  /* Vse napake pretvori v PRIJAZNO slovensko besedilo — nikoli surovih/tehničnih. */
  function _bioNapaka(e) {
    var n = ((e && e.name) || '') + ' ' + ((e && e.message) || '');
    if (/NotAllowed|AbortError|abort|timed|timeout|cancel/i.test(n)) return 'Preklicano.';
    if (/InvalidState|already registered/i.test(n)) return 'Že omogočeno.';
    if (/NotSupported|not support|SecurityError/i.test(n)) return 'Ta naprava ne podpira biometrije.';
    if (/network|Failed to fetch|fetch|Load failed|omrežj/i.test(n)) return 'Ni povezave — poskusi znova.';
    return 'Ni uspelo — poskusi znova.';
  }
  async function _fnWebauthn(body) {
    var r = await sb.functions.invoke('webauthn', { body: body });
    if (r.error) { var msg = r.error.message || 'Napaka strežnika.'; try { if (r.error.context && r.error.context.json) { var j = await r.error.context.json(); if (j && j.error) msg = j.error; } } catch (e) {} throw new Error(msg); }
    if (r.data && r.data.error) throw new Error(r.data.error);
    return r.data;
  }
  /* WebAuthn kodiranje BREZ zunanje knjižnice (base64url ⇄ ArrayBuffer) — brez CSP težav. */
  function _waReg2native(o) {
    return { publicKey: {
      challenge: odB64u(o.challenge),
      rp: o.rp,
      user: { id: odB64u(o.user.id), name: o.user.name, displayName: o.user.displayName },
      pubKeyCredParams: o.pubKeyCredParams,
      timeout: o.timeout, attestation: o.attestation,
      authenticatorSelection: o.authenticatorSelection,
      excludeCredentials: (o.excludeCredentials || []).map(function (c) { return { id: odB64u(c.id), type: c.type, transports: c.transports }; })
    } };
  }
  function _waAuth2native(o) {
    return { publicKey: {
      challenge: odB64u(o.challenge),
      timeout: o.timeout, rpId: o.rpId, userVerification: o.userVerification,
      allowCredentials: (o.allowCredentials || []).map(function (c) { return { id: odB64u(c.id), type: c.type, transports: c.transports }; })
    } };
  }
  function _waRegJSON(cred) {
    var r = cred.response;
    return { id: cred.id, rawId: b64u(cred.rawId), type: cred.type,
      response: { clientDataJSON: b64u(r.clientDataJSON), attestationObject: b64u(r.attestationObject), transports: (r.getTransports && r.getTransports()) || [] },
      clientExtensionResults: (cred.getClientExtensionResults && cred.getClientExtensionResults()) || {},
      authenticatorAttachment: cred.authenticatorAttachment || undefined };
  }
  function _waAuthJSON(cred) {
    var r = cred.response;
    return { id: cred.id, rawId: b64u(cred.rawId), type: cred.type,
      response: { clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.authenticatorData), signature: b64u(r.signature), userHandle: r.userHandle ? b64u(r.userHandle) : null },
      clientExtensionResults: (cred.getClientExtensionResults && cred.getClientExtensionResults()) || {},
      authenticatorAttachment: cred.authenticatorAttachment || undefined };
  }
  // Omogoči biometrijo: registriraj passkey na STREŽNIKU (oseba je prijavljena z geslom).
  async function bioOmogoci() {
    if (!bioPodprt()) throw new Error('Ta naprava ne podpira prijave ' + bioZ() + '.');
    var sres = await sb.auth.getSession();
    var session = sres && sres.data && sres.data.session;
    if (!session) throw new Error('Najprej se prijavi z geslom.');
    var beg = await _fnWebauthn({ mode: 'reg-begin' });
    var cred;
    try { cred = await navigator.credentials.create(_waReg2native(beg.options)); }
    catch (e) {
      // Passkey za tega uporabnika že obstaja (na tej/sinhronizirani napravi) → biometrija je že vklopljena.
      if (e && (e.name === 'InvalidStateError' || /already registered/i.test(e.message || ''))) {
        bioOznaci(session.user.id, true);
        zapomniProfil({ email: JAZMAIL, name: JAZIME, avatar: (MOJPROFIL && MOJPROFIL.avatar_url) || '', uid: session.user.id });
        return 'ze';
      }
      throw e;
    }
    await _fnWebauthn({ mode: 'reg-finish', handle: beg.handle, response: _waRegJSON(cred), label: (navigator.userAgent || '').slice(0, 80) });
    bioOznaci(session.user.id, true);
    zapomniProfil({ email: JAZMAIL, name: JAZIME, avatar: (MOJPROFIL && MOJPROFIL.avatar_url) || '', uid: session.user.id });
    return 'nov';
  }
  // Prijava z biometrijo: strežnik preveri podpis in izda sejo (magiclink token_hash).
  // Vrne true ob uspehu; sejo vzpostavi verifyOtp. Ob prekinitvi/napaki vrže napako.
  async function bioOdkleni(uid, email) {
    var beg = await _fnWebauthn({ mode: 'auth-begin', email: email || '' });
    var cred = await navigator.credentials.get(_waAuth2native(beg.options));
    var fin = await _fnWebauthn({ mode: 'auth-finish', handle: beg.handle, response: _waAuthJSON(cred) });
    if (!fin || !fin.token_hash) throw new Error('Prijava ni uspela.');
    var vo = await sb.auth.verifyOtp({ type: 'magiclink', token_hash: fin.token_hash });
    if (vo.error || !vo.data || !vo.data.session) throw new Error((vo.error && vo.error.message) || 'Seje ni bilo mogoče vzpostaviti.');
    return true;
  }
  // Odstrani biometrijo tega uporabnika: izbriši VSE njegove passkeye na strežniku + lokalno zastavico.
  async function bioOdstrani() {
    try { if (JAZ) await sb.from('webauthn_credentials').delete().eq('user_id', JAZ); } catch (e) {}
    bioOznaci(JAZ, false);
  }
  // Panel v »Moj račun«.
  async function napolniBio() {
    var panel = $('bioPanel'); if (!panel) return;
    if (!bioPodprt()) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    function prikazi(ima) {
      var on = $('bioOn'), off = $('bioOff');
      if (on) on.classList.toggle('hidden', ima);
      if (off) off.classList.toggle('hidden', !ima);
    }
    prikazi(bioVklopljen(JAZ));                 // takoj (lokalni namig)
    var m = $('bioMsg'); if (m) { m.className = 'msg'; m.textContent = ''; }
    // Natančno stanje s STREŽNIKA (velja povsod, tudi če je bilo vklopljeno na drugi napravi).
    try {
      var r = await sb.from('webauthn_credentials').select('credential_id').eq('user_id', JAZ).limit(1);
      if (r && !r.error) { var ima = !!(r.data && r.data.length); bioOznaci(JAZ, ima); prikazi(ima); }
    } catch (e) {}
  }
  { var _bon = $('bioOn'); if (_bon) _bon.addEventListener('click', async function () {
    var m = $('bioMsg'); this.disabled = true; var t = this.textContent; this.innerHTML = '<span class="bio-pulse"></span>Potrjevanje …';
    try { var _st = await bioOmogoci(); if (m) { m.className = 'msg ok show'; m.textContent = (_st === 'ze') ? 'Biometrija je že vklopljena.' : 'Biometrija je vklopljena.'; } await napolniBio(); }
    catch (e) { if (m) { m.className = 'msg bad show'; m.textContent = _bioNapaka(e); } }
    this.disabled = false; this.textContent = t;
  }); }
  { var _bof = $('bioOff'); if (_bof) _bof.addEventListener('click', async function () {
    var m = $('bioMsg'); this.disabled = true; var t = this.textContent; this.textContent = 'Odstranjujem …';
    try { await bioOdstrani(); if (m) { m.className = 'msg ok show'; m.textContent = 'Biometrija odstranjena.'; } }
    catch (e) { if (m) { m.className = 'msg bad show'; m.textContent = _bioNapaka(e); } }
    this.disabled = false; this.textContent = t;
    zapomniProfil({ email: JAZMAIL, name: JAZIME, avatar: (MOJPROFIL && MOJPROFIL.avatar_url) || '', uid: JAZ });
    await napolniBio();
  }); }

  /* ══════════ ADMIN — vloge in pravice (samo lastnik) ══════════ */
  var _ADMIN_OSNUTEK = null;   // delovna kopija konfiguracije
  function adminOsnutek() {
    if (_ADMIN_OSNUTEK) return _ADMIN_OSNUTEK;
    var o = { imena: {}, perm: {} };
    ADMIN_VLOGE.forEach(function (v) {
      o.imena[v] = roleIme(v);
      o.perm[v] = {};
      ADMIN_RAZDELKI.forEach(function (s) {
        var b = (ROLE_CFG && ROLE_CFG.perm && ROLE_CFG.perm[v] && ROLE_CFG.perm[v][s[0]]) || (ADMIN_PRIVZ[v] && ADMIN_PRIVZ[v][s[0]]) || _perm(0, 0, 0, 0);
        o.perm[v][s[0]] = _perm(b.r, b.w, b.x, b.d);
      });
    });
    _ADMIN_OSNUTEK = o; return o;
  }
  var _adminVloga = 'osebje';
  var _PRAV_ADMIN = [['r', 'Branje'], ['w', 'Pisanje'], ['x', 'Izvajanje'], ['d', 'Prenos']];
  var _PRAV_DOK = [['r', 'Branje'], ['w', 'Nalaganje'], ['x', 'Brisanje'], ['d', 'Prenos']];
  function adminPanelHtml(o) {
    var v = _adminVloga;
    var jeSuper = (v === 'super');
    var h = '<div class="panel adm-role">' +
      '<div class="adm-role-h"><input type="text" class="adm-ime" value="' + escape_(o.imena[v]) + '" maxlength="40" aria-label="Ime vloge"><span class="adm-role-key">' + escape_(v) + '</span></div>' +
      '<div class="adm-list">';
    ADMIN_RAZDELKI.forEach(function (s) {
      if (s[0] === 'dokumenti') {
        h += '<div class="adm-item adm-item-dok"><span class="adm-sec">Dokumenti</span><div class="adm-perms">' +
          _PRAV_DOK.map(function (p) { var on = o.perm[v].dokumenti[p[0]]; return '<label class="adm-pill' + (on ? ' on' : '') + (jeSuper ? ' dis' : '') + '"><input type="checkbox" data-s="dokumenti" data-p="' + p[0] + '"' + (on ? ' checked' : '') + (jeSuper ? ' disabled' : '') + '>' + p[1] + '</label>'; }).join('') +
          '</div></div>';
      } else if (s[0] === 'konzola') {
        // Konzola je na voljo SAMO lastniku — v seznamu je zaradi skladnosti s stranskim menijem,
        // a je ni mogoče dodeliti drugim vlogam.
        h += '<div class="adm-item"><span class="adm-sec">Konzola <span class="adm-only">samo lastnik</span></span>' +
          '<label class="adm-chk"><input type="checkbox" disabled' + (jeSuper ? ' checked' : '') + '><span></span></label></div>';
      } else {
        var on = o.perm[v][s[0]].r;
        h += '<div class="adm-item"><span class="adm-sec">' + escape_(s[1]) + '</span>' +
          '<label class="adm-chk"><input type="checkbox" data-s="' + s[0] + '" data-p="r"' + (on ? ' checked' : '') + (jeSuper ? ' disabled' : '') + '><span></span></label></div>';
      }
    });
    return h + '</div></div>';
  }
  function adminRisiPanel() {
    var host = $('adminRolePanel'); if (!host) return;
    var o = adminOsnutek();
    host.innerHTML = adminPanelHtml(o);
    var inp = host.querySelector('.adm-ime'); if (inp) inp.addEventListener('input', function () { o.imena[_adminVloga] = inp.value; var t = document.querySelector('#adminTabs [data-av="' + _adminVloga + '"]'); if (t) t.textContent = inp.value || _adminVloga; });
    host.querySelectorAll('input[type="checkbox"][data-s]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        o.perm[_adminVloga][cb.dataset.s][cb.dataset.p] = cb.checked;
        var pill = cb.closest('.adm-pill'); if (pill) pill.classList.toggle('on', cb.checked);
      });
    });
  }
  var _adminView = 'pravice';
  function risiAdmin() {
    var box = $('adminList'); if (!box) return;
    if (!JE_LASTNIK()) { box.innerHTML = '<div class="msg bad show">Dostop nima na voljo.</div>'; return; }
    box.innerHTML = '<div class="adm-top"><div class="pris-tabs" id="adminViewTabs">' +
      '<button type="button" class="pris-tab' + (_adminView === 'pravice' ? ' on' : '') + '" data-view="pravice">Vloge in pravice</button>' +
      '<button type="button" class="pris-tab' + (_adminView === 'dnevnik' ? ' on' : '') + '" data-view="dnevnik">Dnevnik sprememb</button>' +
      '</div></div><div id="adminBody"></div>';
    box.querySelectorAll('#adminViewTabs [data-view]').forEach(function (b) { b.addEventListener('click', function () { _adminView = b.dataset.view; box.querySelectorAll('#adminViewTabs [data-view]').forEach(function (x) { x.classList.toggle('on', x === b); }); adminRisiBody(); }); });
    adminRisiBody();
  }
  function adminRisiBody() {
    if (_adminView === 'dnevnik') return adminRisiDnevnik();
    return adminRisiPravice();
  }
  function adminRisiPravice() {
    var body = $('adminBody'); if (!body) return;
    _ADMIN_OSNUTEK = null;
    var o = adminOsnutek();
    if (ADMIN_VLOGE.indexOf(_adminVloga) < 0) _adminVloga = 'osebje';
    var tabs = '<div class="pris-tabs adm-tabs" id="adminTabs">' + ADMIN_VLOGE.map(function (v) { return '<button type="button" class="pris-tab' + (v === _adminVloga ? ' on' : '') + '" data-av="' + v + '">' + escape_(o.imena[v]) + '</button>'; }).join('') + '</div>';
    body.innerHTML = '' +
      '<div class="adm-top">' + tabs + '</div><div id="adminRolePanel"></div>' +
      '<div class="adm-save"><div class="msg" id="adminMsg" role="status"></div><button type="button" class="btn btn-narrow" id="adminShrani">Shrani pravice</button></div>';
    body.querySelectorAll('#adminTabs [data-av]').forEach(function (b) { b.addEventListener('click', function () { _adminVloga = b.dataset.av; body.querySelectorAll('#adminTabs [data-av]').forEach(function (x) { x.classList.toggle('on', x === b); }); adminRisiPanel(); }); });
    adminRisiPanel();
    var sb2 = $('adminShrani'); if (sb2) sb2.addEventListener('click', adminShrani);
  }
  var _adminLogFilter = '';
  async function adminRisiDnevnik() {
    var body = $('adminBody'); if (!body) return;
    body.innerHTML = '' +
      '<div class="filtri" style="margin:0 0 12px"><input type="search" id="adminLogIsci" placeholder="Iskanje po dnevniku …" aria-label="Iskanje"></div><div id="adminLogList">' + NALAGANJE + '</div>';
    var il = $('adminLogIsci'); if (il) { il.value = _adminLogFilter; il.addEventListener('input', function () { _adminLogFilter = this.value; adminRisiLogSez(); }); }
    var meja = new Date(Date.now() - 183 * 24 * 3600 * 1000).toISOString();
    var r;
    try { r = await sb.from('audit_log').select('kdo_ime,razdelek,akcija,opis,created_at').gte('created_at', meja).order('created_at', { ascending: false }).limit(1000); } catch (e) { r = { error: e }; }
    if (r && r.error) { $('adminLogList').innerHTML = '<div class="msg bad show">Napaka pri nalaganju.</div>'; return; }
    _ADMIN_LOG = r.data || [];
    adminRisiLogSez();
  }
  var _ADMIN_LOG = [];
  function adminRisiLogSez() {
    var host = $('adminLogList'); if (!host) return;
    var q = (_adminLogFilter || '').trim().toLowerCase();
    var vrstice = (_ADMIN_LOG || []).filter(function (l) { return !q || ((l.kdo_ime || '') + ' ' + (l.razdelek || '') + ' ' + (l.akcija || '') + ' ' + (l.opis || '')).toLowerCase().indexOf(q) >= 0; });
    if (!vrstice.length) { host.innerHTML = '<div class="empty"><h3>' + (q ? 'Ni zadetkov' : 'Ni zapisov') + '</h3></div>'; return; }
    host.innerHTML = '<div class="log-list">' + vrstice.map(function (l) {
      var dt = new Date(l.created_at).toLocaleString('sl-SI', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      return '<div class="log-row"><span class="log-raz">' + escape_(l.razdelek || '—') + '</span>' +
        '<div class="log-mid"><div class="log-op">' + escape_(l.akcija ? l.akcija + ' · ' : '') + escape_(l.opis || '') + '</div>' +
        '<div class="log-meta">' + escape_(l.kdo_ime || 'osebje') + ' · ' + escape_(dt) + '</div></div></div>';
    }).join('') + '</div>';
  }
  async function adminShrani() {
    var btn = $('adminShrani'), m = $('adminMsg');
    var o = adminOsnutek();
    // varovalo: super admin ima vedno polne pravice
    ADMIN_RAZDELKI.forEach(function (s) { if (s[0] !== 'katalog') { o.perm.super[s[0]] = _perm(1, 1, 1, 1); } });
    // Pri razdelkih razen Dokumentov velja samo »vpogled« (r) — ostalo poravnamo z r.
    ADMIN_VLOGE.forEach(function (v) {
      ADMIN_RAZDELKI.forEach(function (s) { if (s[0] !== 'dokumenti') { var r = !!o.perm[v][s[0]].r; o.perm[v][s[0]] = _perm(r, r, r, r); } });
      if (!o.imena[v] || !o.imena[v].trim()) o.imena[v] = ADMIN_IMENA_PRIVZ[v]; else o.imena[v] = o.imena[v].trim();
    });
    btn.disabled = true; var t = btn.textContent; btn.textContent = 'Shranjujem …';
    var up = await sb.from('app_config').upsert({ kljuc: 'role_config', vrednost: JSON.stringify(o) }, { onConflict: 'kljuc' });
    btn.disabled = false; btn.textContent = t;
    if (up && up.error) { m.className = 'msg bad show'; m.textContent = /app_config|relation|column/i.test(up.error.message || '') ? 'Najprej zaženi 29_app_config.sql v Supabase.' : ('Ni uspelo: ' + up.error.message); return; }
    ROLE_CFG = JSON.parse(JSON.stringify(o));
    m.className = 'msg show'; m.textContent = 'Pravice shranjene. Uporabniki jih vidijo ob naslednji osvežitvi.';
    try { meni(); } catch (e) {}
  }

  /* ══════════ OBVESTILA (konzola) ══════════ */
  var OBV_IKONA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';
  function obvVerjeni() { try { var a = JSON.parse(localStorage.getItem('sc-obv-seen') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function obvOznaciVerjeno(id) { try { var a = obvVerjeni(); if (a.indexOf(id) < 0) { a.push(id); if (a.length > 200) a = a.slice(-200); localStorage.setItem('sc-obv-seen', JSON.stringify(a)); } } catch (e) {} }
  function obvZaMene(o) { return !o.prejemnik || o.prejemnik === JAZ; }
  // Naloži aktualna obvestila zame (za toaste, zvonec in seznam »za nazaj«).
  async function naloziMojaObvestila() {
    if (!sb) return [];
    var r = await sb.from('obvestila').select('id,naslov,sporocilo,created_at,prejemnik,tip').eq('aktivno', true).order('created_at', { ascending: false }).limit(50);
    if (r && r.error) { r = await sb.from('obvestila').select('id,naslov,sporocilo,created_at,prejemnik').eq('aktivno', true).order('created_at', { ascending: false }).limit(50); }
    if (r && r.error) { r = await sb.from('obvestila').select('id,naslov,sporocilo,created_at').eq('aktivno', true).order('created_at', { ascending: false }).limit(50); }
    if (!r || r.error || !r.data) return [];
    return r.data.filter(obvZaMene);
  }
  // Prikaži eno obvestilo v pravi obliki: pojavno okno (modal) ali toast v kotu.
  function obvPrikazi(o) { if (o && o.tip === 'modal') narisiModalObvestilo(o); else narisiToast(o); }
  // Prikaži neprebrana aktivna obvestila (vsem ali meni osebno).
  async function pokaziObvestila() {
    if (!sb) return;
    var list = await naloziMojaObvestila();
    var vid = obvVerjeni();
    list.filter(function (o) { return vid.indexOf(o.id) < 0; }).reverse().forEach(obvPrikazi);
    osveziNotifZnak(list);
  }
  // Pika na zvoncu, če je kaj neprebranega.
  function osveziNotifZnak(list) {
    var dot = $('notifDot'); if (!dot) return;
    var vid = obvVerjeni();
    var neprebrano = (list || []).some(function (o) { return vid.indexOf(o.id) < 0; });
    dot.hidden = !neprebrano;
  }
  // Zvonec: seznam obvestil »za nazaj«.
  async function odpriNotif() {
    var panel = $('notifPanel'), lst = $('notifList'); if (!panel || !lst) return;
    if (!panel.classList.contains('hidden')) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    lst.innerHTML = '<div class="notif-empty">Nalagam …</div>';
    var list = await naloziMojaObvestila();
    if (!list.length) { lst.innerHTML = '<div class="notif-empty">Ni obvestil.</div>'; }
    else {
      lst.innerHTML = list.map(function (o) {
        var dat = new Date(o.created_at).toLocaleString('sl-SI', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        return '<div class="notif-item">' + (o.naslov ? '<div class="notif-nas">' + escape_(o.naslov) + '</div>' : '') +
          '<div class="notif-txt">' + escape_(o.sporocilo || '') + '</div><div class="notif-dat">' + escape_(dat) + '</div></div>';
      }).join('');
    }
    // ob odprtju označimo vse kot prebrano → pika izgine
    list.forEach(function (o) { obvOznaciVerjeno(o.id); });
    osveziNotifZnak(list);
  }
  { var _notb = $('notifBtn'); if (_notb) _notb.addEventListener('click', function (e) { e.stopPropagation(); odpriNotif(); }); }
  document.addEventListener('click', function (e) {
    var p = $('notifPanel'); if (!p || p.classList.contains('hidden')) return;
    if (!p.contains(e.target) && !(e.target.closest && e.target.closest('#notifBtn'))) p.classList.add('hidden');
  });
  function narisiToast(o) {
    var wrap = $('obvWrap'); if (!wrap) return;
    if (wrap.querySelector('[data-obv="' + o.id + '"]')) return;
    var el = document.createElement('div');
    el.className = 'obv-card'; el.setAttribute('data-obv', o.id);
    el.innerHTML = '<span class="obv-ic">' + OBV_IKONA + '</span>' +
      '<div class="obv-body">' + (o.naslov ? '<div class="obv-nas">' + escape_(o.naslov) + '</div>' : '') +
      '<div class="obv-txt">' + escape_(o.sporocilo || '') + '</div></div>' +
      '<button type="button" class="obv-x" aria-label="Zapri">' + IKO_ZAPRI + '</button>';
    el.querySelector('.obv-x').addEventListener('click', function () { obvOznaciVerjeno(o.id); el.remove(); });
    wrap.appendChild(el);
  }
  // Pojavno obvestilo na sredini z gumbom »V redu« (v vrsti, eno naenkrat).
  var _obvMq = [], _obvMon = false;
  function narisiModalObvestilo(o) {
    if (!o || obvVerjeni().indexOf(o.id) >= 0) return;
    if (_obvMq.some(function (x) { return x.id === o.id; })) return;
    if (document.querySelector('.sc-modal-back[data-obvm="' + o.id + '"]')) return;
    _obvMq.push(o); obvModalNaprej();
  }
  function obvModalNaprej() {
    if (_obvMon) return;
    var o = _obvMq.shift(); if (!o) return;
    _obvMon = true;
    var back = document.createElement('div');
    back.className = 'sc-modal-back'; back.setAttribute('data-obvm', o.id);
    back.innerHTML = '<div class="sc-modal sc-modal-obv" role="dialog" aria-modal="true"><span class="obvm-ic">' + OBV_IKONA + '</span><h4></h4><p></p><div class="sc-modal-acts one"><button type="button" class="sc-modal-btn primary" data-ok></button></div></div>';
    back.querySelector('h4').textContent = o.naslov || 'Obvestilo';
    back.querySelector('p').textContent = o.sporocilo || '';
    back.querySelector('[data-ok]').textContent = 'V redu';
    document.body.appendChild(back);
    requestAnimationFrame(function () { back.classList.add('show'); });
    var done = false;
    function zapri() {
      if (done) return; done = true;
      obvOznaciVerjeno(o.id);
      back.classList.remove('show');
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); _obvMon = false; obvModalNaprej(); }, 180);
    }
    function onKey(e) { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); zapri(); } }
    back.querySelector('[data-ok]').addEventListener('click', function (e) { e.stopPropagation(); zapri(); });
    back.addEventListener('click', function (e) { if (e.target === back) zapri(); });
    document.addEventListener('keydown', onKey);
    var ob = back.querySelector('[data-ok]'); if (ob) ob.focus();
  }
  // Živa dostava: realtime (če deluje) + zanesljiva osvežitev vsakih 60 s.
  var _obvKanal = null, _obvTimer = null;
  function narociObvestila() {
    if (!sb) return;
    // Realtime (bonus, za trenutno dostavo). Potrebuje avtorizacijo z žetonom.
    if (!_obvKanal) {
      try {
        sb.auth.getSession().then(function (s) {
          try { var tok = s && s.data && s.data.session && s.data.session.access_token; if (tok && sb.realtime && sb.realtime.setAuth) sb.realtime.setAuth(tok); } catch (e) {}
          _obvKanal = sb.channel('obvestila-live')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'obvestila' }, function (p) {
              var o = p && p.new; if (o && o.aktivno && obvVerjeni().indexOf(o.id) < 0 && obvZaMene(o)) obvPrikazi(o);
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_config' }, function (p) {
              var o = p && p.new; if (o && o.kljuc === 'reload' && _reloadVal != null && String(o.vrednost) !== String(_reloadVal)) osveziAplikacijo();
            })
            .subscribe();
        });
      } catch (e) {}
    }
    // Zanesljiva rezerva: preveri nova obvestila + potisnjeno osvežitev vsakih 60 s.
    if (!_obvTimer) {
      _obvTimer = setInterval(function () {
        if (document.hidden) return;
        try { pokaziObvestila(); } catch (e) {}
        try { preveriReload(); } catch (e) {}
      }, 60000);
    }
  }
  /* ── Živo usklajevanje s tablico, telefonom, aplikacijo RFID in drugimi zavihki ──
     Spremni listi in čipi, ki jih spremeni druga naprava, se pokažejo sami (realtime); nov list
     za trenutek zasveti. Rezerva: ob vrnitvi v zavihek in vsaki 2 min, ko živa povezava ne deluje.
     Med urejanjem (odprto okno, vnos) prikaz počaka — podatki se osvežijo, slika šele po urejanju. */
  var _zivKanal = null, _zivZivo = false, _zivT = null, _zivRfT = null, _zivZadnje = Date.now();
  function narociZivo() {
    if (!sb || !OSEBJE || _zivKanal) return;
    try {
      sb.auth.getSession().then(function (s) {
        try { var tok = s && s.data && s.data.session && s.data.session.access_token; if (tok && sb.realtime && sb.realtime.setAuth) sb.realtime.setAuth(tok); } catch (e) {}
        _zivKanal = sb.channel('portal-zivo')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_notes' }, zivListi)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_note_items' }, zivPostavke)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rfid_dogodki' }, zivCipi)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rfid_seje' }, zivCipi)
          .subscribe(function (st) { _zivZivo = st === 'SUBSCRIBED'; });
      });
    } catch (e) {}
    document.addEventListener('visibilitychange', function () { if (!document.hidden && Date.now() - _zivZadnje > 60000) { zivListi(); zivCipi(); } });
    setInterval(function () { if (!document.hidden && !_zivZivo && Date.now() - _zivZadnje > 120000) { zivListi(); zivCipi(); } }, 30000);
  }
  function zivListi() { pozabiDeli(); clearTimeout(_zivT); _zivT = setTimeout(zivOsveziListe, 800); }
  // postavke je spremenila druga naprava (urejanje, preimenovanje artikla): shranjene postavke tega lista ne veljajo več
  function zivPostavke(p) { var n = p && ((p.new && p.new.note_id) || (p.old && p.old.note_id)); pozabiPostavke(n || null); zivListi(); }   // zivListi pozabi tudi skupne podatke   // več sprememb naenkrat = ena osvežitev
  async function zivOsveziListe() {
    _zivZadnje = Date.now();
    var prej = {}; LISTI.forEach(function (l) { prej[l.id] = 1; });
    try { await naloziListe(); } catch (e) { return; }
    zivNarisi(LISTI.filter(function (l) { return !prej[l.id]; }).map(function (l) { return l.id; }));
  }
  function zivNarisi(novi) {
    var sec = document.querySelector('.sec:not(.hidden)'), id = sec && sec.id;
    if (id !== 'sec-arhiv' && id !== 'sec-domov') return;   // drugi razdelki preberejo sveže liste ob odprtju
    if (zaposlenZDelom()) { clearTimeout(_zivT); _zivT = setTimeout(function () { zivNarisi(novi); }, 3000); return; }
    var sy = window.scrollY;
    if (id === 'sec-arhiv') risiArhiv(); else risiPregled(true);
    requestAnimationFrame(function () {
      window.scrollTo(0, sy);
      (novi || []).forEach(function (nid) {
        var k = document.querySelector('.a-row[data-id="' + String(nid).replace(/"/g, '\\"') + '"]');
        if (k) { k.classList.add('arh-flash'); setTimeout(function () { k.classList.remove('arh-flash'); }, 1700); }
      });
    });
  }
  // čipi: druga naprava je označila ali skenirala — Kosi se osvežijo, neznani čipi v skeniranju se poiščejo znova
  function zivCipi() {
    pozabiDeli();
    clearTimeout(_zivRfT);
    _zivRfT = setTimeout(function () {
      var sec = $('sec-cipi'); if (!sec || sec.classList.contains('hidden')) { RF.kosi = null; return; }
      if (RF.sken.length) { rfPozabi(RF.sken); var p = rfIsci(true); if (p && p.catch) p.catch(rfIsciNapaka); }
      if (RF.nacin === 'kosi' && RF.org && !_okno && !document.querySelector('.sc-modal-back')) {
        rfNalozi(RF.org).then(function (ok) { if (ok) { rfRisi(); rfPod(); } }, function () {});
      }
    }, 900);
  }
  /* ── Potisnjena osvežitev vseh (po posodobitvi portala) ── */
  async function preberiReload() {
    try { var r = await sb.from('app_config').select('vrednost').eq('kljuc', 'reload').maybeSingle(); if (r && r.data) _reloadVal = r.data.vrednost; } catch (e) {}
  }
  // Med urejanjem (odprto okno, potrditev, vnos v polje) osvežitev počaka — prej je takoj
  // osvežila stran in napol vpisan spremni list ali opomba sta se izgubila.
  function zaposlenZDelom() {
    var a = document.activeElement;
    return !!(_okno || document.querySelector('.sc-modal-back') || (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'search'));
  }
  var _osveziCaka = null;
  async function osveziAplikacijo() {
    if (zaposlenZDelom()) {
      if (!_osveziCaka) {
        toast('Na voljo je nova različica portala — osvežim, ko zaključiš urejanje.');
        _osveziCaka = setInterval(function () { if (!zaposlenZDelom()) { clearInterval(_osveziCaka); _osveziCaka = null; osveziAplikacijo(); } }, 4000);
      }
      return;
    }
    // samo portal (/): aplikacija za spremne liste (/mobile) ima na isti domeni svoj service worker
    // in predpomnilnik — prej sta bila izbrisana tudi ta in na iPhonu se brez povezave ni odprla
    // Stran (HTML) gre vedno najprej na mrežo (sw.js), nova koda ima novo oznako ?v= → navaden ponovni zagon zadošča.
    // Prej sta se odjavila service worker in izbrisala shramba: naslednje odprtje pri slabi povezavi je bila bela stran.
    try { if ('serviceWorker' in navigator) { var reg = await navigator.serviceWorker.getRegistration('/'); if (reg) await Promise.race([reg.update(), new Promise(function (r) { setTimeout(r, 3000); })]); } } catch (e) {}
    location.reload();
  }
  async function preveriReload() {
    try {
      var r = await sb.from('app_config').select('vrednost').eq('kljuc', 'reload').maybeSingle();
      var v = r && r.data ? r.data.vrednost : null;
      if (v != null && _reloadVal != null && String(v) !== String(_reloadVal)) osveziAplikacijo();
    } catch (e) {}
  }
  { var _prb = $('pushRefreshBtn'); if (_prb) _prb.addEventListener('click', async function () {
    var m = $('pushRefreshMsg');
    var ok = await potrdiModal({ naslov: 'Osveži aplikacijo vsem', sporocilo: 'Vsi trenutno prijavljeni uporabniki bodo v nekaj sekundah samodejno osveženi in naložijo novo različico. Nadaljujem?', potrdi: 'Osveži vsem', preklici: 'Prekliči' });
    if (!ok) return;
    this.disabled = true; var t = this.textContent; this.textContent = 'Pošiljam …';
    var val = String(Date.now());
    var r = await sb.from('app_config').upsert({ kljuc: 'reload', vrednost: val }, { onConflict: 'kljuc' });
    this.disabled = false; this.textContent = t;
    if (r && r.error) { m.className = 'msg bad show'; m.textContent = /app_config|relation|column/i.test(r.error.message || '') ? 'Najprej zaženi 29_app_config.sql v Supabase.' : 'Ni uspelo: ' + r.error.message; return; }
    _reloadVal = val; // da se pošiljatelj ne osveži sam
    m.className = 'msg show'; m.textContent = 'Osvežitev je poslana. Uporabniki se osvežijo v nekaj sekundah.';
  }); }
  // Naloži seznam uporabnikov v izbirnik prejemnika + zgradi zemljevid imen.
  var _konzImena = {};
  async function naloziKonzUporabnike() {
    var r = await sb.from('profiles').select('id,full_name,email,active').order('full_name');
    var d = (r && r.data) ? r.data : [];
    _konzImena = {};
    d.forEach(function (u) { _konzImena[u.id] = u.full_name || u.email; });
    var sel = $('konzKomu');
    if (sel) {
      var cur = sel.value;
      sel.innerHTML = '<option value="">Vsi uporabniki</option>' + d.map(function (u) {
        return '<option value="' + escape_(u.id) + '">' + escape_(u.full_name || u.email) + (u.active === false ? ' (izklopljen)' : '') + '</option>';
      }).join('');
      sel.value = cur;
    }
  }
  // ── Konzola (samo lastnik): pisanje in pregled obvestil ──
  async function risiKonzola() {
    var list = $('konzList'); if (!list) return;
    try { await naloziKonzUporabnike(); } catch (e) {}
    list.innerHTML = '<div class="konz-txt">Nalagam …</div>';
    var r = await sb.from('obvestila').select('id,naslov,sporocilo,aktivno,created_at,prejemnik,tip').order('created_at', { ascending: false }).limit(50);
    if (r && r.error) { r = await sb.from('obvestila').select('id,naslov,sporocilo,aktivno,created_at,prejemnik').order('created_at', { ascending: false }).limit(50); }
    if (r && r.error) { r = await sb.from('obvestila').select('id,naslov,sporocilo,aktivno,created_at').order('created_at', { ascending: false }).limit(50); }
    if (!r || r.error) { list.innerHTML = '<div class="konz-txt">Napaka pri nalaganju.</div>'; return; }
    if (!r.data || !r.data.length) { list.innerHTML = '<div class="konz-txt">Ni še poslanih obvestil.</div>'; return; }
    list.innerHTML = r.data.map(function (o) {
      var dat = new Date(o.created_at).toLocaleString('sl-SI', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      var komu = o.prejemnik ? ('za: ' + escape_(_konzImena[o.prejemnik] || 'uporabnika')) : 'vsem';
      var oblika = (o.tip === 'modal') ? ' · pojavno okno' : '';
      return '<div class="konz-row' + (o.aktivno ? '' : ' off') + '" data-id="' + o.id + '">' +
        '<div class="k-body">' + (o.naslov ? '<div class="konz-nas">' + escape_(o.naslov) + '</div>' : '') +
        '<div class="konz-txt">' + escape_(o.sporocilo || '') + '</div>' +
        '<div class="konz-meta">' + escape_(dat) + ' · ' + komu + oblika + (o.aktivno ? '' : ' · skrito') + '</div></div>' +
        '<div class="konz-acts">' +
        '<button type="button" class="btn-mini k-tog" data-id="' + o.id + '" data-ak="' + (o.aktivno ? '1' : '0') + '">' + (o.aktivno ? 'Skrij' : 'Prikaži') + '</button>' +
        '<button type="button" class="btn-mini danger k-del" data-id="' + o.id + '">Izbriši</button>' +
        '</div></div>';
    }).join('');
    list.querySelectorAll('.k-tog').forEach(function (b) { b.addEventListener('click', async function () {
      await sb.from('obvestila').update({ aktivno: b.dataset.ak !== '1' }).eq('id', b.dataset.id); risiKonzola();
    }); });
    list.querySelectorAll('.k-del').forEach(function (b) { b.addEventListener('click', async function () {
      await sb.from('obvestila').delete().eq('id', b.dataset.id); risiKonzola();
    }); });
  }
  { var _kf = $('konzForm'); if (_kf) _kf.addEventListener('submit', async function (e) {
    e.preventDefault();
    var m = $('konzMsg'), btn = $('konzBtn');
    var nas = $('konzNas').value.trim(), txt = $('konzTxt').value.trim();
    var komu = $('konzKomu') ? $('konzKomu').value : '';
    var tip = ($('konzTip') && $('konzTip').value === 'modal') ? 'modal' : 'toast';
    if (!txt) { m.className = 'msg bad show'; m.textContent = 'Vpiši sporočilo.'; return; }
    btn.disabled = true; btn.textContent = 'Pošiljam …';
    var base = { naslov: nas || null, sporocilo: txt, aktivno: true, prejemnik: komu || null };
    var tipManjka = false;
    var r = await sb.from('obvestila').insert(Object.assign({}, base, { tip: tip })).select('id,naslov,sporocilo,created_at,prejemnik,tip').single();
    if (r && r.error && /\btip\b/i.test(r.error.message || '')) {
      tipManjka = true;
      r = await sb.from('obvestila').insert(base).select('id,naslov,sporocilo,created_at,prejemnik').single();
    }
    if (r && r.error && /prejemnik/i.test(r.error.message || '')) {
      if (komu) { btn.disabled = false; btn.textContent = 'Pošlji'; m.className = 'msg bad show'; m.textContent = 'Za pošiljanje eni osebi najprej zaženi 26_obvestila_prejemnik.sql v Supabase.'; return; }
      r = await sb.from('obvestila').insert({ naslov: nas || null, sporocilo: txt, aktivno: true }).select('id,naslov,sporocilo,created_at').single();
    }
    btn.disabled = false; btn.textContent = 'Pošlji';
    if (r && r.error) { m.className = 'msg bad show'; m.textContent = 'Ni uspelo: ' + r.error.message; return; }
    $('konzNas').value = ''; $('konzTxt').value = ''; if ($('konzKomu')) $('konzKomu').value = ''; if ($('konzTip')) $('konzTip').value = 'toast';
    if (tipManjka && tip === 'modal') {
      m.className = 'msg bad show'; m.textContent = 'Poslano kot navadno obvestilo. Za pojavna okna najprej zaženi 30_obvestila_tip.sql v Supabase.';
    } else {
      m.className = 'msg show'; m.textContent = komu ? ('Obvestilo je poslano uporabniku ' + (_konzImena[komu] || '') + '.') : 'Obvestilo je poslano vsem uporabnikom.';
    }
    if (r && r.data) { if (tipManjka) r.data.tip = 'toast'; if (!r.data.prejemnik || r.data.prejemnik === JAZ) obvPrikazi(r.data); } // pokaži pošiljatelju le, če je zanj
    risiKonzola();
  }); }

  /* ══════════ POZIV ZA BIOMETRIJO OB PRVI PRIJAVI ══════════ */
  function morebitiPromoBio() {
    if (!bioPodprt() || !JAZ) return;
    if (bioVklopljen(JAZ)) return;
    var kljuc = 'sc-bioask-' + JAZ;
    try { if (localStorage.getItem(kljuc)) return; } catch (e) {}
    try { localStorage.setItem(kljuc, '1'); } catch (e) {}
    var el = $('bioPromo'); if (!el) return;
    setTimeout(function () { el.classList.remove('hidden'); }, 700);
  }
  function zapriPromoBio() { var el = $('bioPromo'); if (el) el.classList.add('hidden'); }
  { var _bpo = $('bioPromoOn'); if (_bpo) _bpo.addEventListener('click', async function () {
    var m = $('bioPromoMsg'); this.disabled = true; var t = this.textContent; this.innerHTML = '<span class="bio-pulse"></span>Potrjevanje …';
    try { await bioOmogoci(); if (m) { m.className = 'msg'; m.textContent = ''; } zapriPromoBio(); }
    catch (e) { if (m) { m.className = 'msg bad show'; m.textContent = _bioNapaka(e); } }
    this.disabled = false; this.textContent = t;
  }); }
  { var _bpl = $('bioPromoLater'); if (_bpl) _bpl.addEventListener('click', zapriPromoBio); }

  /* ══════════ RAZKRIJ GESLO (očesce na vseh poljih za geslo) ══════════ */
  var _OKO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  var _OKO_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a13.2 13.2 0 0 1-1.67 2.68"/><path d="M6.1 6.1A13.3 13.3 0 0 0 2 12s3 8 10 8a9.3 9.3 0 0 0 5.9-2.1"/><path d="M14.12 14.12A3 3 0 1 1 9.88 9.88"/><path d="m3 3 18 18"/></svg>';
  function opremiGesla(koren) {
    (koren || document).querySelectorAll('input[type="password"]').forEach(function (inp) {
      if (inp._pwEye) return; inp._pwEye = true;
      var wrap = document.createElement('span'); wrap.className = 'pw-wrap';
      if (inp.parentNode) { inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp); }
      var b = document.createElement('button'); b.type = 'button'; b.className = 'pw-eye';
      b.setAttribute('aria-label', 'Pokaži geslo'); b.title = 'Pokaži geslo'; b.tabIndex = -1;
      b.innerHTML = _OKO; wrap.appendChild(b);
      b.addEventListener('click', function (e) {
        e.preventDefault();
        var pokazi = inp.type === 'password';
        inp.type = pokazi ? 'text' : 'password';
        b.innerHTML = pokazi ? _OKO_OFF : _OKO;
        b.setAttribute('aria-label', pokazi ? 'Skrij geslo' : 'Pokaži geslo');
        b.title = pokazi ? 'Skrij geslo' : 'Pokaži geslo';
        try { inp.focus(); var n = inp.value.length; inp.setSelectionRange(n, n); } catch (_) {}
      });
    });
  }
  try { opremiGesla(document); } catch (e) {}

  /* ══════════ OBNOVITEV SEJE ══════════ */
  // povezava povabila na napravi, kjer je že kdo prijavljen: ponudi odjavo (sicer bi se koda tiho izgubila)
  async function povabiloPriSeji(k) {
    var ok = await potrdiModal({ naslov: 'Povabilo', sporocilo: 'Prijavljeni ste kot ' + (JAZMAIL || 'drug uporabnik') + '. Za nov račun s tem povabilom se odjavite.', potrdi: 'Odjava', preklici: 'Ostani' });
    if (!ok) return;
    try { sessionStorage.setItem('sc-povabilo-koda', k); } catch (e) {}   // odjava sama sproži ponovno nalaganje: koda počaka v seji
    try { $('app').classList.remove('show'); await sb.auth.signOut({ scope: 'local' }); } catch (e) {}
    location.href = location.pathname;
  }
  // povezava povabila (?koda=…, tudi iz kode QR): koda iz naslova takoj ven (zgodovina, posnetki zaslona)
  var _urlKoda = '';
  try { var _up = new URLSearchParams(location.search); _urlKoda = (_up.get('koda') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10); if (_up.has('koda')) { _up.delete('koda'); history.replaceState(null, '', location.pathname + (_up.toString() ? '?' + _up : '') + location.hash); } } catch (e) {}
  try { if (!_urlKoda) _urlKoda = (sessionStorage.getItem('sc-povabilo-koda') || '').slice(0, 10); sessionStorage.removeItem('sc-povabilo-koda'); } catch (e) {}   // po odjavi zaradi povabila
  try { if (window.__SC && sb) window.__SC.zaganjam = true; } catch (e) {}   // boot.js in start.js zagonskega zaslona ne umakneta (morda čaka na povezavo)
  (async function () {
    if (!sb) return;
    let recovery = false;
    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        recovery = true;
        $('profilePicker').classList.add('hidden');
        $('authBox').classList.remove('hidden');
        showAuthPane('newPwForm');
      }
      // Seja je bila ukinjena drugje (drug zavihek, potečen žeton): namesto praznih seznamov prijava.
      if (event === 'SIGNED_OUT' && $('app') && $('app').classList.contains('show')) { setTimeout(function () { location.reload(); }, 50); return; }
      // Face ID: ob prijavi/osvežitvi posodobi žeton tega uporabnika, da ostane veljaven.
      if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && session) { try { bioOsveziZetone(session); } catch (e) {} }
    });
    // Takoj pokaži pravi zaslon (brez utripa napačnega). Če je to obnovitev gesla,
    // spodnji onAuthStateChange to prepiše na obrazec za novo geslo.
    if (!recovery) {
      // Živa seja (osvežitev strani / vrnitev v zavihek) → OSTANI prijavljen,
      // tako kot pri velikih ponudnikih. Odjava (gumb) sejo ukine → spodaj izbirnik.
      var _seja = null;
      // seja je na napravi; če je potekla, jo supabase osveži prek omrežja — ob izpadu počakaj, ne pokaži prijave
      for (;;) {
        var _rs = null;
        try { _rs = await sb.auth.getSession(); } catch (e) { _rs = { error: e }; }
        if (_rs && _rs.error && jeOmreznaNapaka(_rs.error)) { await povPocakaj(1500); continue; }
        _seja = _rs && _rs.data && _rs.data.session; break;
      }
      var _zagonMsg = '';
      if (!recovery && _seja && _seja.user) {
        try { if (await start() !== false) { if (_urlKoda && REG_IMA) povabiloPriSeji(_urlKoda); return; } } catch (e) { ZAGON_NAPAKA = e; }
        _zagonMsg = zagonSporocilo();
        // neveljavna seja (ne le brez povezave) → pozabi jo na tej napravi, da se ne ponavlja
        if (!jeOmreznaNapaka(ZAGON_NAPAKA)) { try { await sb.auth.signOut({ scope: 'local' }); } catch (e) {} }
      }
      if (!recovery) {
        if (_urlKoda && REG_IMA) regOdpri(_urlKoda);
        else if (beriProfile().length) { pokaziIzbirnik(); if (_zagonMsg) { var _pm = $('ppMsg'); if (_pm) { _pm.className = 'msg bad show'; _pm.textContent = _zagonMsg; } } }
        else pokaziPrijavo('', _zagonMsg);
      }
    }
    // Prijavni zaslon je pripravljen → umakni zagonski zaslon.
    zagonKonec();
  })().catch(function () { zagonKonec(); });

  /* Šele tu vemo, da se je celotna skripta prevedla in izvedla. */
  if (window.__SC) window.__SC.ok = true;
})();
