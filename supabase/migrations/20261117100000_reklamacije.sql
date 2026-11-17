-- Reklamacije (evidenca): izgubljeni, poškodovani, neočiščeni kosi, napačne dostave … po strankah.
-- Samo evidenca — nič se ne zaračuna. Vidi in ureja osebje (enako kot Dokumenti).
-- Fotografije so v bucketu »dokumenti« pod reklamacije/<id>/… (pravila bucketa že dovolijo osebju; razdelek
-- Dokumenti jih ne prikaže, ker bere le svojo tabelo). Novih pravil za storage z migracijo ni mogoče dodati.
create table if not exists public.reklamacije (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  note_id uuid references public.delivery_notes(id) on delete set null,
  datum date not null default current_date,
  vrsta text not null,
  artikel text,
  kosov integer,
  opis text,
  slike text[] not null default '{}',
  stanje text not null default 'odprta',
  resitev text,
  resena_at timestamptz,
  resil text,
  avtor text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  deleted_at timestamptz,
  constraint reklamacije_vrsta check (vrsta in ('izgubljen', 'poskodovan', 'neociscen', 'napacna_dostava', 'drugo')),
  constraint reklamacije_stanje check (stanje in ('odprta', 'resena')),
  constraint reklamacije_kosov check (kosov is null or kosov > 0)
);
create index if not exists reklamacije_org on public.reklamacije (org_id, datum desc);
create index if not exists reklamacije_datum on public.reklamacije (datum desc) where deleted_at is null;

alter table public.reklamacije enable row level security;
drop policy if exists reklamacije_osebje_sel on public.reklamacije;
drop policy if exists reklamacije_osebje_ins on public.reklamacije;
drop policy if exists reklamacije_osebje_upd on public.reklamacije;
drop policy if exists reklamacije_osebje_del on public.reklamacije;
create policy reklamacije_osebje_sel on public.reklamacije for select to authenticated using (app.is_staff() or app.je_lastnik());
create policy reklamacije_osebje_ins on public.reklamacije for insert to authenticated with check (app.is_staff() or app.je_lastnik());
create policy reklamacije_osebje_upd on public.reklamacije for update to authenticated using (app.is_staff() or app.je_lastnik()) with check (app.is_staff() or app.je_lastnik());
create policy reklamacije_osebje_del on public.reklamacije for delete to authenticated using (app.is_staff() or app.je_lastnik());
revoke all on public.reklamacije from anon;
grant select, insert, update, delete on public.reklamacije to authenticated;
