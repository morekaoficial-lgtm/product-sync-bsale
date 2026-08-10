import { Router } from "express";
import { syncService, syncHistory } from "./sync-service.js";
import { shopifyClient } from "./shopify-client.js";
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
 * POST /sync/shopify-id
 * Sincronización manual por ID de producto de Shopify.
 * Body: { shopifyId: string | number }
 */
router.post("/shopify-id", async (req, res) => {
  try {
    const { shopifyId } = req.body;
    if (!shopifyId) {
      return res.status(400).json({ success: false, message: "shopifyId es requerido" });
    }

    logger.info("Sync manual por Shopify ID solicitado", { shopifyId });

    // 1. Buscar producto en Shopify por ID
    const shopifyProduct = await shopifyClient.getProduct(Number(shopifyId));
    if (!shopifyProduct) {
      return res.status(404).json({ success: false, message: `Producto ${shopifyId} no encontrado en Shopify` });
    }

    // 2. Extraer datos
    const shopifyDetails = {
      title: shopifyProduct.title || "",
      descriptionHtml: shopifyProduct.body_html || "",
      images: (shopifyProduct.images || []).map((img: any) => img.src).filter(Boolean),
    };

    const variants = shopifyProduct.variants || [];
    if (!variants.length) {
      return res.status(400).json({ success: false, message: "El producto no tiene variantes" });
    }

    // 3. Sync cada variant por SKU
    const results = [];
    for (const variant of variants) {
      const sku = variant.sku;
      if (!sku) continue;

      const result = await syncService.syncBySKUWithDetails(sku, shopifyDetails);
      results.push(result);
    }

    const successCount = results.filter((r) => r.success).length;
    res.json({
      success: successCount > 0,
      shopifyId,
      title: shopifyDetails.title,
      total: results.length,
      successCount,
      results,
    });
  } catch (error: any) {
    logger.error("Error en sync por Shopify ID", { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
