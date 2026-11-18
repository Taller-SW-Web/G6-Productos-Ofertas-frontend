# PR #70 — segunda corrección de autenticación

Auditoría sobre `8c5b70e6f0d8a159087724bcc8fc508d105ea6fd`, rama `poma`.
Se conservan las correcciones anteriores. Alcance limitado a los seis puntos
nuevos: guard, verificador, foco/cancelación MFA, encabezado y brandBar.
No se modifican módulos comerciales, theme global, contratos, Backend, Docs
externo, Supabase ni infraestructura. Sin merge ni despliegue.

## Inspección y fuentes

- Raíz verificada: `C:/Users/Gabriel/Desktop/Web Front/G6-Productos-Ofertas-frontend`.
- Git inicial: `poma` y `origin/poma` en el HEAD solicitado; PR #70 abierto hacia
  `master`, base `4d1b85969816f2879a6f6f17b3553cccba0ab764`.
- Único cambio previo: `.gitignore` (`MK-LOGIN/`), conservado y excluido de commits.
- Leídos: `AGENTS.md`, README, descripción completa del PR, informes anteriores,
  workflow, guard, sesión, login, shell, CSS y scripts de validación.
- Docs oficial, solo lectura: `a7778ec1a22811c1213a94ef096ab905911342cc`;
  `ux/mockups/DESIGN.md` 1.1.0, `ux/mockups/ux/ux-guidelines.md` y `ux-decisions.md`.
  UXD-001/004/012: conservar contexto, actualización localizada y foco de errores.
- Contrato G7 1.1.0: `216059de38cd08949c0aca1b9f2ea855ef52aa76`,
  `specs/contrato-api/openapi.yaml`, `revision-local-no-publicada`; no acredita
  homologación. Se mantienen login/OTP/refresh/logout y sus DTO publicados.

## Matriz: reproducción, causa, corrección, regresión y riesgo

| ID | Severidad | Reproducción inicial y causa | Corrección | Prueba y resultado | Riesgo pendiente |
|---|---|---|---|---|---|
| R2-01 | P1 | En `/productos/nuevo`, escribir un borrador, conservar ElementHandle de input/header, vencer el JWT y retener la respuesta de refresh. `isConnected` pasa a false: `setValidated(null)` desmontaba Outlet antes de esperar G7. | Mantener la validación previa solo para la misma instancia/identidad durante la renovación. Token null o rechazo cierra el contenido; rol/identidad y sesión siguen comprobándose. | Reloj del navegador avanza 120 s; refresh HTTP retenido y luego liberado. Mismo input/header durante y después de respuesta; borrador conservado. Reintroducir la llamada reproduce 1 FAIL; refresh rechazado sigue pasando. Corrección: 2 PASS. | La UI conserva datos previamente autorizados durante la espera acotada de G7. No habilita nuevas operaciones con JWT vencido: transports siguen esperando getAccessToken. Refresh fallido, invalidación o permiso retirado retiran el panel. |
| R2-02 | P1 | Fixture HTML HTTP no aprobado observó **dos eventos de entrada**, correo y contraseña sintéticos, con el CLI previo. Solo se validaba que existiera una URL. | Política independiente de origen HTTPS exacto y bases aprobadas G7/Gateway. Validar configuración efectiva y probes anónimos antes de campos. Limitar tráfico real, no seguir redirects ni reintentar POST. Excepción HTTP en entrada exclusiva de fixtures, sin leer secretos reales. | Regresión CLI: 1 FAIL antes, PASS después con cero visitas/entrada. 23 pruebas de política y 9 pruebas de navegador: bases distintas, redirects antes/después, no reenvío de cuerpo y MFA pendiente. | La aprobación del artefacto corresponde a owners; el HTML no se autoaprueba. HTTPS/destinos reales y procedencia del despliegue requieren aceptación externa. |
| R2-03 | P2 | Tras CODIGO_INVALIDO/OTP_EXPIRADO, el segundo efecto enfocaba el campo OTP al terminar busy, quitando el foco al error. | Un solo efecto, después de busy=false, con prioridad al feedback de error; el OTP recibe foco solo sin error. | E2E de tres errores sucesivos comprueba el elemento enfocado (contenedor del alert) y ausencia de navegación administrativa. FAIL antes, PASS después. | Lector de pantalla físico no ejecutado; semántica alert/status y foco comprobados en Chromium. |
| R2-04 | P2 | Identidad larga a 320/375/768/1024: el grupo envolvía texto/logout fuera del header de 64 px. En 1024 el botón llegaba a y=108. | Identidad truncada visualmente, texto completo en DOM/title; logout no encoge. Desktop conserva 64 px. Por debajo de 768, header de dos filas (112 px), menú plegable y controles accesibles. Menú cerrado no se presenta al teclado/lector. | Cuatro E2E: límites del botón/header, sin overflow, apertura por teclado, navegación, cierre y logout. 4 FAIL antes; 4 PASS después; capturas temporales revisadas. | Las páginas comerciales no se rediseñan ni se certifica su responsive; aquí se prueba shell, identidad, menú y logout. |
| R2-05 | P2 | El verificador anterior solo esperaba navegación; no ofrecía intervención para completar un desafío real. El bloqueo de MFA pendiente era correcto y se conserva. | Procedimiento bilateral con aprobaciones, cuenta autorizada y acta. `--mfa-manual` requiere desafío real y espera intervención en la misma ventana, hasta 180 s. Sin desafío o sin completar no acredita MFA. | Fixture de seguridad confirma que MFA pendiente no es PASS. Recorrido real con operador: **NO EJECUTADO**. Procedimiento entregado en `ACEPTACION_BILATERAL_G7_MFA.md`. | Pendiente G7/Gateway real, operador autorizado, buzón, URLs/artefacto aprobados y acta bilateral. No se simuló MFA en producción. |
| R2-06 | P3 | Cancelar un desafío sin tokens decía «Cerraste sesión». A ancho ≤767 y altura ≤800, `.brandBar {top:32px}` de la regla de altura desplazaba el header relativo fuera de su panel. | Cancelación tiene mensaje propio, sin petición logout de una sesión inexistente. Ajuste top=32 limitado a desktop ≥768. | Dos E2E: cancelación y ausencia de logout HTTP; bounds de brandBar en cuatro anchos bajos. Ambos FAIL antes y PASS después. | No se cambia la política MFA, su duración ni envío de códigos. |

La primera ronda UI produjo **8 FAIL y 1 PASS** (el cierre por refresh rechazado
ya funcionaba). Una ejecución posterior mostró que el montaje inicial podía
competir con un TTL artificial de 3 s; se sustituyó por reloj controlado, TTL
120 s y avance explícito al vencimiento. La regresión negativa volvió a fallar
al reintroducir la llamada defectuosa y la versión corregida pasó. No se presenta
el fallo de preparación del fixture como un defecto nuevo del producto.

## Seguridad del verificador

`g6-auth-integrations` expone únicamente las URLs públicas que consume `main`.
El verificador las compara con aprobaciones **independientes** del operador,
comprueba la URL efectiva y los transportes antes de introducir correo/contraseña.
No basta con que el preview declare su propia configuración.

La política permite documentos en el preview exacto y rutas del recorrido,
recursos del mismo origen, POST a los endpoints G7 publicados y GET/OPTIONS de
Gateway. Bloquea documentos hacia G7/Gateway, endpoints distintos, service workers
y sockets. Cada request autorizado se obtiene con maxRedirects=0 y maxRetries=0;
un 307/308 no puede reenviar credenciales al destino de Location. Certificados se
validan normalmente, sin ignoreHTTPSErrors ni excepciones TLS.

El CLI productivo solo admite HTTPS y el flag `--mfa-manual`.
`scripts/testing/verify-isolated-release.mjs` exige TODOS los destinos HTTP
loopback y utiliza literales sintéticos, sin leer correo/contraseña reales del
entorno. No es un modo que pueda habilitarse por variable en el CLI productivo.

No se crean trazas/HAR, videos ni capturas del verificador con credenciales;
no se registran cuerpos, tokens, OTP o errores crudos. Los ejemplos y fixtures
de seguridad no son homologación G7.

## Archivos y justificación

- `src/app/routes/RequireSession.tsx`: continuidad de formulario/shell durante refresh, fallo cerrado.
- `src/features/auth/components/LoginForm.tsx`: un solo efecto de foco con prioridad al error.
- `src/features/promotions/adapters/g7Session.ts`: distinguir cancelación de desafío y logout.
- `src/app/layout/ApplicationShell.tsx`, `src/app/app.module.css`: identidad, logout y menú responsive.
- `src/features/auth/pages/login.module.css`: resolver la intersección de breakpoints de brandBar.
- `src/main.tsx`: metadato de bases públicas efectivamente usadas por transports.
- `scripts/verify-release-login.mjs`, `release-login-check.mjs`, `release-login-policy.mjs`:
  política previa a credenciales, límite de red y aceptación manual MFA.
- `scripts/testing/verify-isolated-release.mjs`, `scripts/verify-production-auth.mjs`:
  separar fixture HTTP de verificador productivo HTTPS.
- `scripts/release-login-policy.test.mjs`, `scripts/testing/release-cli.test.mjs`,
  `scripts/testing/release-boundary.test.mjs`: regresiones de orígenes, destinos y redirects.
- `tests/auth-general.spec.ts`: nueve regresiones nuevas, sin retirar las anteriores.
- `package.json`, `.github/workflows/frontend.yml`: incluir política en unitarias y pruebas de boundary en CI.
- `README.md`, `docs/LOGIN_GENERAL.md`, `docs/ACEPTACION_BILATERAL_G7_MFA.md`, este informe:
  comandos, aceptación, trazabilidad y limitaciones.

## Validaciones de esta revisión

Node 22.23.4 / npm 10.9.9; mismo lockfile y dependencias de la instalación
`npm ci` verificada en la revisión anterior. No se añadieron dependencias.

| Comprobación | Resultado real |
|---|---|
| Regresiones UI iniciales | 8 FAIL, 1 PASS; esperados antes de corregir |
| Regresión CLI inicial UTF-8 | 1 FAIL esperado: dos eventos de entrada en preview no aprobado |
| Reintroducción del defecto del guard, reloj controlado | 1 FAIL, 1 PASS; archivo corregido restaurado |
| Nueve regresiones UI finales | **9 PASS**, 48,5 s; refresh definitivo: 2 PASS, 15,2 s; ambas son repeticiones focalizadas |
| `npm test` | **470 unitarias anteriores PASS + 23 nuevas de política PASS**, 0 fallos |
| `npm run test:release:boundary` | **9 PASS**, 0 fallos; HTML hostil/fixtures de seguridad, no G7 real |
| `npm run test:production:auth` | **PASS**: 59 rutas anónimas por modo, 58 vistas mock y 28 comprobaciones adicionales; fixture explícito |
| `npm run test:e2e:pricing` | **6 PASS**, 34,9 s |
| Shard 1/3, un worker | **206 PASS**, 12,7 min, repetición completa |
| Shard 2/3, un worker | **192 PASS**, 8,2 min |
| Shard 3/3, un worker | **188 PASS, 6 SKIP**, 17,7 min |
| Typecheck / lint / builds mock y API finales | **PASS**; lint sin errores/advertencias; builds 13,55 s y 2,95 s |
| Capturas versionadas / lockfile | Sin modificaciones |
| G7/Gateway compartidos y MFA bilateral real | **NO EJECUTADO** |

Los tres shards se ejecutaron en paralelo con servidores y directorios de evidencia
propios, como en CI. Resultado final: **592 casos, 586 PASS y 6 SKIP**, sin fallos
en las pasadas finales; se conservan los 577 aprobados anteriores y se agregan 9.
La primera ejecución del shard 1 tuvo **205 PASS y 1 FAIL**: faltó cargar el login
y la traza registró `ERR_NETWORK_CHANGED` en fuentes y módulos, antes de rellenar
campos. No se cambió código para ocultarlo ni se ampliaron timeouts/retries; se
repitieron completos los 206 casos y aprobaron. No se afirma que fuera un fallo
preexistente del producto. Las seis omisiones externas del baseline no se cuentan como
PASS. Las pruebas focalizadas son repeticiones y no se suman como casos únicos.
Los logs `auditoria-r2-*.log` son locales ignorados; capturas/trazas sintéticas en
`C:/Users/Gabriel/AppData/Local/Temp/g6-r2-evidencias/`, sin sustituir PNG versionados.

## Límites y entrega

Estado: **MOCK_INTEGRATED**, sin homologación externa ni declaración de listo para
merge/liberación. Siguen pendientes aceptación bilateral, JWT/JWKS, CORS/TLS,
revocación y permisos efectivos de servicios reales. Los bloqueos contractuales
de providers comerciales no se resuelven inventando rutas ni fixtures ocultos.

Las 11 vulnerabilidades del lockfile informadas en la revisión anterior (10
moderadas y 1 alta) no se actualizan automáticamente ni se ocultan. Sin secretos
en Vite/URLs/registros ni replay automático de escrituras.

Validaciones cerradas antes de crear commits y publicar. Implementación:
**`103360b34a31c3d81ad9437391d27bbdb9932ee9`** —
`fix(auth): conservar borradores al renovar y validar destinos aprobados`.
Este informe se registra en un commit posterior, con descripción en español.
El SHA de HEAD publicado y la sincronización de `poma` se verifican en la entrega.
Se mantiene fuera de los commits el cambio previo de `.gitignore`.

Matriz de entrega:

- [x] Fuentes, alcance y Git inicial verificados; trabajo previo conservado.
- [x] Typecheck, lint, builds mock/API y unitarias completas ejecutados.
- [x] 577 E2E anteriores conservados y nueve regresiones nuevas aprobadas.
- [x] Recorrido compilado y pruebas positivas/negativas del verificador ejecutados.
- [x] Shell 320/375/768/1024 revisado, y desktop 1440 cubierto por suite visual existente.
- [x] Sin contratos/grants inventados, sin secreto en Vite ni retry de escrituras.
- [x] Sin cambios de módulos comerciales, theme global ni repositorios externos.
- [x] Evidencias temporales, PNG versionados y lockfile sin cambios.
- [x] MFA real y aceptación bilateral pendientes declarados: NO EJECUTADO.
- [x] Nivel MOCK_INTEGRATED, no homologación real ni autorización para merge/despliegue.
