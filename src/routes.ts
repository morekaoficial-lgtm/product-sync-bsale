import { Router } from "express";
import { syncService } from "./sync-service.js";
import { logger } from "./logger.js";

const router = Router();

/**
 * POST /webhook/shopify
 * Recibe webhooks de Shopify cuando un producto se crea o actualiza.
 * Body: { id, title, body_html, variants: [{ sku }], images: [{ src }] }
 */
router.post("/shopify", async (req, res) => {
  try {
    const product = req.body;
    const variants = product.variants || [];

    if (!variants.length) {
      return res.status(400).json({ success: false, message: "No variants in payload" });
    }

    const results = [];
    for (const variant of variants) {
      const sku = variant.sku;
      if (!sku) continue;

      logger.info("Webhook Shopify recibido", { sku, productId: product.id });
      const result = await syncService.syncBySKU(sku);
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

export default router;
