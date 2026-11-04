# H4 — Integración Taxonomía MK-010 (Backend #41)

Fecha de revisión: 2026-11-04. Estado: integración frontend parcial; PR en borrador pendiente de publicar.

## SHA y recuperación

| Repositorio / referencia | SHA / estado |
| --- | --- |
| Frontend `origin/master` actualizado usado como base | `095a591a3e096614e76b4d99e623ecbba43f6c1f` |
| Frontend PR #65, HEAD recuperado | `715ae909b1fc8cf45598c863f787b284dd2367ec` |
| Frontend commit recuperado con `cherry-pick -x` | `fddc6cb` (incluye `(cherry picked from commit 715ae90…)`; autor original conservado) |
| Docs oficial consultado | `cb7eec179f812d38929e20c5ab6f7a77139c4090` |
| Backend PR #131 / checkout local de solo lectura | `ca166aa7a00b6c42286a94ccad0410f11384d03e`; el PR solo declara persistencia, sin endpoints ni lógica de negocio |
| Backend de referencia histórica citado por PR #65 | `606e36ce668b46b01a8681ea6028d93e0b02f7e5`; no se considera evidencia vigente de implementación |

`origin/master` tenía tres commits posteriores al ancestro común `4fc3642aadde7723e35044d1a03f7512499c375d` de PR #65. Se aplicó únicamente el commit de López sobre el `master` actualizado. El estado `mergeable=false` reportado por GitHub se manifestó como conflicto local en `README.md`; no se integraron ramas compartidas ni se modificó el HEAD de López.

La consulta GitHub del HEAD recuperado no devolvió status checks ni workflow runs para `715ae90…`. Los resultados `8/8`, `18/18`, typecheck/lint/build y viewport que PR #65 enumera en su descripción no se pudieron asociar a una ejecución CI del SHA actual y quedan como afirmaciones históricas sin verificar.

## Conflictos y preservación de `master`

- `README.md`: conflicto entre el inventario histórico del master y la nueva descripción MK-010. Se preservó el estado reciente de Productos/SKU de master y se incorporó la descripción acotada de Taxonomía, manteniendo los avisos de #109 y la prueba real pendiente.
- `src/main.tsx`: Git lo fusionó automáticamente. Se mantuvieron los runtimes/provider existentes de Pricing, Catalog, Bulk, Combos y Promociones; el delta añade el transporte de listado Taxonomy sobre la sesión G7 ya creada por Promociones. No se creó una segunda sesión.
- Sin otros conflictos de cherry-pick. Se registraron en total 2 archivos con resolución/auto fusión.

## Operación contractual

| `operationId` | Método y ruta | Request / respuesta | Seguridad y estado |
| --- | --- | --- | --- |
| `listarTiposProducto` | `GET /api/v1/tipos-producto` | Query `pagina` (mínimo 1), `tamanio` (1–100, default 20); respuesta `{ items, meta }`, `meta` incluye `pagina`, `tamanio`, `total`, `totalPaginas`. Cada fila `TipoProductoAdmin` expone `tipoProductoId`, `nombre`, `estado`, `schemaVersion`. | `userBearer`; 401 `TOKEN_INVALIDO`, 403 `SCOPE_INSUFICIENTE`, 500 `ERROR_INTERNO`, 503 `SERVICIO_NO_DISPONIBLE`. OpenAPI 0.6.0-rc.2 la marca `provisional-internal`. |

El adapter solicita `tamanio=100` (máximo contractual), respeta `items/meta` y verifica consistencia de páginas y estados `ACTIVO` e `INACTIVO`. Hay una discrepancia normativa pendiente para `PENDING_DEACTIVATION`: el DTO `TipoProductoAdmin.estado` refiere `EstadoEntidad`, cuyo enum solo contiene `ACTIVO`/`INACTIVO`; `PENDING_DEACTIVATION` existe en OpenAPI como estado de seguimiento de una operación asíncrona. El adapter rechaza ese valor en el DTO de listado hasta que el owner del contrato publique una revisión que lo permita. No agrega conteos de características ni límite del esquema, que no están publicados en este DTO. La lista vacía válida es `items: []`, `total: 0`, `totalPaginas: 0`.

## Configuración y seguridad

- Selección única: `VITE_DATA_MODE=api`; el modo `mock` conserva sus fixtures cuando se elige expresamente.
- `VITE_GATEWAY_ORIGIN` se valida mediante `secureBase`: HTTPS obligatorio excepto loopback local; sin usuario, contraseña, query, fragmento o ruta.
- `VITE_G7_API_BASE` configura la sesión existente de Promociones. El adapter Taxonomy reutiliza `promotions.session.getAccessToken`; no contiene credenciales ni token propio. Sin token, la consulta muestra un mensaje de inicio de sesión.
- El request GET usa `credentials: omit`, `redirect: error`, `cache: no-store`, conserva el `AbortSignal`, aplica timeout de 15 s y envía un `X-Correlation-Id` estable durante la paginación.
- 401/403/5xx se muestran como estado HTTP sin leer cuerpos de error sensibles; fallos de red se reducen a un mensaje genérico. Modo API no vuelve a fixtures. Las demás operaciones Taxonomy siguen bloqueadas.
- El cliente compartido sigue pendiente en Frontend #45 / Backend #109; la frontera Taxonomy es provisional hasta su composición.

## Implementación vs disponibilidad real

El commit Frontend integra el consumer y la ruta está en el catálogo de rutas de Gateway del checkout Backend #131. Sin embargo, Backend #37 sigue reportado como pendiente de implementación de consultas; #144 describe que en master Taxonomy conserva GET de categorías y marcas, y PR #131 declara no añadir endpoints. No se encontró evidencia de un controlador de `listarTiposProducto`, despliegue, grant o Gateway→Taxonomy→PostgreSQL en ejecución. Por tanto, esta PR **no declara** la operación integrada end-to-end ni recomienda habilitarla contra un entorno compartido hasta recibir esa evidencia.

La ruta del contrato exige `userBearer`; no se probó JWT G7 real. El recorrido demo sin JWT no se probó y no se modificaron guards ni se introdujo bypass. Para desbloquear la operación real se requiere que el owner de Taxonomy (López) publique implementación del provider y pruebas del operationId; Marco/Gateway debe verificar su ruta y autorización efectiva. Luego se podrá probar la petición por Gateway con PostgreSQL descartable y, por separado, con un JWT legítimo de G7/grant concedido.

## Pruebas y resultados

| Capa | Resultado | Evidencia / causa |
| --- | --- | --- |
| Unit/UI Taxonomy | `NO EJECUTADO` | El intento `npx vitest run --config src/features/taxonomy/adapters/vitest.config.ts` falló antes de cargar pruebas porque no había `vitest` instalado. `npm ci` quedó sin progreso en dos esperas; cancelado. Node disponible `v24.3.0` no satisface `>=22.12.0 <23`. |
| Typecheck, lint, build mock/API | `NO EJECUTADO` | Dependencias locales no instaladas; falta Node de versión soportada. |
| Smoke/Playwright MK-010 | `NO EJECUTADO` | Mismo bloqueo de runtime/dependencias y Chromium no verificado. |
| React → Gateway → taxonomy-svc → PostgreSQL local | `PENDIENTE` | No se levantaron servicios ni PostgreSQL desechable; además #37 no acredita controlador de listado en el SHA revisado. |
| JWT autenticado emitido por G7 | `PENDIENTE` | Sin token/grant verificable; pruebas de adapter usan solo respuestas locales simuladas. |
| E2E desplegado | `PENDIENTE` | No se hizo despliegue ni llamada a entorno compartido. |

## Errores corregidos en esta revisión

- `tamanio=200` excedía el máximo 100 de OpenAPI; se cambia a 100.
- La validación del DTO ahora exige metadatos completos y coherentes, tamaños/página/total estables, páginas sin saltos, filas completas y ausencia de IDs repetidos; errores JSON/DTO se convierten a mensajes genéricos.
- La composición Taxonomy en modo API sin Gateway ya no lanza durante la evaluación de servicios importados estáticamente; devuelve adapters cerrados y muestra bloqueo, para que la aplicación pueda iniciar.
- Se añadieron pruebas para multi-página, lista vacía, estados, DTO/meta inválidos, JSON ilegible, 401/403/500/503, red, cancelación, falta de sesión y mock explícito. Su ejecución sigue pendiente por el entorno indicado.

## Alcance fuera de este incremento

MK-008 categorías, MK-009 características, MK-011 marcas y MK-012 SEO no se conectan por API. En MK-010 no se habilitan detalle, creación, esquema, asociaciones, baja, reactivación ni seguimiento de operaciones. Permanecen fuera de alcance y bloqueadas en modo API hasta adapters, contratos aplicables y pruebas específicas.

## Pendientes concretos para Backend #41

1. López: implementar y probar `listarTiposProducto` conforme a OpenAPI 0.6.0-rc.2, incluyendo DTO, paginación, autorización y persistencia.
2. Marco/Gateway: verificar route mapping, propagación de autorización/correlation, 401/403/5xx y conectividad al upstream real.
3. Contrato owner: resolver el estado `PENDING_DEACTIVATION` para `TipoProductoAdmin.estado` (actualmente enum incompatible); publicar OpenAPI revisado si corresponde.
4. Ejecutar Gateway + Taxonomy + PostgreSQL de prueba con evidencia asociada a cada SHA; separar esa integración del test de adapter.
5. Probar token/grant real G7 y permisos; mantener el resultado `PENDIENTE` hasta que exista evidencia auténtica.
6. Incorporar Taxonomy al cliente HTTP compartido #109/#45 y repetir validaciones con Node 22 y CI del SHA remoto.
