import type { TaxonomyGatewayTransport } from "../adapters/httpProductTypeAdapter";

export class TaxonomySessionRequiredError extends Error {
  constructor() {
    super("Inicia sesión en Promociones y vuelve a intentar la consulta de Taxonomía.");
    this.name = "TaxonomySessionRequiredError";
  }
}

let gateway: TaxonomyGatewayTransport | undefined;
export function configureTaxonomyGateway(
  transport: TaxonomyGatewayTransport,
): void {
  gateway = transport;
}
export function getTaxonomyGateway(): TaxonomyGatewayTransport | undefined {
  return gateway;
}
export function isTaxonomyGatewayConfigured(): boolean {
  return gateway !== undefined;
}
