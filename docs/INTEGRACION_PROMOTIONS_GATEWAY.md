# Promotions por Gateway — #77/#78

## Paso 6 — recorrido de sesión unido al Gateway y PostgreSQL

El runner Backend `apps/promotions-svc/test/flow.isolated.e2e.mjs` exige este
Frontend y ejecuta juntos los recorridos HTTP/UI/PG y AMQP. Conserva el test
anterior y añade `tests/promotions-session-gateway.spec.ts`: cinco casos sobre
la entrada real `src/main.tsx`, sin harness, tokens inyectados ni interceptar
API con Playwright. Todos los datos son descartables.

G7 es un proveedor de contrato HTTPS explícito, con JWT RS256 sintéticos y
renovación/OTP; Gateway, Promotions, verificación de firma/rol y PostgreSQL/TLS
ejecutan sus implementaciones reales. Se prueba login/CRUD/409/recarga/logout,
MFA, rechazo real de JWT expirado y renovación única, refresh revocado y 403 de
CLIENTE. Las llamadas del proveedor se cuentan, se exige cero reusos de refresh
y el Backend comprueba el cupón SQL y ausencia de efectos de consumo.

Las cinco pruebas se omiten en `npm test` ordinario porque requieren el entorno
descartable. El runner dedicado las ejecuta y falla si no hay Frontend; no las
declara aprobadas por omisión. Registra SHAs, estado limpio/modificado, hashes
de los archivos ejecutados, resultados y capturas a 1440×900 en
`flow-evidence.json`. Ejecución desde Backend:

```powershell
npm run build:all
$env:G6_TEST_PYTHON = '<python con cryptography>'
$env:G6_PROMOTIONS_FRONTEND_ROOT = (Resolve-Path '../G6-Productos-Ofertas-frontend').Path
$env:G6_PROMOTIONS_E2E_OUTPUT_DIR = '<carpeta local de evidencia>'
node apps/promotions-svc/test/flow.isolated.e2e.mjs
```

Esto completa las pruebas locales del desarrollo disponible; G7/G5/Inventory
compartidos, homologación y E2E Oracle siguen separados y pendientes. No modifica
la UI, adapters, dependencias, permisos ni configuración productiva.

Estado: API_INTEGRATED en entorno local descartable para el recorrido probado; PARCIAL para entorno compartido. Rama cueva. No hay despliegue ni homologación G7.

## Composición

Se conserva el único modo global VITE_DATA_MODE. En mock, la demostración existente no cambia. En api, las rutas de Promotions permanecen bloqueadas hasta recibir un PromotionApiContext.Provider con servicios explícitos.

La factory createHttpPromotionServices recibe gatewayOrigin y getAccessToken(signal). La composición en main conecta esos servicios a G7Session cuando VITE_DATA_MODE=api y se configuran juntas VITE_GATEWAY_ORIGIN y VITE_G7_API_BASE. Sin ambas URLs conserva el gate anterior; con solo una falla al iniciar. No se obtiene un token de servicio ni se concede un rol desde la UI. HTTPS es obligatorio excepto loopback local.

G7Session implementa el contrato G7 bf819dd216294f5e2d5d8d4d73b60554dc9d7b62, specs/contrato-api/openapi.yaml, kit-integracion, SPEC-06 y FRONT-00/H-11: POST /auth/login, /auth/otp/solicitar, /auth/otp/verificar, /auth/refresh y /auth/logout bajo la base publicada. Los pares de tokens, identidad y desafío se conservan solo en memoria; no se usan URL, localStorage, sessionStorage, cookies persistentes ni logs. Recarga requiere login. El formulario reutiliza SectionCard/FeedbackAlert/Mantine, protege las rutas existentes y solo monta las pantallas después de recibir SesionIniciada; MFA no equivale a sesión.

La renovación ocurre cuando faltan 60 s o menos y se serializa para todas las consultas de esta instancia. Se reemplazan ambos tokens, y un fallo o resultado desconocido borra la sesión sin reusar el refresco. Cada pestaña inicia su sesión independiente; no se comparten tokens entre pestañas. Un GET con 401 TOKEN_INVALIDO puede renovar y repetir una sola vez; 403 u otro 401 no disparan renovación. Una segunda respuesta 401 cierra la sesión local. Las escrituras nunca se reenvían automáticamente: un TOKEN_INVALIDO exige login y un intento explícito. Logout borra la sesión aunque falle la red; respuestas antiguas no la restauran. G7 tiene 6,5 s de límite por llamada; la consulta completa a Gateway, incluida la sesión, conserva 7,5 s.

El contexto vive en src/app/config/PromotionApiContext.ts para no cargar la feature ni sus mocks cuando el gate bloquea el modo API sin proveedor. Los hooks/páginas existentes consumen el contexto; los componentes visuales no conocen bearer tokens, endpoints o DTOs. El harness tests/harness/promotions-http.* es una entrada de prueba separada del build normal, no la composición productiva de sesión.

## Adaptador administrativo

- Cupones: listar, detalle, promociones de modalidad CUPON, crear, editar y cambiar estado.
- Promociones y reglas: listar, detalle, crear, editar y activar/desactivar por rutas oficiales. Altas/ediciones/activaciones sujetas a las referencias autorizadas del backend.
- Mapeo explícito ACTIVO/INACTIVO, modalidades, tipos de descuento, canales (incluye sales → VENTAS), criterios UPSELL y fechas Lima con zona -05:00.
- PATCH de campañas/reglas envía solo diferencias frente a su lectura previa. No reenvía fechas sin cambio truncando sus segundos ni manda campos derivados como autorización.
- Null conserva su significado en límites/monto mínimo; no se completa uso desconocido con cero.
- 401/403 son fallos de acceso visibles; 404 de detalle es ausencia; 400/422 y 409 conservan el borrador. Fallo de transporte, 5xx o respuesta de mutación no confirmada exige consultar el resultado: sin reenvío automático.
- Cada request tiene cancelación/límite de 7,5 s, UUID de correlación, redirect:error y credentials:omit. No se imprime la respuesta cruda ni el token en el producto.
- Los selectores usan el adaptador HTTP de referencias descrito debajo. La opción catalog permite inyectar un proveedor compatible de forma explícita, sin seleccionar mocks automáticamente.

No se añaden consumo/restauración ni evaluadores de cesta a la UI administrativa. Tampoco se declara stock/precio autoritativo desde la configuración de una recomendación.

## Selectores HTTP de referencias — paso 1

createHttpPromotionServices configura por defecto createHttpPromotionCatalog con el mismo transporte y callback de sesión de usuario. Reutiliza MK-006-S04 y MK-007-S02/S04/S05, sin cambiar componentes ni añadir permisos.

- Productos: GET /api/v1/productos?estado=ACTIVO&pagina=…&tamanio=100, PaginaProductosComercial con paginación en raíz. No se requiere un campo status que la proyección no publica; la actividad procede de la consulta activa documentada.
- SKU: producto simple usa su sku_base confirmado. Producto con variantes consulta GET /api/v1/productos/{productoId}/variantes?estado=ACTIVA&pagina=…&tamanio=100, PaginaVariantes con meta y status administrativo. Un ID de producto/variante o barcode no sustituye al SKU; sin SKU confirmado del simple, error visible.
- Categorías: GET /api/v1/categorias/administracion?estado=ACTIVO&pagina=…&tamanio=100, PaginaCategoriasAdmin con meta, categoriaId/nombre/estado/version. No usa GET /categorias, que exige serviceBearer.
- Paginación completa antes de entregar opciones; respuesta incompleta/incoherente o identidades repetidas falla sin devolver una lista parcial. Inactivos no se habilitan. Cada lectura completa de selector está acotada a 7,5 s, admite cancelación y no conserva resultados entre llamadas ni repite operaciones comerciales. Solo admite el único reintento GET por renovación descrito arriba. Límite técnico de 1.000 páginas por listado.
- 401/403, fallo de una página/variantes y DTO inválido producen el estado de error existente, conservando el borrador. No se completan referencias con datos de demostración ni se agregan precio/stock.

OpenAPI sí define DTOs HTTP tipados: la explicación histórica de GenericData no corresponde a estas lecturas. La integración compartida necesita sesión real, permisos y handlers de los owners. El adaptador no autentica por sí mismo un usuario ni acredita su despliegue.

La verificación autoritativa del backend sigue protegida: Promotions no está en las allowlists de servicio de Catálogo/Taxonomía y las variantes administrativas usan userBearer. La selección del navegador no sustituye AdminReferences.verify. Las altas/ediciones/activaciones que dependen de esa validación todavía pueden responder 503.

Pruebas: `npx playwright test tests/promotions-catalog-http.spec.ts tests/promotions-http-contract.spec.ts --workers=1`. Los fixtures HTTP explícitos verifican DTO/mapping/transporte; las dos pruebas de navegador reutilizan la UI con esas respuestas. No se etiquetan como integración con Catálogo remoto ni reemplazan el runner real siguiente.

## Prueba reproducible real

Desde Backend, con dependencias en ambos repositorios y Docker/Chromium:

```powershell
npm run build:all
$env:G6_TEST_PYTHON = '<python con cryptography, según PERSISTENCE.md de Backend>'
$env:G6_PROMOTIONS_FRONTEND_ROOT = '<ruta absoluta a este frontend>'
$env:G6_PROMOTIONS_E2E_OUTPUT_DIR = '<carpeta de evidencias>'
node apps/promotions-svc/test/gateway.isolated.smoke.mjs
```

El runner ejecuta los providers existentes y luego procesos nativos de Gateway y Promotions, PostgreSQL/TLS restringido y JWKS HTTPS de prueba. Playwright usa los componentes/rutas reales, un proxy Vite temporal y JWT RS256 sintéticos en memoria. No sustituye identidad/persistencia mediante overrides ni mocks HTTP.

El recorrido crea un cupón, edita su límite, activa, recarga y verifica persistencia; prueba duplicado conservando el formulario y errores de sesión/rol/404. Consulta campañas/reglas propias. La captura a 1440×900 y el JSON registran SHAs/entorno. El backend comprueba que no cambien usos, recibos, Inbox u Outbox.

tests/promotions-gateway.spec.ts está omitido en la suite frontend ordinaria si no se arranca ese entorno; su ejecución dedicada se registra por separado. npm test no acredita por sí solo el Gateway. Los resultados concretos y las omisiones deben citarse por comando/SHA.

## Fuentes y dependencias

Docs G6 1ee0d9e5a788dbe559a376bf96a60c6117af3956; OpenAPI 0.6.0-rc.1; SPEC-005/006/007; DEC-F-007/008/009/012; DESIGN, UXG/UXD y component-spec MK-005/006/007. Se reutiliza el diseño existente; no se declara aprobación UX pendiente por disponer de capturas.

| Owner | Operación | Desbloqueo verificable |
| --- | --- | --- |
| G7 / integración G6 | Operación compartida de pantallas | Cliente de login/MFA/refresh/logout ya implementado y conectado; faltan URL operativa, CORS/orígenes, issuer/JWKS/roles reales y prueba autenticada. Los fixtures HTTP no prueban que G7 esté operativo. |
| Catálogo/Taxonomía + integración G6/G7 | Selectores compartidos y validación backend de referencias | Probar sesión de usuario y handlers reales de las tres lecturas. Para backend, operación/identidad propia autorizadas para existencia/actividad de productos, SKU y categorías, sin delegar confianza al navegador. |
| Catálogo/Pricing/Inventario + arquitectura | Datos comerciales/enriquecimiento | Fuentes autenticadas SKU/canal/instante y D-REC-01/02 para variantes. |
| Marco / #111 y owners de entorno | E2E desplegado | Autorización individual del SHA/imagen/destino y validación de entorno. |

Implementación interna, pruebas locales, integración autenticada compartida, homologación y despliegue se registran por separado. #77/#78 permanecen abiertos y parciales. No se abre otro PR ni se ejecuta carga/restore DATA.
