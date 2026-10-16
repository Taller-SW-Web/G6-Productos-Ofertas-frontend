import { Button, SimpleGrid, Skeleton } from "@mantine/core";
import { FeedbackAlert, MetricCard } from "../../../components/shared";
import type { InventoryKpiSummary } from "../services/inventoryTypes";

interface DashboardKpiGridProps {
  kpis: InventoryKpiSummary | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function DashboardKpiGrid({
  kpis,
  loading,
  error,
  onRetry,
}: DashboardKpiGridProps) {
  if (error) {
    return (
      <FeedbackAlert
        semantic="error"
        title="No se pudieron cargar los indicadores"
        actions={
          onRetry && (
            <Button size="xs" variant="outline" onClick={onRetry}>
              Reintentar
            </Button>
          )
        }
      >
        {error}
      </FeedbackAlert>
    );
  }

  if (loading || !kpis) {
    return (
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} height={130} radius="sm" />
        ))}
      </SimpleGrid>
    );
  }

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg" aria-label="Indicadores de inventario">
      {/* Fila 1: Saldos principales */}
      <MetricCard
        label="Unidades disponibles"
        value={kpis.availableUnits}
        description="Aptas para venta comercial en todos los canales"
      />
      <MetricCard
        label="Unidades bloqueadas"
        value={kpis.blockedUnits}
        description="En cuarentena física por incidencia o reclamo"
      />
      <MetricCard
        label="Unidades físicas totales"
        value={kpis.totalPhysicalUnits}
        description="Suma física contabilizada en todas las ubicaciones"
      />

      {/* Fila 2: Conteo de SKUs por estado */}
      <MetricCard
        label="Total SKUs vendibles"
        value={kpis.totalVendibleSkus}
        description="Artículos activos con catálogo y SKU asignado"
      />
      <MetricCard
        label="SKUs Disponibles"
        value={kpis.skusAvailable}
        description="Con saldo mayor a su umbral de stock bajo"
      />
      <MetricCard
        label="SKUs con Stock bajo"
        value={kpis.skusLowStock}
        description="Saldo disponible menor o igual a umbral resuelto"
      />

      {/* Fila 3: Riesgos y reservas */}
      <MetricCard
        label="SKUs Agotados"
        value={kpis.skusOutOfStock}
        description="Sin unidades disponibles para venta"
      />
      <MetricCard
        label="Unidades reservadas"
        value={kpis.reservedUnits}
        description="Comprometidas activamente por pedidos pendientes"
      />
      <MetricCard
        label="Traslados pendientes totales"
        value={kpis.totalPendingTransfers}
        description="Movimientos entre almacenes sin recepción final"
      />

      {/* Fila 4: Estados operativos de traslados */}
      <MetricCard
        label="Traslados en tránsito"
        value={kpis.transfersInTransit}
        description="En despacho interprovincial o ruta logística"
      />
      <MetricCard
        label="Traslados recibidos parcialmente"
        value={kpis.transfersPartiallyReceived}
        description="Con entregas pendientes de completar en destino"
      />
      <MetricCard
        label="Traslados con discrepancia"
        value={kpis.transfersWithDiscrepancy}
        description="Cerrados con unidades faltantes o mermas"
      />
    </SimpleGrid>
  );
}
