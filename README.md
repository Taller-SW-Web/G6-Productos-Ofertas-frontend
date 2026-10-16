# Productos y Ofertas — Frontend

React/TypeScript/Vite con Mantine y Tabler. Integra **MK-005 Cupones, MK-006 Promociones y MK-007 Recomendaciones (19 pantallas)**. **MK-013 / issue #15** cubre S01–S06 con puertos de datos sustituibles. Estado: **MOCK_INTEGRATED / MOCK_REPLACEABLE**, comprobado con un segundo adapter independiente y las mismas páginas. **Q-013-01/02** mantienen bloqueados el parser y la admisión de archivos; la política de cambio de moneda también requiere definición de Pricing. No hay integración HTTP ni escritura comercial real. Las muestras `/foundation/*` se conservan como galería independiente en desarrollo.

## Ejecutar y validar

Requisitos: Node **>=22.12.0** y npm. Las dependencias están fijadas en `package-lock.json`; el gestor único es npm.

```powershell
npm ci
npm run dev
```

Abrir `http://127.0.0.1:5173/precios`, `/cupones`, `/promociones` o `/recomendaciones`. Para validar la demostración:

```powershell
npm run typecheck
$env:VITE_DATA_MODE = 'mock'
npm run build
npm run lint
npm run test
npx playwright install chromium
npm run test:e2e:smoke:bulk
```

El modo `mock` funciona sin Backend, Docs ni credenciales. Solo el servidor de desarrollo admite `mock` como valor predeterminado. **Todo build de producción exige `VITE_DATA_MODE=mock` o `api` explícito**; sin valor o con uno inválido, falla. `.env.example` documenta la demostración: copiarlo a `.env.local` selecciona mocks intencionalmente. Para un despliegue destinado al backend real, configurar `api` en el entorno de build. Inter/Oswald y el logo se sirven como assets locales. `npm run preview` permite revisar `dist/` después del build. Un hosting futuro deberá resolver las rutas hacia `index.html`; no se declara desplegada la app.

## Selección de adapters y prueba de sustitución

Para MK-003/MK-004, `createCatalogServices(mode, dependencies)` compone los puertos de
Catálogo y Taxonomía. Las factories `apiCatalog`/`apiTaxonomy` son síncronas y devuelven
repositorios inicializados; si necesitan carga asíncrona, hacer `await` antes de
inyectarlos. En la raíz, envolver la aplicación con `CatalogServicesContext.Provider`
con ese resultado, dentro del `DataModeContext` existente. Las páginas y hooks no cambian.
La inyección explícita tiene prioridad sobre la caché del runtime predeterminado.
Sin provider API, cada puerto falla explícitamente y no carga mocks.

`npm run test` ejecuta las pruebas puras con Vitest en Node, sin iniciar Chromium.
`npm run test:e2e:smoke:bulk` ejecuta los tres recorridos críticos de Bulk con Chromium
headless y un worker. `npm run test:e2e` reserva la suite completa de interfaz para CI
o una ejecución explícita.

`tests/harness/catalog-adapter.html` usa las mismas páginas con otro producto,
otros IDs, atributos LISTA/NUMERO/TEXTO y filtros externos en modo API. Ejecutar
`npm run test:e2e -- tests/catalog-adapters.spec.ts tests/catalog-injection.spec.ts` prueba
sustitución, permisos de reintento y fallos del esquema; no acredita HTTP real.
El harness es de pruebas y no forma parte del build comercial.

El bridge `createTaxonomyServicesAdapter(services, metadata?)` consume los servicios
oficiales incorporados desde la rama de López. Se inyecta como
`createCatalogServices(mode, { taxonomy: bridge })` en ambos modos, conservando IDs,
opciones activas y límites publicados. No crea fixtures ni endpoints. No se activa
sobre los productos históricos hasta confirmar su migración de IDs y los roles
identificadores: ver [coordinación con Taxonomía](docs/COORDINACION_TAXONOMIA_CATALOGO.md).
`tests/catalog-regressions.spec.ts` comprueba ese bridge, guardados sin esquema,
conservación de atributos, atomicidad, IDs con reloj congelado y navegación entre padres.

El formulario de variantes usa IDs de características/opciones, no nombres editables.
El adapter de Taxonomía debe aportar rol identificador y límite configurado de texto;
su ausencia bloquea el guardado. Los límites numéricos solo se aplican si el esquema
los define. El OpenAPI consultado y el servicio de López aún no publican todos esos
metadatos: ver [auditoría MK-003/MK-004](docs/AUDITORIA_CATALOGO_MK003_MK004.md).
`taxonomyFixtures.ts` conserva exclusivamente la demostración anterior de Catálogo;
no es una segunda autoridad contractual ni debe utilizarse para completar un provider
real. La conexión definitiva con Taxonomía requiere mapear sus IDs y cerrar los
metadatos pendientes, sin copiar el módulo ni modificar sus servicios.

`VITE_DATA_MODE=mock|api` es la única configuración global, leída una vez en `src/main.tsx` y distribuida mediante `DataModeContext`. `src/features/pricing/services/pricingService.ts` compone el adapter de Pricing con ese modo: `mock` crea una instancia propia del repositorio de memoria, reloj de exposición y herramientas aisladas de desarrollo. `api` usa un factory inyectado compatible; mientras no se implemente y configure, muestra **«adapter API de Pricing no está configurado»**. Un fallo de API se propaga como error; no hay fallback al mock. Cambiar la variable requiere reiniciar Vite/reconstruir producción.

`src/app/config/dataMode.ts` valida la configuración tanto en Vite como al iniciar la app; no selecciona un segundo adapter. En modo `api`, Cupones/Promociones/Recomendaciones permanecen deshabilitados porque sus providers HTTP todavía no existen: la barrera común del shell evita cargar sus adapters mock. Sus 19 pantallas funcionan en la demostración explícita. Un error de catálogo en Pricing ofrece **Volver a cargar productos y SKU**, reutilizando la misma instancia del adapter y conservando la aplicación y URL.

Las páginas/hooks usan `PricingProvider` y el puerto `PricingRepository`: catálogo de productos/SKU, lecturas, escrituras, prevalidación `File + allowPartial` y reportes `Blob + filename`. No importan targets/fixtures ni reciben `scenario`. El contexto mantiene IDs opacos y la asociación `productTargetId`; no deriva producto desde SKU ni usa `base` como identidad productiva. Las monedas se conservan desde la lectura; no se habilita conversión ni elección de otra moneda sin política publicada. La validación preliminar de oferta programada consulta la vigencia correspondiente al inicio; la validación definitiva pertenece a Pricing.

`tests/harness/pricing-adapter.html` monta el mismo `App` con `AlternatePricingRepository`: cafetera, otro UUID de producto, otro SKU, moneda CHF y otro lote. El harness es de pruebas, servido por Vite en desarrollo y ausente del build de producto; no es una ruta comercial. Ejecutar `npm run test:e2e -- tests/pricing-audit.spec.ts` verifica sustitución, entradas de archivo/política, errores sin fallback y descarga del archivo de ese adapter.

## Rutas y límites

**MK-014 / issue #16** añade el historial de auditoría de precios, independiente del precio vigente y del histórico as-of de MK-013. Son cinco vistas/variantes sobre puertos sustituibles: listado, detalle y no encontrado en modal, exportación CSV y PDF. La entrega inicial está publicada en `vera@6903d9ddd39be8a671a5909dd790a90614ca7161`, [PR #26](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/pull/26), abierta hacia `master`. Su [CI aprobado](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/38353389421) registra **156 pruebas aprobadas**, builds y smoke tests mock/API. Las [evidencias de CI](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/38353389421/artifacts/11791379951) y [VALIDACION_MK014.md](docs/VALIDACION_MK014.md) registran fuentes, capturas, correcciones posteriores y bloqueos. Publicación no equivale a aprobación final ni merge.

| Ruta MK-014 | Alcance |
|---|---|
| `/precios/auditoria` | S01: seis filtros aplicados explícitamente, orden descendente y paginación 1/20, hasta 200 por página |
| `/precios/auditoria/asientos/:auditId` | S02: modal 640 px de solo lectura; S03 cuando el puerto devuelve no encontrado. Cerrar conserva filtros/página/foco |
| `/precios/auditoria/exportar/csv` | S04: solicitud del resultado completo, límite inclusive 100 000, seguimiento y descarga de muestra |
| `/precios/auditoria/exportar/pdf` | S05: mismo flujo, límite inclusive 500; CSV alternativo solo cuando el total conocido cabe en ese formato |

Los filtros son `sku`, `desde`, `hasta`, `usuarioId`, `canal` y `batchId`; usuario y canal admiten referencias conocidas sin inventar catálogos de búsqueda. Desde/hasta son instantes con zona en URL, editados como fecha/hora de America/Bogota (UTC−5). El rango inválido no consulta. `pagina/tamanio` son contexto del listado y no se envían a la solicitud de exportación. `exportId` conserva una referencia recibida para consultar el trabajo; abrir una URL no crea una exportación. Estos parámetros de navegación no equivalen por sí mismos a DTO HTTP.

Los asientos no tienen editar/eliminar/revertir. Null mantiene su significado («Sin precio anterior», «Sin oferta», «No aplicable»); un cero recibido sigue siendo cero. Actor/email/IP desconocidos se muestran «No informado», sin inferir identidad. Una denegación de sesión/acceso retira los datos, incluido el listado bajo el modal. **Q-014-01** sigue abierto: no se atribuye moneda histórica ni se toma la de Pricing. No hay integración HTTP, consumo de eventos, deduplicación, retención o archivado implementados por esta UI.

`src/features/price-audit/services/auditService.ts` compone el runtime a partir del mismo `DataModeContext`/`VITE_DATA_MODE` global. En `api`, la ausencia o fallo del provider es explícita y nunca sustituye datos por fixtures. Los componentes reciben modelos internos con importes decimales como strings, sin escenarios ni imports de mocks. `tests/harness/audit-adapter.html` monta el mismo App con otro adapter: cafetera, otros IDs/SKU, alta precisión y bytes/nombre de reporte propios. Es una entrada de pruebas excluida del build productivo.

Las exportaciones conservan el estado de solicitud separado del de generación y descarga. El servicio reevalúa límites al solicitar; un rechazo no crea ID. Una respuesta incierta sin ID bloquea repetir el envío; con ID se reintenta GET, sin otro POST. El seguimiento consulta cada dos segundos mientras el trabajo siga pendiente y también admite consulta manual. Solo un trabajo completado con recurso disponible permite descargar; una descarga fallida conserva la generación confirmada. Los endpoints de exportación/seguimiento siguen `provisional-internal`; autenticación y autorización reales no están integradas.

La demo usa registros fijos de septiembre/octubre de 2026 y un reloj de trabajos `2026-10-02T12:00:00Z`, fiel a las fuentes de MK-014. CSV/PDF son **archivos de muestra preparados**, no archivos creados por un backend ni garantías de que su contenido represente los filtros actuales. El PDF incluye esta aclaración y «Moneda no informada». En DEV y mock, `/precios/auditoria?modoRevision=1` habilita controles en `mocks/AuditReviewTools`; en producción/API se ignoran. Los totales 500/501 y 100 000/100 001 de revisión son metadatos de prueba, sin arrays gigantes.

Las correcciones P1/P2 están publicadas en **`3b1d705522ff2bdbd0a7b5240afaff517c1fdaff`**, con **160 pruebas completas aprobadas localmente**, 22 de MK-014, builds y smoke tests en ambos modos. Su [ejecución de CI y evidencias](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/38457417369) se distingue del CI inicial de 156 casos; los resultados del último SHA del PR están en [Checks de #26](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/pull/26/checks). El listado se recupera después de una denegación solo tras una nueva lectura autorizada; se conservan literalmente los orígenes abiertos sin etiqueta conocida y se validan fechas existentes, horas y zona, sin aceptar normalizaciones de Date.parse. Al cambiar `exportId` se invalidan inmediatamente trabajo/errores anteriores y se cancelan lecturas/descargas pendientes; solo se descarga el ID y formato actuales confirmados. Cuatro pruebas de regresión amplían la suite de 156 a 160 casos.

Fuentes MK-014: revisión inicial Docs `78a923bbc6bada31b39b3d386331f90a4f812b31`; auditada nuevamente en `master@942bf7322eb388fe5b0fcc9c5a565152e1099139`, sin cambios de blobs en las fuentes de MK-014, UX y contratos. `component-spec/plan/tasks` 1.0.0 En revisión, sin validation-report oficial. DESIGN 1.1.0 y UX 2.0 tienen los mismos blobs que la revisión base del theme. Se corrigen en React los importes S/ inventados, el código técnico del 404, los badges decorativos y las promesas de firmas del HTML, siguiendo SPEC/UX/DESIGN. La revisión técnica/funcional/UX independiente permanece pendiente; se usa `Refs #16`, sin cerrar el issue.

**MK-001 / issue #3** cubre la carga y exportación masiva de productos (Castilla), abarcando cinco pantallas sobre la navegación transversal:

| Ruta MK-001 | Alcance |
|---|---|
| `/carga-masiva` | S01: Selección de archivo, validación estructural preliminar (CSV/XLSX), desglose de aspectos no verificados y prevención de continuación sin archivo |
| `/carga-masiva/revisar` | S02: Revisión preliminar de metadatos, aviso explícito de validación local no comercial y protección estricta contra doble envío simultáneo |
| `/carga-masiva/importaciones/:batchId` | S03: Seguimiento de importación en estados `QUEUED` / `PROCESSING`, desglose de filas por dominio si está disponible y aviso explícito en XLSX |
| `/carga-masiva/importaciones/:batchId/resultado` | S04: Resultado terminal de importación, descarga de reporte de errores, reanudación controlada cuando `needs_reconciliation` y estado terminal |
| `/carga-masiva/descargas` | S05: Descargas de plantillas de muestra CSV y solicitud/descarga de exportación masiva consolidada |

**Limitaciones contractuales y de simulación XLSX:** La importación y descarga XLSX completas requieren integración con el servicio backend (`bulk-svc`). En el navegador, la validación XLSX es una revisión preliminar de contenedor (verificación del directorio central ZIP y entradas canónicas OOXML como `[Content_Types].xml` y `xl/`) sin descomprimir hojas completas ni emitir veredictos comerciales. Los lotes XLSX cuyo recuento de filas es desconocido para el cliente se mantienen en estado `PROCESSING` con aviso de verificación pendiente, sin fingir transiciones terminales `COMPLETED` ni inventar resultados de filas.

**MK-002 — Gestión de combos (`MOCK_INTEGRATED`):** implementa S01–S04 como vistas administrativas con puertos tipados y adapters en memoria. Rutas: `/combos` (S01), `/combos/nuevo` (S02 crear), `/combos/:comboId/editar` (S02 editar), `/combos/:comboId` (S03) y `/combos/:comboId/no-disponible` (S04). Se pueden crear, consultar, editar y desactivar combos en la sesión; recargar reinicia los cambios.

Validación local: `npm run test:unit:combos` y `npm run test:smoke:combos`. Vitest usa un worker; el smoke ejecuta Chromium headless a 1440×900, con un worker, sin reintentos, video, capturas ni traces rutinarios.

No hay provider HTTP real ni persistencia comercial. En modo `api`, la integración permanece cerrada y no cae a fixtures. La referencia consultada es OpenAPI `0.6.0-rc.1` en Docs `master@c36bd9a18f4fdb188df0d7e5158a431cf4b4ea7b`: las operaciones administrativas de Combos están marcadas `provisional-internal`; `combos:leer`, `catalogo:leer` y `precios:leer` siguen pendientes de registro de scopes en Seguridad. La disponibilidad se representa como información de fixture, sin consultar ni reservar stock. Las lecturas de Pricing de la demo son globales en PEN; si no existe oferta efectiva, la comparación usa el precio regular. Los productos, ofertas, versiones y estados no se sincronizan con otros módulos. El component spec de MK-002 permanece **En revisión**: esta entrega no declara aprobación UX, homologación ni integración API.

| Ruta | Alcance |
|---|---|
| `/precios` | S01: selección producto/SKU, consulta local, herencia/override, fallback global y estados |
| `/precios/editar` | S02: lectura del objetivo/versionado, oferta, validación, confirmación y conflicto mock |
| `/precios/programaciones` | S03: listado paginado y creación mock futura con zona horaria explícita |
| `/precios/importar` | S04: selección/política y respuestas ficticias de prevalidación; confirmación bloqueada |
| `/precios/importaciones/batch-013-01` | S05: lote ficticio existente, estados, filas y reporte mock independiente del archivo elegido |
| `/precios/historico` | S06: consulta por SKU/canal e instante, independiente del precio vigente |
| `/cupones` | MK-005-S01: listado, filtro por estado y paginación local |
| `/cupones/nuevo` | MK-005-S02: alta con promoción de modalidad cupón, límites y política explícita |
| `/cupones/:couponId/editar` | MK-005-S03: edición sin alterar usos registrados |
| `/cupones/:couponId` | MK-005-S04: configuración y uso del cupón seleccionado |
| `/cupones/:couponId/limites` | MK-005-S05: límites, uso confirmado de fixture y datos no disponibles |
| `/cupones/:couponId/estado` | MK-005-S06: confirmación de activación/desactivación |
| `/promociones` | MK-006-S01: estado/modalidad, paginación, detalle y edición |
| `/promociones/nueva`, `/promociones/:promotionId/editar` | MK-006-S02/S03: beneficio, vigencia, canales, prioridad y política; cambio de modalidad solo con capacidad informada |
| `/promociones/nueva/alcance`, `/promociones/:promotionId/editar/alcance` | MK-006-S04: selección de productos completos y SKU específicos |
| `/promociones/:promotionId`, `/promociones/:promotionId/estado` | MK-006-S05/S06: configuración y cambio de estado |
| `/recomendaciones` | MK-007-S01: estado/tipo, paginación y entradas de alta diferenciadas |
| `/recomendaciones/nueva/venta-cruzada` | MK-007-S02: complementos por producto/categoría |
| `/recomendaciones/:ruleId/editar` | MK-007-S03: edición conservando tipo, identidad y candidatos |
| `/recomendaciones/nueva/upselling` | MK-007-S04: criterio explícito por candidato y justificación opcional |
| Formularios de recomendaciones + `/productos` | MK-007-S05: selección temporal, excluye origen/inactivos/repetidos |
| `/recomendaciones/:ruleId`, `/recomendaciones/:ruleId/estado` | MK-007-S06/S07: detalle ordenado y confirmación de estado |
| `/foundation/listados` | Tabla, filtros, detalle, paginación y muestra opcional de tabla extensa |
| `/foundation/formularios` | Formulario y confirmación de demostración |
| `/foundation/estados` | Feedback y variantes semánticas |
| `/foundation/pricing` | Muestras de componentes S02–S05; no flujos comerciales completos |

`/` redirige a `/precios`; la ruta desconocida ofrece retorno. Los parámetros `target/channel` representan filtros **aplicados** de navegación, no un contrato HTTP. S06 conserva `at` como fecha/hora local de America/Bogota (UTC−5) y lo convierte a un instante explícito dentro del servicio mock. S02 usa `scope=product` para editar la base desde una variante; por defecto una variante propone su propio override. Las entradas de consulta se aplican al pulsar Consultar. Atrás/Adelante restaura el contexto aplicado. Una propuesta sin guardar en S02/S03, o un archivo seleccionado en S04, exige seguir trabajando o descartar explícitamente al navegar, incluso desde sidebar o historial.

Los modelos internos conservan importes como cadenas decimales, moneda como código y fechas como ISO; las etiquetas `S/`, zona y formato legible se aplican solo en presentación. Los cambios confirmados en S02 se reflejan en S01 durante la sesión; S03 no altera anticipadamente el precio actual. Recargar reinicia el mock. Las programaciones están asignadas a su objetivo y se rechaza superposición por objetivo/canal incluso entre regular/oferta. La lista usa páginas de 2 filas del mock; no representa un límite contractual.

El reloj de producción es `systemClock`; las reglas reciben un `Clock`, sin fecha ficticia incrustada. El adapter de exposición fija **17/10/2026 07:00 America/Bogota = `2026-10-17T12:00:00Z`**, señalado en su aviso. Sus precios de octubre tienen intervalo `[2026-10-01T00:00:00Z, 2026-11-01T00:00:00Z)` y son aplicables el 17; después existe una lectura global sin oferta. El archivo normativo sigue registrando otro reloj de fixture, del 2 de octubre; el reloj de exposición es una variante local explícita, no una modificación de Docs.

Para revisar errores en modo mock y desarrollo, añadir `modoRevision=1`. `mocks/PricingDemoPanel` controla un decorador de pruebas; los puertos y páginas no conocen esos escenarios. Ejemplo: `/precios/editar?target=variant40&channel=retail&modoRevision=1`. Las respuestas artificiales se restablecen desde ese panel. S04 entrega archivo/política al puerto, pero el mock normal rechaza prevalidar por Q-013-01/02; únicamente el decorador de revisión ofrece respuestas ficticias seleccionadas explícitamente, sin analizar bytes. La confirmación permanece bloqueada. El ejemplo de lote se abre desde el panel de revisión; en la página se puede introducir una referencia recibida. El reporte se descarga usando bytes/nombre del adapter, mediante un downloader separado. Ver [auditoría H01–H16 y prueba MOCK_REPLACEABLE](docs/AUDITORIA_MK013.md) y el [registro inicial](docs/VALIDACION_MK013.md).

Los tres listados conservan filtros/paginación en URL al abrir detalle, editar y regresar. Los parámetros representan contexto de UI. No hay buscador remoto no publicado ni acciones de consumo/restitución. El router de datos de React Router permite bloquear la salida con borrador pendiente, incluido Atrás; los layouts anidados conservan formularios al abrir/cancelar selectores.

Las escrituras se guardan **en memoria de la pestaña y se reinician al recargar**. Una promoción de modalidad cupón creada en la sesión aparece al crear un cupón. La capacidad de cambiar modalidad procede del servicio: requiere inactividad, ninguna activación histórica, ningún cupón asociado actualmente y ningún uso histórico. Reasignar el último cupón sin uso libera la asociación anterior; no borra activaciones ni usos. La capacidad desconocida se conserva desconocida. No se expanden productos completos a SKU ni se infiere superioridad por precio. Precio/disponibilidad de recomendaciones siguen **No disponible** por D-REC-01/02.

Solo en desarrollo, `modoRevision=1&escenario=...` habilita escenarios deterministas: `loading`, `empty`, `error`, `missing`, `session`, `forbidden`, `saving`, `save-error`, `rejected`, `conflict`, `unknown-result`; además `usage-unavailable` en Cupones y `selection-empty`, `selection-error`, `unknown-capability` donde corresponden. Producción ignora estos parámetros. Ejemplo: `/promociones/carrera/editar?modoRevision=1&escenario=conflict`. Un resultado incierto bloquea repetir la escritura y permite consultar el resultado. Las creaciones de promociones/reglas sin identificador confirmado requieren localizar el registro en el listado, sin reenvío automático. Escenarios, capturas y límites en [AVANCE_FRONTEND_CUEVA.md](docs/AVANCE_FRONTEND_CUEVA.md).


## Arquitectura para añadir features

```text
src/app/layout/          Shell común con Outlet, sin registrar páginas
src/app/navigation/      Navegación de aplicación y demostraciones
src/app/routes/          productRoutes/productPages y demoRoutes/demoPages separados
src/components/shared/   Patrones de presentación usados en pilotos/muestras
src/theme/               Tokens, defaults y variables CSS centrales
src/features/pricing/    Página → componentes/hook → puerto/service → adapter mock → fixtures
src/features/promotions/ Cupones/promociones/reglas → hooks → servicios/puertos → adapters mock → fixtures
src/features/foundation/ Galería y casos de revisión de componentes
```

Registrar una feature en `productRoutes.tsx` y su navegación en `navigation.ts` (con `group` y `matchPaths` para destinos relacionados), reutilizando shell y theme. Mantener las demos en `demoRoutes.tsx`. Los shared no conocen endpoints, credenciales, DTOs externos ni reglas autoritativas de negocio. La [guía de componentes](docs/COMPONENTES_FOUNDATION.md) contiene APIs y ejemplos; la [guía de implementación](docs/GUIA_IMPLEMENTACION_FRONTEND_REACT.md) contiene el procedimiento y gates.

En Promotions, `services/promotionServices.ts` es el punto central de composición. `createMockPromotionServices({ catalog: adaptadorCatalogo })` permite sustituir un puerto y conservar los mocks restantes; estos consultan el puerto inyectado, no los fixtures de otra funcionalidad. También acepta `coupons`, `campaigns` y `recommendations`. `createPromotionServices` recibe los cuatro puertos para una composición sin simulación de historial. Cada factory crea una memoria aislada; los adapters externos deberán mapear sus DTO al modelo de presentación y respetar el contrato oficial antes de seleccionarse aquí. La sustitución está probada con dobles de servicios; no acredita integración HTTP real.

Los contratos de repositorio reciben datos y `AbortSignal`; no reciben `scenario`. Las páginas consumen `hooks/usePromotionServices.ts` y pasan esos puertos a los hooks/formularios/diálogos. Este hook utiliza `DataModeContext` y `getPromotionRuntime(mode)`; no lee otra variable ni conserva una selección paralela `mock/backend`. La composición se crea al solicitarla, sin inicializar mocks al importar el módulo. Solo la composición mock en DEV selecciona `dev/reviewServices.ts`; allí quedan los parsers, decoradores y la limpieza del contexto de revisión. Los reintentos vuelven a consultar sin perder filtros; las consultas descartan respuestas de un puerto anterior. `useCoupon` no consulta el repositorio si falta el identificador al abrir un alta.

`components/PromotionDataNotice.tsx` reúne los avisos actuales y conserva su `FeedbackAlert`. Usa el mismo `DataModeContext`: se muestra con mock, incluso en un build de demostración, y desaparece con api. Las confirmaciones de guardado/estado utilizan mensajes neutrales. No hay flags de simulación por pantalla.

Mientras falten providers, `CommercialModeGate` mantiene bloqueadas las 19 vistas en modo `api`, sin cargar sus páginas ni mocks. Si se solicita directamente `createPromotionRuntime("api")` sin factory, también falla explícitamente; no existe fallback. Cuando existan los cuatro adapters HTTP verificados, se inyectarán juntos mediante `dependencies.api` en la composición central y se actualizará la capacidad del gate para habilitar el módulo. Las pantallas y hooks mantendrán sus interfaces. Con api los parámetros de revisión se ignoran también en DEV; `confirmedServices` usa los mismos adapters para reconciliar resultados inciertos. `prepareCreation` conserva las guardas de demostración actuales: en api solo comprueba cancelación, no concede permisos ni acredita autenticación. El acceso real y los errores deben provenir de los servicios oficiales; no se ha implementado ningún adapter HTTP.

Las reglas reutilizables de cupones, promociones y recomendaciones están en `services/*Validation.ts` y son utilizadas por los formularios y los mocks. Una API real debe seguir revalidando las reglas en el servidor. Los adapters, fixtures e historial simulado permanecen sin cambios de comportamiento en esta separación.

## Documentación normativa de Docs

Fuente visual: **[DESIGN.md 1.1.0](https://github.com/Taller-SW-Web/Productos-y-Ofertas-docs/blob/be5c2db16aca6d6d18b3005a2da4205f724038e3/ux/mockups/DESIGN.md)** de Docs `master`, commit **`be5c2db16aca6d6d18b3005a2da4205f724038e3`**. La revisión FND-01 actualiza la referencia inicial 1.0.0 y registra las diferencias en el [reporte](docs/VALIDACION_FOUNDATION.md).

| Fuente | Ruta vigente dentro de Docs |
|---|---|
| Design System / UX / MK | `ux/mockups/DESIGN.md`, `ux/mockups/ux/`, `ux/mockups/MK-013/` |
| Requisitos | `requisitos/specs/`, `requisitos/hu/`, `requisitos/flujos/` |
| Wireframes | `ux/wireframes/flows/` (sin usar el DESIGN de baja fidelidad para el theme) |
| Contratos | `contratos/http/openapi.yaml`, `contratos/http/catalogo-errores.md`, `contratos/eventos/asyncapi.yaml` |
| Responsabilidades | `EQUIPO_Y_RESPONSABILIDADES.md` |

Frontend, Docs y Backend son repositorios independientes. Si Docs es la carpeta hermana `../docs`, se consulta allí; si el checkout local es anterior, se consulta la revisión oficial remota. No se copia Docs en Frontend ni se modifica desde esta tarea. Los archivos normativos están fijados por SHA para evitar atribuir una revisión distinta.

## Entrega, validación y revisión

La Foundation de `vera` se integró mediante [PR #2](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/pull/2) a `master`, commit **`731ae1d3cdad100d943d35111a4da6229a31fb96`**, el 10 de octubre de 2026. La consulta actual de GitHub confirma `merged=true`. El issue #1 menciona `main`; la PR real usó `master`.

[VALIDACION_FOUNDATION.md](docs/VALIDACION_FOUNDATION.md) y [PR_FOUNDATION.md](docs/PR_FOUNDATION.md) conservan el reporte histórico del 9 de octubre: sus referencias a publicación pendiente/403 no describen el estado actual de la PR ya fusionada. El diagnóstico y la entrega de los issues #7/#8/#9 en `cueva`, fuentes y verificaciones están en [AVANCE_FRONTEND_CUEVA.md](docs/AVANCE_FRONTEND_CUEVA.md). Una PR fusionada no acredita aprobación UX de todos los MK.

El workflow `.github/workflows/frontend.yml` ejecuta instalación, typecheck, build, lint y la suite Playwright completa en Ubuntu/Node 22. Playwright valida Chromium a 1440×900. Las suites de MK-014, Pricing, Catálogo y Promotions/Taxonomía guardan sus capturas en `test-results/`, mediante evidencePath por prueba, sin competir por los PNG versionados. La entrega MK-014 conserva esos originales y añade únicamente sus cinco capturas revisadas. `tests/promotions-visual.spec.ts` produce las 19 capturas y sus mediciones para revisión UX. Un workflow definido no acredita que ya haya corrido ni recibido aprobación.

Para actualizar deliberadamente las evidencias de los tres MK de Cueva después de revisarlas, en PowerShell:

```powershell
$env:UPDATE_PROMOTIONS_EVIDENCE = "1"
npm run test:e2e -- --workers=1 --grep "desktop evidence|seven desktop views"
Remove-Item Env:UPDATE_PROMOTIONS_EVIDENCE
```

El opt-in solo admite nombres de capturas de Cupones/Promociones/Recomendaciones. Foundation y Pricing conservan siempre sus evidencias versionadas durante estas pruebas.

La entrega anterior de Cueva se integró mediante PR #22. Las correcciones posteriores están en [PR #23](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/pull/23), de `cueva` hacia `master`. El [reporte de Cueva](docs/AVANCE_FRONTEND_CUEVA.md) conserva las validaciones y registra la sincronización con `origin/master@9b0365c`, sin merge directo a master.

La entrega de Pricing de [PR #21](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/pull/21) fue incorporada a `master` mediante `9b0365c`. El [informe de integración](docs/INTEGRACION_VERA_MASTER.md) registra resolución por archivo, N03–N05, comandos y evidencia; [PR_MK013.md](docs/PR_MK013.md) describe el alcance. Sus referencias a PR abierta describen el momento de aquella validación. Los informes H01–H16 conservan su ejecución histórica de 48 pruebas; la ejecución completa tras integrar está en el informe nuevo. Se conservan los seis flujos de Pricing y los 19 de Cupones/Promociones/Recomendaciones.

Pendientes: última revisión técnica/funcional y visto bueno UX humano. Q-013-01/02 mantienen bloqueados el contenido de archivo y su admisión; el issue #15 no debe cerrarse con esos pendientes. D-REC-01/02, contratos administrativos, autenticación, permisos reales, APIs, persistencia comercial, mobile/tablet y evaluación WCAG exhaustiva siguen pendientes. `MOCK_REPLACEABLE` se acredita para Pricing, sin atribuir ese criterio a los otros módulos.
