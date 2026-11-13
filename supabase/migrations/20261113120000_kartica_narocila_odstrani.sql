-- ═══════════════════════════════════════════════════════════════════════════
--  Zahteve za kartico iz portala niso potrebne (odločitev 2026-11-13)
--
--  Kartice zaposlenim dodaja le skrbnik na C72 (aplikacija RFID → Kartica
--  zaposlenega), kadarkoli; portal pokaže le, ali jo ima. Tabela iz
--  20261113110000_kartica_narocila ni bila nikoli uporabljena (prazna).
--  Varno za ponoven zagon.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kartica_narocila') then
    alter publication supabase_realtime drop table public.kartica_narocila;
  end if;
end $$;

drop table if exists public.kartica_narocila;
