# Reporte de Foundation — componentes reutilizables

Fecha: 2026-10-08. Encargo: crear componentes reutilizables en Frontend y demostrarlos con el piloto MK-013-S01 del issue #1. Estado: **MOCK_INTEGRATED**. Integración: **MOCK_ONLY**. S02–S05 tienen muestras de componentes, sin implementación comercial completa.

## Alcance y fuentes

Raíz verificada: `C:/Users/User/workspace/G6-Productos-Ofertas-frontend`. Rama inicial de implementación: `master`; Git inicial limpio. Rama actual de preparación del commit: `vera`. No existían package.json ni src. Se preservaron README, AGENTS y guía; no se cambió el remoto, no hubo commit/push/PR.

Lecturas: `AGENTS.md`, `README.md`, `docs/GUIA_IMPLEMENTACION_FRONTEND_REACT.md`, issue [#1](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/issues/1). Docs solo lectura: `Productos-y-Ofertas-docs/mockups/DESIGN.md`, `mockups/ux/ux-guidelines.md`, `mockups/ux/ux-decisions.md`, rama `vera`, SHA `b640b7f65d920a12120c1e03540c0c13d2067309`. DESIGN 1.0.0; UX 2.0. Fuente local real, distinta de las rutas objetivo del issue.

Referencias adjuntas inspeccionadas: MK-002-S01/S02/S03/S04, MK-003-S05/S06, MK-006-S01/S04. Se usaron para identificar patrones, no como autorización para implementar reglas comerciales ni como evidencia de aprobación del mockup.

## Archivos creados/modificados

| Archivo dentro de Frontend | Motivo |
|---|---|
| `package.json`, `package-lock.json` | Stack fijado, único gestor npm y scripts reales |
| `.gitignore` | Excluir dependencias/build/secretos locales/resultados temporales |
| `index.html` | Documento español y entrada Vite |
| `tsconfig.json` | TypeScript estricto, sin emisión y con índices verificados |
| `vite.config.ts` | React plugin |
| `eslint.config.js` | TypeScript, React Hooks y refresh |
| `playwright.config.ts` | Chromium 1440×900, servidor automático |
| `src/main.tsx` | Provider, fuentes Latin locales, router y bootstrap |
| `src/assets/brand/INKA_ATHLETICS.svg` | Logo original proporcionado por el usuario para la barra superior |
| `src/theme/tokens.ts` | Colores/roles, spacing, radios, sombras y capas documentadas |
| `src/theme/theme.ts` | Theme Mantine y resolver CSS de tokens |
| `src/theme/component-defaults.ts` | Defaults de primitivas utilizadas y variantes comunes |
| `src/theme/primitives.module.css` | Tamaños, selección, input/help, botones/badges/dialog |
| `src/theme/global.css` | Foco, scroll margin, movimiento reducido y base global |
| `src/app/App.tsx`, `src/app/app.module.css` | Shell, navegación de galería, carga de rutas diferida, 404 |
| `src/components/shared/PageHeader.tsx` | Breadcrumbs, título/descripcion/acciones |
| `src/components/shared/SectionCard.tsx` | Región accesible y tarjeta de sección |
| `src/components/shared/FilterBar.tsx` | Composición de filtros/resumen |
| `src/components/shared/SearchField.tsx` | Búsqueda controlada con limpiar accesible |
| `src/components/shared/StatusBadge.tsx` | Roles semánticos sin mapear estados de backend |
| `src/components/shared/FeedbackAlert.tsx` | Mensaje persistente, icono, acción y anuncio accesible |
| `src/components/shared/EmptyState.tsx` | Vacío con causa y acción proporcionadas por caller |
| `src/components/shared/EntityTable.tsx` | Tabla genérica con estados y paginación conocida |
| `src/components/shared/ConfirmDialog.tsx` | Confirmación, submitting, error, foco y variante destructiva |
| `src/components/shared/index.ts` | Exportaciones comunes |
| `src/features/foundation/pages/ListDemo.tsx` | Demostración de filtros/tabla/detalle |
| `src/features/foundation/pages/FormDemo.tsx` | Demostración de controles/formulario/confirmación |
| `src/features/foundation/pages/FeedbackDemo.tsx` | Demostración de feedback, badges, carga/disabled |
| `src/features/foundation/hooks/useDemoList.ts` | Consulta cancelable; conserva solo respuesta de filtros vigentes |
| `src/features/foundation/hooks/useDemoForm.ts` | Interacciones y estado del formulario local |
| `src/features/foundation/services/demoRepository.ts` | Puerto y modelos de presentación explícitos |
| `src/features/foundation/services/demoService.ts` | Punto único de composición de adapter |
| `src/features/foundation/adapters/mockDemoRepository.ts` | Escenarios deterministas y confirmación sin persistencia |
| `src/features/foundation/mocks/items.ts` | Seis fixtures fuera de JSX |
| `tests/foundation.spec.ts` | Cinco recorridos de navegador |
| `README.md` | Arranque real, requisitos, rutas, estado y fuentes |
| `docs/GUIA_IMPLEMENTACION_FRONTEND_REACT.md` | Enlaces a uso y evidencia reales sin reemplazar el procedimiento |
| `docs/COMPONENTES_FOUNDATION.md` | APIs, mapping DS-C, arquitectura y guía de nueva feature |
| `docs/VALIDACION_FOUNDATION.md` | Este reporte |
| `docs/evidencias/listados-1440.png`, `formularios-1440.png`, `estados-1440.png`, `confirmacion-1440.png` | Evidencia visual de tres vistas y dialog |

## Resultado funcional y visual

Rutas: `/foundation/listados`, `/foundation/formularios`, `/foundation/estados`; `/` redirige a listado y ruta desconocida ofrece retorno. Navegación exclusiva de galería, sin rutas definitivas para otros MK.

Listados: búsqueda, filtro de estado, paginación de tres filas, detalle en Drawer que conserva página/filtros. Escenarios reproducibles con datos, loading, vacío y error; vacío global y sin coincidencias se distinguen. Loading es fixture explícito pendiente hasta seleccionar otro escenario, sin fingir tiempos backend. Error recuperable conserva filtros.

Formulario: label, ayuda debajo, error required ilustrativo y foco al campo; controles Inter, checkbox/radio de 20 px; valores read-only legibles y disabled con explicación. Cancelar y fallar confirmación conservan entradas. Confirmar solo demuestra recorrido; no persiste ni muta productos. Dialog centra 480 px, contiene foco y devuelve al activador; alternativa segura recibe foco inicial. La variante destructiva se muestra como ejemplo, sin borrar datos.

Visual: inspección de los cuatro PNG a 1440 px. Header 64, sidebar 240, margen 32 y ancho útil 1136. H1 Oswald 32/40, Inter operativo, tarjetas sin sombra, tabla neutra y semántica, fondos/bordes exactos. El formulario ocupa máximo 880 px y permite scroll vertical. No overflow de página ni recortes observados. Se corrigió solapamiento icono/placeholder encontrado en la primera captura.

## Diferencias respecto de las imágenes

| Referencia / elemento | Regla DESIGN.md | Aplicación en componentes |
|---|---|---|
| MK-003-S05: confirmación con título Oswald y botón naranja de texto blanco | §4.2 H4/modal Inter 20/28; §7.1 naranja + ink | Modal Inter, primary con ink, hover oscuro + inverse |
| MK-002-S01 y MK-006-S01: badges/auxiliares pequeños | §7 badge min 24, 14/20; ayuda operativa 14/20 | Badge legible y sin truncamiento; 12 px solo metadatos complementarios |
| MK-002-S01: barra oscura al pie de la captura | §5.1 header fijo arriba 64 | Shell con header superior |
| Todas: composición con grandes márgenes de canvas exportado | §5 shell sidebar 240 + padding32 | Geometría de viewport 1440, sin copiar margen externo del canvas |
| Capturas con decoraciones/tipos en naranja | §4.1 y §7 roles semánticos, categorías neutrales | Tipos de ejemplo neutrales; color solo por intención semántica |
| Todas: logo de marca | §4.6 activo oficial verificado o texto | Inicialmente texto; reemplazado con `src/assets/brand/INKA_ATHLETICS.svg` proporcionado por el usuario, sin redibujarlo |

No se alteraron reglas de activación, pricing, promociones, stock, combos ni fuentes Docs a partir de estas diferencias. Actualizar la revisión documental/visual corresponde al responsable UX indicado por DESIGN, Leonardo Vera; revisión técnica de la foundation pendiente con Axel o revisor designado según issue.

## Validaciones ejecutadas

Windows, Node 22.21.0, npm 10.9.4, Chromium de Playwright 1.64.0. Resultado final tras corregir hallazgos:

| Control | Resultado |
|---|---|
| `npm ci` | PASS, 191 paquetes añadidos; auditoría reportó 0 vulnerabilidades en ese momento |
| `npm run typecheck` | PASS, salida 0 |
| `npm run build` | PASS, Vite 8.3.4, salida 0; rutas diferidas, sin advertencia de chunk >500 kB en build final |
| `npm run lint` | PASS, salida 0, sin hallazgos |
| `npm test` | PASS, 5 pruebas en 10.9 s, salida 0 |
| `git diff --check` | PASS, salida 0 |
| Visual desktop 1440 px | PASS técnico, revisión de las cuatro capturas; no sustituye aprobación humana |

Pruebas: filtros/paginación/detalle/consulta cancelada; vacío/sin coincidencias/error recuperable; required/cancelar/error/confirmación con datos conservados; geometría/fuentes/carga de páginas/tokens default-hover/foco y capturas; ruta 404/retorno. Se midió también padding del buscador y orden de ayuda después del input. Las pruebas de recorrido no son una certificación WCAG completa ni pruebas de integración real.

Durante implementación se corrigieron: API `Alert` usa `p` en lugar de `padding`; hook sin actualización síncrona en effect; selectores de prueba ambiguos; variante default del botón para asegurar el par de contraste; espacios de icono/help/tamaños; captura tomada antes de terminar la transición del dialog. Un intento de lint/tests comenzó mientras `npm ci` reemplazaba dependencias y no encontró los ejecutables; ambos se repitieron después de finalizar la instalación, con PASS. Los resultados anteriores no se presentan como evidencia de éxito.

## Matriz de verificación

- [x] Fuentes visuales y guía verificadas con versión/SHA; se registra drift de paths/versiones.
- [x] Alcance real: componentes y galería; referencias adjuntas identificadas.
- [x] Git inicial inspeccionado; sin cambios preexistentes en Frontend.
- [x] React/TypeScript compila, typecheck/build PASS.
- [x] Lint PASS.
- [x] Tests PASS.
- [x] Visual desktop 1440 PASS técnico con evidencia.
- [x] Loading/empty/error y recuperación local verificados.
- [x] Sin llamadas HTTP directas en páginas/componentes, verificado con búsqueda de `fetch(`/`axios` en src.
- [x] Sin HEX locales de componentes; solo tokens documentados en theme.
- [x] Sin contratos, enums backend, endpoints o scopes inventados.
- [x] Docs/Backend sin modificaciones de esta tarea; los cuatro `tmp-expo-*.png` preexistentes en Docs se preservaron.
- [x] Dependencias/limitaciones registradas.
- [x] Nivel declarado MOCK_INTEGRATED / MOCK_ONLY.

## Pendientes y riesgos

- MK-013-S01 ya se implementó con spec y captura del usuario: clasificación de trabajo YELLOW y entrega MOCK_INTEGRATED. No hay HTML ni validation-report local; no se atribuye aprobación del mockup. DESIGN local sigue en 1.0.0 frente a 1.1.0 mencionada por issue. La discrepancia de revisión y el visto bueno humano siguen registrados.
- Revisión técnica independiente y visto bueno UX humano pendientes. No se solicita ni firma automáticamente una aprobación.
- Frontend comenzó en `master` y actualmente está en `vera`; debe comprobarse el destino `main` del issue al preparar la PR. El agente no cambió la rama ni abrió PR.
- API real, autenticación, permisos, selección de adapter HTTP y validación de contratos: fuera del encargo. No hay contrato bloqueante confirmado para renderizar esta galería; cualquier integración futura necesita la fuente exacta del provider.
- Solo Chromium desktop revisado. Otros navegadores, zoom ampliado, mobile/tablet y evaluación WCAG exhaustiva: NO EJECUTADOS, sin ampliar alcance por defecto.
- Solo patrones utilizados están configurados. No se declara acabado todo el catálogo de 29 DS-C ni las 16 funcionalidades.

Estado de entrega de componentes y piloto S01: **MOCK_INTEGRATED**. Estado del issue completo: **PARCIAL**, a la espera de revisiones/publicación; los flujos de escritura Pricing no forman parte de Foundation v1.

## Actualización: logo de marca

Se incorporó el archivo `INKA_ATHLETICS.svg` adjuntado por el usuario en `src/assets/brand/INKA_ATHLETICS.svg`. Los hashes SHA-256 de origen/copia coinciden: el asset se preservó sin modificación. `src/app/App.tsx` reemplaza el texto de marca por una imagen con alt «Inka Athletics» a la izquierda de la barra superior; `app.module.css` conserva su tamaño/proporción 59×44 y el separador.

Validación de este cambio: `npm run build` PASS (incluye TypeScript); `npm test -- --grep 'desktop geometry'` PASS, 1 prueba en 5.3 s; revisión de captura a 1440 px y decodificación del logo en Chromium PASS (dimensiones naturales/renderizadas 59×44); `git diff --check` PASS. Se regeneraron las cuatro capturas de evidencia. Lint y suite completa no se repitieron para este cambio acotado. No hay cambios de integración o fuentes Docs.

## Preparación del commit

Rama actual verificada: `vera`. Se eliminaron únicamente los directorios locales generados `dist/` y `test-results/`. `node_modules/` se conserva localmente para desarrollar, excluido por `.gitignore`; no había `playwright-report/` que limpiar. Galería, fixtures, pruebas automatizadas y cuatro capturas permanecen como entregables de Foundation y evidencia del issue.

`npm run lint` se repitió después de incorporar el logo: PASS, salida 0. Typecheck/build y prueba visual son los ejecutados en la actualización anterior; no se volvieron a ejecutar por los cambios exclusivamente documentales/limpieza de esta preparación. No se crearon pruebas nuevas. El commit se prepara como entrega de componentes vinculada a #1, sin declarar cerrado el issue completo ni usar `Closes #1`.

## Ampliación: piloto MK-013-S01 y componentes de Pricing

Esta sección actualiza el estado de la entrega inicial. Se recibieron las cinco capturas S01–S05 de MK-013. Se consultaron, en el checkout Docs indicado arriba: `specs/SPEC-013-gestion-precios-individuales-masivos.md`, `hu/HU-013-gestion-precios-individuales-masivos.md`, `flujos/FLOW-013-gestion-precios-individuales-masivos.md`, `wireframes/flows/WF-013-gestion-precios-individuales-masivos.md`, `mockups/ux/propuesta-ux.md`, UX Decisions/Guidelines, `mockups/DESIGN.md`, `mockups/MK-013/component-spec.md`, `plan.md`, `tasks.md`, los schemas Pricing de `api/openapi.yaml` 0.5.0, `api/catalogo-errores.md` y `EQUIPO_Y_RESPONSABILIDADES.md`. HTML y validation-report locales: NO ENCONTRADOS. Capturas suministradas no acreditan aprobación humana.

Readiness S01: **YELLOW** de trabajo, con flujo de consulta suficientemente definido por spec/FLOW y referencias visuales suministradas. Su implementación es **MOCK_INTEGRATED**. No se atribuye aprobación oficial al mockup. S02–S05 se cubren como muestras de componentes, no como flujos completos de Pricing; S06 histórico no se implementa dentro de esta Foundation.

### Inventario de esta ampliación

| Archivo | Motivo |
|---|---|
| `src/components/shared/MetricCard.tsx` | Composición de KPI neutral usada en precio vigente y resultado parcial |
| `src/components/shared/FileSelection.tsx` | Selección de archivo y metadatos reales, sin parser ni restricciones inventadas |
| `src/components/shared/FilterBar.tsx`, `index.ts` | Alineación opcional para filtros con ayudas y exportaciones de los dos patrones nuevos |
| `src/theme/component-defaults.ts`, `primitives.module.css` | Defaults Tabs/Stepper/Radio.Card/FileInput y corrección de placeholder/opacity a tokens |
| `src/features/pricing/services/pricingRepository.ts` | Puerto de lectura y modelos de presentación, separados de DTOs HTTP |
| `src/features/pricing/services/pricingService.ts` | Punto único de composición de adapter Pricing |
| `src/features/pricing/services/pricePresentation.ts` | Etiquetas de origen/herencia para componentes Pricing |
| `src/features/pricing/adapters/mockPricingRepository.ts` | Consulta mock determinista de precio, ausencia, error y carga |
| `src/features/pricing/mocks/prices.ts` | Contexto ficticio de producto/SKU, lecturas y muestras de programación/resultado |
| `src/features/pricing/hooks/useCurrentPrice.ts` | Cancelación de consultas, resultados asociados al contexto y última lectura identificada |
| `src/features/pricing/components/PriceFilters.tsx` | Selección pendiente/aplicada y producto sin canal de consulta inventado |
| `src/features/pricing/components/PriceSummary.tsx` | Contexto, origen, moneda, versión, vigencias y tres métricas neutrales |
| `src/features/pricing/components/PriceBreakdown.tsx` | Tabla de lecturas fixture y herencia, no cálculo comercial en navegador |
| `src/features/pricing/components/PriceEditExample.tsx` | Radio.Card, importes, oferta condicional, motivo y confirmación de presentación |
| `src/features/pricing/components/ScheduleExample.tsx` | Lista y campos de fecha/hora con zona explícita, sin crear programaciones |
| `src/features/pricing/components/ImportExample.tsx` | Dos etapas, archivo y política; revisión invalidada con archivo nuevo |
| `src/features/pricing/components/ImportResultExample.tsx` | Resultado parcial fixture 3/2/1 y detalle por fila |
| `src/features/pricing/pages/CurrentPricePage.tsx` | Piloto S01 de consulta en `/precios` |
| `src/features/pricing/pages/PricingPatternsPage.tsx` | Muestras con Tabs en `/foundation/pricing?panel=edit/schedule/import/result` |
| `src/app/App.tsx` | Dos rutas/navegación reales y carga diferida sobre el shell existente |
| `tests/pricing.spec.ts` | Cuatro recorridos nuevos de Pricing y captura desktop |
| `README.md`, `docs/COMPONENTES_FOUNDATION.md`, este reporte | Estado y matriz de cobertura actualizados |
| `docs/evidencias/pricing-s01-1440.png`, `pricing-edit-components-1440.png`, `pricing-schedule-components-1440.png`, `pricing-import-components-1440.png`, `pricing-result-components-1440.png` | Cinco evidencias de la ampliación |

### Cobertura y diferencias aplicadas

S01: selección explícita; Consultar aplica el contexto; lectura base de producto sin filtro de canal conforme al GET publicado; SKU heredado, override y Retail solicitado con fallback global. Oferta nula se lee «Sin oferta». Carga, ausencia y error se distinguen; en error/refresco se conserva última lectura del mismo contexto y se bloquean acciones que requieran lectura actualizada. Las respuestas canceladas no actualizan otra consulta. Retorno desde muestras conserva producto/SKU y canal aplicados.

S02: los controles de alcance y oferta se componen con Radio.Card/Radio, NumberInput y Textarea; ocultar importe de oferta conserva su valor y cancelar revisión conserva el motivo. El diálogo no guarda ni realiza PATCH. S03: tabla y formulario con fechas/horas de America/Lima; no POST ni validación comercial. Fecha/hora usa TextInput `datetime-local`: el picker/idioma visual del calendario son nativos del navegador, sin afirmar un calendario Mantine personalizado. Los formularios de muestra respetan máximo 880 px.

S04: FileSelection permite revisar nombre y bytes del archivo seleccionado, sin afirmar que es válido ni extraer filas/cabeceras. Stepper permite volver; archivo nuevo limpia política y segunda etapa. Confirmar está deshabilitado con causa visible. S05: fixture publicado conceptualmente en spec de 3 filas/2 confirmadas/1 rechazada, alerta parcial y tabla; no resultado derivado de un archivo arbitrario, descarga de CSV ficticio ni reanudación.

Cambios frente a capturas: badges de origen neutros y labels de negocio, sin enums/IDs MK/POST 201/202 como títulos operativos; tres KPI por fila conforme a DS-C19, sin colorear cifras por decoración; no cálculo autoritativo de ahorro/cascada ni afirmación de auditoría en tiempo real. El screenshot ofrece cabeceras CSV y admisión con errores: esas capacidades permanecen bloqueadas por la spec, no se copian como reglas aprobadas. No se copiaron datos de usuario/sesión de Marco Castilla ni un supuesto aviso de otro editor conectado.

### Validación de la ampliación

- `npm run typecheck`: PASS, salida 0.
- `npm run build`: PASS, salida 0; Vite 8.3.4, sin advertencia de chunk grande.
- `npm run lint`: PASS, salida 0, sin advertencias finales; se separó helper de etiquetas del componente para respetar Fast Refresh.
- `npm test`: PASS, **9 pruebas en 19.4 s** (5 de Foundation y 4 de Pricing).
- Último ajuste de placeholder de archivo y opacidad de input: typecheck/build/lint PASS; `npm test -- --grep 'Pricing desktop'` PASS, **1 prueba en 6.4 s**. No se repitió la suite completa tras ese cambio de estilos; se regeneraron las cinco capturas de Pricing y se midieron los estilos efectivos corregidos.
- Visual desktop 1440 px: PASS técnico; cinco capturas inspeccionadas, sin overflow de página. Teclado de Tabs, foco/retorno de confirmación y contenido preservado están comprobados en los recorridos.
- La primera prueba de conservación de oferta comparaba `211.50` con `211.5`; Mantine normaliza el número sin cambiar su valor. Se ajustó la expectativa sin imponer precisión monetaria inexistente en contrato.

No se agregaron dependencias ni llamadas HTTP. No se modificó Docs/Backend. Se preserva el staging previo del usuario y se prepara también esta ampliación para el mismo commit; no se hace commit/push/PR ni cierre de issue.

### Bloqueos y estado final

**Q-013-01**: contrato de contenido/formato/cabeceras/tamaño/versión por fila ausente. **Q-013-02**: admisión de prevalidación con errores no definida. Fuentes: `mockups/MK-013/component-spec.md` §13 y `tasks.md` T06 BLOCKED. Owner funcional: Leonardo Vera; revisión técnica de contrato por Miguel Ángel Taco según gobernanza. Impacto: impiden parser/plantilla/prevalidación/admisión reales, no bloquean S01 ni estas composiciones.

S01 y componentes de Foundation: **MOCK_INTEGRATED / MOCK_ONLY**. API, edición/programación/importación comerciales, histórico S06 y aprobación técnica/UX: pendientes en sus alcances correspondientes. El issue #1 sigue sin cerrarse hasta las revisiones y publicación requeridas; se elimina el antiguo pendiente de implementación del piloto S01.
