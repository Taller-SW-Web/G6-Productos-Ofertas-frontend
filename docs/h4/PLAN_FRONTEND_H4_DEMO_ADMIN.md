# PLAN DE CIERRE FRONTEND H4 — DEMO ADMINISTRATIVA G6

- **Proyecto:** G6 Productos y Ofertas / Inka Athletics
- **Repositorio autorizado para implementación:** `Taller-SW-Web/G6-Productos-Ofertas-frontend`
- **Rama de ejecución:** `fix/frontend-h4-cierre-integral`
- **Referencia de revisión:** 2026-11-07. `master` frontend `f9c494ae1c23e7107c8b1c41c4af9f2ad40fca09`; H4 `520366d5d4766d9a173269d43e1ee34e7d6b5cbf`. **Comprobar de nuevo ambos HEAD al comenzar.**
- **Alcance:** EXCLUSIVAMENTE frontend: Catálogo, Taxonomía, Pricing, Inventario, Combos, Promociones; las funciones de Bulk y Auditoría de Precios deben conservarse y sus regresiones corregirse porque H4 las modificó.
**Objetivo:** entregar código frontend integrado, estable, seguro, verificable, compatible con el login general de `master`, preparado para conectar con backend/Gateway reales y capaz de ejecutar todas las funciones respaldadas por contratos disponibles. Documentar explícitamente toda dependencia futura del backend, sin inventarla.

> **Diferencia entre estados:** `FRONTEND_LISTO` exige compilar, superar las pruebas y ofrecer los flujos correctos cuando las APIs contractuales respondan. `INTEGRACION_REAL_VERIFICADA` exige pruebas con Gateway, G7 y servicios reales, que no puede afirmarse si no se dispone de acceso. `BLOQUEADO_POR_BACKEND` significa que el frontend está preparado para la capacidad, pero falta una operación/DTO/grant/servicio homologado. Nunca confundirlos.

## 1. Condiciones de implementación y autorización

1. Trabajar **en `fix/frontend-h4-cierre-integral`**, conservar su historial y sus avances. La autorización cubre cambios profundos en **todas** las carpetas frontend de los microservicios, componentes, hooks, adaptadores, interfaces, tests, rutas, arranque, build y CI frontend; no limitarse a retoques cosméticos.
2. Sincronizar con `origin/master` **al inicio** y revisar los archivos discrepantes. No hacer `reset --hard` sobre H4, no sobrescribir masivamente los avances de uno u otro, no perder ni el login general de `master` ni las integraciones HTTP de H4. Preferir una integración rastreable por merge; si se opta por rebase, preservar historia y explicar la decisión. Resolver conflictos manualmente y probar.
3. Autorización explícita para implementar cambios de frontend necesarios **aunque todavía no estén descritos en Docs**, siempre que sean técnicamente seguros y no falsifiquen contratos de backend. Cada divergencia/decisión nueva debe tener trazabilidad suficiente para un **PR posterior en el repositorio de Docs**.
4. No escribir en `G6-Productos-Ofertas-backend`, `G6-Productos-Ofertas-docs` central, Supabase compartido ni despliegues reales. Leerlos para contrastar. Generar **handoff de documentación listo para PR** dentro del frontend, sin editar el Docs central en esta fase.
5. No inventar endpoints, campos obligatorios, UUID de canal, información de stock, versiones, roles ni estado persistido. Ante contrato faltante, preparar la capa frontend tipada y mostrar un bloqueo claro, sin redirigir silenciosamente a mocks.
6. No debilitar seguridad, tests ni condiciones para obtener verde. No borrar suites que fallan, no hacer `skip`/`only` permanentes, no eliminar workflows ni controles de login/MFA, no bypass de auth, no guardar secretos en variables `VITE_*`.
7. Se permite ajustar arquitectura y refactorizar adapters/hook si facilita la integración coherente. Mantener diseño existente: lineamientos de frontend/design, componentes compartidos, visuales del login general y estilo Inka Athletics. Si hay conflicto de diseño, justificar cambios y aportar evidencia visual.
8. Toda escritura de resultado ambiguo debe ser conservadora: persistir intención por propietario G7 cuando proceda, no reenviar ciegamente POST/PATCH/PUT/DELETE tras timeout/5xx/408; reconciliar únicamente contra una lectura que acredite identidad **y efecto**. Un 202 de proceso asíncrono no equivale a finalización.

## 2. Estado REAL de la rama H4 frente a master

| Área | En H4 | Consecuencia para este trabajo |
|---|---|---|
| Login | `GlobalSessionGate`, `PromotionSessionGate`; `src/main.tsx` compone runtime | **No reemplazar** el login general más reciente en `master`: `src/startApplication.tsx`, `src/app/config/AuthSessionContext.ts`, `src/app/routes/RequireSession.tsx`, `src/features/auth/pages/LoginPage.tsx`, `src/features/auth/authorization.ts`. Unificar la sesión y el arranque. |
| Cliente HTTP | `src/app/config/authenticatedGatewayClient.ts` común | Integrarlo con sesión general; conservar token humano G7, renovación selectiva de GET, no replay de mutaciones y seguridad de paths. |
| Catálogo | Lectura comercial, creación, preparación, variantes, versiones de respuestas de escritura | Sigue faltando **lectura administrativa con estado y `catalogVersion`**, requisito de editar y gestionar borradores después de recargar. |
| Taxonomía | `httpTaxonomyAdmin.ts`, `httpProductTypeAdminAdapter.ts`, `taxonomyHttp.ts`; gate API habilitado | Revisar contratos, UX y regresiones, **no volver a crear** estos adaptadores. |
| Pricing | `createHttpPricingRepository` ya se inyecta en `src/main.tsx`; targets de Catálogo | Transportar composición a `startApplication`, resolver canales y dependencias; tests fallan. |
| Inventario | `configureInventoryApi` ya llamado; SKU comerciales, stock, dashboard, umbrales, traslados | Conservar composición; limitar cobertura honestamente; solucionar falta de alertas/ubicaciones/catálogo físico. |
| Combos | `httpCombosRepository.ts` y composición con Catálogo/Pricing | No recrear. Corregir E2E, estados inciertos y visualización de disponibilidad. |
| Promociones | HTTP ya integrado y reforzado, marcadores persistentes | Corregir DTO ajeno aceptado como confirmación y errores de auth, pruebas y referencias. |
| Otras carpetas H4 | Bulk, Auditoría de Precios, navegación, CI, evidencia | Conservar, corregir regresiones que impiden CI. |

**Evidencia declarada por H4:** `docs/ESTADO_CIERRE_INTEGRAL_H4.md`, `docs/MATRIZ_PRUEBAS_REGRESION_H4.md`, `docs/MATRIZ_OPENAPI_H4.csv`. La matriz registrada reportó 58 PASS / 26 FAIL en Playwright completo antes de reruns dirigidos, y fallos unitarios en Bulk, Combos, Taxonomy, Pricing e Inventory. **No hay constancia de una ejecución integral posterior totalmente verde ni E2E externo.** Analizar el estado actual antes de corregir; no asumir que todos persisten ni que ya se resolvieron.

## 3. FASE F0 — Sincronización segura con master y arquitectura de arranque (P0)

### F0.1 Inspección y respaldo lógico
- Registrar `git status`, remotos, SHA de H4 y `origin/master`, commits divergentes, estado de PR si existe. Trabajar con árbol limpio o gestionar cambios preexistentes sin descartarlos.
- Comparar por carpeta y por archivos borrados/añadidos. Distinguir código H4 previo a login general de los cambios recientes en master. Preparar mapa de resolución de conflictos.
- Traer `origin/master` a **H4**; no modificar `master` directamente. No crear una rama paralela sustitutiva salvo imposibilidad técnica documentada.
- Revisar especialmente los archivos que H4 removió respecto a master: `src/startApplication.tsx`, componentes `src/features/auth/*`, `AuthSessionContext`, `RequireSession`, archivos de pruebas de login, documentación y scripts de verificación; asegurar su permanencia tras merge.

### F0.2 Un solo bootstrap/una sola sesión G7
- Mantener el flujo visual y funcional de `LoginPage`, `LoginForm`, MFA, logout, accesos y `RequireSession` de master. Evitar dos sistemas de login compitiendo o sesión duplicada.
- Integrar toda la composición H4 en el **punto de arranque vigente** (actualmente `src/startApplication.tsx` en master). Decidir si `main.tsx` solo instancia root y sesión, evitando inicializaciones múltiples.
- Distribuir **la misma instancia** de `G7Session` a Catálogo, Taxonomía, Pricing, Inventario, Combos, Promociones, Bulk y Auditoría de Precios. Centralizar cliente seguro de Gateway donde sea compatible; los transportes especializados pueden existir pero deben compartir identidad.
- Respetar `GESTOR_COMERCIAL` para habilitación UI cuando corresponda, dejando autoridad real en Gateway/backend. Accesos sin permisos: navegación bloqueada y/o controles deshabilitados con 403 explícito.
- Aislar caches, pendientes, intenciones de escritura, claves y vistas por identidad de usuario, especialmente cambios A→B, logout, refresh y respuestas tardías. Limpiar caches de lectura apropiadamente, **no** borrar intención incierta del usuario anterior como si nunca hubiese ocurrido.
- Una única política de 401 `TOKEN_INVALIDO`: como máximo un refresh + repetición solo de lectura GET segura; no reenvío de mutaciones; 401 de mutación debe desencadenar invalidación/bloqueo coherente con el login general.
- Verificar rutas `/login`, página inicial administrativa `/productos` o ruta de negocio justificada, redirección después de login, enlaces de regreso, deep links, 404, despliegue SPA y rutas de demostración aisladas.

### F0.3 Variables de entorno, modos, infraestructura frontend
- Validar `VITE_DATA_MODE=mock|api`; en modo API **no fallback a mocks**. La demo comercial `VITE_G6_READ_DEMO` no debe saltarse la política de acceso administrativo.
- `VITE_GATEWAY_ORIGIN` = origen HTTPS sin `/api/v1`; `VITE_G7_API_BASE` = base autenticación G7 conforme runtime. No duplicar rutas, no enviar bearer a host ajeno, no `credentials: include` salvo contrato explícito.
- Revisar `.env.example` porque comentarios de H4 hablan de acceso sin G7 de fase 1; corregir instrucciones engañosas para **demo administrativa autenticada**, conservando fases públicas autorizadas por separado.
- Errores de origen no configurado, CORS, red, token, backend 503, timeout y DTO inválido deben tener resultado visible y no explotar el shell entero. Respetar AbortSignal, correlación y headers de idempotencia.
- Revisar `CommercialModeGate.tsx` y `TaxonomyModeGate.tsx` tras merge; no regresar a bloqueos generales del master, pero tampoco abrir capacidades sin adapter/configuración/sesión.

**Aceptación F0:** login general + MFA + logout operativo en modo API controlado; los seis módulos comparten owner y cliente correcto; sin requests sin autenticación; build mock y API; tests de sesión/roles, cambios de usuario y rutas profundas.

## 4. FASE F1 — Contratos tipados y patrón transversal de frontend (P0)

1. Crear/normalizar interfaces explícitas de repositorio, mapper, modelos de dominio y DTO HTTP para cada servicio. Los mappers validan datos críticos, IDs, versión, paginación y discriminantes; jamás convierten `null`/campo ausente en cero, `ACTIVO`, `COMPLETED` o éxito.
2. Error model homogéneo: validación 400/422, sesión 401, permisos 403, no encontrado 404, conflictos 409, indisponibilidad 503, tiempo de espera, estado de escritura incierta, operación pendiente 202 y contrato incompatible. Mostrar feedback recuperable con acción válida, sin falsos éxitos.
3. Capacidades diferenciadas: lecturas disponibles, escritura autorizada, operaciones inhabilitadas por contrato, permisos o preparación; no habilitar un botón por el simple hecho de que la ruta exista en OpenAPI.
4. No mezclar DTO comercial con detalle administrativo. Uso de datos reales para selectors (Taxonomía, productos, SKU, canales, ubicaciones), con estados de loading/empty/error/forbidden completos.
5. Paginación real, filtros válidos, orden, conteos, navegación, cancelación y concurrencia acotada; los llamados de enriquecimiento no deben hacer fallar una mutación ya confirmada.
6. Establecer plantilla de pruebas unitarias y HTTP simuladas contractuales por adapter, tests de UI/Hooks y recorridos Browser. Fixtures fieles al contrato, independientes de mappers productivos.

## 5. CATÁLOGO — P0 crítico (carpeta `src/features/catalog/`)

**Archivos principales H4:** `adapters/httpCatalogRepository.ts`, `adapters/httpCatalogMapper.ts`, `adapters/httpTaxonomyRepository.ts`, `services/catalogHttpRuntime.ts`, `hooks/useProductForm.ts`, `hooks/useProductStateMutation.ts`, páginas de productos/variantes/preparación y pruebas `tests/catalog-http.spec.ts`, `tests/catalog-regressions.spec.ts`.

### Trabajo frontend requerido
- Preservar consultas comerciales `GET /api/v1/productos`, `GET /api/v1/productos/{productoId}` tal como están publicadas, sin atribuirles estado administrativo ni versión. Preservar GET preparación y listado/consulta de variantes reales.
- Definir **separación de contratos** `CommercialProductSummary/Detail` vs `AdminProductSummary/Detail` y un adaptador administrativo específico que consuma **solo la operación autorizada/implementada por backend**, cuando exista. No crear llamadas a rutas supuestas. Documentar la solicitud exacta a backend en handoff.
- Preparar mappers/pantallas para admin `productoId`, `estado`, `catalogVersion`, `nombre`, `descripcion`, `categoriaId`, `marcaId`, `tipoProductoId`, `skuBase`, `tieneVariantes`, imágenes, atributos y perfil físico **solo cuando sean publicados**. Requisitos de lectura tras recarga, borradores y productos inactivos.
- Mientras backend no publique una lectura administrativa, mantener el bloqueo explícito de edición/activación del producto que requiera versionado; **no sustituir `catalogVersion` por el de una respuesta antigua, por versión de variante ni por estado inferido de preparación**.
- Refinar lista administrativa: buscar/filtrar/paginar todos los estados cuando el contrato lo permita; si no, etiquetar la lista como **comercial/activa** y no simular borradores. Filtros no publicados deben estar ocultos o bloqueados, no enviados arbitrariamente.
- Creación de producto: validar nombre/descr/categoría/marca/tipo/`skuBase`/`tieneVariantes`/`precioBaseInicial` y características del esquema; POST confirma BORRADOR, navegar a preparación con resultado confirmado, pero la recarga sin DTO admin sigue siendo una dependencia de backend identificada.
- Edición, activar, desactivar, reactivar, alta/edición/estado de variantes y `preparacion/reintentar` deben usar guards y versiones correctas, validaciones de compatibilidad Q-06; SKU e identidad comercial inmutables cuando corresponda. No activar SKU sin requisitos de preparación.
- Identificar rol de característica `esIdentificadora`: si Taxonomy no publica metadato, **no deducirlo** de `obligatoria`; preparar el UI para dato oficial y dejar bloqueo específico donde sea indispensable. Características `TEXTO` no requieren un `maxLength` ficticio.
- Las imágenes y URLs deben validarse; no usar placeholders como evidencia de calidad real.
- Conservar intención segura de escrituras inciertas, owner G7, correlación y no doble POST; reconciliar **solo** cuando una lectura administrativa confirme el resultado, si existe. Borrador creado no debe desaparecer silenciosamente de la UI.

**Aceptación Catálogo:** con un backend que publique los DTO administrativos, se puede listar BORRADOR/ACTIVO/INACTIVO, crear, recargar, abrir detalle, editar y cambiar estado; administrar variantes con versionado; ver preparación pendiente/completada/rechazada. Hasta entonces declarar formalmente **DEPENDENCIA BACKEND CAT-ADMIN-READ** y mantener pruebas del comportamiento bloqueado.

## 6. TAXONOMÍA — P0 (carpeta `src/features/taxonomy/`)

**Código existente:** `adapters/httpTaxonomyAdmin.ts`, `adapters/httpProductTypeAdminAdapter.ts`, `adapters/taxonomyHttp.ts`, `services/taxonomyServices.ts`, `services/taxonomyGatewayRuntime.ts`, `src/app/config/TaxonomyModeGate.tsx`.

### Trabajo frontend requerido
- **No recrear los adapters:** revisar y corregir por contrato/DTO cada lectura y escritura de: categorías (árbol, listar, crear/editar, reactivar, baja y seguimiento), características/valores (CRUD/estados), tipos de producto/esquemas/asociación/obligatoriedad/desasociación/reactivación, marcas y SEO.
- Validar paginación completa, versiones y semántica de filtros, 404 de SEO, lectura detalle, confirmaciones 201/200 y 202 para operación asíncrona. El estado asíncrono exige seguimiento por operación y estados de negocio, no un toast de éxito prematuro.
- `POST/PATCH` de marca requiere multipart/form-data cuando hay logo; no establecer boundary manual. Distinguir campo omitido, cadena vacía, reemplazo/eliminación de logo. Si el backend no verifica semántica de limpieza o contenido exacto, registrar bloqueo/acuerdo pendiente.
- Flujo de slug de categoría: resolución/propuesta y `slugConfirmado`, conflictos y confirmación del usuario; no generar slug supuestamente definitivo por frontend.
- Regresar desde detalle/edición a lista con estado consistente, mostrar pendientes, rechazos y campos no disponibles sin inventar límites ni cantidades.
- Revisión de preservación de intención: corroborar identidad, payload, versión y efecto; asociaciones requieren `schemaVersion` mayor; usuario A y B aislados.
- Corregir suites `taxonomyReconciliationH4.test.ts`, `taxonomyApiUi.test.tsx`, unitarias y E2E de Taxonomía; adaptar las expectativas antiguas de gate a las rutas que **deben** estar disponibles, no restaurar bloqueos falsos para pasar tests.

**Aceptación Taxonomía:** operaciones administrativas navegables y pruebas HTTP por endpoint disponible, con manejo de 202/consulta de operación; UI conserva exactitud de IDs/versiones y no atribuye permisos ni contratos no concedidos.

## 7. PRICING — P0 (carpeta `src/features/pricing/`)

**Código existente:** `adapters/httpPricingRepository.ts`, `adapters/httpPricingMapper.ts`, `services/pricingService.ts`; composición H4 de `src/main.tsx` y tests `httpPricingReconciliationH4.spec.ts`, `httpPricingSafety.spec.ts`, `httpPricingRepository.spec.ts`.

### Trabajo frontend requerido
- Transportar **la inyección real** de `createHttpPricingRepository` al bootstrap único; no regresar a `createPricingRuntime(mode)` sin deps API.
- Construir catálogo de objetivos con paginación íntegra y sin duplicaciones, productos comerciales activos y variantes `ACTIVA`. Distinguir **producto padre** (objetivo legítimo de precio producto) de **SKU realmente vendible**; no inventar precios por variante ni tratar SKU base de padre con variantes como vendible.
- Mantener lectura global de precio cuando no hace falta canal. Para RETAIL/MARKETPLACE/CHATBOT/VENTAS, requerir `channelId` UUID canónico **proporcionado por contrato/configuración autorizada**; no usar nombres de canal como UUID ni `null` si significa otro canal. Si falta, bloquear solo la operación afectada y documentar requerimiento.
- Operaciones: consultar precio actual/regular/oferta, editar precio con `priceVersion`, crear/consultar programaciones con vigencias, validar PEN/decimales exactos y restricciones de `precioOferta`. Relectura confirmada y conflictos 409.
- Resolver discrepancias de lectura y edición de precio de producto Retail; no fabricar versión Retail desde precio global.
- Conservar medidas H4 para timeout/respuesta incierta, baseline de programación, confirmación exacta por owner/target/channel/importe/vigencia e independencia de sesiones.
- Trabajar con Backend/Gateway para 503 de introspección G7 (handoff); no neutralizar el bloqueo HTTP en frontend. Importador propietario Pricing no es obligatorio para esta demo si no existe contrato aprobado; Bulk v2 es módulo distinto.
- Corregir tests de marcadores corruptos/inaccesibles sin relajar su protección; validación funcional y React en modo API.

**Aceptación Pricing:** una selección válida abre precio real, permite edición/programación contractual en canales con UUID autorizados y confirma persistencia sin doble escritura; canales no configurados quedan bloqueados con diagnóstico preciso.

## 8. INVENTARIO — P0/P1 (carpeta `src/features/inventory/`)

**Código existente:** `adapters/apiInventoryAdapter.ts`, `services/inventoryProvider.ts`, `hooks/useInventoryDashboard.ts`, `hooks/useThresholds.ts`, `services/transferReceptionAttempt.ts`; composición H4 desde `src/main.tsx`.

### Trabajo frontend requerido
- Conservar `configureInventoryApi` en nuevo bootstrap, un único repositorio HTTP por identidad. No regresar a `ApiPendingRepository` cuando configuración válida.
- Stock: mantener consulta por SKU comerciales activos obtenidos desde Catálogo y `GET disponibilidad` por lotes cuando sea contractual; **etiquetar cobertura como comercial, no inventario físico total**. No tratar ubicaciones desconocidas como stock cero. Distinguir SKU padre no vendible de variantes.
- Admin dashboard: mostrar KPI/distribución contractual, filtros y estados; reutilizar consulta pendiente sin mezclar propietarios. Alertas permanecen «no disponibles» hasta contrato/backend oficial, no calcularlas como verdaderas.
- Umbrales globales y por SKU: listar, PUT/DELETE con enteros seguros, versión/condiciones, confirmación explícita, relectura coherente, protección ante GET antiguo. Probar 204 y la intención si falla la lectura auxiliar.
- Traslados: listado y detalle, recepción con `Idempotency-Key` e identidad/payload inmutable; recuperaciones tras recarga y respuestas inciertas nunca reenvían con nueva clave. Mostrar `locationId` cuando nombres no publicados, sin transformar un ID en nombre real.
- Si backend entrega un catálogo administrativo de SKU físicos, nombres de ubicaciones y alertas, conectar fuentes con adapters tipados; si no, preparar interfaces/hooks y documentar **INV-FULL-SKU / INV-LOCATIONS / INV-ALERTS**, con alcance reducido visible.
- Corregir y ejecutar pruebas `apiInventoryAdapter.spec.ts`, `useInventoryDashboardH4.spec.ts`, `useThresholds.spec.ts`, flujos de stock, dashboard, traslados y race conditions.

**Aceptación Inventario:** saldos comercialmente cubiertos, umbrales, KPIs, traslados y recepción pueden consumirse con DTO real; cualquier función dependiente de fuentes inexistentes aparece explícitamente limitada y no bloquea las disponibles.

## 9. COMBOS — P0 (carpeta `src/features/combos/`)

**Código existente:** `adapters/httpCombosRepository.ts`, `adapters/catalogCombosAdapter.ts`, `adapters/pricingCombosAdapter.ts`, `services/combosService.ts`, páginas de lista/crear/editar/detalle, tests H4.

### Trabajo frontend requerido
- Conservar repo HTTP existente y conectarlo al bootstrap unificado. Revisar GET listado/detalle, POST alta, PATCH edición, POST desactivar y GET disponibilidad conforme contratos vigentes; no inventar `activar/reactivar` si el backend no los publica.
- Mapeo explícito UI↔backend: `priceMinor` en centavos a `precioCombo` en unidades PEN, con aritmética decimal exacta; componentes UI `{sku, quantity}` a payload backend `{sku, cantidad}`; IDs, `version`, estados y DTO sin confusiones.
- Selector: SKU vendibles activos desde Catálogo, con precios reales de Pricing; validar al menos dos SKU distintos cuando corresponda, cantidades positivas y límites de precio frente a suma regular/pública. No considerar SKU base padre con variantes como SKU vendible.
- Disponibilidad: si `verificable:false`, `cantidadInformativa:null`, `INCOMPLETA` o 503 auxiliar, conservar combo y mostrar **NO VERIFICABLE**; `null` no es cero. Concurrencia y cancelación controladas.
- Confirmación 201/200 no queda deshecha por un GET auxiliar que falla. Alta incierta sin lookup/idempotencia aprobada debe conservar bloqueo por usuario/intención; **solicitar contrato backend** si se requiere recuperación automática.
- Corregir `httpCombosRepositoryH4.test.ts`, compatibilidad de páginas y regresiones E2E para crear/editar/desactivar/reabrir sin duplicados.

**Aceptación Combos:** CRUD respaldado por ruta existente con SKU/precios reales, estados de error y disponibilidad honestos; sin prometer activación inexistente ni recuperación automática no contractual.

## 10. PROMOCIONES — P0 (carpeta `src/features/promotions/`)

**Código existente:** `adapters/httpPromotionServices.ts`, `adapters/httpPromotionCatalog.ts`, `services/promotionSessionRuntime.ts`, páginas/hooks de campañas/cupones/reglas, tests de reconciliación y sesión.

### Trabajo frontend requerido
- Unificar sesión con login global `master` y conservar adapters HTTP administrativos. Verificar campañas/promociones: listar, detalle, crear, editar, activar, desactivar y filtros; cupones: listar/crear/editar/estado; recomendaciones: reglas/crear/editar/estado y asociaciones.
- Resolver referencias desde Catálogo/Taxonomía de manera compatible: SKU vendibles y categorías con permisos; fallos de dependencias se muestran por componente, sin convertir fallos de autorización en «sin datos».
- **Defecto concreto H4:** `SEC-H4-06` documenta PATCH 2xx con `promotionId` distinto al solicitado que el frontend acepta. Rechazar confirmación de identidad ajena en todas las entidades (promociones/cupones/reglas), con pruebas.
- **Defecto concreto H4:** prueba documenta mutación 401 sin invalidación de sesión: reconciliar con política de login general y asegurar que la respuesta no sea tratada como éxito.
- Proteger POST/estado incierto por owner/id/intención, comparación exacta contra DTO y no reenviar; en alta de campañas/reglas sin identidad natural autorizada no inventar conciliación por nombre. Preservar 201/200 de la escritura aunque falle el enriquecimiento auxiliar, pero mostrar el error auxiliar.
- Para demo ampliada, verificar comerciales `POST /promociones/evaluar`, `/cupones/validar` y recomendaciones solo si son parte del objetivo y las dependencias reales están habilitadas; no afirmar resultado favorable ficticio.
- Corregir y correr `httpPromotionsReconciliationH4.test.tsx`, `promotions-session.spec.ts`, `promotions-http-contract.spec.ts`, flujos UI de campañas/cupones/reglas.

**Aceptación Promociones:** alta/edición/estado accesibles tras login, confirmaciones con IDs correctos, referencias reales, permisos y errores verificados, sin confundir enrichments con éxito de mutación.

## 11. Regresiones transversales H4: Bulk y Auditoría de Precios — P0 para CI

Aunque la demo de esta fase se centra en seis microservicios, H4 también alteró `src/features/bulk/`, `src/features/price-audit/`, navegación y pruebas comunes. **No se deben dejar rotos al integrar la rama.**

- Bulk: revisar los fallos de clasificación de resultado incierto, rehidratación por usuario/hash/batchId, limpieza de estado UI y E2E-07/E2E-08. No reintentar POST de un archivo por timeout; no habilitar `/reanudar` mientras `RETRY_PROTOCOL_NOT_APPROVED` siga vigente.
- Price Audit: revisar paginación, producto/canal nulo, exportaciones, permisos y presentación. No inventar SKU ni canal en DTO; conservar bloqueo donde Backend/Gateway rechace el contrato. Reparar fixtures de browser **sin** falsear proveedor.
- Recuperar los scripts/tests de login y CI incorporados por master: H4 había borrado varios archivos que forman parte del login general. No perderlos ni eliminarlos para pasar la rama.

## 12. Matriz de corrección de regresiones (obligatoria)

| Grupo | Evidencia previa H4 | Trabajo exigido |
|---|---|---|
| Unit Bulk | 63 PASS / 6 FAIL | Corregir clasificación de incertidumbre y fixtures; repetir suite completa. |
| Unit Combos | 70 PASS / 2 FAIL | Aclarar contrato de auxiliar y conciliación de cupón si suite compartida; repetir completa. |
| Unit Taxonomy | 55 PASS / 9 FAIL | Conciliación de marcadores y expectativas UI/gate después de integración con master. |
| Unit Pricing | 122 PASS / 41 FAIL | Diagnóstico de marcadores corruptos/inaccesibles, aislamiento y casos de canal; sin eliminación de protecciones. |
| Unit Inventory | 91 PASS / 17 FAIL | Umbrales, reception, almacenamiento, filtros y refresh; probar rehidratación. |
| Browser Playwright | 58 PASS / 26 FAIL antes de reruns | Reparar todas las fallidas y agregar prueba de login general + seis módulos. Una repetición dirigida no equivale a suite completa verde. |
| Seguridad | `SEC-H4-06` y 401 de mutación | Rechazar ID ajeno y política coherente de invalidación de sesión. |
| Integración real | `REAL-01/02` pendientes por entorno | Mantener `PENDIENTE_ENTORNO` hasta ejecución verdadera; no reportar PASS usando `page.route`. |

**No considerar anteriores conteos como estado actual:** reejecutar todo tras merge y reportar números actuales, SHA y logs.

## 13. Recorridos de aceptación (de punta a punta desde la perspectiva frontend)

### Flujo F-ADMIN-01: login y sesión
- Usuario autorizado inicia sesión, completa MFA si G7 lo requiere, llega al dashboard; menú de los seis módulos visible según permisos. Usuario sin rol recibe acceso denegado; logout corta navegación y requests; cambio A→B no filtra datos.

### Flujo F-ADMIN-02: Taxonomía → Catálogo
- Crear/editar categoría, marca y tipo/características; volver a cargar la página; crear BORRADOR en Catálogo con referencias reales y ver estado de preparación. El paso «reabrir/editar/activar producto tras reload» exige DTO administrativo: **marcar bloqueo backend**, probar comportamiento seguro hasta que exista.

### Flujo F-ADMIN-03: Pricing
- Seleccionar un producto/SKU real, ver precio global/canal con UUID autorizado, editar precio y programar un cambio, refrescar y comprobar valores confirmados. Canal sin identidad bloquea sin POST.

### Flujo F-ADMIN-04: Inventario
- Ver dashboard contractual, SKU comercial y saldo si disponible, modificar y borrar override de umbral, listar traslado y registrar recepción una vez; repetir/reload sin doble POST. Alertas/nombres/sku físicos ausentes quedan etiquetados.

### Flujo F-ADMIN-05: Combos
- Crear combo con dos o más SKU válidos y precio contractual, recargar, editar y desactivar. Disponibilidad no verificable se muestra como tal. Timeout POST conserva estado incierto.

### Flujo F-ADMIN-06: Promociones
- Crear/editar/activar/desactivar promoción, cupón y regla, reabrir tras recarga; confirmar ID, versionado y referencias reales. 401/403/409/422/503 manejados.

### Flujo F-ADMIN-07: robustez y carga
- Refresh F5 y navegación profunda, búsqueda/filtros/paginación, loading/empty/retry, latencia y timeout, edición simultánea/conflicto, red intermitente y sesión vencida no dejan UI inconsistente ni duplican registros.

Cada flujo necesita **dos niveles de prueba**: (A) contractual/controlado local, sin dependencias externas; (B) integración real cuando esté habilitada. Registrar por separado ambos niveles.

## 14. Verificaciones finales exigidas a Codex

Ejecutar de manera real, con Node compatible `>=22.12 <23`, dependencias instaladas limpiamente y test fixtures controlados:

```bash
node --version
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e:smoke
npm run test:e2e
npm run test:e2e:pricing
npm run test:smoke:combos
npm run test:ci
```

- Ejecutar build **separado** en `VITE_DATA_MODE=mock` y `VITE_DATA_MODE=api`. Comprobar preview SPA y que modo API sin credenciales/configuración falla **cerrado** y nunca usa mocks.
- Los comandos pueden tener solapamientos; registrar cada ejecución, `exit code`, conteos y SHA, y cerrar con un **último ciclo completo** después de la última modificación funcional. Para Playwright usar puertos/instancias aisladas, sin pruebas intermitentes por un servidor paralelo.
- Revisar `frontend.yml` tras merge y asegurar green en `quick`, `smoke`, `e2e`, `modes`, `validate`. Los jobs CI para `pull_request` a master corren al abrir PR; no afirmar CI verde antes de observarlo.
- Validar ausencia de errores visibles de consola, warning importante de React, memoria de sesión cruzada, recursos indefinidos, fugas de fetch, e integridad de UI en escritorio.
- **Condición de salida local:** 0 errores TypeScript; 0 errores ESLint; 0 fallos unitarios; 0 fallos Playwright en suite exigida; 0 builds fallidos; diffs sanos. Corregir causas reales, no apagar comprobaciones.
- Si hay pruebas externas que necesitan credenciales/entorno/backend no disponible, **no declararlas pasadas**; consignarlas como `BLOQUEADA_POR_ENTORNO`, y entregar pruebas locales de contrato de todos los flujos que no dependan de ellas.

## 15. Handoff formal para el equipo backend (sin cambiar backend)

Generar y mantener `docs/h4/DEPENDENCIAS_BACKEND_PARA_DEMO.md` en **este repositorio frontend**, con tabla por ítem: ID, microservicio owner, motivo, endpoint actual, endpoint/DTO necesario, método, auth/rol, campos requeridos, ejemplos request/response **solo si verificados o marcados como propuesta**, clasificación `EXISTENTE_NO_OPERATIVO` / `CONTRATO_FALTANTE` / `PERMISO` / `DATOS` / `ENTORNO`, impacto UI, prueba que lo necesita y criterio de desbloqueo.

**Como mínimo deben quedar registrados y actualizados**:

1. `CAT-ADMIN-READ`: listado/detalle administrativo completo, borradores/inactivos, estado real, `catalogVersion`, atributos, imagen, perfil y detalles de variante cuando aplique.
2. `CAT-TAX-ATTRIBUTE-ROLE`: rol identificador de característica, restricciones de texto/otros metadatos oficialmente publicados si UI los necesita.
3. `PRICE-CHANNEL-IDS`: UUID canónicos para Retail, Marketplace, Chatbot, Ventas y permisos; edición precio producto/canal con versión; 503 de introspección G7.
4. `INV-FULL-SKU`: enumeración administrativa de SKU físicos distinta de solo SKU comerciales; `INV-LOCATIONS` nombres/estado de ubicaciones; `INV-ALERTS` alertas oficiales; APIs/grants para recepciones.
5. `COMBO-AVAILABILITY`: disponibilidad verificable y autorización; `COMBO-IDEMPOTENCY`: clave o consulta exacta para reconciliar altas inciertas; decisión expresa sobre reactivar si no existe.
6. `PROMO-PERMISSIONS`: grants G7 y rutas reales para cupones, promociones y recomendaciones; accesos de lectura a Catálogo/Pricing/Inventario, validación comercial positiva si entra en alcance.
7. `GW-AUTH-CORS`: origen frontend, preflight, ruta Gateway y comportamiento 401/403/503; entornos reales.
8. `BULK-RETRY`, `AUDIT-PRODUCT-NULL` si las regresiones de H4 lo requieren para que el frontend sea desplegable.

**No bloquear el código de otros módulos esperando que el backend entregue un contrato faltante.** Encapsular la dependencia con interfaz tipada y error visible, documentar los campos/escenarios para un PR de Backend posterior. No implementar call a ruta especulativa.

## 16. Evidencia documental y PR posterior en Docs (obligatorio)

Codex debe generar en el repo frontend, mínimo:

- `docs/h4/IMPLEMENTACION_FRONTEND_DEMO_ADMIN.md`: decisión por módulo, componentes/archivos editados, endpoints efectivamente consumidos, estados antes/después y alcance real.
- `docs/h4/DEPENDENCIAS_BACKEND_PARA_DEMO.md`: pedidos concretos al backend y Gateway, con DTOs propuestos claramente diferenciados de contratos vigentes.
- `docs/h4/CAMBIOS_PENDIENTES_DOCS_PR.md`: **texto listo para un PR posterior** en `G6-Productos-Ofertas-docs` con secciones/rutas documentales a cambiar, problema, decisión, contrato previo y propuesto, consecuencias, evidencia y responsables. Si no se sabe la ruta exacta, marcar `RUTA_DOCS_POR_CONFIRMAR`; no adivinar.
- `docs/h4/MATRIZ_VERIFICACION_FRONTEND.md`: caso, categoría (unit/API simulado/browser/real), comando, resultado, SHA, evidencia, owner del bloqueo; registrar FAIL resueltos y casos pendientes honestamente.
- Actualizar `README.md`, `.env.example`, `docs/ESTADO_CIERRE_INTEGRAL_H4.md`, `docs/MATRIZ_PRUEBAS_REGRESION_H4.md` y matrices OpenAPI **cuando cambie el hecho que acreditan**, sin transformar `NOT_VERIFIED` en `PASS` por coincidencia textual.
- Documentar todas las decisiones de implementación que no estuvieran en Docs actual: por qué se decidió, contrato inferible/confirmado, impacto, test, riesgo, propuesta de formalización y alternativa. Dejar trazabilidad desde PR de frontend.

**Regla de documentación:** que no exista todavía un acuerdo normativo no impide una mejora autónoma del frontend, pero **sí impide afirmar que un endpoint inventado es homologado**. Toda decisión provisional debe figurar `PENDIENTE_APROBACION_DOCS`.

## 17. Entregables y definición de terminado

### Entregables verificables
1. Rama `fix/frontend-h4-cierre-integral` sincronizada con master, con login general preservado e integraciones H4 unificadas.
2. Cambios frontend funcionales de seis módulos, con adapters/hooks/views/routing/G7/estado seguro completos hasta la frontera contractual.
3. Tests unitarios, browser, CI locales **sin fallos** y evidencia posterior al último commit. Si es posible PR frontend hacia `master`, **sin merge** y con CI verde comprobado; si no hay capacidad de PR, dejar SHA y comandos listos.
4. Cuatro archivos de documentación de §16, más actualización de README/configuración/evidencias H4. Handoff backend explícito y guía para PR posterior del repositorio Docs.
5. Resumen final por microservicio: `FRONTEND_LISTO`, `FRONTEND_LISTO_CON_BLOQUEO_BACKEND` o `NO_LISTO`; por qué; rutas y escenarios realizados; pruebas y resultado; SHA/PR.

### No es «terminado»
- Corregir solo los mocks; ocultar botones para simular éxito; presentar imágenes/prices/stock sintéticos como reales; compilar una vez sin correr regresiones; considerar 202 finalizado; hacer green borrando tests; fusionar sin el login general; pasar una prueba con `page.route` y llamarla integración real; afirmar que habrá edición/activación administrativa tras recarga mientras falte DTO de Catálogo.

## 18. Orden de ejecución recomendado para Codex

| Orden | Bloque | Prioridad | Condición de salida |
|---:|---|---|---|
| 1 | Snapshot + integrar `origin/master` en H4 | P0 | Login general y tests no perdidos |
| 2 | Bootstrap único, sesión G7, gateway, gates/env | P0 | Seis módulos compuestos, auth consistente |
| 3 | Catálogo: contrato admin, creación/variantes/guardas | P0 | Lectura comercial correcta + bloqueo admin explícito hasta backend |
| 4 | Taxonomía HTTP y maestros | P0 | CRUD respaldado por contrato, pruebas verdes |
| 5 | Pricing targets/canales/escrituras | P0 | Lecturas y escrituras autorizadas, protección de incertidumbre |
| 6 | Inventario dashboards/umbral/stock/recepción | P0 | Cobertura honesta y pruebas de idempotencia |
| 7 | Combos HTTP/selección/precio | P0 | CRUD validado y sin stock inventado |
| 8 | Promociones CRUD y seguridad | P0 | Identidad de DTO, 401 y estados correctos |
| 9 | Regresiones Bulk/Price Audit y visuales | P0 | No deja pruebas fallando de H4/master |
| 10 | Suite completa mock/API, build, preview y CI | P0 | 0 fallos locales atribuibles al frontend |
| 11 | Handoff backend, plan Docs PR y PR frontend | P0 | Evidencia + SHA + bloqueos externos, sin merge |

## 19. Referencias de código verificadas

- Rama H4: https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/tree/fix/frontend-h4-cierre-integral
- Master frontend: https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/tree/master
- H4 estado: https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/blob/fix/frontend-h4-cierre-integral/docs/ESTADO_CIERRE_INTEGRAL_H4.md
- H4 regresión: https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/blob/fix/frontend-h4-cierre-integral/docs/MATRIZ_PRUEBAS_REGRESION_H4.md
- Master bootstrap: https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/blob/master/src/startApplication.tsx
- H4 bootstrap: https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/blob/fix/frontend-h4-cierre-integral/src/main.tsx
- Backend: https://github.com/Taller-SW-Web/G6-Productos-Ofertas-backend
- Contratos/Docs: https://github.com/Taller-SW-Web/G6-Productos-Ofertas-docs

**Nota:** los HEAD, la documentación y el contrato pueden cambiar; Codex debe releer versiones vigentes en el momento de ejecutar, contrastar decisiones con Controllers/OpenAPI actuales y documentar discrepancias reales.
