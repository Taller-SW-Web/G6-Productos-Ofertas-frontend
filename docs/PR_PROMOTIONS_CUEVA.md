# Centralizar avisos y desacoplar servicios de cupones, promociones y recomendaciones

Los avisos de demostración estaban escritos en las pantallas y varios consumidores seleccionaban servicios DEV directamente. Ahora los nueve avisos se reúnen en `PromotionDataNotice` y desaparecen automáticamente al seleccionar composición backend. Las páginas, hooks y diálogos consumen puertos neutrales mediante `usePromotionServices`; la selección, decoración y limpieza de escenarios queda aislada en la composición mock de desarrollo.

Conectar el backend requerirá principalmente proporcionar los cuatro adaptadores oficiales y cambiar la composición a `backend`, conservando las 19 pantallas, formularios, navegación y validaciones. Los parámetros de demostración se ignoran también en DEV cuando se selecciona backend. Las confirmaciones utilizan textos neutrales y las consultas descartan respuestas de un puerto anterior.

La PR también corrige las asociaciones de cupones y las validaciones compartidas: reasignar el último cupón sin uso libera la asociación anterior, mientras que activaciones, uso histórico y capacidades desconocidas se conservan. Los mocks reciben referencias por puertos y las capturas de pruebas no sobrescriben la evidencia versionada del equipo.

### Validación

- `npm run typecheck`, `npm run build` y `npm run lint`: PASS, salida 0.
- `npm test -- --workers=2`: las **65 pruebas existentes pasaron**. La prueba nueva falló inicialmente por exigir que un selector dependiente estuviera habilitado antes de elegir el tipo de origen.
- `npm test -- tests/promotions-visual.spec.ts --workers=2 --grep 'composición backend' --output=test-results/backend-composition`: **1 PASS** tras corregir exclusivamente esa aserción nueva. Comprueba las 19 vistas cambiando solo el origen de composición y usando los puertos existentes como doble de servicio.
- Recorrido visual automatizado de las 19 vistas a **1440 × 900**: PASS; seis capturas inspeccionadas manualmente en esta corrección.
- `git diff --check`: PASS. Sin cambios en tokens, navegación, dependencias, nuevos fixtures ni lógica interna de los mocks en esta última separación.

### Límites

Entrega **MOCK_INTEGRATED / MOCK_ONLY**. La comprobación de composición backend no acredita acceso HTTP ni una API real. Los contratos administrativos, autenticación y permisos del provider siguen pendientes; `prepareCreation` no concede permisos reales. D-REC-01/02 mantienen precio/disponibilidad por producto como No disponible.

Revisión técnica y UX independiente pendiente. No se declara cierre de los issues ni aprobación funcional global.

[Informe e inventario de cambios](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/blob/cueva/docs/AVANCE_FRONTEND_CUEVA.md).

Refs #7, #8, #9.
