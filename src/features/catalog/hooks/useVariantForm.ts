import { useState, useCallback, useEffect } from "react";
import type {
  ProductDetailView,
  ProductAttributeValue,
  VariantCreatePayload,
  VariantDetailView,
  VariantUpdatePayload,
} from "../services/catalogRepository";
import { CatalogError } from "../services/catalogRepository";
import { useCatalogServices } from "./useCatalogServices";
import { normalizePhysicalProfile, calculateVolumeCm3 } from "../services/catalogPresentation";
import type { AttributeSchema } from "../services/taxonomyRepository";

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
  const { catalog: catalogService, taxonomy: taxonomyService } = useCatalogServices();

  const [attributeSchemas, setAttributeSchemas] = useState<AttributeSchema[]>([]);
  const [schemaLoading, setSchemaLoading] = useState<boolean>(true);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const [formData, setFormData] = useState<VariantFormData>(() => {
    if (initialVariant) {
      return {
        sku: initialVariant.sku,
        identifyingAttributes: initialVariant.identifyingAttributes.map((a, idx) => ({
          key: `id_${a.caracteristicaId || idx}`,
          caracteristicaId: a.caracteristicaId || `CAR-${idx}`,
          nombre: a.nombre,
          tipo: a.tipo || "TEXTO",
          valor: String(a.valor),
          unidad: a.unidad,
          obligatorio: true,
        })),
        nonIdentifyingAttributes: initialVariant.nonIdentifyingAttributes.map((a, idx) => ({
          key: `non_${a.caracteristicaId || idx}`,
          caracteristicaId: a.caracteristicaId || `CAR-NON-${idx}`,
          nombre: a.nombre,
          tipo: a.tipo || "TEXTO",
          valor: String(a.valor),
          unidad: a.unidad,
          obligatorio: false,
        })),
        imageUrl: initialVariant.imageUrl || "",
        pesoKg: initialVariant.physicalProfile?.pesoKg,
        largoCm: initialVariant.physicalProfile?.largoCm,
        anchoCm: initialVariant.physicalProfile?.anchoCm,
        altoCm: initialVariant.physicalProfile?.altoCm,
      };
    }

    return {
      sku: "",
      identifyingAttributes: [
        {
          key: "init_id_0",
          caracteristicaId: "CAR-COLOR",
          nombre: "Color principal",
          tipo: "LISTA",
          valor: "",
          obligatorio: true,
        },
      ],
      nonIdentifyingAttributes: [],
      imageUrl: "",
      pesoKg: undefined,
      largoCm: undefined,
      anchoCm: undefined,
      altoCm: undefined,
    };
  });

  // Load attribute schema from taxonomy
  useEffect(() => {
    if (!parentProduct?.typeId) {
      setSchemaLoading(false);
      return;
    }

    let active = true;
    taxonomyService
      .getAttributeSchema(parentProduct.typeId)
      .then((schemas) => {
        if (!active) return;
        setAttributeSchemas(schemas);
        setSchemaLoading(false);

        // If in create mode, populate identifying schemas preserving any user-typed values
        if (!initialVariant) {
          const identifying = schemas.filter((s) => s.esIdentificadora === true);
          if (identifying.length > 0) {
            setFormData((prev) => {
              const existingMap = new Map<string, string>();
              prev.identifyingAttributes.forEach((a, idx) => {
                if (a.valor) {
                  existingMap.set(a.caracteristicaId, a.valor);
                  existingMap.set(String(idx), a.valor);
                }
              });
              return {
                ...prev,
                identifyingAttributes: identifying.map((s, idx) => ({
                  key: `schema_id_${s.caracteristicaId || idx}`,
                  caracteristicaId: s.caracteristicaId,
                  nombre: s.nombre,
                  tipo: s.tipo,
                  valor: existingMap.get(s.caracteristicaId) ?? existingMap.get(String(idx)) ?? "",
                  unidad: s.unidad,
                  obligatorio: s.obligatorio,
                })),
              };
            });
          }
        }
      })
      .catch((err) => {
        if (!active) return;
        setSchemaError(
          err instanceof Error ? err.message : "Error al cargar características de taxonomía.",
        );
        setSchemaLoading(false);
      });

    return () => {
      active = false;
    };
  }, [parentProduct?.typeId, taxonomyService, initialVariant]);

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

  // Identifying attributes manipulation
  const addIdentifyingAttribute = useCallback(() => {
    // Find an identifying or unselected schema
    const available = attributeSchemas.find(
      (s) =>
        s.esIdentificadora === true &&
        !formData.identifyingAttributes.some((a) => a.caracteristicaId === s.caracteristicaId),
    );

    const newEntry: FormAttributeEntry = available
      ? {
          key: `row_${Date.now()}`,
          caracteristicaId: available.caracteristicaId,
          nombre: available.nombre,
          tipo: available.tipo,
          valor: "",
          unidad: available.unidad,
          obligatorio: available.obligatorio,
        }
      : {
          key: `row_${Date.now()}`,
          caracteristicaId: `CAR-CUSTOM-${Date.now().toString().slice(-4)}`,
          nombre: "",
          tipo: "TEXTO",
          valor: "",
          obligatorio: true,
        };

    setFormData((prev) => ({
      ...prev,
      identifyingAttributes: [...prev.identifyingAttributes, newEntry],
    }));
    setIsDirty(true);
  }, [attributeSchemas, formData.identifyingAttributes]);

  const removeIdentifyingAttribute = useCallback((index: number) => {
    setFormData((prev) => ({
      ...prev,
      identifyingAttributes: prev.identifyingAttributes.filter((_, i) => i !== index),
    }));
    setIsDirty(true);
  }, []);

  const updateIdentifyingAttribute = useCallback(
    (index: number, key: "nombre" | "valor" | "caracteristicaId", value: string) => {
      setFormData((prev) => {
        const updated = [...prev.identifyingAttributes];
        if (updated[index]) {
          if (key === "caracteristicaId") {
            const schema = attributeSchemas.find((s) => s.caracteristicaId === value);
            updated[index] = {
              ...updated[index],
              caracteristicaId: value,
              nombre: schema?.nombre || updated[index].nombre,
              tipo: schema?.tipo || updated[index].tipo,
              unidad: schema?.unidad,
              obligatorio: schema?.obligatorio,
              valor: "",
            };
          } else {
            updated[index] = { ...updated[index], [key]: value };
          }
        }
        return { ...prev, identifyingAttributes: updated };
      });
      setIsDirty(true);
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`id_attr_${index}_${key}`];
        delete next[`id_attr_${index}_valor`];
        delete next["identifyingAttributes"];
        return next;
      });
    },
    [attributeSchemas],
  );

  // Non-identifying attributes manipulation
  const addNonIdentifyingAttribute = useCallback(() => {
    const available = attributeSchemas.find(
      (s) =>
        s.esIdentificadora !== true &&
        !formData.nonIdentifyingAttributes.some((a) => a.caracteristicaId === s.caracteristicaId),
    );

    const newEntry: FormAttributeEntry = available
      ? {
          key: `non_${Date.now()}`,
          caracteristicaId: available.caracteristicaId,
          nombre: available.nombre,
          tipo: available.tipo,
          valor: "",
          unidad: available.unidad,
          obligatorio: available.obligatorio,
        }
      : {
          key: `non_${Date.now()}`,
          caracteristicaId: `CAR-NON-${Date.now().toString().slice(-4)}`,
          nombre: "",
          tipo: "TEXTO",
          valor: "",
          obligatorio: false,
        };

    setFormData((prev) => ({
      ...prev,
      nonIdentifyingAttributes: [...prev.nonIdentifyingAttributes, newEntry],
    }));
    setIsDirty(true);
  }, [attributeSchemas, formData.nonIdentifyingAttributes]);

  const removeNonIdentifyingAttribute = useCallback((index: number) => {
    setFormData((prev) => ({
      ...prev,
      nonIdentifyingAttributes: prev.nonIdentifyingAttributes.filter((_, i) => i !== index),
    }));
    setIsDirty(true);
  }, []);

  const updateNonIdentifyingAttribute = useCallback(
    (index: number, key: "nombre" | "valor" | "caracteristicaId", value: string) => {
      setFormData((prev) => {
        const updated = [...prev.nonIdentifyingAttributes];
        if (updated[index]) {
          if (key === "caracteristicaId") {
            const schema = attributeSchemas.find((s) => s.caracteristicaId === value);
            updated[index] = {
              ...updated[index],
              caracteristicaId: value,
              nombre: schema?.nombre || updated[index].nombre,
              tipo: schema?.tipo || updated[index].tipo,
              unidad: schema?.unidad,
              valor: "",
            };
          } else {
            updated[index] = { ...updated[index], [key]: value };
          }
        }
        return { ...prev, nonIdentifyingAttributes: updated };
      });
      setIsDirty(true);
    },
    [attributeSchemas],
  );

  // Derived volume in cm3
  const derivedVolumeCm3 = calculateVolumeCm3(
    formData.largoCm,
    formData.anchoCm,
    formData.altoCm,
  );

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
            newErrors[`id_attr_${idx}_valor`] = `El valor de "${attr.nombre || `Atributo #${idx + 1}`}" es obligatorio.`;
          } else {
            if (attr.tipo === "NUMERO") {
              const n = Number(attr.valor);
              if (Number.isNaN(n) || n <= 0) {
                newErrors[`id_attr_${idx}_valor`] = `El valor de "${attr.nombre}" debe ser un número mayor que cero.`;
              }
            }
          }
        });
      }
    }

    // Required image URL on creation per SPEC-004 / VarianteCreateRequest
    if (!isEdit && !formData.imageUrl.trim()) {
      newErrors.imageUrl = "La URL de imagen es obligatoria para la variante (VarianteCreateRequest).";
    } else if (formData.imageUrl.trim()) {
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

    const physicalProfile = normalizePhysicalProfile({
      pesoKg: formData.pesoKg,
      largoCm: formData.largoCm,
      anchoCm: formData.anchoCm,
      altoCm: formData.altoCm,
    });

    try {
      if (isEdit && initialVariant) {
        const nonIdAttrs: ProductAttributeValue[] = formData.nonIdentifyingAttributes
          .filter((a) => a.nombre.trim() && a.valor.trim())
          .map((a) => {
            let valor: string | number = a.valor.trim();
            if (a.tipo === "NUMERO") {
              const num = Number(valor);
              if (!Number.isNaN(num)) valor = num;
            }
            return {
              caracteristicaId: a.caracteristicaId,
              nombre: a.nombre.trim(),
              tipo: a.tipo,
              valor,
              unidad: a.unidad,
            };
          });

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
        const idAttrs: ProductAttributeValue[] = formData.identifyingAttributes.map((a) => {
          let valor: string | number = a.valor.trim();
          if (a.tipo === "NUMERO") {
            const num = Number(valor);
            if (!Number.isNaN(num)) valor = num;
          }
          return {
            caracteristicaId: a.caracteristicaId,
            nombre: a.nombre.trim(),
            tipo: a.tipo,
            valor,
            unidad: a.unidad,
          };
        });

        const nonIdAttrs: ProductAttributeValue[] = formData.nonIdentifyingAttributes
          .filter((a) => a.nombre.trim() && a.valor.trim())
          .map((a) => {
            let valor: string | number = a.valor.trim();
            if (a.tipo === "NUMERO") {
              const num = Number(valor);
              if (!Number.isNaN(num)) valor = num;
            }
            return {
              caracteristicaId: a.caracteristicaId,
              nombre: a.nombre.trim(),
              tipo: a.tipo,
              valor,
              unidad: a.unidad,
            };
          });

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
    attributeSchemas,
    schemaLoading,
    schemaError,
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
