#!/usr/bin/env python3
"""Zgradi aplikacijo SmartClean RFID (Android) brez Android Studia in Gradla.

Aplikacija odpre aplikacijo za zaposlene (portal.smartclean.si/rfid/) in ji da neposreden dostop do čitalca Chainway
(vgrajen v C72, R1 prek USB, UR4 prek omrežja) — glej java/si/smartclean/rfid/.

Uporaba (iz korena repozitorija):
  python3 aplikacija-rfid/zgradi.py              objava: rfid/SmartClean-RFID.apk (portal.smartclean.si)
  python3 aplikacija-rfid/zgradi.py --preizkus   preizkus: aplikacija-rfid/preizkus.apk (lokalni portal, localhost:8830)

Potrebno: Android SDK (build-tools z aapt2/d8/zipalign/apksigner, platforms/android-*), JDK (Homebrew openjdk)
in knjižnica Chainway v aplikacija-rfid/lib/DeviceAPI_*.aar (chainway.net → Support → C72 → SDKs; ni v gitu).
Podpis: isti ključ kot aplikacija za tablico (aplikacija/podpis/, ni v gitu).
Različica je spodaj (VERZIJA, KODA) — ob vsaki objavi ju povečaj.
"""
import pathlib
import re
import shutil
import subprocess
import sys
import zipfile

VERZIJA = "1.9"
KODA = 10

KOREN = pathlib.Path(__file__).resolve().parent.parent
IZVOR = KOREN / "aplikacija-rfid"
GRADNJA = IZVOR / "gradnja"
PODPIS = KOREN / "aplikacija" / "podpis"
SDK = pathlib.Path.home() / "Library/Android/sdk"
ABI = ("arm64-v8a", "armeabi-v7a")   # C72 in tablice; stari »armeabi« ne


def zadnji(mapa, pogoj):
    v = sorted((p for p in mapa.iterdir() if pogoj(p)), key=lambda p: [int(x) for x in re.findall(r"\d+", p.name)])
    if not v:
        sys.exit("manjka: " + str(mapa))
    return v[-1]


def zazeni(*ukaz, **kw):
    subprocess.run([str(x) for x in ukaz], check=True, **kw)


def main():
    preizkus = "--preizkus" in sys.argv
    bt = zadnji(SDK / "build-tools", lambda p: (p / "aapt2").exists() and (p / "d8").exists())
    android_jar = zadnji(SDK / "platforms", lambda p: (p / "android.jar").exists()) / "android.jar"
    jdk = next((pathlib.Path(p) for p in ("/opt/homebrew/opt/openjdk", "/usr/local/opt/openjdk") if pathlib.Path(p, "bin/javac").exists()), None)
    if not jdk:
        sys.exit("ni JDK (brew install openjdk)")
    aar = sorted((IZVOR / "lib").glob("DeviceAPI_*.aar"))
    if not aar:
        sys.exit("ni knjižnice Chainway: aplikacija-rfid/lib/DeviceAPI_*.aar")
    okolje = {"JAVA_HOME": str(jdk), "PATH": f"{jdk}/bin:/usr/bin:/bin"}

    if GRADNJA.exists():
        shutil.rmtree(GRADNJA)
    for m in ("aar", "gen", "razredi", "dex", "res"):
        (GRADNJA / m).mkdir(parents=True)
    with zipfile.ZipFile(aar[-1]) as z:
        z.extractall(GRADNJA / "aar")

    # nastavitve gradnje (naslov portala, ki ga sme aplikacija odpreti in mu dati čitalec)
    if preizkus:
        shema, gostitelj, vrata, portal = "http", "localhost", 8830, "http://localhost:8830/rfid/"
    else:
        shema, gostitelj, vrata, portal = "https", "portal.smartclean.si", -1, "https://portal.smartclean.si/rfid/"
    paket = GRADNJA / "gen/si/smartclean/rfid"
    paket.mkdir(parents=True)
    (paket / "Nastavitve.java").write_text(
        "package si.smartclean.rfid;\n/** ZGRAJENO z aplikacija-rfid/zgradi.py — ne urejaj ročno. */\nfinal class Nastavitve {\n"
        f'    static final String VERZIJA = "{VERZIJA}{"-preizkus" if preizkus else ""}";\n'
        f'    static final String SHEMA = "{shema}";\n    static final String GOSTITELJ = "{gostitelj}";\n'
        f"    static final int VRATA = {vrata};\n"
        f"    static final boolean PREIZKUS = {'true' if preizkus else 'false'};\n"
        f'    static final String PORTAL = "{portal}";\n    static final String POT = "/rfid/";\n    private Nastavitve() {{ }}\n}}\n', encoding="utf-8")
    manifest = (IZVOR / "AndroidManifest.xml").read_text(encoding="utf-8")
    if preizkus:   # lokalni portal je http (samo na emulatorju / z adb reverse)
        manifest = manifest.replace('android:extractNativeLibs="true"', 'android:extractNativeLibs="true"\n        android:usesCleartextTraffic="true"')
    (GRADNJA / "AndroidManifest.xml").write_text(manifest, encoding="utf-8")

    # 1. viri → resources.arsc + R.java
    zazeni(bt / "aapt2", "compile", "--dir", IZVOR / "res", "-o", GRADNJA / "res/viri.zip")
    osnova = GRADNJA / "osnova.apk"
    zazeni(bt / "aapt2", "link", "-o", osnova, "-I", android_jar, "--manifest", GRADNJA / "AndroidManifest.xml",
           "--java", GRADNJA / "gen", "--min-sdk-version", "26", "--target-sdk-version", "34",
           "--version-code", str(KODA), "--version-name", VERZIJA + ("-preizkus" if preizkus else ""), "--replace-version",   # sicer obvelja različica iz AndroidManifest.xml
           "--rename-manifest-package", "si.smartclean.rfid" + (".preizkus" if preizkus else ""),
           "-A", IZVOR / "assets", "--auto-add-overlay", GRADNJA / "res/viri.zip")
    # 2. Java → razredi → dex (lambde razgradi d8)
    viri = [str(p) for p in (IZVOR / "java").rglob("*.java")] + [str(p) for p in (GRADNJA / "gen").rglob("*.java")]
    classes_jar = GRADNJA / "aar/classes.jar"
    zazeni(jdk / "bin/javac", "--release", "11", "-encoding", "UTF-8", "-Xlint:-options", "-nowarn",
           "-classpath", f"{android_jar}:{classes_jar}", "-d", GRADNJA / "razredi", *viri, env=okolje)
    razredi = [str(p) for p in (GRADNJA / "razredi").rglob("*.class")]
    zazeni(bt / "d8", "--release", "--min-api", "26", "--lib", android_jar, "--output", GRADNJA / "dex",
           *razredi, classes_jar, env=okolje)
    # 3. paket: viri + dex + domače knjižnice čitalca
    nepodpisan = GRADNJA / "nepodpisan.apk"
    shutil.copyfile(osnova, nepodpisan)
    with zipfile.ZipFile(nepodpisan, "a", zipfile.ZIP_DEFLATED) as z:
        for d in sorted((GRADNJA / "dex").glob("classes*.dex")):
            z.write(d, d.name)
        for abi in ABI:
            for so in sorted((GRADNJA / "aar/jni" / abi).glob("*.so")):
                z.write(so, f"lib/{abi}/{so.name}")
    poravnan = GRADNJA / "poravnan.apk"
    zazeni(bt / "zipalign", "-p", "-f", "4", nepodpisan, poravnan)
    # 4. podpis (isti ključ kot tablica)
    ks, geslo = PODPIS / "pralnica.jks", PODPIS / "geslo.txt"
    if not ks.exists():
        sys.exit("ni podpisnega ključa: aplikacija/podpis/pralnica.jks")
    cilj = IZVOR / "preizkus.apk" if preizkus else KOREN / "rfid" / "SmartClean-RFID.apk"
    cilj.parent.mkdir(exist_ok=True)
    zazeni(bt / "apksigner", "sign", "--ks", ks, "--ks-key-alias", "pralnica", "--ks-pass", "file:" + str(geslo), "--v4-signing-enabled", "false",
           "--out", cilj, poravnan, env=okolje)
    zazeni(bt / "apksigner", "verify", cilj, env=okolje)
    print("zgrajeno:", cilj.relative_to(KOREN), f"({cilj.stat().st_size / 1048576:.1f} MB)")


if __name__ == "__main__":
    main()
