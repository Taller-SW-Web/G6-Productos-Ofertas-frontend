// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { MantineProvider } from "@mantine/core";

import { CombosContext } from "../services/CombosContext";
import type { CombosRuntime } from "../services/combosService";
import { ComboEditor } from "./ComboEditor";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: () => ({
    matches: false,
    media: "",
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub;

afterEach(cleanup);

it("COM-01 informa el duplicado junto a Agregar componente y no crea otra fila", async () => {
  renderEditor();
  await screen.findByText(/página 1 de 2/);
  const input = await screen.findByRole("combobox", { name: "Producto" });
  for (let attempt = 0; attempt < 2; attempt++) {
    fireEvent.click(input);
    fireEvent.click(await screen.findByText("Producto página uno", { selector: "span" }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar componente" }));
  }
  expect(await screen.findByText("SKU ya agregado")).toBeTruthy();
  const controls = screen.getByRole("button", { name: "Agregar componente" }).closest(".mantine-Group-root");
  expect(controls).not.toBeNull();
  expect(controls?.textContent).toContain("Este SKU ya está incluido");
  expect(screen.getAllByRole("row").filter(row => row.textContent?.includes("SKU-1"))).toHaveLength(1);
});

function renderEditor() {
  const products = new Map([
    [
      "page-1",
      {
        productId: "page-1",
        name: "Producto página uno",
        hasVariants: false,
        active: true,
        baseSku: "SKU-1",
        isCombo: false,
      },
    ],
    [
      "page-2",
      {
        productId: "page-2",
        name: "Producto página dos",
        hasVariants: false,
        active: true,
        baseSku: "SKU-2",
        isCombo: false,
      },
    ],
  ]);
  const runtime = {
    combos: {
      list: vi.fn(),
      getById: vi.fn(async () => null),
      create: vi.fn(),
      update: vi.fn(),
      deactivate: vi.fn(),
      getPendingCreate: vi.fn(async () => null),
      recoverPendingCreate: vi.fn(),
    },
    catalog: {
      listProducts: vi.fn(
        async (_query: string, page: number, pageSize: number) => ({
          items: [products.get(page === 1 ? "page-1" : "page-2")!],
          total: 40,
          page,
          pageSize,
        }),
      ),
      getProduct: vi.fn(async () => null),
      resolveSkus: vi.fn(async () => []),
    },
    pricing: { readCurrent: vi.fn(async () => []) },
    availability: { readStocks: vi.fn(async () => []) },
    now: () => Date.parse("2026-11-14T12:00:00.000Z"),
  } as unknown as CombosRuntime;
  const element = createElement(
    CombosContext.Provider,
    { value: runtime },
    createElement(MantineProvider, null, createElement(ComboEditor)),
  );
  const router = createMemoryRouter([{ path: "/combos/nuevo", element }], {
    initialEntries: ["/combos/nuevo"],
  });
  render(createElement(RouterProvider, { router }));
  return runtime;
}

it("conserva el producto seleccionado al cambiar de página y deja de ofrecer resultados antiguos al cambiar el texto", async () => {
  const runtime = renderEditor();
  await waitFor(() =>
    expect(runtime.catalog.listProducts).toHaveBeenCalledTimes(1),
  );
  expect(await screen.findByText(/página 1 de 2/)).toBeTruthy();
  const productInput = await screen.findByRole("combobox", {
    name: "Producto",
  });
  fireEvent.click(productInput);
  fireEvent.click(await screen.findByText("Producto página uno"));
  await waitFor(() =>
    expect((productInput as HTMLInputElement).value).toBe(
      "Producto página uno",
    ),
  );
  expect(await screen.findByText(/página 1 de 2/)).toBeTruthy();

  const nextPage = screen
    .getAllByRole("button")
    .find((button) => button.textContent?.trim() === "2");
  expect(nextPage).toBeTruthy();
  fireEvent.click(nextPage!);
  expect(await screen.findByText(/página 2 de 2/)).toBeTruthy();
  expect((productInput as HTMLInputElement).value).toBe("Producto página uno");
});

it("invalida resultados anteriores inmediatamente al cambiar el término bruto", async () => {
  const runtime = renderEditor();
  expect(await screen.findByText(/página 1 de 2/)).toBeTruthy();
  const productInput = await screen.findByRole("combobox", {
    name: "Producto",
  });
  const user = userEvent.setup({ delay: 1 });
  fireEvent.click(productInput);
  await user.type(productInput, "nuevo término");
  expect(
    screen.queryByRole("option", { name: "Producto página uno" }),
  ).toBeNull();
  await waitFor(() =>
    expect(runtime.catalog.listProducts).toHaveBeenCalledWith(
      "nuevo término",
      1,
      20,
      expect.any(AbortSignal),
    ),
  );
});
