// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SeguimientoBaja } from "../components/SeguimientoBaja";
import { DeactivateCategoryPage } from "../pages/DeactivateCategoryPage";

vi.mock("../hooks/useCategoryDetail", () => ({ useCategoryDetail: () => ({ state: { status: "error", message: "HTTP 503" } }) }));
vi.mock("../hooks/useSeguimientoBaja", () => ({ useSeguimientoBaja: () => ({ estado: "pendiente", mensaje: "Seguimiento recuperado", operacionId: "op-1", registrar: vi.fn(), reintentar: vi.fn() }) }));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
});
afterEach(cleanup);

it("permite consultar nuevamente con teclado y anuncia el error", async () => {
  const reintentar = vi.fn();
  const user = userEvent.setup();
  render(<MantineProvider><SeguimientoBaja seguimiento={{ estado: "error", mensaje: "HTTP 503", operacionId: "op-1", registrar: vi.fn(), reintentar }} /></MantineProvider>);
  expect(screen.getByRole("status").textContent).toContain("HTTP 503");
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Consultar nuevamente" }));
  await user.keyboard("{Enter}");
  expect(reintentar).toHaveBeenCalledOnce();
});

it("mantiene visible la operación recuperada aunque el detalle responda 503", () => {
  render(<MantineProvider><MemoryRouter initialEntries={["/categorias/cat-1/desactivar"]}><Routes><Route path="/categorias/:id/desactivar" element={<DeactivateCategoryPage />} /></Routes></MemoryRouter></MantineProvider>);
  expect(screen.getByText("Seguimiento recuperado")).toBeTruthy();
  expect(screen.getByText("HTTP 503")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Solicitar desactivación" })).toBeNull();
});
