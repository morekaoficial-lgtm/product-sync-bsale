import { syncHistory } from "./sync-service.js";

export function getAdminDashboardHTML(): string {
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

    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 24px; }
    @media (max-width: 768px) { .grid-3 { grid-template-columns: 1fr; } }

    .card {
      background: #1e293b; border: 1px solid #334155;
      border-radius: 12px; padding: 24px;
    }
    .card h2 { font-size: 0.875rem; font-weight: 600; color: #94a3b8; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.05em; }

    .sync-form { display: flex; gap: 12px; align-items: stretch; margin-bottom: 12px; }
    .sync-form input {
      flex: 1; padding: 12px 16px; background: #0f172a; border: 1px solid #475569;
      border-radius: 8px; color: #f8fafc; font-size: 1rem;
    }
    .sync-form input:focus { outline: none; border-color: #3b82f6; }
    .btn {
      padding: 12px 20px; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;
      transition: background 0.2s; font-size: 0.875rem;
    }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary { background: #3b82f6; color: white; }
    .btn-primary:hover { background: #2563eb; }
    .btn-warning { background: #d97706; color: white; }
    .btn-warning:hover { background: #b45309; }
    .btn-success { background: #059669; color: white; }
    .btn-success:hover { background: #047857; }

    .batch-textarea {
      width: 100%; min-height: 120px; padding: 12px 16px; background: #0f172a;
      border: 1px solid #475569; border-radius: 8px; color: #f8fafc;
      font-size: 0.875rem; font-family: monospace; resize: vertical;
    }
    .batch-textarea:focus { outline: none; border-color: #3b82f6; }
    .batch-mode-select {
      padding: 10px 14px; background: #0f172a; border: 1px solid #475569;
      border-radius: 8px; color: #f8fafc; font-size: 0.875rem; cursor: pointer;
    }
    .batch-mode-select:focus { outline: none; border-color: #3b82f6; }
    .batch-progress { margin: 16px 0; font-size: 0.875rem; color: #94a3b8; }
    .batch-results { margin-top: 16px; }
    .batch-results table { font-size: 0.8rem; }
    .batch-results th { padding: 8px 12px; }
    .batch-results td { padding: 8px 12px; }

    .result-box {
      margin-top: 16px; padding: 16px; border-radius: 8px;
      font-size: 0.875rem; display: none;
    }
    .result-box.success { background: #064e3b; border: 1px solid #059669; color: #34d399; }
    .result-box.error { background: #450a0a; border: 1px solid #dc2626; color: #fca5a5; }

    .info-box {
      background: #0f172a; border: 1px solid #334155; border-radius: 8px;
      padding: 12px 16px; font-size: 0.8rem; color: #94a3b8; margin-bottom: 16px;
    }
    .info-box strong { color: #e2e8f0; }

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
    .tag-info { background: #1e3a5f; color: #93c5fd; }
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

    .loading { display: inline-block; width: 16px; height: 16px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; }
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
        <h2>⚡ Sincronización Manual</h2>
        <div class="info-box">
          <strong>🤖 Automático:</strong> Cuando edites un producto en Shopify (fotos, descripción), 
          el webhook lo sincronizará solo. Usa los botones de abajo solo para forzar manualmente.
        </div>
        <form class="sync-form" id="syncForm">
          <input type="text" id="skuInput" placeholder="Ingresa un SKU (ej: prueba123)" required>
        </form>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-primary" id="syncBtn" onclick="doSync('create')">🆕 Sincronizar / Crear</button>
          <button class="btn btn-warning" id="updateBtn" onclick="doSync('update')">🔄 Actualizar Existente</button>
        </div>
        <div class="result-box" id="resultBox"></div>
      </div>

      <div class="card">
        <h2>📦 Sincronización por Tandas</h2>
        <div class="info-box">
          <strong>💡 Tips:</strong> Pega múltiples SKUs separados por coma, salto de línea o espacio.
          Ejemplo: <code>SKU001, SKU002, SKU003</code>
        </div>
        <textarea class="batch-textarea" id="batchSkus" placeholder="SKU001, SKU002, SKU003...
SKU004
SKU005 SKU006"></textarea>
        <div style="display:flex; gap:10px; margin-top:12px; align-items:center;">
          <select class="batch-mode-select" id="batchMode">
            <option value="create">🆕 Crear descripciones</option>
            <option value="update">🔄 Actualizar existentes</option>
          </select>
          <button class="btn btn-success" id="batchBtn" onclick="doBatchSync()">⚡ Sincronizar Tanda</button>
        </div>
        <div class="batch-progress" id="batchProgress" style="display:none;"></div>
        <div class="batch-results" id="batchResults" style="display:none;">
          <table>
            <thead>
              <tr><th>SKU</th><th>Estado</th><th>Mensaje</th><th>Colección</th><th>Web ID</th></tr>
            </thead>
            <tbody id="batchResultsBody"></tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="grid-3">
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
        <li><span class="method method-post">POST</span> <span class="endpoint-path">/sync/batch</span> <span style="color:#64748b">— Sincronizar tanda de SKUs</span></li>
        <li><span class="method method-post">POST</span> <span class="endpoint-path">/sync/sku</span> <span style="color:#64748b">— Crear descripción web si no existe</span></li>
        <li><span class="method method-post">POST</span> <span class="endpoint-path">/sync/sku/update</span> <span style="color:#64748b">— Forzar actualización de existente</span></li>
        <li><span class="method method-post">POST</span> <span class="endpoint-path">/webhook/shopify</span> <span style="color:#64748b">— Webhook automático de Shopify</span></li>
        <li><span class="method method-get">GET</span> <span class="endpoint-path">/health</span> <span style="color:#64748b">— Health check</span></li>
        <li><span class="method method-get">GET</span> <span class="endpoint-path">/api/history</span> <span style="color:#64748b">— Historial JSON</span></li>
      </ul>
    </div>
  </div>

  <script>
    const skuInput = document.getElementById('skuInput');
    const syncBtn = document.getElementById('syncBtn');
    const updateBtn = document.getElementById('updateBtn');
    const resultBox = document.getElementById('resultBox');

    async function doSync(mode) {
      const sku = skuInput.value.trim();
      if (!sku) {
        resultBox.style.display = 'block';
        resultBox.className = 'result-box error';
        resultBox.innerHTML = '❌ Ingresa un SKU primero';
        return;
      }

      const isUpdate = mode === 'update';
      const btn = isUpdate ? updateBtn : syncBtn;
      const endpoint = isUpdate ? '/sync/sku/update' : '/sync/sku';

      btn.disabled = true;
      const originalText = btn.textContent;
      btn.innerHTML = '<span class="loading"></span>';
      resultBox.style.display = 'none';

      try {
        const res = await fetch(endpoint, {
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
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }

    // Enter key triggers sync (create mode)
    skuInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') doSync('create');
    });

    async function doBatchSync() {
      const rawText = document.getElementById('batchSkus').value.trim();
      const mode = document.getElementById('batchMode').value;
      const btn = document.getElementById('batchBtn');
      const progress = document.getElementById('batchProgress');
      const resultsDiv = document.getElementById('batchResults');
      const resultsBody = document.getElementById('batchResultsBody');

      if (!rawText) {
        progress.style.display = 'block';
        progress.innerHTML = '❌ Pega al menos un SKU';
        return;
      }

      // Parse SKUs: split by comma, newline, or space
      const skus = rawText.split(/[,\n\s]+/).map(s => s.trim()).filter(s => s);
      if (!skus.length) {
        progress.style.display = 'block';
        progress.innerHTML = '❌ No se encontraron SKUs válidos';
        return;
      }

      btn.disabled = true;
      const originalText = btn.textContent;
      btn.innerHTML = '<span class="loading"></span> Procesando...';
      progress.style.display = 'block';
      progress.innerHTML = '⏳ Enviando ' + skus.length + ' SKUs...';
      resultsDiv.style.display = 'none';

      try {
        const res = await fetch('/sync/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skus, mode })
        });
        const data = await res.json();

        if (data.success) {
          progress.innerHTML = '✅ <strong>Completado:</strong> ' + data.successCount + ' de ' + data.total + ' exitosos';
        } else {
          progress.innerHTML = '⚠️ <strong>Resultado:</strong> ' + data.successCount + ' de ' + data.total + ' exitosos';
        }

        // Render results table
        resultsBody.innerHTML = '';
        for (const item of data.results) {
          const statusTag = item.success
            ? '<span class="tag tag-success">✓</span>'
            : '<span class="tag tag-error">✗</span>';
          const collectionTag = item.collectionName
            ? '<span class="tag" style="background:#1e3a5f;color:#93c5fd;">' + item.collectionName + '</span>'
            : '—';
          const row = document.createElement('tr');
          row.innerHTML = '<td><code>' + item.sku + '</code></td><td>' + statusTag + '</td><td>' + (item.message || '') + '</td><td>' + collectionTag + '</td><td>' + (item.bsaleWebProductId || '—') + '</td>';
          resultsBody.appendChild(row);
        }
        resultsDiv.style.display = 'block';
        loadHistory();
      } catch (err) {
        progress.innerHTML = '❌ <strong>Error:</strong> ' + err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }

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

        let html = '<table><thead><tr><th>Hora</th><th>SKU</th><th>Estado</th><th>Mensaje</th><th>Colección</th><th>Web ID</th></tr></thead><tbody>';
        for (const item of history.slice().reverse()) {
          const time = new Date(item.timestamp).toLocaleString('es-CL');
          const tagClass = item.success ? 'tag-success' : (item.message?.includes('no tiene descripción web') ? 'tag-info' : 'tag-error');
          const status = item.success
            ? '<span class="tag tag-success">✓ ÉXITO</span>'
            : '<span class="tag ' + tagClass + '">✗ ERROR</span>';
          const collectionTag = item.collectionName 
            ? '<span class="tag" style="background:#1e3a5f;color:#93c5fd;">' + item.collectionName + '</span>' 
            : '—';
          html += '<tr>';
          html += '<td style="color:#94a3b8;font-size:0.8rem;">' + time + '</td>';
          html += '<td><code>' + item.sku + '</code></td>';
          html += '<td>' + status + '</td>';
          html += '<td>' + (item.message || '') + '</td>';
          html += '<td>' + collectionTag + '</td>';
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
