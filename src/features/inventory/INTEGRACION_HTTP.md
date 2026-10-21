# Inventario — integración HTTP (MK-015 / MK-016, issue #104)

Estado: **PARTIAL**. El adaptador HTTP está implementado y probado contra el
contrato vigente con un transporte inyectado. La aplicación **no** está
conectada al Gateway porque el composition root compartido (#45/#109) y su
cliente todavía no existen, y `CommercialModeGate` mantiene `/inventario`
bloqueado en modo API (`TAC-P0-03`). Ninguna operación se declara integrada de
extremo a extremo.

Corte **Hito 4 (2026-10-20, iteración 2)**: además de la sincronización con
`master` (`6e0448a`), la normalización de `"all"`, la carga parcial del
dashboard (`Promise.allSettled`) y el mapeo de `porUbicacion` con `null` en
datos ausentes (`TAC-P0-04`), se resolvieron los dos hallazgos P0 de recepción
de traslados (`TAC-P0-01` y `TAC-P0-02`):

1. **`TAC-P0-01` — Solicitud inmutable en reintentos idempotentes:**
   `ReceiveTransferModal.tsx` y `services/transferReceptionAttempt.ts`
   construyen y congelan una solicitud inmutable (`operationId`, `receivedAt`,
   `quantityReceived`, `disposition`, `finalReceipt` y `note`) en el primer
   intento. Cualquier reintento de la misma operación reutiliza **exactamente**
   los mismos valores contractuales (idéntico cuerpo JSON e idéntica
   `Idempotency-Key`), alineado con el fingerprint de `traslados.service.ts`
   (`traslado_id`, `received_quantity`, `disposition`, `final_receipt`,
   `received_at`, `note`, `intention`). Cualquier cambio de cantidad,
   disposición, cierre final **o nota** tras un rechazo definitivo (`4xx`)
   genera una nueva identidad de operación y un nuevo timestamp.
2. **`TAC-P0-02` — Protección de operaciones con resultado incierto:**
   `apiInventoryAdapter.ts` separa explícitamente tres estados por traslado:
   `IN_FLIGHT` (escritura en curso), `UNCERTAIN` (respuesta perdida o fallo
   `>=500`) y `RECONCILED` (confirmada mediante respuesta autoritativa del
   servidor). `GET /api/v1/inventario/traslados` **no** elimina el estado
   `UNCERTAIN` porque `TrasladoInventario` solo expone el acumulado del traslado
   y no el `operation_id` de `inventory_operations`; la lectura deja constancia
   explícita (`reconciliation: "UNVERIFIABLE_BY_LIST_CONTRACT"`). Cerrar y
   reabrir `ReceiveTransferModal` restaura el snapshot inmutable retenido por
   `transferId` y bloquea la edición de campos hasta que el reintento idéntico
   confirme el resultado durable.

Corte **Hito 4 (2026-10-21, iteración 3)**: se resolvieron los hallazgos de la
segunda auditoría de Marco:

3. **`TAC-P0-05` — Confirmación separada del enriquecimiento:** `receiveTransfer()`
   registra `RECONCILED` y cachea el DTO confirmado **antes** de `present()`; un
   fallo del resolvedor de presentación no reabre la operación ni repite el POST.
4. **`TAC-P1-07` — Matriz de transición ante errores:** estando en `UNCERTAIN`,
   ningún error (`400/401/403/404/409/422/5xx`, red o DTO inválido) libera el
   bloqueo; solo lo hace un `200` con DTO válido.
5. **`TAC-P0-06` — Pérdida en refresh:** documentado y caracterizado por prueba;
   la solución definitiva queda `BLOQUEADO_ESPECÍFICO` con propuesta a Marco
   (ver sección dedicada).

## Fuentes normativas

- OpenAPI `0.6.0-rc.1` (`docs/contratos/http/openapi.yaml`), operaciones de
  Inventario: `obtenerUmbralesInventario`, `actualizarUmbralGlobal`,
  `establecerUmbralSku`, `obtenerDashboardInventario`,
  `listarTrasladosInventario`, `obtenerTrasladoInventario`,
  `registrarRecepcionTrasladoInventario`.
- `docs/contratos/http/catalogo-errores.md`: `TRASLADO_NO_ENCONTRADO`,
  `TRASLADO_NO_RECIBIBLE`, `IDEMPOTENCY_CONFLICT`,
  `CANTIDAD_RECIBIDA_EXCEDE_TRASLADO`, `DISPOSICION_RECEPCION_INVALIDA`,
  `TOKEN_INVALIDO`, `SCOPE_INSUFICIENTE`, `SERVICIO_NO_DISPONIBLE`.
- `backend/apps/inventory-svc/src/traslados/traslados.service.ts`: cálculo de
  fingerprint sobre `traslado_id`, `received_quantity`, `disposition`,
  `final_receipt`, `received_at`, `note ?? null` e `intention`.
- `AGENTS.md` §9: no se inventan endpoints, payloads, campos ni estados.

## Archivos de esta entrega

| Archivo | Cambio |
|---|---|
| `services/transferReceptionAttempt.ts` | Coordinador inmutable de intentos de recepción (`createTransferReceptionFormSession`, `freezeReceiveTransferPayload`, `areSameReceiveTransferPayloads`, `TransferReceptionWriteRecord`). Preserva `operationId`, `receivedAt` y `note` entre reintentos y a través de cierres/reaperturas del modal cuando el intento queda en `UNCERTAIN`. |
| `components/ReceiveTransferModal.tsx` | Usa `createTransferReceptionFormSession(transfer.id)`. Reutiliza la solicitud inmutable en reintentos idénticos, genera nueva identidad si cambia cantidad/disposición/cierre/nota tras un `4xx`, y bloquea la edición mostrando aviso explícito cuando existe una operación `UNCERTAIN`. |
| `adapters/apiInventoryAdapter.ts` | Separa los estados `IN_FLIGHT`, `UNCERTAIN` y `RECONCILED` (`getTransferWriteRecord`). Elimina la limpieza prematura en `readTransfers()` y registra `UNVERIFIABLE_BY_LIST_CONTRACT`. Rechaza cualquier cambio de `operationId` o contenido mientras el traslado esté en `UNCERTAIN`. |
| `services/inventoryMappers.ts` | Validadores/mappers del contrato: `toThresholdConfig`, `toDashboardKpiSummary`, `toLocationDistributionList`, `validateTrasladoDto`, `validateTrasladoListDto`, `validateRecepcionResponse`, `validateTransferPresentation`. |
| `services/inventoryErrors.ts` | Códigos de protocolo/estado: `OPERATIVO` (mock de master), `NO_AUTENTICADO`, `SIN_PERMISO`, `SERVICIO_NO_DISPONIBLE`, `RESULTADO_INCIERTO`, `RESPUESTA_INCOMPATIBLE`, `CONTRATO_BLOQUEADO`. |
| `services/inventoryTypes.ts` | `LocationDistribution.locationName` y `blockedTotal` admiten `null` cuando el contrato no publica el dato. |
| `services/inventoryProvider.ts` | Punto de inyección `configureInventoryApi(factory)`. Sin factory, el modo API mantiene un fallo controlado bajo demanda; nunca cae al mock. |
| `hooks/useInventoryDashboard.ts` | Resuelve cada sección con `Promise.allSettled`: un bloqueo de contrato o fallo parcial no borra los KPIs que sí respondieron. Distingue `error` de `blockedReason`. |
| `components/DashboardKpiGrid.tsx`, `DashboardAlerts.tsx`, `LocationDistributionTable.tsx` | Estados "no verificable" (warning) separados del error de transporte; `null` se muestra como "Sin datos", nunca como `0`. |
| `adapters/apiInventoryAdapter.spec.ts` | **28 pruebas unitarias y de flujo formulario+adaptador** (incluye los 8 casos obligatorios de `TAC-P0-01`/`TAC-P0-02`). |
| `INTEGRACION_HTTP.md` | Este documento. |

No se editaron `src/main.tsx`, `src/app/config/CommercialModeGate.tsx`, el
transporte compartido ni otros features.

## Operaciones implementadas

| `operationId` | Método y ruta | Mapeo |
|---|---|---|
| `obtenerUmbralesInventario` | `GET /api/v1/inventario/umbrales` | `umbralGlobal → globalThreshold`; `overrides[] → skuOverrides` |
| `actualizarUmbralGlobal` | `PUT /api/v1/inventario/umbrales/global` | body `{ umbral }`; respuesta `UmbralInventario` |
| `establecerUmbralSku` | `PUT /api/v1/inventario/umbrales/skus/{sku}` | SKU codificado; body `{ umbral }` |
| `obtenerDashboardInventario` (KPIs) | `GET /api/v1/inventario/dashboard?locationId&categoriaId&marcaId` | mapea los 6 KPIs autoritativos de `DashboardInventario` e informa `null` ("Sin datos", nunca `0`) en los 6 no publicados |
| `obtenerDashboardInventario` (distribución) | `GET /api/v1/inventario/dashboard?locationId&categoriaId&marcaId` | mapea `porUbicacion[]`; `locationName` y `blockedTotal` quedan en `null` porque el contrato no los publica |
| `listarTrasladosInventario` | `GET /api/v1/inventario/traslados?estado&target_location_id&pagina&tamanio` | pagina con `tamanio=100` hasta cubrir `total` (sin truncar) |
| `obtenerTrasladoInventario` | (mapeador `validateTrasladoDto` disponible) | — |
| `registrarRecepcionTrasladoInventario` | `POST /api/v1/inventario/traslados/{trasladoId}/recepciones` | `Idempotency-Key = operation_id`; body `RecepcionTrasladoInventarioRequest` inmutable entre reintentos |

## Ciclo de estados de recepción e idempotencia (`TAC-P0-01`, `TAC-P0-02`, `TAC-P0-05`, `TAC-P1-07`)

`receiveTransfer()` separa cuatro fases para no confundir la confirmación
autoritativa de Inventory con el enriquecimiento de presentación (`TAC-P0-05`):

1. **Fase A — envío autoritativo:** `POST .../recepciones`. Un fallo de red o
   `5xx` no acredita si la mutación se aplicó.
2. **Fase B — validar el DTO de confirmación:** `validateRecepcionResponse()`.
   Si el `200` trae un DTO incompatible, el resultado no se puede determinar.
3. **Fase C — registrar la confirmación:** se marca `RECONCILED` **antes** de
   tocar el resolvedor de presentación y se cachea el DTO confirmado por
   `operationId`. La confirmación no depende del enriquecimiento.
4. **Fase D — enriquecimiento de presentación:** `present()` (resolvedor de
   Catálogo/ubicaciones). Si falla, la mutación **ya está confirmada**; el
   estado permanece `RECONCILED` y el reintento con la misma identidad devuelve
   el cache **sin repetir el POST**.

### Matriz de transición de estados (`TAC-P1-07`)

| Estado previo | Desenlace del `POST` | Estado siguiente |
|---|---|---|
| `IN_FLIGHT` (primer intento) | `200` + DTO válido | `RECONCILED` (confirmación antes de presentación) |
| `IN_FLIGHT` (primer intento) | red / `5xx` / `200` ilegible | `UNCERTAIN` |
| `IN_FLIGHT` (primer intento) | `200` + DTO incompatible | `UNCERTAIN` |
| `IN_FLIGHT` (primer intento) | `4xx` definitivo (`400/401/403/404/409/422`) | registro eliminado (el backend rechazó sin persistir) |
| `UNCERTAIN` (reintento idéntico) | `200` + DTO válido | `RECONCILED` (`CONFIRMED_BY_IDEMPOTENT_RETRY`) |
| `UNCERTAIN` (reintento idéntico) | **cualquier otro** (`400/401/403/404/409/422/5xx`, red, `200` ilegible o DTO incompatible) | **permanece `UNCERTAIN`** |

Regla de seguridad: **estando en `UNCERTAIN`, la única salida es un `200` con
DTO de confirmación válido.** En particular, un `409 IDEMPOTENCY_CONFLICT`
durante la recuperación no libera el bloqueo ni habilita otra identidad, porque
el resultado original sigue desconocido.

### Estado `UNCERTAIN` — qué permite / qué bloquea

- Bloquea cualquier otro `operationId` y cualquier cambio de `quantityReceived`,
  `disposition`, `finalReceipt`, `receivedAt` o `note`.
- Al cerrar/reabrir `ReceiveTransferModal`, la UI restaura el snapshot inmutable
  y deshabilita la edición hasta que el reintento idéntico recupere el resultado.
- `GET /inventario/traslados` marca `reconciliation: "UNVERIFIABLE_BY_LIST_CONTRACT"`
  y **no** libera el bloqueo.

Limitación contractual registrada (`TAC-P0-02`):
- `GET /api/v1/inventario/traslados` y `GET /api/v1/inventario/traslados/{trasladoId}` devuelven `TrasladoInventario` (`quantity_shipped`, `quantity_received`, `missing_quantity`, `estado`), sin historial de recepciones ni `operation_id`.
- `GET /api/v1/inventario/operaciones/{operationId}` (`consultarOperacionInventario`, OpenAPI L20309) es de uso exclusivo M2M para `modulo-ventas` con `serviceBearer` y scope `inventario:operaciones:leer`, no para el navegador.
- En consecuencia, la única conciliación concluyente disponible dentro del contrato vigente para el navegador es el **reintento idempotente con la misma solicitud inmutable** (`Idempotency-Key` y body idénticos), ante el cual `traslados.service.ts` devuelve el `result_payload` persistido en `inventory_operations` sin duplicar el movimiento.

## Recuperación tras refresh/crash (`TAC-P0-06` — BLOQUEADO_ESPECÍFICO)

`uncertainReceptionsByTransferId` es un `Map` en memoria. Protege el intento al
cerrar/reabrir el modal, pero **se pierde con un refresh completo del navegador
o al reiniciar la aplicación**. Tras una recarga, el intento `UNCERTAIN` ya no
se restaura y podría generarse un nuevo `operationId` para una recepción que
quizá ya fue confirmada. Este escenario está documentado en el módulo
(`transferReceptionAttempt.ts`) y caracterizado por una prueba de reinicio de
sesión; **la solución definitiva está pendiente de acuerdo con Marco.**

Propuesta de mecanismo (a elegir por Marco antes de implementar — no se aplica
de forma unilateral):

1. **Persistencia local del payload inmutable** (`localStorage`/`sessionStorage`)
   del intento `UNCERTAIN` (solo `operationId`, `receivedAt`, `quantityReceived`,
   `disposition`, `finalReceipt`, `note` y `transferId`). Al recargar, se hidrata
   el modal bloqueado al reintento idéntico. *Modelo de seguridad:* no almacena
   tokens, credenciales ni datos de negocio ajenos; la escritura real sigue
   protegida por idempotencia del backend (`Idempotency-Key` + fingerprint).
2. **Consulta de operación para el navegador** (`GET /inventario/operaciones/{operationId}`
   ampliado a un consumidor con identidad de gestor), que devolvería el
   `result_payload` persistido y permitiría reconciliar sin re-aplicar. Requiere
   ampliación de contrato y scopes (no unilateral).
3. **Aceptar la limitación** y exigir al usuario verificar el traslado en la
   bandeja antes de una nueva recepción, con el riesgo documentado de doble
   aplicación si se genera un nuevo `operationId` tras una recarga.

No se agregan endpoints, persistencia en el navegador ni acceso a
`inventory_operations` sin la decisión explícita de Marco.

## Operaciones bloqueadas por contrato (`TAC-P0-04`)

| Método del puerto | Campos / capacidad faltante | Documento contractual verificado | Owner responsable | Condición de desbloqueo |
|---|---|---|---|---|
| `getStockItems(filters)` | 1) `consultarDisponibilidad` (`GET /inventario/disponibilidad`, OpenAPI L3615) exige `skus` obligatorio (`minItems: 1`, `maxItems: 50`) para Ventas/Postventa; no enumera el catálogo de stock.<br>2) `DisponibilidadStock` (OpenAPI L21367) no incluye `productName`, `categoryName`, `brandName`, `locationName`, `stockVersion` ni `updatedAt`. | `docs/contratos/http/openapi.yaml` (L3615–3695, L21367–21403) y `SPEC-015` | Marco (arquitectura/contratos) + Poma (`catalog-svc`) + Taco (`inventory-svc`) | Publicar operación de listado administrativo de existencias o acordar composición con Catálogo/ubicaciones en el composition root |
| `getStockDetail(sku, locationId)` | `DisponibilidadStock` no publica `productName`, `categoryName`, `brandName`, `locationName`, `stockVersion` ni `updatedAt` exigidos por el drawer MK-015-S03. | `docs/contratos/http/openapi.yaml` (L21367–21403) | Marco + Poma (`catalog-svc`) + Taco (`inventory-svc`) | Enriquecer contrato o inyectar resolvedor autoritativo de ficha de producto/ubicación y metadatos de versión |
| `getDashboardAlerts(filters)` | No existe operación HTTP de alertas operativas en el tag `Inventario`. | `docs/contratos/http/openapi.yaml` (`/inventario/*`) y `SPEC-016` | Marco (contratos) + Taco (`inventory-svc`) | Definir y publicar schema/endpoint de alertas en OpenAPI (prohibido recalcularlas en cliente) |
| `getCategories()` | Operación pertenece a Taxonomía/Catálogo (`/taxonomia/categorias`), fuera del contrato de `inventory-svc`; falta acuerdo de paginación/adaptador común para poblar filtros de inventario. | `docs/contratos/http/openapi.yaml` (`/taxonomia/*`) | López (`taxonomy-svc`) + Castilla (composición #45/#109) | Conectar `ApiInventoryCatalogAdapter` al cliente compartido |
| `getBrands()` | Operación pertenece a Catálogo (`/catalogo/marcas`), fuera de `inventory-svc`; pendiente de composición compartida. | `docs/contratos/http/openapi.yaml` (`/catalogo/*`) | Poma (`catalog-svc`) + Castilla (composición #45/#109) | Conectar `ApiInventoryCatalogAdapter` al cliente compartido |
| `getLocations()` | No existe endpoint HTTP publicado para listar `inventory.locations` con `name`/`code`/`type`. | `docs/contratos/http/openapi.yaml` y `docs/datos/inventory-svc/migration.sql` | Marco (contratos) + Taco (`inventory-svc`) | Publicar operación de lectura de ubicaciones en OpenAPI y exponerla en Gateway |
| `DashboardInventario` (6 de 12 KPIs y 2 campos de `porUbicacion`) | `DashboardInventario` (OpenAPI L23646–23720) publica 6 KPIs (`totalAvailable`, `totalOnHand`, `totalReserved`, `skusDisponibles`, `skusStockBajo`, `skusAgotados`), pero no publica `blockedUnits`, `totalVendibleSkus`, los 4 KPIs de traslados ni `locationName`/`blockedTotal` en `porUbicacion`. | `docs/contratos/http/openapi.yaml` (L23646–23720) y `SPEC-016` | Marco (contratos) + Taco (`inventory-svc`) | Ampliar schema `DashboardInventario` en OpenAPI; mientras tanto la UI muestra `null` ("Sin datos"), nunca `0` |

## Punto exacto de integración (`TAC-P0-03`, #45/#109)

```ts
import {
  createHttpInventoryRepository,
} from "./adapters/apiInventoryAdapter";
import { configureInventoryApi } from "./services/inventoryProvider";

configureInventoryApi(() =>
  createHttpInventoryRepository({
    transport: sharedGatewayTransport, // inyectado por el composition root (#45/#109)
    resolveTransferPresentation: authoritativeTransferPresentation,
  }),
);
```

Mientras `CommercialModeGate` (`src/app/config/CommercialModeGate.tsx`) mantenga
bloqueada la ruta `/inventario` en modo `api`, la feature no se monta en ese
modo. Ese desbloqueo corresponde a la composición compartida de Castilla/Marco.

## Validaciones ejecutadas

| Comando | Resultado |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npx vitest run --config src/features/inventory/adapters/vitest.config.ts` | **33/33 PASS** (incluye regresiones `TAC-P0-05`, `TAC-P1-07` y caracterización `TAC-P0-06`) |
| `npm test` | `test:unit:combos` 54 PASS; `test:unit:bulk` 51 PASS |
| `npx playwright test tests/inventory.spec.ts tests/inventory-adapter.spec.ts tests/inventory-idempotency.spec.ts tests/inventory-dashboard.spec.ts` | PASS |
| `npm run build` con `VITE_DATA_MODE=mock` | PASS |
| `npm run build` con `VITE_DATA_MODE=api` | PASS |
| `node scripts/verify-production.mjs mock` (1440 px) | **58 vistas PASS** |
| `node scripts/verify-production.mjs api` (1440 px) | **53 vistas PASS** |
