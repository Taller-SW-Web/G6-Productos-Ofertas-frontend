# Integración Bulk H5: límites verificados

**Frontend base:** `origin/master` `4bbc4044e98bd1b0dc06c26e67f0488e6151ea7b`

**Docs:** `origin/master` `937b7deb4bde25a282ebb52bbfd16195ad684195`
**Contrato consultado:** OpenAPI `0.7.0-rc.2` (estado `SEMIFINAL_G6`).

Las operaciones Bulk están publicadas como `provisional-internal`. El contrato define la admisión multipart `POST /api/v1/carga-masiva/productos/importaciones` con `202` y `batch_id`, y la consulta posterior por `GET .../importaciones/{batchId}`. No define una clave de idempotencia de admisión, no permite consultar por `X-Correlation-Id` ni define cómo correlacionar un timeout con el `batch_id` asignado por el servidor.

Por tanto, el cliente persiste una correlación antes del POST, conserva el `batch_id` devuelto por el backend y bloquea una segunda admisión después de un resultado ambiguo. No calcula un `batch_id` local ni envía un nuevo POST para resolver la ambigüedad. El estado queda **BLOQUEADO** hasta que el owner de Bulk publique y habilite una operación contractual de conciliación por identidad estable o una garantía de idempotencia verificable.

La reanudación API continúa deshabilitada (`resumeSupported: false`); solo podrá habilitarse cuando el backend exponga elegibilidad contractual y el protocolo de reanudación aprobado. Los errores `RETRY_PROTOCOL_NOT_APPROVED` permanecen visibles como rechazo bloqueado.

La conexión del navegador se configura desde el runtime frontend con Gateway y sesión G7. Las pruebas HTTP locales acreditan únicamente el comportamiento del consumidor. No acreditan homologación, disponibilidad real del Gateway/Bulk, grants G7 ni despliegue.
