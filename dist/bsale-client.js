import { config } from "./config.js";
import { logger } from "./logger.js";
const BSALE_API_BASE = "https://api.bsale.io/v1";
const BSALE_API_V2 = "https://api.bsale.io/v2";
class BsaleClient {
    headers = {
        "Content-Type": "application/json",
        access_token: config.bsale.accessToken,
    };
    /** Buscar variante por código (SKU) */
    async findVariantByCode(code) {
        const url = `${BSALE_API_BASE}/variants.json?code=${encodeURIComponent(code)}`;
        const res = await fetch(url, { headers: this.headers });
        if (!res.ok) {
            logger.error("Bsale findVariant error", { code, status: res.status });
            return null;
        }
        const data = await res.json();
        return data.items?.[0] || null;
    }
    /** Buscar descripción web por código de variante */
    async findWebProductByCode(code) {
        const url = `${BSALE_API_BASE}/products/market_info.json?code=${encodeURIComponent(code)}`;
        const res = await fetch(url, { headers: this.headers });
        if (!res.ok) {
            logger.error("Bsale findWebProduct error", { code, status: res.status });
            return null;
        }
        const data = await res.json();
        return data.items?.[0] || null;
    }
    /** Obtener variantes de un producto */
    async getProductVariants(productId) {
        const url = `${BSALE_API_BASE}/products/${productId}/variants.json`;
        const res = await fetch(url, { headers: this.headers });
        if (!res.ok)
            return [];
        const data = await res.json();
        return data.items || [];
    }
    /** Crear descripción web */
    async createWebProduct(payload) {
        const url = `${BSALE_API_V2}/products/market_info.json`;
        const res = await fetch(url, {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const text = await res.text();
            logger.error("Bsale createWebProduct error", { status: res.status, text });
            return null;
        }
        return res.json();
    }
    /** Actualizar descripción web */
    async updateWebProduct(webProductId, payload) {
        const url = `${BSALE_API_V2}/products/market_info/${webProductId}.json`;
        const res = await fetch(url, {
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
    /** Activar descripción web (state: 0 → 1) */
    async activateWebProduct(webProductId) {
        return this.updateWebProduct(webProductId, { state: 1 });
    }
    /** Obtener tipos de producto */
    async getProductTypes() {
        const url = `${BSALE_API_V2}/product_types.json`;
        const res = await fetch(url, { headers: this.headers });
        if (!res.ok)
            return [];
        const data = await res.json();
        return data.items || [];
    }
}
export const bsaleClient = new BsaleClient();
