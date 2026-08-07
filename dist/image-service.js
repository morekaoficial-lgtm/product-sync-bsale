import { logger } from "./logger.js";
import * as fs from "fs";
import * as path from "path";
export const IMAGE_DIR = "/var/www/product-images";
const PUBLIC_URL_BASE = "https://shopifybsale.shopyenterprise.com/images";
/** Asegura que el directorio de imágenes existe */
function ensureImageDir() {
    if (!fs.existsSync(IMAGE_DIR)) {
        fs.mkdirSync(IMAGE_DIR, { recursive: true });
        logger.info(`Created image directory: ${IMAGE_DIR}`);
    }
}
/**
 * Descarga una imagen desde una URL y la guarda localmente.
 * Retorna la URL pública para acceder a la imagen.
 */
export async function downloadAndHostImage(imageUrl, sku, index = 0) {
    try {
        ensureImageDir();
        // Determinar extensión
        const urlObj = new URL(imageUrl);
        const pathname = urlObj.pathname;
        let ext = path.extname(pathname).toLowerCase();
        if (!ext || ext.length > 5) {
            ext = ".jpg"; // default
        }
        // Nombre de archivo único
        const safeSku = sku.replace(/[^a-zA-Z0-9_-]/g, "_");
        const filename = `${safeSku}_${index}${ext}`;
        const localPath = path.join(IMAGE_DIR, filename);
        // Si ya existe, retornar URL directamente
        if (fs.existsSync(localPath)) {
            logger.info(`Image already cached locally`, { sku, filename });
            return `${PUBLIC_URL_BASE}/${filename}`;
        }
        // Descargar imagen
        logger.info(`Downloading image from Shopify`, { sku, url: imageUrl });
        const response = await fetch(imageUrl, {
            headers: {
                // Headers para evitar bloqueos
                "User-Agent": "Mozilla/5.0 (compatible; BsaleSync/1.0)",
            },
        });
        if (!response.ok) {
            logger.error(`Failed to download image`, { sku, url: imageUrl, status: response.status });
            return null;
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(localPath, buffer);
        logger.info(`Image saved locally`, { sku, filename, size: buffer.length });
        return `${PUBLIC_URL_BASE}/${filename}`;
    }
    catch (err) {
        logger.error(`Error downloading/hosting image`, { sku, url: imageUrl, error: err.message });
        return null;
    }
}
/**
 * Descarga todas las imágenes de un producto y retorna las URLs locales.
 */
export async function downloadAndHostProductImages(imageUrls, sku) {
    const results = [];
    for (let i = 0; i < imageUrls.length; i++) {
        const localUrl = await downloadAndHostImage(imageUrls[i], sku, i);
        if (localUrl) {
            results.push(localUrl);
        }
    }
    return results;
}
/**
 * Elimina imágenes locales de un producto (útil para re-sync).
 */
export function clearProductImages(sku) {
    try {
        ensureImageDir();
        const safeSku = sku.replace(/[^a-zA-Z0-9_-]/g, "_");
        const files = fs.readdirSync(IMAGE_DIR);
        let deleted = 0;
        for (const file of files) {
            if (file.startsWith(`${safeSku}_`)) {
                fs.unlinkSync(path.join(IMAGE_DIR, file));
                deleted++;
            }
        }
        if (deleted > 0) {
            logger.info(`Cleared local images`, { sku, deleted });
        }
    }
    catch (err) {
        logger.error(`Error clearing product images`, { sku, error: err.message });
    }
}
