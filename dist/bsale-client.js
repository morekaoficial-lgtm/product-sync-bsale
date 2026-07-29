import { config } from "./config.js";
import { logger } from "./logger.js";
const BSALE_API_BASE = "https://api.bsale.io/v1";
const BSALE_API_V2 = "https://api.bsale.io/v2";
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
class BsaleClient {
    headers = {
        "Content-Type": "application/json",
        access_token: config.bsale.accessToken,
    };
    // Cache de productId web por SKU (para actualizaciones inmediatas)
    webProductIdCache = new Map();
    /** Guardar ID de producto web en cache */
    cacheWebProductId(sku, webProductId) {
        this.webProductIdCache.set(sku, webProductId);
    }
    /** Obtener ID de producto web del cache */
    getCachedWebProductId(sku) {
        return this.webProductIdCache.get(sku);
    }
    /** Buscar variante por código (SKU) */
    async findVariantByCode(code) {
        const url = `${BSALE_API_BASE}/variants.json?code=${encodeURIComponent(code)}`;
        try {
            const res = await fetchWithTimeout(url, { headers: this.headers });
            if (!res.ok) {
                logger.error("Bsale findVariant error", { code, status: res.status });
                return null;
            }
            const data = await res.json();
            const variant = data.items?.[0] || null;
            if (variant) {
                logger.info("Bsale variant found", { code, variantId: variant.id, productId: variant.productId, keys: Object.keys(variant).slice(0, 10) });
            }
            return variant;
        }
        catch (err) {
            logger.error("Bsale findVariant timeout/error", { code, error: err.message });
            return null;
        }
    }
    /** Buscar descripción web por código de variante (API v2) */
    async findWebProductByCode(code) {
        // 1. Revisar cache primero
        const cachedId = this.webProductIdCache.get(code);
        if (cachedId) {
            logger.info("Bsale web product found in cache", { code, webProductId: cachedId });
            return { id: cachedId };
        }
        // 2. Endpoint v2 para listar productos web por código de variante
        const url = `${BSALE_API_V2}/products/list/market_info.json?code=${encodeURIComponent(code)}`;
        try {
            const res = await fetchWithTimeout(url, { headers: this.headers });
            if (!res.ok) {
                logger.error("Bsale findWebProduct error", { code, status: res.status });
                return null;
            }
            const data = await res.json();
            // La respuesta v2 tiene formato: { code: "200", data: [ {...} ], count: 1 }
            const items = data.data || data.items || [];
            if (items.length > 0) {
                logger.info("Bsale web product found", { code, webProductId: items[0].id });
            }
            return items[0] || null;
        }
        catch (err) {
            logger.error("Bsale findWebProduct timeout/error", { code, error: err.message });
            return null;
        }
    }
    /** Crear descripción web */
    async createWebProduct(payload) {
        const url = `${BSALE_API_V2}/products/market_info.json`;
        logger.info("Bsale createWebProduct payload", { payload });
        try {
            const res = await fetchWithTimeout(url, {
                method: "POST",
                headers: this.headers,
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const text = await res.text();
                logger.error("Bsale createWebProduct error", { status: res.status, text });
                return null;
            }
            const data = await res.json();
            // La respuesta tiene formato: { code: 200, data: { id: 57, ... } }
            const webProduct = data.data || data;
            logger.info("Bsale createWebProduct success", { webProductId: webProduct?.id });
            return webProduct;
        }
        catch (err) {
            logger.error("Bsale createWebProduct timeout/error", { error: err.message });
            return null;
        }
    }
    /** Actualizar descripción web */
    async updateWebProduct(webProductId, payload) {
        const url = `${BSALE_API_V2}/products/market_info/${webProductId}.json`;
        try {
            const res = await fetchWithTimeout(url, {
                method: "PUT",
                headers: this.headers,
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const text = await res.text();
                logger.error("Bsale updateWebProduct error", { webProductId, status: res.status, text });
                return false;
            }
            return true;
        }
        catch (err) {
            logger.error("Bsale updateWebProduct timeout/error", { webProductId, error: err.message });
            return false;
        }
    }
    /** Activar descripción web (state: 0 → 1) */
    async activateWebProduct(webProductId) {
        return this.updateWebProduct(webProductId, { state: 1 });
    }
    /** Asignar producto a una colección */
    async addProductToCollection(collectionId, sku) {
        const url = `${BSALE_API_BASE}/collections/${collectionId}/products.json`;
        try {
            const res = await fetchWithTimeout(url, {
                method: "POST",
                headers: this.headers,
                body: JSON.stringify({ code: sku }),
            });
            if (!res.ok) {
                const text = await res.text();
                logger.error("Bsale addProductToCollection error", { collectionId, sku, status: res.status, text });
                return false;
            }
            logger.info("Bsale addProductToCollection success", { collectionId, sku });
            return true;
        }
        catch (err) {
            logger.error("Bsale addProductToCollection timeout/error", { collectionId, sku, error: err.message });
            return false;
        }
    }
    /** Obtener colecciones de un producto */
    async getProductCollections(productId) {
        const url = `${BSALE_API_V2}/products/${productId}/collections.json`;
        try {
            const res = await fetchWithTimeout(url, { headers: this.headers });
            if (!res.ok) {
                logger.error("Bsale getProductCollections error", { productId, status: res.status });
                return [];
            }
            const data = await res.json();
            return data.data || data.items || [];
        }
        catch (err) {
            logger.error("Bsale getProductCollections timeout/error", { productId, error: err.message });
            return [];
        }
    }
}
export const bsaleClient = new BsaleClient();
