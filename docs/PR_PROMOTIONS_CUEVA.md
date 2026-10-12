# Corregir servicios y asociaciones de cupones, promociones y recomendaciones

Descripción preparada para la PR de `cueva` hacia `master`, desde `421951b30d506589e43dcc4c07b4194eea2026b8` (PR #22 ya integrada). Axel autorizó publicar las correcciones y abrir la PR después de completar las validaciones locales. Refs #7, #8, #9; sin cierre automático de issues pendientes de aceptación. La PR es la fuente del estado remoto, SHA final, CI y revisiones.

Reasignar un cupón dejaba la promoción anterior bloqueada aunque ya no tuviera asociaciones vigentes. La corrección consulta las asociaciones actuales y conserva por separado activaciones y usos históricos; editar una promoción con historial desconocido conserva su capacidad desconocida. Un cupón inactivo sigue asociado y una reasignación rechazada no altera el vínculo anterior.

Los cuatro servicios ahora se componen en un único punto y los mocks reciben puertos inyectados. Sustituir Catálogo, Promociones, Cupones o Recomendaciones deja a los consumidores consultando el servicio seleccionado, sin imports entre adapters ni fixtures cruzados. Los contratos productivos reciben datos y AbortSignal; los escenarios DEV quedan en decoradores independientes. Monto mínimo, límites y política de restitución utilizan las mismas reglas en formulario y mock, con validación directa antes de mutar.

Se conservan las 19 vistas, con una corrección de 16 px entre campos de origen de recomendaciones según DESIGN. Las pruebas guardan capturas en sus artefactos y ya no sobrescriben evidencias del equipo. Los diez PNG de Foundation/Pricing y los 19 PNG versionados quedan idénticos a master; no cambian theme, componentes compartidos ni implementación de otras features.

## Validación

- `npm run typecheck`, `npm run build`, `npm run lint`: PASS, salida 0.
- `npm test -- --workers=2`: PASS, 65 pruebas en 2.8 min, incluidas 22 pruebas directas de adapters y un recorrido visual de las 19 vistas a 1440×900.
- Capturas inspeccionadas, geometría/tipografías/diálogos comprobados y gap corregido; diferencias frente a los mockups documentadas.
- Producción local: escenarios DEV ignorados en tres listados y cuatro altas; galería inaccesible; cero errores de página.
- Docs/Backend no modificados; integración a master exclusivamente mediante PR y revisión.

## Límites y revisión pendiente

Entrega MOCK_INTEGRATED / MOCK_ONLY. No implementa endpoints ni acredita API/auth/grants reales. Los contratos administrativos siguen provisionales; D-REC-01/02 mantienen precio/disponibilidad No disponible. El historial local no reemplaza la capacidad autoritativa del provider ni demuestra concurrencia/transacciones reales.

Vera debe revisar las 19 capturas, agrupación/densidad de formularios, composición de selectores, fixtures, estados y foco; su visto bueno no se ha obtenido. Un revisor técnico debe revisar composición/sustitución, reglas reutilizables y reasignación/historial. No solicitar merge ni cierre global de issues antes de esa aceptación.

Fuentes, inventario de archivos, matriz por pantalla y discrepancias: [actualización del reporte de Cueva](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/blob/cueva/docs/AVANCE_FRONTEND_CUEVA.md#actualización-correcciones-locales-posteriores-a-pr-22). Docs master: `be5c2db16aca6d6d18b3005a2da4205f724038e3`, DESIGN 1.1.0 y UX 2.0.
