# Productos y Ofertas — Frontend

Aplicación web de administración para el módulo Productos y Ofertas. Permite recorrer flujos de catálogo, taxonomía, precios, auditoría de precios, promociones, cupones, recomendaciones, carga masiva, gestión de combos e inventario en modo de demostración. Usa React 19, TypeScript 6, Vite 8, Mantine 9 y Tabler Icons; este repositorio es independiente de [Docs](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-docs) y Backend. La presencia de puertos y adapters sustituibles facilita una futura integración, pero no acredita conexión HTTP con servicios reales.

## Inicio rápido

Requisitos: Node.js `>=22.12.0` (definido en `package.json`) y npm. El lockfile fija las dependencias; usa npm para instalarlas.

```sh
npm ci
npm run dev
```

Vite inicia en `http://127.0.0.1:5173`. La ruta inicial redirige a `/precios`. Para revisar las pantallas, navega por el menú o abre, por ejemplo, `/productos`, `/categorias`, `/precios/auditoria`, `/carga-masiva`, `/combos` o `/inventario`.

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
npm test                  # pruebas unitarias de Combos, Bulk y Pricing con Vitest
npm run test:e2e          # suite E2E completa de Playwright
npm run test:ci           # unitarias + E2E + harness HTTP de Pricing, usado por CI
npm run test:unit:combos  # solo unitarias de Combos
npm run test:unit:bulk    # solo unitarias de Bulk
npm run test:unit:pricing # adaptador HTTP de Pricing; transporte simulado
npm run test:e2e:pricing  # harness HTTP de Pricing a 1440 × 900; respuestas simuladas
```

Para construir y servir la versión compilada:

```powershell
$env:VITE_DATA_MODE = 'mock'
npm run build
npm run preview
```

`npm run preview` sirve `dist/` localmente; no publica ni despliega la aplicación. El workflow [frontend.yml](.github/workflows/frontend.yml) ejecuta typecheck, build, lint, pruebas y verificaciones de build/preview para ambos modos. Que el workflow exista no implica que haya corrido para un cambio concreto.

## Configuración de datos

La única variable de entorno de la aplicación es `VITE_DATA_MODE` (ver [.env.example](.env.example)). Selecciona una vez el modo de datos global y se distribuye mediante `DataModeContext`.

| Valor | Comportamiento |
|---|---|
| `mock` | Demostración con repositorios en memoria y fixtures. No requiere Backend, credenciales ni conexión de red. Las escrituras simuladas se pierden al recargar. |
| `api` | Selecciona puertos API cuando hay providers configurados; sin ellos, cada módulo define su respuesta. Bulk y Combos se detallan debajo. |

**Excepción en Bulk:** `bulkService.ts` usa `mockBulkRepository` directamente, incluso cuando `VITE_DATA_MODE=api`; `/carga-masiva` no está entre las rutas que `CommercialModeGate` bloquea o trata según el modo. Por tanto, ese flujo sigue siendo una simulación en ambos modos. Es una discrepancia funcional que requiere corrección independiente; este cambio solo la documenta.

En desarrollo, la aplicación usa `mock` si la variable no está definida. Para `npm run build` se requiere definir `VITE_DATA_MODE` expresamente como `mock` o `api`; un valor ausente o inválido detiene el build. Copiar `.env.example` a `.env.local` configura `mock`. Vite carga las variables al arrancar: reinicia el servidor o vuelve a construir tras cambiarlas.

`api` no configura por sí solo una URL, autenticación ni servicios. En esta base no hay adapters HTTP de negocio conectados. Algunos módulos admiten inyectar implementaciones compatibles con sus puertos, lo que se prueba con dobles/harnesses; eso acredita sustituibilidad, no integración funcional con Backend.

## Funcionalidades y estado de datos

La tabla resume lo que muestran el código y la configuración de esta rama; la demostración no equivale a persistencia o API integrada.

| Área | Estado en el frontend |
|---|---|
| Productos y variantes/SKU | Pantallas y flujos de demostración mock. Los puertos permiten inyección; no hay provider HTTP configurado por defecto. |
| Taxonomía (categorías, características, tipos, marcas y SEO) | Pantallas disponibles en mock. En `api`, `TaxonomyModeGate` bloquea estas rutas independientemente de los providers. Habilitar la integración requiere configurar los servicios/adapters y adaptar el gate; inyectar un provider por sí solo no desbloquea las pantallas. |
| Precios y programaciones/importación | Flujos de demostración mock. El modo `api` requiere un adapter; la implementación predeterminada falla explícitamente, sin fallback. Las operaciones de archivo no acreditan procesamiento comercial de Backend. |
| Auditoría de precios | Listado, detalle y exportación de demostración mock. Las ediciones confirmadas de Pricing incorporan asientos simulados durante la sesión; recargar los elimina. El runtime permite inyección, pero no incluye provider API predeterminado. Los archivos disponibles son muestras. |
| Cupones, promociones y recomendaciones | Flujos de demostración mock. En modo `api`, `CommercialModeGate` bloquea estas rutas incondicionalmente. Una integración futura requiere configurar el provider y adaptar el gate; inyectar el provider por sí solo no desbloquea la interfaz. Las recomendaciones no calculan un precio final ni garantizan stock; ambos datos figuran como no disponibles en la demostración. |
| Carga masiva | Simulación mock tanto en `mock` como en `api` por la excepción descrita arriba. La revisión local de archivos no sustituye la validación comercial; XLSX y procesamiento/exportación reales requieren Backend. Ver [límites de carga masiva](docs/ESTADO_CARGA_MASIVA.md). |
| Combos | Gestión de combos (MK-002) con puertos tipados y adapters mock; la disponibilidad es información de catálogo compartido, sin consultar ni reservar stock real. En `api` sin provider la integración se muestra cerrada, sin fallback a fixtures. |
| Inventario (control de stock, umbrales, traslados y dashboard) | Flujos de demostración mock (`MK-015` y `MK-016`). En modo `api`, `CommercialModeGate` bloquea las rutas de `/inventario` y `ApiPendingRepository` rechaza operaciones sin fallback a mocks. Soporta inyección de repositorio alternativo (`tests/harness/inventory-adapter.html`). Ver [contrato de inventario](docs/CONTRATO_INVENTARIO_FRONTEND.md). |
| Foundation | Galería de componentes accesible solo en desarrollo; no es un flujo comercial. |

Los detalles, limitaciones y estados pendientes por feature están en [AUDITORIA_MK013.md](docs/AUDITORIA_MK013.md), [AUDITORIA_CATALOGO_MK003_MK004.md](docs/AUDITORIA_CATALOGO_MK003_MK004.md), [AVANCE_FRONTEND_CUEVA.md](docs/AVANCE_FRONTEND_CUEVA.md), [VALIDACION_MK014.md](docs/VALIDACION_MK014.md) y [CONTRATO_INVENTARIO_FRONTEND.md](docs/CONTRATO_INVENTARIO_FRONTEND.md). Consulta esos informes antes de inferir alcance de una operación o estado de integración.

La demo conjunta de Pricing y Auditoría comparte únicamente las ediciones confirmadas de importes regulares/ofertas: conserva SKU, producto, motivo, fecha del reloj de exposición y referencia de versión en el ID simulado. El actor `demo-pricing` es ficticio; no se infieren identidad, email o IP reales. Programaciones, importaciones y exportaciones mantienen sus demostraciones independientes; los archivos descargados son muestras estáticas. Catálogo y Combos comparten su catálogo, pero sus altas y referencias de precio no alimentan la selección del piloto Pricing. No se generan precios para SKUs nuevos ni se replica un cambio del piloto hacia Combos. Esta separación fue aceptada para #38; trazabilidad y validaciones en [AUDITORIA_VERA_38.md](docs/AUDITORIA_VERA_38.md).

## Gestión de combos (MK-002)

Implementa S01–S04 como vistas administrativas con puertos tipados y adapters en memoria sobre el catálogo compartido de MK-003/MK-004. Rutas: `/combos` (S01), `/combos/nuevo` (S02 crear), `/combos/:comboId/editar` (S02 editar), `/combos/:comboId` (S03) y `/combos/:comboId/no-disponible` (S04). Se pueden crear, consultar, editar y desactivar combos en la sesión; recargar reinicia los cambios.

La elegibilidad de componentes, las reglas económicas y la disponibilidad informativa consultan las identidades del Catálogo compartido (no un catálogo paralelo). La disponibilidad se calcula como `min(floor(stockDisponibleSKU / cantidadRequeridaSKU))` sobre un snapshot inyectable; si los datos no permiten verificar, se muestra información incompleta o no verificable en lugar de un cero inventado. Los precios vigentes de referencia provienen del puerto de Pricing y se distinguen del precio comercial guardado.

No hay provider HTTP real ni persistencia comercial. En modo `api`, la integración permanece cerrada y no cae a fixtures. La referencia consultada es OpenAPI `0.6.0-rc.1`: las operaciones administrativas de Combos están marcadas `provisional-internal`; `combos:leer`, `catalogo:leer` y `precios:leer` siguen pendientes de registro de scopes. El component spec de MK-002 permanece **En revisión**: esta entrega no declara aprobación UX, homologación ni integración API.

## Arquitectura

`src/` organiza la aplicación por capa y feature:

- `app/`: shell, navegación, configuración del modo de datos y registro de rutas comerciales y demos. `productRoutes.tsx` registra funcionalidades; `demoRoutes.tsx` solo se agrega en desarrollo.
- `features/<feature>/`: páginas, componentes, hooks, servicios/puertos, adapters mock y fixtures agrupados por área (`catalog`, `taxonomy`, `pricing`, `price-audit`, `promotions`, `bulk`, `combos`, `inventory`).
- `components/shared/`: patrones visuales reutilizables sin reglas de negocio ni conocimiento de endpoints.
- `theme/`: tema, tokens, defaults de componentes y estilos globales.

El flujo previsto es página → componentes/hooks → servicio o puerto → adapter. En las features con composición configurada, esta usa el modo global o recibe un adapter compatible; Bulk es una excepción actual: no consulta ese selector y exporta el mock directamente ([detalle](docs/ESTADO_CARGA_MASIVA.md)). Las páginas no deben crear una selección paralela ni importar fixtures directamente. La capa visual no define endpoints, credenciales o DTO externos. Mantén las reglas y payloads alineados con las fuentes normativas y los contratos publicados por su owner.

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

El workflow valida ambos builds y revisa en preview rutas seleccionadas; esa revisión no cubre todo el catálogo de módulos ni acredita que todos eviten mocks en modo `api`.

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
