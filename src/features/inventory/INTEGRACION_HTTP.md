# Inventario — integración HTTP (MK-015 / MK-016, issue #104)

Estado: **PARTIAL**. El adaptador HTTP está implementado y probado contra el
contrato vigente con un transporte inyectado. La aplicación **no** está
conectada al Gateway porque el composition root compartido (#45/#109) y su
cliente todavía no existen, y `CommercialModeGate` mantiene `/inventario`
bloqueado en modo API. Ninguna operación se declara integrada de extremo a
extremo.

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
| `adapters/apiInventoryAdapter.ts` | Fábrica `createHttpInventoryRepository` con `InventoryHttpTransport` inyectable. Implementa umbrales, KPIs autoritativos de dashboard (con `null` en métricas no publicadas) y traslados (lectura y recepción), con bloqueo de doble envío, resultado incierto y traducción de `application/problem+json`. Las operaciones sin fuente contractual fallan con `CONTRATO_BLOQUEADO`. |
| `services/inventoryMappers.ts` | Validadores/mappers del contrato: `toThresholdConfig`, `toDashboardKpiSummary`, `validateTrasladoDto`, `validateTrasladoListDto`, `validateRecepcionResponse`, `validateTransferPresentation`. Conserva `toTransferItem`, `toStockStatus` y `toRecepcionTrasladoRequestDto`. |
| `services/inventoryErrors.ts` | Códigos de protocolo/estado: `NO_AUTENTICADO`, `SIN_PERMISO`, `SERVICIO_NO_DISPONIBLE`, `RESULTADO_INCIERTO`, `RESPUESTA_INCOMPATIBLE`, `CONTRATO_BLOQUEADO`. |
| `services/inventoryProvider.ts` | Punto de inyección `configureInventoryApi(factory)`. Sin factory, el modo API mantiene un fallo controlado bajo demanda; nunca cae al mock. |
| `adapters/apiInventoryAdapter.spec.ts` | 19 pruebas unitarias del adaptador. |
| `adapters/vitest.config.ts` | Configuración local del feature (no modifica los scripts compartidos). |
| `INTEGRACION_HTTP.md` | Este documento. |

No se editaron `src/main.tsx`, `src/app/config/**`, el transporte compartido ni
otros features.

## Operaciones implementadas

| `operationId` | Método y ruta | Mapeo |
|---|---|---|
| `obtenerUmbralesInventario` | `GET /api/v1/inventario/umbrales` | `umbralGlobal → globalThreshold`; `overrides[] → skuOverrides` |
| `actualizarUmbralGlobal` | `PUT /api/v1/inventario/umbrales/global` | body `{ umbral }`; respuesta `UmbralInventario` |
| `establecerUmbralSku` | `PUT /api/v1/inventario/umbrales/skus/{sku}` | SKU codificado; body `{ umbral }` |
| `obtenerDashboardInventario` | `GET /api/v1/inventario/dashboard?locationId&categoriaId&marcaId` | mapea los 6 KPIs autoritativos de `DashboardInventario` e informa `null` (ausencia de dato, nunca `0`) en las 6 métricas no publicadas; rechaza con `CONTRATO_BLOQUEADO` filtros de texto libre o estado |
| `listarTrasladosInventario` | `GET /api/v1/inventario/traslados?estado&target_location_id&pagina&tamanio` | pagina con `tamanio=100` hasta cubrir `total` (sin truncar) |
| `obtenerTrasladoInventario` | (mapeador `validateTrasladoDto` disponible) | — |
| `registrarRecepcionTrasladoInventario` | `POST /api/v1/inventario/traslados/{trasladoId}/recepciones` | `Idempotency-Key = operation_id`; body `RecepcionTrasladoInventarioRequest` |

La recepción bloquea un segundo envío concurrente del mismo traslado y, ante
error de red o `5xx`, marca el resultado como incierto y exige consultar el
traslado antes de reintentar. Los `4xx` definitivos liberan el bloqueo.

### Campos que el contrato no transporta

`toTransferItem` recibe `transferCode`, `productName`, `sourceLocationName` y
`targetLocationName` desde un `TransferPresentationResolver` inyectado. Si no
se inyecta, los métodos de traslados fallan con `CONTRATO_BLOQUEADO`; no se
rellenan con valores simulados.

## Operaciones bloqueadas (`CONTRATO_BLOQUEADO`)

| Método del puerto | Campo sin fuente contractual | Owner / condición |
|---|---|---|
| `getStockItems`, `getStockDetail` | `productName`, `categoryName`, `brandName`; `locationName`; `stockVersion`; `updatedAt` | Catálogo/Taxonomía (mapping producto→SKU) y una fuente de ubicaciones; `consultarDisponibilidad` no expone versión ni fecha |
| `getDashboardAlerts` | modelo completo de alertas | No existe operación de alertas |
| `getLocationDistribution` | `blockedTotal`, `locationName` | `porUbicacion` no los publica |
| `getCategories`, `getBrands` | integración de filtros (paginación) | Catálogo; definición pendiente |
| `getLocations` | modelo completo de ubicaciones | Sin endpoint HTTP (`inventory.locations`) |

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
| `npx vitest run --config src/features/inventory/adapters/vitest.config.ts` | **19/19 PASS** |
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
- No se modificaron contratos, Gateway, Backend ni datos.
