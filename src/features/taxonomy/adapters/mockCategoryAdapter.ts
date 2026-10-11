import type { CategoryRepository } from "../services/categoryRepository";
import type { CategoryDetail, CategoryNode } from "../types";

// In-memory flat store for MK-008. No HTTP contract exists yet; writes are simulated
// and lost on reload. Keeping it flat makes parent/child relationships explicit.
interface RegistroCategoria {
  id: string;
  nombre: string;
  slug: string;
  padreId: string | null;
  orden: number;
  estado: CategoryNode["estado"];
  descripcion?: string;
}

const store: RegistroCategoria[] = [
  {
    id: "calzado",
    nombre: "Calzado",
    slug: "calzado",
    padreId: null,
    orden: 1,
    estado: "Activo",
    descripcion: "Calzado para dama y caballero.",
  },
  {
    id: "ropa",
    nombre: "Ropa",
    slug: "ropa",
    padreId: null,
    orden: 2,
    estado: "Activo",
    descripcion: "Prendas de vestir.",
  },
  {
    id: "running",
    nombre: "Running",
    slug: "running",
    padreId: "calzado",
    orden: 1,
    estado: "Activo",
  },
  {
    id: "casual",
    nombre: "Casual",
    slug: "casual",
    padreId: "calzado",
    orden: 2,
    estado: "Activo",
  },
  {
    id: "play",
    nombre: "Play",
    slug: "play",
    padreId: "ropa",
    orden: 1,
    estado: "Inactivo",
  },
  {
    id: "office",
    nombre: "Office",
    slug: "office",
    padreId: "ropa",
    orden: 2,
    estado: "Verificando baja",
  },
];

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const hallar = (id: string): RegistroCategoria | undefined =>
  store.find((item) => item.id === id);

const nivelDe = (id: string): number => {
  let nivel = 0;
  let actual = hallar(id);
  while (actual && actual.padreId) {
    nivel += 1;
    actual = hallar(actual.padreId);
  }
  return nivel;
};

const esDescendiente = (posibleDescendienteId: string, ancestroId: string): boolean => {
  let actual = hallar(posibleDescendienteId);
  while (actual && actual.padreId) {
    if (actual.padreId === ancestroId) return true;
    actual = hallar(actual.padreId);
  }
  return false;
};

const hijasDe = (padreId: string | null): RegistroCategoria[] =>
  store
    .filter((item) => item.padreId === padreId)
    .sort((a, b) => a.orden - b.orden);

const slugEnUso = (slug: string, exceptoId?: string): boolean =>
  store.some((item) => item.slug === slug && item.id !== exceptoId);

const aNodo = (registro: RegistroCategoria): CategoryNode => ({
  id: registro.id,
  nombre: registro.nombre,
  nivel: nivelDe(registro.id),
  estado: registro.estado,
  slug: registro.slug,
  orden: registro.orden,
  descripcion: registro.descripcion,
  hijas: hijasDe(registro.id).map(aNodo),
});

const aDetalle = (registro: RegistroCategoria): CategoryDetail => {
  const padre = registro.padreId ? hallar(registro.padreId) : undefined;
  return {
    id: registro.id,
    nombre: registro.nombre,
    slug: registro.slug,
    nivel: nivelDe(registro.id),
    orden: registro.orden,
    estado: registro.estado,
    descripcion: registro.descripcion,
    padreId: registro.padreId ?? undefined,
    padreNombre: padre?.nombre,
    hijas: hijasDe(registro.id).map(aNodo),
  };
};

// Mock adapter: returns deterministic fixtures, never a real backend response.
export const mockCategoryAdapter: CategoryRepository = {
  async list(signal) {
    signal.throwIfAborted();
    await esperar(400);
    signal.throwIfAborted();
    return { nodos: hijasDe(null).map(aNodo), colapsadosPorId: [] };
  },

  async obtener(id, scenario, signal) {
    signal.throwIfAborted();
    await esperar(400);
    signal.throwIfAborted();

    if (scenario === "error") {
      throw new Error("No se pudo cargar la categoría. Inténtalo de nuevo.");
    }
    if (scenario === "no-encontrado") return null;

    const registro = hallar(id);
    return registro ? aDetalle(registro) : null;
  },

  async comprobarSlug(slug, scenario, signal) {
    signal.throwIfAborted();
    await esperar(300);
    signal.throwIfAborted();

    if (scenario === "slug-sin-colision") {
      return { slug, disponible: true };
    }
    if (scenario === "slug-con-colision") {
      return { slug, disponible: false, alternativo: `${slug}-2` };
    }
    if (scenario === "slug-carrera-409") {
      // Looks free here; the collision only appears when saving.
      return { slug, disponible: true };
    }

    const disponible = !slugEnUso(slug);
    return disponible
      ? { slug, disponible }
      : { slug, disponible, alternativo: `${slug}-2` };
  },

  async crear(input, scenario, signal) {
    signal.throwIfAborted();
    await esperar(400);
    signal.throwIfAborted();

    if (scenario === "slug-carrera-409" || slugEnUso(input.slug)) {
      throw new Error(
        "El slug ya está en uso. Elige la alternativa sugerida o modifica el slug.",
      );
    }

    const padreId = input.padreId ?? null;
    const id = input.slug;
    store.push({
      id,
      nombre: input.nombre,
      slug: input.slug,
      padreId,
      orden: hijasDe(padreId).length + 1,
      estado: "Activo",
      descripcion: input.descripcion,
    });
    return { id, nombre: input.nombre, slug: input.slug };
  },

  async actualizar(input, scenario, signal) {
    signal.throwIfAborted();
    await esperar(400);
    signal.throwIfAborted();

    const registro = hallar(input.id);
    if (!registro) {
      throw new Error("La categoría ya no está disponible para editar.");
    }
    if (scenario === "slug-carrera-409" || slugEnUso(input.slug, input.id)) {
      throw new Error(
        "El slug ya está en uso. Elige la alternativa sugerida o modifica el slug.",
      );
    }

    const padreId = input.padreId ?? null;
    if (padreId === input.id || (padreId && esDescendiente(padreId, input.id))) {
      throw new Error(
        "No puedes mover una categoría dentro de sí misma o de una de sus subcategorías.",
      );
    }

    registro.nombre = input.nombre;
    registro.slug = input.slug;
    registro.padreId = padreId;
    registro.orden = input.orden;
    registro.descripcion = input.descripcion;

    return aDetalle(registro);
  },
};
