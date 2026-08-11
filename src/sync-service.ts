import { bsaleClient } from "./bsale-client.js";
import { shopifyClient } from "./shopify-client.js";
import { logger } from "./logger.js";
import { findCollectionByProductName, getCollectionName } from "./collection-config.js";
import { downloadAndHostProductImages, clearProductImages } from "./image-service.js";

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
    logger.info("Bsale webProduct lookup", { sku, found: !!webProduct, state: webProduct?.state });

    // 3. Buscar producto en Shopify para obtener datos
    let description = "";
    let images: string[] = [];
    let title = variant.name || sku;

    try {
      logger.info("Buscando producto en Shopify por SKU", { sku });
      const shopifyProduct = await shopifyClient.findProductBySKU(sku);
      if (shopifyProduct) {
        description = shopifyProduct.descriptionHtml || shopifyProduct.body_html || "";
        images = shopifyProduct.images?.edges?.map((e: any) => e.node.src) || [];
        title = shopifyProduct.title || title;
        logger.info("Producto encontrado en Shopify", {
          sku,
          title,
          descriptionLength: description.length,
          imagesCount: images.length,
        });
      } else {
        logger.error("Producto NO encontrado en Shopify por SKU", { sku });
        const result = {
          success: false,
          sku,
          message: `SKU ${sku} existe en Bsale pero NO fue encontrado en Shopify. Verifica que el SKU sea identico en ambas plataformas.`,
        };
        addToHistory(result);
        return result;
      }
    } catch (err: any) {
      logger.error("Error buscando en Shopify", { sku, error: err.message });
      const result = {
        success: false,
        sku,
        message: `Error buscando SKU ${sku} en Shopify: ${err.message}`,
      };
      addToHistory(result);
      return result;
    }

    // 4. Determinar colección según el nombre del producto
    const collectionId = findCollectionByProductName(title);
    const collectionName = collectionId ? getCollectionName(collectionId) : null;
    logger.info("Colección detectada", { sku, title, collectionId, collectionName });

    // 5. DESCARGAR imágenes de Shopify y alojarlas localmente
    logger.info("Descargando imágenes de Shopify...", { sku, count: images.length });
    const localImageUrls = await downloadAndHostProductImages(images, sku);
    logger.info("Imágenes alojadas localmente", { sku, localUrls: localImageUrls });

    // 6. Construir descripción HTML con imágenes incrustadas (usando URLs locales)
    const richDescription = buildDescriptionWithImages(description, localImageUrls, title);

    // 7. Construir pictures (usando URLs locales para que Bsale pueda descargarlas)
    const pictures = localImageUrls.map((url: string, idx: number) => ({
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
      urlImg: localImageUrls[0] || "",
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
   * Sync product using pre-fetched Shopify details (avoids extra API call).
   * Used by webhook handler which already has product data in the payload.
   */
  async syncBySKUWithDetails(
    sku: string,
    shopifyDetails: { title: string; descriptionHtml: string; images: string[] }
  ): Promise<SyncResult> {
    logger.info("Iniciando sync por SKU con detalles pre-fetched", { sku, title: shopifyDetails.title });

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

    // 2. Buscar descripción web existente
    let webProduct = await bsaleClient.findWebProductByCode(sku);

    // 3. Usar datos directamente del webhook (no llamar a Shopify API)
    const description = shopifyDetails.descriptionHtml || "";
    const images = shopifyDetails.images || [];
    const title = shopifyDetails.title || variant.name || sku;

    logger.info("Datos del webhook usados directamente", {
      sku,
      title,
      descriptionLength: description.length,
      imagesCount: images.length,
    });

    // 4. Determinar colección
    const collectionId = findCollectionByProductName(title);
    const collectionName = collectionId ? getCollectionName(collectionId) : null;

    // 5. Descargar imágenes y alojar localmente
    const localImageUrls = await downloadAndHostProductImages(images, sku);

    // 6. Construir descripción HTML
    const richDescription = buildDescriptionWithImages(description, localImageUrls, title);

    // 7. Construir payload
    const pictures = localImageUrls.map((url: string, idx: number) => ({
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
      urlImg: localImageUrls[0] || "",
      urlVideo: "null",
      displayNotice: " ",
      variantShippingAll: 1,
      order: 1,
      state: 1,
      productType: "normal",
      pictures: pictures,
      orderedVariants: [{ id: numericVariantId, order: 1, show: 1 }],
    };

    // 8. Crear si no existe
    if (!webProduct) {
      logger.info("Descripción web no existe, creando...", { sku, productId });
      const created = await bsaleClient.createWebProduct(payload);
      if (!created || created.error) {
        const errorMsg = created?.message || "Error creando descripción web en Bsale";
        const result = { success: false, sku, message: `Error creando descripción web en Bsale: ${errorMsg}` };
        addToHistory(result);
        return result;
      }
      if (created.id) {
        bsaleClient.cacheWebProductId(sku, created.id);
      }

      let collectionAssigned = false;
      if (collectionId) {
        collectionAssigned = await bsaleClient.addProductToCollection(collectionId, sku);
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

    // 9. Activar si está inactiva
    if (webProduct.state === 0) {
      logger.info("Descripción web inactiva, activando...", { sku, webProductId: webProduct.id });
      const activated = await bsaleClient.activateWebProduct(webProduct.id);
      if (!activated) {
        const result = { success: false, sku, message: "Error activando descripción web" };
        addToHistory(result);
        return result;
      }
    }

    // 10. Actualizar
    logger.info("Actualizando descripción web", { sku, webProductId: webProduct.id });
    const updated = await bsaleClient.updateWebProduct(webProduct.id, payload);
    if (!updated) {
      const result = { success: false, sku, message: "Error actualizando descripción web" };
      addToHistory(result);
      return result;
    }

    // 11. Verificar colección
    let collectionAssigned = false;
    if (collectionId) {
      const existingCollections = await bsaleClient.getProductCollections(numericProductId);
      const alreadyInCollection = existingCollections.some((c: any) => c.id === collectionId);
      if (!alreadyInCollection) {
        collectionAssigned = await bsaleClient.addProductToCollection(collectionId, sku);
      } else {
        collectionAssigned = true;
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

    // 5. DESCARGAR imágenes de Shopify y alojarlas localmente
    logger.info("Descargando imágenes de Shopify (force update)...", { sku, count: images.length });
    const localImageUrls = await downloadAndHostProductImages(images, sku);
    logger.info("Imágenes alojadas localmente (force update)", { sku, localUrls: localImageUrls });

    // 6. Construir descripción HTML con imágenes incrustadas
    const richDescription = buildDescriptionWithImages(description, localImageUrls, title);

    // 7. Construir payload
    const pictures = localImageUrls.map((url: string, idx: number) => ({
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
      urlImg: localImageUrls[0] || "",
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

  /**
   * Sincroniza un producto con TODAS sus variantes en UNA sola descripción web.
   * Útil cuando un producto Shopify tiene múltiples variantes (colores, tallas, etc.)
   * y se quiere que todas aparezcan juntas en Bsale Web.
   *
   * @param skus Array de SKUs de las variantes del mismo producto
   * @param shopifyDetails Datos del producto desde Shopify (título, descripción, imágenes)
   */
  async syncProductWithAllVariants(
    skus: string[],
    shopifyDetails: { title: string; descriptionHtml: string; images: string[] }
  ): Promise<SyncResult> {
    logger.info("Iniciando sync de producto con múltiples variantes", {
      skus,
      title: shopifyDetails.title,
    });

    // 1. Buscar TODAS las variantes en Bsale
    const bsaleVariants: any[] = [];
    for (const sku of skus) {
      const variant = await bsaleClient.findVariantByCode(sku);
      if (variant) {
        bsaleVariants.push({ sku, variant });
      } else {
        logger.warn("Variante no encontrada en Bsale, se omite", { sku });
      }
    }

    if (bsaleVariants.length === 0) {
      const result = {
        success: false,
        sku: skus.join(","),
        message: "Ninguna de las variantes fue encontrada en Bsale",
      };
      addToHistory(result);
      return result;
    }

    // 2. Verificar que todas pertenezcan al MISMO productId
    const productIds = new Set(
      bsaleVariants.map((v) => v.variant.product?.id || v.variant.productId || v.variant.product_id)
    );
    if (productIds.size > 1) {
      logger.warn("Variantes pertenecen a múltiples productos en Bsale", {
        productIds: Array.from(productIds),
        skus,
      });
      // Usar el productId de la primera variante como principal
    }

    const mainProductId = Array.from(productIds)[0];
    const mainVariant = bsaleVariants[0].variant;

    // 3. Buscar descripción web existente (por cualquiera de las variantes)
    let webProduct = null;
    for (const { sku } of bsaleVariants) {
      webProduct = await bsaleClient.findWebProductByCode(sku);
      if (webProduct) {
        logger.info("Descripción web existente encontrada", { sku, webProductId: webProduct.id });
        break;
      }
    }

    // 4. Preparar datos
    const description = shopifyDetails.descriptionHtml || "";
    const images = shopifyDetails.images || [];
    const title = shopifyDetails.title || mainVariant.name || skus[0];

    // 5. Descargar imágenes
    const localImageUrls = await downloadAndHostProductImages(images, skus[0]);

    // 6. Construir descripción HTML
    const richDescription = buildDescriptionWithImages(description, localImageUrls, title);

    // 7. Construir orderedVariants con TODAS las variantes
    const orderedVariants = bsaleVariants.map((v, idx) => ({
      id: Number(v.variant.id),
      order: idx + 1,
      show: 1,
    }));

    logger.info("Variantes a incluir en descripción web", {
      count: orderedVariants.length,
      variantIds: orderedVariants.map((v) => v.id),
    });

    // 8. Construir pictures
    const pictures = localImageUrls.map((url: string, idx: number) => ({
      href: url,
      legendImage: "",
      order: idx,
    }));

    const numericProductId = Number(mainProductId);
    const numericVariantId = Number(mainVariant.id);

    const payload = {
      productId: numericProductId,
      idVariantDefault: numericVariantId,
      name: title,
      description: richDescription,
      urlImg: localImageUrls[0] || "",
      urlVideo: "null",
      displayNotice: " ",
      variantShippingAll: 1,
      order: 1,
      state: 1,
      productType: "normal",
      pictures: pictures,
      orderedVariants: orderedVariants,
    };

    // 9. Crear o actualizar descripción web
    let result: SyncResult;

    if (!webProduct) {
      logger.info("Creando descripción web con múltiples variantes...", {
        productId: mainProductId,
        variantCount: orderedVariants.length,
      });
      const created = await bsaleClient.createWebProduct(payload);
      if (!created || created.error) {
        const errorMsg = created?.message || "Error creando descripción web en Bsale";
        result = {
          success: false,
          sku: skus.join(","),
          message: `Error creando descripción web: ${errorMsg}`,
        };
        addToHistory(result);
        return result;
      }

      if (created.id) {
        for (const { sku } of bsaleVariants) {
          bsaleClient.cacheWebProductId(sku, created.id);
        }
      }

      result = {
        success: true,
        sku: skus.join(","),
        message: `Descripción web creada con ${orderedVariants.length} variantes`,
        bsaleWebProductId: created.id,
        created: true,
      };
    } else {
      // Activar si está inactiva
      if (webProduct.state === 0) {
        logger.info("Descripción web inactiva, activando...", { webProductId: webProduct.id });
        await bsaleClient.activateWebProduct(webProduct.id);
      }

      logger.info("Actualizando descripción web con múltiples variantes...", {
        webProductId: webProduct.id,
        variantCount: orderedVariants.length,
      });
      const updated = await bsaleClient.updateWebProduct(webProduct.id, payload);
      if (!updated) {
        result = {
          success: false,
          sku: skus.join(","),
          message: "Error actualizando descripción web",
        };
        addToHistory(result);
        return result;
      }

      result = {
        success: true,
        sku: skus.join(","),
        message: `Descripción web actualizada con ${orderedVariants.length} variantes`,
        bsaleWebProductId: webProduct.id,
        activated: webProduct.state === 0,
      };
    }

    // 10. Asignar a colección
    const collectionId = findCollectionByProductName(title);
    const collectionName = collectionId ? getCollectionName(collectionId) : null;
    if (collectionId) {
      const existingCollections = await bsaleClient.getProductCollections(numericProductId);
      const alreadyInCollection = existingCollections.some((c: any) => c.id === collectionId);
      if (!alreadyInCollection) {
        await bsaleClient.addProductToCollection(collectionId, skus[0]);
        result.collectionId = collectionId;
        result.collectionName = collectionName;
        result.collectionAssigned = true;
      }
    }

    for (const { sku } of bsaleVariants) {
      if (webProduct?.id) {
        bsaleClient.cacheWebProductId(sku, webProduct.id);
      }
    }

    addToHistory(result);
    return result;
  }
}

export const syncService = new SyncService();
