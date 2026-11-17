-- Voznikova aplikacija dostava.smartclean.si (2026-11-17, lastnik: »web app, kjer bo voznik potrjeval dostave«,
-- vozita lastnik in Ivan Funtek; »vgradi tudi mapo in gps«).
--  · profiles.dostava_dostop: pravica »Dostava« (Uporabniki); osebje, admin in lastnik jo imajo po vlogi.
--  · voznik ne bere tabel dostav neposredno (RLS ostane le za osebje): vse gre prek treh klicev spodaj.
--  · orgs.lat/lon: lokacija stranke za zemljevid. geo_naslov = naslov, iz katerega je lokacija (ob spremembi
--    naslova se lokacija poišče znova); geo_rocno = voznik je stranko postavil na svoj položaj (iskanje je ne prepiše).
--  · dostave v živem toku: koledar v portalu se osveži sam, ko voznik potrdi.
alter table public.profiles add column if not exists dostava_dostop boolean not null default false;

alter table public.orgs
  add column if not exists lat double precision,
  add column if not exists lon double precision,
  add column if not exists geo_naslov text,
  add column if not exists geo_rocno boolean not null default false;

-- pravice: dostava_dostop spreminja le super admin ali lastnik (kot rfid_dostop)
create or replace function app.profiles_zascita_pravic()
 returns trigger
 language plpgsql
 set search_path to 'public', 'app'
as $function$
declare
  sme boolean;
begin
  -- Brez prijavljenega uporabnika gre za service_role (Edge funkciji »uporabniki«
  -- in »registracija«, ki pravice preverjata sami), SQL Editor ali psql.
  if auth.uid() is null then
    return NEW;
  end if;

  -- Lastnikov profil spreminja le lastnik (ime, slika, nastavitve, pravice).
  if lower(coalesce(OLD.email, '')) = 'filip@eflitte.si' and not app.je_lastnik() then
    raise exception 'Profila lastnika ni mogoče spremeniti.' using errcode = '42501';
  end if;

  -- id je vez na prijavo (auth.users): z zamenjavo id bi kdo prevzel tuj profil.
  if NEW.id is distinct from OLD.id then
    raise exception 'Uporabnika ni mogoče zamenjati.' using errcode = '42501';
  end if;

  -- E-pošta je identiteta (po njej jo prepoznajo pravila in Edge funkcije).
  if NEW.email is distinct from OLD.email then
    raise exception 'E-pošte ni mogoče spremeniti tukaj.' using errcode = '42501';
  end if;

  if (NEW.is_staff    is distinct from OLD.is_staff)
  or (NEW.super_admin is distinct from OLD.super_admin)
  or (NEW.zaposleni   is distinct from OLD.zaposleni)
  or (NEW.active      is distinct from OLD.active)
  or (NEW.web_dostop  is distinct from OLD.web_dostop)
  or (NEW.rfid_dostop is distinct from OLD.rfid_dostop)
  or (NEW.dostava_dostop is distinct from OLD.dostava_dostop)
  or (NEW.is_device   is distinct from OLD.is_device)
  or (NEW.is_tablet   is distinct from OLD.is_tablet)
  then
    -- Lastnih pravic ne spreminja nihče — razen lastnika.
    if NEW.id = auth.uid() and not app.je_lastnik() then
      raise exception 'Lastnih pravic ni mogoče spremeniti.' using errcode = '42501';
    end if;
    -- Admina postavi, odstavi ali mu spremeni pravice le lastnik (kot v portalu: admin ureja le nižje vloge).
    if ((NEW.super_admin is distinct from OLD.super_admin) or coalesce(OLD.super_admin, false)) and not app.je_lastnik() then
      raise exception 'Pravice admina spreminja le lastnik.' using errcode = '42501';
    end if;
    -- Tujim pravicam sme le aktiven super admin ali lastnik (po žetonu).
    select app.je_lastnik() or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.active and p.super_admin
    ) into sme;
    if not sme then
      raise exception 'Za spreminjanje pravic nimate dovoljenja.' using errcode = '42501';
    end if;
  end if;

  return NEW;
end $function$;
alter function app.profiles_zascita_pravic() owner to postgres;

create or replace function app.sme_dostava()
 returns boolean language sql stable security definer set search_path to 'public', 'app' as $$
  select app.je_lastnik() or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active
      and (coalesce(p.is_staff, false) or coalesce(p.super_admin, false) or coalesce(p.dostava_dostop, false)));
$$;
revoke all on function app.sme_dostava() from public, anon;
grant execute on function app.sme_dostava() to authenticated;

-- ali vožnja pade na dan (ista pravila kot dostVoznjaNaDan v portalu)
create or replace function app.dostava_na_dan(p_zacetek date, p_konec date, p_pon text, p_dnevi smallint[], p_dan date)
 returns boolean language sql immutable set search_path to 'public', 'app' as $$
  select p_dan >= p_zacetek and (p_konec is null or p_dan <= p_konec) and case p_pon
    when 'ne' then p_dan = p_zacetek
    when 'mesecno' then extract(day from p_dan) = extract(day from p_zacetek)
    when 'tedensko' then extract(isodow from p_dan)::int = any(
      case when cardinality(p_dnevi) > 0 then p_dnevi::int[] else array[extract(isodow from p_zacetek)::int] end)
    when '2tedna' then extract(isodow from p_dan)::int = any(
      case when cardinality(p_dnevi) > 0 then p_dnevi::int[] else array[extract(isodow from p_zacetek)::int] end)
      and ((date_trunc('week', p_dan)::date - date_trunc('week', p_zacetek)::date) / 7) % 2 = 0
    else false end;
$$;
revoke all on function app.dostava_na_dan(date, date, text, smallint[], date) from public, anon;
grant execute on function app.dostava_na_dan(date, date, text, smallint[], date) to authenticated;

-- postaje dneva: vožnje tega dne (brez izpuščenih) + opravljene brez vožnje; za vsako stranko najzgodnejša ura
create or replace function public.dostava_dan(p_dan date)
 returns json language plpgsql stable security definer set search_path to 'public', 'app' as $$
declare r json; ime text;
begin
  if not app.sme_dostava() then raise exception 'Ta račun nima dostopa do dostav.' using errcode = '42501'; end if;
  if p_dan is null then raise exception 'Ni dneva.' using errcode = '22023'; end if;
  select coalesce(nullif(trim(p.full_name), ''), p.email) into ime from public.profiles p where p.id = auth.uid();
  with v as (
    select distinct on (v.org_id) v.org_id, v.id as voznja_id, v.ura, v.opomba
    from public.dostave_voznje v
    where v.deleted_at is null and app.dostava_na_dan(v.zacetek, v.konec, v.ponavljanje, v.dnevi, p_dan)
    order by v.org_id, v.ura nulls last, v.created_at
  ), z as (
    select d.* from public.dostave d where d.datum = p_dan and d.deleted_at is null
  ), s as (
    select coalesce(v.org_id, z.org_id) as org_id, v.voznja_id, v.ura, v.opomba as opomba_voznje,
           z.opravljeno_at, z.opravil, z.opomba
    from v full join z on z.org_id = v.org_id
    where (v.org_id is not null and not coalesce(z.izpuscena, false))
       or (v.org_id is null and z.opravljeno_at is not null and not z.izpuscena)
  )
  select coalesce(json_agg(json_build_object(
      'org', o.id, 'ime', o.name, 'naslov', o.address,
      'lat', case when o.geo_naslov is not distinct from o.address then o.lat end,
      'lon', case when o.geo_naslov is not distinct from o.address then o.lon end,
      'rocno', o.geo_rocno and o.geo_naslov is not distinct from o.address,
      'ura', left(s.ura::text, 5), 'voznja', s.voznja_id, 'opomba_voznje', s.opomba_voznje,
      'opravljeno_at', s.opravljeno_at, 'opravil', s.opravil, 'opomba', s.opomba,
      'listi', (select coalesce(json_agg(json_build_object('st', n.number, 'kosov', n.total_pieces) order by n.number), '[]'::json)
                from public.delivery_notes n where n.org_id = o.id and n.doc_date = p_dan and n.deleted_at is null)
    ) order by s.ura nulls last, o.name), '[]'::json) into r
  from s join public.orgs o on o.id = s.org_id
  where o.deleted_at is null;
  return json_build_object('dan', p_dan, 'ime', ime, 'postaje', r);
end $$;
revoke all on function public.dostava_dan(date) from public, anon;
grant execute on function public.dostava_dan(date) to authenticated;

-- potrditev (ali preklic) dostave; p_cas = čas na telefonu (potrditev brez povezave se pošlje pozneje)
create or replace function public.dostava_potrdi(p_dan date, p_org uuid, p_opravljeno boolean, p_opomba text default null, p_cas timestamptz default null)
 returns json language plpgsql security definer set search_path to 'public', 'app' as $$
declare z public.dostave; vid uuid; ime text; danes date := (now() at time zone 'Europe/Ljubljana')::date; cas timestamptz; org_ime text;
begin
  if not app.sme_dostava() then raise exception 'Ta račun nima dostopa do dostav.' using errcode = '42501'; end if;
  if p_dan is null or p_org is null then raise exception 'Manjka dan ali stranka.' using errcode = '22023'; end if;
  if p_dan > danes then raise exception 'Dostave za prihodnji dan ni mogoče potrditi.' using errcode = '22023'; end if;
  if p_dan < danes - 14 then raise exception 'Ta dan je predaleč nazaj.' using errcode = '22023'; end if;
  select name into org_ime from public.orgs where id = p_org and deleted_at is null;
  if org_ime is null then raise exception 'Stranke ni.' using errcode = 'P0002'; end if;
  select v.id into vid from public.dostave_voznje v
    where v.deleted_at is null and v.org_id = p_org and app.dostava_na_dan(v.zacetek, v.konec, v.ponavljanje, v.dnevi, p_dan)
    order by v.ura nulls last, v.created_at limit 1;
  select * into z from public.dostave d where d.datum = p_dan and d.org_id = p_org and d.deleted_at is null for update;
  if vid is null and z.id is null then raise exception 'Te stranke ta dan ni na poti.' using errcode = 'P0002'; end if;
  if z.id is not null and z.izpuscena then raise exception 'Ta dan je dostava k tej stranki izpuščena.' using errcode = '22023'; end if;
  select coalesce(nullif(trim(p.full_name), ''), p.email) into ime from public.profiles p where p.id = auth.uid();
  ime := coalesce(ime, auth.jwt() ->> 'email');
  cas := case when p_cas is not null and p_cas between now() - interval '2 days' and now() + interval '5 minutes' then least(p_cas, now()) else now() end;
  if z.id is null then
    insert into public.dostave (datum, org_id, voznja_id, opravljeno_at, opravil, opomba)
    values (p_dan, p_org, vid, case when p_opravljeno then cas end, case when p_opravljeno then ime end, nullif(left(trim(coalesce(p_opomba, '')), 500), ''))
    returning * into z;
  else
    update public.dostave set
      opravljeno_at = case when p_opravljeno then coalesce(z.opravljeno_at, cas) end,
      opravil = case when p_opravljeno then coalesce(z.opravil, ime) end,
      opomba = case when p_opomba is null then z.opomba else nullif(left(trim(p_opomba), 500), '') end,
      voznja_id = coalesce(z.voznja_id, vid)
    where id = z.id returning * into z;
  end if;
  begin
    insert into public.audit_log (razdelek, akcija, opis, kdo_ime)
    values ('Dostave', case when p_opravljeno then 'Opravljeno' else 'Ni opravljeno' end, org_ime || ' · ' || to_char(p_dan, 'DD. MM. YYYY') || ' · voznik', ime);
  exception when others then null;
  end;
  return json_build_object('org', p_org, 'opravljeno_at', z.opravljeno_at, 'opravil', z.opravil, 'opomba', z.opomba);
end $$;
revoke all on function public.dostava_potrdi(date, uuid, boolean, text, timestamptz) from public, anon;
grant execute on function public.dostava_potrdi(date, uuid, boolean, text, timestamptz) to authenticated;

-- lokacija stranke: iz iskanja naslova (p_rocno = false) ali voznikov položaj pri stranki (p_rocno = true)
create or replace function public.dostava_lokacija(p_org uuid, p_lat double precision, p_lon double precision, p_naslov text, p_rocno boolean)
 returns json language plpgsql security definer set search_path to 'public', 'app' as $$
declare o public.orgs;
begin
  if not app.sme_dostava() then raise exception 'Ta račun nima dostopa do dostav.' using errcode = '42501'; end if;
  if p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180 then
    raise exception 'Neveljavna lokacija.' using errcode = '22023';
  end if;
  select * into o from public.orgs where id = p_org and deleted_at is null for update;
  if not found then raise exception 'Stranke ni.' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.dostave_voznje v where v.org_id = p_org and v.deleted_at is null) then
    raise exception 'Te stranke ni na nobeni vožnji.' using errcode = '42501';
  end if;
  -- iskanje ne prepiše ročne lokacije za isti naslov; naslov mora biti trenutni naslov stranke
  if p_naslov is distinct from o.address then
    return json_build_object('org', p_org, 'lat', o.lat, 'lon', o.lon, 'rocno', o.geo_rocno, 'shranjeno', false);
  end if;
  if not coalesce(p_rocno, false) and o.geo_rocno and o.geo_naslov is not distinct from o.address then
    return json_build_object('org', p_org, 'lat', o.lat, 'lon', o.lon, 'rocno', true, 'shranjeno', false);
  end if;
  update public.orgs set lat = p_lat, lon = p_lon, geo_naslov = o.address, geo_rocno = coalesce(p_rocno, false) where id = p_org;
  return json_build_object('org', p_org, 'lat', p_lat, 'lon', p_lon, 'rocno', coalesce(p_rocno, false), 'shranjeno', true);
end $$;
revoke all on function public.dostava_lokacija(uuid, double precision, double precision, text, boolean) from public, anon;
grant execute on function public.dostava_lokacija(uuid, double precision, double precision, text, boolean) to authenticated;

-- koledar v portalu se osveži sam, ko voznik potrdi (realtime upošteva RLS: le osebje)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dostave') then
    alter publication supabase_realtime add table public.dostave;
  end if;
end $$;
