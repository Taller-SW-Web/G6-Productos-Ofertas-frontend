# Proyección Frontend del manifest Catalog H5

Estos archivos versionados permiten que las pruebas ordinarias de Frontend funcionen sin un checkout Backend, ruta personal, Azure, G7, credenciales o Supabase. La fuente canónica es Backend; `source.json` fija el commit exacto `e8e1441b5679c2bfa61aef75282f34372ad1d208` y el SHA-256 de los bytes de `manifest.json` (`daa35f39f2ab6a5d365c6a5ba21fc96a4d2178a0ddf2850602a1fed897feee83`).

Desde la raíz Frontend:

```powershell
node --test tests/fixtures/h5/catalog/manifest.test.mjs
node scripts/sync-catalog-h5-fixtures.mjs --check --backend-repo '..\G6-Productos-Ofertas-backend-poma-h5-quality' --source-commit e8e1441b5679c2bfa61aef75282f34372ad1d208
```

La primera validación es local e independiente. La segunda es una comprobación cruzada opcional para revisión/sincronización y requiere que el commit Backend fijado esté disponible. Para actualizar la copia, ejecutar el mismo comando sin `--check` y con el nuevo commit Backend que contiene el manifest. Revisar el diff de los tres archivos, ejecutar ambos comandos y actualizar el commit/documentación de procedencia antes de publicar el HEAD Frontend final.
