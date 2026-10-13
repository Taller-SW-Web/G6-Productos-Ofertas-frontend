MK-003/MK-004 ya podían navegar con mocks, pero la composición aceptaba Promises sin resolver y conservaba providers anteriores; además los atributos SKU permitían IDs/nombres libres y los filtros de productos leían fixtures directamente. Esta entrega corrige esos límites para sustituir los puertos en la raíz sin reescribir páginas ni hooks.

Refs #5 y #6. Rama `poma` → `master`. Commit de código auditado: `0a59f075fa7eb18482c965dbaaa0aed1e5b7f139`.
Docs: `master@78a923bbc6bada31b39b3d386331f90a4f812b31`, DESIGN 1.1.0; SPEC-003/004/009/010, HU/FLOW/WF-003/004 y OpenAPI.

Cambios de esta auditoría:
- Factories síncronas con repositorios inicializados, rechazo de Promises, prioridad de inyección sobre caché y CatalogServicesContext. DataModeContext obligatorio; API sin provider falla sin mock fallback. Eliminadas fachadas sin consumidores.
- Formulario de variantes por esquema autorizado: LISTA conserva valorId, NUMERO usa límites y admite negativos cuando corresponda, TEXTO respeta límite configurado. Obligatorios/roles, esquema fallido y SKU/identificadores inmutables.
- Filtros mediante Taxonomía y observaciones de lectura ligadas al provider actual.
- Reintentos simples verifican manualRetryAllowed en ambas dependencias; 409 cuando no es admisible; 202 permanece PENDING. Helper mínimo de confirmación exclusivamente mock.
- Precio inicial de Catálogo separado del vigente de Pricing, sin cero inventado. Eliminados /MK-004 y fallback ficticio; navegación contextual.
- Pruebas con los mismos formularios y otro adapter en modo API, ciclo BORRADOR/PENDING/COMPLETED/ACTIVA, IDs/tipos y errores. Capturas 1440 px nuevas; se restauraron las imágenes de Pricing regeneradas por su suite.

Validación del código final:
| Gate | Resultado |
|---|---|
| npm run typecheck | PASS |
| npm run lint | PASS |
| VITE_DATA_MODE=mock npm run build | PASS |
| VITE_DATA_MODE=api npm run build | PASS |
| npm test -- --workers=2 | 144 PASS / 1 FAIL de 145 (4.3 min) |
| Repetición aislada de Pricing: npm test -- tests/pricing-workflows.spec.ts --workers=1 --grep 'six direct views' | 1/1 PASS |
| MK-003 / MK-004 / adapters e inyección | 32/32 PASS |
| Desktop 1440 px | Capturas, inspección y comprobaciones sin overflow |
| git diff --check | PASS |

La única falla de la corrida final completa fue `UNKNOWN open docs/evidencias/mk-013-s03-1440.png`: las pruebas existentes de Pricing escriben el mismo archivo en paralelo en Windows. La repetición aislada pasó sin modificar Pricing. No se declara PASS para la corrida paralela completa. Cupones, Promociones, Recomendaciones y los casos funcionales restantes de Pricing fueron ejecutados satisfactoriamente.

Estado: **MOCK_INTEGRATED**, sustitución probada con adapter alternativo; no API HTTP real.
BLOCKED_CONTRACT: EsquemaTipoProducto/AsociacionTipoCaracteristica no publica rol identificador ni límites numéricos por característica; el límite configurado de texto requiere mapping desde configuración del provider. El formulario bloquea ausencia de rol/límite de texto. López ya tiene PR #24 fusionado, pero no se copió ni modificó su implementación; conexión definitiva de sus IDs/esquema y revisión conjunta siguen pendientes. No se inventaron endpoints ni DTOs.

Reporte detallado: [docs/AUDITORIA_CATALOGO_MK003_MK004.md](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/blob/poma/docs/AUDITORIA_CATALOGO_MK003_MK004.md).
Evidencias y logs: [docs/evidencias/catalog-audit](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/tree/poma/docs/evidencias/catalog-audit).

Esta PR incluye la implementación previa de la rama poma además de las correcciones del commit final. Requiere revisión técnica/UX y conciliación con master, que incorpora Taxonomía; no cerrar los issues ni fusionar hasta completar esa revisión.

Publicada como PR borrador #25. GitHub indica conflictos con master; su conciliación
queda explícitamente pendiente. No se fusionó la PR.
