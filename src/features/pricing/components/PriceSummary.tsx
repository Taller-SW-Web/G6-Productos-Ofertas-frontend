import { Group, SimpleGrid, Text } from "@mantine/core";
import {
  MetricCard,
  SectionCard,
  StatusBadge,
} from "../../../components/shared";
import type { PriceView } from "../services/pricingRepository";
import { priceOriginLabel } from "../services/pricePresentation";
export function PriceSummary({ price }: { price: PriceView }) {
  return (
    <SectionCard
      title={price.name}
      actions={
        <Group gap="sm">
          <StatusBadge>{priceOriginLabel(price)}</StatusBadge>
          <StatusBadge>
            {price.channel === "global" ? "Global efectivo" : "Retail efectivo"}
          </StatusBadge>
          <StatusBadge>Versión {price.version}</StatusBadge>
        </Group>
      }
    >
      {price.sku && <Text size="sm">SKU: {price.sku}</Text>}
      <SimpleGrid cols={3} spacing="lg">
        <MetricCard
          label="Precio regular vigente"
          value={price.regular}
          description={price.currency}
        />
        <MetricCard
          label="Precio de oferta actual"
          value={price.offer ?? "Sin oferta"}
          description={
            price.offer
              ? "Importe de la consulta de Pricing"
              : "No hay oferta registrada para este objetivo"
          }
        />
        <MetricCard
          label="Moneda"
          value={price.currency}
          description="Moneda del precio mostrado"
        />
      </SimpleGrid>
      <Text size="sm">
        Vigencia de la lectura: {price.validFrom} —{" "}
        {price.validUntil ?? "Sin fin especificado"}
      </Text>
    </SectionCard>
  );
}
