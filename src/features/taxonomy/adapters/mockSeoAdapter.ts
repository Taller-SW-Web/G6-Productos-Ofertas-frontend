import type { SeoRepository } from "../services/seoRepository";
import type { SlugPropuesta } from "../types";

interface RegistroSeo {
  id: string;
  nombre: string;
  slug: string;
  slugAnterior?: string;
  metaTitulo?: string;
  metaDescripcion?: string;
  colisionResuelta?: boolean;
}

const store: RegistroSeo[] = [
  { id: "cat-ropa", nombre: "Ropa", slug: "ropa", metaTitulo: "Ropa | Tienda", metaDescripcion: "Catálogo de ropa" },
  { id: "cat-zapatillas", nombre: "Zapatillas", slug: "zapatillas", metaTitulo: "Zapatillas deportivas", metaDescripcion: "Catálogo de zapatillas deportivas" },
  { id: "cat-tecnologia", nombre: "Tecnología", slug: "tecnologia", metaTitulo: "", metaDescripcion: "" },
];

const historial: Record<string, Array<{ slugAnterior: string; slugActual: string; fecha: string }>> = {
  "cat-zapatillas": [
    { slugAnterior: "zapatillas", slugActual: "zapatillas-deportivas", fecha: "2026-09-28T10:00:00Z" },
  ],
};

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizar = (s: string) =>
  s
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "slug";

export const mockSeoAdapter: SeoRepository = {
  async list(scenario, signal) {
    signal.throwIfAborted();
    await esperar(200);
    signal.throwIfAborted();
    if (scenario === "error") throw new Error("No se pudieron cargar los metadatos SEO.");
    if (scenario === "empty") return { items: [] };
    return { items: store.map((r) => ({ ...r })) };
  },

  async obtener(id, signal) {
    signal.throwIfAborted();
    await esperar(200);
    signal.throwIfAborted();
    const r = store.find((x) => x.id === id);
    return r ? ({ ...r }) : null;
  },

  async proponerSlug(nombre, signal) {
    signal.throwIfAborted();
    await esperar(150);
    signal.throwIfAborted();
    let slug = normalizar(nombre);
    let colision = false;
    if (store.some((x) => x.slug === slug)) {
      colision = true;
      let i = 2;
      while (store.some((x) => x.slug === `${slug}-${i}`)) i++;
      slug = `${slug}-${i}`;
    }
    return { slug, colisionResuelta: colision } as SlugPropuesta;
  },

  async guardarMetadatos(id, metaTitulo, metaDescripcion, signal) {
    signal.throwIfAborted();
    await esperar(200);
    signal.throwIfAborted();
    const r = store.find((x) => x.id === id);
    if (!r) return null;
    r.metaTitulo = metaTitulo;
    r.metaDescripcion = metaDescripcion;
    return { ...r };
  },

  async historial(id, signal) {
    signal.throwIfAborted();
    await esperar(150);
    signal.throwIfAborted();
    return (historial[id] ?? []).slice();
  },
};
