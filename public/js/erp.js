// erp.js
// Gestión de ERP: Inventario, Kardex, Proveedores, Clientes y Compras (Órdenes de Compra)

// -------------------------------------------------------------
// 1. GESTIÓN DE PRODUCTOS E INVENTARIO
// -------------------------------------------------------------
async function loadProductsERP() {
  const tbody = document.getElementById('erp-products-table-body');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">Cargando catálogo...</td></tr>`;

  try {
    const data = await apiFetch('/api/products');
    if (data.success) {
      AppState.products = data.products;
      renderProductsTable(data.products);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderProductsTable(products) {
  const tbody = document.getElementById('erp-products-table-body');
  if (!tbody) return;

  if (products.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted);">No hay productos registrados.</td></tr>`;
    return;
  }

  const fmt = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val);

  tbody.innerHTML = products.map(p => {
    let stockClass = 'badge badge-success';
    let stockStatus = 'Normal';
    let styleText = 'color:#22C55E;';

    const isAgotado = p.estado === 'agotado';

    if (isAgotado) {
      stockClass = 'badge badge-error';
      stockStatus = 'Agotado (Manual)';
      styleText = 'color:var(--color-primary); font-weight:700;';
    } else if (p.stock_actual <= 0) {
      stockClass = 'badge badge-error';
      stockStatus = 'Agotado';
      styleText = 'color:var(--color-primary); font-weight:700;';
    } else if (p.stock_actual <= p.stock_minimo) {
      stockClass = 'badge badge-warning';
      stockStatus = 'Crítico';
      styleText = 'color:#F97316; font-weight:700;';
    }

    const toggleIcon = isAgotado ? 'toggle_off' : 'toggle_on';
    const toggleColor = isAgotado ? 'color:var(--text-muted);' : 'color:#22C55E;';
    const toggleTitle = isAgotado ? 'Marcar como Activo' : 'Marcar como Agotado';

    return `
      <tr style="${isAgotado ? 'opacity:0.65; background:rgba(0,0,0,0.02);' : ''}">
        <td>
          <strong>${p.codigo}</strong><br>
          <small class="text-muted">${p.codigo_barra || 'Sin barras'}</small>
        </td>
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            ${p.imagen_url ? `<img src="${p.imagen_url}" width="32" height="32" style="object-fit:contain; border-radius:4px; background:#fff;">` : `<span class="material-icons-round text-muted">sports_bar</span>`}
            <div>
              <strong>${p.nombre}</strong><br>
              <small class="text-muted">Marca: ${p.marca || 'N/A'}</small>
            </div>
          </div>
        </td>
        <td>${p.categoria_nombre || 'N/A'}</td>
        <td>${fmt(p.precio_costo)}</td>
        <td>${fmt(p.precio_venta)}</td>
        <td><strong>${p.margen || '0.00'}%</strong></td>
        <td><strong style="${styleText}">${p.stock_actual}</strong></td>
        <td><span class="${stockClass}" style="${styleText}">${stockStatus}</span></td>
        <td class="actions-cell">
          <button class="btn-icon-secondary" onclick="toggleProductStatus(${p.id}, '${p.estado}')" title="${toggleTitle}">
            <span class="material-icons-round" style="font-size:24px; ${toggleColor}">${toggleIcon}</span>
          </button>
          <button class="btn-icon-secondary" onclick="openEditProductModal(${p.id})" title="Editar"><span class="material-icons-round" style="font-size:18px;">edit</span></button>
          <button class="btn-icon-secondary" onclick="handleDeleteProduct(${p.id})" title="Eliminar"><span class="material-icons-round" style="font-size:18px; color:var(--color-primary);">delete</span></button>
        </td>
      </tr>
    `;
  }).join('');
}

async function toggleProductStatus(id, currentStatus) {
  try {
    const res = await apiFetch(`/api/products/${id}/toggle-status`, {
      method: 'PATCH'
    });
    if (res.success) {
      showToast(`Estado del producto cambiado a ${res.estado.toUpperCase()}`, 'success');
      loadProductsERP();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Abrir modal de creación
document.getElementById('btn-erp-new-product').addEventListener('click', async () => {
  document.getElementById('product-form').reset();
  document.getElementById('product-id-input').value = '';
  document.getElementById('product-modal-title').textContent = 'Registrar Nuevo Producto';
  
  // Mostrar inputs de stock inicial solo en creación
  document.getElementById('stock-inputs-wrapper').classList.remove('hide');
  
  await loadCategoriesDropdown();
  await loadSuppliersDropdown();
  document.getElementById('prod-margin-preview').textContent = '0.00%';

  showModal('modal-product');
});

async function loadCategoriesDropdown(selectId = 'prod-category') {
  try {
    const data = await apiFetch('/api/categories');
    if (data.success) {
      AppState.categories = data.categories;
      const select = document.getElementById(selectId);
      if (select) {
        select.innerHTML = '<option value="">-- Seleccionar Categoría --</option>' + data.categories.map(c => `
          <option value="${c.id}">${c.nombre}</option>
        `).join('');
      }
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadSuppliersDropdown(selectId = 'prod-supplier') {
  try {
    const data = await apiFetch('/api/suppliers');
    if (data.success) {
      AppState.suppliers = data.suppliers;
      const select = document.getElementById(selectId);
      if (select) {
        select.innerHTML = '<option value="">-- Seleccionar Proveedor --</option>' + data.suppliers.map(s => `
          <option value="${s.id}">${s.nombre}</option>
        `).join('');
      }
    }
  } catch (err) {
    console.error(err);
  }
}

// Previsualización dinámica de margen comercial
const costInput = document.getElementById('prod-cost');
const priceInput = document.getElementById('prod-price');
const marginPreview = document.getElementById('prod-margin-preview');

function updateMarginPreview() {
  const cost = parseFloat(costInput.value) || 0;
  const price = parseFloat(priceInput.value) || 0;

  if (price > 0) {
    const margin = (((price - cost) / price) * 100).toFixed(2);
    marginPreview.textContent = `${margin}%`;
  } else {
    marginPreview.textContent = '0.00%';
  }
}
costInput.addEventListener('input', updateMarginPreview);
priceInput.addEventListener('input', updateMarginPreview);

// Guardar / Editar Producto
document.getElementById('product-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('product-id-input').value;
  const payload = {
    codigo: document.getElementById('prod-code').value.trim(),
    sku: document.getElementById('prod-sku').value.trim(),
    codigo_barra: document.getElementById('prod-barcode').value.trim(),
    nombre: document.getElementById('prod-name').value.trim(),
    categoria_id: parseInt(document.getElementById('prod-category').value) || null,
    marca: document.getElementById('prod-brand').value.trim(),
    proveedor_id: parseInt(document.getElementById('prod-supplier').value) || null,
    precio_costo: parseFloat(document.getElementById('prod-cost').value) || 0,
    precio_venta: parseFloat(document.getElementById('prod-price').value) || 0,
    stock_actual: parseInt(document.getElementById('prod-stock').value) || 0,
    stock_minimo: parseInt(document.getElementById('prod-min-stock').value) || 5,
    imagen_url: document.getElementById('prod-image').value.trim(),
    descripcion: document.getElementById('prod-desc').value.trim(),
  };

  try {
    let res;
    if (id) {
      // Editar
      res = await apiFetch(`/api/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    } else {
      // Crear
      res = await apiFetch('/api/products', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }

    if (res.success) {
      showToast('Producto guardado correctamente en el ERP.', 'success');
      closeModal('modal-product');
      loadProductsERP();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
});

async function openEditProductModal(id) {
  try {
    const product = AppState.products.find(p => p.id === id);
    if (!product) return;

    await loadCategoriesDropdown();
    await loadSuppliersDropdown();

    document.getElementById('product-id-input').value = product.id;
    document.getElementById('prod-code').value = product.codigo;
    document.getElementById('prod-sku').value = product.sku || '';
    document.getElementById('prod-barcode').value = product.codigo_barra || '';
    document.getElementById('prod-name').value = product.nombre;
    document.getElementById('prod-category').value = product.categoria_id || '';
    document.getElementById('prod-brand').value = product.marca || '';
    document.getElementById('prod-supplier').value = product.proveedor_id || '';
    document.getElementById('prod-cost').value = product.precio_costo;
    document.getElementById('prod-price').value = product.precio_venta;
    document.getElementById('prod-min-stock').value = product.stock_minimo;
    document.getElementById('prod-image').value = product.imagen_url || '';
    document.getElementById('prod-desc').value = product.descripcion || '';

    // Ocultar campo de stock (se maneja solo por ajustes en el ERP)
    document.getElementById('stock-inputs-wrapper').classList.add('hide');

    updateMarginPreview();
    document.getElementById('product-modal-title').textContent = 'Modificar Ficha de Producto';
    showModal('modal-product');
  } catch (err) {
    console.error(err);
  }
}

async function handleDeleteProduct(id) {
  if (confirm('¿Está seguro que desea eliminar este producto? Esto impedirá su venta en el POS.')) {
    try {
      const data = await apiFetch(`/api/products/${id}`, { method: 'DELETE' });
      if (data.success) {
        showToast(data.message, 'success');
        loadProductsERP();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

// Filtro rápido buscador ERP
const searchInput = document.getElementById('erp-products-search');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    const filtered = AppState.products.filter(p => 
      p.nombre.toLowerCase().includes(term) ||
      p.codigo.toLowerCase().includes(term) ||
      (p.sku && p.sku.toLowerCase().includes(term)) ||
      (p.categoria_nombre && p.categoria_nombre.toLowerCase().includes(term))
    );
    renderProductsTable(filtered);
  });
}

// -------------------------------------------------------------
// 2. KARDEX Y AJUSTES DE INVENTARIO MANUALES
// -------------------------------------------------------------
// Abrir modal de Ajustes
document.getElementById('btn-erp-adjustments').addEventListener('click', () => {
  const select = document.getElementById('adj-product');
  select.innerHTML = AppState.products.map(p => `
    <option value="${p.id}">${p.nombre} (Stock actual: ${p.stock_actual})</option>
  `).join('');
  
  document.getElementById('adjustment-form').reset();
  showModal('modal-adjustment');
});

// Guardar Movimiento de Stock
document.getElementById('adjustment-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = {
    producto_id: parseInt(document.getElementById('adj-product').value),
    tipo_movimiento: document.getElementById('adj-type').value,
    cantidad: parseInt(document.getElementById('adj-quantity').value),
    motivo: document.getElementById('adj-reason').value.trim()
  };

  try {
    const data = await apiFetch('/api/inventory/movements', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (data.success) {
      showToast('Movimiento de stock registrado y Kardex actualizado.', 'success');
      closeModal('modal-adjustment');
      loadProductsERP(); // Recargar tabla
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Ver Historial Kardex
document.getElementById('btn-erp-kardex').addEventListener('click', async () => {
  const tbody = document.getElementById('kardex-table-body');
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Cargando movimientos...</td></tr>`;
  showModal('modal-kardex');

  try {
    const data = await apiFetch('/api/inventory/kardex');
    if (data.success) {
      if (data.kardex.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">No existen registros en el Kardex.</td></tr>`;
        return;
      }

      const movementNames = {
        'ingreso_compra': 'Ingreso: Compra Factura (+)',
        'ingreso_ajuste': 'Ingreso: Ajuste Manual (+)',
        'egreso_venta': 'Egreso: Venta Boleta (-)',
        'egreso_ajuste': 'Egreso: Ajuste Manual (-)',
        'egreso_perdida': 'Egreso: Pérdida/Robo (-)',
        'egreso_merma': 'Egreso: Merma/Vencimiento (-)',
        'transferencia_entrada': 'Ingreso: Transferencia Bodega (+)',
        'transferencia_salida': 'Egreso: Transferencia Bodega (-)'
      };

      tbody.innerHTML = data.kardex.map(k => `
        <tr>
          <td>${new Date(k.created_at).toLocaleString('es-CL')}</td>
          <td><strong>${k.producto_codigo}</strong></td>
          <td>${k.producto_nombre}</td>
          <td><span style="font-weight:600; color:${k.tipo_movimiento.startsWith('ingreso') ? '#22C55E' : 'var(--color-primary)'};">${movementNames[k.tipo_movimiento] || k.tipo_movimiento}</span></td>
          <td><strong>${k.cantidad}</strong></td>
          <td>${k.usuario_nombre || 'Sist. Externo'}</td>
          <td>${k.motivo}</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// -------------------------------------------------------------
// 3. ÓRDENES DE COMPRA (ERP COMPRAS)
// -------------------------------------------------------------
let purchaseItems = [];

async function loadPurchasesERP() {
  const tbody = document.getElementById('erp-purchases-table-body');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Cargando compras...</td></tr>`;

  try {
    const data = await apiFetch('/api/purchases');
    if (data.success) {
      if (data.purchases.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No hay órdenes de compra.</td></tr>`;
        return;
      }

      const fmt = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val);

      tbody.innerHTML = data.purchases.map(p => `
        <tr>
          <td><strong>${p.folio_compra}</strong></td>
          <td>${p.proveedor_nombre || 'N/A'}</td>
          <td>${new Date(p.fecha_pedido).toLocaleDateString('es-CL')}</td>
          <td>${fmt(p.total)}</td>
          <td><span class="badge badge-success" style="color:#22C55E;">Recibido e Ingresado</span></td>
          <td>
            <button class="btn-secondary" style="padding:6px 12px; font-size:11px;" onclick="showToast('Cargando visualizador de Factura OC...', 'info')">
              <span class="material-icons-round" style="font-size:14px;">visibility</span> Ver
            </button>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Nueva Compra Modal
document.getElementById('btn-erp-new-purchase').addEventListener('click', async () => {
  purchaseItems = [];
  document.getElementById('purchase-form').reset();
  
  // Cargar dropdowns
  await loadSuppliersDropdown('pur-supplier');
  
  // Cargar productos en item selection
  const prodSelect = document.getElementById('pur-item-select');
  prodSelect.innerHTML = AppState.products.map(p => `
    <option value="${p.id}" data-cost="${p.precio_costo}">${p.nombre}</option>
  `).join('');

  // Sincronizar costo unitario por defecto
  prodSelect.addEventListener('change', (e) => {
    const selectedOpt = e.target.options[e.target.selectedIndex];
    document.getElementById('pur-item-cost').value = selectedOpt.getAttribute('data-cost') || 0;
  });
  if (prodSelect.options.length > 0) {
    document.getElementById('pur-item-cost').value = prodSelect.options[0].getAttribute('data-cost') || 0;
  }

  renderPurchaseItems();
  showModal('modal-purchase');
});

// Agregar item a orden de compra temporal
document.getElementById('btn-add-item-purchase').addEventListener('click', () => {
  const prodSelect = document.getElementById('pur-item-select');
  const prodId = parseInt(prodSelect.value);
  const prodName = prodSelect.options[prodSelect.selectedIndex].text;
  const qty = parseInt(document.getElementById('pur-item-qty').value) || 0;
  const cost = parseFloat(document.getElementById('pur-item-cost').value) || 0;

  if (qty <= 0 || cost <= 0) {
    showToast('Cantidad y Costo deben ser mayores a cero.', 'warning');
    return;
  }

  // Si ya existe
  const exist = purchaseItems.find(i => i.producto_id === prodId);
  if (exist) {
    exist.cantidad += qty;
    exist.subtotal = exist.cantidad * exist.precio_costo;
  } else {
    purchaseItems.push({
      producto_id: prodId,
      nombre: prodName,
      cantidad: qty,
      precio_costo: cost,
      subtotal: qty * cost
    });
  }

  renderPurchaseItems();
});

function renderPurchaseItems() {
  const tbody = document.getElementById('purchase-items-list-body');
  const fmt = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val);
  
  if (purchaseItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No se han agregado productos.</td></tr>`;
    document.getElementById('purchase-total-value').textContent = '$0';
    return;
  }

  tbody.innerHTML = purchaseItems.map((item, idx) => `
    <tr>
      <td>${item.nombre}</td>
      <td>${item.cantidad}</td>
      <td>${fmt(item.precio_costo)}</td>
      <td>${fmt(item.subtotal)}</td>
      <td>
        <button type="button" class="btn-text-error" onclick="removePurchaseItem(${idx})">Eliminar</button>
      </td>
    </tr>
  `).join('');

  const total = purchaseItems.reduce((s, i) => s + i.subtotal, 0);
  document.getElementById('purchase-total-value').textContent = fmt(total);
}

function removePurchaseItem(idx) {
  purchaseItems.splice(idx, 1);
  renderPurchaseItems();
}

// Enviar Compra final
document.getElementById('purchase-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  if (purchaseItems.length === 0) {
    showToast('Debe agregar al menos un artículo a la lista de compra.', 'warning');
    return;
  }

  const payload = {
    proveedor_id: parseInt(document.getElementById('pur-supplier').value),
    productos: purchaseItems,
    total: purchaseItems.reduce((s, i) => s + i.subtotal, 0)
  };

  try {
    const data = await apiFetch('/api/purchases', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (data.success) {
      showToast('Orden de compra recepcionada. El stock del inventario se actualizó.', 'success');
      closeModal('modal-purchase');
      loadPurchasesERP();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// -------------------------------------------------------------
// 4. CLIENTES CRUD
// -------------------------------------------------------------
async function loadClientsERP() {
  const tbody = document.getElementById('erp-clients-table-body');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Cargando clientes...</td></tr>`;

  try {
    const data = await apiFetch('/api/customers');
    if (data.success) {
      AppState.customers = data.customers;
      renderClientsTable(data.customers);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderClientsTable(customers) {
  const tbody = document.getElementById('erp-clients-table-body');
  const countText = document.getElementById('erp-clients-count-text');
  if (!tbody) return;

  const total = AppState.customers ? AppState.customers.length : (customers ? customers.length : 0);
  if (countText) {
    if (customers && customers.length === total) {
      countText.textContent = `${total} Clientes`;
    } else {
      countText.textContent = `${customers ? customers.length : 0} de ${total} Clientes`;
    }
  }

  if (!customers || customers.length === 0) {
    const searchVal = (document.getElementById('erp-clients-search')?.value || '').trim();
    if (searchVal) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 32px; color:var(--text-muted);">
        <span class="material-icons-round" style="font-size: 40px; display:block; margin-bottom:8px; opacity:0.4;">search_off</span>
        No se encontraron clientes que coincidan con <strong>"${searchVal.replace(/</g, '&lt;').replace(/>/g, '&gt;')}"</strong>.
      </td></tr>`;
    } else {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 24px; color:var(--text-muted);">No hay clientes registrados.</td></tr>`;
    }
    return;
  }

  tbody.innerHTML = customers.map(c => `
    <tr>
      <td><strong>${c.rut_o_nit}</strong></td>
      <td><span style="font-weight:600;">${c.nombre}</span></td>
      <td>${c.telefono || '<span style="color:var(--text-muted);">N/A</span>'}</td>
      <td>${c.email || '<span style="color:var(--text-muted);">N/A</span>'}</td>
      <td>${c.direccion || '<span style="color:var(--text-muted);">N/A</span>'}</td>
      <td class="actions-cell">
        <div style="display: flex; gap: 6px; align-items: center; justify-content: flex-end;">
          <button class="btn-secondary" onclick="openEditClientModal(${c.id})" style="padding: 6px 12px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; border-radius: 6px; background: rgba(0, 112, 243, 0.18); color: #38bdf8; border: 1px solid rgba(0, 112, 243, 0.35); cursor: pointer;" title="Editar y actualizar datos de ${c.nombre.replace(/"/g, '&quot;')}">
            <span class="material-icons-round" style="font-size: 15px;">edit</span> Editar
          </button>
          <button class="btn-secondary" onclick="handleDeleteClient(${c.id})" style="padding: 6px 10px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; border-radius: 6px; background: rgba(229, 9, 20, 0.12); color: #f87171; border: 1px solid rgba(229, 9, 20, 0.25); cursor: pointer;" title="Eliminar cliente">
            <span class="material-icons-round" style="font-size: 15px;">delete</span>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

// -------------------------------------------------------------
// BUSCADOR INTELIGENTE DE CLIENTES (RUT, Nombre, Comuna, Teléfono, Email)
// -------------------------------------------------------------
function handleSmartClientSearch() {
  const input = document.getElementById('erp-clients-search');
  const clearBtn = document.getElementById('erp-clients-search-clear');
  if (!input || !AppState.customers) return;

  const query = input.value.trim();
  if (clearBtn) {
    clearBtn.style.display = query.length > 0 ? 'block' : 'none';
  }

  if (!query) {
    renderClientsTable(AppState.customers);
    return;
  }

  // Términos de búsqueda normalizados (sin tildes, en minúsculas)
  const terms = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 0);

  const filtered = AppState.customers.filter(c => {
    const rutClean = (c.rut_o_nit || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const rutRaw = (c.rut_o_nit || '').toLowerCase();
    const nombreNorm = (c.nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const dirNorm = (c.direccion || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const telNorm = (c.telefono || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const emailNorm = (c.email || '').toLowerCase();

    return terms.every(term => {
      const termClean = term.replace(/[^a-z0-9]/g, '');
      return (
        nombreNorm.includes(term) ||
        dirNorm.includes(term) ||
        emailNorm.includes(term) ||
        rutRaw.includes(term) ||
        (termClean.length > 0 && rutClean.includes(termClean)) ||
        (termClean.length > 0 && telNorm.includes(termClean))
      );
    });
  });

  renderClientsTable(filtered);
}

// Escuchadores de eventos para el buscador inteligente
document.addEventListener('DOMContentLoaded', () => {
  const clientSearchInput = document.getElementById('erp-clients-search');
  if (clientSearchInput) {
    clientSearchInput.addEventListener('input', handleSmartClientSearch);
  }
  const clientSearchClear = document.getElementById('erp-clients-search-clear');
  if (clientSearchClear) {
    clientSearchClear.addEventListener('click', () => {
      if (clientSearchInput) {
        clientSearchInput.value = '';
        handleSmartClientSearch();
        clientSearchInput.focus();
      }
    });
  }
});

// También enlazar inmediatamente por si el DOM ya cargó
const clientSearchInput = document.getElementById('erp-clients-search');
if (clientSearchInput) {
  clientSearchInput.addEventListener('input', handleSmartClientSearch);
}
const clientSearchClear = document.getElementById('erp-clients-search-clear');
if (clientSearchClear) {
  clientSearchClear.addEventListener('click', () => {
    if (clientSearchInput) {
      clientSearchInput.value = '';
      handleSmartClientSearch();
      clientSearchInput.focus();
    }
  });
}

document.getElementById('btn-erp-new-client').addEventListener('click', () => {
  document.getElementById('client-form').reset();
  document.getElementById('client-id-input').value = '';
  document.getElementById('client-modal-title').textContent = 'Registrar Cliente';
  showModal('modal-client');
});

// Listener de Exportación a Excel de Clientes
document.getElementById('btn-erp-export-clients').addEventListener('click', exportClientsToCSV);

document.getElementById('client-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('client-id-input').value;
  const payload = {
    rut_o_nit: document.getElementById('cli-rut').value.trim(),
    nombre: document.getElementById('cli-name').value.trim(),
    telefono: document.getElementById('cli-phone').value.trim(),
    email: document.getElementById('cli-email').value.trim(),
    direccion: document.getElementById('cli-dir').value.trim()
  };

  try {
    let res;
    if (id) {
      res = await apiFetch(`/api/customers/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      res = await apiFetch('/api/customers', { method: 'POST', body: JSON.stringify(payload) });
    }

    if (res.success) {
      showToast('Cliente guardado exitosamente.', 'success');
      closeModal('modal-client');
      if (AppState.activeView === 'pos') {
        loadPOSCustomers();
      } else {
        loadClientsERP();
      }
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
});

function openEditClientModal(id) {
  const c = AppState.customers.find(item => item.id === id);
  if (!c) return;

  document.getElementById('client-id-input').value = c.id;
  document.getElementById('cli-rut').value = c.rut_o_nit;
  document.getElementById('cli-name').value = c.nombre;
  document.getElementById('cli-phone').value = c.telefono || '';
  document.getElementById('cli-email').value = c.email || '';
  document.getElementById('cli-dir').value = c.direccion || '';

  document.getElementById('client-modal-title').textContent = 'Modificar Datos de Cliente';
  showModal('modal-client');
}

async function handleDeleteClient(id) {
  if (confirm('¿Está seguro de eliminar a este cliente?')) {
    try {
      const data = await apiFetch(`/api/customers/${id}`, { method: 'DELETE' });
      if (data.success) {
        showToast(data.message, 'success');
        loadClientsERP();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

// Exportar Clientes a Excel (CSV con formato compatible)
function exportClientsToCSV() {
  if (!AppState.customers || AppState.customers.length === 0) {
    showToast('No hay clientes cargados para exportar.', 'warning');
    return;
  }

  // BOM para compatibilidad automática de Excel en español
  let csv = "\ufeffRUT;Nombre Comercial;Teléfono;Email;Dirección\n";
  AppState.customers.forEach(c => {
    const rut = c.rut_o_nit || '';
    const nombre = c.nombre || '';
    const telefono = c.telefono || 'N/A';
    const email = c.email || 'N/A';
    const direccion = c.direccion || 'N/A';
    
    // Escapar caracteres problemáticos
    const safeNombre = nombre.replace(/"/g, '""').replace(/;/g, ',');
    const safeDir = direccion.replace(/"/g, '""').replace(/;/g, ',');

    csv += `${rut};"${safeNombre}";${telefono};${email};"${safeDir}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `Listado_Clientes_${new Date().toLocaleDateString('es-CL').replace(/\//g, '-')}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('Listado de clientes exportado con éxito.', 'success');
}

// -------------------------------------------------------------
// 5. PROVEEDORES CRUD
// -------------------------------------------------------------
async function loadSuppliersERP() {
  const tbody = document.getElementById('erp-suppliers-table-body');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Cargando proveedores...</td></tr>`;

  try {
    const data = await apiFetch('/api/suppliers');
    if (data.success) {
      AppState.suppliers = data.suppliers;
      renderSuppliersTable(data.suppliers);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderSuppliersTable(suppliers) {
  const tbody = document.getElementById('erp-suppliers-table-body');
  if (!tbody) return;

  if (suppliers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No hay proveedores registrados.</td></tr>`;
    return;
  }

  tbody.innerHTML = suppliers.map(s => `
    <tr>
      <td><strong>${s.rut_o_nit}</strong></td>
      <td>${s.nombre}</td>
      <td>${s.contacto || 'N/A'}</td>
      <td>${s.telefono || 'N/A'}</td>
      <td>${s.email || 'N/A'}</td>
      <td class="actions-cell">
        <button class="btn-icon-secondary" onclick="openEditSupplierModal(${s.id})"><span class="material-icons-round" style="font-size:18px;">edit</span></button>
        <button class="btn-icon-secondary" onclick="handleDeleteSupplier(${s.id})"><span class="material-icons-round" style="font-size:18px; color:var(--color-primary);">delete</span></button>
      </td>
    </tr>
  `).join('');
}

document.getElementById('btn-erp-new-supplier').addEventListener('click', () => {
  document.getElementById('supplier-form').reset();
  document.getElementById('supplier-id-input').value = '';
  document.getElementById('supplier-modal-title').textContent = 'Registrar Proveedor';
  showModal('modal-supplier');
});

document.getElementById('supplier-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('supplier-id-input').value;
  const payload = {
    rut_o_nit: document.getElementById('sup-rut').value.trim(),
    nombre: document.getElementById('sup-name').value.trim(),
    contacto: document.getElementById('sup-contact').value.trim(),
    telefono: document.getElementById('sup-phone').value.trim(),
    email: document.getElementById('sup-email').value.trim(),
    direccion: document.getElementById('sup-dir').value.trim()
  };

  try {
    let res;
    if (id) {
      res = await apiFetch(`/api/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      res = await apiFetch('/api/suppliers', { method: 'POST', body: JSON.stringify(payload) });
    }

    if (res.success) {
      showToast('Proveedor guardado con éxito.', 'success');
      closeModal('modal-supplier');
      loadSuppliersERP();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
});

function openEditSupplierModal(id) {
  const s = AppState.suppliers.find(item => item.id === id);
  if (!s) return;

  document.getElementById('supplier-id-input').value = s.id;
  document.getElementById('sup-rut').value = s.rut_o_nit;
  document.getElementById('sup-name').value = s.nombre;
  document.getElementById('sup-contact').value = s.contacto || '';
  document.getElementById('sup-phone').value = s.telefono || '';
  document.getElementById('sup-email').value = s.email || '';
  document.getElementById('sup-dir').value = s.direccion || '';

  document.getElementById('supplier-modal-title').textContent = 'Modificar Ficha de Proveedor';
  showModal('modal-supplier');
}

async function handleDeleteSupplier(id) {
  if (confirm('¿Está seguro de eliminar este proveedor?')) {
    try {
      const data = await apiFetch(`/api/suppliers/${id}`, { method: 'DELETE' });
      if (data.success) {
        showToast(data.message, 'success');
        loadSuppliersERP();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

// -------------------------------------------------------------
// 5. GESTIÓN DE VENTAS E HISTORIAL DIARIO (CIERRE DE CAJA)
// -------------------------------------------------------------
let allSalesCached = [];

async function initSalesModule() {
  const searchInput = document.getElementById('erp-sales-search');
  if (searchInput) {
    // Escuchar búsqueda y filtrar tabla
    searchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase().trim();
      const filtered = allSalesCached.filter(s => 
        s.folio.toLowerCase().includes(term) ||
        (s.cliente_nombre && s.cliente_nombre.toLowerCase().includes(term)) ||
        (s.vendedor_nombre && s.vendedor_nombre.toLowerCase().includes(term))
      );
      renderSalesTable(filtered);
    });
  }

  // Cierre de caja
  document.getElementById('btn-cash-close').onclick = openCashCloseModal;
  // Reporte Diario
  document.getElementById('btn-sales-report').onclick = exportDailyReport;
  
  // Imprimir Cierre
  document.getElementById('btn-print-cash-close').onclick = () => {
    window.print();
  };

  // WhatsApp Cierre
  document.getElementById('btn-wsp-cash-close').onclick = shareCashCloseWsp;
  // Email Cierre
  document.getElementById('btn-email-cash-close').onclick = emailCashCloseReport;

  await loadSalesHistory();
}

async function loadSalesHistory() {
  const tbody = document.getElementById('sales-table-body');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">Cargando historial de ventas...</td></tr>`;

  try {
    const data = await apiFetch('/api/sales/history');
    if (data.success) {
      allSalesCached = data.sales;
      renderSalesTable(data.sales);
      calculateDailyMetrics(data.sales);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderSalesTable(sales) {
  const tbody = document.getElementById('sales-table-body');
  if (!tbody) return;

  if (sales.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--text-muted);">No se registraron ventas en el sistema.</td></tr>`;
    return;
  }

  const fmt = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val);

  tbody.innerHTML = sales.map(s => {
    const dateStr = new Date(s.fecha_hora).toLocaleString('es-CL');
    return `
      <tr>
        <td><strong>${s.folio}</strong></td>
        <td>${dateStr}</td>
        <td>${s.cliente_nombre || 'Cliente General'}</td>
        <td>${s.vendedor_nombre || 'Vendedor'}</td>
        <td><span class="badge badge-info" style="font-size:10px; text-transform:uppercase;">${s.pago_metodo || 'Efectivo'}</span></td>
        <td>${fmt(s.descuento || 0)}</td>
        <td><strong>${fmt(s.total)}</strong></td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn-text-primary" onclick="viewSalesBoleta('${s.folio}')" title="Ver Boleta" style="background:none; border:none; cursor:pointer;">
              <span class="material-icons-round" style="font-size:18px; color:var(--color-primary);">receipt</span>
            </button>
            <button class="btn-text-secondary" onclick="shareClientWspDirect('${s.folio}', '${s.cliente_nombre || ''}', '${s.cliente_telefono || ''}')" title="WhatsApp" style="background:none; border:none; cursor:pointer;">
              <span class="material-icons-round" style="font-size:18px; color:#25D366;">share</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function calculateDailyMetrics(sales) {
  const today = new Date().toDateString();
  
  // Filtrar ventas de hoy
  const todaySales = sales.filter(s => new Date(s.fecha_hora).toDateString() === today);
  
  const total = todaySales.reduce((sum, s) => sum + parseFloat(s.total), 0);
  const count = todaySales.length;
  const avg = count > 0 ? Math.round(total / count) : 0;
  const discounts = todaySales.reduce((sum, s) => sum + parseFloat(s.descuento || 0), 0);

  const fmt = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val);

  document.getElementById('sales-today-amount').textContent = fmt(total);
  document.getElementById('sales-today-count').textContent = count;
  document.getElementById('sales-average-ticket').textContent = fmt(avg);
  document.getElementById('sales-today-discounts').textContent = fmt(discounts);
}

// Abre el arqueo diario
function openCashCloseModal() {
  const today = new Date().toDateString();
  const todaySales = allSalesCached.filter(s => new Date(s.fecha_hora).toDateString() === today);
  
  const total = todaySales.reduce((sum, s) => sum + parseFloat(s.total), 0);
  const count = todaySales.length;
  const discounts = todaySales.reduce((sum, s) => sum + parseFloat(s.descuento || 0), 0);

  // Desglose
  let cash = 0, card = 0, trans = 0, mixed = 0;
  todaySales.forEach(s => {
    const method = (s.pago_metodo || '').toLowerCase();
    if (method === 'efectivo') cash += parseFloat(s.total);
    else if (method === 'mixto') mixed += parseFloat(s.total);
    else if (method.includes('transferencia')) trans += parseFloat(s.total);
    else card += parseFloat(s.total); // debito, credito
  });

  const profit = Math.round(total * 0.35); // 35% de margen estimado

  const fmt = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val);

  document.getElementById('cash-close-date').textContent = `Fecha: ${new Date().toLocaleDateString('es-CL')}`;
  document.getElementById('cc-total-sales').textContent = fmt(total);
  document.getElementById('cc-tx-count').textContent = count;
  document.getElementById('cc-discounts').textContent = fmt(discounts);
  document.getElementById('cc-pay-cash').textContent = fmt(cash);
  document.getElementById('cc-pay-card').textContent = fmt(card);
  document.getElementById('cc-pay-trans').textContent = fmt(trans);
  document.getElementById('cc-pay-mixed').textContent = fmt(mixed);
  document.getElementById('cc-profit').textContent = fmt(profit);

  showModal('modal-cash-close');
}

// Compartir Cierre WhatsApp
function shareCashCloseWsp() {
  const date = new Date().toLocaleDateString('es-CL');
  const total = document.getElementById('cc-total-sales').textContent;
  const count = document.getElementById('cc-tx-count').textContent;
  const profit = document.getElementById('cc-profit').textContent;

  const text = `*ELEODORO EL GRANDE - ARQUEO DIARIO*\n` +
    `*Fecha:* ${date}\n` +
    `---------------------------------------\n` +
    `*Ventas Totales:* ${total}\n` +
    `*Boletas Emitidas:* ${count}\n` +
    `*Efectivo:* ${document.getElementById('cc-pay-cash').textContent}\n` +
    `*Tarjeta:* ${document.getElementById('cc-pay-card').textContent}\n` +
    `*Transferencia:* ${document.getElementById('cc-pay-trans').textContent}\n` +
    `*Pago Mixto:* ${document.getElementById('cc-pay-mixed').textContent}\n` +
    `---------------------------------------\n` +
    `*Utilidad Estimada (35%):* ${profit}\n` +
    `Cierre de caja generado con éxito.`;

  window.open(`https://wa.me/56989784973?text=${encodeURIComponent(text)}`, '_blank');
  showToast('Abriendo enlace de envío WhatsApp...', 'success');
}

// Enviar Cierre Correo
async function emailCashCloseReport() {
  const date = new Date().toLocaleDateString('es-CL');
  const cleanNum = (str) => parseInt(str.replace(/[^0-9]/g, '')) || 0;

  const payload = {
    date,
    totalSales: cleanNum(document.getElementById('cc-total-sales').textContent),
    txCount: parseInt(document.getElementById('cc-tx-count').textContent) || 0,
    discounts: cleanNum(document.getElementById('cc-discounts').textContent),
    payCash: cleanNum(document.getElementById('cc-pay-cash').textContent),
    payCard: cleanNum(document.getElementById('cc-pay-card').textContent),
    payTrans: cleanNum(document.getElementById('cc-pay-trans').textContent),
    payMixed: cleanNum(document.getElementById('cc-pay-mixed').textContent),
    profit: cleanNum(document.getElementById('cc-profit').textContent)
  };

  showToast('Despachando reporte de cierre a gerencia...', 'info');
  try {
    const res = await apiFetch('/api/cash-close/email', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res.success) {
      showToast('¡Cierre de caja enviado exitosamente a vitrinazo.cl@gmail.com!', 'success');
      closeModal('modal-cash-close');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Exportar Reporte Diario de Ventas a CSV/Excel en el cliente
function exportDailyReport() {
  const today = new Date().toDateString();
  const todaySales = allSalesCached.filter(s => new Date(s.fecha_hora).toDateString() === today);

  if (todaySales.length === 0) {
    showToast('No se registraron ventas el día de hoy para exportar.', 'warning');
    return;
  }

  let csv = "\ufeffID;Folio;Fecha/Hora;Cliente;Vendedor;Método de Pago;Descuento;Total\n";
  todaySales.forEach(s => {
    csv += `${s.id};${s.folio};${new Date(s.fecha_hora).toLocaleString('es-CL')};${s.cliente_nombre || 'Cliente General'};${s.vendedor_nombre || 'Vendedor'};${s.pago_metodo || 'Efectivo'};${s.descuento || 0};${s.total}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Reporte_Diario_Ventas_${new Date().toLocaleDateString('es-CL').replace(/\//g, '-')}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Reporte diario de ventas descargado con éxito.', 'success');
}

// Ver boleta en modal thermal ticket
async function viewSalesBoleta(folio) {
  try {
    showToast('Cargando boleta...', 'info');
    const data = await apiFetch(`/api/sales/${folio}`);
    if (data.success) {
      renderThermalTicket(data.ticket);
      currentIssuedFolio = folio;
      showModal('modal-ticket');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Redirección WhatsApp al cliente desde historial
function shareClientWspDirect(folio, clientName, clientPhone) {
  const sale = allSalesCached.find(s => s.folio === folio);
  if (!sale) return;

  const targetPhone = clientPhone ? clientPhone.replace(/\+/g, '').replace(/\s/g, '') : '56989784973';

  const text = `¡Hola ${clientName || 'Cliente'}! Tu compra en Eleodoro El Grande ha sido realizada con éxito.\n\n` +
    `*Boleta Folio:* ${sale.folio}\n` +
    `*Fecha:* ${new Date(sale.fecha_hora).toLocaleString('es-CL')}\n` +
    `*Total Pagado:* $${parseInt(sale.total).toLocaleString('es-CL')}\n` +
    `*Medio de Pago:* ${(sale.pago_metodo || 'Efectivo').toUpperCase()}\n\n` +
    `Agradecemos tu preferencia.`;
    
  window.open(`https://wa.me/${targetPhone}?text=${encodeURIComponent(text)}`, '_blank');
  showToast('Abriendo enlace de envío WhatsApp...', 'success');
}
