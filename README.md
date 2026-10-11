# Productos y Ofertas — Frontend

React/TypeScript/Vite con Mantine y Tabler. **MK-013 / issue #15** extiende el piloto S01 con edición, programación, seguimiento de lotes e histórico navegables mediante adapters mock tipados. Estado: **MOCK_INTEGRATED / MOCK_ONLY**. S04 permite selección, política y revisión de respuestas ficticias; su parser y admisión permanecen **BLOCKED_CONTRACT: Q-013-01/02**. No hay integración HTTP ni escritura comercial real. Las muestras `/foundation/*` se conservan como galería independiente en desarrollo.

## Ejecutar y validar

Requisitos: Node **>=22.12.0** y npm. Las dependencias están fijadas en `package-lock.json`; el gestor único es npm.

```powershell
npm ci
npm run dev
```

Abrir `http://127.0.0.1:5173/precios`. Para validar:

```powershell
npm run typecheck
npm run build
npm run lint
npx playwright install chromium
npm test
```

La aplicación funciona sin Backend, Docs, credenciales ni variables de entorno. Inter/Oswald y el logo se sirven como assets locales. `npm run preview` permite revisar `dist/` después del build. Un hosting futuro deberá resolver las rutas hacia `index.html`; no se declara desplegada la app.

## Rutas y límites

| Ruta | Alcance |
|---|---|
| `/precios` | Piloto S01: selección producto/SKU, consulta local, herencia/override, fallback global y estados |
| `/precios/editar` | S02: lectura del objetivo/versionado, oferta, validación, confirmación y conflicto mock |
| `/precios/programaciones` | S03: listado paginado y creación mock futura con zona horaria explícita |
| `/precios/importar` | S04: selección/política y respuestas ficticias de prevalidación; confirmación bloqueada |
| `/precios/importaciones/batch-013-01` | S05: lote ficticio existente, estados, filas y reporte mock independiente del archivo elegido |
| `/precios/historico` | S06: consulta por SKU/canal e instante, independiente del precio vigente |
| `/foundation/listados` | Tabla, filtros, detalle, paginación y muestra opcional de tabla extensa |
| `/foundation/formularios` | Formulario y confirmación de demostración |
| `/foundation/estados` | Feedback y variantes semánticas |
| `/foundation/pricing` | Muestras de componentes S02–S05; no flujos comerciales completos |

`/` redirige a `/precios`; la ruta desconocida ofrece retorno. Los parámetros `target/channel` representan filtros **aplicados** de navegación, no un contrato HTTP. S06 conserva `at` como fecha/hora local de America/Bogota (UTC−5) y lo convierte a un instante explícito dentro del servicio mock. S02 usa `scope=product` para editar la base desde una variante; por defecto una variante propone su propio override. Las entradas de consulta se aplican al pulsar Consultar. Atrás/Adelante restaura el contexto aplicado. Una propuesta sin guardar en S02/S03, o un archivo seleccionado en S04, exige seguir trabajando o descartar explícitamente al navegar, incluso desde sidebar o historial.

Los importes del formulario se conservan como cadenas decimales, sin calcular descuentos o precios finales. Los cambios confirmados en S02 se reflejan en S01 durante la misma sesión; S03 no altera anticipadamente el precio actual. Recargar reinicia los fixtures. El reloj de validación de programación es fijo: `2026-10-02T12:00:00Z`, según component-spec. La lista usa páginas de 2 filas del mock; no representa un límite contractual.

Para revisar errores localmente, añadir `modoRevision=1` a una ruta de Pricing en desarrollo. Los selectores de escenarios están ocultos en producción. Ejemplo: `/precios/editar?target=variant40&channel=retail&modoRevision=1`. S04 nunca analiza los bytes seleccionados; «Simular respuesta de prevalidación» consulta un fixture independiente. El reporte de S05 también es ficticio y se descarga con ese nombre. Ver [trazabilidad, evidencia y límites de MK-013](docs/VALIDACION_MK013.md).

## Arquitectura para añadir features

```text
src/app/layout/          Shell común con Outlet, sin registrar páginas
src/app/navigation/      Navegación de aplicación y demostraciones
src/app/routes/          productRoutes/productPages y demoRoutes/demoPages separados
src/components/shared/   Patrones de presentación usados en pilotos/muestras
src/theme/               Tokens, defaults y variables CSS centrales
src/features/pricing/    Página → componentes/hook → puerto/service → adapter mock → fixtures
src/features/foundation/ Galería y casos de revisión de componentes
```

Registrar una feature en `productRoutes.tsx` y su navegación en `navigation.ts`, reutilizando shell y theme. Mantener las demos en `demoRoutes.tsx`. Los shared no conocen endpoints, credenciales, DTOs externos ni reglas autoritativas de negocio. La [guía de componentes](docs/COMPONENTES_FOUNDATION.md) contiene APIs y ejemplos; la [guía de implementación](docs/GUIA_IMPLEMENTACION_FRONTEND_REACT.md) contiene el procedimiento y gates.

## Documentación normativa de Docs

Fuente visual: **[DESIGN.md 1.1.0](https://github.com/Taller-SW-Web/Productos-y-Ofertas-docs/blob/be5c2db16aca6d6d18b3005a2da4205f724038e3/ux/mockups/DESIGN.md)** de Docs `master`, commit **`be5c2db16aca6d6d18b3005a2da4205f724038e3`**. La revisión FND-01 actualiza la referencia inicial 1.0.0 y registra las diferencias en el [reporte](docs/VALIDACION_FOUNDATION.md).

| Fuente | Ruta vigente dentro de Docs |
|---|---|
| Design System / UX / MK | `ux/mockups/DESIGN.md`, `ux/mockups/ux/`, `ux/mockups/MK-013/` |
| Requisitos | `requisitos/specs/`, `requisitos/hu/`, `requisitos/flujos/` |
| Wireframes | `ux/wireframes/flows/` (sin usar el DESIGN de baja fidelidad para el theme) |
| Contratos | `contratos/http/openapi.yaml`, `contratos/http/catalogo-errores.md`, `contratos/eventos/asyncapi.yaml` |
| Responsabilidades | `EQUIPO_Y_RESPONSABILIDADES.md` |

Frontend, Docs y Backend son repositorios independientes. Si Docs es la carpeta hermana `../docs`, se consulta allí; si el checkout local es anterior, se consulta la revisión oficial remota. No se copia Docs en Frontend ni se modifica desde esta tarea. Los archivos normativos están fijados por SHA para evitar atribuir una revisión distinta.

## Entrega, validación y revisión

Base entregada/auditada: **`ceee9d203581b28d6ff8148e951837ec6d000fec`**, rama `vera`, [PR #2](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/pull/2) contra `master`, vinculada al [issue #1](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/issues/1). El issue menciona `main`; la PR real usa la rama predeterminada `master`. No se cambia el destino por suposición.

Código corregido FND-01–06 y validado localmente: **`95722ff3d1cab2d7eb8356a6ee36b2e813b5aafe`**, pendiente de publicación en la PR. GitHub Actions registra el SHA de cada ejecución en `validation-commit.txt` y adjunta capturas/resultados; la fuente visual permanece fijada al SHA de Docs. Las validaciones locales y los límites se registran en [VALIDACION_FOUNDATION.md](docs/VALIDACION_FOUNDATION.md). La descripción preparada está en [PR_FOUNDATION.md](docs/PR_FOUNDATION.md); el conector devolvió 403 al intentar actualizarla.

El workflow `.github/workflows/frontend.yml` ejecuta instalación, typecheck, build, lint y la suite Playwright completa en Ubuntu/Node 22. Playwright valida Chromium a 1440×900 y genera evidencia en `docs/evidencias/`. Un workflow definido no acredita que ya haya corrido ni recibido aprobación.

Pendientes: revisión técnica/funcional independiente y visto bueno UX humano. Q-013-01/02 mantienen bloqueados el contenido de archivo y su admisión; el issue #15 no debe cerrarse con esos pendientes. Autenticación, permisos reales, APIs, persistencia comercial, mobile/tablet y evaluación WCAG exhaustiva quedan pendientes. La [descripción preparada para revisión de MK-013](docs/PR_MK013.md) usa `Refs #15`; no acredita una PR publicada.
