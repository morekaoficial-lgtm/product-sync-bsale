import { config } from "./config.js";
import { logger } from "./logger.js";

const API_VERSION = "2025-10";

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
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) {
      logger.error("Shopify getProduct error", { productId, status: res.status });
      return null;
    }
    const data = await res.json();
    return data.product;
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
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const edges = data?.data?.productVariants?.edges || [];
    return edges[0]?.node?.product || null;
  }
}

export const shopifyClient = new ShopifyClient();
