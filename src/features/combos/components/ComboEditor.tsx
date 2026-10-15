import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Group, NumberInput, Select, Table, Text, TextInput, Textarea } from "@mantine/core";
import { IconInfoCircle, IconTrash } from "@tabler/icons-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FeedbackAlert, SectionCard } from "../../../components/shared";
import { compareComboPrice, formatMoney, toComparisonComponents, validateComposition } from "../services/comboRules";
import { ComboError, type Combo, type ComponentDraft, type ProductCandidate, type SkuPrice } from "../types/combos";
import { useCombosRuntime } from "../hooks/useCombosRuntime";
import classes from "../combos.module.css";

const blankDraft = { name: "", description: "", components: [] as ComponentDraft[], price: "" };
const noPrices: SkuPrice[] = [];
const draftFromCombo = (combo?: Combo) => combo
  ? { name: combo.name, description: combo.description ?? "", components: combo.components.map(({ sku, productName, quantity }) => ({ sku, productName, quantity })), price: (combo.priceMinor / 100).toFixed(2) }
  : blankDraft;

export function ComboEditor({ existing }: { existing?: Combo }) {
  const { combos, catalog, pricing } = useCombosRuntime();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const scenario = params.get("scenario") ?? undefined;
  const [draft, setDraft] = useState(() => draftFromCombo(existing));
  const [products, setProducts] = useState<ProductCandidate[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedVariantSku, setSelectedVariantSku] = useState<string | null>(null);
  const skuKey = draft.components.map((item) => item.sku).join("|");
  const [priceRead, setPriceRead] = useState<{ key: string; prices: SkuPrice[]; error: string | null }>({ key: "", prices: [], error: null });
  const currentPriceRead = priceRead.key === skuKey ? priceRead : null;
  const prices = currentPriceRead?.prices ?? noPrices;
  const pricingError = currentPriceRead?.error ?? null;
  const [error, setError] = useState<{ title: string; message: string; currentVersion?: Combo } | null>(null);
  const [serverVersion, setServerVersion] = useState<Combo | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const selectedProduct = products.find((item) => item.productId === selectedProductId) ?? null;

  useEffect(() => {
    const controller = new AbortController();
    void catalog.listProducts(controller.signal).then(setProducts).catch((reason: unknown) => {
      setError({ title: "No se pudo consultar el catálogo", message: reason instanceof Error ? reason.message : "Intenta volver a cargar los productos." });
    });
    return () => controller.abort();
  }, [catalog]);

  useEffect(() => {
    let alive = true;
    const skus = skuKey ? skuKey.split("|") : [];
    if (skus.length === 0) return;
    const controller = new AbortController();
    void pricing.readCurrent(skus, controller.signal).then((result) => {
      if (alive) setPriceRead({ key: skuKey, prices: result, error: result.length === skus.length ? null : "No se confirmó el precio de todos los SKU." });
    }).catch((reason: unknown) => {
      if (alive) setPriceRead({ key: skuKey, prices: [], error: reason instanceof Error ? reason.message : "Pricing no está disponible." });
    });
    return () => { alive = false; controller.abort(); };
  }, [skuKey, pricing]);

  const comparison = useMemo(() => compareComboPrice(toComparisonComponents(draft.components, prices), draft.price, scenario === "pricing-unavailable" ? [] : prices), [draft.components, draft.price, prices, scenario]);
  const compositionErrors = validateComposition(draft);
  const nameError = draft.name.trim() ? null : "Ingresa el nombre del combo.";
  const canSave = !submitting && !nameError && compositionErrors.length === 0 && comparison.status === "ready" && comparison.valid && !pricingError && (!skuKey || currentPriceRead !== null);

  async function addSelectedSku(sku: string | null, product: ProductCandidate | null) {
    if (!sku || !product) return;
    if (draft.components.some((item) => item.sku === sku)) {
      setError({ title: "SKU ya agregado", message: "Cada SKU debe aparecer una sola vez en el combo." });
      return;
    }
    setDraft((current) => ({ ...current, components: [...current.components, { sku, productName: product.name, quantity: 1 }] }));
    setSelectedProductId(null);
    setSelectedVariantSku(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || inFlight.current || comparison.status !== "ready" || comparison.comboMinor === null) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        components: draft.components.map(({ sku, quantity }) => ({ sku, quantity })),
        priceMinor: comparison.comboMinor,
        ...(existing ? { version: existing.version } : {}),
      };
      const saved = existing
        ? await combos.update(existing.id, payload, scenario)
        : await combos.create(payload, scenario);
      navigate(`/combos/${saved.id}`, { replace: true });
    } catch (reason) {
      if (reason instanceof ComboError && reason.kind === "version_conflict") {
        setError({ title: "Hay cambios en el servidor", message: "Este combo cambió desde que comenzaste a editarlo. Revisa la versión actual antes de volver a guardar tus cambios.", currentVersion: reason.currentVersion });
      } else if (reason instanceof ComboError && reason.kind === "price_invalid") {
        setError({ title: "No se pudo guardar el precio", message: "El precio propuesto no cumple la regla económica. Revisa la comparación y conserva tus cambios para corregirlos." });
      } else {
        setError({ title: "No se pudo guardar el combo", message: reason instanceof Error ? reason.message : "Revisa los datos e intenta nuevamente." });
      }
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  async function consultCurrentVersion() {
    if (!existing) return;
    try {
      const current = await combos.getById(existing.id);
      if (current) setServerVersion(current);
    } catch (reason) {
      setError({ title: "No se pudo consultar la versión actual", message: reason instanceof Error ? reason.message : "Intenta nuevamente." });
    }
  }

  const variantOptions = selectedProduct?.variants.filter((variant) => variant.active).map((variant) => ({ value: variant.sku, label: variant.label })) ?? [];

  return <form onSubmit={submit} className={classes.editor}>
    {error && <FeedbackAlert semantic="error" title={error.title} actions={error.currentVersion ? <Button type="button" variant="outline" onClick={() => void consultCurrentVersion()}>Consultar versión actual</Button> : undefined}>{error.message}</FeedbackAlert>}
    {serverVersion && <FeedbackAlert semantic="info" title={`Versión actual del servidor: ${serverVersion.version}`}>La propuesta local sigue conservada. Revisa los cambios antes de actualizar tu edición.</FeedbackAlert>}
    <SectionCard title="Datos generales" description="Define la identidad comercial de esta composición.">
      <TextInput label="Nombre" value={draft.name} onChange={(event) => { const name = event.currentTarget.value; setDraft((current) => ({ ...current, name })); }} error={nameError} maxLength={120} required />
      <Textarea label="Descripción" value={draft.description} onChange={(event) => { const description = event.currentTarget.value; setDraft((current) => ({ ...current, description })); }} minRows={3} maxLength={500} />
    </SectionCard>

    <SectionCard title="Componentes" description="Selecciona productos activos y resuelve cada componente al SKU vendible publicado.">
      <Group align="flex-end" wrap="wrap">
        <Select className={classes.productSelect} label="Producto" placeholder="Selecciona producto" searchable data={products.filter((product) => product.active).map((product) => ({ value: product.productId, label: product.name }))} value={selectedProductId} onChange={(value) => { setSelectedProductId(value); setSelectedVariantSku(null); }} />
        {selectedProduct?.hasVariants && <Select className={classes.productSelect} label="Variante / SKU" placeholder="Elige una variante" data={variantOptions} value={selectedVariantSku} onChange={setSelectedVariantSku} />}
        <Button type="button" variant="outline" disabled={!selectedProduct || (selectedProduct.hasVariants && !selectedVariantSku)} onClick={() => void addSelectedSku(selectedProduct?.hasVariants ? selectedVariantSku : selectedProduct?.baseSku ?? null, selectedProduct)}>Agregar componente</Button>
      </Group>
      {compositionErrors.length > 0 && <Text size="sm" c="dimmed">{compositionErrors[0]}</Text>}
      {draft.components.length === 0 ? <Alert icon={<IconInfoCircle size={18} />} color="blue" title="Aún no hay componentes">El combo requiere al menos dos SKU directos y distintos.</Alert> : <Table.ScrollContainer minWidth={700}><Table striped highlightOnHover><Table.Thead><Table.Tr><Table.Th>Producto / SKU</Table.Th><Table.Th>Cantidad</Table.Th><Table.Th aria-label="Acciones" /></Table.Tr></Table.Thead><Table.Tbody>{draft.components.map((component, index) => <Table.Tr key={component.sku}><Table.Td><Text fw={500}>{component.productName}</Text><Text size="sm" c="dimmed">{component.sku}</Text></Table.Td><Table.Td><NumberInput aria-label={`Cantidad de ${component.productName}`} min={1} step={1} decimalScale={0} value={component.quantity} onChange={(value) => setDraft((current) => ({ ...current, components: current.components.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: typeof value === "number" ? value : 0 } : item) }))} w={110} /></Table.Td><Table.Td><Button type="button" aria-label={`Quitar ${component.productName}`} variant="subtle" color="danger" onClick={() => setDraft((current) => ({ ...current, components: current.components.filter((_, itemIndex) => itemIndex !== index) }))}><IconTrash size={18} /></Button></Table.Td></Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer>}
    </SectionCard>

    <SectionCard title="Precio del combo" description="La comparación es preventiva; Combos conserva la validación final.">
      <TextInput label="Precio comercial del combo (PEN)" inputMode="decimal" value={draft.price} onChange={(event) => { const price = event.currentTarget.value; setDraft((current) => ({ ...current, price })); }} placeholder="0.00" error={comparison.status === "ready" ? comparison.reason : undefined} />
      <div className={classes.comparison} role="region" aria-label="Comparación económica">
        <div><Text size="sm" c="dimmed">Suma regular</Text><Text fw={600}>{comparison.status === "ready" ? formatMoney(comparison.regularMinor) : "No disponible"}</Text></div>
        <div><Text size="sm" c="dimmed">Suma pública vigente</Text><Text fw={600}>{comparison.status === "ready" ? formatMoney(comparison.publicMinor) : "No disponible"}</Text></div>
        <div><Text size="sm" c="dimmed">Precio del combo</Text><Text fw={600}>{comparison.status === "ready" ? formatMoney(comparison.comboMinor) : "Ingresa un precio"}</Text></div>
      </div>
      {comparison.status === "unavailable" || pricingError ? <FeedbackAlert semantic="warning" title="No se pudo validar la comparación">{pricingError ?? comparison.reason} No se puede confirmar que el precio sea válido hasta que Pricing responda.</FeedbackAlert> : comparison.valid ? <FeedbackAlert semantic="success" title="Precio con beneficio económico">El precio es menor que las sumas regular y pública vigente para los componentes seleccionados.</FeedbackAlert> : null}
      <Text size="xs" c="dimmed">Referencia pública global vigente, sin canal. Las ofertas efectivas vigentes prevalecen sobre el precio regular.</Text>
    </SectionCard>

    <Group justify="flex-end">
      <Button component={Link} to={existing ? `/combos/${existing.id}` : "/combos"} variant="outline">Cancelar</Button>
      <Button type="submit" loading={submitting} disabled={!canSave}>{existing ? "Guardar cambios" : "Crear combo"}</Button>
    </Group>
  </form>;
}
