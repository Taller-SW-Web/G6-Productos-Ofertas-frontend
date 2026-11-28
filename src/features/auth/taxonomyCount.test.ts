// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { ProductTypeAttributeCount } from "../taxonomy/components/ProductTypeAttributeCount";
import { useProductTypeSchema } from "../taxonomy/hooks/useProductTypeSchema";

vi.mock("../taxonomy/hooks/useProductTypeSchema", () => ({ useProductTypeSchema: vi.fn() }));
Object.defineProperty(window, "matchMedia", { value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("TAX-02 no genera N+1 al cargar y consulta el recuento del esquema solo a pedido", () => {
  vi.mocked(useProductTypeSchema).mockReturnValue({ state: { status: "success", esquema: {
    tipoProducto: { tipoProductoId: "type-1", nombre: "Camiseta", estado: "ACTIVO", schemaVersion: 4 },
    schemaVersion: 4, caracteristicas: [
      { caracteristicaId: "color", obligatoria: true, estado: "ACTIVO", schemaVersion: 4, caracteristica: null },
      { caracteristicaId: "talla", obligatoria: true, estado: "ACTIVO", schemaVersion: 4, caracteristica: null },
    ],
  } }, reload: vi.fn() });
  render(createElement(MantineProvider, null, createElement(ProductTypeAttributeCount, { id: "type-1" })));
  expect(useProductTypeSchema).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Consultar cantidad" }));
  expect(useProductTypeSchema).toHaveBeenCalledWith("type-1");
  expect(screen.getByText("2 asociadas")).toBeTruthy();
});

it("TAX-02 el error no equivale a cero y permite reintento localizado", () => {
  const reload = vi.fn();
  vi.mocked(useProductTypeSchema).mockReturnValue({ state: { status: "error", message: "Sin conexión" }, reload });
  render(createElement(MantineProvider, null, createElement(ProductTypeAttributeCount, { id: "type-2" })));
  fireEvent.click(screen.getByRole("button", { name: "Consultar cantidad" }));
  expect(screen.queryByText("0 asociadas")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar cantidad" }));
  expect(reload).toHaveBeenCalledTimes(1);
});
