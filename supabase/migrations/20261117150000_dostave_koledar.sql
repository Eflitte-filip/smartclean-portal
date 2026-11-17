-- Koledar voženj (2026-11-17, lastnik: »kot iCloud koledar, v katerega dodam urnik voženj«).
-- dostave_voznje: vožnja k stranki na datum, lahko s ponavljanjem (vsak teden na izbrane dni, vsaka 2 tedna, vsak mesec) do konca.
-- dostave (obstoječa): zapis za dan in stranko — opravljeno (kdaj, kdo) ali izpuščena (ta dan vožnja izjemoma odpade).
-- dostave_urnik (5.11, prazna) se ne uporablja več; ostane, dokler ni treba drugače.
-- Isti podatki bodo vir za voznikovo aplikacijo (dostava.smartclean.si).
create table if not exists public.dostave_voznje (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  zacetek date not null,
  ura time,
  ponavljanje text not null default 'ne',
  dnevi smallint[] not null default '{}',
  konec date,
  opomba text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  deleted_at timestamptz,
  constraint dostave_voznje_pon check (ponavljanje in ('ne', 'tedensko', '2tedna', 'mesecno')),
  constraint dostave_voznje_dnevi check (dnevi <@ array[1,2,3,4,5,6,7]::smallint[]),
  constraint dostave_voznje_konec check (konec is null or konec >= zacetek)
);
create index if not exists dostave_voznje_zacetek on public.dostave_voznje (zacetek) where deleted_at is null;
create index if not exists dostave_voznje_org on public.dostave_voznje (org_id) where deleted_at is null;

alter table public.dostave add column if not exists voznja_id uuid references public.dostave_voznje(id) on delete set null;
alter table public.dostave add column if not exists izpuscena boolean not null default false;

alter table public.dostave_voznje enable row level security;
drop policy if exists dostave_voznje_osebje on public.dostave_voznje;
create policy dostave_voznje_osebje on public.dostave_voznje for all to authenticated using (app.is_staff() or app.je_lastnik()) with check (app.is_staff() or app.je_lastnik());
revoke all on public.dostave_voznje from anon;
grant select, insert, update, delete on public.dostave_voznje to authenticated;
