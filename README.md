# Productos y Ofertas — Frontend

Aplicación web de administración para el módulo Productos y Ofertas. Permite recorrer flujos de catálogo, taxonomía, precios, auditoría de precios, promociones, cupones, recomendaciones y carga masiva en modo de demostración. Usa React 19, TypeScript 6, Vite 8, Mantine 9 y Tabler Icons; este repositorio es independiente de [Docs](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-docs) y Backend. La presencia de puertos y adapters sustituibles facilita una futura integración, pero no acredita conexión HTTP con servicios reales.

## Inicio rápido

Requisitos: Node.js `>=22.12.0` (definido en `package.json`) y npm. El lockfile fija las dependencias; usa npm para instalarlas.

```sh
npm ci
npm run dev
```

Vite inicia en `http://127.0.0.1:5173`. La ruta inicial redirige a `/precios`. Para revisar las pantallas, navega por el menú o abre, por ejemplo, `/productos`, `/categorias`, `/precios/auditoria` o `/carga-masiva`.

Comandos disponibles:

```sh
npm run typecheck
npm run lint
```

Instala primero Chromium para Playwright:

```sh
npx playwright install chromium
```

Después, ejecuta la suite automatizada:

```sh
npm test
```

Para construir y servir la versión compilada:

```powershell
$env:VITE_DATA_MODE = 'mock'
npm run build
npm run preview
```

`npm run preview` sirve `dist/` localmente; no publica ni despliega la aplicación. El workflow [frontend.yml](.github/workflows/frontend.yml) ejecuta typecheck, build, lint, pruebas y verificaciones de build/preview para ambos modos. Que el workflow exista no implica que haya corrido para un cambio concreto.

## Configuración de datos

`VITE_DATA_MODE` es el único selector de modo de datos (ver [.env.example](.env.example)). Se selecciona una vez y se distribuye mediante `DataModeContext`. En modo `api`, Promotions permite configurar juntas las URLs públicas `VITE_GATEWAY_ORIGIN` (solo origen) y `VITE_G7_API_BASE` (base publicada de Seguridad, por ejemplo `https://seguridad.example.org/api/v1`). No son credenciales. HTTPS es obligatorio fuera de loopback; no se configuran tokens ni secretos en Vite.

| Valor | Comportamiento |
|---|---|
| `mock` | Demostración con repositorios en memoria y fixtures. No requiere Backend, credenciales ni conexión de red. Las escrituras simuladas se pierden al recargar. |
| `api` | Selecciona puertos API cuando hay providers configurados; sin ellos, cada módulo define su respuesta. La excepción de Bulk, que usa mocks directamente, se detalla debajo. |

**Excepción en Bulk:** `bulkService.ts` usa `mockBulkRepository` directamente, incluso cuando `VITE_DATA_MODE=api`; `/carga-masiva` no está entre las rutas que `CommercialModeGate` bloquea o trata según el modo. Por tanto, ese flujo sigue siendo una simulación en ambos modos. Es una discrepancia funcional que requiere corrección independiente; este cambio solo la documenta.

En desarrollo, la aplicación usa `mock` si la variable no está definida. Para `npm run build` se requiere definir `VITE_DATA_MODE` expresamente como `mock` o `api`; un valor ausente o inválido detiene el build. Copiar `.env.example` a `.env.local` configura `mock`. Vite carga las variables al arrancar: reinicia el servidor o vuelve a construir tras cambiarlas.

`api` no configura por sí solo una URL ni concede acceso. Con ambas URLs de integración, Promotions conecta su adaptador HTTP al cliente G7 de login/MFA/renovación/logout. Sin URLs conserva el bloqueo visible; una configuración incompleta falla al iniciar. Tokens, identidad y desafío permanecen solo en memoria: recargar exige login. El consumidor AMQP no se habilita desde el frontend. La sesión se prueba con fixtures HTTP explícitos; el recorrido por Gateway/PostgreSQL usa además un entorno descartable independiente. Ninguna de esas pruebas acredita G7 compartido, homologación ni despliegue. Detalles en [integración Promotions](docs/INTEGRACION_PROMOTIONS_GATEWAY.md).

## Funcionalidades y estado de datos

La tabla resume lo que muestran el código y la configuración de esta rama; la demostración no equivale a persistencia o API integrada.

| Área | Estado en el frontend |
|---|---|
| Productos y variantes/SKU | Pantallas y flujos de demostración mock. Los puertos permiten inyección; no hay provider HTTP configurado por defecto. |
| Taxonomía (categorías, características, tipos, marcas y SEO) | Pantallas disponibles en mock. En `api`, `TaxonomyModeGate` bloquea estas rutas independientemente de los providers. Habilitar la integración requiere configurar los servicios/adapters y adaptar el gate; inyectar un provider por sí solo no desbloquea las pantallas. |
| Precios y programaciones/importación | Flujos de demostración mock. El modo `api` requiere un adapter; la implementación predeterminada falla explícitamente, sin fallback. Las operaciones de archivo no acreditan procesamiento comercial de Backend. |
| Auditoría de precios | Listado, detalle y exportación de demostración mock. El runtime permite inyección, pero no incluye provider API predeterminado. Los archivos disponibles son muestras. |
| Cupones, promociones y recomendaciones | Flujos de demostración mock. En modo `api`, `CommercialModeGate` bloquea estas rutas si no reciben un proveedor explícito mediante `PromotionApiContext`. El adaptador HTTP administrativo está conectado al cliente G7 de sesión en memoria cuando se configuran ambas URLs; su recorrido por Gateway/PostgreSQL está probado en entorno descartable; los selectores disponen de adaptador HTTP tipado de Catálogo/Taxonomía. La sesión G7 compartida, la prueba contra sus servicios reales y la verificación autoritativa de referencias del backend siguen pendientes. Ver [integración Promotions](docs/INTEGRACION_PROMOTIONS_GATEWAY.md). Las recomendaciones no calculan un precio final ni garantizan stock; ambos datos figuran como no disponibles en la demostración. |
| Carga masiva | Simulación mock tanto en `mock` como en `api` por la excepción descrita arriba. La revisión local de archivos no sustituye la validación comercial; XLSX y procesamiento/exportación reales requieren Backend. Ver [límites de carga masiva](docs/ESTADO_CARGA_MASIVA.md). |
| Combos e inventario | No hay features frontend en esta rama. |
| Foundation | Galería de componentes accesible solo en desarrollo; no es un flujo comercial. |

Los detalles, limitaciones y estados pendientes por feature están en [AUDITORIA_MK013.md](docs/AUDITORIA_MK013.md), [AUDITORIA_CATALOGO_MK003_MK004.md](docs/AUDITORIA_CATALOGO_MK003_MK004.md), [AVANCE_FRONTEND_CUEVA.md](docs/AVANCE_FRONTEND_CUEVA.md) y [VALIDACION_MK014.md](docs/VALIDACION_MK014.md). Consulta esos informes antes de inferir alcance de una operación o estado de integración.

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
- `features/<feature>/`: páginas, componentes, hooks, servicios/puertos, adapters mock y fixtures agrupados por área (`catalog`, `taxonomy`, `pricing`, `price-audit`, `promotions`, `bulk`).
- `components/shared/`: patrones visuales reutilizables sin reglas de negocio ni conocimiento de endpoints.
- `theme/`: tema, tokens, defaults de componentes y estilos globales.

El flujo previsto es página → componentes/hooks → servicio o puerto → adapter. En las features con composición configurada, esta usa el modo global o recibe un adapter compatible; Bulk es una excepción actual: no consulta ese selector y exporta el mock directamente ([detalle](docs/ESTADO_CARGA_MASIVA.md)). Las páginas no deben crear una selección paralela ni importar fixtures directamente. La capa visual no define endpoints, credenciales o DTO externos. Mantén las reglas y payloads alineados con las fuentes normativas y los contratos publicados por su owner.

Al añadir una funcionalidad, revisa primero [AGENTS.md](AGENTS.md), la guía de [implementación React](docs/GUIA_IMPLEMENTACION_FRONTEND_REACT.md) y la [guía de componentes Foundation](docs/COMPONENTES_FOUNDATION.md). Identifica las rutas y componentes existentes, reutiliza shell/theme, agrega rutas comerciales en `productRoutes.tsx` y navegación en `navigation.ts`; conserva las demos en `demoRoutes.tsx`. Para decisiones de negocio, UI o integración, consulta Docs antes de implementar.

## Desarrollo, validación y evidencias

La configuración de Playwright fija Chromium a `1440 × 900`. Los tests viven en `tests/`; los harnesses bajo `tests/harness/` permiten probar la sustitución de adapters con las mismas páginas. Ejecuta las validaciones localmente antes de proponer cambios:

```sh
npm run typecheck
npm run lint
npx playwright install chromium
npm test
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

El workflow valida ambos builds y revisa en preview rutas seleccionadas; esa revisión no cubre Bulk ni acredita que todos los módulos eviten mocks en modo `api`.

Los reportes técnicos y las capturas que corresponden a auditorías concretas están en [`docs/`](docs/). Entre ellos: [auditoría de Pricing](docs/AUDITORIA_MK013.md), [auditoría de Catálogo y variantes](docs/AUDITORIA_CATALOGO_MK003_MK004.md), [validación de auditoría de precios](docs/VALIDACION_MK014.md), [validación de Foundation](docs/VALIDACION_FOUNDATION.md), y [evidencias](docs/evidencias/). Son registros de sus respectivas revisiones; consulta fecha, alcance y commit documentados antes de aplicar sus resultados a otra revisión.

## Documentación relacionada

Despliegue nativo GitHub → Vercel: [configuración inicial, bootstrap, smoke y operación](docs/DESPLIEGUE_VERCEL.md). El [registro de validación](docs/VALIDACION_VERCEL.md) distingue aprovisionamiento, permisos y comprobaciones pendientes de producción.

| Tipo | Fuente |
|---|---|
| Instrucciones del repositorio y agentes | [AGENTS.md](AGENTS.md) |
| Procedimiento de implementación | [GUIA_IMPLEMENTACION_FRONTEND_REACT.md](docs/GUIA_IMPLEMENTACION_FRONTEND_REACT.md) |
| Componentes y patrones existentes | [COMPONENTES_FOUNDATION.md](docs/COMPONENTES_FOUNDATION.md) |
| Auditorías y evidencia | [docs/](docs/) |
| Estado y límites de carga masiva | [ESTADO_CARGA_MASIVA.md](docs/ESTADO_CARGA_MASIVA.md) |
| Requisitos funcionales, UX/Design System, arquitectura y contratos | [Repositorio Docs](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-docs) — `requisitos/`, `ux/mockups/`, `arquitectura/` y `contratos/` |

Docs es la fuente para SPEC, HU, flujos, decisiones UX y contratos ejecutables. Backend es un repositorio independiente responsable de sus servicios. Antes de integrar, verifica el contrato vigente del provider y los acuerdos aplicables; la documentación o un adapter local no prueban homologación, despliegue o autorización.
