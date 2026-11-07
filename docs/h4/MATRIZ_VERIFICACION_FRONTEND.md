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
| `npm test` | PASS. 567 casos: Combos/Promociones (113), Bulk (75), Inventario (116), Pricing (163), Taxonomía (67) y política de release (33). |
| `npm run build` con mock y API | PASS. Vite emitió un aviso de import dinámico redundante de SEO. |
| `npm run test:e2e:smoke` | PASS, 8 casos. |
| `npm run test:e2e:pricing` | PASS, 6 casos HTTP controlados. |
| `npm run test:smoke:combos` | PASS, 7 casos mock. |
| `npm run test:e2e -- tests/h4-demo-regresiones.spec.ts --workers=1` | PASS, 10 casos. Incluye recuperación de Bulk tras recarga y cambio de identidad durante un POST. |
| Sesión compartida y carga de Pricing | PASS, 1 caso de navegador. Cupones no solicita objetivos de Pricing. Precios hace la lectura con el Bearer de la sesión original. |
| Contratos de Bulk y Promociones | 73 PASS, 2 timeouts de navegador en una repetición previa. El smoke general también ejecutó con éxito el escenario Bulk que había expirado. |
| `npm run test:e2e` | Primera pasada tras integrar el arranque: 548 PASS, 65 FAIL, 6 omitidos. Se aplicaron correcciones durante esa ejecución. El resultado no representa una revisión final única. |
| `npm run test:ci` | FAIL local por timeout al iniciar un worker de Vitest en Inventario. La ejecución independiente de `npm test` pasó. |
| `npm run test:production:auth` | Fallo cerrado anónimo PASS en 59 rutas por modo. Mock autenticado PASS en 58 vistas. El gate de release API falló con `RELEASE_NETWORK_NOT_APPROVED`. |
| G7, Gateway y servicios reales | BLOQUEADA_POR_ENTORNO. |

En Catálogo se revisó a 1440 px el formulario con HTTP 409 y la conservación de valores. Playwright guardó capturas `catalogo-http-error-1440.png` y `catalogo-preparacion-parcial-1440.png` bajo `test-results/h4-catalog-ui/`. También se probaron el login, MFA y logout con fixtures contractuales.

El [PR #73](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/pull/73) conserva la revisión en borrador. En el [primer run del PR](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/42377007052), typecheck, estilo, unitarias visibles, smoke y build mock pasaron. El [job de API](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/42377007052/job/128416560498) compiló y falló en el verificador de release. Ese verificador permite la lectura de Cupones y también navega a Precios, cuya pantalla usa la lectura de objetivos de Catálogo. El acuerdo necesario figura en [dependencias](DEPENDENCIAS_BACKEND_PARA_DEMO.md).

Estado parcial. Falta una pasada integral verde sobre el mismo SHA y la aceptación con los providers autorizados.
