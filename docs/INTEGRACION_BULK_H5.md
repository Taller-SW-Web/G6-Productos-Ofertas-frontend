# Integración Bulk H5 (MK-001)

## Estado de fuentes y releases

- **Contrato:** OpenAPI/AsyncAPI `0.7.0-rc.3`, aprobación contractual G6 completada. Docs PR #133 está fusionado; el acta de aprobación Docs #138 está fusionada en `67fc87b71f60ebd0d97be69912dc669510934bc2`.
- **Backend Bulk:** PR #252 fusionado en `9e4ac0af2a3ea882784413401bd5016ff611caa2`. La fusión de código no acredita despliegue ni homologación autenticada en un entorno.
- **Catalog:** PR #243 y #254 siguen pendientes de integración a `master` al momento de esta actualización. No se habilita el retry Catalog hasta que el consumidor esté integrado y exista evidencia aprobada del protocolo V4/V2.
- **Frontend:** PR #93 implementa y prueba el consumo HTTP, los recibos de admisión, la conservación de identidad y el bloqueo seguro de operaciones. Las pruebas del frontend son evidencia de comportamiento del consumidor con fixtures, no de una integración real.
- **Entorno/release:** despliegue y habilitación operativa pendientes. Los flags `VITE_BULK_RECONCILIATION_ENABLED`, `VITE_BULK_REPLAY_ENABLED` y `VITE_BULK_RESUME_ENABLED` en `.env.example` permanecen en `false`.

## Admisión y seguimiento

La importación inicial y el retry producen recibos `202` distintos. El `X-Correlation-Id` de retry identifica esa solicitud idempotente; el `correlation_id` de su recibo sigue identificando el lote original. El `202` confirma admisión durable, no el resultado del procesamiento. Los contadores, filas y estados posteriores proceden únicamente de `GET /importaciones/{batchId}`.

El marcador de retry aceptado se guarda en `sessionStorage` con propietario G7, `batchId`, correlación del retry, correlación original y estado `ACCEPTED_PENDING_REFRESH`; no contiene bytes ni credenciales. Tras recarga se conserva el bloqueo. Solo un GET del mismo propietario y lote que muestre `QUEUED`/`PROCESSING`, o un estado terminal sin la elegibilidad previa, permite cerrar el seguimiento. Error, timeout, identidad contradictoria o un snapshot que aún muestre el lote `COMPLETED` y elegible mantienen el último snapshot como histórico y bloquean otro POST.

La admisión inicial ambigua no genera un `batchId` local ni reenvía el POST. La conciliación usa exclusivamente el GET contractual por correlación cuando su capacidad independiente está acreditada por el manifiesto de release y su flag está habilitado. `404` no demuestra que el POST anterior no haya sido admitido. Replay de admisión exige, además, evidencia de idempotencia concurrente y confirmación humana; no hay replay automático.

## BULK_RETRY_V1

La UI solo consume elegibilidad explícita del protocolo `BULK_RETRY_V1`. Se exige lote terminal, snapshot completo, candidatos únicos, fila y paso del dominio comprobables y ningún paso ya completado/aplicado. Solo `CATALOGO` está permitido en esta etapa; `INVENTARIO` queda excluido. La selección es informativa: Backend vuelve a autorizar la operación. No se implementan compensaciones ni reenvío completo desde el navegador.

El recibo HTTP `202` de retry conserva la correlación original y no sustituye el snapshot. La pantalla invalida la vista anterior y consulta el lote por GET. Si la consulta falla o no prueba avance, conserva la vista previa como histórica, indica el problema y ofrece actualización manual; no autoriza otro retry. La misma identidad de retry no se convierte silenciosamente en una intención comercial distinta.

## Compuertas de release

El manifiesto firmado/autorizado de release es una compuerta frontend, no una autorización de seguridad. El validador verifica versión contractual `0.7.0-rc.3`, SHAs exactos del release y el digest del manifiesto autorizado:

- **Conciliación:** evidencia de contrato aprobado, backend compatible e integración autenticada más su flag.
- **Replay de admisión:** compuerta de conciliación, evidencia de idempotencia concurrente y confirmación humana; sin reenvío automático.
- **Retry Catalog:** contrato/backend compatibles, SHA del consumidor Catalog integrado, evidencia V4/V2 y flag propio.

SHA con formato correcto, URL arbitraria, JSON no autorizado o flag aislado no prueban homologación. JWT, propietario, permisos e idempotencia siguen siendo autoridad exclusiva del Backend/Gateway. No se ha incorporado un manifiesto ficticio ni se han activado flags en esta entrega.

## Evidencia y límites

La suite focalizada, el typecheck, lint y builds se registran en el PR con el SHA exacto ejecutado. CI de GitHub es una evidencia separada y solo cuenta como PASS cuando los checks obligatorios terminan satisfactoriamente en el HEAD final; `SKIPPED` no es PASS. Azure, G7 compartido, integración autenticada real, homologación/deploy de Catalog y despliegue del Backend no se infieren de pruebas locales del frontend.
