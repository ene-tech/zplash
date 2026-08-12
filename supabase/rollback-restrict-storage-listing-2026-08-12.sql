-- ROLLBACK de restrict-storage-listing-2026-08-12.sql.
--
-- Al sacar SELECT de la política de anon sobre storage.objects se rompió
-- el registro de gastos: subirComprobanteGasto() empezó a devolver null
-- ("No se pudo subir el documento adjunto. Intenta de nuevo."). Causa
-- probable: el upload de Supabase Storage hace un INSERT ... RETURNING
-- sobre storage.objects, y bajo RLS el RETURNING exige que la fila recién
-- insertada sea visible para una política de SELECT -- sin ella, el
-- insert puede completarse pero el cliente nunca recibe la fila de vuelta.
--
-- Esta app no tiene identidad por request (todo pasa por la misma anon
-- key desde el servidor, sin Supabase Auth), así que no hay forma de
-- acotar el SELECT a "solo la fila que vos insertaste" -- o se permite
-- SELECT sobre el bucket entero (lo que reabre el listing que marcó el
-- linter) o no se permite nada y se rompe el upload. Se vuelve a la
-- política "for all" original hasta resolver esto con un service role
-- key server-side (bypassa RLS, no requiere política para anon en
-- absoluto) en vez de la anon key para subirComprobanteGasto/
-- subirBannerServicio.

drop policy if exists "anon insert comprobantes-gastos" on storage.objects;
drop policy if exists "anon update comprobantes-gastos" on storage.objects;

drop policy if exists "anon full access comprobantes-gastos" on storage.objects;
create policy "anon full access comprobantes-gastos" on storage.objects
  for all to anon
  using (bucket_id = 'comprobantes-gastos')
  with check (bucket_id = 'comprobantes-gastos');

drop policy if exists "anon insert banners-servicios" on storage.objects;
drop policy if exists "anon update banners-servicios" on storage.objects;

drop policy if exists "anon full access banners-servicios" on storage.objects;
create policy "anon full access banners-servicios" on storage.objects
  for all to anon
  using (bucket_id = 'banners-servicios')
  with check (bucket_id = 'banners-servicios');
