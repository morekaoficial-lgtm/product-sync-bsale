import { config } from "./config.js";
import { logger } from "./logger.js";

const API_VERSION = "2025-01";
const REQUEST_TIMEOUT = 10000; // 10 segundos

/** Helper: fetch con timeout */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

class ShopifyClient {
  private shopDomain: string;
  private accessToken: string;

  constructor() {
    this.shopDomain = config.shopify.shopDomain.endsWith(".myshopify.com")
      ? config.shopify.shopDomain
      : `${config.shopify.shopDomain}.myshopify.com`;
    this.accessToken = config.shopify.accessToken;
  }

  private headers() {
    return {
      "X-Shopify-Access-Token": this.accessToken,
      "Content-Type": "application/json",
    };
  }

  /** Obtener producto por ID (con imágenes y descripción) */
  async getProduct(productId: number): Promise<any | null> {
    const url = `https://${this.shopDomain}/admin/api/${API_VERSION}/products/${productId}.json`;
    try {
      const res = await fetchWithTimeout(url, { headers: this.headers() });
      if (!res.ok) {
        logger.error("Shopify getProduct error", { productId, status: res.status });
        return null;
      }
      const data = await res.json();
      return data.product;
    } catch (err: any) {
      logger.error("Shopify getProduct timeout/error", { productId, error: err.message });
      return null;
    }
  }

  /** Buscar producto por SKU vía GraphQL */
  async findProductBySKU(sku: string): Promise<any | null> {
    const query = `
      query {
        productVariants(first: 10, query: "sku:${sku}") {
          edges {
            node {
              id
              sku
              product { id title descriptionHtml images(first: 10) { edges { node { src altText } } } }
            }
          }
        }
      }
    `;
    const url = `https://${this.shopDomain}/admin/api/${API_VERSION}/graphql.json`;
    try {
      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ query }),
      });
      if (!res.ok) {
        logger.error("Shopify findProductBySKU error", { sku, status: res.status });
        return null;
      }
      const data = await res.json();
      if (data.errors) {
        logger.error("Shopify GraphQL errors", { sku, errors: data.errors });
        return null;
      }
      const edges = data?.data?.productVariants?.edges || [];
      return edges[0]?.node?.product || null;
    } catch (err: any) {
      logger.error("Shopify findProductBySKU timeout/error", { sku, error: err.message });
      return null;
    }
  }
}

export const shopifyClient = new ShopifyClient();
