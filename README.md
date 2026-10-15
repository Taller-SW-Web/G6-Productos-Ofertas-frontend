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
npm test
```

`npm test` ejecuta Playwright. Para instalar su navegador en una máquina local:

```sh
npx playwright install chromium
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
| `api` | Selecciona puertos API cuando hay providers configurados. En las features sin provider implementado, la pantalla informa el bloqueo o el repositorio falla explícitamente; no cambia a mocks como respaldo. |

En desarrollo, la aplicación usa `mock` si la variable no está definida. Para `npm run build` se requiere definir `VITE_DATA_MODE` expresamente como `mock` o `api`; un valor ausente o inválido detiene el build. Copiar `.env.example` a `.env.local` configura `mock`. Vite carga las variables al arrancar: reinicia el servidor o vuelve a construir tras cambiarlas.

`api` no configura por sí solo una URL, autenticación ni servicios. En esta base no hay adapters HTTP de negocio conectados. Algunos módulos admiten inyectar implementaciones compatibles con sus puertos, lo que se prueba con dobles/harnesses; eso acredita sustituibilidad, no integración funcional con Backend.

## Funcionalidades y estado de datos

La tabla resume lo que muestran el código y la configuración de esta rama; la demostración no equivale a persistencia o API integrada.

| Área | Estado en el frontend |
|---|---|
| Productos y variantes/SKU | Pantallas y flujos de demostración mock. Los puertos permiten inyección; no hay provider HTTP configurado por defecto. |
| Taxonomía (categorías, características, tipos, marcas y SEO) | Pantallas disponibles en mock. En `api`, la integración se bloquea visiblemente mientras no exista un provider configurado. |
| Precios y programaciones/importación | Flujos de demostración mock. El modo `api` requiere un adapter; la implementación predeterminada falla explícitamente, sin fallback. Las operaciones de archivo no acreditan procesamiento comercial de Backend. |
| Auditoría de precios | Listado, detalle y exportación de demostración mock. El runtime permite inyección, pero no incluye provider API predeterminado. Los archivos disponibles son muestras. |
| Cupones, promociones y recomendaciones | Flujos de demostración mock. En modo `api` sus vistas quedan bloqueadas hasta configurar el provider; precio y disponibilidad de recomendaciones no están disponibles. |
| Carga masiva | Flujo de demostración mock. La revisión local de archivos no sustituye la validación comercial; XLSX y procesamiento/exportación reales requieren Backend. |
| Combos e inventario | No hay features frontend en esta rama. |
| Foundation | Galería de componentes accesible solo en desarrollo; no es un flujo comercial. |

Los detalles, limitaciones y estados pendientes por feature están en [AUDITORIA_MK013.md](docs/AUDITORIA_MK013.md), [AUDITORIA_CATALOGO_MK003_MK004.md](docs/AUDITORIA_CATALOGO_MK003_MK004.md), [AVANCE_FRONTEND_CUEVA.md](docs/AVANCE_FRONTEND_CUEVA.md) y [VALIDACION_MK014.md](docs/VALIDACION_MK014.md). Consulta esos informes antes de inferir alcance de una operación o estado de integración.

## Arquitectura

`src/` organiza la aplicación por capa y feature:

- `app/`: shell, navegación, configuración del modo de datos y registro de rutas comerciales y demos. `productRoutes.tsx` registra funcionalidades; `demoRoutes.tsx` solo se agrega en desarrollo.
- `features/<feature>/`: páginas, componentes, hooks, servicios/puertos, adapters mock y fixtures agrupados por área (`catalog`, `taxonomy`, `pricing`, `price-audit`, `promotions`, `bulk`).
- `components/shared/`: patrones visuales reutilizables sin reglas de negocio ni conocimiento de endpoints.
- `theme/`: tema, tokens, defaults de componentes y estilos globales.

El flujo habitual es página → componentes/hooks → servicio o puerto → adapter. El punto de composición selecciona el mock o recibe un adapter compatible. La selección usa el modo global; las páginas no deben crear una selección paralela ni importar fixtures directamente. La capa visual no define endpoints, credenciales o DTO externos. Mantén las reglas y payloads alineados con las fuentes normativas y los contratos publicados por su owner.

Al añadir una funcionalidad, revisa primero [AGENTS.md](AGENTS.md), la guía de [implementación React](docs/GUIA_IMPLEMENTACION_FRONTEND_REACT.md) y la [guía de componentes Foundation](docs/COMPONENTES_FOUNDATION.md). Identifica las rutas y componentes existentes, reutiliza shell/theme, agrega rutas comerciales en `productRoutes.tsx` y navegación en `navigation.ts`; conserva las demos en `demoRoutes.tsx`. Para decisiones de negocio, UI o integración, consulta Docs antes de implementar.

## Desarrollo, validación y evidencias

La configuración de Playwright fija Chromium a `1440 × 900`. Los tests viven en `tests/`; los harnesses bajo `tests/harness/` permiten probar la sustitución de adapters con las mismas páginas. Ejecuta las validaciones localmente antes de proponer cambios:

```sh
npm run typecheck
npm run lint
npm test
```

Para validar ambos builds de forma local, establece `VITE_DATA_MODE=mock` y luego `VITE_DATA_MODE=api` antes de cada `npm run build`. La verificación de preview en CI comprueba que API no use datos mock como fallback. Estas comprobaciones no convierten los adapters sustituibles en una integración HTTP real.

Los reportes técnicos y las capturas que corresponden a auditorías concretas están en [`docs/`](docs/). Entre ellos: [auditoría de Pricing](docs/AUDITORIA_MK013.md), [auditoría de Catálogo y variantes](docs/AUDITORIA_CATALOGO_MK003_MK004.md), [validación de auditoría de precios](docs/VALIDACION_MK014.md), [validación de Foundation](docs/VALIDACION_FOUNDATION.md), y [evidencias](docs/evidencias/). Son registros de sus respectivas revisiones; consulta fecha, alcance y commit documentados antes de aplicar sus resultados a otra revisión.

## Documentación relacionada

| Tipo | Fuente |
|---|---|
| Instrucciones del repositorio y agentes | [AGENTS.md](AGENTS.md) |
| Procedimiento de implementación | [GUIA_IMPLEMENTACION_FRONTEND_REACT.md](docs/GUIA_IMPLEMENTACION_FRONTEND_REACT.md) |
| Componentes y patrones existentes | [COMPONENTES_FOUNDATION.md](docs/COMPONENTES_FOUNDATION.md) |
| Auditorías y evidencia | [docs/](docs/) |
| Requisitos funcionales, UX/Design System, arquitectura y contratos | [Repositorio Docs](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-docs) — `requisitos/`, `ux/mockups/`, `arquitectura/` y `contratos/` |

Docs es la fuente para SPEC, HU, flujos, decisiones UX y contratos ejecutables. Backend es un repositorio independiente responsable de sus servicios. Antes de integrar, verifica el contrato vigente del provider y los acuerdos aplicables; la documentación o un adapter local no prueban homologación, despliegue o autorización.
