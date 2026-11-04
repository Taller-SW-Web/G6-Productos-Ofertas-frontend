// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import { DataModeContext } from "../../../app/config/DataModeContext";
import { configureTaxonomyGateway } from "../services/taxonomyGatewayRuntime";
import { ProductTypeListPage } from "../pages/ProductTypeListPage";
import { TaxonomyModeGate } from "../../../app/config/TaxonomyModeGate";
vi.mock("../../shared/useMockStateRevision", () => ({
  useMockStateRevision: () => 0,
}));
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
afterEach(cleanup);
it("muestra 403 en la interfaz sin sustituir la respuesta por fixtures", async () => {
  const request = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 403 }));
  configureTaxonomyGateway({ request });
  render(
    <MantineProvider>
      <DataModeContext.Provider value="api">
        <MemoryRouter>
          <ProductTypeListPage />
        </MemoryRouter>
      </DataModeContext.Provider>
    </MantineProvider>,
  );
  expect(await screen.findByText(/HTTP 403/)).toBeTruthy();
  expect(request).toHaveBeenCalledTimes(1);
});

it("el gate abre solo la pantalla con adaptador HTTP y mantiene las demás bloqueadas", () => {
  configureTaxonomyGateway({ request: vi.fn() });
  const view = render(
    <MantineProvider>
      <DataModeContext.Provider value="api">
        <MemoryRouter initialEntries={["/caracteristicas"]}>
          <TaxonomyModeGate>
            <span>contenido habilitado</span>
          </TaxonomyModeGate>
        </MemoryRouter>
      </DataModeContext.Provider>
    </MantineProvider>,
  );
  expect(
    screen.getByText("Esta función no está disponible en el modo actual."),
  ).toBeTruthy();
  view.unmount();
  render(
    <MantineProvider>
      <DataModeContext.Provider value="api">
        <MemoryRouter initialEntries={["/tipos-producto"]}>
          <TaxonomyModeGate>
            <span>contenido habilitado</span>
          </TaxonomyModeGate>
        </MemoryRouter>
      </DataModeContext.Provider>
    </MantineProvider>,
  );
  expect(screen.getByText("contenido habilitado")).toBeTruthy();
});

it("identifica el mock de Taxonomía como datos simulados", () => {
  render(
    <MantineProvider>
      <DataModeContext.Provider value="mock">
        <MemoryRouter initialEntries={["/categorias"]}>
          <TaxonomyModeGate>
            <span>contenido mock</span>
          </TaxonomyModeGate>
        </MemoryRouter>
      </DataModeContext.Provider>
    </MantineProvider>,
  );
  expect(screen.getByText("Datos simulados")).toBeTruthy();
  expect(screen.getByText("contenido mock")).toBeTruthy();
});
