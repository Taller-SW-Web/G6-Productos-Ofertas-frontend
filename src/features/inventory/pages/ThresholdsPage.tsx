import { Link, useSearchParams } from "react-router-dom";
import { Button, Skeleton, Stack } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import {
  FeedbackAlert,
  PageHeader,
} from "../../../components/shared";
import { ThresholdConfigForm } from "../components/ThresholdConfigForm";
import { DevScenarioSelector } from "../dev/DevScenarioSelector";
import { useInventoryStock } from "../hooks/useInventoryStock";
import { useThresholds } from "../hooks/useThresholds";
import type { StockFiltersQuery } from "../services/inventoryTypes";

export function ThresholdsPage() {
  const [params] = useSearchParams();

  const {
    thresholds,
    loading,
    saving,
    error,
    saveError,
    updateGlobal,
    updateSku,
  } = useThresholds();

  const { items: stockItems } = useInventoryStock({} as StockFiltersQuery);

  const isRevisionMode =
    import.meta.env.DEV && params.get("modoRevision") === "1";

  return (
    <>
      <PageHeader
        title="Configuración de umbrales de stock"
        description="Establece los niveles mínimos de alerta de stock bajo a nivel global o por SKU."
        breadcrumbs={[
          { label: "Inventario" },
          { label: "Control de stock", to: "/inventario" },
          { label: "Umbrales" },
        ]}
        actions={
          <Button
            component={Link}
            to="/inventario"
            variant="outline"
            leftSection={<IconArrowLeft size={16} />}
          >
            Volver a Control de stock
          </Button>
        }
      />

      <Stack gap="lg">
        <FeedbackAlert semantic="info" title="Precedencia de reglas de umbral">
          El umbral resuelto usa primero la excepción por SKU y, si no existe, el umbral global.
          Cuando el saldo disponible es menor o igual a este valor, el estado comercial pasa a{" "}
          <strong>stock bajo</strong>.
        </FeedbackAlert>

        {isRevisionMode && <DevScenarioSelector />}

        {loading && !thresholds && (
          <Stack gap="md">
            <Skeleton height={140} radius="md" />
            <Skeleton height={260} radius="md" />
          </Stack>
        )}

        {error && (
          <FeedbackAlert semantic="error" title="Error al cargar configuración de umbrales">
            {error}
          </FeedbackAlert>
        )}

        {saveError && (
          <FeedbackAlert semantic="error" title="Error al actualizar umbral">
            {saveError}
          </FeedbackAlert>
        )}

        {thresholds && (
          <ThresholdConfigForm
            thresholds={thresholds}
            stockItems={stockItems}
            saving={saving}
            onUpdateGlobal={updateGlobal}
            onUpdateSku={updateSku}
          />
        )}
      </Stack>
    </>
  );
}
