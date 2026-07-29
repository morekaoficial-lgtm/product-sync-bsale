import { bsaleClient } from "./bsale-client.js";
import { shopifyClient } from "./shopify-client.js";
import { logger } from "./logger.js";

export interface SyncResult {
  success: boolean;
  sku: string;
  message: string;
  bsaleWebProductId?: number;
  created?: boolean;
  activated?: boolean;
}

class SyncService {
  async syncBySKU(sku: string): Promise<SyncResult> {
    logger.info("Iniciando sync por SKU", { sku });

    // 1. Buscar variante en Bsale
    const variant = await bsaleClient.findVariantByCode(sku);
    if (!variant) {
      return { success: false, sku, message: "SKU no encontrado en Bsale" };
    }

    // Verificar que tenemos productId (puede estar en variant.product o variant.productId)
    const productId = variant.product?.id || variant.productId || variant.product_id;
    if (!productId) {
      logger.error("Variante encontrada pero sin productId", { 
        sku, 
        variantKeys: Object.keys(variant),
        product: variant.product
      });
      return { success: false, sku, message: "Variante sin productId asociado en Bsale" };
    }
    
    logger.info("Variante válida encontrada", { sku, variantId: variant.id, productId });

    // 2. Buscar descripción web existente
    let webProduct = await bsaleClient.findWebProductByCode(sku);

    // 3. Buscar producto en Shopify para obtener datos
    let description = "";
    let images: string[] = [];
    let title = variant.name || sku;

    try {
      const shopifyProduct = await shopifyClient.findProductBySKU(sku);
      if (shopifyProduct) {
        description = shopifyProduct.descriptionHtml || shopifyProduct.body_html || "";
        images = shopifyProduct.images?.edges?.map((e: any) => e.node.src) || [];
        title = shopifyProduct.title || title;
      } else {
        logger.warn("Producto no encontrado en Shopify, usando datos de Bsale", { sku });
      }
    } catch (err: any) {
      logger.warn("Error buscando en Shopify, usando datos de Bsale", { sku, error: err.message });
    }

    // 4. Construir payload
    const pictures = images.map((url: string, idx: number) => ({
      href: url,
      legendImage: "",
      order: idx,
    }));

    const payload = {
      productId: productId,
      idVariantDefault: variant.id,
      name: title,
      description: description,
      urlImg: images[0] || "",
      pictures: pictures,
      state: 1,
      productType: "normal",
      variantShippingAll: 1,
      displayNotice: 0,
      displayQuantity: 0,
      displayUnit: 0,
    };

    // 5. Crear si no existe
    if (!webProduct) {
      logger.info("Descripción web no existe, creando...", { sku, productId });
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
