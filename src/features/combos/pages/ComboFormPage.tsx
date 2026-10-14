import { useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useBlocker, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import {
  IconDeviceFloppy,
  IconX,
  IconAlertTriangle,
  IconRefresh,
} from "@tabler/icons-react";
import { PageHeader } from "../../../components/shared/PageHeader";
import { SectionCard } from "../../../components/shared/SectionCard";
import { FeedbackAlert } from "../../../components/shared/FeedbackAlert";
import { DataModeContext } from "../../../app/config/DataModeContext";
import { useCombosRepository } from "../hooks/useCombosRepository";
import { ComponentSelector } from "../components/ComponentSelector";
import { ComponentsTable } from "../components/ComponentsTable";
import { EconomicComparator } from "../components/EconomicComparator";
import { evaluateComboEconomicBenefit } from "../utils/economicEvaluation";
import { ComboRepositoryError } from "../services/combosRepository";
import type {
  ComboComponentItem,
  ComboView,
  ComponentPricingSnapshot,
} from "../types/combos";

export function ComboFormPage() {
  const dataMode = useContext(DataModeContext);
  const { comboId } = useParams<{ comboId?: string }>();
  const isEditing = Boolean(comboId);

  const repository = useCombosRepository();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const scenarioParam = searchParams.get("escenario") || undefined;

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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Version Conflict state (H06)
  const [versionConflict, setVersionConflict] = useState(false);
  const [serverVersionCombo, setServerVersionCombo] = useState<ComboView | null>(null);
  const [forceScenarioCleared, setForceScenarioCleared] = useState(false);

  // Pricing snapshot for components (H07)
  const [pricingMap, setPricingMap] = useState<Record<string, ComponentPricingSnapshot>>({});
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingScenarioCleared, setPricingScenarioCleared] = useState(false);

  // Dirty state & Unsaved changes modal (H12 / Audit P2)
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);
  isDirtyRef.current = isDirty;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirtyRef.current && !submitting && currentLocation.pathname !== nextLocation.pathname,
  );

  // Submission lock to strictly prevent double submit
  const isSubmittingRef = useRef(false);
  const initialLoadedRef = useRef<string | null>(null);

  // Load existing combo for editing
  useEffect(() => {
    if (!isEditing || !comboId) return;
    if (initialLoadedRef.current === comboId) return;

    let active = true;
    const controller = new AbortController();

    async function loadCombo() {
      if (!comboId) return;
      setLoadingInitial(true);
      try {
        const data = await repository.getCombo(comboId, scenarioParam, controller.signal);
        if (active && data) {
          initialLoadedRef.current = comboId;
          setName(data.name);
          setDescription(data.description || "");
          setPrice(data.price);
          setComponents(data.components);
          setVersion(data.version);
          setIsDirty(false);
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
  }, [isEditing, comboId, repository, scenarioParam]);

  // Warn before browser unload if dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const componentSkusKey = useMemo(
    () => components.map((c) => c.sku).sort().join(","),
    [components],
  );

  // Fetch Pricing for all component SKUs (H07: handles errors explicitly and invalidates)
  const fetchPricing = useCallback(
    async (ignoreScenario = false) => {
      const skus = componentSkusKey ? componentSkusKey.split(",").filter(Boolean) : [];
      if (skus.length === 0) {
        setPricingMap({});
        setPricingError(null);
        return;
      }

      setPricingLoading(true);
      setPricingError(null);
      try {
        const activeScenario = ignoreScenario || pricingScenarioCleared ? undefined : scenarioParam;
        const prices = await repository.getComponentsPricing(skus, activeScenario);
        setPricingMap(prices);
      } catch (err: unknown) {
        setPricingError(
          err instanceof Error
            ? err.message
            : "Error al consultar los precios de los componentes.",
        );
        setPricingMap({});
      } finally {
        setPricingLoading(false);
      }
    },
    [componentSkusKey, repository, scenarioParam, pricingScenarioCleared],
  );

  useEffect(() => {
    fetchPricing();
  }, [fetchPricing]);

  // Handle Add Component
  const handleAddComponent = (item: ComboComponentItem) => {
    setComponents((prev) => [...prev, item]);
    setIsDirty(true);
    setFieldErrors((prev) => {
      const copy = { ...prev };
      delete copy.components;
      return copy;
    });
  };

  // Handle Remove Component
  const handleRemoveComponent = (sku: string) => {
    setComponents((prev) => prev.filter((c) => c.sku !== sku));
    setIsDirty(true);
  };

  // Handle Update Quantity (H05)
  const handleUpdateQuantity = (sku: string, newQuantity: number) => {
    setComponents((prev) =>
      prev.map((c) => (c.sku === sku ? { ...c, quantity: newQuantity } : c)),
    );
    setIsDirty(true);
  };

  const parsedPrice =
    typeof price === "number" ? price : parseFloat(price) || 0;

  // Real-time economic evaluation (H03)
  const comparison = useMemo(() => {
    return evaluateComboEconomicBenefit(
      components.map((c) => ({ sku: c.sku, quantity: c.quantity })),
      parsedPrice,
      pricingMap,
    );
  }, [components, parsedPrice, pricingMap]);

  // Derived components with prices for display in table (H07 / Audit P1)
  const displayComponents = useMemo(() => {
    return components.map((c) => {
      const p = pricingMap[c.sku];
      if (pricingError || pricingLoading || !p) {
        return {
          ...c,
          regularPrice: undefined,
          publicPrice: undefined,
          currency: "",
        };
      }
      return {
        ...c,
        regularPrice: p.regularPrice,
        publicPrice: p.publicPrice,
        currency: p.currency || "",
      };
    });
  }, [components, pricingMap, pricingError, pricingLoading]);

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
    } else if (pricingError) {
      errors.price = "No se puede confirmar el precio porque falló la consulta de Pricing.";
    } else if (pricingLoading) {
      errors.price = "Consultando precios vigentes. Espera a que finalice la validación.";
    } else if (components.length >= 2 && (!comparison.isPricingComplete || !comparison.isValidBenefit)) {
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

    const activeScenario = forceScenarioCleared
      ? undefined
      : (searchParams.get("escenario") || undefined);

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
        }, activeScenario);
        setIsDirty(false);
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
        setIsDirty(false);
        navigate(`/combos/${created.comboId}`);
      }
    } catch (err: unknown) {
      if (err instanceof ComboRepositoryError) {
        if (err.code === "VERSION_CONFLICT") {
          setVersionConflict(true);
          setSubmitError(err.message);
          // Fetch current server version for explicit review (H06)
          if (comboId) {
            repository.getCombo(comboId).then((fresh) => {
              if (fresh) setServerVersionCombo(fresh);
            });
          }
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

  // Safe Concurrency Recovery Options (H06 / Audit P1)
  const handleAdoptServerVersion = () => {
    if (!serverVersionCombo) return;
    setForceScenarioCleared(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("escenario");
    setSearchParams(nextParams, { replace: true });

    setName(serverVersionCombo.name);
    setDescription(serverVersionCombo.description || "");
    setPrice(serverVersionCombo.price);
    setComponents(serverVersionCombo.components);
    setVersion(serverVersionCombo.version);
    setVersionConflict(false);
    setServerVersionCombo(null);
    setSubmitError(null);
    setIsDirty(false);
  };

  const handleSyncVersionAndKeepDraft = () => {
    if (!serverVersionCombo) return;
    setForceScenarioCleared(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("escenario");
    setSearchParams(nextParams, { replace: true });

    setVersion(serverVersionCombo.version);
    setVersionConflict(false);
    setServerVersionCombo(null);
    setSubmitError(null);
  };

  // Safe Discard Changes Cancel (H12 / Navigation Guard P2)
  const handleCancelClick = () => {
    navigate(isEditing ? `/combos/${comboId}` : "/combos");
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

  if (dataMode === "api") {
    return (
      <Stack gap="lg">
        <PageHeader
          title={isEditing ? "Editar combo" : "Crear combo"}
          breadcrumbs={[
            { label: "Catálogo", to: "/productos" },
            { label: "Combos", to: "/combos" },
          ]}
        />
        <FeedbackAlert
          semantic="error"
          title="Integración API no disponible para Combos"
        >
          Este microservicio aún no cuenta con contrato HTTP homologado desplegado en el ambiente.
        </FeedbackAlert>
      </Stack>
    );
  }

  if (isEditing && submitError && !name) {
    return (
      <Stack gap="lg">
        <PageHeader
          title="Editar combo"
          breadcrumbs={[
            { label: "Catálogo", to: "/productos" },
            { label: "Combos", to: "/combos" },
          ]}
        />
        <FeedbackAlert
          semantic="error"
          title="Error al cargar el combo"
        >
          {submitError}
        </FeedbackAlert>
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

      {/* Discard Unsaved Changes Modal (H12 & Navigation Guard P2) */}
      <Modal
        opened={blocker.state === "blocked"}
        onClose={() => {
          if (blocker.state === "blocked") {
            blocker.reset();
          }
        }}
        title="Descartar cambios sin guardar"
        centered
        data-testid="discard-changes-modal"
      >
        <Stack gap="md">
          <Text size="sm">
            Tienes modificaciones no guardadas en este formulario. Si sales ahora,
            perderás todos los cambios realizados.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button
              variant="default"
              onClick={() => {
                if (blocker.state === "blocked") {
                  blocker.reset();
                }
              }}
            >
              Continuar editando
            </Button>
            <Button
              color="red"
              onClick={() => {
                isDirtyRef.current = false;
                setIsDirty(false);
                if (blocker.state === "blocked") {
                  blocker.proceed();
                }
              }}
              data-testid="confirm-discard-button"
            >
              Descartar y salir
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Explicit Concurrency Conflict Review (H06) */}
      {versionConflict && (
        <Alert
          icon={<IconAlertTriangle size={18} />}
          title="Conflicto de versiones concurrentes detectado"
          color="yellow"
          variant="filled"
          data-testid="version-conflict-alert"
        >
          <Stack gap="sm">
            <Text size="sm">
              Este combo fue modificado por otro proceso mientras lo editabas.
              Tus cambios no se sobrescribieron automáticamente para proteger la integridad.
            </Text>

            {serverVersionCombo && (
              <Paper withBorder p="sm" bg="white" c="dark" radius="xs">
                <Text size="xs" fw={700} mb="xs">
                  Comparación entre versión actual del servidor (v{serverVersionCombo.version}) y tu borrador:
                </Text>
                <Table withTableBorder withColumnBorders>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Campo</Table.Th>
                      <Table.Th>Versión en servidor (v{serverVersionCombo.version})</Table.Th>
                      <Table.Th>Tu borrador</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    <Table.Tr>
                      <Table.Td fw={600}>Nombre</Table.Td>
                      <Table.Td>{serverVersionCombo.name}</Table.Td>
                      <Table.Td>{name}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td fw={600}>Precio</Table.Td>
                      <Table.Td>PEN {serverVersionCombo.price.toFixed(2)}</Table.Td>
                      <Table.Td>PEN {parsedPrice.toFixed(2)}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td fw={600}>Componentes</Table.Td>
                      <Table.Td>
                        {serverVersionCombo.components.map((c) => `${c.sku} (x${c.quantity})`).join(", ")}
                      </Table.Td>
                      <Table.Td>
                        {components.map((c) => `${c.sku} (x${c.quantity})`).join(", ")}
                      </Table.Td>
                    </Table.Tr>
                  </Table.Tbody>
                </Table>
              </Paper>
            )}

            <Group gap="sm" mt="xs">
              <Button
                variant="white"
                color="dark"
                size="xs"
                onClick={handleAdoptServerVersion}
                data-testid="adopt-server-version-btn"
              >
                Cargar versión del servidor (descartar borrador)
              </Button>
              <Button
                variant="default"
                size="xs"
                onClick={handleSyncVersionAndKeepDraft}
                data-testid="sync-version-keep-draft-btn"
              >
                Confirmar y sincronizar versión para reintentar guardado
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
                  setIsDirty(true);
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
                onChange={(e) => {
                  setDescription(e.currentTarget.value);
                  setIsDirty(true);
                }}
                minRows={3}
              />
            </Stack>
          </SectionCard>

          <SectionCard title="Componentes SKU vendibles">
            <Stack gap="md">
              <Text size="sm" c="dimmed">
                Selecciona al menos dos SKUs vendibles directos. Un producto con
                variantes requiere la elección explícita de su variante. No se
                admiten combos anidados ni SKUs duplicados. Puedes editar las
                cantidades directamente en la tabla.
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
                  onUpdateQuantity={handleUpdateQuantity}
                />
              </Box>
            </Stack>
          </SectionCard>

          <SectionCard title="Precio y regla de ventaja económica">
            <Stack gap="md">
              {pricingError && (
                <FeedbackAlert
                  semantic="error"
                  title="Fallo al consultar Pricing de componentes"
                >
                  <Stack gap="xs">
                    <Text size="sm">
                      {pricingError}. No se puede validar la ventaja económica del combo sin precios vigentes.
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
                          setPricingScenarioCleared(true);
                          fetchPricing(true);
                        }}
                        loading={pricingLoading}
                        data-testid="retry-pricing-btn"
                      >
                        Reintentar consulta de precios
                      </Button>
                    </Group>
                  </Stack>
                </FeedbackAlert>
              )}

              <Group align="flex-start" grow>
                <TextInput
                  label="Precio promocional del combo (PEN)"
                  placeholder="0.00"
                  value={price === "" ? "" : price}
                  onChange={(e) => {
                    const val = e.currentTarget.value;
                    setPrice(val);
                    setIsDirty(true);
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
                type="button"
                onClick={handleCancelClick}
                leftSection={<IconX size={16} />}
                disabled={submitting}
                data-testid="combo-cancel-button"
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
