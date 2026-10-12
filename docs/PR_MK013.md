# feat(frontend): MK-013 — Gestión de precios individuales y masivos

Refs #15. Destino: `master`. Rama: `vera`. La base de esta corrección es `c3ef0c9a1a4a171e6dc5131f1f4167c9f17c0e11`, que incorpora la entrega inicial de MK-013. Esta descripción se mantiene preparada localmente; no acredita una PR publicada ni revisión aprobada.

S01–S06 ya eran navegables, pero el puerto incluía escenarios artificiales, la UI importaba targets de fixtures y los importes/fechas se mezclaban con etiquetas. Ahora las mismas páginas reciben catálogo y operaciones por un puerto sin escenarios, seleccionado en un único factory e inyectado mediante provider. La prueba independiente utiliza cafetera, otro UUID/SKU, moneda CHF y otro lote sin modificar las páginas.

Retail conserva el mismo precio en resumen/desglose. La programación consulta el regular del instante futuro, verifica relación oferta/regular y conserva la asignación por producto/SKU. La superposición se rechaza por objetivo/canal entre regular y oferta conforme a SPEC-013. La moneda queda vinculada a la lectura: no hay conservación automática/conversión ni selector de monedas admitidas inventado.

`VITE_DATA_MODE=mock|api` elige el adapter una vez. API ausente o fallida se presenta como error, sin recurrir a datos ficticios. El reloj de reglas es inyectable y el modo API usa el del sistema. La exposición mock fija explícitamente el **17/10/2026 07:00 America/Bogota** y sus precios son vigentes en ese instante. Importes/códigos/ISO se normalizan; el reporte sale como archivo binario con nombre del adapter y se descarga mediante un puerto de navegador.

S04 envía `File + allowPartial` al puerto. El mock normal conserva **BLOCKED_CONTRACT: Q-013-01/02**; las respuestas artificiales están exclusivamente en el decorador de desarrollo. No se define parser/plantilla ni se habilita admisión. La política de cambio de moneda tampoco está publicada y queda explícita. No hay backend, HTTP, autenticación ni persistencia comercial verificados; **MOCK_REPLACEABLE no equivale a API_INTEGRATED ni cierra el issue**.

En esta auditoría no cambian `AppRoutes`, `productRoutes`, `productPages` ni navegación. Se añade el provider en `main.tsx`. Los cambios de router/navegación de la entrega inicial siguen siendo parte del diff de la PR frente a master; se solicita revisar su integración con MK-001 y futuras rutas de otros owners, sin eliminar registros ajenos.

Fuentes: Docs `master@be5c2db16aca6d6d18b3005a2da4205f724038e3`, DESIGN 1.1.0 y UX 2.0. MK-013 sigue En revisión, sin validation-report oficial. [AUDITORIA_MK013.md](AUDITORIA_MK013.md) contiene la matriz H01–H16, archivos, bloqueos, comandos, prueba del segundo adapter y capturas. [VALIDACION_MK013.md](VALIDACION_MK013.md) conserva el registro inicial.

Validación local: typecheck/build/lint PASS; suite completa **48 PASS** (34 previas + 14 nuevas), 1.2 min. Tras el último ajuste de resolución heredada, **14 pruebas de auditoría PASS** (9.8 s) y checks técnicos repetidos. Capturas Chromium 1440×900 de las seis vistas y cuatro casos del segundo adapter, con inspección de ausencia de overflow. El informe conserva los límites y la secuencia de validación. Revisión técnica/funcional y UX independiente pendiente; no atribuir CI remoto o integración real a las pruebas locales.
