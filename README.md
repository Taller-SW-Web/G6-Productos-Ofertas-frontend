# Productos y Ofertas — Frontend

Aplicación web de administración para el módulo Productos y Ofertas. Permite recorrer flujos de catálogo, taxonomía, precios, auditoría de precios, promociones, cupones, recomendaciones, carga masiva, gestión de combos e inventario en modo de demostración. Usa React 19, TypeScript 6, Vite 8, Mantine 9 y Tabler Icons; este repositorio es independiente de [Docs](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-docs) y Backend. La presencia de puertos y adapters sustituibles facilita una futura integración, pero no acredita conexión HTTP con servicios reales.

## Inicio rápido

Requisitos: Node.js `>=22.12.0 <23` (definido en `package.json`) y npm. El lockfile fija las dependencias; usa npm para instalarlas.

```sh
npm ci
npm run dev
```

Vite inicia en `http://127.0.0.1:5173`. Sin sesión, las rutas administrativas redirigen a `/login`. Tras autenticarse, la entrada inicial es `/precios`. En desarrollo mock se permite recorrer fixtures sin identidad G7; los builds de producción exigen login también en modo mock. Para revisar las pantallas, navega por el menú o abre, por ejemplo, `/productos`, `/categorias`, `/precios/auditoria`, `/carga-masiva`, `/combos` o `/inventario`.

Comandos disponibles:

```sh
npm run typecheck
npm run lint
```

Instala primero Chromium para Playwright:

```sh
npx playwright install chromium
```

Después, ejecuta las validaciones:

```sh
npm test                  # pruebas unitarias de Combos, Carga masiva, Inventario y Precios con Vitest
npm run test:e2e          # suite completa de extremo a extremo con Playwright
npm run test:ci           # agregado local: unitarias + extremo a extremo + arnés HTTP simulado
npm run test:unit:combos  # solo unitarias de Combos
npm run test:unit:bulk    # solo unitarias de Bulk
npm run test:e2e:bulk:api # interfaz Bulk contra servidor HTTP aislado
npm run test:unit:pricing # adaptador HTTP de Pricing; transporte simulado
npm run test:e2e:pricing  # arnés HTTP de Precios a 1440 × 900; respuestas simuladas
```

Para construir y servir la versión compilada:

```powershell
$env:VITE_DATA_MODE = 'mock'
npm run build
npm run preview
```

`npm run preview` sirve `dist/` localmente; no publica ni despliega la aplicación. El flujo [Integración continua del frontend](.github/workflows/frontend.yml) separa clasificación de cambios, revisión de estilo, tipos, pruebas unitarias por módulo, compilaciones de demostración y API, verificaciones de compilación/vista previa, pruebas rápidas y cuatro fragmentos de extremo a extremo. `Validación integral de integración continua` es la única comprobación estable para proteger `master`; verifica los resultados y solo acepta pruebas E2E omitidas cuando el clasificador termina correctamente y todos los cambios son Markdown dentro de `docs/`. Si la clasificación falla, está vacía o incluye cualquier otro archivo, se ejecuta la suite completa.

Playwright conserva `fullyParallel: false` y `retries: 0`. En CI, la suite completa se distribuye en cuatro fragmentos con un trabajador por fragmento; localmente se usan dos trabajadores por defecto. Cada prueba usa su contexto aislado de navegador, los casos dentro de cada archivo se ejecutan en serie y el servidor Vite se comparte. La suite completa permanece obligatoria para cambios funcionales, pruebas, dependencias y configuración. Las pruebas rápidas se ejecutan también por separado para informar sus fallos con prontitud. No se invoca `test:ci` ni `test:e2e:pricing`. El arnés HTTP de Pricing se ejecuta por separado con respuestas simuladas, sin Gateway ni PostgreSQL real.

El flujo [Verificación de despliegues de Vercel](.github/workflows/verificacion-despliegue-vercel.yml) valida la identidad del deployment con la API autenticada, ejecuta un smoke limitado a la SPA mock y publica los contextos `Vercel - g6-productos-ofertas: verificacion-automatizada-production` y `verificacion-despliegue-produccion`. Estos dos contextos aún deben aparecer y configurarse como requeridos en Deployment Checks; el deployment activo consultado no tiene checks registrados. El workflow necesita estar en `master` para recibir `vercel.deployment.ready`. La integración nativa GitHub–Vercel conserva la publicación; no hay un segundo camino. El smoke no acredita Gateway ni integración G7. Que un flujo exista no implica CD protegido ni verificación real de producción.

## Configuración de datos

Catálogo/Variantes (#5/#6/#35) conecta sus adaptadores HTTP cuando `VITE_DATA_MODE=api`
y `VITE_GATEWAY_ORIGIN` contiene un origen válido. Las rutas administrativas requieren
la sesión general G7 y Catálogo envía su access token mediante un transporte
autenticado. La demo pública `/demo/g6/*` conserva su transporte aislado de lectura.
Gateway y Backend conservan sus guards y decisiones de autorización.
Sin URL, configuración inválida o error HTTP, Catálogo falla explícitamente, sin mocks.
El puerto `CatalogHttpTransport` permite conectar el cliente compartido de #45
posteriormente sin modificar los DTO ni implementar sesión en esta feature.

La integración es **parcial**: los GET comerciales no publican estado, versión ni
perfil administrativo para editar borradores; una respuesta comercial no se convierte
en ese modelo. La preparación usa su GET independiente. Taxonomía conserva como
pendientes los roles identificadores y límites no publicados. Un `202` solo confirma
admisión, y una escritura sin confirmación no se reintenta automáticamente.
Matriz por operación, pruebas simuladas y pendientes reales:
[integración Catálogo H4](docs/INTEGRACION_CATALOGO_H4.md).

`VITE_DATA_MODE` es el único selector de modo de datos (ver [.env.example](.env.example)). Se selecciona una vez y se distribuye mediante `DataModeContext`. En modo `api`, Promotions permite configurar juntas las URLs públicas `VITE_GATEWAY_ORIGIN` (solo origen) y `VITE_G7_API_BASE` (base publicada de Seguridad, por ejemplo `https://seguridad.example.org/api/v1`). No son credenciales. HTTPS es obligatorio fuera de loopback; no se configuran tokens ni secretos en Vite.

Si alguna URL de Promotions falta o es inválida, sus rutas muestran indisponibilidad explícita y los módulos independientes siguen arrancando. La integración HTTP solo se inicializa con ambas URLs válidas; en modo API nunca se habilitan mocks como fallback.

| Valor | Comportamiento |
|---|---|
| `mock` | Demostración con repositorios en memoria y fixtures. No requiere Backend, credenciales ni conexión de red. Las escrituras simuladas se conservan en `localStorage` de este navegador (ver «Persistencia de la demostración»). |
| `api` | Selecciona puertos API cuando hay providers configurados; sin ellos, cada módulo define su respuesta. Bulk y Combos se detallan debajo. |

**Bulk:** `VITE_DATA_MODE=mock` selecciona de forma explícita el repositorio de demostración. En `api`, `/carga-masiva` usa el adaptador HTTP del contrato OpenAPI 0.6.0-rc.2 cuando están configurados `VITE_GATEWAY_ORIGIN`, `VITE_G7_API_BASE` y una sesión G7 válida. Sin sesión se redirige a `/login`; con sesión pero sin Gateway, se informa que el provider no está disponible; las respuestas HTTP y los errores de red se muestran sin recurrir al mock. La integración del consumidor tiene pruebas unitarias y un arnés de interfaz contra un servidor HTTP aislado; el contrato marca las operaciones Bulk como `provisional-internal`, por lo que esas pruebas no acreditan disponibilidad ni homologación del backend. Se conectan plantilla, importación multipart, consulta de lote/filas/dominios, reporte y exportación según formato admitido. La reanudación HTTP requiere protocolo aprobado. Los modos de datos no comparten estado.

En desarrollo, la aplicación usa `mock` si la variable no está definida. Para `npm run build` se requiere definir `VITE_DATA_MODE` expresamente como `mock` o `api`; un valor ausente o inválido detiene el build. Copiar `.env.example` a `.env.local` configura `mock`. Vite carga las variables al arrancar: reinicia el servidor o vuelve a construir tras cambiarlas.

`api` no configura por sí solo una URL ni concede acceso. Con ambas URLs de integración, Promotions conecta su adaptador HTTP al cliente G7 de login/MFA/renovación/logout. Sin una base G7 válida, el login general informa indisponibilidad y bloquea el panel; sin Gateway válido, las integraciones afectadas permanecen cerradas. Tokens, identidad y desafío permanecen solo en memoria: recargar exige login. El consumidor AMQP no se habilita desde el frontend. La sesión se prueba con fixtures HTTP explícitos; el recorrido por Gateway/PostgreSQL usa además un entorno descartable independiente. Ninguna de esas pruebas acredita G7 compartido, homologación ni despliegue. Detalles en [integración Promotions](docs/INTEGRACION_PROMOTIONS_GATEWAY.md).

La demo interna de lectura G6 se habilita con `VITE_G6_READ_DEMO=true`, `VITE_DATA_MODE=api` y `VITE_GATEWAY_ORIGIN` explícito. Está aislada en `/demo/g6/productos`, `/demo/g6/productos/:id` y `/demo/g6/categorias`; las rutas administrativas conservan su router. Vercel no publica un proxy de `/api/v1/*`: el navegador consulta el origen configurado, sujeto a CORS y guards del Gateway. Pricing limita a tres las consultas simultáneas y cancela las pendientes al salir. Estado y reproducción: [correcciones de auditoría PR #40](docs/CORRECCIONES_PR40.md).

### Persistencia de la demostración

En modo `mock` y con un navegador real, las escrituras confirmadas de la demostración se guardan en `localStorage` bajo el prefijo `g6-productos-ofertas:mock:v1:<dominio>`, un registro por dominio (`catalog`, `taxonomy`, `pricing`, `price-audit`, `inventory`, `combos`, `promotions`, `bulk`). Al recargar, cada repositorio restaura su dominio **antes** de responder la primera consulta; si no hay estado válido, usa las fixtures. Un estado inválido o de versión incompatible se descarta en lugar de aplicarse.

Esta persistencia es **local a este navegador**: no sincroniza entre dispositivos y no sustituye a Backend. Las pestañas del mismo navegador se sincronizan mediante eventos `storage`: al escribir otra pestaña el dominio afectado, la pestaña receptora vuelve a hidratarlo y notifica a sus consumidores. Solo se guarda estado confirmado; banderas transitorias (carga, hover, modales, errores de UI) nunca se persisten. La persistencia queda deshabilitada en modo `api` y en ejecuciones de pruebas (Node/Vitest/Playwright), que mantienen su almacenamiento aislado en memoria. No hay todavía una acción de fábrica visible para borrar el estado guardado; `clearMockState(dominio)` existe para las acciones de reinicio de la demostración.

**Limitación de seguimiento en MK-010:** las operaciones pendientes de desasociación y desactivación de tipos de producto viven solo en memoria en el adapter mock. Al recargar se conservan el tipo, sus asociaciones y su versión confirmada, pero se pierde el `operationId` pendiente. El contrato disponible permite consultar el seguimiento por `operationId`, no listar operaciones, así que la demo debe reiniciar la solicitud. Una integración HTTP real deberá recuperar el seguimiento desde su backend.

## Funcionalidades y estado de datos

El [cierre H4](docs/h4/IMPLEMENTACION_FRONTEND_DEMO_ADMIN.md) describe el arranque con sesión G7 compartida. Consulta sus [dependencias de Backend](docs/h4/DEPENDENCIAS_BACKEND_PARA_DEMO.md) y la [matriz de verificación](docs/h4/MATRIZ_VERIFICACION_FRONTEND.md) antes de preparar la demo administrativa.

La tabla resume lo que muestran el código y la configuración de esta rama; la demostración no equivale a persistencia o API integrada.

| Área | Estado en el frontend |
|---|---|
| Productos y variantes/SKU | Mock explícito o adaptadores HTTP por Gateway configurado. Integración administrativa parcial por campos/lecturas contractuales ausentes; errores visibles y sin fallback. Pruebas reales de fase 1 pendientes. |
| Taxonomía (categorías, características, tipos, marcas y SEO) | Adapters HTTP de maestros, esquema, asociaciones, SEO y seguimiento asíncrono cuando Gateway y G7 están configurados. Las capacidades dependen del contrato y del grant. |
| Precios y programaciones/importación | El runtime API consulta objetivos de Catálogo e inyecta el repositorio HTTP. Las escrituras por canal requieren UUID autorizado. Importación pendiente para la demo. |
| Auditoría de precios | Repositorios separados para demostración y para listado, detalle y exportación HTTP. Las ediciones mock de Pricing siguen alimentando el historial simulado. |
| Cupones, promociones y recomendaciones | Flujos de demostración mock. En modo `api`, `CommercialModeGate` bloquea estas rutas si no reciben un proveedor explícito mediante `PromotionApiContext`. El adaptador HTTP administrativo está conectado al cliente G7 de sesión en memoria cuando se configuran ambas URLs; su recorrido por Gateway/PostgreSQL está probado en entorno descartable; los selectores disponen de adaptador HTTP tipado de Catálogo/Taxonomía. La homologación con G7 compartido, la prueba contra sus servicios reales y la verificación autoritativa de referencias del backend siguen pendientes. Ver [integración Promotions](docs/INTEGRACION_PROMOTIONS_GATEWAY.md). Las recomendaciones no calculan un precio final ni garantizan stock; ambos datos figuran como no disponibles en la demostración. |
| Carga masiva | Repositorio mock explícito o adapter HTTP autenticado para plantilla, importación, consulta, reporte y exportación. La reanudación HTTP requiere el protocolo aprobado. |
| Combos | El runtime API compone Catálogo y Pricing para el listado y las escrituras respaldadas por contrato. La disponibilidad no verificable conserva el estado desconocido. |
| Inventario (control de stock, umbrales, traslados y dashboard) | El adapter HTTP usa SKU comerciales activos para cobertura de stock. Dashboard, umbrales y traslados consumen sus operaciones publicadas. Alertas y catálogo físico quedan pendientes. |
| Foundation | Galería de componentes accesible solo en desarrollo; no es un flujo comercial. |

Los detalles, limitaciones y estados pendientes por feature están en [AUDITORIA_MK013.md](docs/AUDITORIA_MK013.md), [AUDITORIA_CATALOGO_MK003_MK004.md](docs/AUDITORIA_CATALOGO_MK003_MK004.md), [AVANCE_FRONTEND_CUEVA.md](docs/AVANCE_FRONTEND_CUEVA.md), [VALIDACION_MK014.md](docs/VALIDACION_MK014.md) y [CONTRATO_INVENTARIO_FRONTEND.md](docs/CONTRATO_INVENTARIO_FRONTEND.md). Consulta esos informes antes de inferir alcance de una operación o estado de integración.

La demo conjunta de Pricing y Auditoría comparte únicamente las ediciones confirmadas de importes regulares/ofertas: conserva SKU, producto, motivo, fecha del reloj de exposición y referencia de versión en el ID simulado. El actor `demo-pricing` es ficticio; no se infieren identidad, email o IP reales. Programaciones, importaciones y exportaciones mantienen sus demostraciones independientes; los archivos descargados son muestras estáticas. Catálogo y Combos comparten su catálogo, pero sus altas y referencias de precio no alimentan la selección del piloto Pricing. No se generan precios para SKUs nuevos ni se replica un cambio del piloto hacia Combos. Esta separación fue aceptada para #38; trazabilidad y validaciones en [AUDITORIA_VERA_38.md](docs/AUDITORIA_VERA_38.md).

## Gestión de combos (MK-002)

Implementa S01–S04 como vistas administrativas con puertos tipados y adapters en memoria sobre el catálogo compartido de MK-003/MK-004. Rutas: `/combos` (S01), `/combos/nuevo` (S02 crear), `/combos/:comboId/editar` (S02 editar), `/combos/:comboId` (S03) y `/combos/:comboId/no-disponible` (S04). Se pueden crear, consultar, editar y desactivar combos; los cambios se conservan en este navegador mientras no se reinicie la demostración (ver «Persistencia de la demostración»).

La elegibilidad de componentes, las reglas económicas y la disponibilidad informativa consultan las identidades del Catálogo compartido (no un catálogo paralelo). La disponibilidad se calcula como `min(floor(stockDisponibleSKU / cantidadRequeridaSKU))` sobre un snapshot inyectable; si los datos no permiten verificar, se muestra información incompleta o no verificable en lugar de un cero inventado. Los precios vigentes de referencia provienen del puerto de Pricing y se distinguen del precio comercial guardado.

El arranque H4 compone el repositorio HTTP cuando hay Gateway y sesión G7. Sin esa configuración, el modo API mantiene la integración cerrada. Las operaciones administrativas de Combos siguen marcadas como provisional-internal en OpenAPI 0.6.0-rc.3. El component spec de MK-002 permanece en revisión y la homologación externa sigue pendiente.

En la aplicación mock, Promociones y Recomendaciones consultan el mismo servicio
de Catálogo que Productos/Variantes mediante
`promotions/adapters/catalogPromotionRepository.ts`. Las ediciones, activaciones y
desactivaciones se reflejan al abrir sus selectores durante la misma sesión; el
guardado revalida productos y SKU activos. Los productos completos conservan su
ID y los SKU específicos su código. No se calcula stock ni se obtiene un precio
de referencia. Las reglas y campañas de muestra usan referencias explícitas al
catálogo inicial; la lectura no sustituye referencias ausentes por otros productos.
Los cupones consultan el nombre y la vigencia actuales de su promoción asociada,
conservando sus límites y usos.

`getPromotionRuntime("mock")` compone esta demostración integrada mediante
`createCatalogMockPromotionServices(getCatalogServices("mock"))`. La factory
`createMockPromotionServices` conserva la demostración aislada para pruebas con
puertos/fixtures inyectados. No existe fallback desde el catálogo integrado al
aislado ni desde API a mock. El [reporte de corrección #36](docs/CORRECCIONES_CUEVA_36.md)
registra reproducción, pruebas y revisiones aún pendientes para #7/#8/#9.

## Arquitectura

`src/` organiza la aplicación por capa y feature:

- `app/`: shell, navegación, configuración del modo de datos y registro de rutas comerciales y demos. `productRoutes.tsx` registra funcionalidades; `demoRoutes.tsx` solo se agrega en desarrollo.
- `features/<feature>/`: páginas, componentes, hooks, servicios/puertos, adapters mock y fixtures agrupados por área (`catalog`, `taxonomy`, `pricing`, `price-audit`, `promotions`, `bulk`, `combos`, `inventory`).
- `components/shared/`: patrones visuales reutilizables sin reglas de negocio ni conocimiento de endpoints.
- `theme/`: tema, tokens, defaults de componentes y estilos globales.

El flujo previsto es página → componentes/hooks → servicio o puerto → adapter. La composición usa el modo global e inyecta un adapter compatible en cada módulo. Las páginas no deben crear una selección paralela ni importar fixtures directamente. La capa visual no define endpoints, credenciales o DTO externos. Mantén las reglas y payloads alineados con las fuentes normativas y los contratos publicados por su owner.

Al añadir una funcionalidad, revisa primero [AGENTS.md](AGENTS.md), la guía de [implementación React](docs/GUIA_IMPLEMENTACION_FRONTEND_REACT.md) y la [guía de componentes Foundation](docs/COMPONENTES_FOUNDATION.md). Identifica las rutas y componentes existentes, reutiliza shell/theme, agrega rutas comerciales en `productRoutes.tsx` y navegación en `navigation.ts`; conserva las demos en `demoRoutes.tsx`. Para decisiones de negocio, UI o integración, consulta Docs antes de implementar.

## Desarrollo, validación y evidencias

La configuración de Playwright fija Chromium a `1440 × 900`. Los tests viven en `tests/`; los harnesses bajo `tests/harness/` permiten probar la sustitución de adapters con las mismas páginas. Ejecuta las validaciones localmente antes de proponer cambios:

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
```

Antes de compilar, define explícitamente el modo. En PowerShell:

```powershell
$env:VITE_DATA_MODE = 'mock'
npm run build
$env:VITE_DATA_MODE = 'api'
npm run build
```

En Bash:

```bash
VITE_DATA_MODE=mock npm run build
VITE_DATA_MODE=api npm run build
```

El flujo valida ambas compilaciones y revisa rutas seleccionadas en la vista previa; esa revisión no cubre todo el catálogo de módulos ni acredita que todos eviten mocks en modo `api`.

Los reportes técnicos y las capturas que corresponden a auditorías concretas están en [`docs/`](docs/). Entre ellos: [auditoría de Pricing](docs/AUDITORIA_MK013.md), [auditoría de Catálogo y variantes](docs/AUDITORIA_CATALOGO_MK003_MK004.md), [validación de auditoría de precios](docs/VALIDACION_MK014.md), [validación de Foundation](docs/VALIDACION_FOUNDATION.md), y [evidencias](docs/evidencias/). Son registros de sus respectivas revisiones; consulta fecha, alcance y commit documentados antes de aplicar sus resultados a otra revisión.

## Documentación relacionada

Despliegue nativo GitHub → Vercel: [configuración inicial, preparación, pruebas rápidas y operación](docs/DESPLIEGUE_VERCEL.md). El [registro de validación](docs/VALIDACION_VERCEL.md) distingue aprovisionamiento, permisos y comprobaciones pendientes de producción.

| Tipo | Fuente |
|---|---|
| Instrucciones del repositorio y agentes | [AGENTS.md](AGENTS.md) |
| Procedimiento de implementación | [GUIA_IMPLEMENTACION_FRONTEND_REACT.md](docs/GUIA_IMPLEMENTACION_FRONTEND_REACT.md) |
| Componentes y patrones existentes | [COMPONENTES_FOUNDATION.md](docs/COMPONENTES_FOUNDATION.md) |
| Auditorías y evidencia | [docs/](docs/) |
| Estado y límites de carga masiva | [ESTADO_CARGA_MASIVA.md](docs/ESTADO_CARGA_MASIVA.md) |
| Requisitos funcionales, UX/Design System, arquitectura y contratos | [Repositorio Docs](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-docs) — `requisitos/`, `ux/mockups/`, `arquitectura/` y `contratos/` |

Docs es la fuente para SPEC, HU, flujos, decisiones UX y contratos ejecutables. Backend es un repositorio independiente responsable de sus servicios. Antes de integrar, verifica el contrato vigente del provider y los acuerdos aplicables; la documentación o un adapter local no prueban homologación, despliegue o autorización.


## Login general y sesión compartida

`/login` vive fuera de `ApplicationShell`. `RequireSession` protege todo el árbol
administrativo antes de montar páginas o navegación. `AuthSessionContext` contiene
la única instancia `G7Session`; `PromotionSessionContext` es un alias del mismo
contexto para conservar compatibilidad. Promociones, Taxonomía, Bulk y el transporte
administrativo de Catálogo consumen esa instancia. Los providers todavía pendientes
no se convierten automáticamente en integraciones HTTP por disponer de login.

Configuración local con el provider G7 y Gateway autorizados (PowerShell):

```powershell
$env:VITE_DATA_MODE = 'api'
$env:VITE_G7_API_BASE = '<base publicada de G7, incluyendo su prefijo API>'
$env:VITE_GATEWAY_ORIGIN = '<origen publicado de Gateway>'
npm run dev
```

No hay credenciales de ejemplo para G7 real. Las bases deben ser HTTPS; HTTP solo
se admite en loopback. Sin una base G7 válida, el formulario informa que el servicio
no está configurado y el panel permanece bloqueado. Si Gateway no está configurado,
el login G7 puede funcionar, pero las integraciones que lo requieren siguen cerradas.
MFA pendiente no habilita administración. No se ofrecen registro ni recuperación
de contraseña. La identidad mostrada procede de G7; los permisos efectivos los
verifican Gateway y cada servicio, sin inferir grants por una ruta del navegador.

Access token, refresh token y desafío viven solo en memoria. Recargar exige login.
La renovación existente se comparte entre peticiones; el guard comprueba la
sesión al entrar y al vencer el acceso. Cambiar de sección conserva el shell
montado y no reinicia la validación de la misma sesión.
El logout del encabezado borra la sesión local aunque falle la red. Las respuestas
tardías no la restauran. Los GET contractuales pueden renovar una vez ante
`401 TOKEN_INVALIDO`. Si ese mismo código vuelve tras renovar, se invalida el
token rechazado. Un 401 desconocido o ilegible y un 403 conservan la sesión.
Las escrituras se envían una sola vez por intento.

Política de pruebas/demostración: `DEV` + modo global `mock` permite fixtures sin
crear un usuario G7. En `api` no hay bypass. En producción tampoco lo hay en modo
`mock`. `/demo/g6/*` conserva su excepción de lectura, con sus flags y contratos
previos, y no permite abrir el árbol administrativo.

Para verificar sin reutilizar un Vite que ya esté abierto:

```powershell
$env:VITE_DATA_MODE = 'mock'
$env:PLAYWRIGHT_PORT = '5185'
npm run typecheck
npm run lint
npm test
npm run test:e2e
```

`tests/auth-general.spec.ts` arranca un provider HTTP G7 de contrato en loopback;
el navegador ejecuta login/MFA/refresh/logout reales contra ese simulador. No es
G7 compartido ni homologación. Los tests de sesión/401/403 existentes permanecen.
El puerto de Playwright es configuración exclusiva de pruebas. En CI y al indicar
un puerto propio, la suite exige arrancar su servidor. Para el login solamente:

```powershell
npm run test:e2e -- tests/auth-general.spec.ts tests/promotions-session-ui.spec.ts tests/promotions-session.spec.ts --workers=1
```

Las verificaciones de preview (`scripts/verify-production.mjs` y
`scripts/vercel-smoke.mjs`) comprueban el fallo cerrado anónimo. No acreditan un
login operativo ni preparación para liberar. `npm run test:production:auth`
compila mock y API con un G7/Gateway contractual aislado: restaura las 58 vistas
funcionales y la escritura de Pricing del verificador original, y prueba login,
MFA, expiración, renovación, roles, 401/403, logout y separación de identidades.
Sus credenciales son fixtures; no es homologación real.

Para comprobar una configuración candidata existe `npm run verify:release:login`.
Requiere aprobaciones independientes `G6_RELEASE_APPROVED_PREVIEW_ORIGIN`,
`G6_RELEASE_APPROVED_G7_API_BASE`, `G6_RELEASE_APPROVED_GATEWAY_ORIGIN` y
`G6_RELEASE_APPROVED_GATEWAY_OPERATION=listarCupones`, además
de `G6_RELEASE_PREVIEW_URL`, `G6_RELEASE_TEST_EMAIL` y `G6_RELEASE_TEST_PASSWORD`
en el entorno de Node (nunca `VITE_*`). Exige HTTPS/origen exacto, comprueba las
bases efectivas antes de rellenar campos y bloquea redirecciones de documentos y
peticiones de autenticación. El CLI productivo no admite HTTP ni un flag de fixture.
Las sondas obligatorias aceptan G7 OPTIONS 200/204 y Gateway GET anónimo 401/403.
La sonda y la lectura autenticada usan la misma URL de Cupones, con
`pagina=1&tamanio=10`. La lectura debe devolver 200 con el Bearer de esa sesión.
El gate comprueba URL y contenido propios de Precios. Para el logout registra
el cierre local y el HTTP 204 de G7 por separado. La revocación efectiva
requiere evidencia del owner sin volver a enviar el refresh token.

Sin intervención manual falla si MFA queda pendiente. Para la aceptación real,
`npm run verify:release:login -- --mfa-manual` abre una ventana donde el operador
autorizado solicita e introduce el OTP real; no recibe OTP por argumentos o env.
No hace escrituras comerciales, no registra credenciales y no genera trazas.
Seguir el [procedimiento bilateral y acta de aceptación MFA](docs/ACEPTACION_BILATERAL_G7_MFA.md).
La aceptación externa de cada provider continúa siendo necesaria. Evidencia y límites reales en
[LOGIN_GENERAL.md](docs/LOGIN_GENERAL.md) y [auditoría](docs/AUDITORIA_LOGIN_PR70.md).
