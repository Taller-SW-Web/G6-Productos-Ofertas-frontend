import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Group,
  Paper,
  Stack,
  Text,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconPackageOff,
  IconEye,
  IconInfoCircle,
  IconClock,
} from "@tabler/icons-react";
import { PageHeader } from "../../../components/shared/PageHeader";
import { SectionCard } from "../../../components/shared/SectionCard";
import { FeedbackAlert } from "../../../components/shared/FeedbackAlert";
import { useCombosRepository } from "../hooks/useCombosRepository";
import { ComboStatusBadge, AvailabilityBadge } from "../components/ComboStatusBadge";
import type { ComboView } from "../types/combos";

export function ComboUnavailablePage() {
  const { comboId } = useParams<{ comboId: string }>();
  const repository = useCombosRepository();

  const [combo, setCombo] = useState<ComboView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!comboId) return;

    let active = true;
    const controller = new AbortController();

    async function load() {
      if (!comboId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await repository.getCombo(comboId, undefined, controller.signal);
        if (active) {
          if (data) {
            setCombo(data);
          } else {
            setError(`No se encontró el combo con identificador ${comboId}`);
          }
        }
      } catch (err: unknown) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Error al cargar el estado de indisponibilidad.",
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

  if (loading) {
    return (
      <Stack gap="lg">
        <PageHeader
          title="Estado del combo"
          description="Consultando estado de disponibilidad comercial..."
          breadcrumbs={[
            { label: "Catálogo", to: "/productos" },
            { label: "Combos", to: "/combos" },
          ]}
        />
        <Paper p="xl" withBorder>
          <Text size="sm" c="dimmed">
            Cargando estado del combo...
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
          description="No se puede consultar el estado de un combo inexistente."
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
          title="Error de consulta"
        >
          {error || "El identificador no corresponde a ningún combo registrado."}
        </FeedbackAlert>
      </Stack>
    );
  }

  // Derive exact condition per H09
  const isInactive = combo.status === "INACTIVO";
  const isConfirmedSoldOut =
    combo.status === "ACTIVO" &&
    combo.informativeAvailability === 0 &&
    combo.freshness === "ACTUALIZADA";
  const isStale = combo.freshness === "DESACTUALIZADA";
  const isIncomplete = combo.freshness === "INCOMPLETA";
  const isUnverifiable =
    combo.informativeAvailability === null && combo.freshness !== "INCOMPLETA";
  const isAvailableConfirmed =
    combo.status === "ACTIVO" &&
    combo.informativeAvailability !== null &&
    combo.informativeAvailability > 0 &&
    combo.freshness === "ACTUALIZADA";

  return (
    <Stack gap="lg">
      <PageHeader
        title={`Indisponibilidad comercial: ${combo.name}`}
        description={`Identificador: ${combo.comboId}`}
        breadcrumbs={[
          { label: "Catálogo", to: "/productos" },
          { label: "Combos", to: "/combos" },
          { label: combo.name, to: `/combos/${combo.comboId}` },
          { label: "No disponible", to: `/combos/${combo.comboId}/no-disponible` },
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
            <Button
              component={Link}
              to={`/combos/${combo.comboId}`}
              variant="outline"
              leftSection={<IconEye size={16} />}
            >
              Ver ficha del combo
            </Button>
          </Group>
        }
      />

      <SectionCard title="Estado y causa de indisponibilidad comercial">
        <Stack gap="md">
          {isAvailableConfirmed && (
            <Alert
              icon={<IconInfoCircle size={20} />}
              title="Disponibilidad confirmada"
              color="green"
              variant="light"
            >
              <Text size="sm">
                Este combo se encuentra activo y cuenta con disponibilidad estimada de{" "}
                <strong>{combo.informativeAvailability} unidades</strong>. No presenta bloqueo de
                existencias en este momento.
              </Text>
            </Alert>
          )}

          {isConfirmedSoldOut && (
            <Alert
              icon={<IconPackageOff size={20} />}
              title="Agotado actualmente (existencias confirmadas en 0)"
              color="red"
              variant="filled"
              data-testid="sold-out-alert"
            >
              <Stack gap="xs">
                <Text size="sm">
                  La disponibilidad estimada del combo es 0. Uno o más de sus componentes SKU no cuenta con existencias suficientes en el inventario.
                </Text>
                <Text size="xs">
                  Su configuración administrativa se conserva intacta en estado <strong>ACTIVO</strong>.
                </Text>
              </Stack>
            </Alert>
          )}

          {isStale && (
            <Alert
              icon={<IconClock size={20} />}
              title="Disponibilidad desactualizada (sin confirmación de agotamiento)"
              color="yellow"
              variant="filled"
              data-testid="stale-availability-alert"
            >
              <Stack gap="xs">
                <Text size="sm">
                  La sincronización de existencias de este combo está desactualizada. No se puede confirmar agotamiento terminal ni saldo suficiente sin consultar nuevamente al servicio de Inventario.
                </Text>
                <Text size="xs">
                  Último cálculo registrado: {combo.calculatedAt ? new Date(combo.calculatedAt).toLocaleString("es-PE") : "No registrado"}.
                </Text>
              </Stack>
            </Alert>
          )}

          {isInactive && (
            <Alert
              icon={<IconAlertTriangle size={20} />}
              title="No disponible para nuevas ventas"
              color="gray"
              variant="filled"
              data-testid="inactive-combo-alert"
            >
              <Stack gap="xs">
                <Text size="sm">
                  Este combo se encuentra administrativamente <strong>INACTIVO</strong>. No es elegible ni comprable para nuevas transacciones comerciales.
                </Text>
                <Text size="xs">
                  Se conserva la definición histórica y su composición de componentes.
                </Text>
              </Stack>
            </Alert>
          )}

          {isIncomplete && (
            <Alert
              icon={<IconAlertTriangle size={20} />}
              title="Disponibilidad incompleta"
              color="yellow"
              variant="filled"
              data-testid="incomplete-availability-alert"
            >
              <Stack gap="xs">
                <Text size="sm">
                  Uno o más componentes SKU no resolvieron su saldo de inventario en las sucursales requeridas.
                </Text>
                <Text size="xs">
                  La ausencia de confirmación no equivale a saldo cero. Se requiere verificar la consistencia con el servicio de Inventario.
                </Text>
              </Stack>
            </Alert>
          )}

          {isUnverifiable && !isIncomplete && (
            <Alert
              icon={<IconAlertTriangle size={20} />}
              title="Disponibilidad no verificable"
              color="gray"
              variant="filled"
              data-testid="unverifiable-availability-alert"
            >
              <Stack gap="xs">
                <Text size="sm">
                  No existen datos de existencias confirmados ni cálculo de inventario para este combo.
                </Text>
                <Text size="xs">
                  El sistema no puede garantizar unidades disponibles.
                </Text>
              </Stack>
            </Alert>
          )}

          <Paper withBorder p="md" radius="sm">
            <Stack gap="sm">
              <Text fw={600} size="sm">
                Resumen del combo
              </Text>
              <Group gap="xl">
                <Box>
                  <Text size="xs" c="dimmed">
                    Estado administrativo:
                  </Text>
                  <ComboStatusBadge status={combo.status} />
                </Box>

                <Box>
                  <Text size="xs" c="dimmed">
                    Disponibilidad estimada:
                  </Text>
                  <AvailabilityBadge
                    availability={combo.informativeAvailability}
                    freshness={combo.freshness}
                  />
                </Box>

                <Box>
                  <Text size="xs" c="dimmed">
                    Precio comercial:
                  </Text>
                  <Text fw={600} size="sm">
                    S/ {combo.price.toFixed(2)}
                  </Text>
                </Box>

                <Box>
                  <Text size="xs" c="dimmed">
                    Componentes:
                  </Text>
                  <Text fw={600} size="sm">
                    {combo.components.length} SKUs
                  </Text>
                </Box>
              </Group>
            </Stack>
          </Paper>

          <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light" p="xs">
            Nota de trazabilidad: Conforme a la especificación, un combo deja de ser elegible para nuevas ventas cuando sus existencias son cero, cuando se desactiva administrativamente o cuando un componente es dado de baja en Catálogo. La plataforma no atribuye la causa a un SKU concreto sin respaldo contractual explícito.
          </Alert>
        </Stack>
      </SectionCard>
    </Stack>
  );
}
