-- Bucket de la foto de la fila de entrada: la sube el PC del local
-- (scripts/subir-foto-fila.ps1) y la ve el cliente con plan vigente desde el
-- Portal Cliente (/api/cliente/fila).
--
-- Privado y SIN ninguna política para anon, a diferencia de
-- comprobantes-gastos y banners-servicios (públicos, ver
-- restrict-storage-listing-2026-08-12.sql): acá la imagen es de una cámara
-- del local y solo debe verla un cliente con plan, y la anon key viaja al
-- navegador de cualquiera. Todo el acceso pasa por el servidor, que sube y
-- firma URLs de 60s con la service role key (ver @/lib/supabaseAdmin) --
-- esa clave salta RLS, así que no hace falta ninguna policy.
insert into storage.buckets (id, name, public)
values ('camara-fila', 'camara-fila', false)
on conflict (id) do nothing;
