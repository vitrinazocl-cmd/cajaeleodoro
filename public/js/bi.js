// bi.js
// Business Intelligence (Gráficos, KPIs, Exportaciones) y Control del Panel Administrador

// Instancias globales para destruir antes de redibujar
let chartSalesHistory = null;
let chartCategoriesShare = null;
let chartHighRotation = null;
let chartLowRotation = null;

// -------------------------------------------------------------
// 1. BUSINESS INTELLIGENCE & ANALÍTICA
// -------------------------------------------------------------
async function loadBIDashboard() {
  await loadBIKPIs();
  await loadBICharts();
}

async function loadBIKPIs() {
  try {
    const data = await apiFetch('/api/reports/kpis');
    if (data.success) {
      const kpis = data.kpis;
      const fmt = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val);
      
      // Llenar KPI Cards
      document.getElementById('kpi-sales-month').textContent = fmt(kpis.ventas_mes);
      document.getElementById('kpi-profits-month').textContent = fmt(kpis.utilidades_mes);
      document.getElementById('kpi-units-sold').textContent = kpis.productos_vendidos_mes.toLocaleString();
      document.getElementById('kpi-avg-ticket').textContent = fmt(kpis.ticket_promedio);

      // Comportamiento de tendencias
      const trendMonthEl = document.getElementById('kpi-trend-month');
      const valTrendMonth = parseFloat(kpis.comparativa_mes.porcentaje);
      if (valTrendMonth >= 0) {
        trendMonthEl.className = 'kpi-trending green';
        trendMonthEl.textContent = `+${valTrendMonth}% vs mes anterior`;
      } else {
        trendMonthEl.className = 'kpi-trending red';
        trendMonthEl.textContent = `${valTrendMonth}% vs mes anterior`;
      }
    }
  } catch (err) {
    console.error('Error al cargar KPIs de BI:', err);
  }
}

async function loadBICharts() {
  try {
    const data = await apiFetch('/api/reports/charts');
    if (!data.success) return;

    const ctxHistory = document.getElementById('chart-sales-history').getContext('2d');
    const ctxShare = document.getElementById('chart-categories-share').getContext('2d');
    const ctxHigh = document.getElementById('chart-high-rotation').getContext('2d');
    const ctxLow = document.getElementById('chart-low-rotation').getContext('2d');

    // Colores corporativos degradados y paletas
    const red = '#E50914';
    const fuchsia = '#FF007F';
    const blue = '#0070F3';
    const darkBg = '#141417';

    // 1. Gráfico Curva Ventas Semanales (Líneas/Área)
    if (chartSalesHistory) chartSalesHistory.destroy();
    
    const dates = data.salesHistory7Days.map(item => {
      const d = new Date(item.fecha);
      return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
    });
    const salesValues = data.salesHistory7Days.map(item => parseFloat(item.total));

    chartSalesHistory = new Chart(ctxHistory, {
      type: 'line',
      data: {
        labels: dates.length > 0 ? dates : ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
        datasets: [{
          label: 'Ventas Diarias ($)',
          data: salesValues.length > 0 ? salesValues : [0, 0, 0, 0, 0, 0, 0],
          borderColor: red,
          backgroundColor: 'rgba(229, 9, 20, 0.15)',
          fill: true,
          tension: 0.4,
          borderWidth: 3,
          pointBackgroundColor: fuchsia
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#888' } },
          x: { grid: { display: false }, ticks: { color: '#888' } }
        }
      }
    });

    // 2. Participación de Categorías (Donut)
    if (chartCategoriesShare) chartCategoriesShare.destroy();
    
    const categories = data.categoryChart.map(item => item.categoria || 'Sin Categoría');
    const categoryTotals = data.categoryChart.map(item => parseFloat(item.total));

    chartCategoriesShare = new Chart(ctxShare, {
      type: 'doughnut',
      data: {
        labels: categories.length > 0 ? categories : ['Licores', 'Cervezas', 'Bebidas', 'Snacks'],
        datasets: [{
          data: categoryTotals.length > 0 ? categoryTotals : [10, 10, 10, 10],
          backgroundColor: [red, fuchsia, blue, '#FFD700', '#22C55E', '#A855F7'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#aaa', font: { family: 'Outfit' } } }
        },
        cutout: '65%'
      }
    });

    // 3. Productos Alta Rotación (Barras)
    if (chartHighRotation) chartHighRotation.destroy();
    
    const highNames = data.highRotation.map(item => item.nombre.substring(0, 15));
    const highQty = data.highRotation.map(item => parseInt(item.cantidad));

    chartHighRotation = new Chart(ctxHigh, {
      type: 'bar',
      data: {
        labels: highNames.length > 0 ? highNames : ['Mistral 1L', 'Heineken 6P', 'CocaCola 2.5L', 'Vino CS', 'RedBull'],
        datasets: [{
          label: 'Unidades Vendidas',
          data: highQty.length > 0 ? highQty : [50, 40, 35, 30, 25],
          backgroundColor: blue,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#888' } },
          y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#888' } }
        }
      }
    });

    // 4. Productos Baja Rotación (Barras)
    if (chartLowRotation) chartLowRotation.destroy();
    
    const lowNames = data.lowRotation.map(item => item.nombre.substring(0, 15));
    const lowQty = data.lowRotation.map(item => parseInt(item.cantidad));

    chartLowRotation = new Chart(ctxLow, {
      type: 'bar',
      data: {
        labels: lowNames.length > 0 ? lowNames : ['Vino CyT', 'Papas Kryzpo'],
        datasets: [{
          label: 'Unidades Vendidas',
          data: lowQty.length > 0 ? lowQty : [2, 5],
          backgroundColor: '#3F3F46',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#888' } },
          y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#888' } }
        }
      }
    });

    // 5. Ranking de Clientes y Vendedores (Listas Top)
    const listClients = document.getElementById('bi-top-clients');
    listClients.innerHTML = data.topClients.map(c => `
      <li>
        <span>${c.nombre || 'Cliente General'}</span>
        <strong>${new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(c.total_gastado)}</strong>
      </li>
    `).join('') || '<li>No hay registros de clientes</li>';

    const listSellers = document.getElementById('bi-top-sellers');
    listSellers.innerHTML = data.topSellers.map(s => `
      <li>
        <span>${s.nombre}</span>
        <strong>${new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(s.total_vendido)}</strong>
      </li>
    `).join('') || '<li>No hay registros de vendedores</li>';

  } catch (err) {
    console.error('Error al construir gráficos de BI:', err);
  }
}

// Exportación CSV
document.getElementById('bi-export-csv-btn').addEventListener('click', async () => {
  try {
    const data = await apiFetch('/api/sales/history');
    if (data.success && data.sales.length > 0) {
      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += "Folio,Vendedor,Cliente,Fecha,Metodo Pago,Subtotal,IVA,Total,Descuento,Observacion\n";

      data.sales.forEach(s => {
        const row = [
          s.folio,
          `"${s.vendedor_nombre}"`,
          `"${s.cliente_nombre}"`,
          new Date(s.fecha_hora).toLocaleDateString('es-CL'),
          s.pago_metodo.toUpperCase(),
          s.subtotal,
          s.iva,
          s.total,
          s.descuento,
          `"${s.observacion || ''}"`
        ].join(",");
        csvContent += row + "\n";
      });

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Reporte_Ventas_Eleodoro_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Archivo CSV descargado con éxito.', 'success');
    } else {
      showToast('No existen ventas históricas para exportar.', 'warning');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Exportación PDF (Impresión del Dashboard estructurado)
document.getElementById('bi-export-pdf-btn').addEventListener('click', () => {
  window.print();
});

// -------------------------------------------------------------
// 2. PANEL DE ADMINISTRADOR Y CONFIGURACIONES
// -------------------------------------------------------------
async function loadAdminPanel() {
  // Manejo de clicks en Pestañas del Admin
  document.querySelectorAll('.admin-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.admin-tab-content .tab-pane').forEach(p => p.classList.remove('active-pane'));

      btn.classList.add('active');
      const targetTab = btn.getAttribute('data-tab');
      document.getElementById(`tab-${targetTab}`).classList.add('active-pane');
    });
  });

  await loadAdminUsers();
  await loadAdminAudit();
  await loadAdminLogs();
}

// Cargar Usuarios
async function loadAdminUsers() {
  const tbody = document.getElementById('admin-users-table-body');
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Cargando...</td></tr>`;

  try {
    const data = await apiFetch('/api/admin/users');
    if (data.success) {
      tbody.innerHTML = data.users.map(u => `
        <tr>
          <td><strong>${u.username}</strong></td>
          <td>${u.nombre}</td>
          <td>${u.email || 'N/A'}</td>
          <td><span class="badge" style="background:rgba(255, 0, 127, 0.15); color:var(--color-secondary); padding:4px 8px; border-radius:4px; font-weight:600;">${u.rol_nombre}</span></td>
          <td><span style="color:${u.estado === 'activo' ? '#22C55E' : 'var(--color-primary)'}; font-weight:600;">${u.estado.toUpperCase()}</span></td>
          <td class="actions-cell">
            <button class="btn-icon-secondary" onclick="openEditUserModal(${u.id})"><span class="material-icons-round" style="font-size:18px;">edit</span></button>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--color-primary);">${err.message}</td></tr>`;
  }
}

// Cargar Auditoría
async function loadAdminAudit() {
  const tbody = document.getElementById('admin-audit-table-body');
  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">Cargando registros...</td></tr>`;

  try {
    const data = await apiFetch('/api/admin/audit');
    if (data.success) {
      if (data.audit.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">No existen registros de auditoría.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.audit.map(a => `
        <tr>
          <td>${new Date(a.created_at).toLocaleString('es-CL')}</td>
          <td><strong>${a.usuario_nombre || 'Desconocido'}</strong></td>
          <td><span class="badge" style="background:#1e1e24; color:#fff; padding:2px 6px; font-size:11px;">${a.accion}</span></td>
          <td>${a.tabla_afectada}</td>
          <td>${a.registro_id || 'N/A'}</td>
          <td><span class="text-muted" style="font-size:11px;">${a.valor_anterior ? a.valor_anterior.substring(0, 40) + '...' : 'N/A'}</span></td>
          <td><span style="font-size:11px;">${a.valor_nuevo ? a.valor_nuevo.substring(0, 40) + '...' : 'N/A'}</span></td>
          <td><code>${a.ip_address}</code></td>
        </tr>
      `).join('');
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--color-primary);">${err.message}</td></tr>`;
  }
}

// Cargar Logs técnicos
async function loadAdminLogs() {
  const tbody = document.getElementById('admin-logs-table-body');
  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Cargando logs...</td></tr>`;

  try {
    const data = await apiFetch('/api/admin/logs');
    if (data.success) {
      if (data.logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No existen logs registrados.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.logs.map(l => {
        let logColor = '#888';
        if (l.nivel === 'ERROR' || l.nivel === 'FATAL') logColor = 'var(--color-primary)';
        if (l.nivel === 'WARNING') logColor = '#F97316';

        return `
          <tr>
            <td>${new Date(l.created_at).toLocaleString('es-CL')}</td>
            <td><strong style="color:${logColor};">${l.nivel}</strong></td>
            <td>${l.mensaje}</td>
            <td><span class="text-muted" style="font-size:11px;">${l.contexto ? l.contexto.substring(0, 50) + '...' : ''}</span></td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--color-primary);">${err.message}</td></tr>`;
  }
}

// Crear Usuario Form
document.getElementById('btn-admin-new-user').addEventListener('click', () => {
  document.getElementById('user-form').reset();
  document.getElementById('user-id-input').value = '';
  document.getElementById('usr-password').setAttribute('required', 'required');
  document.getElementById('user-modal-title').textContent = 'Crear Nuevo Usuario';
  showModal('modal-user');
});

// Guardar Usuario
document.getElementById('user-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('user-id-input').value;
  const username = document.getElementById('usr-username').value.trim();
  const password = document.getElementById('usr-password').value;
  const nombre = document.getElementById('usr-name').value.trim();
  const email = document.getElementById('usr-email').value.trim();
  const rol_id = parseInt(document.getElementById('usr-role').value);
  const estado = document.getElementById('usr-status').value;

  const payload = { username, nombre, email, rol_id, estado };
  if (password) payload.password = password;

  try {
    let res;
    if (id) {
      res = await apiFetch(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      res = await apiFetch('/api/admin/users', { method: 'POST', body: JSON.stringify(payload) });
    }

    if (res.success) {
      showToast('Usuario guardado con éxito.', 'success');
      closeModal('modal-user');
      loadAdminUsers();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
});

async function openEditUserModal(id) {
  try {
    // Para simplificar, obtenemos los datos directamente de la fila de la tabla o hacemos fetch
    const data = await apiFetch('/api/admin/users');
    const u = data.users.find(item => item.id === id);
    if (!u) return;

    document.getElementById('user-id-input').value = u.id;
    document.getElementById('usr-username').value = u.username;
    document.getElementById('usr-username').disabled = true; // No permitir cambiar username
    document.getElementById('usr-password').removeAttribute('required'); // No requerido en edición
    document.getElementById('usr-name').value = u.nombre;
    document.getElementById('usr-email').value = u.email || '';
    document.getElementById('usr-role').value = u.rol_id;
    document.getElementById('usr-status').value = u.estado;

    document.getElementById('user-modal-title').textContent = 'Editar Perfil de Usuario';
    showModal('modal-user');
  } catch (err) {
    showToast(err.message, 'error');
  }
}
