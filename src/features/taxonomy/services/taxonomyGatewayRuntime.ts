import type { TaxonomyGatewayTransport } from "../adapters/httpProductTypeAdapter";
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
