import type { ProductTypeRepository } from "../services/productTypeRepository";
import { PRODUCT_TYPE_ATTRIBUTE_LIMIT } from "../services/productTypeRepository";
import type {
  ProductTypeCreateInput,
  ProductTypeCreateResult,
  ProductTypeListItem,
} from "../types";

interface RegistroTipoProducto {
  tipoProductoId: string;
  nombre: string;
  estado: "Activo" | "Inactivo";
  schemaVersion: number;
  caracteristicasAsignadas: number;
}

const store: RegistroTipoProducto[] = [
  {
    tipoProductoId: "calzado",
    nombre: "Calzado deportivo",
    estado: "Activo",
    schemaVersion: 4,
    caracteristicasAsignadas: 3,
  },
  {
    tipoProductoId: "ropa",
    nombre: "Ropa de entrenamiento",
    estado: "Activo",
    schemaVersion: 3,
    caracteristicasAsignadas: 2,
  },
  {
    tipoProductoId: "accesorios",
    nombre: "Accesorios genéricos",
    estado: "Activo",
    schemaVersion: 1,
    caracteristicasAsignadas: 0,
  },
];

const esperar = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const generarId = (nombre: string): string => {
  const base =
    nombre
      .trim()
      .toLocaleLowerCase("es")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "tipo-producto";
  let id = base;
  let sufijo = 2;
  while (store.some((item) => item.tipoProductoId === id)) {
    id = `${base}-${sufijo}`;
    sufijo += 1;
  }
  return id;
};

export const mockProductTypeAdapter: ProductTypeRepository = {
  async list(scenario, signal) {
    signal.throwIfAborted();
    await esperar(400);
    signal.throwIfAborted();
    if (scenario === "error") {
      throw new Error(
        "No se pudieron cargar los tipos de producto. Inténtalo de nuevo.",
      );
    }
    if (scenario === "empty") {
      return { items: [], limite: PRODUCT_TYPE_ATTRIBUTE_LIMIT };
    }
    const items: ProductTypeListItem[] = store.map((registro) => ({
      tipoProductoId: registro.tipoProductoId,
      nombre: registro.nombre,
      estado: registro.estado,
      schemaVersion: registro.schemaVersion,
      caracteristicasAsignadas: registro.caracteristicasAsignadas,
      limiteCaracteristicas: PRODUCT_TYPE_ATTRIBUTE_LIMIT,
    }));
    return { items, limite: PRODUCT_TYPE_ATTRIBUTE_LIMIT };
  },

  async crear(input: ProductTypeCreateInput, signal: AbortSignal) {
    signal.throwIfAborted();
    await esperar(400);
    signal.throwIfAborted();
    const registro: RegistroTipoProducto = {
      tipoProductoId: generarId(input.nombre),
      nombre: input.nombre.trim(),
      estado: "Activo",
      schemaVersion: 0,
      caracteristicasAsignadas: 0,
    };
    store.push(registro);
    const resultado: ProductTypeCreateResult = {
      tipoProductoId: registro.tipoProductoId,
      nombre: registro.nombre,
      estado: registro.estado,
      schemaVersion: registro.schemaVersion,
    };
    return resultado;
  },
};
