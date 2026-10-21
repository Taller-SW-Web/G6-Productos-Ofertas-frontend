# Inventario — integración HTTP (MK-015 / MK-016, issue #104)

Estado: **PARTIAL**. El adaptador HTTP está implementado y probado contra el
contrato vigente con un transporte inyectado. La aplicación **no** está
conectada al Gateway porque el composition root compartido (#45/#109) y su
cliente todavía no existen, y `CommercialModeGate` mantiene `/inventario`
bloqueado en modo API. Ninguna operación se declara integrada de extremo a
extremo.

Corte **Hito 4 (2026-10-20)**: se sincronizó `taco` con `master` (sin descartar
los cambios integrados del PR #44 ni la persistencia mock transversal), se
corrigieron los filtros `"all"`, la carga parcial del dashboard, la distribución
por ubicación y la reconciliación de recepciones con resultado incierto.

## Fuentes normativas

- OpenAPI `0.6.0-rc.1`, operaciones de Inventario: `obtenerUmbralesInventario`,
  `actualizarUmbralGlobal`, `establecerUmbralSku`, `obtenerDashboardInventario`,
  `listarTrasladosInventario`, `obtenerTrasladoInventario`,
  `registrarRecepcionTrasladoInventario`.
- `catalogo-errores.md`: `TRASLADO_NO_ENCONTRADO`, `TRASLADO_NO_RECIBIBLE`,
  `IDEMPOTENCY_CONFLICT`, `CANTIDAD_RECIBIDA_EXCEDE_TRASLADO`,
  `DISPOSICION_RECEPCION_INVALIDA`, `TOKEN_INVALIDO`, `SCOPE_INSUFICIENTE`,
  `SERVICIO_NO_DISPONIBLE`.
- `AGENTS.md` §9: no se inventan endpoints, payloads, campos ni estados.

## Archivos de esta entrega

| Archivo | Cambio |
|---|---|
| `adapters/apiInventoryAdapter.ts` | Fábrica `createHttpInventoryRepository` con `InventoryHttpTransport` inyectable. Implementa umbrales, KPIs y distribución autoritativos de dashboard (con `null` en datos no publicados) y traslados (lectura y recepción), con bloqueo de doble envío, reconciliación de resultado incierto y traducción de `application/problem+json`. Las operaciones sin fuente contractual fallan con `CONTRATO_BLOQUEADO`. Normaliza el literal de UI `"all"` a "sin filtro". |
| `services/inventoryMappers.ts` | Validadores/mappers del contrato: `toThresholdConfig`, `toDashboardKpiSummary`, `toLocationDistributionList`, `validateTrasladoDto`, `validateTrasladoListDto`, `validateRecepcionResponse`, `validateTransferPresentation`. Conserva `toTransferItem`, `toStockStatus` y `toRecepcionTrasladoRequestDto`. |
| `services/inventoryErrors.ts` | Códigos de protocolo/estado: `OPERATIVO` (mock de master), `NO_AUTENTICADO`, `SIN_PERMISO`, `SERVICIO_NO_DISPONIBLE`, `RESULTADO_INCIERTO`, `RESPUESTA_INCOMPATIBLE`, `CONTRATO_BLOQUEADO`. |
| `services/inventoryTypes.ts` | `LocationDistribution.locationName` y `blockedTotal` admiten `null` cuando el contrato no publica el dato. |
| `services/inventoryProvider.ts` | Punto de inyección `configureInventoryApi(factory)`. Sin factory, el modo API mantiene un fallo controlado bajo demanda; nunca cae al mock. Conserva la persistencia mock de `master`. |
| `hooks/useInventoryDashboard.ts` | Resuelve cada sección con `Promise.allSettled`: un bloqueo de contrato o fallo parcial no borra los KPIs que sí respondieron. Distingue `error` de `blockedReason`. |
| `components/DashboardKpiGrid.tsx`, `DashboardAlerts.tsx`, `LocationDistributionTable.tsx` | Estados "no verificable" (warning) separados del error de transporte; `null` se muestra como "Sin datos", nunca como `0`. |
| `adapters/apiInventoryAdapter.spec.ts` | 24 pruebas unitarias del adaptador. |
| `adapters/vitest.config.ts` | Configuración local del feature (no modifica los scripts compartidos). |
| `INTEGRACION_HTTP.md` | Este documento. |

No se editaron `src/main.tsx` salvo lo integrado por `master`, el transporte
compartido ni otros features. `src/app/config/**` conserva el bloqueo de
`CommercialModeGate` de `master`.

## Operaciones implementadas

| `operationId` | Método y ruta | Mapeo |
|---|---|---|
| `obtenerUmbralesInventario` | `GET /api/v1/inventario/umbrales` | `umbralGlobal → globalThreshold`; `overrides[] → skuOverrides` |
| `actualizarUmbralGlobal` | `PUT /api/v1/inventario/umbrales/global` | body `{ umbral }`; respuesta `UmbralInventario` |
| `establecerUmbralSku` | `PUT /api/v1/inventario/umbrales/skus/{sku}` | SKU codificado; body `{ umbral }` |
| `obtenerDashboardInventario` (KPIs) | `GET /api/v1/inventario/dashboard?locationId&categoriaId&marcaId` | mapea los KPIs autoritativos de `DashboardInventario` e informa `null` (ausencia de dato, nunca `0`) en los no publicados |
| `obtenerDashboardInventario` (distribución) | `GET /api/v1/inventario/dashboard?locationId&categoriaId&marcaId` | mapea `porUbicacion[]`; `locationName` y `blockedTotal` quedan en `null` porque el contrato no los publica |
| `listarTrasladosInventario` | `GET /api/v1/inventario/traslados?estado&target_location_id&pagina&tamanio` | pagina con `tamanio=100` hasta cubrir `total` (sin truncar) |
| `obtenerTrasladoInventario` | (mapeador `validateTrasladoDto` disponible) | — |
| `registrarRecepcionTrasladoInventario` | `POST /api/v1/inventario/traslados/{trasladoId}/recepciones` | `Idempotency-Key = operation_id`; body `RecepcionTrasladoInventarioRequest` |

### Filtros de la UI

La UI representa "sin filtro" con el literal `"all"`. Ese literal **no** es un
valor del contrato:

- `"all"`, cadena vacía y espacios se normalizan a "ausente" antes de construir
  la query (`contractFilterValue`).
- `obtenerDashboardInventario` no publica filtro por texto libre ni por estado
  de stock. Con `search` o `status` activos, KPIs y distribución responden
  `CONTRATO_BLOQUEADO` en lugar de devolver un agregado que no corresponde a la
  selección; la UI lo presenta como "no verificable", sin inventar cifras.
- `listarTrasladosInventario` acepta `estado` y `target_location_id`; con
  `"all"` no se envían.

### Reconciliación de recepciones con resultado incierto

Ante error de red o `5xx` en la recepción:

1. La operación queda marcada como incierta y se conserva su `operationId`.
2. Un reintento con la **misma** identidad está permitido: el backend aplica
   idempotencia y no duplica la recepción.
3. Un reintento con una identidad **distinta** se rechaza con
   `RESULTADO_INCIERTO` hasta reconciliar.
4. Una lectura autoritativa de traslados (`GET /inventario/traslados`) sobre el
   traslado afectado levanta el bloqueo; desde ese momento el usuario decide con
   el estado real del servidor.
5. Los `4xx` definitivos no dejan el traslado bloqueado.

### Campos que el contrato no transporta

`toTransferItem` recibe `transferCode`, `productName`, `sourceLocationName` y
`targetLocationName` desde un `TransferPresentationResolver` inyectado. Si no
se inyecta, los métodos de traslados fallan con `CONTRATO_BLOQUEADO`; no se
rellenan con valores simulados.

## Operaciones bloqueadas (`CONTRATO_BLOQUEADO`)

| Método del puerto | Campo sin fuente contractual | Owner / condición |
|---|---|---|
| `getStockItems`, `getStockDetail` | `productName`, `categoryName`, `brandName`; `locationName`; `stockVersion`; `updatedAt` | Catálogo/Taxonomía (mapping producto→SKU) y una fuente de ubicaciones. `consultarDisponibilidad` exige `skus` y no expone versión/fecha: no permite listar existencias |
| `getDashboardAlerts` | modelo completo de alertas | No existe operación de alertas en Inventario |
| `getCategories`, `getBrands` | integración de filtros (paginación) | Catálogo; definición pendiente del composition root |
| `getLocations` | modelo completo de ubicaciones | Sin endpoint HTTP (`inventory.locations`) |

`getLocationDistribution` ya **no** está bloqueada de forma global: se resuelve
con `porUbicacion` y expone `null` en los dos campos ausentes.

## Punto exacto de integración (#45/#109)

```ts
import {
  createHttpInventoryRepository,
} from "./adapters/apiInventoryAdapter";
import { configureInventoryApi } from "./services/inventoryProvider";

configureInventoryApi(() =>
  createHttpInventoryRepository({
    transport: sharedGatewayTransport,            // punto de inyección
    resolveTransferPresentation: authoritativeTransferPresentation, // punto de inyección
  }),
);
```

`sharedGatewayTransport` debe implementar:

```ts
interface InventoryHttpTransport {
  request(
    path: string,
    request: {
      method: "GET" | "PUT" | "POST";
      signal?: AbortSignal;
      headers?: Readonly<Record<string, string>>;
      body?: string;
    },
  ): Promise<Response>;
}
```

La ruta ya incluye `/api/v1`. El cliente compartido debe propagar `AbortSignal`
y **no** reintentar automáticamente `PUT`/`POST`. Los nombres del ejemplo son
puntos de inyección, no implementaciones existentes.

`resolveTransferPresentation` debe devolver datos autoritativos de Catálogo y
de ubicaciones; no puede leer fixtures ni mocks.

Mientras `CommercialModeGate` (`src/app/config/**`) siga bloqueando
`/inventario` en modo API, la feature no se monta. Ese cambio pertenece al
composition root (#45/#109) y no se modifica aquí.

## Validaciones ejecutadas

| Comando | Resultado |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npx vitest run --config src/features/inventory/adapters/vitest.config.ts` | **24/24 PASS** |
| `npm test` | `test:unit:combos` 36 PASS; `test:unit:bulk` 24 PASS |
| `npm run build` con `VITE_DATA_MODE=mock` | PASS |
| `npm run build` con `VITE_DATA_MODE=api` | PASS |
| `node scripts/verify-production.mjs mock` (1440 px) | **58 vistas PASS** |
| `node scripts/verify-production.mjs api` (1440 px) | **53 vistas PASS** |

## Límites

- No se ejecutó el recorrido React → cliente compartido → Gateway → Inventario
  → PostgreSQL/RabbitMQ: depende de #109, #106/#107 y del entorno real.
- Las pruebas del adaptador usan respuestas HTTP explícitas; no acreditan un
  endpoint desplegado.
- La tabla "Inventario analítico por SKU" sigue bloqueada en modo API porque el
  contrato no ofrece un listado de existencias con sus campos de presentación.
- No se modificaron contratos, Gateway, Backend ni datos.
