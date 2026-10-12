# Centralizar avisos y desacoplar servicios de cupones, promociones y recomendaciones

Los avisos de demostración estaban escritos en las pantallas y varios consumidores seleccionaban servicios DEV directamente. Ahora los nueve avisos se reúnen en `PromotionDataNotice` y desaparecen automáticamente al seleccionar composición backend. Las páginas, hooks y diálogos consumen puertos neutrales mediante `usePromotionServices`; la selección, decoración y limpieza de escenarios queda aislada en la composición mock de desarrollo.

Conectar el backend requerirá principalmente proporcionar los cuatro adaptadores oficiales y cambiar la composición a `backend`, conservando las 19 pantallas, formularios, navegación y validaciones. Los parámetros de demostración se ignoran también en DEV cuando se selecciona backend. Las confirmaciones utilizan textos neutrales y las consultas descartan respuestas de un puerto anterior.

La PR también corrige las asociaciones de cupones y las validaciones compartidas: reasignar el último cupón sin uso libera la asociación anterior, mientras que activaciones, uso histórico y capacidades desconocidas se conservan. Los mocks reciben referencias por puertos y las capturas de pruebas no sobrescriben la evidencia versionada del equipo.

Al abrir `/cupones/nuevo`, `useCoupon` recibe el identificador ausente y devuelve `null` sin invocar `repository.read`. La llamada al hook sigue siendo incondicional y la edición mantiene la lectura del cupón seleccionado. Una prueba de regresión cuenta las llamadas al puerto antes de montar React: verifica cero lecturas en el alta y utiliza la edición de `run10` como control positivo.

### Validación

- `npm run typecheck`, `npm run build` y `npm run lint`: PASS, salida 0.
- `npm test -- tests/coupon-write.spec.ts tests/coupons.spec.ts --workers=2 --output=test-results/coupon-read-fix`: **13 PASS**, incluida la regresión de lectura al crear y los flujos de alta, edición, detalle, límites, cambio de estado, errores y retorno contextual.
- Sensibilidad de la regresión comprobada antes del fix: detectó dos llamadas con ID vacío; después verifica cero en el alta y lecturas de `run10` en edición. No añade fixtures ni cambia el resultado del repositorio.
- Cupones: capturas desktop **1440 × 900** regeneradas; captura de S02 inspeccionada. En la validación anterior de esta PR pasaron las 65 pruebas existentes y la prueba de composición backend sobre las 19 vistas. No se declara una nueva ejecución de la suite global en esta corrección puntual.
- `git diff --check`: PASS. Sin cambios en tokens, navegación, dependencias, nuevos fixtures ni lógica interna de los mocks en esta última separación.

### Límites

Entrega **MOCK_INTEGRATED / MOCK_ONLY**. La comprobación de composición backend no acredita acceso HTTP ni una API real. Los contratos administrativos, autenticación y permisos del provider siguen pendientes; `prepareCreation` no concede permisos reales. D-REC-01/02 mantienen precio/disponibilidad por producto como No disponible.

Revisión técnica y UX independiente pendiente. No se declara cierre de los issues ni aprobación funcional global.

[Informe e inventario de cambios](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/blob/cueva/docs/AVANCE_FRONTEND_CUEVA.md).

Refs #7, #8, #9.
