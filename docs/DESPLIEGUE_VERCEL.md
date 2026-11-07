# Despliegue del frontend G6 en Vercel

Alcance operativo: **IMPLEMENTAR_AHORA** para hosting y lógica interna de bootstrap;
**BLOQUEADO_ESPECÍFICO** para los controles externos de GitHub/Vercel hasta que
se configuren y validen. Los cambios de esta rama no activan un despliegue de
Production; la publicación de la aplicación sigue la integración Git nativa y
requiere merge autorizado. El estado histórico del 2026-10-16 está en
[el registro](VALIDACION_VERCEL.md); no acredita APIs reales ni homologación externa.

## Flujo y configuración

```mermaid
flowchart LR
    PR["Solicitud de incorporación"] --> CI["Integración continua del frontend"]
    CI -->|"Validación integral de integración continua aprobada"| MERGE["Revisión y fusión autorizada a master"]
    MERGE --> BUILD["Integración Git nativa de Vercel: compilación de Production"]
    BUILD --> PRE["Verificación previa: versión autenticada y prueba rápida en URL inmutable"]
    PRE -->|"verificacion-despliegue-produccion aprobado"| ALIAS["Asignación automática del dominio por Vercel"]
    ALIAS --> POST["Verificación posterior del dominio y registro de evidencia"]
    POST --> ROLLBACK["Reversión manual autorizada si hace falta"]
```

La integración nativa de GitHub/Vercel conserva la responsabilidad de crear y
publicar despliegues. No hay un segundo flujo que ejecute `vercel deploy`.
La compilación de Production se crea primero; Deployment Checks (controles de
despliegue de Vercel) retiene la asignación del dominio hasta que sus controles
requeridos estén aprobados. La prueba posterior contra el dominio público,
ejecutada después de publicarse, **no detiene**
esa publicación. La barrera previa real es Deployment Checks habilitado en Vercel.

Los flujos visibles son `Integración continua del frontend` y
`Verificación de despliegues de Vercel`. La CI presenta trabajos separados de
estilo, tipos, pruebas unitarias por módulo, compilaciones y verificaciones
Playwright; el agregador obligatorio se llama
`Validación integral de integración continua`.

| Ajuste | Valor |
|---|---|
| Repositorio | `Taller-SW-Web/G6-Productos-Ofertas-frontend` |
| Proyecto | `g6-productos-ofertas` (encontrado en la inspección de solo lectura) |
| Framework / raíz | Vite / raíz (`rootDirectory: null` en API) |
| Node | 22.x, mínimo 22.12; `.nvmrc` y `engines` evitan selección automática de una major superior |
| Instalación / build / salida | `npm ci` / `npm run build` / `dist` |
| Rama de Production | `master` |
| Variable Production | `VITE_DATA_MODE=mock` |
| Despliegues de previsualización | Deshabilitados también a nivel proyecto |
| Protección GitHub | `Validación integral de integración continua` (pendiente de exigir en `master`) |
| Estado de Vercel | `verificacion-despliegue-produccion` (pendiente de habilitar como control de despliegue) |

[`vercel.json`](../vercel.json) conserva `createBrowserRouter` mediante rewrite SPA
a `/index.html`; los archivos estáticos existentes se sirven antes del fallback.
`git.deploymentEnabled` usa `**: false` y `master: true`. Vercel habilita por defecto
las ramas sin coincidencia; si varias reglas coinciden, basta una `true`.
`**` cubre también nombres con `/`. Por eso los pushes de sincronización a
`castilla`, `poma`, `cueva`, `lopez`, `vera` y `taco` no despliegan una vez que esas
ramas contienen esta configuración. Además, el bootstrap fija
`previewDeploymentsDisabled: true` en el proyecto para cubrir ramas antiguas sin
`vercel.json`. El flujo de sincronización conserva su comportamiento; solo se
tradujeron los nombres visibles del panel.

## Bootstrap reproducible

Usar Node 22 >=22.12, npm y Git. La CLI se obtiene con npm exec sin incorporarla
como dependencia del frontend; no cambiar la política global de PowerShell.
En PowerShell puede usarse `npm.cmd` en lugar de `npm`.

```sh
npm exec --yes --package=vercel@64.3.1 -- vercel whoami
# Solo si falta sesión:
npm exec --yes --package=vercel@64.3.1 -- vercel login

npm exec --yes --package=vercel@64.3.1 -- node scripts/vercel-bootstrap.mjs --inspect
npm exec --yes --package=vercel@64.3.1 -- node scripts/vercel-bootstrap.mjs --apply
```

[`vercel-bootstrap.mjs`](../scripts/vercel-bootstrap.mjs) inspecciona todos los
equipos accesibles y pagina los proyectos antes de crear. Reutiliza la asociación
GitHub o el nombre existente; bloquea asociaciones ajenas, duplicados, enlaces
locales incompatibles y equipos ambiguos. En ese caso repetir con `--team slug`.
Detecta el ejecutable de la CLI en PATH; una instalación personalizada admite
`VERCEL_CLI_PATH` apuntando a `vercel/dist/index.js` (ruta, nunca token).

`--inspect` es solo lectura remota/local; no crea `.vercel/`, variables ni enlaces.
`--apply` crea el proyecto si falta, actualiza solo los ajustes previstos, conserva
una variable correcta y crea/actualiza únicamente Production. Si un registro
incorrecto comparte ámbitos, bloquea esa actualización para preservar sus valores.
Usa la sesión autenticada de la CLI y `vercel api`; no lee ni registra credenciales.
No despliega, hace commits, pushes o merges, desde ninguna rama. `.vercel/` se ignora.
Salida 0: configuración verificada; 2: pendientes; 1: error/prerrequisito/bloqueo.

Node se fija mediante PATCH porque el endpoint de creación no acepta `nodeVersion`.
La rama de Production se verifica tras conectar: si no es `master`, ajustar en
Proyecto → Configuración → Entornos → Production y repetir la inspección. La API
pública consultada no ofrece ese campo como escritura de proyecto; no se usa una
ruta privada inferida.

Si falla GitHub, autorizar [Vercel GitHub App](https://github.com/apps/vercel/installations/new)
para la organización **Taller-SW-Web**, seleccionando el repositorio oficial.
Un administrador de la organización puede tener que aprobar la instalación.
Comprobar también [GitHub en autenticación Vercel](https://vercel.com/account/settings/authentication).
Después repetir `--apply`; no crear forks ni otro proyecto. No compartir tokens.
Esta misma secuencia recupera una integración revocada.

## Configuración externa pendiente

La inspección de GitHub del 2026-11-01 devolvió `404 Branch not protected` para
`master` y la lista de rulesets del repositorio estaba vacía. No se cambiaron
reglas remotas. La comprobación anterior `Frontend Foundation / validate` se reemplaza
en el código por `Integración continua del frontend / Validación integral de
integración continua`; selecciona el nombre nuevo en GitHub solo después de
confirmar que aparece en la ejecución de una solicitud de incorporación.

### GitHub: proteger `master`

Un administrador debe configurar en **Configuración → Ramas** o mediante un
ruleset dirigido a `master`:

1. Exigir solicitudes de incorporación y al menos una aprobación.
2. Exigir la comprobación `Validación integral de integración continua` del
   flujo `Integración continua del frontend`.
3. Exigir que la rama esté actualizada antes de fusionar, salvo que se use una
   cola de integración; exigir conversaciones resueltas.
4. Bloquear force-push y borrado; incluir administradores y desactivar bypass
   si el plan/permisos del repositorio lo permiten.
5. No exigir un despliegue de producción antes de fusionar: Vercel crea ese
   despliegue después de la fusión.

No se pudo comprobar el nombre exacto de la comprobación nueva porque todavía no hay una
ejecución de solicitud de incorporación de esta rama. La protección no debe
seleccionar el antiguo `validate` después de que la nueva comprobación esté visible.

### GitHub: preparar secretos y variables

Crear el entorno `vercel-produccion`, restringido a la rama `master`. Guardar en
él los secretos `VERCEL_TOKEN` (lectura del despliegue del proyecto autorizado)
y `VERCEL_AUTOMATION_BYPASS_SECRET` (secreto independiente de Protection Bypass
for Automation, la opción oficial para omitir la protección en pruebas
automatizadas). El flujo entrega cada secreto únicamente al trabajo que lo usa.
Crear las variables no secretas `VERCEL_PROJECT_ID=prj_RkhYGt0vM0nKW9jMY8LVMnAxCa8W`
y `VERCEL_TEAM_ID=team_Zkgo8VHqbwLeNfQC4pvTAAmp`, consultadas desde la conexión
Vercel disponible para el proyecto/equipo actual. No copiar tokens en el
repositorio ni en registros. El smoke usa Protection Bypass for Automation
únicamente en un intercambio HTTPS inicial hacia el host inmutable autenticado.
Acepta la cookie segura `_vercel_jwt` limitada a ese host; el secreto no se
vuelve a adjuntar a cada solicitud, no se incluye en URLs/registros/trazas/
artefactos y las redirecciones de autenticación o a otros orígenes fallan.

El proyecto consultado en Vercel tiene SSO activo para despliegues que no usan
dominio personalizado. La prueba de lectura del despliegue y del equipo desde
la conexión disponible respondió `403`; por ello no hay verificación remota
completa de los metadatos ni del acceso del token de GitHub Actions.

### Vercel: habilitar los controles de despliegue

La lectura del deployment de Production más reciente (`dpl_8wKLFp3QQAFYAirFsxcqFc1a8Ln9`)
devolvió `READY`, rama `master`, SHA `4d1b85969816f2879a6f6f17b3553cccba0ab764`; el proyecto tiene
`autoAssignCustomDomains: true` y ese deployment lista el dominio de Production y los
aliases Git de `master`;
`GET /v1/deployments/{id}/checks` devolvió `checks: []`. La API de proyecto y
`vercel project inspect` no exponen el selector persistente de Deployment Checks.
No se verificó en el dashboard qué checks están seleccionados ni cuáles son
obligatorios; la observación reportada en la interfaz fue “No configured checks
found”. Por eso CD protegido permanece **PENDIENTE**, no operativo.

En **Proyecto `g6-productos-ofertas` → Settings → Build and Deployment →
Deployment Checks**, mantener la integración GitHub, la rama de Production
`master` y la asignación automática de alias. Cuando los estados aparezcan,
seleccionar como obligatorios:

- La comprobación GitHub Actions `Validación integral de integración continua`
  como requisito del commit de Production, una vez visible y estable.
- El estado oficial `Vercel - g6-productos-ofertas: verificacion-automatizada-production`,
  publicado por la acción `vercel/repository-dispatch/actions/status` fijada
  al commit `30f760c6640485cd92f8c785ef361382555fb712`.
- El estado final `verificacion-despliegue-produccion`, publicado después del
  smoke y de comprobar que el SHA sigue vigente. Requerir ambos: el estado
  oficial aparece en Vercel y el final propio mantiene el fallo cerrado ante
  cancelaciones o despliegues obsoletos.
- Los controles nativos de estilo y tipos, si el proyecto los ofrece. Vercel
  puede mostrarlos como `Lint` y `Typecheck`; los comandos `lint` y `typecheck`
  se conservan en la CI.

Los checks todavía no se pueden seleccionar desde GitHub porque ninguno ha sido
publicado para este workflow. `repository_dispatch` solo inicia un workflow cuyo
archivo ya está presente en la rama predeterminada `master`; hoy el archivo está
solo en esta PR. El primer merge autorizado permite que Vercel envíe
`vercel.deployment.ready` y que GitHub ejecute el workflow de `master`. Como los
checks aún no están seleccionados, ese primer deployment nativo **podría
promoverse automáticamente**. No se debe presentar esa ejecución inicial como
CD protegido ni fusionar sin autorización para el cambio de producción.

Procedimiento de activación cuando el owner autorice la primera integración:

1. Aceptar que el merge publicará mediante la integración Git nativa; revisar y
   aprobar el cambio de producción por separado. No usar `Force Promote`.
2. Confirmar que `vercel.deployment.ready` aparece en Actions y que el workflow
   ejecutado desde `master` termina `success` para la identidad, smoke y SHA.
3. En Deployment Checks, añadir los dos contextos anteriores y guardarlos como
   obligatorios; confirmar en el proyecto que ambos figuran seleccionados.
4. Esperar a un siguiente deployment nativo de Production y comprobar que
   permanece sin asignación de alias mientras los checks están pendientes.
5. Verificar que pasa solo después de ambos estados `success` y que un fallo o
   cancelación conserva el alias anterior. Registrar deployment, SHA, checks y
   alias antes de declarar el control operativo.

El primer deployment no demuestra el bloqueo porque puede promoverse antes de
seleccionar los checks; se necesita comprobar un deployment posterior al paso 3.
No se implementa una vía adicional con `vercel deploy --prebuilt`/`promote`.

El workflow exige dos contextos. La acción oficial de Vercel publica el suyo
para asociar el evento con el SHA; su acción post puede mapear un job cancelado
sin pasos fallidos a `success` y solo advierte si GitHub rechaza su escritura.
El contexto propio falla ante cancelación/SHA obsoleto y una falla al publicar
deja el estado pendiente y el job fallido, evitando convertir esos casos en
éxito efectivo cuando ambos contextos estén requeridos.

No usar **Force Promote** como procedimiento ordinario. Confirmar en Vercel que
un despliegue rechazado continúa sin el alias de Production y que la versión
anterior conserva el dominio.

## Verificación de despliegues y publicación

`Verificación de despliegues de Vercel` escucha el evento oficial
`vercel.deployment.ready`, que ocurre tras crear el despliegue y antes de
asignarle el dominio cuando los controles de despliegue están habilitados. El flujo obtiene
el código de `master` con credenciales persistentes desactivadas; el SHA del
evento nunca se usa para ejecutar código. Consulta con `VERCEL_TOKEN` el ID de
despliegue recibido, valida proyecto/equipo/Production/rama/repositorio/SHA,
compara el commit con el HEAD actual de `master` y extrae la URL solamente de la
respuesta autenticada de Vercel. Rechaza eventos incompletos, inconsistentes,
obsoletos y URLs que no pertenezcan al host inmutable esperado.

`Comprobar funcionamiento del despliegue` ejecuta la
[`prueba rápida`](../scripts/vercel-smoke.mjs) contra esa URL: cinco rutas,
HTTP 200, navegación directa y recarga, contenido esencial, respuestas y MIME
de recursos, errores de aplicación, consola/JavaScript, red y redirects a
autenticación. El smoke verifica únicamente la SPA servida en Production, que
conserva el modo `mock`; **no** prueba Gateway, identidad G7, credenciales,
contratos ni persistencia de backend. Un E2E real con Gateway exige una suite,
entorno y credenciales aprobados específicamente; no se mezcla con este smoke.
La acción oficial fijada publica el estado
`Vercel - g6-productos-ofertas: verificacion-automatizada-production` asociado al SHA del
evento. El publicador `registrar-estado-vercel.mjs` conserva el contexto final
`verificacion-despliegue-produccion`: publica `pending` tras validar la identidad
y solo marca éxito si el smoke pasó, la consulta de `master` respondió y el SHA
del deployment sigue vigente. Si falla la identidad no se publica un estado
final; el control oficial falla y Vercel no promueve. Requerir ambos estados.
Vercel asigna el alias al aprobar todos los controles.

La verificación del dominio público después de la promoción y su trazabilidad
`SHA → despliegue → alias → prueba rápida` son comprobaciones operativas posteriores; no
escriben el estado que bloquea la promoción. La fecha, SHA, URL y enlaces de
ejecución se registran en [`evidencias/ci-cd-h4/README.md`](evidencias/ci-cd-h4/README.md).

Para validar localmente, con Node 22.12 o superior dentro de la major 22:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run test:e2e -- --reporter=line
VITE_DATA_MODE=mock npm run build
npx playwright install chromium
npm run preview -- --port 5174 --strictPort
node scripts/vercel-smoke.mjs http://127.0.0.1:5174
```

No ejecutar la suite y la prueba rápida local simultáneamente: hay pruebas existentes
que reconstruyen `dist/`. La CI independiente evita compartir el directorio de
compilación entre los dos modos.
La CI ejecuta las suites por separado y valida ambos modos de compilación. El
modo `mock` se descarga como artefacto para la prueba rápida local; el modo `api` conserva
la prueba de que providers ausentes no generan un retorno a mocks.

La ejecución previa a la promoción requiere que el flujo exista en `master`,
el entorno/secreto/variables de GitHub estén configurados y Vercel tenga activo
el control de despliegue. Hasta entonces, esa barrera no puede considerarse probada.
Después de una promoción, confirmar manualmente el SHA completo en GitHub,
despliegue y alias vigente en Vercel; ejecutar la prueba rápida contra el dominio público
y registrar la cadena `SHA → despliegue → alias → prueba rápida` en el registro de
evidencias. Un `READY` o un HTTP 200 de `/` no bastan. La prueba rápida no valida APIs
externas ni el backend: Production se mantiene en modo de demostración.

[`vercel-smoke.mjs`](../scripts/vercel-smoke.mjs) abre `/`, `/precios`, `/productos`,
`/categorias` y `/carga-masiva` directamente a 1440×900, verifica HTTP/HTML,
encabezados y tablas donde corresponden, refresca `/productos`, revisa JS/CSS y
MIME, y falla ante errores JavaScript, consola, recursos fallidos o solicitudes
a otros orígenes. Para despliegues protegidos, usa Protection Bypass for
Automation solo como encabezado acotado al hostname validado; nunca como
parámetro de URL. No modifica datos ni acredita APIs reales. El resultado remoto
del nuevo control está pendiente hasta que se configure y ejecute; la evidencia
histórica del 16/10 permanece en [registro de validación](VALIDACION_VERCEL.md).

## Operación

Con CLI autenticada (usar el prefijo `npm exec --yes --package=vercel@64.3.1 --`):

```sh
vercel project inspect g6-productos-ofertas --scope marecahu02-9205s-projects
vercel ls g6-productos-ofertas --scope marecahu02-9205s-projects
vercel inspect URL_DEPLOYMENT --scope marecahu02-9205s-projects
vercel inspect URL_DEPLOYMENT --logs --scope marecahu02-9205s-projects
vercel logs URL_DEPLOYMENT --scope marecahu02-9205s-projects
```

`inspect --logs` consulta el build; `logs` consulta runtime, que puede no tener
entradas para esta SPA estática. En caso `ERROR`, leer el build log y verificar
Node, `npm ci`, typecheck y variable Production; corregir mediante PR y merge.

Reversión: identificar un despliegue de producción anterior verificado y, con
autorización operativa, ejecutar `vercel rollback URL_ANTERIOR --scope TEAM`.
Después volver a comprobar el alias y la prueba rápida, y corregir o revertir el código mediante una solicitud de incorporación
para que la siguiente fusión no reintroduzca el fallo. No se ejecutó ninguna reversión.

Cambiar a `api` requiere providers HTTP implementados, contratos y permisos
verificados; **Bulk sigue usando mocks en la base actual incluso con `api`**, según
README. Tras la aprobación, actualizar Production con `vercel env update
VITE_DATA_MODE production --scope TEAM` y publicar una nueva revisión mediante
el flujo aprobado. Un cambio de variable no modifica un bundle ya publicado.
Todo `VITE_` es público; jamás colocar secretos en él. No agregar variables
ficticias de Backend, RabbitMQ, Supabase ni autenticación.

## Fuentes

- [Configuración Git y reglas coincidentes](https://vercel.com/docs/project-configuration/git-configuration).
- [Configuración Vite SPA](https://vercel.com/docs/frameworks/frontend/vite).
- [CLI autenticada para API](https://vercel.com/docs/cli/api).
- [OpenAPI oficial usado para métodos y campos](https://openapi.vercel.sh).
- [Actualizar proyecto](https://vercel.com/docs/rest-api/projects/update-an-existing-project).
- [Reversión](https://vercel.com/docs/cli/rollback), [inspección](https://vercel.com/docs/cli/inspect), [registros](https://vercel.com/docs/cli/logs).
- [README](../README.md), [AGENTS](../AGENTS.md), [.env.example](../.env.example), [CI](../.github/workflows/frontend.yml).

Se consultó Docs (solo lectura) en `cb7eec179f812d38929e20c5ab6f7a77139c4090`,
incluidos README, AGENTS y registro/matriz DEC-F. No se cambian reglas de negocio,
interfaces HTTP/eventos, UI, arquitectura ni persistencia; SPEC/HU/FLOW y ADR de
esas funcionalidades no requieren modificación para configurar este hosting.
