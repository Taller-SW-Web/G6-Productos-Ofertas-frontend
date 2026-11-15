# Dependencias de la demo administrativa H4

Fuentes verificadas en Docs `aba8d1c` y en los contratos candidatos de Backend #222 en `3ac93b9`. Frontend #74 solicita JWS conforme a G7 ADR-009 y aporta evidencia de login, MFA y lecturas Azure para su revisión. Los grants de las rutas administrativas nuevas y su despliegue siguen pendientes de aceptación bilateral. [Backend #222](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-backend/pull/222) · [Frontend #74](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/pull/74).

| ID y owner | Evidencia y clasificación | Desbloqueo y prueba de aceptación |
|---|---|---|
| CAT-ADMIN-READ · Catálogo/Gateway | Backend #222 aporta listado y detalle administrativos con estado y versión. El frontend consume esas rutas. | Confirmar grant humano y ejecutar creación, recarga y edición contra el entorno aprobado. |
| CAT-TAX-ATTRIBUTE-ROLE · Catálogo/Taxonomía | El detalle de Backend #222 publica `caracteristicasIdentificadoras` por producto. | Verificar primera selección y reapertura de una variante con el esquema autorizado. |
| PRICE-CHANNEL-IDS · Pricing/Gateway/G7 | Backend #222 publica definición exacta de producto/SKU y canales textuales `RETAIL`, `MARKETPLACE`, `CHATBOT` y `VENTAS`. | Validar versión editable y grants de cada canal. Verificar la introspección G7 en el entorno objetivo. |
| INV-FULL-SKU / INV-LOCATIONS / INV-ALERTS · Inventario | Backend #222 aporta saldos físicos paginados con nombre de ubicación y filtro de estado local. | Confirmar cobertura física y grants. Los eventos de alerta y el catálogo independiente de ubicaciones siguen fuera de esta consulta de saldos. |
| INV-DASH-FILTERS · Inventario/Docs | OpenAPI enumera `productoId`, `categoriaId` y `marcaId` en el dashboard; el servicio los rechaza con 400. EXISTENTE_NO_OPERATIVO. | Alinear OpenAPI al comportamiento implementado o habilitar filtros con autoridad de Catálogo y probar que alteran el agregado según su selección. |
| INV-RECEIVE · Inventario/Gateway | La recepción existe con `Idempotency-Key` y autorización humana específica. PERMISO / ENTORNO. | Confirmar grant y repetir el mismo payload/clave tras pérdida de respuesta. Debe acreditarse una recepción sin duplicar el efecto. |
| COMBO-AVAILABILITY / COMBO-IDEMPOTENCY · Combos/Inventario | Backend #222 agrega alta administrativa idempotente por sujeto G7. | Aplicar `0002_create_combo_creation_receipts.sql`, verificar SELECT/INSERT del rol runtime y recuperar un alta tras perder el 201. Acreditar la fuente de disponibilidad por separado. |
| PROMO-PERMISSIONS · Promociones/Gateway/G7 | Existen operaciones administrativas. Los grants efectivos y las lecturas auxiliares deben comprobarse. PERMISO. | Entregar cuenta autorizada y probar lectura, escritura y 403 en campañas, cupones y reglas, con dependencias de Catálogo y Taxonomía. |
| GW-AUTH-CORS · Gateway/G7 | Login, preflight, introspección y upstream requieren un entorno aprobado. ENTORNO. | Aprobar los orígenes exactos, preflight, scope por operación y cuenta de prueba. Ejecutar MFA, los seis recorridos con evidencia y logout/revocación según el procedimiento bilateral. |
| BULK-RETRY / AUDIT-PRODUCT-NULL · Bulk/Auditoría/Gateway | Auditoría administrativa de Backend #222 publica SKU y canal nulos. La reanudación HTTP de Bulk sigue pendiente. | Probar historial y exportación real con permisos. Acordar el protocolo de reanudación de Bulk. |

## Alcance del verificador de release

El gate externo prueba la operación aprobada `listarCupones` y el cierre de sesión. El gate contractual aislado añade la navegación a Precios y verifica su lectura exacta `GET /api/v1/productos?pagina=1&tamanio=100` en loopback. Para incluir Precios en una aceptación externa, el owner debe aprobar esa operación y aportar un entorno, una cuenta y los permisos de los canales aplicables.
