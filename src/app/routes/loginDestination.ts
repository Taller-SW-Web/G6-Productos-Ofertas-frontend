import { matchRoutes } from "react-router-dom";
import { productRoutes } from "./productRoutes";

// Only registered administrative paths. Never use arbitrary URLs or public demos.
export function loginDestination(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return "/productos";
  try {
    const url = new URL(value, "https://internal.invalid");
    if (url.origin !== "https://internal.invalid" || !matchRoutes(productRoutes, url.pathname)) return "/productos";
    return url.pathname + url.search + url.hash;
  } catch { return "/productos"; }
}
