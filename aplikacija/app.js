(function(){
"use strict";
/* ══════════════════════════════════════════════════════════════════════
   SmartClean — spremni listi (tablica + splet), ena koda za obe različici.
   Različico vstavi zgradi.py; kar je odvisno od naprave (tiskanje, PDF v
   Datoteke, izklop), se ugotovi med tekom (Capacitor na tablici).

   Podatki ostanejo v istih ključih kot v prejšnjih različicah (pralnica:*),
   zato posodobitev ne izgubi ničesar.
   ══════════════════════════════════════════════════════════════════════ */
var VARIANTA = "{{VARIANTA}}", APP_VERZIJA = "{{VERZIJA}}";
var LASTNIK = "filip@eflitte.si";
var DOK_BIZ = ["BSMART d.o.o.", "Škalska cesta 6, 3210 Slovenske Konjice", "+386 41 209 676", "+386 68 693 988", "blanka.kovacic1@gmail.com"];
var PRIVZETI_PORTAL = "https://anrhtgbckxrccnafcmsz.supabase.co";
var PRIVZETI_KLJUC = "sb_publishable_LYMbUOYW2IFz4NxgvjXLOg_PJ2-qpS4";   // javni ključ (RLS varuje podatke)

function $(id){ return document.getElementById(id); }
/* Klic na strežnik z omejenim časom. Na WiFi tiskalnika brez interneta zahteva lahko visi
   minute — aplikacija bi obstala; po izteku velja kot »ni povezave«. */
function fetchT(url, opt, ms){
  opt = opt || {};
  var ac = (typeof AbortController !== "undefined") ? new AbortController() : null, t = null;
  if(ac){ opt.signal = ac.signal; t = setTimeout(function(){ try{ ac.abort(); }catch(e){} }, ms || 20000); }
  return fetch(url, opt).then(function(r){ clearTimeout(t); return r; }, function(e){ clearTimeout(t); throw e; });
}
function zRokom(obljuba, ms){ return Promise.race([obljuba, new Promise(function(_, ne){ setTimeout(function(){ ne(new Error("ni povezave")); }, ms); })]); }

/* ══════════ SHRAMBA ══════════
   Tablica: Capacitor Filesystem (Documents — ostane tudi ob ponovni namestitvi).
   Splet: localStorage. */
var STORE_KEY = "pralnica:entries", CLIENTS_KEY = "pralnica:clients_v3", SETTINGS_KEY = "pralnica:settings",
    PROFILES_KEY = "pralnica:profiles", PORTAL_AUTH_KEY = "pralnica:portal_auth";
var LS = (function(){ try{ var k = "__t"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return true; }catch(e){ return false; } })();
var shrambaZaklenjena = false;   // tablica brez dovoljenja za datoteke → NE pišemo (ne prepišemo starih podatkov s praznimi)

function jeNativno(){ try{ return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); }catch(e){ return false; } }
function capFS(){
  try{ if(jeNativno() && Capacitor.Plugins && Capacitor.Plugins.Filesystem) return Capacitor.Plugins.Filesystem; }catch(e){}
  return null;
}
function fileFor(key){ return key.replace(/[^a-z0-9]+/gi, "_") + ".json"; }
/* Prijavni žetoni in PIN-i (profili, seja) so v ZASEBNI mapi aplikacije (DATA), ne v javni mapi
   Documents, kjer jih je lahko prebrala vsaka aplikacija ali računalnik prek kabla. Spremni listi
   ostanejo v Documents (preživijo ponovno namestitev). */
function dirFor(key){ return (key === PROFILES_KEY || key === PORTAL_AUTH_KEY) ? "DATA" : "DOCUMENTS"; }
function dbRead(key){
  var FS = capFS();
  if(FS){
    var dir = dirFor(key);
    if(dir === "DATA"){
      /* selitev: prvič preberi še iz Documents, zapiši v zasebno mapo in javno kopijo izbriši */
      return FS.readFile({ path: fileFor(key), directory: "DATA", encoding: "utf8" })
        .then(function(r){ return r && r.data != null ? r.data : null; })
        .catch(function(){
          return FS.readFile({ path: fileFor(key), directory: "DOCUMENTS", encoding: "utf8" }).then(function(r){
            var v = r && r.data != null ? r.data : null;
            if(v == null) return null;
            return FS.writeFile({ path: fileFor(key), directory: "DATA", encoding: "utf8", data: v, recursive: true })
              .then(function(){ return FS.deleteFile({ path: fileFor(key), directory: "DOCUMENTS" }).catch(function(){}); })
              .catch(function(){}).then(function(){ return v; });
          }).catch(function(){ return null; });
        });
    }
    return FS.readFile({ path: fileFor(key), directory: "DOCUMENTS", encoding: "utf8" })
      .then(function(r){ return r && r.data != null ? r.data : null; })
      .catch(function(e){
        /* »datoteke ni« je običajno (prvi zagon); »ni dovoljenja« pa pomeni, da podatki SO, a jih ne vidimo */
        if(/EACCES|denied|permission/i.test(String((e && e.message) || e || ""))) shrambaZaklenjena = true;
        return null;
      });
  }
  if(LS){ try{ return Promise.resolve(localStorage.getItem(key)); }catch(e){} }
  return Promise.resolve(null);
}
function dbWrite(key, val){
  if(shrambaZaklenjena) return Promise.resolve(false);
  var FS = capFS();
  if(FS){
    /* Najprej celotna vsebina v začasno datoteko, nato zamenjava (rename na Androidu zamenja v enem
       koraku). Prej se je pisalo čez staro datoteko: zaprta aplikacija ali ugasnjena tablica med
       pisanjem je pustila okrnjeno datoteko, ki se je prebrala kot prazen seznam — neposlani listi
       so se izgubili. */
    var dir = dirFor(key), pot = fileFor(key), tmp = pot + ".tmp";
    var naravnost = function(){ return FS.writeFile({ path: pot, directory: dir, encoding: "utf8", data: val, recursive: true })
      .then(function(){ return FS.deleteFile({ path: tmp, directory: dir }).catch(function(){}).then(function(){ return true; }); }).catch(function(){ return false; }); };
    return FS.writeFile({ path: tmp, directory: dir, encoding: "utf8", data: val, recursive: true })
      .then(function(){ return FS.rename({ from: tmp, to: pot, directory: dir, toDirectory: dir }); })
      .then(function(){ return true; }, naravnost);
  }
  if(LS){ try{ localStorage.setItem(key, val); return Promise.resolve(true); }catch(e){} }
  return Promise.resolve(false);
}
var _obnovljenoIzKopije = "";
async function dbJson(key, privzeto){
  var okvara = false;
  try{ var v = await dbRead(key); if(v) return JSON.parse(v); }catch(e){ okvara = true; }
  var FS = capFS(); if(!FS) return privzeto;
  var dir = dirFor(key);
  /* 1) začasna datoteka (pisanje se je prekinilo tik pred zamenjavo) */
  try{ var t = await FS.readFile({ path: fileFor(key) + ".tmp", directory: dir, encoding: "utf8" }); if(t && t.data){ var o = JSON.parse(t.data); _obnovljenoIzKopije = "začasne datoteke"; return o; } }catch(e){}
  if(!okvara) return privzeto;   /* datoteke ni (prvi zagon) — običajno */
  /* 2) okvarjena datoteka: shrani jo za ročno obnovo, spremne liste vzemi iz najnovejše dnevne kopije */
  try{ await FS.rename({ from: fileFor(key), to: fileFor(key) + ".okvara-" + Date.now(), directory: dir, toDirectory: dir }); }catch(e){}
  if(key === STORE_KEY){
    try{
      var r = await FS.readdir({ path: "backup", directory: "DOCUMENTS" });
      var imena = ((r && r.files) || []).map(function(f){ return typeof f === "string" ? f : (f && f.name) || ""; })
        .filter(function(n){ return /^spremni_listi_dan_\d{4}-\d{2}-\d{2}\.json$/.test(n); }).sort().reverse();
      for(var i = 0; i < imena.length; i++){
        try{ var b = await FS.readFile({ path: "backup/" + imena[i], directory: "DOCUMENTS", encoding: "utf8" }); var arr = JSON.parse(b.data); if(Array.isArray(arr)){ _obnovljenoIzKopije = "varnostne kopije " + imena[i].slice(18, 28); return arr; } }catch(e){}
      }
    }catch(e){}
  }
  return privzeto;
}

/* Dnevna varnostna kopija (ena datoteka na dan, zadnjih 30 dni). Prej je nastala nova
   kopija CELEGA arhiva ob vsakem shranjenem listu — tisoče datotek na leto. */
var _varnostnaDan = "";
async function writeBackup(){
  var FS = capFS(); if(!FS || shrambaZaklenjena) return;
  var dan = todayISO();
  try{ await FS.writeFile({ path: "backup/spremni_listi_dan_" + dan + ".json", directory: "DOCUMENTS", encoding: "utf8", data: JSON.stringify(entries), recursive: true }); }catch(e){}
  if(_varnostnaDan === dan) return; _varnostnaDan = dan;
  try{
    var meja = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    var r = await FS.readdir({ path: "backup", directory: "DOCUMENTS" });
    var imena = ((r && r.files) || []).map(function(f){ return typeof f === "string" ? f : (f && f.name) || ""; });
    for(var i = 0; i < imena.length; i++){
      var m = /^spremni_listi_dan_(\d{4}-\d{2}-\d{2})\.json$/.exec(imena[i]);   // samo lastne dnevne kopije
      if(m && m[1] < meja){ try{ await FS.deleteFile({ path: "backup/" + imena[i], directory: "DOCUMENTS" }); }catch(e){} }
    }
  }catch(e){}
}

/* ══════════ STANJE ══════════ */
/* splet: dva zavihka (ali zavihek + aplikacija na začetnem zaslonu) — vsak je pisal svoj seznam
   in brisal liste drugega. Ob spremembi v drugem zavihku ta prebere svežega. */
window.addEventListener("storage", function(ev){
  if(ev.key !== STORE_KEY || !SPLET) return;
  loadEntries().then(function(){ if(session){ try{ renderList(); renderSummary(); risiSyncGumb(); }catch(e){} } });
});
var CLIENTS = [], entries = [], settings = {}, savedProfs = [], session = null;
var selectedId = null, draftQty = {}, draftPrevoz = "redni", editingId = null, showHidden = false;
var draftOpombaStranka = "", draftOpombaEvidenca = "";
var searchMode = "", searchQuery = "", searchDate = "", searchClientId = "", clientPickerMode = "entry";
var previewId = null, reviewEntryId = null, kpArt = null, kpBuf = "", kpMode = "entry";
var pdfPermOK = false, askedPerm = false;

async function loadEntries(){
  _obnovljenoIzKopije = "";
  entries = await dbJson(STORE_KEY, []); if(!Array.isArray(entries)) entries = [];
  if(_obnovljenoIzKopije){
    var vir = _obnovljenoIzKopije;
    setTimeout(function(){ try{ toast("Shramba je bila poškodovana — spremni listi so obnovljeni iz " + vir + "."); }catch(_){} }, 1500);
    saveEntries();   /* obnovljeno takoj zapiši kot veljavno datoteko */
  }
}
var _shrambaOpozorilo = 0;
async function saveEntries(){
  var ok = false; try{ ok = await dbWrite(STORE_KEY, JSON.stringify(entries)); }catch(e){}
  /* prej tiho: list, shranjen brez povezave, je ostal le v pomnilniku in se ob zaprtju izgubil */
  if(!ok && !shrambaZaklenjena && Date.now() - _shrambaOpozorilo > 120000){
    _shrambaOpozorilo = Date.now();
    try{ toast("Shramba naprave je polna — spremni list ni shranjen na napravi. Poveži se z internetom, da se pošlje v portal."); }catch(_){}
  }
  return ok;
}
async function loadClients(){ CLIENTS = await dbJson(CLIENTS_KEY, []); if(!Array.isArray(CLIENTS)) CLIENTS = []; }
async function saveClients(){ try{ await dbWrite(CLIENTS_KEY, JSON.stringify(CLIENTS)); }catch(e){} }
async function loadSettings(){
  settings = await dbJson(SETTINGS_KEY, {}); if(!settings || typeof settings !== "object") settings = {};
  if(!settings.theme) settings.theme = "dark";
  if(!settings.portalUrl) settings.portalUrl = PRIVZETI_PORTAL;
  if(!settings.portalKey) settings.portalKey = PRIVZETI_KLJUC;
}
async function saveSettings(){ await dbWrite(SETTINGS_KEY, JSON.stringify(settings)); }
async function loadProfs(){
  savedProfs = await dbJson(PROFILES_KEY, []); if(!Array.isArray(savedProfs)) savedProfs = [];
  /* starejše različice so kodo hranile kot besedilo — zgosti jo na mestu (67_app_pini.sql), besedilo izbriši */
  var spremenjeno = false;
  for(var i = 0; i < savedProfs.length; i++){
    var p = savedProfs[i];
    if(p && p.pin){ try{ if(!p.pinHash) p.pinHash = await pinZgosti(String(p.pin)); delete p.pin; spremenjeno = true; }catch(e){} }
  }
  if(spremenjeno) await saveProfs();
}
async function saveProfs(){ try{ await dbWrite(PROFILES_KEY, JSON.stringify(savedProfs)); }catch(e){} }

/* ══════════ POMOŽNE ══════════ */
function todayISO(){ var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function fmtDateHuman(iso){ if(!iso) return "—"; var p = String(iso).slice(0, 10).split("-"); return p[2] + ". " + p[1] + ". " + p[0]; }
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function stevilo(n){ return Number(n || 0).toLocaleString("sl-SI"); }
function tezaFmt(kg){   // enako kot v portalu: max 2 decimalki, vejica, nad 1000 kg v tonah
  kg = Math.round((Number(kg) || 0) * 100) / 100;
  var v, u; if(kg >= 1000){ v = kg / 1000; u = "t"; }else{ v = kg; u = "kg"; }
  return v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",") + "\u00a0" + u;
}
function sklon(n, e1, e2, e34, e5){ var m = Math.abs(n) % 100; return m === 1 ? e1 : m === 2 ? e2 : (m === 3 || m === 4) ? e34 : e5; }
function normaliziraj(s){ return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function clientById(id){ return CLIENTS.find(function(c){ return c.id === id; }); }
function artById(id){ var c = clientById(selectedId); return c ? c.artikli.find(function(a){ return a.id === id; }) : null; }
function entryById(id){ return entries.find(function(x){ return x.id === id; }); }
/* stranka lista: po uuid v portalu (zanesljivo), sicer po id-ju v aplikaciji */
function strankaLista(e){ return (e.orgUuid ? CLIENTS.find(function(c){ return c.orgUuid === e.orgUuid; }) : null) || clientById(e.strankaId) || null; }
function strankeUrejene(){ return CLIENTS.slice().sort(function(a, b){ return String(a.naziv || "").localeCompare(String(b.naziv || ""), "sl"); }); }
function stKljuc(e){ var p = String(e.stevilka || "").split("/"); return (parseInt(p[1], 10) || 0) * 100000 + (parseInt(p[0], 10) || 0); }
/* Naslednja številka: največja letošnja (lokalni + iz portala prenesen arhiv) + 1. */
function nextNumber(){
  var y = new Date().getFullYear(), max = 0;
  entries.forEach(function(e){ var p = String(e.stevilka || "").split("/"); if(p[1] == String(y)){ var s = parseInt(p[0], 10); if(!isNaN(s) && s > max) max = s; } });
  return String(max + 1).padStart(4, "0") + "/" + y;
}
function jeZaklenjen(e){ return !!(e && (e.potrjeno || e.zaklenjen)); }

/* ══════════ OBVESTILO + OKNA ══════════ */
function toast(msg){ var t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(function(){ t.classList.remove("show"); }, 2600); }

var odprtaOkna = [], obZaprtju = {}, _okna = {};
/* ── OKNO: ista animacija kot v portalu (oknoOdpri v portal.js) ──
   Raste OKNO SAMO (z vsebino in senco), a le s transform: okno se razteguje, vsebina pa z
   nasprotnim raztegom ostane v pravi velikosti (24 izračunanih ključev z isto krivuljo).
   Kopija elementa, ki je okno odprl (»duh«), je prvi okvir odpiranja in zadnji zapiranja —
   element se poveča v okno in skrči nazaj. Samo transform + opacity. */
function oknoMirno(){ try{ return matchMedia("(prefers-reduced-motion: reduce)").matches; }catch(e){ return false; } }
function oknoKrivulja(x1, y1, x2, y2){
  function b(t, a1, a2){ var u = 1 - t; return 3 * u * u * t * a1 + 3 * u * t * t * a2 + t * t * t; }
  return function(x){
    if(x <= 0) return 0; if(x >= 1) return 1;
    var lo = 0, hi = 1, t = x;
    for(var i = 0; i < 28; i++){ var bx = b(t, x1, x2); if(Math.abs(bx - x) < 1e-5) break; if(bx < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return b(t, y1, y2);
  };
}
var OKNO_ODPRI = oknoKrivulja(.22, .61, .36, 1), OKNO_ZAPRI = oknoKrivulja(.4, 0, .2, 1);
function oknoKljuci(o, krivulja, zapri){
  var c = o.kartica.getBoundingClientRect(), p = o.panel.getBoundingClientRect();
  var sx0 = Math.max(0.02, c.width / p.width), sy0 = Math.max(0.02, c.height / p.height);
  var dx = c.left - p.left, dy = c.top - p.top, N = 24, okno = [], notr = [];
  for(var i = 0; i <= N; i++){
    var t = i / N, e = krivulja(t);
    var f = zapri ? e : 1 - e;   // delež »kartice«: 1 = element, 0 = okno
    var sx = 1 + (sx0 - 1) * f, sy = 1 + (sy0 - 1) * f;
    okno.push({ offset: t, transform: "translate(" + (dx * f) + "px," + (dy * f) + "px) scale(" + sx + "," + sy + ")" });
    /* nasprotni razteg omejen na 2× (kot v portalu): takrat je vsebina še prosojna */
    notr.push({ offset: t, transform: "scale(" + (1 / Math.max(sx, 0.5)) + "," + (1 / Math.max(sy, 0.5)) + ")" });
  }
  return { okno: okno, notr: notr };
}
function oknoDuh(o){
  var k = o.kartica, r = k.getBoundingClientRect(), star = k.parentElement;
  var ovoj = document.createElement("div");
  ovoj.className = (star ? [].filter.call(star.classList, function(c){ return c !== "open" && c !== "hidden"; }).join(" ") + " " : "") + "okno-duh";
  ovoj.style.left = r.left + "px"; ovoj.style.top = r.top + "px"; ovoj.style.width = r.width + "px"; ovoj.style.height = r.height + "px";
  ovoj.setAttribute("aria-hidden", "true");
  var cs = getComputedStyle(k), kop = k.cloneNode(true);
  kop.classList.remove("okno-vir");
  ["id", "style", "tabindex"].forEach(function(a){ kop.removeAttribute(a); });
  kop.querySelectorAll("[id],[style]").forEach(function(el){ el.removeAttribute("id"); el.removeAttribute("style"); });
  kop.style.backgroundColor = cs.backgroundColor; kop.style.backgroundImage = cs.backgroundImage;
  kop.style.borderColor = cs.borderTopColor + " " + cs.borderRightColor + " " + cs.borderBottomColor + " " + cs.borderLeftColor;
  kop.style.boxShadow = cs.boxShadow; kop.style.color = cs.color; kop.style.transition = "none";
  ovoj.appendChild(kop);
  o.back.appendChild(ovoj);
  return ovoj;
}
/* izvor po ponovnem izrisu (npr. vrstica artikla ali gumb »Zaključi«) je lahko nov element */
function najdiIzvor(el){
  if(!el) return function(){ return null; };
  if(el.id){ var id = el.id; return function(){ return $(id); }; }
  var atr = ["data-art", "data-view", "data-edit", "data-del", "data-renum", "data-c", "data-em", "data-pozabi"].find(function(a){ return el.hasAttribute(a); });
  if(atr){ var v = el.getAttribute(atr); return function(){ try{ return document.querySelector("[" + atr + '="' + CSS.escape(v) + '"]'); }catch(e){ return null; } }; }
  return function(){ return el.isConnected ? el : null; };
}
function jeViden(k){
  if(!k || !k.isConnected) return false;
  var r = k.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
}
function oknoZaklep(){
  if(document.documentElement.classList.contains("okno-zaklep")) return;
  var drsnik = window.innerWidth - document.documentElement.clientWidth;
  document.documentElement.classList.add("okno-zaklep");
  if(drsnik > 0) document.documentElement.style.paddingRight = drsnik + "px";
}
function oknoOdklep(){
  if(Object.keys(_okna).length) return;
  document.documentElement.classList.remove("okno-zaklep"); document.documentElement.style.paddingRight = "";
}
/* Pospravi okno — a le, če je to še TRENUTNO okno s tem id-jem. Hitro zapri → odpri
   (npr. menjava strank) je prej pustil zamujen »konec« starega zapiranja, ki je ugasnil
   pravkar odprto okno: ostalo je prazno ali se ni več odprlo. */
function oknoPospravi(o){
  if(o.mrtev) return;
  o.mrtev = true;
  if(_okna[o.id] !== o) return;
  if(o.panel.getAnimations){ o.panel.getAnimations().forEach(function(a){ a.cancel(); }); o.notr.getAnimations().forEach(function(a){ a.cancel(); }); }
  o.back.querySelectorAll(".okno-duh").forEach(function(d){ d.remove(); });
  o.back.classList.remove("odprto", "show");
  [o.kartica, o.cilj].forEach(function(k){ if(k) k.classList.remove("okno-vir"); });
  delete _okna[o.id];
  oknoOdklep();
}
function odpriOkno(id, izvor){
  var back = $(id); if(!back) return;
  var star = _okna[id];
  if(star && !star.zapiram) return;
  if(star) oknoPospravi(star);
  var panel = back.querySelector(".okno"), notr = panel.querySelector(".okno-notr");
  var o = _okna[id] = { id: id, back: back, panel: panel, notr: notr, najdi: najdiIzvor(izvor), kartica: jeViden(izvor) ? izvor : null };
  odprtaOkna = odprtaOkna.filter(function(x){ return x !== id; }); odprtaOkna.push(id); vnosDnoKmalu();
  zgodOdpri();
  oknoZaklep();
  back.classList.add("odprto");
  void back.offsetWidth; back.classList.add("show");   // zatemnitev začne takoj
  if(oknoMirno() || !panel.animate || !panel.getAnimations) return;   /* Chrome < 84 (stara tablica): brez animacije, okno deluje */
  if(!o.kartica){   // brez izvora: pojavi se kot potrditveno okno portala
    panel.animate([{ opacity: 0, transform: "translateY(10px) scale(.98)" }, { opacity: 1, transform: "none" }], { duration: 200, easing: "ease" });
    return;
  }
  o.morf = true;
  var kl = oknoKljuci(o, OKNO_ODPRI, false);
  var duh = oknoDuh(o);
  o.kartica.classList.add("okno-vir");   // element se spremeni v okno: njegovo mesto se izprazni takoj
  panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 90, easing: "linear" });
  duh.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 170, delay: 60, easing: "ease", fill: "forwards" });
  notr.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 190, delay: 110, easing: "ease", fill: "backwards" });
  notr.animate(kl.notr, { duration: 380, easing: "linear" });
  var konecRasti = function(){ if(!o.morf) return; o.morf = false; duh.remove(); };
  panel.animate(kl.okno, { duration: 380, easing: "linear" }).finished.then(konecRasti, konecRasti);
  setTimeout(konecRasti, 800);   // varovalo, če se animacija ne konča (zaslon v ozadju)
}
function zapriOkno(id){
  var o = _okna[id]; if(!o || o.zapiram) return;
  o.zapiram = true;
  odprtaOkna = odprtaOkna.filter(function(x){ return x !== id; }); vnosDnoKmalu();
  zgodZapri();
  var f = obZaprtju[id]; if(f){ try{ f(); }catch(e){} }
  var konec = function(){ oknoPospravi(o); };
  o.back.classList.remove("show");
  if(oknoMirno() || !o.panel.animate || !o.panel.getAnimations){ konec(); return; }
  setTimeout(konec, 800);
  var k = o.najdi && o.najdi();
  if(k && k.isConnected && !jeViden(k)){ try{ k.scrollIntoView({ block: "center" }); }catch(e){} }
  if(o.panel.getAnimations){ o.panel.getAnimations().forEach(function(a){ a.cancel(); }); o.notr.getAnimations().forEach(function(a){ a.cancel(); }); }
  if(!jeViden(k)){   // izvora ni več → okno samo izgine
    o.panel.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(8px) scale(.98)" }], { duration: 200, easing: "ease", fill: "forwards" }).finished.then(konec, konec);
    return;
  }
  if(o.kartica && o.kartica !== k) o.kartica.classList.remove("okno-vir");
  o.kartica = k; o.cilj = k;
  k.classList.add("okno-vir");   // med krčenjem je mesto še prazno; element se vrne, ko je okno spet on
  var kl = oknoKljuci(o, OKNO_ZAPRI, true);
  var duh = oknoDuh(o);
  o.notr.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, easing: "ease", fill: "forwards" });
  o.notr.animate(kl.notr, { duration: 320, easing: "linear", fill: "forwards" });
  duh.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: 150, easing: "ease", fill: "both" });
  o.panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, delay: 230, easing: "linear", fill: "forwards" });
  o.panel.animate(kl.okno, { duration: 320, easing: "linear", fill: "forwards" }).finished.then(konec, konec);
}
function zapriVsaOkna(){ odprtaOkna.slice().forEach(function(id){ if(id === "oknoPotrdi") zapriPotrdi(); else zapriOkno(id); }); }
/* ── splet: sistemski »nazaj« (Android) in poteg nazaj (iPhone, Safari) ZAPRETA odprto okno ──
   Prej je »nazaj« med vnosom kosov zapustil aplikacijo (nazaj v portal ali zaprl aplikacijo).
   Vsako odprto okno doda vnos v zgodovino brskalnika; »nazaj« ga porabi in zapre zgornje okno.
   Okno, zaprto z gumbom, svoj vnos odstrani (history.back), ta »popstate« pa se prezre. */
var _zgod = 0, _zgodPrezri = 0, _zgodIzNazaj = false;
function zgodOdpri(){ if(!SPLET) return; try{ history.pushState({ scOkno: true }, ""); _zgod++; }catch(e){} }
function zgodZapri(){
  if(!SPLET || _zgodIzNazaj || _zgod <= 0) return;
  _zgod--; _zgodPrezri++;
  try{ history.back(); }catch(e){ _zgodPrezri--; }
}
window.addEventListener("popstate", function(){
  if(_zgodPrezri > 0){ _zgodPrezri--; return; }
  if(_zgod > 0) _zgod--;
  var top = odprtaOkna[odprtaOkna.length - 1]; if(!top) return;
  _zgodIzNazaj = true;
  try{ if(top === "oknoPotrdi"){ _ptDa = null; zapriPotrdi(); } else zapriOkno(top); }finally{ _zgodIzNazaj = false; }
});
/* priprava: ločena plast zatemnitve in ovoj vsebine (nasprotni razteg) v vsakem oknu */
document.querySelectorAll(".okno-back").forEach(function(back){
  var zat = document.createElement("div"); zat.className = "okno-zatemni"; back.insertBefore(zat, back.firstChild);
  var panel = back.querySelector(".okno"), notr = document.createElement("div"); notr.className = "okno-notr";
  while(panel.firstChild) notr.appendChild(panel.firstChild);
  panel.appendChild(notr);
  /* med zapiranjem okno ne sprejema klikov (npr. drugi dotik na ploščico stranke, ki že izginja) */
  back.addEventListener("click", function(ev){ var o = _okna[back.id]; if(!o || o.zapiram){ ev.stopPropagation(); ev.preventDefault(); } }, true);
  back.addEventListener("mousedown", function(e){ back._zunaj = e.target === back; });
  back.addEventListener("touchstart", function(e){ back._zunaj = e.target === back; }, { passive: true });
  back.addEventListener("click", function(ev){ if(ev.target === back && back._zunaj !== false) zapriOkno(back.id); back._zunaj = false; });
  back.querySelectorAll("[data-zapri]").forEach(function(b){ b.addEventListener("click", function(){ zapriOkno(back.id); }); });
});

/* ── potrditev: kot potrdiModal v portalu ── */
var _ptDa = null, _ptFokus = null;
function askConfirm(naslov, sporocilo, gumbDa, onYes, nevarno, gumbNe){
  $("ptT").textContent = naslov; $("ptSp").textContent = sporocilo;
  $("ptDa").textContent = gumbDa || "Potrdi"; $("ptNe").textContent = gumbNe || "Prekliči";
  $("ptDa").className = "sc-modal-btn " + (nevarno ? "danger" : "primary");
  _ptDa = onYes; _ptFokus = document.activeElement;
  var bilo = odprtaOkna.indexOf("oknoPotrdi") >= 0;
  odprtaOkna = odprtaOkna.filter(function(x){ return x !== "oknoPotrdi"; }); odprtaOkna.push("oknoPotrdi");
  if(!bilo){ zgodOdpri(); oknoZaklep(); }
  var back = $("oknoPotrdi"); clearTimeout(_ptSkrij); back.classList.add("vidno"); void back.offsetWidth; back.classList.add("show");
  /* pri brisanju/zavrženju je privzet »Prekliči« (Enter na tipkovnici ne izbriše po nesreči) */
  try{ $(nevarno ? "ptNe" : "ptDa").focus({ preventScroll: true }); }catch(e){}
}
var _ptSkrij = null;
function zapriPotrdi(){
  var back = $("oknoPotrdi"); back.classList.remove("show");
  if(odprtaOkna.indexOf("oknoPotrdi") >= 0){ zgodZapri(); setTimeout(oknoOdklep, 0); }
  clearTimeout(_ptSkrij); _ptSkrij = setTimeout(function(){ if(!back.classList.contains("show")) back.classList.remove("vidno"); }, 200);
  odprtaOkna = odprtaOkna.filter(function(x){ return x !== "oknoPotrdi"; });
  try{ if(_ptFokus && _ptFokus.isConnected) _ptFokus.focus({ preventScroll: true }); }catch(e){}
}
$("ptDa").onclick = function(e){ e.stopPropagation(); var f = _ptDa; _ptDa = null; zapriPotrdi(); if(f) f(); };
$("ptNe").onclick = function(e){ e.stopPropagation(); _ptDa = null; zapriPotrdi(); };
$("oknoPotrdi").addEventListener("click", function(e){ if(e.target === this){ _ptDa = null; zapriPotrdi(); } });

/* ══════════ TEMA ══════════ */
function autoDark(){ var h = new Date().getHours(); return !(h >= 7 && h < 19); }
/* Preklop teme kot v portalu (uporabiTemo): View Transitions naredi GPU-pretapljanje (0,34 s),
   ostali CSS prehodi so med tem izklopljeni (sc-notrans); brez podpore je preklop hipen. */
function applyTheme(animiraj){
  var pref = settings.theme || "dark";
  var dark = pref === "auto" ? autoDark() : (pref !== "light");
  var eff = dark ? "dark" : "light", de = document.documentElement;
  if(animiraj && de.getAttribute("data-theme") && de.getAttribute("data-theme") !== eff){
    /* iPhone/iPad (Safari in začetni zaslon): v enem koraku za vse hkrati (kot portal, uporabiTemo) —
       View Transition pusti pasova Safarija v stari barvi, barvni prehod pa zamakne pisavo za ozadjem */
    var ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if(de.classList.contains("sc-sam") || ios){
      var m0 = document.querySelector('meta[name="theme-color"]'); if(m0) m0.setAttribute("content", dark ? "#0a0a0a" : "#ffffff");
      de.classList.add("sc-notrans"); de.setAttribute("data-theme", eff); void de.offsetWidth;
      try{ var y = window.scrollY, gor = y > 0 ? -1 : 1; window.scrollTo(0, y + gor); requestAnimationFrame(function(){ window.scrollTo(0, y); }); }catch(e){}   // pasova Safarija na novo vzorčita barvo
      requestAnimationFrame(function(){ requestAnimationFrame(function(){ de.classList.remove("sc-notrans"); }); });
    }else if(document.startViewTransition && !oknoMirno()){
      de.classList.add("sc-notrans");
      try{
        var vt = document.startViewTransition(function(){ de.setAttribute("data-theme", eff); });
        vt.finished.then(function(){ de.classList.remove("sc-notrans"); }, function(){ de.classList.remove("sc-notrans"); });
      }catch(e){ de.setAttribute("data-theme", eff); de.classList.remove("sc-notrans"); }
    }else{
      de.classList.add("sc-notrans"); de.setAttribute("data-theme", eff); void de.offsetWidth;
      requestAnimationFrame(function(){ requestAnimationFrame(function(){ de.classList.remove("sc-notrans"); }); });
    }
  }else de.setAttribute("data-theme", eff);
  var m = document.querySelector('meta[name="theme-color"]'); if(m) m.setAttribute("content", dark ? "#0a0a0a" : "#ffffff");
  try{ localStorage.setItem("pralnica:tema", pref); }catch(e){}   // za izris pred nalaganjem (zagonski zaslon)
}
async function toggleTheme(){ settings.theme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"; applyTheme(true); await saveSettings(); }
document.querySelectorAll("[data-tema]").forEach(function(b){ b.onclick = toggleTheme; });

/* ══════════ VNOS SPREMNEGA LISTA ══════════ */
function draftLines(){ var c = clientById(selectedId); if(!c) return [];
  return c.artikli.filter(function(a){ return (draftQty[a.id] || 0) > 0; }).map(function(a){ return { id: a.id, uuid: a.uuid || null, naziv: a.naziv, kosov: draftQty[a.id] }; }); }
function draftPieces(){ return draftLines().reduce(function(s, l){ return s + l.kosov; }, 0); }
/* samodejna teža: Σ(teža na kos × kosov); teža je na artiklu stranke (portal) */
function draftKgAuto(){ var c = clientById(selectedId); if(!c) return { kg: 0, ima: false };
  var kg = 0, ima = false;
  c.artikli.forEach(function(a){ var q = draftQty[a.id] || 0; if(q > 0 && a.teza != null && !isNaN(a.teza)){ kg += a.teza * q; ima = true; } });
  return { kg: Math.round(kg * 1000) / 1000, ima: ima }; }
function draftStOpomb(){ return ((draftOpombaStranka || "").trim() ? 1 : 0) + ((draftOpombaEvidenca || "").trim() ? 1 : 0); }
function praznOsnutek(){ selectedId = null; draftQty = {}; draftPrevoz = "redni"; draftOpombaStranka = ""; draftOpombaEvidenca = ""; showHidden = false; editingId = null; }
/* ── neshranjen spremni list ostane na napravi (splet) ──
   Zaprt zavihek, »nazaj« brez odprtega okna ali iOS, ki aplikacijo v ozadju ugasne, je prej
   izbrisal vse vpisane kose. Osnutek NOVEGA lista se shrani ob vsaki spremembi (za vsakega
   uporabnika posebej) in se ob naslednjem vstopu obnovi — največ 3 dni star. */
var OSNUTEK_KEY = "pralnica:osnutek:";
function osnutekKljuc(){ return OSNUTEK_KEY + (aktivniEmail || "").toLowerCase(); }
function shraniOsnutek(){
  if(!SPLET || !session || editingId || !aktivniEmail || !LS) return;
  try{
    if(!selectedId){ localStorage.removeItem(osnutekKljuc()); return; }
    localStorage.setItem(osnutekKljuc(), JSON.stringify({ c: selectedId, q: draftQty, p: draftPrevoz, os: draftOpombaStranka, oe: draftOpombaEvidenca, t: Date.now() }));
  }catch(e){}
}
function preberiOsnutek(){
  if(!SPLET || !aktivniEmail || !LS) return null;
  try{ var o = JSON.parse(localStorage.getItem(osnutekKljuc()) || "null"); return (o && o.c && Date.now() - (o.t || 0) < 3 * 864e5) ? o : null; }catch(e){ return null; }
}
function uporabiOsnutek(o){
  if(!o || !clientById(o.c)) return;
  selectedId = o.c; draftQty = o.q || {}; draftPrevoz = o.p === "izredni" ? "izredni" : "redni";
  draftOpombaStranka = o.os || ""; draftOpombaEvidenca = o.oe || "";
  osveziVse();
  if(draftPieces() > 0 || draftStOpomb()) toast("Obnovljen nedokončan spremni list.");
}

function setClientLabel(){
  var c = clientById(selectedId), btn = $("strankaBtn");
  $("strankaIme").textContent = c ? c.naziv : "Izberi stranko";
  btn.classList.toggle("prazen", !c);
  btn.disabled = !!editingId;
}
function renderEntry(){
  var body = $("vnosTelo"), c = clientById(selectedId);
  if(!c){ body.innerHTML = '<div class="vnos-namig"><b>Izberi stranko</b></div>'; return; }
  if(!c.artikli.length){ body.innerHTML = '<div class="vnos-namig"><b>Stranka nima artiklov</b></div>'; return; }
  /* privzeto samo artikli, ki jih stranka ima (viden_app) ali so že vpisani */
  function jeViden(a){ return (a.vid !== false) || (draftQty[a.id] || 0) > 0; }
  var vidni = c.artikli.filter(jeViden), skriti = c.artikli.filter(function(a){ return !jeViden(a); });
  function vrsta(a){ var k = draftQty[a.id] || 0;
    return '<button type="button" class="art' + (k > 0 ? ' polno' : '') + '" data-art="' + esc(a.id) + '"><span class="an">' + esc(a.naziv) + '</span>' +
      '<span class="kos" data-kos="' + esc(a.id) + '">' + k + '</span><span class="chev">›</span></button>'; }
  /* v portalu pri stranki ni obkljukan noben artikel (oznaka »app«) — namesto praznega prostora razlaga */
  var html = vidni.length ? '<div class="artikli">' + vidni.map(vrsta).join("") + '</div>'
    : '<div class="vnos-namig"><b>Ni artiklov</b></div>';
  if(skriti.length){
    html += showHidden
      ? '<p class="drugi-h">Ostali artikli</p><div class="artikli">' + skriti.map(vrsta).join("") + '</div><button type="button" class="drugi-btn" id="drugiSkrij">Skrij ostale artikle</button>'
      : '<button type="button" class="drugi-btn" id="drugiPokazi">Izberi drug artikel <span class="pill">' + skriti.length + '</span></button>';
  }
  body.innerHTML = html;
  body.querySelectorAll("[data-art]").forEach(function(b){ b.onclick = function(){ openKeypad(b.getAttribute("data-art"), b); }; });
  var p = $("drugiPokazi"); if(p) p.onclick = function(){ showHidden = true; renderEntry(); };
  var s = $("drugiSkrij"); if(s) s.onclick = function(){ showHidden = false; renderEntry(); };
}
function updatePill(id){
  var k = draftQty[id] || 0;
  var pill = document.querySelector('[data-kos="' + CSS.escape(id) + '"]'); if(pill) pill.textContent = k;
  var row = document.querySelector('[data-art="' + CSS.escape(id) + '"]'); if(row) row.classList.toggle("polno", k > 0);
}
function renderSummary(){
  var lines = draftLines(), aktiven = !!(selectedId || editingId);
  var e = editingId ? entryById(editingId) : null;
  var st = e ? e.stevilka : nextNumber();
  var ka = draftKgAuto(), nOp = draftStOpomb();
  $("povzetek").innerHTML =
    '<div class="pv-st"><span class="k">' + (e ? "Urejaš spremni list" : "Spremni list št.") + '</span><span class="v">' + esc(st) + '</span></div>' +
    (lines.length ? '<ul class="pv-list">' + lines.map(function(l){ return '<li><span>' + esc(l.naziv) + '</span><b>' + stevilo(l.kosov) + '</b></li>'; }).join("") + '</ul>' : '') +
    '<div class="pv-vrsta"><span class="k">Skupaj kosov</span><span class="v">' + stevilo(draftPieces()) + '</span></div>' +
    '<div class="pv-vrsta"><span class="k">Teža perila</span><span class="v">' + (ka.ima ? tezaFmt(ka.kg) : "—") + '</span></div>' +
    '<div class="pv-vrsta"><span class="k">Prevoz</span><div class="seg" id="prevozSeg">' +
      '<button type="button" class="seg-b' + (draftPrevoz !== "izredni" ? " on" : "") + '" data-pv="redni">Redni</button>' +
      '<button type="button" class="seg-b' + (draftPrevoz === "izredni" ? " on" : "") + '" data-pv="izredni">Izredni</button></div></div>' +
    '<div class="pv-vrsta"><span class="k">Opombe</span><button type="button" class="pill-btn' + (nOp ? " on" : "") + '" id="opombeBtn"' + (aktiven ? "" : " disabled") + '>' + (nOp ? "Uredi opombe (" + nOp + ")" : "Dodaj opombo") + '</button></div>' +
    '<button type="button" class="btn lg" id="zakljuciBtn"' + (draftPieces() > 0 ? "" : " disabled") + '>' + (e ? "Shrani spremembe" : "Zaključi") + '</button>';
  $("prevozSeg").querySelectorAll(".seg-b").forEach(function(b){ b.onclick = function(){
    draftPrevoz = b.getAttribute("data-pv") === "izredni" ? "izredni" : "redni";
    $("prevozSeg").querySelectorAll(".seg-b").forEach(function(x){ x.classList.toggle("on", x === b); });
    shraniOsnutek();
  }; });
  $("opombeBtn").onclick = function(){ openNote(this); };
  $("zakljuciBtn").onclick = function(){ if(editingId) saveEdit(); else openReview(this); };
  $("vdKos").textContent = stevilo(draftPieces()) + " kos";
  $("vdBtn").textContent = e ? "Shrani spremembe" : "Zaključi";
  $("vdBtn").disabled = !(draftPieces() > 0);
  vnosDno();
  shraniOsnutek();
}
/* spodnja vrstica (vsota + Zaključi): vidna le, ko je pravi gumb v povzetku izven zaslona in je kaj vpisanega */
function vnosDno(){
  var dno = $("vnosDno"), b = $("zakljuciBtn"); if(!dno) return;
  var vidna = false;
  if(b && !$("app").hidden && draftPieces() > 0 && !odprtaOkna.length){
    var r = b.getBoundingClientRect();
    vidna = !(r.top < window.innerHeight - 8 && r.bottom > 0);
  }
  if(dno.hidden === vidna) dno.hidden = !vidna;
  document.body.classList.toggle("z-dnom", vidna);
}
var _vdRaf = 0;
function vnosDnoKmalu(){ if(_vdRaf) return; _vdRaf = requestAnimationFrame(function(){ _vdRaf = 0; vnosDno(); }); }
window.addEventListener("scroll", vnosDnoKmalu, { passive: true });
window.addEventListener("resize", vnosDnoKmalu);
$("vdBtn").onclick = function(){ var b = $("zakljuciBtn"); if(b && !b.disabled) b.click(); };
function updatePanelMode(){
  var e = editingId ? entryById(editingId) : null;
  $("vnosNaslov").textContent = e ? ("Urejanje " + e.stevilka) : "Nov spremni list";
  $("pocistiBtn").textContent = e ? "Prekliči urejanje" : "Počisti";
}
function osveziVse(){ setClientLabel(); updatePanelMode(); renderEntry(); renderSummary(); renderList(); }

/* izbira stranke */
function fillClientGrid(){
  var q = normaliziraj($("stIsci").value), izbran = clientPickerMode === "search" ? searchClientId : selectedId;
  var seznam = strankeUrejene().filter(function(c){ return !q || normaliziraj(c.naziv).indexOf(q) >= 0 || normaliziraj(c.podjetje).indexOf(q) >= 0; });
  function ploscica(c){ return '<button type="button" class="st-tile' + (c.id === izbran ? " sel" : "") + '" data-c="' + esc(c.id) + '">' + esc(c.naziv) + '</button>'; }
  /* brez iskanja: zadnje 4 stranke (iz zadnjih listov) na vrhu, nato vse po abecedi */
  var nedavne = [];
  if(!q && clientPickerMode !== "search" && seznam.length > 6){
    entries.slice().sort(function(a, b){ return String(b.ustvarjeno || b.datum || "").localeCompare(String(a.ustvarjeno || a.datum || "")); })
      .some(function(e){ var c = strankaLista(e); if(c && nedavne.indexOf(c) < 0 && seznam.indexOf(c) >= 0) nedavne.push(c); return nedavne.length >= 4; });
  }
  $("stGrid").innerHTML = seznam.length
    ? (nedavne.length ? '<p class="st-h">Nedavno</p>' + nedavne.map(ploscica).join("") + '<p class="st-h">Vse stranke</p>' : "") + seznam.map(ploscica).join("")
    : '<div class="st-prazno">' + (CLIENTS.length ? "Ni zadetkov." : (pullTecev || katalogTecev ? "Nalagam stranke iz portala …" : "Ni strank.")) + '</div>';
  $("stGrid").querySelectorAll("[data-c]").forEach(function(b){ b.onclick = function(){ pickClient(b.getAttribute("data-c")); }; });
}
function openClientPicker(mode, izvor){
  clientPickerMode = mode || "entry";
  $("stT").textContent = clientPickerMode === "search" ? "Išči po stranki" : "Izberi stranko";
  $("stIsci").value = ""; fillClientGrid();
  odpriOkno("oknoStranke", izvor);
  if(window.matchMedia && matchMedia("(pointer:fine)").matches) setTimeout(function(){ $("stIsci").focus(); }, 60);
}
$("stIsci").oninput = fillClientGrid;
$("stIsci").addEventListener("keydown", function(e){ if(e.key === "Enter"){ e.preventDefault(); this.blur(); } });
$("acctEmail").addEventListener("keydown", function(e){ if(e.key === "Enter" && !$("acctPass").value){ e.preventDefault(); $("acctPass").focus(); } });
function pickClient(id){
  if(clientPickerMode === "search"){ zapriOkno("oknoStranke"); clientPickerMode = "entry"; searchMode = "client"; searchClientId = id; updateSearchChip(); renderList(); return; }
  if(selectedId !== id){ selectedId = id; draftQty = {}; showHidden = false; }
  setClientLabel();
  zapriOkno("oknoStranke");
  renderEntry(); renderSummary();
  if(portalAuth) osveziStrankinArtikle(id);   // artikli TE stranke naravnost iz portala
}

/* številčnica */
function buildKeypad(){
  var keys = ["1","2","3","4","5","6","7","8","9","C","0","back"];
  $("kpGrid").innerHTML = keys.map(function(k){
    if(k === "back") return '<button type="button" class="kp-key util" data-k="back" aria-label="Briši">⌫</button>';
    if(k === "C") return '<button type="button" class="kp-key util" data-k="C">C</button>';
    return '<button type="button" class="kp-key" data-k="' + k + '">' + k + '</button>';
  }).join("") + '<div class="kp-akc"><button type="button" class="btn ghost" data-k="enter" id="kpEnter">Potrdi</button>' +
    '<button type="button" class="btn" data-k="next" id="kpNaprej">Naprej <span aria-hidden="true">›</span></button></div>';
  $("kpGrid").querySelectorAll("[data-k]").forEach(function(b){ b.onclick = function(){ kpPress(b.getAttribute("data-k")); }; });
}
var kpSpremenjeno = false;   // pritisnjena katerakoli tipka (tudi »C«) → Potrdi zapiše, kar je na zaslonu
function openKeypad(artId, izvor){
  kpMode = "entry"; kpArt = artId; kpBuf = ""; kpSpremenjeno = false;
  var a = artById(artId), cur = draftQty[artId] || 0;
  $("kpT").textContent = "Vnos kosov";
  $("kpIme").textContent = a ? a.naziv : "—";
  $("kpZdaj").textContent = cur ? ("Zdaj: " + cur + " kos") : "Še ni vpisano";
  $("kpEnter").textContent = "Potrdi";
  kpNaprejStanje();
  kpRenderDisp(); odpriOkno("oknoKp", izvor);
}
/* »Naprej«: naslednji artikel v istem vrstnem redu kot na zaslonu (brez zapiranja številčnice) */
function kpNaslednji(){
  var v = Array.prototype.map.call(document.querySelectorAll("#vnosTelo [data-art]"), function(b){ return b.getAttribute("data-art"); });
  var i = v.indexOf(kpArt); return (i >= 0 && i < v.length - 1) ? v[i + 1] : null;
}
function kpNaprejStanje(){
  var n = $("kpNaprej"); if(!n) return;
  var ima = kpMode === "entry" && !!kpNaslednji();
  n.hidden = !ima;
  $("kpEnter").className = ima ? "btn ghost" : "btn";
}
function openSearchKeypad(izvor){
  kpMode = "search"; kpBuf = searchMode === "id" ? searchQuery.replace(/[^0-9]/g, "") : "";
  $("kpT").textContent = "Išči po številki";
  $("kpIme").textContent = "Številka spremnega lista";
  $("kpZdaj").textContent = "Rezultati se osvežujejo sproti";
  $("kpEnter").textContent = "Zapri";
  kpNaprejStanje();
  kpRenderDisp(); odpriOkno("oknoKp", izvor);
}
obZaprtju.oknoKp = function(){ kpArt = null; kpBuf = ""; kpMode = "entry"; };
function kpRenderDisp(){
  var d = $("kpDisp");
  d.classList.toggle("prazen", kpBuf === "");
  d.innerHTML = (kpBuf === "" ? "0" : esc(kpBuf)) + (kpMode === "entry" ? '<span class="e">kos</span>' : "");
}
function kpPress(k){
  if(k === "next" && kpMode === "entry" && kpArt){
    var nx = kpNaslednji();
    if(kpBuf !== "" || kpSpremenjeno){ draftQty[kpArt] = parseInt(kpBuf, 10) || 0; updatePill(kpArt); renderSummary(); }
    if(!nx){ zapriOkno("oknoKp"); return; }
    kpArt = nx; kpBuf = ""; kpSpremenjeno = false;
    var a = artById(nx), cur = draftQty[nx] || 0;
    $("kpIme").textContent = a ? a.naziv : "—";
    $("kpZdaj").textContent = cur ? ("Zdaj: " + cur + " kos") : "Še ni vpisano";
    kpNaprejStanje(); kpRenderDisp();
    var g = $("kpIme").closest(".kp-glava"); if(g){ g.classList.remove("kp-nov"); void g.offsetWidth; g.classList.add("kp-nov"); }
    try{ var row = document.querySelector('#vnosTelo [data-art="' + CSS.escape(nx) + '"]'); if(row) row.scrollIntoView({ block: "nearest" }); }catch(_){}
    return;
  }
  if(k === "enter"){
    /* prej: »C« in nato Potrdi je pustil stare kose, čeprav je zaslon kazal 0 */
    if(kpMode === "entry" && kpArt && (kpBuf !== "" || kpSpremenjeno)){ var id = kpArt; draftQty[id] = parseInt(kpBuf, 10) || 0; updatePill(id); renderSummary(); }
    zapriOkno("oknoKp"); return;
  }
  kpSpremenjeno = true;
  if(k === "C"){ kpBuf = ""; }
  else if(k === "back"){ kpBuf = kpBuf.slice(0, -1); }
  else{ if(kpBuf === "0") kpBuf = ""; if(kpBuf.length < (kpMode === "search" ? 8 : 4)) kpBuf += k; }
  if(kpMode === "search"){ searchMode = kpBuf ? "id" : ""; searchQuery = kpBuf; updateSearchChip(); renderList(); }
  kpRenderDisp();
}
document.addEventListener("keydown", function(ev){
  var top = odprtaOkna[odprtaOkna.length - 1];
  if(ev.key === "Escape"){ if($("pinOkno")){ $("pinPreklic").click(); return; } if(top && top !== "oknoPotrdi") zapriOkno(top); else if(top) $("ptNe").click(); return; }
  if(top !== "oknoKp") return;
  if(/^[0-9]$/.test(ev.key)){ kpPress(ev.key); ev.preventDefault(); }
  else if(ev.key === "Backspace"){ kpPress("back"); ev.preventDefault(); }
  else if(ev.key === "Enter"){ kpPress(kpMode === "entry" && kpNaslednji() ? "next" : "enter"); ev.preventDefault(); }
});

/* opombe */
function openNote(izvor){
  $("opStranka").value = draftOpombaStranka || ""; $("opEvidenca").value = draftOpombaEvidenca || "";
  odpriOkno("oknoOpombe", izvor);
}
$("opShrani").onclick = function(){
  draftOpombaStranka = ($("opStranka").value || "").trim();
  draftOpombaEvidenca = ($("opEvidenca").value || "").trim();
  zapriOkno("oknoOpombe"); renderSummary(); toast("Opombe shranjene");
};

/* pregled → shrani → natisni */
function novZapis(c, lines, st){
  return { id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    stevilka: st || nextNumber(), datum: todayISO(), ustvarjeno: new Date().toISOString(),
    strankaId: c.id, orgUuid: c.orgUuid || null, strankaNaziv: c.naziv, strankaPodjetje: c.podjetje, strankaNaslov: c.naslov, strankaDavcna: c.davcna,
    izdal: (session ? session.user : ""), postavke: lines, skupajKosov: lines.reduce(function(a, l){ return a + l.kosov; }, 0),
    kg: draftKgAuto().kg, prevoz: draftPrevoz, opombaStranka: draftOpombaStranka || "", opombaEvidenca: draftOpombaEvidenca || "",
    saved: true, syncedAt: null, syncNapaka: null };
}
function openReview(izvor){
  var c = clientById(selectedId); if(!c) return;
  var lines = draftLines(); if(!lines.length){ toast("Vpiši vsaj en artikel."); return; }
  var ka = draftKgAuto();
  $("rvTelo").innerHTML =
    '<div class="rv-glava"><div class="rv-stranka">' + esc(c.naziv) + '</div><div class="rv-st">Spremni list št. ' + esc(nextNumber()) + ' · ' + fmtDateHuman(todayISO()) + '</div></div>' +
    '<ul class="rv-list">' + lines.map(function(l){ return '<li><span>' + esc(l.naziv) + '</span><b>' + stevilo(l.kosov) + '</b></li>'; }).join("") + '</ul>' +
    '<div class="rv-tot"><span>Skupaj kosov</span><b>' + stevilo(draftPieces()) + '</b></div>' +
    '<div class="rv-tot"><span>Teža perila</span><b>' + (ka.ima ? tezaFmt(ka.kg) : "—") + '</b></div>' +
    '<div class="rv-tot"><span>Prevoz</span><b>' + (draftPrevoz === "izredni" ? "Izredni" : "Redni") + '</b></div>' +
    (draftOpombaStranka ? '<div class="rv-tot"><span>Opomba na spremnem listu</span><b style="text-align:right;font-weight:500">' + esc(draftOpombaStranka) + '</b></div>' : '');
  $("rvT").textContent = "Pregled pred shranjevanjem";
  $("rvPotrdiAkc").hidden = false; $("rvTiskAkc").hidden = true;
  odpriOkno("oknoPregled", izvor);
}
obZaprtju.oknoPregled = function(){ reviewEntryId = null; };
var _shranjujem = false;
async function confirmReview(){
  if(_shranjujem) return;
  var c = clientById(selectedId), lines = draftLines(); if(!c || !lines.length) return;
  _shranjujem = true;
  try{
    /* številka: naprava pozna le liste, ki jih je že prenesla. Če zadnji poteg iz portala ni
       čisto svež, vpraša portal za prosto številko (največ 2,5 s) — prej je naprava z zastarelim
       seznamom izdala že zasedeno številko (opazilo se je šele po tisku). */
    /* s povezavo številko REZERVIRA baza (70_rezervacija_stevilk.sql): do prenosa lista je ne dobi nihče drug
       (portal, druga naprava); »najmanj« = naslednja, ki jo pozna naprava (njeni še neposlani listi) */
    var st = nextNumber();
    if(portalAuth && navigator.onLine !== false && syncZadnje !== "ni povezave"){
      try{
        var leto = new Date().getFullYear();
        var izP = await zRokom(api("rpc/app_rezerviraj_stevilko", { method: "POST", body: { p_leto: leto, p_najmanj: parseInt(st, 10) || null } }), 2500);
        if(typeof izP === "number" && izP >= (parseInt(st, 10) || 0)) st = String(izP).padStart(4, "0") + "/" + leto;
      }catch(_){}
    }
    var ent = novZapis(c, lines, st);
    entries.push(ent); reviewEntryId = ent.id;
    await saveEntries(); writeBackup();
    /* artikel, ki je bil skrit, a je zdaj na listu, postane viden (enako naredi baza ob prenosu) */
    var razkril = false;
    lines.forEach(function(l){ var a = c.artikli.find(function(x){ return x.id === l.id; }); if(a && a.vid === false){ a.vid = true; razkril = true; } });
    if(razkril) saveClients();
    praznOsnutek(); osveziVse();
    $("rvT").textContent = "Spremni list " + ent.stevilka + " je shranjen";
    $("rvPotrdiAkc").hidden = true; $("rvTiskAkc").hidden = false; $("rvEna").checked = false;
    savePdfs(ent);
    pripraviPdf(ent);   /* iPhone (začetni zaslon): PDF za meni Deli, preden tapneš »Natisni« */
    try{ syncPush(true); }catch(e){}
  }finally{ _shranjujem = false; }
}
$("rvPotrdi").onclick = confirmReview;
$("rvUredi").onclick = function(){ zapriOkno("oknoPregled"); };
$("rvZavrzi").onclick = function(){ zapriOkno("oknoPregled"); askConfirm("Zavrzi vnos?", "Vpisani kosi za to stranko bodo izbrisani.", "Zavrzi", function(){ praznOsnutek(); osveziVse(); }, true); };
$("rvPreskoci").onclick = function(){ zapriOkno("oknoPregled"); };
/* tisk po shranjevanju: isti izbor kopij kot v predogledu in v portalu (»Natisni samo en izvod«) */
$("rvTisk").onclick = function(){ var e = entryById(reviewEntryId); var ena = $("rvEna").checked; zapriOkno("oknoPregled"); if(e) printLists([e], ena); };

/* urejanje */
function startEdit(id){
  var e = entryById(id); if(!e) return;
  if(jeZaklenjen(e)){ toast("List " + e.stevilka + " je v portalu potrjen — spremeniš ga lahko samo v portalu."); return; }
  var c = strankaLista(e); if(!c){ toast("Stranke ni več v seznamu — urejanje ni mogoče."); return; }
  /* postavke, ki jih ni med artikli stranke (artikel v portalu izbrisan ali vpisan le z imenom),
     bi se ob shranjevanju tiho izbrisale tudi v portalu — takega lista tu ne urejamo */
  var najdi = function(p){ return (p.uuid && c.artikli.find(function(a){ return a.uuid === p.uuid; })) || (p.id && c.artikli.find(function(a){ return a.id === p.id; })) || c.artikli.find(function(a){ return a.naziv === p.naziv; }); };
  var brez = (e.postavke || []).filter(function(p){ return p && (p.kosov || 0) > 0 && !najdi(p); });
  if(brez.length){ toast("List " + e.stevilka + " ima postavke, ki jih ni med artikli stranke (" + brez.map(function(p){ return p.naziv; }).join(", ") + ") — uredi ga v portalu."); return; }
  editingId = id; selectedId = c.id; draftQty = {}; showHidden = false;
  draftPrevoz = e.prevoz === "izredni" ? "izredni" : "redni";
  draftOpombaStranka = e.opombaStranka || ""; draftOpombaEvidenca = e.opombaEvidenca || "";
  (e.postavke || []).forEach(function(p){
    var art = najdi(p);
    if(art) draftQty[art.id] = (draftQty[art.id] || 0) + p.kosov;
  });
  osveziVse();
  try{ window.scrollTo({ top: 0, behavior: "smooth" }); }catch(_){}
}
function cancelEdit(){ praznOsnutek(); osveziVse(); }
function opisiSpremembe(stare, nova, sKg, nKg, sPre, nPre){
  var mapS = {}, mapN = {}, imena = {};
  (stare || []).forEach(function(p){ mapS[p.naziv] = (mapS[p.naziv] || 0) + (p.kosov || 0); imena[p.naziv] = 1; });
  (nova || []).forEach(function(p){ mapN[p.naziv] = (mapN[p.naziv] || 0) + (p.kosov || 0); imena[p.naziv] = 1; });
  var deli = [];
  Object.keys(imena).forEach(function(nm){ var a = mapS[nm] || 0, b = mapN[nm] || 0;
    if(a !== b){ if(a === 0) deli.push("+" + nm + " " + b); else if(b === 0) deli.push("−" + nm + " (" + a + ")"); else deli.push(nm + " " + a + "→" + b); } });
  if(Number(sKg || 0) !== Number(nKg || 0)) deli.push("teža " + tezaFmt(sKg || 0) + "→" + tezaFmt(nKg || 0));
  if((sPre || "redni") !== (nPre || "redni")) deli.push("prevoz " + (sPre === "izredni" ? "izredni" : "redni") + "→" + (nPre === "izredni" ? "izredni" : "redni"));
  return deli.length ? deli.join(", ") : "brez vsebinskih sprememb";
}
var _urejamShranjujem = false;
async function saveEdit(){
  if(_urejamShranjujem) return;   // dvojni tap (tablica: zapis datoteke je počasen)
  var e = entryById(editingId); if(!e) return;
  if(jeZaklenjen(e)){ toast("List " + e.stevilka + " je medtem v portalu potrjen — spremembe niso shranjene."); cancelEdit(); return; }
  var lines = draftLines(); if(!lines.length){ toast("Vpiši vsaj en artikel."); return; }
  var novaKg = draftKgAuto().kg, kdo = (session ? session.user : "") || "osebje", zdaj = new Date().toISOString();
  var opis = opisiSpremembe(e.postavke, lines, e.kg, novaKg, e.prevoz, draftPrevoz);
  if(((e.opombaStranka || "") !== (draftOpombaStranka || "")) || ((e.opombaEvidenca || "") !== (draftOpombaEvidenca || ""))) opis += " · opomba posodobljena";
  e.popravil = kdo; e.popravljeno_at = zdaj;
  e.popravki = (e.popravki ? e.popravki + "\n" : "") + fmtDateHuman(zdaj.slice(0, 10)) + " · " + kdo + ": " + opis;
  e.postavke = lines; e.skupajKosov = lines.reduce(function(a, l){ return a + l.kosov; }, 0);
  e.kg = novaKg; e.prevoz = draftPrevoz; e.opombaStranka = draftOpombaStranka; e.opombaEvidenca = draftOpombaEvidenca;
  e.syncedAt = null; e.syncNapaka = null;
  e.rev = (e.rev || 0) + 1;   // pošiljanje, ki je že teklo, tega lista ne označi kot poslanega (glej syncPush)
  _urejamShranjujem = true;
  try{ await saveEntries(); writeBackup(); }finally{ _urejamShranjujem = false; }
  if(e.saved) savePdfs(e);
  var st = e.stevilka;
  praznOsnutek(); osveziVse();
  toast("Spremni list " + st + " posodobljen");
  try{ syncPush(true); }catch(_){}
}
$("pocistiBtn").onclick = function(){
  if(editingId){ cancelEdit(); return; }
  if(!selectedId && !draftPieces()){ return; }
  if(draftPieces() > 0) askConfirm("Počisti vnos?", "Vpisani kosi bodo izbrisani.", "Počisti", function(){ praznOsnutek(); osveziVse(); }, true, "Prekliči", this);
  else { praznOsnutek(); osveziVse(); }
};
$("strankaBtn").onclick = function(){ openClientPicker("entry", this); };

/* brisanje: samo lokalni osnutki, ki še niso v portalu (portal je vir resnice) */
function delEntry(id, izvor){
  var e = entryById(id); if(!e) return;
  if(e.syncedAt || e.prenesenIzPortala || e.potrjeno || e.portalId){ toast("Spremni list, ki je že v portalu, izbrišeš v portalu."); return; }
  askConfirm("Izbriši spremni list?", e.stevilka + " (" + e.strankaNaziv + ") še ni v portalu in bo izbrisan samo s te naprave.", "Izbriši", async function(){
    await deleteSyncPdf(e);
    entries = entries.filter(function(x){ return x.id !== id; });
    if(id === editingId) cancelEdit();
    await saveEntries(); renderList(); renderSummary(); risiSyncGumb();
  }, true, "Prekliči", izvor);
}
/* številka je v portalu zasedena z drugim listom → predlagaj prosto (portal + naprava) */
async function novaStevilka(id, izvor){
  var e = entryById(id); if(!e) return;
  var leto = String(e.stevilka).split("/")[1] || String(new Date().getFullYear());
  var izPortala = 0;
  var maxLok = 0; entries.forEach(function(x){ var p = String(x.stevilka || "").split("/"); if(p[1] === leto){ var s = parseInt(p[0], 10); if(!isNaN(s) && s > maxLok) maxLok = s; } });
  try{ var r = await api("rpc/app_rezerviraj_stevilko", { method: "POST", body: { p_leto: parseInt(leto, 10), p_najmanj: maxLok + 1 } }); if(typeof r === "number") izPortala = r; }catch(_){}
  var nova = String(Math.max(izPortala, maxLok + 1)).padStart(4, "0") + "/" + leto;
  askConfirm("Nova številka lista?", "Številka " + e.stevilka + " je v portalu že zasedena z drugim spremnim listom. Ta list dobi številko " + nova + ". Na natisnjenem listu popravi številko ali ga natisni znova.", "Spremeni v " + nova, async function(){
    await renameEntryNumber(id, nova);
    e.stevilkaZasedena = false; e.syncNapaka = null; await saveEntries(); renderList();
    try{ syncPush(false); }catch(_){}
  }, false, "Prekliči", izvor);
}
async function renameEntryNumber(id, nn){
  var e = entryById(id); if(!e || nn === e.stevilka) return;
  if(entries.some(function(x){ return x.id !== id && x.stevilka === nn; })){ toast("Ta številka že obstaja."); return; }
  var P = pdfPlugin(); if(P && e.pdfSaved){ try{ await P.deleteFile({ relPath: SINHRO + pdfName(e) }); }catch(err){} }
  e.stevilka = nn; e.pdfSaved = false;
  await saveEntries();
  if(e.saved) await savePdfs(e);
  toast("Številka spremenjena v " + nn);
}

/* ══════════ SEZNAM IN ISKANJE ══════════ */
function currentListEntries(){
  var arr = null;
  if(searchMode === "id" && searchQuery){
    /* samo po zaporedni številki (pred »/«) — sicer bi se 1452 ujel s 1145/2026 */
    var q = String(searchQuery).replace(/[^0-9]/g, "");
    arr = entries.filter(function(e){ var seq = String(e.stevilka || "").split("/")[0].replace(/[^0-9]/g, ""); return q && seq.indexOf(q) >= 0; });
  }else if(searchMode === "date" && searchDate){ arr = entries.filter(function(e){ return e.datum === searchDate; }); }
  else if(searchMode === "client" && searchClientId){ arr = entries.filter(function(e){ return e.strankaId === searchClientId; }); }
  var vsi = (arr || entries).slice().sort(function(a, b){ return stKljuc(b) - stKljuc(a); });
  if(arr) return vsi.slice(0, 200);
  /* neposlani listi so vedno na vrhu (prej so po 40 novejših izpadli s seznama) */
  var cakajo = vsi.filter(function(e){ return !e.syncedAt; });
  return cakajo.concat(vsi.filter(function(e){ return e.syncedAt; }).slice(0, Math.max(0, 40 - cakajo.length)));
}
var IKO_OKO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
var IKO_UREDI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
var IKO_KOS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6"/></svg>';
function renderList(){
  var el = $("seznam"), t = currentListEntries();
  $("seznamNaslov").textContent = searchMode ? ("Rezultati iskanja (" + t.length + ")") : "Zadnji spremni listi";
  if(!t.length){
    el.innerHTML = searchMode ? '<div class="prazno"><b>Ni zadetkov</b>Za to iskanje ni spremnega lista.</div>'
                              : '<div class="prazno"><b>Še ni spremnih listov</b>Prvega ustvariš zgoraj.</div>';
  }else{
    el.innerHTML = '<ul class="listi">' + t.map(function(e){
      var n = (e.postavke || []).length, stanje = [];
      if(!e.syncedAt){
        if(e.stevilkaZasedena) stanje.push('<span class="t-bad">Številka je v portalu zasedena</span>');
        else stanje.push('<span class="dot warn"></span><span class="t-warn">Čaka na prenos' + (e.syncNapaka ? " · " + esc(e.syncNapaka) : "") + '</span>');
      }
      if(e.vSporu) stanje.push('<span class="pill bad">V sporu · reši v portalu</span>');
      if(jeZaklenjen(e)) stanje.push('<span class="pill ok">Potrjeno</span>');
      var lahkoBrise = !(e.syncedAt || e.prenesenIzPortala || e.potrjeno || e.portalId);
      return '<li class="list' + (e.id === editingId ? " ureja" : "") + '">' +
        '<div class="l-info"><div class="l-ime">' + esc(e.strankaNaziv) + '</div>' +
        '<div class="l-sub">' + esc(e.stevilka) + ' · ' + fmtDateHuman(e.datum) + ' · ' + n + ' ' + sklon(n, "artikel", "artikla", "artikli", "artiklov") + '</div>' +
        (stanje.length ? '<div class="l-stanje">' + stanje.join("") + '</div>' : '') + '</div>' +
        '<div class="l-kos">' + stevilo(e.skupajKosov) + '<small>kos</small></div>' +
        '<div class="l-akc">' +
          (e.stevilkaZasedena && !e.syncedAt ? '<button type="button" class="pill-btn novast" data-renum="' + esc(e.id) + '">Nova št.</button>' : '') +
          '<button type="button" class="icon-btn" data-view="' + esc(e.id) + '" aria-label="Predogled in tiskanje">' + IKO_OKO + '</button>' +
          (jeZaklenjen(e) ? '' : '<button type="button" class="icon-btn" data-edit="' + esc(e.id) + '" aria-label="Uredi">' + IKO_UREDI + '</button>') +
          (lahkoBrise ? '<button type="button" class="icon-btn del" data-del="' + esc(e.id) + '" aria-label="Izbriši">' + IKO_KOS + '</button>' : '') +
        '</div></li>';
    }).join("") + '</ul>';
    el.querySelectorAll("[data-view]").forEach(function(b){ b.onclick = function(){ openSheet(b.getAttribute("data-view"), b); }; });
    el.querySelectorAll("[data-edit]").forEach(function(b){ b.onclick = function(){ startEdit(b.getAttribute("data-edit")); }; });
    el.querySelectorAll("[data-del]").forEach(function(b){ b.onclick = function(){ delEntry(b.getAttribute("data-del"), b); }; });
    el.querySelectorAll("[data-renum]").forEach(function(b){ b.onclick = function(){ novaStevilka(b.getAttribute("data-renum"), b); }; });
  }
  var skupaj = entries.length;
  nogaOsnova = skupaj ? ("Na napravi " + stevilo(skupaj) + " " + sklon(skupaj, "spremni list", "spremna lista", "spremni listi", "spremnih listov") + " · različica " + APP_VERZIJA) : ("Različica " + APP_VERZIJA);
  risiNogo();
}
var nogaOsnova = "";
function risiNogo(){ if(!nogaOsnova) return; var u = usklajeno(); $("noga").textContent = nogaOsnova + (u ? " · usklajeno s portalom " + kdajUskl(u) : ""); }
function updateSearchChip(){
  var txt = "";
  if(searchMode === "id" && searchQuery) txt = "Številka vsebuje " + searchQuery;
  else if(searchMode === "date" && searchDate) txt = "Datum " + fmtDateHuman(searchDate);
  else if(searchMode === "client" && searchClientId){ var c = clientById(searchClientId); txt = "Stranka " + (c ? c.naziv : "?"); }
  $("isciChip").hidden = !txt; $("isciChipT").textContent = txt;
  $("isciSt").classList.toggle("on", searchMode === "id" && !!txt);
  $("isciDat").classList.toggle("on", searchMode === "date" && !!txt);
  $("isciStr").classList.toggle("on", searchMode === "client" && !!txt);
}
function clearSearch(){ searchMode = ""; searchQuery = ""; searchDate = ""; searchClientId = ""; try{ $("isciDatum").value = ""; }catch(e){} updateSearchChip(); renderList(); }
$("isciSt").onclick = function(){ openSearchKeypad(this); };
$("isciStr").onclick = function(){ openClientPicker("search", this); };
$("isciPocisti").onclick = clearSearch;
$("isciDatum").onclick = function(){ try{ if(this.showPicker) this.showPicker(); }catch(_){} };
$("isciDatum").onchange = function(){ if(this.value){ searchMode = "date"; searchDate = this.value; updateSearchChip(); renderList(); } };

/* ══════════ DOKUMENT (enak kot v portalu) ══════════
   Natisnjen / shranjen spremni list je oblikovno enak tistemu iz portala:
   logotip (Playfair) enkrat na vrhu, Archivo, ista razporeditev. Pisave so
   vgrajene, zato dokument deluje tudi brez povezave (tablica na WiFi tiskalnika). */
var DOK_CSS = "@page{size:A4;margin:0}" +
  "*{box-sizing:border-box}html{background:#e9edeb}" +
  "body{margin:0;background:#e9edeb;color:#0a0a0a;font-family:'Archivo',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
  ".a4{position:relative;padding:12mm 12mm 14mm;color:#0a0a0a;background:#fff;min-height:297mm;break-after:page}" +
  ".a4:last-child{break-after:auto}.a4+.a4{margin-top:14px}" +
  "@media print{html,body{background:#fff}.a4{min-height:0}.a4+.a4{margin-top:0}}" +
  ".sc-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:18px;padding-bottom:14px;border-bottom:1.5px solid #0a0a0a}" +
  ".sc-wm{font-family:'Playfair Display',serif;font-weight:700;letter-spacing:-.03em;line-height:.9;font-size:32px;color:#0d1f17;white-space:nowrap}" +
  ".sc-wm span{color:#1a6644}" +
  ".sc-biz{font-size:9px;line-height:1.6;text-align:right;color:#666;white-space:nowrap;font-weight:500}" +
  ".sc-box{border:1px solid #dcdcdc;border-radius:9px;padding:10px 14px;margin-bottom:10px}" +
  ".sc-num{font-size:13px;font-weight:700;display:flex;justify-content:space-between;align-items:baseline;gap:12px}" +
  ".sc-num b{font-variant-numeric:tabular-nums;letter-spacing:.01em}" +
  ".sc-client{display:flex;justify-content:space-between;gap:14px}.sc-client .cl{font-size:12px}" +
  ".sc-client .cname{font-weight:700;border-bottom:2px solid #0a0a0a;padding:0 2px}" +
  ".sc-client .cname-sec{font-weight:400;color:#6b7280;font-size:.85em;margin-left:4px}" +
  ".sc-client .sc-dates{margin-top:10px;font-size:11px;color:#666}" +
  ".sc-sign{border-left:1px solid #dcdcdc;padding-left:16px;font-weight:600;font-size:12px;min-width:110px;color:#666}" +
  "table.sc-table{width:100%;border-collapse:collapse;font-size:10px;margin-top:4px}" +
  "table.sc-table th{color:#0a0a0a;font-weight:700;font-size:9px;letter-spacing:.09em;text-transform:uppercase;padding:0 8px 8px;text-align:center;border-bottom:1.5px solid #0a0a0a}" +
  "table.sc-table th.l{text-align:left}" +
  "table.sc-table td{border-bottom:1px solid #ececec;padding:5px 8px;height:15px;font-variant-numeric:tabular-nums}" +
  "table.sc-table td.an{color:#0a0a0a;font-weight:600;text-align:left}" +
  "table.sc-table td.qty{text-align:center;font-weight:700;width:34%;color:#0a0a0a}" +
  ".sc-weight{margin-top:12px;font-size:12px;color:#0a0a0a;text-align:right;font-weight:600}" +
  ".sc-note{margin-top:10px;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:12px;white-space:pre-wrap}";
function dokGlavaHtml(){ return '<div class="sc-head"><div class="sc-wm">Smart<span>Clean</span></div><div class="sc-biz">' + DOK_BIZ.map(esc).join("<br>") + '</div></div>'; }
function dokHtml(naslov, telesa){
  /* swap (ne block): tablica natisne/shrani ob »onPageFinished« — če bi pisava zamujala,
     bi bil z »block« tekst neviden; tako je v najslabšem primeru v nadomestni pisavi. */
  var pisave = (($("pisave") || {}).textContent || "").replace(/font-display:block/g, "font-display:swap");
  return '<!DOCTYPE html><html lang="sl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(naslov) + '</title><style>' + pisave + DOK_CSS + '</style></head><body>' +
    telesa.map(function(t){ return '<div class="a4">' + dokGlavaHtml() + t + '</div>'; }).join("") + '</body></html>';
}
function listTelo(e){
  var naziv = e.strankaPodjetje || e.strankaNaziv || "—";
  var nazivSek = (e.strankaPodjetje && e.strankaNaziv && e.strankaNaziv !== e.strankaPodjetje) ? e.strankaNaziv : "";
  var post = e.postavke || [];
  var rows = post.length ? post.map(function(p){ return '<tr><td class="an">' + esc(p.naziv) + '</td><td class="qty">' + stevilo(p.kosov) + '</td></tr>'; }).join("")
                         : '<tr><td class="an" colspan="2" style="color:#888">Ni postavk</td></tr>';
  var izdal = e.izdal ? " &nbsp;·&nbsp; Izdal: " + esc(e.izdal) : "";
  var prevoz = " &nbsp;·&nbsp; " + (e.prevoz === "izredni" ? "Izredni prevoz" : "Redni prevoz");
  var kg = (e.kg !== "" && e.kg != null && Number(e.kg) > 0) ? '<div class="sc-weight">Skupaj teža perila: <b>' + tezaFmt(e.kg) + '</b></div>' : "";
  var opomba = e.opombaStranka ? '<div class="sc-note"><b>Opomba:</b> ' + esc(e.opombaStranka) + '</div>' : "";   // interna opomba se NE tiska
  return '<div class="sc-box sc-num"><span>Št. spremnega lista: <b>' + esc(e.stevilka) + '</b></span></div>' +
    '<div class="sc-box sc-client"><div class="cl"><div><b>Naročnik storitve:</b> <span class="cname">' + esc(naziv) + '</span>' + (nazivSek ? ' <span class="cname-sec">(' + esc(nazivSek) + ')</span>' : '') + '</div>' +
    '<div class="sc-dates">Oddaja: ' + fmtDateHuman(e.datum) + izdal + prevoz + '</div></div><div class="sc-sign">Podpis:</div></div>' +
    '<table class="sc-table"><thead><tr><th class="l">Naziv artikla</th><th>Oddaja (št. kosov)</th></tr></thead><tbody>' + rows + '</tbody></table>' + kg + opomba;
}
function dokZaListe(arr, izvodov){
  var t = []; arr.forEach(function(e){ for(var i = 0; i < izvodov; i++) t.push(listTelo(e)); });
  return dokHtml(arr.length === 1 ? "Spremni list " + arr[0].stevilka : "Spremni listi", t);
}

/* predogled = točno dokument, ki se natisne (iframe) */
function openSheet(id, izvor){
  var e = entryById(id); if(!e) return;
  previewId = id; $("pdEna").checked = false;
  $("pdT").textContent = "Spremni list " + e.stevilka;
  var okvir = $("pdOkvir");
  okvir.innerHTML = "";
  var ifr = document.createElement("iframe");
  ifr.setAttribute("title", "Predogled spremnega lista"); ifr.setAttribute("tabindex", "-1");
  ifr.style.width = "794px"; ifr.style.height = "1123px";
  okvir.appendChild(ifr);
  /* povečava: dotik predogleda ali gumb z lupo — list v dvojni velikosti (največ naravni), premik s prstom */
  var pokrov = document.createElement("div"); pokrov.className = "pred-pokrov"; okvir.appendChild(pokrov);
  _pdZoom = false; $("pdZoom").classList.remove("on"); okvir.classList.remove("povecano"); okvir.scrollTop = 0; okvir.scrollLeft = 0;
  function prilagodi(){
    var w = okvir.clientWidth || 360, s = w / 794;
    if(_pdZoom) s = Math.min(1, Math.max(s * 2, s));
    var h = 1123; try{ h = Math.max(1123, ifr.contentDocument.documentElement.scrollHeight); }catch(_){}
    ifr.style.height = h + "px"; ifr.style.transform = "scale(" + s + ")";
    pokrov.style.width = Math.ceil(794 * s) + "px"; pokrov.style.height = Math.ceil(h * s) + "px";
    okvir.style.height = (_pdZoom ? Math.min(Math.ceil(h * s), Math.round(window.innerHeight * 0.62)) : Math.ceil(h * s)) + "px";
  }
  pokrov.onclick = function(){ pdPovecaj(!_pdZoom); };
  ifr.onload = function(){ prilagodi(); try{ ifr.contentDocument.fonts.ready.then(prilagodi); }catch(_){} };
  ifr.srcdoc = dokZaListe([e], 1);
  pripraviPdf(e);
  odpriOkno("oknoPredogled", izvor);
  requestAnimationFrame(prilagodi);
  _pdPrilagodi = prilagodi;
}
var _pdPrilagodi = null, _pdZoom = false;
function pdPovecaj(da){
  var okvir = $("pdOkvir"); if(!okvir.firstChild || !_pdPrilagodi) return;
  var rx = okvir.scrollLeft / Math.max(1, okvir.scrollWidth), ry = okvir.scrollTop / Math.max(1, okvir.scrollHeight);
  _pdZoom = !!da; okvir.classList.toggle("povecano", _pdZoom); $("pdZoom").classList.toggle("on", _pdZoom);
  $("pdZoom").setAttribute("aria-label", _pdZoom ? "Pomanjšaj predogled" : "Povečaj predogled");
  _pdPrilagodi();
  if(_pdZoom){ okvir.scrollLeft = rx * okvir.scrollWidth; okvir.scrollTop = ry * okvir.scrollHeight; } else { okvir.scrollTop = 0; okvir.scrollLeft = 0; }
}
$("pdZoom").onclick = function(){ pdPovecaj(!_pdZoom); };
window.addEventListener("resize", function(){ if(_pdPrilagodi && _okna.oknoPredogled && $("pdOkvir").firstChild) _pdPrilagodi(); });   // obračanje telefona
obZaprtju.oknoPredogled = function(){ _pdPrilagodi = null; setTimeout(function(){ if(!_okna.oknoPredogled) $("pdOkvir").innerHTML = ""; }, 900); };
$("pdTisk").onclick = function(){ var e = entryById(previewId); if(e) printLists([e], $("pdEna").checked); };

/* iPhone / iPad, aplikacija na začetnem zaslonu: iOS tam window.print() prezre (preverjeno v
   simulatorju iOS 27 — ni dialoga, tudi takoj ob dotiku). Natisne se prek menija Deli: pravi PDF
   (ista koda kot portal: ../pdfgen.js + ../spremni-pdf.js) → navigator.share → »Natisni«.
   PDF se pripravi vnaprej (shranjen list, predogled), ker iOS meni Deli odpre le neposredno ob dotiku. */
function jeIosSam(){
  var ua = navigator.userAgent || "";
  var ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var sam = navigator.standalone === true || !!(window.matchMedia && matchMedia("(display-mode: standalone)").matches);
  return ios && sam && VARIANTA === "splet" && !!navigator.share;
}
function naloziSkript(pot){
  return new Promise(function(res, rej){ var sc = document.createElement("script"); sc.src = pot; sc.onload = res; sc.onerror = function(){ rej(new Error(pot + " se ni naložil")); }; document.head.appendChild(sc); });
}
var _pdfMod = null;
function naloziPdf(){
  if(window.PDFDoc && window.SpremniPdf) return Promise.resolve();
  if(!_pdfMod){
    _pdfMod = (window.PDFDoc ? Promise.resolve() : naloziSkript("../pdfgen.js"))
      .then(function(){ return window.SpremniPdf ? null : naloziSkript("../spremni-pdf.js"); })
      .then(function(){ if(!window.PDFDoc || !window.SpremniPdf) throw new Error("PDF modula nista na voljo"); window.SpremniPdf.BIZ = DOK_BIZ; });
    _pdfMod.catch(function(){ _pdfMod = null; });
  }
  return _pdfMod;
}
function pdfPodatki(e){
  return {
    stevilka: e.stevilka,
    naziv: e.strankaPodjetje || e.strankaNaziv || "—",
    nazivSek: (e.strankaPodjetje && e.strankaNaziv && e.strankaNaziv !== e.strankaPodjetje) ? e.strankaNaziv : "",
    oddaja: "Oddaja: " + fmtDateHuman(e.datum) + (e.izdal ? "  ·  Izdal: " + e.izdal : "") + "  ·  " + (e.prevoz === "izredni" ? "Izredni prevoz" : "Redni prevoz"),
    postavke: (e.postavke || []).map(function(p){ return { naziv: p.naziv, kosov: stevilo(p.kosov) }; }),
    kg: (e.kg !== "" && e.kg != null && Number(e.kg) > 0) ? tezaFmt(e.kg) : "",
    opomba: e.opombaStranka || "",   /* interna opomba se NE tiska */
  };
}
/* PDF enega lista v 1 ali 2 izvodih (vsak izvod svoja stran), kot natisne tablica */
var _pdfListi = {};
/* ključ = vsebina dokumenta (številka, stranka, postavke …) + izvodi — po »Nova št.« ali popravku nov PDF */
function pdfKljuc(e, izv){ return izv + "|" + JSON.stringify(pdfPodatki(e)); }
function pripraviPdf(e){
  if(!e || !jeIosSam() || pdfPlugin()) return;
  [1, 2].forEach(function(izv){
    var k = pdfKljuc(e, izv);
    if(_pdfListi[k] && !_pdfListi[k].err) return;   /* neuspela izdelava se ob naslednjem dotiku ponovi */
    var c = _pdfListi[k] = { file: null, err: null };
    naloziPdf().then(function(){
      var doc = new PDFDoc();
      for(var i = 0; i < izv; i++){ doc.addPage(); window.SpremniPdf.stran(doc, pdfPodatki(e)); }
      c.file = new File([doc.build()], "spremni_list_" + pdfName(e).replace(/\.pdf$/, "") + (izv > 1 ? "_2x" : "") + ".pdf", { type: "application/pdf" });
    }).catch(function(er){ c.err = er; });
  });
}
function deliPdfList(e, izv){
  var c = _pdfListi[pdfKljuc(e, izv)];
  if(!c){ pripraviPdf(e); toast("Pripravljam PDF — tapni še enkrat."); return; }
  if(!c.file){
    if(c.err){ pripraviPdf(e); toast("PDF ni uspel — poskušam znova, tapni še enkrat."); return; }
    toast("PDF se še pripravlja — tapni še enkrat."); return;
  }
  if(navigator.canShare && !navigator.canShare({ files: [c.file] })){ toast("Ta naprava ne zna deliti PDF-ja."); return; }
  navigator.share({ files: [c.file], title: "Spremni list " + e.stevilka }).catch(function(er){ if(er && er.name !== "AbortError") toast("Meni Deli se ni odprl: " + (er.message || er.name)); });
}
/* iPhone na začetnem zaslonu: moduli za PDF vnaprej (v ozadju) */
if(jeIosSam()){
  setTimeout(function(){ naloziPdf().catch(function(){}); }, 2500);
}
function pdfPlugin(){ try{ if(window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.PralnicaPrint) return Capacitor.Plugins.PralnicaPrint; }catch(e){} return null; }
function printLists(arr, enIzvod){
  if(!arr || !arr.length){ toast("Ni spremnih listov za tiskanje."); return; }
  var html = dokZaListe(arr, enIzvod ? 1 : 2);
  var P = pdfPlugin();
  if(P){
    if(Date.now() < _tiskamDo) return;   /* tablica: dvojni dotik ne pošlje lista dvakrat (prej brez zaščite) */
    _tiskamDo = Date.now() + 3500;
    P.print({ html: html, jobName: "Spremni list " + arr[0].stevilka }).catch(function(){ _tiskamDo = 0; toast("Tiskanje ni uspelo."); }); return;
  }
  if(jeIosSam() && arr.length === 1){ deliPdfList(arr[0], enIzvod ? 1 : 2); return; }
  if(jeMobilna()){ natisniVGlavnem(html); return; }
  natisniPrekIframe(html);
}
/* Telefon / tablica v brskalniku: iz iframe-a natisne prav le računalnik — Safari na iPhonu
   in Chrome na Androidu natisneta aplikacijo za njim ali prazno stran. Zato gre dokument v
   skrito plast glavnega okna (shadow DOM, slog aplikacije nanj ne vpliva) in natisne se
   glavno okno; pri tisku je vidna samo plast (app.css → html.sc-tisk-on). Plast ostane do
   naslednjega tiska (največ 10 min): Android lahko predogled tiska izriše še enkrat. */
function jeMobilna(){
  var ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);   /* iPad se predstavi kot Mac */
}
var _tiskPlast = null, _tiskUra = null;
function tiskPlastOdstrani(){
  document.documentElement.classList.remove("sc-tisk-on");
  if(_tiskPlast){ [_tiskPlast.host, _tiskPlast.slog].forEach(function(n){ if(n && n.parentNode) n.parentNode.removeChild(n); }); }
  _tiskPlast = null; if(_tiskUra){ clearTimeout(_tiskUra); _tiskUra = null; }
}
var _tiskamDo = 0;
function natisniVGlavnem(doc){
  if(Date.now() < _tiskamDo) return;   // dvojni tap na »Natisni« ne pošlje lista dvakrat
  _tiskamDo = Date.now() + 3500;
  tiskPlastOdstrani();
  try{
    var d = new DOMParser().parseFromString(doc, "text/html");
    var css = Array.prototype.map.call(d.querySelectorAll("style"), function(s){ return s.textContent; }).join("\n");
    var glob = [];
    /* @font-face in @page v shadow DOM ne delujeta → v glavni dokument */
    css = css.replace(/@font-face\s*\{[^}]*\}/g, function(m){ glob.push(m); return ""; })
      .replace(/@page\s*\{[^}]*\}/g, function(m){ glob.push(m); return ""; })
      .replace(/(^|[\s,{}>+~(])(html|body)(?=[\s,{.:#\[>+~)])/g, "$1.dok-$2");
    var slog = document.createElement("style"); slog.id = "sc-tisk-slog"; slog.textContent = glob.join("\n");
    document.head.appendChild(slog);
    var host = document.createElement("div"); host.id = "sc-tisk"; host.setAttribute("aria-hidden", "true");
    host.attachShadow({ mode: "open" }).innerHTML = "<style>:host{all:initial;display:block}" + css + "</style><div class=\"dok-html\"><div class=\"dok-body\">" + d.body.innerHTML + "</div></div>";
    document.body.appendChild(host);
    document.documentElement.classList.add("sc-tisk-on");
    _tiskPlast = { host: host, slog: slog };
    _tiskUra = setTimeout(tiskPlastOdstrani, 600000);
    /* po tisku plast ostane še minuto (Android lahko predogled izriše znova), ne 10 min */
    window.addEventListener("afterprint", function po(){ window.removeEventListener("afterprint", po); if(_tiskUra){ clearTimeout(_tiskUra); _tiskUra = setTimeout(tiskPlastOdstrani, 60000); } });
  }catch(e){ tiskPlastOdstrani(); natisniPrekIframe(doc); return; }
  /* pisave (logotip) naložene pred tiskom — nikoli nadomestna pisava */
  var f = document.fonts, t = "SmartClean AaČčŠšŽž0123", pis = Promise.resolve();
  try{ if(f && f.load) pis = Promise.all([f.load("400 12px Archivo", t), f.load("700 12px Archivo", t), f.load("700 32px \"Playfair Display\"", t)]); }catch(_){}
  var tiskaj = function(){ try{ window.print(); }catch(e){ toast("Tiskanje ni uspelo."); } };
  Promise.race([pis, new Promise(function(r){ setTimeout(r, 3000); })]).then(tiskaj, tiskaj);
}
/* Brskalnik: natisni čist dokument prek skritega iframe-a (na iOS je »visibility« trik tiskal prazno). */
function natisniPrekIframe(doc){
  var old = $("printFrame"); if(old && old.parentNode) old.parentNode.removeChild(old);
  var ifr = document.createElement("iframe");
  ifr.id = "printFrame"; ifr.setAttribute("aria-hidden", "true");
  ifr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(ifr);
  var klican = false;   // natisni samo enkrat
  function natisni(){
    if(klican) return; klican = true;
    var w = ifr.contentWindow;
    var pisave = Promise.resolve();
    try{ pisave = w.document.fonts.ready; }catch(_){}
    Promise.race([pisave, new Promise(function(r){ setTimeout(r, 1500); })]).then(function(){
      try{ w.focus(); w.print(); }catch(e){ try{ window.print(); }catch(_){} }
      setTimeout(function(){ if(ifr.parentNode) ifr.parentNode.removeChild(ifr); }, 60000);
    });
  }
  ifr.onload = natisni;
  ifr.srcdoc = doc;
  setTimeout(natisni, 2500);
}

/* PDF v Datoteke (samo tablica): Documents/Pralnica/Arhiv (vsaka shranitev) in Sinhro (zadnja različica) */
var ARHIV = "Documents/Pralnica/Arhiv/", SINHRO = "Documents/Pralnica/Sinhro/";
function pdfName(e){ return String(e.stevilka).replace(/[\/\\:]+/g, "-") + ".pdf"; }
async function ensurePdfPerm(){ var P = pdfPlugin(); if(!P) return false;
  try{ var r = await P.checkPermission(); pdfPermOK = !!(r && r.granted); }catch(e){ pdfPermOK = false; } return pdfPermOK; }
async function savePdfs(e){
  var P = pdfPlugin(); if(!P) return;
  if(!pdfPermOK){ await ensurePdfPerm(); if(!pdfPermOK) return; }
  var html = dokZaListe([e], 1), ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  try{ await P.savePdf({ html: html, relPath: ARHIV + pdfName(e).replace(/\.pdf$/, "") + " (" + ts + ").pdf" }); }catch(err){}
  try{ await P.savePdf({ html: html, relPath: SINHRO + pdfName(e) }); e.pdfSaved = true; await saveEntries(); }catch(err){}
}
async function deleteSyncPdf(e){ var P = pdfPlugin(); if(!P || !e.pdfSaved) return; try{ await P.deleteFile({ relPath: SINHRO + pdfName(e) }); }catch(err){} }

/* ══════════ PRIJAVA ══════════
   Splet (portal.smartclean.si/mobile): ISTA prijava kot portal — ista seja v brskalniku
   (supabase-js, isti ključ kot portal). Kdor je prijavljen v portal, je prijavljen tudi
   tukaj; prijava tukaj prijavi tudi portal. Brez profilov, kode in samodejne odjave.
   Tablica: naprava ostane prijavljena z zadnjim uporabnikom, tudi po ponovnem zagonu.
   Geslo samo prvič na tej tablici; koda (PIN, nastavi se v portalu) le ob menjavi
   uporabnika (»Zamenjaj«). Prej je aplikacija po 15 minutah mirovanja sama odjavila —
   zato je enkrat zahtevala kodo, drugič geslo.
   Dostop imajo računi, ki jih baza spusti do spremnih listov (osebje, super admin,
   lastnik) in naprave. */
var SPLET = !jeNativno();
var aktivniEmail = "";
var SPLET_PROFIL_KEY = "pralnica:splet_profil";
var NI_DOSTOPA = "Ta račun nima dostopa do spremnih listov. Dostop dodeli skrbnik v portalu (Uporabniki → vloga Osebje).";
function pokaziPrijavo(){ $("app").hidden = true; $("prijava").hidden = false; }

/* ── splet: seja portala ── */
var sbAvt = null;
function avtKlient(){
  if(!sbAvt){ try{ if(window.supabase && window.supabase.createClient) sbAvt = window.supabase.createClient(settings.portalUrl, settings.portalKey); }catch(e){ sbAvt = null; } }
  return sbAvt;
}
function izSeje(s){ return s ? { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: (s.expires_at ? s.expires_at * 1000 : Date.now() + 3600000) - 60000 } : null; }
/* shranjena seja portala (za vstop brez omrežja) */
function shranjenaSeja(){
  try{ var ref = new URL(settings.portalUrl).hostname.split(".")[0]; var v = JSON.parse(localStorage.getItem("sb-" + ref + "-auth-token") || "null"); return v && v.user ? v : null; }catch(e){ return null; }
}
function jeOmrezna(err){ var m = String((err && (err.message || err.name)) || err || ""); return /fetch|network|retryable|ni povezave|load failed/i.test(m); }
async function spletnaSeja(sila){
  var c = avtKlient(); if(!c) throw new Error("ni povezave");
  var r;
  try{ r = await zRokom(sila ? c.auth.refreshSession() : c.auth.getSession(), 20000); }catch(e){ throw new Error("ni povezave"); }
  var s = r && r.data && r.data.session;
  if(r && r.error && !s){ if(jeOmrezna(r.error)) throw new Error("ni povezave"); return null; }
  return s || null;
}
function prikaziSpletnoPrijavo(msg, email){
  session = null; zapriVsaOkna(); pokaziPrijavo();
  $("profili").hidden = true; $("prijavaObr").hidden = false; $("acctBack").hidden = true;
  $("acctErr").textContent = msg || ""; $("acctPass").value = "";
  if(email) $("acctEmail").value = email;
}
/* vstop lahko sprožita zagon in obrazec hkrati: velja le zadnji (počasnejši starejši
   ga ne sme povoziti, npr. z »Ni povezave« čez že prijavljeno sejo) */
var _spletVstopGen = 0;
async function spletVstop(){
  var gen = ++_spletVstopGen, star = function(){ return gen !== _spletVstopGen; };
  var pp = await dbJson(SPLET_PROFIL_KEY, null);
  try{
    var prof;
    try{ prof = await portalProfil(); }
    catch(e1){
      /* zavrnjen (potekel) žeton: enkrat osveži sejo in poskusi znova — šele nato odjava */
      if(!(e1 && e1.neveljavna)) throw e1;
      var s2 = null;
      try{ s2 = await spletnaSeja(true); }catch(_){ throw new Error("ni povezave"); }
      if(!s2) throw e1;
      if(star()) return;
      portalAuth = izSeje(s2);
      prof = await portalProfil();
    }
    if(star()) return;
    if(!prof.dostop){ prikaziSpletnoPrijavo(NI_DOSTOPA, prof.email); return; }
    pp = { uid: prof.id, email: prof.email, name: prof.full_name || prof.email, dostop: true };
    await dbWrite(SPLET_PROFIL_KEY, JSON.stringify(pp));
  }catch(e){
    if(star()) return;
    /* brez omrežja: vstop z zadnjimi znanimi podatki istega računa, sinhronizacija dohiti */
    var ss = shranjenaSeja();
    if(jeOmrezna(e) && pp && pp.dostop && ss && ss.user.id === pp.uid){}
    else if(jeOmrezna(e)){ prikaziSpletnoPrijavo("Ni povezave z internetom."); return; }
    else {
      /* seje strežnik ne pozna več (potekla/preklicana) → pozabi jo, sicer bi obstala tudi v portalu */
      try{ await zRokom(avtKlient().auth.signOut({ scope: "local" }), 5000); }catch(_){}
      prikaziSpletnoPrijavo("Prijava je potekla ali je bila preklicana — prijavite se znova."); return;
    }
  }
  if(star()) return;
  aktivniEmail = pp.email;
  doLogin({ name: pp.name });
  try{ zaziviRealtime(); }catch(e){}
  polnaSinh();
}
/* različica, ki teče (app.html jo primerja z objavljeno), in varen trenutek za osvežitev */
window.__scVerzija = APP_VERZIJA;
window.__scVarno = function(){
  var a = document.activeElement;
  if(a && /^(INPUT|TEXTAREA)$/.test(a.tagName)) return false;
  if(odprtaOkna.length || $("pinOkno")) return false;
  if(session && (editingId || Object.keys(draftQty).some(function(k){ return draftQty[k] > 0; }))) return false;
  return true;
};
async function spletZacni(){
  $("zamenjajBtn").textContent = "Portal"; $("zamenjajBtn").setAttribute("aria-label", "Nazaj v portal");
  /* stari profili spletne aplikacije (z lastnimi žetoni) niso več potrebni — ne hrani jih */
  try{ localStorage.removeItem(PROFILES_KEY); localStorage.removeItem(PORTAL_AUTH_KEY); }catch(e){}
  savedProfs = [];
  var c = avtKlient();
  if(!c){ prikaziSpletnoPrijavo("Povezava s portalom ni na voljo."); return; }
  c.auth.onAuthStateChange(function(ev, s){
    if(ev === "SIGNED_OUT"){
      portalAuth = null; try{ risiSyncGumb(); }catch(e){}
      if(session) setTimeout(function(){ prikaziSpletnoPrijavo("Odjavljeni ste iz portala — prijavite se znova."); }, 0);
      return;
    }
    if(s && s.access_token){ portalAuth = izSeje(s); try{ realtimeAuth(); }catch(e){} }
  });
  var s = null;
  try{ s = await spletnaSeja(false); }
  catch(e){ var ss = shranjenaSeja(); if(ss) s = ss; }   // brez omrežja: shranjena seja portala
  if(!s){ prikaziSpletnoPrijavo(""); return; }
  portalAuth = izSeje(s);
  await spletVstop();
}

/* ── tablica: profili na napravi ── */
function showAccountLogin(msg, email){
  if(SPLET){ prikaziSpletnoPrijavo(msg, email); return; }
  session = null; zapriVsaOkna(); pokaziPrijavo();
  $("profili").hidden = true; $("prijavaObr").hidden = false;
  $("acctErr").textContent = msg || ""; $("acctPass").value = "";
  if(email) $("acctEmail").value = email;
  $("acctBack").hidden = !savedProfs.length;
}
function zacetnice(ime){
  var d = String(ime || "").trim().split(/\s+/).filter(Boolean);
  return ((d[0] || "?").charAt(0) + (d.length > 1 ? d[d.length - 1].charAt(0) : "")).toUpperCase();
}
function avatarHtml(p){
  if(p && p.avatar && /^https:\/\//.test(p.avatar)) return '<span class="pp-av" style="background-image:url(\'' + encodeURI(p.avatar).replace(/'/g, "%27") + '\')"></span>';
  return '<span class="pp-av av-ini" aria-hidden="true">' + esc(zacetnice(p && (p.name || p.email))) + '</span>';
}
function prikaziProfile(msg){
  if(SPLET){ prikaziSpletnoPrijavo(msg || ""); return; }
  if(!savedProfs.length){ showAccountLogin(msg || ""); return; }
  session = null; zapriVsaOkna(); pokaziPrijavo();
  $("prijavaObr").hidden = true; $("profili").hidden = false;
  $("ppMsg").textContent = msg || "";
  var urejeni = savedProfs.slice().sort(function(a, b){ return String(a.name || a.email).localeCompare(String(b.name || b.email), "sl"); });
  $("ppGrid").innerHTML = urejeni.map(function(p){
    return '<div class="pp-tile-wrap"><button type="button" class="pp-tile" data-em="' + esc(p.email) + '">' + avatarHtml(p) + '<span class="pp-nm">' + esc(p.name || p.email) + '</span></button>' +
      '<button type="button" class="pp-tile-x" data-pozabi="' + esc(p.email) + '" aria-label="Odstrani profil">×</button></div>';
  }).join("") + '<div class="pp-tile-wrap"><button type="button" class="pp-tile pp-add" id="ppDodaj"><span class="pp-av">+</span><span class="pp-nm">Dodaj</span></button></div>';
  $("ppGrid").querySelectorAll("[data-em]").forEach(function(b){ b.onclick = function(){ izberiProfil(b.getAttribute("data-em"), b); }; });
  $("ppGrid").querySelectorAll("[data-pozabi]").forEach(function(b){ b.onclick = function(ev){ ev.stopPropagation(); pozabiProfil(b.getAttribute("data-pozabi"), b); }; });
  $("ppDodaj").onclick = function(){ showAccountLogin(""); setTimeout(function(){ $("acctEmail").focus(); }, 50); };
}
function pozabiProfil(em, izvor){
  var p = savedProfs.find(function(x){ return x.email === em; }); if(!p) return;
  askConfirm("Odstrani profil?", "Profil " + (p.name || p.email) + " bo odstranjen s te naprave. Za ponoven vstop bo potrebna prijava z geslom.", "Odstrani", async function(){
    savedProfs = savedProfs.filter(function(x){ return x.email !== em; }); await saveProfs(); prikaziProfile();
  }, true, "Prekliči", izvor);
}
/* Po vsaki osvežitvi žetona ga zapiši tudi v profil — sicer bi profil hranil že porabljen
   žeton in bi ga Supabase ob naslednjem vstopu zavrnil (prijava z geslom znova). */
async function posodobiProfilZeton(){
  if(SPLET || !aktivniEmail || !portalAuth || !portalAuth.refresh_token) return;
  var p = savedProfs.find(function(x){ return x.email === aktivniEmail; });
  if(p && p.refresh_token !== portalAuth.refresh_token){ p.refresh_token = portalAuth.refresh_token; await saveProfs(); }
}
async function portalProfil(){
  var ur;
  try{ ur = await fetchT(settings.portalUrl + "/auth/v1/user", { headers: { apikey: settings.portalKey, Authorization: "Bearer " + portalAuth.access_token } }, 12000); }
  catch(e){ throw new Error("ni povezave"); }
  var u = await zRokom(ur.json(), 12000).catch(function(){ return {}; });
  if(!ur.ok){
    /* le 401/403 pomeni neveljavno sejo; 5xx/429 je prehodna napaka (prej: odjava iz aplikacije IN portala) */
    var neveljavna = ur.status === 401 || ur.status === 403;
    var er = new Error(neveljavna ? "seja ni veljavna" : "ni povezave"); er.neveljavna = neveljavna; throw er;
  }
  var out = { id: u.id, email: u.email || "", full_name: "", avatar_url: "", pinHash: "", dostop: false };
  try{
    var rows = await api("profiles?select=full_name,avatar_url,is_staff,super_admin,is_device,web_dostop&id=eq." + u.id);
    var r = Array.isArray(rows) ? rows[0] : null;
    if(r){
      out.full_name = r.full_name || ""; out.avatar_url = r.avatar_url || "";
      out.dostop = r.web_dostop !== false && !!(r.is_staff || r.super_admin || r.is_device);
    }
    /* koda je zgoščena in jo bere le njen lastnik (67_app_pini.sql) */
    var pk = await api("app_pini?select=hash&user_id=eq." + u.id);
    out.pinHash = (Array.isArray(pk) && pk[0] && pk[0].hash) ? String(pk[0].hash) : "";
  }catch(e){
    /* napaka strežnika ni »ni dostopa« (prej je osebje ob motnji videlo »račun nima dostopa«,
       tablica pa si je to zapomnila in uporabnika odjavila) */
    if(/ni povezave/i.test((e && e.message) || "") || (e && e.status && (e.status >= 500 || e.status === 429))) throw new Error("ni povezave");
  }
  if((out.email || "").trim().toLowerCase() === LASTNIK) out.dostop = true;
  return out;
}
async function acctSubmit(){
  var em = ($("acctEmail").value || "").trim(), pw = $("acctPass").value || "", btn = $("acctBtn"), er = $("acctErr");
  if(!em || !pw){ er.textContent = "Vpiši e-poštni naslov in geslo."; return; }
  btn.disabled = true; btn.textContent = "Prijavljam …"; er.textContent = "";
  try{
    if(SPLET){
      var c = avtKlient(); if(!c) throw new Error("ni povezave");
      var r = await zRokom(c.auth.signInWithPassword({ email: em, password: pw }), 25000);
      if(r.error) throw new Error(r.error.message || "prijava ni uspela");
      portalAuth = izSeje(r.data.session);
      $("acctPass").value = "";
      await spletVstop();
      return;
    }
    aktivniEmail = "";
    await portalLogin(em, pw);
    var prof = await portalProfil();
    if(!prof.dostop){ portalAuth = null; await savePortalAuth(); er.textContent = NI_DOSTOPA; return; }
    var email = prof.email || em;
    savedProfs = savedProfs.filter(function(p){ return p.email !== email; });
    var np = { email: email, name: prof.full_name || email, uid: prof.id || null, refresh_token: portalAuth.refresh_token, avatar: prof.avatar_url || "", pinHash: prof.pinHash || "", dostop: true };
    savedProfs.push(np); await saveProfs();
    $("acctPass").value = "";
    vstopi(np);   // pravkar se je prijavil z geslom → brez kode
  }catch(e){
    var m = (e && e.message) || "";
    er.textContent = /invalid login|invalid_grant|credentials/i.test(m) ? "Napačen e-poštni naslov ali geslo." : (jeOmrezna(m) ? "Ni povezave z internetom." : (m || "Prijava ni uspela."));
  }finally{ btn.disabled = false; btn.textContent = "Prijavi se"; }
}
$("acctForm").addEventListener("submit", function(e){ e.preventDefault(); acctSubmit(); });
$("acctBack").onclick = function(){ prikaziProfile(); };

async function izberiProfil(em, tile){
  var p = savedProfs.find(function(x){ return x.email === em; }); if(!p) return false;
  $("ppMsg").textContent = "";
  var nm = tile && tile.querySelector(".pp-nm"); if(nm) nm.textContent = "Prijavljam …";
  $("ppGrid").style.pointerEvents = "none";
  var naprej = vstopiSPinom;
  try{
    aktivniEmail = p.email;
    portalAuth = { refresh_token: zetonProfila(p), access_token: null, expires_at: 0, email: p.email };
    await portalRefresh();
    var prof = await portalProfil();
    p.name = prof.full_name || p.name; p.avatar = prof.avatar_url || ""; p.pinHash = prof.pinHash || ""; delete p.pin; p.dostop = prof.dostop; p.uid = prof.id || p.uid;
    await saveProfs();
    if(!prof.dostop){ portalAuth = null; await savePortalAuth(); prikaziProfile(NI_DOSTOPA); return false; }
    naprej(p); return true;
  }catch(e){
    var m = (e && e.message) || "";
    /* brez omrežja: naprava je že prijavljena → vstop z zadnjimi znanimi podatki, sinhronizacija dohiti */
    if(/ni povezave/i.test(m) && p.refresh_token){
      if(p.dostop === false){ prikaziProfile(NI_DOSTOPA); return false; }
      portalAuth = { refresh_token: zetonProfila(p), access_token: null, expires_at: 0, email: p.email };
      naprej(p); return true;
    }
    showAccountLogin("Prijava je potekla — vpiši geslo za " + (p.name || p.email) + ".", p.email);
    return false;
  }finally{ $("ppGrid").style.pointerEvents = ""; if(nm && nm.isConnected) nm.textContent = p.name || p.email; }
}
function vstopiSPinom(p){
  if(p.pinNapake >= PIN_DO_GESLA){ showAccountLogin("Preveč napačnih kod — vpiši geslo za " + (p.name || p.email) + ".", p.email); return; }
  if(p.pinHash) zahtevajPin(p, function(){ vstopi(p); }); else vstopi(p);
}
function vstopi(p, brezSinh){
  aktivniEmail = p.email;
  if(settings.zadnjiProfil !== p.email){ settings.zadnjiProfil = p.email; saveSettings(); }
  doLogin({ name: p.name || p.email });
  if(brezSinh) return;
  try{ zaziviRealtime(); }catch(e){}
  polnaSinh();
}
/* Zagon tablice: zadnji uporabnik vstopi TAKOJ (z zadnjimi znanimi podatki), prijava se
   preveri v ozadju. Prej je zagon čakal na strežnik — na WiFi tiskalnika brez interneta
   je zaslon ostal prazen. */
function vstopiZadnjega(p){
  if(p.dostop === false) return false;
  aktivniEmail = p.email;
  portalAuth = { refresh_token: zetonProfila(p), access_token: null, expires_at: 0, email: p.email };
  vstopi(p, true);
  (async function(){
    try{
      await portalRefresh();
      var prof = await portalProfil();
      p.name = prof.full_name || p.name; p.avatar = prof.avatar_url || ""; p.pinHash = prof.pinHash || ""; delete p.pin; p.dostop = prof.dostop; p.uid = prof.id || p.uid;
      await saveProfs();
      if(!prof.dostop){ portalAuth = null; await savePortalAuth(); prikaziProfile(NI_DOSTOPA); return; }
      if(session && aktivniEmail === p.email){ session.user = p.name; $("tbIme").textContent = p.name; }
    }catch(e){
      if(!/ni povezave/i.test((e && e.message) || "")) toast("Prijava na tej tablici je potekla — tapni oblaček zgoraj in vpiši geslo.");
      risiSyncGumb();
      return;   // brez povezave: delo teče naprej, sinhronizacija dohiti (urnik, »online«)
    }
    try{ zaziviRealtime(); }catch(e){}
    polnaSinh();
  })();
  return true;
}
/* PIN (nastavi se v portalu, Uporabniki) — samo ob menjavi uporabnika na tablici.
   Koda je zgoščena (PBKDF2-HMAC-SHA256, 67_app_pini.sql) in se preveri na napravi, tudi brez povezave.
   Napačne kode: po 5 zaporednih čakanje 30 s (vsakič dvakrat dlje, največ 15 min), po 10 je treba vpisati geslo. */
var PIN_DO_ZAKLEPA = 5, PIN_DO_GESLA = 10;
function b64Bajti(s){ var b = atob(s), a = new Uint8Array(b.length); for(var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
function bajtiB64(buf){ var a = new Uint8Array(buf), s = ""; for(var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
async function pbkdf2(pin, sol, it){
  var k = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(pin)), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sol, iterations: it }, k, 256);
}
async function pinZgosti(pin){
  var sol = crypto.getRandomValues(new Uint8Array(16)), it = 100000;
  return "pbkdf2$sha256$" + it + "$" + bajtiB64(sol) + "$" + bajtiB64(await pbkdf2(pin, sol, it));
}
async function pinPravilen(p, pin){
  var d = String(p.pinHash || "").split("$");
  if(d.length !== 5 || d[0] !== "pbkdf2" || d[1] !== "sha256") return false;
  var izr = bajtiB64(await pbkdf2(pin, b64Bajti(d[3]), parseInt(d[2], 10)));
  var r = izr.length ^ d[4].length; for(var i = 0; i < izr.length && i < d[4].length; i++) r |= izr.charCodeAt(i) ^ d[4].charCodeAt(i);
  return r === 0;
}
function zahtevajPin(p, onOk){
  var star = $("pinOkno"); if(star) star.remove();
  var buf = "", preverjam = false, ura = null;
  var el = document.createElement("div"); el.className = "pin"; el.id = "pinOkno";
  el.innerHTML = '<div class="pin-in">' + avatarHtml(p) + '<div class="pin-ime">' + esc(p.name || p.email) + '</div>' +
    '<div class="pin-dots">' + [0, 1, 2, 3].map(function(){ return '<span class="pin-dot"></span>'; }).join("") + '</div>' +
    '<div class="pin-pad">' + ["1","2","3","4","5","6","7","8","9"].map(function(n){ return '<button type="button" class="pin-key" data-k="' + n + '">' + n + '</button>'; }).join("") +
    '<button type="button" class="pin-key prazna" tabindex="-1"></button><button type="button" class="pin-key" data-k="0">0</button><button type="button" class="pin-key" data-k="del" aria-label="Briši">⌫</button></div>' +
    '<div class="pin-err" id="pinErr"></div><button type="button" class="link-btn" id="pinPreklic">Prekliči</button></div>';
  document.body.appendChild(el);
  function upd(){ el.querySelectorAll(".pin-dot").forEach(function(d, i){ d.classList.toggle("on", i < buf.length); }); }
  function zaklenjenDo(){ return Number(p.pinZaklep) || 0; }
  function prikaziZaklep(){
    clearInterval(ura);
    var tipkovnica = el.querySelector(".pin-pad");
    function tik(){
      var ost = Math.ceil((zaklenjenDo() - Date.now()) / 1000);
      if(ost <= 0){ clearInterval(ura); ura = null; tipkovnica.classList.remove("zaklenjeno"); $("pinErr").textContent = ""; return; }
      tipkovnica.classList.add("zaklenjeno");
      $("pinErr").textContent = "Poskusi znova čez " + (ost >= 60 ? Math.ceil(ost / 60) + " min" : ost + " s");
    }
    tik(); ura = setInterval(tik, 1000);
  }
  function konec(){ clearInterval(ura); document.removeEventListener("keydown", tipke); el.remove(); }
  async function preveri(){
    preverjam = true;
    var ok = false; try{ ok = await pinPravilen(p, buf); }catch(e){}
    preverjam = false;
    if(ok){ p.pinNapake = 0; p.pinZaklep = 0; saveProfs(); konec(); onOk(); return; }
    p.pinNapake = (Number(p.pinNapake) || 0) + 1; buf = ""; upd();
    el.classList.remove("tresi"); void el.offsetWidth; el.classList.add("tresi");
    if(p.pinNapake >= PIN_DO_GESLA){
      await saveProfs(); konec();
      showAccountLogin("Preveč napačnih kod — vpiši geslo za " + (p.name || p.email) + ".", p.email);
      return;
    }
    if(p.pinNapake >= PIN_DO_ZAKLEPA){
      p.pinZaklep = Date.now() + Math.min(15 * 60, 30 * Math.pow(2, p.pinNapake - PIN_DO_ZAKLEPA)) * 1000;
      await saveProfs(); prikaziZaklep(); return;
    }
    await saveProfs();
    $("pinErr").textContent = "Napačna koda";
  }
  function tipka(k){
    if(preverjam || zaklenjenDo() > Date.now()) return;
    if(k === "del") buf = buf.slice(0, -1);
    else if(buf.length < 4){ buf += k; $("pinErr").textContent = ""; }
    upd();
    if(buf.length === 4) setTimeout(preveri, 120);
  }
  function tipke(ev){ if(/^[0-9]$/.test(ev.key)) tipka(ev.key); else if(ev.key === "Backspace") tipka("del"); }
  document.addEventListener("keydown", tipke);
  el.querySelectorAll("[data-k]").forEach(function(b){ b.onclick = function(){ tipka(b.getAttribute("data-k")); }; });
  $("pinPreklic").onclick = function(){ konec(); prikaziProfile(); };
  if(zaklenjenDo() > Date.now()) prikaziZaklep();
}
function doLogin(u){
  session = { user: u.name, start: new Date().toISOString() };
  $("prijava").hidden = true; $("app").hidden = false;
  $("tbIme").textContent = u.name || "";
  var osn = preberiOsnutek();   // pred praznOsnutek (ta bi ga z osveziVse izbrisal)
  polnaOd = Date.now();         // takoj sledi polna sinhronizacija — opozorilo »ni usklajeno« še ne
  praznOsnutek(); searchMode = ""; searchQuery = ""; searchDate = ""; searchClientId = "";
  updateSearchChip(); osveziVse(); risiSyncGumb();
  if(osn) uporabiOsnutek(osn);
  if(pdfPlugin() && !pdfPermOK && !askedPerm){
    askedPerm = true;
    askConfirm("Dovoljenje za datoteke", "Za samodejno shranjevanje spremnih listov kot PDF v mapo Dokumenti omogoči »Dostop do vseh datotek«.", "Odpri nastavitve",
      function(){ try{ pdfPlugin().requestPermission(); }catch(e){} }, false, "Pozneje");
  }
}
/* »Zamenjaj« (tablica): izbira drugega uporabnika; ob naslednjem zagonu se odpre izbira */
function logout(){ zapriVsaOkna(); session = null; if(settings.zadnjiProfil){ settings.zadnjiProfil = ""; saveSettings(); } prikaziProfile(); }
$("zamenjajBtn").onclick = function(){ if(SPLET){ location.href = "../"; return; } logout(); };
$("izklopBtn").onclick = function(){ askConfirm("Izklopim aplikacijo?", "Neposlani spremni listi ostanejo shranjeni na napravi in se pošljejo ob naslednjem zagonu.", "Izklopi", function(){
  try{ Capacitor.Plugins.App.exitApp(); }catch(e){}
}, false, "Prekliči", this); };

/* razkrij geslo (očesce, kot v portalu) */
var _OKO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
var _OKO_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a13.2 13.2 0 0 1-1.67 2.68"/><path d="M6.1 6.1A13.3 13.3 0 0 0 2 12s3 8 10 8a9.3 9.3 0 0 0 5.9-2.1"/><path d="M14.12 14.12A3 3 0 1 1 9.88 9.88"/><path d="m3 3 18 18"/></svg>';
document.querySelectorAll('input[type="password"]').forEach(function(inp){
  var wrap = document.createElement("span"); wrap.className = "pw-wrap";
  inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp);
  var b = document.createElement("button"); b.type = "button"; b.className = "pw-eye"; b.tabIndex = -1; b.setAttribute("aria-label", "Pokaži geslo"); b.innerHTML = _OKO;
  wrap.appendChild(b);
  b.onclick = function(e){ e.preventDefault(); var pokazi = inp.type === "password"; inp.type = pokazi ? "text" : "password"; b.innerHTML = pokazi ? _OKO_OFF : _OKO; b.setAttribute("aria-label", pokazi ? "Skrij geslo" : "Pokaži geslo"); };
});

/* ══════════ SINHRONIZACIJA S PORTALOM ══════════
   Načelo: shrani najprej lokalno, pošlji, ko je omrežje. Tablica je na WiFi
   tiskalnika pogosto brez interneta, zato pošiljanje nikoli ne zadržuje
   shranjevanja ali tiskanja. Vsak zapis nosi svoj id (legacy_id v bazi):
   ponovno pošiljanje posodobi, ne podvoji. */
var portalAuth = null, syncTecev = false, syncZadnje = "";
function portalNastavljen(){ return !!(settings.portalUrl && settings.portalKey); }
/* Žeton za osvežitev se ob vsaki uporabi zamenja. Najprej se zapiše v PORTAL_AUTH (z
   e-pošto), šele nato v profil — če se aplikacija zapre vmes, ima profil že porabljen
   žeton. Zato ob vstopu velja novejši iz PORTAL_AUTH, če pripada istemu računu. */
var _zadnjaSeja = null;
async function loadPortalAuth(){ if(SPLET) return; portalAuth = await dbJson(PORTAL_AUTH_KEY, null); _zadnjaSeja = portalAuth; }
async function savePortalAuth(){ if(SPLET) return; _zadnjaSeja = portalAuth; try{ await dbWrite(PORTAL_AUTH_KEY, JSON.stringify(portalAuth || null)); }catch(e){} }
function zetonProfila(p){ return (_zadnjaSeja && _zadnjaSeja.email && _zadnjaSeja.email === p.email && _zadnjaSeja.refresh_token) || p.refresh_token; }

async function portalLogin(email, geslo){
  var r;
  try{
    r = await fetchT(settings.portalUrl + "/auth/v1/token?grant_type=password", {
      method: "POST", headers: { apikey: settings.portalKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: geslo }) }, 12000);
  }catch(e){ throw new Error("ni povezave"); }
  var j = await r.json().catch(function(){ return {}; });
  if(!r.ok) throw new Error(j.error_description || j.msg || j.message || ("prijava ni uspela (" + r.status + ")"));
  portalAuth = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + ((j.expires_in || 3600) * 1000) - 60000, email: email };
  await savePortalAuth();
  return true;
}
/* ena osvežitev žetona naenkrat — vzporedni klici so na tablici porabili isti (enkratni) žeton */
var _osvezujem = null;
function portalRefresh(){
  if(_osvezujem) return _osvezujem;
  _osvezujem = portalRefreshEnkrat();
  var pocisti = function(){ _osvezujem = null; };
  _osvezujem.then(pocisti, pocisti);
  return _osvezujem;
}
async function portalRefreshEnkrat(){
  if(SPLET){
    /* splet: sejo osvežuje supabase-js (ista kot v portalu, z zaklepom med zavihki) */
    var s = await spletnaSeja(false);
    if(s && portalAuth && s.access_token === portalAuth.access_token) s = await spletnaSeja(true);   // isti (zavrnjen) žeton → prisilno osveži
    if(!s){ portalAuth = null; try{ risiSyncGumb(); }catch(_){} throw new Error("seja je potekla, prijavi se znova"); }
    portalAuth = izSeje(s);
    try{ realtimeAuth(); }catch(e){}
    return true;
  }
  if(!portalAuth || !portalAuth.refresh_token) throw new Error("naprava ni prijavljena");
  var r;
  try{
    r = await fetchT(settings.portalUrl + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST", headers: { apikey: settings.portalKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: portalAuth.refresh_token }) }, 25000);   // dlje: prekinjena osvežitev bi lahko porabila žeton
  }catch(netErr){ throw new Error("ni povezave"); }   // brez omrežja žetona NE brišemo
  var j = await r.json().catch(function(){ return {}; });
  if(!r.ok){
    /* odjava SAMO ob resnično neveljavnem žetonu (400/401), ne ob prehodnih napakah */
    var telo = ((j.error || "") + " " + (j.error_description || "") + " " + (j.msg || "") + " " + (j.message || "") + " " + (j.code || "")).toLowerCase();
    var resnicno = (r.status === 400 || r.status === 401) && /invalid|grant|refresh|expired|revoked|not\s*found|jwt|already used/.test(telo);
    if(resnicno){ portalAuth = null; await savePortalAuth(); try{ risiSyncGumb(); }catch(_){} throw new Error("seja je potekla, prijavi se znova"); }
    throw new Error("ni povezave");
  }
  portalAuth = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + ((j.expires_in || 3600) * 1000) - 60000, email: portalAuth.email || aktivniEmail || null };
  await savePortalAuth();
  await posodobiProfilZeton();
  try{ realtimeAuth(); }catch(e){}
  return true;
}
/* Klic na bazo. Ob poteku žetona enkrat osveži in poskusi znova. */
async function api(pot, opt, drugic){
  if(!portalAuth) throw new Error("naprava ni prijavljena v portal");
  if((!portalAuth.access_token || (portalAuth.expires_at && Date.now() > portalAuth.expires_at)) && !drugic) await portalRefresh();
  opt = opt || {};
  var h = { apikey: settings.portalKey, Authorization: "Bearer " + portalAuth.access_token, "Content-Type": "application/json" };
  if(opt.prefer) h.Prefer = opt.prefer;
  var r;
  try{ r = await fetchT(settings.portalUrl + "/rest/v1/" + pot, { method: opt.method || "GET", headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined }); }
  catch(e){ throw new Error("ni povezave"); }
  if(r.status === 401 && !drugic){ await portalRefresh(); return api(pot, opt, true); }
  var t = await zRokom(r.text(), 25000), j = null;   // fetchT ustavi štoparico ob glavi; telo ima svojo mejo
  try{ j = t ? JSON.parse(t) : null; }catch(_){ j = null; }
  if(!r.ok){ var e = new Error((j && (j.message || j.hint)) || ("napaka " + r.status)); e.status = r.status; e.code = j && j.code; e.hint = j && j.hint; throw e; }
  return j;
}
/* vse vrstice po straneh (privzeta meja Supabase je 1000) */
async function apiVse(potBase, korak){
  korak = korak || 1000;
  var vse = [], off = 0;
  while(true){
    var page = await api(potBase + (potBase.indexOf("?") >= 0 ? "&" : "?") + "limit=" + korak + "&offset=" + off);
    if(!Array.isArray(page) || !page.length) break;
    vse = vse.concat(page);
    if(page.length < korak) break;
    off += korak; if(off > 100000) break;
  }
  return vse;
}

/* ── živa sinhronizacija (realtime) ── */
var sbc = null, rtChan = null, _rtTimer = null, rtZivo = false;
function realtimeKlient(){
  if(sbc) return sbc;
  if(SPLET){ sbc = avtKlient(); return sbc; }   // splet: en sam odjemalec (seja portala)
  try{ if(window.supabase && window.supabase.createClient) sbc = window.supabase.createClient(settings.portalUrl, settings.portalKey, { auth: { persistSession: false, autoRefreshToken: false } }); }catch(e){ sbc = null; }
  return sbc;
}
function realtimeAuth(){ var c = realtimeKlient(); if(!c || !portalAuth || !portalAuth.access_token) return; try{ c.realtime.setAuth(portalAuth.access_token); }catch(e){} }
function zaziviRealtime(){
  var c = realtimeKlient(); if(!c || !portalAuth) return;
  realtimeAuth();
  if(rtChan){ try{ c.removeChannel(rtChan); }catch(e){} rtChan = null; }
  rtZivo = false;
  var poteg = function(){ clearTimeout(_rtTimer); _rtTimer = setTimeout(function(){ osveziIzPortala(); }, 700); };
  rtChan = c.channel("pralnica-sync");
  ["orgs", "articles", "delivery_notes", "delivery_note_items"].forEach(function(tbl){
    try{ rtChan.on("postgres_changes", { event: "*", schema: "public", table: tbl }, poteg); }catch(e){}
  });
  try{ rtChan.subscribe(function(stanje){ rtZivo = stanje === "SUBSCRIBED"; }); }catch(e){}
}

/* Postavke zamenja v ENI transakciji na strežniku (migracija 59); rezerva: stari način. */
/* časa iz baze (»…123+00:00«) in naprave (»…123Z«) se primerjata po vrednosti, ne kot niza */
function istiCas(a, b){ if(!a || !b) return !a && !b; var x = Date.parse(a), y = Date.parse(b); return isNaN(x) || isNaN(y) ? a === b : x === y; }
/* ── pošiljanje enega spremnega lista ── */
async function posljiEnega(e){
  /* 1. stranka — naprava je ne ustvarja, mora biti v portalu */
  var orgUuid = e.orgUuid || ((strankaLista(e) || {}).orgUuid) || null, org = [];
  if(orgUuid) org = await api("orgs?id=eq." + orgUuid + "&deleted_at=is.null&select=id&limit=1");
  if(!org.length) org = await api("orgs?legacy_id=eq." + encodeURIComponent(e.strankaId) + "&deleted_at=is.null&select=id&limit=1");
  if(!org.length && e.strankaNaziv && !orgUuid){   // stranka v košu NE gre k drugi z istim imenom
    var poImenuOrg = await api("orgs?name=eq." + encodeURIComponent(e.strankaNaziv) + "&deleted_at=is.null&select=id&limit=2");
    if(poImenuOrg.length === 1) org = poImenuOrg;
  }
  if(!org.length){ var err = new Error("stranke »" + (e.strankaNaziv || e.strankaId) + "« ni v portalu"); err.cakaNaStranko = true; throw err; }
  var orgId = org[0].id;
  /* 2. artikli — če katerega ni, gre postavka brez povezave, z imenom */
  var arts = await api("articles?org_id=eq." + orgId + "&select=id,name,legacy_id");
  var poLegacy = {}, poImenu = {}, poId = {};
  arts.forEach(function(a){ poId[a.id] = true; if(a.legacy_id) poLegacy[a.legacy_id] = a.id; poImenu[(a.name || "").trim().toLowerCase()] = a.id; });
  /* 3. spremni list */
  var del = String(e.stevilka).split("/"), seq = parseInt(del[0], 10), leto = parseInt(del[1], 10) || new Date(e.datum).getFullYear();
  if(!seq) throw new Error("številke »" + e.stevilka + "« ni mogoče razbrati");
  var vrstica = { org_id: orgId, doc_year: leto, doc_seq: seq, doc_date: e.datum, issued_name: e.izdal || null,
    weight_kg: (e.kg === "" || e.kg == null) ? null : Number(e.kg), transport: (e.prevoz === "izredni" ? "izredni" : "redni"),
    source: "tablet", legacy_id: e.id, popravil: e.popravil || null, popravljeno_at: e.popravljeno_at || null };
  var obst = await api("delivery_notes?legacy_id=eq." + encodeURIComponent(e.id) + "&select=id,potrjeno,popravljeno_at&limit=1");
  if(!obst.length){
    /* po številki: ista številka je lahko DRUG list (portal ali druga naprava) — takega nikoli ne prepiši */
    /* listi v košu številke ne zasedajo (61_stevilke_kos.sql) */
    obst = await api("delivery_notes?doc_year=eq." + leto + "&doc_seq=eq." + seq + "&deleted_at=is.null&select=id,potrjeno,popravljeno_at,legacy_id,org_id,doc_date&limit=1");
    if(obst.length){
      var _o = obst[0];
      var _isti = (_o.legacy_id && _o.legacy_id === e.id) || (!_o.legacy_id && _o.org_id === orgId && String(_o.doc_date) === String(e.datum));
      if(!_isti){ var _ez = new Error("številka " + e.stevilka + " je v portalu že zasedena"); _ez.stevilkaZasedena = true; throw _ez; }
    }
  }
  /* potrjen list: velja različica iz portala, naslednji prenos jo povrne */
  var zavrniPotrjen = function(){
    e.potrjeno = true; e.zaklenjen = true; e.syncedAt = e.syncedAt || new Date().toISOString();
    e.osveziIzPortala = true;
    e.syncNapaka = null; _zavrnjenoPotrjeno.push(e.stevilka);
    return true;
  };
  var noteId = null, portalP = null;
  if(obst.length){
    noteId = obst[0].id; e.portalId = noteId;
    /* potrjenega lista aplikacija NIKOLI ne spreminja — velja različica iz portala */
    if(obst[0].potrjeno === true) return zavrniPotrjen();
    /* prekrivanje: portalna različica se je spremenila od znane osnove → ne povozi, zapiši spor */
    portalP = obst[0].popravljeno_at || null; var baza = e.portalPopravljenoAt || null;
    /* list je bil že poslan (portalId) → tudi prazna osnova je osnova: popravek v portalu se ne povozi */
    if(e.popravil && (baza || e.portalId) && portalP && !istiCas(portalP, baza)){
      await api("delivery_note_conflicts", { method: "POST", body: {
        note_id: noteId, legacy_id: e.id, org_id: orgId, org_name: e.strankaNaziv || null,
        doc_year: leto, doc_seq: seq, doc_date: e.datum, number: e.stevilka,
        weight_kg: (e.kg === "" || e.kg == null) ? null : Number(e.kg), transport: (e.prevoz === "izredni" ? "izredni" : "redni"),
        issued_name: e.izdal || null, popravil: e.popravil || null, popravki: e.popravki || null,
        postavke: (e.postavke || []).filter(function(p){ return p && p.naziv; }).map(function(p){ return { naziv: String(p.naziv), kosov: Number(p.kosov) || 0 }; }),
        base_popravljeno_at: baza, portal_popravljeno_at: portalP } });
      e.vSporu = true; e.syncedAt = new Date().toISOString(); e.syncNapaka = "prekrivanje — reši v portalu";
      return true;
    }
  }
  /* 4. postavke (enaki artikli združeni) */
  var post = (e.postavke || []).filter(function(p){ return p && p.naziv; }).map(function(p){
    var ime = String(p.naziv).trim();
    return { article_id: (p.uuid && poId[p.uuid] ? p.uuid : null) || (p.id && poLegacy[p.id]) || poImenu[ime.toLowerCase()] || null, article_name: ime, pieces: Number(p.kosov) || 0 };
  });
  var videni = {}, zdruzene = [];
  post.forEach(function(r){ var k = r.article_id ? ("a" + r.article_id) : ("n" + String(r.article_name || "").toLowerCase());
    if(videni[k]) videni[k].pieces += (r.pieces || 0); else { videni[k] = r; zdruzene.push(r); } });
  /* 5. list, dnevnik urejanj, opombi in postavke v ENI transakciji (65_shrani_list.sql):
     ob izpadu povezave list nikoli ne ostane v portalu brez postavk; isti list iz
     dveh zavihkov ali po izgubljenem odgovoru se posodobi, ne podvoji */
  var lst = Object.assign({}, vrstica);
  if(noteId) delete lst.source;   // izvor lista (portal/tablica) ostane, kot je
  if(e.popravki) lst.popravki = e.popravki;
  lst.opomba_stranka = e.opombaStranka || null; lst.opomba_evidenca = e.opombaEvidenca || null;
  try{ noteId = await api("rpc/app_shrani_list", { method: "POST", body: { p_id: noteId, p_list: lst, p_postavke: zdruzene } }); }
  catch(err){ if(err && err.hint === "potrjen") return zavrniPotrjen(); throw err; }
  e.portalId = noteId;
  e.portalPopravljenoAt = vrstica.popravljeno_at || portalP || e.portalPopravljenoAt || null;
  return true;
}

/* ── prenos čakalne vrste ── */
var _zavrnjenoPotrjeno = [], _zadnjiNeuspeh = 0;
var _syncSpet = false, _potegSpet = false;
async function syncPush(tiho){
  /* med pošiljanjem ali potegom ne začni še enega — ko se konča, se zažene znova */
  if(syncTecev || pullTecev){ _syncSpet = true; return; }
  if(!portalNastavljen() || !portalAuth){ risiSyncGumb(); return; }
  if(navigator.onLine === false){ syncZadnje = "ni omrežja"; risiSyncGumb(); return; }
  var cakajo = entries.filter(function(e){ return !e.syncedAt; });
  if(!cakajo.length){ syncZadnje = ""; risiSyncGumb(); return; }
  syncTecev = true; risiSyncGumb();
  var poslano = 0, spodletelo = 0, zadnjaNapaka = "";
  try{
  for(var i = 0; i < cakajo.length; i++){
    var e = cakajo[i], rev = e.rev || 0;
    try{
      await posljiEnega(e);
      /* list, urejen MED pošiljanjem, ostane v vrsti (prej: označen kot poslan, portal je imel staro vsebino) */
      if((e.rev || 0) !== rev){ _syncSpet = true; continue; }
      if(!e.syncedAt) e.syncedAt = new Date().toISOString();
      e.syncNapaka = null; e.stevilkaZasedena = false; poslano++;
    }catch(err){
      var sporocilo = err.message || String(err);
      /* številka zasedena z DRUGIM listom → ostane v vrsti z opozorilom »Nova št.« */
      if(err.stevilkaZasedena || /duplicate key|already exists|doc_year_doc_seq|23505/i.test(sporocilo)){
        e.stevilkaZasedena = true; e.syncNapaka = "številka " + e.stevilka + " je v portalu že zasedena";
        spodletelo++; zadnjaNapaka = e.syncNapaka; continue;
      }
      spodletelo++;
      var breznet = err.name === "TypeError" || /Failed to fetch|NetworkError|ni povezave/i.test(sporocilo);
      zadnjaNapaka = breznet ? "ni povezave" : sporocilo;
      e.syncNapaka = zadnjaNapaka;
      if(breznet || /seja je potekla|ni prijavljena/i.test(zadnjaNapaka)) break;
    }
  }
  await saveEntries();
  }finally{ syncTecev = false; }
  syncZadnje = spodletelo ? zadnjaNapaka : "";
  _zadnjiNeuspeh = spodletelo ? Date.now() : 0;
  risiSyncGumb(); renderList();
  if(_zavrnjenoPotrjeno.length){
    toast("List " + _zavrnjenoPotrjeno.join(", ") + " je v portalu že potrjen — sprememba ni bila prenesena.");
    _zavrnjenoPotrjeno = [];
    osveziIzPortala();
  }else if(!tiho){
    if(spodletelo) toast("Poslano " + poslano + ", ostalo " + spodletelo + " — " + zadnjaNapaka);
    else if(poslano) toast("Poslano v portal: " + poslano);
  }
  if(_potegSpet){ _potegSpet = false; setTimeout(function(){ potegniIzPortala(); }, 200); }
  else if(_syncSpet && !spodletelo){ _syncSpet = false; setTimeout(function(){ syncPush(true); }, 300); }
  else _syncSpet = false;
}

/* ── stanje sinhronizacije v orodni vrstici ── */
var IKO_SYNC = '<svg class="vrti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>';
/* ── ali je aplikacija res usklajena s portalom ──
   Prej je zelena pika pomenila le »ni neposlanih listov« — tudi ko naprava ure ni dobila
   strank in artiklov iz portala (npr. tablica na WiFi tiskalnika). Zdaj šteje čas zadnjega
   USPEŠNEGA prenosa strank/artiklov (k) in listov (p); starejši od 12 min → opozorilo. */
var USKL_MEJA = 12 * 60000;
function usklajeno(){ var u = settings.uskl || {}; return (u.k && u.p) ? Math.min(u.k, u.p) : 0; }
function zabeleziUskl(kaj){
  settings.uskl = settings.uskl || {};
  var prej = settings.uskl[kaj] || 0; settings.uskl[kaj] = Date.now();
  if(Date.now() - prej > 60000) saveSettings();
  risiSyncGumb();
}
function kdajUskl(t){
  var d = new Date(t), h = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  return todayISO() === (d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0")) ? "ob " + h : (d.getDate() + ". " + (d.getMonth() + 1) + ". ob " + h);
}
function stanjeUskl(){
  if(!session) return null;
  if(!portalAuth) return { t: "Prijava v portal je potekla — stranke, artikli in listi se ne usklajujejo.", gumb: "Prijava" };
  if(katalogTecev || pullTecev) return null;
  if(polnaOd && Date.now() - polnaOd < 90000) return null;   // prva/polna sinhronizacija še teče
  var u = usklajeno();
  if(u && Date.now() - u < USKL_MEJA) return null;
  var brez = navigator.onLine === false ? " Naprava nima interneta." : " Preveri internet na napravi (ne samo WiFi tiskalnika).";
  return { t: (u ? "Ni usklajeno s portalom od " + kdajUskl(u).replace(/^ob /, "") + "." : "Še ni usklajeno s portalom.") + " Stranke in artikli morda niso najnovejši." + brez, gumb: "Poskusi zdaj" };
}
function risiUskl(){
  var el = $("uskl"); if(!el) return;
  var st = stanjeUskl();
  el.hidden = !st;
  if(st){ $("usklT").textContent = st.t; $("usklBtn").textContent = st.gumb; }
  risiNogo();
}
function risiSyncGumb(){
  risiUskl();
  var b = $("syncChip"), dot = $("syncDot"); if(!b) return;
  if(!portalNastavljen() || (!portalAuth && !session)){ b.hidden = true; return; }
  b.hidden = false;
  var caka = entries.filter(function(e){ return !e.syncedAt; }).length;
  var brez = navigator.onLine === false || syncZadnje === "ni povezave" || syncZadnje === "ni omrežja";
  var st, t;
  if(!portalAuth){ st = "bad"; t = "Seja v portalu je potekla — tapni za ponovno prijavo."; }
  else if(syncTecev || rocnoTece){ st = "warn"; t = "Prenos v teku …"; }
  else if(caka){ st = brez ? "bad" : "warn"; t = "Na prenos čaka " + caka + (brez ? " — ni povezave" : (syncZadnje ? " — " + syncZadnje : "")) + ". Tapni za prenos zdaj."; }
  else if(stanjeUskl()){ st = "warn"; t = stanjeUskl().t + " Tapni za poskus."; }
  else { st = "ok"; t = "Usklajeno s portalom " + kdajUskl(usklajeno()) + ". Tapni za osvežitev."; }
  b.classList.toggle("vrti", !!(syncTecev || rocnoTece));
  dot.className = "notif-dot " + st; b.title = t; b.setAttribute("aria-label", t);
}
var rocnoTece = false;
$("usklBtn").onclick = function(){ $("syncChip").click(); };
$("syncChip").onclick = async function(){
  if(rocnoTece) return;
  if(!portalAuth){ var p = savedProfs.find(function(x){ return x.email === aktivniEmail; }); showAccountLogin("Seja je potekla — vpiši geslo.", p ? p.email : ""); return; }
  rocnoTece = true; risiSyncGumb();
  try{
    await syncPush(false);
    await osveziKatalog(false);
    await potegniIzPortala(true);
    if(!entries.some(function(e){ return !e.syncedAt; })) toast("Vse je v portalu in osveženo.");
  }catch(e){ toast("Osvežitev ni uspela: " + ((e && e.message) || e)); }
  finally{ rocnoTece = false; risiSyncGumb(); }
};

/* ── katalog iz portala (portal je edini vir resnice za stranke in artikle) ── */
var katalogTecev = false;
function vArtikel(a){ return { id: a.legacy_id || ("s" + a.id.slice(0, 8)), uuid: a.id, naziv: a.name, sy: true, teza: (a.teza == null || a.teza === "") ? null : parseFloat(a.teza), vid: (a.viden_app !== false) }; }
/* Vrstni red artiklov kot pri stranki v portalu (risiArtikleBox): po vrstnem redu cene v
   ceniku, nato po imenu. Prej je aplikacija uporabila svoj vrstni red. */
var cenikVrstni = null;
async function naloziCenikVrstni(){
  try{
    var r = await apiVse("pricelist?select=sifra,sort_order&deleted_at=is.null");
    var m = {}; (r || []).forEach(function(x){ if(x.sort_order != null) m[x.sifra] = x.sort_order; });
    cenikVrstni = m;
  }catch(e){ if(!cenikVrstni) cenikVrstni = {}; }
}
function urediKotPortal(arts){
  var m = cenikVrstni || {};
  function v(a){ return (a.cena_sifra != null && m[a.cena_sifra] != null) ? m[a.cena_sifra] : null; }
  return (arts || []).slice().sort(function(a, b){
    var pa = v(a), pb = v(b);
    if(pa != null && pb != null && pa !== pb) return pa - pb;
    if(pa != null && pb == null) return -1;
    if(pa == null && pb != null) return 1;
    return String(a.name || "").localeCompare(String(b.name || ""), "sl");
  });
}
/* id stranke v aplikaciji: legacy_id (tablica) ali prvih 8 znakov uuid-ja — enako kot pri
   listih, prenesenih iz portala */
function kanonId(o){ return o.legacy_id || ("s" + o.id.slice(0, 8)); }
async function osveziKatalog(tiho){
  if(!portalNastavljen() || !portalAuth){ if(!tiho) toast("Ni prijave v portal."); return; }
  if(katalogTecev) return;
  katalogTecev = true;
  try{
    /* kot v portalu: izbrisane stranke (koš, deleted_at) se ne prikažejo */
    var orgs = await apiVse("orgs?select=id,name,legal_name,address,vat_id,legacy_id&deleted_at=is.null&order=name");
    var arts = await apiVse("articles?select=id,org_id,name,legacy_id,sort_order,teza,viden_app,cena_sifra&order=sort_order,id");
    await naloziCenikVrstni();
    /* prazen odgovor ne izprazni naprave (npr. račun brez pravic) */
    if(!orgs || !orgs.length){ if(!tiho) toast("Portal ni vrnil nobene stranke."); return; }
    var artPoOrg = {};
    (arts || []).forEach(function(a){ (artPoOrg[a.org_id] = artPoOrg[a.org_id] || []).push(a); });
    /* Seznam strank se zgradi NA NOVO iz portala, stranka = uuid v portalu. Prej se je
       lokalni seznam dopolnjeval (tudi po imenu), zato je lahko stranka dobila artikle
       druge stranke — pri hitrem menjavanju strank so se pokazali napačni artikli. */
    var novi = [], zaseden = {}, idOrg = {};
    /* najprej stranke, ki jih naprava že pozna (obdržijo svoj id — nanj kažejo shranjeni listi), nato nove */
    orgs.forEach(function(o){
      var star = CLIENTS.find(function(c){ return c.orgUuid === o.id; });
      if(star && !zaseden[star.id]){ idOrg[o.id] = star.id; zaseden[star.id] = true; }
    });
    orgs.forEach(function(o){
      if(idOrg[o.id]) return;
      var id = kanonId(o);
      if(zaseden[id]) id = "s" + o.id.slice(0, 8);
      if(zaseden[id]) id = "u" + o.id;
      idOrg[o.id] = id; zaseden[id] = true;
    });
    orgs.forEach(function(o){
      var id = idOrg[o.id];
      novi.push({ id: id, orgUuid: o.id, naziv: o.name, podjetje: o.legal_name || "", naslov: o.address || "", davcna: o.vat_id || "",
        artikli: urediKotPortal(artPoOrg[o.id] || []).map(vArtikel), sy: true });
    });
    /* stranka, na katero še čaka neposlan list, ostane (da ga lahko urediš), tudi če je v portalu ni več */
    entries.forEach(function(e){
      if(e.syncedAt || zaseden[e.strankaId]) return;
      var c = clientById(e.strankaId); if(c && novi.indexOf(c) < 0){ novi.push(c); zaseden[c.id] = true; }
    });
    CLIENTS = novi;
    /* izbrana stranka je bila medtem v portalu izbrisana */
    if(selectedId && !editingId && !clientById(selectedId)){ selectedId = null; draftQty = {}; toast("Izbrana stranka je bila v portalu izbrisana — izberi drugo."); if(session){ renderSummary(); } }
    await saveClients();
    if(session){ setClientLabel(); renderEntry(); renderSummary(); if(_okna.oknoStranke && !_okna.oknoStranke.zapiram) fillClientGrid(); }
    zabeleziUskl("k");
    if(!tiho) toast("Stranke in artikli osveženi.");
  }catch(err){ if(!tiho) toast("Katalog ni šel: " + (err.message || err)); }
  finally{ katalogTecev = false; }
}
/* ob izbiri stranke: artikli TE stranke naravnost iz portala (po uuid stranke) */
var _zahtevaArt = 0;
async function osveziStrankinArtikle(cid){
  var c = clientById(cid); if(!c || !c.orgUuid || !portalAuth) return false;
  var moja = ++_zahtevaArt;
  try{
    if(!cenikVrstni) await naloziCenikVrstni();
    var arts = await apiVse("articles?select=id,name,legacy_id,sort_order,teza,viden_app,cena_sifra&org_id=eq." + c.orgUuid + "&order=sort_order,id");
    c.artikli = urediKotPortal(arts || []).map(vArtikel);
    await saveClients();
    /* med čakanjem je bila izbrana druga stranka → ne izrisuj (njen zahtevek pride sam) */
    if(moja === _zahtevaArt && selectedId === cid){ renderEntry(); renderSummary(); }
    return true;
  }catch(e){ return false; }
}

/* ── povratna sinhronizacija: arhiv iz portala (novi, popravljeni, izbrisani, potrjeni) ──
   Dotika se samo listov, ki so že v portalu — nikoli tistih, ki še čakajo na pošiljanje. */
var pullTecev = false, zadnjiPoteg = 0;
async function potegniIzPortala(){
  if(pullTecev) return;
  /* poteg med pošiljanjem bi list, poslan med prenosom seznama, štel za »izbrisanega v portalu« */
  if(syncTecev){ _potegSpet = true; return; }
  if(!portalNastavljen() || !portalAuth || navigator.onLine === false) return;
  pullTecev = true;
  try{
    var pl = [], off = 0;
    var selPoln = "id,legacy_id,doc_year,doc_seq,doc_date,weight_kg,transport,issued_name,opomba_stranka,opomba_evidenca,popravil,popravljeno_at,potrjeno,orgs(id,name,legal_name,address,vat_id,legacy_id)";
    var selOsn = "id,legacy_id,doc_year,doc_seq,doc_date,weight_kg,transport,issued_name,popravil,popravljeno_at,potrjeno,orgs(id,name,legal_name,address,vat_id,legacy_id)";
    var delFrag = "&deleted_at=is.null";   // koš (migracija 50) se ne prenese
    /* splet: na telefonu le zadnjih 180 dni (shramba brskalnika je majhna in skupna s portalom);
       starejši listi so v portalu. Tablica (datoteke) hrani vse. */
    var meja = "";
    if(SPLET){ var _m = new Date(Date.now() - 180 * 864e5); meja = _m.getFullYear() + "-" + String(_m.getMonth() + 1).padStart(2, "0") + "-" + String(_m.getDate()).padStart(2, "0"); }
    var obdFrag = meja ? "&doc_date=gte." + meja : "";
    while(true){
      var page;
      try{ page = await api("delivery_notes?select=" + selPoln + delFrag + obdFrag + "&order=doc_date.desc,id&limit=1000&offset=" + off); }
      catch(_e){
        if(/ni povezave|seja je potekla|ni prijavljena/i.test((_e && _e.message) || "")) throw _e;
        try{ page = await api("delivery_notes?select=" + selOsn + delFrag + obdFrag + "&order=doc_date.desc,id&limit=1000&offset=" + off); }
        catch(_e2){ delFrag = ""; page = await api("delivery_notes?select=" + selOsn + obdFrag + "&order=doc_date.desc,id&limit=1000&offset=" + off); }
      }
      if(!Array.isArray(page) || !page.length) break;
      pl = pl.concat(page);
      if(page.length < 1000) break;
      off += 1000; if(off > 30000) break;
    }
    function kljuc(r){ return r.legacy_id || ("p" + r.id); }
    function apliciraj(e, r){
      if(r.doc_seq) e.stevilka = r.doc_seq + "/" + (r.doc_year || new Date(r.doc_date).getFullYear());
      if(r.doc_date) e.datum = r.doc_date;
      e.kg = (r.weight_kg == null ? "" : r.weight_kg);
      e.prevoz = (r.transport === "izredni" ? "izredni" : "redni");
      if(r.issued_name) e.izdal = r.issued_name;
      if(r.orgs){
        if(r.orgs.name) e.strankaNaziv = r.orgs.name;
        if(r.orgs.legal_name) e.strankaPodjetje = r.orgs.legal_name;
        if(r.orgs.address) e.strankaNaslov = r.orgs.address;
        if(r.orgs.vat_id) e.strankaDavcna = r.orgs.vat_id;
      }
      /* opombe: prazna baza ne zbriše lokalne — ta se znova pošlje (razširi povsod) */
      var imaStolpce = ("opomba_stranka" in r) || ("opomba_evidenca" in r);
      var dbStr = r.opomba_stranka || "", dbEv = r.opomba_evidenca || "";
      if(dbStr) e.opombaStranka = dbStr; else if(e.opombaStranka){ if(imaStolpce && !e.potrjeno) e.syncedAt = null; } else e.opombaStranka = "";
      if(dbEv) e.opombaEvidenca = dbEv; else if(e.opombaEvidenca){ if(imaStolpce && !e.potrjeno) e.syncedAt = null; } else e.opombaEvidenca = "";
      e.popravil = r.popravil || null;
      if(r.popravljeno_at) e.popravljeno_at = r.popravljeno_at;   // sicer bi poznejši popravek z naprave poslal star čas
    }
    var portalPoKljucu = {};
    pl.forEach(function(r){ portalPoKljucu[kljuc(r)] = r; });
    var spremenjeno = false, potrebnePostavke = {};
    /* 1. že poslani listi: izbrisani odpadejo, popravljeni se posodobijo, potrditev vedno */
    var obdrzi = [];
    entries.forEach(function(e){
      if(!(e.syncedAt && e.id)){ obdrzi.push(e); return; }
      var pr = portalPoKljucu[e.id];
      if(!pr){
        /* starejši od okna (splet): ni izbrisan, le ne hranimo ga več na telefonu */
        if(meja && String(e.datum || "") < meja && e.id === editingId){ obdrzi.push(e); return; }
        spremenjeno = true; return;   // izbrisan v portalu (ali starejši od okna)
      }
      obdrzi.push(e);
      if(e.portalId !== pr.id){ e.portalId = pr.id; spremenjeno = true; }
      /* ime in podatki stranke kot v portalu (preimenovanje v portalu velja tudi za stare liste) */
      if(pr.orgs){
        var o = pr.orgs;
        if(o.id && e.orgUuid !== o.id){ e.orgUuid = o.id; spremenjeno = true; }
        var _cl = o.id ? CLIENTS.find(function(c){ return c.orgUuid === o.id; }) : null;
        if(_cl && e.strankaId !== _cl.id){ e.strankaId = _cl.id; spremenjeno = true; }
        if(o.name && o.name !== e.strankaNaziv){ e.strankaNaziv = o.name; spremenjeno = true; }
        if((o.legal_name || "") !== (e.strankaPodjetje || "") && o.legal_name){ e.strankaPodjetje = o.legal_name; spremenjeno = true; }
      }
      var potrjen = pr.potrjeno === true;
      if(!!e.potrjeno !== potrjen || !!e.zaklenjen !== potrjen){ e.potrjeno = potrjen; e.zaklenjen = potrjen; spremenjeno = true; }
      var prPop = pr.popravljeno_at || null;
      /* list, ki ga uporabnik prav zdaj ureja, se ne prepiše (in osnova se ne premakne) — spor zazna pošiljanje */
      if(e.id === editingId) return;
      if(e.osveziIzPortala || (prPop && !istiCas(prPop, e.portalPopravljenoAt))){
        apliciraj(e, pr); e.portalPopravljenoAt = prPop; delete e.osveziIzPortala;
        potrebnePostavke[pr.id] = e; spremenjeno = true;
      }
    });
    entries = obdrzi;
    var lokalno = {};
    entries.forEach(function(e){ lokalno[e.id] = e; });
    /* 2. listi, ki jih naprava še nima */
    pl.forEach(function(r){
      var k = kljuc(r); if(lokalno[k]) return;
      var e = { id: k, portalId: r.id, stevilka: (r.doc_seq || "") + "/" + (r.doc_year || new Date(r.doc_date).getFullYear()), datum: r.doc_date,
        ustvarjeno: new Date().toISOString(),
        strankaId: (function(){ var cl = r.orgs && r.orgs.id ? CLIENTS.find(function(c){ return c.orgUuid === r.orgs.id; }) : null; return cl ? cl.id : ((r.orgs && r.orgs.legacy_id) || (r.orgs && r.orgs.id ? "s" + String(r.orgs.id).slice(0, 8) : "")); })(),
        orgUuid: (r.orgs && r.orgs.id) || null,
        strankaNaziv: (r.orgs && r.orgs.name) || "", strankaPodjetje: (r.orgs && r.orgs.legal_name) || "",
        strankaNaslov: (r.orgs && r.orgs.address) || "", strankaDavcna: (r.orgs && r.orgs.vat_id) || "",
        izdal: r.issued_name || "", postavke: [], skupajKosov: 0, prevoz: (r.transport === "izredni" ? "izredni" : "redni"),
        kg: (r.weight_kg == null ? "" : r.weight_kg), opombaStranka: r.opomba_stranka || "", opombaEvidenca: r.opomba_evidenca || "",
        saved: true, syncedAt: new Date().toISOString(), syncNapaka: null,
        popravil: r.popravil || null, portalPopravljenoAt: r.popravljeno_at || null, prenesenIzPortala: true,
        potrjeno: (r.potrjeno === true), zaklenjen: (r.potrjeno === true) };
      entries.push(e); lokalno[k] = e; potrebnePostavke[r.id] = e; spremenjeno = true;
    });
    /* 3. postavke za nove in popravljene (paketno). Do uspešnega prenosa ostane oznaka
       osveziIzPortala — prej je neuspel prenos ostal tih: list brez postavk ali s starimi. */
    var idi = Object.keys(potrebnePostavke), postavkeNapaka = false;
    idi.forEach(function(nid){ potrebnePostavke[nid].osveziIzPortala = true; });
    for(var i = 0; i < idi.length; i += 50){
      var chunk = idi.slice(i, i + 50);
      try{
        var its = await apiVse("delivery_note_items?note_id=in.(" + encodeURIComponent(chunk.map(function(x){ return '"' + x + '"'; }).join(",")) + ")&select=note_id,article_id,article_name,pieces,sort_order&order=sort_order");
        var poNote = {};
        (its || []).forEach(function(p){ (poNote[p.note_id] = poNote[p.note_id] || []).push(p); });
        chunk.forEach(function(nid){
          var ee = potrebnePostavke[nid];
          ee.postavke = (poNote[nid] || []).map(function(p){ return { id: null, uuid: p.article_id || null, naziv: p.article_name, kosov: p.pieces }; });
          ee.skupajKosov = ee.postavke.reduce(function(a, p){ return a + (Number(p.kosov) || 0); }, 0);
          delete ee.osveziIzPortala;
        });
      }catch(x){ postavkeNapaka = true; }
    }
    zadnjiPoteg = Date.now();
    if(!postavkeNapaka) zabeleziUskl("p");
    if(spremenjeno){
      await saveEntries();
      if(editingId && !entryById(editingId)){ praznOsnutek(); toast("List, ki si ga urejal, je bil v portalu izbrisan."); }
      if(session) osveziVse();
    }
    risiSyncGumb();
  }catch(err){ /* omrežje/napaka: pusti pri miru, poskusi ob naslednjem ciklu */ }
  finally{
    pullTecev = false;
    if(_syncSpet){ _syncSpet = false; setTimeout(function(){ syncPush(true); }, 200); }
  }
}
function osveziIzPortala(){ return osveziKatalog(true).then(function(){ return potegniIzPortala(); }).catch(function(){}); }
/* polnaOd: med polno sinhronizacijo (prijava, zagon, vrnitev povezave) opozorilo »ni usklajeno«
   miruje — prej se je ob vsakem zagonu pokazalo, skrilo in znova pokazalo (stran je skakala). */
var polnaOd = 0;
function polnaSinh(){
  polnaOd = Date.now();
  return osveziKatalog(true)
    .then(function(){ return syncPush(true); })
    .then(function(){ return potegniIzPortala(); })
    .catch(function(){})
    .then(function(){ polnaOd = 0; try{ risiSyncGumb(); }catch(e){} });
}

/* ── urnik ──
   Živa povezava (realtime) prinese spremembe takoj. Poteg celotnega arhiva je
   zavarovanje: vsakih 5 min, ko živa povezava deluje, sicer vsako minuto (prej
   vsakih 20 s ne glede na stanje — na telefonu veliko prenesenih podatkov). */
setInterval(function(){
  if(!portalAuth || !session) return;
  /* čakajoče pošlji takoj; po neuspehu (npr. stranke še ni v portalu) šele čez 2 min */
  if(entries.some(function(e){ return !e.syncedAt && !e.stevilkaZasedena; }) && Date.now() - _zadnjiNeuspeh > 120000) syncPush(true);
  if(document.visibilityState !== "visible") return;
  if(Date.now() - zadnjiPoteg > (rtZivo ? 300000 : 60000)) osveziIzPortala();
  risiSyncGumb();
}, 30000);
window.addEventListener("online", function(){ risiSyncGumb(); if(!portalAuth) return; try{ zaziviRealtime(); }catch(e){} polnaSinh(); });
window.addEventListener("offline", risiSyncGumb);
document.addEventListener("visibilitychange", function(){
  if(document.visibilityState !== "visible" || !portalAuth || !session) return;
  if(!rtZivo){ try{ zaziviRealtime(); }catch(e){} }
  if(Date.now() - zadnjiPoteg > 15000) osveziIzPortala();
});

/* ══════════ TABLICA (Capacitor) ══════════ */
function nativnaPriprava(){
  if(!jeNativno()) return;
  $("izklopBtn").hidden = false;
  try{
    var App = Capacitor.Plugins.App;
    /* sistemski gumb »nazaj«: zapre odprto okno namesto izhoda iz aplikacije */
    App.addListener("backButton", function(){
      var pin = $("pinOkno"); if(pin){ $("pinPreklic").click(); return; }
      var top = odprtaOkna[odprtaOkna.length - 1];
      if(top){ if(top === "oknoPotrdi") $("ptNe").click(); else zapriOkno(top); return; }
      if(editingId){ cancelEdit(); return; }
      if(!$("prijavaObr").hidden && savedProfs.length){ prikaziProfile(); }
    });
    App.addListener("resume", function(){ if(shrambaZaklenjena) location.reload(); });
  }catch(e){}
}

/* Tablica brez dovoljenja za datoteke (npr. po ponovni namestitvi): stari podatki so
   v mapi Dokumenti, a jih aplikacija ne vidi. Ne nadaljuj (ne prepiši jih s praznimi). */
function pokaziZaklepShrambe(){
  var el = document.createElement("div"); el.className = "pin"; el.id = "zaklepShrambe";
  el.innerHTML = '<div class="pin-in" style="max-width:420px"><div class="wordmark" style="font-size:2rem;margin-bottom:22px">Smart<span>Clean</span></div>' +
    '<div class="pin-ime">Aplikacija potrebuje dostop do datotek</div>' +
    '<button type="button" class="btn lg" id="zsOdpri">Odpri nastavitve</button></div>';
  document.body.appendChild(el);
  $("zsOdpri").onclick = function(){ try{ pdfPlugin().requestPermission(); }catch(e){} };
}

/* Prijava na nizkih telefonih: ob dotiku polja se slogan skrije, da polja ostanejo nad tipkovnico
   (iPhone bi sicer stran ob vsakem polju premaknil gor in nazaj dol). Samo ob dotiku. */
(function(){
  var a = $("prijava"); if(!a) return;
  var dotik = 0, ura = null;
  function jePolje(x){ return x && /^(INPUT|TEXTAREA|SELECT)$/.test(x.tagName); }
  a.addEventListener("touchstart", function(e){ if(jePolje(e.target)) dotik = Date.now(); }, { passive: true, capture: true });
  a.addEventListener("focusin", function(e){ if(!jePolje(e.target)) return; clearTimeout(ura); if(Date.now() - dotik < 1200 && window.innerHeight < 780) a.classList.add("auth-tipk"); });
  a.addEventListener("focusout", function(){ clearTimeout(ura); ura = setTimeout(function(){ if(!jePolje(document.activeElement) || !a.contains(document.activeElement)) a.classList.remove("auth-tipk"); }, 300); });
})();

/* ══════════ ZAGON ══════════ */
(async function init(){
  setTimeout(function(){
    if(!$("prijava").hidden || !$("app").hidden || $("zaklepShrambe")) return;
    try{ window.scBootDone(); }catch(e){}
    showAccountLogin("Strežnik se ne odziva. Preveri, ali ima naprava internet (ne samo WiFi tiskalnika).");
  }, 32000);
  try{
    nativnaPriprava();
    await loadSettings(); applyTheme();
    await loadProfs(); await loadClients(); await loadEntries(); await loadPortalAuth();
    await ensurePdfPerm();
    buildKeypad(); updateSearchChip();
    if(shrambaZaklenjena){ pokaziZaklepShrambe(); return; }
    try{ realtimeKlient(); }catch(e){}
    if(SPLET){ await spletZacni(); return; }
    /* tablica: zadnji uporabnik vstopi sam (brez kode); izbira profilov le, če ga ni */
    var zadnji = settings.zadnjiProfil && savedProfs.find(function(p){ return p.email === settings.zadnjiProfil && p.refresh_token; });
    if(zadnji && vstopiZadnjega(zadnji)) return;
    if(!session && $("prijava").hidden) prikaziProfile();
  }finally{
    requestAnimationFrame(function(){ try{ window.scBootDone(); }catch(e){} });
  }
})();

/* za preizkuse (samo branje stanja) */
window.__pralnica = { verzija: APP_VERZIJA, varianta: VARIANTA, stanje: function(){
  return { entries: entries, CLIENTS: CLIENTS, profili: savedProfs.map(function(p){ return p.name; }), session: session, portal: !!portalAuth, rtZivo: rtZivo,
  okna: Object.keys(_okna).map(function(k){ return k + (_okna[k].zapiram ? ":zapiram" : "") + (_okna[k].morf ? ":raste" : ""); }), odprta: odprtaOkna.slice() }; } };
})();
