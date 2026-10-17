import type { BrandRepository } from "../services/brandRepository";
import type {
  BrandBajaResult,
  BrandCreateInput,
  BrandDetail,
  BrandListItem,
  BrandUpdateInput,
} from "../types";
import {
  loadMockArray,
  persistMockArray,
  syncMockArrayOnExternalChange,
} from "../../shared/mockState";

interface RegistroMarca {
  marcaId: string;
  nombre: string;
  estado: "Activo" | "Inactivo";
  logoUrl: string | null;
  paisOrigenIso: string | null;
  descripcion: string | null;
  version: number;
}

interface OperacionBaja {
  operacionId: string;
  marcaId: string;
  estado: "verificando" | "completada" | "no-concluyente";
}

const storeFixtures: RegistroMarca[] = [
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

// Demo state restored from the current-browser session when available; otherwise a
// fresh clone of the fixtures. Cross-tab writes rehydrate this same array in place.
const store: RegistroMarca[] = loadMockArray("taxonomy-brands", storeFixtures);
syncMockArrayOnExternalChange("taxonomy-brands", store);

const persist = () => persistMockArray("taxonomy-brands", store);

const operacionesBaja: OperacionBaja[] = [
  { operacionId: "op-marca-adidas", marcaId: "adidas", estado: "verificando" },
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

// Deterministic local states used only for review. The repository contract does not
// accept scenarios; reviewers change these values to reproduce error or edge cases
// without touching pages, hooks or the service contract.
type EscenarioLista = "default" | "empty" | "error";

const MOCK: { lista: EscenarioLista } = {
  lista: "default",
};

export const mockBrandAdapter: BrandRepository = {
  async list(signal) {
    signal?.throwIfAborted();
    await esperar(300);
    signal?.throwIfAborted();
    if (MOCK.lista === "error") {
      throw new Error("No se pudieron cargar las marcas. Inténtalo de nuevo.");
    }
    if (MOCK.lista === "empty") {
      return { items: [] };
    }
    return { items: store.map(aItem) };
  },

  async obtener(id, signal) {
    signal?.throwIfAborted();
    await esperar(300);
    signal?.throwIfAborted();
    const r = store.find((item) => item.marcaId === id);
    return r ? aDetalle(r) : null;
  },

  async crear(input: BrandCreateInput, signal) {
    signal?.throwIfAborted();
    await esperar(300);
    signal?.throwIfAborted();
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
    persist();
    return aDetalle(r);
  },

  async actualizar(input: BrandUpdateInput, signal) {
    signal?.throwIfAborted();
    await esperar(300);
    signal?.throwIfAborted();
    const r = store.find((item) => item.marcaId === input.marcaId);
    if (!r) return null;
    r.nombre = input.nombre.trim();
    r.descripcion = input.descripcion ?? null;
    r.paisOrigenIso = input.paisOrigenIso ?? null;
    r.version += 1;
    persist();
    return aDetalle(r);
  },

  async solicitarBaja(id, signal) {
    signal?.throwIfAborted();
    await esperar(400);
    signal?.throwIfAborted();
    const r = store.find((item) => item.marcaId === id);
    if (!r) {
      throw new Error("La marca no existe o ya no está disponible.");
    }
    if (r.estado !== "Activo") {
      throw new Error("La marca no está activa; no corresponde solicitar su baja.");
    }
    if (r.marcaId === "nike") {
      const result: BrandBajaResult = {
        resultado: "rechazada",
        mensaje: "Catálogo reportó productos activos asociados a la marca.",
        bloqueos: [
          {
            tipo: "productos",
            cantidad: 8,
            detalle: "Hay 8 productos activos asociados a la marca Nike.",
          },
        ],
      };
      return result;
    }
    const op = operacionesBaja.find((o) => o.marcaId === id);
    // Deterministic id: re-requesting a baja never creates a duplicate operation.
    const operacionId = op?.operacionId ?? `op-marca-${id}`;
    if (!op) {
      operacionesBaja.push({
        operacionId,
        marcaId: id,
        estado: "verificando",
      });
    }
    return {
      resultado: "pendiente",
      mensaje: "Solicitud admitida (202 Accepted). La marca queda activa mientras se verifican dependencias con Catálogo.",
      operacionId,
    };
  },

  async consultarResultadoBaja(operacionId, signal) {
    signal?.throwIfAborted();
    await esperar(600);
    signal?.throwIfAborted();
    const op = operacionesBaja.find((o) => o.operacionId === operacionId);
    if (!op) {
      throw new Error("No se encontró la operación de baja solicitada.");
    }
    if (op.marcaId === "adidas" && op.estado === "verificando") {
      op.estado = "completada";
      const r = store.find((item) => item.marcaId === op.marcaId);
      if (r) {
        r.estado = "Inactivo";
        r.version += 1;
        persist();
      }
      return {
        resultado: "exito",
        mensaje: "Baja confirmada por Catálogo. La marca pasó a estado Inactivo.",
        operacionId,
      };
    }
    if (op.estado === "completada") {
      return {
        resultado: "exito",
        mensaje: "La marca ya cuenta con la baja confirmada.",
        operacionId,
      };
    }
    op.estado = "no-concluyente";
    return {
      resultado: "no-concluyente",
      mensaje: "La verificación no fue concluyente. La marca conserva su estado actual.",
      operacionId,
    };
  },
};