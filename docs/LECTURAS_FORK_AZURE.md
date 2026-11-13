# Consultas mínimas del fork sobre Azure

La ruta `/consultas`, accesible desde el menú del modo API, reúne las
58 operaciones GET externas de OpenAPI `0.6.0-rc.3`, Docs
`aba8d1ca998cfcd2db1c4fa87654036a5a4c1ac1`. Incluye listados, detalle, filtros,
paginación contractual, seguimiento y descargas existentes de los ocho servicios.
La operación interna `obtenerContextoSku` y todas las mutaciones están excluidas.
No crea importaciones, exportaciones ni datos de prueba.

Se reutilizan el login y la sesión G7 en memoria para entrar a la vista.
Por instrucción del usuario se conserva el modo académico PUBLIC_READ_ONLY ya
activo en Azure: estos GET se envían sin bearer, después de comprobar la sesión
de UI. Esto no cambia permisos del backend ni concede acceso a consultas que
este rechace. No se reintenta anónimamente una solicitud con bearer rechazado.
Actualización del 12/11/2026: los transportes administrativos de Catálogo,
Taxonomía, Promociones y Bulk vuelven a enviar el JWS de G7 también en GET,
porque Azure ya valida esa identidad. `/consultas` conserva su cliente público
separado: sus GET no fuerzan renovación ni invalidan la sesión por rechazo.
Las escrituras siguen autenticadas y nunca se reenvían automáticamente. La vista de lectura comercial exige seleccionar el canal para productos y precios: al no
enviar JWT, el backend no puede deducir el contexto de un gestor humano.
El cliente valida el `Content-Type` de cada respuesta contra los formatos permitidos
por la operación (incluido `application/json`) y exige parámetros `date-time`
RFC 3339 completos con zona horaria. La vista identifica los filtros confirmados
del último resultado y advierte cuando el usuario modifica los filtros antes de
volver a consultar. No hay fallback mock ni se inventan campos administrativos.
El resultado se muestra con los campos del servicio, distinguiendo null, cero,
colección vacía, error y último resultado confirmado. Las colecciones se limitan
visualmente a 200 filas; el usuario puede aplicar la paginación del servicio.

En modo API, las diez pantallas administrativas de productos, combos, precios,
auditoría e inventario conservan sus rutas y funcionalidades originales sin ser
sustituidas por `ReadOnlyPage`, y muestran explícitamente la limitación del
contrato administrativo disponible junto con un enlace directo a
`/consultas?operacion=...` para las lecturas adicionales. Los formularios de
escritura, la demostración local y el guard de login se conservan. El recorrido
de lectura no certifica las escrituras. Azure ya verificó G7 y creación/edición
QA de promoción y cupón; esto no homologa todas las pantallas, las lecturas
administrativas de Catalog ausentes ni los flujos AMQP.

`vercel.json` define valores por defecto (`${VAR:-default}`) para el build API y
las dos URLs públicas sin sobrescribir variables configuradas por entorno en
Vercel. No son secretos. Los secretos y JWT no forman parte del build. En dominios `vercel.app`,
las llamadas a Azure y G7 pasan por rewrites de mismo origen para evitar CORS,
sin cambiar sus destinatarios finales. Las respuestas dinámicas usan no-store.
Fuera de Vercel se mantienen los orígenes explícitos configurados.

Las lecturas esperan hasta 65 segundos y conservan cancelación manual. En Azure
se observaron arranques desde cero de 26–36 segundos; Gateway admite hasta 60
segundos para la respuesta del servicio. Este ajuste mantiene las imágenes,
réplicas mínimas y autenticación existentes.

Esta entrega conserva imágenes e infraestructura existentes. La compilación y
las pruebas del consumidor no acreditan que los 58 endpoints respondan con los
roles disponibles ni que las dependencias de Azure estén listas. Los permisos,
datos, integraciones M2M y endpoints no desplegados pueden rechazar consultas;
se muestra el error real. Para validar producción se necesita una sesión G7
legítima y el deployment nuevo de master del fork.
