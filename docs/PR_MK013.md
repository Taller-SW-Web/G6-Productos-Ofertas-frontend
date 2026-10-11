# feat(frontend): MK-013 — Gestión de precios individuales y masivos

Refs #15. Destino previsto: `master`. Rama: `vera`, por petición explícita del usuario, actualizada por avance directo a `dd8ac2bf41151efa3848c93a87eae83ff6c34a0c`. Esta descripción está preparada localmente; no acredita publicación de una PR.

El piloto `/precios` permitía consultar S01 y las demás vistas solo tenían muestras en la galería. Ahora S01 enlaza formularios de edición/versionado, programación futura, importación, seguimiento de lote e histórico con retorno contextual. Un conflicto de versión conserva la propuesta y exige releer/revisar antes de una nueva confirmación. Programar una tarifa no altera el precio actual.

La entrega usa un puerto y adapter mock tipados; los cambios confirmados existen durante la sesión y se reinician al recargar. No hay HTTP, autenticación ni escritura comercial real. S04 muestra selección/política y respuestas ficticias independientes de los bytes seleccionados: parser y admisión permanecen **BLOCKED_CONTRACT: Q-013-01/02**. S05 consulta un lote de fixture existente y descarga un reporte ficticio; no afirma que S04 haya creado ese lote. El issue no debe cerrarse por esta entrega parcial de importación.

Se reutilizan theme, shell, Mantine/Tabler y shared existentes. Las únicas modificaciones transversales necesarias son el registro de rutas/navegación y el data router para conservar borradores también desde sidebar, scope y Atrás/Adelante; la navegación marca un único destino activo. No se eliminan rutas ajenas.

Docs: `master@be5c2db16aca6d6d18b3005a2da4205f724038e3`, DESIGN 1.1.0 y UX 2.0. MK-013 sigue En revisión y no tiene validation-report oficial. La matriz completa de seis pantallas, archivos, fuentes, diferencias de HTML, escenarios y capturas está en [VALIDACION_MK013.md](VALIDACION_MK013.md).

Validación local: `npm ci`, `npm run typecheck`, `npm run build`, `npm run lint` PASS. `npm test -- --workers=2`: **34 PASS**, incluidos 21 recorridos nuevos. Tras estabilizar las capturas, 6 casos PASS; tras el último ajuste de foco/ancho/resumen confirmado de S02, 3 recorridos afectados PASS (12.7 s) y typecheck/lint/build nuevamente PASS. Hay 12 capturas desktop 1440×900 y comprobación de ausencia de overflow de página en seis vistas. El informe detalla entradas/resultados y la secuencia de verificación. No hay aprobación humana ni CI remoto atribuida a una validación local.

Revisión solicitada al publicar: técnica/funcional independiente y UX, incluyendo la migración de router, conflictos, navegación contextual y límites explícitos de S04/S05. No mergear ni cerrar #15 sin resolver o replantear los pendientes con sus owners.
