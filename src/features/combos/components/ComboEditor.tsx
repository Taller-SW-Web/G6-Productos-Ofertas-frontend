import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Group, NumberInput, Select, Table, Text, TextInput, Textarea } from "@mantine/core";
import { IconInfoCircle, IconTrash } from "@tabler/icons-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ConfirmDialog, FeedbackAlert, SectionCard } from "../../../components/shared";
import { compareComboPrice, formatMoney, toComparisonComponents, validateComposition } from "../services/comboRules";
import { RequestIdentity } from "../services/requestIdentity";
import { draftFromCombo, keepDraftAfterVersionConflict } from "../services/drafts";
import { ComboError, type Combo, type ComboDraft, type ProductDetail, type ProductSummary, type SkuPrice } from "../types/combos";
import { useCombosRuntime } from "../hooks/useCombosRuntime";
import classes from "../combos.module.css";

const emptyPrices: SkuPrice[] = [];

type SearchState =
  | { key: string; status: "loading" }
  | { key: string; status: "error"; message: string }
  | { key: string; status: "success"; products: ProductSummary[] };
type ProductDetailState =
  | { key: string; status: "loading" }
  | { key: string; status: "error"; message: string }
  | { key: string; status: "success"; product: ProductDetail | null };
type PriceState =
  | { key: string; status: "loading" }
  | { key: string; status: "error"; message: string }
  | { key: string; status: "success"; prices: SkuPrice[] };

export function ComboEditor({ existing }: { existing?: Combo }) {
  const { combos, catalog, pricing } = useCombosRuntime();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const scenario = params.get("scenario") ?? undefined;
  const [draft, setDraft] = useState<ComboDraft>(() => draftFromCombo(existing));
  const [expectedVersion, setExpectedVersion] = useState(existing?.version);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchRetry, setSearchRetry] = useState(0);
  const [searchState, setSearchState] = useState<SearchState>({ key: "", status: "loading" });
  const [selectedProduct, setSelectedProduct] = useState<ProductSummary | null>(null);
  const [detailRetry, setDetailRetry] = useState(0);
  const [detailState, setDetailState] = useState<ProductDetailState>({ key: "", status: "loading" });
  const [selectedVariantSku, setSelectedVariantSku] = useState<string | null>(null);
  const [priceState, setPriceState] = useState<PriceState>({ key: "", status: "success", prices: emptyPrices });
  const [priceRetry, setPriceRetry] = useState(0);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [serverVersion, setServerVersion] = useState<Combo | null>(null);
  const [versionConflict, setVersionConflict] = useState(false);
  const [versionReadError, setVersionReadError] = useState<string | null>(null);
  const [confirmReplaceDraft, setConfirmReplaceDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const searchIdentity = useRef(new RequestIdentity());
  const detailIdentity = useRef(new RequestIdentity());
  const priceIdentity = useRef(new RequestIdentity());
  const versionIdentity = useRef(new RequestIdentity());
  const versionController = useRef<AbortController | null>(null);
  const skuKey = draft.components.map((item) => item.sku).join("|");
  const searchKey = JSON.stringify([searchQuery, searchRetry]);
  const selectedProductId = selectedProduct?.productId ?? "";
  const detailKey = JSON.stringify([selectedProductId, detailRetry]);
  const priceKey = JSON.stringify([skuKey, priceRetry]);

  useEffect(() => {
    const requests = versionIdentity.current;
    return () => {
      versionController.current?.abort();
      requests.invalidate();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const requests = searchIdentity.current;
    const requestId = requests.begin();
    void catalog.listProducts(searchQuery, controller.signal).then((products) => {
      if (requests.isCurrent(requestId, controller.signal)) setSearchState({ key: searchKey, status: "success", products });
    }).catch((reason: unknown) => {
      if (requests.isCurrent(requestId, controller.signal)) {
        setSearchState({ key: searchKey, status: "error", message: reason instanceof Error ? reason.message : "No se pudieron consultar los productos." });
      }
    });
    return () => {
      controller.abort();
      requests.invalidate();
    };
  }, [catalog, searchKey, searchQuery]);

  useEffect(() => {
    if (!selectedProduct?.hasVariants) return;
    const controller = new AbortController();
    const requests = detailIdentity.current;
    const requestId = requests.begin();
    const productId = selectedProduct.productId;
    void catalog.getProduct(productId, controller.signal).then((product) => {
      if (requests.isCurrent(requestId, controller.signal)) setDetailState({ key: detailKey, status: "success", product });
    }).catch((reason: unknown) => {
      if (requests.isCurrent(requestId, controller.signal)) {
        setDetailState({ key: detailKey, status: "error", message: reason instanceof Error ? reason.message : "No se pudieron consultar las variantes." });
      }
    });
    return () => {
      controller.abort();
      requests.invalidate();
    };
  }, [catalog, detailKey, selectedProduct]);

  useEffect(() => {
    if (!skuKey) return;
    const controller = new AbortController();
    const requests = priceIdentity.current;
    const requestId = requests.begin();
    const skus = skuKey.split("|");
    void pricing.readCurrent(skus, controller.signal).then((prices) => {
      if (requests.isCurrent(requestId, controller.signal)) {
        setPriceState(prices.length === skus.length
          ? { key: priceKey, status: "success", prices }
          : { key: priceKey, status: "error", message: "No se confirmó el precio vigente de todos los SKU." });
      }
    }).catch((reason: unknown) => {
      if (requests.isCurrent(requestId, controller.signal)) {
        setPriceState({ key: priceKey, status: "error", message: reason instanceof Error ? reason.message : "Pricing no está disponible." });
      }
    });
    return () => {
      controller.abort();
      requests.invalidate();
    };
  }, [priceKey, pricing, skuKey]);

  const currentSearch = searchState.key === searchKey ? searchState : { key: searchKey, status: "loading" as const };
  const currentDetail: ProductDetailState = !selectedProduct?.hasVariants
    ? { key: detailKey, status: "success", product: null }
    : detailState.key === detailKey ? detailState : { key: detailKey, status: "loading" };
  const currentPrice: PriceState = !skuKey
    ? { key: priceKey, status: "success", prices: emptyPrices }
    : priceState.key === priceKey ? priceState : { key: priceKey, status: "loading" };
  const prices = currentPrice.status === "success" ? currentPrice.prices : emptyPrices;
  const pricingError = currentPrice.status === "error" ? currentPrice.message : null;
  const comparison = useMemo(() => compareComboPrice(toComparisonComponents(draft.components, prices), draft.price, scenario === "pricing-unavailable" ? [] : prices), [draft.components, draft.price, prices, scenario]);
  const compositionErrors = validateComposition(draft);
  const nameError = draft.name.trim() ? null : "Ingresa el nombre del combo.";
  const canSave = !submitting && !versionConflict && !nameError && compositionErrors.length === 0 && currentPrice.status === "success" && comparison.status === "ready" && comparison.valid;
  const productOptions = currentSearch.status === "success" ? currentSearch.products.filter((product) => product.active).map((product) => ({ value: product.productId, label: product.name })) : [];
  const variantOptions = currentDetail.status === "success" ? currentDetail.product?.variants.filter((variant) => variant.active).map((variant) => ({ value: variant.sku, label: variant.label })) ?? [] : [];

  function selectProduct(productId: string | null) {
    const product = currentSearch.status === "success" ? currentSearch.products.find((item) => item.productId === productId) ?? null : null;
    setSelectedProduct(product);
    setSelectedVariantSku(null);
  }

  function addSelectedSku() {
    if (!selectedProduct) return;
    const productDetail = currentDetail.status === "success" ? currentDetail.product : null;
    const sku = selectedProduct.hasVariants
      ? productDetail?.variants.find((variant) => variant.sku === selectedVariantSku && variant.active)?.sku ?? null
      : selectedProduct.baseSku;
    if (!sku) return;
    if (draft.components.some((item) => item.sku === sku)) {
      setError({ title: "SKU ya agregado", message: "Cada SKU debe aparecer una sola vez en el combo." });
      return;
    }
    setDraft((current) => ({ ...current, components: [...current.components, { sku, productName: selectedProduct.name, quantity: 1 }] }));
    setSelectedProduct(null);
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
        ...(existing ? { version: expectedVersion } : {}),
      };
      const saved = existing
        ? await combos.update(existing.id, payload, scenario)
        : await combos.create(payload, scenario);
      navigate(`/combos/${saved.id}`, { replace: true });
    } catch (reason) {
      if (reason instanceof ComboError && reason.kind === "version_conflict") {
        const conflict = keepDraftAfterVersionConflict(draft, reason.currentVersion);
        setDraft(conflict.draft);
        setVersionConflict(true);
        setServerVersion(conflict.currentVersion ?? null);
        setVersionReadError(null);
        setError({ title: "Hay cambios en el servidor", message: "Tu borrador local se conserva. Compara la versión actual antes de reemplazarlo; no se guardará usando una versión obsoleta." });
      } else if (reason instanceof ComboError && reason.kind === "price_invalid") {
        setError({ title: "No se pudo guardar el precio", message: `${reason.message} Se conservaron los datos ingresados.` });
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
    versionController.current?.abort();
    const controller = new AbortController();
    versionController.current = controller;
    const requests = versionIdentity.current;
    const requestId = requests.begin();
    setVersionReadError(null);
    try {
      const current = await combos.getById(existing.id, controller.signal);
      if (!requests.isCurrent(requestId, controller.signal)) return;
      if (current) setServerVersion(current);
      else setVersionReadError("El combo ya no está disponible para consultar.");
    } catch (reason) {
      if (requests.isCurrent(requestId, controller.signal)) {
        setVersionReadError(reason instanceof Error ? reason.message : "No se pudo consultar la versión actual.");
      }
    }
  }

  function discardDraftForCurrentVersion() {
    if (!serverVersion) return;
    setDraft(draftFromCombo(serverVersion));
    setExpectedVersion(serverVersion.version);
    setVersionConflict(false);
    setServerVersion(null);
    setVersionReadError(null);
    setError(null);
    setConfirmReplaceDraft(false);
  }

  return <form onSubmit={submit} className={classes.editor}>
    {error && <FeedbackAlert semantic="error" title={error.title} actions={error.title === "Hay cambios en el servidor" ? <Button type="button" variant="outline" onClick={() => void consultCurrentVersion()}>Consultar versión actual</Button> : undefined}>{error.message}</FeedbackAlert>}
    {versionReadError && <FeedbackAlert semantic="warning" title="No se pudo consultar la versión actual">{versionReadError}</FeedbackAlert>}
    {serverVersion && <SectionCard title={`Versión actual del servidor · v${serverVersion.version}`} description="Compara esta definición con el borrador que permanece en el formulario. La versión de guardado no cambia hasta que elijas cargar la versión actual.">
      <div role="region" aria-label="Versión actual del servidor">
        <Text fw={600}>{serverVersion.name}</Text>
        <Text size="sm" c="dimmed">{serverVersion.description || "Sin descripción"}</Text>
        <Text mt="sm">Precio actual: {formatMoney(serverVersion.priceMinor)}</Text>
        <Text size="sm" mt="xs">Componentes actuales:</Text>
        <ul>{serverVersion.components.map((component) => <li key={component.sku}>{component.productName} · {component.sku} · cantidad {component.quantity}</li>)}</ul>
      </div>
      <Group justify="flex-end"><Button type="button" color="danger" onClick={() => setConfirmReplaceDraft(true)}>Cargar versión actual y descartar borrador</Button></Group>
    </SectionCard>}

    <SectionCard title="Datos generales" description="Define la identidad comercial de esta composición.">
      <TextInput label="Nombre" value={draft.name} onChange={(event) => { const name = event.currentTarget.value; setDraft((current) => ({ ...current, name })); }} error={nameError} maxLength={120} required />
      <Textarea label="Descripción" value={draft.description} onChange={(event) => { const description = event.currentTarget.value; setDraft((current) => ({ ...current, description })); }} minRows={3} maxLength={500} />
    </SectionCard>

    <SectionCard title="Componentes" description="Busca productos activos y resuelve cada componente al SKU vendible publicado.">
      {currentSearch.status === "error" && <FeedbackAlert semantic="error" title="No se pudo consultar el catálogo" actions={<Button type="button" variant="outline" onClick={() => setSearchRetry((value) => value + 1)}>Reintentar búsqueda</Button>}>{currentSearch.message} Los componentes ya seleccionados se conservan.</FeedbackAlert>}
      {currentSearch.status === "success" && currentSearch.products.length === 0 && <Alert icon={<IconInfoCircle size={18} />} color="gray" title="No hay productos activos">Prueba con otro nombre o revisa el catálogo.</Alert>}
      <Group align="flex-end" wrap="wrap">
        <Select className={classes.productSelect} label="Producto" placeholder="Busca producto activo" searchable clearable data={productOptions} value={selectedProduct?.productId ?? null} searchValue={searchQuery} onSearchChange={setSearchQuery} onChange={selectProduct} nothingFoundMessage={currentSearch.status === "loading" ? "Buscando productos…" : "No hay productos con ese nombre."} />
        {selectedProduct?.hasVariants && <Select className={classes.productSelect} label="Variante / SKU" placeholder={currentDetail.status === "loading" ? "Consultando variantes…" : "Elige una variante"} data={variantOptions} value={selectedVariantSku} onChange={setSelectedVariantSku} disabled={currentDetail.status !== "success"} />}
        <Button type="button" variant="outline" disabled={!selectedProduct || (selectedProduct.hasVariants && (currentDetail.status !== "success" || !selectedVariantSku))} onClick={addSelectedSku}>Agregar componente</Button>
      </Group>
      {currentDetail.status === "error" && <FeedbackAlert semantic="error" title="No se pudieron consultar las variantes" actions={<Button type="button" variant="outline" onClick={() => setDetailRetry((value) => value + 1)}>Reintentar variantes</Button>}>{currentDetail.message} Los componentes que ya agregaste siguen en el borrador.</FeedbackAlert>}
      {selectedProduct?.hasVariants && currentDetail.status === "success" && variantOptions.length === 0 && <Alert icon={<IconInfoCircle size={18} />} color="gray" title="No hay variantes activas">Este producto no tiene SKU que se puedan seleccionar actualmente.</Alert>}
      {compositionErrors.length > 0 && <Text size="sm" c="dimmed">{compositionErrors[0]}</Text>}
      {draft.components.length === 0 ? <Alert icon={<IconInfoCircle size={18} />} color="blue" title="Aún no hay componentes">El combo requiere al menos dos SKU directos y distintos.</Alert> : <Table.ScrollContainer minWidth={700}><Table striped highlightOnHover><Table.Thead><Table.Tr><Table.Th>Producto / SKU</Table.Th><Table.Th>Cantidad</Table.Th><Table.Th aria-label="Acciones" /></Table.Tr></Table.Thead><Table.Tbody>{draft.components.map((component, index) => <Table.Tr key={component.sku}><Table.Td><Text fw={500}>{component.productName}</Text><Text size="sm" c="dimmed">{component.sku}</Text></Table.Td><Table.Td><NumberInput aria-label={`Cantidad de ${component.productName}`} min={1} step={1} decimalScale={0} value={component.quantity} onChange={(value) => setDraft((current) => ({ ...current, components: current.components.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: typeof value === "number" ? value : 0 } : item) }))} w={110} /></Table.Td><Table.Td><Button type="button" aria-label={`Quitar ${component.productName}`} variant="subtle" color="danger" onClick={() => setDraft((current) => ({ ...current, components: current.components.filter((_, itemIndex) => itemIndex !== index) }))}><IconTrash size={18} /></Button></Table.Td></Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer>}
    </SectionCard>

    <SectionCard title="Precio del combo" description="La comparación es preventiva; Combos conserva la validación final.">
      <TextInput label="Precio del combo (PEN)" inputMode="decimal" value={draft.price} onChange={(event) => { const price = event.currentTarget.value; setDraft((current) => ({ ...current, price })); }} placeholder="0.00" error={comparison.status === "ready" ? comparison.reason : undefined} />
      <div className={classes.comparison} role="region" aria-label="Comparación económica">
        <div><Text size="sm" c="dimmed">Suma regular</Text><Text fw={600}>{comparison.status === "ready" ? formatMoney(comparison.regularMinor) : "No disponible"}</Text></div>
        <div><Text size="sm" c="dimmed">Suma pública vigente</Text><Text fw={600}>{comparison.status === "ready" ? formatMoney(comparison.publicMinor) : "No disponible"}</Text></div>
        <div><Text size="sm" c="dimmed">Precio del combo</Text><Text fw={600}>{comparison.status === "ready" ? formatMoney(comparison.comboMinor) : "Ingresa un precio"}</Text></div>
      </div>
      {currentPrice.status === "loading" && <Text size="sm" role="status">Consultando precios vigentes…</Text>}
      {pricingError && <FeedbackAlert semantic="warning" title="No se pudo validar la comparación" actions={<Button type="button" variant="outline" onClick={() => setPriceRetry((value) => value + 1)}>Reintentar precios</Button>}>{pricingError} No se puede confirmar que el precio sea válido hasta que Pricing responda.</FeedbackAlert>}
      {comparison.status === "unavailable" && !pricingError && <FeedbackAlert semantic="warning" title="Comparación no disponible">{comparison.reason} No se puede confirmar que el precio sea válido hasta que Pricing responda.</FeedbackAlert>}
      {comparison.status === "ready" && comparison.valid && <FeedbackAlert semantic="success" title="Precio con beneficio económico">El precio es menor que las sumas regular y pública vigente para los componentes seleccionados.</FeedbackAlert>}
      <Text size="xs" c="dimmed">Referencia pública global vigente, sin canal. Una oferta efectiva vigente prevalece sobre el precio regular; si no existe, se usa el precio regular.</Text>
    </SectionCard>

    <Group justify="flex-end">
      <Button component={Link} to={existing ? `/combos/${existing.id}` : "/combos"} variant="outline">Cancelar</Button>
      <Button type="submit" loading={submitting} disabled={!canSave}>{existing ? "Guardar cambios" : "Crear combo"}</Button>
    </Group>

    <ConfirmDialog opened={confirmReplaceDraft} title="Cargar versión actual" confirmLabel="Descartar borrador y cargar" destructive onCancel={() => setConfirmReplaceDraft(false)} onConfirm={discardDraftForCurrentVersion}>
      <Text>Se reemplazarán el nombre, descripción, componentes, cantidades y precio de este borrador con la versión {serverVersion?.version} del servidor. Esta acción no guarda cambios.</Text>
    </ConfirmDialog>
  </form>;
}
