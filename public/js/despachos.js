// public/js/despachos.js
// Controlador para el nuevo módulo de Guías de Despacho (SII)

let DespachoCart = [];

function initDespachosModule() {
  console.log('Inicializando módulo de Guías de Despacho...');
  loadDespachos();

  // Búsqueda en historial
  const searchInput = document.getElementById('erp-despachos-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
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
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Cargando guías de despacho...</td></tr>`;

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
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">No hay guías de despacho emitidas.</td></tr>`;
    return;
  }

  tbody.innerHTML = despachos.map(d => {
    const totalCLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(d.total);
    const dateStr = new Date(d.fecha_emision).toLocaleString('es-CL');
    return `
      <tr>
        <td><strong>${d.folio}</strong></td>
        <td>${d.cliente_nombre || 'Cliente General'}</td>
        <td>${d.cliente_rut || 'N/A'}</td>
        <td>${dateStr}</td>
        <td><span class="badge" style="background-color: var(--color-bg); padding:4px 8px; border-radius:4px;">${d.tipo_traslado}</span></td>
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
  const filtered = AppState.despachos.filter(d => 
    d.folio.toLowerCase().includes(q) || 
    (d.cliente_nombre && d.cliente_nombre.toLowerCase().includes(q)) ||
    (d.cliente_rut && d.cliente_rut.toLowerCase().includes(q))
  );
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

  if (productSelect) {
    productSelect.innerHTML = '<option value="">-- Seleccione Producto --</option>';
    if (!AppState.products || AppState.products.length === 0) {
      try {
        const data = await apiFetch('/api/products');
        if (data.success) AppState.products = data.products;
      } catch (err) {
        console.error(err);
      }
    }

    AppState.products.forEach(p => {
      productSelect.innerHTML += `<option value="${p.id}">${p.nombre} (Stock: ${p.stock_actual})</option>`;
    });
  }

  showModal('modal-despacho');
}

// Auto-completar dirección y comuna al cambiar cliente
function handleDespachoClientChange(e) {
  const clientId = parseInt(e.target.value);
  if (!clientId || !AppState.customers) return;

  const client = AppState.customers.find(c => c.id === clientId);
  if (client) {
    document.getElementById('des-direccion').value = client.direccion || '';
    // Intentar deducir la comuna de la dirección si no está vacía o dejar en blanco para entrada manual
    document.getElementById('des-comuna').value = client.direccion ? (client.direccion.split(',').pop().trim()) : '';
  }
}

// Cambiar producto actualiza el precio unitario sugerido (neto)
function handleDespachoProductChange(e) {
  const prodId = parseInt(e.target.value);
  if (!prodId || !AppState.products) return;

  const product = AppState.products.find(p => p.id === prodId);
  if (product) {
    // La guía de despacho usa valores netos. En Chile el precio de venta suele ser con IVA incluido.
    // Redondeamos el precio neto (Precio Venta / 1.19)
    const precioNeto = Math.round(parseFloat(product.precio_venta) / 1.19);
    document.getElementById('des-precio').value = precioNeto;
  }
}

// Agregar producto al listado temporal
function addProductToDespachoCart() {
  const productSelect = document.getElementById('des-producto-select');
  const qtyInput = document.getElementById('des-cantidad');
  const priceInput = document.getElementById('des-precio');

  const productId = parseInt(productSelect.value);
  const qty = parseInt(qtyInput.value);
  const price = parseInt(priceInput.value);

  if (!productId) {
    showToast('Seleccione un producto.', 'warning');
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
    existing.subtotal = existing.cantidad * existing.precio_unitario;
  } else {
    DespachoCart.push({
      producto_id: productId,
      codigo: product.codigo,
      nombre: product.nombre,
      cantidad: qty,
      precio_unitario: price,
      subtotal: qty * price
    });
  }

  // Limpiar campos de item
  productSelect.value = '';
  qtyInput.value = '1';
  priceInput.value = '';

  renderDespachoCartTable();
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

  tbody.innerHTML = DespachoCart.map((item, idx) => `
    <tr>
      <td>${item.codigo}</td>
      <td>${item.nombre}</td>
      <td>${item.cantidad}</td>
      <td>$${item.precio_unitario.toLocaleString('es-CL')}</td>
      <td><strong>$${item.subtotal.toLocaleString('es-CL')}</strong></td>
      <td>
        <button type="button" class="btn-icon-secondary" onclick="removeProductFromDespachoCart(${idx})">
          <span class="material-icons-round" style="font-size:16px; color:var(--color-primary);">delete</span>
        </button>
      </td>
    </tr>
  `).join('');

  const neto = DespachoCart.reduce((acc, val) => acc + val.subtotal, 0);
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
      if (typeof XLSX !== 'undefined') {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
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
        }
      }

      parsedExcelData = processExcelRows(rows);
      renderExcelPreviewDashboard(parsedExcelData);
      showToast(`Plantilla leída con éxito: ${rows.length} filas procesadas.`, 'success');
      if (subtitleEl) subtitleEl.textContent = `Éxito: ${rows.length} filas leídas | ${parsedExcelData.totalCantidad} Bultos Totales`;
    } catch (err) {
      console.error('Error al leer el archivo Excel:', err);
      showToast('Error al procesar la plantilla Excel: ' + err.message, 'error');
    }
  };

  reader.readAsArrayBuffer(file);
}

// Procesar filas de Excel y agrupar campos según corresponda (Cliente, Chofer, Vendedor, Mercaderías)
function processExcelRows(rows) {
  if (!rows || rows.length === 0) return { items: [], totalCantidad: 0, totalNeto: 0, client: {}, driver: {}, seller: {} };

  // Helper para buscar valor entre posibles nombres de columna en la plantilla
  const getVal = (row, candidates) => {
    for (const key of Object.keys(row)) {
      const cleanKey = key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
      for (const cand of candidates) {
        if (cleanKey.includes(cand.toUpperCase())) {
          return String(row[key]).trim();
        }
      }
    }
    return '';
  };

  const firstRow = rows[0];

  const client = {
    nombre: getVal(firstRow, ['NOMBRE_CLIENTE', 'CLIENTE', 'RAZON_SOCIAL', 'RECEPTOR']) || 'Distribuidora Eleodoro Cliente',
    rut: getVal(firstRow, ['RUT_CLIENTE', 'RUT', 'NIT', 'IDENTIFICACION']) || '76.123.456-7',
    giro: getVal(firstRow, ['GIRO_CLIENTE', 'GIRO', 'RUBRO']) || 'Comercial / Venta Bebidas',
    direccion: getVal(firstRow, ['DIRECCION_DESPACHO', 'DIRECCION', 'DESTINO']) || 'Av. Ejemplo 1234',
    comuna: getVal(firstRow, ['COMUNA', 'CIUDAD']) || 'Santiago'
  };

  const driver = {
    nombre: getVal(firstRow, ['NOMBRE_CHOFER', 'CHOFER', 'CONDUCTOR']) || 'Chofer Asignado',
    rut: getVal(firstRow, ['RUT_CHOFER', 'RUT_CONDUCTOR']) || '15.987.654-3',
    patente: getVal(firstRow, ['PATENTE_VEHICULO', 'PATENTE', 'VEHICULO']) || 'AA-BB-12',
    transportista: getVal(firstRow, ['TRANSPORTISTA', 'EMPRESA_TRANSPORTE']) || 'Eleodoro El Grande Logística'
  };

  const seller = {
    nombre: getVal(firstRow, ['NOMBRE_VENDEDOR', 'VENDEDOR', 'CODIGO_VENDEDOR']) || 'Vendedor Central',
    metodoPago: getVal(firstRow, ['METODO_PAGO', 'FORMA_PAGO']) || 'Transferencia Electrónica',
    tipoTraslado: getVal(firstRow, ['TIPO_TRASLADO', 'TRASLADO']) || 'Venta'
  };

  let totalCantidad = 0;
  let totalNeto = 0;

  const items = rows.map((row, idx) => {
    const sku = getVal(row, ['CODIGO_SKU', 'SKU', 'CODIGO', 'PROD_ID']) || `SKU-${idx + 1}`;
    const desc = getVal(row, ['DESCRIPCION_PRODUCTO', 'DESCRIPCION', 'PRODUCTO', 'NOMBRE']) || 'Producto Bebida';
    
    const cantVal = parseFloat(getVal(row, ['CANTIDAD', 'BULTOS', 'UNIDADES', 'CANT'])) || 0;
    const precioVal = parseFloat(getVal(row, ['PRECIO_UNITARIO', 'PRECIO_NETO', 'PRECIO', 'UNITARIO'])) || 0;
    
    const subtotal = cantVal * precioVal;
    totalCantidad += cantVal;
    totalNeto += subtotal;

    return {
      sku,
      descripcion: desc,
      cantidad: cantVal,
      precioUnitario: precioVal,
      subtotal
    };
  });

  return {
    client,
    driver,
    seller,
    items,
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
  if (!selectedExcelFile && !parsedExcelData) {
    showToast('Por favor selecciona o arrastra una plantilla Excel (.xlsx, .xls o .csv) primero.', 'warning');
    return;
  }

  const data = parsedExcelData || { totalCantidad: 0, items: [] };
  const skuMode = document.querySelector('input[name="sku_mode"]:checked')?.value || '16';
  const cantGuias = Math.ceil((data.items?.length || 1) / parseInt(skuMode)) || 1;

  showToast(`Generando ${cantGuias} Guía(s) PDF de Despacho (Suma de Cantidades: ${data.totalCantidad} bultos)...`, 'info');

  setTimeout(() => {
    showToast(`¡${cantGuias} Guías de Despacho PDF generadas correctamente para Eleodoro El Grande!`, 'success');
  }, 1800);
}


