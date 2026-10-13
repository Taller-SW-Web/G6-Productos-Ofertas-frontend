La edición de productos podía borrar atributos cuando fallaba Taxonomía; el mock podía conservar una actualización parcial tras rechazar el perfil físico y las altas reutilizaban IDs derivados del reloj. Esta entrega bloquea el guardado sin esquema confirmado, preserva atributos históricos, publica actualizaciones solo después de validarlas y genera UUID. También invalida el formulario SKU al cambiar de producto.

Refs #5 y #6. **PR en borrador; no hacer merge ni cerrar issues.** Rama `poma` → `master`.
Código integrado para esta revisión: `6e3c66a50834c28f59f7c6615e2764eafdb61ca4`; correcciones de Catálogo en `5523d0e1e3020ed4024dbf3313dbcaace84c59e2`.
Primera integración aditiva: los 13 commits de master mediante `6267499`, base `fdbacbae347b346bb492c27b3f4fab3c81be77da` (incluido PR #24 de López). Después master añadió MK-014 mediante PR #26 de Vera: se resincronizó nuevamente con `2fbc0d68da664b1fd7fad06ab51688c8cf7e5af9`, sin eliminar Productos/Variantes ni las nuevas rutas de Auditoría. Cero commits detrás de esa base; se conservan Taxonomía, Pricing, Auditoría de precios, Cupones, Promociones y Recomendaciones.

### Cambios
- Esquema de producto distingue pendiente, error y vacío confirmado. Guarda de submit y botones bloqueados, reintento explícito y conservación de atributos históricos. Un error no se muestra como esquema vacío.
- Update mock sobre candidato independiente; ninguna validación fallida altera campos/version persistidos.
- UUID para productos/variantes; regresión de 100 altas de cada entidad con el reloj congelado.
- Montaje del formulario de variante ligado al productId: navegación client-side descarta campos, padre y errores anteriores; respuestas antiguas se invalidan.
- Bridge tipado con los servicios oficiales de Taxonomía: conserva IDs, obligatoriedad, unidad y valores LISTA activos; usa maxTexto del provider. Sin fixtures nuevos ni endpoints inventados. Inyección en mock/API sin modificar páginas.
- Badge neutro para el modelo de venta y SKU Base; revisión de badges de los diálogos de producto.
- Capturas de Pricing aisladas por prueba mediante evidencePath; se evita la escritura concurrente sin reducir comprobaciones. Tests de navegación adaptados al menú aditivo de 12 destinos y smoke ampliado con todas las vistas de MK-014, sin reducir comprobaciones.
- Se conservan las correcciones anteriores: composición síncrona e inyección explícita, API sin fallback mock, atributos SKU por esquema, reintentos autorizados y precio inicial separado de Pricing.

### Validación real
| Gate | Resultado |
| --- | --- |
| Nuevas regresiones aisladas | 6/6 PASS |
| Suite completa final: npx playwright test --workers=4 --reporter=line | **199/199 PASS, 5.0 min**, incluidos los 22 casos de MK-014 |
| VITE_DATA_MODE=mock: typecheck, lint, build | PASS, exit 0 |
| VITE_DATA_MODE=api: typecheck, lint, build | PASS, exit 0 |
| Producción mock, node scripts/verify-production.mjs mock | PASS: 48 vistas, 1440×900 |
| Producción api, node scripts/verify-production.mjs api | PASS: 44 vistas, 1440×900; providers ausentes explícitos, sin descarga de mocks |
| git diff --check | PASS |

La primera integración dio 172/177 por cinco expectativas antiguas de 10 enlaces en Taxonomía; dos ejecuciones posteriores dieron 177/177 y el CI de `0e668fd` terminó correctamente. Después de incorporar MK-014, el menú tiene 12 destinos y la suite completa pasa 199/199. El fallo previo por PNG compartido de Pricing no reaparece. Primer build mock de esta resincronización bloqueado por EPERM del sandbox al resolver el CSV de muestra; repetición con permisos adecuados PASS, sin modificar el código de Vera.

### Evidencias
- [Auditoría actualizada](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/blob/poma/docs/AUDITORIA_CATALOGO_MK003_MK004.md).
- [Suite de 199 casos, gates mock/API, smokes y capturas MK-014 integradas](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/tree/poma/docs/evidencias/catalog-audit/resync-master-2fbc0d6).
- [Suite, gates API, smokes y capturas nuevas](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/tree/5523d0e1e3020ed4024dbf3313dbcaace84c59e2/docs/evidencias/catalog-audit/revision-2026-10-13).
- [Propuesta de coordinación con López](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/blob/5523d0e1e3020ed4024dbf3313dbcaace84c59e2/docs/COORDINACION_TAXONOMIA_CATALOGO.md).

### Pendiente contractual
**MOCK_INTEGRATED; no HTTP real.** El bridge oficial está probado, pero no se activa sobre los productos históricos hasta que López confirme migración/mapa de IDs y roles identificadores por tipo/característica, separados de obligatoriedad. Límites NUMERO no se inventan. Sin roles confirmados, SKU permanece bloqueado al consumir ese origen. Solicitud de coordinación no equivale a acuerdo aprobado.

Fuentes: Docs `master@942bf7322eb388fe5b0fcc9c5a565152e1099139`, SPEC-003/004/009/010, HU/FLOW/WF-003/004, DESIGN/UX, componentes/prototipos y OpenAPI; servicios de Taxonomía incorporados desde PR #24. Docs/Backend sin modificaciones. Revisión UX/técnica independiente pendiente.
