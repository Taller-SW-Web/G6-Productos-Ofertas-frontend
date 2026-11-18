# Happy path: login y lecturas reales de Azure

Recorrido de 3–5 minutos. Usar https://g6-productos-ofertas.vercel.app/consultas
con una cuenta G7 habilitada para el panel. El login se conserva; los GET de
lectura usan el modo PUBLIC_READ_ONLY existente de Azure, sin JWT al backend.
No compartir contraseña, OTP ni tokens durante la demostración.

## Preparación

Abrir `/consultas`, iniciar sesión y dejar la sesión abierta. Antes de presentar,
realizar una consulta por cada módulo que se mostrará: Azure puede arrancar los
servicios después de un período de inactividad. El ajuste de espera de 65 segundos
del frontend requiere el último despliegue del PR #74; Gateway ya espera 60.
Si aparece un error, no presentarlo como una lista vacía: volver a consultar y
continuar únicamente cuando se vea un resultado confirmado.

## Recorrido principal

| Paso | Módulo y consulta | Valores | Resultado a mostrar |
|---|---|---|---|
| 1 | Catálogo → Listar y buscar productos comercialmente activos | Canal: MARKETPLACE; Página: 1; Resultados por página: 5; demás campos vacíos | Productos reales con nombre, identificadores y SKU base. No atribuirles campos administrativos que la API no devuelve. |
| 2 | Taxonomía → Listar categorías activas | Sin filtros | Colección `categories`; en la verificación había 8 categorías. |
| 3 | Taxonomía → Listar tipos de producto | Página: 1; Resultados por página: 20 | Colección `items` y paginación; en la verificación había 6 tipos. |
| 4 | Precios → Consultar precios vigentes de varios SKU | Copiar los SKU de abajo; Canal: MARKETPLACE; Instante de consulta vacío | Cuatro precios reales en PEN. Distinguir precio regular de oferta; `null` no es una oferta de cero. |
| 5 | Inventario → Consultar umbral global y overrides por SKU | Sin filtros | `umbralGlobal` y `overrides`, sin realizar ajustes de stock. |
| 6 | Carga masiva → Descargar plantilla vacía v2 | Formato: CSV | Consultar y después pulsar Guardar; abrir el CSV descargado y mostrar sus cabeceras. No importar archivos. |

SKU para el paso 4, separados por comas:

```text
ADI-MESSI-JI8291-05,NIK-ACADEMY-HV4386-05,NIK-PITCH-05,PUM-ORBITA-084641-05
```

Precios regulares observados el 7 de noviembre de 2026: 79, 129.90, 89.90 y
119 PEN, respectivamente. Los datos pueden cambiar; mostrar la respuesta real
obtenida al pulsar Consultar, no estos valores como una garantía permanente.

Frase sugerida: «Entramos con una sesión válida, consultamos datos reales de
catálogo y taxonomía, recuperamos precios por SKU y descargamos una plantilla.
Este recorrido demuestra lectura integrada; no modifica información».

## Límite de la demostración

No incluir crear/editar productos, activar promociones, cargar importaciones,
crear exportaciones, modificar precios o mover stock: no forman parte del alcance
de lectura verificado. Las escrituras conservan JWT y siguen dependiendo de la
validación G7 de Azure. Tampoco presentar como probado cada uno de los 58 GET:
se verificó una lectura por servicio y los casos indicados en este recorrido.

La entrada principal es `/consultas`, que el usuario ya confirmó con categorías
reales. Las entradas del menú que usan la vista mínima de lectura y el ajuste de
GET públicos de los adaptadores existentes requieren publicar el último SHA del
PR https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/pull/74.
