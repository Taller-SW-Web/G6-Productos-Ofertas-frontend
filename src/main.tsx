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

const root = createRoot(document.getElementById("root")!);
void createPricingRuntime(import.meta.env.VITE_DATA_MODE ?? "mock").then(
  (runtime) =>
    root.render(
      <StrictMode>
        <MantineProvider
          theme={theme}
          cssVariablesResolver={cssVariablesResolver}
          forceColorScheme="light"
        >
          <PricingProvider runtime={runtime}>
            <App />
          </PricingProvider>
        </MantineProvider>
      </StrictMode>,
    ),
  (error: unknown) =>
    root.render(
      <div role="alert">
        {error instanceof Error
          ? error.message
          : "No se pudo iniciar la aplicación."}
      </div>,
    ),
);
