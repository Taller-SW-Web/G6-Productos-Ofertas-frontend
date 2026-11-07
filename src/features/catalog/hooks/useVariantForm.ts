import { useState, useEffect, useContext } from "react";
import type { ProductDetailView, ProductAttributeValue, VariantCreatePayload, VariantDetailView, VariantUpdatePayload } from "../services/catalogRepository";
import { CatalogError } from "../services/catalogRepository";
import { useCatalogServices } from "./useCatalogServices";
import { normalizePhysicalProfile, calculateVolumeCm3 } from "../services/catalogPresentation";
import { validateVariantAttributes } from "../services/variantAttributeValidation";
import type { AttributeSchema } from "../services/taxonomyRepository";
import { runCatalogCreateIntent, hasCatalogCreateIntent } from "../services/catalogCreateIntent";
import { DataModeContext } from "../../../app/config/DataModeContext";
import { PromotionSessionContext } from "../../../app/config/PromotionSessionContext";

export interface FormAttributeEntry {
  key: string;
  caracteristicaId: string;
  nombre: string;
  tipo: "TEXTO" | "NUMERO" | "LISTA";
  valor: string;
  unidad?: string;
  obligatorio?: boolean;
}
export interface VariantFormData {
  sku: string;
  identifyingAttributes: FormAttributeEntry[];
  nonIdentifyingAttributes: FormAttributeEntry[];
  imageUrl: string;
  pesoKg?: number;
  largoCm?: number;
  anchoCm?: number;
  altoCm?: number;
}
export interface UseVariantFormOptions {
  parentProduct: ProductDetailView | null;
  initialVariant?: VariantDetailView;
  scenario?: string;
  onSuccess?: (variant: VariantDetailView) => void;
}
export function useVariantForm({ parentProduct, initialVariant, scenario, onSuccess }: UseVariantFormOptions) {
  const isEdit = Boolean(initialVariant);
  const { catalog, taxonomy } = useCatalogServices();
  const mode = useContext(DataModeContext);
  const promotionSession = useContext(PromotionSessionContext);
  const [schemaResult, setSchemaResult] = useState<{ typeId: string; repository: typeof taxonomy; schemas: AttributeSchema[]; error: string | null }>();
  const schemaCurrent = schemaResult?.typeId === parentProduct?.typeId && schemaResult?.repository === taxonomy;
  const attributeSchemas = schemaCurrent ? schemaResult.schemas : [];
  const schemaLoading = !schemaCurrent;
  const schemaError = schemaCurrent ? schemaResult.error : null;
  const fromAttribute = (a: ProductAttributeValue): FormAttributeEntry => ({
    key: a.caracteristicaId, caracteristicaId: a.caracteristicaId,
    nombre: a.nombre, tipo: a.tipo, valor: a.valorDisponible === false || a.valor === null ? "" : a.valorId ?? String(a.valor), unidad: a.unidad,
  });
  const [formData, setFormData] = useState<VariantFormData>(() => ({
    sku: initialVariant?.sku ?? "",
    identifyingAttributes: initialVariant?.identifyingAttributes.map(fromAttribute) ?? [],
    nonIdentifyingAttributes: initialVariant?.nonIdentifyingAttributes.map(fromAttribute) ?? [],
    imageUrl: initialVariant?.imageUrl ?? "",
    pesoKg: initialVariant?.physicalProfile?.pesoKg,
    largoCm: initialVariant?.physicalProfile?.largoCm,
    anchoCm: initialVariant?.physicalProfile?.anchoCm,
    altoCm: initialVariant?.physicalProfile?.altoCm,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [writeOutcomeUnknown, setWriteOutcomeUnknown] = useState(false);
  const reconcileCreateBySku = async () => {
    if (isEdit || mode !== "api" || !parentProduct || !formData.sku.trim()) return null;
    try {
      const matches: VariantDetailView[] = []; let page = 1; let pages = 1;
      do {
        const result = await catalog.listVariants(parentProduct.id, { page, pageSize: 100, status: "all" });
        if (result.page !== page || result.pageSize !== 100 || result.items.some(item => item.productId !== parentProduct.id)) throw new Error("La paginación o identidad de variantes no permitió reconciliar el SKU.");
        pages = Math.ceil(result.total / 100);
        matches.push(...result.items.filter(item => item.sku === formData.sku.trim()));
        page++;
      } while (page <= pages && page <= 10_000);
      if (matches.length === 1) return matches[0]!;
      setGeneralError(matches.length > 1 ? "La consulta encontró más de una variante con este SKU; la creación sigue bloqueada." : "Catálogo no muestra todavía esta variante. El resultado anterior sigue incierto y no se reenviará.");
    } catch (error) { setGeneralError(error instanceof Error ? error.message : "No se pudo reconciliar la variante en Catálogo."); }
    return null;
  };
  useEffect(() => {
    let active = true;
    if (isEdit || mode !== "api" || !parentProduct?.id || !formData.sku.trim()) { setWriteOutcomeUnknown(false); return; }
    void hasCatalogCreateIntent(promotionSession?.snapshot().user?.id, `variant:${parentProduct.id}:${formData.sku.trim()}`).then(pending => { if (active) setWriteOutcomeUnknown(pending); });
    return () => { active = false; };
  }, [isEdit, mode, parentProduct?.id, formData.sku, promotionSession]);

  useEffect(() => {
    const controller = new AbortController();
    const typeId = parentProduct?.typeId;
    if (!typeId) return;
    taxonomy.getAttributeSchema(typeId, controller.signal).then(schemas => {
      if (controller.signal.aborted) return;
      if (schemas.some(s => s.esIdentificadora === undefined)) {
        throw new Error("El esquema no informa el rol identificador de las características.");
      }
      setSchemaResult({ typeId, repository: taxonomy, schemas, error: null });
      setFormData(prev => {
        const entry = (s: AttributeSchema, existing: FormAttributeEntry[]): FormAttributeEntry => {
          const old = existing.find(a => a.caracteristicaId === s.caracteristicaId);
          const option = s.opciones?.find(o => o.id === old?.valor || o.valor === old?.valor);
          return { key: s.caracteristicaId, caracteristicaId: s.caracteristicaId,
            nombre: s.nombre, tipo: s.tipo, unidad: s.unidad, obligatorio: s.obligatorio,
            valor: option?.id ?? old?.valor ?? "" };
        };
        return { ...prev,
          identifyingAttributes: initialVariant ? prev.identifyingAttributes :
            schemas.filter(s => s.esIdentificadora).map(s => entry(s, prev.identifyingAttributes)),
          nonIdentifyingAttributes: [
            ...prev.nonIdentifyingAttributes.map(a => {
              const schema = schemas.find(s => s.caracteristicaId === a.caracteristicaId);
              return schema ? entry(schema, prev.nonIdentifyingAttributes) : a;
            }),
            ...schemas.filter(s => !s.esIdentificadora && s.obligatorio &&
              !prev.nonIdentifyingAttributes.some(a => a.caracteristicaId === s.caracteristicaId))
              .map(s => entry(s, [])),
          ],
        };
      });
    }).catch(err => {
      if (!controller.signal.aborted) setSchemaResult({ typeId, repository: taxonomy, schemas: [],
        error: err instanceof Error ? err.message : "Error al cargar Taxonomía." });
    });
    return () => controller.abort();
  }, [parentProduct?.typeId, taxonomy, initialVariant]);

  const updateField = <K extends keyof VariantFormData>(field: K, value: VariantFormData[K]) => {
    if (isEdit && (field === "sku" || field === "identifyingAttributes")) return;
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
    setErrors({});
  };
  const addAttribute = (identity: boolean) => {
    if (schemaLoading || schemaError || (identity && isEdit)) return;
    const field = identity ? "identifyingAttributes" : "nonIdentifyingAttributes";
    const s = attributeSchemas.find(s => s.esIdentificadora === identity &&
      !formData[field].some(a => a.caracteristicaId === s.caracteristicaId));
    if (!s) return;
    updateField(field, [...formData[field], { key: s.caracteristicaId,
      caracteristicaId: s.caracteristicaId, nombre: s.nombre, tipo: s.tipo,
      valor: "", unidad: s.unidad, obligatorio: s.obligatorio }]);
  };
  const removeAttribute = (identity: boolean, index: number) => {
    const field = identity ? "identifyingAttributes" : "nonIdentifyingAttributes";
    if (formData[field][index]?.obligatorio) return;
    updateField(field, formData[field].filter((_, i) => i !== index));
  };
  const updateAttribute = (identity: boolean, index: number, key: "valor" | "caracteristicaId", value: string) => {
    if (schemaLoading || schemaError || (identity && isEdit)) return;
    const field = identity ? "identifyingAttributes" : "nonIdentifyingAttributes";
    const entries = [...formData[field]];
    const current = entries[index];
    if (!current) return;
    const s = attributeSchemas.find(s => s.caracteristicaId ===
      (key === "caracteristicaId" ? value : current.caracteristicaId) && s.esIdentificadora === identity);
    if (!s || (key === "caracteristicaId" && entries.some((a, i) =>
      i !== index && a.caracteristicaId === value))) return;
    entries[index] = { key: s.caracteristicaId, caracteristicaId: s.caracteristicaId,
      nombre: s.nombre, tipo: s.tipo, unidad: s.unidad, obligatorio: s.obligatorio,
      valor: key === "valor" ? value : "" };
    updateField(field, entries);
  };
  const toAttribute = (a: FormAttributeEntry): ProductAttributeValue => {
    const s = attributeSchemas.find(s => s.caracteristicaId === a.caracteristicaId);
    const option = s?.opciones?.find(o => o.id === a.valor);
    return { caracteristicaId: a.caracteristicaId, nombre: s?.nombre ?? a.nombre,
      tipo: s?.tipo ?? a.tipo, unidad: s?.unidad,
      valor: a.tipo === "NUMERO" && a.valor.trim() ? Number(a.valor) : option?.valor ?? a.valor.trim(),
      valorId: a.tipo === "LISTA" ? a.valor : undefined };
  };
  const validate = () => {
    const next: Record<string, string> = {};
    if (isEdit && [...(initialVariant?.identifyingAttributes ?? []), ...(initialVariant?.nonIdentifyingAttributes ?? [])].some(attribute => attribute.valorDisponible === false || attribute.valor === null)) {
      next.attributes = "La variante contiene valores comerciales no disponibles. No se enviará una edición que pueda sobrescribirlos.";
    }
    if (!isEdit && !formData.sku.trim()) next.sku = "El SKU es obligatorio; ingrese un código único.";
    if (schemaLoading || schemaError || !parentProduct) {
      next.attributes = "No se puede guardar sin un esquema de Taxonomía válido.";
    } else {
      const identity = isEdit && initialVariant ? initialVariant.identifyingAttributes.map(a => {
        const s = attributeSchemas.find(s => s.caracteristicaId === a.caracteristicaId);
        return { ...a, valorId: a.valorId ?? s?.opciones?.find(o => o.valor === String(a.valor))?.id };
      }) : formData.identifyingAttributes.map(toAttribute);
      Object.assign(next, validateVariantAttributes(identity,
        formData.nonIdentifyingAttributes.map(toAttribute), attributeSchemas));
    }
    if (!isEdit && !formData.imageUrl.trim()) next.imageUrl = "La URL de imagen es obligatoria para la variante (VarianteCreateRequest).";
    if (formData.imageUrl.trim()) {
      try { if (!["http:", "https:"].includes(new URL(formData.imageUrl.trim()).protocol)) throw new Error(); }
      catch { next.imageUrl = "Ingrese una URL válida (http:// o https://)."; }
    }
    for (const [field, label] of [["pesoKg", "peso"], ["largoCm", "largo"], ["anchoCm", "ancho"], ["altoCm", "alto"]] as const) {
      const value = formData[field];
      if (value !== undefined && (!Number.isFinite(value) || value <= 0)) next[field] = `El ${label} debe ser mayor que cero.`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };
  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (submitting || writeOutcomeUnknown || !parentProduct || !validate()) return;
    setSubmitting(true);
    setGeneralError(null);
    const physicalProfile = normalizePhysicalProfile(formData);
    const nonIdentifyingAttributes = formData.nonIdentifyingAttributes.filter(a => a.valor.trim()).map(toAttribute);
    try {
      let result: VariantDetailView;
      if (initialVariant) {
        const payload: VariantUpdatePayload = { nonIdentifyingAttributes,
          imageUrl: formData.imageUrl.trim() || undefined, physicalProfile, catalogVersion: initialVariant.catalogVersion };
        result = await catalog.updateVariant(parentProduct.id, initialVariant.variantId, payload, scenario);
      } else {
        const payload: VariantCreatePayload = { sku: formData.sku.trim(),
          identifyingAttributes: formData.identifyingAttributes.filter(a => a.valor.trim()).map(toAttribute),
          nonIdentifyingAttributes, imageUrl: formData.imageUrl.trim() || undefined, physicalProfile };
        result = mode === "api"
          ? await runCatalogCreateIntent(promotionSession?.snapshot().user?.id, `variant:${parentProduct.id}:${payload.sku.trim()}`, () => catalog.createVariant(parentProduct.id, payload, scenario))
          : await catalog.createVariant(parentProduct.id, payload, scenario);
      }
      setIsDirty(false);
      onSuccess?.(result);
    } catch (err) {
      if (err instanceof CatalogError && err.kind === "write_unknown") setWriteOutcomeUnknown(true);
      if (err instanceof CatalogError && err.kind === "duplicate_sku") setErrors(prev => ({ ...prev, sku: err.message }));
      else setGeneralError(err instanceof Error ? err.message : "Error inesperado al procesar la solicitud.");
    } finally { setSubmitting(false); }
  };
  return { formData, attributeSchemas, schemaLoading, schemaError, updateField,
    addIdentifyingAttribute: () => addAttribute(true),
    addNonIdentifyingAttribute: () => addAttribute(false),
    removeIdentifyingAttribute: (index: number) => removeAttribute(true, index),
    removeNonIdentifyingAttribute: (index: number) => removeAttribute(false, index),
    updateIdentifyingAttribute: (index: number, key: "valor" | "caracteristicaId", value: string) => updateAttribute(true, index, key, value),
    updateNonIdentifyingAttribute: (index: number, key: "valor" | "caracteristicaId", value: string) => updateAttribute(false, index, key, value),
    derivedVolumeCm3: calculateVolumeCm3(formData.largoCm, formData.anchoCm, formData.altoCm),
    errors, generalError, submitting, isDirty, writeOutcomeUnknown, reconcileCreateBySku, handleSubmit, isEdit };
}
