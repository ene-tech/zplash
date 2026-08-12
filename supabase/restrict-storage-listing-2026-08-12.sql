-- Supabase Database Linter marcó WARN "Public Bucket Allows Listing"
-- (2026-08-12): el bucket público comprobantes-gastos tiene una política
-- "for all to anon" en storage.objects (creada en
-- add-contabilidad-completo.sql / schema.sql), que además de permitir subir
-- el comprobante también le da SELECT a cualquiera con la anon key -- y
-- SELECT sobre storage.objects es lo que habilita `.list()`, es decir,
-- listar todos los nombres de archivo del bucket.
--
-- No hace falta: los buckets públicos sirven cada objeto por
-- /storage/v1/object/public/{bucket}/{path} sin mirar RLS (solo chequean
-- buckets.public = true), así que getPublicUrl() sigue funcionando igual.
-- El código (src/lib/dataAccess/storage.ts) solo hace
-- .upload(..., {upsert:true}) y .getPublicUrl(...) -- nunca .list() ni
-- .remove() -- así que a anon le alcanza con INSERT + UPDATE (el upsert
-- necesita UPDATE cuando el path ya existe); se saca SELECT y DELETE.
--
-- banners-servicios (add-web-settings-banners.sql) tiene el mismo patrón
-- "for all to anon" para el mismo motivo ("mismo patrón que
-- comprobantes-gastos", dice su propio comentario) y el mismo riesgo,
-- aunque el linter solo mostró comprobantes-gastos en este pase -- se
-- corrige acá también.
--
-- contenido-whatsapp (usado en subirImagenBotWhatsapp, storage.ts) no tiene
-- bucket ni política creados en ningún .sql de este repo -- se creó a mano
-- en el dashboard. Si tiene el mismo patrón "for all to anon", revisar y
-- angostar ahí también (Storage > Policies en el dashboard de Supabase).

drop policy if exists "anon full access comprobantes-gastos" on storage.objects;

drop policy if exists "anon insert comprobantes-gastos" on storage.objects;
create policy "anon insert comprobantes-gastos" on storage.objects
  for insert to anon
  with check (bucket_id = 'comprobantes-gastos');

drop policy if exists "anon update comprobantes-gastos" on storage.objects;
create policy "anon update comprobantes-gastos" on storage.objects
  for update to anon
  using (bucket_id = 'comprobantes-gastos')
  with check (bucket_id = 'comprobantes-gastos');

drop policy if exists "anon full access banners-servicios" on storage.objects;

drop policy if exists "anon insert banners-servicios" on storage.objects;
create policy "anon insert banners-servicios" on storage.objects
  for insert to anon
  with check (bucket_id = 'banners-servicios');

drop policy if exists "anon update banners-servicios" on storage.objects;
create policy "anon update banners-servicios" on storage.objects
  for update to anon
  using (bucket_id = 'banners-servicios')
  with check (bucket_id = 'banners-servicios');
