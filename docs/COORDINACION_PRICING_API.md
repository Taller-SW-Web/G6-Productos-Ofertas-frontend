# Coordinación Técnica y Contractual — Precios (MK-013) y Auditoría (MK-014)

Fecha: 2026-10-17  
Rama: `vera`  
Issue de referencia: [#38](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/issues/38)  
PR asociada: [#46](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/pull/46)

---

## 1. Definición de la Demo Híbrida

El issue #38 y la auditoría técnica establecen la siguiente arquitectura de operación:
- **Pricing (MK-013):** Preparado para integración mediante **API real HTTP** (según contratos confirmados). En ausencia de configuración de infraestructura, falla cerrado de forma determinista mediante `unavailableApiPricingRepository` (reportando error de configuración sin inventar endpoints ni realizar fallback silencioso a fixtures).
- **Auditoría (MK-014):** Opera en **modo simulado (Mock)** en memoria del navegador durante la sesión de demo, capturando los cambios confirmados en Pricing (`pricingChanges.ts` / `mockAuditRepository.ts`) para mantener la trazabilidad visual y funcional en el historial sin requerir persistencia de backend o bus de eventos no confirmados.

---

## 2. Matriz de Correspondencia Contractual OpenAPI (Precios MK-013)

Las operaciones de Pricing se rigen por el contrato normativo publicado en `contratos/http/openapi.yaml` (versión canónica del provider). **No se inventan endpoints, parámetros ni payloads.**

| Operación en Frontend (`PricingRepository`) | Método / Endpoint OpenAPI 0.6.0 | Scope / Headers | Tratamiento en Frontend |
|---|---|---|---|
| `listTargets(signal)` | Consulta agregada a catálogo / productos | N/A (resolución de identidades) | Resuelve targets de demo o identidades publicadas por Catálogo. |
| `read(query, signal)` | `GET /precios/skus/{sku}` ó `GET /precios/productos/{productoId}` | `precios:leer` | Obtiene precio regular, oferta y vigencia del target. |
| `readEditable(target, signal)` | `GET /precios/skus/{sku}` con versión | `precios:leer` | Carga el estado base para edición garantizando control de concurrencia optimista (`version`). |
| `update(change, signal)` | `PUT /precios/skus/{sku}` ó `PUT /precios/productos/{productoId}` | `precios:escribir` | Envía `PrecioUpdateRequest`. Manejo de `409 Conflict` (versión obsoleta) y `400 Bad Request` (validación de importes). |
| `listSchedules(targetId, page, signal)` | `GET /precios/skus/{sku}/programaciones` | `precios:leer` | Listado paginado de vigencias programadas. |
| `schedule(targetId, draft, signal)` | `POST /precios/skus/{sku}/programaciones` | `precios:escribir` | Registra nueva vigencia futura validando no superposición. |
| `readHistorical(query, at, signal)` | `GET /precios/skus/{sku}?asOf={at}` | `precios:leer` | Consulta as-of temporal de vigencias. |
| `prevalidate(input, signal)` | `POST /precios/importaciones/prevalidar` | `precios:escribir` | Envía archivo multipart para validación preliminar. (Bloqueado por Q-013-01/02). |
| `readBatch(batchId, signal)` | `GET /precios/importaciones/{batchId}` | `precios:leer` | Consulta estado de procesamiento de lote masivo. |
| `report(batchId, format, signal)` | `GET /precios/importaciones/{batchId}/reporte` | `precios:leer` | Descarga de informe CSV/PDF con `ReportDownloader`. |

---

## 3. Delimitación de Responsabilidades y Gobernanza

1. **Marco Castilla (Infraestructura y Composición):**
   - Responsable de la composición raíz (`main.tsx`), `AppShell`, cableado de providers globales y configuración base del cliente HTTP/Fetch interceptor.
   - Responsable de los adapters transversales de integración (como `PricingCombosAdapter`).
2. **Leonardo Vera (Precios y Auditoría MK-013/014):**
   - Responsable de los contratos de dominio, tipos TypeScript, validación de importes/vigencias, adapters de presentación y aislamiento de simulaciones de auditoría.
   - Mantenimiento del fail-closed determinista en modo API sin provider configurado.
3. **Reglas de Seguridad y Autenticación:**
   - **Prohibido:** Implementar pantallas de login, generar tokens JWT ficticios, almacenar credenciales en `localStorage` o inventar cabeceras `Authorization` ad-hoc en componentes de UI. La autenticación y propagación de credenciales corresponde exclusivamente al gateway / infraestructura central.

---

## 4. Compatibilidad con PRs de Otros Owners

### 4.1 Compatibilidad con Castilla (PR #43 — Combos MK-002)
- El PR #43 incorpora `PricingCombosAdapter` en `src/features/combos/adapters/pricingCombosAdapter.ts`, el cual implementa `CombosPricingPort` consumiendo directamente el puerto `PricingRepository`.
- La regresión `VER-02` conserva la validación de aislamiento de fixtures base, y la nueva regresión `VER-02-B` comprueba el patrón live: toda actualización de precio en Pricing se refleja en tiempo real en Combos en unidades menores exactas (`regularMinor`, `offerMinor`), sin mantener copias obsoletas.

### 4.2 Compatibilidad con Poma (PR #40 — Catálogo MK-003/004)
- El PR #40 actualiza `createDemoPricingRuntime.ts` añadiendo la suscripción reactiva a `mockCatalogRepository.subscribe` en la propiedad `updates`.
- La rama `vera` conecta la auditoría simulada mediante el callback `mockPricingAudit.record` inyectado en `createMockPricingRepository` dentro de la propiedad `service`.
- **Coexistencia garantizada:** Al sincronizar o integrar master, ambas modificaciones conviven limpiamente sin colisión: `service` preserva el callback de auditoría y `updates` preserva la suscripción compuesta de Catálogo y DemoControl.

### 4.3 Robustez del Callback `onUpdated`
- Si el callback `onUpdated` falla o arroja una excepción no controlada, la lógica comercial de actualización de precios en `mockPricingRepository.ts` no se altera: el precio confirmado queda guardado y activo en el repositorio, la versión se incrementa y la operación devuelve el precio actualizado.
- Verificado formalmente en la prueba de regresión `VER-05`.
