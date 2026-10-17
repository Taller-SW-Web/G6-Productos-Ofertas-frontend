import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/oswald/latin-700.css";
import { theme, cssVariablesResolver } from "./theme/theme";
import "./theme/global.css";
import { App } from "./app/App";
import { createPricingRuntime } from "./features/pricing/services/pricingService";
import { PricingProvider } from "./features/pricing/components/PricingProvider";
import { resolveDataMode } from "./app/config/dataMode";
import { DataModeContext } from "./app/config/DataModeContext";
import { createCombosRuntime } from "./features/combos/services/combosService";
import { CombosProvider } from "./features/combos/components/CombosProvider";

const root = createRoot(document.getElementById("root")!);
async function start() {
  const mode = resolveDataMode(
    import.meta.env.VITE_DATA_MODE,
    import.meta.env.DEV,
  );
  const runtime = await createPricingRuntime(mode);
  const combosRuntime = await createCombosRuntime(mode);
  root.render(
    <StrictMode>
      <MantineProvider
        theme={theme}
        cssVariablesResolver={cssVariablesResolver}
        forceColorScheme="light"
      >
        <DataModeContext.Provider value={mode}>
          <PricingProvider runtime={runtime}>
            <CombosProvider mode={mode} runtime={combosRuntime}>
              <App />
            </CombosProvider>
          </PricingProvider>
        </DataModeContext.Provider>
      </MantineProvider>
    </StrictMode>,
  );
}
void start().catch((error: unknown) =>
  root.render(
    <div role="alert">
      {error instanceof Error
        ? error.message
        : "No se pudo iniciar la aplicación."}
    </div>,
  ),
);
