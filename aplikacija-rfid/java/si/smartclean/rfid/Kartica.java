package si.smartclean.rfid;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.zip.CRC32;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Kartica zaposlenega (MIFARE DESFire EV3) — vpis prek NFC na C72, enako kot terminal/sc_kartica.py na računalniku.
 *
 * Razporeditev na kartici (mora biti natanko taka, sicer je Raspberry Pi ne prebere):
 *   aplikacija 5C0001, AES, ključa 0 in 1, nastavitve 0x0B
 *     ključ 0 = glavni ključ aplikacije (izpeljan iz app_master in UID — izpelje ga strežnik)
 *     ključ 1 = bralni ključ             (izpeljan iz read in UID — izpelje ga strežnik)
 *     datoteka 1: 16 B, šifrirana, branje s ključem 1, pisanje s ključem 0 = žeton (card_token)
 * Glavni ključ kartice (PICC) ostane tovarniški (DES 00…00), da jo je vedno mogoče vpisati znova.
 *
 * Na napravo pridejo le ključi TE kartice, osnovna ključa ostaneta na strežniku (funkcija »kartica«).
 * Varno sporočanje DESFire EV1 (overitev ISO 0x1A z DES ključem kartice, AES 0xAA v aplikaciji):
 * po overitvi obe strani verižita IV — CMAC vsakega navadnega ukaza, šifrirani deli s CBC.
 * Preizkus: smartclean-preizkus/kartica (simulator, preverjen s knjižnico python-desfire, s katero bere Pi).
 */
final class Kartica {
    interface Prenos { byte[] poslji(byte[] apdu) throws IOException; }

    static final class Napaka extends Exception {
        final int status;
        Napaka(String sporocilo) { this(sporocilo, -1); }
        Napaka(String sporocilo, int status) { super(sporocilo); this.status = status; }
    }

    static final byte[] APP = {0x5C, 0x00, 0x01};
    static final byte[] PICC = {0x00, 0x00, 0x00};
    static final int DATOTEKA = 0x01, ZETON = 16;
    private static final int OK = 0x00, AF = 0xAF;
    private static final int ST_PODVOJENO = 0xDE;

    private final Prenos prenos;
    private final SecureRandom nakljucno = new SecureRandom();
    private Seja seja;   // null = ni overitve
    private int overjenKljuc = -1;

    Kartica(Prenos prenos) { this.prenos = prenos; }

    // ══════════ javni koraki ══════════

    /** Ali je na kartici že aplikacija SmartClean (brez overitve). */
    boolean imaAplikacijo() throws IOException, Napaka {
        izberi(PICC);
        byte[] aids = navaden(new byte[]{0x6A});
        for (int i = 0; i + 3 <= aids.length; i += 3) {
            if (aids[i] == APP[0] && aids[i + 1] == APP[1] && aids[i + 2] == APP[2]) return true;
        }
        return false;
    }

    /** Vpiše kartico; po vpisu žeton prebere nazaj z bralnim ključem (tako kot Pi). */
    void vpisi(byte[] glavni, byte[] bralni, byte[] zeton, boolean ponovno) throws IOException, Napaka {
        if (glavni.length != 16 || bralni.length != 16 || zeton.length != ZETON) throw new Napaka("Napačni podatki za vpis.");
        // 1) glavni ključ kartice je tovarniški DES 00…00
        izberi(PICC);
        byte[] nast = navaden(new byte[]{0x45});
        if (nast.length < 2 || (nast[1] & 0xC0) != 0) throw new Napaka("Kartica ni tovarniška (glavni ključ kartice je spremenjen).");
        try {
            overi(0x1A, 0, new byte[8], false);
        } catch (Napaka e) {
            throw new Napaka("Overitev s tovarniškim ključem ni uspela — kartica ni prazna DESFire.");
        }
        if (ponovno) {
            byte[] aids = navaden(new byte[]{0x6A});
            for (int i = 0; i + 3 <= aids.length; i += 3) {
                if (aids[i] == APP[0] && aids[i + 1] == APP[1] && aids[i + 2] == APP[2]) {
                    navaden(new byte[]{(byte) 0xDA, APP[0], APP[1], APP[2]});
                    break;
                }
            }
        }
        // 2) privzeti ključ novih aplikacij: AES 00…00 (24 B), različica 0
        byte[] sc = new byte[2 + 24 + 1];
        sc[0] = 0x5C; sc[1] = 0x01;
        sifriran(sc, 2, true, false);
        // 3) aplikacija z dvema AES ključema, nastavitve 0x0B (glavni ključ menja ključe, seznam brez glavnega ključa)
        try {
            navaden(new byte[]{(byte) 0xCA, APP[0], APP[1], APP[2], 0x0B, (byte) 0x82});
        } catch (Napaka e) {
            if (e.status == ST_PODVOJENO) throw new Napaka("Kartica je že vpisana.", e.status);
            throw e;
        }
        izberi(APP);
        overi(0xAA, 0, new byte[16], true);
        // 4) ključ 0 → glavni ključ te kartice (isti ključ, s katerim smo overjeni: seja se konča)
        zamenjajKljuc(0, new byte[16], glavni);
        overi(0xAA, 0, glavni, true);
        // 5) ključ 1 → bralni ključ te kartice
        zamenjajKljuc(1, new byte[16], bralni);
        // 6) šifrirana datoteka z žetonom: branje ključ 1, pisanje ključ 0
        navaden(new byte[]{(byte) 0xCD, DATOTEKA, 0x03, 0x00, 0x10, ZETON, 0x00, 0x00});
        byte[] w = new byte[8 + ZETON];
        w[0] = 0x3D; w[1] = DATOTEKA; w[5] = ZETON;
        System.arraycopy(zeton, 0, w, 8, ZETON);
        sifriran(w, 8, true, false);
        // 7) preverba: tako kot terminal — overitev z bralnim ključem in branje
        if (!Arrays.equals(preberi(bralni), zeton)) throw new Napaka("Zapis na kartico ni bil pravilen — poskusi znova.");
    }

    /** Žeton z bralnim ključem (aplikacija mora obstajati). */
    byte[] preberi(byte[] bralni) throws IOException, Napaka {
        izberi(APP);
        overi(0xAA, 1, bralni, true);
        byte[] c = navaden(new byte[]{(byte) 0xBD, DATOTEKA, 0, 0, 0, ZETON, 0, 0}, false);   // odgovor je šifriran
        if (c.length == 0 || c.length % 16 != 0) throw new Napaka("Kartica je vrnila nepričakovan odgovor.");
        byte[] p = seja.desifriraj(c);
        byte[] podatki = Arrays.copyOf(p, ZETON);
        byte[] crc = Arrays.copyOfRange(p, ZETON, ZETON + 4);
        if (!Arrays.equals(crc, crc32(cat(podatki, new byte[]{OK})))) throw new Napaka("Žeton na kartici je poškodovan.");
        return podatki;
    }

    /**
     * Ali bo terminal (python-desfire) ta žeton prebral: knjižnica pred preverbo CRC odreže ničle na koncu,
     * zato odpove, če je zadnji bajt CRC 0x00 (1 od 256). Takega žetona ne vpišemo.
     */
    static boolean zetonBerljiv(byte[] zeton) {
        byte[] crc = crc32(cat(zeton, new byte[]{OK}));
        return crc[3] != 0;
    }

    // ══════════ ukazi ══════════

    private void izberi(byte[] aid) throws IOException, Napaka {
        oddaj(new byte[]{0x5A, aid[0], aid[1], aid[2]});   // izbira konča overitev, odgovor ni zaščiten
        seja = null; overjenKljuc = -1;
    }

    /** Navaden ukaz: v seji CMAC ukaza (IV) in preverba CMAC odgovora. */
    private byte[] navaden(byte[] ukaz) throws IOException, Napaka { return navaden(ukaz, true); }

    private byte[] navaden(byte[] ukaz, boolean cmacOdgovor) throws IOException, Napaka {
        if (seja != null) seja.cmac(ukaz);
        byte[] odg = oddaj(ukaz);
        if (seja == null || !cmacOdgovor) return odg;
        return preveriCmac(odg);
    }

    /** Šifriran ukaz: CRC32 čez ukaz in glavo (razen pri ChangeKey, kjer ga sestavi klicatelj), ničle do bloka. */
    private void sifriran(byte[] ukaz, int odmik, boolean dodajCrc, boolean brezOdgovora) throws IOException, Napaka {
        if (seja == null) throw new Napaka("Ni overitve.");
        byte[] d = dodajCrc ? cat(ukaz, crc32(ukaz)) : ukaz;
        int dolz = d.length - odmik, bs = seja.bs;
        int dop = (bs - dolz % bs) % bs;
        byte[] odprto = Arrays.copyOfRange(d, odmik, d.length + dop);   // ničle
        byte[] c = seja.sifriraj(odprto);
        byte[] okvir = cat(Arrays.copyOf(d, odmik), c);
        byte[] odg = oddaj(okvir);
        if (brezOdgovora) { seja = null; overjenKljuc = -1; return; }
        preveriCmac(odg);
    }

    private void zamenjajKljuc(int st, byte[] trenutni, byte[] nov) throws IOException, Napaka {
        boolean isti = st == overjenKljuc;
        byte[] d = new byte[]{(byte) 0xC4, (byte) st};
        byte[] kljuc = isti ? nov : xor(nov, trenutni);
        d = cat(d, kljuc);
        d = cat(d, new byte[]{0x01});            // različica ključa (kot vpisi_karto: 0x01)
        d = cat(d, crc32(d));
        if (!isti) d = cat(d, crc32(nov));
        sifriran(d, 2, false, isti);
    }

    private void overi(int ukaz, int st, byte[] kljuc, boolean aes) throws IOException, Napaka {
        seja = null; overjenKljuc = -1;
        int bs = aes ? 16 : 8;
        byte[] ek = oddajAf(new byte[]{(byte) ukaz, (byte) st});
        if (ek.length != bs) throw new Napaka("Kartica zahteva drugačen ključ.");
        byte[] rndB = Seja.cbc(aes, kljuc, new byte[bs], ek, false);
        byte[] rndA = new byte[bs];
        nakljucno.nextBytes(rndA);
        byte[] ab = cat(rndA, rot(rndB));
        byte[] abEnc = Seja.cbc(aes, kljuc, ek, ab, true);
        byte[] aEnc;
        try {
            aEnc = oddaj(cat(new byte[]{(byte) AF}, abEnc));
        } catch (Napaka e) {
            throw new Napaka("Kartica se ni overila.", e.status);
        }
        byte[] aRot = Seja.cbc(aes, kljuc, Arrays.copyOfRange(abEnc, abEnc.length - bs, abEnc.length), aEnc, false);
        if (!Arrays.equals(rot(rndA), aRot)) throw new Napaka("Kartica se ni overila.");
        byte[] sk;
        if (aes) {
            sk = cat(cat(Arrays.copyOf(rndA, 4), Arrays.copyOf(rndB, 4)), cat(Arrays.copyOfRange(rndA, 12, 16), Arrays.copyOfRange(rndB, 12, 16)));
        } else {
            sk = cat(Arrays.copyOf(rndA, 4), Arrays.copyOf(rndB, 4));
            for (int i = 0; i < sk.length; i++) sk[i] &= (byte) 0xFE;
        }
        seja = new Seja(aes, sk);
        overjenKljuc = st;
    }

    private byte[] preveriCmac(byte[] odg) throws Napaka {
        if (odg.length < 8) throw new Napaka("Kartica ni potrdila ukaza.");
        byte[] podatki = Arrays.copyOf(odg, odg.length - 8);
        byte[] mac = Arrays.copyOf(seja.cmac(cat(podatki, new byte[]{OK})), 8);
        if (!Arrays.equals(mac, Arrays.copyOfRange(odg, odg.length - 8, odg.length))) throw new Napaka("Odgovor kartice ni pristen.");
        return podatki;
    }

    // ══════════ okvir ISO 7816: 90 CMD 00 00 [Lc podatki] 00 → podatki 91 ST ══════════

    /** Pošlje in vrne podatke; 0xAF (še sledi) zbere skupaj, vsaka druga napaka je izjema. */
    private byte[] oddaj(byte[] ukaz) throws IOException, Napaka {
        byte[] vse = new byte[0];
        byte[] u = ukaz;
        while (true) {
            byte[] odg = surovo(u);
            int st = odg[odg.length - 1] & 0xFF;
            vse = cat(vse, Arrays.copyOf(odg, odg.length - 2));
            if (st == OK) return vse;
            if (st != AF) { seja = null; overjenKljuc = -1; throw new Napaka(napakaBesedilo(st), st); }
            u = new byte[]{(byte) AF};
        }
    }

    /** Prvi korak overitve: 0xAF je pričakovan odgovor. */
    private byte[] oddajAf(byte[] ukaz) throws IOException, Napaka {
        byte[] odg = surovo(ukaz);
        int st = odg[odg.length - 1] & 0xFF;
        if (st != AF) throw new Napaka(st == 0x40 ? "Ključa na kartici ni." : "Kartica se ni overila.", st);
        return Arrays.copyOf(odg, odg.length - 2);
    }

    private byte[] surovo(byte[] ukaz) throws IOException, Napaka {
        byte[] apdu;
        if (ukaz.length == 1) apdu = new byte[]{(byte) 0x90, ukaz[0], 0, 0, 0};
        else {
            int lc = ukaz.length - 1;
            if (lc > 255) throw new Napaka("Ukaz je predolg.");
            apdu = new byte[5 + lc + 1];
            apdu[0] = (byte) 0x90; apdu[1] = ukaz[0]; apdu[4] = (byte) lc;
            System.arraycopy(ukaz, 1, apdu, 5, lc);
        }
        byte[] odg = prenos.poslji(apdu);
        if (odg == null || odg.length < 2 || (odg[odg.length - 2] & 0xFF) != 0x91) throw new Napaka("Kartica ni DESFire ali je bila odmaknjena.");
        return odg;
    }

    private static String napakaBesedilo(int st) {
        switch (st) {
            case 0xAE: return "Kartica se ni overila.";
            case 0x9D: return "Kartica ukaza ni dovolila.";
            case 0xA0: return "Na kartici ni aplikacije SmartClean.";
            case 0xDE: return "Na kartici to že obstaja.";
            case 0x1E: return "Kartica je zavrnila podatke (integriteta).";
            case 0x0E: return "Na kartici ni dovolj prostora.";
            default: return String.format("Kartica je vrnila napako 0x%02X.", st);
        }
    }

    // ══════════ kriptografija ══════════

    static final class Seja {
        final boolean aes;
        final int bs;
        final byte[] kljuc, k1, k2;
        byte[] iv;

        Seja(boolean aes, byte[] kljuc) throws Napaka {
            this.aes = aes; this.kljuc = kljuc; this.bs = aes ? 16 : 8;
            iv = new byte[bs];
            byte[] l = cbc(aes, kljuc, new byte[bs], new byte[bs], true);
            int rb = aes ? 0x87 : 0x1B;
            k1 = zamik(l, rb);
            k2 = zamik(k1, rb);
        }

        byte[] cmac(byte[] data) throws Napaka {
            byte[] d;
            byte[] k;
            if (data.length == 0 || data.length % bs != 0) {
                d = Arrays.copyOf(data, data.length + (bs - data.length % bs));
                d[data.length] = (byte) 0x80;
                k = k2;
            } else {
                d = data.clone();
                k = k1;
            }
            for (int i = 0; i < bs; i++) d[d.length - bs + i] ^= k[i];
            byte[] c = cbc(aes, kljuc, iv, d, true);
            iv = Arrays.copyOfRange(c, c.length - bs, c.length);
            return iv.clone();
        }

        byte[] sifriraj(byte[] p) throws Napaka {
            byte[] c = cbc(aes, kljuc, iv, p, true);
            iv = Arrays.copyOfRange(c, c.length - bs, c.length);
            return c;
        }

        byte[] desifriraj(byte[] c) throws Napaka {
            byte[] p = cbc(aes, kljuc, iv, c, false);
            iv = Arrays.copyOfRange(c, c.length - bs, c.length);
            return p;
        }

        static byte[] cbc(boolean aes, byte[] kljuc, byte[] iv, byte[] d, boolean sifriraj) throws Napaka {
            try {
                // DES kot 3DES s trikrat istim ključem (enak izid): navaden DES na novejšem Androidu ni zagotovljen
                byte[] k = aes ? kljuc : (kljuc.length == 8 ? cat(cat(kljuc, kljuc), kljuc) : cat(kljuc, Arrays.copyOf(kljuc, 8)));
                Cipher c = Cipher.getInstance(aes ? "AES/CBC/NoPadding" : "DESede/CBC/NoPadding");
                c.init(sifriraj ? Cipher.ENCRYPT_MODE : Cipher.DECRYPT_MODE, new SecretKeySpec(k, aes ? "AES" : "DESede"), new IvParameterSpec(iv));
                return c.doFinal(d);
            } catch (GeneralSecurityException e) {
                throw new Napaka("Šifriranje ni na voljo: " + e.getMessage());
            }
        }

        private static byte[] zamik(byte[] b, int rb) {
            byte[] r = new byte[b.length];
            for (int i = 0; i < b.length; i++) {
                r[i] = (byte) ((b[i] << 1) | (i + 1 < b.length ? (b[i + 1] & 0xFF) >>> 7 : 0));
            }
            if ((b[0] & 0x80) != 0) r[r.length - 1] ^= (byte) rb;
            return r;
        }
    }

    /** JAMCRC (DESFire): ~CRC32, little endian. */
    static byte[] crc32(byte[] d) {
        CRC32 c = new CRC32();
        c.update(d);
        long v = (~c.getValue()) & 0xFFFFFFFFL;
        return new byte[]{(byte) v, (byte) (v >>> 8), (byte) (v >>> 16), (byte) (v >>> 24)};
    }

    private static byte[] rot(byte[] b) {
        byte[] r = new byte[b.length];
        System.arraycopy(b, 1, r, 0, b.length - 1);
        r[b.length - 1] = b[0];
        return r;
    }

    private static byte[] xor(byte[] a, byte[] b) {
        byte[] r = new byte[a.length];
        for (int i = 0; i < a.length; i++) r[i] = (byte) (a[i] ^ b[i]);
        return r;
    }

    static byte[] cat(byte[] a, byte[] b) {
        byte[] r = Arrays.copyOf(a, a.length + b.length);
        System.arraycopy(b, 0, r, a.length, b.length);
        return r;
    }
}
