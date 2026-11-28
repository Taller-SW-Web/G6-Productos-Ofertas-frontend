// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import { RouteErrorPage } from "../../app/routes/RouteErrorPage";

Object.defineProperty(window, "matchMedia", { value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
afterEach(() => { cleanup(); sessionStorage.clear(); });

it("INV-06 / PRI-03 presenta recuperación manual sin borrar borrador ni destino", async () => {
  sessionStorage.setItem("test:draft", "edición local");
  const router = createMemoryRouter([{
    path: "/precios",
    loader: () => { throw new Error("Failed to fetch dynamically imported module: old.js"); },
    element: createElement("p", null, "Contenido"),
    errorElement: createElement(RouteErrorPage),
  }], { initialEntries: ["/precios?canal=marketplace"] });
  render(createElement(MantineProvider, null, createElement(RouterProvider, { router })));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Hay una nueva versión disponible" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Recargar pantalla" })).toBeTruthy();
  expect(screen.queryByText(/old\.js/)).toBeNull();
  expect(router.state.location.pathname + router.state.location.search).toBe("/precios?canal=marketplace");
  expect(sessionStorage.getItem("test:draft")).toBe("edición local");
});
