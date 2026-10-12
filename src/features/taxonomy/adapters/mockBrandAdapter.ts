import type { BrandRepository } from "../services/brandRepository";
import type { BrandCreateInput, BrandDetail, BrandListItem, BrandUpdateInput } from "../types";

interface RegistroMarca {
  marcaId: string;
  nombre: string;
  estado: "Activo" | "Inactivo";
  logoUrl: string | null;
  paisOrigenIso: string | null;
  descripcion: string | null;
  version: number;
}

const store: RegistroMarca[] = [
  {
    marcaId: "nike",
    nombre: "Nike",
    estado: "Activo",
    logoUrl: "https://example.com/logos/nike.png",
    paisOrigenIso: "US",
    descripcion: "Marca deportiva internacional",
    version: 1,
  },
  {
    marcaId: "adidas",
    nombre: "Adidas",
    estado: "Activo",
    logoUrl: "https://example.com/logos/adidas.png",
    paisOrigenIso: "DE",
    descripcion: "Marca de indumentaria deportiva",
    version: 1,
  },
  {
    marcaId: "puma",
    nombre: "Puma",
    estado: "Inactivo",
    logoUrl: null,
    paisOrigenIso: "DE",
    descripcion: null,
    version: 1,
  },
];

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const generarId = (nombre: string): string => {
  const base = nombre
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "marca";
  let id = base;
  let sufijo = 2;
  while (store.some((item) => item.marcaId === id)) {
    id = `${base}-${sufijo}`;
    sufijo += 1;
  }
  return id;
};

const aItem = (r: RegistroMarca): BrandListItem => ({
  marcaId: r.marcaId,
  nombre: r.nombre,
  estado: r.estado,
  logoUrl: r.logoUrl,
  paisOrigenIso: r.paisOrigenIso,
});

const aDetalle = (r: RegistroMarca): BrandDetail => ({
  marcaId: r.marcaId,
  nombre: r.nombre,
  estado: r.estado,
  logoUrl: r.logoUrl,
  paisOrigenIso: r.paisOrigenIso,
  descripcion: r.descripcion,
  version: r.version,
});

export const mockBrandAdapter: BrandRepository = {
  async list(scenario, signal) {
    signal.throwIfAborted();
    await esperar(300);
    signal.throwIfAborted();
    if (scenario === "error") {
      throw new Error("No se pudieron cargar las marcas. Inténtalo de nuevo.");
    }
    if (scenario === "empty") {
      return { items: [] };
    }
    return { items: store.map(aItem) };
  },

  async obtener(id, signal) {
    signal.throwIfAborted();
    await esperar(300);
    signal.throwIfAborted();
    const r = store.find((item) => item.marcaId === id);
    return r ? aDetalle(r) : null;
  },

  async crear(input: BrandCreateInput, signal: AbortSignal) {
    signal.throwIfAborted();
    await esperar(300);
    signal.throwIfAborted();
    const r: RegistroMarca = {
      marcaId: generarId(input.nombre),
      nombre: input.nombre.trim(),
      estado: "Activo",
      logoUrl: null,
      paisOrigenIso: input.paisOrigenIso ?? null,
      descripcion: input.descripcion ?? null,
      version: 1,
    };
    store.push(r);
    return aDetalle(r);
  },

  async actualizar(input: BrandUpdateInput, signal: AbortSignal) {
    signal.throwIfAborted();
    await esperar(300);
    signal.throwIfAborted();
    const r = store.find((item) => item.marcaId === input.marcaId);
    if (!r) return null;
    r.nombre = input.nombre.trim();
    r.descripcion = input.descripcion ?? null;
    r.paisOrigenIso = input.paisOrigenIso ?? null;
    r.version += 1;
    return aDetalle(r);
  },
};
