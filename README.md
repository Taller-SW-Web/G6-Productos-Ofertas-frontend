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
npx playwright install chromium
npm test
```

El modo `mock` funciona sin Backend, Docs ni credenciales. Solo el servidor de desarrollo admite `mock` como valor predeterminado. **Todo build de producción exige `VITE_DATA_MODE=mock` o `api` explícito**; sin valor o con uno inválido, falla. `.env.example` documenta la demostración: copiarlo a `.env.local` selecciona mocks intencionalmente. Para un despliegue destinado al backend real, configurar `api` en el entorno de build. Inter/Oswald y el logo se sirven como assets locales. `npm run preview` permite revisar `dist/` después del build. Un hosting futuro deberá resolver las rutas hacia `index.html`; no se declara desplegada la app.

## Selección de adapters y prueba de sustitución

`src/features/pricing/services/pricingService.ts` contiene el único selector. Recibe `mock` o `api` desde `VITE_DATA_MODE`, leído una vez en `src/main.tsx`. `mock` crea una instancia propia del repositorio de memoria, reloj de exposición y herramientas aisladas de desarrollo. `api` usa un factory inyectado compatible; mientras no se implemente y configure, muestra **«adapter API de Pricing no está configurado»**. Un fallo de API se propaga como error; no hay fallback al mock. Cambiar la variable requiere reiniciar Vite/reconstruir producción.

`src/app/config/dataMode.ts` valida la configuración tanto en Vite como al iniciar la app; no selecciona un segundo adapter. En modo `api`, Cupones/Promociones/Recomendaciones permanecen deshabilitados porque sus providers HTTP todavía no existen: la barrera común del shell evita cargar sus adapters mock. Sus 19 pantallas funcionan en la demostración explícita. Un error de catálogo en Pricing ofrece **Volver a cargar productos y SKU**, reutilizando la misma instancia del adapter y conservando la aplicación y URL.

Las páginas/hooks usan `PricingProvider` y el puerto `PricingRepository`: catálogo de productos/SKU, lecturas, escrituras, prevalidación `File + allowPartial` y reportes `Blob + filename`. No importan targets/fixtures ni reciben `scenario`. El contexto mantiene IDs opacos y la asociación `productTargetId`; no deriva producto desde SKU ni usa `base` como identidad productiva. Las monedas se conservan desde la lectura; no se habilita conversión ni elección de otra moneda sin política publicada. La validación preliminar de oferta programada consulta la vigencia correspondiente al inicio; la validación definitiva pertenece a Pricing.

`tests/harness/pricing-adapter.html` monta el mismo `App` con `AlternatePricingRepository`: cafetera, otro UUID de producto, otro SKU, moneda CHF y otro lote. El harness es de pruebas, servido por Vite en desarrollo y ausente del build de producto; no es una ruta comercial. Ejecutar `npm test -- tests/pricing-audit.spec.ts` verifica sustitución, entradas de archivo/política, errores sin fallback y descarga del archivo de ese adapter.

## Rutas y límites

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

Las escrituras se guardan **en memoria de la pestaña y se reinician al recargar**. Una promoción de modalidad cupón creada en la sesión aparece al crear un cupón. Asociar un cupón o haber activado una promoción bloquea el cambio de modalidad; la UI depende de una capacidad informada por el mock. No se expanden productos completos a SKU ni se infiere superioridad por precio. Precio/disponibilidad de recomendaciones siguen **No disponible** por D-REC-01/02.

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

El workflow `.github/workflows/frontend.yml` ejecuta instalación, typecheck, build, lint y la suite Playwright completa en Ubuntu/Node 22. Playwright valida Chromium a 1440×900 y genera evidencia en `docs/evidencias/`. Un workflow definido no acredita que ya haya corrido ni recibido aprobación.

La entrega de Pricing está publicada en [PR #21](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/pull/21), de `vera` hacia `master`, y se mantiene abierta para última auditoría. La integración incorpora `master@421951b30d506589e43dcc4c07b4194eea2026b8` conservando los 25 flujos. El [informe de integración](docs/INTEGRACION_VERA_MASTER.md) registra resolución por archivo, N03–N05, comandos y evidencia; [PR_MK013.md](docs/PR_MK013.md) describe el alcance actual. Los informes H01–H16 conservan su ejecución histórica de 48 pruebas; la ejecución completa tras integrar está en el informe nuevo.

Pendientes: última revisión técnica/funcional y visto bueno UX humano. Q-013-01/02 mantienen bloqueados el contenido de archivo y su admisión; el issue #15 no debe cerrarse con esos pendientes. D-REC-01/02, contratos administrativos, autenticación, permisos reales, APIs, persistencia comercial, mobile/tablet y evaluación WCAG exhaustiva siguen pendientes. `MOCK_REPLACEABLE` se acredita para Pricing, sin atribuir ese criterio a los otros módulos.
