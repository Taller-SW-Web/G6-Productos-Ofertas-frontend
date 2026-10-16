import type { ComboView, ComponentPricingSnapshot } from "../types/combos";

export const initialPricingCatalog: Record<string, ComponentPricingSnapshot> = {
  "CAM-NEG-M": {
    sku: "CAM-NEG-M",
    regularPrice: 100.0,
    publicPrice: 90.0,
    currency: "PEN",
    available: true,
  },
  "PAN-GRI-32": {
    sku: "PAN-GRI-32",
    regularPrice: 80.0,
    publicPrice: 75.0,
    currency: "PEN",
    available: true,
  },
  "POL-DEP-AZU-L": {
    sku: "POL-DEP-AZU-L",
    regularPrice: 60.0,
    publicPrice: 50.0,
    currency: "PEN",
    available: true,
  },
  "SHO-DEP-NEG-M": {
    sku: "SHO-DEP-NEG-M",
    regularPrice: 45.0,
    publicPrice: 45.0,
    currency: "PEN",
    available: true,
  },
  "CAM-OXF-BLA-M": {
    sku: "CAM-OXF-BLA-M",
    regularPrice: 129.9,
    publicPrice: 119.9,
    currency: "PEN",
    available: true,
  },
  "CAM-OXF-AZU-L": {
    sku: "CAM-OXF-AZU-L",
    regularPrice: 129.9,
    publicPrice: 129.9,
    currency: "PEN",
    available: true,
  },
  "PROD-ZAP-002": {
    sku: "PROD-ZAP-002",
    regularPrice: 199.0,
    publicPrice: 179.0,
    currency: "PEN",
    available: true,
  },
  "SKU-NO-PRICING": {
    sku: "SKU-NO-PRICING",
    regularPrice: 0,
    publicPrice: 0,
    currency: "PEN",
    available: false,
  },
};

export const initialInventorySnapshot: Record<string, number | null> = {
  "CAM-NEG-M": 50,
  "PAN-GRI-32": 25,
  "POL-DEP-AZU-L": 0, // agotado
  "SHO-DEP-NEG-M": 15,
  "CAM-OXF-BLA-M": 30,
  "CAM-OXF-AZU-L": 10,
  "PROD-ZAP-002": 5,
  "SKU-NO-PRICING": 20,
  "SKU-STOCK-NULL": null, // incompleta / no verificable
};

export interface CatalogCandidateProduct {
  productId: string;
  name: string;
  hasVariants: boolean;
  skuBase: string;
  status: "ACTIVO" | "BORRADOR" | "INACTIVO";
  typeName?: string;
  typeId?: string;
  variants: {
    variantId: string;
    sku: string;
    label: string;
    status: "ACTIVA" | "BORRADOR" | "INACTIVA";
  }[];
}

export const catalogCandidateProducts: CatalogCandidateProduct[] = [
  {
    productId: "PROD-001",
    name: "Camisa Casual Manga Larga",
    hasVariants: true,
    skuBase: "CAM-CAS",
    status: "ACTIVO",
    variants: [
      {
        variantId: "VAR-001-1",
        sku: "CAM-NEG-M",
        label: "Color: Negro · Talla: M",
        status: "ACTIVA",
      },
      {
        variantId: "VAR-001-2",
        sku: "CAM-BLA-L",
        label: "Color: Blanco · Talla: L",
        status: "ACTIVA",
      },
      {
        variantId: "VAR-001-3",
        sku: "CAM-DISAB-S",
        label: "Color: Rojo · Talla: S (Inactivo)",
        status: "INACTIVA",
      },
    ],
  },
  {
    productId: "PROD-002",
    name: "Pantalón Chino Slim Fit",
    hasVariants: true,
    skuBase: "PAN-CHI",
    status: "ACTIVO",
    variants: [
      {
        variantId: "VAR-002-1",
        sku: "PAN-GRI-32",
        label: "Color: Gris · Talla: 32",
        status: "ACTIVA",
      },
      {
        variantId: "VAR-002-2",
        sku: "PAN-AZU-34",
        label: "Color: Azul · Talla: 34",
        status: "ACTIVA",
      },
    ],
  },
  {
    productId: "PROD-003",
    name: "Polo Deportivo DryFit",
    hasVariants: true,
    skuBase: "POL-DEP",
    status: "ACTIVO",
    variants: [
      {
        variantId: "VAR-003-1",
        sku: "POL-DEP-AZU-L",
        label: "Color: Azul · Talla: L",
        status: "ACTIVA",
      },
    ],
  },
  {
    productId: "PROD-004",
    name: "Short Deportivo Transpirable",
    hasVariants: true,
    skuBase: "SHO-DEP",
    status: "ACTIVO",
    variants: [
      {
        variantId: "VAR-004-1",
        sku: "SHO-DEP-NEG-M",
        label: "Color: Negro · Talla: M",
        status: "ACTIVA",
      },
    ],
  },
  {
    productId: "PROD-005",
    name: "Zapatillas Urbanas Clásicas",
    hasVariants: false,
    skuBase: "PROD-ZAP-002",
    status: "ACTIVO",
    variants: [],
  },
  {
    productId: "PROD-006",
    name: "Gorra Deportiva Reflectiva",
    hasVariants: false,
    skuBase: "SKU-NO-PRICING",
    status: "ACTIVO",
    variants: [],
  },
  {
    productId: "PROD-007",
    name: "Producto Desactivado de Catálogo",
    hasVariants: false,
    skuBase: "SKU-PROD-INACTIVO",
    status: "INACTIVO",
    variants: [],
  },
  {
    productId: "PROD-008",
    name: "Combo Pack Verano (Prohibido anidar)",
    hasVariants: false,
    skuBase: "COMBO-ANIDADO-SKU",
    status: "ACTIVO",
    typeId: "TIP-COMBO",
    typeName: "Combo",
    variants: [],
  },
];

export const initialCombos: ComboView[] = [
  {
    comboId: "combo-001",
    name: "Pack Ejecutivo Smart Casual",
    description: "Camisa casual manga larga con pantalón chino para oficina o reuniones comerciales.",
    status: "ACTIVO",
    price: 150.0,
    components: [
      {
        sku: "CAM-NEG-M",
        quantity: 1,
        productName: "Camisa Casual Manga Larga",
        variantLabel: "Color: Negro · Talla: M",
        regularPrice: 100.0,
        publicPrice: 90.0,
        currency: "PEN",
      },
      {
        sku: "PAN-GRI-32",
        quantity: 1,
        productName: "Pantalón Chino Slim Fit",
        variantLabel: "Color: Gris · Talla: 32",
        regularPrice: 80.0,
        publicPrice: 75.0,
        currency: "PEN",
      },
    ],
    informativeAvailability: 24,
    calculatedAt: "2026-10-14T01:30:00Z",
    freshness: "ACTUALIZADA",
    version: 1,
  },
  {
    comboId: "combo-002",
    name: "Set Entrenamiento Deportivo Pro",
    description: "Polo DryFit y Short transpirable diseñado para actividades de alto rendimiento.",
    status: "ACTIVO",
    price: 85.0,
    components: [
      {
        sku: "POL-DEP-AZU-L",
        quantity: 1,
        productName: "Polo Deportivo DryFit",
        variantLabel: "Color: Azul · Talla: L",
        regularPrice: 60.0,
        publicPrice: 50.0,
        currency: "PEN",
      },
      {
        sku: "SHO-DEP-NEG-M",
        quantity: 1,
        productName: "Short Deportivo Transpirable",
        variantLabel: "Color: Negro · Talla: M",
        regularPrice: 45.0,
        publicPrice: 45.0,
        currency: "PEN",
      },
    ],
    informativeAvailability: 0,
    calculatedAt: "2026-10-14T01:00:00Z",
    freshness: "ACTUALIZADA",
    version: 1,
  },
  {
    comboId: "combo-003",
    name: "Dúo Urbano Zapatillas y Camisa",
    description: "Combinación de calzado urbano y camisa clásica.",
    status: "INACTIVO",
    price: 240.0,
    components: [
      {
        sku: "CAM-NEG-M",
        quantity: 1,
        productName: "Camisa Casual Manga Larga",
        variantLabel: "Color: Negro · Talla: M",
        regularPrice: 100.0,
        publicPrice: 90.0,
        currency: "PEN",
      },
      {
        sku: "PROD-ZAP-002",
        quantity: 1,
        productName: "Zapatillas Urbanas Clásicas",
        regularPrice: 199.0,
        publicPrice: 179.0,
        currency: "PEN",
      },
    ],
    informativeAvailability: 5,
    calculatedAt: "2026-10-13T18:00:00Z",
    freshness: "ACTUALIZADA",
    version: 2,
  },
  {
    comboId: "combo-004",
    name: "Dúo Estilo Urbano Stale",
    description: "Combo con sincronización de inventario desactualizada.",
    status: "ACTIVO",
    price: 155.0,
    components: [
      {
        sku: "CAM-NEG-M",
        quantity: 1,
        productName: "Camisa Casual Manga Larga",
        variantLabel: "Color: Negro · Talla: M",
        regularPrice: 100.0,
        publicPrice: 90.0,
        currency: "PEN",
      },
      {
        sku: "PAN-GRI-32",
        quantity: 1,
        productName: "Pantalón Chino Slim Fit",
        variantLabel: "Color: Gris · Talla: 32",
        regularPrice: 80.0,
        publicPrice: 75.0,
        currency: "PEN",
      },
    ],
    informativeAvailability: 12,
    calculatedAt: "2026-10-10T10:00:00Z",
    freshness: "DESACTUALIZADA",
    version: 1,
  },
  {
    comboId: "combo-005",
    name: "Combo Disponibilidad Incompleta",
    description: "Combo donde uno de sus componentes no pudo resolver stock en todas las sucursales.",
    status: "ACTIVO",
    price: 152.0,
    components: [
      {
        sku: "CAM-NEG-M",
        quantity: 1,
        productName: "Camisa Casual Manga Larga",
        variantLabel: "Color: Negro · Talla: M",
        regularPrice: 100.0,
        publicPrice: 90.0,
        currency: "PEN",
      },
      {
        sku: "PAN-GRI-32",
        quantity: 1,
        productName: "Pantalón Chino Slim Fit",
        variantLabel: "Color: Gris · Talla: 32",
        regularPrice: 80.0,
        publicPrice: 75.0,
        currency: "PEN",
      },
    ],
    informativeAvailability: null,
    calculatedAt: "2026-10-14T00:00:00Z",
    freshness: "INCOMPLETA",
    version: 1,
  },
  {
    comboId: "combo-006",
    name: "Combo Disponibilidad No Verificable",
    description: "Combo sin datos de inventario confirmados.",
    status: "ACTIVO",
    price: 154.0,
    components: [
      {
        sku: "CAM-NEG-M",
        quantity: 1,
        productName: "Camisa Casual Manga Larga",
        variantLabel: "Color: Negro · Talla: M",
        regularPrice: 100.0,
        publicPrice: 90.0,
        currency: "PEN",
      },
      {
        sku: "PAN-GRI-32",
        quantity: 1,
        productName: "Pantalón Chino Slim Fit",
        variantLabel: "Color: Gris · Talla: 32",
        regularPrice: 80.0,
        publicPrice: 75.0,
        currency: "PEN",
      },
    ],
    informativeAvailability: null,
    calculatedAt: null,
    freshness: null,
    version: 1,
  },
];
