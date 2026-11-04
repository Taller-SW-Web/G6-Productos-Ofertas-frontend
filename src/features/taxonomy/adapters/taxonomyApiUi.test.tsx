// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import { DataModeContext } from "../../../app/config/DataModeContext";
import {
  configureTaxonomyGateway,
  TaxonomySessionRequiredError,
} from "../services/taxonomyGatewayRuntime";
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
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it.each([401, 403, 500, 503])(
  "muestra HTTP %s en la interfaz sin sustituir la respuesta por fixtures",
  async (status) => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status }));
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
    expect(await screen.findByText(new RegExp(`HTTP ${status}`))).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(1);
  },
);

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

it("identifica los datos locales de referencia en modo mock", () => {
  const request = vi.fn();
  configureTaxonomyGateway({ request });
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
  expect(screen.getByText("Datos de ejemplo")).toBeTruthy();
  expect(screen.getByText("contenido mock")).toBeTruthy();
});

it("no requiere sesión HTTP ni consulta Gateway en modo mock", async () => {
  const request = vi.fn();
  configureTaxonomyGateway({ request });
  render(
    <MantineProvider>
      <DataModeContext.Provider value="mock">
        <MemoryRouter>
          <ProductTypeListPage />
        </MemoryRouter>
      </DataModeContext.Provider>
    </MantineProvider>,
  );
  expect(await screen.findByText("Calzado deportivo")).toBeTruthy();
  expect(request).not.toHaveBeenCalled();
});

it("muestra la falta de sesión en modo API y no recurre a fixtures", async () => {
  const request = vi.fn(async () => {
    throw new TaxonomySessionRequiredError();
  });
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
  expect(await screen.findByText(/Inicia sesión en Promociones/)).toBeTruthy();
  expect(request).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("Calzado deportivo")).toBeNull();
});
