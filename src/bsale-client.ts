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

  /** Buscar variante por código (SKU) */
  async findVariantByCode(code: string): Promise<any | null> {
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
    } catch (err: any) {
      logger.error("Bsale findVariant timeout/error", { code, error: err.message });
      return null;
    }
  }

  /** Buscar descripción web por código de variante */
  async findWebProductByCode(code: string): Promise<any | null> {
    const url = `${BSALE_API_BASE}/products/market_info.json?code=${encodeURIComponent(code)}`;
    try {
      const res = await fetchWithTimeout(url, { headers: this.headers });
      if (!res.ok) {
        logger.error("Bsale findWebProduct error", { code, status: res.status });
        return null;
      }
      const data = await res.json();
      return data.items?.[0] || null;
    } catch (err: any) {
      logger.error("Bsale findWebProduct timeout/error", { code, error: err.message });
      return null;
    }
  }

  /** Crear descripción web */
  async createWebProduct(payload: any): Promise<any | null> {
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
      return res.json();
    } catch (err: any) {
      logger.error("Bsale createWebProduct timeout/error", { error: err.message });
      return null;
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
}

export const bsaleClient = new BsaleClient();
