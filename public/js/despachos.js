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
