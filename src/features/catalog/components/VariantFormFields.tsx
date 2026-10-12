import {
  Alert,
  Badge,
  Box,
  Button,
  Grid,
  Group,
  NumberInput,
  Paper,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconCoins,
  IconPhoto,
  IconPlus,
  IconScale,
  IconTrash,
} from "@tabler/icons-react";
import { SectionCard } from "../../../components/shared";
import type { ProductDetailView } from "../services/catalogRepository";
import type { useVariantForm } from "../hooks/useVariantForm";

interface VariantFormFieldsProps {
  form: ReturnType<typeof useVariantForm>;
  parentProduct: ProductDetailView;
}

export function VariantFormFields({ form, parentProduct }: VariantFormFieldsProps) {
  const {
    formData,
    updateField,
    addIdentifyingAttribute,
    removeIdentifyingAttribute,
    updateIdentifyingAttribute,
    addNonIdentifyingAttribute,
    removeNonIdentifyingAttribute,
    updateNonIdentifyingAttribute,
    derivedVolumeCm3,
    errors,
    isEdit,
  } = form;

  return (
    <Stack gap="lg">
      {/* CARD 1: Identidad y Contexto del Padre */}
      <SectionCard
        title="1. Identidad y SKU"
        description="El SKU es la identidad comercial única de la variante. Si se deja en blanco al crear, Catálogo lo generará automáticamente."
      >
        <Stack gap="md">
          <Paper p="sm" withBorder bg="var(--mantine-color-gray-0)">
            <Group justify="space-between" align="center">
              <div>
                <Text size="xs" c="dimmed">
                  Producto Padre
                </Text>
                <Text size="sm" fw={600}>
                  {parentProduct.name}
                </Text>
              </div>
              <Group gap="xs">
                <Badge variant="outline" size="sm">
                  SKU Base: {parentProduct.skuBase}
                </Badge>
                <Badge variant="light" color="blue" size="sm">
                  {parentProduct.hasVariants ? "Con variantes" : "Simple"}
                </Badge>
              </Group>
            </Group>
          </Paper>

          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <TextInput
                label="SKU de la Variante"
                placeholder={isEdit ? "" : "Ej. PROD-OXF-AZUL-M (Opcional)"}
                description={
                  isEdit
                    ? "El SKU es inmutable una vez creado."
                    : "Opcional. Si se omite, el sistema generará uno único."
                }
                value={formData.sku}
                onChange={(e) => updateField("sku", e.currentTarget.value)}
                error={errors.sku}
                disabled={isEdit}
                required={false}
              />
            </Grid.Col>
          </Grid>
        </Stack>
      </SectionCard>

      {/* CARD 2: Atributos Identificadores y No Identificadores */}
      <SectionCard
        title="2. Atributos de la Variante"
        description={
          isEdit
            ? "Los atributos identificadores son inmutables. Puede modificar atributos complementarios."
            : "Debe definir al menos un atributo identificador (ej. Talla, Color) que distinga este SKU de otros."
        }
      >
        <Stack gap="lg">
          {/* Atributos Identificadores */}
          <Box>
            <Group justify="space-between" mb="xs">
              <div>
                <Text size="sm" fw={600}>
                  Atributos Identificadores *
                </Text>
                <Text size="xs" c="dimmed">
                  Definen la combinación única que distingue a este SKU.
                </Text>
              </div>
              {!isEdit && (
                <Button
                  variant="subtle"
                  size="xs"
                  leftSection={<IconPlus size={14} />}
                  onClick={addIdentifyingAttribute}
                >
                  Agregar atributo
                </Button>
              )}
            </Group>

            {errors.identifyingAttributes && (
              <Alert icon={<IconAlertCircle size={14} />} color="red" variant="light" mb="sm">
                <Text size="xs">{errors.identifyingAttributes}</Text>
              </Alert>
            )}

            {isEdit ? (
              <Group gap="xs">
                {formData.identifyingAttributes.map((attr, idx) => (
                  <Badge key={idx} size="lg" variant="filled" color="dark">
                    {attr.nombre}: {attr.valor}
                  </Badge>
                ))}
              </Group>
            ) : (
              <Stack gap="xs">
                {formData.identifyingAttributes.map((attr, idx) => (
                  <Grid key={idx} align="flex-end" gap="xs">
                    <Grid.Col span={{ base: 5, md: 5 }}>
                      <TextInput
                        placeholder="Nombre (ej. Talla, Color)"
                        value={attr.nombre}
                        onChange={(e) =>
                          updateIdentifyingAttribute(idx, "nombre", e.currentTarget.value)
                        }
                        error={errors[`id_attr_${idx}_nombre`]}
                        size="sm"
                      />
                    </Grid.Col>
                    <Grid.Col span={{ base: 5, md: 5 }}>
                      <TextInput
                        placeholder="Valor (ej. M, Azul Marino)"
                        value={attr.valor}
                        onChange={(e) =>
                          updateIdentifyingAttribute(idx, "valor", e.currentTarget.value)
                        }
                        error={errors[`id_attr_${idx}_valor`]}
                        size="sm"
                      />
                    </Grid.Col>
                    <Grid.Col span={{ base: 2, md: 2 }}>
                      <Button
                        color="red"
                        variant="subtle"
                        size="sm"
                        disabled={formData.identifyingAttributes.length <= 1}
                        onClick={() => removeIdentifyingAttribute(idx)}
                      >
                        <IconTrash size={16} />
                      </Button>
                    </Grid.Col>
                  </Grid>
                ))}
              </Stack>
            )}
          </Box>

          {/* Atributos No Identificadores */}
          <Box>
            <Group justify="space-between" mb="xs">
              <div>
                <Text size="sm" fw={600}>
                  Atributos Complementarios (No identificadores)
                </Text>
                <Text size="xs" c="dimmed">
                  Información adicional específica de esta variante (ej. Forro, Acabado).
                </Text>
              </div>
              <Button
                variant="subtle"
                size="xs"
                leftSection={<IconPlus size={14} />}
                onClick={addNonIdentifyingAttribute}
              >
                Agregar complementario
              </Button>
            </Group>

            {formData.nonIdentifyingAttributes.length === 0 ? (
              <Text size="xs" c="dimmed" fs="italic">
                Sin atributos complementarios adicionales.
              </Text>
            ) : (
              <Stack gap="xs">
                {formData.nonIdentifyingAttributes.map((attr, idx) => (
                  <Grid key={idx} align="flex-end" gap="xs">
                    <Grid.Col span={{ base: 5, md: 5 }}>
                      <TextInput
                        placeholder="Nombre (ej. Material forro)"
                        value={attr.nombre}
                        onChange={(e) =>
                          updateNonIdentifyingAttribute(idx, "nombre", e.currentTarget.value)
                        }
                        size="sm"
                      />
                    </Grid.Col>
                    <Grid.Col span={{ base: 5, md: 5 }}>
                      <TextInput
                        placeholder="Valor (ej. 100% Algodón)"
                        value={attr.valor}
                        onChange={(e) =>
                          updateNonIdentifyingAttribute(idx, "valor", e.currentTarget.value)
                        }
                        size="sm"
                      />
                    </Grid.Col>
                    <Grid.Col span={{ base: 2, md: 2 }}>
                      <Button
                        color="gray"
                        variant="subtle"
                        size="sm"
                        onClick={() => removeNonIdentifyingAttribute(idx)}
                      >
                        <IconTrash size={16} />
                      </Button>
                    </Grid.Col>
                  </Grid>
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
      </SectionCard>

      {/* CARD 3: Imagen y Perfil Físico */}
      <SectionCard
        title="3. Imagen y Perfil Físico"
        description="Cada variante posee su propio perfil físico para inventario y logística. Se admiten valores parciales en borrador, pero se exigirán completos para activación."
      >
        <Stack gap="md">
          <TextInput
            label="URL de Imagen de la Variante"
            placeholder="https://ejemplo.com/imagenes/variante-azul.jpg"
            description="URL pública de la imagen específica de esta variante."
            leftSection={<IconPhoto size={16} />}
            value={formData.imageUrl}
            onChange={(e) => updateField("imageUrl", e.currentTarget.value)}
            error={errors.imageUrl}
          />

          <div>
            <Group gap="xs" mb="xs">
              <IconScale size={16} />
              <Text size="sm" fw={600}>
                Dimensiones y Peso Físico (kg / cm)
              </Text>
            </Group>
            <Grid gap="md">
              <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                <NumberInput
                  label="Peso (kg)"
                  placeholder="0.00"
                  min={0.01}
                  step={0.05}
                  decimalScale={2}
                  value={formData.pesoKg}
                  onChange={(val) =>
                    updateField("pesoKg", typeof val === "number" ? val : undefined)
                  }
                  error={errors.pesoKg}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                <NumberInput
                  label="Largo (cm)"
                  placeholder="0.0"
                  min={0.1}
                  step={1}
                  decimalScale={1}
                  value={formData.largoCm}
                  onChange={(val) =>
                    updateField("largoCm", typeof val === "number" ? val : undefined)
                  }
                  error={errors.largoCm}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                <NumberInput
                  label="Ancho (cm)"
                  placeholder="0.0"
                  min={0.1}
                  step={1}
                  decimalScale={1}
                  value={formData.anchoCm}
                  onChange={(val) =>
                    updateField("anchoCm", typeof val === "number" ? val : undefined)
                  }
                  error={errors.anchoCm}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                <NumberInput
                  label="Alto (cm)"
                  placeholder="0.0"
                  min={0.1}
                  step={1}
                  decimalScale={1}
                  value={formData.altoCm}
                  onChange={(val) =>
                    updateField("altoCm", typeof val === "number" ? val : undefined)
                  }
                  error={errors.altoCm}
                />
              </Grid.Col>
            </Grid>

            {derivedVolumeCm3 !== null && (
              <Group gap="xs" mt="xs">
                <Text size="xs" c="dimmed">
                  Volumen calculado (informativo):
                </Text>
                <Badge variant="light" color="gray" size="sm">
                  {derivedVolumeCm3} cm³
                </Badge>
              </Group>
            )}
          </div>
        </Stack>
      </SectionCard>

      {/* CARD 4: Herencia de Precio Base */}
      <Alert
        icon={<IconCoins size={18} />}
        title="Herencia de Precio Base"
        color="blue"
        variant="light"
      >
        <Stack gap="xs">
          <Text size="xs">
            Las variantes <strong>heredan el precio base</strong> configurado en el producto padre (S/.{" "}
            {parentProduct.priceInitial?.toFixed(2) ?? "0.00"}).
          </Text>
          <Text size="xs" c="dimmed">
            No se define un precio propio en el Catálogo para la variante. Las sobreescrituras de precio
            por SKU son gestionadas posteriormente de manera autoritativa por el módulo de Pricing.
          </Text>
        </Stack>
      </Alert>
    </Stack>
  );
}
