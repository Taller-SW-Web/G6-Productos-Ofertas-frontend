# Auditoría CI H5 — Frontend (en curso)

Referencia de diagnóstico: `7937e0220f2220ce1b2ab7c7acd78d7499a3067a`;
[CI 46103270154](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/46103270154). El job API real aislada falló antes de ejecutar Playwright por permisos de lectura de `server.key` del servidor G5 sintético. Ningún escenario de esa suite queda acreditado por ese fallo.

El run terminó en FAIL, incluido `validate`. Los shards E2E generales informaron: parte 1, 168 PASS y 2 SKIP; parte 2, 187 PASS; parte 3, 146 PASS; parte 4, 165 PASS y 6 SKIP. Los casos omitidos aún requieren clasificación; estas cifras no acreditan las tres suites de API real.

En la copia local se fijan los SHA de Backend y Docs y se exige que coincidan antes de registrar evidencia. El SHA de Backend debe actualizarse si cambia el PR #310. La corrección local de propietario TLS requiere ejecución Linux y CI sobre un HEAD publicado. El validador Playwright falla ante reintentos, resultados incompletos, skips y conteos inconsistentes.

El pin de Backend para el siguiente CI es `d2dc998fd81448ebb2130578dc0b6a7ff16113dd`; Docs permanece en `5f30802129ba4bbc0674dcc5878f10065f443118`. Aún no hay resultado de API real para esa combinación de SHA.

En la copia local con cambios sin commit: `npm test` PASS (Combos 239, Bulk 98, Inventory 132 + 8, Pricing 166, Taxonomy 111 y política release 35: 789 pruebas), y lint, typecheck y 75 pruebas focalizadas PASS. La ejecución local usó Node 24, mientras el proyecto exige Node 22; no reemplaza CI del HEAD publicado.

G7 local es sintético; no prueba grants reales. El resultado de escaneo de diff no acredita el historial completo. No se verificaron las alertas CodeQL ni la configuración predeterminada por falta de acceso a la API. El workflow de Vercel no presenta diferencias respecto de master; no se ha desplegado.
