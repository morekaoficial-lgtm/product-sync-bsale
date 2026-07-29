import "dotenv/config";
export const config = {
    port: parseInt(process.env.PORT || "3003", 10),
    env: process.env.NODE_ENV || "development",
    bsale: {
        accessToken: process.env.BSALE_ACCESS_TOKEN || "",
    },
    shopify: {
        shopDomain: process.env.SHOPIFY_SHOP_DOMAIN || "",
        accessToken: process.env.SHOPIFY_ACCESS_TOKEN || "",
        webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET || "",
    },
};
export function validateConfig() {
    const missing = [];
    if (!config.bsale.accessToken)
        missing.push("BSALE_ACCESS_TOKEN");
    if (!config.shopify.accessToken)
        missing.push("SHOPIFY_ACCESS_TOKEN");
    if (!config.shopify.shopDomain)
        missing.push("SHOPIFY_SHOP_DOMAIN");
    if (missing.length > 0) {
        throw new Error(`Faltan variables de entorno: ${missing.join(", ")}`);
    }
}
