-- Saca la escritura con la anon key de los buckets comprobantes-gastos y
-- banners-servicios. La anon key es pública (va en el navegador), así que con
-- estas políticas cualquiera podía subir archivos o pisar los banners de la
-- landing. Desde el commit que agrega este archivo, la app sube con el
-- service role (src/lib/dataAccess/storage.ts), que no pasa por RLS.
--
-- Aplicar DESPUÉS de que ese commit esté desplegado en Vercel: si se aplica
-- antes, subir comprobantes y banners falla hasta el deploy.
-- No toca la lectura pública de los archivos (las URLs que ya están guardadas
-- siguen funcionando) ni el bucket privado camara-fila.

drop policy if exists "anon insert comprobantes-gastos" on storage.objects;
drop policy if exists "anon update comprobantes-gastos" on storage.objects;
drop policy if exists "anon insert banners-servicios" on storage.objects;
drop policy if exists "anon update banners-servicios" on storage.objects;
