# Productos y Ofertas — Frontend

Frontend React/TypeScript/Vite con Mantine y Tabler. Incluye el piloto **MK-013-S01 (precio vigente)** y **MK-005 Cupones, MK-006 Promociones y MK-007 Recomendaciones: 19 pantallas**, con altas, edición, selectores y confirmaciones sobre adapters mock tipados. Estado: **MOCK_INTEGRATED / MOCK_ONLY**, provisional mientras está pendiente la revisión funcional/UX. Las muestras de Pricing S02–S05 permiten revisar componentes; no hay integración HTTP.

## Ejecutar y validar

Requisitos: Node **>=22.12.0** y npm. Las dependencias están fijadas en `package-lock.json`; el gestor único es npm.

```powershell
npm ci
npm run dev
```

Abrir `http://127.0.0.1:5173/cupones`, `/promociones`, `/recomendaciones` o `/precios`. Para validar:

```powershell
npm run typecheck
npm run build
npm run lint
npx playwright install chromium
npm test
```

La aplicación funciona sin Backend, Docs, credenciales ni variables de entorno. Inter/Oswald y el logo se sirven como assets locales. `npm run preview` permite revisar `dist/` después del build. Un hosting futuro deberá resolver las rutas hacia `index.html`; no se declara desplegada la app.

## Rutas y límites

| Ruta | Alcance |
|---|---|
| `/precios` | Piloto S01: selección producto/SKU, consulta local, herencia/override, fallback global y estados |
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

`/` redirige a `/precios`; la ruta desconocida ofrece retorno. Las rutas `/foundation/*` están disponibles únicamente con el servidor de desarrollo y no aparecen en la navegación comercial. Los parámetros `target/channel` de `/precios` representan filtros **aplicados** de navegación, no un contrato HTTP. Las entradas editables no se aplican hasta pulsar Consultar. Atrás/Adelante restaura el contexto aplicado y reinicia cualquier borrador pendiente de ese contexto.

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
src/features/promotions/ Cupones/promociones/reglas: páginas/componentes → hooks → servicios/puertos → adapters mock → fixtures
src/features/foundation/ Galería y casos de revisión de componentes
```

Registrar una feature en `productRoutes.tsx` y su navegación en `navigation.ts` (con `group` para el grupo funcional), reutilizando shell y theme. Mantener las demos en `demoRoutes.tsx`. Los shared no conocen endpoints, credenciales, DTOs externos ni reglas autoritativas de negocio. La [guía de componentes](docs/COMPONENTES_FOUNDATION.md) contiene APIs y ejemplos; la [guía de implementación](docs/GUIA_IMPLEMENTACION_FRONTEND_REACT.md) contiene el procedimiento y gates.

## Documentación normativa de Docs

Fuente visual: **[DESIGN.md 1.1.0](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-docs/blob/be5c2db16aca6d6d18b3005a2da4205f724038e3/ux/mockups/DESIGN.md)** de Docs `master`, commit **`be5c2db16aca6d6d18b3005a2da4205f724038e3`**. La revisión FND-01 actualiza la referencia inicial 1.0.0 y registra las diferencias en el [reporte](docs/VALIDACION_FOUNDATION.md).

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

Pendientes: revisión técnica/UX independiente, aprobación documental y publicación de la entrega. Los contratos administrativos siguen provisionales y requieren provider/auth/grants comprobados antes de conectar HTTP. Q-013-01/02 mantienen abiertos el contrato de archivo y la admisión con errores de Pricing; no bloquean su S01. Autenticación, permisos reales, APIs, escritura comercial, mobile/tablet y evaluación WCAG exhaustiva no se acreditan mediante estos mocks.
