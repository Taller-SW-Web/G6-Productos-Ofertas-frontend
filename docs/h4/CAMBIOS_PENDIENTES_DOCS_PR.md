# Propuesta de cambios para Docs

**PENDIENTE_APROBACION_DOCS.** Propuestas para revisión por los owners. La referencia de partida es `contratos/http/openapi.yaml` en Docs `aba8d1c`.

1. **Catálogo/Taxonomía.** Mantener los DTO de lectura comercial y agregar una capacidad administrativa con estado y versión, incluyendo borradores e inactivos. Definir el metadato identificador en el esquema de tipo. Criterio: creación, recarga, lectura y edición con la misma identidad y versión, sin deducir atributos a partir de obligatoriedad.
2. **Pricing/Gateway.** Documentar la procedencia de los UUID de canal y las operaciones de lectura que acreditan una definición editable. Verificar ausencia de UUID, autorización, versión por canal y el caso 503 de introspección.
3. **Inventario.** Resolver la discrepancia de los filtros de Catálogo en `obtenerDashboardInventario`. Publicar las capacidades de SKU físicos, ubicaciones y alertas si los owners las acuerdan. Mantener la autorización e idempotencia de recepción. Probar agregados filtrados y recepción repetida sin efecto duplicado.
4. **Combos.** Precisar la fuente de disponibilidad y el estado sin verificación. Definir una vía para acreditar una alta de respuesta perdida. Mantener el importe en PEN y la cantidad contractual de cada componente.
5. **Promociones/Bulk/Auditoría.** Formalizar los grants efectivos y la correspondencia de identidad de las respuestas 2xx con el recurso solicitado. Acordar una recuperación inequívoca antes de habilitar reenvíos de escrituras inciertas. Aclarar el protocolo de reanudación Bulk y la nulabilidad de Auditoría.
6. **UX transversal.** `ux/mockups/DESIGN.md` y `ux/mockups/ux/ux-guidelines.md` mantienen vigencia. Propuesta de navegación: entrada por Productos, con destino interno preservado tras login. Validar navegación con teclado y a 1440 px.

Véanse las dependencias y el registro de pruebas de esta carpeta para el impacto, owners y escenarios verificables.
