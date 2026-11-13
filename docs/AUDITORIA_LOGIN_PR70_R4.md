# PR #70 — cuarta auditoría de autenticación

Revisión sobre `d247dd693004c485d81b31ce552ca3235e2b26a0`, rama `poma`,
base `master` (`4d1b85969816f2879a6f6f17b3553cccba0ab764`). Se conservan
las correcciones R2. Alcance: seis hallazgos R4, transportes afectados y pruebas.
No se rediseñan módulos ni se modifican contratos externos, Backend, Docs
externo, Supabase o infraestructura. Sin merge ni despliegue.

## Inspección y fuentes

- Raíz comprobada: `C:/Users/Gabriel/Desktop/Web Front/G6-Productos-Ofertas-frontend`.
- Estado inicial: `poma` y `origin/poma` en el HEAD auditado. Único cambio previo:
  `.gitignore`, entrada `MK-LOGIN/`; conservado y excluido de commits.
- Leídos: `AGENTS.md`, README, descripción completa de PR #70,
  `docs/LOGIN_GENERAL.md`, informes previos, procedimiento bilateral,
  `.github/workflows/frontend.yml`, scripts del gate y archivos afectados.
- Docs oficial, solo lectura: `a7778ec1a22811c1213a94ef096ab905911342cc`;
  contratos HTTP OpenAPI 0.6.0-rc3 y catálogo de errores. Sin cambios de UI,
  tokens visuales, rutas comerciales o reglas de negocio.
- G7: `specs/contrato-api/openapi.yaml` 1.1.0,
  `216059de38cd08949c0aca1b9f2ea855ef52aa76`, `revision-local-no-publicada`.
  Login, desafío/OTP EMAIL, refresh rotativo y logout 204 idempotente.
  Política `GESTOR_COMERCIAL` existente conservada; autorización final en providers.

## Matriz de reproducción, solución y riesgo

| ID | Severidad | Reproducción inicial y causa | Solución mínima | Regresión | Riesgo residual |
|---|---|---|---|---|---|
| R4-01 | P1 | Tres interfaces sintéticas: sin POST login, GET 200 sin Bearer y Bearer distinto del emitido. Todas satisfacían el gate anterior: 3 pruebas de rechazo fallan con «Missing expected rejection». El gate solo observaba navegación/GET 200. | Evidencia privada del POST G7 y DTO de sesión; desafío → envío EMAIL 202 → OTP 200 si aplica; refresh enlazado al emitido y misma identidad. Antes del GET exigir exactamente el Bearer de esa sesión y después su 200. Sin exportar DTO/tokens. | Tres negativas de navegador; prueba de secuencia MFA/rotación, rechazo de OTP sin envío, refresh/logout ajenos, token anterior y serialización sin secretos. Recorrido positivo y build compilado. | Enlace contractual observado no verifica firma, audiencia, JWKS ni homologación JWT en Backend. MFA real pendiente del acta bilateral. |
| R4-02 | P2 | Siete rutas/queries indebidas pasaban: productos, usuarios, página ajena, tamaño inválido, duplicados, token y filtro no usado. Allowlist aceptaba todo GET bajo `/api/v1/`. | Solo GET/OPTIONS de Cupones, claves opcionales `pagina=1`, `tamanio=10`, únicas, sin extras. Solo GET/OPTIONS sin query de promociones padre acreditadas por la respuesta autenticada. Ninguna escritura o ruta ajena. | Siete negativas anteriores pasan; control positivo de paginación y padre acreditado, negativos de padre ajeno, query y tamaño duplicado. | Es política del recorrido automático, no un cambio del contrato comercial. Nuevos recorridos deberán aprobar expresamente sus requests. |
| R4-03 | P2 | Taxonomía: dos 401 TOKEN_INVALIDO, cero invalidaciones. Bulk: POST 401 TOKEN_INVALIDO, cero invalidaciones. Ambas regresiones fallan antes. Bulk además invalidaba cualquier segundo 401 ilegible/desconocido. | Invalidar el token renovado solo ante segundo 401 TOKEN_INVALIDO; POST Bulk invalida el rechazado sin renovar/repetir. Si no hay renovación, invalidar el token ya acreditado inválido. | Taxonomía: token renovado inválido y controles segundo 401 ilegible/403. Bulk: POST contractual, POST ilegible 401/403 y tres variantes del segundo GET 401. Suites completas. | No se atribuye invalidez a 401 desconocidos ni a 403; no se inventan grants. No hay replay de escrituras ni fallback API→mock. |
| R4-04 | P2 | OPTIONS G7 y GET anónimo Gateway devolvían 404/500/503; las seis negativas fallan porque el gate continuaba hasta rellenar credenciales. Solo se rechazaban redirects. | Sondas obligatorias antes de campos: G7 OPTIONS 200/204; recurso Gateway privado anónimo 401/403. Otro estado o fallo de red cierra el gate. | Seis negativas con cero eventos de entrada y cero POST login. Se conservan redirects, destino exacto y configuración efectiva. | Estas sondas comprueban disponibilidad del transporte y fallo cerrado, no autenticación real ni salud de todos los providers. |
| R4-05 | P2 | Logout G7 500 o pérdida de respuesta: ambas negativas eran aceptadas por el gate. Además, notificar limpieza antes de iniciar fetch permitía competir con la recarga del realm; regresión de orden falla antes. | Iniciar keepalive antes de notificar limpieza, sin esperar respuesta para borrar acceso local. Gate exige POST con refresh de sesión y 204 observado; nunca anuncia revocación efectiva. Comprueba atrás, acceso privado directo y recarga. | Dos negativas de frontera, positiva 204, prueba unitaria de orden y limpieza con 500 pendiente, dos E2E con fallo HTTP/red y cierre local. | 204 G7 es idempotente incluso para refresh desconocido/revocado. Revocación efectiva debe verificarla G7; Gateway verifica su política de access JWT. Respuesta perdida deja evidencia remota desconocida, sin reintento. |
| R4-06 | P2 | Una interfaz quedaba en `/cupones` y otra mostraba contenido de Cupones en `/precios`. Ambas negativas fallan antes: bastaba cualquier h1. | Exigir URL exacta `/precios`, h1 «Gestión de precios» y descripción propia. | Dos negativas de navegador y recorrido positivo en fixture/build real compilado. | Acredita navegación y contenido de Precios, no un provider Pricing operativo ni homologación de sus operaciones. |

## Archivos y justificación

- `scripts/release-session-evidence.mjs`: evidencia privada en memoria,
  secuencia G7, enlace Bearer, padres permitidos y confirmación de logout 204.
- `scripts/release-login-check.mjs`: integrar evidencia, exigir sondas válidas,
  URL/contenido de Precios y cierre local/remoto observado por separado.
- `scripts/release-login-policy.mjs`: restringir métodos, rutas y queries del recorrido.
- `scripts/verify-release-login.mjs`: mensaje de éxito limitado a lo observado;
  no afirmar revocación efectiva, MFA no ejercitado ni homologación general.
- `src/features/taxonomy/services/taxonomyGatewayRuntime.ts`: invalidación explícita
  de token contractual rechazado tras refresh.
- `src/features/bulk/adapters/httpBulkRepository.ts`: invalidación contractual
  en POST sin replay y preservación de 401 desconocidos tras GET renovado.
- `src/features/promotions/adapters/g7Session.ts`: iniciar revocación antes
  de la notificación que recarga, manteniendo limpieza local inmediata.
- `scripts/release-login-policy.test.mjs`,
  `scripts/testing/release-boundary.test.mjs`: negativas y positivos del gate.
- `src/features/taxonomy/services/taxonomyGatewayRuntime.test.ts`,
  `tests/bulk.unit.test.ts`, `src/features/auth/auth.test.ts`:
  regresiones de invalidación, preservación de sesión y orden del logout.
- `tests/auth-general.spec.ts`: dos E2E de logout HTTP 500/pérdida de respuesta.
- README, `docs/LOGIN_GENERAL.md`, este informe y
  `docs/ACEPTACION_BILATERAL_G7_MFA.md`: alcance, evidencia y aceptación externa.

## Reproducciones y preparación de pruebas

Antes de las correcciones: `node --test --test-concurrency=1
--test-name-pattern=R4- scripts/testing/release-boundary.test.mjs
scripts/release-login-policy.test.mjs`: **20 FAIL** esperados (13 navegador,
7 política). Taxonomía y Bulk con `vitest ... -t R4-03`: **1 FAIL** cada una.
Regresión de orden `vitest --config vitest.config.ts -t R4-05`:
**1 FAIL** antes de cambiar el logout. Estos resultados demuestran los defectos,
no son validaciones finales fallidas.

Se ejecutaron también las **10 unitarias nuevas definitivas** sobre una copia
temporal de `git archive d247dd6`, sin modificar la rama: Taxonomía 1 FAIL /
2 PASS; Bulk 3 FAIL / 3 PASS (incluye cierre indebido ante segundo 401 desconocido
o ilegible); logout 1 FAIL. Sobre el código corregido, las 10 pasan en `npm test`.

Durante la preparación E2E se corrigió un selector ambiguo de los dos `nav`.
Los nuevos controles de logout también hicieron visible la carrera de la petición
con la recarga. En el contexto recién creado, atrás podía terminar legítimamente
en `about:blank`, o volver a `/cupones` mostrando únicamente el formulario de
login: el verificador inicialmente exigía siempre URL `/login` y fallaba.
Ahora exige formulario de ingreso y ausencia del shell en la ruta anterior,
salvo el historial vacío; además comprueba la entrada privada directa y su
redirección a `/login`, seguida de recarga. Se espera que
la recarga existente termine antes de enviar atrás. No se modifica el router ni
se introducen reintentos para ocultar estos fallos del arnés.

## Validaciones finales

Node **22.23.4**, npm **10.9.9**. Evidencias Playwright en directorios temporales
`%TEMP%/g6-r4-evidencias/`; ningún E2E sobrescribe capturas versionadas.
Logs locales `auditoria-r4-*.log`, ignorados por Git, sin credenciales reales.

| Comando | Resultado |
|---|---|
| `npm ci` | PASS: 255 paquetes instalados, 256 auditados; 11 vulnerabilidades previas (10 moderadas, 1 alta). Sin cambios de lockfile ni actualizaciones automáticas. |
| `npm run typecheck` | PASS. |
| `npm run lint` | PASS, sin errores ni advertencias ESLint. |
| `npm test` | PASS: 480 Vitest (89 Combos/Promociones/Auth, 67 Bulk, 104 Inventory adapters, 4 Inventory hooks, 155 Pricing, 61 Taxonomía) + 31 Node política/CLI = 511. Conserva los 470 anteriores, agrega 10. |
| `npm run test:release:boundary` | PASS: 23 pruebas de frontera/protocolo. |
| `VITE_DATA_MODE=mock npm run build` | PASS. |
| `VITE_DATA_MODE=api npm run build` | PASS. |
| `npm run test:production:auth` | PASS: 59 rutas anónimas por modo, 58 vistas mock, escritura Pricing simulada, 28 comprobaciones adicionales y gate contractual aislado API. |
| Playwright completo, shards 1/3, 2/3, 3/3, workers=1 | PASS: 588 aprobadas, 6 omitidas, 0 fallos, 594 totales. Shard 1: 208 PASS (12,8 min); shard 2: 192 PASS (7,4 min); shard 3: 188 PASS y 6 SKIP (15,8 min). |
| `npm run test:e2e:pricing -- --workers=1` | PASS: 6 E2E HTTP aislados. |
| Dos E2E nuevos de logout (`--grep R4-05`) | PASS: 2. |
| `git diff --check` | PASS. |

La revisión visual de UI nueva no aplica: no se modifica CSS, layout, formularios
ni páginas comerciales. Se conservan los controles visuales y de foco de R2
en la suite E2E, incluida la comprobación automatizada a 1440 px. No se hizo
revisión manual nueva. Los seis SKIP pertenecen a los runners que requieren
Gateway/Promotions, PostgreSQL/TLS y configuración externa; no son PASS.

## Límites, commits y estado de entrega

**MOCK_INTEGRATED / validación contractual aislada. No homologación G7 real,
no preparación para H4, no listo para merge.**

NO EJECUTADOS: credenciales genuinas, desafío MFA real con operador, firma/JWKS,
TLS/CORS compartidos, revocación efectiva de refresh y autorización JWT en
Backend/Gateway reales. El procedimiento bilateral distingue cada evidencia.
Las limitaciones de integración de Pricing, Inventario, Combos y otros providers
anteriores siguen vigentes. Ningún secreto se introduce en Vite ni se exporta.

Implementación y pruebas: `d9ccf1c628edea08c5a3fc6e589d291f367d8680`,
`fix(auth): verificar acceso y cierre con evidencia contractual`.
Este informe se registra en `docs(auth): registrar la cuarta auditoría del PR 70`.
El SHA final y los checks de ese SHA se consultan en el
[PR #70](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/pull/70/checks).
Los siete checks verdes del HEAD anterior no se atribuyen a esta revisión.
`.gitignore` previo queda fuera de los commits.
