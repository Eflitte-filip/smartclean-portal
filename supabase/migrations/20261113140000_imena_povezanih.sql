-- Povezan zaposleni (Prisotnost) in njegov račun (Uporabniki) sta ista oseba: ime je povsod isto —
-- Prisotnost, Uporabniki, terminal za štemplanje, listi za ure, izvozi.
-- Preimenovanje na eni strani preimenuje tudi drugo. Ob povezavi velja ime zaposlenega (polno ime iz Prisotnosti).
-- Lastnikov račun še vedno preimenuje le lastnik (app.profiles_zascita_pravic): preimenovanje njegovega
-- zaposlenega s strani drugega admina se zavrne z istim sporočilom.

create or replace function app.ime_zaposleni_v_racun() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if new.profile_id is null or nullif(btrim(coalesce(new.ime, '')), '') is null then return new; end if;
  if tg_op = 'UPDATE' and new.ime is not distinct from old.ime and new.profile_id is not distinct from old.profile_id then return new; end if;
  update public.profiles set full_name = new.ime where id = new.profile_id and full_name is distinct from new.ime;
  return new;
end $$;

create or replace function app.ime_racun_v_zaposleni() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if nullif(btrim(coalesce(new.full_name, '')), '') is null or new.full_name is not distinct from old.full_name then return new; end if;
  update public.employees set ime = new.full_name where profile_id = new.id and ime is distinct from new.full_name;
  return new;
end $$;

revoke all on function app.ime_zaposleni_v_racun() from public, anon, authenticated;
revoke all on function app.ime_racun_v_zaposleni() from public, anon, authenticated;

drop trigger if exists trg_employees_ime_racun on public.employees;
create trigger trg_employees_ime_racun after insert or update of ime, profile_id on public.employees
  for each row execute function app.ime_zaposleni_v_racun();

drop trigger if exists trg_profiles_ime_zaposleni on public.profiles;
create trigger trg_profiles_ime_zaposleni after update of full_name on public.profiles
  for each row execute function app.ime_racun_v_zaposleni();

-- Poravnava obstoječih povezav: velja ime zaposlenega (2026-11-13 le »Filip« → »Filip Noe Kovačič«, po izbiri lastnika).
update public.profiles p set full_name = e.ime
  from public.employees e
 where e.profile_id = p.id and nullif(btrim(coalesce(e.ime, '')), '') is not null and p.full_name is distinct from e.ime;
