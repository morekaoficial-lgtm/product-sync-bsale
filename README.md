# Product Sync Bsale

Servicio **independiente** para sincronizar imágenes y descripción de Shopify a Bsale Web.

## ⚡ Endpoints

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/webhook/shopify` | POST | Recibe webhooks de Shopify (product create/update) |
| `/sync/sku` | POST | Sync manual por SKU |
| `/health` | GET | Health check |

## 🚀 Deploy

### 1. Clonar y configurar

```bash
cd /tmp
git clone https://github.com/morekaoficial-lgtm/product-sync-bsale.git
cd product-sync-bsale
npm install
```

### 2. Crear `.env`

```bash
cp .env.example .env
nano .env
```

Llena tus credenciales:
- `BSALE_ACCESS_TOKEN`
- `SHOPIFY_ACCESS_TOKEN`
- `SHOPIFY_SHOP_DOMAIN`

### 3. Compilar y arrancar

```bash
npm run build
pm2 start dist/index.js --name product-sync-bsale
pm2 save
```

### 4. Configurar Nginx

```nginx
server {
    listen 80;
    server_name product-sync.tudominio.com;

    location / {
        proxy_pass http://localhost:3003;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 5. Webhook en Shopify

URL: `https://product-sync.tudominio.com/webhook/shopify`
Eventos: `Product update`, `Product creation`

## 🔧 Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `PORT` | Puerto (default: 3003) |
| `BSALE_ACCESS_TOKEN` | Token de API Bsale |
| `SHOPIFY_ACCESS_TOKEN` | Token de Admin API Shopify |
| `SHOPIFY_SHOP_DOMAIN` | Dominio de la tienda (ej: morekashop1.myshopify.com) |
| `SHOPIFY_WEBHOOK_SECRET` | Secreto para validar HMAC de webhooks (opcional) |
