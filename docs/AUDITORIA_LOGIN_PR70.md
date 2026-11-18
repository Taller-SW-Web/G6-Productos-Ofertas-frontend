# Auditoría local del login — PR #70

Revisión: 06/11/2026. PR auditado: https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/pull/70.
Rama exclusiva: `poma`; SHA inicial `6757b4d25e17315c35e3299ff798648e9b6829f5`.
Base local consultada: `origin/master`, `4d1b85969816f2879a6f6f17b3553cccba0ab764`;
`git rev-list --left-right --count origin/master...poma` inicial: `0 2`.
Único cambio inicial: `.gitignore`, conservado y excluido de los commits.
No se publica, fusiona ni despliega. No se modifican repositorios externos.

## Fuentes verificadas

- `AGENTS.md`, `README.md`, descripción completa y diff de PR #70,
  `docs/LOGIN_GENERAL.md`, `.github/workflows/frontend.yml`, scripts y archivos afectados.
- Docs oficial `master` @ `a7778ec1a22811c1213a94ef096ab905911342cc`:
  `arquitectura/Arquitectura.md` (§1.2.1 y §21),
  `arquitectura/decisiones/REGISTRO_DEC_F.md`,
  `contratos/http/openapi.yaml` **0.6.0-rc.3**, `catalogo-errores.md`,
  `ux/mockups/DESIGN.md` **1.1.0**, `ux/mockups/ux/ux-guidelines.md`,
  `ux/mockups/ux/ux-decisions.md`.
- G7 oficial `Taller-SW-Web/Modulo-de-Seguridad` @
  `216059de38cd08949c0aca1b9f2ea855ef52aa76`,
  `specs/contrato-api/openapi.yaml` **1.1.0**, estado `revision-local-no-publicada`.
- Referencia visual local `MK-LOGIN/index.html`; tokens existentes de Frontend.
  Docs no está disponible como carpeta hermana: se consultó por GitHub, solo lectura.

La política publicada admite `GESTOR_COMERCIAL`. No se atribuyen privilegios por
`ADMIN_SISTEMA`, ni se interpretan los permisos internos de Seguridad como grants
comerciales. Gateway/Backend conservan la autorización final de cada operación.

## Matriz de hallazgos

| ID | Severidad | Reproducción / causa raíz | Corrección | Prueba |
|---|---|---|---|---|
| F01 | P1 | El verificador compilado visitaba 59 rutas sin autenticarse; había eliminado la cobertura funcional anterior. | Separar fallo cerrado y panel autenticado. Recuperar el verificador de `4d1b859`, autenticar mediante HTTP contractual en cada recarga. | 58 vistas mock, escritura de Pricing y asiento; builds compilados con G7/Gateway aislados. |
| F02 | P1 | Una sesión válida con roles ajenos podía montar el shell; se comprobaba identidad, no política comercial. | `canAdminister`, denegación antes del shell, comprobación también en login y tras renovar roles. Sin grants nuevos. | ADMIN_SISTEMA/CLIENTE/roles vacíos denegados; GESTOR permitido; cambio a CLIENTE retira el panel. 403 operativo conserva sesión. |
| F03 | P1 | Build y checks anónimos pasaban con G7 ausente. | Etiquetar explícitamente el fallo cerrado; CI exige además pruebas contractuales compiladas. Gate externo separado para login, lectura HTTP y navegación de la configuración candidata. | Configuración incompleta rechazada con exit 1; configuración contractual operativa comprobada aparte. Ninguna prueba aislada certifica homologación. |
| F04 | P2 | Dos columnas fijas y padding grande comprometían controles en ventanas pequeñas. | Mantener desktop; adaptar ancho, tipografía, cabecera y padding del login/MFA. Permitir scroll vertical cuando la altura efectiva lo exige. | 320, 375, 768, 1024, 1366, 1440 px; 320×320; área CSS 720×450 equivalente a zoom 200% en 1440×900. Controles alcanzables y sin overflow horizontal. |
| F05 | P1 | Claves mock globales y módulos inicializados antes del login podían rehidratar datos ajenos. | Diferir proveedores hasta identidad autorizada; namespace por UUID; nueva memoria JavaScript al logout/cambio de identidad. Conservar claves y sincronización de demo anónima. | A crea marca, logout, B no la ve; A vuelve y la recupera; dos pestañas de A sincronizan; B no hereda esa escritura. Suites de persistencia y cruces entre módulos. |
| F06 | P2 | Todo 401 de Catálogo invalidaba la sesión, incluso JSON desconocido o HTML ilegible. | Invalidar/renovar solo la secuencia documentada de TOKEN_INVALIDO. GET se renueva una vez; POST/PATCH nunca se repiten. | Tres regresiones 401 desconocido/ilegible; TOKEN_INVALIDO GET/POST/PATCH y 403; pruebas compiladas de Gateway. |
| F07 | P2 | Botones secundarios podían usar naranja inadecuado; C2410C sobre el fondo hover EDEAE2 solo alcanza 4,31:1. | Tokens aprobados: primaryHover sobre blanco; ink sobre fondo hover; borde outline primaryHover. Sin cambiar theme global ni el naranja del botón principal. | Colores calculados del navegador normal/hover; 5,18:1 y 14,73:1. Botón principal ink/primary: 5,82:1. |
| F08 | P2 | LoginForm anunciaba todos los mensajes como información. | Semántica error/info/success; errores con alert, confirmaciones con status; foco en feedback de credenciales y campo OTP. | Errores y confirmaciones en E2E, foco y navegación de teclado. |
| F09 | P1 | campaignSnapshots y ruleSnapshots sobrevivían en el adaptador compartido. Con la copia auditada se aceptó PATCH de B usando baseline anterior. | Eventos de versión de sesión limpian mapas; respuestas tardías de otra versión se rechazan; dispose explícito. El reinicio de memoria descarta el resto de proveedores y ediciones. | Regresión contra SHA auditado: 1 FAIL esperado; versión corregida exige nueva lectura y no emite PATCH. No demuestra una fuga de respuestas del Backend. |
| F10 | P1 | Los E2E de autenticación transformaban fuentes DEV; no acreditaban el bundle compilado. | Fixture HTTP G7/Gateway solo de pruebas y runner que compila ambos modos con URLs públicas, sin identidad inyectada ni bypass productivo. | Login/MFA/código inválido, refresh/expiración, roles, 401/403, TOKEN_INVALIDO, logout, retorno interno, escritura de Catálogo rechazada sin repetición, schema de Taxonomía, lectura Cupones y descarga Bulk. |
| F11 | P2 | Capturas directas y una variable opt-in podían reemplazar PNG versionados. | Toda captura usa outputPath por ejecución, también Taxonomía y el helper compartido. | `git diff --name-only -- docs/evidencias` vacío tras las suites. |
| F12 | P2 | Las seis pruebas HTTP adicionales de Pricing seguían importando App con guard, sin sesión de prueba. | Reutilizar FeatureTestApp existente, exclusivamente DEV, y puerto propio en su configuración. | Antes: 6 FAIL; después: 6 PASS. No cambia App ni su guard productivo. |
| F13 | P2 | Una prueba llenaba el filtro de Auditoría antes de que React terminara de reemplazarlo por cambio de query. | Esperar la lectura iniciada y controlar explícitamente la respuesta tardía del fixture; sin modificar Auditoría productiva. | Fallo observado en shard 2; se repite el shard completo con sincronización determinista. |

## Arquitectura y persistencia

`main.tsx` monta primero login o demo pública. Tras autenticar al Gestor configura
el namespace y carga `startApplication.tsx`, que conserva la composición de
servicios y providers existente. Cambiar de sección conserva el shell.
Cerrar o invalidar sesión descarta todo el contexto JavaScript; G7 logout usa
keepalive y limpia credenciales en memoria aun si la revocación remota falla.

Las claves autenticadas son `g6-productos-ofertas:mock:v1:user:<UUID>:<dominio>`.
Los eventos storage solo rehidratan el namespace activo. Los datos anteriores no
se eliminan ni se atribuyen automáticamente a un usuario: el namespace anónimo
de la demo permanece separado. Los intentos inciertos de Inventario también
se separan por identidad, conservando su persistencia por pestaña.
Esto evita herencia de UI; localStorage no constituye una frontera de seguridad
contra quien controle el mismo navegador. No contiene tokens ni contraseñas.

El único dato auxiliar al recargar logout es un aviso enumerado `logout/expired`,
consumido y eliminado al arrancar. No acredita autenticación. Tokens, desafíos
MFA y contraseñas siguen exclusivamente en memoria y no se registran.

## Archivos y motivos

- `src/main.tsx`, `src/startApplication.tsx`: arranque diferido y reinicio de memoria por sesión.
- `src/features/auth/authorization.ts`, `components/AccessDenied.tsx`,
  `components/AuthEntry.tsx`, `pages/LoginPage.tsx`, `src/app/routes/RequireSession.tsx`:
  aplicar la política publicada y conservar retorno seguro.
- `src/features/auth/components/LoginForm.tsx`, `pages/login.module.css`:
  semántica, foco, contraste y tamaños; sin rediseñar páginas comerciales.
- `src/app/config/authSessionRuntime.ts`,
  `src/features/promotions/adapters/g7Session.ts`: mensajes semánticos,
  revocación al recargar y rechazo de refresh que cambie de identidad.
- `src/features/catalog/adapters/authenticatedCatalogTransport.ts`: no invalidar por 401 desconocidos.
- `src/features/promotions/adapters/httpPromotionServices.ts`,
  `services/promotionSessionRuntime.ts`: limpiar baselines y rechazar respuestas de otra sesión.
- `src/features/shared/mockIdentity.ts`, `mockState.ts`,
  `src/features/inventory/services/transferReceptionAttempt.ts`: claves por identidad y sincronización compatible.
- `scripts/verify-production.mjs`, `verify-authenticated-mock.mjs`,
  `auth-contract-fixture.mjs`, `verify-production-auth.mjs`, `verify-release-login.mjs`:
  separar acceso anónimo, operaciones contractuales y comprobación externa.
- `package.json`, `.github/workflows/frontend.yml`: comandos y comprobación compilada en CI.
- `src/features/auth/auth.test.ts`, `tests/auth-general.spec.ts`,
  `tests/promotions-http-contract.spec.ts`: regresiones de seguridad y accesibilidad.
- `tests/support/evidence.ts`, `tests/taxonomy-mk009.spec.ts`,
  `tests/taxonomy-mk010.spec.ts`: evidencias temporales.
- `src/features/pricing/testing/pricing-http.tsx`, `playwright.config.ts`:
  harness DEV existente y aislamiento del servidor adicional.
- `tests/price-audit.spec.ts`, `tests/adapters/alternateAuditRepository.ts`:
  controlar concurrencia del fixture sin temporizadores arbitrarios.
- `README.md`, `docs/LOGIN_GENERAL.md`, este informe: ejecución, política, resultados y limitaciones.

## Validaciones

Entorno: Node **22.23.4**, npm **10.9.9**, Windows. Node descargado del distribuidor
oficial y SHA256 comprobado; no se cambió la instalación del sistema.

| Comprobación | Resultado |
|---|---|
| `npm ci` | PASS: 255 paquetes instalados, 256 auditados. 11 vulnerabilidades del lock existente: 10 moderadas y 1 alta. Sin actualizaciones automáticas. |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, sin errores ni advertencias en la pasada final registrada |
| `npm test` | PASS: **470** = 88 + 61 + 104 + 4 + 155 + 58; 0 fallos |
| `VITE_DATA_MODE=mock npm run build` | PASS; salida temporal independiente |
| `VITE_DATA_MODE=api npm run build` | PASS; salida temporal independiente |
| `npm run test:production:auth` | **PASS: 59 rutas anónimas por modo, 58 vistas mock y 28 comprobaciones adicionales**, incluido el gate positivo contractual; 0 fallos en la pasada de cierre. |
| Playwright `--shard=1/3 --workers=1` | **197 PASS**, 0 fallos, 15,8 min |
| Playwright `--shard=2/3 --workers=1` | **192 PASS**, 0 fallos, 9,0 min en repetición completa. Primera ejecución: 191 PASS, 1 FAIL (F13). |
| Playwright `--shard=3/3 --workers=1` | **188 PASS, 6 SKIP**, 0 fallos, 18,9 min |
| `npm run test:e2e:pricing` | **6 PASS**, 0 fallos, 40,8 s; fixtures HTTP |
| Regresión histórica de baselines | **1 FAIL esperado** en copia de 6757b4d; copia retirada; corregida PASS |
| Accesibilidad normal/hover/foco final | **2 PASS**, 0 fallos, 29,1 s (repetición focalizada) |
| Gate sin configuración externa | PASS negativo: exit **1**, rechazo explícito |
| Visual desktop 1440 | Revisado en captura temporal; se conserva distribución aprobada |

Las primeras pasadas de desarrollo también detectaron retorno, configuración del
harness y feedback tras recarga; se corrigieron y repitieron. No se presentan esas
pasadas como aprobadas. Los logs locales `auditoria-*.log` conservan sus resultados.

## Limitaciones, pendientes y estado

- **NO EJECUTADO**: G7/Gateway compartidos con credenciales genuinas, JWT/JWKS,
  revocación efectiva, CORS/TLS y permisos comerciales reales; pruebas bilaterales
  y runner Backend/PostgreSQL. Los fixtures no homologan esos componentes.
- El gate externo falla si queda MFA pendiente: requiere completar y validar ese
  flujo con el provider real. No acepta OTP ni credenciales en Vite.
- Pricing, Inventario y Combos conservan sus bloqueos API existentes; no se
  inventaron providers. Catálogo conserva sus bloqueos de lectura administrativa.
- Zoom probado mediante área CSS equivalente a 200%; zoom manual en la interfaz
  de un navegador de escritorio y lectores de pantalla físicos: NO EJECUTADOS.
- Se retiene persistencia por identidad para volver a entrar; no se migran claves
  antiguas sin propietario verificable. No se borra trabajo ajeno.
- 11 vulnerabilidades de dependencias preexistentes informadas por npm; su
  actualización requiere evaluar compatibilidad y queda fuera de estas correcciones.
- No se publican PNG ni cambios remotos; las evidencias pertenecen a cada run.

Estado de entrega: **MOCK_INTEGRATED**, validación contractual aislada de auth;
sin afirmación de API_INTEGRATED real ni de preparación para merge/despliegue.
Los tres shards cubren **583 casos: 577 PASS, 6 SKIP, 0 FAIL** en sus pasadas finales.
Las seis omisiones requieren servicios externos y no se contabilizan como PASS.
Los seis casos adicionales de Pricing pasan; las dos pruebas de accesibilidad
son repeticiones de casos ya incluidos en la suite principal.

Commit local de implementación: **`a10c3d5ca2b421b8ba08ec1db58bad30fd8ae349`** —
`fix(auth): aislar identidades y recuperar validación del login`.
Este informe se registra en un commit local posterior, sin publicación.
Estado final previsto y comprobado al entregar: rama `poma`, dos commits locales
posteriores al SHA auditado y únicamente `.gitignore` preexistente sin confirmar.


## Evidencia local y comprobaciones de alcance

- Logs de cierre: `auditoria-lint-cierre.log`, `auditoria-typecheck-cierre.log`,
  `auditoria-unitarias-final.log`, `auditoria-build-mock-cierre.log`,
  `auditoria-build-api-cierre.log`, `auditoria-produccion-auth-cierre.log`,
  `auditoria-shard-1.log`, `auditoria-shard-2-final.log`, `auditoria-shard-3.log`,
  `auditoria-pricing-e2e-final.log`, `auditoria-accesibilidad-final.log`.
  Son archivos locales ignorados, no se publican.
- Capturas y trazas por ejecución:
  `C:/Users/Gabriel/AppData/Local/Temp/g6-e2e-auditoria/`.
  Desktop: `shard1/auth-general-validaciones--8298d--ojo-teclado-y-captura-1440/login-general-1440.png`.
  Responsive final: carpeta `auth-final/`, capturas MFA a cada ancho/altura.
- El gate positivo usó **Cupones**, cuya lectura contractual está conectada.
  El intento anterior de usar el listado administrativo de Catálogo fue rechazado:
  conserva sus bloqueos contractuales y no se convirtió en una lectura ficticia.
- Las pasadas intermedias de desarrollo tuvieron 4 y luego 2 fallos en auth E2E,
  corregidos antes de los shards. La regresión inicial 401 mostró tres cierres
  injustificados; otra parametrización del test se corrigió antes de sus 32 PASS.
  Los primeros runners compilados detectaron errores en fixtures/rutas/selectores
  y una inspección prematura tras la recarga; no se declararon homologación ni PASS.
- Un runner intermedio sin tiempo límite fue interrumpido y reemplazado por uno
  con límites explícitos. No se detuvo ningún servidor del usuario.

Matriz obligatoria de entrega:

- [x] Fuentes normativas y SHAs comprobados.
- [x] Alcance identificado; Git inicial inspeccionado y cambios previos conservados.
- [x] Typecheck, build mock/API, lint y suite unitaria ejecutados.
- [x] Playwright completo en shards y suite adicional de Pricing ejecutados.
- [x] Revisión visual desktop 1440 px y controles responsive ejecutados.
- [x] Loading/error/empty y estados de acceso cubiertos por las suites.
- [x] Sin HTTP directo en los componentes visuales nuevos.
- [x] Sin HEX nuevos ni cambio del theme global.
- [x] Sin contratos, scopes, grants ni estados empresariales inventados.
- [x] Sin modificaciones a Docs externo, Backend, Supabase o despliegues.
- [x] Limitaciones de integración y comprobaciones externas registradas.
- [x] Nivel declarado: MOCK_INTEGRATED, no homologación real.
