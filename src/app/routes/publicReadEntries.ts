// Administrative screens keep their original routes and behaviour in every
// mode. In API mode they only add an explicit notice: the related contractual
// read is available in /consultas, and the limitation of the administrative
// integration is stated instead of silently replacing the screen.
export interface ConsultaEntry {
  operationId: string;
  limitation: string;
}

const pricingAdapter = "El adaptador administrativo HTTP de Precios aún no está conectado en este frontend; la pantalla muestra su propio estado en modo API.";
const inventoryAdapter = "La integración administrativa HTTP de Inventario aún no está habilitada en este frontend; la pantalla mantiene su cierre explícito en modo API.";

export const consultaEntries: Readonly<Record<string, ConsultaEntry>> = {
  "/productos": {
    operationId: "listarProductos",
    limitation: "No hay contrato de lectura administrativa de Catálogo: la consulta comercial no publica estado ni versión, por lo que no alimenta la gestión de borradores.",
  },
  "/combos": {
    operationId: "listarCombosAdmin",
    limitation: "La integración administrativa HTTP de Combos aún no está habilitada en este frontend; la pantalla mantiene su cierre explícito en modo API.",
  },
  "/precios": { operationId: "consultarPrecios", limitation: pricingAdapter },
  "/precios/historico": { operationId: "obtenerPrecioSku", limitation: pricingAdapter },
  "/precios/programaciones": { operationId: "listarProgramacionesPrecioSku", limitation: pricingAdapter },
  "/precios/auditoria": {
    operationId: "listarAuditoriaPrecios",
    limitation: "El adaptador HTTP de Auditoría de precios aún no está conectado en este frontend; la pantalla muestra su propio estado en modo API.",
  },
  "/inventario": { operationId: "consultarDisponibilidad", limitation: inventoryAdapter },
  "/inventario/umbrales": { operationId: "obtenerUmbralesInventario", limitation: inventoryAdapter },
  "/inventario/traslados": { operationId: "listarTrasladosInventario", limitation: inventoryAdapter },
  "/inventario/dashboard": { operationId: "obtenerDashboardInventario", limitation: inventoryAdapter },
};

export const publicReadEntries: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(consultaEntries).map(([path, entry]) => [path, entry.operationId]),
);

export const consultaHref = (operationId: string) =>
  `/consultas?operacion=${encodeURIComponent(operationId)}`;
