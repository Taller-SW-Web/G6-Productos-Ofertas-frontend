import { Group, Paper, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconCheck, IconAlertTriangle } from "@tabler/icons-react";
import type { EconomicComparisonResult } from "../types/combos";

interface EconomicComparatorProps {
  comparison: EconomicComparisonResult;
}

export function EconomicComparator({ comparison }: EconomicComparatorProps) {
  const { regularSum, publicSum, comboPrice, isValidBenefit, isPricingComplete, currency, message } =
    comparison;

  return (
    <Paper withBorder p="md" radius="sm">
      <Stack gap="sm">
        <Text fw={600} size="sm">
          Comparador económico preventivo
        </Text>

        <Group grow align="flex-start">
          <Paper withBorder p="xs" radius="xs" bg="var(--mantine-color-gray-0)">
            <Text size="xs" c="dimmed">
              Suma regular de componentes
            </Text>
            <Text fw={600} size="md">
              {isPricingComplete ? `${currency} ${regularSum.toFixed(2)}` : "No disponible"}
            </Text>
          </Paper>

          <Paper withBorder p="xs" radius="xs" bg="var(--mantine-color-gray-0)">
            <Text size="xs" c="dimmed">
              Suma pública vigente (con ofertas)
            </Text>
            <Text fw={600} size="md">
              {isPricingComplete ? `${currency} ${publicSum.toFixed(2)}` : "No disponible"}
            </Text>
          </Paper>

          <Paper
            withBorder
            p="xs"
            radius="xs"
            bg={isValidBenefit ? "var(--mantine-color-green-0)" : "var(--mantine-color-gray-0)"}
          >
            <Text size="xs" c="dimmed">
              Precio propuesto del combo
            </Text>
            <Text fw={700} size="md" c={comboPrice > 0 ? undefined : "dimmed"}>
              {comboPrice > 0 ? `${currency} ${comboPrice.toFixed(2)}` : "Sin definir"}
            </Text>
          </Paper>
        </Group>

        {message && (
          <Group gap="xs" mt="xs" align="flex-start">
            <ThemeIcon
              size="sm"
              variant="light"
              color={isValidBenefit ? "green" : isPricingComplete ? "red" : "yellow"}
            >
              {isValidBenefit ? <IconCheck size={14} /> : <IconAlertTriangle size={14} />}
            </ThemeIcon>
            <Text
              size="xs"
              c={isValidBenefit ? "green.8" : isPricingComplete ? "red.8" : "yellow.9"}
              fw={500}
            >
              {message}
            </Text>
          </Group>
        )}

        <Text size="xs" c="dimmed" mt={4}>
          Referencia informativa: La aprobación definitiva del precio y su ventaja comercial es validada por el servidor al guardar.
        </Text>
      </Stack>
    </Paper>
  );
}
