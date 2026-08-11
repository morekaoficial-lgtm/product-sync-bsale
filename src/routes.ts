import { Router } from "express";
import { syncService, syncHistory } from "./sync-service.js";
import { logger } from "./logger.js";

const router = Router();

/**
 * GET /api/history
 * Devuelve el historial de sincronizaciones en JSON.
 */
router.get("/history", (_req, res) => {
  res.json(syncHistory);
});

/**
 * POST /webhook/shopify
 * Recibe webhooks de Shopify cuando un producto se crea o actualiza.
 * Usa los datos del payload directamente para evitar llamadas API adicionales.
 */
router.post("/shopify", async (req, res) => {
  try {
    const product = req.body;
    const variants = product.variants || [];

    if (!variants.length) {
      return res.status(400).json({ success: false, message: "No variants in payload" });
    }

    // Extraer datos directamente del payload del webhook (Shopify ya los envia)
    const shopifyDetails = {
      title: product.title || "",
      descriptionHtml: product.body_html || "",
      images: (product.images || []).map((img: any) => img.src).filter(Boolean),
    };

    logger.info("Webhook Shopify recibido", {
      productId: product.id,
      title: shopifyDetails.title,
      variantsCount: variants.length,
      imagesCount: shopifyDetails.images.length,
    });

    const results = [];
    for (const variant of variants) {
      const sku = variant.sku;
      if (!sku) continue;

      logger.info("Procesando variant", { sku, productId: product.id });
      const result = await syncService.syncBySKUWithDetails(sku, shopifyDetails);
      results.push(result);
    }

    const successCount = results.filter((r) => r.success).length;
    res.json({ success: successCount > 0, results });
  } catch (error: any) {
    logger.error("Error en webhook Shopify", { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /sync/sku
 * Sincronización manual por SKU.
 * Body: { sku: string }
 */
router.post("/sku", async (req, res) => {
  try {
    const { sku } = req.body;
    if (!sku) {
      return res.status(400).json({ success: false, message: "sku es requerido" });
    }

    logger.info("Sync manual por SKU solicitado", { sku });
    const result = await syncService.syncBySKU(sku);
    res.status(result.success ? 200 : 404).json(result);
  } catch (error: any) {
    logger.error("Error en sync manual", { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /sync/sku/update
 * Fuerza actualización de un producto que YA tiene descripción web.
 * Body: { sku: string }
 */
router.post("/sku/update", async (req, res) => {
  try {
    const { sku } = req.body;
    if (!sku) {
      return res.status(400).json({ success: false, message: "sku es requerido" });
    }

    logger.info("Actualización forzada por SKU solicitada", { sku });
    const result = await syncService.forceUpdateBySKU(sku);
    res.status(result.success ? 200 : 404).json(result);
  } catch (error: any) {
    logger.error("Error en actualización forzada", { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /sync/batch
 * Sincronización en tanda de múltiples SKUs.
 * Body: { skus: string[], mode?: 'create' | 'update' }
 * Los SKUs pueden venir separados por coma, salto de línea o espacio.
 */
router.post("/batch", async (req, res) => {
  try {
    const { skus, mode = "create" } = req.body;
    if (!skus || !Array.isArray(skus) || skus.length === 0) {
      return res.status(400).json({ success: false, message: "skus (array) es requerido" });
    }

    logger.info("Sync batch iniciado", { count: skus.length, mode });

    const results = [];
    for (const sku of skus) {
      const trimmedSku = sku.trim();
      if (!trimmedSku) continue;

      const result =
        mode === "update"
          ? await syncService.forceUpdateBySKU(trimmedSku)
          : await syncService.syncBySKU(trimmedSku);
      results.push(result);
    }

    const successCount = results.filter((r) => r.success).length;
    res.json({
      success: successCount > 0,
      total: results.length,
      successCount,
      errorCount: results.length - successCount,
      results,
    });
  } catch (error: any) {
    logger.error("Error en sync batch", { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /sync/merge-variants
 * Une múltiples variantes del mismo producto en UNA sola descripción web.
 * Body: { skus: string[], baseSku?: string, title?: string, descriptionHtml?: string, images?: string[] }
 *
 * Ejemplo para audífonos MOREKA BL032:
 * {
 *   "skus": ["78500569379655", "78500572964082"],
 *   "baseSku": "78500569379655",
 *   "title": "AUDÍFONOS INALÁMBRICOS MOREKA BL032",
 *   "descriptionHtml": "...",
 *   "images": ["https://..."]
 * }
 */
router.post("/merge-variants", async (req, res) => {
  try {
    const { skus, baseSku, title, descriptionHtml, images } = req.body;
    if (!skus || !Array.isArray(skus) || skus.length < 2) {
      return res.status(400).json({
        success: false,
        message: "skus (array de mínimo 2 elementos) es requerido",
      });
    }

    logger.info("Merge variants solicitado", { skus, baseSku, count: skus.length });

    const shopifyDetails = {
      title: title || "",
      descriptionHtml: descriptionHtml || "",
      images: images || [],
    };

    const result = await syncService.syncProductWithAllVariants(skus, shopifyDetails, baseSku);
    res.status(result.success ? 200 : 404).json(result);
  } catch (error: any) {
    logger.error("Error en merge variants", { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
