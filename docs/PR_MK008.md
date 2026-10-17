# Reporte de implementación — MK-008

## Identificación y fuentes

- **Issue:** [#10 — MK-008 Categorías y subcategorías](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/issues/10).
- **Entrega de demo:** `UI_COMPLETE` + `MOCK_INTEGRATED`; no implica API integrada ni visto bueno UX.
- **Rama local:** `lopez`; `HEAD=447ded60444844c9e378dc88aecd42bd828c791c`.
- **Base publicada:** `origin/master=081065c86ac7e75f2d072f16b280373af1978d63`.
- **Estado inicial:** había cambios sin commit en adapters de Taxonomía/Catálogo y tests. Se conservaron; esta implementación continúa el árbol de trabajo de `lopez` para respetar los avances de PR #41.
- **PR #41:** abierto, base `master`, head `lopez` (`447ded6`).
- **PR #24:** fusionado a `master` (`fdbacbae347b346bb492c27b3f4fab3c81be77da`).
- **Docs:** `master` SHA `c36bd9a18f4fdb188df0d7e5158a431cf4b4ea7b`.
- **Fuentes:** SPEC-008, HU-008, FLOW-008, WF-008 v0.7; `ux/mockups/MK-008/component-spec.md` v1.1, `plan.md`, `tasks.md`; `DESIGN.md` 1.1.0; UX Guidelines/Decisions 2.0; guía React, catálogo Foundation y README de Frontend.
- **Readiness UX de Docs:** component-spec continúa **En revisión**; `validation-report.md` no aparece en el directorio MK-008. No se atribuye aprobación.
- **Mockups encontrados:** nueve HTML: S01, S02, S02-C, S03, S04, S04-P, S04-B, S05 y S05-R.

## Pantallas, rutas y evidencia

| Pantalla | Ruta productiva / forma React | Evidencia 1440 × 900 |
|---|---|---|
| MK-008-S01 | `/categorias` — `CategoryTreePage` | [mk-008-s01-1440.png](evidencias/mk-008-s01-1440.png) |
| MK-008-S02 | `/categorias/nueva` — `CreateCategoryPage` | [mk-008-s02-1440.png](evidencias/mk-008-s02-1440.png) |
| MK-008-S02-C | Diálogo de confirmación dentro de `/categorias/nueva` | [mk-008-s02-c-1440.png](evidencias/mk-008-s02-c-1440.png) |
| MK-008-S03 | `/categorias/:id/editar` — `EditCategoryPage` | [mk-008-s03-1440.png](evidencias/mk-008-s03-1440.png) |
| MK-008-S04 | `/categorias/:id/desactivar` — confirmación en `DeactivateCategoryPage` | [mk-008-s04-1440.png](evidencias/mk-008-s04-1440.png) |
| MK-008-S04-P | Mismo contexto de desactivación, estado pendiente/seguimiento | [mk-008-s04-p-1440.png](evidencias/mk-008-s04-p-1440.png) |
| MK-008-S04-B | Mismo contexto de desactivación, rechazo visible | [mk-008-s04-b-1440.png](evidencias/mk-008-s04-b-1440.png) |
| MK-008-S05 | `/categorias/:id` — `CategoryDetailPage` | [mk-008-s05-1440.png](evidencias/mk-008-s05-1440.png) |
| MK-008-S05-R | Estado de bloqueo dentro de `/categorias/:id` | [mk-008-s05-r-1440.png](evidencias/mk-008-s05-r-1440.png) |

Las variantes de diálogo/estado no tienen URL académica `/MK008/Sxx`. Se retiraron los aliases productivos que aparentaban deep-link a S02-C/S05-R sin contar con el borrador o el resultado previo; se conservan las rutas de negocio y el contexto de navegación real.

## Comportamiento implementado y probado

- **S01:** árbol jerárquico con estado por categoría, búsqueda, expansión recordada en `sessionStorage`, vacío, error de lectura con reintento y anidación MVP de dos niveles.
- **S02:** formulario controlado para nombre, descripción, URL de imagen, orden y padre opcional; validación del nombre; opciones de padre inválidas visibles y deshabilitadas con causa.
- **S02-C:** propuesta de slug resuelta por el adapter mock, presentada como solo lectura y confirmada explícitamente. Una colisión concurrente conserva el borrador, vuelve a resolver y requiere confirmar la alternativa.
- **S03:** edición de nombre, descripción, imagen, orden y ubicación; errores conservan el formulario. El slug no se modifica desde Categorías: esa tarea pertenece a MK-012.
- **S04/S04-P/S04-B:** cancelar solicitud, rechazo inmediato, admisión pendiente, consulta pendiente prolongada, error de consulta, rechazo final y resultado confirmado. El estado de la categoría no se marca inactivo antes de la confirmación mock.
- **S05/S05-R:** detalle con padre, hijas, slug y estado; 404/error de lectura y reactivación condicionada. Si el padre está inactivo, la hija permanece inactiva y se ofrece navegar al padre.
- **Integración de datos:** `CategoryRepository` → `categoryService` → `mockCategoryAdapter`; sin HTTP directo desde UI. Los estados de escenario expuestos por el adapter son controles de prueba, no parte del puerto ni un selector de modo de datos.

**Shared/primitivas reutilizados:** `PageHeader`, `SectionCard`, `FilterBar`, `SearchField`, `EntityTable`, `StatusBadge`, `FeedbackAlert`, `EmptyState`, `ConfirmDialog`, Mantine y Tabler Icons. No se propone nuevo shared.

## Diferencias y decisiones documentales

- `DESIGN.md` vigente es 1.1.0; las páginas HTML consultadas declaran derivar de DESIGN 1.0.0 e incluyen una extensión responsive y Material Symbols. React sigue el alcance desktop 1440 px, usa tokens/tema Foundation y Tabler Icons. La revisión debe tomar DESIGN 1.1.0 como normativa; los defectos del HTML no se copiaron.
- El component-spec conserva preguntas abiertas y el estado En revisión. La decisión DEMO_P0 permite esta implementación mock sin convertir ese estado en aprobación UX.
- El polling simulado de operaciones permanece en el adapter. No se incorporó ruta HTTP, evento, scope o permiso.

## Validaciones locales reproducibles

Entorno: Node `v22.20.0`, npm `10.9.3`.

| Control | Resultado |
|---|---|
| `npm ci` | PASS; 0 vulnerabilidades reportadas |
| `npm run typecheck` | PASS |
| `set VITE_DATA_MODE=mock&& npm run build` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS; 60 pruebas unitarias (36 Combos, 24 Bulk) |
| `npx playwright test tests/taxonomy-ui.spec.ts tests/taxonomy-audit-e2e.spec.ts tests/taxonomy.spec.ts tests/taxonomy-audit-quality.spec.ts tests/taxonomy-mk008.spec.ts --reporter=line` | PASS; 75 pruebas |
| Capturas desktop 1440 × 900 | Generadas desde Playwright y revisadas en este entorno; no certifican aprobación UX |
| Suite completa `npm run test:e2e` | NO EJECUTADA; se ejecutó la suite Taxonomy pertinente |
| Baseline separado de `origin/master` | NO EJECUTADO; el checkout ya tenía cambios locales en la rama `lopez` y PR #41 está abierto |

## Pendientes y límites

- API real: **NO**. La entrega es `MOCK_ONLY`; escrituras mock son de sesión y se reinician al recargar.
- No se declara `VALIDATED`: component-spec aún en revisión; revisión UX de Leonardo Vera y revisión técnica independiente pendientes.
- No se creó ni publicó una rama/PR nueva: el directorio de trabajo ya contenía avances locales sobre `lopez`/PR #41. Reubicar esos cambios a una rama desde `origin/master` habría mezclado o separado trabajo ajeno sin autorización.
- Las modificaciones locales preexistentes en adaptadores de Catálogo/Taxonomía y tests forman parte del estado compartido de trabajo y deben revisarse junto con este diff antes de abrir/actualizar la PR.
