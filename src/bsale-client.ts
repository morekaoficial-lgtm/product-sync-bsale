import { config } from "./config.js";
import { logger } from "./logger.js";

const BSALE_API_BASE = "https://api.bsale.io/v1";
const BSALE_API_V2 = "https://api.bsale.io/v2";
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

class BsaleClient {
  private headers = {
    "Content-Type": "application/json",
    access_token: config.bsale.accessToken,
  };

  // Cache de productId web por SKU (para actualizaciones inmediatas)
  private webProductIdCache = new Map<string, number>();

  /** Guardar ID de producto web en cache */
  cacheWebProductId(sku: string, webProductId: number) {
    this.webProductIdCache.set(sku, webProductId);
  }

  /** Obtener ID de producto web del cache */
  getCachedWebProductId(sku: string): number | undefined {
    return this.webProductIdCache.get(sku);
  }

  /** Buscar variante por código (SKU) — incluye inactivas */
  async findVariantByCode(code: string): Promise<any | null> {
    // 1. Buscar activas primero (state=1)
    let url = `${BSALE_API_BASE}/variants.json?code=${encodeURIComponent(code)}&state=1`;
    try {
      const res = await fetchWithTimeout(url, { headers: this.headers });
      if (res.ok) {
        const data = await res.json();
        const variant = data.items?.[0] || null;
        if (variant) {
          logger.info("Bsale variant found (active)", { code, variantId: variant.id, productId: variant.productId });
          return variant;
        }
      }
    } catch (err: any) {
      logger.error("Bsale findVariant active error", { code, error: err.message });
    }

    // 2. Si no se encontró, buscar inactivas (state=0)
    url = `${BSALE_API_BASE}/variants.json?code=${encodeURIComponent(code)}&state=0`;
    try {
      const res = await fetchWithTimeout(url, { headers: this.headers });
      if (res.ok) {
        const data = await res.json();
        const variant = data.items?.[0] || null;
        if (variant) {
          logger.info("Bsale variant found (inactive)", { code, variantId: variant.id, productId: variant.productId });
          return variant;
        }
      }
    } catch (err: any) {
      logger.error("Bsale findVariant inactive error", { code, error: err.message });
    }

    logger.warn("Bsale variant not found", { code });
    return null;
  }

  /** Buscar descripción web por código de variante (API v2) */
  async findWebProductByCode(code: string): Promise<any | null> {
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
    } catch (err: any) {
      logger.error("Bsale findWebProduct timeout/error", { code, error: err.message });
      return null;
    }
  }

  /** Crear descripción web */
  async createWebProduct(payload: any): Promise<any | null> {
    const url = `${BSALE_API_V2}/products/market_info.json`;
    logger.info("Bsale createWebProduct payload", { payload: JSON.stringify(payload) });
    try {
      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(payload),
      });
      const responseText = await res.text();
      logger.info("Bsale createWebProduct response", { status: res.status, body: responseText });
      
      if (!res.ok) {
        logger.error("Bsale createWebProduct error", { status: res.status, text: responseText });
        return { error: true, status: res.status, message: responseText };
      }
      
      const data = JSON.parse(responseText);
      const webProduct = data.data || data;
      logger.info("Bsale createWebProduct success", { webProductId: webProduct?.id });
      return webProduct;
    } catch (err: any) {
      logger.error("Bsale createWebProduct timeout/error", { error: err.message });
      return { error: true, message: err.message };
    }
  }

  /** Actualizar descripción web */
  async updateWebProduct(webProductId: number, payload: any): Promise<boolean> {
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
    } catch (err: any) {
      logger.error("Bsale updateWebProduct timeout/error", { webProductId, error: err.message });
      return false;
    }
  }

  /** Activar descripción web (state: 0 → 1) */
  async activateWebProduct(webProductId: number): Promise<boolean> {
    return this.updateWebProduct(webProductId, { state: 1 });
  }

  /** Asignar producto a una colección */
  async addProductToCollection(collectionId: number, sku: string): Promise<boolean> {
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
    } catch (err: any) {
      logger.error("Bsale addProductToCollection timeout/error", { collectionId, sku, error: err.message });
      return false;
    }
  }

  /** Obtener colecciones de un producto */
  async getProductCollections(productId: number): Promise<any[]> {
    const url = `${BSALE_API_V2}/products/${productId}/collections.json`;
    try {
      const res = await fetchWithTimeout(url, { headers: this.headers });
      if (!res.ok) {
        logger.error("Bsale getProductCollections error", { productId, status: res.status });
        return [];
      }
      const data = await res.json();
      return data.data || data.items || [];
    } catch (err: any) {
      logger.error("Bsale getProductCollections timeout/error", { productId, error: err.message });
      return [];
    }
  }
}

export const bsaleClient = new BsaleClient();
