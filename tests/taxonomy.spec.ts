import { expect, test } from "@playwright/test";
import { brandService } from "../src/features/taxonomy/services/brandService";
import { categoryService } from "../src/features/taxonomy/services/categoryService";
import { characteristicService } from "../src/features/taxonomy/services/characteristicService";
import { productTypeService } from "../src/features/taxonomy/services/productTypeService";
import { seoService } from "../src/features/taxonomy/services/seoService";
import {
  SeoConflictError,
  type SeoRepository,
} from "../src/features/taxonomy/services/seoRepository";
import type { BrandRepository } from "../src/features/taxonomy/services/brandRepository";
import type { CategoryRepository } from "../src/features/taxonomy/services/categoryRepository";
import type { CharacteristicRepository } from "../src/features/taxonomy/services/characteristicRepository";
import type { ProductTypeRepository } from "../src/features/taxonomy/services/productTypeRepository";

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y
  ? 1
  : 2
  ? true
  : false;
type Assert<T extends true> = T;

test("crea un tipo de producto y permite consultar su detalle de inmediato", async () => {
  const creado = await productTypeService.crear({
    nombre: "Equipamiento de montaña QA",
  });

  expect(creado.tipoProductoId).toContain("equipamiento");
  expect(creado.estado).toBe("Activo");
  expect(creado.schemaVersion).toBe(0);

  const detalle = await productTypeService.obtener(creado.tipoProductoId);

  expect(detalle).not.toBeNull();
  expect(detalle?.nombre).toBe("Equipamiento de montaña QA");
  expect(detalle?.schemaVersion).toBe(0);
  expect(detalle?.asociadas).toHaveLength(0);
  expect(detalle?.caracteristicasAsignadas).toBe(detalle?.asociadas.length);
});

test("asocia y desasocia una característica incrementando la versión del esquema", async () => {
  const creado = await productTypeService.crear({
    nombre: "Tipo esquema asociar QA",
  });

  const asociado = await productTypeService.asociarCaracteristica({
    tipoProductoId: creado.tipoProductoId,
    caracteristicaId: "material",
    obligatoria: false,
  });

  expect(asociado?.schemaVersion).toBe(1);
  expect(asociado?.asociadas.map((item) => item.caracteristicaId)).toContain(
    "material",
  );

  const desasociado = await productTypeService.desasociarCaracteristica(
    creado.tipoProductoId,
    "material",
  );
  expect(desasociado.resultado).toBe("exito");

  const detalle = await productTypeService.obtener(creado.tipoProductoId);
  expect(detalle?.schemaVersion).toBe(2);
  expect(detalle?.asociadas).toHaveLength(0);
});

test("mantiene la desasociación en verificación y la confirma al consultar el estado", async () => {
  const caracteristica = await characteristicService.crear({
    nombre: "Composición QA",
    tipo: "TEXTO",
    estado: "Activo",
  });
  const creado = await productTypeService.crear({
    nombre: "Tipo obligatoria QA",
  });

  await productTypeService.asociarCaracteristica({
    tipoProductoId: creado.tipoProductoId,
    caracteristicaId: caracteristica.id,
    obligatoria: true,
  });

  const pendiente = await productTypeService.desasociarCaracteristica(
    creado.tipoProductoId,
    caracteristica.id,
  );
  expect(pendiente.resultado).toBe("pendiente");
  expect(pendiente.operacionId).toBeTruthy();

  const sinCambios = await productTypeService.obtener(creado.tipoProductoId);
  expect(sinCambios?.asociadas).toHaveLength(1);

  const confirmado = await productTypeService.consultarEstadoOperacion(
    pendiente.operacionId as string,
  );
  expect(confirmado.estado).toBe("confirmada");
  expect(confirmado.tipoProducto?.asociadas).toHaveLength(0);
  expect(confirmado.tipoProducto?.schemaVersion).toBe(2);
});

test("conserva las asociaciones cuando la característica asociada pasa a inactiva", async () => {
  const caracteristica = await characteristicService.crear({
    nombre: "Textura QA",
    tipo: "TEXTO",
    estado: "Activo",
  });
  const creado = await productTypeService.crear({
    nombre: "Tipo conserva QA",
  });

  await productTypeService.asociarCaracteristica({
    tipoProductoId: creado.tipoProductoId,
    caracteristicaId: caracteristica.id,
    obligatoria: false,
  });
  await characteristicService.cambiarEstado(caracteristica.id, "Inactivo");

  const detalle = await productTypeService.obtener(creado.tipoProductoId);
  expect(detalle?.asociadas).toHaveLength(1);
  expect(detalle?.caracteristicasAsignadas).toBe(1);
  expect(detalle?.asociadas[0]?.caracteristicaId).toBe(caracteristica.id);
  expect(detalle?.asociadas[0]?.caracteristica.estado).toBe("Inactivo");
});

test("crea y edita una marca y devuelve null al guardar una marca inexistente", async () => {
  const creada = await brandService.crear({
    nombre: "Marca Temporal QA",
    descripcion: "Alta de prueba",
  });
  expect(creada.estado).toBe("Activo");
  expect(creada.version).toBe(1);

  const detalle = await brandService.obtener(creada.marcaId);
  expect(detalle?.nombre).toBe("Marca Temporal QA");

  const actualizada = await brandService.actualizar({
    marcaId: creada.marcaId,
    nombre: "Marca Temporal QA Editada",
    descripcion: "Actualizada en la revisión",
  });
  expect(actualizada?.nombre).toBe("Marca Temporal QA Editada");
  expect(actualizada?.version).toBe(2);

  const fallo = await brandService.actualizar({
    marcaId: "marca-inexistente-qa",
    nombre: "Sin destino",
  });
  expect(fallo).toBeNull();
});

test("edita el slug SEO, registra historial y rechaza un slug con conflicto 409", async () => {
  const guardado = await seoService.guardar({
    id: "cat-ropa",
    slug: "ropa-deportiva-qa",
    metaTitulo: "Ropa deportiva QA",
    metaDescripcion: "Metadatos de prueba",
  });
  expect(guardado?.slug).toBe("ropa-deportiva-qa");

  const historial = await seoService.historial("cat-ropa");
  expect(
    historial.some((item) => item.slugActual === "ropa-deportiva-qa"),
  ).toBe(true);

  await expect(
    seoService.guardar({
      id: "cat-ropa",
      slug: "tecnologia",
      metaTitulo: "",
      metaDescripcion: "",
    }),
  ).rejects.toBeInstanceOf(SeoConflictError);

  await expect(
    seoService.guardar({
      id: "cat-ropa",
      slug: "zapatillas",
      metaTitulo: "",
      metaDescripcion: "",
    }),
  ).rejects.toThrow(/409/);
});

test("sigue el ciclo de baja de una categoría mediante la consulta de estado", async () => {
  const solicitud = await categoryService.solicitarBaja("office");
  expect(solicitud.resultado).toBe("verificando");
  expect(solicitud.operacionId).toBeTruthy();
  expect(solicitud.categoria.estado).toBe("Verificando baja");

  const seguimiento = await categoryService.consultarEstadoOperacion(
    solicitud.operacionId as string,
  );
  expect(seguimiento.estado).toBe("confirmada");
  expect(seguimiento.categoria?.estado).toBe("Inactivo");
});

test("los contratos de repositorio no aceptan parámetros de escenario mock", async () => {
  type CategoriaSinEscenario = Assert<
    Equal<Parameters<CategoryRepository["list"]>, [signal?: AbortSignal]>
  >;
  type CaracteristicaSinEscenario = Assert<
    Equal<Parameters<CharacteristicRepository["list"]>, [signal?: AbortSignal]>
  >;
  type TipoProductoSinEscenario = Assert<
    Equal<Parameters<ProductTypeRepository["list"]>, [signal?: AbortSignal]>
  >;
  type MarcaSinEscenario = Assert<
    Equal<Parameters<BrandRepository["list"]>, [signal?: AbortSignal]>
  >;
  type SeoSinEscenario = Assert<
    Equal<Parameters<SeoRepository["list"]>, [signal?: AbortSignal]>
  >;

  expect(
    true as CategoriaSinEscenario &
      CaracteristicaSinEscenario &
      TipoProductoSinEscenario &
      MarcaSinEscenario &
      SeoSinEscenario,
  ).toBe(true);

  const [categorias, caracteristicas, tipos, marcas, metadatos] =
    await Promise.all([
      categoryService.list(),
      characteristicService.list(),
      productTypeService.list(),
      brandService.list(),
      seoService.list(),
    ]);

  expect(Array.isArray(categorias.nodos)).toBe(true);
  expect(Array.isArray(caracteristicas.caracteristicas)).toBe(true);
  expect(Array.isArray(tipos.items)).toBe(true);
  expect(Array.isArray(marcas.items)).toBe(true);
  expect(Array.isArray(metadatos.items)).toBe(true);
});

// --- Regresión P0 (PR #41 / LOP-01 y LOP-04): alias de categorías -----------
// Catálogo envía IDs externos (CAT-CALZADO) mientras Taxonomía usa `calzado`.
// Toda relación padre/hija debe resolverse a un único ID interno para evitar
// categorías invisibles y ciclos por autorreferencia.

test("normaliza el padre por alias al crear y no deja la categoría invisible (LOP-04)", async () => {
  const creada = await categoryService.crear({
    nombre: "Alias QA",
    slug: "alias-qa",
    padreId: "CAT-CALZADO",
  });

  // The stored parent must be the canonical Taxonomy ID, not the alias.
  const detalle = await categoryService.obtener(creada.id);
  expect(detalle?.padreId).toBe("calzado");
  expect(detalle?.padreNombre).toBe("Calzado");

  // And it must be reachable in the tree under the canonical parent.
  const { nodos } = await categoryService.list();
  const calzado = nodos.find((nodo) => nodo.id === "calzado");
  expect(calzado?.hijas?.some((hija) => hija.id === "alias-qa")).toBe(true);

  // Resolving the alias must address the same entity, not a second one.
  const porAlias = await categoryService.obtener("CAT-CALZADO");
  expect(porAlias?.id).toBe("calzado");
});

test("rechaza mover una categoría sobre su propio alias (ciclo por autorreferencia)", async () => {
  await expect(
    categoryService.actualizar({
      id: "calzado",
      nombre: "Calzado",
      slug: "calzado",
      padreId: "CAT-CALZADO",
      orden: 1,
    }),
  ).rejects.toThrow(/sí misma|subcategorías/i);
});

test("rechaza crear una categoría cuyo slug es un alias reservado", async () => {
  await expect(
    categoryService.crear({
      nombre: "Alias reservado QA",
      slug: "CAT-CALZADO",
      padreId: "calzado",
    }),
  ).rejects.toThrow(/reservado/i);
});
