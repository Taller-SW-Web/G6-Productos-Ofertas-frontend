// @vitest-environment jsdom
import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ obtener: vi.fn(), solicitar: vi.fn(), tracking: { estado: "pendiente", operacionId: "op-1", mensaje: "En curso", registrar: vi.fn(), reintentar: vi.fn() } }));
vi.mock("../services/categoryService", () => ({ categoryService: { obtener: mocks.obtener, solicitarBaja: mocks.solicitar } }));
vi.mock("../services/brandService", () => ({ brandService: { obtener: mocks.obtener, solicitarBaja: mocks.solicitar } }));
vi.mock("../hooks/useSeguimientoBaja", () => ({ useSeguimientoBaja: () => mocks.tracking }));
import { BrandDetailPage } from "../pages/BrandDetailPage";
import { DeactivateCategoryPage } from "../pages/DeactivateCategoryPage";

Object.defineProperty(window, "matchMedia", { writable: true, value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }) });
beforeEach(() => { mocks.obtener.mockReset(); mocks.solicitar.mockReset(); mocks.tracking.estado = "pendiente"; mocks.tracking.mensaje = "En curso"; });
afterEach(cleanup);

it.each(["marca", "categoria"] as const)("%s recarga el detalle confirmado y muestra el estado autoritativo", async (tipo) => {
  const activo = tipo === "marca" ? { marcaId: "id-1", nombre: "Entidad", estado: "Activo", version: 1 } : { id: "id-1", nombre: "Entidad", estado: "Activo", slug: "entidad", nivel: 1, orden: 0, version: 1, hijas: [] };
  mocks.obtener.mockResolvedValueOnce(activo).mockResolvedValueOnce({ ...activo, estado: "Inactivo" });
  const ruta = tipo === "marca" ? "/marcas/id-1" : "/categorias/id-1/desactivar";
  const patron = tipo === "marca" ? "/marcas/:id" : "/categorias/:id/desactivar";
  const contenido = () => <MantineProvider><MemoryRouter initialEntries={[ruta]}><Routes><Route path={patron} element={tipo === "marca" ? <BrandDetailPage /> : <DeactivateCategoryPage />} /></Routes></MemoryRouter></MantineProvider>;
  const ui = render(contenido());
  await screen.findByText("Activo");
  mocks.tracking.estado = "confirmada"; mocks.tracking.mensaje = "Confirmada";
  ui.rerender(contenido());
  await waitFor(() => expect(mocks.obtener).toHaveBeenCalledTimes(2));
  expect(await screen.findByText("Inactivo")).toBeTruthy();
  expect(screen.getByText("Confirmada")).toBeTruthy();
});

it.each(["marca", "categoria"] as const)("%s conserva la confirmación si recargar detalle falla", async (tipo) => {
  const activo = tipo === "marca" ? { marcaId: "id-1", nombre: "Entidad", estado: "Activo", version: 1 } : { id: "id-1", nombre: "Entidad", estado: "Activo", slug: "entidad", nivel: 1, orden: 0, version: 1, hijas: [] };
  mocks.obtener.mockResolvedValueOnce(activo).mockRejectedValueOnce(new Error("HTTP 503"));
  const ruta = tipo === "marca" ? "/marcas/id-1" : "/categorias/id-1/desactivar";
  const patron = tipo === "marca" ? "/marcas/:id" : "/categorias/:id/desactivar";
  const contenido = () => <MantineProvider><MemoryRouter initialEntries={[ruta]}><Routes><Route path={patron} element={tipo === "marca" ? <BrandDetailPage /> : <DeactivateCategoryPage />} /></Routes></MemoryRouter></MantineProvider>;
  const ui = render(contenido());
  await screen.findByText("Activo");
  mocks.tracking.estado = "confirmada"; mocks.tracking.mensaje = "Confirmada";
  ui.rerender(contenido());
  expect(await screen.findByText("HTTP 503")).toBeTruthy();
  expect(screen.getByText("Confirmada")).toBeTruthy();
  expect(screen.queryByText("Activo")).toBeNull();
  expect(mocks.obtener).toHaveBeenCalledTimes(2);
  expect(mocks.solicitar).not.toHaveBeenCalled();
});

it.each(["marca", "categoria"] as const)("%s conserva el detalle activo cuando la baja se rechaza", async (tipo) => {
  const activo = tipo === "marca" ? { marcaId: "id-1", nombre: "Entidad", estado: "Activo", version: 1 } : { id: "id-1", nombre: "Entidad", estado: "Activo", slug: "entidad", nivel: 1, orden: 0, version: 1, hijas: [] };
  mocks.obtener.mockResolvedValue(activo);
  const ruta = tipo === "marca" ? "/marcas/id-1" : "/categorias/id-1/desactivar";
  const patron = tipo === "marca" ? "/marcas/:id" : "/categorias/:id/desactivar";
  const contenido = () => <MantineProvider><MemoryRouter initialEntries={[ruta]}><Routes><Route path={patron} element={tipo === "marca" ? <BrandDetailPage /> : <DeactivateCategoryPage />} /></Routes></MemoryRouter></MantineProvider>;
  const ui = render(contenido());
  await screen.findByText("Activo");
  mocks.tracking.estado = "rechazada"; mocks.tracking.mensaje = "Rechazada";
  ui.rerender(contenido());
  expect(screen.getByText("Activo")).toBeTruthy();
  expect(screen.getByText("Rechazada")).toBeTruthy();
  expect(mocks.obtener).toHaveBeenCalledTimes(1);
});
