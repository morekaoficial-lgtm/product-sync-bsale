#!/bin/bash
# deploy.sh — Script de deploy independiente para product-sync-bsale
# NO toca los procesos existentes (webhook, inventory-credit, etc.)

set -e

SERVER_IP="68.183.118.116"
PROJECT_NAME="product-sync-bsale"
REPO_URL="https://github.com/morekaoficial-lgtm/product-sync-bsale.git"
REMOTE_DIR="/opt/${PROJECT_NAME}"
PORT=3003

echo "🚀 Deploy de ${PROJECT_NAME}..."

# 1. SSH al servidor y hacer el deploy
ssh root@${SERVER_IP} << EOF
  echo "📁 Creando directorio..."
  mkdir -p ${REMOTE_DIR}
  cd ${REMOTE_DIR}

  echo "📥 Bajando cambios..."
  if [ -d .git ]; then
    git pull origin main
  else
    git clone ${REPO_URL} .
  fi

  echo "📦 Instalando dependencias..."
  npm install --production

  echo "🔧 Verificando .env..."
  if [ ! -f .env ]; then
    echo "⚠️  Falta .env en el servidor. Copia manualmente las variables."
    exit 1
  fi

  echo "🔄 Reiniciando PM2..."
  if pm2 list | grep -q "${PROJECT_NAME}"; then
    pm2 restart ${PROJECT_NAME}
  else
    pm2 start dist/index.js --name ${PROJECT_NAME} -- ${PORT}
    pm2 save
  fi

  echo "✅ ${PROJECT_NAME} corriendo en puerto ${PORT}"
  pm2 status ${PROJECT_NAME}
EOF

echo "🎉 Deploy completado."
echo ""
echo "Verifica:"
echo "  curl http://${SERVER_IP}:${PORT}/health"
