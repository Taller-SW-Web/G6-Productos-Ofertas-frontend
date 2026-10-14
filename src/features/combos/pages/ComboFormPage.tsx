import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { IconDeviceFloppy, IconX, IconAlertTriangle } from "@tabler/icons-react";
import { PageHeader } from "../../../components/shared/PageHeader";
import { SectionCard } from "../../../components/shared/SectionCard";
import { FeedbackAlert } from "../../../components/shared/FeedbackAlert";
import { useCombosRepository } from "../hooks/useCombosRepository";
import { ComponentSelector } from "../components/ComponentSelector";
import { ComponentsTable } from "../components/ComponentsTable";
import { EconomicComparator } from "../components/EconomicComparator";
import { evaluateComboEconomicBenefit } from "../adapters/mockCombosRepository";
import { ComboRepositoryError } from "../services/combosRepository";
import type {
  ComboComponentItem,
  ComponentPricingSnapshot,
} from "../types/combos";

export function ComboFormPage() {
  const { comboId } = useParams<{ comboId?: string }>();
  const isEditing = Boolean(comboId);

  const repository = useCombosRepository();
  const navigate = useNavigate();

  // Form fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<number | string>(0);
  const [components, setComponents] = useState<ComboComponentItem[]>([]);
  const [version, setVersion] = useState<number>(1);

  // Status & loading
  const [loadingInitial, setLoadingInitial] = useState(isEditing);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [versionConflict, setVersionConflict] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Pricing snapshot for components
  const [pricingMap, setPricingMap] = useState<
    Record<string, ComponentPricingSnapshot>
  >({});

  // Submission lock to strictly prevent double submit
  const isSubmittingRef = useRef(false);

  // Load existing combo for editing
  useEffect(() => {
    if (!isEditing || !comboId) return;

    let active = true;
    const controller = new AbortController();

    async function loadCombo() {
      if (!comboId) return;
      setLoadingInitial(true);
      try {
        const data = await repository.getCombo(comboId, controller.signal);
        if (active && data) {
          setName(data.name);
          setDescription(data.description || "");
          setPrice(data.price);
          setComponents(data.components);
          setVersion(data.version);
        } else if (active && !data) {
          setSubmitError(`No se encontró el combo con ID ${comboId}`);
        }
      } catch (err: unknown) {
        if (active) {
          setSubmitError(
            err instanceof Error
              ? err.message
              : "Error al cargar la información del combo.",
          );
        }
      } finally {
        if (active) {
          setLoadingInitial(false);
        }
      }
    }

    loadCombo();

    return () => {
      active = false;
      controller.abort();
    };
  }, [isEditing, comboId, repository]);

  const componentSkusKey = useMemo(
    () => components.map((c) => c.sku).sort().join(","),
    [components],
  );

  // Fetch Pricing for all component SKUs whenever components change
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function fetchPricing() {
      const skus = componentSkusKey ? componentSkusKey.split(",").filter(Boolean) : [];
      if (skus.length === 0) return;
      try {
        const prices = await repository.getComponentsPricing(
          skus,
          controller.signal,
        );
        if (active) {
          setPricingMap((prev) => ({ ...prev, ...prices }));
        }
      } catch {
        // Retain prior prices on failure
      }
    }

    fetchPricing();

    return () => {
      active = false;
      controller.abort();
    };
  }, [componentSkusKey, repository]);

  // Handle Add Component
  const handleAddComponent = (item: ComboComponentItem) => {
    setComponents((prev) => [...prev, item]);
    setFieldErrors((prev) => {
      const copy = { ...prev };
      delete copy.components;
      return copy;
    });
  };

  // Handle Remove Component
  const handleRemoveComponent = (sku: string) => {
    setComponents((prev) => prev.filter((c) => c.sku !== sku));
  };

  const parsedPrice =
    typeof price === "number" ? price : parseFloat(price) || 0;

  // Real-time economic evaluation
  const comparison = useMemo(() => {
    return evaluateComboEconomicBenefit(
      components.map((c) => ({ sku: c.sku, quantity: c.quantity })),
      parsedPrice,
      pricingMap,
    );
  }, [components, parsedPrice, pricingMap]);

  // Derived components with prices for display in table
  const displayComponents = useMemo(() => {
    return components.map((c) => {
      const p = pricingMap[c.sku];
      return {
        ...c,
        regularPrice: p?.regularPrice ?? c.regularPrice ?? 0,
        publicPrice: p?.publicPrice ?? c.publicPrice ?? 0,
        currency: p?.currency ?? c.currency ?? "PEN",
      };
    });
  }, [components, pricingMap]);

  // Handle Form Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Reentrancy guard
    if (isSubmittingRef.current) return;

    setSubmitError(null);
    setVersionConflict(false);
    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors.name = "El nombre del combo es obligatorio.";
    }

    if (components.length < 2) {
      errors.components =
        "El combo debe contener al menos dos componentes SKU vendibles directos.";
    }

    if (parsedPrice <= 0) {
      errors.price = "El precio del combo debe ser mayor a cero.";
    } else if (components.length >= 2 && !comparison.isValidBenefit) {
      errors.price =
        comparison.message ||
        "El precio debe ser estrictamente menor que la suma regular y la suma pública vigente.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    isSubmittingRef.current = true;
    setSubmitting(true);

    try {
      if (isEditing && comboId) {
        const updated = await repository.updateCombo(comboId, {
          nombre: name.trim(),
          descripcion: description.trim() || null,
          componentes: components.map((c) => ({
            sku: c.sku,
            quantity: c.quantity,
          })),
          precioCombo: parsedPrice,
          version,
        });
        navigate(`/combos/${updated.comboId}`);
      } else {
        const created = await repository.createCombo({
          nombre: name.trim(),
          descripcion: description.trim() || null,
          componentes: components.map((c) => ({
            sku: c.sku,
            quantity: c.quantity,
          })),
          precioCombo: parsedPrice,
        });
        navigate(`/combos/${created.comboId}`);
      }
    } catch (err: unknown) {
      if (err instanceof ComboRepositoryError) {
        if (err.code === "VERSION_CONFLICT") {
          setVersionConflict(true);
          setSubmitError(err.message);
        } else if (err.code === "COMBO_PRECIO_INVALIDO") {
          setSubmitError(err.message);
          setFieldErrors((prev) => ({ ...prev, price: err.message }));
        } else {
          setSubmitError(err.message);
        }
      } else {
        setSubmitError(
          err instanceof Error
            ? err.message
            : "Ocurrió un error inesperado al guardar el combo.",
        );
      }
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleRefreshVersion = async () => {
    if (!comboId) return;
    try {
      const fresh = await repository.getCombo(comboId);
      if (fresh) {
        setVersion(fresh.version);
        setVersionConflict(false);
        setSubmitError(null);
      }
    } catch {
      // ignore
    }
  };

  if (loadingInitial) {
    return (
      <Stack gap="lg">
        <PageHeader
          title="Editar combo"
          description="Cargando configuración del combo..."
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

  return (
    <Stack gap="lg">
      <PageHeader
        title={isEditing ? "Editar combo" : "Crear combo"}
        description={
          isEditing
            ? "Modifica la composición, cantidades o precio comercial del combo."
            : "Configura un nuevo combo comercial compuesto por al menos dos SKUs vendibles directos."
        }
        breadcrumbs={[
          { label: "Catálogo", to: "/productos" },
          { label: "Combos", to: "/combos" },
          {
            label: isEditing ? name || "Editar" : "Nuevo",
            to: isEditing ? `/combos/${comboId}/editar` : "/combos/nuevo",
          },
        ]}
      />

      {versionConflict && (
        <Alert
          icon={<IconAlertTriangle size={18} />}
          title="Conflicto de concurrencia detectado"
          color="yellow"
          variant="filled"
        >
          <Stack gap="xs">
            <Text size="sm">
              Este combo cambió desde que comenzaste a editarlo. Revisa la
              versión actual antes de volver a guardar tus cambios.
            </Text>
            <Group>
              <Button
                variant="white"
                color="dark"
                size="xs"
                onClick={handleRefreshVersion}
              >
                Consultar versión actual
              </Button>
            </Group>
          </Stack>
        </Alert>
      )}

      {submitError && !versionConflict && (
        <FeedbackAlert
          semantic="error"
          title="No se pudo guardar el combo"
        >
          {submitError}
        </FeedbackAlert>
      )}

      <form onSubmit={handleSubmit}>
        <Stack gap="lg">
          <SectionCard title="Información general">
            <Stack gap="md">
              <TextInput
                label="Nombre comercial del combo"
                placeholder="Ej. Pack Ejecutivo Smart Casual"
                value={name}
                onChange={(e) => {
                  setName(e.currentTarget.value);
                  setFieldErrors((prev) => {
                    const c = { ...prev };
                    delete c.name;
                    return c;
                  });
                }}
                error={fieldErrors.name}
              />

              <Textarea
                label="Descripción comercial"
                placeholder="Describe el propósito y contenido del combo..."
                value={description}
                onChange={(e) => setDescription(e.currentTarget.value)}
                minRows={3}
              />
            </Stack>
          </SectionCard>

          <SectionCard title="Componentes SKU vendibles">
            <Stack gap="md">
              <Text size="sm" c="dimmed">
                Selecciona al menos dos SKUs vendibles directos. Un producto con
                variantes requiere la elección explícita de su variante. No se
                admiten combos anidados ni SKUs duplicados.
              </Text>

              <ComponentSelector
                existingSkus={components.map((c) => c.sku)}
                onAddComponent={handleAddComponent}
              />

              {fieldErrors.components && (
                <Text size="xs" c="red.7" fw={600}>
                  {fieldErrors.components}
                </Text>
              )}

              <Box mt="xs">
                <Text fw={600} size="sm" mb="xs">
                  Componentes seleccionados ({components.length})
                </Text>
                <ComponentsTable
                  components={displayComponents}
                  editable
                  onRemove={handleRemoveComponent}
                />
              </Box>
            </Stack>
          </SectionCard>

          <SectionCard title="Precio y regla de ventaja económica">
            <Stack gap="md">
              <Group align="flex-start" grow>
                <TextInput
                  label="Precio promocional del combo (PEN)"
                  placeholder="0.00"
                  value={price === "" ? "" : price}
                  onChange={(e) => {
                    const val = e.currentTarget.value;
                    setPrice(val);
                    setFieldErrors((prev) => {
                      const c = { ...prev };
                      delete c.price;
                      return c;
                    });
                  }}
                  error={fieldErrors.price}
                  style={{ maxWidth: 280 }}
                  data-testid="combo-price-input"
                />
              </Group>

              <EconomicComparator comparison={comparison} />
            </Stack>
          </SectionCard>

          <Paper withBorder p="md" radius="sm">
            <Group justify="space-between">
              <Button
                variant="subtle"
                color="gray"
                component={Link}
                to={isEditing ? `/combos/${comboId}` : "/combos"}
                leftSection={<IconX size={16} />}
                disabled={submitting}
              >
                Cancelar
              </Button>

              <Button
                type="submit"
                leftSection={<IconDeviceFloppy size={16} />}
                loading={submitting}
                disabled={versionConflict}
                data-testid="combo-submit-button"
              >
                {isEditing ? "Guardar cambios" : "Crear combo"}
              </Button>
            </Group>
          </Paper>
        </Stack>
      </form>
    </Stack>
  );
}
