# Demo administrativa H4

La rama integra H4 `520366d` con Frontend master `f9c494a`. Fuentes de consulta: Docs master `aba8d1c` (OpenAPI G6 0.6.0-rc.3, catálogo de errores y DESIGN 1.1.0) y Backend master `b061ef8` (controladores y servicios). La matriz separa las pruebas contractuales locales del entorno compartido.

## Arranque y seguridad

`src/main.tsx` conserva el login general, MFA, guard y recarga del contexto al cambiar de identidad. `src/startApplication.tsx` compone los repositorios H4 detrás de ese login con la misma sesión humana G7. La entrada administrativa predeterminada abre Productos y conserva los enlaces profundos registrados. Pricing consulta los objetivos al entrar en una pantalla que los necesita y cancela esa consulta al salir. Se retiró el gate de sesión duplicado. Se conserva el AppShell existente.

El transporte de Gateway restringe origen y ruta, conserva correlación y renueva una vez un GET ante `TOKEN_INVALIDO`. Una escritura rechazada con ese código invalida la sesión sin repetir la solicitud. Promociones combina el control de generación de sesión de master con el propietario de los marcadores H4. Un DTO de actualización o cambio de estado con ID distinto deja la operación sin acreditar.

| Área | Capacidad compuesta | Límite |
|---|---|---|
| Catálogo MK-003/004 | Puerto de Catálogo HTTP y maestros administrativos de Taxonomía | La lista y detalle de producto son comerciales. La edición tras recargar depende de CAT-ADMIN-READ. |
| Taxonomía MK-008–012 | Se reutilizan adapters HTTP de maestros, esquema, asociaciones y SEO. | El seguimiento de bajas conserva el estado asíncrono. Grants por verificar. |
| Pricing MK-013 | Se inyecta el repositorio HTTP con objetivos paginados de Catálogo. | Las escrituras por canal requieren su UUID autorizado. Un precio global no acredita una versión específica de canal. |
| Inventario MK-015/016 | Inventario HTTP con universo de SKU vendibles, dashboard, umbrales y traslados. | Cobertura comercial para la tabla de saldos. El agregado solo aplica filtros admitidos por el provider y las ubicaciones conservan su ID. |
| Combos MK-002 | Repo HTTP con selección de Catálogo y precios de referencia de Pricing. | Disponibilidad informativa y recuperación de altas dependen del contrato. |
| Promociones MK-005–007 | Runtime administrativo sobre la sesión general, con campañas, cupones y recomendaciones. | La autorización efectiva y los catálogos dependientes requieren Gateway y servicios. |
| Bulk MK-001 y Auditoría MK-014 | Se preservan sus repositorios H4. Bulk clasifica un POST de resultado incierto y conserva la correlación. | Reanudación Bulk requiere aprobación de protocolo. Auditoría y descarga externa requieren prueba del provider. |

Las decisiones de formalización y los bloqueos se registran en los archivos de esta carpeta. La habilitación de los adapters no acredita homologación ni despliegue.
