# Auditoría MK-003 / MK-004 — correcciones de integración

Fecha de trabajo: 12 de octubre de 2026 (America/Lima). Rama: `poma`.
Estado: MOCK_INTEGRATED; no se implementó ni verificó un adapter HTTP.
Refs #5 y #6. Los issues no se cierran por esta entrega.

## Fuentes y preflight

- Raíz comprobada: `C:\Users\Gabriel\Desktop\Web Front\G6-Productos-Ofertas-frontend`.
- Git inicial limpio, HEAD `3a2b77e`; Node 24.16.0 / npm 11.13.0.
- No existe `../docs`. Consulta remota de Docs `master@78a923bbc6bada31b39b3d386331f90a4f812b31`.
- [Docs fijado por SHA](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-docs/tree/78a923bbc6bada31b39b3d386331f90a4f812b31).
- `requisitos/specs/SPEC-003-gestion-productos-crud.md`,
  `SPEC-004-gestion-variantes-skus.md`, `SPEC-009-gestion-caracteristicas.md`,
  `SPEC-010-asociacion-tipo-producto-caracteristica.md`.
- `requisitos/hu/HU-003-gestion-productos-crud.md`, `HU-004-gestion-variantes-skus.md`;
  `requisitos/flujos/FLOW-003-gestion-productos-crud.md`, `FLOW-004-gestion-variantes-skus.md`.
- `ux/wireframes/flows/WF-003-gestion-productos-crud.md`, `WF-004-gestion-variantes-skus.md`.
- `ux/mockups/DESIGN.md` 1.1.0, `ux/mockups/ux/propuesta-ux.md`,
  `ux-decisions.md`, `ux-guidelines.md`.
- `ux/mockups/MK-003/{component-spec,plan,tasks}.md` y siete HTML S01–S07.
  `ux/mockups/MK-004/{component-spec,plan,tasks}.md` y seis HTML S01–S06.
  `validation-report.md`: NO ENCONTRADO en ambos MK. Las tareas normativas siguen PENDIENTE.
- `contratos/http/openapi.yaml` y `catalogo-errores.md`.
- Frontend: AGENTS, README, package/configuración, guía de implementación y catálogo Foundation.
- [PR #24 de López](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/pull/24):
  GitHub informa fusionado a master; la premisa del adjunto sobre PR pendiente quedó obsoleta.
  Se inspeccionaron sus puertos de tipos/características y modelos de presentación.
  No se copió ni modificó su implementación.

## Correcciones

1. Composición síncrona: factories devuelven repositorios inicializados. Una Promise sin
   resolver se rechaza explícitamente. Para inicialización asíncrona, hacer await
   antes de crear los servicios e inyectarlos mediante CatalogServicesContext.
   La inyección explícita prevalece sobre la caché predeterminada; ausencia de
   DataModeContext falla. Se eliminaron las fachadas sin consumidores que duplicaban
   lectura de entorno. Ningún puerto API ausente recurre al mock.
2. Variantes: características del esquema del padre, nombres controlados por Taxonomía,
   LISTA con valorId estable y etiqueta separada, NUMERO finito y límites del esquema,
   TEXTO con límite configurado, obligatoriedad y roles comprobados. La ausencia o
   error de esquema/metadatos impide guardar. SKU/identificadores permanecen inmutables
   en edición. No hay CAR-CUSTOM/IDs generados en el formulario.
3. ProductsPage obtiene filtros de Taxonomía mediante su puerto, con carga/error/reintento.
   Las páginas, componentes y hooks de Catálogo no importan mocks.
   Lecturas de listado/detalle/variantes descartan observaciones de un provider anterior.
4. Reintentos simples exigen permiso tanto en Pricing como Inventario; COMPLETED
   o permiso falso rechazan con 409. El 202 conserva PENDING y revoca permiso.
   Se eliminó la finalización por temporizador del reintento. Un resultado de
   Inventario de variante puede introducirse explícitamente en el mock para pruebas;
   es un helper de demostración, no un endpoint ni una simulación de RabbitMQ.
   La edición mock valida el perfil antes de mutar otros campos.
5. Precio inicial de Catálogo diferenciado del vigente de Pricing, sin cero inventado
   cuando falta. Se eliminó la ruta comercial /MK-004 y el fallback PROD-OXF-001;
   preparación enlaza a las variantes del producto seleccionado.
6. Pruebas con adapter alternativo y mismas páginas en modo API: producto/IDs ajenos
   a fixtures, filtros externos, LISTA/NUMERO/TEXTO, error de esquema, sin precio disponible.
   Pruebas de BORRADOR/PENDING, activación bloqueada, confirmación, reintentos y 409.

## Archivos de esta corrección

| Archivos dentro de src/features/catalog | Razón |
|---|---|
| services/catalogServices.ts, CatalogServicesContext.ts, hooks/useCatalogServices.ts | Composición e inyección |
| services/catalogService.ts, taxonomyService.ts (eliminados) | Fachadas sin consumidores y modo duplicado |
| services/catalogRepository.ts, taxonomyRepository.ts | valorId y metadatos del modelo de presentación |
| services/variantAttributeValidation.ts | Validación por esquema |
| hooks/useVariantForm.ts, components/VariantFormFields.tsx | Formulario autorizado, tipos e inmutabilidad |
| hooks/useTaxonomyFilters.ts, pages/ProductsPage.tsx, components/ProductFilters.tsx | Filtros por puerto y legibilidad desktop |
| hooks/useProductList.ts, useProductDetail.ts, useVariantList.ts, useVariantDetail.ts, useVariantPreparation.ts | Lecturas ligadas al provider actual |
| pages/VariantCreatePage.tsx, VariantEditPage.tsx | Guardado bloqueado durante carga/error del esquema |
| pages/VariantListPage.tsx, VariantDetailPage.tsx, ProductPreparationPage.tsx | Precio y navegación contextual |
| adapters/mockCatalogRepository.ts, mockTaxonomyRepository.ts | Permisos, estados, IDs, límite mock de texto y atomicidad de edición |

Otros: `src/app/routes/productRoutes.tsx` retira únicamente /MK-004.
README y este reporte documentan la composición. `tests/catalog.spec.ts`,
`variants.spec.ts` usan capturas de ejecución en test-results en lugar de
sobrescribir evidencia versionada. `tests/catalog-adapters.spec.ts`,
`catalog-injection.spec.ts` y `tests/harness/catalog-adapter.{html,tsx}`
añaden las verificaciones. No se modificaron módulos de Pricing, Promociones,
Cupones, Recomendaciones, Taxonomía, Docs externo o Backend.

## Límites contractuales y coordinación

**BLOCKED_CONTRACT — metadatos de esquema.** OpenAPI EsquemaTipoProducto/
AsociacionTipoCaracteristica publica asociación, obligatoriedad y schemaVersion,
pero no rol identificador ni rango numérico por característica. CaracteristicaAdmin
tampoco publica el límite configurado de texto. El modelo de López ofrece
maxTexto mediante configuración, pero sus asociaciones no informan el rol identificador.
Owner de decisión: Taxonomía (López), Catálogo (Poma) y provider/integración.
Propuesta: confirmar fuente y mapping de esos metadatos al puerto de lectura de
Catálogo; sin inferir roles desde nombres como Color/Talla ni fabricar DTOs.
La ausencia del rol o límite de texto bloquea el formulario. Rango numérico ausente
no se convierte en una regla universal >0.

El demo mantiene fixtures anteriores exclusivamente en adapters/mock. Su sustitución
por Taxonomía requiere IDs y esquema autorizados y es una integración pendiente,
no una segunda fuente de verdad productiva. No se clonó el módulo de López dentro
de Catálogo. La raíz puede inyectar un adapter de lectura de Taxonomía que implemente
getCategories/getBrands/getProductTypes/getAttributeSchema.

Los Q de component-spec son preguntas históricas, no todos contratos ausentes hoy:
la revisión actual sí publica consulta de preparación y reintento. Persisten la
verificación HTTP real, lectura administrativa completa, moneda del precio inicial,
perfil parcial y concordancia de edición de tipo. No se cierran esos Q por mocks.
Los adapters deben mapear modelo de presentación a DTO oficial (incluido valor_id)
y revalidar autoritativamente en servidor.

## Apariencia y evidencia

Se reutilizan Mantine, Tabler, PageHeader, SectionCard, FeedbackAlert y EntityTable.
No se cambiaron theme/tokens ni se agregaron HEX locales. S02 de MK-004 reemplaza
campos libres/badges clicables por controles Select/NumberInput/TextInput del DS.
S01 de MK-003 ajusta anchos para evitar recorte de estado y fragmentación de “Ver detalle”.
Desktop canónico 1440×900, con desplazamiento vertical normal.
Las capturas de ejecución están en test-results; las seleccionadas para el PR
se conservan en `docs/evidencias/catalog-audit/`.
La inspección técnica no acredita aprobación UX humana.

## Validación final

- `npm run typecheck`: PASS (código final).
- `npm run lint`: PASS, sin errores ni warnings de ESLint.
- `VITE_DATA_MODE=mock npm run build`: PASS; en PowerShell se usó $env:VITE_DATA_MODE.
- `VITE_DATA_MODE=api npm run build`: PASS, sin fallback en ejecución.
- `npm test -- --workers=2`: 144 PASS / 1 FAIL de 145, 4.3 minutos.
  El único fallo final fue la escritura de `mk-013-s03-1440.png` por Windows
  (UNKNOWN open), en la prueba de seis vistas de Pricing. Otras pruebas de
  Pricing escriben el mismo archivo en paralelo: colisión de evidencia, no
  una aserción funcional fallida de Catálogo.
- `npm test -- tests/pricing-workflows.spec.ts --workers=1 --grep 'six direct views'`:
  PASS, 1/1. Se verificaron los 145 casos mediante ambas ejecuciones;
  no se declara que la corrida paralela completa haya pasado.
- MK-003: 11 casos PASS. MK-004: 13 casos PASS. Nuevos adapters/inyección:
  8 casos PASS. Regresión funcional de Pricing, Promociones, Cupones y Recomendaciones:
  ejecutada; la limitación de evidencia paralela queda registrada arriba.
- Primera corrida dirigida: 28/30; se corrigió captura incompleta de atributos
  obligatorios en helpers de edición. Corrida intermedia completa: 140/143;
  fallos de edición/helper y estado de Pricing durante HMR. Se repitió con código
  estable: los casos funcionales anteriores pasan. No se modificó Pricing para
  esconder sus resultados.
- Capturas 1440 px de S01–S07 MK-003 y S01–S06 MK-004, incluyendo edición S02,
  más formulario con adapter alternativo. Aserciones sin overflow horizontal;
  inspección visual de listado y formularios de Catálogo. Aprobación UX humana pendiente.
- `git diff --check`: PASS. Las capturas versionadas de Pricing regeneradas por
  sus pruebas fueron restauradas al contenido inicial; no se publican cambios ajenos.
- Logs de builds, suite y repetición en `docs/evidencias/catalog-audit/*.txt`.
- No se reinstalaron dependencias (`npm ci`: NO EJECUTADO); se usó node_modules existente.

### Matriz de verificación

- [x] Fuentes verificadas y fijadas por SHA; alcance/pantallas identificados.
- [x] Git inicial limpio; no se destruyeron cambios previos.
- [x] TypeScript, builds mock/api y lint ejecutados con resultado satisfactorio.
- [x] Tests de Catálogo PASS y regresión ejecutada; fallo/repetición de evidencia documentados.
- [x] Desktop 1440 px: capturas y controles sin overflow; inspección técnica realizada.
- [x] Loading/empty/error verificados en lecturas y error de esquema en formulario.
- [x] Sin HTTP directo desde presentación, IDs ficticios nuevos ni HEX locales nuevos.
- [x] Sin contratos/endpoints/scopes inventados; sin modificación de Docs/Backend.
- [x] Dependencias y nivel MOCK_INTEGRATED explicitados.
- [ ] API real conectada: pendiente de providers y metadatos.
- [ ] Revisión técnica/UX independiente: pendiente.

### Publicación

Los cambios se publican en poma y se propone PR hacia master, sin merge.
La base consultada de master tras fetch es `fdbacba`, que incluye Taxonomía.
Esta entrega no fusiona ni sustituye los archivos de López en poma.
La revisión conjunta contra esa base sigue siendo necesaria antes de merge.
