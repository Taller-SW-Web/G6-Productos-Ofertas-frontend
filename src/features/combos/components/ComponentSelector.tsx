import { useState } from "react";
import {
  Button,
  Card,
  Group,
  NumberInput,
  NativeSelect,
  Stack,
  Text,
  Alert,
} from "@mantine/core";
import { IconPlus, IconAlertCircle } from "@tabler/icons-react";
import { catalogCandidateProducts } from "../mocks/combosFixtures";
import type { ComboComponentItem } from "../types/combos";

interface ComponentSelectorProps {
  existingSkus: string[];
  onAddComponent: (item: ComboComponentItem) => void;
}

export function ComponentSelector({
  existingSkus,
  onAddComponent,
}: ComponentSelectorProps) {
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedVariantSku, setSelectedVariantSku] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number | string>(1);
  const [error, setError] = useState<string | null>(null);

  const selectedProduct = catalogCandidateProducts.find(
    (p) => p.productId === selectedProductId,
  );

  const productOptions = [
    { value: "", label: "Seleccionar producto de catálogo..." },
    ...catalogCandidateProducts
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

    const qty = typeof quantity === "number" ? quantity : parseInt(quantity, 10);
    if (isNaN(qty) || qty < 1) {
      setError("La cantidad debe ser un número entero mayor o igual a 1.");
      return;
    }

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
    if (targetSku === "COMBO-ANIDADO-SKU") {
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
    setQuantity(1);
  };

  return (
    <Card withBorder radius="sm" p="md" bg="var(--mantine-color-gray-0)">
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

          <NumberInput
            label="Cantidad requerida"
            value={quantity}
            onChange={setQuantity}
            min={1}
            step={1}
            style={{ maxWidth: 140 }}
          />
        </Group>

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light" p="xs">
            {error}
          </Alert>
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
