// public/js/despachos.js
// Controlador para el nuevo módulo de Guías de Despacho (SII)

let DespachoCart = [];
let ParsedExcelRows = [];

function initDespachosModule() {
  console.log('Inicializando módulo de Guías de Despacho...');
  loadDespachos();
  setupExcelDropzone();

  // Búsqueda en historial
  const searchInput = document.getElementById('erp-despachos-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      filterDespachos(q);
    });
  }

  // Filtro por forma de pago
  const filterPago = document.getElementById('historial-filtro-pago');
  if (filterPago) {
    filterPago.addEventListener('change', () => {
      const q = document.getElementById('erp-despachos-search')?.value.toLowerCase().trim() || '';
      filterDespachos(q);
    });
  }

  // Botón para nueva guía
  const newBtn = document.getElementById('btn-erp-new-despacho');
  if (newBtn) {
    newBtn.addEventListener('click', openNewDespachoModal);
  }

  // Binds de elementos dentro del formulario del modal
  const addBtn = document.getElementById('btn-despacho-add-item');
  if (addBtn) {
    addBtn.addEventListener('click', addProductToDespachoCart);
  }

  const clientSelect = document.getElementById('des-cliente-select');
  if (clientSelect) {
    clientSelect.addEventListener('change', handleDespachoClientChange);
  }

  const productSelect = document.getElementById('des-producto-select');
  if (productSelect) {
    productSelect.addEventListener('change', handleDespachoProductChange);
  }

  const form = document.getElementById('despacho-form');
  if (form) {
    form.onsubmit = handleDespachoSubmit;
  }
}

// Cargar listado del backend
async function loadDespachos() {
  const tbody = document.getElementById('erp-despachos-table-body');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">Cargando guías de despacho...</td></tr>`;

  try {
    const data = await apiFetch('/api/despachos');
    if (data.success) {
      AppState.despachos = data.despachos;
      renderDespachosTable(data.despachos);
    }
  } catch (err) {
    showToast('Error al cargar guías: ' + err.message, 'error');
  }
}

// Renderizar la tabla de guías
function renderDespachosTable(despachos) {
  const tbody = document.getElementById('erp-despachos-table-body');
  if (!tbody) return;

  if (despachos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">No hay guías de despacho emitidas.</td></tr>`;
    return;
  }

  tbody.innerHTML = despachos.map(d => {
    const totalCLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(d.total);
    const dateStr = new Date(d.fecha_emision).toLocaleString('es-CL');
    
    let pagoBadge = `<span class="badge" style="background: rgba(0, 123, 255, 0.15); color: #38ef7d; border: 1px solid rgba(0, 123, 255, 0.4); padding: 4px 8px; border-radius: 6px; font-weight:600;">🏦 Transferencia</span>`;
    const m = String(d.forma_pago || 'transferencia').toLowerCase();
    if (m.includes('combinado') || m.includes('mixto')) {
      pagoBadge = `<span class="badge" style="background: rgba(255, 193, 7, 0.15); color: #ffc107; border: 1px solid rgba(255, 193, 7, 0.4); padding: 4px 8px; border-radius: 6px; font-weight:600;">🔀 Pago Combinado</span>`;
    } else if (m.includes('efectivo') || m.includes('cash')) {
      pagoBadge = `<span class="badge" style="background: rgba(40, 167, 69, 0.15); color: #28a745; border: 1px solid rgba(40, 167, 69, 0.4); padding: 4px 8px; border-radius: 6px; font-weight:600;">💵 Efectivo</span>`;
    } else if (m.includes('tarjeta') || m.includes('card') || m.includes('debito') || m.includes('credito')) {
      pagoBadge = `<span class="badge" style="background: rgba(111, 66, 193, 0.15); color: #d63384; border: 1px solid rgba(111, 66, 193, 0.4); padding: 4px 8px; border-radius: 6px; font-weight:600;">💳 Tarjeta</span>`;
    }

    return `
      <tr>
        <td><strong>${d.folio}</strong></td>
        <td>${d.cliente_nombre || 'Cliente General'}</td>
        <td>${d.cliente_rut || 'N/A'}</td>
        <td>${dateStr}</td>
        <td>${pagoBadge}</td>
        <td><span class="badge" style="background-color: rgba(255,255,255,0.08); padding:4px 8px; border-radius:4px;">${d.tipo_traslado || 'Venta'}</span></td>
        <td><strong>${totalCLP}</strong></td>
        <td class="actions-cell">
          <button class="btn-icon-secondary" title="Descargar PDF" onclick="downloadDespachoPDF(${d.id}, '${d.folio}')">
            <span class="material-icons-round" style="color:var(--color-primary);">picture_as_pdf</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Filtrar guías localmente
function filterDespachos(q) {
  if (!AppState.despachos) return;
  const pagoFiltro = document.getElementById('historial-filtro-pago')?.value || 'TODAS';

  const filtered = AppState.despachos.filter(d => {
    const matchQuery = d.folio.toLowerCase().includes(q) || 
      (d.cliente_nombre && d.cliente_nombre.toLowerCase().includes(q)) ||
      (d.cliente_rut && d.cliente_rut.toLowerCase().includes(q));

    let matchPago = true;
    if (pagoFiltro !== 'TODAS') {
      const rawP = String(d.forma_pago || 'transferencia').toLowerCase();
      if (pagoFiltro === 'Pago Combinado') matchPago = rawP.includes('combinado') || rawP.includes('mixto');
      else if (pagoFiltro === 'Efectivo') matchPago = rawP.includes('efectivo');
      else if (pagoFiltro === 'Tarjeta') matchPago = rawP.includes('tarjeta') || rawP.includes('debito') || rawP.includes('credito');
      else if (pagoFiltro === 'Transferencia') matchPago = rawP.includes('transferencia');
    }

    return matchQuery && matchPago;
  });

  renderDespachosTable(filtered);
}

// Descargar PDF de despacho
function downloadDespachoPDF(id, folio) {
  const url = `/api/despachos/${id}/pdf`;
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${folio}.pdf`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast(`PDF de Guía ${folio} descargado con éxito.`, 'success');
}

// Abrir modal e inicializar datos
async function openNewDespachoModal() {
  DespachoCart = [];
  document.getElementById('despacho-form').reset();
  
  // Limpiar tablas y totales
  renderDespachoCartTable();
  
  // Cargar clientes y productos
  const clientSelect = document.getElementById('des-cliente-select');
  const productSelect = document.getElementById('des-producto-select');

  if (clientSelect) {
    clientSelect.innerHTML = '<option value="">-- Seleccione Cliente --</option>';
    // Obtener del estado global si están disponibles, sino cargarlos
    if (!AppState.customers || AppState.customers.length === 0) {
      try {
        const data = await apiFetch('/api/customers');
        if (data.success) AppState.customers = data.customers;
      } catch (err) {
        console.error(err);
      }
    }
    
    AppState.customers.forEach(c => {
      clientSelect.innerHTML += `<option value="${c.id}">${c.nombre} (${c.rut_o_nit})</option>`;
    });
  }

  if (!AppState.products || AppState.products.length === 0) {
    try {
      const data = await apiFetch('/api/products');
      if (data.success) AppState.products = data.products;
    } catch (err) {
      console.error(err);
    }
  }

  if (productSelect && AppState.products) {
    productSelect.innerHTML = '<option value="">-- Seleccione Producto --</option>';
    AppState.products.forEach(p => {
      productSelect.innerHTML += `<option value="${p.id}">${p.nombre} (Stock: ${p.stock_actual})</option>`;
    });
  }

  // Resetear buscador de productos inteligente
  const desSearch = document.getElementById('des-producto-search');
  const desId = document.getElementById('des-producto-id');
  const desClear = document.getElementById('des-producto-clear');
  const desDropdown = document.getElementById('des-producto-dropdown');

  if (desSearch) desSearch.value = '';
  if (desId) desId.value = '';
  if (desClear) desClear.style.display = 'none';
  if (desDropdown) desDropdown.style.display = 'none';

  showModal('modal-despacho');
}

// Auto-completar dirección y comuna al cambiar cliente
function handleDespachoClientChange(e) {
  const clientId = parseInt(e.target.value);
  if (!clientId || !AppState.customers) return;

  const client = AppState.customers.find(c => c.id === clientId);
  if (client) {
    document.getElementById('des-direccion').value = client.direccion || '';
    document.getElementById('des-comuna').value = client.direccion ? (client.direccion.split(',').pop().trim()) : '';
  }
}

// -------------------------------------------------------------
// BUSCADOR INTELIGENTE DE PRODUCTOS PARA GUÍA DE DESPACHO
// -------------------------------------------------------------
let selectedDropdownIndex = -1;

function searchDespachoProducts(query) {
  if (!AppState.products) return [];
  if (!query || !query.trim()) return AppState.products.slice(0, 15);

  const terms = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 0);

  return AppState.products.filter(p => {
    const nombreNorm = (p.nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const skuNorm = (p.sku || p.codigo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const catNorm = (p.categoria || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    return terms.every(term => 
      nombreNorm.includes(term) ||
      skuNorm.includes(term) ||
      catNorm.includes(term)
    );
  }).slice(0, 20);
}

function renderDespachoProductDropdown(products) {
  const dropdown = document.getElementById('des-producto-dropdown');
  if (!dropdown) return;

  if (!products || products.length === 0) {
    dropdown.innerHTML = `<div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 13px;">No se encontraron productos.</div>`;
    dropdown.style.display = 'block';
    return;
  }

  selectedDropdownIndex = -1;
  dropdown.innerHTML = products.map((p, idx) => {
    const precioNeto = Math.round(parseFloat(p.precio_venta) / 1.19);
    return `
      <div class="des-smart-item" data-id="${p.id}" data-idx="${idx}" style="padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.06); cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.15s ease;">
        <div>
          <div style="font-weight: 600; font-size: 13px; color: var(--text-primary);">${p.nombre}</div>
          <div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">SKU: ${p.sku || p.codigo || 'N/A'} | Stock: <span style="color: ${p.stock_actual > 0 ? '#4caf50' : '#f44336'}; font-weight: bold;">${p.stock_actual} un.</span></div>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: 700; color: var(--color-gold, #FFD700); font-size: 13px;">$${precioNeto.toLocaleString('es-CL')} <small style="font-size: 10px; color: var(--text-muted); font-weight: normal;">neto</small></div>
        </div>
      </div>
    `;
  }).join('');

  dropdown.style.display = 'block';

  // Eventos de clic sobre cada opción del desplegable
  dropdown.querySelectorAll('.des-smart-item').forEach(item => {
    item.addEventListener('mouseenter', () => {
      dropdown.querySelectorAll('.des-smart-item').forEach(i => i.style.background = 'transparent');
      item.style.background = 'rgba(229, 9, 20, 0.15)';
    });
    item.addEventListener('mouseleave', () => {
      item.style.background = 'transparent';
    });
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const pId = parseInt(item.getAttribute('data-id'));
      selectDespachoProduct(pId);
    });
  });
}

function selectDespachoProduct(productId) {
  if (!AppState.products) return;
  const product = AppState.products.find(p => p.id === productId);
  if (!product) return;

  const searchInput = document.getElementById('des-producto-search');
  const hiddenInput = document.getElementById('des-producto-id');
  const selectFallback = document.getElementById('des-producto-select');
  const clearBtn = document.getElementById('des-producto-clear');
  const priceInput = document.getElementById('des-precio');
  const qtyInput = document.getElementById('des-cantidad');
  const dropdown = document.getElementById('des-producto-dropdown');

  if (searchInput) searchInput.value = product.nombre;
  if (hiddenInput) hiddenInput.value = product.id;
  if (selectFallback) selectFallback.value = product.id;
  if (clearBtn) clearBtn.style.display = 'block';
  if (dropdown) dropdown.style.display = 'none';

  // Autocompletar precio neto sugerido
  const precioNeto = Math.round(parseFloat(product.precio_venta) / 1.19);
  if (priceInput) priceInput.value = precioNeto;
  if (qtyInput && (!qtyInput.value || qtyInput.value === '0')) qtyInput.value = 1;

  if (qtyInput) qtyInput.focus();
}

// Inicializar event listeners del buscador de productos
function setupDespachoProductSearch() {
  const input = document.getElementById('des-producto-search');
  const clearBtn = document.getElementById('des-producto-clear');
  const dropdown = document.getElementById('des-producto-dropdown');

  if (!input) return;

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (clearBtn) clearBtn.style.display = q.length > 0 ? 'block' : 'none';
    if (!q) {
      document.getElementById('des-producto-id').value = '';
      if (dropdown) dropdown.style.display = 'none';
      return;
    }
    const matches = searchDespachoProducts(q);
    renderDespachoProductDropdown(matches);
  });

  input.addEventListener('focus', () => {
    const q = input.value.trim();
    const matches = searchDespachoProducts(q);
    renderDespachoProductDropdown(matches);
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (dropdown) dropdown.style.display = 'none';
    }, 200);
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      document.getElementById('des-producto-id').value = '';
      document.getElementById('des-precio').value = '';
      clearBtn.style.display = 'none';
      if (dropdown) dropdown.style.display = 'none';
      input.focus();
    });
  }
}

// Enlazar listeners al cargar el script
document.addEventListener('DOMContentLoaded', setupDespachoProductSearch);
setupDespachoProductSearch();

// Cambiar producto actualiza el precio unitario sugerido (neto)
function handleDespachoProductChange(e) {
  const prodId = parseInt(e.target.value);
  if (!prodId || !AppState.products) return;

  const product = AppState.products.find(p => p.id === prodId);
  if (product) {
    const precioNeto = Math.round(parseFloat(product.precio_venta) / 1.19);
    document.getElementById('des-precio').value = precioNeto;
  }
}

// Agregar producto al listado temporal
function addProductToDespachoCart() {
  const productSelect = document.getElementById('des-producto-select');
  const productIdInput = document.getElementById('des-producto-id');
  const qtyInput = document.getElementById('des-cantidad');
  const priceInput = document.getElementById('des-precio');

  const productId = parseInt(productIdInput?.value || productSelect?.value);
  const qty = parseInt(qtyInput.value);
  const price = parseInt(priceInput.value);

  if (!productId) {
    showToast('Seleccione un producto buscando por nombre o SKU.', 'warning');
    return;
  }
  if (!qty || qty <= 0) {
    showToast('Ingrese una cantidad válida.', 'warning');
    return;
  }
  if (price === undefined || price < 0) {
    showToast('Ingrese un precio unitario válido.', 'warning');
    return;
  }

  const product = AppState.products.find(p => p.id === productId);
  if (!product) return;

  // Validar stock disponible
  if (qty > product.stock_actual) {
    showToast(`Stock insuficiente. Stock disponible: ${product.stock_actual} unidades.`, 'warning');
    return;
  }

  // Si ya existe en la lista, sumar cantidad
  const existing = DespachoCart.find(item => item.producto_id === productId);
  if (existing) {
    if (existing.cantidad + qty > product.stock_actual) {
      showToast(`No puedes agregar más del stock disponible. Stock total: ${product.stock_actual}.`, 'warning');
      return;
    }
    existing.cantidad += qty;
    existing.precio_unitario_neto = price;
  } else {
    DespachoCart.push({
      producto_id: product.id,
      codigo: product.sku || product.codigo || `PRD-${product.id}`,
      nombre: product.nombre,
      cantidad: qty,
      precio_unitario_neto: price
    });
  }

  // Limpiar campos de captura de producto para el siguiente ítem
  const searchInput = document.getElementById('des-producto-search');
  const clearBtn = document.getElementById('des-producto-clear');
  if (searchInput) searchInput.value = '';
  if (productIdInput) productIdInput.value = '';
  if (productSelect) productSelect.value = '';
  if (clearBtn) clearBtn.style.display = 'none';
  priceInput.value = '';
  qtyInput.value = 1;
  if (searchInput) searchInput.focus();

  renderDespachoCartTable();
  showToast(`"${product.nombre}" agregado a la guía de despacho.`, 'success');
}

// Renderizar tabla del carrito de despacho
function renderDespachoCartTable() {
  const tbody = document.getElementById('despacho-items-table-body');
  if (!tbody) return;

  if (DespachoCart.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No se han agregado productos.</td></tr>`;
    updateDespachoTotals(0);
    return;
  }

  tbody.innerHTML = DespachoCart.map((item, idx) => {
    const unitPrice = item.precio_unitario_neto !== undefined ? item.precio_unitario_neto : (item.precio_unitario || 0);
    const subtotal = item.cantidad * unitPrice;
    item.subtotal = subtotal;
    item.precio_unitario = unitPrice;

    return `
      <tr>
        <td>${item.codigo}</td>
        <td>${item.nombre}</td>
        <td>${item.cantidad}</td>
        <td>$${unitPrice.toLocaleString('es-CL')}</td>
        <td><strong>$${subtotal.toLocaleString('es-CL')}</strong></td>
        <td>
          <button type="button" class="btn-icon-secondary" onclick="removeProductFromDespachoCart(${idx})">
            <span class="material-icons-round" style="font-size:16px; color:var(--color-primary);">delete</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  const neto = DespachoCart.reduce((acc, val) => acc + (val.subtotal || 0), 0);
  updateDespachoTotals(neto);
}

// Quitar producto de la lista temporal
function removeProductFromDespachoCart(idx) {
  DespachoCart.splice(idx, 1);
  renderDespachoCartTable();
}

// Actualizar textos de los totales
function updateDespachoTotals(neto) {
  const iva = Math.round(neto * 0.19);
  const total = neto + iva;

  document.getElementById('despacho-summary-neto').textContent = `$${neto.toLocaleString('es-CL')}`;
  document.getElementById('despacho-summary-iva').textContent = `$${iva.toLocaleString('es-CL')}`;
  document.getElementById('despacho-summary-total').textContent = `$${total.toLocaleString('es-CL')}`;
}

// Enviar formulario para registrar y emitir guía
async function handleDespachoSubmit(e) {
  e.preventDefault();

  if (DespachoCart.length === 0) {
    showToast('Debe agregar al menos un producto a la guía de despacho.', 'warning');
    return;
  }

  const payload = {
    cliente_id: parseInt(document.getElementById('des-cliente-select').value),
    tipo_traslado: document.getElementById('des-tipo-traslado').value,
    direccion_despacho: document.getElementById('des-direccion').value.trim(),
    comuna_despacho: document.getElementById('des-comuna').value.trim(),
    patente_vehiculo: document.getElementById('des-patente').value.trim(),
    nombre_chofer: document.getElementById('des-chofer-nombre').value.trim(),
    rut_chofer: document.getElementById('des-chofer-rut').value.trim(),
    items: DespachoCart.map(item => ({
      producto_id: item.producto_id,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario
    }))
  };

  try {
    const res = await apiFetch('/api/despachos', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (res.success) {
      showToast('¡Guía de despacho emitida y registrada con éxito!', 'success');
      closeModal('modal-despacho');
      loadDespachos();
      
      // Intentar actualizar la lista de productos/inventario si estamos en esa vista
      if (typeof loadProductsERP === 'function') {
        loadProductsERP();
      }

      // Descarga automática del PDF generado
      setTimeout(() => {
        downloadDespachoPDF(res.despacho_id, res.folio);
      }, 800);
    }
  } catch (err) {
    showToast('Error al emitir guía: ' + err.message, 'error');
  }
}

// -------------------------------------------------------------
// FUNCIONALIDAD DASHBOARD GENERADOR DE GUÍAS EXCEL (RPA)
// -------------------------------------------------------------

// Cambiar pestaña secundaria en el módulo de Despachos
function switchDespachoSubTab(tabName) {
  const dashTab = document.getElementById('despacho-subtab-dashboard');
  const histTab = document.getElementById('despacho-subtab-historial');
  const btnDash = document.getElementById('tab-btn-despacho-dashboard');
  const btnHist = document.getElementById('tab-btn-despacho-historial');

  if (tabName === 'dashboard') {
    if (dashTab) dashTab.style.display = 'block';
    if (histTab) histTab.style.display = 'none';
    if (btnDash) btnDash.classList.add('active');
    if (btnHist) btnHist.classList.remove('active');
  } else {
    if (dashTab) dashTab.style.display = 'none';
    if (histTab) histTab.style.display = 'block';
    if (btnDash) btnDash.classList.remove('active');
    if (btnHist) btnHist.classList.add('active');
    loadDespachos();
  }
}

// Configurar Dropzone e Interacción con el Excel
function setupExcelDropzone() {
  const dropzone = document.getElementById('despacho-excel-dropzone');
  const fileInput = document.getElementById('despacho-excel-input');
  const downloadBtn = document.getElementById('btn-download-excel-template');
  const clearBtn = document.getElementById('btn-clear-excel-preview');
  const startBtn = document.getElementById('btn-start-rpa-generation');

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--color-primary)';
      dropzone.style.background = 'rgba(229,9,20,0.15)';
    });

    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'rgba(255,255,255,0.25)';
      dropzone.style.background = 'rgba(0,0,0,0.2)';
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'rgba(255,255,255,0.25)';
      dropzone.style.background = 'rgba(0,0,0,0.2)';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        processSelectedExcelFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        processSelectedExcelFile(e.target.files[0]);
      }
    });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener('click', downloadExcelTemplate);
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', clearExcelPreview);
  }

  if (startBtn) {
    startBtn.addEventListener('click', handleStartRPAGeneration);
  }

  // Estilos toggle tarjetas de radio
  const radioLabels = document.querySelectorAll('input[name="sku-mode"]');
  radioLabels.forEach(radio => {
    radio.addEventListener('change', () => {
      document.querySelectorAll('.radio-mode-card').forEach(card => {
        card.classList.remove('active');
        card.style.border = '1px solid rgba(255,255,255,0.15)';
        card.style.background = 'transparent';
      });
      const parentLabel = radio.closest('.radio-mode-card');
      if (parentLabel) {
        parentLabel.classList.add('active');
        parentLabel.style.border = '2px solid var(--color-primary)';
        parentLabel.style.background = 'rgba(229,9,20,0.08)';
      }
    });
  });
}

// Descargar plantilla oficial Excel
function downloadExcelTemplate() {
  window.location.href = '/api/despachos/plantilla-excel';
  showToast('Descargando plantilla de Guías de Despacho...', 'info');
}

// Leer y parsear archivo Excel cargado
function processSelectedExcelFile(file) {
  if (!file) return;
  const reader = new FileReader();

  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonRows = XLSX.utils.sheet_to_json(worksheet);

      if (!jsonRows || jsonRows.length === 0) {
        showToast('El archivo Excel está vacío o no contiene filas con formato válido.', 'warning');
        return;
      }

      // Mapear campos estándar soporta mayúsculas y minúsculas de cualquier plantilla (ej: RUT, DESCRIPCION, CANTIDAD, PATENTE, etc.)
      ParsedExcelRows = jsonRows.map(row => {
        const getValue = (...keys) => {
          for (const k of keys) {
            if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return row[k];
            // probar en mayúsculas / minúsculas
            const upperKey = k.toUpperCase();
            if (row[upperKey] !== undefined && row[upperKey] !== null && String(row[upperKey]).trim() !== '') return row[upperKey];
            const lowerKey = k.toLowerCase();
            if (row[lowerKey] !== undefined && row[lowerKey] !== null && String(row[lowerKey]).trim() !== '') return row[lowerKey];
          }
          return null;
        };

        return {
          senor_es: getValue("Señor(es) / Cliente", "Cliente", "Señor(es)", "NOMBRE_CLIENTE", "RECEPTOR") || "COMERCIAL ELEODORO SPA",
          cliente_nombre: getValue("Señor(es) / Cliente", "Cliente", "Señor(es)", "NOMBRE_CLIENTE", "RECEPTOR") || "COMERCIAL ELEODORO SPA",
          cliente_rut: getValue("RUT", "RUT Cliente", "RUT_CLIENTE", "RUT RECEPTOR") || "78.256.573-7",
          direccion_despacho: getValue("DIRECCION", "Dirección", "Direccion", "DIRECCION_DESTINO") || "Laguna Sur #8383 Pudahuel",
          comuna_despacho: getValue("COMUNA", "Comuna", "COMUNA_DESTINO") || "PUDAHUEL",
          ciudad_despacho: getValue("CIUDAD", "Ciudad", "COMUNA", "Comuna") || "SANTIAGO",
          giro: getValue("GIRO", "Giro") || "VENTA AL POR MAYOR",
          nombre_chofer: getValue("NOMBRE_CHOFER", "Nombre Chofer", "Chofer", "CHOFER") || "CRISTIAN MIRANDA",
          rut_chofer: getValue("RUT_CHOFER", "RUT Chofer", "Rut Chofer") || "18338934-3",
          patente_vehiculo: getValue("PATENTE", "Patente") || "CYPX-41",
          direccion_destino: getValue("DIRECCION_DESTINO", "Dirección Destino", "DIRECCION", "Dirección") || "Rene Oliva #1358 Cerro Navia",
          comuna_destino: getValue("COMUNA_DESTINO", "Comuna Destino", "COMUNA", "Comuna") || "CERRO NAVIA",
          rut_transportista: getValue("RUT_TRANSPORTISTA", "RUT Transportista", "RUT_CHOFER", "RUT Chofer") || "18338934-3",
          codigo_sku: getValue("SKU", "Código SKU", "Código", "CODIGO", "SKU_PRODUCTO") || "PRD-1001",
          detalle_producto: getValue("DESCRIPCION", "Detalle Producto", "Detalle", "Producto", "DESCRIPCION_PRODUCTO") || "BEBIDA COCA COLA 1.5L RETORNABLE",
          forma_pago: getValue("FORMA_PAGO", "Forma de Pago", "METODO_PAGO", "Método de Pago", "PAGO", "Pago") || document.getElementById('despacho-forma-pago-select')?.value || "Transferencia",
          vendedor: getValue("VENDEDOR", "Vendedor", "vendedor", "VENDEDOR_NOMBRE", "NOMBRE_VENDEDOR", "Vendedora", "VENDEDOR/A", "Vendedor/a", "EJECUTIVO", "Ejecutivo", "COD_VENDEDOR", "Cod Vendedor") || "-",
          cantidad: parseFloat(getValue("CANTIDAD", "Cantidad", "CANT") || 1),
          um: getValue("U.M.", "UM", "UNIDAD") || "UN",
          precio_unitario: parseFloat(getValue("PRECIO", "PRECIO_UNITARIO", "Precio Unitario", "Precio", "VALOR") || 0),
          descuento: parseFloat(getValue("DESCUENTO", "Descuento") || 0)
        };
      });

      // Actualizar UI dropzone y tabla vista previa
      const dropTitle = document.getElementById('dropzone-text-title');
      const dropSub = document.getElementById('dropzone-text-sub');
      if (dropTitle) dropTitle.innerHTML = `✅ Archivo Cargado: <strong>${file.name}</strong>`;
      if (dropSub) dropSub.textContent = `${ParsedExcelRows.length} fila(s) de productos listas para procesar`;
      
      renderExcelPreviewTable(ParsedExcelRows);
      showToast(`¡Archivo "${file.name}" cargado exitosamente! (${ParsedExcelRows.length} registros)`, 'success');
    } catch (err) {
      console.error('Error procesando Excel:', err);
      showToast('Error al leer el archivo Excel: ' + err.message, 'error');
    }
  };

  reader.readAsArrayBuffer(file);
}

// Renderizar tabla vista previa
function renderExcelPreviewTable(rows) {
  const container = document.getElementById('excel-preview-container');
  const tbody = document.getElementById('excel-preview-table-body');
  const rowCountLabel = document.getElementById('preview-row-count');

  if (!container || !tbody) return;

  if (rows.length === 0) {
    container.style.display = 'none';
    return;
  }

  if (rowCountLabel) rowCountLabel.textContent = `Datos Cargados del Excel (${rows.length} Filas)`;
  tbody.innerHTML = rows.map((r, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td><strong>${r.cliente_nombre}</strong></td>
      <td>${r.cliente_rut}</td>
      <td><code>${r.codigo_sku}</code></td>
      <td>${r.detalle_producto}</td>
      <td>${r.cantidad} ${r.um}</td>
      <td>$${r.precio_unitario.toLocaleString('es-CL')}</td>
    </tr>
  `).join('');

  container.style.display = 'block';
}

// Limpiar datos cargados del Excel
function clearExcelPreview() {
  ParsedExcelRows = [];
  const fileInput = document.getElementById('despacho-excel-input');
  if (fileInput) fileInput.value = '';
  const dropTitle = document.getElementById('dropzone-text-title');
  const dropSub = document.getElementById('dropzone-text-sub');
  if (dropTitle) dropTitle.textContent = 'Arrastra tu archivo o haz click aquí';
  if (dropSub) dropSub.textContent = 'Soporta formatos .xlsx y .xls (Máx. 500 filas)';
  
  const container = document.getElementById('excel-preview-container');
  if (container) container.style.display = 'none';
  showToast('Vista previa de Excel limpiada.', 'info');
}

// Enviar solicitud de generación de guías en lote al backend
async function handleStartRPAGeneration() {
  if (ParsedExcelRows.length === 0) {
    showToast('Por favor carga un archivo Excel con datos antes de iniciar la generación.', 'warning');
    return;
  }

  const selectedMode = document.querySelector('input[name="sku-mode"]:checked')?.value || '16sku';
  const selectedFormaPago = document.getElementById('despacho-forma-pago-select')?.value || 'Transferencia';
  const startBtn = document.getElementById('btn-start-rpa-generation');
  const startBtnTop = document.getElementById('btn-start-rpa-generation-top');
  
  if (startBtn) {
    startBtn.disabled = true;
    startBtn.innerHTML = `<span class="material-icons-round rotate">sync</span> Generando...`;
  }
  if (startBtnTop) {
    startBtnTop.disabled = true;
    startBtnTop.innerHTML = `<span class="material-icons-round rotate">sync</span> Generando...`;
  }

  try {
    const res = await apiFetch('/api/despachos/generar-desde-excel', {
      method: 'POST',
      body: JSON.stringify({
        modo: selectedMode,
        forma_pago: selectedFormaPago,
        items: ParsedExcelRows
      })
    });

    if (res.success && res.guias) {
      showToast(res.message, 'success');

      // Descargar automáticamente cada PDF generado
      res.guias.forEach((g, idx) => {
        setTimeout(() => {
          downloadDespachoPDF(g.id, g.folio);
        }, idx * 1000);
      });

      // Cambiar a la pestaña de historial
      setTimeout(() => {
        switchDespachoSubTab('historial');
        clearExcelPreview();
      }, 1500);
    } else {
      showToast(res.message || 'Error al generar guías.', 'error');
    }
  } catch (err) {
    console.error('Error generando guías desde Excel:', err);
    showToast('Error al procesar generación: ' + err.message, 'error');
  } finally {
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.innerHTML = `<span class="material-icons-round" style="font-size: 24px;">play_circle_filled</span> Generar Guías (PDF)`;
    }
    if (startBtnTop) {
      startBtnTop.disabled = false;
      startBtnTop.innerHTML = `<span class="material-icons-round" style="font-size: 22px;">play_circle_filled</span> Generar Guías (PDF)`;
    }
  }
}
