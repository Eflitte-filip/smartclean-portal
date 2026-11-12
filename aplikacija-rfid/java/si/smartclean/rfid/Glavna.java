package si.smartclean.rfid;

import android.app.Activity;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.IntentFilter;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.hardware.usb.UsbManager;
import android.media.AudioManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.media.ToneGenerator;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.Settings;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;

/**
 * SmartClean RFID: aplikacija za zaposlene (portal.smartclean.si/rfid/) + most do čitalca (window.ScRfid).
 * Sprožilec C72: drži za branje, spusti za konec. Stran dobi dogodke »scrfid« (stanje, epc).
 * Odpre se le /rfid/ (druge strani portala ne); druge povezave gredo v brskalnik.
 * Kiosk: kot lastnik naprave je aplikacija domači zaslon in zaklenjena na zaslonu; izhod le prek
 * »Nastavitve naprave« (skrbnik v aplikaciji), ob vrnitvi se zaklep vključi znova.
 */
public class Glavna extends Activity implements Bralnik.Poslusalec {
    static final String VERZIJA = Nastavitve.VERZIJA;
    // naslov portala določi gradnja (Nastavitve.java): objava = https://portal.smartclean.si, preizkus = lokalni portal
    // tipke sprožilca na čitalcih Chainway (po njihovem vzorcu)
    private static final int[] SPROZILCI = {139, 280, 291, 293, 294, 311, 312, 313, 315, 591, 593, 594, 596};
    // začetno stanje čitalca, ko je stran naložena
    private static final String MOST_JS =
            "(function(){if(!window.ScRfid)return;window.dispatchEvent(new CustomEvent('scrfid',{detail:JSON.parse(ScRfid.stanje())}));})();";

    private static final String NAPAKA_URL = "file:///android_asset/ni-povezave.html";

    private WebView web;
    private boolean naNapaki;   // prikazan zaslon »Ni povezave«; ob povezavi se portal naloži sam
    private ConnectivityManager.NetworkCallback omrezje;
    private Bralnik bralnik;
    private ToneGenerator ton;
    private volatile String trenutni = "";
    private long zadnjiPisk;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private DevicePolicyManager dpm;
    private ComponentName skrbnik;
    private WebView tisk;       // okno za tisk živi, dokler ga ne zamenja naslednji tisk (sicer ga lahko pobere zbiralnik smeti)
    private boolean tiskam;     // odprt je sistemski dialog za tisk: časovnikov oken ne ustavljaj (predogled bi obstal)
    private Tiskalnik tiskalnik;   // neposreden tisk na omrežni tiskalnik
    private Nfc nfc;               // kartice zaposlenih (DESFire) — vpis s C72, le skrbnik

    @Override
    protected void onCreate(Bundle shranjeno) {
        super.onCreate(shranjeno);
        barvaPasov("#ffffff");
        try { ton = new ToneGenerator(AudioManager.STREAM_MUSIC, 60); } catch (Exception e) { ton = null; }
        bralnik = new Bralnik(this, this);
        tiskalnik = new Tiskalnik(this);
        nfc = new Nfc(this, json -> ui.post(() -> { if (!isDestroyed()) dogodek(json); }));
        dpm = (DevicePolicyManager) getSystemService(Context.DEVICE_POLICY_SERVICE);
        skrbnik = new ComponentName(this, Skrbnik.class);
        kioskNastavi();

        if (Nastavitve.PREIZKUS) WebView.setWebContentsDebuggingEnabled(true);   // samo preizkusna gradnja (lokalni portal)
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        s.setUserAgentString(s.getUserAgentString() + " SmartCleanRFID/" + VERZIJA);
        CookieManager.getInstance().setAcceptCookie(true);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (dovoljen(u)) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
            @Override public void onPageStarted(WebView v, String url, Bitmap ikona) {
                trenutni = url == null ? "" : url;
                if (dovoljen(Uri.parse(trenutni))) naNapaki = false;
            }
            @Override public void doUpdateVisitedHistory(WebView v, String url, boolean ponovno) { trenutni = url == null ? "" : url; }
            @Override public void onPageFinished(WebView v, String url) {
                trenutni = url == null ? "" : url;
                if (dovoljen(Uri.parse(trenutni))) { v.evaluateJavascript(MOST_JS, null); v.clearHistory(); }
                else if (NAPAKA_URL.equals(trenutni)) v.evaluateJavascript("document.body.dataset.portal=" + JSONObject.quote(Nastavitve.PORTAL), null);
            }
            // portal ni dosegljiv (prvi zagon brez povezave; pozneje ga ima portal v predpomnilniku): zaslon z gumbom, sam poskusi znova
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (!r.isForMainFrame() || !dovoljen(r.getUrl())) return;
                naNapaki = true;
                v.loadUrl(NAPAKA_URL);
                ui.removeCallbacks(znova);
                ui.postDelayed(znova, 5000);
            }
            // brskalniški proces se je zrušil (malo pomnilnika): okno na novo, aplikacija ostane odprta
            @Override public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail d) {
                if (v == web) {
                    ((ViewGroup) v.getParent()).removeView(v);
                    v.destroy();
                    web = null;
                    recreate();
                }
                return true;
            }
        });
        web.addJavascriptInterface(new Most(), "ScRfid");
        setContentView(web);
        if (shranjeno == null || web.restoreState(shranjeno) == null) web.loadUrl(Nastavitve.PORTAL);
        ui.postDelayed(() -> {   // prvi zagon takoj po vklopu naprave: nalaganje se včasih ne začne
            String u = web == null ? "x" : web.getUrl();
            if (u == null || u.isEmpty()) web.loadUrl(Nastavitve.PORTAL);
        }, 4000);
        obravnavajUsb(getIntent());
        omrezje = new ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(Network n) { ui.post(() -> { if (naNapaki) znova.run(); }); }
        };
        try { ((ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE)).registerDefaultNetworkCallback(omrezje); } catch (Exception ignored) { omrezje = null; }
    }

    private final Runnable znova = new Runnable() {
        @Override public void run() {
            if (!naNapaki || web == null) return;
            naNapaki = false;
            web.loadUrl(Nastavitve.PORTAL);
        }
    };

    private static boolean dovoljen(Uri u) {
        String pot = u == null ? null : u.getPath();
        return u != null && Nastavitve.SHEMA.equals(u.getScheme()) && Nastavitve.GOSTITELJ.equals(u.getHost()) && u.getPort() == Nastavitve.VRATA
                && pot != null && pot.startsWith(Nastavitve.POT);
    }

    private boolean mostDovoljen() { return dovoljen(Uri.parse(trenutni == null ? "" : trenutni)); }

    @Override protected void onStart() { super.onStart(); bralnik.samodejno(); }
    // v ozadju portal miruje (baterija ročnega čitalca); ob vrnitvi se sam osveži (visibilitychange)
    @Override protected void onResume() {
        super.onResume();
        tiskam = false;
        if (web != null) { web.onResume(); web.resumeTimers(); }
        kioskNastavi();   // tudi, če je bila naprava nastavljena za kiosk, ko je aplikacija že tekla
        zaklepni();       // tudi po vrnitvi iz nastavitev naprave
        if (nfc != null) nfc.nadaljuj();   // branje kartic deluje le v ospredju
    }
    @Override protected void onPause() {
        bralnik.ustavi();   // branje ne teče naprej v ozadju (baterija, 1 W)
        if (nfc != null) nfc.premor();
        if (web != null) { web.onPause(); if (!tiskam) web.pauseTimers(); }
        super.onPause();
    }
    @Override protected void onStop() { bralnik.zapri(); super.onStop(); }   // čitalec sprosti v ozadju (baterija, druge aplikacije)
    @Override protected void onSaveInstanceState(Bundle o) { super.onSaveInstanceState(o); if (web != null && !naNapaki) web.saveState(o); }
    @Override protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        if (omrezje != null) { try { ((ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE)).unregisterNetworkCallback(omrezje); } catch (Exception ignored) { } }
        bralnik.konec();
        tiskalnik.ustavi();
        if (nfc != null) nfc.konec();
        if (ton != null) { ton.release(); ton = null; }
        if (web != null) { web.destroy(); web = null; }
        if (tisk != null) { tisk.destroy(); tisk = null; }
        super.onDestroy();
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        obravnavajUsb(i);
    }

    private void obravnavajUsb(Intent i) {
        if (i != null && UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(i.getAction())) bralnik.usbPrikljucen();
    }

    // ── kiosk (le kot lastnik naprave): aplikacija je domači zaslon, zaklenjena na zaslonu ──
    private boolean izklapljam;   // »Izklopi kiosk« teče: nič več zaklepanja
    private boolean kiosk() { return !izklapljam && dpm != null && dpm.isDeviceOwnerApp(getPackageName()); }
    // tisk v kiosku: sistemski dialog in storitve tiskanja morajo biti dovoljeni (sicer jih zaklep ne odpre)
    private static final String[] TISK_PAKETI = {"com.android.printspooler", "com.android.bips", "com.google.android.printservice.recommendation",
            "com.hp.android.printservice", "org.mopria.printplugin", "com.mopria.printplugin"};
    private void zaklepni() {
        if (!kiosk()) return;
        kioskNastavi();
        try { if (dpm.isLockTaskPermitted(getPackageName())) startLockTask(); } catch (Exception e) { Log.w("SmartCleanRFID", "zaklep", e); }
    }

    // nastavi, ko aplikacija še ni dovoljena za zaklep ali se seznam dovoljenih razlikuje (posodobitev z novimi paketi za tisk;
    // tudi, če je naprava postala kiosk, ko je aplikacija tekla)
    private void kioskNastavi() {
        if (!kiosk()) return;
        String[] pak = new String[TISK_PAKETI.length + 1];
        pak[0] = getPackageName();
        System.arraycopy(TISK_PAKETI, 0, pak, 1, TISK_PAKETI.length);
        try {
            String[] zdaj = dpm.getLockTaskPackages(skrbnik);
            if (zdaj != null && new HashSet<>(Arrays.asList(zdaj)).equals(new HashSet<>(Arrays.asList(pak))) && dpm.isLockTaskPermitted(getPackageName())) return;
        } catch (Exception ignored) { }
        try {
            dpm.setLockTaskPackages(skrbnik, pak);
            if (Build.VERSION.SDK_INT >= 28) {   // ura in baterija vidni, gumb za izklop deluje
                dpm.setLockTaskFeatures(skrbnik, DevicePolicyManager.LOCK_TASK_FEATURE_SYSTEM_INFO | DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS);
            }
            IntentFilter dom = new IntentFilter(Intent.ACTION_MAIN);
            dom.addCategory(Intent.CATEGORY_HOME);
            dom.addCategory(Intent.CATEGORY_DEFAULT);
            dpm.addPersistentPreferredActivity(skrbnik, dom, new ComponentName(this, Glavna.class));
        } catch (Exception e) { Log.w("SmartCleanRFID", "kiosk", e); }
    }

    // »Nastavitve naprave« (le skrbnik v aplikaciji): zaklep se izklopi do vrnitve v aplikacijo
    private void nastavitveNaprave() {
        try { if (kiosk()) stopLockTask(); } catch (Exception ignored) { }
        try { startActivity(new Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) { }
    }

    // NFC je izklopljen: odpri njegove nastavitve (v kiosku zaklep za ta čas izklopi, ob vrnitvi se vključi znova)
    private void nfcNastavitve() {
        try { if (kiosk()) stopLockTask(); } catch (Exception ignored) { }
        try { startActivity(new Intent(Settings.ACTION_NFC_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
        catch (Exception e) { nastavitveNaprave(); }
    }

    // »Izklopi kiosk« (le skrbnik): naprava spet navadna (sicer le ponastavitev na tovarniške nastavitve)
    private void kioskIzklopi() {
        if (!kiosk()) return;
        izklapljam = true;
        try { dpm.setLockTaskPackages(skrbnik, new String[0]); } catch (Exception e) { Log.w("SmartCleanRFID", "izklop", e); }   // to zaklep konča
        try { dpm.clearPackagePersistentPreferredActivities(skrbnik, getPackageName()); } catch (Exception ignored) { }
        try { stopLockTask(); } catch (Exception ignored) { }
        try { dpm.clearDeviceOwnerApp(getPackageName()); } catch (Exception e) { Log.w("SmartCleanRFID", "izklop", e); }
    }

    // Nazaj = Escape v aplikaciji (zapre okno ali meni). Zgodovine okna ne uporablja: stran je ena aplikacija,
    // korak nazaj bi odprl staro stanje ali zaslon »Ni povezave«. Aplikacije ne zapre (na C72 je edina).
    @Override
    public void onBackPressed() {
        if (web != null && !naNapaki) web.evaluateJavascript("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))", null);
    }

    // zaklep tudi, ko okno dobi fokus (v onResume je lahko še prezgodaj)
    @Override
    public void onWindowFocusChanged(boolean fokus) {
        super.onWindowFocusChanged(fokus);
        if (fokus && !tiskam) zaklepni();
    }

    private static boolean sprozilec(int k) {
        for (int x : SPROZILCI) if (x == k) return true;
        return false;
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (sprozilec(e.getKeyCode())) {
            if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) bralnik.zacni();
            else if (e.getAction() == KeyEvent.ACTION_UP) bralnik.ustavi();
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    // ── dogodki čitalca → portal ──
    @Override
    public void stanje(String json, boolean bere) {
        ui.post(() -> {
            if (isDestroyed()) return;   // nit čitalca lahko javi še po koncu aktivnosti
            if (bere) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            dogodek(json);
        });
    }

    @Override
    public void epci(List<String> novi) {
        try {
            JSONObject o = new JSONObject().put("tip", "epc").put("epc", new JSONArray(novi));
            ui.post(() -> {
                if (isDestroyed()) return;
                dogodek(o.toString());
                long t = SystemClock.uptimeMillis();
                if (ton != null && t - zadnjiPisk > 70) { zadnjiPisk = t; try { ton.startTone(ToneGenerator.TONE_PROP_BEEP, 40); } catch (Exception ignored) { } }
            });
        } catch (Exception ignored) { }
    }

    private void dogodek(String json) {
        if (web == null || !mostDovoljen()) return;
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('scrfid',{detail:" + json + "}))", null);
    }

    // barva vrha in dna po temi portala
    private void barvaPasov(String hex) {
        int c;
        try { c = Color.parseColor(hex); } catch (Exception e) { return; }
        Window w = getWindow();
        w.setStatusBarColor(c);
        w.setNavigationBarColor(c);
        double svetlost = (0.299 * Color.red(c) + 0.587 * Color.green(c) + 0.114 * Color.blue(c)) / 255;
        int z = 0;
        if (svetlost > 0.6) {
            z |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= 27) z |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        w.getDecorView().setSystemUiVisibility(z);
    }

    private void tiskaj(String html, String ime) {
        if (isDestroyed() || isFinishing()) return;
        final String naslov = ime == null || ime.trim().isEmpty() ? "SmartClean" : ime;
        if (tisk != null) { tisk.destroy(); tisk = null; }
        final WebView t = new WebView(this);
        tisk = t;
        t.setWebViewClient(new WebViewClient() {
            private boolean poslano;   // onPageFinished lahko pride dvakrat: en dialog
            // vsa okna si delijo en proces za izris: ob njegovem padcu bi brez tega Android zaprl celo aplikacijo
            @Override public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail d) {
                if (v == tisk) tisk = null;
                tiskam = false;
                try { v.destroy(); } catch (Exception ignored) { }
                return true;
            }
            @Override public void onPageFinished(WebView v, String url) {
                if (poslano || v != tisk) return;
                poslano = true;
                PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                if (pm == null) return;
                try {
                    tiskam = true;
                    pm.print(naslov, v.createPrintDocumentAdapter(naslov), new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
                } catch (Exception e) { tiskam = false; Log.w("SmartCleanRFID", "tisk", e); }
            }
        });
        t.getSettings().setJavaScriptEnabled(false);
        t.loadDataWithBaseURL(Nastavitve.PORTAL, html, "text/html", "utf-8", null);
    }

    // PDF naravnost na tiskalnik; izid gre v stran kot dogodek »tisk« (ob neuspehu stran odpre sistemski dialog)
    private void tiskajPdf(String b64, String ime) {
        byte[] pdf;
        try { pdf = android.util.Base64.decode(b64, android.util.Base64.DEFAULT); }
        catch (IllegalArgumentException e) { izidTiska(false, "format", ""); return; }
        tiskalnik.natisni(pdf, ime, this::izidTiska);
    }

    private void izidTiska(boolean ok, String napaka, String ime) {
        try {
            String json = new JSONObject().put("tip", "tisk").put("ok", ok).put("napaka", napaka).put("tiskalnik", ime).toString();
            ui.post(() -> { if (!isDestroyed()) dogodek(json); });
        } catch (Exception ignored) { }
    }

    /** window.ScRfid — vse metode delujejo le, ko je odprt portal. */
    private class Most {
        @JavascriptInterface public String stanje() { return mostDovoljen() ? bralnik.stanjeJson() : "{}"; }
        @JavascriptInterface public void izberi(String id) { if (mostDovoljen() && ("vgrajen".equals(id) || "r1".equals(id) || "ur4".equals(id) || ("preizkus".equals(id) && Bralnik.EMULATOR))) bralnik.izberi(id); }
        @JavascriptInterface public void zacni() { if (mostDovoljen()) bralnik.zacni(); }
        @JavascriptInterface public void ustavi() { if (mostDovoljen()) bralnik.ustavi(); }
        @JavascriptInterface public void moc(int dbm) { if (mostDovoljen()) bralnik.nastaviMoc(dbm); }
        @JavascriptInterface public void ur4(String naslov) { if (mostDovoljen()) bralnik.nastaviUr4(naslov); }
        @JavascriptInterface public void preizkus(String epci) { if (mostDovoljen()) bralnik.nastaviPreizkus(epci); }
        @JavascriptInterface public void barva(String hex) { if (mostDovoljen()) ui.post(() -> barvaPasov(hex)); }
        @JavascriptInterface public void natisni(String html, String ime) { if (mostDovoljen()) ui.post(() -> tiskaj(html, ime)); }
        @JavascriptInterface public void natisniPdf(String b64, String ime) { if (mostDovoljen()) tiskajPdf(b64, ime); }
        @JavascriptInterface public String tiskalnik() { return mostDovoljen() ? tiskalnik.stanje() : "{}"; }
        @JavascriptInterface public void tiskalnikNastavi(String naslov) { if (mostDovoljen()) tiskalnik.nastavi(naslov); }
        @JavascriptInterface public boolean kiosk() { return mostDovoljen() && Glavna.this.kiosk(); }
        @JavascriptInterface public void nastavitve() { if (mostDovoljen()) ui.post(Glavna.this::nastavitveNaprave); }
        @JavascriptInterface public void kioskIzklopi() { if (mostDovoljen()) ui.post(Glavna.this::kioskIzklopi); }
        // kartice zaposlenih (NFC): stanje, branje, vpis — dogodki »scrfid« s tip = "kartica"
        @JavascriptInterface public String nfc() { return mostDovoljen() ? nfc.stanjeJson() : "{}"; }
        @JavascriptInterface public void nfcZacni() { if (mostDovoljen()) ui.post(nfc::zacni); }
        @JavascriptInterface public void nfcUstavi() { if (mostDovoljen()) ui.post(nfc::ustavi); }
        @JavascriptInterface public void nfcNastavitve() { if (mostDovoljen()) ui.post(Glavna.this::nfcNastavitve); }
        @JavascriptInterface public void karticaVpisi(String json) { if (mostDovoljen()) nfc.vpisi(json); }
    }
}
