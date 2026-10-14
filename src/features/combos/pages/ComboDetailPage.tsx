import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
} from "@mantine/core";
import {
  IconEdit,
  IconBan,
  IconArrowLeft,
  IconAlertCircle,
  IconInfoCircle,
} from "@tabler/icons-react";
import { PageHeader } from "../../../components/shared/PageHeader";
import { SectionCard } from "../../../components/shared/SectionCard";
import { FeedbackAlert } from "../../../components/shared/FeedbackAlert";
import { useCombosRepository } from "../hooks/useCombosRepository";
import { ComboStatusBadge, AvailabilityBadge } from "../components/ComboStatusBadge";
import { ComponentsTable } from "../components/ComponentsTable";
import { EconomicComparator } from "../components/EconomicComparator";
import { evaluateComboEconomicBenefit } from "../adapters/mockCombosRepository";
import type { ComboView, ComponentPricingSnapshot } from "../types/combos";

export function ComboDetailPage() {
  const { comboId } = useParams<{ comboId: string }>();
  const repository = useCombosRepository();

  const [combo, setCombo] = useState<ComboView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Deactivation confirmation modal
  const [deactivateModalOpen, setDeactivateModalOpen] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const isDeactivatingRef = useRef(false);

  // Pricing snapshot for components
  const [pricingMap, setPricingMap] = useState<Record<string, ComponentPricingSnapshot>>({});

  useEffect(() => {
    if (!comboId) return;

    let active = true;
    const controller = new AbortController();

    async function load() {
      if (!comboId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await repository.getCombo(comboId, controller.signal);
        if (active) {
          if (data) {
            setCombo(data);
            // Fetch pricing for components
            const skus = data.components.map((c) => c.sku);
            const prices = await repository.getComponentsPricing(skus, controller.signal);
            if (active) {
              setPricingMap(prices);
            }
          } else {
            setError(`No se encontró el combo con identificador ${comboId}`);
          }
        }
      } catch (err: unknown) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Error al cargar la ficha del combo.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
      controller.abort();
    };
  }, [comboId, repository]);

  const comparison = useMemo(() => {
    if (!combo) {
      return {
        regularSum: 0,
        publicSum: 0,
        comboPrice: 0,
        isValidBenefit: false,
        isPricingComplete: false,
        currency: "PEN",
      };
    }
    return evaluateComboEconomicBenefit(
      combo.components.map((c) => ({ sku: c.sku, quantity: c.quantity })),
      combo.price,
      pricingMap,
    );
  }, [combo, pricingMap]);

  // Handle deactivation execution
  const handleConfirmDeactivate = async () => {
    if (!combo || isDeactivatingRef.current) return;

    isDeactivatingRef.current = true;
    setDeactivating(true);

    try {
      const updated = await repository.deactivateCombo(combo.comboId);
      setCombo(updated);
      setDeactivateModalOpen(false);
      setSuccessMessage("El combo ha sido desactivado exitosamente. Ya no estará disponible para nuevas ventas.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al desactivar el combo.");
    } finally {
      isDeactivatingRef.current = false;
      setDeactivating(false);
    }
  };

  if (loading) {
    return (
      <Stack gap="lg">
        <PageHeader
          title="Ficha de combo"
          description="Cargando información del combo..."
          breadcrumbs={[
            { label: "Catálogo", to: "/productos" },
            { label: "Combos", to: "/combos" },
          ]}
        />
        <Paper p="xl" withBorder>
          <Text size="sm" c="dimmed">
            Cargando datos del combo...
          </Text>
        </Paper>
      </Stack>
    );
  }

  if (error || !combo) {
    return (
      <Stack gap="lg">
        <PageHeader
          title="Combo no encontrado"
          description="El combo solicitado no existe o no se pudo cargar."
          breadcrumbs={[
            { label: "Catálogo", to: "/productos" },
            { label: "Combos", to: "/combos" },
          ]}
          actions={
            <Button
              component={Link}
              to="/combos"
              variant="default"
              leftSection={<IconArrowLeft size={16} />}
            >
              Volver a combos
            </Button>
          }
        />
        <FeedbackAlert
          semantic="error"
          title="No se encontró el combo"
        >
          {error || "El identificador no corresponde a ningún combo registrado."}
        </FeedbackAlert>
      </Stack>
    );
  }

  const isUnavailable =
    combo.status === "INACTIVO" ||
    combo.informativeAvailability === 0 ||
    combo.freshness === "INCOMPLETA" ||
    combo.informativeAvailability === null;

  return (
    <Stack gap="lg">
      <PageHeader
        title={combo.name}
        description={`Identificador: ${combo.comboId} · Versión: ${combo.version}`}
        breadcrumbs={[
          { label: "Catálogo", to: "/productos" },
          { label: "Combos", to: "/combos" },
          { label: combo.name, to: `/combos/${combo.comboId}` },
        ]}
        actions={
          <Group gap="sm">
            <Button
              component={Link}
              to="/combos"
              variant="default"
              leftSection={<IconArrowLeft size={16} />}
            >
              Volver a combos
            </Button>

            {isUnavailable && (
              <Button
                component={Link}
                to={`/combos/${combo.comboId}/no-disponible`}
                variant="light"
                color="yellow"
                leftSection={<IconAlertCircle size={16} />}
              >
                Ver estado de indisponibilidad
              </Button>
            )}

            <Button
              component={Link}
              to={`/combos/${combo.comboId}/editar`}
              variant="outline"
              leftSection={<IconEdit size={16} />}
            >
              Editar combo
            </Button>

            {combo.status === "ACTIVO" && (
              <Button
                color="red"
                variant="light"
                leftSection={<IconBan size={16} />}
                onClick={() => setDeactivateModalOpen(true)}
              >
                Desactivar
              </Button>
            )}
          </Group>
        }
      />

      {successMessage && (
        <FeedbackAlert
          semantic="success"
          title="Operación confirmada"
        >
          {successMessage}
        </FeedbackAlert>
      )}

      <SectionCard title="Definición y estado administrativo">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <Stack gap="xs">
              <Group gap="sm">
                <Text fw={600} size="sm" c="dimmed">
                  Estado administrativo:
                </Text>
                <ComboStatusBadge status={combo.status} />
              </Group>

              <Group gap="sm">
                <Text fw={600} size="sm" c="dimmed">
                  Disponibilidad informativa:
                </Text>
                <AvailabilityBadge
                  availability={combo.informativeAvailability}
                  freshness={combo.freshness}
                />
              </Group>

              {combo.calculatedAt && (
                <Text size="xs" c="dimmed">
                  Último cálculo de disponibilidad: {new Date(combo.calculatedAt).toLocaleString("es-PE")}
                </Text>
              )}
            </Stack>

            <Paper withBorder p="md" radius="sm" bg="var(--mantine-color-gray-0)">
              <Text size="xs" c="dimmed">
                Precio del combo (PEN)
              </Text>
              <Text fw={700} size="xl">
                S/ {combo.price.toFixed(2)}
              </Text>
            </Paper>
          </Group>

          {combo.description && (
            <Box mt="xs">
              <Text size="xs" c="dimmed" fw={600} mb={4}>
                Descripción comercial:
              </Text>
              <Text size="sm">{combo.description}</Text>
            </Box>
          )}

          <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light" p="xs">
            Nota: La disponibilidad es una estimación. Las existencias se verifican y reservan por cada componente durante el proceso de compra.
          </Alert>
        </Stack>
      </SectionCard>

      <SectionCard title="Comparación económica y referencias comerciales">
        <EconomicComparator comparison={comparison} />
      </SectionCard>

      <SectionCard title={`Componentes SKU incluidos (${combo.components.length})`}>
        <ComponentsTable components={combo.components} editable={false} />
      </SectionCard>

      {/* Confirmation modal for deactivation */}
      <Modal
        opened={deactivateModalOpen}
        onClose={() => !deactivating && setDeactivateModalOpen(false)}
        title="Confirmar desactivación del combo"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            ¿Estás seguro de que deseas desactivar el combo <strong>{combo.name}</strong>?
          </Text>

          <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light" p="xs">
            Al desactivar este combo, dejará de ofrecerse para nuevas ventas en todos los canales. Su configuración y componentes históricos se conservarán intactos.
          </Alert>

          <Group justify="flex-end" gap="sm" mt="md">
            <Button
              variant="subtle"
              color="gray"
              onClick={() => setDeactivateModalOpen(false)}
              disabled={deactivating}
            >
              Cancelar
            </Button>
            <Button
              color="red"
              onClick={handleConfirmDeactivate}
              loading={deactivating}
            >
              Desactivar combo
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
