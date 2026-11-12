# Verificación de la demo administrativa H4

## Correcciones de los contratos candidatos de Backend #222

El [handoff del proveedor](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-backend/blob/3ac93b9f16025ce8c50e8d485862fbbb642af1db/docs/hito-4/FRONTEND_HANDOFF.md) y los OpenAPI candidatos identifican las rutas, los campos y el alcance verificados. Los resultados de las suites completas por SHA se consultan en los [checks de Frontend #73](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/pull/73/checks) y [Backend #222](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-backend/pull/222/checks).

Backend `7aad0d2` corrigió el fixture de logos de Taxonomía y aprobó la CI obligatoria. El cambio corresponde a la prueba de integración. Los contratos candidatos conservan la misma revisión de implementación. [Ejecución de Backend](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-backend/actions/runs/43281692189).

La primera CI de esta corrección registró `FAIL` al cambiar de un SKU Retail al precio base del producto. El formulario vuelve a usar Global en ese cambio de alcance. La edición directa del producto en Retail sigue usando la definición exacta. La repetición local pasó los 14 casos de `tests/pricing-audit.spec.ts` y los 7 casos de `npm run test:e2e:pricing`. [Ejecución inicial de Frontend](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/43285545786).

| Flujo | Evidencia de frontend | Aceptación bilateral |
|---|---|---|
| Catálogo administrativo | `PASS_LOCAL` en `tests/catalog-http.spec.ts` y el recorrido de borrador de `tests/catalog-http-ui.spec.ts`. Reapertura desde el listado, detalle, versión persistida y conflicto 409. | `BLOQUEADO_ENTORNO` |
| Definición exacta de Pricing | `PASS_LOCAL` con `npm run test:e2e:pricing`. Global y Retail, ausencia de definición, herencia visible y 409. | `BLOQUEADO_ENTORNO` |
| Inventario físico | `PASS_LOCAL` en `apiInventoryAdapter.spec.ts`. Saldos fuera del catálogo, ubicaciones múltiples, nulo, cero, filtros y páginas. | `BLOQUEADO_ENTORNO` |
| Alta recuperable de Combos | `PASS_LOCAL` en `httpCombosRepositoryH4.test.ts`. Pérdida del 201, misma clave y cuerpo, conflicto 409 e intención intacta. | `BLOQUEADO_ENTORNO`. Aplicar la migración de recibos y comprobar permisos runtime. |
| Auditoría administrativa | `PASS_LOCAL` en `tests/price-audit.spec.ts`. Lecturas de producto y SKU, canal nulo y rechazo de detalle ajeno. | `BLOQUEADO_ENTORNO` |
| Compatibilidad G7 y despliegue | Requiere decisión conjunta sobre el formato de token G7 y los verificadores RS256 de G6. | `BLOQUEADO_ENTORNO` |

Los resultados siguientes documentan la entrega anterior a Backend #222.

La validación real con Gateway, G7 y los seis upstream queda `BLOQUEADA_POR_ENTORNO`. Las pruebas de loopback y las intercepciones de navegador aportan evidencia contractual local. Los resultados por comando se actualizan al terminar la ejecución.

| Referencia | SHA |
|---|---|
| H4 de partida | `520366d5d4766d9a173269d43e1ee34e7d6b5cbf` |
| master de Frontend | `f9c494ae1c23e7107c8b1c41c4af9f2ad40fca09` |
| Docs | `aba8d1ca998cfcd2db1c4fa87654036a5a4c1ac1` |
| Backend | `b061ef86ec63a06ba626c3f7a66c94cd7fc270db` |

## Resultados locales

Node 22.23.4 y Chromium. La revisión de escritorio usó viewport de 1440 × 900.

| Comando o recorrido | Resultado observado |
|---|---|
| `npm ci` | PASS. npm informó 10 avisos moderados y 1 alto. |
| `npm run typecheck` y `npm run lint` | PASS. |
| `npm test` | PASS para el código de `32b13f9`. 568 casos entre Combos/Promociones (113), Bulk (75), Inventario (116), Pricing (163), Taxonomía (67) y política de release (34). |
| `npm run build` con mock y API | PASS. Vite emitió un aviso de import dinámico redundante de SEO. |
| `npm run test:e2e:smoke` | PASS, 8 casos. |
| `npm run test:e2e:pricing` | PASS, 6 casos HTTP controlados. |
| `npm run test:smoke:combos` | PASS, 7 casos mock. |
| `npm run test:e2e -- tests/h4-demo-regresiones.spec.ts --workers=1` | PASS, 10 casos. Incluye recuperación de Bulk tras recarga y cambio de identidad durante un POST. |
| `npm run test:e2e -- tests/auth-general.spec.ts --grep 'seis módulos' --workers=1` | PASS. Chromium verificó la sesión común para Catálogo, Taxonomía, Precios, Inventario, Combos y Promociones, y un 403 aislado de Inventario. Cero lecturas privadas antes del login y solo GET con el Bearer de esa sesión. |
| Contratos de Bulk y Promociones | 73 PASS, 2 timeouts de navegador en una repetición previa. El smoke general también ejecutó con éxito el escenario Bulk que había expirado. |
| `npm run test:e2e` | Primera pasada tras integrar el arranque: 548 PASS, 65 FAIL, 6 omitidos. Se aplicaron correcciones durante esa ejecución. El resultado no representa una revisión final única. |
| `npm run test:ci` | FAIL local por timeout al iniciar un worker de Vitest en Inventario. La ejecución independiente de `npm test` pasó. |
| `npm run test:production:auth` | PASS en Chromium a 1440 × 900. Fallo cerrado anónimo en 59 rutas por modo, 58 vistas autenticadas mock, 29 comprobaciones adicionales y gate contractual API en loopback. |
| `npm run test:release:policy` y `npm run test:release:boundary` | PASS. La política cubre la lectura de objetivos de Precios únicamente en su fase aislada y conserva el alcance externo de Cupones. |
| Repetición dirigida de Cupones, Promociones, Recomendaciones, Inventario, Taxonomía y Auditoría | 9 PASS. Incluye almacenamiento agotado, resultado incierto, filtros y recarga. |
| G7, Gateway y servicios reales | BLOQUEADA_POR_ENTORNO. |

En Catálogo se revisó a 1440 px el formulario con HTTP 409 y la conservación de valores. Playwright guardó capturas `catalogo-http-error-1440.png` y `catalogo-preparacion-parcial-1440.png` bajo `test-results/h4-catalog-ui/`. También se probaron el login, MFA y logout con fixtures contractuales.

La ejecución integral de `32d3a23` registró siete fallos E2E y un fallo del gate de producción API. El seguimiento corrige la reconciliación mock, los agregados filtrados de Inventario, las expectativas de Taxonomía y el aislamiento entre las intenciones de exportación de Auditoría. El gate externo conserva su alcance de Cupones y la variante de loopback verifica también Precios. [Run de 32d3a23](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/42378060972).

El [run de 32b13f9](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/42379995289) identifica el commit funcional con estas correcciones. La ejecución integral por SHA se consulta en los checks del [PR #73](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/pull/73/checks). La aceptación con los providers autorizados está pendiente según [dependencias](DEPENDENCIAS_BACKEND_PARA_DEMO.md).
