import { useContext } from "react";
import { Button, Select, Text } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { FilterBar } from "../../../components/shared";
import type { PriceQuery, PriceTarget } from "../services/pricingRepository";
import { priceChannelLabel } from "../services/pricePresentation";
import type { PriceChannel } from "../services/pricingRepository";
import { DataModeContext } from "../../../app/config/DataModeContext";
const channels: PriceChannel[] = ["global", "retail", "marketplace", "chatbot", "ventas"];

export function PriceFilters({
  targets,
  draft,
  applied,
  onChange,
  onConsult,
}: {
  targets: readonly PriceTarget[];
  draft: PriceQuery;
  applied: PriceQuery;
  onChange: (query: PriceQuery) => void;
  onConsult: () => void;
}) {
  const mode = useContext(DataModeContext);
  const globalOnly = mode !== "api" && targets.find((target) => target.id === draft.targetId)?.kind === "product";
  const appliedName = targets.find(
    (target) => target.id === applied.targetId,
  )?.label;
  return (
    <FilterBar
      align="flex-start"
      summary={`Consulta aplicada: ${appliedName} · ${priceChannelLabel(applied.channel)} solicitado`}
    >
      <Select
        label="Producto o SKU"
        value={draft.targetId}
        data={targets.map((item) => ({
          value: item.id,
          label: item.label,
        }))}
        searchable
        allowDeselect={false}
        style={{ flex: "1 1 440px" }}
        onChange={(value) => {
          const target = targets.find((item) => item.id === value);
          if (target)
            onChange({
              targetId: target.id,
              channel: mode !== "api" && target.kind === "product" ? "global" : draft.channel,
            });
        }}
      />
      <Select
        label="Canal de consulta"
        value={draft.channel}
        data={channels.map(channel => ({ value: channel, label: priceChannelLabel(channel) }))}
        disabled={globalOnly}
        description={
          globalOnly
            ? "La lectura base del producto no admite filtro de canal."
            : "El precio efectivo puede resolver al alcance global."
        }
        allowDeselect={false}
        style={{ flex: "1 1 240px" }}
        onChange={(value) => {
          if (value && channels.includes(value as PriceChannel))
            onChange({ ...draft, channel: value as PriceChannel });
        }}
      />
      <Button
        mt="lg"
        leftSection={<IconSearch size={20} stroke={2} aria-hidden="true" />}
        onClick={onConsult}
      >
        Consultar
      </Button>
      {(draft.targetId !== applied.targetId ||
        draft.channel !== applied.channel) && (
        <Text size="sm">
          Selección pendiente: pulsa Consultar para aplicar los cambios.
        </Text>
      )}
    </FilterBar>
  );
}
