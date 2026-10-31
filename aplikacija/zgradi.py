#!/usr/bin/env python3
"""Zgradi aplikacijo za spremne liste iz skupnega izvora.

Ena koda (aplikacija/app.html + app.css + app.js), dve različici:
  mobile/   spletna aplikacija (telefon, brskalnik) — povezava »Odpri« v portalu
  tablica/  ista aplikacija za tablico; ta index.html gre v APK

Uporaba (iz korena repozitorija):
  python3 aplikacija/zgradi.py          zgradi obe spletni različici
  python3 aplikacija/zgradi.py --apk    + nov APK (tablica/Pralnica-sync.apk)

Različica aplikacije je spodaj (VERZIJA) — ob vsaki objavi jo povečaj.
Podpisni ključ za APK je v aplikaciji/podpis/ (ni v gitu). Vse prihodnje
posodobitve APK morajo biti podpisane z ISTIM ključem — shrani ga varno.
"""
import base64
import json
import os
import pathlib
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import zipfile

VERZIJA = "11.12"

KOREN = pathlib.Path(__file__).resolve().parent.parent
IZVOR = KOREN / "aplikacija"
PODPIS = IZVOR / "podpis"

RAZLICICE = {
    "mobile": {"varianta": "splet", "naslov": "SmartClean — spremni listi", "ime": "SmartClean mobile", "cache": "pralnica-mobil"},
    "tablica": {"varianta": "tablica", "naslov": "SmartClean — tablica", "ime": "SmartClean tablica", "cache": "pralnica-tablica"},
}

# Isti razponi kot v portal.css (Archivo / Playfair iz fonts/).
LAT = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
EXT = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF"
PISAVE = [
    ("Archivo", "100 900", "archivo-latin-wght-normal.woff2", LAT),
    ("Archivo", "100 900", "archivo-latin-ext-wght-normal.woff2", EXT),
    ("Playfair Display", "700", "playfair-display-latin-700-normal.woff2", LAT),
    ("Playfair Display", "700", "playfair-display-latin-ext-700-normal.woff2", EXT),
]

SW = """/* SmartClean — service worker ({ime}). ZGRAJENO z aplikacija/zgradi.py — ne urejaj ročno. */
/* HTML = network-first (vedno sveža koda, brez povezave iz predpomnilnika),
   lastne statične datoteke = cache-first. Klici na Supabase se NIKOLI ne predpomnijo. */
const CACHE = "{cache}-v{verzija}";
const CORE = ["index.html", "manifest.json", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png", "supabase.js"];

self.addEventListener("install", (e) => {{
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
}});
self.addEventListener("activate", (e) => {{
  e.waitUntil(caches.keys()
    // samo lastne stare različice (portal na isti domeni ima svoj »sc-portal«)
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.indexOf("{cache}-v") === 0).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
}});
self.addEventListener("fetch", (e) => {{
  if (e.request.method !== "GET") return;
  const req = e.request;
  let url;
  try {{ url = new URL(req.url); }} catch (_) {{ return; }}
  if (url.origin !== self.location.origin) return;   // Supabase: vedno z mreže
  const path = url.pathname;
  const isHTML = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html") || path.endsWith("/") || path.endsWith("index.html");
  if (isHTML) {{
    // Šibka povezava (pralnica): če strežnik ne odgovori v 4 s, se odpre shranjena kopija
    // (aplikacija je ena datoteka, zato ni mešanja starega in novega). Nova različica se vseeno
    // shrani, ko prispe — velja ob naslednjem odprtju.
    e.respondWith(new Promise((resolve) => {{
      let gotovo = false;
      const shranjena = () => caches.match("index.html");
      const t = setTimeout(() => {{ shranjena().then((h) => {{ if (h && !gotovo) {{ gotovo = true; resolve(h); }} }}); }}, 4000);
      fetch(req).then((resp) => {{
        clearTimeout(t);
        if (resp && resp.ok) {{ const copy = resp.clone(); caches.open(CACHE).then((c) => c.put("index.html", copy)).catch(() => {{}}); }}
        if (!gotovo) {{ gotovo = true; resolve(resp); }}
      }}).catch(() => {{
        clearTimeout(t);
        shranjena().then((h) => {{ if (!gotovo) {{ gotovo = true; resolve(h || Response.error()); }} }});
      }});
    }}));
    return;
  }}
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((resp) => {{
    const copy = resp.clone();
    caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {{}});
    return resp;
  }})));
}});
"""


def pisave_css():
    deli = []
    for druzina, teza, datoteka, razpon in PISAVE:
        b64 = base64.b64encode((KOREN / "fonts" / datoteka).read_bytes()).decode()
        deli.append("@font-face{font-family:'%s';font-style:normal;font-weight:%s;font-display:block;"
                    "src:url(data:font/woff2;base64,%s) format('woff2');unicode-range:%s}" % (druzina, teza, b64, razpon))
    return "".join(deli)


def zgradi_splet():
    predloga = (IZVOR / "app.html").read_text(encoding="utf-8")
    css = (IZVOR / "app.css").read_text(encoding="utf-8")
    js = (IZVOR / "app.js").read_text(encoding="utf-8")
    if "</script" in js.lower():
        sys.exit("app.js ne sme vsebovati '</script' (zaprl bi vgrajeni skript)")
    pis = pisave_css()
    for mapa, r in RAZLICICE.items():
        cilj = KOREN / mapa
        html = predloga
        zamenjave = {
            "{{OPOZORILO}}": "ZGRAJENO iz aplikacija/ (python3 aplikacija/zgradi.py) — ne urejaj ročno.",
            "{{NASLOV}}": r["naslov"],
            "{{KRATKO_IME}}": "Spremni listi",
            "{{PISAVE}}": pis,
            "{{CSS}}": css,
        }
        for k, v in zamenjave.items():
            html = html.replace(k, v)
        html = html.replace("{{JS}}", js.replace("{{VARIANTA}}", r["varianta"]).replace("{{VERZIJA}}", VERZIJA))
        if "{{" in html:
            sys.exit("ostal je nezamenjan vzorec: " + html[html.index("{{"):html.index("{{") + 40])
        (cilj / "index.html").write_text(html, encoding="utf-8")
        (cilj / "sw.js").write_text(SW.format(ime=r["ime"], cache=r["cache"], verzija=VERZIJA.replace(".", "-")), encoding="utf-8")
        manifest = {
            "name": r["ime"], "short_name": "Spremni listi",
            "description": "Vnos in tiskanje spremnih listov — SmartClean.",
            "start_url": "index.html", "scope": ".", "display": "standalone", "orientation": "any",
            "background_color": "#0a0a0a", "theme_color": "#0a0a0a",
            "icons": [
                {"src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
                {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
                {"src": "icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
            ],
        }
        (cilj / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if mapa == "tablica":   # ista ikona kot mobile (svetla SC — aplikacija; portal ima temno)
            for ik in IKONE_APP:
                shutil.copyfile(KOREN / "mobile" / ik, cilj / ik)
        print("zgrajeno:", mapa + "/index.html", f"({len(html) // 1024} kB)")


# ── APK ─────────────────────────────────────────────────────────────────
def orodja():
    bt = pathlib.Path.home() / "Library/Android/sdk/build-tools"
    verzije = sorted([p for p in bt.iterdir() if (p / "apksigner").exists()], key=lambda p: [int(x) for x in p.name.split(".") if x.isdigit()])
    if not verzije:
        sys.exit("ni Android build-tools (apksigner, zipalign)")
    okolje = dict(os.environ)
    for jh in ("/opt/homebrew/opt/openjdk", "/usr/local/opt/openjdk"):
        if pathlib.Path(jh, "bin/java").exists():
            okolje["JAVA_HOME"] = jh
            okolje["PATH"] = jh + "/bin:" + okolje.get("PATH", "")
            break
    return verzije[-1], okolje


def podpisni_kljuc(okolje):
    PODPIS.mkdir(exist_ok=True)
    (IZVOR / ".gitignore").write_text("# podpisni ključ APK — nikoli v git (repozitorij je javen)\npodpis/\n", encoding="utf-8")
    ks, geslo = PODPIS / "pralnica.jks", PODPIS / "geslo.txt"
    if not ks.exists():
        geslo.write_text(secrets.token_urlsafe(24) + "\n", encoding="utf-8")
        os.chmod(geslo, 0o600)
        g = geslo.read_text().strip()
        subprocess.run(["keytool", "-genkeypair", "-keystore", str(ks), "-storetype", "PKCS12", "-alias", "pralnica",
                        "-keyalg", "RSA", "-keysize", "3072", "-validity", "12000",
                        "-storepass", g, "-keypass", g,
                        "-dname", "CN=SmartClean Pralnica, O=BSMART d.o.o., C=SI"], check=True, env=okolje, capture_output=True)
        os.chmod(ks, 0o600)
        print("ustvarjen nov podpisni ključ:", ks.relative_to(KOREN))
    return ks, geslo


# Datoteke v assets/public, ki jih nova koda ne uporablja več.
APK_ODSTRANI = {"assets/public/xlsx.full.min.js", "assets/public/logo.png", "assets/public/logo-white.png",
                "assets/public/logo.svg", "assets/public/eflitte-logo.svg"}
IKONE_APP = ("icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png")
APK_ZAMENJAJ = {f"assets/public/{ime}": KOREN / "tablica" / ime for ime in
                ("index.html", "manifest.json", "sw.js", "supabase.js") + IKONE_APP}
# Ikona v zaganjalniku Androida (ikone/ikona.html → aplikacija/ikone): ospredje prilagodljive ikone,
# stara (do Androida 7) in okrogla. Ozadje prilagodljive ikone je barva v resources.arsc (IKONA_OZADJE).
APK_ZAMENJAJ.update({f"res/mipmap-{d}-v4/{ime}.png": IZVOR / "ikone" / f"{d}-{ime}.png"
                     for d in ("mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi")
                     for ime in ("ic_launcher_foreground", "ic_launcher", "ic_launcher_round")})
IKONA_OZADJE = (bytes.fromhex("0800001c0a0a0aff"), bytes.fromhex("0800001cf4f8f2ff"))   # Res_value ARGB8: #0a0a0a → #f2f8f4


def zgradi_apk():
    bt, okolje = orodja()
    apk = KOREN / "tablica" / "Pralnica-sync.apk"
    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        vir = tmp / "vir.apk"
        shutil.copyfile(apk, vir)
        nepodpisan, poravnan, podpisan = tmp / "nepodpisan.apk", tmp / "poravnan.apk", tmp / "podpisan.apk"
        with zipfile.ZipFile(vir) as zin, zipfile.ZipFile(nepodpisan, "w") as zout:
            imena = set()
            for info in zin.infolist():
                ime = info.filename
                if ime.startswith("META-INF/") and (ime.endswith((".SF", ".RSA", ".DSA", ".EC")) or ime == "META-INF/MANIFEST.MF"):
                    continue   # star podpis
                if ime in APK_ODSTRANI:
                    continue
                podatki = APK_ZAMENJAJ[ime].read_bytes() if ime in APK_ZAMENJAJ else zin.read(ime)
                if ime == "resources.arsc" and podatki.count(IKONA_OZADJE[0]) == 1:
                    podatki = podatki.replace(*IKONA_OZADJE)   # ozadje ikone (color/ic_launcher_background), enkrat
                nov = zipfile.ZipInfo(ime, date_time=info.date_time)
                nov.compress_type = info.compress_type   # resources.arsc mora ostati nestisnjen
                nov.external_attr = info.external_attr
                zout.writestr(nov, podatki)
                imena.add(ime)
            manjka = set(APK_ZAMENJAJ) - imena
            for ime in sorted(manjka):
                zout.writestr(zipfile.ZipInfo(ime, date_time=(2026, 1, 1, 0, 0, 0)), APK_ZAMENJAJ[ime].read_bytes(), compress_type=zipfile.ZIP_DEFLATED)
        subprocess.run([str(bt / "zipalign"), "-p", "-f", "4", str(nepodpisan), str(poravnan)], check=True, env=okolje)
        ks, geslo = podpisni_kljuc(okolje)
        subprocess.run([str(bt / "apksigner"), "sign", "--ks", str(ks), "--ks-key-alias", "pralnica",
                        "--ks-pass", "file:" + str(geslo),   # ključ PKCS12 ima isto geslo kot shramba
                        "--out", str(podpisan), str(poravnan)], check=True, env=okolje)
        pre = subprocess.run([str(bt / "apksigner"), "verify", "--verbose", str(podpisan)], check=True, env=okolje, capture_output=True, text=True)
        print("\n".join(v for v in pre.stdout.splitlines() if v.startswith(("Verifies", "Verified using"))))
        shutil.copyfile(podpisan, apk)
    print("zgrajeno: tablica/Pralnica-sync.apk", f"({apk.stat().st_size / 1048576:.1f} MB)")
    # povezava »Prenesi« v portalu nosi različico (?v=), da brskalnik ne ponudi starega paketa
    pj = KOREN / "portal.js"
    koda = pj.read_text(encoding="utf-8")
    nova = re.sub(r"tablica/Pralnica-sync\.apk\?v=[0-9.]+", "tablica/Pralnica-sync.apk?v=" + VERZIJA, koda)
    nova = re.sub(r"\(različica [0-9.]+\)\.", "(različica " + VERZIJA + ").", nova)
    if nova != koda:
        pj.write_text(nova, encoding="utf-8")
        print("portal.js: povezava na APK →", VERZIJA, "(povečaj še APP_VERZIJA portala)")


if __name__ == "__main__":
    zgradi_splet()
    if "--apk" in sys.argv:
        zgradi_apk()
