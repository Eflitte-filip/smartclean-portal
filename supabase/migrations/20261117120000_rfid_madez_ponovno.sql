-- Madež in ponovno pranje na kosu s čipom (2026-11-17, odobril lastnik):
--  · oznaki se nastavita en kos naenkrat (C72 → Poišči, portal → Perilo → kos), vsaka sprememba je dogodek v zgodovini kosa;
--  · madež ostane, dokler ga kdo ne odstrani;
--  · ponovno pranje se konča samo ob naslednji ODDAJI kosa (sprožilec spodaj; rfid_potrdi ostane nespremenjen),
--    ponovno_st šteje, kolikokrat je bil kos poslan na ponovno pranje.
alter table public.rfid_kosi
  add column if not exists madez boolean not null default false,
  add column if not exists madez_at timestamptz,
  add column if not exists ponovno boolean not null default false,
  add column if not exists ponovno_at timestamptz,
  add column if not exists ponovno_st integer not null default 0;

alter table public.rfid_dogodki drop constraint if exists rfid_dogodki_tip;
alter table public.rfid_dogodki add constraint rfid_dogodki_tip check (tip in ('oznacen', 'stanje', 'madez', 'ponovno'));

create or replace function public.rfid_oznaka(p_kos uuid, p_vrsta text, p_vkljuci boolean)
returns json language plpgsql security definer set search_path to 'public', 'app' as $$
declare k public.rfid_kosi;
begin
  if not app.sme_rfid() then raise exception 'Ta račun nima dostopa do čipov.' using errcode = '42501'; end if;
  if p_vrsta is null or p_vrsta not in ('madez', 'ponovno') then raise exception 'Neznana oznaka.' using errcode = '22023'; end if;
  select * into k from public.rfid_kosi where id = p_kos for update;
  if not found then raise exception 'Kosa ni.' using errcode = 'P0002'; end if;
  if p_vrsta = 'madez' and k.madez is distinct from coalesce(p_vkljuci, false) then
    update public.rfid_kosi set madez = coalesce(p_vkljuci, false), madez_at = case when p_vkljuci then now() end where id = p_kos returning * into k;
    insert into public.rfid_dogodki (kos_id, tip, opis) values (p_kos, 'madez', case when p_vkljuci then 'označen' else 'odstranjen' end);
  elsif p_vrsta = 'ponovno' and k.ponovno is distinct from coalesce(p_vkljuci, false) then
    update public.rfid_kosi set ponovno = coalesce(p_vkljuci, false), ponovno_at = case when p_vkljuci then now() end,
      ponovno_st = ponovno_st + case when p_vkljuci then 1 else 0 end where id = p_kos returning * into k;
    insert into public.rfid_dogodki (kos_id, tip, opis) values (p_kos, 'ponovno', case when p_vkljuci then 'za ponovno pranje' else 'oprano' end);
  end if;
  return json_build_object('madez', k.madez, 'madez_at', k.madez_at, 'ponovno', k.ponovno, 'ponovno_at', k.ponovno_at, 'ponovno_st', k.ponovno_st);
end $$;
revoke all on function public.rfid_oznaka(uuid, text, boolean) from public, anon;
grant execute on function public.rfid_oznaka(uuid, text, boolean) to authenticated;

-- oddaja kosa (rfid_potrdi zapiše zadnji_tip = 'oddaja' in zadnjic) konča ponovno pranje
create or replace function app.rfid_ponovno_ob_oddaji() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if new.ponovno and new.zadnji_tip = 'oddaja' and (old.zadnji_tip is distinct from 'oddaja' or new.zadnjic is distinct from old.zadnjic) then
    new.ponovno := false; new.ponovno_at := null;
    insert into public.rfid_dogodki (kos_id, tip, opis) values (new.id, 'ponovno', 'končano ob oddaji');
  end if;
  return new;
end $$;
revoke all on function app.rfid_ponovno_ob_oddaji() from public, anon, authenticated;
drop trigger if exists trg_rfid_ponovno_oddaja on public.rfid_kosi;
create trigger trg_rfid_ponovno_oddaja before update of zadnji_tip, zadnjic on public.rfid_kosi
  for each row execute function app.rfid_ponovno_ob_oddaji();
