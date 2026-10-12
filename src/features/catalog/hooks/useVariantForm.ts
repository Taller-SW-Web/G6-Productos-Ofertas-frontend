import { useState, useCallback } from "react";
import type {
  ProductDetailView,
  ProductAttributeValue,
  VariantCreatePayload,
  VariantDetailView,
  VariantPhysicalProfile,
  VariantUpdatePayload,
} from "../services/catalogRepository";
import { CatalogError } from "../services/catalogRepository";
import { catalogService } from "../services/catalogService";

export interface IdentifyingAttributeEntry {
  id: string;
  nombre: string;
  valor: string;
}

export interface NonIdentifyingAttributeEntry {
  id: string;
  nombre: string;
  valor: string;
}

export interface VariantFormData {
  sku: string;
  identifyingAttributes: IdentifyingAttributeEntry[];
  nonIdentifyingAttributes: NonIdentifyingAttributeEntry[];
  imageUrl: string;
  pesoKg?: number;
  largoCm?: number;
  anchoCm?: number;
  altoCm?: number;
}

export interface UseVariantFormOptions {
  parentProduct: ProductDetailView;
  initialVariant?: VariantDetailView;
  scenario?: string;
  onSuccess?: (variant: VariantDetailView) => void;
}

export function useVariantForm({
  parentProduct,
  initialVariant,
  scenario,
  onSuccess,
}: UseVariantFormOptions) {
  const isEdit = Boolean(initialVariant);

  const [formData, setFormData] = useState<VariantFormData>(() => {
    if (initialVariant) {
      return {
        sku: initialVariant.sku,
        identifyingAttributes: initialVariant.identifyingAttributes.map((a, idx) => ({
          id: a.caracteristicaId || `id_${idx}`,
          nombre: a.nombre,
          valor: String(a.valor),
        })),
        nonIdentifyingAttributes: initialVariant.nonIdentifyingAttributes.map((a, idx) => ({
          id: a.caracteristicaId || `non_id_${idx}`,
          nombre: a.nombre,
          valor: String(a.valor),
        })),
        imageUrl: initialVariant.imageUrl || "",
        pesoKg: initialVariant.physicalProfile?.pesoKg,
        largoCm: initialVariant.physicalProfile?.largoCm,
        anchoCm: initialVariant.physicalProfile?.anchoCm,
        altoCm: initialVariant.physicalProfile?.altoCm,
      };
    }

    // Default for creation: one initial identifying attribute row (e.g. Talla)
    return {
      sku: "",
      identifyingAttributes: [
        { id: "ATTR-TALLA", nombre: "Talla", valor: "" },
      ],
      nonIdentifyingAttributes: [],
      imageUrl: "",
      pesoKg: undefined,
      largoCm: undefined,
      anchoCm: undefined,
      altoCm: undefined,
    };
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Field updates
  const updateField = useCallback(
    <K extends keyof VariantFormData>(field: K, value: VariantFormData[K]) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      setIsDirty(true);
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field as string];
        return next;
      });
    },
    [],
  );

  // Identifying attributes manipulation (only in create mode)
  const addIdentifyingAttribute = useCallback(() => {
    setFormData((prev) => ({
      ...prev,
      identifyingAttributes: [
        ...prev.identifyingAttributes,
        { id: `ATTR-CUSTOM-${Date.now()}`, nombre: "", valor: "" },
      ],
    }));
    setIsDirty(true);
  }, []);

  const removeIdentifyingAttribute = useCallback((index: number) => {
    setFormData((prev) => ({
      ...prev,
      identifyingAttributes: prev.identifyingAttributes.filter((_, i) => i !== index),
    }));
    setIsDirty(true);
  }, []);

  const updateIdentifyingAttribute = useCallback(
    (index: number, key: "nombre" | "valor", value: string) => {
      setFormData((prev) => {
        const updated = [...prev.identifyingAttributes];
        if (updated[index]) {
          updated[index] = { ...updated[index], [key]: value };
        }
        return { ...prev, identifyingAttributes: updated };
      });
      setIsDirty(true);
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`id_attr_${index}_${key}`];
        delete next["identifyingAttributes"];
        return next;
      });
    },
    [],
  );

  // Non-identifying attributes manipulation
  const addNonIdentifyingAttribute = useCallback(() => {
    setFormData((prev) => ({
      ...prev,
      nonIdentifyingAttributes: [
        ...prev.nonIdentifyingAttributes,
        { id: `ATTR-NON-${Date.now()}`, nombre: "", valor: "" },
      ],
    }));
    setIsDirty(true);
  }, []);

  const removeNonIdentifyingAttribute = useCallback((index: number) => {
    setFormData((prev) => ({
      ...prev,
      nonIdentifyingAttributes: prev.nonIdentifyingAttributes.filter((_, i) => i !== index),
    }));
    setIsDirty(true);
  }, []);

  const updateNonIdentifyingAttribute = useCallback(
    (index: number, key: "nombre" | "valor", value: string) => {
      setFormData((prev) => {
        const updated = [...prev.nonIdentifyingAttributes];
        if (updated[index]) {
          updated[index] = { ...updated[index], [key]: value };
        }
        return { ...prev, nonIdentifyingAttributes: updated };
      });
      setIsDirty(true);
    },
    [],
  );

  // Derived volume in cm3
  const derivedVolumeCm3 =
    formData.largoCm && formData.anchoCm && formData.altoCm
      ? Number((formData.largoCm * formData.anchoCm * formData.altoCm).toFixed(2))
      : null;

  // Validation
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!isEdit) {
      if (formData.identifyingAttributes.length === 0) {
        newErrors.identifyingAttributes = "Debe definir al menos un atributo identificador.";
      } else {
        formData.identifyingAttributes.forEach((attr, idx) => {
          if (!attr.nombre.trim()) {
            newErrors[`id_attr_${idx}_nombre`] = "El nombre del atributo es obligatorio.";
          }
          if (!attr.valor.trim()) {
            newErrors[`id_attr_${idx}_valor`] = "El valor del atributo es obligatorio.";
          }
        });
      }
    }

    if (formData.imageUrl.trim()) {
      try {
        const url = new URL(formData.imageUrl.trim());
        if (!["http:", "https:"].includes(url.protocol)) {
          newErrors.imageUrl = "La URL de imagen debe comenzar con http:// o https://.";
        }
      } catch {
        newErrors.imageUrl = "Ingrese una URL válida (ej. https://ejemplo.com/foto.jpg).";
      }
    }

    if (formData.pesoKg !== undefined && formData.pesoKg <= 0) {
      newErrors.pesoKg = "El peso debe ser mayor que cero.";
    }
    if (formData.largoCm !== undefined && formData.largoCm <= 0) {
      newErrors.largoCm = "El largo debe ser mayor que cero.";
    }
    if (formData.anchoCm !== undefined && formData.anchoCm <= 0) {
      newErrors.anchoCm = "El ancho debe ser mayor que cero.";
    }
    if (formData.altoCm !== undefined && formData.altoCm <= 0) {
      newErrors.altoCm = "El alto debe ser mayor que cero.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (submitting) return;

    if (!validate()) return;

    setSubmitting(true);
    setGeneralError(null);

    const hasAnyPhysical =
      formData.pesoKg !== undefined ||
      formData.largoCm !== undefined ||
      formData.anchoCm !== undefined ||
      formData.altoCm !== undefined;

    const physicalProfile: VariantPhysicalProfile | null = hasAnyPhysical
      ? {
          pesoKg: formData.pesoKg,
          largoCm: formData.largoCm,
          anchoCm: formData.anchoCm,
          altoCm: formData.altoCm,
          volumenCm3: derivedVolumeCm3 ?? undefined,
        }
      : null;

    try {
      if (isEdit && initialVariant) {
        const nonIdAttrs: ProductAttributeValue[] = formData.nonIdentifyingAttributes
          .filter((a) => a.nombre.trim() && a.valor.trim())
          .map((a) => ({
            caracteristicaId: a.id,
            nombre: a.nombre.trim(),
            tipo: "TEXTO",
            valor: a.valor.trim(),
          }));

        const payload: VariantUpdatePayload = {
          nonIdentifyingAttributes: nonIdAttrs,
          imageUrl: formData.imageUrl.trim() || undefined,
          physicalProfile,
          catalogVersion: initialVariant.catalogVersion,
        };

        const updated = await catalogService.updateVariant(
          parentProduct.id,
          initialVariant.variantId,
          payload,
          scenario,
        );
        setIsDirty(false);
        onSuccess?.(updated);
      } else {
        const idAttrs: ProductAttributeValue[] = formData.identifyingAttributes.map((a) => ({
          caracteristicaId: a.id,
          nombre: a.nombre.trim(),
          tipo: "TEXTO",
          valor: a.valor.trim(),
        }));

        const nonIdAttrs: ProductAttributeValue[] = formData.nonIdentifyingAttributes
          .filter((a) => a.nombre.trim() && a.valor.trim())
          .map((a) => ({
            caracteristicaId: a.id,
            nombre: a.nombre.trim(),
            tipo: "TEXTO",
            valor: a.valor.trim(),
          }));

        const payload: VariantCreatePayload = {
          sku: formData.sku.trim() || undefined,
          identifyingAttributes: idAttrs,
          nonIdentifyingAttributes: nonIdAttrs,
          imageUrl: formData.imageUrl.trim() || undefined,
          physicalProfile,
        };

        const created = await catalogService.createVariant(
          parentProduct.id,
          payload,
          scenario,
        );
        setIsDirty(false);
        onSuccess?.(created);
      }
    } catch (err) {
      if (err instanceof CatalogError) {
        if (err.kind === "duplicate_sku") {
          setErrors((prev) => ({ ...prev, sku: err.message }));
        } else if (err.kind === "duplicate_combination") {
          setGeneralError(err.message);
        } else if (err.kind === "invalid_image") {
          setErrors((prev) => ({ ...prev, imageUrl: err.message }));
        } else if (err.kind === "invalid_physical") {
          setGeneralError(err.message);
        } else if (err.kind === "version_conflict") {
          setGeneralError(
            "Conflicto de versión (409): Otro usuario modificó esta variante. Conservamos tus cambios para que puedas revisarlos.",
          );
        } else if (err.kind === "activation_rejected" || err.kind === "active_rejected") {
          setGeneralError(
            "La edición fue rechazada: la variante ACTIVA no puede perder sus requisitos de publicación ni perfil físico requerido.",
          );
        } else {
          setGeneralError(err.message);
        }
      } else {
        setGeneralError("Error inesperado al procesar la solicitud.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return {
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
    generalError,
    submitting,
    isDirty,
    handleSubmit,
    isEdit,
  };
}
