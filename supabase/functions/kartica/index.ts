// ═══════════════════════════════════════════════════════════════════════════
//  kartica — vpis kartice zaposlenega s C72 (brez bralnika na računalniku in brez Raspberry Pi)
//
//  Kartica DESFire nosi ključa, izpeljana iz osnovnih ključev in UID kartice (NXP AN10922, enako
//  kot terminal/sc_kartica.py). Osnovna ključa sta le tu, v skrivnostih funkcije; na C72 pride
//  samo par ključev ENE kartice, za kratek čas vpisa. Kdor bi ga prestregel, ima v rokah le to kartico.
//
//  Klic iz aplikacije RFID (portal.smartclean.si/rfid/, prijavljen skrbnik), POST { dejanje, … }:
//    zaposleni                     → { zaposleni: [{ id, ime, ima_kartico }] }
//    nov      { ime }              → { zaposleni: { id, ime, ima_kartico } }   (nov zaposleni)
//    kljuci   { uid }              → { glavni, bralni, zeton }   (hex; žeton je berljiv za terminal)
//    bralni   { uid }              → { bralni }                  (Poišči: ključ za branje te kartice)
//    lastnik  { zeton }            → { ime, aktiven } | { ime: null }   (Poišči: čigava je kartica)
//    dodeli   { emp_id, zeton }    → { ime }                     (employees.card_token = žeton)
//
//  Kdo sme: skrbnik po isti definiciji kot aplikacija RFID (rfid_podatki → skrbnik).
//
//  Objava: Supabase → Edge Functions → Deploy a new function → ime »kartica« (Verify JWT vklopljen).
//  Skrivnosti (Edge Functions → Secrets), vrednosti iz terminal/kljuci.json na računalniku za vpis:
//    KARTICA_APP_MASTER = app_master      KARTICA_READ = read
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from "jsr:@supabase/supabase-js@2";
import { izHex, izpeljiKljuc, novZeton, vHex, zetonBerljiv } from "./izpeljava.ts";

const PORTAL = "https://portal.smartclean.si";
const cors = {
  "Access-Control-Allow-Origin": PORTAL,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Max-Age": "86400",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function odgovor(telo: unknown, status = 200) {
  return new Response(JSON.stringify(telo), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  try {
    return await obravnavaj(req);
  } catch (e) {
    console.error("NAPAKA:", e);
    return odgovor({ napaka: "Napaka na strežniku." }, 500);
  }
});

async function obravnavaj(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return odgovor({ napaka: "Napačna metoda." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const javni = Deno.env.get("SUPABASE_ANON_KEY")!;
  const tajni = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const glava = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(glava)) return odgovor({ napaka: "Niste prijavljeni." }, 401);

  // ── kdo kliče: skrbnik v aplikaciji RFID (ista definicija kot meni v aplikaciji) ──
  const kot = createClient(url, javni, { global: { headers: { Authorization: glava } }, auth: { persistSession: false } });
  const { data: jaz, error: napakaJaz } = await kot.rpc("rfid_podatki");
  if (napakaJaz) {
    if (napakaJaz.code === "42501") return odgovor({ napaka: "Ta račun nima dostopa." }, 403);
    if (/jwt|token/i.test(napakaJaz.message ?? "")) return odgovor({ napaka: "Seja je potekla. Prijavite se znova." }, 401);
    throw napakaJaz;
  }
  if (!jaz || jaz.skrbnik !== true) return odgovor({ napaka: "Kartice vpisuje le skrbnik." }, 403);

  const admin = createClient(url, tajni, { auth: { persistSession: false } });
  let telo: Record<string, unknown>;
  try {
    telo = await req.json();
  } catch {
    return odgovor({ napaka: "Napačna zahteva." }, 400);
  }

  // Terminal (punch) sprejme kartico le aktivnemu zaposlenemu v organizaciji terminala: na C72 je mogoče izbrati
  // le take, nov zaposleni dobi organizacijo terminala, shranjevanje to še enkrat preveri.
  const { data: terminali, error: napakaTerm } = await admin.from("att_terminals").select("org_id").eq("active", true);
  if (napakaTerm) throw napakaTerm;
  const orgTerminala = [...new Set((terminali ?? []).map((t: { org_id: string | null }) => t.org_id).filter((x): x is string => !!x))];

  switch (telo.dejanje) {
    case "zaposleni": {
      let q = admin.from("employees").select("id,ime,ima_kartico").eq("active", true);
      if (orgTerminala.length) q = q.in("org_id", orgTerminala);
      const { data, error } = await q.order("ime");
      if (error) throw error;
      return odgovor({ zaposleni: data ?? [] });
    }

    case "nov": {
      // nov zaposleni: organizacija terminala (sicer obstoječih zaposlenih, kot portal → Prisotnost)
      const ime = String(telo.ime ?? "").replace(/\s+/g, " ").trim();
      if (ime.length < 2 || ime.length > 80) return odgovor({ napaka: "Vpiši ime in priimek." }, 400);
      const { data: isti } = await admin.from("employees").select("id").eq("active", true).ilike("ime", ime.replace(/[%_\\]/g, "\\$&")).limit(1);
      if (isti && isti.length) return odgovor({ napaka: "Zaposleni s tem imenom že obstaja." }, 409);
      let org: string | null = orgTerminala[0] ?? null;
      if (!org) {
        const { data: obst } = await admin.from("employees").select("org_id").not("org_id", "is", null).limit(1);
        if (obst && obst.length) org = obst[0].org_id;
      }
      if (!org) {
        const { data: o } = await admin.from("orgs").select("id").is("deleted_at", null).order("sort_order", { nullsFirst: false }).order("name").limit(1);
        if (o && o.length) org = o[0].id;
      }
      if (!org) return odgovor({ napaka: "Ni organizacije za zaposlenega." }, 409);
      const { data, error } = await admin.from("employees").insert({ org_id: org, ime, active: true }).select("id,ime,ima_kartico").single();
      if (error) throw error;
      return odgovor({ zaposleni: data });
    }

    case "kljuci":
    case "bralni": {
      const uidHex = String(telo.uid ?? "").replace(/\s+/g, "").toUpperCase();
      // UID iz protokola proti trkom: 4 ali 7 bajtov (DESFire EV3 privzeto 7, naključni ID 4 — ta ni primeren)
      if (!/^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/.test(uidHex)) return odgovor({ napaka: "Neveljaven UID kartice." }, 400);
      if (uidHex.length === 8 && uidHex.startsWith("08")) {
        return odgovor({ napaka: "Kartica ima naključni UID — taka kartica za štemplanje ni primerna." }, 400);
      }
      const am = Deno.env.get("KARTICA_APP_MASTER") ?? "", rd = Deno.env.get("KARTICA_READ") ?? "";
      if (!/^[0-9A-Fa-f]{32}$/.test(am) || !/^[0-9A-Fa-f]{32}$/.test(rd)) {
        return odgovor({ napaka: "Ključi za kartice na strežniku niso nastavljeni." }, 503);
      }
      const uid = izHex(uidHex);
      // Poišči (čigava je kartica): le bralni ključ te kartice — z njim se žeton prebere enako kot na terminalu
      if (telo.dejanje === "bralni") return odgovor({ bralni: vHex(await izpeljiKljuc(rd, uid)) });
      return odgovor({
        glavni: vHex(await izpeljiKljuc(am, uid)),
        bralni: vHex(await izpeljiKljuc(rd, uid)),
        zeton: vHex(novZeton()),
      });
    }

    case "lastnik": {
      // čigava je kartica: zaposleni z žetonom, ki ga je C72 prebral s kartice
      const zeton = String(telo.zeton ?? "").toUpperCase();
      if (!/^[0-9A-F]{32}$/.test(zeton)) return odgovor({ napaka: "Neveljaven žeton." }, 400);
      const { data, error } = await admin.from("employees").select("ime,active").eq("card_token", zeton).maybeSingle();
      if (error) throw error;
      return odgovor(data ? { ime: data.ime, aktiven: data.active } : { ime: null });
    }

    case "dodeli": {
      const empId = String(telo.emp_id ?? "");
      const zeton = String(telo.zeton ?? "").toUpperCase();
      if (!/^[0-9A-F]{32}$/.test(zeton) || !zetonBerljiv(izHex(zeton))) return odgovor({ napaka: "Neveljaven žeton." }, 400);
      if (!/^[0-9a-f-]{36}$/i.test(empId)) return odgovor({ napaka: "Neveljaven zaposleni." }, 400);
      const { data: zap } = await admin.from("employees").select("active,org_id").eq("id", empId).maybeSingle();
      if (!zap) return odgovor({ napaka: "Zaposlenega ni." }, 404);
      if (!zap.active) return odgovor({ napaka: "Zaposleni ni aktiven — terminal ga ne bi sprejel." }, 409);
      if (orgTerminala.length && !orgTerminala.includes(zap.org_id)) {
        return odgovor({ napaka: "Zaposleni ni v organizaciji terminala — terminal ga ne bi sprejel." }, 409);
      }
      const { data, error } = await admin.from("employees").update({ card_token: zeton }).eq("id", empId).select("id,ime");
      if (error) {
        if ((error.message ?? "").includes("employees_card_token_key")) return odgovor({ napaka: "Ta kartica je že dodeljena drugemu zaposlenemu." }, 409);
        throw error;
      }
      if (!data || !data.length) return odgovor({ napaka: "Zaposlenega ni." }, 404);
      return odgovor({ ime: data[0].ime });
    }
  }
  return odgovor({ napaka: "Neznano dejanje." }, 400);
}
