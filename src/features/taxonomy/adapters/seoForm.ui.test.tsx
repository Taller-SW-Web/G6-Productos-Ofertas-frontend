// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SeoConflictError } from "../services/seoRepository";

const api = vi.hoisted(() => ({ obtener: vi.fn(), guardar: vi.fn(), historial: vi.fn(), proponerSlug: vi.fn() }));
vi.mock("../services/seoService", () => ({ seoService: api }));
import { SeoConfigPage } from "../pages/SeoConfigPage";

Object.defineProperty(window, "matchMedia", { writable: true, value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }) });
Object.defineProperty(document, "fonts", { configurable: true, value: { addEventListener: () => {}, removeEventListener: () => {} } });
beforeEach(() => {
  vi.clearAllMocks();
  api.obtener.mockResolvedValue({ id: "cat-1", nombre: "Categoría", slug: "slug-inicial", metaTitulo: "Título", metaDescripcion: "Descripción" });
  api.historial.mockResolvedValue([{ slugAnterior: "anterior", slugActual: "slug-inicial", fecha: "2026-01-01T00:00:00Z" }]);
});
afterEach(cleanup);
function abrir() {
  render(<MantineProvider><MemoryRouter initialEntries={["/seo/cat-1"]}><Routes><Route path="/seo/:id" element={<SeoConfigPage />} /></Routes></MemoryRouter></MantineProvider>);
}

it("valida el slug y no envía valores inválidos", async () => {
  const user = userEvent.setup(); abrir();
  const slug = await screen.findByLabelText("Slug (editable)");
  await user.clear(slug); await user.type(slug, "Slug inválido!");
  await user.click(screen.getByRole("button", { name: "Guardar" }));
  expect(screen.getByText(/Usa letras minúsculas/)).toBeTruthy();
  expect(api.guardar).not.toHaveBeenCalled();
  expect((slug as HTMLInputElement).value).toBe("Slug inválido!");
});

it.each(["conflicto", "red"])("conserva los datos ante error de %s y muestra historial recibido", async (tipo) => {
  const user = userEvent.setup();
  api.guardar.mockRejectedValue(tipo === "conflicto" ? new SeoConflictError("slug-editado") : new Error("Red no disponible"));
  abrir();
  const slug = await screen.findByLabelText("Slug (editable)");
  expect(await screen.findByText(/anterior → slug-inicial/)).toBeTruthy();
  await user.clear(slug); await user.type(slug, "slug-editado");
  await user.click(screen.getByRole("button", { name: "Guardar" }));
  expect(await screen.findByText(tipo === "conflicto" ? /Conflicto de slug/ : /No se pudieron guardar/)).toBeTruthy();
  expect((slug as HTMLInputElement).value).toBe("slug-editado");
});
