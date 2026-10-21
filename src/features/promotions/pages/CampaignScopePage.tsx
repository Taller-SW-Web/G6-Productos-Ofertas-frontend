import { useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { Button, Checkbox, Group, Stack, Text } from "@mantine/core";
import {
  EmptyState,
  FeedbackAlert,
  PageHeader,
  SearchField,
  SectionCard,
} from "../../../components/shared";
import { CampaignScope } from "../components/CampaignScope";
import type { CampaignEditorContext } from "./CampaignEditorLayout";
export function CampaignScopePage() {
  const { form, products, catalogError, catalogLoading, root, suffix } =
    useOutletContext<CampaignEditorContext>();
  const [selection, setSelection] = useState(() => ({
    productIds: [...form.draft.productIds],
    skus: [...form.draft.skus],
  }));
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string>();
  const navigate = useNavigate();
  const toggle = (
    type: "productIds" | "skus",
    value: string,
    checked: boolean,
  ) =>
    setSelection((current) => ({
      ...current,
      [type]: checked
        ? [...new Set([...current[type], value])]
        : current[type].filter((item) => item !== value),
    }));
  const filtered = products.filter((item) =>
    item.active && `${item.name} ${item.skus.map((sku) => sku.sku).join(" ")}`
      .toLocaleLowerCase("es")
      .includes(search.toLocaleLowerCase("es")),
  );
  return (
    <>
      <PageHeader
        title="Seleccionar alcance"
        description="Productos completos y SKU específicos conservan su identidad al volver al formulario."
      />
      <Stack gap="lg">
        <SearchField
          label="Buscar productos"
          value={search}
          onChange={setSearch}
        />
        {catalogLoading && <Text role="status">Consultando catálogo…</Text>}
        {catalogError && (
          <FeedbackAlert semantic="error" title="Catálogo no disponible">
            {catalogError} La selección anterior se conserva.
          </FeedbackAlert>
        )}
        {!catalogLoading && !catalogError && !filtered.length && (
          <EmptyState
            title="Sin candidatos"
            description="No hay productos activos con esta consulta."
            action={
              <Button variant="outline" onClick={() => setSearch("")}>
                Limpiar búsqueda
              </Button>
            }
          />
        )}
        {filtered.map((item) => (
          <SectionCard key={item.id} title={item.name}>
            <Checkbox
              label={`Producto completo: ${item.name}`}
              checked={selection.productIds.includes(item.id)}
              onChange={(event) =>
                toggle("productIds", item.id, event.currentTarget.checked)
              }
            />
            <Text size="sm">
              Incluye variantes elegibles presentes y futuras.
            </Text>
            {item.skus
              .filter((sku) => sku.active)
              .map((sku) => (
                <Checkbox
                  key={sku.sku}
                  label={`SKU específico: ${sku.sku} · ${sku.label}`}
                  checked={selection.skus.includes(sku.sku)}
                  onChange={(event) =>
                    toggle("skus", sku.sku, event.currentTarget.checked)
                  }
                />
              ))}
          </SectionCard>
        ))}
        <SectionCard title="Alcance seleccionado">
          <CampaignScope configuration={selection} products={products} />
        </SectionCard>
        {error && (
          <FeedbackAlert semantic="error" title="Selección incompleta">
            {error}
          </FeedbackAlert>
        )}
        <Group justify="flex-end" gap="sm">
          <Button component={Link} to={`${root}${suffix}`} variant="outline">
            Cancelar selección
          </Button>
          <Button
            disabled={catalogLoading || !!catalogError}
            onClick={() => {
              if (!selection.productIds.length && !selection.skus.length) {
                setError("Selecciona al menos un producto completo o SKU.");
                return;
              }
              form.update({ ...form.draft, ...selection });
              navigate(`${root}${suffix}`);
            }}
          >
            Confirmar alcance
          </Button>
        </Group>
      </Stack>
    </>
  );
}
