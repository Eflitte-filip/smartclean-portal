package si.smartclean.rfid;

import android.app.Activity;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.tech.IsoDep;
import android.os.Bundle;
import android.util.Log;

import org.json.JSONObject;

import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * NFC na C72 za kartice zaposlenih (DESFire): stran vklopi branje, prislonjena kartica ostane povezana,
 * dokler je ne vpišemo ali odmaknemo. Dogodki gredo v stran kot »scrfid« s tip = "kartica":
 *   { stanje: "najdena", uid, nasa }      kartica je prislonjena (nasa = na njej je že aplikacija SmartClean)
 *   { stanje: "vpisana", uid }             vpis in preverba uspela
 *   { stanje: "napaka", uid, sporocilo, odmaknjena }
 *   { stanje: "ni-desfire" }               prislonjena kartica ni DESFire (npr. bančna ali NTAG)
 * Ukazi kartici tečejo v eni niti, nikoli dva hkrati.
 */
final class Nfc implements NfcAdapter.ReaderCallback {
    /** Zvok izida predvaja stran (upošteva nastavitev zvoka v aplikaciji). */
    interface Poslusalec {
        void dogodek(String json);
    }

    private final Activity aktivnost;
    private final Poslusalec poslusalec;
    private final NfcAdapter adapter;
    private final ExecutorService nit = Executors.newSingleThreadExecutor();
    private boolean zeli;        // stran je vklopila branje
    private boolean bere;        // način branja je dejansko vklopljen (le v ospredju)
    private volatile IsoDep kartica;
    private volatile String uid = "";

    Nfc(Activity aktivnost, Poslusalec poslusalec) {
        this.aktivnost = aktivnost;
        this.poslusalec = poslusalec;
        NfcAdapter a = null;
        try { a = NfcAdapter.getDefaultAdapter(aktivnost); } catch (Exception ignored) { }
        adapter = a;
    }

    String stanjeJson() {
        try {
            return new JSONObject().put("naVoljo", adapter != null).put("vklopljen", adapter != null && adapter.isEnabled()).put("bere", bere).toString();
        } catch (Exception e) { return "{}"; }
    }

    /** Na UI niti. */
    void zacni() { zeli = true; vklopi(); }
    void ustavi() { zeli = false; izklopi(); zapriKartico(); }
    void nadaljuj() { if (zeli) vklopi(); }      // onResume
    void premor() { izklopi(); }                 // onPause: način branja deluje le v ospredju
    void konec() { ustavi(); nit.shutdownNow(); }

    private void vklopi() {
        if (adapter == null || bere || !adapter.isEnabled()) return;
        Bundle b = new Bundle();
        b.putInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, 1000);
        try {
            adapter.enableReaderMode(aktivnost, this,
                    NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK | NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS, b);
            bere = true;
        } catch (Exception e) { Log.w("SmartCleanRFID", "nfc", e); }
    }

    private void izklopi() {
        if (adapter == null || !bere) return;
        try { adapter.disableReaderMode(aktivnost); } catch (Exception ignored) { }
        bere = false;
    }

    private void zapriKartico() {
        IsoDep k = kartica;
        kartica = null;
        if (k != null) nit.execute(() -> { try { k.close(); } catch (Exception ignored) { } });
    }

    @Override
    public void onTagDiscovered(Tag tag) {
        IsoDep d = IsoDep.get(tag);
        if (d == null) { javi("ni-desfire"); return; }
        nit.execute(() -> {
            IsoDep stara = kartica;
            if (stara != null && stara != d) { try { stara.close(); } catch (Exception ignored) { } }
            String id = hex(tag.getId());
            try {
                d.connect();
                d.setTimeout(3000);
                boolean nasa = new Kartica(d::transceive).imaAplikacijo();
                kartica = d;
                uid = id;
                javi("najdena", "uid", id, "nasa", nasa);
            } catch (Kartica.Napaka e) {
                try { d.close(); } catch (Exception ignored) { }
                javi("ni-desfire");
            } catch (Exception e) {
                try { d.close(); } catch (Exception ignored) { }
                javi("napaka", "uid", id, "sporocilo", "Kartica je bila odmaknjena.", "odmaknjena", true);
            }
        });
    }

    /** { uid, glavni, bralni, zeton, ponovno } — uid mora biti kartica, ki je trenutno prislonjena. */
    void vpisi(String json) {
        nit.execute(() -> {
            String zaUid = "";
            try {
                JSONObject j = new JSONObject(json);
                zaUid = j.optString("uid");
                IsoDep d = kartica;
                if (d == null || !zaUid.equalsIgnoreCase(uid) || !d.isConnected()) {
                    javi("napaka", "uid", zaUid, "sporocilo", "Kartica je bila odmaknjena.", "odmaknjena", true);
                    return;
                }
                byte[] zeton = bajti(j.getString("zeton"));
                if (!Kartica.zetonBerljiv(zeton)) throw new Kartica.Napaka("Žeton ni primeren.");
                new Kartica(d::transceive).vpisi(bajti(j.getString("glavni")), bajti(j.getString("bralni")), zeton, j.optBoolean("ponovno"));
                javi("vpisana", "uid", zaUid);
            } catch (Kartica.Napaka e) {
                javi("napaka", "uid", zaUid, "sporocilo", e.getMessage(), "odmaknjena", false);
            } catch (IOException e) {
                kartica = null;
                javi("napaka", "uid", zaUid, "sporocilo", "Kartica je bila odmaknjena.", "odmaknjena", true);
            } catch (Exception e) {
                Log.w("SmartCleanRFID", "vpis", e);
                javi("napaka", "uid", zaUid, "sporocilo", "Vpis ni uspel.", "odmaknjena", false);
            }
        });
    }

    /** Dogodek strani: stanje in pari ključ, vrednost. Nikoli ne vrže (nit ne sme pasti). */
    private void javi(String stanje, Object... par) {
        try {
            JSONObject o = new JSONObject().put("tip", "kartica").put("stanje", stanje);
            for (int i = 0; i + 1 < par.length; i += 2) o.put(String.valueOf(par[i]), par[i + 1]);
            poslusalec.dogodek(o.toString());
        } catch (Exception e) { Log.w("SmartCleanRFID", "nfc dogodek", e); }
    }

    private static String hex(byte[] b) {
        StringBuilder s = new StringBuilder();
        if (b != null) for (byte x : b) s.append(String.format("%02X", x));
        return s.toString();
    }

    private static byte[] bajti(String h) throws Kartica.Napaka {
        if (h == null || h.length() % 2 != 0 || !h.matches("[0-9A-Fa-f]*")) throw new Kartica.Napaka("Napačni podatki za vpis.");
        byte[] b = new byte[h.length() / 2];
        for (int i = 0; i < b.length; i++) b[i] = (byte) Integer.parseInt(h.substring(2 * i, 2 * i + 2), 16);
        return b;
    }
}
