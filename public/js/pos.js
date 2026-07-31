let posCart = [];
let currentIssuedFolio = null;

// -------------------------------------------------------------
// 1. CARGA INICIAL DEL MÓDULO POS
// -------------------------------------------------------------
async function initPOSModule() {
  await loadPOSProducts();
  await loadPOSCustomers();
  renderPOSCategoryChips();
  renderPOSProductsGrid();
  renderPOSCart();
  setupPOSListeners();
}

// Obtener catálogo de productos y guardarlo en cache local IndexedDB
async function loadPOSProducts() {
  const gridContainer = document.getElementById('pos-products-list');
  gridContainer.innerHTML = `
    <div class="skeleton-card" style="height:180px; background:var(--bg-surface-elevated); border-radius:8px;"></div>
    <div class="skeleton-card" style="height:180px; background:var(--bg-surface-elevated); border-radius:8px;"></div>
    <div class="skeleton-card" style="height:180px; background:var(--bg-surface-elevated); border-radius:8px;"></div>
  `;

  try {
    if (AppState.isOnline) {
      const data = await apiFetch('/api/products');
      if (data.success) {
        AppState.products = data.products;
        
        // Guardar catálogo en caché local IndexedDB
        if (indexedDbInstance) {
          const transaction = indexedDbInstance.transaction(['cachedProducts'], 'readwrite');
          const store = transaction.objectStore('cachedProducts');
          // Limpiar caché anterior
          store.clear();
          data.products.forEach(p => store.put(p));
        }
      }
    } else {
      // Cargar productos desde caché de IndexedDB si estamos offline
      if (indexedDbInstance) {
        const transaction = indexedDbInstance.transaction(['cachedProducts'], 'readonly');
        const store = transaction.objectStore('cachedProducts');
        const request = store.getAll();
        
        await new Promise((resolve) => {
          request.onsuccess = (event) => {
            AppState.products = event.target.result;
            resolve();
          };
        });
      }
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Cargar clientes para el POS
async function loadPOSCustomers() {
  try {
    if (AppState.isOnline) {
      const data = await apiFetch('/api/customers');
      if (data.success) {
        AppState.customers = data.customers;
        populateClientDropdown(data.customers);
      }
    } else {
      // Cliente genérico por defecto offline
      AppState.customers = [{ id: 1, nombre: 'Cliente General / Boleta', rut_o_nit: '77.777.777-7' }];
      populateClientDropdown(AppState.customers);
    }
  } catch (err) {
    console.error('Error al cargar clientes:', err);
  }
}

function populateClientDropdown(customers) {
  const dropdown = document.getElementById('pos-client-select');
  if (dropdown) {
    dropdown.innerHTML = customers.map(c => `
      <option value="${c.id}">${c.nombre} (${c.rut_o_nit})</option>
    `).join('');
  }
}

// -------------------------------------------------------------
// 2. FILTRADO Y RENDERIZACIÓN DE PRODUCTOS EN EL GRID
// -------------------------------------------------------------
function renderPOSCategoryChips() {
  const container = document.getElementById('pos-category-filters');
  if (!container) return;

  // Obtener categorías únicas presentes en la lista de productos
  const uniqueCategories = [...new Set(AppState.products.map(p => p.categoria_nombre).filter(Boolean))];
  
  container.innerHTML = `
    <button class="chip active" data-category="all">Todos</button>
    ${uniqueCategories.map(cat => `<button class="chip" data-category="${cat}">${cat}</button>`).join('')}
  `;

  // Añadir eventos a las chips
  container.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      
      const filterCategory = chip.getAttribute('data-category');
      renderPOSProductsGrid(filterCategory, document.getElementById('pos-search-input').value);
    });
  });
}

function renderPOSProductsGrid(categoryFilter = 'all', searchQuery = '') {
  const gridContainer = document.getElementById('pos-products-list');
  if (!gridContainer) return;

  let filtered = AppState.products;

  // Filtrar por Categoría
  if (categoryFilter !== 'all') {
    filtered = filtered.filter(p => p.categoria_nombre === categoryFilter);
  }

  // Filtrar por texto de búsqueda
  if (searchQuery.trim().length > 0) {
    const term = searchQuery.toLowerCase().trim();
    filtered = filtered.filter(p => 
      p.nombre.toLowerCase().includes(term) || 
      p.codigo.toLowerCase().includes(term) || 
      (p.codigo_barra && p.codigo_barra.includes(term)) ||
      (p.marca && p.marca.toLowerCase().includes(term))
    );
  }

  if (filtered.length === 0) {
    gridContainer.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
        <span class="material-icons-round" style="font-size:48px;">search_off</span>
        <p>No se encontraron productos que coincidan con la búsqueda.</p>
      </div>
    `;
    return;
  }

  gridContainer.innerHTML = filtered.map(p => {
    let stockClass = 'in-stock';
    let stockLabel = `Stock: ${p.stock_actual}`;
    
    if (p.stock_actual <= 0) {
      stockClass = 'out-of-stock';
      stockLabel = 'Sin Stock';
    } else if (p.stock_actual <= p.stock_minimo) {
      stockClass = 'low-stock';
      stockLabel = `Bajo: ${p.stock_actual}`;
    }

    const priceFormatted = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(p.precio_venta);

    return `
      <article class="product-card" onclick="addProductToCartById(${p.id})" style="padding:12px; min-height:100px;">
        <div>
          <div class="product-brand-badge">${p.marca || 'Genérico'}</div>
          <h4 class="product-name-title" style="height:auto; margin-bottom:12px; -webkit-line-clamp:3;">${p.nombre}</h4>
          <div class="product-footer-price">
            <span class="product-price-label">${priceFormatted}</span>
            <span class="product-stock-pill ${stockClass}">${stockLabel}</span>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

// -------------------------------------------------------------
// 3. CONTROL DEL CARRITO DE VENTAS
// -------------------------------------------------------------
function addProductToCartById(id) {
  const product = AppState.products.find(p => p.id === id);
  if (!product) return;

  if (product.stock_actual <= 0) {
    showToast('El producto seleccionado no cuenta con stock disponible.', 'error');
    return;
  }

  const existingItem = posCart.find(item => item.producto_id === id);
  if (existingItem) {
    if (existingItem.cantidad >= product.stock_actual) {
      showToast('No puedes agregar más unidades del stock disponible.', 'warning');
      return;
    }
    existingItem.cantidad++;
    existingItem.subtotal = existingItem.cantidad * existingItem.precio_unitario;
  } else {
    posCart.push({
      producto_id: product.id,
      nombre: product.nombre,
      precio_unitario: parseFloat(product.precio_venta),
      cantidad: 1,
      descuento: 0,
      subtotal: parseFloat(product.precio_venta)
    });
  }

  renderPOSCart();
  showToast(`${product.nombre} agregado.`, 'success');
}

function updateCartQty(productId, delta) {
  const item = posCart.find(i => i.producto_id === productId);
  if (!item) return;

  const product = AppState.products.find(p => p.id === productId);

  if (delta > 0 && item.cantidad >= product.stock_actual) {
    showToast('Límite de stock alcanzado.', 'warning');
    return;
  }

  item.cantidad += delta;
  
  if (item.cantidad <= 0) {
    posCart = posCart.filter(i => i.producto_id !== productId);
  } else {
    item.subtotal = item.cantidad * item.precio_unitario;
  }

  renderPOSCart();
}

function removeCartItem(productId) {
  posCart = posCart.filter(i => i.producto_id !== productId);
  renderPOSCart();
}

function renderPOSCart() {
  const cartContainer = document.getElementById('pos-cart-items');
  if (!cartContainer) return;

  if (posCart.length === 0) {
    cartContainer.innerHTML = `
      <div class="empty-cart-msg">
        <span class="material-icons-round">shopping_basket</span>
        <p>El carrito de compras está vacío.</p>
      </div>
    `;
    updatePOSTotals(0, 0, 0);
    return;
  }

  cartContainer.innerHTML = posCart.map(item => {
    const priceFormatted = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(item.precio_unitario);
    const subtotalFormatted = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(item.subtotal);

    return `
      <div class="cart-item">
        <div class="cart-item-info">
          <h5>${item.nombre}</h5>
          <span class="item-unit-price">${priceFormatted} c/u</span>
        </div>
        <div class="cart-item-actions">
          <div class="qty-control">
            <button onclick="updateCartQty(${item.producto_id}, -1)"><span class="material-icons-round">remove</span></button>
            <span class="qty-num">${item.cantidad}</span>
            <button onclick="updateCartQty(${item.producto_id}, 1)"><span class="material-icons-round">add</span></button>
          </div>
          <span class="cart-item-total">${subtotalFormatted}</span>
          <button class="btn-text-error" onclick="removeCartItem(${item.producto_id})" style="padding:4px;" title="Quitar item">
            <span class="material-icons-round" style="font-size:20px;">close</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  calculatePOSTotals();
}

function calculatePOSTotals() {
  const sumSubtotal = posCart.reduce((sum, item) => sum + item.subtotal, 0);
  const discountInput = document.getElementById('pos-discount-input');
  const discountValue = discountInput ? parseFloat(discountInput.value) || 0 : 0;

  // Cálculo de IVA (19% incluido en Chile en el precio de venta)
  // Subtotal Neto = Total bruto / 1.19
  // IVA = Total bruto - Subtotal Neto
  const total = Math.max(0, sumSubtotal - discountValue);
  const neto = Math.round(total / 1.19);
  const iva = total - neto;

  updatePOSTotals(neto, iva, total);
}

function updatePOSTotals(subtotal, iva, total) {
  const fmt = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val);
  
  document.getElementById('pos-subtotal').textContent = fmt(subtotal);
  document.getElementById('pos-iva').textContent = fmt(iva);
  document.getElementById('pos-total').textContent = fmt(total);
}

// -------------------------------------------------------------
// 4. LECTOR DE CÓDIGOS DE BARRAS & OTROS LISTENERS
// -------------------------------------------------------------
function setupPOSListeners() {
  // Buscador por Nombre/Marca
  const searchInput = document.getElementById('pos-search-input');
  searchInput.addEventListener('input', (e) => {
    const activeChip = document.querySelector('#pos-category-filters .chip.active');
    const category = activeChip ? activeChip.getAttribute('data-category') : 'all';
    renderPOSProductsGrid(category, e.target.value);
  });

  // Lector de Códigos de Barras (Presionar Enter)
  const barcodeInput = document.getElementById('pos-barcode-input');
  barcodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const barcode = barcodeInput.value.trim();
      if (barcode.length > 0) {
        // Buscar producto por código de barra
        const matched = AppState.products.find(p => p.codigo_barra === barcode || p.codigo === barcode);
        if (matched) {
          addProductToCartById(matched.id);
          showToast(`Lector: ${matched.nombre} agregado.`, 'success');
        } else {
          showToast(`Producto con código "${barcode}" no encontrado.`, 'warning');
        }
        barcodeInput.value = '';
      }
    }
  });

  // Descuento manual global
  const discountInput = document.getElementById('pos-discount-input');
  discountInput.addEventListener('change', calculatePOSTotals);
  discountInput.addEventListener('keyup', calculatePOSTotals);

  // Limpiar Carrito
  document.getElementById('pos-clear-cart-btn').addEventListener('click', () => {
    posCart = [];
    renderPOSCart();
    showToast('Carrito vaciado.', 'info');
  });

  // Botón Cobrar (Abre Modal de Pago)
  document.getElementById('pos-pay-btn').addEventListener('click', () => {
    if (posCart.length === 0) {
      showToast('El carrito de compras se encuentra vacío.', 'warning');
      return;
    }
    
    // Obtener total
    calculatePOSTotals();
    const totalText = document.getElementById('pos-total').textContent;
    document.getElementById('payment-modal-total').textContent = totalText;

    // Reiniciar campos de pago
    document.getElementById('payment-method-select').value = 'efectivo';
    document.getElementById('payment-monto-input').value = '';
    document.getElementById('payment-monto-wrapper').classList.remove('hide');
    document.getElementById('payment-mixto-fields').classList.add('hide');
    document.getElementById('payment-change-value').textContent = '$0';
    document.getElementById('payment-change-box').classList.remove('hide');

    // Pre-llenar datos de envío digital del cliente
    const clientSelect = document.getElementById('pos-client-select');
    const clientId = parseInt(clientSelect.value) || 1;
    const clientData = AppState.customers ? AppState.customers.find(c => c.id === clientId) : null;
    document.getElementById('payment-client-email').value = (clientData && clientData.email) ? clientData.email : '';
    document.getElementById('payment-client-phone').value = (clientData && clientData.telefono) ? clientData.telefono : '';

    showModal('modal-payment');
  });

  // Listener para el selector de método de pago
  const methodSelect = document.getElementById('payment-method-select');
  methodSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    const mixFields = document.getElementById('payment-mixto-fields');
    const cashWrapper = document.getElementById('payment-monto-wrapper');
    const changeBox = document.getElementById('payment-change-box');

    if (val === 'mixto') {
      mixFields.classList.remove('hide');
      cashWrapper.classList.add('hide');
      changeBox.classList.add('hide');
    } else if (val === 'efectivo') {
      mixFields.classList.add('hide');
      cashWrapper.classList.remove('hide');
      changeBox.classList.remove('hide');
    } else {
      // Tarjeta, Transferencia: No requieren ingresar monto recibido para vuelto
      mixFields.classList.add('hide');
      cashWrapper.classList.add('hide');
      changeBox.classList.add('hide');
    }
  });

  // Calculador de vuelto dinámico
  const montoInput = document.getElementById('payment-monto-input');
  montoInput.addEventListener('input', () => {
    const totalVal = posCart.reduce((sum, item) => sum + item.subtotal, 0);
    const disc = parseFloat(document.getElementById('pos-discount-input').value) || 0;
    const total = Math.max(0, totalVal - disc);
    const recibido = parseFloat(montoInput.value) || 0;
    
    const vuelto = recibido - total;
    const changeValEl = document.getElementById('payment-change-value');
    if (vuelto >= 0) {
      changeValEl.textContent = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(vuelto);
      changeValEl.style.color = '#22C55E';
    } else {
      changeValEl.textContent = 'Monto Insuficiente';
      changeValEl.style.color = 'var(--color-primary)';
    }
  });

  // Formulario de Confirmar Pago
  document.getElementById('payment-form').addEventListener('submit', handleProcessCheckout);

  // Agregar cliente rápido desde POS
  document.getElementById('pos-quick-add-client-btn').addEventListener('click', () => {
    document.getElementById('client-form').reset();
    document.getElementById('client-id-input').value = '';
    document.getElementById('client-modal-title').textContent = 'Registrar Cliente Rápido';
    showModal('modal-client');
  });

  // Botón Imprimir en ticket (Soluciona bloqueo de hilo síncrono de window.print)
  document.getElementById('btn-print-ticket').addEventListener('click', () => {
    // 1. Disparar notificaciones primero para que la petición salga antes de congelar el navegador
    if (currentIssuedFolio && AppState.isOnline) {
      showToast('Enviando boleta por Correo y WhatsApp...', 'info');
      apiFetch(`/api/sales/${currentIssuedFolio}/notify`, { method: 'POST' })
        .then(res => {
          if (res.success) {
            showToast('¡Notificaciones enviadas de forma automática!', 'success');
          }
        })
        .catch(err => {
          console.error('Error al enviar notificaciones:', err);
          showToast('Error al procesar el envío automático.', 'error');
        });
    }

    // 2. Abrir cuadro de impresión en diferido para evitar bloquear el request
    setTimeout(() => {
      window.print();
    }, 250);
  });

  // Botón descargar PDF / Finalizar
  document.getElementById('btn-download-pdf').addEventListener('click', () => {
    showToast('Boleta PDF generada e ingresada en el historial de descargas.', 'success');
    closeModal('modal-ticket');
    
    if (currentIssuedFolio && AppState.isOnline) {
      apiFetch(`/api/sales/${currentIssuedFolio}/notify`, { method: 'POST' })
        .catch(err => console.error('Error de notificaciones:', err));
    }
  });

  // Botón compartir por WhatsApp
  document.getElementById('btn-wsp-ticket').addEventListener('click', () => {
    const thermalTicket = document.getElementById('thermal-ticket');
    if (thermalTicket) {
      const text = thermalTicket.innerText || thermalTicket.textContent;
      const cleanText = text.replace(/-------------------------------------------/g, '\n').replace(/\n\s*\n/g, '\n');
      const encodedText = encodeURIComponent(cleanText);
      window.open(`https://wa.me/56989784973?text=${encodedText}`, '_blank');
      showToast('Abriendo enlace de envío WhatsApp...', 'success');
    }
  });
}

// -------------------------------------------------------------
// 5. REGISTRO TRANSACCIONAL Y EMISIÓN DE BOLETA
// -------------------------------------------------------------
async function handleProcessCheckout(e) {
  e.preventDefault();

  const clienteId = parseInt(document.getElementById('pos-client-select').value) || 1;
  const method = document.getElementById('payment-method-select').value;
  const observacion = document.getElementById('pos-observacion-input').value.trim();
  const sumSubtotal = posCart.reduce((sum, item) => sum + item.subtotal, 0);
  const discountVal = parseFloat(document.getElementById('pos-discount-input').value) || 0;
  const total = Math.max(0, sumSubtotal - discountVal);
  const neto = Math.round(total / 1.19);
  const iva = total - neto;

  let montoRecibido = total;
  let pagoDetalle = null;

  if (method === 'efectivo') {
    montoRecibido = parseFloat(document.getElementById('payment-monto-input').value) || 0;
    if (montoRecibido < total) {
      showToast('El monto recibido en efectivo es menor al total a pagar.', 'error');
      return;
    }
  } else if (method === 'mixto') {
    const cash = parseFloat(document.getElementById('pay-mix-cash').value) || 0;
    const card = parseFloat(document.getElementById('pay-mix-card').value) || 0;
    const trans = parseFloat(document.getElementById('pay-mix-trans').value) || 0;
    
    montoRecibido = cash + card + trans;
    pagoDetalle = { cash, card, trans };

    if (montoRecibido < total) {
      showToast(`Monto mixto insuficiente. Suma: $${montoRecibido}, Faltante: $${total - montoRecibido}`, 'error');
      return;
    }
  }

  const clientEmail = document.getElementById('payment-client-email').value.trim();
  const clientPhone = document.getElementById('payment-client-phone').value.trim();

  // Estructurar payload
  const salePayload = {
    cliente_id: clienteId,
    cliente_email: clientEmail,
    cliente_telefono: clientPhone,
    subtotal: neto,
    iva: iva,
    total: total,
    descuento: discountVal,
    observacion: observacion,
    pago_metodo: method,
    pago_monto: montoRecibido,
    pago_detalle: pagoDetalle,
    productos: posCart
  };

  try {
    if (AppState.isOnline) {
      // Registrar en el Servidor (PostgreSQL)
      const res = await apiFetch('/api/sales', {
        method: 'POST',
        body: JSON.stringify(salePayload)
      });

      if (res.success) {
        showToast('Venta registrada con éxito. Enviando notificaciones...', 'success');
        closeModal('modal-payment');
        renderThermalTicket(res.ticket);
        currentIssuedFolio = res.ticket.folio;
        
        // Redirección WhatsApp automática en segundo plano (pop-up seguro)
        try {
          const targetPhone = clientPhone ? clientPhone.replace(/\+/g, '').replace(/\s/g, '') : '56989784973';
          const text = `¡Tu compra en Eleodoro El Grande se ha realizado con éxito!\n\n` +
            `*FOLIO BOLETA:* ${res.ticket.folio}\n` +
            `*Fecha:* ${new Date(res.ticket.fecha_hora).toLocaleString('es-CL')}\n` +
            `*Cliente:* ${res.ticket.cliente}\n` +
            `*Total Pagado:* $${parseInt(res.ticket.total).toLocaleString('es-CL')}\n` +
            `*Medio de Pago:* ${res.ticket.pago_metodo.toUpperCase()}\n\n` +
            `Te adjuntamos el PDF de la boleta de venta en tu correo electrónico. ¡Gracias por tu preferencia!`;
          const encodedText = encodeURIComponent(text);
          window.open(`https://wa.me/${targetPhone}?text=${encodedText}`, '_blank');
        } catch (e) {
          console.error('Error al abrir WhatsApp automático:', e);
        }

        // Limpiar caja
        posCart = [];
        document.getElementById('pos-observacion-input').value = '';
        document.getElementById('pos-discount-input').value = '0';
        renderPOSCart();
        
        // Recargar stock catálogo de productos en segundo plano (sin retrasar la transición)
        loadPOSProducts().then(() => renderPOSProductsGrid());
        
        showModal('modal-ticket');
      }
    } else {
      // Registrar localmente (IndexedDB)
      queueOfflineSale(salePayload);
      closeModal('modal-payment');
      
      // Simular recibo offline
      const localTicket = {
        folio: 'OFF-BOL-' + Date.now(),
        fecha_hora: new Date().toISOString(),
        vendedor: AppState.user ? AppState.user.nombre : 'Vendedor Local',
        cliente: 'Cliente Local / General',
        cliente_rut: '77.777.777-7',
        subtotal: neto,
        iva: iva,
        total: total,
        descuento: discountVal,
        observacion: observacion,
        pago_metodo: method,
        pago_monto: montoRecibido,
        cambio: (montoRecibido - total) > 0 ? (montoRecibido - total) : 0,
        items: posCart
      };
      
      renderThermalTicket(localTicket);
      currentIssuedFolio = localTicket.folio;

      // Redirección WhatsApp automática (Modo Offline)
      try {
        const targetPhone = clientPhone ? clientPhone.replace(/\+/g, '').replace(/\s/g, '') : '56989784973';
        const text = `¡Tu compra en Eleodoro El Grande se ha realizado con éxito! (Modo Contingencia Local)\n\n` +
          `*FOLIO BOLETA:* ${localTicket.folio}\n` +
          `*Total Pagado:* $${parseInt(localTicket.total).toLocaleString('es-CL')}\n` +
          `*Medio de Pago:* ${localTicket.pago_metodo.toUpperCase()}\n\n` +
          `La boleta quedará sincronizada en cuanto vuelva la conexión.`;
        const encodedText = encodeURIComponent(text);
        window.open(`https://wa.me/${targetPhone}?text=${encodedText}`, '_blank');
      } catch (e) {
        console.error('Error al abrir WhatsApp automático:', e);
      }
      
      posCart = [];
      document.getElementById('pos-observacion-input').value = '';
      document.getElementById('pos-discount-input').value = '0';
      renderPOSCart();
      
      showModal('modal-ticket');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Dibujar boleta / ticket térmico de supermercado
function renderThermalTicket(ticket) {
  const container = document.getElementById('thermal-ticket');
  const fmt = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val);
  
  const dateFormatted = new Date(ticket.fecha_hora).toLocaleString('es-CL');

  container.innerHTML = `
    <div class="ticket-header">
      <h4>ELEODORO EL GRANDE</h4>
      <p>DISTRIBUIDORA DE BEBIDAS Y LICORES</p>
      <p>Av. Principal 4500, Santiago</p>
      <p>Teléfono: +56 9 8765 4321</p>
      <p>RUT: 76.999.888-K</p>
    </div>
    
    <div class="ticket-meta">
      <strong>FOLIO BOLETA: ${ticket.folio}</strong><br>
      Fecha: ${dateFormatted}<br>
      Vendedor: ${ticket.vendedor}<br>
      Cliente: ${ticket.cliente} (RUT: ${ticket.cliente_rut})
    </div>
    
    <table class="ticket-table">
      <thead>
        <tr>
          <th align="left">Descrip.</th>
          <th align="center">Cant.</th>
          <th align="right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${ticket.items.map(item => `
          <tr>
            <td align="left">${item.nombre.substring(0, 20)}</td>
            <td align="center">${item.cantidad}</td>
            <td align="right">${fmt(item.subtotal)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    
    <div class="ticket-totals-section">
      <div class="ticket-total-row">
        <span>Subtotal Neto:</span>
        <span>${fmt(ticket.subtotal)}</span>
      </div>
      <div class="ticket-total-row">
        <span>IVA (19%):</span>
        <span>${fmt(ticket.iva)}</span>
      </div>
      ${ticket.descuento > 0 ? `
      <div class="ticket-total-row" style="color:red;">
        <span>Descuento:</span>
        <span>-${fmt(ticket.descuento)}</span>
      </div>` : ''}
      <div class="ticket-total-row big">
        <span>TOTAL:</span>
        <span>${fmt(ticket.total)}</span>
      </div>
      <div class="ticket-total-row">
        <span>Pago (${ticket.pago_metodo.toUpperCase()}):</span>
        <span>${fmt(ticket.pago_monto)}</span>
      </div>
      <div class="ticket-total-row">
        <span>Vuelto:</span>
        <span>${fmt(ticket.cambio)}</span>
      </div>
    </div>
    
    <div class="ticket-footer">
      <p>¡GRACIAS POR SU PREFERENCIA!</p>
      <p>Eleodoro El Grande Distribuidora</p>
      <p>Soporte ERP por Harvard Corp</p>
    </div>
  `;

  // Pre-llenar campos de compartir con el cliente
  document.getElementById('share-client-email').value = ticket.cliente_email || '';
  document.getElementById('share-client-phone').value = ticket.cliente_telefono || '';
}
