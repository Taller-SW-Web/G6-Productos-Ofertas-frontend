# Verificación de la demo administrativa H4

La validación real con Gateway, G7 y los seis upstream queda `BLOQUEADA_POR_ENTORNO`. Las pruebas de loopback y las intercepciones de navegador aportan evidencia contractual local. Los resultados por comando se actualizan al terminar la ejecución.

| Referencia | SHA |
|---|---|
| H4 de partida | `520366d5d4766d9a173269d43e1ee34e7d6b5cbf` |
| master de Frontend | `f9c494ae1c23e7107c8b1c41c4af9f2ad40fca09` |
| Docs | `aba8d1ca998cfcd2db1c4fa87654036a5a4c1ac1` |
| Backend | `b061ef86ec63a06ba626c3f7a66c94cd7fc270db` |

## Resultados locales

Node 22.23.4 y Chromium, viewport 1440 × 900.

| Comando | Resultado observado |
|---|---|
| `npm ci` | PASS. npm informó 10 avisos moderados y 1 alto. |
| `npm run typecheck` y `npm run lint` | PASS en la primera revisión del merge. Repetición del árbol actualizado en curso. |
| `npm test` | PASS antes del último ajuste del mapeo de permisos. 567 casos entre Combos/Promociones (113), Bulk (75), Inventario (116), Pricing (163), Taxonomía (67) y política de release (33). |
| `npm run build` en mock y API | PASS en ambos modos antes de habilitar las variables opcionales de UUID. Vite emitió un aviso de import dinámico redundante de SEO. |
| `npm run test:e2e:smoke` | PASS, 8 casos. |
| `npm run test:e2e:pricing` | PASS, 6 casos HTTP controlados. |
| `npm run test:smoke:combos` | PASS, 7 casos mock. |
| Contratos de Bulk y Promociones | 73 PASS, 2 timeouts de navegador. El smoke general también ejecutó con éxito el escenario Bulk que había expirado. |
| `npm run test:e2e` / `npm run test:ci` | Estado abierto. La primera pasada global reprodujo fallos de navegador y se aplicaron correcciones durante la ejecución. Se requiere una ejecución completa verde sobre un único SHA. |
| Previews autenticados | Ejecutándose contra fixture contractual aislado. |
| G7, Gateway y servicios reales | BLOQUEADA_POR_ENTORNO. |

Entrega parcial para revisión. La aceptación H4 requiere cerrar las regresiones de navegador y ejecutar por separado las comprobaciones reales con grants, CORS y entorno aprobados.
