# Verificación de la demo administrativa H4

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
| `npm test` | PASS en la primera entrega. 567 casos: Combos/Promociones (113), Bulk (75), Inventario (116), Pricing (163), Taxonomía (67) y política de release (33). |
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

La ejecución integral por SHA se consulta en los checks del [PR #73](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/pull/73/checks). La aceptación con los providers autorizados está pendiente según [dependencias](DEPENDENCIAS_BACKEND_PARA_DEMO.md).
