# Fragmentos E2E

Los cuatro manifiestos listan rutas completas de specs que Playwright detecta con `playwright test --list`. Cada ruta debe aparecer una sola vez. `node scripts/ejecutar-e2e-balanceado.mjs --validar` compara inventario y manifiestos y termina con error ante archivos faltantes, adicionales o duplicados; no cambia a otro método de distribución.

La distribución vigente se equilibró usando las duraciones por prueba de los cuatro artefactos Playwright del run [43524349968](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/43524349968), descargados y combinados con `playwright merge-reports --reporter=json`. Se sumaron las duraciones históricas por archivo y se asignaron primero los archivos más costosos al fragmento con menor carga acumulada. Las cargas estimadas quedaron entre 7,77 y 7,78 minutos; la duración real por fragmento se medirá en la siguiente CI y puede variar.

Todos los specs, incluidos aquellos con pruebas omitidas condicionalmente, permanecen asignados. Las pruebas se ejecutan con `workers=1` por fragmento.
