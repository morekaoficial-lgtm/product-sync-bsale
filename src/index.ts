import express from "express";
import cors from "cors";
import { config, validateConfig } from "./config.js";
import { logger } from "./logger.js";
import routes from "./routes.js";

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

// Rutas
app.use("/webhook", routes);
app.use("/sync", routes);
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "product-sync-bsale", port: PORT });
});

// 404
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// Error handler
app.use((err: any, _req: any, res: any, _next: any) => {
  logger.error("Unhandled error", { error: err });
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  logger.info(`🚀 Product Sync Bsale corriendo en puerto ${PORT}`);
  logger.info(`📡 Webhook Shopify: POST http://localhost:${PORT}/webhook/shopify`);
  logger.info(`🔄 Sync manual:     POST http://localhost:${PORT}/sync/sku`);
  logger.info(`🏥 Health check:    GET  http://localhost:${PORT}/health`);
});
