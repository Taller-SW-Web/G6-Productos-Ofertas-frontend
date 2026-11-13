export function adminPriceDefinition(price: Record<string, unknown>) {
  return {
    productId: price.sku == null ? price.product_id ?? null : null,
    sku: price.sku ?? null,
    channelId: price.channel_id,
    priceVersion: price.price_version,
    vigenciaActual: {
      precioRegular: price.precio_regular,
      precioOferta: price.precio_oferta,
      currency: price.currency,
      validFrom: price.valid_from,
      validUntil: price.valid_until,
    },
  };
}

export async function withAdminPriceDefinition(path: string, response: Response): Promise<Response> {
  if (!path.startsWith("/api/v1/precios/administracion/") || response.status !== 200) return response;
  const dto: unknown = await response.clone().json().catch(() => null);
  if (!dto || typeof dto !== "object" || !("precio_regular" in dto)) return response;
  return new Response(JSON.stringify(adminPriceDefinition(dto as Record<string, unknown>)), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
