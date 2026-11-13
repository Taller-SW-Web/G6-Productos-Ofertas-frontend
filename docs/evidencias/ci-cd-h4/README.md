# Evidencia de CI/CD — Hito 4

## Evidencia actual H63-01 — retención de Production demostrada (2026-11-07)

- La PR [#63](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/pull/63) se fusionó en `6cba771862641a9d4a7fee835e54cbb877725f44`. La causa de que no llegara su evento fue `gitProviderOptions.disableRepositoryDispatchEvents: true`; se habilitó por API. `autoAssignCustomDomains` permaneció en `true`.
- Antes de la prueba, los dos checks estaban activos para `production`, `sourceKind: git-provider`, `blocks: deployment-alias`, y `deletedAt: null`. La rama productiva era `master`.
- Deployment y alias de referencia antes de la PR de prueba: `dpl_2NiJ5VN4Tjz2oEpJfZaRR2UdzWDF`, SHA `6cba771862641a9d4a7fee835e54cbb877725f44`, con `g6-productos-ofertas.vercel.app`; `forced: false`.
- La PR documental [#71](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/pull/71), aprobada y con `validate` exitoso, se fusionó mediante merge commit `f9c494ae1c23e7107c8b1c41c4af9f2ad40fca09` a las `10:25:55Z`. Produjo un único deployment nativo de Production: `dpl_Fgwrt4EbGYWJWVnEYexneWvkNg3P`, creado a las `10:25:57.789Z`, listo a las `10:27:15.770Z`, SHA igual al merge y `forced: false`.
- GitHub recibió el evento real `repository_dispatch` de tipo `vercel.deployment.ready`: el run [42364017165](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/42364017165) comenzó a las `10:27:17Z` sobre `f9c494ae1c23e7107c8b1c41c4af9f2ad40fca09`, el SHA del deployment. No se envió un dispatch sintético durante esta prueba. El payload pasó la validación de identidad y el job terminó `success` a las `10:28:39Z`; smoke remoto y vigencia de `master` también pasaron.
- Evidencia de retención mientras estaban pendientes: Vercel publicó `Vercel: pending` (“Waiting for checks to complete”) a las `10:27:16Z`. Los contexts `Vercel - g6-productos-ofertas: verificacion-automatizada-production` y `verificacion-despliegue-produccion` quedaron `pending` a las `10:27:23Z` y `10:27:28Z`. En la consulta de deployments a las `10:27:28Z`, el deployment nuevo solo tenía aliases de proyecto/master; el deployment anterior seguía teniendo `g6-productos-ofertas.vercel.app`.
- Ambos checks pasaron: `verificacion-despliegue-produccion` a las `10:28:31Z` y `Vercel - g6-productos-ofertas: verificacion-automatizada-production` a las `10:28:37Z`. La API de alias registra el dominio Production apuntando al deployment nuevo y actualización a las `10:28:38.502Z` (`aliasAssigned: 10:28:38.567Z`), después de los dos estados `success`.
- Resultado: el alias se mantuvo en la versión anterior mientras ambos checks estaban pendientes y pasó al deployment de prueba solo después de completarse correctamente. No se usó Force Promote ni se desactivaron checks, protecciones o aliasado automático.
- El diagnóstico anterior [run sintético 42362815465](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/42362815465) está separado de esta evidencia: validó el workflow contra el deployment anterior y publicó los contexts para importarlos, pero no fue un evento de Vercel ni se considera prueba de retención.
- Esta evidencia documenta la prueba de retención ya completada; no requiere crear otro deployment de prueba ni usar Force Promote.

El mecanismo nativo GitHub–Vercel sigue siendo la única vía de publicación. No se modificó `VITE_DATA_MODE=mock`, no se creó un deployment mediante CLI/API y no se usó Force Promote.

## Evidencia histórica previa a H63

**Fecha de evaluación:** 2026-11-02

**Rama:** `ci/atomizar-validaciones-y-verificar-despliegue-vercel`

**Solicitud de incorporación:** [PR 63, en borrador](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/pull/63)

**Base integrada:** `origin/master` en `726fba0a2ceaaf4a3c60052fb1ff4cbf35139f6d`

**SHA de la distribución ponderada medida:** `664b8d32910bb745164fc3047aab23da9ab532cb`

**Último run completo medido:** [41415037004](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/41415037004), éxito, 10:08 de duración total

**Estado registrado entonces:** control implementado y probado mediante pruebas unitarias; validación del estado remoto y de Production pendiente de credenciales y deployment real.

Esta evidencia distingue la línea base histórica, la medición de cuatro fragmentos automáticos y la ejecución completa de los nuevos manifiestos ponderados.

## Medición antes y después

| Medición | SHA evaluado | Ejecución | E2E | Casos E2E | Duración total del workflow | Minutos de ejecutor |
|---|---|---|---:|---:|---:|---:|
| Línea base: tres fragmentos automáticos | `3edd364f3ca86c935f4541e4a5b063a7b6495e79` | [41387235904](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/41387235904) | 3 | 515 aprobados | 14:04 | 44,30 |
| Cuatro fragmentos automáticos; incluye cambios de master y 41 casos más | `a0d66f67ae1457d7b46b9580a47d6047680c9004` | [41411709832](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/41411709832) | 4 | 550 aprobados, 6 omitidos por anotaciones de prueba | 15:17 | 47,28 |
| Cuatro fragmentos ponderados por archivo | `664b8d32910bb745164fc3047aab23da9ab532cb` | [41415037004](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/41415037004) | 4 | 550 aprobados, 6 omitidos por anotaciones de prueba | 10:08 | 47,22 |

El run ponderado redujo 5:09 el tiempo frente al run con cuatro fragmentos automáticos (15:17 → 10:08), con el mismo SHA funcional, los mismos 556 casos y una suma de minutos de ejecutor similar (47,28 → 47,22). Frente a la línea base, duró 3:56 menos pese a incluir 41 casos enumerados adicionales. Esta última comparación no aísla el efecto de la configuración, porque `master` añadió pruebas de Catálogo.

### Duraciones de los fragmentos

| Ejecución | Parte | Trabajo completo | Instalación `npm ci` | Instalación de Chromium | Paso E2E |
|---|---:|---:|---:|---:|---:|
| 41387235904 | 1 de 3 | 12:06 | 0:42 | 0:18 | 10:54 |
| 41387235904 | 2 de 3 | 7:33 | 0:43 | 0:16 | 6:24 |
| 41387235904 | 3 de 3 | 13:57 | 0:36 | 0:34 | 12:33 |
| 41411709832 | 1 de 4 | 7:57 | 0:34 | 0:17 | 6:54 |
| 41411709832 | 2 de 4 | 8:08 | 0:43 | 0:16 | 6:58 |
| 41411709832 | 3 de 4 | 3:54 | 0:25 | 0:12 | 3:09 |
| 41411709832 | 4 de 4 | 14:58 | 0:43 | 0:33 | 13:29 |
| 41415037004 | 1 de 4, ponderado | 9:08 | 0:43 | 0:17 | 7:59 |
| 41415037004 | 2 de 4, ponderado | 8:45 | 0:41 | 0:17 | 7:35 |
| 41415037004 | 3 de 4, ponderado | 8:18 | 0:35 | 0:19 | 7:11 |
| 41415037004 | 4 de 4, ponderado | 9:43 | 0:45 | 0:19 | 8:29 |

El fragmento 4 automático del segundo run concentró archivos costosos y dominó el tiempo total. En sus resultados, los archivos de mayor duración acumulada fueron `transversal-integration.spec.ts` (174,8 s), `taxonomy-mk010.spec.ts` (137,8 s), `g6-mock-regressions.spec.ts` (134,1 s), `taxonomy-mk009.spec.ts` (95,1 s), `price-audit.spec.ts` (88,7 s), `taxonomy-ui.spec.ts` (83,5 s), `inventory.spec.ts` (71,2 s), `pricing-workflows.spec.ts` (66,6 s) y `recommendations.spec.ts` (66,1 s).

Los manifiestos `scripts/e2e-fragmentos/parte-1.txt` a `parte-4.txt` asignan archivos completos una sola vez mediante una distribución voraz por duración acumulada registrada por Playwright. Si varios archivos tienen duración cero, el número de pruebas actúa solo como desempate mínimo. Playwright midió 7:59, 7:35, 7:11 y 8:29 en los pasos E2E; el trabajo más largo duró 9:43 incluyendo preparación y subida de evidencia. Se mantienen cuatro trabajos, un trabajador por trabajo y `fullyParallel: false`.

Cada ejecución vuelve a enumerar la suite completa. Si Playwright no logra enumerarla, el trabajo falla y no puede aprobar cobertura incompleta. Si los manifiestos tienen archivos ausentes, adicionales o duplicados, cada fragmento usa la distribución automática completa de Playwright. Los nuevos casos dentro de un archivo existente se incluyen automáticamente porque el manifiesto selecciona archivos completos. Los archivos de pruebas nunca se dividen entre fragmentos.

### Coste de ejecutores y demás comprobaciones

El run 41387235904 utilizó 14 trabajos y aproximadamente 44,30 minutos de ejecutor sumados. Los runs 41411709832 y 41415037004 usaron 16 trabajos y 47,28 y 47,22 minutos, respectivamente. En el run ponderado, `npm ci` duró 35–45 s por trabajo E2E y Chromium 17–19 s. Las otras instalaciones `npm ci` permanecen independientes; `actions/setup-node` conserva su caché de npm y todas usan `npm ci`.

No se añadió caché de `node_modules` ni de Chromium: la instalación observada fue más pequeña que la variación entre fragmentos y no se midió una ganancia que justifique una caché adicional. Las compilaciones de demostración se comparten con la verificación local por artefacto; la compilación API conserva su propio modo y verificación. No se reutilizan artefactos de código entre trabajos privilegiados.

### Cobertura y resultado del run 41411709832

- Playwright enumeró y ejecutó 556 casos en 55 archivos. El run remoto registró 550 aprobados y 6 omitidos por anotaciones existentes; no hubo fallos. No se eliminaron pruebas ni se modificaron aserciones.
- Las cuatro partes finalizaron correctamente; los resultados por parte fueron 142 aprobados, 136 aprobados, 148 aprobados y 6 omitidos más 124 aprobados, respectivamente.
- Todos los trabajos de estilo, tipos, pruebas unitarias, compilaciones, smoke, verificación local y el agregador `Validación integral de integración continua` terminaron en `success`.
- El conjunto unitario integrado ejecutó 370 pruebas; las cuatro particiones reportaron 56, 51, 108 y 155 aprobadas. La prueba rápida de interfaz aprobó 8.
- El smoke local de 8 pruebas con dos trabajadores falló en dos verificaciones de interfaz sensibles a sincronización; los mismos casos y luego el conjunto smoke pasaron con un trabajador. Por ello, no se aumentó el paralelismo por fragmento. Se conservan `retries: 0`. FND-05 ya había mostrado intermitencia al recuperar el foco al cerrar un diálogo; se registró el fallo inicial y su aprobación posterior sin cambios de código ni reintentos.
- La clasificación de cambios se ejecutó correctamente en el run de PR. Los cambios del run eran funcionales y de configuración, por lo que E2E corrió completo. La omisión documental se comprobó con pruebas unitarias de la clasificación, no con una ejecución real de PR exclusivamente documental.

## Estado de producción de Vercel (registro anterior a H63)

El workflow conserva el contexto final `verificacion-despliegue-produccion` y el despliegue nativo de la integración GitHub–Vercel. También usa la acción oficial fijada a un commit revisado `vercel/repository-dispatch/actions/status@30f760c6640485cd92f8c785ef361382555fb712` con el estado exacto `Vercel - g6-productos-ofertas: verificacion-automatizada-production`, requerido para que Vercel importe la comprobación del evento `repository_dispatch`. Ambos estados deben configurarse como requeridos; el contexto adicional aplica el resultado fail-closed ante cancelaciones, errores de publicación y deployments obsoletos. El permiso `statuses:write` y `actions:read` queda limitado al trabajo de verificación.

Después de autenticar el proyecto, equipo, repositorio, rama y SHA, se registra `pending`. El resultado pasa a `success` solo si la comprobación remota pasa y el SHA del deployment sigue siendo el HEAD actual de `master`. Una comprobación remota fallida, un SHA obsoleto o una consulta de GitHub fallida dan estado `failure`. Si se cancela o falla la infraestructura antes de publicar el resultado final, el estado previo queda pendiente; no se convierte en éxito. Los runs asociados a SHA diferentes tienen grupos de concurrencia separados para que un deployment obsoleto no bloquee la versión posterior.

Las pruebas unitarias verifican las decisiones de éxito, fallo remoto, cancelación, omisión, SHA obsoleto, fallo al consultar el HEAD y errores al publicar el estado (rechazo HTTP o conexión perdida). Son pruebas deterministas de lógica local; **no** publicaron estados reales ni comprobaron una URL de Production. No se configuraron secretos ni se inició un despliegue.

## Validaciones reproducibles (registro histórico anterior a H63)

Validaciones ejecutadas localmente sobre los cambios de esta rama:

| Verificación | Resultado |
|---|---|
| `npm run lint` | Correcto. |
| `npm run typecheck` | Correcto. |
| `npm test` | Correcto: 370 pruebas unitarias. |
| Pruebas de scripts de estado Vercel, clasificación y manifiestos E2E | Correcto: 13 pruebas. |
| `npx playwright test --list --test-list` en los cuatro manifiestos | Correcto: 176 + 122 + 138 + 120 = 556 casos en 55 archivos, sin solapamientos; no ejecuta la suite. |
| Smoke E2E local con un trabajador | Correcto: 8 pruebas; resultado heredado de la verificación local del SHA `a0d66f6`. |
| YAML, permisos y agregador | Correcto en el run 41411709832. |
| `git diff --check` | Correcto en el commit de implementación; se repetirá tras la actualización de este informe. |
| Run completo con distribución ponderada | Correcto: run 41415037004; todos los 16 trabajos y el agregador terminaron en `success`. |
| Estado GitHub contra deployment Vercel real | Pendiente; no se ejecutó por no usar credenciales ni desplegar. |

La prueba unitaria del publicador no sustituye la evidencia de la API remota. Tampoco se presenta la vista previa local o metadata de Vercel como prueba de producción.

## Cambios de master preservados

La base previa ya contenía el merge `bb69976` de cambios anteriores de `master`. Para esta revisión H63 se sincronizó el avance posterior de `master` (`5ba4eaf`) mediante merge normal `56cb0e0`, conservando el pipeline H4 y añadiendo las pruebas de release/autenticación recientes. No se reescribió historial publicado ni se cambió el mecanismo GitHub–Vercel.

## Configuración externa pendiente en la evaluación anterior a H63

1. En el entorno GitHub `vercel-produccion`, configurar las variables `VERCEL_PROJECT_ID` y `VERCEL_TEAM_ID`, y los secretos `VERCEL_TOKEN` y `VERCEL_AUTOMATION_BYPASS_SECRET`. No se modificó esta configuración.
2. Confirmar que la integración nativa de Vercel conserva el alias automático y que Deployment Checks están disponibles para el proyecto.
3. Exigir el contexto `verificacion-despliegue-produccion` antes de asignar Production y mantener la validación integral de CI como control de la PR. No se modificaron protecciones de rama.
4. Tras disponer de configuración, ejecutar un deployment real de prueba y registrar el enlace run → SHA → deployment → smoke → estado. Verificar también que una comprobación fallida no promociona la versión.

La alternativa futura de una verificación rápida obligatoria antes del merge y E2E completo antes de publicar se conserva únicamente como propuesta. No se activa hasta verificar que el control real de Vercel bloquea deployments defectuosos.
