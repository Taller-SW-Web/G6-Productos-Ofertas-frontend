# Catalog — estados y preparación asíncrona H5

## Frontera

El Frontend usa los contratos HTTP publicados por Gateway y Catalog. No consume Azure Service Bus, no conoce colas ni interpreta el estado de publicación como resultado comercial. Catalog persiste la solicitud y coordina Pricing/Inventory en segundo plano; su `GET /productos/{productoId}/preparacion` es la fuente administrativa de estado.

## Estados y consultas

`PENDING` significa que Catalog aún no confirmó un resultado terminal. `COMPLETED` y `REJECTED` solo aparecen después de que Catalog devuelve esos estados. El `manualRetryAllowed` del backend determina si se muestra el reintento.

Un `POST .../preparacion/reintentar` que responde HTTP 202 confirma admisión de la solicitud, no que Pricing o Inventory hayan terminado. La interfaz usa `location.state` solo para una notificación transitoria de admisión. Un HTTP 202 nunca significa preparación completada. El polling consulta exclusivamente `GET /productos/{productoId}/preparacion`, y continúa solo mientras existan dependencias `PENDING`; la preparación de variantes se correlaciona con `variant_id` y SKU sin repetir GET de detalle de producto/variante en cada ciclo. Se respeta un `Retry-After` válido; si no existe, se aplica el backoff con jitter acotado del hook. El detalle administrativo se vuelve a leer al entrar, cambiar de entidad/sesión o recargar, no como sustituto de la preparación autoritativa.

Para variantes, la consulta de preparación del producto se relaciona con la variante mediante `variant_id` y el SKU real. Si falta la fila, no coincide la identidad o falla la consulta, la pantalla informa indisponibilidad y no inventa estado ni fecha de verificación. No utiliza una consulta comercial como reconciliación de escritura administrativa incierta.

Las respuestas tardías no reemplazan la variante/producto actualmente seleccionado. Reintentos concurrentes desde el mismo control se bloquean en el hook. Las escrituras administrativas inciertas siguen sin reenvío automático; una consulta debe resolver el estado mediante un endpoint que incluya información administrativa autorizada.

Errores 401/403/503 conservan su semántica de acceso/indisponibilidad. Un error de consulta no convierte una respuesta previa en confirmación reciente. Activar/desactivar permanece sujeto a validación del Backend; la interfaz no confirma optimistamente la mutación.

## Evidencia

- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm run build` con `VITE_DATA_MODE=mock`: PASS.
- `npm test`: PASS (655 pruebas en los scripts de unitarias y políticas configurados).
- `npm run test:e2e -- tests/catalog-http-ui.spec.ts --workers=1 --reporter=line`: PASS (8 pruebas); servidor interceptado en loopback, viewport del proyecto 1440×900.
- Gateway, Catalog, Pricing, Inventory, sesión G7 y despliegues reales: PENDIENTE_VERIFICACION. Las respuestas interceptadas no prueban integración autenticada.

Para reproducir el E2E focalizado:

```powershell
$env:PLAYWRIGHT_PORT = '5186'
npm run test:e2e -- tests/catalog-http-ui.spec.ts --grep 'HTTP 202' --workers=1 --reporter=line
```

No se cambió la evidencia histórica H4. La publicación depende del PR Backend H5 y de la disponibilidad del contrato HTTP/Gateway y sus permisos en cada entorno.
