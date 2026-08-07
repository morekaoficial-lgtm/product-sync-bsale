import { bsaleClient } from "./bsale-client.js";
import { shopifyClient } from "./shopify-client.js";
import { logger } from "./logger.js";
import { findCollectionByProductName, getCollectionName } from "./collection-config.js";

/**
 * Construye una descripción HTML que incluye las imágenes del producto
 * directamente en el contenido. Esto soluciona el problema de que Bsale
 * no renderiza imágenes subidas por API en la tienda web.
 */
function buildDescriptionWithImages(description: string, images: string[], title: string): string {
  // Limpiar descripción original
  let cleanDescription = description || "";
  
  // Si la descripción no tiene etiquetas HTML básicas, envolverla
  if (!cleanDescription.includes("<")) {
    cleanDescription = `<p>${cleanDescription.replace(/\n/g, "</p><p>")}</p>`;
  }

  // Construir galería de imágenes en HTML
  let imageGallery = "";
  if (images.length > 0) {
    const imageTags = images
      .map(
        (url, idx) =>
          `<img src="${url}" alt="${title} - Imagen ${idx + 1}" style="max-width:100%;height:auto;display:block;margin:10px 0;border-radius:8px;" />`
      )
      .join("");
    
    imageGallery = `
<div class="product-image-gallery" style="margin-top:24px;">
  <h3 style="font-size:18px;margin-bottom:12px;">Galería de Imágenes</h3>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">
    ${imageTags}
  </div>
</div>`;
  }

  return `
<div class="product-description-wrapper">
  <div class="product-description-text">
    ${cleanDescription}
  </div>
  ${imageGallery}
</div>
  `.trim();
}

export interface SyncResult {
  success: boolean;
  sku: string;
  message: string;
  bsaleWebProductId?: number;
  created?: boolean;
  activated?: boolean;
  collectionId?: number | null;
  collectionName?: string | null;
  collectionAssigned?: boolean;
}

export interface SyncHistoryItem extends SyncResult {
  timestamp: string;
}

// Historial en memoria (limitado a 500 entradas)
export const syncHistory: SyncHistoryItem[] = [];
const MAX_HISTORY = 500;

function addToHistory(result: SyncResult) {
  syncHistory.push({ ...result, timestamp: new Date().toISOString() });
  if (syncHistory.length > MAX_HISTORY) {
    syncHistory.shift();
  }
}

class SyncService {
  async syncBySKU(sku: string): Promise<SyncResult> {
    logger.info("Iniciando sync por SKU", { sku });

    // 1. Buscar variante en Bsale
    const variant = await bsaleClient.findVariantByCode(sku);
    if (!variant) {
      const result = { success: false, sku, message: "SKU no encontrado en Bsale" };
      addToHistory(result);
      return result;
    }

    const productId = variant.product?.id || variant.productId || variant.product_id;
    if (!productId) {
      const result = { success: false, sku, message: "Variante sin productId asociado en Bsale" };
      addToHistory(result);
      return result;
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

    // 4. Determinar colección según el nombre del producto
    const collectionId = findCollectionByProductName(title);
    const collectionName = collectionId ? getCollectionName(collectionId) : null;
    logger.info("Colección detectada", { sku, title, collectionId, collectionName });

    // 5. Construir descripción HTML con imágenes incrustadas
    const richDescription = buildDescriptionWithImages(description, images, title);

    // 6. Construir pictures (para compatibilidad, aunque Bsale no las renderiza bien)
    const pictures = images.map((url: string, idx: number) => ({
      href: url,
      legendImage: "",
      order: idx,
    }));

    const numericProductId = Number(productId);
    const numericVariantId = Number(variant.id);

    const payload = {
      productId: numericProductId,
      idVariantDefault: numericVariantId,
      name: title,
      description: richDescription,
      urlImg: images[0] || "",
      urlVideo: "null",
      displayNotice: " ",
      variantShippingAll: 1,
      order: 1,
      state: 1,
      productType: "normal",
      pictures: pictures,
      orderedVariants: [{ id: numericVariantId, order: 1, show: 1 }],
    };

    // 6. Crear si no existe
    if (!webProduct) {
      logger.info("Descripción web no existe, creando...", { sku, productId });
      const created = await bsaleClient.createWebProduct(payload);
      if (!created || created.error) {
        const errorMsg = created?.message || "Error creando descripción web en Bsale";
        const result = { success: false, sku, message: `Error creando descripción web en Bsale: ${errorMsg}` };
        addToHistory(result);
        return result;
      }
      // Guardar en cache para actualizaciones inmediatas
      if (created.id) {
        bsaleClient.cacheWebProductId(sku, created.id);
      }
      
      // 6a. Asignar a colección si se detectó una
      let collectionAssigned = false;
      if (collectionId) {
        collectionAssigned = await bsaleClient.addProductToCollection(collectionId, sku);
        logger.info("Asignación a colección", { sku, collectionId, collectionName, success: collectionAssigned });
      }
      
      const result = { 
        success: true, 
        sku, 
        message: `Descripción web creada exitosamente${collectionName ? ` + Colección: ${collectionName}` : ''}`, 
        bsaleWebProductId: created.id, 
        created: true,
        collectionId,
        collectionName,
        collectionAssigned
      };
      addToHistory(result);
      return result;
    }

    // 7. Activar si está inactiva
    if (webProduct.state === 0) {
      logger.info("Descripción web inactiva, activando...", { sku, webProductId: webProduct.id });
      const activated = await bsaleClient.activateWebProduct(webProduct.id);
      if (!activated) {
        const result = { success: false, sku, message: "Error activando descripción web" };
        addToHistory(result);
        return result;
      }
    }

    // 8. Actualizar imágenes y descripción
    logger.info("Actualizando descripción web", { sku, webProductId: webProduct.id });
    const updated = await bsaleClient.updateWebProduct(webProduct.id, payload);
    if (!updated) {
      const result = { success: false, sku, message: "Error actualizando descripción web" };
      addToHistory(result);
      return result;
    }

    // 9. Verificar/asignar colección (por si no estaba asignada)
    let collectionAssigned = false;
    if (collectionId) {
      // Verificar si ya está en la colección
      const existingCollections = await bsaleClient.getProductCollections(numericProductId);
      const alreadyInCollection = existingCollections.some((c: any) => c.id === collectionId);
      
      if (!alreadyInCollection) {
        collectionAssigned = await bsaleClient.addProductToCollection(collectionId, sku);
        logger.info("Asignación a colección (update)", { sku, collectionId, collectionName, success: collectionAssigned });
      } else {
        collectionAssigned = true;
        logger.info("Producto ya está en la colección", { sku, collectionId, collectionName });
      }
    }

    const result = {
      success: true,
      sku,
      message: webProduct.state === 0 
        ? `Descripción web activada y actualizada${collectionName ? ` + Colección: ${collectionName}` : ''}` 
        : `Descripción web actualizada${collectionName ? ` + Colección: ${collectionName}` : ''}`,
      bsaleWebProductId: webProduct.id,
      activated: webProduct.state === 0,
      collectionId,
      collectionName,
      collectionAssigned
    };
    // Guardar en cache para futuras actualizaciones
    if (webProduct.id) {
      bsaleClient.cacheWebProductId(sku, webProduct.id);
    }
    addToHistory(result);
    return result;
  }

  /**
   * Fuerza la actualización de un producto que YA tiene descripción web en Bsale.
   * Útil para actualizar imágenes/descripción manualmente.
   */
  async forceUpdateBySKU(sku: string): Promise<SyncResult> {
    logger.info("Forzando actualización por SKU", { sku });

    // 1. Buscar variante en Bsale
    const variant = await bsaleClient.findVariantByCode(sku);
    if (!variant) {
      const result = { success: false, sku, message: "SKU no encontrado en Bsale" };
      addToHistory(result);
      return result;
    }

    const productId = variant.product?.id || variant.productId || variant.product_id;
    if (!productId) {
      const result = { success: false, sku, message: "Variante sin productId asociado en Bsale" };
      addToHistory(result);
      return result;
    }

    // 2. Buscar descripción web existente (debe existir para actualizar)
    const webProduct = await bsaleClient.findWebProductByCode(sku);
    if (!webProduct) {
      const result = { success: false, sku, message: "Este producto no tiene descripción web en Bsale aún. Use 'Sincronizar' primero." };
      addToHistory(result);
      return result;
    }

    // 3. Buscar producto en Shopify
    let description = "";
    let images: string[] = [];
    let title = variant.name || sku;

    try {
      const shopifyProduct = await shopifyClient.findProductBySKU(sku);
      if (shopifyProduct) {
        description = shopifyProduct.descriptionHtml || shopifyProduct.body_html || "";
        images = shopifyProduct.images?.edges?.map((e: any) => e.node.src) || [];
        title = shopifyProduct.title || title;
      }
    } catch (err: any) {
      logger.warn("Error buscando en Shopify", { sku, error: err.message });
    }

    // 4. Determinar colección según el nombre del producto
    const collectionId = findCollectionByProductName(title);
    const collectionName = collectionId ? getCollectionName(collectionId) : null;
    logger.info("Colección detectada (force update)", { sku, title, collectionId, collectionName });

    // 5. Construir descripción HTML con imágenes incrustadas
    const richDescription = buildDescriptionWithImages(description, images, title);

    // 6. Construir payload
    const pictures = images.map((url: string, idx: number) => ({
      href: url,
      legendImage: "",
      order: idx,
    }));

    const numericProductId = Number(productId);
    const numericVariantId = Number(variant.id);

    const payload = {
      productId: numericProductId,
      idVariantDefault: numericVariantId,
      name: title,
      description: richDescription,
      urlImg: images[0] || "",
      urlVideo: "null",
      displayNotice: " ",
      variantShippingAll: 1,
      order: 1,
      state: 1,
      productType: "normal",
      pictures: pictures,
      orderedVariants: [{ id: numericVariantId, order: 1, show: 1 }],
    };

    // 6. Activar si está inactiva
    if (webProduct.state === 0) {
      logger.info("Descripción web inactiva, activando...", { sku });
      await bsaleClient.activateWebProduct(webProduct.id);
    }

    // 7. Forzar actualización
    logger.info("Forzando actualización de descripción web", { sku, webProductId: webProduct.id });
    const updated = await bsaleClient.updateWebProduct(webProduct.id, payload);
    if (!updated) {
      const result = { success: false, sku, message: "Error actualizando descripción web" };
      addToHistory(result);
      return result;
    }

    // 8. Asignar a colección si se detectó una y no está ya asignada
    let collectionAssigned = false;
    if (collectionId) {
      const existingCollections = await bsaleClient.getProductCollections(numericProductId);
      const alreadyInCollection = existingCollections.some((c: any) => c.id === collectionId);
      
      if (!alreadyInCollection) {
        collectionAssigned = await bsaleClient.addProductToCollection(collectionId, sku);
        logger.info("Asignación a colección (force update)", { sku, collectionId, collectionName, success: collectionAssigned });
      } else {
        collectionAssigned = true;
        logger.info("Producto ya está en la colección", { sku, collectionId, collectionName });
      }
    }

    const result = {
      success: true,
      sku,
      message: `Descripción web actualizada exitosamente${collectionName ? ` + Colección: ${collectionName}` : ''}`,
      bsaleWebProductId: webProduct.id,
      activated: webProduct.state === 0,
      collectionId,
      collectionName,
      collectionAssigned
    };
    // Guardar en cache para futuras actualizaciones
    if (webProduct.id) {
      bsaleClient.cacheWebProductId(sku, webProduct.id);
    }
    addToHistory(result);
    return result;
  }
}

export const syncService = new SyncService();
