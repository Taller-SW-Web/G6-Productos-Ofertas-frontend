import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
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
  IconRefresh,
} from "@tabler/icons-react";
import { PageHeader } from "../../../components/shared/PageHeader";
import { SectionCard } from "../../../components/shared/SectionCard";
import { FeedbackAlert } from "../../../components/shared/FeedbackAlert";
import { useCombosRepository } from "../hooks/useCombosRepository";
import { ComboStatusBadge, AvailabilityBadge } from "../components/ComboStatusBadge";
import { ComponentsTable } from "../components/ComponentsTable";
import { EconomicComparator } from "../components/EconomicComparator";
import { evaluateComboEconomicBenefit } from "../utils/economicEvaluation";
import { tokens } from "../../../theme/tokens";
import type { ComboView, ComponentPricingSnapshot } from "../types/combos";

export function ComboDetailPage() {
  const { comboId } = useParams<{ comboId: string }>();
  const repository = useCombosRepository();

  const [combo, setCombo] = useState<ComboView | null>(null);
  const [loading, setLoading] = useState(true);
  const [comboError, setComboError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Separate pricing loading and error states (H08)
  const [pricingMap, setPricingMap] = useState<Record<string, ComponentPricingSnapshot>>({});
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const scenarioParam = searchParams.get("escenario") || undefined;

  // Deactivation confirmation modal
  const [deactivateModalOpen, setDeactivateModalOpen] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const isDeactivatingRef = useRef(false);

  // Fetch Pricing for components
  const fetchPricing = useCallback(async (skus: string[], signal?: AbortSignal) => {
    if (skus.length === 0) return;
    setPricingLoading(true);
    setPricingError(null);
    try {
      const prices = await repository.getComponentsPricing(skus, scenarioParam, signal);
      setPricingMap(prices);
    } catch (err: unknown) {
      setPricingError(
        err instanceof Error ? err.message : "Error al consultar los precios de referencia.",
      );
      setPricingMap({});
    } finally {
      setPricingLoading(false);
    }
  }, [repository, scenarioParam]);

  // Load combo
  useEffect(() => {
    if (!comboId) return;

    let active = true;
    const controller = new AbortController();

    async function load() {
      if (!comboId) return;
      setLoading(true);
      setComboError(null);
      try {
        const data = await repository.getCombo(comboId, scenarioParam, controller.signal);
        if (active) {
          if (data) {
            setCombo(data);
            const skus = data.components.map((c) => c.sku);
            fetchPricing(skus, controller.signal);
          } else {
            setComboError(`No se encontró el combo con identificador ${comboId}`);
          }
        }
      } catch (err: unknown) {
        if (active) {
          setComboError(
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
  }, [comboId, repository, fetchPricing, scenarioParam]);

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

  const handleConfirmDeactivate = async () => {
    if (!combo || isDeactivatingRef.current) return;
    isDeactivatingRef.current = true;
    setDeactivating(true);
    try {
      const updated = await repository.deactivateCombo(combo.comboId);
      setCombo(updated);
      setDeactivateModalOpen(false);
      setSuccessMessage(
        `El combo "${updated.name}" ha sido desactivado comercialmente.`,
      );
    } catch (err: unknown) {
      setComboError(
        err instanceof Error ? err.message : "Error al desactivar el combo.",
      );
    } finally {
      isDeactivatingRef.current = false;
      setDeactivating(false);
    }
  };

  if (loading) {
    return (
      <Stack gap="lg">
        <PageHeader
          title="Ficha técnica del combo"
          description="Cargando configuración y referencias del combo..."
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

  if (comboError && !combo) {
    return (
      <Stack gap="lg">
        <PageHeader
          title="Ficha técnica del combo"
          breadcrumbs={[
            { label: "Catálogo", to: "/productos" },
            { label: "Combos", to: "/combos" },
          ]}
        />
        <FeedbackAlert semantic="error" title="No se pudo cargar el combo">
          {comboError}
        </FeedbackAlert>
        <Group>
          <Button
            component={Link}
            to="/combos"
            variant="default"
            leftSection={<IconArrowLeft size={16} />}
          >
            Volver a la lista de combos
          </Button>
        </Group>
      </Stack>
    );
  }

  if (!combo) return null;

  const isUnavailable =
    combo.status === "INACTIVO" ||
    combo.informativeAvailability === 0 ||
    combo.informativeAvailability === null;

  return (
    <Stack gap="lg">
      <PageHeader
        title={combo.name}
        description={`Ficha técnica del combo comercial. Versión: ${combo.version} · Identificador: ${combo.comboId}`}
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
                data-testid="deactivate-combo-button"
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

      {comboError && (
        <FeedbackAlert
          semantic="error"
          title="Error en la operación"
        >
          {comboError}
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

            <Paper withBorder p="md" radius="sm" bg={tokens.color.cloud}>
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
        <Stack gap="sm">
          {pricingError && (
            <FeedbackAlert
              semantic="warning"
              title="Precios de referencia no disponibles temporalmente"
            >
              <Stack gap="xs">
                <Text size="sm">
                  {pricingError}. La definición administrativa del combo se mantiene accesible.
                </Text>
                <Group>
                  <Button
                    size="xs"
                    variant="default"
                    leftSection={<IconRefresh size={14} />}
                    onClick={() => {
                      const nextParams = new URLSearchParams(searchParams);
                      nextParams.delete("escenario");
                      setSearchParams(nextParams);
                      fetchPricing(combo.components.map((c) => c.sku));
                    }}
                    loading={pricingLoading}
                    data-testid="retry-detail-pricing-btn"
                  >
                    Reintentar consulta de precios
                  </Button>
                </Group>
              </Stack>
            </FeedbackAlert>
          )}
          <EconomicComparator comparison={comparison} />
        </Stack>
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
        data-testid="deactivate-modal"
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
              data-testid="cancel-deactivate-btn"
            >
              Cancelar
            </Button>
            <Button
              color="red"
              onClick={handleConfirmDeactivate}
              loading={deactivating}
              data-testid="confirm-deactivate-btn"
            >
              Desactivar combo
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
