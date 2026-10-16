import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Group,
  NativeSelect,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { FeedbackAlert } from "../../../components/shared/FeedbackAlert";
import { useCandidateProducts } from "../services/candidateProductsService";
import type { CandidateProduct, ComboComponentItem } from "../types/combos";

interface ComponentSelectorProps {
  existingSkus: string[];
  onAddComponent: (item: ComboComponentItem) => void;
}

export function ComponentSelector({
  existingSkus,
  onAddComponent,
}: ComponentSelectorProps) {
  const candidateService = useCandidateProducts();
  const [candidates, setCandidates] = useState<CandidateProduct[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedVariantSku, setSelectedVariantSku] = useState<string | null>(null);
  const [quantityStr, setQuantityStr] = useState<string>("1");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadCandidates() {
      setLoadingCandidates(true);
      setLoadError(null);
      try {
        const data = await candidateService.getCandidateProducts(controller.signal);
        if (active) {
          setCandidates(data);
        }
      } catch (err: unknown) {
        if (active) {
          setLoadError(
            err instanceof Error
              ? err.message
              : "No se pudieron cargar los productos candidatos de Catálogo.",
          );
        }
      } finally {
        if (active) {
          setLoadingCandidates(false);
        }
      }
    }

    loadCandidates();

    return () => {
      active = false;
      controller.abort();
    };
  }, [candidateService]);

  const selectedProduct = candidates.find(
    (p) => p.productId === selectedProductId,
  );

  const productOptions = [
    { value: "", label: "Seleccionar producto de catálogo..." },
    ...candidates
      .filter((p) => p.status === "ACTIVO")
      .map((p) => ({
        value: p.productId,
        label: `${p.name} (${p.hasVariants ? "Con variantes" : `SKU: ${p.skuBase}`})`,
      })),
  ];

  const variantOptions = selectedProduct?.hasVariants
    ? [
        { value: "", label: "Seleccionar SKU de variante..." },
        ...selectedProduct.variants.map((v) => ({
          value: v.sku,
          label: `${v.label} · [${v.sku}] ${v.status !== "ACTIVA" ? "(No vendible)" : ""}`,
          disabled: v.status !== "ACTIVA",
        })),
      ]
    : [];

  const handleProductChange = (val: string) => {
    setSelectedProductId(val || null);
    setSelectedVariantSku(null);
    setError(null);
  };

  const handleAdd = () => {
    setError(null);
    if (!selectedProduct) {
      setError("Selecciona un producto candidato.");
      return;
    }

    // Strict positive integer validation per H10: reject decimals, negatives, zero, NaN, partial strings
    const trimmedQty = quantityStr.trim();
    if (!/^[1-9]\d*$/.test(trimmedQty)) {
      setError("La cantidad debe ser un número entero positivo mayor o igual a 1 (sin decimales ni signos).");
      return;
    }

    const qty = parseInt(trimmedQty, 10);

    let targetSku: string;
    let variantLabel: string | undefined;

    if (selectedProduct.hasVariants) {
      if (!selectedVariantSku) {
        setError("Este producto posee variantes. Debes seleccionar una variante/SKU específica.");
        return;
      }
      const v = selectedProduct.variants.find((vr) => vr.sku === selectedVariantSku);
      if (!v || v.status !== "ACTIVA") {
        setError("La variante seleccionada no está activa o no es vendible.");
        return;
      }
      targetSku = v.sku;
      variantLabel = v.label;
    } else {
      targetSku = selectedProduct.skuBase;
    }

    // Check nested combo prohibition
    if (targetSku === "COMBO-ANIDADO-SKU" || selectedProduct.productId === "PROD-008") {
      setError("No se admiten combos anidados como componentes de otro combo.");
      return;
    }

    // Check duplicates
    if (existingSkus.includes(targetSku)) {
      setError(`El SKU ${targetSku} ya está incluido en los componentes de este combo.`);
      return;
    }

    onAddComponent({
      sku: targetSku,
      quantity: qty,
      productName: selectedProduct.name,
      variantLabel,
    });

    // Reset selection
    setSelectedProductId(null);
    setSelectedVariantSku(null);
    setQuantityStr("1");
  };

  if (loadingCandidates) {
    return (
      <Card withBorder radius="sm" p="md">
        <Stack gap="xs">
          <Skeleton height={20} width={200} />
          <Skeleton height={36} />
        </Stack>
      </Card>
    );
  }

  if (loadError) {
    return (
      <FeedbackAlert
        semantic="error"
        title="Catálogo no disponible"
      >
        {loadError}
      </FeedbackAlert>
    );
  }

  return (
    <Card withBorder radius="sm" p="md">
      <Stack gap="sm">
        <Text fw={600} size="sm">
          Agregar componente desde Catálogo
        </Text>

        <Group align="flex-start" grow>
          <NativeSelect
            label="Producto candidato"
            data={productOptions}
            value={selectedProductId ?? ""}
            onChange={(e) => handleProductChange(e.currentTarget.value)}
            data-testid="combo-candidate-product-select"
          />

          {selectedProduct?.hasVariants && (
            <NativeSelect
              label="Variante vendible (SKU)"
              data={variantOptions}
              value={selectedVariantSku ?? ""}
              onChange={(e) => {
                setSelectedVariantSku(e.currentTarget.value || null);
                setError(null);
              }}
              data-testid="combo-candidate-variant-select"
            />
          )}

          <TextInput
            label="Cantidad requerida"
            value={quantityStr}
            onChange={(e) => {
              setQuantityStr(e.currentTarget.value);
              setError(null);
            }}
            type="number"
            min={1}
            step={1}
            style={{ maxWidth: 140 }}
            data-testid="combo-quantity-input"
          />
        </Group>

        {error && (
          <FeedbackAlert semantic="error" title="Error de selección">
            {error}
          </FeedbackAlert>
        )}

        <Group justify="flex-end" mt="xs">
          <Button
            type="button"
            leftSection={<IconPlus size={16} />}
            onClick={handleAdd}
            disabled={!selectedProductId}
            data-testid="combo-add-component-button"
          >
            Agregar a componentes
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
