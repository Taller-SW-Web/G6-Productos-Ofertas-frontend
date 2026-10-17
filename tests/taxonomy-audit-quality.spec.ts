import { test, expect } from "@playwright/test";
import { mockCategoryAdapter } from "../src/features/taxonomy/adapters/mockCategoryAdapter";
import { mockBrandAdapter } from "../src/features/taxonomy/adapters/mockBrandAdapter";
import { mockTaxonomyRepository } from "../src/features/catalog/adapters/mockTaxonomyRepository";
import { mockCatalogRepository } from "../src/features/catalog/adapters/mockCatalogRepository";

test.describe("Auditoría MK-008: Persistencia de campos y validaciones jerárquicas", () => {
  test("crea categoría respetando orden e imagen, y los preserva en consulta y edición", async () => {
    const slug = `prueba-campos-${Date.now()}`;
    const creado = await mockCategoryAdapter.crear({
      nombre: "Categoría Campos QA",
      slug,
      padreId: "calzado",
      orden: 5,
      imagen: "https://example.com/imagen-creada.png",
      descripcion: "Descripción con orden e imagen explícitos",
    });

    expect(creado.slug).toBe(slug);

    // Consulta de detalle
    const detalle = await mockCategoryAdapter.obtener(slug);
    expect(detalle).not.toBeNull();
    expect(detalle?.orden).toBe(5);
    expect(detalle?.imagen).toBe("https://example.com/imagen-creada.png");
    expect(detalle?.imagenUrl).toBe("https://example.com/imagen-creada.png");
    expect(detalle?.descripcion).toBe("Descripción con orden e imagen explícitos");

    // Edición actualizando imagen y orden
    const actualizado = await mockCategoryAdapter.actualizar({
      id: slug,
      nombre: "Categoría Campos QA Editada",
      slug,
      padreId: "calzado",
      orden: 10,
      imagen: "https://example.com/imagen-editada.png",
      descripcion: "Descripción actualizada",
    });

    expect(actualizado.orden).toBe(10);
    expect(actualizado.imagen).toBe("https://example.com/imagen-editada.png");
    expect(actualizado.nombre).toBe("Categoría Campos QA Editada");

    // Comprobación de persistencia tras edición
    const reconsultado = await mockCategoryAdapter.obtener(slug);
    expect(reconsultado?.orden).toBe(10);
    expect(reconsultado?.imagen).toBe("https://example.com/imagen-editada.png");
  });

  test("rechaza crear categoría activa bajo una categoría padre inactiva", async () => {
    // "inactiva-raiz" es una categoría inactiva en el store
    await expect(
      mockCategoryAdapter.crear({
        nombre: "Hija Invalida",
        slug: `hija-invalida-${Date.now()}`,
        padreId: "inactiva-raiz",
        orden: 1,
      }),
    ).rejects.toThrow("No se puede crear una categoría activa bajo una categoría padre inactiva.");
  });

  test("rechaza crear categoría con padre inexistente", async () => {
    await expect(
      mockCategoryAdapter.crear({
        nombre: "Hija Huérfana",
        slug: `hija-huerfana-${Date.now()}`,
        padreId: "padre-que-no-existe-xyz",
        orden: 1,
      }),
    ).rejects.toThrow("La categoría padre seleccionada no existe.");
  });

  test("rechaza mover una categoría a un padre inactivo o a sí misma/descendiente (circularidad)", async () => {
    // Circularidad: mover calzado dentro de sí misma
    await expect(
      mockCategoryAdapter.actualizar({
        id: "calzado",
        nombre: "Calzado",
        slug: "calzado",
        padreId: "calzado",
        orden: 1,
      }),
    ).rejects.toThrow("No puedes mover una categoría dentro de sí misma");

    // Circularidad: mover calzado dentro de su hija running
    await expect(
      mockCategoryAdapter.actualizar({
        id: "calzado",
        nombre: "Calzado",
        slug: "calzado",
        padreId: "running",
        orden: 1,
      }),
    ).rejects.toThrow("No puedes mover una categoría dentro de sí misma o de una de sus subcategorías.");

    // Padre inactivo para categoría activa
    await expect(
      mockCategoryAdapter.actualizar({
        id: "running",
        nombre: "Running",
        slug: "running",
        padreId: "inactiva-raiz",
        orden: 1,
      }),
    ).rejects.toThrow("No se puede asignar como padre a una categoría inactiva.");
  });
});

test.describe("LOP-01 / LOP-02: Puente compartido Taxonomía — Catálogo (#37)", () => {
  test("modificar una categoría en Taxonomía actualiza lo que consume Catálogo bajo CAT-CALZADO sin duplicar", async () => {
    const timestamp = Date.now();
    const nuevoNombre = `Calzado Deportivo ${timestamp}`;

    // Actualiza en Taxonomía (usando ID 'calzado')
    await mockCategoryAdapter.actualizar({
      id: "calzado",
      nombre: nuevoNombre,
      slug: "calzado",
      padreId: undefined,
      orden: 1,
    });

    // Catálogo consulta categorías mediante el repositorio puente
    const categoriasCatalogo = await mockTaxonomyRepository.getCategories();

    // Debe contener CAT-CALZADO con el nuevo nombre
    const catCalzado = categoriasCatalogo.find((c) => c.id === "CAT-CALZADO");
    expect(catCalzado).toBeDefined();
    expect(catCalzado?.nombre).toBe(nuevoNombre);

    // No deben existir categorías duplicadas para Calzado
    const calzadoEntries = categoriasCatalogo.filter(
      (c) => c.id === "CAT-CALZADO" || c.id === "calzado",
    );
    expect(calzadoEntries).toHaveLength(1);

    // Verificar que los productos de Catálogo que usan CAT-CALZADO siguen funcionando
    const { items: productosCalzado } = await mockCatalogRepository.list({
      categoryId: "CAT-CALZADO",
      page: 1,
      pageSize: 10,
    });
    expect(productosCalzado.length).toBeGreaterThan(0);
    expect(productosCalzado.every((p) => p.categoryId === "CAT-CALZADO")).toBe(true);
  });

  test("crear una nueva categoría en Taxonomía la hace visible de inmediato en Catálogo", async () => {
    const timestamp = Date.now();
    const slug = `outdoor-${timestamp}`;
    const nombre = `Outdoor ${timestamp}`;

    await mockCategoryAdapter.crear({
      nombre,
      slug,
      orden: 7,
    });

    const categoriasCatalogo = await mockTaxonomyRepository.getCategories();
    const nuevaEnCatalogo = categoriasCatalogo.find((c) => c.id === slug);
    expect(nuevaEnCatalogo).toBeDefined();
    expect(nuevaEnCatalogo?.nombre).toBe(nombre);
    expect(nuevaEnCatalogo?.activo).toBe(true);
  });

  test("modificar una marca en Taxonomía actualiza lo que consume Catálogo", async () => {
    const timestamp = Date.now();
    const nuevoNombre = `Inka Athletic Pro ${timestamp}`;

    await mockBrandAdapter.actualizar({
      marcaId: "BRD-INKA",
      nombre: nuevoNombre,
      descripcion: "Marca actualizada desde Taxonomía",
      paisOrigenIso: "PE",
    });

    const marcasCatalogo = await mockTaxonomyRepository.getBrands();
    const marcaInka = marcasCatalogo.find((b) => b.id === "BRD-INKA");
    expect(marcaInka).toBeDefined();
    expect(marcaInka?.nombre).toBe(nuevoNombre);
  });

  test("las características y tipos de Taxonomía alimentan los esquemas de Catálogo", async () => {
    const tipos = await mockTaxonomyRepository.getProductTypes();
    expect(tipos.some((t) => t.id === "ropa" || t.id === "TIP-CAMISA")).toBe(true);

    // Consulta de esquema de tipo de producto compartido
    const esquemaRopa = await mockTaxonomyRepository.getAttributeSchema("ropa");
    expect(esquemaRopa.length).toBeGreaterThan(0);
    expect(esquemaRopa.some((attr) => attr.caracteristicaId === "talla")).toBe(true);
  });
});
