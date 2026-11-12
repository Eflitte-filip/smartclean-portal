# Terminal za štemplanje — Raspberry Pi 5 + ACR1252U + DESFire EV3 + LCD 16×2

## Kako deluje

1. Zaposleni prisloni kartico MIFARE DESFire EV3.
2. Kartica se overi z **AES-128** — ključ je izpeljan iz njenega UID.
3. Iz šifrirane datoteke na kartici preberemo **žeton**.
4. Žeton podpišemo s skrivnostjo terminala (HMAC-SHA256) in pošljemo
   Edge funkciji **`punch`**.
5. Strežnik sam ugotovi, ali je prihod ali odhod, zapiše dogodek in vrne ime.
6. LCD izpiše `PRIHOD  07:32` / `Brigita`.

Pregled ur, popravki in PDF so v portalu pod **Prisotnost**.

### Zakaj DESFire in ne navadna kartica

Pri NTAG ali MIFARE Classic bi na kartici ležala skrivnost, ki jo zna vsak
telefon prebrati in prepisati. DESFire se **overi** — dokaže, da ima ključ,
ne da bi ga izdal. Klon z enakim UID odpove, ker ključa nima.

Vsaka kartica ima svoj ključ (NXP AN10922, izpeljan iz UID). Če kdo razbije
eno, ostale niso ogrožene.

---

## 1) Priklop LCD

Štiri žice na 40-pinski konektor: GND→pin 6, SDA→pin 3 (GPIO2),
SCL→pin 5 (GPIO3), VCC→**3,3 V (pin 1)**.

> Backpack ima pull-up upore na VCC. Pri 5 V gresta SDA/SCL na 5 V, Pi pa
> prenese 3,3 V. Zato 3,3 V (LCD je malce medel — popravi s potenciometrom)
> ali vmesni I²C level shifter.

```bash
sudo raspi-config          # Interface Options → I2C → Enable → reboot
i2cdetect -y 1             # naslov, običajno 0x27 ali 0x3F → v LCD_ADDR
```

Če `i2cdetect` ne pokaže ničesar, sta najpogosteje zamenjana SDA/SCL.

---

## 2) Namestitev

Pi naj bo postavljen z **Raspberry Pi OS Lite (64-bit)**, hostname **`raspberrypi`**
(privzeti; če ga spremeniš, popravi ukaze spodaj) in uporabnik **`pi`** —
`stemplj.service` ima poti `/home/pi/…` zapisane trdo. SSH vklopi že v Imagerju,
sicer brez monitorja in tipkovnice do naprave ni poti.

```bash
ssh pi@raspberrypi.local
sudo apt update
# libpcsclite-dev je obvezen — brez njega se pyscard ne prevede (manjka winscard.h)
sudo apt install -y pcscd pcsc-tools libpcsclite-dev python3-pip python3-venv i2c-tools
sudo systemctl enable --now pcscd

python3 -m venv ~/stemplj-venv
~/stemplj-venv/bin/pip install pyscard python-desfire RPLCD smbus2
```

Prek SSH polkit dostop do bralnika zavrne (»SCardEstablishContext: Access
denied«), ker seja SSH ni »lokalna aktivna«. Storitev `stemplj` teče kot root
in tega ne potrebuje; za preizkušanje na daljavo dodaj pravilo:

```bash
sudo tee /etc/polkit-1/rules.d/99-pcscd-pi.rules >/dev/null <<'EOF'
polkit.addRule(function(action, subject) {
  if ((action.id == "org.debian.pcsc-lite.access_pcsc" ||
       action.id == "org.debian.pcsc-lite.access_card") &&
      subject.user == "pi") {
    return polkit.Result.YES;
  }
});
EOF
sudo systemctl restart polkit
```

Preveri bralnik in kartico — nič ne spremeni, ključev ne potrebuje:

```bash
~/stemplj-venv/bin/python preveri_karto.py
```

Izpisati mora proizvajalca, generacijo (EV1/EV2/EV3), pomnilnik in aplikacije
na kartici. To je prvo, kar poženeš, kadar kaj ne dela.

---

## 3) Ključi — enkrat, na TVOJEM računalniku

```bash
python3 vpisi_karto.py --nov-kljucnik
```

Nastaneta dva osnovna ključa:

| ključ | čemu služi | kje sme biti |
|---|---|---|
| `app_master` | vpisovanje in prepis kartic | **samo** tvoj računalnik |
| `read` | branje žetona ob prislonu | Pi in tvoj računalnik |

**Shrani oba v upravitelja gesel.** Brez njiju kartic ni mogoče niti brati niti
vpisovati znova, in ker sta osnova za izpeljavo, se ju ne da obnoviti.

Na Pi prenesi `kljuci.json`, v katerem je **samo `read`**:

```bash
python3 -c "import json;k=json.load(open('kljuci.json'));json.dump({'read':k['read']},open('kljuci-pi.json','w'),indent=2)"
scp kljuci-pi.json pi@raspberrypi.local:~/terminal/kljuci.json
ssh pi@raspberrypi.local 'chmod 600 ~/terminal/kljuci.json'
```

Tako tat Pi-ja kartic ne more prepisovati.

---

## 4) Terminal v bazi

Zaženi `baza/54_terminal_pralnica.sql` v Supabase → SQL Editor. Izpiše
skrivnost terminala. Na Pi:

```bash
echo '{"secret":"<skrivnost iz izpisa>"}' > ~/terminal/terminal.json
chmod 600 ~/terminal/terminal.json
```

---

## 5) Vpis kartic

### S C72 (brez računalnika in brez Pi-ja)

Na C72 se prijavi kot skrbnik → meni osebe → **Kartica zaposlenega** → izberi osebo (ali
**Nov zaposleni**) → prisloni kartico na hrbet naprave. Kartica je vpisana, prebrana nazaj in
dodeljena; Pi je takoj sprejme.

Kako: funkcija `kartica` (Supabase) iz osnovnih ključev in UID izpelje ključa TE kartice in izda
žeton; C72 (aplikacija 1.8+, `aplikacija-rfid/.../Kartica.java`) kartico vpiše enako kot
`vpisi_karto.py` in jo prebere z bralnim ključem kot terminal. Osnovna ključa sta v skrivnostih
funkcije (`KARTICA_APP_MASTER`, `KARTICA_READ` — vrednosti iz `kljuci.json`), na C72 nista nikoli.

Enkratna nastavitev: objavi `supabase/functions/kartica` (Verify JWT vklopljen) in vpiši obe
skrivnosti. Preizkus brez kartice: `smartclean-preizkus/kartica` (simulator DESFire, preverjen s
knjižnico python-desfire; vsako kartico, ki jo vpiše C72, prebere koda terminala).

### Z računalnikom in bralnikom

Na svojem računalniku, z bralnikom priklopljenim nanj:

```bash
python3 vpisi_karto.py --ime "Brigita Kaker"
```

Za **več kartic zapored** je udobneje:

```bash
~/sc-kartice-venv/bin/python vpisi_vec.py
```

Vpišeš ime z nalepke, prisloniš kartico, žeton gre v odložišče (nikjer se ne
izpiše), ti pa ga v portalu prilepiš pri tej osebi: **Prisotnost → Dodeli
kartico → ⌘V → Shrani**. Skripta po prvi kartici čaka samo na novo prisloljeno
kartico in vpraša, preden prepiše že vpisano — tako ne moreš po nesreči
razveljaviti kartice, ki že dela. Ime, UID in čas zapiše v `vpisane_kartice.csv`
(ni v repozitoriju), da pozneje veš, čigava je katera fizična kartica.

Posamezna kartica: `vpisi_karto.py` izpiše žeton in SQL. Ostalo:

```bash
python3 vpisi_karto.py --preberi     # kaj je na tej kartici?
python3 vpisi_karto.py --ponovno     # kartica je že naša, vpiši na novo
python3 vpisi_karto.py --pocisti     # pobriši SmartClean s kartice
```

Glavni ključ kartice **ostane tovarniški**, zato je kartico vedno mogoče
počistiti in vpisati znova — nepopravljivo je ni mogoče pokvariti.

---

## 6) Zagon

```bash
python3 stemplj.py --preizkus    # brez LCD, izpis na zaslon
python3 stemplj.py --preberi     # prisloni karto in pokaži žeton
python3 stemplj.py               # normalno
```

Kot storitev (v `stemplj.service` popravi poti, če uporabnik ni `pi`):

```bash
sudo cp stemplj.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now stemplj
journalctl -u stemplj -f
```

---

## Lučka in pisk

Rdeča lučka v mirovanju; ob zabeleženem žigu zelena in en daljši pisk — znak, da
lahko kartico umakneš. Ob »že vpisan« ali napaki ostane rdeča, brez piska.

To so ukazi bralniku (escape), ki jih gonilnik CCID privzeto blokira. Enkrat:

```bash
sudo cp -n /etc/libccid_Info.plist /etc/libccid_Info.plist.izvirnik
sudo sed -i "/ifdDriverOptions/{n;s/0x0000/0x0001/}" /etc/libccid_Info.plist
sudo systemctl restart pcscd
```

Terminal ob zagonu izklopi samodejne signale bralnika (privzeto ob vsaki
kartici sam zapiska — z našim bi bila dva) in to preverja vsako minuto, ker se
bralnik lahko pojavi šele po storitvi ali ga kdo prevtakne. Če ukazi ne
delajo, štemplanje teče naprej brez lučke in piska.

## Ura

Pi 5 brez baterije za RTC ob izklopu izgubi čas in ob vklopu nadaljuje od
zadnjega shranjenega, dokler ga NTP ne popravi. Zato terminal z mrežo svojega
časa ne pošilja — velja strežnikov. Brez mreže in z neusklajeno uro si zapomni
monotoni čas prislona in pravi čas izračuna, ko se ura uskladi. Z baterijo za
RTC (uradna, ~5 €) je ura prava že ob vklopu.

## Brez povezave

Žig se shrani v `stemplj_vrsta.jsonl` **s časom prislona** in se pošlje, ko je
mreža spet na voljo. Zapis je atomaren (temp + rename + fsync), zato preživi
izpad elektrike sredi pisanja.

Čas je **del podpisa HMAC**, zato ga strežnik sprejme kot verodostojnega —
brez skrivnosti terminala ga ni mogoče ponarediti. Sprejme ga do 14 dni nazaj
in največ 5 minut v prihodnost.

`nonce` gre skozi vrsto nespremenjen: če je zahteva prišla skozi, odgovor pa se
je izgubil, strežnik drugi poskus prepozna kot podvojen in ur ne šteje dvakrat.

---

## Kaj v resnici ščiti kaj

| Grožnja | Kaj jo ustavi |
|---|---|
| Klon kartice s prebranim UID | AES overitev — klon nima ključa |
| Branje žetona z drugim bralnikom | datoteka je berljiva šele po overitvi |
| Razbita ena kartica | ključi so izpeljani — ostale niso ogrožene |
| Ponovitev prestreženega zahtevka | `nonce` + varovalka 60 s |
| Ponarejen čas žiga | čas je del podpisa |
| Klic `punch` z interneta | brez skrivnosti terminala podpis ne bo pravi |

Kar **ni** ustavljeno: kolega, ki prinese tujo kartico in z njo štempla. To je
organizacijsko vprašanje, ne tehnično.

---

## Ko terminal deluje

Stara pot `terminal_stamp` je odveč; migracija `52_zapri_anon_rpc.sql` jo je že
zaprla. Smiselno je pobrisati še deset pravil `device_*`, ki se sklicujejo na
`profiles.is_device`, česar nihče ne nastavlja.

---

## Če kaj ne dela

| Znak | Kje pogledati |
|---|---|
| `pcsc_scan` ne vidi kartice | `sudo systemctl status pcscd`, drug USB priključek |
| `To ni SmartClean kartica` | kartica ni vpisana → `vpisi_karto.py` |
| `Kartica se ni overila` | napačen `read` ključ ali kartica z drugega ključnika |
| `Napacen podpis` | `terminal.json` se ne ujema z `att_terminals.secret` |
| `Terminal ni vpisan` | `TERMINAL_SLUG` se ne ujema z `att_terminals.slug` |
| `Kartica ni vpisana` | `employees.card_token` ni nastavljen na ta žeton |
| `Prihod ze vpisan` / `Odhod ze vpisan` | ista kartica je bila prislonjena pred manj kot 60 s — prvi žig JE zabeležen |
| kartica leži na bralniku, nič se ne zgodi | namenoma: kartico je treba odmakniti, preden se znova prebere |
| LCD prazen | `i2cdetect -y 1`, `LCD_ADDR`, kontrast, 3,3 V |

**Šumniki:** HD44780 nima č/š/ž — skripta jih pretvori v c/s/z (»Špela« → »Spela«).
**Dolga imena:** LCD ima 16 znakov na vrstico, daljša se odrežejo.
