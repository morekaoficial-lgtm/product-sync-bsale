export function getAdminDashboardHTML() {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Product Sync Bsale — Panel de Control</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
    header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 32px; padding-bottom: 20px;
      border-bottom: 1px solid #334155;
    }
    h1 { font-size: 1.75rem; font-weight: 700; color: #f8fafc; }
    .subtitle { color: #94a3b8; font-size: 0.875rem; margin-top: 4px; }
    .status-badge {
      display: inline-flex; align-items: center; gap: 6px;
      background: #059669; color: white; padding: 6px 14px;
      border-radius: 9999px; font-size: 0.75rem; font-weight: 600;
    }
    .status-badge::before {
      content: ''; width: 8px; height: 8px; background: #34d399;
      border-radius: 50%; animation: pulse 2s infinite;
    }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }

    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
    @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }

    .card {
      background: #1e293b; border: 1px solid #334155;
      border-radius: 12px; padding: 24px;
    }
    .card h2 { font-size: 0.875rem; font-weight: 600; color: #94a3b8; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.05em; }

    .sync-form { display: flex; gap: 12px; align-items: stretch; }
    .sync-form input {
      flex: 1; padding: 12px 16px; background: #0f172a; border: 1px solid #475569;
      border-radius: 8px; color: #f8fafc; font-size: 1rem;
    }
    .sync-form input:focus { outline: none; border-color: #3b82f6; }
    .sync-form button {
      padding: 12px 24px; background: #3b82f6; color: white;
      border: none; border-radius: 8px; font-weight: 600; cursor: pointer;
      transition: background 0.2s;
    }
    .sync-form button:hover { background: #2563eb; }
    .sync-form button:disabled { opacity: 0.5; cursor: not-allowed; }

    .result-box {
      margin-top: 16px; padding: 16px; border-radius: 8px;
      font-size: 0.875rem; display: none;
    }
    .result-box.success { background: #064e3b; border: 1px solid #059669; color: #34d399; }
    .result-box.error { background: #450a0a; border: 1px solid #dc2626; color: #fca5a5; }

    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .stat { text-align: center; }
    .stat-value { font-size: 2rem; font-weight: 700; color: #f8fafc; }
    .stat-label { font-size: 0.75rem; color: #94a3b8; margin-top: 4px; }

    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th { text-align: left; padding: 12px; color: #94a3b8; font-weight: 600; border-bottom: 1px solid #334155; }
    td { padding: 12px; border-bottom: 1px solid #1e293b; }
    tr:hover td { background: #1e293b; }
    .tag {
      display: inline-block; padding: 2px 10px; border-radius: 9999px;
      font-size: 0.75rem; font-weight: 600;
    }
    .tag-success { background: #064e3b; color: #34d399; }
    .tag-error { background: #450a0a; color: #fca5a5; }
    .empty-state { text-align: center; padding: 40px; color: #64748b; }
    .refresh-btn {
      padding: 8px 16px; background: #334155; color: #e2e8f0;
      border: none; border-radius: 6px; cursor: pointer; font-size: 0.875rem;
    }
    .refresh-btn:hover { background: #475569; }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .card-header h2 { margin: 0; }

    .endpoint-list { list-style: none; }
    .endpoint-list li {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 0; border-bottom: 1px solid #334155; font-size: 0.875rem;
    }
    .method {
      padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;
    }
    .method-get { background: #1e40af; color: #93c5fd; }
    .method-post { background: #065f46; color: #6ee7b7; }
    .endpoint-path { color: #e2e8f0; font-family: monospace; }

    .loading { display: inline-block; width: 16px; height: 16px; border: 2px solid #3b82f6; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>🔧 Product Sync Bsale</h1>
        <div class="subtitle">Sincronización Shopify ↔ Bsale Web</div>
      </div>
      <div class="status-badge">Servicio Activo</div>
    </header>

    <div class="grid">
      <div class="card">
        <h2>⚡ Sincronización Rápida</h2>
        <form class="sync-form" id="syncForm">
          <input type="text" id="skuInput" placeholder="Ingresa un SKU (ej: prueba123)" required>
          <button type="submit" id="syncBtn">Sincronizar</button>
        </form>
        <div class="result-box" id="resultBox"></div>
      </div>

      <div class="card">
        <h2>📊 Métricas</h2>
        <div class="stats" id="stats">
          <div class="stat">
            <div class="stat-value" id="totalCount">—</div>
            <div class="stat-label">Total</div>
          </div>
          <div class="stat">
            <div class="stat-value" id="successCount">—</div>
            <div class="stat-label">Exitosas</div>
          </div>
          <div class="stat">
            <div class="stat-value" id="errorCount">—</div>
            <div class="stat-label">Errores</div>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2>📋 Historial de Sincronizaciones</h2>
        <button class="refresh-btn" onclick="loadHistory()">🔄 Actualizar</button>
      </div>
      <div id="historyTable">
        <div class="empty-state">Cargando historial...</div>
      </div>
    </div>

    <div class="card" style="margin-top: 20px;">
      <h2>🔗 Endpoints Disponibles</h2>
      <ul class="endpoint-list">
        <li><span class="method method-post">POST</span> <span class="endpoint-path">/sync/sku</span> <span style="color:#64748b">— Sincronizar manualmente por SKU</span></li>
        <li><span class="method method-post">POST</span> <span class="endpoint-path">/webhook/shopify</span> <span style="color:#64748b">— Webhook de Shopify</span></li>
        <li><span class="method method-get">GET</span> <span class="endpoint-path">/health</span> <span style="color:#64748b">— Health check</span></li>
        <li><span class="method method-get">GET</span> <span class="endpoint-path">/api/history</span> <span style="color:#64748b">— Historial JSON</span></li>
      </ul>
    </div>
  </div>

  <script>
    const syncForm = document.getElementById('syncForm');
    const skuInput = document.getElementById('skuInput');
    const syncBtn = document.getElementById('syncBtn');
    const resultBox = document.getElementById('resultBox');

    syncForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const sku = skuInput.value.trim();
      if (!sku) return;

      syncBtn.disabled = true;
      syncBtn.innerHTML = '<span class="loading"></span>';
      resultBox.style.display = 'none';

      try {
        const res = await fetch('/sync/sku', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sku })
        });
        const data = await res.json();

        resultBox.style.display = 'block';
        if (data.success) {
          resultBox.className = 'result-box success';
          resultBox.innerHTML = '✅ <strong>Éxito:</strong> ' + (data.message || 'Sincronizado') +
            (data.bsaleWebProductId ? '<br>Producto Web ID: <code>' + data.bsaleWebProductId + '</code>' : '');
        } else {
          resultBox.className = 'result-box error';
          resultBox.innerHTML = '❌ <strong>Error:</strong> ' + (data.message || 'Error desconocido');
        }
        loadHistory();
      } catch (err) {
        resultBox.style.display = 'block';
        resultBox.className = 'result-box error';
        resultBox.innerHTML = '❌ <strong>Error de conexión:</strong> ' + err.message;
      } finally {
        syncBtn.disabled = false;
        syncBtn.textContent = 'Sincronizar';
      }
    });

    async function loadHistory() {
      try {
        const res = await fetch('/api/history');
        const history = await res.json();

        const total = history.length;
        const success = history.filter(h => h.success).length;
        const errors = total - success;

        document.getElementById('totalCount').textContent = total;
        document.getElementById('successCount').textContent = success;
        document.getElementById('errorCount').textContent = errors;

        const container = document.getElementById('historyTable');
        if (!history.length) {
          container.innerHTML = '<div class="empty-state">Aún no hay sincronizaciones registradas.</div>';
          return;
        }

        let html = '<table><thead><tr><th>Hora</th><th>SKU</th><th>Estado</th><th>Mensaje</th><th>Producto Web ID</th></tr></thead><tbody>';
        for (const item of history.slice().reverse()) {
          const time = new Date(item.timestamp).toLocaleString('es-CL');
          const status = item.success
            ? '<span class="tag tag-success">✓ ÉXITO</span>'
            : '<span class="tag tag-error">✗ ERROR</span>';
          html += '<tr>';
          html += '<td style="color:#94a3b8;font-size:0.8rem;">' + time + '</td>';
          html += '<td><code>' + item.sku + '</code></td>';
          html += '<td>' + status + '</td>';
          html += '<td>' + (item.message || '') + '</td>';
          html += '<td>' + (item.bsaleWebProductId || '—') + '</td>';
          html += '</tr>';
        }
        html += '</tbody></table>';
        container.innerHTML = html;
      } catch (err) {
        document.getElementById('historyTable').innerHTML = '<div class="empty-state">Error cargando historial: ' + err.message + '</div>';
      }
    }

    loadHistory();
    setInterval(loadHistory, 10000);
  </script>
</body>
</html>`;
}
