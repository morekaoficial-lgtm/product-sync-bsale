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
            if (!sku)
                continue;
            logger.info("Webhook Shopify recibido", { sku, productId: product.id });
            const result = await syncService.syncBySKU(sku);
            results.push(result);
        }
        const successCount = results.filter((r) => r.success).length;
        res.json({ success: successCount > 0, results });
    }
    catch (error) {
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
    }
    catch (error) {
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
    }
    catch (error) {
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
            if (!trimmedSku)
                continue;
            const result = mode === "update"
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
    }
    catch (error) {
        logger.error("Error en sync batch", { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});
export default router;
