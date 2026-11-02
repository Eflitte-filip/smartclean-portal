/* SmartClean RFID — aplikacija za ročni čitalec Chainway C72 (zaposleni)
   ─────────────────────────────────────────────────────────────────────
   Edino, kar je na C72 (aplikacija-rfid/ jo odpre kot kiosk). Zaposleni do portala nimajo dostopa;
   pravico »Aplikacija RFID« jim dodeli skrbnik v portalu (Uporabniki). Baza preverja vse sama
   (74_rfid_aplikacija.sql): čipi, označevanje, potrditev, imena strank in artiklov, tisk le
   spremnih listov, ki jih je ustvarila ta aplikacija.

   Kdo dela: osebe, ki so se na napravi enkrat prijavile z geslom; menjava s PIN-om (nastavi se v
   portalu, preveri se na napravi — enako kot tablica, 67_app_pini.sql). Zadnja oseba ostane prijavljena.

   Čitalec: aplikacija na C72 da window.ScRfid (vgrajen čitalec, R1 prek USB, UR4 prek omrežja) in
   dogodke »scrfid« (stanje, prebrani čipi). Brez nje (brskalnik, R1 kot tipkovnica) je polje za čip. */
(function () {
  'use strict';
  var cfg = window.SC_CONFIG || {};
  var sb = null;

  /* ══════════ POVEZAVA (enako kot portal) ══════════
     Trak »Ni povezave« pod zgornjo vrstico; sam preverja čez 2, 4, 8 … do 30 s (»Poskusi zdaj« takoj).
     Ob vrnitvi za trenutek pozeleni, živi kanal se znova poveže, čipi se osvežijo.
     »Počasna povezava«: zahteva visi več kot 6 s ali živi kanal ne odgovori na utrip → izmeri majhno
     zahtevo; traja več kot 2,5 s → trak (počasna poizvedba na hitri povezavi ga ne prižge). */
  var POV = { stanje: 'ok', cakaj: 2000, ura: null, tik: null, do: 0, el: null, merim: false, pocasiUra: null, vidno: 0 };
  var _izvFetch = window.fetch.bind(window);
  function povFetch(vir, opt) {
    var visi = setTimeout(povMeri, 6000);
    return _izvFetch(vir, opt).then(function (r) { clearTimeout(visi); if (POV.stanje === 'ni' || POV.stanje === 'povezujem') povNazaj(); return r; },
      function (e) { clearTimeout(visi); if (!(e && e.name === 'AbortError')) povNapaka(); throw e; });
  }
  // ena spodletela zahteva še ni izpad (iOS jo ob vrnitvi v aplikacijo rad zavrne, branje se samo ponovi): najprej izmeri
  function povNapaka() { if (navigator.onLine === false) povIzpad(); else povMeri(); }
  async function povMeri() {
    if (POV.merim || (POV.stanje !== 'ok' && POV.stanje !== 'pocasi')) return;
    POV.merim = true;
    var t0 = Date.now(), ok = await povPreveri(10000);
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
  function povUtrip(st, ms) {   // čas utripa teče od pošiljanja: čas v ozadju ali zamrznjene strani ne šteje
    if (document.hidden || Date.now() - POV.vidno < (ms || 0) + 1000) return;
    if (st === 'timeout' || (st === 'ok' && ms > 4000)) povMeri();
  }
  function povTrak() {
    if (!POV.el) {
      POV.el = document.createElement('div'); POV.el.className = 'pov-trak'; POV.el.setAttribute('role', 'status'); POV.el.setAttribute('aria-live', 'polite');
      POV.el.innerHTML = '<span class="pov-pika" aria-hidden="true"></span><span class="pov-t"></span><button type="button" class="pov-zdaj">Poskusi zdaj</button>';
      POV.el.querySelector('.pov-zdaj').addEventListener('click', function () { povPoskus(); });
    }
    var glava = [document.querySelector('#app .topbar'), document.querySelector('#auth .auth-top')].filter(function (h) { return h && h.getClientRects().length > 0; })[0];   // offsetParent je pri pritrjeni (fixed) vrstici vedno null
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
    if (POV.stanje === 'spet') { t.textContent = 'Spet povezano'; z.hidden = true; }
    else if (POV.stanje === 'povezujem') { t.textContent = 'Povezujem …'; z.hidden = true; }
    else if (POV.stanje === 'pocasi') { t.textContent = 'Počasna povezava'; z.hidden = true; }
    else { t.textContent = 'Ni povezave · znova čez ' + Math.max(1, Math.ceil((POV.do - Date.now()) / 1000)) + ' s'; z.hidden = false; }
  }
  function povIzpad() {
    if (POV.stanje === 'ni' || POV.stanje === 'povezujem') return;
    POV.stanje = 'ni'; POV.cakaj = 2000; povNacrtuj();
  }
  function povNacrtuj() {
    clearTimeout(POV.ura); clearInterval(POV.tik);
    POV.do = Date.now() + POV.cakaj;
    POV.ura = setTimeout(povPoskus, POV.cakaj);
    POV.tik = setInterval(function () { if (POV.stanje === 'ni') povRisi(); }, 1000);
    povRisi();
  }
  async function povPreveri(rok) {
    if (!cfg.url) return navigator.onLine !== false;
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, rok || 6000);
    try { var r = await _izvFetch(cfg.url + '/auth/v1/health', { headers: { apikey: cfg.key }, cache: 'no-store', signal: ctl.signal }); return r.status < 500; }
    catch (e) { return false; } finally { clearTimeout(t); }
  }
  async function povPoskus() {
    if (POV.stanje === 'ok' || POV.stanje === 'spet') return;
    clearTimeout(POV.ura); clearInterval(POV.tik);
    POV.stanje = 'povezujem'; povRisi();
    var ok = await povPreveri();
    if (POV.stanje !== 'povezujem') return;   // vmes je uspela druga zahteva (trak je že »Spet povezano«)
    if (ok) { povNazaj(); return; }
    POV.stanje = 'ni'; POV.cakaj = Math.min(30000, POV.cakaj * 2); povNacrtuj();
  }
  function povNazaj() {
    if (POV.stanje === 'ok' || POV.stanje === 'spet') return;
    clearTimeout(POV.ura); clearInterval(POV.tik);
    POV.stanje = 'spet'; povRisi();
    try { if (sb && sb.realtime) sb.realtime.connect(); } catch (e) {}
    try {
      if (JAZ) { zivCipi(); if (RF.nacin === 'oznaci' && RF.org && !RF.arts[RF.org]) rfNapolniArtikle(); }
      else if (!$('osebe').classList.contains('hidden') && !modalOdprt()) zagon2();   // »Kdo dela« po neuspeli prijavi: znova (ne čez odprt PIN)
    } catch (e) {}
    setTimeout(function () { if (POV.stanje === 'spet') { POV.stanje = 'ok'; povRisi(); } }, 1800);
  }
  window.addEventListener('offline', povIzpad);
  window.addEventListener('online', function () { if (POV.stanje === 'ni') povPoskus(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { POV.vidno = Date.now(); if (navigator.onLine === false) povIzpad(); } });
  document.addEventListener('resume', function () { POV.vidno = Date.now(); });   // zamrznjena stran (Chrome) se je zbudila
  if (navigator.onLine === false) setTimeout(povIzpad, 0);

  try {
    if (window.supabase && window.supabase.createClient && cfg.url) {
      sb = window.supabase.createClient(cfg.url, cfg.key, { global: { fetch: povFetch }, realtime: { heartbeatCallback: povUtrip }, auth: { storageKey: 'sc-rfid-seja', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    }
  } catch (e) { sb = null; }
  var $ = function (id) { return document.getElementById(id); };
  var LS = {
    beri: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    pisi: function (k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var NI_DOSTOPA = 'Ta račun nima dostopa do aplikacije RFID.';

  // ── pomožne (enako kot v portalu) ──
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function stevilo(n) { return Number(n || 0).toLocaleString('sl-SI'); }
  function sklonKosov(n) { var m = n % 100; return stevilo(n) + ' ' + (m === 1 ? 'kos' : m === 2 ? 'kosa' : (m === 3 || m === 4) ? 'kosi' : 'kosov'); }
  function sklonStrank(n) { var m = n % 100; return stevilo(n) + ' ' + (m === 1 ? 'stranka' : m === 2 ? 'stranki' : (m === 3 || m === 4) ? 'stranke' : 'strank'); }
  function sklonListov(n) { var m = n % 100; return stevilo(n) + ' ' + (m === 1 ? 'spremni list' : m === 2 ? 'spremna lista' : (m === 3 || m === 4) ? 'spremni listi' : 'spremnih listov'); }
  function datumCas(ts) { return ts ? new Date(ts).toLocaleDateString('sl-SI', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''; }
  function datumDan(d) { return d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('sl-SI', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'; }
  function tezaFmt(kg) {
    kg = Math.round((Number(kg) || 0) * 100) / 100;
    var v = kg >= 1000 ? kg / 1000 : kg, u = kg >= 1000 ? 't' : 'kg';
    return v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',') + ' ' + u;
  }
  function zacetnice(ime) {
    var d = String(ime || '').trim().split(/\s+/).filter(Boolean);
    return ((d[0] || '?').charAt(0) + (d.length > 1 ? d[d.length - 1].charAt(0) : '')).toUpperCase();
  }
  function jeOmrezna(e) { return !!(e && e.code === 'TIMEOUT') || /fetch|network|load failed|timeout|ni povezave|aborterror/i.test(String((e && (e.message || e.name)) || e || '')); }
  // klic z rokom: brez odgovora v 30 s se prekine (sicer gumb ostane v nalaganju, dokler povezava ne odneha sama)
  function zRokom(q, ms) {
    var ctl = new AbortController(), t = null;
    if (q && typeof q.abortSignal === 'function') q = q.abortSignal(ctl.signal);
    var rok = new Promise(function (r) { t = setTimeout(function () { ctl.abort(); r({ data: null, error: { message: 'Ni odgovora strežnika.', code: 'TIMEOUT' } }); }, ms || 30000); });
    return Promise.race([Promise.resolve(q), rok]).then(function (r) { clearTimeout(t); return r; }, function (e) { clearTimeout(t); throw e; });
  }
  function napakaBesedilo(e) {
    var m = String((e && (e.message || e.error_description || e.details)) || e || '').trim(), k = String((e && e.code) || '');
    if (k === 'TIMEOUT') return 'Ni odgovora. Preverite povezavo in poskusite znova.';
    if (jeOmrezna(m)) return 'Ni povezave z internetom.';
    if (/jwt expired|invalid jwt|refresh token|not authenticated/i.test(m)) return 'Prijava je potekla.';
    if (k === '42501') return /[čšž]/i.test(m) ? m : 'Za to nimate dovoljenja.';
    if (/[čšžČŠŽ]/.test(m) && m.length < 160 && !/[a-z]+_[a-z]+|[{}]/.test(m)) return m;
    return 'Nekaj je šlo narobe. Poskusi znova.';
  }
  var _toast = null, _toastUra = null;
  function toast(t, akcija) {
    if (!_toast) { _toast = document.createElement('div'); _toast.className = 'sc-toast'; _toast.setAttribute('role', 'status'); _toast.setAttribute('aria-live', 'polite'); document.body.appendChild(_toast); }
    _toast.textContent = t;
    _toast._n = (_toast._n || 0) + 1;
    _toast.classList.toggle('z-akcijo', !!akcija);
    if (akcija) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'sc-toast-akc'; b.textContent = akcija.besedilo;
      b.addEventListener('click', function () { toastSkrij(); try { akcija.ob(); } catch (e) {} });
      _toast.appendChild(b);
    }
    // nad vrstico z gumbi (Potrdi), kjerkoli je — pri kratkem seznamu je sredi zaslona, ne na dnu
    var akc = document.getElementById('rfAkc'), r = akc && !$('app').hidden ? akc.getBoundingClientRect() : null;
    _toast.style.bottom = r && r.height && r.top < innerHeight ? Math.max(24, innerHeight - r.top + 12) + 'px' : '';
    requestAnimationFrame(function () { _toast.classList.add('show'); });
    clearTimeout(_toastUra); _toastUra = setTimeout(toastSkrij, akcija ? 6000 : 3200);
  }
  // po izginotju brez gumba: skrit »Razveljavi« ne sme ostati pod prstom (bil je čez Potrdi)
  function toastSkrij() {
    if (!_toast) return;
    var n = _toast._n; _toast.classList.remove('show');
    setTimeout(function () { if (_toast._n !== n || _toast.classList.contains('show')) return; _toast.classList.remove('z-akcijo'); var b = _toast.querySelector('.sc-toast-akc'); if (b) b.remove(); }, 260);
  }
  function modal(opts, vnos) {
    return new Promise(function (resolve) {
      var back = document.createElement('div'); back.className = 'sc-modal-back';
      back.innerHTML = '<div class="sc-modal" role="dialog" aria-modal="true"><h4></h4><p></p>' + (vnos ? '<input type="text" class="sc-modal-input" autocomplete="off" autocapitalize="off" spellcheck="false">' : '') +
        '<div class="sc-modal-acts"><button type="button" class="sc-modal-btn ghost" data-no></button><button type="button" class="sc-modal-btn ' + (opts.nevarno ? 'danger' : 'primary') + '" data-yes></button></div></div>';
      back.querySelector('h4').textContent = opts.naslov || '';
      var p = back.querySelector('p'); if (opts.sporocilo) p.textContent = opts.sporocilo; else p.remove();
      var inp = back.querySelector('.sc-modal-input'); if (inp) { inp.value = opts.privzeto || ''; if (opts.placeholder) inp.placeholder = opts.placeholder; if (opts.tipkovnica) inp.inputMode = opts.tipkovnica; }
      back.querySelector('[data-no]').textContent = opts.preklici || 'Prekliči';
      back.querySelector('[data-yes]').textContent = opts.potrdi || 'Potrdi';
      document.body.appendChild(back);
      requestAnimationFrame(function () { back.classList.add('show'); });
      var done = false, t0 = Date.now();
      function zgodaj() { return Date.now() - t0 < 350; }   // drugi dotik dvojnega pritiska, ki je okno odprl
      function zapri(v) { if (done) return; done = true; back.classList.remove('show'); document.removeEventListener('keydown', tipka); setTimeout(function () { back.remove(); }, 180); resolve(v); }
      function tipka(e) {
        if (e.key === 'Escape') zapri(vnos ? null : false);
        else if (e.key === 'Enter') { e.preventDefault(); if (!RF_MOST) zapri(vnos ? inp.value : true); }   // C72: Enter tipka čitalec (Keyboard Emulator), ne oseba
      }
      back.querySelector('[data-no]').addEventListener('click', function () { if (!zgodaj()) zapri(vnos ? null : false); });
      back.querySelector('[data-yes]').addEventListener('click', function () { if (!zgodaj()) zapri(vnos ? inp.value : true); });
      back.addEventListener('click', function (e) { if (e.target === back && !zgodaj()) zapri(vnos ? null : false); });
      document.addEventListener('keydown', tipka);
      setTimeout(function () { if (inp) { inp.focus(); inp.select(); } else if (!RF_MOST) back.querySelector('[data-yes]').focus(); }, 60);
    });
  }
  /* ══════════ ZVOK ══════════
     Kot pri profesionalnih čitalcih: kratek tik, ko pridejo novi čipi (največ ~14 na sekundo), zvonec ob
     ustvarjenih listih, nizek ton ob napaki. Izklop v meniju osebe. */
  var ZV = { ctx: null, zadnji: 0, vkl: LS.beri('sc-rfa-zvok', true) !== false };
  function zvKontekst() {
    if (!ZV.vkl) return null;
    try {
      if (!ZV.ctx) { var A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ZV.ctx = new A(); }
      if (ZV.ctx.state === 'suspended') ZV.ctx.resume();
      return ZV.ctx;
    } catch (e) { return null; }
  }
  function zvTon(f, dol, glas, zamik) {
    var c = zvKontekst(); if (!c) return;
    try {
      var t = c.currentTime + (zamik || 0), o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(glas, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dol);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dol + 0.02);
    } catch (e) {}
  }
  function zvTik() { if (RF_MOST) return; var n = Date.now(); if (n - ZV.zadnji < 70) return; ZV.zadnji = n; zvTon(1900, 0.04, 0.09); }   // C72 piska sam
  function zvUspeh() { zvTon(1046.5, 0.14, 0.14); zvTon(1568, 0.24, 0.12, 0.1); }
  function zvNapaka() { zvTon(196, 0.32, 0.16); }
  document.addEventListener('pointerdown', function () { zvKontekst(); }, { capture: true, once: true });

  /* ══════════ VARČNI PRIKAZ ══════════
     Kot portal (Nastavitve → Zmogljivost): brez animacij in zameglitve (portal.css: zm-brez-anim, zm-brez-stekla).
     Brez izbire je vklopljen na šibki napravi (kot portal: ≤ 1 GB, 2–3 GB s ≤ 4 jedri ali ≤ 2 jedri), ob varčevanju s
     podatki in želji po manj gibanja. C72 (8 jeder, 3 GB → Chrome javi 2) ni šibka naprava. */
  function rfaVarcno() {
    var v = LS.beri('sc-rfa-varcno', null); if (v === true || v === false) return v;
    try {
      var mem = navigator.deviceMemory, jed = navigator.hardwareConcurrency;
      return !!((navigator.connection && navigator.connection.saveData) || (mem && mem < 2) || (mem && mem <= 2 && jed && jed <= 4) || (jed && jed <= 2) || matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }
  function rfaVarcnoUporabi() { var v = rfaVarcno(), de = document.documentElement; de.classList.toggle('zm-brez-anim', v); de.classList.toggle('zm-brez-stekla', v); }
  rfaVarcnoUporabi();

  function potrdiModal(o) { return modal(o, false); }
  function vnesiModal(o) { return modal(o, true); }
  function modalOdprt() { return !!document.querySelector('.sc-modal-back, .rfa-pin'); }

  // ── tema (sistemski pasovi v aplikaciji sledijo) ──
  function temaJe() { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function temaNastavi(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('sc-rfid-tema', t); } catch (e) {}
    var barva = t === 'dark' ? '#0a0a0a' : '#ffffff';
    var mc = document.querySelector('meta[name="theme-color"]'); if (mc) mc.setAttribute('content', barva);
    try { if (window.ScRfid) window.ScRfid.barva(barva); } catch (e) {}
  }

  /* ══════════ KDO DELA ══════════ */
  var OSEBE = LS.beri('sc-rfid-osebe', []); if (!Array.isArray(OSEBE)) OSEBE = [];
  function shraniOsebe() { LS.pisi('sc-rfid-osebe', OSEBE); }
  function oseba(uid) { return OSEBE.filter(function (o) { return o.uid === uid; })[0] || null; }
  var JAZ = null, STRANKE = [], IME = {};

  // vsaka osvežitev žetona gre v zapis osebe (žeton se ob osvežitvi zamenja; stari ne velja več)
  if (sb) sb.auth.onAuthStateChange(function (ev, s) {
    if (!s || !s.user || !s.refresh_token) return;
    var o = oseba(s.user.id); if (o && o.refresh !== s.refresh_token) { o.refresh = s.refresh_token; shraniOsebe(); }
    // med delom se seja ne sme zamenjati na drugo osebo (zapoznela osvežitev prejšnje menjave): sicer bi se vse beležilo pod njo
    if (JAZ && s.user.id !== JAZ.uid && !$('app').hidden) { JAZ = null; LS.pisi('sc-rfid-zadnji', null); risiOsebe('Seja je bila prekinjena.'); }
  });

  function pokazi(kaj) {
    $('auth').hidden = kaj === 'app';
    $('app').hidden = kaj !== 'app';
    $('osebe').classList.toggle('hidden', kaj !== 'osebe');
    $('prijava').classList.toggle('hidden', kaj !== 'prijava');
    if (kaj !== 'app') { zapriMeni(); rfMostKlic('ustavi'); }
    if (POV.stanje !== 'ok') povRisi();   // trak gre v glavo, ki je zdaj vidna
  }
  function risiOsebe(msg) {
    pokazi('osebe');
    var m = $('osebeMreza');
    m.innerHTML = OSEBE.map(function (o) {
      return '<div class="pp-tile-wrap"><button type="button" class="pp-tile" data-uid="' + esc(o.uid) + '"><span class="pp-av av-ini rfa-ini">' + esc(zacetnice(o.ime)) + '</span><span class="pp-nm">' + esc(o.ime) + '</span></button>' +
        '<button type="button" class="pp-tile-x" data-odstrani="' + esc(o.uid) + '" aria-label="Odstrani ' + esc(o.ime) + '"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>';
    }).join('') + '<div class="pp-tile-wrap"><button type="button" class="pp-tile pp-add" id="osebaNova"><span class="pp-av">+</span><span class="pp-nm">Nova oseba</span></button></div>';
    $('osebeMsg').textContent = msg || '';
    m.querySelectorAll('[data-uid]').forEach(function (b) { b.addEventListener('click', function () { var o = oseba(b.dataset.uid); if (o) izberi(o); }); });
    m.querySelectorAll('[data-odstrani]').forEach(function (b) { b.addEventListener('click', function () { odstraniOsebo(b.dataset.odstrani); }); });
    $('osebaNova').addEventListener('click', function () { VSTOP++; prijavaPokazi(); });
  }
  async function odstraniOsebo(uid) {
    var o = oseba(uid); if (!o) return;
    if (!(await potrdiModal({ naslov: 'Odstrani ' + o.ime + '?', potrdi: 'Odstrani', nevarno: true }))) return;
    VSTOP++;   // čakajoči zagon ne sme odpreti aplikacije kot odstranjena oseba
    OSEBE = OSEBE.filter(function (x) { return x.uid !== uid; }); shraniOsebe();
    if (LS.beri('sc-rfid-zadnji', null) === uid) LS.pisi('sc-rfid-zadnji', null);
    try { var s = (await sb.auth.getSession()).data.session; if (s && s.user.id === uid) await sb.auth.signOut({ scope: 'local' }); } catch (e) {}
    if (OSEBE.length) risiOsebe(); else prijavaPokazi();
  }
  function prijavaPokazi(msg, email) {
    pokazi('prijava');
    $('email').value = email || ''; $('geslo').value = '';
    $('prijavaMsg').textContent = msg || '';
    $('nazajOsebe').hidden = !OSEBE.length;
    setTimeout(function () { (email ? $('geslo') : $('email')).focus(); }, 60);
  }
  async function podatki() { var r = await zRokom(sb.rpc('rfid_podatki')); if (r.error) throw r.error; return r.data || {}; }
  // vstop (zagon, prijava, menjava osebe): le zadnji začeti sme odpreti aplikacijo — počasen zagon ne prepiše izbrane osebe
  var VSTOP = 0;
  async function pinHash(uid) {
    try { var r = await sb.from('app_pini').select('hash').eq('user_id', uid).maybeSingle(); if (r.error) return null; return (r.data && r.data.hash) ? String(r.data.hash) : ''; } catch (e) { return null; }
  }
  async function prijava(e) {
    e.preventDefault();
    var em = $('email').value.trim(), pw = $('geslo').value, btn = $('prijavaBtn'), m = $('prijavaMsg');
    if (!em || !pw) { m.textContent = 'Vpiši e-poštni naslov in geslo.'; return; }
    if (!sb) { m.textContent = 'Ni povezave z internetom.'; return; }
    var g = ++VSTOP;
    btn.disabled = true; btn.textContent = 'Prijavljam …'; m.textContent = '';
    try {
      var r = await zRokom(sb.auth.signInWithPassword({ email: em, password: pw }));
      if (r.error) throw r.error;
      var s = r.data.session, p;
      try { p = await podatki(); }
      catch (er) { if (er && er.code === '42501') { try { await sb.auth.signOut({ scope: 'local' }); } catch (_) {} m.textContent = NI_DOSTOPA; return; } throw er; }
      var o = { uid: s.user.id, email: s.user.email || em, ime: p.ime || em, refresh: s.refresh_token, pin: (await pinHash(s.user.id)) || '', napake: 0 };
      OSEBE = OSEBE.filter(function (x) { return x.uid !== o.uid; }); OSEBE.push(o); shraniOsebe();
      $('geslo').value = '';
      if (g === VSTOP) vstopi(o, p);
    } catch (er) {
      m.textContent = /invalid login|invalid_grant|credentials/i.test((er && er.message) || '') ? 'Napačen e-poštni naslov ali geslo.' : napakaBesedilo(er);
    } finally { btn.disabled = false; btn.textContent = 'Prijavi se'; }
  }
  function izberi(o) {
    VSTOP++;
    var z = LS.beri('sc-rfid-zadnji', null); if (z && z !== o.uid) LS.pisi('sc-rfid-zadnji', null);   // ob vrnitvi povezave ne vstopi samodejno prejšnja oseba
    if (o.pin) pinVnos(o, function () { preklopi(o); });
    else prijavaPokazi('', o.email);   // brez PIN-a v portalu: geslo, sicer bi lahko kdorkoli vstopil kot ta oseba
  }
  async function preklopi(o) {
    $('osebeMsg').textContent = '';
    var g = ++VSTOP;
    try {
      var s = (await sb.auth.getSession()).data.session;
      if (!s || s.user.id !== o.uid) {
        var r = await zRokom(sb.auth.refreshSession({ refresh_token: o.refresh }));
        if (r.error || !r.data || !r.data.session) throw (r.error || new Error('seja'));
        // supabase-js vrne osvežitev, ki še teče — lahko od prejšnje osebe (rok je potekel, klic pa ne): ne vstopi kot ona
        if (r.data.session.user.id !== o.uid) throw { message: 'Ni povezave z internetom.', code: 'TIMEOUT' };
      }
      var p = await podatki();
      if (g !== VSTOP) return;
      var s2 = (await sb.auth.getSession()).data.session;
      if (!s2 || s2.user.id !== o.uid) { risiOsebe('Ni povezave z internetom.'); return; }   // seja se je vmes zamenjala
      vstopi(o, p);
      pinHash(o.uid).then(function (h) { if (h != null && h !== (o.pin || '')) { o.pin = h; shraniOsebe(); } });
    } catch (e) {
      if (g !== VSTOP) return;
      if (e && e.code === '42501') { risiOsebe(NI_DOSTOPA); return; }
      if (jeOmrezna(e)) { risiOsebe('Ni povezave z internetom.'); return; }
      prijavaPokazi('Prijava je potekla.', o.email);
    }
  }
  function vstopi(o, p) {
    JAZ = { uid: o.uid, ime: p.ime || o.ime, skrbnik: !!p.skrbnik };
    if (p.ime && p.ime !== o.ime) { o.ime = p.ime; shraniOsebe(); }
    STRANKE = Array.isArray(p.stranke) ? p.stranke : []; IME = {};
    STRANKE.forEach(function (s) { IME[s.id] = s.ime; });
    rfOznaciVelja();
    if (RF.org && !IME[RF.org]) { RF.org = null; RF.art = ''; }
    LS.pisi('sc-rfid-zadnji', o.uid);
    $('jazIme').textContent = JAZ.ime; $('jazAv').textContent = zacetnice(JAZ.ime);
    pokazi('app');
    risiNacine(); rfRisi(); zivo();
    if (RF.sken.length) { rfPozabi(RF.sken); rfIsci(); }
  }
  function zamenjaj() { VSTOP++; LS.pisi('sc-rfid-zadnji', null); JAZ = null; RF.org = null; RF.art = ''; rfShraniOznaci(); risiOsebe(); }
  function rfBrezDostopa() { if (!JAZ) return; JAZ = null; LS.pisi('sc-rfid-zadnji', null); risiOsebe(NI_DOSTOPA); }
  async function rfPreveriDostop() {
    if (!JAZ || !sb || $('app').hidden) return;
    var uid = JAZ.uid;
    try {
      var p = await podatki(); if (!JAZ || JAZ.uid !== uid) return;   // vmes druga oseba
      JAZ.skrbnik = !!p.skrbnik;
      if (Array.isArray(p.stranke) && p.stranke.length) { STRANKE = p.stranke; IME = {}; STRANKE.forEach(function (s) { IME[s.id] = s.ime; }); }
    } catch (e) { if (e && e.code === '42501' && JAZ && JAZ.uid === uid) rfBrezDostopa(); }
  }
  setInterval(rfPreveriDostop, 10 * 60000);

  // ── PIN: 4 števke, preveri se na napravi; po 5 napačnih čakanje (vsakič dlje), po 10 geslo ──
  var PIN_DOLZ = 4, PIN_ZAKLEP = 5, PIN_GESLO = 10;
  function b64Bajti(s) { var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function bajtiB64(buf) { var a = new Uint8Array(buf), s = ''; for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  async function pbkdf2(pin, sol, it) {
    var k = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
    return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sol, iterations: it }, k, 256);
  }
  async function pinPravilen(hash, pin) {
    var d = String(hash || '').split('$');
    if (d.length !== 5 || d[0] !== 'pbkdf2' || d[1] !== 'sha256') return false;
    var izr = bajtiB64(await pbkdf2(pin, b64Bajti(d[3]), parseInt(d[2], 10)));
    var r = izr.length ^ d[4].length; for (var i = 0; i < izr.length && i < d[4].length; i++) r |= izr.charCodeAt(i) ^ d[4].charCodeAt(i);
    return r === 0;
  }
  function pinVnos(o, ob) {
    if ((o.napake || 0) >= PIN_GESLO) { prijavaPokazi('Preveč napačnih kod.', o.email); return; }
    var el = document.createElement('div'); el.className = 'rfa-pin'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'PIN · ' + o.ime);
    var tipke = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'nazaj', '0', 'brisi'];
    el.innerHTML = '<div class="rfa-pin-in"><span class="pp-av av-ini rfa-ini">' + esc(zacetnice(o.ime)) + '</span><div class="rfa-pin-ime">' + esc(o.ime) + '</div>' +
      '<div class="rfa-pin-pike">' + new Array(PIN_DOLZ + 1).join('<i></i>') + '</div><p class="rfa-pin-msg" aria-live="polite"></p>' +
      '<div class="rfa-pin-tipke">' + tipke.map(function (t) {
        if (t === 'nazaj') return '<button type="button" class="tiho" data-t="nazaj">Nazaj</button>';
        if (t === 'brisi') return '<button type="button" class="tiho" data-t="brisi" aria-label="Izbriši"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H9l-6 7 6 7h12z"/><path d="M17 9l-6 6M11 9l6 6"/></svg></button>';
        return '<button type="button" data-t="' + t + '">' + t + '</button>';
      }).join('') + '</div></div>';
    document.body.appendChild(el);
    var buf = '', preverjam = false, ura = null;
    var pike = el.querySelector('.rfa-pin-pike'), msg = el.querySelector('.rfa-pin-msg');
    function risi() { pike.querySelectorAll('i').forEach(function (p, i) { p.classList.toggle('on', i < buf.length); }); }
    function zaklenjen() { return (o.zaklepDo || 0) > Date.now(); }
    function odstevaj() {
      clearInterval(ura);
      var tik = function () {
        var s = Math.ceil(((o.zaklepDo || 0) - Date.now()) / 1000);
        el.querySelectorAll('[data-t]:not([data-t="nazaj"])').forEach(function (b) { b.disabled = s > 0; });
        msg.textContent = s > 0 ? 'Poskusi znova čez ' + (s >= 60 ? Math.ceil(s / 60) + ' min' : s + ' s') : '';
        if (s <= 0) clearInterval(ura);
      };
      tik(); ura = setInterval(tik, 1000);
    }
    function zapri() { clearInterval(ura); document.removeEventListener('keydown', tipkovnica, true); el.remove(); }
    async function preveri() {
      preverjam = true;
      var ok = false; try { ok = await pinPravilen(o.pin, buf); } catch (e) {}
      preverjam = false;
      if (ok) { o.napake = 0; o.zaklepDo = 0; shraniOsebe(); zapri(); ob(); return; }
      o.napake = (o.napake || 0) + 1;
      buf = ''; risi();
      pike.classList.remove('narobe'); void pike.offsetWidth; pike.classList.add('narobe');
      if (o.napake >= PIN_GESLO) { shraniOsebe(); zapri(); prijavaPokazi('Preveč napačnih kod.', o.email); return; }
      if (o.napake % PIN_ZAKLEP === 0) { o.zaklepDo = Date.now() + Math.min(15 * 60000, 30000 * Math.pow(2, o.napake / PIN_ZAKLEP - 1)); shraniOsebe(); odstevaj(); return; }
      shraniOsebe(); msg.textContent = 'Napačna koda.';
    }
    function pritisni(t) {
      if (preverjam) return;
      if (t === 'nazaj') { zapri(); return; }
      if (zaklenjen()) return;
      if (t === 'brisi') { buf = buf.slice(0, -1); risi(); return; }
      if (buf.length >= PIN_DOLZ) return;
      msg.textContent = ''; buf += t; risi();
      if (buf.length === PIN_DOLZ) setTimeout(preveri, 90);
    }
    function tipkovnica(e) {
      if (e.key === 'Escape') { e.preventDefault(); pritisni('nazaj'); return; }   // tudi tipka Nazaj na C72
      if (RF_MOST) return;   // števke na C72 lahko tipka čitalec (Keyboard Emulator): PIN le z zaslona
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); pritisni(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); pritisni('brisi'); }
    }
    el.querySelectorAll('[data-t]').forEach(function (b) { b.addEventListener('click', function () { pritisni(b.dataset.t); }); });
    document.addEventListener('keydown', tipkovnica, true);
    if (zaklenjen()) odstevaj();
  }

  // ── meni osebe: zamenjaj, tema, nastavitve naprave (le skrbnik, le v kiosku) ──
  function kiosk() { try { return !!(window.ScRfid && typeof window.ScRfid.kiosk === 'function' && window.ScRfid.kiosk()); } catch (e) { return false; } }
  function zapriMeni() { var m = document.querySelector('.dk-meni'); if (m) m.remove(); $('jaz').setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', meniZunaj, true); document.removeEventListener('keydown', meniTipka, true); }
  function meniTipka(e) { if (e.key === 'Escape') { e.stopPropagation(); zapriMeni(); } }   // tudi tipka Nazaj na C72
  function meniZunaj(e) { var m = document.querySelector('.dk-meni'); if (m && !m.contains(e.target) && !$('jaz').contains(e.target)) zapriMeni(); }
  function meni() {
    if (document.querySelector('.dk-meni')) { zapriMeni(); return; }
    var it = [['zamenjaj', 'Zamenjaj osebo'], ['tema', temaJe() === 'dark' ? 'Svetla tema' : 'Temna tema'], ['zvok', ZV.vkl ? 'Izklopi zvok' : 'Vklopi zvok'], ['varcno', rfaVarcno() ? 'Polni prikaz' : 'Varčni prikaz']];
    if (rfZadnjiListi()) it.unshift(['zadnji', 'Natisni zadnje']);
    if (JAZ && JAZ.skrbnik && rfTiskNaVoljo()) it.push(['tiskalnik', 'Tiskalnik']);
    if (JAZ && JAZ.skrbnik && kiosk()) it.push(['naprava', 'Nastavitve naprave'], ['kiosk', 'Izklopi kiosk']);
    var m = document.createElement('div'); m.className = 'dk-meni'; m.setAttribute('role', 'menu');
    m.innerHTML = it.map(function (a) { return '<button type="button" role="menuitem" data-a="' + a[0] + '">' + esc(a[1]) + '</button>'; }).join('');
    document.body.appendChild(m);
    var r = $('jaz').getBoundingClientRect();
    m.style.top = (r.bottom + 6) + 'px';
    m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, document.documentElement.clientWidth - m.offsetWidth - 8)) + 'px';
    $('jaz').setAttribute('aria-expanded', 'true');
    m.querySelectorAll('[data-a]').forEach(function (b) {
      b.addEventListener('click', function () {
        zapriMeni();
        if (b.dataset.a === 'zamenjaj') zamenjaj();
        else if (b.dataset.a === 'zadnji') { var zl = rfZadnjiListi(); if (zl) rfNatisni(zl.map(function (l) { return l.note; }), null); }
        else if (b.dataset.a === 'tema') temaNastavi(temaJe() === 'dark' ? 'light' : 'dark');
        else if (b.dataset.a === 'zvok') { ZV.vkl = !ZV.vkl; LS.pisi('sc-rfa-zvok', ZV.vkl); if (ZV.vkl) zvTik(); }
        else if (b.dataset.a === 'varcno') { LS.pisi('sc-rfa-varcno', !rfaVarcno()); rfaVarcnoUporabi(); }
        else if (b.dataset.a === 'tiskalnik') rfTiskalnik();
        else if (b.dataset.a === 'naprava') { try { window.ScRfid.nastavitve(); } catch (e) {} }
        else if (b.dataset.a === 'kiosk') {
          potrdiModal({ naslov: 'Izklopi kiosk?', potrdi: 'Izklopi', nevarno: true }).then(function (da) { if (da) { try { window.ScRfid.kioskIzklopi(); } catch (e) {} } });
        }
      });
    });
    setTimeout(function () { document.addEventListener('pointerdown', meniZunaj, true); document.addEventListener('keydown', meniTipka, true); }, 0);
  }

  /* ══════════ ČIPI ══════════
     Kos perila = čip (EPC) pri stranki + artikel (72_rfid.sql). Oddaja / Prevzem: skeniraš vse naenkrat
     (lahko več strank), aplikacija razvrsti po strankah, Potrdi pri oddaji vsaki ustvari spremni list.
     Označi: stranka + artikel + novi čipi. Poišči: skeniran kos (stranka, artikel, pranja, zgodovina). */
  var RF = { nacin: 'oddaja', idx: {}, vprasan: {}, sken: [], skenSet: {}, kljuc: null, org: null, art: '', arts: {}, rezultat: null, most: null, najdeni: null, gen: 0,
    izlocene: {}, vkl: { prest: false, drugje: false }, isciGen: 0, isciNapake: 0, vrsta: [], oznacujem: false, potrjujem: false };
  (function () {
    var n = LS.beri('sc-rfa-nacin', 'oddaja'); if (['oddaja', 'prevzem', 'oznaci', 'poisci'].indexOf(n) >= 0) RF.nacin = n;
    // stranka in artikel za Označi veljata 8 ur (naslednji dan ali druga oseba začne brez)
    var oz = LS.beri('sc-rfa-oznaci', null);
    if (oz && oz.cas && Date.now() - oz.cas < 8 * 3600e3) { RF.org = oz.org || null; RF.art = oz.art || ''; }
    var nov = LS.beri('sc-rfa-sken', null), s = nov || LS.beri('sc-rfid-sken', null);   // pred 4.77: skupen ključ s portalom
    if (s && Array.isArray(s.sken)) {
      RF.sken = s.sken.filter(function (e) { return /^[0-9A-F]{8,64}$/.test(e); }); RF.sken.forEach(function (e) { RF.skenSet[e] = 1; });
      RF.kljuc = nov ? (s.kljuc || null) : null;   // ključa iz skupnega zapisa ne uporabi (lahko ga je porabil portal)
      if (s.izlocene && typeof s.izlocene === 'object') RF.izlocene = s.izlocene;
    }
  })();
  var RF_NACINI = [['oddaja', 'Oddaja'], ['prevzem', 'Prevzem'], ['oznaci', 'Označi'], ['poisci', 'Poišči']];
  var RF_PRALNICA_DNI = 3, RF_NEVIDEN_DNI = 45;
  var RF_TIPI = { oznacevanje: 'Označen', prevzem: 'Prevzem', oddaja: 'Oddaja', oznacen: 'Prestavljen', stanje: 'Stanje' };

  function rfEpc(s) { var e = String(s || '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase(); return /^[0-9A-F]{8,64}$/.test(e) ? e : null; }
  function rfKratko(epc) { return '…' + String(epc || '').slice(-8); }
  // čitalec kot tipkovnica: le čista številka (24+ šestnajstiških znakov, cele besede po 4) — »EPC:…«, pol številke ali dve skupaj ne
  function rfEpcVnos(s) { var e = String(s || '').replace(/\s+/g, ''); return /^[0-9A-Fa-f]+$/.test(e) && e.length >= 24 && e.length <= 64 && e.length % 4 === 0 ? e.toUpperCase() : null; }
  function rfKljuc() { try { return crypto.randomUUID(); } catch (e) { return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, function () { return (Math.random() * 16 | 0).toString(16); }); } }
  function rfShrani() { LS.pisi('sc-rfa-sken', { sken: RF.sken, kljuc: RF.kljuc, izlocene: RF.izlocene }); }
  function rfShraniOznaci() { LS.pisi('sc-rfa-oznaci', RF.org ? { org: RF.org, art: RF.art, cas: Date.now() } : null); }
  // stranka in artikel za Označi veljata 8 ur od zadnje uporabe (preverjeno tudi, ko aplikacija pride iz ozadja)
  function rfOznaciVelja() {
    var oz = LS.beri('sc-rfa-oznaci', null);
    if (!RF.org || (oz && oz.cas && Date.now() - oz.cas < 8 * 3600e3)) return true;
    RF.org = null; RF.art = ''; RF.vkl = { prest: false, drugje: false }; rfShraniOznaci();
    return false;
  }
  // vrstice čipa pri živih strankah (izbrisane in neaktivne stranke baza preskoči, odpisani kosi ne štejejo)
  function rfZivi(e) { return (RF.idx[e] || []).filter(function (k) { return k.stanje !== 'odpisan' && IME[k.org_id]; }); }
  // stranka, ki jo je oseba v tem skeniranju odstranila (sosednji voziček): njeni čipi se ne štejejo in ne pošljejo
  function rfIzlocen(e) { var v = rfZivi(e); return !!(v.length && v.every(function (k) { return RF.izlocene[k.org_id]; })); }

  function rfZaPoslati() { return RF.sken.filter(function (e) { return !rfIzlocen(e); }); }
  function rfPogresan(k) {
    if (k.stanje !== 'aktiven' || !k.zadnjic) return '';
    var dni = (Date.now() - new Date(k.zadnjic).getTime()) / 864e5;
    if (k.zadnji_tip === 'prevzem' && dni > RF_PRALNICA_DNI) return 'v pralnici od ' + datumCas(k.zadnjic);
    if (dni > RF_NEVIDEN_DNI) return 'nazadnje ' + datumCas(k.zadnjic);
    return '';
  }
  function rfKje(k) {
    if (k.stanje === 'izgubljen') return 'izgubljen';
    if (k.stanje === 'odpisan') return 'odpisan';
    return (k.zadnji_tip === 'prevzem' ? 'v pralnici' : 'pri stranki') + (k.zadnjic ? ' · ' + datumCas(k.zadnjic) : '');
  }
  function rfArtIme(k) { var a = (RF.arts[k.org_id] || []).filter(function (x) { return x.id === k.article_id; })[0]; return a ? a.ime : k.naziv; }
  function rfBliza() { return RF.nacin === 'oznaci' || RF.nacin === 'poisci'; }

  // čipi → kosi (vse stranke; isti EPC je lahko pri več strankah), po 150 na zahtevo
  var _rfIsciT = null, _rfIscem = null;
  function rfIsci(takoj) {
    clearTimeout(_rfIsciT);
    var izvedi = function () {
      if (_rfIscem) return _rfIscem;
      var manjka = RF.sken.filter(function (e) { return !RF.vprasan[e]; }).slice(0, 150);
      if (!manjka.length) return Promise.resolve();
      var g0 = RF.isciGen, ctl = new AbortController(), rok = setTimeout(function () { ctl.abort(); }, 15000);
      _rfIscem = (async function () {
        var r = await sb.from('rfid_kosi').select('id,epc,org_id,article_id,naziv,stanje,zadnji_tip,zadnjic').in('epc', manjka).abortSignal(ctl.signal);
        if (r.error) throw r.error;
        var nov = {}; (r.data || []).forEach(function (k) { (nov[k.epc] = nov[k.epc] || []).push(k); });
        manjka.forEach(function (e) { RF.idx[e] = nov[e] || []; if (RF.isciGen === g0) RF.vprasan[e] = 1; });   // vmes osveženo: ti se vprašajo znova
      })().then(function () { clearTimeout(rok); _rfIscem = null; RF.isciNapake = 0; rfOsvezi(); if (RF.sken.some(function (e) { return !RF.vprasan[e]; })) return izvedi(); },
        function (e) { clearTimeout(rok); _rfIscem = null; throw e; });
      return _rfIscem;
    };
    if (takoj) return izvedi();
    _rfIsciT = setTimeout(function () { izvedi().catch(rfIsciNapaka); }, 300);
    return null;
  }
  // čipov ni bilo mogoče preveriti: sporoči (enkrat) in poskusi znova, dokler kaj čaka
  function rfIsciNapaka(e, vedno) {
    if (e && e.code === '42501') { rfBrezDostopa(); return; }
    if (!RF.isciNapake || vedno) toast(jeOmrezna(e) || (e && e.name === 'AbortError') ? 'Ni povezave z internetom.' : 'Čipov ni bilo mogoče preveriti.');
    RF.isciNapake++;
    clearTimeout(_rfIsciT);
    _rfIsciT = setTimeout(function () { if (RF.sken.some(function (x) { return !rfZnan(x); })) izvedi2(); }, Math.min(30000, 2000 * Math.pow(2, RF.isciNapake - 1)));
  }
  function izvedi2() { var p = rfIsci(true); if (p && p.catch) p.catch(rfIsciNapaka); }
  // znova vprašaj bazo; stari podatki ostanejo do novih (brez utripanja med osvežitvijo) — vse: pozabi tudi te
  function rfPozabi(epcs, vse) { RF.isciGen++; epcs.forEach(function (e) { delete RF.vprasan[e]; if (vse) delete RF.idx[e]; }); }
  function rfZnan(e) { return !!(RF.vprasan[e] || RF.idx[e]); }
  async function rfArtikli(org, sveze) {
    if (RF.arts[org] && !sveze) return RF.arts[org];
    var r = await zRokom(sb.rpc('rfid_artikli', { p_org: org }));
    if (r.error) throw r.error;
    RF.arts[org] = Array.isArray(r.data) ? r.data : [];
    return RF.arts[org];
  }

  function risiNacine() {
    var t = $('nacini');
    t.innerHTML = RF_NACINI.map(function (n) {
      return '<button type="button" role="tab" class="pris-tab' + (n[0] === RF.nacin ? ' on' : '') + '" data-nacin="' + n[0] + '" aria-selected="' + (n[0] === RF.nacin) + '">' + n[1] + '</button>';
    }).join('');
    t.querySelectorAll('[data-nacin]').forEach(function (b) { b.addEventListener('click', function () { rfNacin(b.dataset.nacin); }); });
  }
  function rfNacin(n) {
    if (n === RF.nacin || RF.potrjujem || RF.oznacujem) return;   // med klicem ostane isti način (skeniranje in ključ)
    // v Označi gredo le neoznačeni čipi: že označen kos bi se sicer potiho prestavil na drug artikel
    if (n === 'oznaci' && RF.sken.length) { RF.sken = RF.sken.filter(function (e) { return rfZnan(e) && !rfZivi(e).length; }); RF.skenSet = {}; RF.sken.forEach(function (e) { RF.skenSet[e] = 1; }); }
    RF.kljuc = null; RF.vkl = { prest: false, drugje: false };
    rfShrani();
    RF.nacin = n; RF.rezultat = null; RF.najdeni = null;
    LS.pisi('sc-rfa-nacin', n);
    document.querySelectorAll('#nacini [data-nacin]').forEach(function (b) { var on = b.dataset.nacin === n; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    rfMocNastavi(rfMocNacin());
    rfRisi();
  }
  function rfRisi() {
    var t = $('rfTelo'); if (!t) return;
    if (RF.rezultat) { rfRisiRezultat(t); return; }
    if (RF.nacin === 'poisci') { rfRisiPoisci(t); return; }
    rfRisiSken(t);
  }

  // ── skeniranje ──
  function rfRisiSken(t) {
    var oz = RF.nacin === 'oznaci';
    var izb = oz ? '<div class="rfa-izb"><label><span>Stranka</span><select id="rfOrg"><option value="">Izberi stranko</option>' +
      STRANKE.map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === RF.org ? ' selected' : '') + '>' + esc(s.ime) + '</option>'; }).join('') + '</select></label>' +
      '<label><span>Artikel</span><select id="rfArt"' + (RF.org ? '' : ' disabled') + '><option value="">Izberi artikel</option></select></label></div>' : '';
    t.innerHTML = '<div class="uc-card rf-sken">' + izb +
      '<div class="rf-stevec" aria-live="polite"><b id="rfN">0</b><span id="rfNlab"></span></div>' + rfVnosHtml() + '</div>' +
      '<div class="rf-rez" id="rfRez"></div><div class="u-acts rf-akc" id="rfAkc"></div>';
    if (oz) {
      $('rfOrg').addEventListener('change', function () { rfIzberiStranko($('rfOrg').value); });
      $('rfArt').addEventListener('change', function () { RF.art = $('rfArt').value; RF.vkl = { prest: false, drugje: false }; rfShraniOznaci(); rfOsvezi(); });
      if (RF.org) rfNapolniArtikle();
    }
    rfVezi();
    rfOsvezi();
  }
  async function rfIzberiStranko(org) {
    RF.org = org || null; RF.art = ''; RF.vkl = { prest: false, drugje: false };
    rfShraniOznaci();
    var a = $('rfArt'); if (a) { a.innerHTML = '<option value="">Izberi artikel</option>'; a.disabled = !RF.org; }
    rfOsvezi();
    if (RF.org) rfNapolniArtikle();
  }
  async function rfNapolniArtikle() {
    var org = RF.org, a = $('rfArt'); if (!a || !org) return;
    if (RF.arts[org]) rfArtikliRisi(org, RF.arts[org]);
    try { rfArtikliRisi(org, await rfArtikli(org, true)); }
    catch (e) { if (!RF.arts[org]) toast(napakaBesedilo(e)); }   // brez povezave ostane dosedanji seznam (Označi deluje naprej)
  }
  function rfArtikliRisi(org, arts) {
    var a = $('rfArt'); if (org !== RF.org || !a) return;
    if (RF.art && !arts.some(function (x) { return x.id === RF.art; })) { RF.art = ''; rfShraniOznaci(); }
    a.innerHTML = '<option value="">Izberi artikel</option>' + arts.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === RF.art ? ' selected' : '') + '>' + esc(x.ime) + '</option>'; }).join('');
    a.disabled = false;
    rfOsvezi();
  }
  function rfVnosHtml() {
    return RF_MOST ? rfCitHtml() : '<input type="text" id="rfVnos" class="sc-modal-input rf-vnos" placeholder="Skeniraj čip" aria-label="Skeniraj čip" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" enterkeyhint="enter">';
  }
  function rfVezi() {
    if (RF_MOST) rfCitVezi();
    else { rfVhod($('rfVnos'), rfDodaj); var i = $('rfVnos'); if (i && matchMedia('(pointer:fine)').matches) i.focus({ preventScroll: true }); }
  }
  // Čitalec kot tipkovnica: EPC in Enter (ali Tab, presledek); brez končnega znaka polna številka po kratkem premoru.
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
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || !/^[0-9A-Fa-f]$/.test(e.key)) return;
    var inp = $('rfVnos'); if (!inp || $('app').hidden || modalOdprt()) return;
    var a = document.activeElement, tip = a && a.tagName;
    if (a === inp || tip === 'INPUT' || tip === 'TEXTAREA' || tip === 'SELECT') return;
    inp.focus({ preventScroll: true });
  }, true);

  // novi čipi (paket iz čitalca ali vnos): dodaj, shrani enkrat, en tik
  var _rfRaf = 0;
  function rfDodajVec(epci) {
    if (RF.nacin === 'poisci') { rfPoisci(epci); return; }
    if (RF.nacin === 'oznaci' && !RF.org) { rfBrezStranke(); return; }
    var novih = 0;
    epci.forEach(function (epc) { if (RF.skenSet[epc]) return; RF.skenSet[epc] = 1; RF.sken.push(epc); delete RF.vprasan[epc]; novih++; });   // podatek iz prejšnjega skeniranja je lahko star
    rfBeriZiv(novih);
    if (!novih) { if (!_rfIscem && RF.sken.some(function (e) { return !rfZnan(e); })) rfIsci(); return 0; }
    if (!RF.potrjujem) RF.kljuc = null;   // drugačno skeniranje = nov ključ potrditve; med klicem ostane (ponovitev po izpadu ne sme dobiti novega)
    rfShrani(); zvTik();
    if (!_rfRaf) _rfRaf = requestAnimationFrame(function () { _rfRaf = 0; rfOsvezi(); });
    rfIsci();
    return novih;
  }
  function rfDodaj(epc) { rfDodajVec([epc]); }
  // Označi brez stranke: čitalec bere, a se nič ne zgodi — pokaži, kaj manjka
  var _rfBrezStr = 0;
  function rfBrezStranke() {
    if (Date.now() - _rfBrezStr < 2500) return; _rfBrezStr = Date.now();
    zvNapaka(); toast('Izberi stranko');
    var l = $('rfOrg'), w = l && (l.closest('label') || l);
    if (w) { w.classList.remove('rf-opozori'); void w.offsetWidth; w.classList.add('rf-opozori'); }
  }

  // oddan v zadnjih 12 urah (kot baza): isti voziček dvakrat ali sosednji, že oddani voziček
  function rfZeOddan(k) { return k.zadnji_tip === 'oddaja' && k.zadnjic && Date.now() - new Date(k.zadnjic).getTime() < 432e5; }
  function rfUra(ts) {
    if (!ts) return '';
    var d = new Date(ts), u = d.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === new Date().toDateString()) return 'ob ' + u;
    if (d.toDateString() === new Date(Date.now() - 864e5).toDateString()) return 'včeraj ob ' + u;
    return datumCas(ts) + ' ob ' + u;
  }
  function rfZeBesedilo(g) {
    var m = g.ze % 100;
    return (g.ze === g.n ? 'Že oddano' : stevilo(g.ze) + ' ' + (m === 1 ? 'že oddan' : m === 2 ? 'že oddana' : (m === 3 || m === 4) ? 'že oddani' : 'že oddanih')) + ' ' + rfUra(g.zeCas);
  }
  function sklonListovToz(n) { var m = n % 100; return stevilo(n) + ' ' + (m === 1 ? 'spremni list' : m === 2 ? 'spremna lista' : (m === 3 || m === 4) ? 'spremne liste' : 'spremnih listov'); }
  function rfRazvrsti(brez) {
    var str = {}, nezn = [], dvo = [], cakam = 0, znanih = 0, izl = {};
    RF.sken.forEach(function (e) {
      if (brez && brez[e]) return;
      if (!rfZnan(e)) { cakam++; return; }
      if (rfIzlocen(e)) { var o = rfZivi(e)[0].org_id; izl[o] = (izl[o] || 0) + 1; return; }
      var vsi = rfZivi(e);
      if (!vsi.length) { nezn.push(e); return; }
      var orgi = {}; vsi.forEach(function (k) { orgi[k.org_id] = 1; });
      if (Object.keys(orgi).length > 1) { dvo.push(e); return; }
      var k = vsi[0], g = str[k.org_id] || (str[k.org_id] = { org: k.org_id, ime: IME[k.org_id] || 'Stranka', n: 0, art: {}, ze: 0, zeCas: '' });
      g.n++; g.art[k.naziv] = (g.art[k.naziv] || 0) + 1; znanih++;
      if (rfZeOddan(k)) { g.ze++; if (String(k.zadnjic) > g.zeCas) g.zeCas = String(k.zadnjic); }
    });
    var seznam = Object.keys(str).map(function (o) { return str[o]; }).sort(function (a, b) { return a.ime.localeCompare(b.ime, 'sl'); });
    return { stranke: seznam, nezn: nezn, dvo: dvo, cakam: cakam, znanih: znanih, izl: izl };
  }
  // Označi: čipi, ki jih je treba poslati (novi, drug artikel, znova v uporabi, pri drugi stranki)
  function rfZaOznaciti() {
    return RF.sken.filter(function (e) {
      if (!rfZnan(e)) return false;
      var vsi = RF.idx[e] || [], moj = vsi.filter(function (k) { return k.org_id === RF.org; })[0];
      var tuji = rfZivi(e).some(function (k) { return k.org_id !== RF.org; });
      if (tuji && !RF.vkl.drugje) return false;                                       // tuj kos (lahko le leži zraven)
      if (moj && moj.article_id !== RF.art && !RF.vkl.prest) return false;            // drug artikel iste stranke (tudi odpisan ali izgubljen)
      return !moj || moj.article_id !== RF.art || moj.stanje !== 'aktiven' || tuji;
    });
  }
  function rfArtikelZnan() { return !!(RF.org && RF.art && (RF.arts[RF.org] || []).some(function (x) { return x.id === RF.art; })); }
  function rfStevec(nEl, n) {
    var prej = +(nEl.dataset.n || 0);
    nEl.textContent = stevilo(n); nEl.dataset.n = n;
    if (n > prej) { nEl.classList.remove('rf-bump'); void nEl.offsetWidth; nEl.classList.add('rf-bump'); }
  }
  // med klicem: zavihki in izbira stranke/artikla zaklenjeni (tudi na zaslonu z ustvarjenimi listi)
  function rfZaklep() {
    var zaseden = RF.potrjujem || RF.oznacujem;
    document.querySelectorAll('#nacini [data-nacin]').forEach(function (b) { b.disabled = zaseden; });
    ['rfOrg', 'rfArt'].forEach(function (id) { var s = $(id); if (s) s.disabled = zaseden || (id === 'rfArt' && !RF.org); });
  }
  function rfOsvezi() {
    rfZaklep();
    var rez = $('rfRez'), nEl = $('rfN'), lab = $('rfNlab'); if (!rez || !nEl) return;
    var akc = $('rfAkc'), vrst = [];
    var vr = function (ime, n, razred, opis, gumb) {
      return '<div class="rf-vr' + (razred ? ' ' + razred : '') + '"><span class="rf-vr-t"><span class="rf-vr-ime">' + esc(ime) + '</span>' + (opis ? '<span class="rf-vr-op">' + esc(opis) + '</span>' : '') + '</span>' +
        (gumb || '') + '<b>' + stevilo(n) + '</b></div>';
    };
    var zaseden = RF.potrjujem || RF.oznacujem, dis = zaseden ? ' disabled' : '';
    var pocisti = '<button type="button" data-rf="pocisti"' + (RF.sken.length && !zaseden ? '' : ' disabled') + '>Počisti</button>';
    if (RF.nacin === 'oznaci') {
      var novi = 0, enaki = 0, prest = {}, znova = 0, drugje = {};
      var cilj = ((RF.arts[RF.org] || []).filter(function (x) { return x.id === RF.art; })[0] || {}).ime || 'izbrani artikel';
      if (RF.org) RF.sken.forEach(function (e) {
        if (!rfZnan(e)) return;
        var vsi = RF.idx[e] || [], moj = vsi.filter(function (k) { return k.org_id === RF.org; })[0], tuj = false;
        rfZivi(e).forEach(function (k) { if (k.org_id !== RF.org) { tuj = true; var s = IME[k.org_id]; drugje[s] = (drugje[s] || 0) + 1; } });
        if (!moj) { if (!tuj) novi++; }
        else if (RF.art && moj.article_id === RF.art) { if (moj.stanje !== 'aktiven') znova++; else enaki++; }
        else { var i = rfArtIme(moj); prest[i] = (prest[i] || 0) + 1; }
      });
      var n = RF.org ? rfZaOznaciti().length : 0, ta = IME[RF.org] || 'izbrana stranka', cakaO = RF.sken.some(function (e) { return !rfZnan(e); });
      var vklGumb = function (k) { var on = RF.vkl[k]; return '<button type="button" class="cgrp-btn ghost' + (on ? ' on' : '') + '" data-rf="vkl-' + k + '" aria-pressed="' + on + '"' + dis + '>' + (on ? 'Vključeno' : (k === 'drugje' ? 'Preseli' : 'Prestavi')) + '</button>'; };
      rfStevec(nEl, n); lab.textContent = 'za označiti';
      if (novi) vrst.push(vr('Novi čipi', novi));
      if (znova) vrst.push(vr('Znova v uporabi', znova, '', 'odpisani ali izgubljeni'));
      Object.keys(prest).forEach(function (i, ix) { vrst.push(vr('Drug artikel', prest[i], RF.vkl.prest ? '' : 'opoz', i + ' → ' + cilj, ix ? '' : vklGumb('prest'))); });
      Object.keys(drugje).forEach(function (s, ix) { vrst.push(vr('Pri drugi stranki', drugje[s], RF.vkl.drugje ? '' : 'opoz', s + ' → ' + ta, ix ? '' : vklGumb('drugje'))); });
      if (enaki) vrst.push(vr('Že označeni', enaki, 'tiho'));
      if (akc) akc.innerHTML = pocisti + '<button type="button" class="ur-save' + (RF.oznacujem ? ' nalaga' : '') + '" data-rf="oznaci"' + (n && !cakaO && rfArtikelZnan() && !RF.oznacujem ? '' : ' disabled') + '>' + (n ? 'Označi ' + sklonKosov(n) : 'Označi') + '</button>';
    } else {
      var r = rfRazvrsti(), odd = RF.nacin === 'oddaja';
      rfStevec(nEl, r.znanih);
      lab.textContent = (r.znanih % 100 === 1 ? 'kos' : r.znanih % 100 === 2 ? 'kosa' : (r.znanih % 100 === 3 || r.znanih % 100 === 4) ? 'kosi' : 'kosov') + (r.stranke.length > 1 ? ' · ' + sklonStrank(r.stranke.length) : '');
      r.stranke.forEach(function (g) {
        var arti = Object.keys(g.art).sort(function (a, b) { return g.art[b] - g.art[a] || a.localeCompare(b, 'sl'); });
        var ze = odd && g.ze ? '<div class="rf-str-ze">' + esc(rfZeBesedilo(g)) + '</div>' : '';
        vrst.push('<div class="rf-str' + (ze ? ' opoz' : '') + '"><div class="rf-str-h"><span>' + esc(g.ime) + '</span><button type="button" class="cgrp-btn ghost" data-rf="odstrani" data-org="' + esc(g.org) + '"' + dis + '>Odstrani</button><b>' + stevilo(g.n) + '</b></div>' + ze +
          arti.map(function (i) { return '<div class="rf-str-a"><span>' + esc(i) + '</span><span>' + stevilo(g.art[i]) + '</span></div>'; }).join('') + '</div>');
      });
      if (r.nezn.length) vrst.push(vr('Neoznačeni', r.nezn.length, 'opoz', '', '<button type="button" class="cgrp-btn ghost" data-rf="v-oznaci"' + dis + '>Označi</button>'));
      if (r.dvo.length) vrst.push(vr('Čip pri več strankah', r.dvo.length, 'opoz'));
      Object.keys(r.izl).forEach(function (o) { vrst.push(vr(IME[o] || 'Stranka', r.izl[o], 'tiho', 'izločeno', '<button type="button" class="cgrp-btn ghost" data-rf="vrni" data-org="' + esc(o) + '"' + dis + '>Vrni</button>')); });
      var ns = r.stranke.length;
      if (akc) akc.innerHTML = pocisti + '<button type="button" class="ur-save' + (RF.potrjujem ? ' nalaga' : '') + '" data-rf="potrdi"' + (r.znanih && !r.cakam && !RF.potrjujem ? '' : ' disabled') + '>' +
        (odd ? (ns > 1 ? 'Potrdi<span class="rf-akc-dod"> · ' + sklonListov(ns) + '</span>' : 'Potrdi oddajo') : 'Potrdi prevzem') + '</button>';
    }
    rez.innerHTML = vrst.join('');
    [akc, rez].forEach(function (h) { if (h) h.querySelectorAll('[data-rf]').forEach(function (b) { b.addEventListener('click', function () { rfAkcija(b.dataset.rf, b); }); }); });
  }
  function rfPocisti() { RF.sken = []; RF.skenSet = {}; RF.kljuc = null; RF.izlocene = {}; RF.vkl = { prest: false, drugje: false }; rfShrani(); rfOsvezi(); }
  function rfVrni(epci) { epci.forEach(function (e) { if (!RF.skenSet[e]) { RF.skenSet[e] = 1; RF.sken.push(e); } }); }
  // po uspehu odstrani skeniranje, kot je bilo ob klicu (čipi, prebrani med klicem, ostanejo za naslednje)
  function rfOdstraniPoslane(posnetek) {
    var m = {}; posnetek.forEach(function (e) { m[e] = 1; });
    rfPozabi(posnetek, true);
    RF.sken = RF.sken.filter(function (e) { return !m[e]; }); RF.skenSet = {}; RF.sken.forEach(function (e) { RF.skenSet[e] = 1; });
    RF.vrsta = RF.vrsta.filter(function (e) { return !m[e]; });   // isti čipi, ki so med oknom čakali v vrsti, niso novo skeniranje
    RF.kljuc = null; RF.izlocene = {}; RF.vkl = { prest: false, drugje: false };   // izločitev in vklop veljata le za to potrditev (sicer bi naslednji voziček te stranke tiho izpustil)
    rfShrani();
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
      if (rr.stranke.length === 1 && rr.stranke[0].org !== RF.org) { RF.org = rr.stranke[0].org; RF.art = ''; rfShraniOznaci(); }
      rfNacin('oznaci'); return;
    }
    if (a === 'vkl-prest' || a === 'vkl-drugje') { var kk = a.slice(4); RF.vkl[kk] = !RF.vkl[kk]; rfOsvezi(); return; }
    if (a === 'vrni') { delete RF.izlocene[gumb.dataset.org]; RF.kljuc = null; rfShrani(); rfOsvezi(); return; }
    if (a === 'odstrani') {   // čipi sosednjega vozička: stranko izločiš iz te potrditve
      var org = gumb.dataset.org;
      RF.izlocene[org] = 1; RF.kljuc = null; rfShrani(); rfOsvezi();   // ostane izločena tudi ob naslednjem branju istega vozička
      toast((IME[org] || 'Stranka') + ' odstranjena', { besedilo: 'Razveljavi', ob: function () { if (RF.potrjujem || RF.oznacujem) return; delete RF.izlocene[org]; RF.kljuc = null; rfShrani(); rfOsvezi(); } });
      return;
    }
    if (a === 'potrdi') { rfPotrdi(); return; }
    if (a === 'oznaci') {
      if (RF.oznacujem || RF.potrjujem) return;
      rfMostKlic('ustavi'); toastSkrij();
      var prej = rfZaOznaciti().length;   // število na gumbu
      RF.oznacujem = true; rfOsvezi();
      try {
        rfPozabi(RF.sken);   // vsi čipi znova, ne le nevprašani
        try { await rfIsci(true); } catch (e) { zvNapaka(); rfIsciNapaka(e, true); return; }   // pošlje se točno to, kar je prikazano
        var o = RF.org, epcs = rfZaOznaciti(), posnetek = RF.sken.slice();
        if (!o || !epcs.length || !rfArtikelZnan()) return;
        if (epcs.length !== prej) { zvNapaka(); toast('Stanje čipov se je vmes spremenilo'); return; }   // prikaz se osveži; oseba potrdi znova
        var r = await zRokom(sb.rpc('rfid_oznaci', { p_org: o, p_article: RF.art, p_epcs: epcs, p_preseli: !!RF.vkl.drugje }));
        if (r.error) throw r.error;
        var d = r.data || {}, n = (d.novih || 0) + (d.prestavljenih || 0) + (d.preseljenih || 0), art = ((RF.arts[o] || []).filter(function (x) { return x.id === RF.art; })[0] || {}).ime || '';
        var drugje = Array.isArray(d.drugje) ? d.drugje : [], dm = {}; drugje.forEach(function (e) { dm[e] = 1; });
        zvUspeh();
        rfShraniOznaci();   // 8 ur od zadnje uporabe
        rfOdstraniPoslane(posnetek.filter(function (e) { return !dm[e]; }));   // čipi, prebrani med klicem, ostanejo; tudi tisti, ki jih je medtem označila druga naprava
        if (drugje.length) { rfPozabi(drugje); izvedi2(); }
        RF.oznacujem = false; rfOsvezi();   // sporočilo šele po izrisu (stoji nad vrstico z gumbi, ki se je premaknila)
        toast((n ? 'Označeno: ' + sklonKosov(n) + (art ? ' · ' + art : '') : 'Označeno') + (d.preseljenih ? ' · ' + stevilo(d.preseljenih) + ' od druge stranke' : '') +
          (drugje.length ? ' · ' + stevilo(drugje.length) + ' pri drugi stranki' : ''));
      } catch (e) { zvNapaka(); toast(napakaBesedilo(e)); if (e && e.code === '42501') rfBrezDostopa(); }
      finally { RF.oznacujem = false; rfOsvezi(); }
    }
  }
  // okno s seznamom (potrditev, že oddano): vrstice in gumbi; Escape ali dotik ozadja = prvi gumb
  function rfOkno(o) {
    return new Promise(function (resolve) {
      var back = document.createElement('div'); back.className = 'sc-modal-back';
      back.innerHTML = '<div class="sc-modal rf-okno-p" role="dialog" aria-modal="true"><h4></h4><div class="rf-pv"></div><div class="sc-modal-acts"></div></div>';
      back.querySelector('h4').textContent = o.naslov || '';
      back.querySelector('.rf-pv').innerHTML = (o.vrstice || []).map(function (v) {
        return '<div class="rf-pv-v' + (v.cls ? ' ' + v.cls : '') + '"><span class="rf-pv-t"><span class="rf-pv-ime">' + esc(v.ime) + '</span>' + (v.opis ? '<span class="rf-pv-op">' + esc(v.opis) + '</span>' : '') + '</span>' + (v.n != null ? '<b>' + stevilo(v.n) + '</b>' : '') + '</div>';
      }).join('');
      var akc = back.querySelector('.sc-modal-acts'), gumbi = o.gumbi || [], prvi = gumbi.length ? gumbi[0].v : false;
      gumbi.forEach(function (g) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'sc-modal-btn ' + (g.glavni ? 'primary' : 'ghost'); b.textContent = g.t;
        b.addEventListener('click', function () { zapri(g.v); }); akc.appendChild(b);
      });
      document.body.appendChild(back);
      requestAnimationFrame(function () { back.classList.add('show'); });
      var done = false, t0 = Date.now();
      function zapri(v) { if (done) return; done = true; clearInterval(ura); RF.ustaviOdstevanje = null; back.classList.remove('show'); document.removeEventListener('keydown', tipka); setTimeout(function () { back.remove(); }, 180); resolve(v); }
      // Enter ne potrdi nikoli (čitalec kot tipkovnica pošlje EPC + Enter) — ustvari se le z dotikom gumba
      function tipka(e) { if (e.key === 'Escape') zapri(prvi); else if (e.key === 'Enter') e.preventDefault(); }
      // čist pregled se potrdi sam: glavni gumb odšteva, ustavi ga Nazaj, nov pritisk na sprožilec ali nov čip
      if (o.samodejno) {
        var glavni = gumbi.filter(function (g) { return g.glavni; })[0], gb = akc.querySelector('.primary'), konec = Date.now() + o.samodejno;
        var tik = function () { var ost = konec - Date.now(); if (ost <= 0) zapri(glavni.v); else gb.textContent = glavni.t + ' (' + Math.ceil(ost / 1000) + ')'; };
        var ura = setInterval(tik, 200); tik();
        RF.ustaviOdstevanje = function () { zapri(prvi); };
      }
      back.addEventListener('click', function (e) { if (Date.now() - t0 < 350) { e.stopPropagation(); return; } if (e.target === back) zapri(prvi); }, true);   // drugi dotik dvojnega pritiska na Potrdi
      document.addEventListener('keydown', tipka);
      setTimeout(function () { var m = back.querySelector('.sc-modal'); m.setAttribute('tabindex', '-1'); m.focus({ preventScroll: true }); }, 60);
    });
  }
  // Potrdi: pregled po strankah → baza zabeleži in pri oddaji ustvari spremne liste, ti se natisnejo sami
  var RF_SAMO_MS = 3000;
  async function rfPotrdi() {
    if (RF.potrjujem || RF.oznacujem) return;   // drugi dotik, osvežitev med klicem: en sam
    rfMostKlic('ustavi'); toastSkrij();   // pregled naj ostane, kot je; »Razveljavi« ne sme ostati nad oknom
    if (RF.nacin === 'oddaja' && rfTiskNaVoljo()) rfPdfModuli().catch(function () {});   // da je PDF pripravljen, ko je list ustvarjen
    RF.potrjujem = true; rfOsvezi();
    try {
      rfPozabi(RF.sken);   // vsi čipi znova (vmes označeni pri drugi stranki, izbrisana stranka …); prikaz ostane do novih podatkov
      try { await rfIsci(true); } catch (e) { zvNapaka(); rfIsciNapaka(e, true); return; }
      var r = rfRazvrsti(), odd = RF.nacin === 'oddaja'; if (!r.znanih) return;
      // izbor = točno to, kar okno pokaže; čipi, prebrani pozneje (tudi naslednji voziček), gredo v naslednje skeniranje
      var izbor = { posnetek: RF.sken.slice(), epcs: rfZaPoslati() };
      var vrst = r.stranke.map(function (g) { var z = odd && g.ze; return { ime: g.ime, n: g.n, opis: z ? rfZeBesedilo(g) : '', cls: z ? 'opoz' : '' }; });
      if (r.nezn.length + r.dvo.length) vrst.push({ ime: 'Ne šteje se', n: r.nezn.length + r.dvo.length, cls: 'tiho',
        opis: [r.nezn.length ? stevilo(r.nezn.length) + ' neoznačenih' : '', r.dvo.length ? stevilo(r.dvo.length) + ' pri več strankah' : ''].filter(Boolean).join(' · ') });
      // delavec je s Potrdi označil konec; če ni česa odločiti, gre naprej samo (neoznačeni kosi, že oddano: odloči človek)
      var cisto = !r.nezn.length && !r.dvo.length && !(odd && r.stranke.some(function (g) { return g.ze; }));
      var ok = await rfOkno({ naslov: odd ? 'Ustvari ' + sklonListovToz(r.stranke.length) : 'Zabeleži prevzem', vrstice: vrst, samodejno: cisto ? RF_SAMO_MS : 0,
        gumbi: [{ t: 'Nazaj', v: false }, { t: odd ? 'Ustvari' : 'Zabeleži', v: true, glavni: true }] });
      if (ok) await rfPotrdiIzvedi(true, 0, izbor);
    } finally { RF.potrjujem = false; if (!RF.rezultat) rfOsvezi(); else rfZaklep(); }
  }
  async function rfPotrdiIzvedi(preveri, poskus, izbor) {
    var odd = RF.nacin === 'oddaja', d = null, napaka = null, posnetek = izbor.posnetek, epcs = izbor.epcs;
    if (!epcs.length) return;
    if (!RF.kljuc) { RF.kljuc = rfKljuc(); rfShrani(); }   // shranjen PRED klicem: ponovitev po izpadu ga uporabi znova (nič dvakrat)
    rfOsvezi();
    try {
      var x = await zRokom(sb.rpc('rfid_potrdi', { p_tip: odd ? 'oddaja' : 'prevzem', p_epcs: epcs, p_kljuc: RF.kljuc, p_izdal: JAZ ? JAZ.ime : null, p_preveri: !!preveri }));
      if (x.error) throw x.error;
      d = x.data || {};
    } catch (e) { napaka = e; }   // ključ ostane: ponovna potrditev ne ustvari dvojnih listov
    if (napaka) {
      // ključ je že porabila druga vsebina (izpad, nato spremenjeno skeniranje): nov ključ; že oddano ujame preverjanje
      if (/kljuc_porabljen/.test(String(napaka.message || '')) && !poskus) { RF.kljuc = rfKljuc(); rfShrani(); return rfPotrdiIzvedi(true, 1, izbor); }
      zvNapaka(); toast(napakaBesedilo(napaka)); if (napaka.code === '42501') rfBrezDostopa();
      return;
    }
    if (Array.isArray(d.ze_oddano) && d.ze_oddano.length) { await rfZeOddano(d.ze_oddano, izbor); return; }
    if (!(odd ? (d.listi || []).length : (d.kosov || 0))) {   // strežnik ni ustvaril ničesar (stranka vmes izbrisana, čip pri več strankah …): ne uspeh, skeniranje ostane
      zvNapaka(); toast('Nič ni bilo zabeleženo: stanje čipov se je vmes spremenilo'); RF.kljuc = null; rfShrani();
      rfPozabi(RF.sken); rfPreveriDostop().then(izvedi2, izvedi2); return;   // tudi seznam strank (stranka je bila morda izklopljena)
    }
    rfOdstraniPoslane(posnetek);
    zvUspeh();
    if (odd) { RF.rezultat = { listi: d.listi || [] }; rfZapomniListe(RF.rezultat.listi); rfRisi(); rfTiskajRezultat(); }
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
    zvNapaka();
    var izb = await rfOkno({ naslov: 'Že oddano', vrstice: ze.map(function (z) {
        var vseh = vsehStr[z.org] || 0;
        return { ime: z.ime || IME[z.org] || 'Stranka', n: z.kosov, cls: 'opoz',
          opis: [vseh > z.kosov ? stevilo(z.kosov) + ' od ' + stevilo(vseh) : '', (z.listi || []).map(function (l) { return l.stevilka; }).filter(Boolean).join(', '), rfUra(z.cas)].filter(Boolean).join(' · ') };
      }),
      gumbi: [{ t: 'Nazaj', v: 0 }, { t: 'Vseeno ustvari', v: 2 }, { t: ostane ? 'Izloči in ustvari' : 'Izloči', v: 1, glavni: true }] });
    if (izb === 2) { await rfPotrdiIzvedi(false, 0, izbor); return; }
    if (izb !== 1) return;
    RF.kljuc = null; rfShrani();   // druga vsebina = nov ključ
    if (ostane) { await rfPotrdiIzvedi(true, 0, { posnetek: izbor.posnetek, epcs: ostali }); return; }
    // vse je že oddano: pokaži obstoječe liste (lahko se natisnejo znova); čipi, prebrani med klicem, ostanejo
    var listi = [];
    ze.forEach(function (z) { (z.listi || []).forEach(function (l) { listi.push({ org: z.org, note: l.note, stevilka: l.stevilka, kosov: (z.listi || []).length === 1 ? z.kosov : null }); }); });
    rfOdstraniPoslane(izbor.posnetek);
    RF.rezultat = { listi: listi, ze: true }; rfRisi();
  }
  // zadnji ustvarjeni listi (3 dni, kot tisk v bazi): natisni znova iz menija
  function rfZapomniListe(listi) { var n = (listi || []).filter(function (l) { return l.note; }); if (n.length) LS.pisi('sc-rfa-zadnji-listi', { cas: Date.now(), listi: n }); }
  function rfZadnjiListi() { var z = LS.beri('sc-rfa-zadnji-listi', null); return z && z.cas && Date.now() - z.cas < 3 * 864e5 && Array.isArray(z.listi) && z.listi.length ? z.listi : null; }
  var IKO_KLJUKA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var IKO_ZE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 7v6M12 17h.01"/></svg>';
  function rfRisiRezultat(t) {
    var listi = RF.rezultat.listi, ze = !!RF.rezultat.ze;
    var naslov = ze ? 'Že oddano' : listi.length === 1 ? 'Spremni list ustvarjen' : 'Ustvarjeni spremni listi';
    t.innerHTML = '<div class="uc-card rf-rezultat' + (ze ? ' ze' : '') + '"><div class="rf-uspeh"><span class="rf-uspeh-i" aria-hidden="true">' + (ze ? IKO_ZE : IKO_KLJUKA) + '</span><h3 class="sec-h">' + naslov + '</h3></div>' +
      '<div class="rf-listi">' + listi.map(function (l) { return '<div class="rf-list"><b>' + esc(l.stevilka || '') + '</b><span>' + esc(IME[l.org] || '') + '</span><span class="u-sub">' + (l.kosov != null ? sklonKosov(l.kosov) : '') + '</span></div>'; }).join('') + '</div>' +
      '<p class="rf-tisk-st" data-rf-tisk-st role="status"></p><div class="rf-rez-akc"><button type="button" class="ur-save" data-rf-tisk>' + IKO_TISK + '<span>Natisni</span></button><button type="button" data-rf-nova>Novo skeniranje</button></div></div>';
    t.querySelector('[data-rf-nova]').addEventListener('click', function () { RF.rezultat = null; rfRisi(); });
    t.querySelector('[data-rf-tisk]').addEventListener('click', rfTiskajRezultat);
    rfTiskStanje();
  }
  // ustvarjeni listi se natisnejo sami; gumb ostane za ponovitev
  function rfTiskajRezultat() {
    var rez = RF.rezultat, g = document.querySelector('[data-rf-tisk]'); if (!rez) return;
    var ids = rez.listi.map(function (l) { return l.note; }).filter(Boolean);
    if (!ids.length || (g && g.disabled)) return;
    rez.tisk = 'tiskam'; rfTiskStanje();
    rfNatisni(ids, g).then(function (izid) { rez.tisk = izid; rfTiskStanje(); });
  }
  function rfTiskStanje() {
    var st = document.querySelector('[data-rf-tisk-st]'), g = document.querySelector('[data-rf-tisk] span'), t = RF.rezultat && RF.rezultat.tisk; if (!st) return;
    st.textContent = t === 'tiskam' ? 'Tiskam …' : t === 'natisnjeno' ? 'Poslano na tiskalnik' : '';
    if (g) g.textContent = t === 'natisnjeno' ? 'Natisni znova' : 'Natisni';
  }
  var IKO_TISK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg>';

  // ── Poišči: skeniran kos ──
  function rfRisiPoisci(t) {
    t.innerHTML = '<div class="uc-card rf-sken rf-isci">' + rfVnosHtml() + '</div><div id="rfaKos"></div>';
    rfVezi();
    rfRisiNajdene();
  }
  async function rfPoisci(epcs, tiho) {
    if (tiho && RF.iscemKos) return;
    if (!tiho) rfMostKlic('ustavi');
    var gen = tiho ? RF.gen : ++RF.gen;
    if (!tiho) RF.iscemKos = true;
    try {
      var r = await zRokom(sb.from('rfid_kosi').select('id,epc,org_id,article_id,naziv,stanje,pranj,zadnji_tip,zadnjic,created_at').in('epc', epcs.slice(0, 50)));
      if (r.error) throw r.error;
      if (gen !== RF.gen) return;
      var vsi = r.data || [], prvi = epcs.filter(function (e) { return vsi.some(function (k) { return k.epc === e; }); })[0] || epcs[0];
      RF.najdeni = { epc: prvi, kosi: vsi.filter(function (k) { return k.epc === prvi; }).sort(function (a, b) { return (a.stanje === 'odpisan') - (b.stanje === 'odpisan'); }), zgod: {} };
      rfRisiNajdene();
      RF.najdeni.kosi.forEach(function (k) { rfZgodovina(k, gen); });
    } catch (e) { if (!tiho) toast(napakaBesedilo(e)); }
    finally { if (!tiho && gen === RF.gen) RF.iscemKos = false; }
  }
  async function rfZgodovina(k, gen) {
    try {
      var r = await Promise.all([
        sb.from('rfid_seje').select('tip,created_at').contains('kosi', [k.id]).order('created_at', { ascending: false }).limit(12),
        sb.from('rfid_dogodki').select('tip,opis,created_at').eq('kos_id', k.id).order('created_at', { ascending: false }).limit(12)
      ]);
      if (gen !== RF.gen || !RF.najdeni) return;
      var v = (r[0].data || []).map(function (s) { return { t: RF_TIPI[s.tip] || s.tip, d: s.created_at }; })
        .concat((r[1].data || []).map(function (d) { return { t: (RF_TIPI[d.tip] || d.tip) + (d.opis ? ' · ' + d.opis : ''), d: d.created_at }; }))
        .sort(function (a, b) { return String(b.d).localeCompare(String(a.d)); }).slice(0, 12);
      RF.najdeni.zgod[k.id] = v;
      rfRisiNajdene();
    } catch (e) {}
  }
  function rfRisiNajdene() {
    var el = $('rfaKos'); if (!el) return;
    var n = RF.najdeni; if (!n) { el.innerHTML = ''; return; }
    if (!n.kosi.length) { el.innerHTML = '<div class="uc-card rfa-prazno"><h3>Čip ' + esc(rfKratko(n.epc)) + ' ni označen</h3></div>'; return; }
    el.innerHTML = n.kosi.map(function (k) {
      var p = rfPogresan(k), cls = k.stanje !== 'aktiven' ? ' tiho' : p ? ' opoz' : '';
      var zg = n.zgod[k.id];
      return '<div class="uc-card rfa-kos"><h3>' + esc(k.naziv || 'Kos') + '</h3><span class="rfa-kos-stanje' + cls + '">' + esc(p || rfKje(k)) + '</span>' +
        '<dl class="okno-dl"><dt>Stranka</dt><dd>' + esc(IME[k.org_id] || '') + '</dd><dt>Pranj</dt><dd>' + stevilo(k.pranj || 0) + '</dd><dt>Označen</dt><dd>' + esc(datumCas(k.created_at)) + '</dd><dt>Čip</dt><dd class="rf-epc">' + esc(k.epc) + '</dd></dl>' +
        (zg && zg.length ? '<div class="rf-zgod">' + zg.map(function (z) { return '<div class="rf-zg"><span>' + esc(z.t) + '</span><span class="u-sub">' + esc(datumCas(z.d)) + '</span></div>'; }).join('') + '</div>' : '') + '</div>';
    }).join('');
  }

  /* ══════════ TISK (dokument enak kot v portalu in na tablici) ══════════ */
  var DOK_BIZ = ['BSMART d.o.o.', 'Škalska cesta 6, 3210 Slovenske Konjice', '+386 41 209 676', '+386 68 693 988', 'blanka.kovacic1@gmail.com'];
  function dokPisave() {
    var f = location.origin + '/fonts/';
    return "@font-face{font-family:'Archivo';font-weight:100 900;font-display:swap;src:url('" + f + "archivo-latin-wght-normal.woff2') format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}" +
      "@font-face{font-family:'Archivo';font-weight:100 900;font-display:swap;src:url('" + f + "archivo-latin-ext-wght-normal.woff2') format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}" +
      "@font-face{font-family:'Playfair Display';font-weight:700;font-display:swap;src:url('" + f + "playfair-display-latin-700-normal.woff2') format('woff2')}";
  }
  var DOK_CSS = '@page{size:A4;margin:0}' +
    '*{box-sizing:border-box}html{background:#e9edeb}' +
    "body{margin:0;background:#e9edeb;color:#0a0a0a;font-family:'Archivo',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
    '.a4{position:relative;padding:12mm 12mm 14mm;color:#0a0a0a;background:#fff;min-height:297mm;break-after:page}' +
    '.a4:last-child{break-after:auto}.a4+.a4{margin-top:14px}' +
    '@media print{html,body{background:#fff}.a4{min-height:0}.a4+.a4{margin-top:0}}' +
    '.sc-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:18px;padding-bottom:14px;border-bottom:1.5px solid #0a0a0a}' +
    ".sc-wm{font-family:'Playfair Display',serif;font-weight:700;letter-spacing:-.03em;line-height:.9;font-size:32px;color:#0d1f17;white-space:nowrap}" +
    '.sc-wm span{color:#1a6644}' +
    '.sc-biz{font-size:9px;line-height:1.6;text-align:right;color:#666;white-space:nowrap;font-weight:500}' +
    '.sc-box{border:1px solid #dcdcdc;border-radius:9px;padding:10px 14px;margin-bottom:10px}' +
    '.sc-num{font-size:13px;font-weight:700;display:flex;justify-content:space-between;align-items:baseline;gap:12px}' +
    '.sc-num b{font-variant-numeric:tabular-nums;letter-spacing:.01em}' +
    '.sc-client{display:flex;justify-content:space-between;gap:14px}.sc-client .cl{font-size:12px}' +
    '.sc-client .cname{font-weight:700;border-bottom:2px solid #0a0a0a;padding:0 2px}' +
    '.sc-client .cname-sec{font-weight:400;color:#6b7280;font-size:.85em;margin-left:4px}' +
    '.sc-client .sc-dates{margin-top:10px;font-size:11px;color:#666}' +
    '.sc-sign{border-left:1px solid #dcdcdc;padding-left:16px;font-weight:600;font-size:12px;min-width:110px;color:#666}' +
    'table.sc-table{width:100%;border-collapse:collapse;font-size:10px;margin-top:4px}' +
    'table.sc-table th{color:#0a0a0a;font-weight:700;font-size:9px;letter-spacing:.09em;text-transform:uppercase;padding:0 8px 8px;text-align:center;border-bottom:1.5px solid #0a0a0a}' +
    'table.sc-table th.l{text-align:left}' +
    'table.sc-table td{border-bottom:1px solid #ececec;padding:5px 8px;height:15px;font-variant-numeric:tabular-nums}' +
    'table.sc-table td.an{color:#0a0a0a;font-weight:600;text-align:left}' +
    'table.sc-table td.qty{text-align:center;font-weight:700;width:34%;color:#0a0a0a}' +
    '.sc-weight{margin-top:12px;font-size:12px;color:#0a0a0a;text-align:right;font-weight:600}' +
    '.sc-note{margin-top:10px;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:12px;white-space:pre-wrap}';
  function dokHtml(naslov, telesa) {
    var glava = '<div class="sc-head"><div class="sc-wm">Smart<span>Clean</span></div><div class="sc-biz">' + DOK_BIZ.map(esc).join('<br>') + '</div></div>';
    return '<!DOCTYPE html><html lang="sl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(naslov) + '</title><style>' + dokPisave() + DOK_CSS + '</style></head><body>' +
      telesa.map(function (t) { return '<div class="a4">' + glava + t + '</div>'; }).join('') + '</body></html>';
  }
  function listTelo(n) {
    var naziv = n.podjetje || n.stranka || '—', nazivSek = (n.podjetje && n.stranka && n.stranka !== n.podjetje) ? n.stranka : '';
    var post = Array.isArray(n.postavke) ? n.postavke : [];
    var rows = post.length ? post.map(function (p) { return '<tr><td class="an">' + esc(p.naziv) + '</td><td class="qty">' + stevilo(p.kosov) + '</td></tr>'; }).join('')
      : '<tr><td class="an" colspan="2" style="color:#888">Ni postavk</td></tr>';
    var izdal = n.issued_name ? ' &nbsp;·&nbsp; Izdal: ' + esc(n.issued_name) : '';
    var prevoz = ' &nbsp;·&nbsp; ' + (n.transport === 'izredni' ? 'Izredni prevoz' : 'Redni prevoz');
    var kg = Number(n.weight_kg) > 0 ? '<div class="sc-weight">Skupaj teža perila: <b>' + tezaFmt(n.weight_kg) + '</b></div>' : '';
    var opomba = n.opomba_stranka ? '<div class="sc-note"><b>Opomba:</b> ' + esc(n.opomba_stranka) + '</div>' : '';
    return '<div class="sc-box sc-num"><span>Št. spremnega lista: <b>' + esc(n.number) + '</b></span></div>' +
      '<div class="sc-box sc-client"><div class="cl"><div><b>Naročnik storitve:</b> <span class="cname">' + esc(naziv) + '</span>' + (nazivSek ? ' <span class="cname-sec">(' + esc(nazivSek) + ')</span>' : '') + '</div>' +
      '<div class="sc-dates">Oddaja: ' + datumDan(n.doc_date) + izdal + prevoz + '</div></div><div class="sc-sign">Podpis:</div></div>' +
      '<table class="sc-table"><thead><tr><th class="l">Naziv artikla</th><th>Oddaja (št. kosov)</th></tr></thead><tbody>' + rows + '</tbody></table>' + kg + opomba;
  }
  var _tiskamDo = 0;
  async function rfNatisni(ids, gumb) {
    if (!ids.length || Date.now() < _tiskamDo) return;   // dvojni dotik ne pošlje dvakrat
    if (gumb) { gumb.disabled = true; gumb.classList.add('nalaga'); }
    try {
      var r = await zRokom(sb.rpc('rfid_tisk', { p_notes: ids }));
      if (r.error) throw r.error;
      var listi = Array.isArray(r.data) ? r.data : [];
      if (!listi.length) { toast('Spremnih listov ni bilo mogoče naložiti.'); return; }
      var naslov = listi.length === 1 ? 'Spremni list ' + listi[0].number : sklonListov(listi.length);
      _tiskamDo = Date.now() + 3500;
      var izid = await rfTiskNaravnost(listi, naslov);
      if (izid && izid.ok) return 'natisnjeno';
      // brez neposrednega tiska (starejša aplikacija, tiskalnik ni dosegljiv): okno Androida
      var telesa = []; listi.forEach(function (n) { telesa.push(listTelo(n), listTelo(n)); });   // dva izvoda, kot na tablici
      var html = dokHtml(naslov, telesa);
      if (window.ScRfid && typeof window.ScRfid.natisni === 'function') window.ScRfid.natisni(html, naslov);
      else natisniPrekIframe(html);
      return 'okno';
    } catch (e) { toast(napakaBesedilo(e)); return 'napaka'; }
    finally { if (gumb) { gumb.disabled = false; gumb.classList.remove('nalaga'); } }
  }
  // ── Neposreden tisk (aplikacija za C72 od 1.7): isti PDF kot v portalu, dva izvoda kot na tablici; izid pride z dogodkom »tisk« ──
  var _pdfModuli = null, _tiskIzid = null;
  function rfTiskNaVoljo() { return !!(window.ScRfid && typeof window.ScRfid.natisniPdf === 'function'); }
  function rfNaloziSkript(pot) { return new Promise(function (ok, ne) { var s = document.createElement('script'); s.src = pot; s.onload = ok; s.onerror = ne; document.head.appendChild(s); }); }
  function rfPdfModuli() {
    if (!_pdfModuli) _pdfModuli = rfNaloziSkript('../pdfgen.js').then(function () { return rfNaloziSkript('../spremni-pdf.js'); }).catch(function (e) { _pdfModuli = null; throw e; });
    return _pdfModuli;
  }
  function rfListPdf(n) {
    var post = Array.isArray(n.postavke) ? n.postavke : [];
    return { stevilka: n.number || '', naziv: n.podjetje || n.stranka || '—', nazivSek: (n.podjetje && n.stranka && n.stranka !== n.podjetje) ? n.stranka : '',
      oddaja: 'Oddaja: ' + datumDan(n.doc_date) + (n.issued_name ? '  ·  Izdal: ' + n.issued_name : '') + '  ·  ' + (n.transport === 'izredni' ? 'Izredni prevoz' : 'Redni prevoz'),
      postavke: post.map(function (p) { return { naziv: p.naziv, kosov: stevilo(p.kosov) }; }),
      kg: Number(n.weight_kg) > 0 ? tezaFmt(n.weight_kg) : '', opomba: n.opomba_stranka || '' };
  }
  function rfPdfBase64(doc) { var u = doc.build(), s = ''; for (var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
  function rfTiskPoslji(b64, naslov, strani) {
    return new Promise(function (res) {
      var rok = setTimeout(function () { konec({ ok: false, napaka: 'cas' }); }, 45000 + (strani || 1) * 8000);   // tiskalnik brez PDF: vsako stran izriše aplikacija
      function konec(d) { clearTimeout(rok); _tiskIzid = null; res(d); }
      _tiskIzid = konec;
      try { window.ScRfid.natisniPdf(b64, naslov); } catch (e) { konec({ ok: false, napaka: 'most' }); }
    });
  }
  async function rfTiskNaravnost(listi, naslov) {
    if (!rfTiskNaVoljo()) return null;
    try {
      await rfPdfModuli();
      window.SpremniPdf.BIZ = DOK_BIZ;
      var doc = new PDFDoc();
      listi.forEach(function (n) { var p = rfListPdf(n); [0, 1].forEach(function () { doc.addPage(); window.SpremniPdf.stran(doc, p); }); });
      return await rfTiskPoslji(rfPdfBase64(doc), naslov, doc.pages.length);
    } catch (e) { return null; }
  }
  function rfTiskNapaka(k) { return { 'ni-najden': 'Tiskalnik ni najden v omrežju.', 'ne-sprejema': 'Tiskalnik trenutno ne sprejema nalog.', 'format': 'Tiskalnik ne sprejme dokumenta.' }[k] || 'Povezava s tiskalnikom ni uspela.'; }
  // Skrbnik: naslov tiskalnika (prazno = poišče ga v omrežju) in poskusna stran
  async function rfTiskalnik() {
    var t = {}; try { t = JSON.parse(window.ScRfid.tiskalnik()) || {}; } catch (e) {}
    var izb = await rfOkno({ naslov: 'Tiskalnik', vrstice: [{ ime: t.ime || (t.naslov ? 'Tiskalnik' : 'Samodejno v omrežju'), opis: t.naslov || '' }],
      gumbi: [{ t: 'Zapri', v: 0 }, { t: 'Naslov', v: 2 }, { t: 'Poskusna stran', v: 1, glavni: true }] });
    if (izb === 2) {
      var v = await vnesiModal({ naslov: 'Naslov tiskalnika', privzeto: t.rocni ? t.naslov : '', placeholder: '192.168.1.50', potrdi: 'Shrani' });
      if (v != null) { window.ScRfid.tiskalnikNastavi(v.trim()); rfTiskalnik(); }
    } else if (izb === 1) {
      try {
        await rfPdfModuli();
        var doc = new PDFDoc(); doc.addPage(); doc.logo(34, 40, 24);
        doc.text(34, 92, 'Poskusna stran', { size: 18, bold: true });
        doc.text(34, 118, new Date().toLocaleString('sl-SI') + (JAZ ? '  ·  ' + JAZ.ime : ''), { size: 11 });
        toast('Pošiljam …');
        var d = await rfTiskPoslji(rfPdfBase64(doc), 'Poskusna stran');
        if (d.ok) { zvUspeh(); toast('Poslano: ' + (d.tiskalnik || 'tiskalnik')); } else { zvNapaka(); toast(rfTiskNapaka(d.napaka)); }
      } catch (e) { zvNapaka(); toast(rfTiskNapaka('')); }
    }
  }
  function natisniPrekIframe(doc) {
    var star = $('rfaTisk'); if (star) star.remove();
    var ifr = document.createElement('iframe'); ifr.id = 'rfaTisk'; ifr.setAttribute('aria-hidden', 'true');
    ifr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(ifr);
    var klican = false;
    function natisni() {
      if (klican) return; klican = true;
      var w = ifr.contentWindow, pis = Promise.resolve(); try { pis = w.document.fonts.ready; } catch (e) {}
      Promise.race([pis, new Promise(function (r) { setTimeout(r, 1500); })]).then(function () { try { w.focus(); w.print(); } catch (e) { toast('Tiskanje ni uspelo.'); } });
    }
    ifr.onload = natisni; ifr.srcdoc = doc; setTimeout(natisni, 2500);
  }

  /* ══════════ ČITALEC (aplikacija na C72) ══════════ */
  var RF_MOST = (function () { try { return window.ScRfid && typeof window.ScRfid.stanje === 'function' ? window.ScRfid : null; } catch (e) { return null; } })();
  var RF_BRALNIKI = { vgrajen: 'Vgrajen čitalec', r1: 'R1 · USB', ur4: 'UR4 · omrežje', preizkus: 'Preizkus' };
  var RF_MOC = { blizu: 10, srednje: 20, dalec: 30 }, RF_MOC_IME = [['blizu', 'Blizu'], ['srednje', 'Srednje'], ['dalec', 'Daleč']];
  function rfMostStanje() { if (!RF.most && RF_MOST) { try { RF.most = JSON.parse(RF_MOST.stanje()) || {}; } catch (e) { RF.most = {}; } } return RF.most || {}; }
  // most Android ujema metodo po imenu IN številu argumentov: zacni()/ustavi() brez argumenta (z »undefined« tiho ne deluje)
  function rfMostKlic(fn, arg) { try { if (RF_MOST) { if (arguments.length > 1) RF_MOST[fn](arg); else RF_MOST[fn](); } } catch (e) {} }
  // doseg po načinu: označevanje in iskanje blizu (le kos v roki), oddaja in prevzem največ (kup perila duši signal)
  function rfMocNacin() { var m = LS.beri('sc-rfid-moc2', {}) || {}; return RF_MOC[m[RF.nacin]] ? m[RF.nacin] : (rfBliza() ? 'blizu' : 'dalec'); }
  function rfMocNastavi(st, shrani) {
    if (shrani) { var m = LS.beri('sc-rfid-moc2', {}) || {}; m[RF.nacin] = st; LS.pisi('sc-rfid-moc2', m); }
    rfMostKlic('moc', RF_MOC[st]);
  }
  function rfMocStopnja(dbm) { return dbm <= 14 ? 'blizu' : dbm <= 24 ? 'srednje' : 'dalec'; }
  var IKO_DESNO = '<svg class="rf-cit-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  function rfCitHtml() {
    return '<div class="rf-cit" id="rfCit">' +
      '<button type="button" class="rf-cit-cip" id="rfCitCip" aria-haspopup="dialog"><i class="rf-cit-pika" aria-hidden="true"></i><span class="rf-cit-t"></span>' + IKO_DESNO + '</button>' +
      '<p class="rf-cit-nap" aria-live="polite" hidden></p>' +
      '<button type="button" class="rf-beri" id="rfBeri"><i class="rf-pika" aria-hidden="true"></i><span></span></button></div>';
  }
  function rfCitVezi() {
    var c = $('rfCit'); if (!c) return;
    $('rfCitCip').addEventListener('click', rfCitOkno);
    $('rfBeri').addEventListener('click', function () {
      var s = rfMostStanje();
      if (s.bere) rfMostKlic('ustavi');
      else if (s.povezan) { _rfCuvaj.gumb = true; rfMostKlic('zacni'); }
      else if (s.izbran === 'ur4' && !s.ur4) rfUr4Naslov();
      else rfMostKlic('izberi', s.izbran);   // ponovna povezava
    });
    rfCitOsvezi();
  }
  async function rfUr4Naslov() {
    var v = await vnesiModal({ naslov: 'Naslov UR4', privzeto: rfMostStanje().ur4 || '', placeholder: '192.168.1.200', potrdi: 'Poveži', tipkovnica: 'decimal' });
    if (v != null && v.trim()) rfMostKlic('ur4', v.trim()); else rfCitOsvezi();
  }
  function rfCitStanje(s) { return s.odpiram ? 'odpiram' : s.bere ? 'bere' : s.povezan ? 'pripravljen' : 'napaka'; }
  function rfCitOsvezi() {
    var c = $('rfCit');
    if (c) {
      var s = rfMostStanje(), st = rfCitStanje(s);
      c.dataset.st = st;
      var ime = RF_BRALNIKI[s.izbran] || ((s.bralniki || []).filter(function (b) { return b.id === s.izbran; })[0] || {}).ime || 'Čitalec';
      if (s.izbran === 'ur4') ime = 'UR4';   // naslov je v oknu čitalca; v vrstici le ime in doseg (sicer odrezano na telefonu)
      var moc = (RF_MOC_IME.filter(function (m) { return m[0] === rfMocStopnja(s.moc || 20); })[0] || [])[1];
      c.querySelector('.rf-cit-t').textContent = ime + (moc ? ' · ' + moc : '');
      var nap = c.querySelector('.rf-cit-nap'); nap.hidden = st !== 'napaka'; nap.textContent = st === 'napaka' ? (s.napaka || 'Čitalec ni povezan.') : '';
      var g = $('rfBeri');
      g.querySelector('span').textContent = st === 'bere' ? 'Ustavi' : st === 'odpiram' ? 'Povezujem' : st === 'napaka' ? 'Poveži' : 'Beri';
      g.disabled = st === 'odpiram'; g.classList.toggle('on', st === 'bere');
    }
    rfCitOknoOsvezi();
  }
  // nastavitve čitalca: kateri čitalec in doseg; spremembe veljajo takoj, okno ostane odprto
  function rfCitOkno() {
    if ($('rfCitOkno')) return;
    var back = document.createElement('div'); back.className = 'sc-modal-back'; back.id = 'rfCitOkno';
    back.innerHTML = '<div class="sc-modal rf-cit-okno" role="dialog" aria-modal="true" aria-label="Čitalec"><h4>Čitalec</h4>' +
      '<div class="rf-cit-sez" role="radiogroup" aria-label="Čitalec"></div>' +
      '<div class="rf-cit-ur4" hidden><span class="rf-cit-ur4-t"></span><button type="button" class="cgrp-btn ghost" data-ur4>Spremeni</button></div>' +
      '<div class="rf-cit-doseg"><span>Doseg</span><span class="pris-tabs rf-moc" role="tablist" aria-label="Doseg">' +
      RF_MOC_IME.map(function (m) { return '<button type="button" role="tab" class="pris-tab" data-moc="' + m[0] + '">' + m[1] + '</button>'; }).join('') + '</span></div>' +
      '<div class="sc-modal-acts"><button type="button" class="sc-modal-btn primary" data-zapri>Končano</button></div></div>';
    document.body.appendChild(back);
    requestAnimationFrame(function () { back.classList.add('show'); });
    function zapri() { if (!back.isConnected) return; back.classList.remove('show'); back.id = ''; document.removeEventListener('keydown', tipka); setTimeout(function () { back.remove(); }, 180); }
    function tipka(e) { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); zapri(); } }
    back.addEventListener('click', function (e) { if (e.target === back) zapri(); });
    back.querySelector('[data-zapri]').addEventListener('click', zapri);
    back.querySelector('[data-ur4]').addEventListener('click', function () { zapri(); rfUr4Naslov(); });
    back.querySelectorAll('[data-moc]').forEach(function (b) { b.addEventListener('click', function () { rfMocNastavi(b.dataset.moc, true); }); });
    back.querySelector('.rf-cit-sez').addEventListener('click', function (e) {
      var b = e.target.closest('[data-b]'); if (!b) return;
      var v = b.dataset.b, s = rfMostStanje();
      if (v === s.izbran) { if (!s.povezan && !s.odpiram) rfMostKlic('izberi', v); return; }
      if (v === 'ur4' && !s.ur4) { zapri(); rfUr4Naslov(); return; }
      rfMostKlic('izberi', v);
    });
    document.addEventListener('keydown', tipka);
    rfCitOknoOsvezi();
    setTimeout(function () { var z = back.querySelector('[data-zapri]'); if (z) z.focus(); }, 60);
  }
  function rfCitOknoOsvezi() {
    var ok = $('rfCitOkno'); if (!ok) return;
    var s = rfMostStanje(), st = rfCitStanje(s), sez = ok.querySelector('.rf-cit-sez');
    var kl = (s.bralniki || []).map(function (b) { return b.id; }).join(',') + '|' + s.izbran + '|' + st;
    if (sez.dataset.k !== kl) {
      sez.dataset.k = kl;
      sez.innerHTML = (s.bralniki || []).map(function (b) {
        var on = b.id === s.izbran;
        return '<button type="button" role="radio" aria-checked="' + on + '" class="rf-cit-moz' + (on ? ' on' : '') + '" data-b="' + esc(b.id) + '"><span>' + esc(RF_BRALNIKI[b.id] || b.ime) + '</span>' +
          (on ? '<i class="rf-cit-pika" data-st="' + st + '" aria-hidden="true"></i>' : '') + '</button>';
      }).join('');
    }
    var u4 = ok.querySelector('.rf-cit-ur4'); u4.hidden = s.izbran !== 'ur4'; ok.querySelector('.rf-cit-ur4-t').textContent = s.ur4 || '—';
    var stop = rfMocStopnja(s.moc || 20);
    ok.querySelectorAll('[data-moc]').forEach(function (b) { var on = b.dataset.moc === stop; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  }
  // prebrani čipi iz aplikacije
  function rfMostEpci(seznam) {
    if ($('app').hidden) return;
    var epci = seznam.map(rfEpc).filter(Boolean); if (!epci.length) return;
    if (modalOdprt()) { RF.vrsta = RF.vrsta.concat(epci); rfVrstaCakaj(); return; }   // okno je odprto: počakaj, ne zavrzi (C72 jih v tem pritisku ne pošlje znova)
    rfDodajNaRezultat(epci);   // Poišči: prvi označen čip se odpre, branje se ustavi
  }
  // rezultat (ustvarjeni listi) ostane, dokler ne pride res nov čip
  function rfDodajNaRezultat(epci) {
    var bil = !!RF.rezultat, novih = rfDodajVec(epci);
    if (bil && novih) { RF.rezultat = null; rfRisi(); }
  }
  var _rfVrstaT = null;
  function rfVrstaCakaj() {
    clearTimeout(_rfVrstaT);
    _rfVrstaT = setTimeout(function () {
      if (modalOdprt()) { rfVrstaCakaj(); return; }
      var v = RF.vrsta; RF.vrsta = [];
      if (v.length && !$('app').hidden) { if (RF.rezultat) rfDodajVec(v); else rfDodajNaRezultat(v); }   // prebrani pred potrditvijo: listi ostanejo na zaslonu, čipi čakajo na naslednje skeniranje
    }, 400);
  }
  // čuvaj (baterija, toplota pri 1 W, zataknjen sprožilec): branje z gumba Beri se ustavi po 6 s brez novih čipov;
  // pri vsem za odvoz sme teči dolgo: po 60 s se ustavi šele, ko 15 s ni novih čipov, najpozneje po 10 min
  var _rfCuvaj = { zacetek: 0, zadnji: 0, t: null, gumb: false };
  function rfBeriZiv(novih) { if (novih) _rfCuvaj.zadnji = Date.now(); }
  function rfCuvajStanje(bere) {
    clearInterval(_rfCuvaj.t);
    if (!bere) { _rfCuvaj.gumb = false; return; }
    _rfCuvaj.zacetek = _rfCuvaj.zadnji = Date.now();
    _rfCuvaj.t = setInterval(function () {
      var n = Date.now(), tece = n - _rfCuvaj.zacetek, tiho = n - _rfCuvaj.zadnji;
      if (tece > 600000 || (tece > 60000 && tiho > 15000) || (_rfCuvaj.gumb && tiho > 6000)) { clearInterval(_rfCuvaj.t); rfMostKlic('ustavi'); }
    }, 1000);
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) rfMostKlic('ustavi'); });
  if (RF_MOST) {
    var brezEnter = function (e) {   // čitalec kot tipkovnica: ne Enter in ne črke v izbirnik (izbira po prvi črki bi tiho zamenjala stranko ali artikel)
      var t = e.target, tag = t && t.tagName;
      if (e.key === 'Enter') { if (tag !== 'INPUT' && tag !== 'TEXTAREA') e.preventDefault(); return; }
      if (tag === 'SELECT' && e.key && e.key.length === 1) e.preventDefault();
    };
    document.addEventListener('keydown', brezEnter, true); document.addEventListener('keypress', brezEnter, true);
    window.addEventListener('scrfid', function (ev) {
      var d = ev.detail || {};
      if (d.tip === 'stanje') {
        var prej = RF.most || {}; RF.most = d; rfCitOsvezi();
        if (d.bere && !prej.bere && RF.ustaviOdstevanje) RF.ustaviOdstevanje();   // skeniranje še ni končano
        if (!!d.bere !== !!prej.bere) rfCuvajStanje(!!d.bere);
        if (d.bere && !prej.bere && RF.rezultat && !$('app').hidden && !modalOdprt()) { RF.rezultat = null; rfRisi(); }   // nov pritisk po ustvarjenih listih = novo skeniranje
      } else if (d.tip === 'epc' && Array.isArray(d.epc)) { if (RF.ustaviOdstevanje) RF.ustaviOdstevanje(); rfMostEpci(d.epc); }
      else if (d.tip === 'tisk' && _tiskIzid) _tiskIzid(d);
    });
    rfMocNastavi(rfMocNacin());
  }

  /* ══════════ ŽIVO: druga naprava (portal, drug C72) je označila ali potrdila ══════════ */
  var _kanal = null, _zivT = null;
  function zivo() {
    if (_kanal || !sb || !sb.channel) return;
    try {
      _kanal = sb.channel('rfid-aplikacija')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rfid_seje' }, zivCipi)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rfid_dogodki' }, zivCipi)
        .subscribe();
    } catch (e) { _kanal = null; }
  }
  function zivCipi() {
    clearTimeout(_zivT);
    _zivT = setTimeout(function () {
      if ($('app').hidden) return;
      if (RF.sken.length) { rfPozabi(RF.sken); izvedi2(); }
      if (RF.nacin === 'poisci' && RF.najdeni) rfPoisci([RF.najdeni.epc], true);
    }, 900);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden || !JAZ) return;
    if (!rfOznaciVelja() && RF.nacin === 'oznaci' && !RF.rezultat) rfRisi();
    zivCipi(); rfPreveriDostop(); rfPreveriRazlicico();
  });

  /* ══════════ NOVA RAZLIČICA ══════════
     C72 je lahko odprt ves dan: ko je objavljena nova različica, se aplikacija naloži znova, a le, ko miruje
     (brez skeniranja, okna, rezultata in branja) — nič se ne izgubi. */
  var RF_VER = '4.96';   // ob objavi enako kot APP_VERZIJA v portalu (prvi »v« v spremembe.json)
  async function rfPreveriRazlicico() {
    try {
      var r = await _izvFetch('../spremembe.json?v=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return;
      var j = await r.json(), v = j && j[0] && j[0].v; if (!v || String(v) === RF_VER) return;
      var bil = LS.beri('sc-rfa-nalozeno', null); if (!bil || typeof bil !== 'object' || bil.v !== v) bil = { v: v, n: 0, t: 0 };
      if (bil.n >= 3 || Math.abs(Date.now() - bil.t) < 10 * 60000 || !rfMiruje()) return;   // največ 3-krat na različico, vsaj 10 min narazen (predpomnilnik lahko vrne staro kodo): brez zanke
      LS.pisi('sc-rfa-nalozeno', { v: v, n: bil.n + 1, t: Date.now() }); location.reload();
    } catch (e) {}
  }
  // brez skeniranja, okna, rezultata, branja, klica v teku, odprtega menija, najdenega kosa in napol vpisane prijave
  function rfMiruje() {
    var pr = !$('prijava').classList.contains('hidden') && ($('email').value || $('geslo').value);
    return !RF.sken.length && !RF.vrsta.length && !RF.rezultat && !RF.najdeni && !RF.potrjujem && !RF.oznacujem && !modalOdprt() &&
      !document.querySelector('.dk-meni') && !(RF.most && RF.most.bere) && !pr;
  }
  setInterval(rfPreveriRazlicico, 20 * 60000);

  /* ══════════ ZAGON ══════════ */
  async function zagon() {
    temaNastavi(temaJe());
    $('prijavaForm').addEventListener('submit', prijava);
    $('nazajOsebe').addEventListener('click', function () { risiOsebe(); });
    $('temaAuth').addEventListener('click', function () { temaNastavi(temaJe() === 'dark' ? 'light' : 'dark'); });
    $('jaz').addEventListener('click', meni);
    if (!sb) { prijavaPokazi('Ni povezave z internetom.'); return; }
    rfPreveriRazlicico();
    var zadnji = LS.beri('sc-rfid-zadnji', null), o = zadnji && oseba(zadnji), s = null, pozno = false, g = ++VSTOP;
    // ne prazen zaslon: po 4 s »Kdo dela« (ali prijava), dokler seja in podatki ne pridejo; izbira osebe vmes ima prednost (VSTOP)
    var cakaj = setTimeout(function () { pozno = true; if (OSEBE.length) risiOsebe('Povezujem …'); else prijavaPokazi(); }, 4000);
    var prehiten = function () { clearTimeout(cakaj); if (pozno && $('osebeMsg').textContent === 'Povezujem …') $('osebeMsg').textContent = ''; };   // oseba je vmes izbrala sama
    try { s = (await sb.auth.getSession()).data.session; } catch (e) {}
    if (g !== VSTOP) { prehiten(); return; }
    if (o && s && s.user && s.user.id === o.uid) {   // zadnja oseba ostane prijavljena
      try { var p = await podatki(); clearTimeout(cakaj); if (g !== VSTOP) { prehiten(); return; } vstopi(o, p); return; }
      catch (e) {
        clearTimeout(cakaj);
        if (g !== VSTOP) { prehiten(); return; }
        if (e && e.code === '42501') { risiOsebe(NI_DOSTOPA); return; }
        if (jeOmrezna(e)) { risiOsebe('Ni povezave z internetom.'); return; }
      }
    }
    clearTimeout(cakaj);
    if (OSEBE.length) risiOsebe(); else if (!pozno) prijavaPokazi();   // prijava je že odprta: ne briši, kar je oseba vmes vpisala
  }
  function zagon2() { var zadnji = LS.beri('sc-rfid-zadnji', null), o = zadnji && oseba(zadnji); if (o) preklopi(o); else $('osebeMsg').textContent = ''; }
  if ('serviceWorker' in navigator && location.protocol === 'https:') { try { navigator.serviceWorker.register('sw.js', { scope: './' }); } catch (e) {} }
  zagon();
})();
