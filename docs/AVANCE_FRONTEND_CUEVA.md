# Entrega de Cueva — MK-005, MK-006 y MK-007

Fecha: 2026-10-11, America/Lima. Refs [#7 Cupones](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/issues/7), [#8 Promociones](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/issues/8), [#9 Recomendaciones](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/issues/9).

**MOCK_INTEGRATED / MOCK_ONLY, provisional.** Las 19 pantallas del alcance frontend están implementadas. No se declara aprobación UX, API real ni cierre de issues. Entrega en `cueva`, autorizada por Axel para commit, publicación y preparación de revisión el 11 de octubre. El estado de publicación/CI/revisión se registra en la PR; este reporte acredita implementación y comprobaciones locales.

## Inventario y fuentes

- TAREA: completar los tres issues propios de Cueva.
- RAÍZ: `C:/Users/axela/OneDrive/Escritorio/PROYECTO/G6-Productos-Ofertas-frontend`, verificada con Git.
- RAMA: `cueva`; base `dd8ac2bf41151efa3848c93a87eae83ff6c34a0c`.
- GIT INICIAL: limpio en master; origin/cueva apuntaba a la misma base. Se cambió a cueva por instrucción del usuario, que prevalece sobre la sugerencia de rama nueva de los issues. No se destruyeron cambios previos.
- DOCS: accesible en `../Productos-y-Ofertas-docs`; `../docs` no existe en este entorno. Local limpio lab/lopez, SHA `80eb28c324e77bbafe27ee01803335b03c3e5417`.
- DOCS OFICIAL: G6-Productos-Ofertas-docs, master, SHA **`be5c2db16aca6d6d18b3005a2da4205f724038e3`**, consultado mediante GitHub. Se contrastaron blobs normativos; no se editó Docs ni Backend.
- SHARED: PageHeader, SectionCard, FilterBar, SearchField, EntityTable, FeedbackAlert, EmptyState, StatusBadge, ConfirmDialog, MetricCard; Mantine/Tabler/theme existentes.
- ALCANCE: src/features/promotions, registro de rutas/navegación y router de datos necesario para proteger borradores, pruebas y documentación/evidencia. Theme/shared/otras features preservados.
- BLOQUEOS: contratos administrativos provisionales, D-REC-01/02 y aprobación documental/UX pendiente. NIVEL: MOCK_INTEGRATED.

Se inspeccionaron package/lockfile, scripts, configuración, workflows, shell/router/navegación/theme/shared y patrones Foundation/Pricing. Foundation PR #2 está fusionada en master (`731ae1d3cdad100d943d35111a4da6229a31fb96`); sus reportes históricos se conservan. La consulta inicial de Git remoto falló por DNS. Antes de publicar, `git fetch origin --prune` terminó correctamente y confirmó que HEAD, origin/cueva y origin/master compartían la base `dd8ac2b`. Issues y fuentes oficiales se consultaron por el conector y se releían sus criterios de cierre antes de publicar.

Comparación: origin/castilla local `041a4d3f449d177330d92b851bd87a698d26ca64`, con cinco vistas de MK-001 y adapter de carga masiva. Cueva partía de Foundation/Pricing sin Promotions. Esta entrega completa el alcance de UI/mocks de los tres issues propios; pantallas/commits no acreditan equivalencia de esfuerzo ni cierre de issues de Castilla.

**Fuentes leídas:** Frontend AGENTS.md, README.md, docs/GUIA_IMPLEMENTACION_FRONTEND_REACT.md, docs/COMPONENTES_FOUNDATION.md, reportes Foundation e issues #7/#8/#9 completos. En Docs:

- EQUIPO_Y_RESPONSABILIDADES.md.
- requisitos/specs/SPEC-005-gestion-cupones-descuento.md; SPEC-006-gestion-ofertas-promociones.md; SPEC-007-reglas-venta-cruzada-upselling.md.
- requisitos/hu/HU-005-gestion-cupones-descuento.md; HU-006-gestion-ofertas-promociones.md; HU-007-reglas-venta-cruzada-upselling.md.
- requisitos/flujos/FLOW-005-gestion-cupones-descuento.md; FLOW-006-gestion-ofertas-promociones.md; FLOW-007-reglas-venta-cruzada-upselling.md.
- ux/wireframes/flows/WF-005-gestion-cupones-descuento.md; WF-006-gestion-ofertas-promociones.md; WF-007-reglas-venta-cruzada-upselling.md.
- ux/mockups/ux/propuesta-ux.md, ux-decisions.md, ux-guidelines.md (UX 2.0); ux/mockups/DESIGN.md (1.1.0).
- ux/mockups/MK-005, MK-006, MK-007: component-spec.md, plan.md, tasks.md y los 19 HTML reales (6+6+7), leídos como composición sin copiarlos como React.
- contratos/http/openapi.yaml (0.5.0), catalogo-errores.md: límite de operaciones/DTO administrativos, sin asumir provider ejecutable.

validation-report.md de los tres MK: **NO ENCONTRADOS**. Component-spec/plan/tasks mantienen aprobación pendiente: HTML existente no equivale a APROBADO. La denominación anterior del repo sin G6 no permitió consultar los archivos; se usó la fuente oficial real.

Blobs oficiales contrastados: SPEC005 d112f32a73753eed7ff39645faaddb5fd7a4be37; SPEC006 dd7de3bab66ff01ee747ba9174b3f7c2495793d5; SPEC007 24ea7bff45281f62bf6cebad7d18c195e366b471; component-spec006 456adbbdc2f4db4133c4e73da3dc39a997be0692; component-spec007 032d62b947178f3a90144bf26fa0f12aaa2c9678. DESIGN y plan/tasks005 también contrastados.

## Trazabilidad de pantallas

Capturas en docs/evidencias, Chromium a **1440 × 900**, fullPage con scroll vertical natural. Las rutas /estado reproducen el mismo diálogo accesible desde detalle; no añaden pantallas comerciales.

| Pantalla | Ruta React | Acción/resultado verificado | Captura |
|---|---|---|---|
| MK-005-S01 | /cupones | Estado/paginación, detalle, editar, crear y contexto de regreso | cupones-s01-1440.png |
| MK-005-S02 | /cupones/nuevo | Código normalizado/único, promoción cupón, límites/mínimo/política, alta confirmada | cupones-s02-1440.png |
| MK-005-S03 | /cupones/:couponId/editar | Identidad, promoción/usos conservados; rechazo/incertidumbre | cupones-s03-1440.png |
| MK-005-S04 | /cupones/:couponId | Configuración y uso; editar/límites/estado | cupones-s04-1440.png |
| MK-005-S05 | /cupones/:couponId/limites | Cero, Sin límite y No disponible diferenciados; retorno | cupones-s05-1440.png |
| MK-005-S06 | /cupones/:couponId/estado | Cancelar/rechazar conserva estado/usos; confirmar cambia estado | cupones-s06-1440.png |
| MK-006-S01 | /promociones | Estado/modalidad/paginación, edición/detalle y contexto | promociones-s01-1440.png |
| MK-006-S02 | /promociones/nueva | Beneficio/prioridad/vigencia/canales/política explícitos | promociones-s02-1440.png |
| MK-006-S03 | /promociones/:promotionId/editar | Capacidad de modalidad, propuesta/error/conflicto conservados | promociones-s03-1440.png |
| MK-006-S04 | Formulario + /alcance | Productos completos/SKU; cancelar solo selección temporal | promociones-s04-1440.png |
| MK-006-S05 | /promociones/:promotionId | Configuración/alcance y acciones reales | promociones-s05-1440.png |
| MK-006-S06 | /promociones/:promotionId/estado | Confirmación, rechazo e historial que bloquea modalidad | promociones-s06-1440.png |
| MK-007-S01 | /recomendaciones | Estado/tipo/paginación y dos entradas de alta diferenciadas | recomendaciones-s01-1440.png |
| MK-007-S02 | /recomendaciones/nueva/venta-cruzada | Complementos activos sin origen/repetidos y orden | recomendaciones-s02-1440.png |
| MK-007-S03 | /recomendaciones/:ruleId/editar | Tipo/identidad/candidatos, conflicto y errores | recomendaciones-s03-1440.png |
| MK-007-S04 | /recomendaciones/nueva/upselling | Criterio sin default por candidato, justificación ≤500 | recomendaciones-s04-1440.png |
| MK-007-S05 | Formulario + /productos | Excluye origen/inactivos/añadidos; confirma o cancela conservando borrador | recomendaciones-s05-1440.png |
| MK-007-S06 | /recomendaciones/:ruleId | Origen/tipo/prioridad/vigencia y candidatos ordenados | recomendaciones-s06-1440.png |
| MK-007-S07 | /recomendaciones/:ruleId/estado | Confirmar/cancelar/rechazar/consultar resultado, candidatos conservados | recomendaciones-s07-1440.png |

## Comportamiento e integración

Página → componentes → hooks → puerto/service → adapter mock → fixtures. Modelos de presentación explícitos; IDs locales no son UUID contractuales. Un punto de composición por servicio selecciona el adapter siguiendo Pricing, sin flags de API en componentes. No hay HTTP directo, any ni HEX locales en Promotions.

Mutaciones en memoria de la pestaña: **recargar reinicia los datos**. No se alteran pedidos/stock/precios/pagos. Layouts anidados conservan el formulario al abrir/cancelar selectores; selección temporal se aplica solo al confirmar. Salir con borrador pide Seguir editando/Descartar, incluido Atrás. Guardando bloquea controles, doble envío y descarte. createBrowserRouter/RouterProvider reemplazan el wrapper BrowserRouter para utilizar el bloqueo de React Router, preservando raíz/Precios/galería DEV/404.

Cupones: trim/mayúsculas ASCII, código A–Z/0–9/guion/guion bajo y unicidad excluyendo el propio cupón. Promoción debe ser de modalidad cupón. Límites opcionales enteros positivos; ausencia explícita = Sin límite; uso no recibido = No disponible; cero confirmado = 0. Cambiar límite no recalcula disponibilidad ni borra consumo. Política configurada sin restitución de pedidos. Nueva promoción de modalidad cupón aparece en la sesión y la asociación bloquea su modalidad.

Promociones: porcentaje (0,100] o monto positivo, prioridad positiva, inicio/fin Lima válidos, fin posterior, canal y alcance explícitos. Política exclusiva inicial normativa. Producto completo permanece como productId, sin expansión a SKU. Modalidad editable solo con capacidad informada true; false/ausencia bloqueados. Mock revalida asociación e historial de activación, incluso después de desactivar.

Recomendaciones: edición conserva tipo; cambio de origen producto/categoría pide confirmación. Productos activos, sin duplicados ni origen específico; orden positivo. Upsell requiere uno de cuatro criterios normativos por candidato, sin default ni comparación por precio; justificación opcional ≤500. Precio y disponibilidad **No disponible** por D-REC-01/02, sin sumar SKU ni agregar/reemplazar pedidos.

Estados: carga/vacío/error/ausencia/acceso distintos. Rechazo conserva propuesta/registro; conflicto exige consultar/revisar. Resultado incierto bloquea reenvío automático: edición/estado consultan registro; Cupones puede localizar alta por código único en el demo. Creaciones de campañas/reglas sin ID confirmado requieren buscar en listado; no se promete API de recuperación. La búsqueda de 100 cupones/igualdad de snapshots es solo estrategia de este demo.

Escenarios DEV + modoRevision=1: loading/empty/error/missing/session/forbidden; saving/save-error/rejected/conflict/unknown-result; selection-empty/selection-error/unknown-capability y usage-unavailable donde aplican. Producción ignora habilitación. No hay controles técnicos en navegación comercial. Acceso simulado no acredita autenticación real.

**BLOCKED_CONTRACT:** operaciones administrativas provisional-internal; provider ejecutable/URL/auth/grants y mapping DTO reales sin verificar. D-REC-01/02 bloquean enriquecimientos, no administración. API real: NO EJECUTADO. Docs/Backend: sin modificaciones.

## Diferencias de fuentes

| Fuente / problema | Corrección/propuesta en React | Owner pendiente |
|---|---|---|
| MK005 cita DESIGN1.0; vigente1.1 | Theme existente1.1 | Cueva/Vera |
| HTML S01/S04 colorean Activo/Inactivo ordinario | Badge neutral, DESIGN §4.1.1/DS-C14 | Vera |
| HTML Material Symbols/JetBrains/tamaños/decoraciones | Inter/Oswald/Tabler y defaults, sin HEX locales | Vera |
| RUN10 HTML difiere de fixture mínimo/vigencia | Fixture component-spec005 §13 para demo; homologación pendiente | Cueva/PO |
| tasks005 T11 pide filtrar RUN10; spec/API estado/paginación | Sin búsqueda remota no publicada | Cueva/Taco |
| Issues/HTML sugieren búsquedas amplias; spec006/007 delimita filtros | Estado/modalidad o estado/tipo; búsqueda local en selector mock | Cueva/providers |
| D-REC-01/02 abiertos | No disponible, sin precio/stock ficticio | Owners contratos/PO |
| Plan/tasks aprobación pendiente pese a HTML | Entrega provisional según issues; sin APROBADO/VALIDATED | Cueva/Vera/PO |

## Archivos y responsabilidad

Dentro de src/features/promotions:

- services/{coupon,campaign,recommendation,catalog}Repository.ts: tipos de presentación y puertos.
- services/{coupon,campaign,recommendation,catalog}Service.ts: composición de adapters.
- services/couponPresentation.ts, couponValidation.ts, campaignValidation.ts, recommendationValidation.ts, administration.ts: semántica/contexto/validación/normalización/errores.
- mocks/coupons.ts, campaigns.ts, recommendations.ts, catalogChoices.ts: fixtures tipados deterministas.
- adapters/mockCouponRepository.ts, mockCampaignRepository.ts, mockRecommendationRepository.ts, mockPromotionCatalogRepository.ts: memoria, revalidación, filtros, escenarios y vínculo cupón/promoción.
- hooks/useCoupons.ts, useAdministrationRead.ts: consultas cancelables y resultados obsoletos.
- hooks/useCouponForm.ts, useAdministrationEditor.ts, usePromotionCommand.ts, useUnsavedChanges.ts: borradores, validación, single-flight, reconciliación y navegación.
- components/CouponForm.tsx, CouponSummary.tsx, CouponStateDialog.tsx: formulario, consulta y confirmación de cupón.
- components/CampaignScope.tsx, RecommendationCandidates.tsx: alcance y candidatos con orden/criterio/justificación.
- components/AdministrationStateDialog.tsx, EditorMessage.tsx, UnsavedChangesDialog.tsx: estado compartido, recuperación y descarte.
- pages/CouponsPage.tsx, CouponDetailPage.tsx, CouponFormPage.tsx: seis vistas de Cupones.
- pages/CampaignsPage.tsx, CampaignDetailPage.tsx, CampaignEditorLayout.tsx, CampaignFormPage.tsx, CampaignScopePage.tsx: seis vistas de Promociones.
- pages/RecommendationsPage.tsx, RecommendationDetailPage.tsx, RecommendationEditorLayout.tsx, RecommendationFormPage.tsx, RecommendationSelectorPage.tsx: siete vistas de Recomendaciones.

Transversales y evidencia:

- src/app/routes/AppRoutes.tsx, src/main.tsx: router de datos/bloqueo sin provider duplicado.
- src/app/routes/productRoutes.tsx, productPages.tsx: registro y carga diferida.
- src/app/navigation/navigation.ts, ApplicationNavigation.tsx: tres enlaces/grupos funcionales, conserva Precios/demos.
- tests/coupons.spec.ts, coupon-write.spec.ts, campaigns.spec.ts, recommendations.spec.ts, promotions-states.spec.ts: **29 pruebas nuevas** de flujos, errores, teclado, estados, guardas, selectores y contexto; conserva las 13 existentes.
- docs/evidencias/{cupones,promociones,recomendaciones}-sXX-1440.png: **19 capturas**; diez evidencias históricas regeneradas por sus suites con la navegación actual.
- README.md, este reporte y PR_PROMOTIONS_CUEVA.md: ejecución/rutas/alcance, fuentes/pruebas y descripción de revisión.

## Validaciones

Instalación PASS: npm ci --prefer-offline --fetch-retries=0 --fetch-timeout=20000, 191 paquetes. Node24.11.1/npm11.6.2. Chromium instalado por npx playwright install chromium. Primer intento con red limitada no terminó; se reinstaló con éxito y se utilizó formatter3.8.1 de caché, sin cambiar dependencias/lockfile.

| Comprobación | Resultado |
|---|---|
| npm run typecheck | PASS, salida0 |
| npm run build | PASS, salida0, Vite8.3.4 |
| npm run lint | PASS, salida0 |
| npm test -- --workers=2 | PASS: 42 pruebas, salida0, 3.1 min (13 existentes + 29 nuevas) |
| Pruebas tras ajuste visual | 13 pertinentes PASS; 3 recorridos de evidencia PASS; captura de diálogo final PASS (1 prueba adicional) |
| Visual1440×900 | PASS de inspección de las 19 vistas; criterio completo visible y diálogos capturados tras transición, sin overflow de página |
| git diff --check | PASS, salida0; avisos LF/CRLF |
| Preview producción4173 | PASS: tres listados y tres altas; revisión DEV ignorada, galería inaccesible y cero errores de página |
| API/auth/grants reales, despliegue, Actions | NO EJECUTADO |

Los fallos intermedios se inspeccionaron: labels/selección de botones durante cierre de modal/nombre de acción y región de carga en tests. Se corrigieron labels, selectores y problemas de foco/conservación de diálogo/guardado confirmado frente a guardas. No se cambiaron pruebas existentes para ocultar fallos.

## Matriz y pendientes

- [x] Fuentes/rutas/revisión verificadas y aprobación pendiente declarada.
- [x] Git inicial/branch/cambios inspeccionados; 19 pantallas identificadas.
- [x] Typecheck/build/lint ejecutados.
- [x] Suite completa42 PASS; pruebas pertinentes tras ajuste visual PASS.
- [x] Las 19 vistas y la última captura de cupón inspeccionadas; evidencia final registrada.
- [x] Estados y errores con mocks, sin HTTP visual/HEX/any/contratos inventados.
- [x] Docs/Backend preservados y P0 registrados.
- [ ] API/grants/despliegue: NO EJECUTADO.
- [ ] Publicación, revisión independiente y aprobación UX: PENDIENTE.

SAFE_NOW: UI/mocks de19vistas completos. NEEDS_DECISION: homologación documental y aprobación UX/funcional; BLOCKED_CONTRACT: HTTP real y enriquecimientos D-REC-01/02.

Publicación autorizada en `cueva` mediante commits de base compartida, flujos y validación; PR hacia master con Refs #7/#8/#9 mientras falte revisión. Solicitar revisión UX a LeonardoVera y técnica/funcional a mrcastilla8, conforme a los issues y responsabilidades. No se afirma DoD global cerrado hasta revisión y aceptación de limitaciones. Mobile/tablet, backend, auth y auditoría WCAG exhaustiva fuera de alcance.

**Estado: MOCK_INTEGRATED provisional de los tres MK; publicación/revisión de issues pendiente.**
