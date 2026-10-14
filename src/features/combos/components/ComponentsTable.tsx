import { ActionIcon, Badge, Table, Text } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import type { ComboComponentItem } from "../types/combos";

interface ComponentsTableProps {
  components: ComboComponentItem[];
  editable?: boolean;
  onRemove?: (sku: string) => void;
  currency?: string;
}

export function ComponentsTable({
  components,
  editable = false,
  onRemove,
  currency = "PEN",
}: ComponentsTableProps) {
  if (components.length === 0) {
    return (
      <Text size="sm" c="dimmed" fs="italic">
        No se han agregado componentes a este combo.
      </Text>
    );
  }

  return (
    <Table.ScrollContainer minWidth={650}>
      <Table verticalSpacing="sm" withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>SKU</Table.Th>
            <Table.Th>Producto / Variante</Table.Th>
            <Table.Th style={{ textAlign: "right" }}>Cantidad</Table.Th>
            <Table.Th style={{ textAlign: "right" }}>Precio Regular</Table.Th>
            <Table.Th style={{ textAlign: "right" }}>Precio Público Vigente</Table.Th>
            <Table.Th style={{ textAlign: "right" }}>Subtotal Regular</Table.Th>
            {editable && <Table.Th style={{ width: 80, textAlign: "center" }}>Acción</Table.Th>}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {components.map((comp) => {
            const reg = comp.regularPrice ?? 0;
            const pub = comp.publicPrice ?? reg;
            const subtotalReg = reg * comp.quantity;

            return (
              <Table.Tr key={comp.sku}>
                <Table.Td>
                  <Text fw={600} size="sm" ff="monospace">
                    {comp.sku}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" fw={500}>
                    {comp.productName || comp.sku}
                  </Text>
                  {comp.variantLabel && (
                    <Badge variant="dot" size="xs" color="gray" mt={2}>
                      {comp.variantLabel}
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td style={{ textAlign: "right" }}>
                  <Text size="sm" fw={600}>
                    {comp.quantity}
                  </Text>
                </Table.Td>
                <Table.Td style={{ textAlign: "right" }}>
                  <Text size="sm">
                    {reg > 0 ? `${comp.currency || currency} ${reg.toFixed(2)}` : "—"}
                  </Text>
                </Table.Td>
                <Table.Td style={{ textAlign: "right" }}>
                  <Text size="sm">
                    {pub > 0 ? `${comp.currency || currency} ${pub.toFixed(2)}` : "—"}
                  </Text>
                </Table.Td>
                <Table.Td style={{ textAlign: "right" }}>
                  <Text size="sm" fw={600}>
                    {subtotalReg > 0 ? `${comp.currency || currency} ${subtotalReg.toFixed(2)}` : "—"}
                  </Text>
                </Table.Td>
                {editable && (
                  <Table.Td style={{ textAlign: "center" }}>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={() => onRemove?.(comp.sku)}
                      title={`Quitar ${comp.sku}`}
                      aria-label={`Quitar componente ${comp.sku}`}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Table.Td>
                )}
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
