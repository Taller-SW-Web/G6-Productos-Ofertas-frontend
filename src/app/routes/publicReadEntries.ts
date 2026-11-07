// Existing pages without an administrative read contract use the explicit
// commercial/read-only view. Forms and mutation routes keep their auth boundary.
export const publicReadEntries: Readonly<Record<string, string>> = {
  "/productos": "listarProductos",
  "/combos": "listarCombosAdmin",
  "/precios": "consultarPrecios",
  "/precios/historico": "obtenerPrecioSku",
  "/precios/programaciones": "listarProgramacionesPrecioSku",
  "/precios/auditoria": "listarAuditoriaPrecios",
  "/inventario": "consultarDisponibilidad",
  "/inventario/umbrales": "obtenerUmbralesInventario",
  "/inventario/traslados": "listarTrasladosInventario",
  "/inventario/dashboard": "obtenerDashboardInventario",
};
