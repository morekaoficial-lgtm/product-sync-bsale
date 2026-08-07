import express from "express";
import cors from "cors";
import { config, validateConfig } from "./config.js";
import { logger } from "./logger.js";
import routes from "./routes.js";
import { getAdminDashboardHTML } from "./admin-dashboard.js";
import { IMAGE_DIR } from "./image-service.js";
validateConfig();
const app = express();
const PORT = config.port;
app.use(cors());
app.use(express.json({ limit: "10mb" }));
// Logging de requests
app.use((req, _res, next) => {
    logger.info(`${req.method} ${req.path}`, { ip: req.ip });
    next();
});
// Panel de administración
app.get("/admin", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(getAdminDashboardHTML());
});
// Servir imágenes descargadas localmente
app.use("/images", express.static(IMAGE_DIR));
// Rutas API
app.use("/webhook", routes);
app.use("/sync", routes);
app.use("/api", routes);
app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "product-sync-bsale", port: PORT });
});
// 404
app.use((_req, res) => res.status(404).json({ error: "Not found" }));
// Error handler
app.use((err, _req, res, _next) => {
    logger.error("Unhandled error", { error: err });
    res.status(500).json({ error: "Internal server error" });
});
app.listen(PORT, "0.0.0.0", () => {
    logger.info(`🚀 Product Sync Bsale corriendo en puerto ${PORT}`);
    logger.info(`🎛️  Admin panel:     GET  http://0.0.0.0:${PORT}/admin`);
    logger.info(`📡 Webhook Shopify: POST http://0.0.0.0:${PORT}/webhook/shopify`);
    logger.info(`🔄 Sync manual:     POST http://0.0.0.0:${PORT}/sync/sku`);
    logger.info(`🔄 Force update:    POST http://0.0.0.0:${PORT}/sync/sku/update`);
    logger.info(`🏥 Health check:    GET  http://0.0.0.0:${PORT}/health`);
});
