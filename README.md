# Productos y Ofertas — Frontend

> Aplicación web del módulo **Productos y Ofertas** del proyecto de Taller de Construcción de Software Web.
>
> **Estado inicial:** repositorio preparado para comenzar la implementación. Este README describe las convenciones objetivo; no afirma que el código, las dependencias o las integraciones ya existan. Comprobar el árbol real antes de ejecutar comandos.

## 1. Propósito

Este repositorio alojará **únicamente el frontend productivo** del módulo Productos y Ofertas. Su responsabilidad será presentar las interfaces y orquestar interacciones de usuario mediante servicios/adapters, sin asumir autoridad sobre reglas de negocio, inventario, precios, cupones ni estados transaccionales.

El frontend se construirá de forma incremental a partir de las **16 funcionalidades** documentadas (MK-001 a MK-016), reutilizando el Design System oficial y manteniendo una frontera clara entre presentación, lógica de UI e integración.

**No es:** el repositorio de documentación, el backend de los microservicios, un lugar para duplicar contratos OpenAPI/AsyncAPI, ni el entorno académico de prototipado HTML.

## 2. Organización local: tres repositorios independientes

Clonar los tres repositorios como **carpetas hermanas** dentro de un directorio de trabajo local sin `.git` propio:

```text
G6-Productos-Ofertas/                     # Workspace local; NO es otro repositorio Git
├── frontend/                       # Este repositorio: su propio .git/
│   ├── .git/
│   ├── README.md
│   ├── AGENTS.md
│   └── ...
├── backend/                        # Repositorio Backend: su propio .git/
│   └── .git/
└── docs/                           # Repositorio Docs: su propio .git/
    ├── .git/
    ├── requisitos/
    ├── contratos/
    └── ux/
```

**Importante:** no agregar `../docs` o `../backend` al `.gitignore` del frontend. Están fuera de su árbol de trabajo y Git no intentará incluirlos. El `.gitignore` de este repositorio cubre solo archivos **dentro de `frontend/`** (por ejemplo `node_modules/`, `dist/`, `.env.local`). Tampoco crear submódulos Git ni copiar todo Docs al frontend.

Para trabajar con agentes que consultan documentación, **abrir `G6-Productos-Ofertas/` como carpeta de trabajo** o configurar un workspace de VS Code que incluya los tres directorios. El agente debe disponer de permiso de lectura de `docs/`; `gitignore` **no concede ni revoca permisos** de acceso a archivos.

### Verificación local en Windows PowerShell

Ejecutar desde `frontend/`:

```powershell
# El Git del frontend debe apuntar solo a frontend/
git rev-parse --show-toplevel
git status --short

# El Git de Docs es independiente: consultas de solo lectura
git -C ..\docs rev-parse --show-toplevel
git -C ..\docs rev-parse --short HEAD

# Comprobar la fuente visual sin copiarla
Test-Path ..\docs\ux\mockups\DESIGN.md
```

Si se trabaja desde un agente remoto que recibe **solo** el checkout del frontend, `../docs` no existirá automáticamente. En ese caso deberá habilitarse un segundo checkout de Docs de **solo lectura**, o consultar los documentos desde el repositorio oficial. No se deben inventar contenidos ante archivos inaccesibles.

## 3. Documentación oficial: fuente de verdad fuera de Frontend

Repositorio canónico: [Taller-SW-Web/Productos-y-Ofertas-docs](https://github.com/Taller-SW-Web/Productos-y-Ofertas-docs) (`master`).

| Fuente | Ruta dentro del repositorio `docs/` | Uso |
|---|---|---|
| Design System de alta fidelidad | `ux/mockups/DESIGN.md` | Tokens, colores, tipografía, composición, componentes y estados visuales. |
| UX transversal | `ux/mockups/ux/propuesta-ux.md` | Enfoque UX adoptado para el módulo. |
| Decisiones UX | `ux/mockups/ux/ux-decisions.md` | Decisiones transversales y justificaciones. |
| Guía UX | `ux/mockups/ux/ux-guidelines.md` | Interacción, consistencia, accesibilidad y alcance. |
| Mockup por funcionalidad | `ux/mockups/MK-XXX/` | `component-spec.md`, `plan.md`, `tasks.md`, `prototipo/` y, cuando exista, `validation-report.md`. |
| Requisitos | `requisitos/specs/`, `requisitos/hu/`, `requisitos/flujos/` | Comportamiento de negocio y flujos. |
| Wireframes | `ux/wireframes/` | Estructura previa; **no** utilizar su Design System de baja fidelidad para React. |
| HTTP | `contratos/http/openapi.yaml` | Contrato público HTTP del módulo. |
| Mensajería | `contratos/eventos/asyncapi.yaml` | Contrato asíncrono cuando corresponda. |
| Errores y pruebas contractuales | `contratos/http/catalogo-errores.md`, `contratos/pruebas/` | Semántica de errores y pruebas. |
| Responsabilidades | `EQUIPO_Y_RESPONSABILIDADES.md` | Owners funcionales y revisiones transversales. |

Enlace directo: [Design System de mockups](https://github.com/Taller-SW-Web/Productos-y-Ofertas-docs/blob/master/ux/mockups/DESIGN.md).

### Reglas de autoridad

- **Reglas funcionales:** SPEC, HU y flujos aprobados; no derivarlas del aspecto visual del HTML.
- **Contratos de integración:** OpenAPI/AsyncAPI y acuerdos del provider; no crear rutas, scopes ni estados desde el frontend.
- **Apariencia y patrones UX:** propuesta UX, decisiones, guías y `DESIGN.md`; el HTML puede contener errores visuales.
- **Pantallas de una funcionalidad:** inventario de MK y `component-spec.md`; revisar su estado en `validation-report.md` si existe.
- **Implementación técnica React:** este repositorio, su `AGENTS.md` y las decisiones de arquitectura frontend aprobadas.

**No hay un segundo Design System React.** React/Mantine debe **materializar** los tokens y patrones de Docs. Si cambia `DESIGN.md`, se evalúa su efecto en `src/theme/` y componentes compartidos.

## 4. Tecnología y alcance de la primera entrega

**Stack objetivo inicial (a materializar en la Frontend UI Foundation):** React, TypeScript, Vite, Mantine y Tabler Icons. No asumir que una dependencia está instalada hasta comprobar `package.json`. El mecanismo de routing, pruebas y fetching deberá quedar documentado cuando se implemente la base.

**Alcance UX vigente en Docs:** **Web Desktop**. El viewport canónico de revisión es **1440 px**. No imponer pantallas mobile/tablet ni rediseños responsive sin un acuerdo adicional. Sí evitar desbordes, cortes, pérdida de controles y fallas de accesibilidad dentro del alcance desktop.

La implementación comienza por una **Frontend UI Foundation v1**, responsabilidad transversal de UX con revisión técnica independiente, y luego continúa con las funcionalidades por owner. La foundation **no** incluye implementar todos los MK ni integrar APIs cuyo contrato tenga P0 abiertos.

## 5. Estructura técnica prevista

> Es la **estructura objetivo**, no una declaración de archivos existentes. Si ya hay una base funcional, evolucionarla sin destruirla.

```text
frontend/
├── README.md
├── AGENTS.md
├── docs/                            # Solo guías de implementación frontend
│   └── GUIA_IMPLEMENTACION_FRONTEND_REACT.md  # Opcional/futura
├── src/
│   ├── app/                         # Providers, router, AppShell y bootstrap
│   ├── theme/                       # Traducción fiel de DESIGN.md a Mantine
│   │   ├── theme.ts
│   │   ├── tokens.ts
│   │   └── component-defaults.ts
│   ├── components/shared/           # Patrones visuales realmente transversales
│   ├── features/                    # Capacidades de UI agrupadas por dominio
│   │   ├── bulk/
│   │   ├── combos/
│   │   ├── catalog/
│   │   ├── promotions/
│   │   ├── taxonomy/
│   │   ├── pricing/
│   │   ├── price-audit/
│   │   └── inventory/
│   ├── services/                    # Casos de uso de UI / interfaces
│   ├── adapters/                    # Implementaciones HTTP o mock
│   ├── mocks/                       # Fixtures deterministas de demostración
│   ├── types/                       # Tipos compartidos estrictamente necesarios
│   └── utils/
├── package.json                     # Cuando se inicialice la aplicación
└── ...
```

La organización exacta podrá ajustarse en la PR de foundation; se debe **preservar la separación** `UI → hooks/use cases → interfaces/services → adapters → mock/API` y evitar carpetas/clases vacías sin necesidad real. **Los MK son referencias de trazabilidad**, no una obligación de crear una carpeta `MK-XXX` por pantalla productiva.

### Agrupación funcional

- **MK-001:** Bulk.
- **MK-002:** Combos.
- **MK-003–004:** Catalog.
- **MK-005–007:** Promotions.
- **MK-008–012:** Taxonomy.
- **MK-013:** Pricing.
- **MK-014:** Price Audit.
- **MK-015–016:** Inventory.

Los owners actuales deben verificarse en `docs/EQUIPO_Y_RESPONSABILIDADES.md` y en el issue asignado.

## 6. Desarrollo por niveles de avance

No equiparar una pantalla dibujada con una integración funcional.

| Estado | Criterio |
|---|---|
| `UI_COMPLETE` | Componentes, navegación/interacciones locales y fidelidad visual revisadas. |
| `MOCK_INTEGRATED` | UI conectada a servicios/interfaces y adapters mock tipados. |
| `API_INTEGRATED` | Adapter real conectado a contratos confirmados y control de permisos adecuado. |
| `VALIDATED` | Pruebas técnicas, visuales y de integración pertinentes ejecutadas y aprobadas. |
| `BLOCKED_CONTRACT` | El contrato necesario está pendiente; la UI puede seguir evolucionando con mocks sin afirmar integración real. |

Un MK con errores puramente visuales menores puede usarse como base **si se implementa la regla vigente de `DESIGN.md`**, dejando constancia de la divergencia. Un MK con flujo crítico incompleto, ausencia de datos obligatorios o validación no aprobada no debe etiquetarse falsamente como terminado.

## 7. Política de integración y mocks

- No hacer `fetch()` en páginas ni componentes presentacionales.
- No colocar datos de prueba grandes hardcodeados dentro del JSX.
- No asumir que `CREADO` significa que un pedido está listo para pago.
- No asumir que código de barras = SKU, que product ID = SKU, ni que store code = UUID de ubicación.
- No consumir saldos internos de Inventory desde canales que solo tienen derecho a disponibilidad comercial.
- No ejecutar lógica autoritativa de precio, cupón, pago, stock o reembolso en el navegador.
- Ante un contrato intermodular P0 pendiente, utilizar un **modelo de UI y mock adapter** sin inventar el endpoint final ni representar la integración como terminada.

Los mocks son simulaciones; deben estar **aislados** y poder sustituirse por un adapter HTTP sin reescribir componentes visuales.

## 8. Cómo arrancar localmente

Primero confirmar si la aplicación ya fue inicializada:

```powershell
Test-Path .\package.json
```

Si `package.json` **no existe**, todavía no hay proyecto ejecutable: la inicialización corresponde al issue **Frontend UI Foundation**; no ejecutar comandos `npm` suponiendo archivos inexistentes.

Si existe y contiene los scripts correspondientes, desde `frontend/`:

```bash
npm install
npm run dev
npm run build
npm run lint
```

Usar `npm ci` en lugar de `npm install` si ya hay `package-lock.json` y se quiere instalación reproducible. `npm run test` / `npm run typecheck` solo si se han definido esos scripts. Mantener un gestor de paquetes por repositorio; no mezclar lockfiles.

Las variables `.env*` locales pueden incluir configuración **no secreta** para URL base y selección de mocks. Nunca subir tokens, contraseñas, claves privadas ni credenciales al bundle frontend.

## 9. Flujo de trabajo por funcionalidad

1. Leer `AGENTS.md` y las fuentes documentales correspondientes.
2. Verificar qué pantallas MK existen, su estado de validación, qué reglas siguen abiertas y qué componentes ya hay implementados.
3. Identificar componentes existentes reutilizables **antes** de crear variantes nuevas.
4. Definir modelos de presentación y límites de integración; priorizar mocks tipados cuando el backend aún no esté preparado.
5. Implementar pantallas/interacciones conforme a SPEC/HU/Flow y `DESIGN.md`, sin copiar defectos visuales del prototipo.
6. Validar estados `loading`, `empty`, `error`, `success`, `disabled` cuando apliquen.
7. Ejecutar las pruebas disponibles, revisar visualmente a 1440 px y registrar evidencia.
8. En la PR indicar MK/SXX implementados, componentes reutilizados, diferencias detectadas y estado real de integración.

**No modificar el repositorio Docs o Backend desde tareas del frontend.** Los cambios de especificación y contratos se proponen al owner correspondiente mediante issue/PR independiente.

## 10. Criterios de aceptación de la Frontend UI Foundation v1

- Proyecto React+TypeScript inicializado y ejecutable.
- Mantine/Tabler configurados sin duplicar el Design System.
- Theme centralizado y trazable a `docs/ux/mockups/DESIGN.md`.
- AppShell, navegación y componentes shared **mínimos y realmente reutilizados**.
- Arquitectura que permita alternar mock/API mediante adapters.
- Un MK piloto seleccionado explícitamente, con pantallas/estados de referencia y sin asumir aprobación de mockups pendientes.
- Revisión visual desktop 1440 px y accesibilidad básica.
- Scripts de build/lint/typecheck/tests según los mecanismos definidos para el repositorio.
- Documentación suficiente para que otro owner implemente una feature sin recrear el theme o inventar decisiones.
- Revisión técnica distinta de la revisión UX antes de declarar la base estable.

## 11. Reglas obligatorias para agentes

**Leer [`AGENTS.md`](AGENTS.md) antes de crear o modificar archivos.** Define un procedimiento de trabajo detallado, fuentes, prohibiciones, comandos de comprobación y formato de entrega. Si `docs/GUIA_IMPLEMENTACION_FRONTEND_REACT.md` se añade más adelante, complementará estas reglas; **no se presume existente** ni sustituye a `AGENTS.md`.

## 12. Estado y límites conocidos

- `docs/ux/mockups/` contiene prototipos HTML destinados al proceso documental de alta fidelidad, **no** el frontend productivo.
- Algunos mockups todavía tienen diferencias visuales frente a `DESIGN.md`; otros pueden estar sin aprobación completa. Verificar el estado real por funcionalidad.
- La separación de contratos entre módulos todavía tiene decisiones abiertas; no convertir propuestas de integración en garantías reales sin evidencia.
- El repositorio Frontend no debe permanecer bloqueado por estos P0 para comenzar estructura, UI, navegación, theme y mocks, pero no debe declarar esas integraciones `VALIDATED`.

---

**Principio rector:** el repositorio Docs define **qué** se debe construir; Frontend define **cómo** construirlo en React sin suplantar al backend ni introducir otra fuente de verdad visual.
