# Demo administrativa H4

La rama integra H4 `520366d` con Frontend master `f9c494a`. Fuentes de consulta: Docs master `aba8d1c` (OpenAPI G6 0.6.0-rc.3, catálogo de errores y DESIGN 1.1.0) y Backend master `b061ef8` (controladores y servicios). La matriz separa las pruebas contractuales locales del entorno compartido.

El [plan adjunto](PLAN_FRONTEND_H4_DEMO_ADMIN.md) conserva el alcance y las condiciones de aceptación de partida. El estado observado está en la [matriz de verificación](MATRIZ_VERIFICACION_FRONTEND.md).

## Arranque y seguridad

`src/main.tsx` conserva el login general, MFA, guard y recarga del contexto al cambiar de identidad. `src/startApplication.tsx` compone los repositorios H4 detrás de ese login con la misma sesión humana G7. La entrada administrativa predeterminada abre Productos y conserva los enlaces profundos registrados. Pricing consulta los objetivos al entrar en una pantalla que los necesita y cancela esa consulta al salir. Se retiró el gate de sesión duplicado. Se conserva el AppShell existente.

El transporte de Gateway restringe origen y ruta, conserva correlación y renueva una vez un GET ante `TOKEN_INVALIDO`. Una escritura rechazada con ese código invalida la sesión sin repetir la solicitud. Promociones combina el control de generación de sesión de master con el propietario de los marcadores H4. Un DTO de actualización o cambio de estado con ID distinto deja la operación sin acreditar.

| Área | Capacidad compuesta | Límite |
|---|---|---|
| Catálogo MK-003/004 | Puerto de Catálogo HTTP y maestros administrativos de Taxonomía | Los administradores leen estado y versión persistidos de las rutas candidatas de Backend #222. Los consumidores comerciales conservan sus rutas. |
| Taxonomía MK-008–012 | Se reutilizan adapters HTTP de maestros, esquema, asociaciones y SEO. | El seguimiento de bajas conserva el estado asíncrono. Grants por verificar. |
| Pricing MK-013 | Se inyecta el repositorio HTTP con objetivos paginados de Catálogo. | Las escrituras usan canales textuales y la versión de la definición exacta. El precio heredado se usa para consulta. |
| Inventario MK-015/016 | Inventario HTTP con universo de SKU vendibles, dashboard, umbrales y traslados. | La grilla consulta saldos físicos paginados. El agregado conserva sus filtros propios. |
| Combos MK-002 | Repo HTTP con selección de Catálogo y precios de referencia de Pricing. | El alta administrativa recupera la intención con la misma clave y cuerpo. La migración y los permisos runtime son requisitos de despliegue. |
| Promociones MK-005–007 | Runtime administrativo sobre la sesión general, con campañas, cupones y recomendaciones. | La autorización efectiva y los catálogos dependientes requieren Gateway y servicios. |
| Bulk MK-001 y Auditoría MK-014 | Se preservan sus repositorios H4. Bulk clasifica un POST de resultado incierto y conserva la correlación. | La auditoría administrativa conserva SKU y canal nulos. La reanudación Bulk y la descarga externa requieren aceptación del proveedor. |

Las decisiones de formalización y los bloqueos se registran en los archivos de esta carpeta. La habilitación de los adapters no acredita homologación ni despliegue.

## Cierre de regresiones

- Promociones guarda un resultado esperado por identidad del registro en el escenario local de respuesta perdida. La reconciliación exige leer el mismo resultado antes de cerrar la acción, y los cambios de estado de cupones usan la capacidad de conciliación del repositorio cuando está disponible.
- Inventario vuelve a filtrar agregados por categoría y marca en modo mock. En API el agregado conserva el filtro admitido de ubicación. Si el navegador impide guardar la intención de un umbral, la pantalla muestra el error antes del envío.
- El gate de release externo verifica Cupones. El mismo verificador, en el arnés HTTP aislado, comprueba también la pantalla Precios y su consulta paginada de objetivos. El arnés de sesión comprueba las lecturas de los seis módulos con el mismo Bearer y cero lecturas privadas antes del login.
