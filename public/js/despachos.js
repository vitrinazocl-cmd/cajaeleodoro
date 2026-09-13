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

  // Búsqueda en Histórico Permanente
  const searchHistoricoInput = document.getElementById('erp-historico-search');
  if (searchHistoricoInput) {
    searchHistoricoInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      filterHistoricoDespachos(q);
    });
  }

  // Filtro por forma de pago historial
  const filterPago = document.getElementById('historial-filtro-pago');
  if (filterPago) {
    filterPago.addEventListener('change', () => {
      const q = document.getElementById('erp-despachos-search')?.value.toLowerCase().trim() || '';
      filterDespachos(q);
    });
  }

  // Filtro por forma de pago histórico permanente
  const filterPagoHistorico = document.getElementById('historico-filtro-pago');
  if (filterPagoHistorico) {
    filterPagoHistorico.addEventListener('change', () => {
      const q = document.getElementById('erp-historico-search')?.value.toLowerCase().trim() || '';
      filterHistoricoDespachos(q);
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
// CONTROLADOR DE PESTAÑAS Y GENERADOR POR EXCEL (RPA)
// -------------------------------------------------------------
let selectedExcelFile = null;

function switchDespachoTab(tabName) {
  // Ocultar todos los panes
  document.querySelectorAll('.despacho-tab-pane').forEach(pane => {
    pane.style.display = 'none';
  });

  // Desactivar botones de pestañas
  document.querySelectorAll('.despacho-tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  // Mostrar pane seleccionado y activar botón
  const targetPane = document.getElementById(`despacho-tab-${tabName}`);
  if (targetPane) {
    targetPane.style.display = 'block';
  }

  const activeBtn = document.querySelector(`.despacho-tab-btn[data-tab="${tabName}"]`);
  if (activeBtn) {
    activeBtn.classList.add('active');
  }

  if (tabName === 'history') {
    loadDespachos();
  }
}

let parsedExcelData = null;

function handleExcelFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  selectedExcelFile = file;
  const titleEl = document.getElementById('excel-file-title');
  const subtitleEl = document.getElementById('excel-file-subtitle');
  const dropzone = document.getElementById('excel-dropzone');

  if (titleEl) titleEl.textContent = `Archivo seleccionado: ${file.name}`;
  if (subtitleEl) subtitleEl.textContent = `Tamaño: ${(file.size / 1024).toFixed(1)} KB - Leyendo datos agrupados...`;
  if (dropzone) dropzone.style.borderColor = 'var(--color-primary)';

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      let rows = [];
      let matrix = [];
      if (typeof XLSX !== 'undefined') {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      } else {
        // Fallback simple parsing para CSV
        const text = new TextDecoder().decode(e.target.result);
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length > 1) {
          const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
            let row = {};
            headers.forEach((h, idx) => { row[h] = cols[idx] || ''; });
            rows.push(row);
          }
          matrix = lines.map(l => l.split(','));
        }
      }

      parsedExcelData = processExcelRows(rows, matrix);
      renderExcelPreviewDashboard(parsedExcelData);
      showToast(`Plantilla leída con éxito: ${rows.length} filas procesadas.`, 'success');
      if (subtitleEl) subtitleEl.textContent = `Éxito: ${rows.length} filas leídas | Chofer: ${parsedExcelData.driver.nombre} | ${parsedExcelData.totalCantidad} Bultos Totales`;
    } catch (err) {
      console.error('Error al leer el archivo Excel:', err);
      showToast('Error al procesar la plantilla Excel: ' + err.message, 'error');
    }
  };

  reader.readAsArrayBuffer(file);
}

// Procesar filas y celdas de Excel para extraer exhaustivamente todos los datos (Cliente, Chofer, Vendedor, Mercaderías)
function processExcelRows(rows, matrix = []) {
  if ((!rows || rows.length === 0) && (!matrix || matrix.length === 0)) {
    return { items: [], totalCantidad: 0, totalNeto: 0, client: {}, driver: {}, seller: {} };
  }

  let extractedDriverName = '';
  let extractedDriverRut = '';
  let extractedDriverPatente = '';
  let extractedDriverTransp = '';

  let extractedClientName = '';
  let extractedClientRut = '';
  let extractedClientGiro = '';
  let extractedClientDireccion = '';
  let extractedClientComuna = '';

  let extractedSellerName = '';
  let extractedSellerMetodo = '';
  let extractedSellerTraslado = '';

  // 1. ESCANEO MATRICIAL DE CELDAS CRUDAS (Para capturar encabezados clave:valor tipo "Chofer: Nombre")
  if (matrix && matrix.length > 0) {
    for (let r = 0; r < matrix.length; r++) {
      const rowArr = matrix[r];
      if (!Array.isArray(rowArr)) continue;
      for (let c = 0; c < rowArr.length; c++) {
        const cellStr = String(rowArr[c] || '').trim();
        if (!cellStr) continue;

        const cellUpper = cellStr.toUpperCase();
        const nextCell = String(rowArr[c + 1] || '').trim();

        // BUSCAR CHOFER / CONDUCTOR
        if (/CHOFER|CONDUCTOR|DRIVER/i.test(cellUpper)) {
          if (cellStr.includes(':')) {
            const val = cellStr.split(':')[1].trim();
            if (val && !extractedDriverName) extractedDriverName = val;
          } else if (nextCell && !extractedDriverName && !/CHOFER|CONDUCTOR|DRIVER/i.test(nextCell)) {
            extractedDriverName = nextCell;
          }
        }

        // BUSCAR RUT CHOFER
        if (/RUT.*CHOFER|RUT.*CONDUCTOR|RUT.*DRIVER/i.test(cellUpper)) {
          if (cellStr.includes(':')) {
            const val = cellStr.split(':')[1].trim();
            if (val && !extractedDriverRut) extractedDriverRut = val;
          } else if (nextCell && !extractedDriverRut) {
            extractedDriverRut = nextCell;
          }
        }

        // BUSCAR PATENTE
        if (/PATENTE|VEHICULO|CAMION/i.test(cellUpper)) {
          if (cellStr.includes(':')) {
            const val = cellStr.split(':')[1].trim();
            if (val && !extractedDriverPatente) extractedDriverPatente = val;
          } else if (nextCell && !extractedDriverPatente) {
            extractedDriverPatente = nextCell;
          }
        }

        // BUSCAR CLIENTE / RECEPTOR
        if (/CLIENTE|RECEPTOR|RAZON.*SOCIAL|SEÑOR/i.test(cellUpper)) {
          if (cellStr.includes(':')) {
            const val = cellStr.split(':')[1].trim();
            if (val && !extractedClientName) extractedClientName = val;
          } else if (nextCell && !extractedClientName && !/CLIENTE|RECEPTOR/i.test(nextCell)) {
            extractedClientName = nextCell;
          }
        }

        // BUSCAR RUT CLIENTE
        if (/RUT.*CLIENTE|RUT.*RECEPTOR|^RUT$/i.test(cellUpper)) {
          if (cellStr.includes(':')) {
            const val = cellStr.split(':')[1].trim();
            if (val && !extractedClientRut) extractedClientRut = val;
          } else if (nextCell && !extractedClientRut) {
            extractedClientRut = nextCell;
          }
        }

        // BUSCAR VENDEDOR
        if (/VENDEDOR|CODIGO.*VENDEDOR|EJECUTIVO/i.test(cellUpper)) {
          if (cellStr.includes(':')) {
            const val = cellStr.split(':')[1].trim();
            if (val && !extractedSellerName) extractedSellerName = val;
          } else if (nextCell && !extractedSellerName && !/VENDEDOR/i.test(nextCell)) {
            extractedSellerName = nextCell;
          }
        }

        // BUSCAR DIRECCION DESPACHO
        if (/DIRECCION|DESTINO|DOMICILIO/i.test(cellUpper)) {
          if (cellStr.includes(':')) {
            const val = cellStr.split(':')[1].trim();
            if (val && !extractedClientDireccion) extractedClientDireccion = val;
          } else if (nextCell && !extractedClientDireccion) {
            extractedClientDireccion = nextCell;
          }
        }

        // BUSCAR COMUNA
        if (/COMUNA|CIUDAD|LOCALIDAD/i.test(cellUpper)) {
          if (cellStr.includes(':')) {
            const val = cellStr.split(':')[1].trim();
            if (val && !extractedClientComuna) extractedClientComuna = val;
          } else if (nextCell && !extractedClientComuna) {
            extractedClientComuna = nextCell;
          }
        }
      }
    }
  }

  // 2. ESCANEO POR COLUMNAS DE OBJETOS (Recorrer todas las filas de la tabla de datos)
  const getValFromRows = (candidates) => {
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        const cleanKey = key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
        for (const cand of candidates) {
          if (cleanKey.includes(cand.toUpperCase())) {
            const val = String(row[key] || '').trim();
            if (val) return val;
          }
        }
      }
    }
    return '';
  };

  if (!extractedDriverName) extractedDriverName = getValFromRows(['NOMBRE_CHOFER', 'CHOFER', 'CONDUCTOR', 'DRIVER', 'TRANSPORTE_CHOFER']);
  if (!extractedDriverRut) extractedDriverRut = getValFromRows(['RUT_CHOFER', 'RUT_CONDUCTOR', 'RUT_DRIVER', 'CHOFER_RUT']);
  if (!extractedDriverPatente) extractedDriverPatente = getValFromRows(['PATENTE_VEHICULO', 'PATENTE', 'VEHICULO', 'CAMION']);
  if (!extractedDriverTransp) extractedDriverTransp = getValFromRows(['TRANSPORTISTA', 'EMPRESA_TRANSPORTE', 'TRANSPORTE']);

  if (!extractedClientName) extractedClientName = getValFromRows(['NOMBRE_CLIENTE', 'CLIENTE', 'RAZON_SOCIAL', 'RECEPTOR', 'COMPRADOR']);
  if (!extractedClientRut) extractedClientRut = getValFromRows(['RUT_CLIENTE', 'RUT', 'NIT', 'IDENTIFICACION', 'RECEPTOR_RUT']);
  if (!extractedClientGiro) extractedClientGiro = getValFromRows(['GIRO_CLIENTE', 'GIRO', 'RUBRO', 'ACTIVIDAD']);
  if (!extractedClientDireccion) extractedClientDireccion = getValFromRows(['DIRECCION_DESPACHO', 'DIRECCION', 'DESTINO', 'DOMICILIO']);
  if (!extractedClientComuna) extractedClientComuna = getValFromRows(['COMUNA', 'CIUDAD', 'LOCALIDAD']);

  if (!extractedSellerName) extractedSellerName = getValFromRows(['NOMBRE_VENDEDOR', 'VENDEDOR', 'CODIGO_VENDEDOR', 'EJECUTIVO']);
  if (!extractedSellerMetodo) extractedSellerMetodo = getValFromRows(['METODO_PAGO', 'FORMA_PAGO', 'PAGO']);
  if (!extractedSellerTraslado) extractedSellerTraslado = getValFromRows(['TIPO_TRASLADO', 'TRASLADO', 'MOTIVO']);

  const client = {
    nombre: extractedClientName || 'Cliente General',
    rut: extractedClientRut || 'N/A',
    giro: extractedClientGiro || 'Comercial / Venta Bebidas',
    direccion: extractedClientDireccion || 'Dirección de Despacho',
    comuna: extractedClientComuna || 'Santiago'
  };

  const driver = {
    nombre: extractedDriverName || 'Chofer no especificado en plantilla',
    rut: extractedDriverRut || 'N/A',
    patente: extractedDriverPatente || 'N/A',
    transportista: extractedDriverTransp || 'Eleodoro Logística'
  };

  const seller = {
    nombre: extractedSellerName || 'Vendedor Central',
    metodoPago: extractedSellerMetodo || 'Transferencia Electrónica',
    tipoTraslado: extractedSellerTraslado || 'Venta'
  };

  let totalCantidad = 0;
  let totalNeto = 0;

  const items = [];
  rows.forEach((row, idx) => {
    const getRowVal = (cands) => {
      for (const key of Object.keys(row)) {
        const cleanKey = key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
        for (const cand of cands) {
          if (cleanKey.includes(cand.toUpperCase())) {
            return String(row[key] || '').trim();
          }
        }
      }
      return '';
    };

    const sku = getRowVal(['CODIGO_SKU', 'SKU', 'CODIGO', 'PROD_ID']) || `SKU-${idx + 1}`;
    const desc = getRowVal(['DESCRIPCION_PRODUCTO', 'DESCRIPCION', 'PRODUCTO', 'NOMBRE', 'DETALLE']) || 'Producto Bebida';
    const cantVal = parseFloat(getRowVal(['CANTIDAD', 'BULTOS', 'UNIDADES', 'CANT'])) || 0;
    const precioVal = parseFloat(getRowVal(['PRECIO_UNITARIO', 'PRECIO_NETO', 'PRECIO', 'UNITARIO'])) || 0;

    if (cantVal > 0 || desc !== 'Producto Bebida') {
      const subtotal = cantVal * precioVal;
      totalCantidad += cantVal;
      totalNeto += subtotal;

      items.push({
        sku,
        descripcion: desc,
        cantidad: cantVal,
        precioUnitario: precioVal,
        subtotal
      });
    }
  });

  return {
    client,
    driver,
    seller,
    items: items.length > 0 ? items : [{ sku: 'SKU-1', descripcion: 'Mercadería', cantidad: 0, precioUnitario: 0, subtotal: 0 }],
    totalCantidad,
    totalNeto
  };
}

// Renderizar Dashboard de datos agrupados e informar suma total de cantidades
function renderExcelPreviewDashboard(data) {
  const container = document.getElementById('excel-preview-container');
  if (!container) return;

  container.style.display = 'block';

  // Badges y contadores
  document.getElementById('preview-row-count').textContent = `${data.items.length} productos en la plantilla`;
  document.getElementById('preview-total-bultos-badge').textContent = `📦 ${data.totalCantidad.toLocaleString('es-CL')} Bultos/Unidades Totales`;

  // Datos Cliente
  document.getElementById('prev-cli-nombre').textContent = data.client.nombre;
  document.getElementById('prev-cli-rut').textContent = data.client.rut;
  document.getElementById('prev-cli-giro').textContent = data.client.giro;
  document.getElementById('prev-cli-direccion').textContent = data.client.direccion;
  document.getElementById('prev-cli-comuna').textContent = data.client.comuna;

  // Datos Chofer
  document.getElementById('prev-chof-nombre').textContent = data.driver.nombre;
  document.getElementById('prev-chof-rut').textContent = data.driver.rut;
  document.getElementById('prev-chof-patente').textContent = data.driver.patente;
  document.getElementById('prev-chof-transp').textContent = data.driver.transportista;

  // Datos Vendedor
  document.getElementById('prev-vend-nombre').textContent = data.seller.nombre;
  document.getElementById('prev-vend-pago').textContent = data.seller.metodoPago;
  document.getElementById('prev-vend-traslado').textContent = data.seller.tipoTraslado;
  
  const skuMode = document.querySelector('input[name="sku_mode"]:checked')?.value || '16';
  const cantGuias = Math.ceil(data.items.length / parseInt(skuMode)) || 1;
  document.getElementById('prev-vend-cant-guias').textContent = `${cantGuias} Guía(s) PDF`;

  // Tabla de items
  const tbody = document.getElementById('excel-preview-table-body');
  if (tbody) {
    tbody.innerHTML = data.items.map(i => `
      <tr>
        <td><strong>${i.sku}</strong></td>
        <td>${i.descripcion}</td>
        <td style="text-align: center; font-weight: 700; color: #FFD700; background-color: rgba(229, 9, 20, 0.15);">${i.cantidad.toLocaleString('es-CL')}</td>
        <td style="text-align: right;">$${i.precioUnitario.toLocaleString('es-CL')}</td>
        <td style="text-align: right;"><strong>$${i.subtotal.toLocaleString('es-CL')}</strong></td>
      </tr>
    `).join('');
  }

  // SUMA TOTAL DE CANTIDADES (BULTOS)
  const sumCantEl = document.getElementById('excel-preview-sum-cantidades');
  if (sumCantEl) sumCantEl.textContent = data.totalCantidad.toLocaleString('es-CL');

  const totalNetoEl = document.getElementById('excel-preview-total-neto');
  if (totalNetoEl) totalNetoEl.textContent = `$${data.totalNeto.toLocaleString('es-CL')}`;
}

// Descargar plantilla CSV/Excel completa con todos los campos agrupados
function downloadDespachoTemplate() {
  const csvHeaders = "RUT_CLIENTE,NOMBRE_CLIENTE,GIRO_CLIENTE,DIRECCION_DESPACHO,COMUNA,RUT_CHOFER,NOMBRE_CHOFER,PATENTE_VEHICULO,TRANSPORTISTA,NOMBRE_VENDEDOR,METODO_PAGO,TIPO_TRASLADO,CODIGO_SKU,DESCRIPCION_PRODUCTO,CANTIDAD,PRECIO_UNITARIO\n";
  const sampleRow1 = "76.123.456-7,DISTRIBUIDORA DE BEBIDAS EL SOL,COMERCIALIZADORA BEBIDAS,AV. MATTA 1234,SANTIAGO,14.555.666-7,JUAN PEREZ SANCHEZ,AB-12-CD,ELEODORO LOGISTICA,CARLOS VENDEDOR,Transferencia Electrónica,Venta,PROD-BEB-1.5L,BEBIDA ELEODORO 1.5L X 12 UNID,50,12000\n";
  const sampleRow2 = "76.123.456-7,DISTRIBUIDORA DE BEBIDAS EL SOL,COMERCIALIZADORA BEBIDAS,AV. MATTA 1234,SANTIAGO,14.555.666-7,JUAN PEREZ SANCHEZ,AB-12-CD,ELEODORO LOGISTICA,CARLOS VENDEDOR,Transferencia Electrónica,Venta,PROD-CERV-LATA,CERVEZA LATA 473ML X 24 UNID,100,24000\n";

  const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(csvHeaders + sampleRow1 + sampleRow2);
  const link = document.createElement("a");
  link.setAttribute("href", csvContent);
  link.setAttribute("download", "plantilla_completa_guias_despacho_eleodoro.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('Plantilla Excel/CSV completa descargada con éxito.', 'success');
}

async function triggerGenerateExcelGuides() {
  if (!parsedExcelData || !parsedExcelData.items || parsedExcelData.items.length === 0) {
    showToast('Por favor selecciona o arrastra una plantilla Excel (.xlsx, .xls o .csv) primero.', 'warning');
    return;
  }

  const data = parsedExcelData;
  const skuMode = document.querySelector('input[name="sku_mode"]:checked')?.value === '1' ? '1sku' : '16sku';
  const metodoPago = document.getElementById('despacho-metodo-pago')?.value || 'todos';

  // Formatear filas agregando explícitamente los campos extraídos del Chofer, Cliente y Vendedor
  const itemsPayload = data.items.map(item => ({
    codigo_sku: item.sku,
    detalle_producto: item.descripcion,
    cantidad: item.cantidad,
    precio_unitario: item.precioUnitario,
    subtotal: item.subtotal,
    // Campos del Chofer
    nombre_chofer: data.driver.nombre,
    rut_chofer: data.driver.rut,
    patente_vehiculo: data.driver.patente,
    transportista: data.driver.transportista,
    // Campos del Cliente
    cliente_nombre: data.client.nombre,
    cliente_rut: data.client.rut,
    giro: data.client.giro,
    direccion_despacho: data.client.direccion,
    comuna_despacho: data.client.comuna,
    // Campos del Vendedor
    vendedor: data.seller.nombre,
    forma_pago: data.seller.metodoPago,
    tipo_traslado: data.seller.tipoTraslado
  }));

  try {
    showToast('Generando guías PDF oficiales con chofer ' + data.driver.nombre + '...', 'info');

    const res = await apiFetch('/api/despachos/generar-desde-excel', {
      method: 'POST',
      body: JSON.stringify({
        modo: skuMode,
        forma_pago: metodoPago,
        items: itemsPayload
      })
    });

    if (res.success && res.generated_guides && res.generated_guides.length > 0) {
      showToast(`¡Éxito! ${res.generated_guides.length} Guía(s) PDF generada(s) con chofer "${data.driver.nombre}"`, 'success');
      
      // Abrir o descargar el primer PDF generado
      res.generated_guides.forEach((g, idx) => {
        setTimeout(() => {
          downloadDespachoPDF(g.id, g.folio);
        }, idx * 600);
      });

      if (typeof loadDespachos === 'function') {
        loadDespachos();
      }
    } else {
      showToast('Guías de despacho procesadas correctamente.', 'success');
    }
  } catch (err) {
    console.error('Error al generar guías desde Excel:', err);
    showToast('Error al generar guías: ' + err.message, 'error');
  }
}



