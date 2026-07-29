import { bsaleClient } from "./bsale-client.js";
import { shopifyClient } from "./shopify-client.js";
import { logger } from "./logger.js";
class SyncService {
    /**
     * Sincroniza un producto de Shopify a Bsale Web buscando por SKU.
     * 1. Busca SKU en Bsale (variante)
     * 2. Busca si ya tiene descripción web
     * 3. Si no existe → la crea
     * 4. Si está inactiva (state=0) → la activa
     * 5. Si está activa → actualiza imágenes + descripción
     */
    async syncBySKU(sku) {
        logger.info("Iniciando sync por SKU", { sku });
        // 1. Buscar variante en Bsale
        const variant = await bsaleClient.findVariantByCode(sku);
        if (!variant) {
            return { success: false, sku, message: "SKU no encontrado en Bsale" };
        }
        // 2. Buscar descripción web existente
        let webProduct = await bsaleClient.findWebProductByCode(sku);
        // 3. Buscar producto en Shopify para obtener datos
        const shopifyProduct = await shopifyClient.findProductBySKU(sku);
        const description = shopifyProduct?.descriptionHtml || shopifyProduct?.body_html || "";
        const images = shopifyProduct?.images?.edges?.map((e) => e.node.src) || [];
        const title = shopifyProduct?.title || variant.name || sku;
        // 4. Construir payload
        const pictures = images.map((url, idx) => ({
            href: url,
            legendImage: "",
            order: idx,
        }));
        const payload = {
            productId: variant.productId,
            idVariantDefault: variant.id,
            name: title,
            description: description,
            urlImg: images[0] || "",
            pictures: pictures,
            state: 1,
            productType: "normal",
            variantShippingAll: 1,
        };
        // 5. Crear si no existe
        if (!webProduct) {
            logger.info("Descripción web no existe, creando...", { sku, productId: variant.productId });
            const created = await bsaleClient.createWebProduct(payload);
            if (!created) {
                return { success: false, sku, message: "Error creando descripción web en Bsale" };
            }
            return { success: true, sku, message: "Descripción web creada exitosamente", bsaleWebProductId: created.id, created: true };
        }
        // 6. Activar si está inactiva
        if (webProduct.state === 0) {
            logger.info("Descripción web inactiva, activando...", { sku, webProductId: webProduct.id });
            const activated = await bsaleClient.activateWebProduct(webProduct.id);
            if (!activated) {
                return { success: false, sku, message: "Error activando descripción web" };
            }
        }
        // 7. Actualizar imágenes y descripción
        logger.info("Actualizando descripción web", { sku, webProductId: webProduct.id });
        const updated = await bsaleClient.updateWebProduct(webProduct.id, payload);
        if (!updated) {
            return { success: false, sku, message: "Error actualizando descripción web" };
        }
        return {
            success: true,
            sku,
            message: webProduct.state === 0 ? "Descripción web activada y actualizada" : "Descripción web actualizada",
            bsaleWebProductId: webProduct.id,
            activated: webProduct.state === 0,
        };
    }
}
export const syncService = new SyncService();
