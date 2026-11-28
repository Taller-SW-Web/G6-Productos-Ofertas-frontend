// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { DataModeContext } from "../../../app/config/DataModeContext";
import { VariantFormFields } from "../components/VariantFormFields";
import { initialProducts, initialVariants } from "../mocks/catalogFixtures";
import { useVariantForm } from "./useVariantForm";
import { CatalogServicesContext } from "../services/CatalogServicesContext";
import { getCatalogServices } from "../services/catalogServices";
import { useState } from "react";
import { ProductFormFields } from "../components/ProductFormFields";
import type { ProductFormData } from "./useProductForm";

Object.defineProperty(window, "matchMedia", { value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("el producto simple conserva 0.185 kg al cambiar su nombre", async () => {
  const initial: ProductFormData = { nombre: "Producto", descripcion: "Descripción", categoriaId: "", tipoProductoId: "", marcaId: "", skuBase: "TEST", tieneVariantes: false,
    precioBaseInicial: 10, imageUrl: "", atributos: {}, pesoKg: 0.185, largoCm: 12.345, anchoCm: 10, altoCm: 2 };
  function Editor() {
    const [data, setData] = useState(initial);
    return <><ProductFormFields formData={data} updateField={(field, value) => setData(previous => ({ ...previous, [field]: value }))}
      updateAttribute={() => undefined} errors={{}} categories={[]} brands={[]} productTypes={[]} attributeSchema={[]} schemaConfirmed isEdit />
      <output data-testid="simple-weight">{data.pesoKg}</output></>;
  }
  render(<MantineProvider><Editor /></MantineProvider>);
  const weight = await screen.findByLabelText("Peso (kg)");
  expect((weight as HTMLInputElement).value).toBe("0.185");
  fireEvent.change(screen.getByRole("textbox", { name: /Nombre del producto/ }), { target: { value: "Nombre nuevo" } });
  expect(screen.getByTestId("simple-weight").textContent).toBe("0.185");
  expect((weight as HTMLInputElement).value).toBe("0.185");
});

it("conserva 0.185 kg y dimensiones decimales al editar otro campo", async () => {
  const product = initialProducts[0]!;
  const variant = { ...initialVariants[0]!, physicalProfile: { pesoKg: 0.185, largoCm: 12.345, anchoCm: 10, altoCm: 2 } };
  function Editor() {
    const form = useVariantForm({ parentProduct: product, initialVariant: variant });
    return <><VariantFormFields form={form} parentProduct={product} /><output data-testid="weight">{form.formData.pesoKg}</output></>;
  }
  render(<DataModeContext.Provider value="mock"><MantineProvider><Editor /></MantineProvider></DataModeContext.Provider>);
  const weight = await screen.findByLabelText("Peso (kg)");
  expect((weight as HTMLInputElement).value).toBe("0.185");
  expect((screen.getByLabelText("Largo (cm)") as HTMLInputElement).value).toBe("12.345");
  fireEvent.change(screen.getByLabelText(/URL de Imagen de la Variante/), { target: { value: "https://example.test/new-image.png" } });
  expect(screen.getByTestId("weight").textContent).toBe("0.185");
  expect((weight as HTMLInputElement).value).toBe("0.185");
});

it("presenta Color/Talla por etiqueta y conserva el identificador inmutable", async () => {
  const services = getCatalogServices("mock");
  const id = "11111111-1111-4111-8111-111111111111";
  vi.spyOn(services.taxonomy, "getAttributeSchema").mockResolvedValue([
    { caracteristicaId: "CAR-COLOR", nombre: "Color predominante", tipo: "LISTA", obligatorio: true, esIdentificadora: true, opciones: [{ id, valor: "Rojo" }] },
  ]);
  const product = initialProducts[0]!;
  const variant = { ...initialVariants[0]!, identifyingAttributes: [
    { caracteristicaId: "CAR-COLOR", nombre: "Color", tipo: "LISTA" as const, valorId: id, valor: "Rojo" },
  ] };
  function Editor() {
    const form = useVariantForm({ parentProduct: product, initialVariant: variant });
    return <><VariantFormFields form={form} parentProduct={product} /><output data-testid="identifier">{form.formData.identifyingAttributes[0]?.valor}</output></>;
  }
  render(<DataModeContext.Provider value="mock"><CatalogServicesContext.Provider value={services}><MantineProvider><Editor /></MantineProvider></CatalogServicesContext.Provider></DataModeContext.Provider>);
  expect(await screen.findByText("Color predominante: Rojo")).toBeTruthy();
  expect(screen.getByTestId("identifier").textContent).toBe(id);
});
