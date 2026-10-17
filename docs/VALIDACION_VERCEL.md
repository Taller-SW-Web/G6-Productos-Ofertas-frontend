# Validación de automatización Vercel — 2026-10-16

Base de implementación: `origin/master@79f407dfeb7f11c958faa4de0b2f0ec4321ea28f`;
rama original `codex/automatizar-vercel`, commit `9b8a5834fa1a837c9d10e4735e94af77e33dfc5f`.
[PR #31](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/pull/31)
fusionado con autorización del usuario el 2026-10-16 a las **13:33:39 America/Lima**.
Merge y `master` publicado: **`2759c8d031b35e665432a9ca0f2a45c87943f072`**.
Esta actualización documental está en `codex/verificar-produccion-vercel`.
No se modifica Docs, Backend, código de aplicación ni políticas de seguridad.

## Aprovisionamiento verificado

| Elemento | Resultado |
|---|---|
| Sesión CLI | PASS: Vercel CLI 64.3.1, `marecahu02-9205` |
| Equipo | `marecahu02-9205s-projects` / `team_Zkgo8VHqbwLeNfQC4pvTAAmp` |
| Proyecto | Creado y luego reutilizado: `g6-productos-ofertas` |
| Project ID | `prj_RkhYGt0vM0nKW9jMY8LVMnAxCa8W` |
| GitHub nativo | PASS: `Taller-SW-Web/G6-Productos-Ofertas-frontend` |
| Production Branch | PASS: `master` |
| Build settings | PASS: Vite, raíz null, Node 22.x, npm ci, npm run build, dist |
| Variable Production | PASS: `VITE_DATA_MODE=mock`, tipo plain; sin otras variables agregadas |
| Previews | PASS: `previewDeploymentsDisabled=true` |
| Bootstrap repetido | PASS: `--apply` posterior sin ajustes pendientes y `--inspect` sin cambios |
| Deployment / URL | `dpl_DavnwMCcHLouENcxL1TcvSGTLnji`, READY/Production; [alias público verificado](https://g6-productos-ofertas.vercel.app) |

La primera conexión fue rechazada por permisos. El usuario autorizó el acceso
de GitHub App y el siguiente `--apply` confirmó la vinculación por API. No se
usaron tokens en argumentos/logs, forks, mirrors ni despliegues manuales.
Panel del proyecto: [Vercel](https://vercel.com/marecahu02-9205s-projects/g6-productos-ofertas).

## Validación anterior al merge

| Comprobación | Resultado |
|---|---|
| npm ci | PASS final con Node 22.23.3: 216 paquetes, auditoría sin vulnerabilidades |
| npm run typecheck | PASS |
| npm run lint | PASS final con Node 22.23.3, incluidos bootstrap y smoke |
| npm run build, mock | PASS, Vite 8.3.4 |
| npm test, ejecución completa | FAIL: 211 passed / 39 failed, ocho workers, 10 minutos; predominan timeouts de carga/acciones |
| npm test -- --last-failed --workers=2 --reporter=line | PASS: 39/39, 2.8 minutos, sin modificar casos ni timeouts |
| verify-production.mjs mock | PASS: 48 vistas, cero errores de arranque, 1440 px |
| vercel-smoke.mjs local | PASS aislado: cinco rutas, refresh de /productos, 37 recursos JS/CSS y cero errores de arranque |
| Build/verificación API | PASS: build API y 44 vistas sin fallback en el alcance del verificador; no acredita APIs reales ni cubre la excepción Bulk del README |
| Build sin VITE_DATA_MODE | PASS del control negativo: Vite rechaza la configuración ausente; dist restaurado a mock |
| vercel.json | PASS: validación contra esquema oficial con AJV (se omite el identificador de dialecto antiguo del esquema para compilar sus palabras clave actuales) |
| Reglas Git | PASS con minimatch: master=true; seis ramas de desarrollo y dos ramas con / = false |
| git diff --check y enlaces | PASS: diff revisado por archivo y enlaces relativos existentes |
| Verificador remoto previo al merge | BLOCKED esperado: no hay deployment asignado a Production; no emite PASS sin URL |

La [CI del PR](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/38946017619)
terminó **PASS** para `9b8a583`: 250/250 pruebas con dos workers, typecheck,
lint, builds, 48 vistas mock, smoke y 44 vistas API; duración total 8m47s.
El fallo local inicial se conserva como antecedente, separado del resultado de CI.

El entorno trae Node 24.3.0. Se obtuvo Node **22.23.3** sin modificar la instalación
global. Para garantizar Node 22 en Windows se invoca su `node.exe` con
`C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js`; `npm.cmd` instalado
junto a Node 24 utiliza ese ejecutable aunque PATH incluya Node 22. El motor
versionado y el runtime remoto quedan fijados a major 22.

La reinstalación final inicialmente encontró un binding nativo ocupado por el
preview local (EPERM en Windows). Se cerró ese proceso y `npm ci` terminó
correctamente con Node 22; no se cambió la política de ejecución ni se elevaron permisos.

Durante el desarrollo se corrigió el smoke para aceptar revalidación HTTP 304.
Una ejecución simultánea a la suite detectó un recurso convertido en HTML:
`tests/bulk.spec.ts` reconstruye `dist/` durante la suite. Esa ejecución no se
cuenta como PASS; el smoke debe ejecutarse aislado tras reconstruir mock.
No se cambiaron pruebas funcionales, timeouts ni aserciones de negocio.

## Primer despliegue automático después del merge

**Dictamen: PARCIAL.** El alias público funciona en mock; la prueba de la URL
inmutable falla por protección Vercel y no hubo sincronizaciones exitosas.
No se declara OPERATIVO.

| Comprobación | Resultado / evidencia |
|---|---|
| Integración de PR #31 | PASS: merge `2759c8d031b35e665432a9ca0f2a45c87943f072` |
| Publicación automática | PASS: antes del merge había cero deployments; se creó uno después del push, sin ejecutar `vercel deploy` ni crear deployment por API |
| Identidad Git | PASS: `gitSource.type=github`, repo ID `1410707825` (coincide con GitHub), ref `master`, SHA exacto del merge |
| Metadatos adicionales | `githubDeployment=1`, `githubCommitOrg=Taller-SW-Web`, `githubCommitRepo=G6-Productos-Ofertas-frontend`, `source=git` (este último es heurístico y no se usa como prueba única) |
| Corroboración GitHub | PASS: status `Vercel` success en el mismo SHA, vinculado al deployment; CI y sincronización iniciados por evento `push` del mismo SHA |
| Deployment | `dpl_DavnwMCcHLouENcxL1TcvSGTLnji`, `readyState=READY`, `target=production`, Node `22.x` |
| Creación / READY | 13:33:42.483 / 13:34:18.986, America/Lima (UTC−5), 2026-10-16 |
| Alias público | [https://g6-productos-ofertas.vercel.app](https://g6-productos-ofertas.vercel.app), HTTP 200, HTML |
| Identidad del alias | PASS: API de aliases informa `deploymentId=dpl_DavnwMCcHLouENcxL1TcvSGTLnji` y el mismo Project ID; el alias sirve el deployment cuyo SHA se verificó |
| URL inmutable | [g6-productos-ofertas-54j8uysrx-marecahu02-9205s-projects.vercel.app](https://g6-productos-ofertas-54j8uysrx-marecahu02-9205s-projects.vercel.app), HTTP 302 al SSO Vercel |
| Modo de datos | PASS: bootstrap inspeccionó `VITE_DATA_MODE=mock` en Production y la aplicación remota pasó las aserciones mock de 48 vistas; no se cambió la variable |
| Bootstrap `--inspect --verify-sha` | FAIL global, código 1: configuración, conexión, SHA, master y READY verificados; se detiene al fallar el smoke de la URL inmutable |
| Smoke inmutable | FAIL, código 1: el h1 es «Log in to Vercel», no la pantalla esperada de precios |
| Smoke alias Production | PASS, código 0: cinco rutas, refresh de /productos, 37 recursos JS/CSS, MIME correctos y cero errores de arranque |
| Verificación ampliada alias | PASS: `verify-production.mjs mock`, 48 vistas, 1440 px, sin errores de arranque |
| CI del push a master | PASS: [run 38948282900](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/38948282900), SHA del merge; 250/250 pruebas, builds/typecheck/lint, 48 vistas mock, smoke de cinco rutas/37 recursos y verificación API de 44 vistas; Production conservó mock |
| Deployments adicionales | PASS en el inventario posterior a finalizar sincronización: un único deployment total, de master; paginación agotada (`next=null`) |

[Deployment en Vercel](https://vercel.com/marecahu02-9205s-projects/g6-productos-ofertas/DavnwMCcHLouENcxL1TcvSGTLnji).
La cadena de evidencia combina el merge autorizado, los eventos push de GitHub,
su status Vercel y la identidad/timestamps de la API Vercel. No se utilizó
despliegue manual, redeploy ni promoción.
El log de build obtenido con `vercel inspect URL --logs` confirma
`Cloning github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend (Branch: master,
Commit: 2759c8d)` y `Build Completed in /vercel/output [32s]`.

Comandos realmente ejecutados con Node 22.23.3 y CLI Vercel 64.3.1 autenticada:

```sh
node scripts/vercel-bootstrap.mjs --inspect --verify-sha 2759c8d031b35e665432a9ca0f2a45c87943f072
node scripts/vercel-smoke.mjs https://g6-productos-ofertas-54j8uysrx-marecahu02-9205s-projects.vercel.app
node scripts/vercel-smoke.mjs https://g6-productos-ofertas.vercel.app
node scripts/verify-production.mjs mock https://g6-productos-ofertas.vercel.app
```

El bootstrap usa la CLI por `VERCEL_CLI_PATH` en esta máquina; ese valor es una
ruta local, no una credencial. También está disponible el comando con `npm exec`
documentado en la guía. No se agregaron tokens, cookies ni bypasses a los scripts.
La API del proyecto informa `ssoProtection.deploymentType=all_except_custom_domains`.
El comportamiento público observado se registra por URL: alias 200 y URL inmutable
302/login. No se infiere que ambas deban tener el mismo acceso.
El mensaje genérico del bootstrap que menciona GitHub App no identifica la causa
real del fallo: GitHub permanece conectado; falló el smoke protegido.

## Sincronización de las seis ramas

[Run 38948282979](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/38948282979):
evento `push`, SHA `2759c8d031b35e665432a9ca0f2a45c87943f072`, **FAIL**.
Se ejecutó de 13:33:42 a 13:35:11 America/Lima; los seis intentos terminaron sin push.
El fetch y `git merge-base --is-ancestor` posteriores confirman que ninguna de
las seis ramas contiene todavía ese merge de master.

| Rama | SHA remoto observado | Causa registrada | Deployment adicional |
|---|---|---|---|
| castilla | `92a0a8da3232b5d8de8c408d87e745b1a265681c` | Conflictos en .github/workflows/frontend.yml y README.md | Ninguno |
| poma | `af80e5335ea4b948f578981f36ccb31bab9d94f1` | Build sin VITE_DATA_MODE explícito | Ninguno |
| lopez | `f6295349122f1d88b1e4482792b81719392eae73` | Build sin VITE_DATA_MODE explícito | Ninguno |
| cueva | `1486482dbb164934e908d918526d2b7102ff0339` | Build sin VITE_DATA_MODE explícito | Ninguno |
| taco | `f01cb3146322cd546396a8fa73a8f07fcbc2fb93` | Conflicto en scripts/verify-production.mjs | Ninguno |
| vera | `1a248cf9686db795c9f48cb3a29cebff253d5e6d` | Build sin VITE_DATA_MODE explícito | Ninguno |

**Límite:** se comprobó ausencia de deployments adicionales tras los seis intentos;
no se puede acreditar supresión después de seis pushes de sincronización exitosos,
porque esos pushes no ocurrieron. El proyecto conserva previews deshabilitados y
las reglas Git de master. No se modificaron workflow, ramas ni reglas funcionales.

## Pendientes concretos

- Owner de Vercel: definir una vía autorizada para probar la URL inmutable con su
  protección vigente o aprobar expresamente una política de acceso distinta.
  Criterio: completar smoke y verificador remoto sin fallo; no se debilitó seguridad.
- Responsables de Castilla/Taco: resolver los conflictos citados mediante revisión.
  Responsable del workflow: corregir la configuración de demostración ausente en
  sus builds sin quitar la validación obligatoria. Luego repetir la sincronización
  y comparar el inventario Vercel tras los seis pushes efectivos.
- Protección de master: propuesta pendiente de aprobación del equipo; no se cambió.
- Rollback: **NO EJECUTADO**, únicamente procedimiento documentado.
