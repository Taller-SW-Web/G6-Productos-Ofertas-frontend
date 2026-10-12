import type {
  TaxonomyBrand,
  TaxonomyCategory,
  TaxonomyProductType,
  AttributeSchema,
} from "../services/taxonomyRepository";

export const initialCategories: TaxonomyCategory[] = [
  { id: "CAT-ROPA", nombre: "Ropa", activo: true },
  { id: "CAT-CALZADO", nombre: "Calzado", activo: true },
  { id: "CAT-ACC", nombre: "Accesorios", activo: true },
];

export const initialBrands: TaxonomyBrand[] = [
  { id: "BRD-INKA", nombre: "Inka Athletic", activo: true },
  { id: "BRD-ANDES", nombre: "Andean Peak", activo: true },
  { id: "BRD-QENTE", nombre: "Q'ente Sport", activo: true },
];

export const initialProductTypes: TaxonomyProductType[] = [
  { id: "TIP-CAMISA", nombre: "Camisa", activo: true },
  { id: "TIP-CASACA", nombre: "Casaca", activo: true },
  { id: "TIP-ZAPATILLA", nombre: "Zapatilla", activo: true },
  { id: "TIP-MOCHILA", nombre: "Mochila", activo: true },
];

export const attributeSchemasByType: Record<string, AttributeSchema[]> = {
  "TIP-CAMISA": [
    {
      caracteristicaId: "CAR-MAT",
      nombre: "Material principal",
      tipo: "TEXTO",
      obligatorio: true,
    },
    {
      caracteristicaId: "CAR-CUELLO",
      nombre: "Circunferencia de cuello",
      tipo: "NUMERO",
      obligatorio: false,
      unidad: "cm",
    },
    {
      caracteristicaId: "CAR-CORTE",
      nombre: "Tipo de corte",
      tipo: "LISTA",
      obligatorio: true,
      opciones: [
        { id: "VAL-REG", valor: "Regular Fit" },
        { id: "VAL-SLIM", valor: "Slim Fit" },
        { id: "VAL-RELAX", valor: "Relaxed Fit" },
      ],
    },
  ],
  "TIP-CASACA": [
    {
      caracteristicaId: "CAR-IMP",
      nombre: "Nivel de impermeabilidad",
      tipo: "TEXTO",
      obligatorio: true,
    },
    {
      caracteristicaId: "CAR-TERM",
      nombre: "Resistencia térmica",
      tipo: "NUMERO",
      obligatorio: false,
      unidad: "°C",
    },
    {
      caracteristicaId: "CAR-CIERRE",
      nombre: "Tipo de cierre",
      tipo: "LISTA",
      obligatorio: true,
      opciones: [
        { id: "VAL-CREM", valor: "Cremallera sellada" },
        { id: "VAL-BOT", valor: "Botones a presión" },
      ],
    },
  ],
  "TIP-ZAPATILLA": [
    {
      caracteristicaId: "CAR-SUELA",
      nombre: "Material de suela",
      tipo: "TEXTO",
      obligatorio: true,
    },
    {
      caracteristicaId: "CAR-DROP",
      nombre: "Drop del talón",
      tipo: "NUMERO",
      obligatorio: false,
      unidad: "mm",
    },
    {
      caracteristicaId: "CAR-PISADA",
      nombre: "Tipo de pisada",
      tipo: "LISTA",
      obligatorio: true,
      opciones: [
        { id: "VAL-NEU", valor: "Neutra" },
        { id: "VAL-PRO", valor: "Pronadora" },
        { id: "VAL-SUP", valor: "Supinadora" },
      ],
    },
  ],
  "TIP-MOCHILA": [
    {
      caracteristicaId: "CAR-CAP",
      nombre: "Capacidad",
      tipo: "NUMERO",
      obligatorio: true,
      unidad: "litros",
    },
    {
      caracteristicaId: "CAR-COMP",
      nombre: "Compartimento para laptop",
      tipo: "LISTA",
      obligatorio: true,
      opciones: [
        { id: "VAL-SI", valor: "Sí (hasta 15.6\")" },
        { id: "VAL-NO", valor: "No" },
      ],
    },
  ],
};
