// app.js
// Lógica Principal de Cliente, Enrutador SPA, Estado Global, IndexedDB y Comunicaciones API

const AppState = {
  token: localStorage.getItem('token') || 'dummy-token-eleodoro',
  user: JSON.parse(localStorage.getItem('user')) || { id: 1, username: 'eleodoro', nombre: 'Eleodoro El Grande', rol: 'Administrador', db_mode: 'SQLite' },
  activeView: 'pos',
  dbMode: 'SQLite',
  products: [],
  categories: [],
  suppliers: [],
  customers: [],
  isOnline: navigator.onLine
};

// Configuración de las URL Base API
const API_URL = window.location.origin;

// -------------------------------------------------------------
// 1. INICIALIZACIÓN DE INDEXEDDB PARA TRABAJO FUERA DE LÍNEA
// -------------------------------------------------------------
let indexedDbInstance = null;

function initIndexedDB() {
  const request = indexedDB.open('EleodoroDB', 1);

  request.onerror = (event) => {
    console.error('Error al inicializar IndexedDB:', event.target.errorCode);
  };

  request.onsuccess = (event) => {
    indexedDbInstance = event.target.result;
    console.log('IndexedDB iniciada con éxito.');
    syncOfflineSales(); // Intentar sincronizar si hay pendientes
  };

  request.onupgradeneeded = (event) => {
    const db = event.target.result;
    // Cola de ventas offline
    if (!db.objectStoreNames.contains('salesQueue')) {
      db.createObjectStore('salesQueue', { keyPath: 'id', autoIncrement: true });
    }
    // Catálogo caché para buscar sin red
    if (!db.objectStoreNames.contains('cachedProducts')) {
      db.createObjectStore('cachedProducts', { keyPath: 'id' });
    }
  };
}

// -------------------------------------------------------------
// 2. CONEXIÓN API & LLAMADOS HTTP CON CABECERAS JWT
// -------------------------------------------------------------
async function apiFetch(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(AppState.token && { 'Authorization': `Bearer ${AppState.token}` }),
    ...options.headers
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers
  });

  if (response.status === 401 || response.status === 403) {
    // Token vencido o inexistente -> Cerrar sesión
    logout();
    throw new Error('Sesión vencida. Por favor, inicia sesión nuevamente.');
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Error en comunicación con API.');
  }

  return data;
}

// -------------------------------------------------------------
// 3. ENRUTADOR DE VISTAS SPA
// -------------------------------------------------------------
function navigateTo(viewId) {
  // Desactivar vistas actuales
  document.querySelectorAll('.app-view').forEach(view => {
    view.classList.remove('active-view');
  });

  // Activar vista seleccionada
  const targetView = document.getElementById(`view-${viewId}`);
  if (targetView) {
    targetView.classList.add('active-view');
    AppState.activeView = viewId;
    window.location.hash = viewId;
  }

  // Activar ítem en Sidebar
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
    item.classList.remove('active');
  });
  const activeNavItem = document.getElementById(`nav-${viewId}`) || document.getElementById(`nav-erp-${viewId}`);
  if (activeNavItem) {
    activeNavItem.classList.add('active');
  }

  // Actualizar Título Navbar Superior
  const titleMap = {
    'pos': 'Caja Registradora (POS)',
    'erp-ventas': 'Registro de Ventas & Cierre de Caja',
    'erp-despachos': 'Guías de Despacho (SII)',
    'erp-productos': 'Inventario & Stock (ERP)',
    'bi-dashboard': 'Business Intelligence SAP Dashboard',
    'erp-compras': 'Órdenes de Compra & Recepción',
    'erp-clientes': 'Registro de Clientes',
    'erp-proveedores': 'Registro de Proveedores',
    'admin-panel': 'Panel de Administración y Control'
  };
  
  const viewTitleEl = document.getElementById('view-title');
  if (viewTitleEl) {
    viewTitleEl.textContent = titleMap[viewId] || 'Panel General';
  }

  // Cargar módulos correspondientes al navegar
  triggerViewLoad(viewId);
}

function triggerViewLoad(viewId) {
  switch (viewId) {
    case 'pos':
      if (typeof initPOSModule === 'function') initPOSModule();
      break;
    case 'erp-ventas':
      if (typeof initSalesModule === 'function') initSalesModule();
      break;
    case 'erp-despachos':
      if (typeof initDespachosModule === 'function') initDespachosModule();
      break;
    case 'erp-productos':
      if (typeof initERPModule === 'function') loadProductsERP();
      break;
    case 'bi-dashboard':
      if (typeof initBIModule === 'function') loadBIDashboard();
      break;
    case 'erp-compras':
      if (typeof loadPurchasesERP === 'function') loadPurchasesERP();
      break;
    case 'erp-clientes':
      if (typeof loadClientsERP === 'function') loadClientsERP();
      break;
    case 'erp-proveedores':
      if (typeof loadSuppliersERP === 'function') loadSuppliersERP();
      break;
    case 'admin-panel':
      if (typeof loadAdminPanel === 'function') loadAdminPanel();
      break;
  }
}

// -------------------------------------------------------------
// 4. SISTEMA DE DIÁLOGOS (MODALES) Y NOTIFICACIONES (TOASTS)
// -------------------------------------------------------------
function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'info';
  if (type === 'success') icon = 'check_circle';
  if (type === 'warning') icon = 'warning';
  if (type === 'error') icon = 'error_outline';

  toast.innerHTML = `
    <span class="material-icons-round">${icon}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  // Auto-eliminar después de 3.5 segundos
  setTimeout(() => {
    toast.style.animation = 'slideInRight 0.3s ease-in reverse forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// -------------------------------------------------------------
// 5. AUTENTICACIÓN: LOGIN & LOGOUT
// -------------------------------------------------------------
async function handleLogin(e) {
  if (e && typeof e.preventDefault === 'function') {
    e.preventDefault();
  }
  sessionStorage.removeItem('manual_logout');
  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');
  const errorMsg = document.getElementById('login-error');

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  try {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    if (data.success) {
      AppState.token = data.token;
      AppState.user = data.user;
      AppState.dbMode = data.user.db_mode;

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      // Actualizar UI
      document.getElementById('user-display-name').textContent = data.user.nombre;
      document.getElementById('user-display-role').textContent = data.user.rol;
      document.getElementById('db-mode-badge').textContent = data.user.db_mode;

      // Ocultar Login y Mostrar App
      document.getElementById('login-container').className = 'login-view-hidden';
      document.getElementById('app-container').className = '';

      showToast(`¡Bienvenido de vuelta, ${data.user.nombre}!`, 'success');
      
      // Ir a POS
      navigateTo('pos');
    }
  } catch (err) {
    errorMsg.style.display = 'block';
    errorMsg.textContent = err.message;
    showToast(err.message, 'error');
  }
}

function logout(isManual) {
  console.log('Intento de cierre de sesión interceptado (Modo sin login activo).');
  if (!AppState.token || !AppState.user) {
    AppState.token = 'dummy-token-eleodoro';
    AppState.user = { id: 1, username: 'eleodoro', nombre: 'Eleodoro El Grande', rol: 'Administrador', db_mode: 'SQLite' };
    localStorage.setItem('token', AppState.token);
    localStorage.setItem('user', JSON.stringify(AppState.user));
  }
  document.getElementById('login-container').className = 'login-view-hidden';
  document.getElementById('app-container').className = '';
  showToast('Sesión permanente activa.', 'info');
}

async function autoLogin() {
  try {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'eleodoro' })
    });

    if (data.success) {
      AppState.token = data.token;
      AppState.user = data.user;
      AppState.dbMode = data.user.db_mode;

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      // Actualizar UI
      document.getElementById('user-display-name').textContent = data.user.nombre;
      document.getElementById('user-display-role').textContent = data.user.rol;
      document.getElementById('db-mode-badge').textContent = data.user.db_mode;

      // Ocultar Login y Mostrar App
      document.getElementById('login-container').className = 'login-view-hidden';
      document.getElementById('app-container').className = '';

      showToast(`¡Bienvenido de vuelta, ${data.user.nombre}!`, 'success');
      
      // Ir a POS
      navigateTo('pos');
      
      // Correr chequeo de stock inicial
      checkStockAlerts();
      // Chequeo periódico cada 5 minutos
      setInterval(checkStockAlerts, 300000);
    } else {
      logout();
    }
  } catch (err) {
    console.error('Error al iniciar sesión automáticamente:', err);
    logout();
  }
}

// -------------------------------------------------------------
// 6. CONTROL OFFLINE Y SINCRONIZACIÓN DE VENTAS COLA
// -------------------------------------------------------------
function updateOnlineStatus() {
  AppState.isOnline = navigator.onLine;
  const badge = document.getElementById('online-status-badge');
  const dot = badge.querySelector('.status-dot');
  const text = badge.querySelector('.status-text');

  if (AppState.isOnline) {
    dot.className = 'status-dot green';
    text.textContent = 'En línea';
    showToast('Conexión a internet restablecida. Sincronizando datos...', 'success');
    syncOfflineSales();
  } else {
    dot.className = 'status-dot orange';
    text.textContent = 'Fuera de línea (Modo Local)';
    showToast('Sin conexión. Las ventas se guardarán en tu dispositivo y se enviarán al volver a conectar.', 'warning');
  }
}

// Guardar venta de forma local en IndexedDB cuando no hay internet
function queueOfflineSale(saleData) {
  if (!indexedDbInstance) {
    showToast('Error de almacenamiento local. No se guardó la venta.', 'error');
    return;
  }

  const transaction = indexedDbInstance.transaction(['salesQueue'], 'readwrite');
  const store = transaction.objectStore('salesQueue');
  
  saleData.id = 'OFF-' + Date.now();
  saleData.sync_status = 'sin_sincronizar';
  
  const request = store.add(saleData);

  request.onsuccess = () => {
    showToast('Venta guardada localmente de forma segura en IndexedDB.', 'warning');
    // Actualizar inventario local si estamos offline
    updateLocalStockOffline(saleData.productos);
    // Si estamos en POS recargar catálogo
    if (AppState.activeView === 'pos') {
      setTimeout(() => initPOSModule(), 500);
    }
  };

  request.onerror = () => {
    showToast('Error al guardar venta en base de datos local.', 'error');
  };
}

// Actualizar el stock local en IndexedDB cuando se vende sin conexión
function updateLocalStockOffline(items) {
  const transaction = indexedDbInstance.transaction(['cachedProducts'], 'readwrite');
  const store = transaction.objectStore('cachedProducts');

  items.forEach(item => {
    const getReq = store.get(item.producto_id);
    getReq.onsuccess = (e) => {
      const product = e.target.result;
      if (product) {
        product.stock_actual -= item.cantidad;
        store.put(product);
      }
    };
  });
}

// Sincronizar las ventas acumuladas offline al servidor
function syncOfflineSales() {
  if (!AppState.isOnline || !indexedDbInstance) return;

  const transaction = indexedDbInstance.transaction(['salesQueue'], 'readwrite');
  const store = transaction.objectStore('salesQueue');
  const getAllRequest = store.getAll();

  getAllRequest.onsuccess = async (event) => {
    const sales = event.target.result;
    if (sales.length === 0) return;

    console.log(`[Sync] Sincronizando ${sales.length} ventas locales con el servidor...`);
    showToast(`Sincronizando ${sales.length} ventas guardadas localmente...`, 'info');

    for (const sale of sales) {
      try {
        const response = await fetch(`${API_URL}/api/sales`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${AppState.token}`
          },
          body: JSON.stringify(sale)
        });

        if (response.ok) {
          // Si sube correctamente, eliminar de la cola IndexedDB
          const deleteTrans = indexedDbInstance.transaction(['salesQueue'], 'readwrite');
          const deleteStore = deleteTrans.objectStore('salesQueue');
          deleteStore.delete(sale.id);
        }
      } catch (err) {
        console.error('Error al sincronizar venta offline:', err);
      }
    }

    setTimeout(() => {
      showToast('Sincronización de ventas locales finalizada.', 'success');
      // Recargar módulo actual para reflejar cambios
      triggerViewLoad(AppState.activeView);
    }, 1000);
  };
}

// -------------------------------------------------------------
// 7. CONFIGURACIÓN DE ALERTAS DE STOCK CRÍTICO
// -------------------------------------------------------------
async function checkStockAlerts() {
  if (!AppState.token || !AppState.isOnline) return;
  try {
    const data = await apiFetch('/api/inventory/alerts');
    if (data.success) {
      const countEl = document.getElementById('stock-alerts-count');
      const alertsCount = data.alerts.length;
      
      if (alertsCount > 0) {
        countEl.textContent = alertsCount;
        countEl.classList.remove('hide');
      } else {
        countEl.classList.add('hide');
      }
      
      // Cargar modal de alertas
      const alertsContainer = document.getElementById('alerts-list-body');
      if (alertsContainer) {
        if (alertsCount === 0) {
          alertsContainer.innerHTML = '<p class="text-muted">No existen productos bajo el stock mínimo de seguridad.</p>';
        } else {
          alertsContainer.innerHTML = data.alerts.map(a => `
            <div class="product-alert-item" style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--border-color);">
              <div>
                <strong>${a.nombre}</strong> (${a.codigo})<br>
                <small class="text-muted">Categoría: ${a.categoria_nombre || 'N/A'}</small>
              </div>
              <div style="text-align: right;">
                <span class="badge badge-error" style="color:var(--color-primary); font-weight:700;">Stock: ${a.stock_actual}</span><br>
                <small class="text-muted">Mínimo: ${a.stock_minimo}</small>
              </div>
            </div>
          `).join('');
        }
      }
    }
  } catch (err) {
    console.error('Error al obtener alertas de stock:', err.message);
  }
}

// -------------------------------------------------------------
// 8. LISTENERS DE INICIO DE LA APLICACIÓN
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // Inicializaciones
  initIndexedDB();
  updateOnlineStatus();

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  // Listener del Login Form
  document.getElementById('login-form').addEventListener('submit', handleLogin);

  // Listener para cerrar sesión
  document.getElementById('logout-btn').addEventListener('click', logout);

  // Asegurar credenciales en localStorage en modo sin login
  if (!localStorage.getItem('token') || !localStorage.getItem('user')) {
    localStorage.setItem('token', AppState.token);
    localStorage.setItem('user', JSON.stringify(AppState.user));
  }

  // Verificar si hay token previo
  if (AppState.token && AppState.user) {
    document.getElementById('user-display-name').textContent = AppState.user.nombre;
    document.getElementById('user-display-role').textContent = AppState.user.rol;
    document.getElementById('db-mode-badge').textContent = AppState.user.db_mode;
    document.getElementById('login-container').className = 'login-view-hidden';
    document.getElementById('app-container').className = '';
    
    // Restaurar última vista en Hash o ir a POS
    const hash = window.location.hash.substring(1);
    if (hash) {
      navigateTo(hash);
    } else {
      navigateTo('pos');
    }
    
    // Correr chequeo de stock inicial
    checkStockAlerts();
    // Chequeo periódico cada 5 minutos
    setInterval(checkStockAlerts, 300000);
  } else {
    logout();
  }

  // Interceptar clicks de barra lateral (SPA Router navigation)
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const href = item.getAttribute('href');
      if (href && href.startsWith('#')) {
        navigateTo(href.substring(1));
        
        // Cerrar sidebar en pantallas pequeñas después de navegar
        if (window.innerWidth <= 768) {
          document.getElementById('app-container').classList.remove('sidebar-open');
        }
      }
    });
  });

  // Toggle del Sidebar
  document.getElementById('sidebar-toggle-btn').addEventListener('click', () => {
    const appEl = document.getElementById('app-container');
    if (window.innerWidth <= 768) {
      appEl.classList.toggle('sidebar-open');
    } else {
      appEl.classList.toggle('sidebar-collapsed');
    }
  });

  // Switch de Temas (Claro / Oscuro)
  const themeToggle = document.getElementById('theme-toggle-btn');
  themeToggle.addEventListener('click', () => {
    const htmlEl = document.documentElement;
    const currentTheme = htmlEl.getAttribute('data-theme');
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    htmlEl.setAttribute('data-theme', nextTheme);
    themeToggle.querySelector('span').textContent = nextTheme === 'dark' ? 'light_mode' : 'dark_mode';
  });

  // Modales - Vincular botones de cerrar modal genéricos
  document.querySelectorAll('.modal-close-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal-overlay');
      if (modal) {
        modal.classList.remove('active');
      }
    });
  });

  // Botón Alertas Campana
  document.getElementById('stock-alerts-btn').addEventListener('click', () => {
    showModal('modal-alerts');
  });
});
