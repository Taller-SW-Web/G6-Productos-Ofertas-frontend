# Proyección Frontend del manifest Catalog H5

Estos archivos versionados permiten que las pruebas ordinarias de Frontend funcionen sin un checkout Backend, ruta personal, Azure, G7, credenciales o Supabase. La fuente canónica es Backend; `source.json` fija el commit exacto `6c5062c9282ab6ea47087fd99f6b365df25d5e0e` y el SHA-256 de los bytes de `manifest.json` (`5a7af6aecae09307b4cab75ffcb9d822fe789d349e568d5edfc45641a73201ac`).

Desde la raíz Frontend:

```powershell
node --test tests/fixtures/h5/catalog/manifest.test.mjs
node scripts/sync-catalog-h5-fixtures.mjs --check --backend-repo '..\G6-Productos-Ofertas-backend-poma-h5-quality' --source-commit 6c5062c9282ab6ea47087fd99f6b365df25d5e0e
```

La primera validación es local e independiente. La segunda es una comprobación cruzada opcional para revisión/sincronización y requiere que el commit Backend fijado esté disponible. Para actualizar la copia, ejecutar el mismo comando sin `--check` y con el nuevo commit Backend que contiene el manifest. Revisar el diff de los tres archivos, ejecutar ambos comandos y actualizar el commit/documentación de procedencia antes de publicar el HEAD Frontend final.
