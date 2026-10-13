La edición de productos podía borrar atributos cuando fallaba Taxonomía; el mock podía conservar una actualización parcial tras rechazar el perfil físico y las altas reutilizaban IDs derivados del reloj. Esta entrega bloquea el guardado sin esquema confirmado, preserva atributos históricos, publica actualizaciones solo después de validarlas y genera UUID. También invalida el formulario SKU al cambiar de producto.

Refs #5 y #6. **PR en borrador; no hacer merge ni cerrar issues.** Rama `poma` → `master`.
Código validado: `5523d0e1e3020ed4024dbf3313dbcaace84c59e2`.
Integración aditiva de los 13 commits de master mediante `6267499`, base `fdbacbae347b346bb492c27b3f4fab3c81be77da` (incluido PR #24 de López). Cero commits detrás de esa base; se conservan rutas y navegación de Taxonomía, Pricing, Cupones, Promociones y Recomendaciones.

### Cambios
- Esquema de producto distingue pendiente, error y vacío confirmado. Guarda de submit y botones bloqueados, reintento explícito y conservación de atributos históricos. Un error no se muestra como esquema vacío.
- Update mock sobre candidato independiente; ninguna validación fallida altera campos/version persistidos.
- UUID para productos/variantes; regresión de 100 altas de cada entidad con el reloj congelado.
- Montaje del formulario de variante ligado al productId: navegación client-side descarta campos, padre y errores anteriores; respuestas antiguas se invalidan.
- Bridge tipado con los servicios oficiales de Taxonomía: conserva IDs, obligatoriedad, unidad y valores LISTA activos; usa maxTexto del provider. Sin fixtures nuevos ni endpoints inventados. Inyección en mock/API sin modificar páginas.
- Badge neutro para el modelo de venta y SKU Base; revisión de badges de los diálogos de producto.
- Capturas de Pricing aisladas por prueba mediante evidencePath; se evita la escritura concurrente sin reducir comprobaciones. Tests de Taxonomía adaptados al menú aditivo de 11 destinos.
- Se conservan las correcciones anteriores: composición síncrona e inyección explícita, API sin fallback mock, atributos SKU por esquema, reintentos autorizados y precio inicial separado de Pricing.

### Validación real
| Gate | Resultado |
| --- | --- |
| Nuevas regresiones aisladas | 6/6 PASS |
| Suite completa final: npx playwright test --workers=4 --reporter=line | **177/177 PASS, 3.6 min** |
| VITE_DATA_MODE=mock: typecheck, lint, build | PASS, exit 0 |
| VITE_DATA_MODE=api: typecheck, lint, build | PASS, exit 0 |
| Producción mock, node scripts/verify-production.mjs mock | PASS: 43 vistas, 1440×900 |
| Producción api, node scripts/verify-production.mjs api | PASS: 39 vistas, 1440×900; providers ausentes explícitos, sin descarga de mocks |
| git diff --check | PASS |

La primera suite tras integrar dio 172/177 por cinco expectativas antiguas de 10 enlaces en Taxonomía. Se corrigieron conservando los 11 destinos; dos ejecuciones completas posteriores dieron 177/177. El fallo previo por PNG compartido de Pricing no reaparece.

### Evidencias
- [Auditoría actualizada](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/blob/5523d0e1e3020ed4024dbf3313dbcaace84c59e2/docs/AUDITORIA_CATALOGO_MK003_MK004.md).
- [Suite, gates API, smokes y capturas nuevas](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/tree/5523d0e1e3020ed4024dbf3313dbcaace84c59e2/docs/evidencias/catalog-audit/revision-2026-10-13).
- [Propuesta de coordinación con López](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/blob/5523d0e1e3020ed4024dbf3313dbcaace84c59e2/docs/COORDINACION_TAXONOMIA_CATALOGO.md).

### Pendiente contractual
**MOCK_INTEGRATED; no HTTP real.** El bridge oficial está probado, pero no se activa sobre los productos históricos hasta que López confirme migración/mapa de IDs y roles identificadores por tipo/característica, separados de obligatoriedad. Límites NUMERO no se inventan. Sin roles confirmados, SKU permanece bloqueado al consumir ese origen. Solicitud de coordinación no equivale a acuerdo aprobado.

Fuentes: Docs `master@942bf7322eb388fe5b0fcc9c5a565152e1099139`, SPEC-003/004/009/010, HU/FLOW/WF-003/004, DESIGN/UX, componentes/prototipos y OpenAPI; servicios de Taxonomía incorporados desde PR #24. Docs/Backend sin modificaciones. Revisión UX/técnica independiente pendiente.
