# Reporte de implementación — MK-009

## Identificación y fuentes

- **Issue:** [#11 — MK-009 Características y valores permitidos](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/issues/11).
- **Entrega de demo:** `UI_COMPLETE` + `MOCK_INTEGRATED`; no equivale a API integrada ni homologación.
- **Rama local:** `lopez`; `HEAD=447ded60444844c9e378dc88aecd42bd828c791c`.
- **Base publicada:** `origin/master=081065c86ac7e75f2d072f16b280373af1978d63`.
- **Estado inicial:** había cambios locales sin commit de MK-008 en Taxonomía/Catálogo y sus pruebas; se conservan.
- **Docs:** `master` SHA `c36bd9a18f4fdb188df0d7e5158a431cf4b4ea7b`.
- **Fuentes:** SPEC-009 (`c5e1b9f`), HU-009 (`f47b47f`), FLOW-009 (`a0ae440`), WF-009 v0.8 (`ce7a4ba`); component-spec v1.1 (`9f8fd13`), plan (`c706bee`) y tasks (`b4a429d`); DESIGN 1.1.0, UX Guidelines/Decisions 2.0; guía React, catálogo Foundation y README de Frontend.
- **Readiness UX:** component-spec está **En revisión** y `validation-report.md` no aparece en MK-009. No se afirma aprobación ni `VALIDATED`.
- **Mockups encontrados:** ocho HTML: S01, S02, S03, S04, S04-P, S04-R, S05 y S06.

## Trazabilidad, rutas y evidencia

| Vista | Ruta/estado React | Captura 1440 × 900 |
|---|---|---|
| MK-009-S01 | `/caracteristicas` — `CharacteristicListPage` | [mk-009-s01-1440.png](evidencias/mk-009-s01-1440.png) |
| MK-009-S02 | `/caracteristicas/nueva` — `CharacteristicCreatePage` | [mk-009-s02-1440.png](evidencias/mk-009-s02-1440.png) |
| MK-009-S03 | `/caracteristicas/:id/editar` — `CharacteristicEditPage` | [mk-009-s03-1440.png](evidencias/mk-009-s03-1440.png) |
| MK-009-S04 | `/caracteristicas/:id/valores` — alta/renombrado/baja de valores LISTA | [mk-009-s04-1440.png](evidencias/mk-009-s04-1440.png) |
| MK-009-S04-P | Estado de comprobación pendiente en S04 | [mk-009-s04-p-1440.png](evidencias/mk-009-s04-p-1440.png) |
| MK-009-S04-R | Estado de rechazo en S04 | [mk-009-s04-r-1440.png](evidencias/mk-009-s04-r-1440.png) |
| MK-009-S05 | `/caracteristicas/:id/estado` — activar/desactivar | [mk-009-s05-1440.png](evidencias/mk-009-s05-1440.png) |
| MK-009-S06 | `/caracteristicas/:id` — `CharacteristicDetailPage` | [mk-009-s06-1440.png](evidencias/mk-009-s06-1440.png) |

Las variantes de seguimiento/rechazo son estados de S04 y conservan su contexto; no se introdujeron rutas `/MK009/Sxx` de prototipo en el producto.

## Comportamiento mock y límites

- **S01:** listado con tipo, estado, regla y navegación; búsqueda por nombre/tipo; vacío, error y reintento.
- **S02/S03:** TEXTO/NUMERO/LISTA, unidad obligatoria para NUMERO, validación local, tipo de edición deshabilitado e inmutable, error de guardado conserva borrador.
- **S04:** crear valores, renombrar etiqueta preservando `valorId`, mostrar identificadores y contador global de valores activos. El alta se deshabilita en el límite configurado de 50.
- **S04-P/S04-R:** admisión `202` simulada, fila temporalmente presentada como «Comprobando uso», consulta pendiente/error/no concluyente/rechazada/confirmada; solo el resultado confirmado mock marca Inactivo.
- **S05:** desactivación/reactivación lógica mantiene el mismo ID; la característica inactiva no permite crear, renombrar ni dar de baja valores.
- **S06:** presenta el ID de característica y la tabla de valores con sus IDs estables.
- **Arquitectura:** `CharacteristicRepository` → `characteristicService` → `mockCharacteristicAdapter`. Los controles de escenarios son privados del adapter/tests, no parámetros del puerto. No hay HTTP desde UI.
- **Integración:** mock local en memoria; se reinicia al recargar. No se publican realmente eventos `taxonomy.characteristic-value.updated`, no hay consultas reales a Catálogo ni cambios en SKU/snapshots.

**Shared/primitivas reutilizados:** `PageHeader`, `SectionCard`, `FilterBar`, `SearchField`, `EntityTable`, `StatusBadge`, `FeedbackAlert`, `EmptyState`, Mantine y Tabler. Sin shared nuevo ni modificación de providers/configuración.

## Diferencias y bloqueos documentales/contractuales

- DESIGN 1.1.0 gobierna apariencia frente a referencias HTML antiguas; React conserva desktop 1440 px, theme Foundation y Tabler.
- Q-01/Q-02 siguen abiertas en `component-spec.md` sobre configuración de límites y detalle de causas de uso. Esta entrega muestra límites mock configurados en 100/50 y mensajes genéricos de verificación; no inventa DTOs, datos reales de uso ni evento/API ejecutable.
- La baja asíncrona y el renombrado están simulados en el adapter. API/AsyncAPI real no se integró ni se probó; cualquier integración posterior debe confirmar el contrato del provider.

## Validaciones locales

Entorno: Node `v22.20.0`, npm `10.9.3`.

| Control | Resultado |
|---|---|
| `npm ci` | PASS; 0 vulnerabilidades reportadas en esta sesión |
| `npm run typecheck` | PASS |
| `set VITE_DATA_MODE=mock&& npm run build` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS; 60 pruebas unitarias de Combos/Bulk |
| `npx playwright test tests/taxonomy-mk009.spec.ts --reporter=line` | PASS; 10 pruebas de alcance y capturas |
| `tests/taxonomy-ui.spec.ts`, `tests/taxonomy.spec.ts`, `tests/taxonomy-audit-quality.spec.ts` | Ejecutadas en el conjunto Taxonomy; resultados totales a registrar tras la pasada final |
| Suite completa `npm run test:e2e` | NO EJECUTADA |
| Baseline separado de `origin/master` | NO EJECUTADO; checkout con cambios locales preexistentes en `lopez` |

## Pendientes

- No se declara `VALIDATED`: component-spec sigue En revisión; falta revisión UX de Leonardo Vera y revisión técnica independiente.
- API real/eventos: **NO**. Esta entrega satisface el alcance `MOCK_FUNCIONAL`, no la liberación híbrida #33.
- No se creó/publicó una rama ni PR; los cambios locales existentes de MK-008 se mantuvieron intactos.
