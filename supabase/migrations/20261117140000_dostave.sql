-- Načrt dostav (Spremni listi → Dostave), 2026-11-17:
--  · dostave_urnik: za vsako stranko dnevi dostave (ISO 1 = ponedeljek … 7 = nedelja), vrstni red na poti, opomba za voznika;
--  · dostave: zapis za dan — opravljena dostava (kdaj, kdo) ali izredna dostava (le ta dan). Postaja iz urnika brez zapisa = čaka.
-- Vidi in ureja osebje (kot Spremni listi).
create table if not exists public.dostave_urnik (
  org_id uuid primary key references public.orgs(id) on delete cascade,
  dnevi smallint[] not null default '{}',
  vrstni_red integer,
  opomba text,
  updated_at timestamptz not null default now(),
  constraint dostave_urnik_dnevi check (dnevi <@ array[1,2,3,4,5,6,7]::smallint[])
);
create table if not exists public.dostave (
  id uuid primary key default gen_random_uuid(),
  datum date not null,
  org_id uuid not null references public.orgs(id) on delete cascade,
  izredna boolean not null default false,
  opravljeno_at timestamptz,
  opravil text,
  opomba text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  deleted_at timestamptz
);
create unique index if not exists dostave_dan_stranka on public.dostave (datum, org_id) where deleted_at is null;
create index if not exists dostave_datum on public.dostave (datum) where deleted_at is null;

alter table public.dostave_urnik enable row level security;
alter table public.dostave enable row level security;
drop policy if exists dostave_urnik_osebje on public.dostave_urnik;
drop policy if exists dostave_osebje on public.dostave;
create policy dostave_urnik_osebje on public.dostave_urnik for all to authenticated using (app.is_staff() or app.je_lastnik()) with check (app.is_staff() or app.je_lastnik());
create policy dostave_osebje on public.dostave for all to authenticated using (app.is_staff() or app.je_lastnik()) with check (app.is_staff() or app.je_lastnik());
revoke all on public.dostave_urnik, public.dostave from anon;
grant select, insert, update, delete on public.dostave_urnik, public.dostave to authenticated;
