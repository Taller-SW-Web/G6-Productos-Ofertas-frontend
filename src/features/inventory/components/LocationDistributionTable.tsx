import { Button, Group, Skeleton, Table, Text } from "@mantine/core";
import {
  EmptyState,
  FeedbackAlert,
  SectionCard,
  StatusBadge,
} from "../../../components/shared";
import type { LocationDistribution } from "../services/inventoryTypes";

interface LocationDistributionTableProps {
  distribution: LocationDistribution[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function LocationDistributionTable({
  distribution,
  loading,
  error,
  onRetry,
}: LocationDistributionTableProps) {
  if (error) {
    return (
      <SectionCard title="Distribución de stock por ubicación física">
        <FeedbackAlert
          semantic="error"
          title="No se pudo cargar la distribución por ubicación"
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
      </SectionCard>
    );
  }

  if (loading) {
    return (
      <SectionCard title="Distribución de stock por ubicación física">
        <Skeleton height={140} radius="sm" />
      </SectionCard>
    );
  }

  if (distribution.length === 0) {
    return (
      <SectionCard title="Distribución de stock por ubicación física">
        <EmptyState
          title="Sin ubicaciones para los filtros aplicados"
          description="Ajusta o limpia los filtros para ver la distribución de stock por centro logístico."
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Distribución de stock por ubicación física"
      description="Consolidado de unidades físicas, reservas, bloqueos y disponibilidad por centro logístico."
    >
      <Table highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Ubicación</Table.Th>
            <Table.Th style={{ textAlign: "right" }}>Físico</Table.Th>
            <Table.Th style={{ textAlign: "right" }}>Reservado</Table.Th>
            <Table.Th style={{ textAlign: "right" }}>Bloqueado</Table.Th>
            <Table.Th style={{ textAlign: "right" }}>Disponible</Table.Th>
            <Table.Th>SKUs por estado</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {distribution.map((dist) => (
            <Table.Tr key={dist.locationId}>
              <Table.Td>
                <Text size="sm" fw={600}>
                  {dist.locationName}
                </Text>
                <Text size="xs" c="dimmed">
                  Código: {dist.locationId}
                </Text>
              </Table.Td>
              <Table.Td style={{ textAlign: "right" }} fw={600}>
                {dist.onHandTotal}
              </Table.Td>
              <Table.Td style={{ textAlign: "right" }}>
                {dist.reservedTotal}
              </Table.Td>
              <Table.Td style={{ textAlign: "right" }}>
                {dist.blockedTotal}
              </Table.Td>
              <Table.Td style={{ textAlign: "right" }} fw={700}>
                {dist.availableTotal}
              </Table.Td>
              <Table.Td>
                <Group gap={8}>
                  <StatusBadge semantic="success" size="sm">
                    {dist.skusAvailableCount} disp.
                  </StatusBadge>
                  {dist.skusLowStockCount > 0 && (
                    <StatusBadge semantic="warning" size="sm">
                      {dist.skusLowStockCount} bajo
                    </StatusBadge>
                  )}
                  {dist.skusOutOfStockCount > 0 && (
                    <StatusBadge semantic="error" size="sm">
                      {dist.skusOutOfStockCount} agot.
                    </StatusBadge>
                  )}
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </SectionCard>
  );
}
