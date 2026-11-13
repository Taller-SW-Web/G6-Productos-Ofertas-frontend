# Especificación frontend · Gestión administrativa de productos

**Alcance.** MK-003 S01 listado, S02 creación, S03 edición, S04 detalle y S06 confirmación de preparación tras el alta. El [Frontend PR #73](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/pull/73) conecta estas pantallas mediante los adaptadores de Catálogo y la sesión G7 compartida.

**Estado.** Integración contractual verificada con fixtures HTTP. La aceptación en Azure queda pendiente de un entorno autenticado que ejecute los contratos de Catálogo del Backend #222.

## Referencias fijadas

- **Backend #222** en `a1a3667a63ca20746f1a279b655bc8c7b83ad020`, en borrador al revisar. El [OpenAPI administrativo 0.6.0-h4-catalog-admin](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-backend/blob/a1a3667a63ca20746f1a279b655bc8c7b83ad020/docs/hito-4/catalogo-admin.openapi.json) es el contrato candidato que implementa esta rama. Véanse también el [registro de rutas](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-backend/blob/a1a3667a63ca20746f1a279b655bc8c7b83ad020/apps/api-gateway/src/routing/contract-routes.ts) y la [autorización del Gateway](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-backend/blob/a1a3667a63ca20746f1a279b655bc8c7b83ad020/apps/api-gateway/src/routing/gateway-identity.ts).
- **Docs** en `aba8d1ca998cfcd2db1c4fa87654036a5a4c1ac1`. El [OpenAPI 0.6.0-rc.3](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-docs/blob/aba8d1ca998cfcd2db1c4fa87654036a5a4c1ac1/contratos/http/openapi.yaml) publica las escrituras, las lecturas comerciales y las dependencias de Taxonomía. El [component spec de MK-003](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-docs/blob/aba8d1ca998cfcd2db1c4fa87654036a5a4c1ac1/ux/mockups/MK-003/component-spec.md) registra la diferencia entre las lecturas comerciales y la gestión administrativa en Q-01.
- **Frontend de partida** en `f5d9f33c05fc1334896447e57bc0ed1224c8b24d`. [CI de la reconciliación](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/43464446384). La [evidencia real de #74](../LECTURAS_FORK_AZURE.md) cubre login G7 y lecturas comerciales de Catálogo. La homologación administrativa se registra como un recorrido aparte.

## Operaciones de Catálogo

| Método y ruta | `operationId` | Entrada y respuesta |
|---|---|---|
| `GET /api/v1/productos/administracion` | `listarProductosAdministracion` | `200 PaginaProductosAdministracion`. Admite `pagina`, `tamanio` (1–100), `q` (nombre o SKU base, hasta 200 caracteres), `estado`, `categoriaId` y `marcaId`. |
| `GET /api/v1/productos/administracion/{productoId}` | `obtenerProductoAdministracion` | `200 ProductoAdministracionDetalle`; `404 PRODUCTO_NO_ENCONTRADO` para identidad ausente. |
| `POST /api/v1/productos` | `crearProducto` | `ProductoCreateRequest` → `201 ProductoDetalle`. El formulario de alta envía nombre, descripción, categoría, marca, tipo, SKU base, modelo y precio base inicial, con atributos, imágenes y perfil físico según corresponda. |
| `PATCH /api/v1/productos/{productoId}` | `actualizarProducto` | `ProductoUpdateRequest` → `200 ProductoDetalle`. El formulario envía `catalogVersion` del detalle abierto junto con los cambios. Una versión obsoleta devuelve `409 VERSION_CONFLICT`. |
| `GET /api/v1/productos/{productoId}/preparacion` | `obtenerPreparacionProducto` | Consulta separada del estado de preparación. Un alta `201` confirma persistencia. Pricing e Inventario pueden seguir en preparación. |
| `GET /api/v1/productos/{productoId}/variantes` | `listarVariantesProducto` | Dependencia del detalle cuando `tieneVariantes=true`. Se consulta por páginas para componer la vista. |

El listado devuelve `items: ProductoAdministracion[]` y `meta` con `pagina`, `tamanio`, `total` y `totalPaginas`. Cada elemento incluye `productId`, `estado` (`BORRADOR`, `ACTIVO`, `INACTIVO`), `catalogVersion` (entero desde cero), `nombre`, `descripcion`, `categoriaId`, `marcaId`, `tipoProductoId`, `skuBase`, `slug`, `tieneVariantes`, `publicadoAlgunaVez` (booleano o nulo), `creadoEn` y `actualizadoEn`.

El detalle añade `imagenes` con URL, indicador principal y posición, `atributos` con identidad, nombre, valor y opción cuando aplica, `perfilFisico` nullable y `caracteristicasIdentificadoras`. Los DTO de escritura devuelven `product_id`, `status` y `catalog_version`. El adaptador normaliza ambos formatos. El editor requiere una versión administrativa válida y conserva los datos del formulario ante un 409. La versión vigente se obtiene al volver a consultar el detalle. Las escrituras se envían una vez por intento.

El DTO de `listarProductos` / `obtenerProducto` es comercial. En ese modo la pantalla conserva el estado y la versión administrativos como desconocidos. Los consumidores comerciales usan su repositorio separado.

## Filtros y autorización

Las lecturas administrativas candidatas exigen `userBearer` y `GESTOR_COMERCIAL` explícitamente. El Gateway también aplica ese rol por defecto en las rutas humanas `userBearer` de escritura, preparación y Taxonomía de la revisión consultada. Para humanos valida un JWS G7 de tipo `acceso`, el sujeto y los roles. Los scopes y el audience de servicio corresponden a identidades módulo a módulo. La comprobación de rol de la SPA controla el acceso a la interfaz. El Gateway y los upstreams resuelven la autorización efectiva.

| Función de la pantalla | Operación y owner |
|---|---|
| Estado, texto y categoría seleccionada | `listarProductosAdministracion` en Catálogo. El parámetro `categoriaId` se envía al mismo listado. |
| Opciones del filtro Categoría y maestros del formulario | `listarCategoriasAdmin`, `GET /api/v1/categorias/administracion`, en Taxonomía. Si devuelve 403, la pantalla informa la denegación con referencia y deshabilita el selector. El listado y sus demás filtros siguen disponibles si sus propias solicitudes tienen permiso. |
| Maestro Marca en creación/edición | `listarMarcasAdmin`, `GET /api/v1/marcas/administracion`, en Taxonomía. `marcaId` existe en el contrato de listado. La pantalla actual carece de filtro Marca. |
| Maestro Tipo y esquema de atributos en creación/edición | `listarTiposProducto`, `GET /api/v1/tipos-producto`, y `obtenerEsquemaTipoProducto`, `GET /api/v1/tipos-producto/{tipoProductoId}/caracteristicas`, en Taxonomía. |
| Metadatos de atributos del detalle | `obtenerCaracteristica`, `GET /api/v1/caracteristicas/{caracteristicaId}`, en Taxonomía. |

Tipo y Modelo carecen de parámetros en el listado administrativo. En API sus controles se omiten y el listado tampoco solicita el maestro de tipos. Si la consulta filtrada de productos recibe `403 SCOPE_INSUFICIENTE`, se conserva el error y se ofrece limpiar filtros de forma explícita. Un 403 conserva la sesión, el código y la referencia de correlación. Las denegaciones se presentan como errores y las lecturas privadas conservan Bearer.

## Habilitación y prueba de aceptación en Azure

**Pendiente de Catálogo/Gateway.** Confirmar el SHA desplegado con las dos rutas administrativas y la promoción del OpenAPI candidato. Si se requieren filtros adicionales, Catálogo y Arquitectura deben acordar su contrato antes de exponerlos.

**Pendiente de Gateway, Taxonomía y G7.** Confirmar el origen del Gateway autenticado, los preflights con `Authorization`, `Content-Type` y `X-Correlation-Id`, la exposición de la referencia de respuesta y una cuenta QA con `GESTOR_COMERCIAL`. Ante un 403, contrastar método, ruta, hora UTC y referencia con el Gateway y el owner de la ruta para distinguir una denegación en Catálogo de una lectura auxiliar denegada por Taxonomía. El código de error por sí solo no identifica el origen de la decisión.

En una instancia de frontend conectada al entorno QA autorizado, configurar `VITE_DATA_MODE=api`, `VITE_G7_API_BASE`, `VITE_GATEWAY_ORIGIN` y `VITE_G6_ADMIN_API_ENABLED=true`. El Azure público de Consultas y su proxy público Vercel quedan excluidos por el arranque.

1. Entrar con `GESTOR_COMERCIAL`, completar MFA si G7 lo exige y abrir `/productos`. Comprobar el listado con cada estado, búsqueda y categoría conocida. Revisar por separado las respuestas de maestros.
2. Crear un producto QA con SKU único y maestros autorizados. Registrar `201`, `productId`, estado `BORRADOR`, versión y referencia. Tras recargar y volver a iniciar sesión, buscar el SKU y abrir el detalle por la identidad guardada.
3. Editar un campo permitido, guardar y comprobar `200`, versión actualizada y persistencia del cambio tras una nueva lectura. Abrir el mismo detalle en dos sesiones autorizadas y guardar desde la segunda después de actualizar desde la primera. La petición con versión obsoleta debe devolver `409 VERSION_CONFLICT`.
4. Comprobar `401 TOKEN_INVALIDO` en una petición administrativa sin Bearer o con token inválido, y `403 SCOPE_INSUFICIENTE` con una identidad QA autenticada sin el rol requerido. El guard de la SPA puede detener al segundo usuario antes de enviar una petición. En ese caso la comprobación del Gateway corresponde al operador autorizado del entorno.

Registrar SHA de Frontend, SHA desplegado de Backend, origen QA, fecha UTC, método, ruta, resultado HTTP, código de error, correlación, ID y versión inicial/final. Excluir tokens, contraseñas y OTP de las evidencias.

## Evidencia reproducible de frontend

Revisión del código y las pruebas: [`4395e243b7910ed4f69966fa6a05a2b1a7b2895e`](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/commit/4395e243b7910ed4f69966fa6a05a2b1a7b2895e). La CI del PR publica los resultados por SHA.

- `tests/catalog-http.spec.ts` prueba rutas, DTO, separación comercial, concurrencia y errores.
- `tests/catalog-http-ui.spec.ts` prueba creación, reapertura y edición a 1440 × 900, así como recuperación de filtros ante 403.
- `tests/auth-general.spec.ts` prueba la composición de Catálogo con la sesión compartida y el envío de Bearer mediante el arranque real contra un fixture de Gateway.

Los casos de prueba simulan persistencia contractual y permisos. El recorrido real de aceptación queda pendiente hasta disponer del despliegue y la sesión QA indicados arriba.
