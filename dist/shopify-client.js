import { config } from "./config.js";
import { logger } from "./logger.js";
const API_VERSION = "2025-01";
const REQUEST_TIMEOUT = 10000; // 10 segundos
/** Helper: fetch con timeout */
async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        return res;
    }
    finally {
        clearTimeout(timeout);
    }
}
class ShopifyClient {
    shopDomain;
    accessToken;
    constructor() {
        this.shopDomain = config.shopify.shopDomain.endsWith(".myshopify.com")
            ? config.shopify.shopDomain
            : `${config.shopify.shopDomain}.myshopify.com`;
        this.accessToken = config.shopify.accessToken;
    }
    headers() {
        return {
            "X-Shopify-Access-Token": this.accessToken,
            "Content-Type": "application/json",
        };
    }
    /** Obtener producto por ID (con imágenes y descripción) */
    async getProduct(productId) {
        const url = `https://${this.shopDomain}/admin/api/${API_VERSION}/products/${productId}.json`;
        try {
            const res = await fetchWithTimeout(url, { headers: this.headers() });
            if (!res.ok) {
                logger.error("Shopify getProduct error", { productId, status: res.status });
                return null;
            }
            const data = await res.json();
            return data.product;
        }
        catch (err) {
            logger.error("Shopify getProduct timeout/error", { productId, error: err.message });
            return null;
        }
    }
    /** Buscar producto por SKU vía GraphQL + fallback REST */
    async findProductBySKU(sku) {
        // Intentar GraphQL primero
        const graphqlResult = await this.findProductBySKUGraphQL(sku);
        if (graphqlResult)
            return graphqlResult;
        // Fallback: buscar por REST API
        logger.info("GraphQL no encontro el SKU, intentando REST fallback", { sku });
        const restResult = await this.findProductBySKUREST(sku);
        return restResult;
    }
    /** Buscar por SKU via GraphQL */
    async findProductBySKUGraphQL(sku) {
        // Escapar comillas en el SKU para evitar romper el query GraphQL
        const safeSku = sku.replace(/"/g, '\\"');
        const query = `
      query {
        productVariants(first: 10, query: "sku:${safeSku}") {
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
                logger.error("Shopify GraphQL HTTP error", { sku, status: res.status });
                return null;
            }
            const data = await res.json();
            // LOG completo para debug
            logger.info("Shopify GraphQL raw response", {
                sku,
                hasErrors: !!data.errors,
                errors: data.errors ? JSON.stringify(data.errors).slice(0, 500) : null,
                edgeCount: data?.data?.productVariants?.edges?.length || 0,
            });
            if (data.errors) {
                logger.error("Shopify GraphQL errors", { sku, errors: data.errors });
                return null;
            }
            const edges = data?.data?.productVariants?.edges || [];
            if (edges.length === 0) {
                logger.warn("Shopify GraphQL: no variants found for SKU", { sku });
                return null;
            }
            const product = edges[0]?.node?.product;
            logger.info("Shopify GraphQL: product found", { sku, productId: product?.id, title: product?.title });
            // Normalizar imágenes a formato array simple (igual que REST)
            if (product) {
                const images = product.images?.edges?.map((edge) => ({
                    src: edge.node?.src || "",
                    altText: edge.node?.altText || "",
                })) || [];
                product.images = images;
            }
            return product || null;
        }
        catch (err) {
            logger.error("Shopify GraphQL exception", { sku, error: err.message });
            return null;
        }
    }
    /** Buscar por SKU via REST (fallback) */
    async findProductBySKUREST(sku) {
        try {
            let url = `https://${this.shopDomain}/admin/api/${API_VERSION}/products.json?limit=250&fields=id,title,body_html,images,variants`;
            let page = 1;
            while (url && page <= 20) {
                const res = await fetchWithTimeout(url, { headers: this.headers() });
                if (!res.ok) {
                    logger.error("Shopify REST error", { sku, status: res.status });
                    return null;
                }
                const data = await res.json();
                const products = data.products || [];
                for (const product of products) {
                    for (const variant of product.variants || []) {
                        if (variant.sku === sku) {
                            logger.info("Shopify REST: product found", { sku, productId: product.id, title: product.title });
                            return {
                                id: product.id,
                                title: product.title,
                                descriptionHtml: product.body_html,
                                images: (product.images || []).map((img) => ({ src: img.src, altText: img.alt || "" })),
                            };
                        }
                    }
                }
                // Paginacion via Link header
                const linkHeader = res.headers.get("link");
                const nextMatch = linkHeader?.match(/<([^>]+)>;\s*rel="next"/);
                url = nextMatch ? nextMatch[1] : "";
                page++;
            }
            logger.warn("Shopify REST: product not found after paging", { sku, pages: page - 1 });
            return null;
        }
        catch (err) {
            logger.error("Shopify REST exception", { sku, error: err.message });
            return null;
        }
    }
}
export const shopifyClient = new ShopifyClient();
