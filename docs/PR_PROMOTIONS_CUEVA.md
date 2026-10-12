# feat(frontend): MK-005/MK-006/MK-007 — Cupones, promociones y recomendaciones

Descripción de la entrega preparada para publicar por autorización de Axel el 11 de octubre de 2026. Base: `master`. Rama de trabajo: `cueva`, base `dd8ac2bf41151efa3848c93a87eae83ff6c34a0c`. La PR es la fuente de estado remoto, SHA final, CI y revisiones; este documento conserva el alcance y evidencia de implementación.

Refs #7, #8, #9. No usar Closes hasta completar publicación, revisión técnica/funcional independiente y revisión UX de Vera.

## Resultado

El checkout solo ofrecía Foundation y la consulta piloto de Precios. Ahora permite consultar, crear, editar y activar/desactivar cupones, promociones y reglas de venta cruzada/upselling con mocks: **19 pantallas**, navegables en `/cupones`, `/promociones` y `/recomendaciones`.

Los formularios conservan el borrador al abrir/cancelar selectores. Salir con cambios exige descarte explícito y guardar bloquea doble envío. La creación de una promoción de modalidad cupón aparece al crear cupones en la misma sesión; asociarla o haberla activado bloquea cambiar modalidad. Los límites de cupón no recalculan disponibilidad ni borran usos. Productos completos y SKU mantienen identidades separadas. Upselling exige criterio por candidato, sin inferir superioridad por precio.

Se reutilizan Mantine/Tabler, theme y shared existentes. Puertos/modelos de presentación, adapters mock, fixtures y controladores separados; sin HTTP en JSX. El router pasa a createBrowserRouter/RouterProvider para bloquear navegación con borradores; mantiene Precios, raíz, 404 y galería solo DEV.

## Evidencia y verificaciones

- `npm run typecheck`, `npm run build`, `npm run lint`: PASS, salida 0.
- `npm test -- --workers=2`: PASS, **42 pruebas**, incluidas las 13 existentes y 29 nuevas; 3.1 min.
- Tras ajustar ancho/labels de criterios de upselling: 13 pruebas pertinentes PASS; build con TypeScript y lint repetidos PASS.
- Evidencia desktop: `docs/evidencias/{cupones,promociones,recomendaciones}-sXX-1440.png`, con 19 capturas inspeccionadas. Diálogos a 1440×900; formularios con fullPage desde inicio de página. Tres recorridos de regeneración PASS; última captura de cupón corregida tras transición y comprobada (1 prueba adicional PASS).
- Preview de producción 4173: tres listados y tres altas accesibles, escenarios DEV ignorados, galería Foundation inaccesible y cero errores de página.
- `git diff --check`: PASS; avisos de normalización LF/CRLF.
- Matriz por pantalla, archivos, interacciones, fuentes y diferencias: [AVANCE_FRONTEND_CUEVA.md](AVANCE_FRONTEND_CUEVA.md).

## Fuentes y límites

Docs oficial master `be5c2db16aca6d6d18b3005a2da4205f724038e3`; DESIGN 1.1.0, UX 2.0, SPEC/HU/FLOW/WF005–007, component-spec/plan/tasks/HTML de los tres MK y OpenAPI 0.5.0/catalogo-errores. Frontend AGENTS/README/guías e issues #7/#8/#9 leídos antes de implementar. Docs/Backend no modificados; no se importó HTML productivo ni se cambiaron theme/shared/features ajenas.

**MOCK_INTEGRATED / MOCK_ONLY, provisional.** Recargar reinicia todas las escrituras. Acceso, errores y recuperación son simulaciones, sin autenticación/grants reales. Contratos administrativos siguen provisional-internal; no se implementó adapter HTTP. D-REC-01/02: precio y disponibilidad de recomendaciones No disponible. Una creación de promoción/regla sin ID confirmado requiere localizar el resultado en listado, sin reenvío automático. No se demuestra concurrencia/transacciones reales con comparación de snapshots.

Fuentes documentales aún registran aprobación pendiente; validation-report de MK005/006/007 no encontrado. Los HTML no acreditan APROBADO/VALIDATED. Homologación de divergencias de fixtures y revisión humana siguen pendientes. No se solicita cierre automático de issues por esta descripción local.

## Revisión requerida al publicar

- Vera: fidelidad a DESIGN, desktop 1440px, navegación/foco y consistencia de formularios/selectores.
- Revisor técnico/funcional independiente: contratos de presentación, validación, uso/capacidad, modalidad, criterios por candidato, rechazo/conflicto/incertidumbre y conservación del borrador.
- Autor: registrar el SHA final del commit de entrega y vincular evidencias antes de solicitar merge. API real, despliegue, mobile/tablet y WCAG exhaustiva fuera de alcance.
