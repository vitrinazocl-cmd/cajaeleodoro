// server.js
// Servidor Backend Express.js para Eleodoro El Grande Distribuidora
// Diseñado bajo estándares de Clean Code, SOLID y Alta Seguridad (XSS/SQL injection prevention, Rate Limit)

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const db = require('./database/connection');
const notifications = require('./database/notifications');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'eleodoro_el_grande_secret_key_2026_harvard';

// MIDDLEWARES DE SEGURIDAD Y PARSEO
const compression = require('compression');
app.use(compression()); // Activar compresión GZIP de todas las respuestas estáticas y de API
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Limitador de peticiones en memoria para protección DDoS y Fuerza Bruta
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minuto
const MAX_REQUESTS = 100; // Máximo 100 peticiones por minuto por IP para uso normal
const AUTH_MAX_REQUESTS = 10; // Máximo 10 intentos de login por minuto por IP

function rateLimiter(isAuthRoute = false) {
  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const now = Date.now();
    const key = `${ip}:${isAuthRoute ? 'auth' : 'api'}`;
    
    if (!rateLimitMap.has(key)) {
      rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
      return next();
    }
    
    const limit = rateLimitMap.get(key);
    if (now > limit.resetTime) {
      limit.count = 1;
      limit.resetTime = now + RATE_LIMIT_WINDOW;
      return next();
    }
    
    limit.count++;
    const max = isAuthRoute ? AUTH_MAX_REQUESTS : MAX_REQUESTS;
    if (limit.count > max) {
      return res.status(429).json({ 
        success: false, 
        message: `Demasiadas peticiones detectadas. Por seguridad, por favor intenta nuevamente en ${Math.round((limit.resetTime - now) / 1000)} segundos.` 
      });
    }
    
    next();
  };
}

// Aplicar limitador de seguridad a todas las llamadas a la API
app.use('/api', rateLimiter(false));

// Cabeceras de seguridad avanzadas (OWASP/SANS compliant)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Content-Security-Policy', "default-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; connect-src 'self' https://wa.me; frame-ancestors 'none'; form-action 'self'");
  next();
});

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// AUDITORÍA INTERNA Y LOGS
async function registerAudit(usuarioId, accion, tablaAfectada, registroId, valorAnterior, valorNuevo, ipAddress) {
  try {
    await db.query(
      'INSERT INTO auditoria (usuario_id, accion, tabla_afectada, registro_id, valor_anterior, valor_nuevo, ip_address) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [usuarioId, accion, tablaAfectada, registroId, valorAnterior, valorNuevo, ipAddress]
    );
  } catch (err) {
    console.error('Error al registrar auditoría:', err.message);
  }
}

async function registerLog(nivel, mensaje, contexto) {
  try {
    await db.query(
      'INSERT INTO logs (nivel, mensaje, contexto) VALUES ($1, $2, $3)',
      [nivel, mensaje, contexto]
    );
  } catch (err) {
    console.error('Error al registrar log:', err.message);
  }
}

// MIDDLEWARE DE AUTENTICACIÓN JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Token de acceso no proporcionado.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Token inválido o expirado.' });
    }
    req.user = user;
    next();
  });
}

// MIDDLEWARE DE VERIFICACIÓN DE ROL
function requireRole(rolesPermitidos) {
  return (req, res, next) => {
    if (!req.user || !rolesPermitidos.includes(req.user.rol_nombre)) {
      return res.status(403).json({ success: false, message: 'No tienes permisos suficientes para realizar esta acción.' });
    }
    next();
  };
}

// -------------------------------------------------------------
// RUTAS DE AUTENTICACIÓN
// -------------------------------------------------------------

app.post('/api/auth/login', rateLimiter(true), async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Usuario y clave requeridos.' });
  }

  try {
    const userRes = await db.query(
      `SELECT u.*, r.nombre as rol_nombre 
       FROM usuarios u 
       LEFT JOIN roles r ON u.rol_id = r.id 
       WHERE u.username = $1 AND u.estado = 'activo'`, 
      [username]
    );

    if (userRes.rows.length === 0) {
      await registerLog('WARNING', `Intento de login fallido para usuario: ${username}`, `IP: ${req.ip}`);
      await new Promise(resolve => setTimeout(resolve, 800)); // Freno artificial para ralentizar ataques de fuerza bruta
      return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos.' });
    }

    const user = userRes.rows[0];
    const passwordMatch = bcrypt.compareSync(password, user.password_hash);

    if (!passwordMatch) {
      await registerLog('WARNING', `Intento de login con clave errónea para usuario: ${username}`, `IP: ${req.ip}`);
      await new Promise(resolve => setTimeout(resolve, 800)); // Freno artificial para ralentizar ataques de fuerza bruta
      return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos.' });
    }

    // Firmar Token JWT
    const token = jwt.sign(
      { id: user.id, username: user.username, nombre: user.nombre, rol_nombre: user.rol_nombre },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    await registerAudit(user.id, 'LOGIN', 'usuarios', user.id, null, 'Sesión iniciada', req.ip);
    await registerLog('INFO', `Login exitoso de usuario: ${username}`, `ID: ${user.id}`);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol_nombre,
        db_mode: db.getMode()
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error interno del servidor en login.' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  res.json({
    success: true,
    user: {
      ...req.user,
      db_mode: db.getMode()
    }
  });
});

// -------------------------------------------------------------
// APIS DE PRODUCTOS Y CATEGORÍAS
// -------------------------------------------------------------

app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    const productsRes = await db.query(
      `SELECT p.*, c.nombre as categoria_nombre, pr.nombre as proveedor_nombre
       FROM productos p
       LEFT JOIN categorias c ON p.categoria_id = c.id
       LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
       ORDER BY p.nombre ASC`
    );
    res.json({ success: true, products: productsRes.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error al consultar productos.' });
  }
});

app.post('/api/products', authenticateToken, requireRole(['Administrador', 'Supervisor', 'Bodega']), async (req, res) => {
  const { codigo, sku, codigo_barra, nombre, descripcion, categoria_id, marca, proveedor_id, precio_costo, precio_venta, stock_actual, stock_minimo, imagen_url } = req.body;
  
  if (!codigo || !nombre || !precio_venta) {
    return res.status(400).json({ success: false, message: 'Código, Nombre y Precio de Venta son campos obligatorios.' });
  }

  const margen = precio_costo ? (((precio_venta - precio_costo) / precio_venta) * 100).toFixed(2) : 100.00;

  try {
    // Insertar producto
    const result = await db.query(
      `INSERT INTO productos 
       (codigo, sku, codigo_barra, nombre, descripcion, categoria_id, marca, proveedor_id, precio_costo, precio_venta, margen, stock_actual, stock_minimo, imagen_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [codigo, sku, codigo_barra, nombre, descripcion, categoria_id || null, marca || '', proveedor_id || null, precio_costo || 0, precio_venta, margen, stock_actual || 0, stock_minimo || 5, imagen_url || '']
    );

    const newProduct = result.rows[0];

    // Crear inventario consolidado asociado
    await db.query(
      `INSERT INTO inventario (producto_id, stock_actual, stock_minimo, ubicacion)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (producto_id) DO UPDATE SET stock_actual = $2`,
      [newProduct.id, stock_actual || 0, stock_minimo || 5, 'Bodega General']
    );

    // Registrar Kardex
    if (stock_actual > 0) {
      await db.query(
        `INSERT INTO movimientos_inventario (producto_id, tipo_movimiento, cantidad, motivo, usuario_id)
         VALUES ($1, 'ingreso_ajuste', $2, 'Carga de inventario inicial en creación del producto', $3)`,
        [newProduct.id, stock_actual, req.user.id]
      );
    }

    await registerAudit(req.user.id, 'CREACION_PRODUCTO', 'productos', newProduct.id, null, JSON.stringify(newProduct), req.ip);

    res.status(201).json({ success: true, product: newProduct });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error al crear producto. Verifique duplicados de código o barra.' });
  }
});

app.patch('/api/products/:id/toggle-status', authenticateToken, requireRole(['Administrador', 'Supervisor', 'Bodega']), async (req, res) => {
  const { id } = req.params;
  try {
    const check = await db.query('SELECT estado, nombre FROM productos WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado.' });
    }
    
    const currentStatus = check.rows[0].estado || 'activo';
    const newStatus = currentStatus === 'activo' ? 'agotado' : 'activo';
    
    await db.query('UPDATE productos SET estado = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newStatus, id]);
    
    await registerAudit(req.user.id, 'CAMBIO_ESTADO_PRODUCTO', 'productos', id, currentStatus, newStatus, req.ip);
    await registerLog('INFO', `Producto '${check.rows[0].nombre}' cambiado a ${newStatus.toUpperCase()}`, `ID: ${id}`);
    
    res.json({ success: true, estado: newStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error al cambiar estado del producto.' });
  }
});

app.put('/api/products/:id', authenticateToken, requireRole(['Administrador', 'Supervisor', 'Bodega']), async (req, res) => {
  const { id } = req.params;
  const { codigo, sku, codigo_barra, nombre, descripcion, categoria_id, marca, proveedor_id, precio_costo, precio_venta, stock_minimo, imagen_url } = req.body;
  
  if (!nombre || !precio_venta) {
    return res.status(400).json({ success: false, message: 'Nombre y Precio de venta obligatorios.' });
  }

  const margen = precio_costo ? (((precio_venta - precio_costo) / precio_venta) * 100).toFixed(2) : 100.00;

  try {
    const origRes = await db.query('SELECT * FROM productos WHERE id = $1', [id]);
    if (origRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado.' });
    }

    const result = await db.query(
      `UPDATE productos SET
       codigo = $1, sku = $2, codigo_barra = $3, nombre = $4, descripcion = $5,
       categoria_id = $6, marca = $7, proveedor_id = $8, precio_costo = $9, precio_venta = $10,
       margen = $11, stock_minimo = $12, imagen_url = $13, updated_at = CURRENT_TIMESTAMP
       WHERE id = $14
       RETURNING *`,
      [codigo, sku, codigo_barra, nombre, descripcion, categoria_id || null, marca || '', proveedor_id || null, precio_costo || 0, precio_venta, margen, stock_minimo || 5, imagen_url || '', id]
    );

    const updatedProduct = result.rows[0];

    // Actualizar inventario stock_minimo
    await db.query(
      `UPDATE inventario SET stock_minimo = $1 WHERE producto_id = $2`,
      [stock_minimo || 5, id]
    );

    await registerAudit(req.user.id, 'MODIFICACION_PRODUCTO', 'productos', id, JSON.stringify(origRes.rows[0]), JSON.stringify(updatedProduct), req.ip);

    res.json({ success: true, product: updatedProduct });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error al actualizar producto.' });
  }
});

app.delete('/api/products/:id', authenticateToken, requireRole(['Administrador']), async (req, res) => {
  const { id } = req.params;
  try {
    const origRes = await db.query('SELECT * FROM productos WHERE id = $1', [id]);
    if (origRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado.' });
    }

    // Primero eliminar de inventario
    await db.query('DELETE FROM inventario WHERE producto_id = $1', [id]);
    // Eliminar producto
    await db.query('DELETE FROM productos WHERE id = $1', [id]);

    await registerAudit(req.user.id, 'ELIMINACION_PRODUCTO', 'productos', id, JSON.stringify(origRes.rows[0]), 'Eliminado lógicamente del stock', req.ip);

    res.json({ success: true, message: 'Producto eliminado del catálogo.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'No se puede eliminar el producto debido a que cuenta con transacciones históricas.' });
  }
});

app.get('/api/categories', authenticateToken, async (req, res) => {
  try {
    const categoriesRes = await db.query('SELECT * FROM categorias ORDER BY nombre ASC');
    res.json({ success: true, categories: categoriesRes.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error al consultar categorías.' });
  }
});

// -------------------------------------------------------------
// APIS DE CLIENTES Y PROVEEDORES (CRUD COMPLETO)
// -------------------------------------------------------------

app.get('/api/customers', authenticateToken, async (req, res) => {
  try {
    const cRes = await db.query('SELECT * FROM clientes ORDER BY nombre ASC');
    res.json({ success: true, customers: cRes.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error al consultar clientes.' });
  }
});

app.post('/api/customers', authenticateToken, async (req, res) => {
  const { rut_o_nit, nombre, telefono, email, direccion } = req.body;
  if (!rut_o_nit || !nombre) {
    return res.status(400).json({ success: false, message: 'RUT y Nombre requeridos.' });
  }
  try {
    const result = await db.query(
      'INSERT INTO clientes (rut_o_nit, nombre, telefono, email, direccion) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [rut_o_nit, nombre, telefono || '', email || '', direccion || '']
    );
    res.status(201).json({ success: true, customer: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error al guardar cliente. Verifique si el RUT ya existe.' });
  }
});

app.put('/api/customers/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { rut_o_nit, nombre, telefono, email, direccion } = req.body;
  try {
    const result = await db.query(
      'UPDATE clientes SET rut_o_nit=$1, nombre=$2, telefono=$3, email=$4, direccion=$5, updated_at=CURRENT_TIMESTAMP WHERE id=$6 RETURNING *',
      [rut_o_nit, nombre, telefono, email, direccion, id]
    );
    res.json({ success: true, customer: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error al actualizar cliente.' });
  }
});

app.delete('/api/customers/:id', authenticateToken, requireRole(['Administrador', 'Supervisor']), async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM clientes WHERE id = $1', [id]);
    res.json({ success: true, message: 'Cliente eliminado.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error al eliminar cliente. Puede tener ventas asociadas.' });
  }
});

// PROVEEDORES
app.get('/api/suppliers', authenticateToken, async (req, res) => {
  try {
    const pRes = await db.query('SELECT * FROM proveedores ORDER BY nombre ASC');
    res.json({ success: true, suppliers: pRes.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error al consultar proveedores.' });
  }
});

app.post('/api/suppliers', authenticateToken, requireRole(['Administrador', 'Supervisor', 'Bodega']), async (req, res) => {
  const { rut_o_nit, nombre, contacto, telefono, email, direccion } = req.body;
  if (!rut_o_nit || !nombre) {
    return res.status(400).json({ success: false, message: 'RUT y Nombre requeridos.' });
  }
  try {
    const result = await db.query(
      'INSERT INTO proveedores (rut_o_nit, nombre, contacto, telefono, email, direccion) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [rut_o_nit, nombre, contacto || '', telefono || '', email || '', direccion || '']
    );
    res.status(201).json({ success: true, supplier: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error al registrar proveedor. RUT ya registrado.' });
  }
});

app.put('/api/suppliers/:id', authenticateToken, requireRole(['Administrador', 'Supervisor', 'Bodega']), async (req, res) => {
  const { id } = req.params;
  const { rut_o_nit, nombre, contacto, telefono, email, direccion } = req.body;
  try {
    const result = await db.query(
      'UPDATE proveedores SET rut_o_nit=$1, nombre=$2, contacto=$3, telefono=$4, email=$5, direccion=$6, updated_at=CURRENT_TIMESTAMP WHERE id=$7 RETURNING *',
      [rut_o_nit, nombre, contacto, telefono, email, direccion, id]
    );
    res.json({ success: true, supplier: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error al actualizar proveedor.' });
  }
});

app.delete('/api/suppliers/:id', authenticateToken, requireRole(['Administrador']), async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM proveedores WHERE id = $1', [id]);
    res.json({ success: true, message: 'Proveedor eliminado.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error al eliminar. Puede tener compras asociadas.' });
  }
});

// -------------------------------------------------------------
// APIS DE CAJA REGISTRADORA (POS - TRANSACCIONAL)
// -------------------------------------------------------------

app.post('/api/sales', authenticateToken, async (req, res) => {
  const { cliente_id, subtotal, iva, total, descuento, observacion, productos, pago_metodo, pago_monto, cliente_email, cliente_telefono } = req.body;

  if (!productos || productos.length === 0 || !pago_metodo) {
    return res.status(400).json({ success: false, message: 'Falta información requerida para registrar la venta.' });
  }

  const folio = 'BOL-' + Date.now();

  try {
    // 1. Crear Venta (Encabezado)
    const saleResult = await db.query(
      `INSERT INTO ventas (folio, usuario_id, cliente_id, subtotal, iva, total, descuento, observacion, sync_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'sincronizado')
       RETURNING *`,
      [folio, req.user.id, cliente_id || 1, subtotal, iva, total, descuento || 0, observacion || '']
    );
    const sale = saleResult.rows[0];

    // 2. Crear Detalles & Descontar Stock
    for (const item of productos) {
      // Registrar Detalle
      await db.query(
        `INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, descuento, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [sale.id, item.producto_id, item.cantidad, item.precio_unitario, item.descuento || 0, item.subtotal]
      );

      // Descontar del catálogo
      await db.query(
        `UPDATE productos SET stock_actual = stock_actual - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [item.cantidad, item.producto_id]
      );

      // Descontar de inventario consolidado
      await db.query(
        `UPDATE inventario SET stock_actual = stock_actual - $1, ultima_actualizacion = CURRENT_TIMESTAMP WHERE producto_id = $2`,
        [item.cantidad, item.producto_id]
      );

      // Registrar Kardex
      await db.query(
        `INSERT INTO movimientos_inventario (producto_id, tipo_movimiento, cantidad, motivo, usuario_id)
         VALUES ($1, 'egreso_venta', $2, $3, $4)`,
        [item.producto_id, item.cantidad, `Salida por venta folio ${folio}`, req.user.id]
      );
    }

    // 3. Registrar Pago
    await db.query(
      `INSERT INTO pagos (venta_id, metodo, monto, detalle)
       VALUES ($1, $2, $3, $4)`,
      [sale.id, pago_metodo, pago_monto, pago_metodo === 'mixto' ? JSON.stringify(req.body.pago_detalle) : pago_metodo]
    );

    await registerAudit(req.user.id, 'REGISTRO_VENTA', 'ventas', sale.id, null, `Total: ${total}, Pago: ${pago_metodo}`, req.ip);

    // Retornar ticket térmico formateado
    const clientRes = await db.query('SELECT nombre, rut_o_nit, email, telefono FROM clientes WHERE id = $1', [cliente_id || 1]);
    const sellerRes = await db.query('SELECT nombre FROM usuarios WHERE id = $1', [req.user.id]);
    
    const ticket = {
      folio,
      fecha_hora: sale.fecha_hora,
      vendedor: sellerRes.rows[0].nombre,
      cliente: clientRes.rows[0].nombre,
      cliente_rut: clientRes.rows[0].rut_o_nit,
      cliente_email: clientRes.rows[0].email || '',
      cliente_telefono: clientRes.rows[0].telefono || '',
      subtotal,
      iva,
      total,
      descuento,
      observacion,
      pago_metodo,
      pago_monto,
      cambio: (pago_monto - total) > 0 ? (pago_monto - total) : 0,
      items: productos
    };

    // Disparar automatización asíncrona de PDF, Email y WhatsApp
    notifications.generateSalePDF(ticket).then(pdfPath => {
      // 1. Correo a la empresa
      const companySubject = `Confirmación de Venta - Folio: ${folio} - Eleodoro El Grande`;
      const companyHtml = `
        <h3>Nueva Venta Registrada en Caja POS</h3>
        <p><strong>Folio:</strong> ${folio}</p>
        <p><strong>Fecha/Hora:</strong> ${new Date(sale.fecha_hora).toLocaleString('es-CL')}</p>
        <p><strong>Cliente:</strong> ${ticket.cliente}</p>
        <p><strong>Total Recaudado:</strong> $${total.toLocaleString('es-CL')}</p>
        <p><strong>Método de Pago:</strong> ${pago_metodo.toUpperCase()}</p>
        <br>
        <p>Adjunto a este correo se encuentra el archivo PDF de la boleta.</p>
      `;
      notifications.sendEmailNotification(companySubject, companyHtml, [{
        filename: `${folio}.pdf`,
        path: pdfPath
      }], 'vitrinazo.cl@gmail.com');

      // 2. Correo al cliente (si se ingresó su email)
      if (cliente_email && cliente_email.trim().length > 0) {
        const clientSubject = `Comprobante de Venta - Folio: ${folio} - Eleodoro El Grande`;
        const clientHtml = `
          <h3>Estimado(a) ${ticket.cliente},</h3>
          <p>Tu compra en Eleodoro El Grande se ha realizado con éxito. ¡Agradecemos tu preferencia!</p>
          <hr>
          <p><strong>Folio de Boleta:</strong> ${folio}</p>
          <p><strong>Total de tu compra:</strong> $${total.toLocaleString('es-CL')}</p>
          <p><strong>Medio de Pago:</strong> ${pago_metodo.toUpperCase()}</p>
          <p><strong>Fecha de Transacción:</strong> ${new Date(sale.fecha_hora).toLocaleString('es-CL')}</p>
          <br>
          <p>Adjunto a este correo electrónico encontrarás tu boleta de venta en formato PDF.</p>
        `;
        notifications.sendEmailNotification(clientSubject, clientHtml, [{
          filename: `${folio}.pdf`,
          path: pdfPath
        }], cliente_email);
      }

      // 3. WhatsApp a la empresa
      const companyWsp = `¡Nueva Venta! Folio: ${folio}, Total: $${total.toLocaleString('es-CL')}, Cliente: ${ticket.cliente}, Pago: ${pago_metodo.toUpperCase()}. Boleta PDF guardada localmente en la carpeta del proyecto.`;
      notifications.sendWhatsAppNotification('+56989784973', companyWsp);

      // 4. WhatsApp al cliente (vía pasarela Twilio si está configurado)
      if (cliente_telefono && cliente_telefono.trim().length > 0) {
        const clientWsp = `¡Hola ${ticket.cliente}! Tu compra en Eleodoro El Grande ha sido realizada con éxito. Folio: ${folio}, Total: $${total.toLocaleString('es-CL')}. Te hemos enviado una copia en PDF a tu correo.`;
        notifications.sendWhatsAppNotification(cliente_telefono, clientWsp);
      }
    }).catch(err => {
      console.error('Error al ejecutar automatizaciones de venta:', err.message);
    });

    res.status(201).json({
      success: true,
      message: 'Venta registrada exitosamente.',
      ticket
    });

  } catch (err) {
    console.error('Error al guardar venta:', err);
    res.status(500).json({ success: false, message: 'Error interno en transaccional de venta.' });
  }
});

app.get('/api/sales/history', authenticateToken, async (req, res) => {
  try {
    const salesRes = await db.query(
      `SELECT v.*, u.nombre as vendedor_nombre, c.nombre as cliente_nombre, c.rut_o_nit as cliente_rut, p.metodo as pago_metodo
       FROM ventas v
       LEFT JOIN usuarios u ON v.usuario_id = u.id
       LEFT JOIN clientes c ON v.cliente_id = c.id
       LEFT JOIN pagos p ON p.venta_id = v.id
       ORDER BY v.fecha_hora DESC`
    );
    res.json({ success: true, sales: salesRes.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error al consultar historial de ventas.' });
  }
});

app.get('/api/sales/:folio', authenticateToken, async (req, res) => {
  const { folio } = req.params;
  try {
    const saleRes = await db.query('SELECT * FROM ventas WHERE folio = $1', [folio]);
    if (saleRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Venta no encontrada.' });
    }
    const sale = saleRes.rows[0];

    const detailsRes = await db.query(
      `SELECT dv.*, p.nombre as producto_nombre 
       FROM detalle_ventas dv
       LEFT JOIN productos p ON dv.producto_id = p.id
       WHERE dv.venta_id = $1`,
      [sale.id]
    );

    const clientRes = await db.query('SELECT nombre, rut_o_nit, email, telefono FROM clientes WHERE id = $1', [sale.cliente_id]);
    const sellerRes = await db.query('SELECT nombre FROM usuarios WHERE id = $1', [sale.usuario_id]);

    const ticket = {
      folio,
      fecha_hora: sale.fecha_hora,
      vendedor: sellerRes.rows[0] ? sellerRes.rows[0].nombre : 'Vendedor',
      cliente: clientRes.rows[0] ? clientRes.rows[0].nombre : 'Cliente',
      cliente_rut: clientRes.rows[0] ? clientRes.rows[0].rut_o_nit : '',
      cliente_email: clientRes.rows[0] ? clientRes.rows[0].email : '',
      cliente_telefono: clientRes.rows[0] ? clientRes.rows[0].telefono : '',
      subtotal: sale.subtotal,
      iva: sale.iva,
      total: sale.total,
      descuento: sale.descuento,
      observacion: sale.observacion,
      pago_metodo: 'efectivo',
      pago_monto: sale.total,
      cambio: 0,
      items: detailsRes.rows.map(d => ({
        producto_id: d.producto_id,
        nombre: d.producto_nombre || 'Producto',
        cantidad: d.cantidad,
        precio_unitario: parseFloat(d.precio_unitario),
        subtotal: parseFloat(d.subtotal)
      }))
    };

    const pagoRes = await db.query('SELECT metodo, monto FROM pagos WHERE venta_id = $1', [sale.id]);
    if (pagoRes.rows.length > 0) {
      ticket.pago_metodo = pagoRes.rows[0].metodo;
      ticket.pago_monto = parseFloat(pagoRes.rows[0].monto);
      ticket.cambio = (ticket.pago_monto - sale.total) > 0 ? (ticket.pago_monto - sale.total) : 0;
    }

    res.json({ success: true, ticket });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error al consultar detalle de boleta.' });
  }
});

app.post('/api/sales/:folio/notify', authenticateToken, async (req, res) => {
  const { folio } = req.params;

  try {
    const saleRes = await db.query('SELECT * FROM ventas WHERE folio = $1', [folio]);
    if (saleRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Venta no encontrada.' });
    }
    const sale = saleRes.rows[0];

    const detailsRes = await db.query(
      `SELECT dv.*, p.nombre as producto_nombre 
       FROM detalle_ventas dv
       LEFT JOIN productos p ON dv.producto_id = p.id
       WHERE dv.venta_id = $1`,
      [sale.id]
    );

    const clientRes = await db.query('SELECT nombre, rut_o_nit FROM clientes WHERE id = $1', [sale.cliente_id]);
    const sellerRes = await db.query('SELECT nombre FROM usuarios WHERE id = $1', [sale.usuario_id]);

    const ticket = {
      folio,
      fecha_hora: sale.fecha_hora,
      vendedor: sellerRes.rows[0] ? sellerRes.rows[0].nombre : 'Vendedor',
      cliente: clientRes.rows[0] ? clientRes.rows[0].nombre : 'Cliente',
      cliente_rut: clientRes.rows[0] ? clientRes.rows[0].rut_o_nit : '',
      subtotal: sale.subtotal,
      iva: sale.iva,
      total: sale.total,
      descuento: sale.descuento,
      observacion: sale.observacion,
      pago_metodo: 'efectivo',
      pago_monto: sale.total,
      cambio: 0,
      items: detailsRes.rows.map(d => ({
        producto_id: d.producto_id,
        nombre: d.producto_nombre || 'Producto',
        cantidad: d.cantidad,
        precio_unitario: parseFloat(d.precio_unitario),
        subtotal: parseFloat(d.subtotal)
      }))
    };

    const pagoRes = await db.query('SELECT metodo, monto FROM pagos WHERE venta_id = $1', [sale.id]);
    if (pagoRes.rows.length > 0) {
      ticket.pago_metodo = pagoRes.rows[0].metodo;
      ticket.pago_monto = parseFloat(pagoRes.rows[0].monto);
      ticket.cambio = (ticket.pago_monto - sale.total) > 0 ? (ticket.pago_monto - sale.total) : 0;
    }

    const pdfPath = await notifications.generateSalePDF(ticket);

    const subject = `Confirmación de Venta - Folio: ${folio} - Eleodoro El Grande`;
    const htmlBody = `
      <h3>Tu compra en Eleodoro El Grande se ha realizado con éxito</h3>
      <p><strong>Folio de Venta:</strong> ${folio}</p>
      <p><strong>Fecha/Hora:</strong> ${new Date(sale.fecha_hora).toLocaleString('es-CL')}</p>
      <p><strong>Cliente:</strong> ${ticket.cliente}</p>
      <p><strong>Monto Total Pagado:</strong> $${parseInt(sale.total).toLocaleString('es-CL')}</p>
      <p><strong>Medio de Pago:</strong> ${ticket.pago_metodo.toUpperCase()}</p>
      <br>
      <p>Adjunto encontrarás tu boleta de venta en formato PDF.</p>
    `;

    await notifications.sendEmailNotification(subject, htmlBody, [{
      filename: `${folio}.pdf`,
      path: pdfPath
    }]);

    const wspMsg = `¡Tu compra en Eleodoro El Grande se ha realizado con éxito! Folio: ${folio}, Total: $${parseInt(sale.total).toLocaleString('es-CL')}. Se adjunta boleta PDF en tu correo.`;
    await notifications.sendWhatsAppNotification('+56989784973', wspMsg);

    res.json({ success: true, message: 'Notificaciones enviadas exitosamente al imprimir.' });

  } catch (err) {
    console.error('Error al enviar notificaciones de boleta:', err);
    res.status(500).json({ success: false, message: 'Error interno al despachar notificaciones.' });
  }
});

app.post('/api/sales/:folio/share-email', authenticateToken, async (req, res) => {
  const { folio } = req.params;
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, message: 'Email del cliente es requerido.' });
  }

  try {
    const saleRes = await db.query('SELECT * FROM ventas WHERE folio = $1', [folio]);
    if (saleRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Venta no encontrada.' });
    }
    const sale = saleRes.rows[0];

    const detailsRes = await db.query(
      `SELECT dv.*, p.nombre as producto_nombre 
       FROM detalle_ventas dv
       LEFT JOIN productos p ON dv.producto_id = p.id
       WHERE dv.venta_id = $1`,
      [sale.id]
    );

    const clientRes = await db.query('SELECT nombre, rut_o_nit FROM clientes WHERE id = $1', [sale.cliente_id]);
    const sellerRes = await db.query('SELECT nombre FROM usuarios WHERE id = $1', [sale.usuario_id]);

    const ticket = {
      folio,
      fecha_hora: sale.fecha_hora,
      vendedor: sellerRes.rows[0] ? sellerRes.rows[0].nombre : 'Vendedor',
      cliente: clientRes.rows[0] ? clientRes.rows[0].nombre : 'Cliente',
      cliente_rut: clientRes.rows[0] ? clientRes.rows[0].rut_o_nit : '',
      subtotal: sale.subtotal,
      iva: sale.iva,
      total: sale.total,
      descuento: sale.descuento,
      observacion: sale.observacion,
      pago_metodo: 'efectivo',
      pago_monto: sale.total,
      cambio: 0,
      items: detailsRes.rows.map(d => ({
        producto_id: d.producto_id,
        nombre: d.producto_nombre || 'Producto',
        cantidad: d.cantidad,
        precio_unitario: parseFloat(d.precio_unitario),
        subtotal: parseFloat(d.subtotal)
      }))
    };

    const pagoRes = await db.query('SELECT metodo, monto FROM pagos WHERE venta_id = $1', [sale.id]);
    if (pagoRes.rows.length > 0) {
      ticket.pago_metodo = pagoRes.rows[0].metodo;
      ticket.pago_monto = parseFloat(pagoRes.rows[0].monto);
      ticket.cambio = (ticket.pago_monto - sale.total) > 0 ? (ticket.pago_monto - sale.total) : 0;
    }

    const pdfPath = await notifications.generateSalePDF(ticket);

    const subject = `Comprobante de Venta - Folio: ${folio} - Eleodoro El Grande`;
    const htmlBody = `
      <h3>Estimado(a) ${ticket.cliente},</h3>
      <p>Agradecemos tu preferencia. Adjunto a este correo encontrarás el comprobante digital de tu compra.</p>
      <hr>
      <p><strong>Folio de Boleta:</strong> ${folio}</p>
      <p><strong>Total de tu compra:</strong> $${parseInt(sale.total).toLocaleString('es-CL')}</p>
      <p><strong>Fecha:</strong> ${new Date(sale.fecha_hora).toLocaleString('es-CL')}</p>
      <br>
      <p>Eleodoro El Grande Distribuidora</p>
    `;

    // Enviar al correo específico proporcionado por el cliente
    await notifications.sendEmailNotification(subject, htmlBody, [{
      filename: `${folio}.pdf`,
      path: pdfPath
    }], email);

    res.json({ success: true, message: `Boleta enviada con éxito a ${email}` });

  } catch (err) {
    console.error('Error al compartir boleta por email:', err);
    res.status(500).json({ success: false, message: 'Error al enviar email al cliente.' });
  }
});

app.post('/api/cash-close/email', authenticateToken, async (req, res) => {
  const { date, totalSales, txCount, discounts, payCash, payCard, payTrans, payMixed, profit } = req.body;
  
  const subject = `Cierre de Caja Diario - ${date} - Eleodoro El Grande`;
  const htmlBody = `
    <h2>Reporte de Arqueo y Cierre de Caja Diario</h2>
    <p><strong>Fecha del Cierre:</strong> ${date}</p>
    <p><strong>Cajero/Generado por:</strong> ${req.user.nombre}</p>
    <hr>
    <table border="1" cellpadding="8" style="border-collapse: collapse; font-family: sans-serif; font-size: 14px; width: 100%; max-width: 500px;">
      <tr bgcolor="#f2f2f2"><td colspan="2"><strong>Resumen Financiero del Día</strong></td></tr>
      <tr><td>Ventas Totales Recaudadas</td><td><strong>$${parseInt(totalSales).toLocaleString('es-CL')}</strong></td></tr>
      <tr><td>Boletas/Transacciones Realizadas</td><td>${txCount}</td></tr>
      <tr><td>Descuentos Aplicados en Caja</td><td>$${parseInt(discounts).toLocaleString('es-CL')}</td></tr>
      <tr bgcolor="#e6f4ea"><td><strong>Utilidad Bruta Estimada (35%)</strong></td><td><strong>$${parseInt(profit).toLocaleString('es-CL')}</strong></td></tr>
    </table>
    <br>
    <table border="1" cellpadding="8" style="border-collapse: collapse; font-family: sans-serif; font-size: 14px; width: 100%; max-width: 500px;">
      <tr bgcolor="#f2f2f2"><td colspan="2"><strong>Desglose por Métodos de Pago</strong></td></tr>
      <tr><td>Efectivo</td><td>$${parseInt(payCash).toLocaleString('es-CL')}</td></tr>
      <tr><td>Tarjeta Débito/Crédito</td><td>$${parseInt(payCard).toLocaleString('es-CL')}</td></tr>
      <tr><td>Transferencia Bancaria</td><td>$${parseInt(payTrans).toLocaleString('es-CL')}</td></tr>
      <tr><td>Pago Mixto</td><td>$${parseInt(payMixed).toLocaleString('es-CL')}</td></tr>
    </table>
    <br>
    <p>Este reporte ha sido generado y firmado de manera electrónica desde la caja POS del ERP.</p>
  `;

  try {
    await notifications.sendEmailNotification(subject, htmlBody, [], 'vitrinazo.cl@gmail.com');
    res.json({ success: true, message: 'Reporte de cierre de caja enviado por correo.' });
  } catch (err) {
    console.error('Error al enviar reporte de cierre:', err);
    res.status(500).json({ success: false, message: 'Error interno al enviar reporte.' });
  }
});

// -------------------------------------------------------------
// APIS DE COMPRAS E INVENTARIO (KARDEX / MOVIMIENTOS)
// -------------------------------------------------------------

app.get('/api/inventory/kardex', authenticateToken, async (req, res) => {
  try {
    const kRes = await db.query(
      `SELECT m.*, p.nombre as producto_nombre, p.codigo as producto_codigo, u.nombre as usuario_nombre
       FROM movimientos_inventario m
       LEFT JOIN productos p ON m.producto_id = p.id
       LEFT JOIN usuarios u ON m.usuario_id = u.id
       ORDER BY m.created_at DESC`
    );
    res.json({ success: true, kardex: kRes.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error al obtener Kardex.' });
  }
});

app.post('/api/inventory/movements', authenticateToken, requireRole(['Administrador', 'Supervisor', 'Bodega']), async (req, res) => {
  const { producto_id, tipo_movimiento, cantidad, motivo } = req.body;
  if (!producto_id || !tipo_movimiento || !cantidad || !motivo) {
    return res.status(400).json({ success: false, message: 'Todos los campos son obligatorios.' });
  }

  try {
    const pCheck = await db.query('SELECT stock_actual FROM productos WHERE id = $1', [producto_id]);
    if (pCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado.' });
    }

    // Determinar dirección de stock (+ o -)
    const factor = tipo_movimiento.startsWith('ingreso') || tipo_movimiento === 'transferencia_entrada' ? 1 : -1;
    const variacion = cantidad * factor;

    // Actualizar producto
    await db.query(
      'UPDATE productos SET stock_actual = stock_actual + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [variacion, producto_id]
    );

    // Actualizar consolidado
    await db.query(
      'UPDATE inventario SET stock_actual = stock_actual + $1, ultima_actualizacion = CURRENT_TIMESTAMP WHERE producto_id = $2',
      [variacion, producto_id]
    );

    // Guardar movimiento
    const result = await db.query(
      `INSERT INTO movimientos_inventario (producto_id, tipo_movimiento, cantidad, motivo, usuario_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [producto_id, tipo_movimiento, cantidad, motivo, req.user.id]
    );

    await registerAudit(req.user.id, 'AJUSTE_INVENTARIO', 'productos', producto_id, `Ajuste stock: ${variacion}`, motivo, req.ip);

    res.json({ success: true, movement: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error al procesar movimiento de inventario.' });
  }
});

app.get('/api/inventory/alerts', authenticateToken, async (req, res) => {
  try {
    const alertsRes = await db.query(
      `SELECT p.id, p.codigo, p.nombre, p.stock_actual, p.stock_minimo, c.nombre as categoria_nombre
       FROM productos p
       LEFT JOIN categorias c ON p.categoria_id = c.id
       WHERE p.stock_actual <= p.stock_minimo
       ORDER BY p.stock_actual ASC`
    );
    res.json({ success: true, alerts: alertsRes.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error al consultar alertas.' });
  }
});

// COMPRAS (ERP)
app.post('/api/purchases', authenticateToken, requireRole(['Administrador', 'Bodega']), async (req, res) => {
  const { proveedor_id, productos, total } = req.body;
  if (!proveedor_id || !productos || productos.length === 0) {
    return res.status(400).json({ success: false, message: 'Proveedor y productos requeridos.' });
  }

  const folio = 'COM-' + Date.now();

  try {
    // 1. Crear Orden de compra
    const cRes = await db.query(
      `INSERT INTO compras (folio_compra, proveedor_id, total, estado, fecha_recepcion)
       VALUES ($1, $2, $3, 'recibido', CURRENT_TIMESTAMP)
       RETURNING *`,
      [folio, proveedor_id, total]
    );
    const compra = cRes.rows[0];

    // 2. Cargar detalles y actualizar stocks
    for (const item of productos) {
      await db.query(
        `INSERT INTO detalle_compras (compra_id, producto_id, cantidad, precio_costo, subtotal)
         VALUES ($1, $2, $3, $4, $5)`,
        [compra.id, item.producto_id, item.cantidad, item.precio_costo, item.cantidad * item.precio_costo]
      );

      // Aumentar stock del producto
      await db.query(
        `UPDATE productos SET stock_actual = stock_actual + $1, precio_costo = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
        [item.cantidad, item.precio_costo, item.producto_id]
      );

      // Consolidar inventario
      await db.query(
        `UPDATE inventario SET stock_actual = stock_actual + $1, ultima_actualizacion = CURRENT_TIMESTAMP WHERE producto_id = $2`,
        [item.cantidad, item.producto_id]
      );

      // Kardex
      await db.query(
        `INSERT INTO movimientos_inventario (producto_id, tipo_movimiento, cantidad, motivo, usuario_id)
         VALUES ($1, 'ingreso_compra', $2, $3, $4)`,
        [item.producto_id, item.cantidad, `Ingreso por orden compra folio ${folio}`, req.user.id]
      );
    }

    await registerAudit(req.user.id, 'REGISTRO_COMPRA', 'compras', compra.id, null, `Total compra: ${total}`, req.ip);

    // Disparar automatización asíncrona de PDF de compra, email y WhatsApp
    (async () => {
      // 1. Obtener nombre del proveedor
      const supRes = await db.query('SELECT nombre FROM proveedores WHERE id = $1', [proveedor_id]);
      const supplierName = supRes.rows[0] ? supRes.rows[0].nombre : 'Proveedor Importación';

      // 2. Obtener nombres de productos
      const itemsWithNames = [];
      for (const item of productos) {
        const prodCheck = await db.query('SELECT nombre FROM productos WHERE id = $1', [item.producto_id]);
        itemsWithNames.push({
          ...item,
          nombre: prodCheck.rows[0] ? prodCheck.rows[0].nombre : 'Producto'
        });
      }

      // 3. Generar PDF
      const pdfPath = await notifications.generatePurchasePDF(compra, itemsWithNames, supplierName);

      // 4. Enviar Email
      const subject = `Confirmación de Recepción de Compra - Folio OC: ${folio} - Eleodoro El Grande`;
      const htmlBody = `
        <h3>Se ha registrado un ingreso de compra de mercadería (ERP Inventario)</h3>
        <p><strong>Folio OC:</strong> ${folio}</p>
        <p><strong>Proveedor:</strong> ${supplierName}</p>
        <p><strong>Fecha Recepción:</strong> ${new Date(compra.fecha_pedido).toLocaleString('es-CL')}</p>
        <p><strong>Monto Total Compra:</strong> $${total.toLocaleString('es-CL')}</p>
        <br>
        <p>Adjunto a este correo se encuentra el PDF detallado con la recepción de mercadería.</p>
      `;
      await notifications.sendEmailNotification(subject, htmlBody, [{
        filename: `${folio}.pdf`,
        path: pdfPath
      }]);

      // 5. Enviar WhatsApp
      const wspMsg = `¡Ingreso Compra ERP! Folio: ${folio}, Proveedor: ${supplierName}, Total: $${total.toLocaleString('es-CL')}. Documento PDF guardado en la carpeta del proyecto.`;
      await notifications.sendWhatsAppNotification('+56989784973', wspMsg);

    })().catch(err => {
      console.error('Error al ejecutar automatizaciones de compra:', err.message);
    });

    res.status(201).json({ success: true, message: 'Orden de compra registrada e ingresada al stock.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error al registrar compra.' });
  }
});

app.get('/api/purchases', authenticateToken, async (req, res) => {
  try {
    const compRes = await db.query(
      `SELECT c.*, pr.nombre as proveedor_nombre
       FROM compras c
       LEFT JOIN proveedores pr ON c.proveedor_id = pr.id
       ORDER BY c.fecha_pedido DESC`
    );
    res.json({ success: true, purchases: compRes.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error al consultar compras.' });
  }
});

// -------------------------------------------------------------
// APIS DE REPORTES Y BUSINESS INTELLIGENCE (ANALÍTICA)
// -------------------------------------------------------------

app.get('/api/reports/kpis', authenticateToken, async (req, res) => {
  try {
    // Para simplificar y optimizar, consolidaremos estadísticas por fechas
    const hoy = new Date().toISOString().split('T')[0];
    
    // 1. Ventas de Hoy
    const vHoy = await db.query("SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as cantidad FROM ventas WHERE DATE(fecha_hora) = CURRENT_DATE");
    
    // 2. Ventas Semana (Últimos 7 días)
    const vSemana = await db.query("SELECT COALESCE(SUM(total), 0) as total FROM ventas WHERE fecha_hora >= CURRENT_DATE - INTERVAL '7 days'");
    
    // 3. Ventas Mes (Mes en curso)
    const vMes = await db.query("SELECT COALESCE(SUM(total), 0) as total FROM ventas WHERE fecha_hora >= DATE_TRUNC('month', CURRENT_DATE)");
    
    // 4. Ventas Año (Año en curso)
    const vAnio = await db.query("SELECT COALESCE(SUM(total), 0) as total FROM ventas WHERE fecha_hora >= DATE_TRUNC('year', CURRENT_DATE)");

    // 5. Utilidad estimada (total ventas - total costo de lo vendido)
    const utilRes = await db.query(
      `SELECT COALESCE(SUM(dv.cantidad * (dv.precio_unitario - p.precio_costo)), 0) as utilidad
       FROM detalle_ventas dv
       LEFT JOIN productos p ON dv.producto_id = p.id
       LEFT JOIN ventas v ON dv.venta_id = v.id
       WHERE v.fecha_hora >= DATE_TRUNC('month', CURRENT_DATE)`
    );

    // 6. Cantidad de productos vendidos este mes
    const prodVendidos = await db.query(
      `SELECT COALESCE(SUM(cantidad), 0) as total_unidades FROM detalle_ventas dv
       LEFT JOIN ventas v ON dv.venta_id = v.id
       WHERE v.fecha_hora >= DATE_TRUNC('month', CURRENT_DATE)`
    );

    // 7. Productos agotados o en stock mínimo
    const stockCritico = await db.query("SELECT COUNT(*) as criticos FROM productos WHERE stock_actual <= stock_minimo");

    // 8. Comparativa mes actual vs mes anterior
    const vMesAnt = await db.query(
      `SELECT COALESCE(SUM(total), 0) as total FROM ventas 
       WHERE fecha_hora >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') 
         AND fecha_hora < DATE_TRUNC('month', CURRENT_DATE)`
    );

    // 9. Comparativa año actual vs año anterior
    const vAnioAnt = await db.query(
      `SELECT COALESCE(SUM(total), 0) as total FROM ventas 
       WHERE fecha_hora >= DATE_TRUNC('year', CURRENT_DATE - INTERVAL '1 year') 
         AND fecha_hora < DATE_TRUNC('year', CURRENT_DATE)`
    );

    res.json({
      success: true,
      kpis: {
        ventas_hoy: parseFloat(vHoy.rows[0].total),
        cantidad_hoy: parseInt(vHoy.rows[0].cantidad),
        ventas_semana: parseFloat(vSemana.rows[0].total),
        ventas_mes: parseFloat(vMes.rows[0].total),
        ventas_anio: parseFloat(vAnio.rows[0].total),
        utilidades_mes: parseFloat(utilRes.rows[0].utilidad),
        productos_vendidos_mes: parseInt(prodVendidos.rows[0].total_unidades),
        stock_critico: parseInt(stockCritico.rows[0].criticos),
        comparativa_mes: {
          actual: parseFloat(vMes.rows[0].total),
          anterior: parseFloat(vMesAnt.rows[0].total),
          porcentaje: vMesAnt.rows[0].total > 0 ? (((vMes.rows[0].total - vMesAnt.rows[0].total) / vMesAnt.rows[0].total) * 100).toFixed(1) : 100.0
        },
        comparativa_anio: {
          actual: parseFloat(vAnio.rows[0].total),
          anterior: parseFloat(vAnioAnt.rows[0].total),
          porcentaje: vAnioAnt.rows[0].total > 0 ? (((vAnio.rows[0].total - vAnioAnt.rows[0].total) / vAnioAnt.rows[0].total) * 100).toFixed(1) : 100.0
        },
        ticket_promedio: vHoy.rows[0].cantidad > 0 ? (vHoy.rows[0].total / vHoy.rows[0].cantidad).toFixed(0) : 0
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error al consultar indicadores de BI.' });
  }
});

app.get('/api/reports/charts', authenticateToken, async (req, res) => {
  try {
    // 1. Top Productos más vendidos (Rotación Alta)
    const highRotation = await db.query(
      `SELECT p.nombre, SUM(dv.cantidad) as cantidad
       FROM detalle_ventas dv
       LEFT JOIN productos p ON dv.producto_id = p.id
       GROUP BY p.nombre
       ORDER BY cantidad DESC
       LIMIT 5`
    );

    // 2. Productos menos vendidos (Rotación Baja)
    const lowRotation = await db.query(
      `SELECT p.nombre, COALESCE(SUM(dv.cantidad), 0) as cantidad
       FROM productos p
       LEFT JOIN detalle_ventas dv ON dv.producto_id = p.id
       GROUP BY p.nombre
       ORDER BY cantidad ASC
       LIMIT 5`
    );

    // 3. Ventas por Categoría (Donut)
    const categoryChart = await db.query(
      `SELECT c.nombre as categoria, SUM(dv.subtotal) as total
       FROM detalle_ventas dv
       LEFT JOIN productos p ON dv.producto_id = p.id
       LEFT JOIN categorias c ON p.categoria_id = c.id
       GROUP BY c.nombre
       ORDER BY total DESC`
    );

    // 4. Ventas de los últimos 7 días (Líneas / Área)
    const salesHistory7Days = await db.query(
      `SELECT DATE(fecha_hora) as fecha, SUM(total) as total
       FROM ventas
       WHERE fecha_hora >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY DATE(fecha_hora)
       ORDER BY fecha ASC`
    );

    // 5. Top Clientes por Monto Compra
    const topClients = await db.query(
      `SELECT c.nombre, SUM(v.total) as total_gastado
       FROM ventas v
       LEFT JOIN clientes c ON v.cliente_id = c.id
       GROUP BY c.nombre
       ORDER BY total_gastado DESC
       LIMIT 5`
    );

    // 6. Top Vendedores (Cajeros)
    const topSellers = await db.query(
      `SELECT u.nombre, SUM(v.total) as total_vendido
       FROM ventas v
       LEFT JOIN usuarios u ON v.usuario_id = u.id
       GROUP BY u.nombre
       ORDER BY total_vendido DESC
       LIMIT 5`
    );

    res.json({
      success: true,
      highRotation: highRotation.rows,
      lowRotation: lowRotation.rows,
      categoryChart: categoryChart.rows,
      salesHistory7Days: salesHistory7Days.rows,
      topClients: topClients.rows,
      topSellers: topSellers.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error al consultar gráficos de BI.' });
  }
});

// -------------------------------------------------------------
// PANEL ADMINISTRADOR (USUARIOS / AUDITORÍA COMPLETA)
// -------------------------------------------------------------

app.get('/api/admin/users', authenticateToken, requireRole(['Administrador']), async (req, res) => {
  try {
    const usersRes = await db.query(
      `SELECT u.id, u.username, u.nombre, u.email, u.rol_id, u.estado, u.created_at, r.nombre as rol_nombre
       FROM usuarios u
       LEFT JOIN roles r ON u.rol_id = r.id
       ORDER BY u.id ASC`
    );
    res.json({ success: true, users: usersRes.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error al consultar usuarios.' });
  }
});

app.post('/api/admin/users', authenticateToken, requireRole(['Administrador']), async (req, res) => {
  const { username, password, nombre, email, rol_id } = req.body;
  if (!username || !password || !nombre || !rol_id) {
    return res.status(400).json({ success: false, message: 'Username, password, nombre y rol requeridos.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = await db.query(
      'INSERT INTO usuarios (username, password_hash, nombre, email, rol_id, estado) VALUES ($1, $2, $3, $4, $5, \'activo\') RETURNING id, username, nombre, email, rol_id',
      [username, hash, nombre, email || '', rol_id]
    );
    res.status(201).json({ success: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error al crear usuario. Username ya ocupado.' });
  }
});

app.put('/api/admin/users/:id', authenticateToken, requireRole(['Administrador']), async (req, res) => {
  const { id } = req.params;
  const { nombre, email, rol_id, estado, password } = req.body;
  try {
    let result;
    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      result = await db.query(
        'UPDATE usuarios SET nombre=$1, email=$2, rol_id=$3, estado=$4, password_hash=$5, updated_at=CURRENT_TIMESTAMP WHERE id=$6 RETURNING id, username, nombre, email, rol_id, estado',
        [nombre, email, rol_id, estado, hash, id]
      );
    } else {
      result = await db.query(
        'UPDATE usuarios SET nombre=$1, email=$2, rol_id=$3, estado=$4, updated_at=CURRENT_TIMESTAMP WHERE id=$5 RETURNING id, username, nombre, email, rol_id, estado',
        [nombre, email, rol_id, estado, id]
      );
    }
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error al actualizar usuario.' });
  }
});

app.get('/api/admin/audit', authenticateToken, requireRole(['Administrador', 'Gerencia']), async (req, res) => {
  try {
    const audRes = await db.query(
      `SELECT a.*, u.nombre as usuario_nombre
       FROM auditoria a
       LEFT JOIN usuarios u ON a.usuario_id = u.id
       ORDER BY a.created_at DESC
       LIMIT 100`
    );
    res.json({ success: true, audit: audRes.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error al consultar auditoría.' });
  }
});

app.get('/api/admin/logs', authenticateToken, requireRole(['Administrador']), async (req, res) => {
  try {
    const logRes = await db.query('SELECT * FROM logs ORDER BY created_at DESC LIMIT 100');
    res.json({ success: true, logs: logRes.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error al consultar logs.' });
  }
});

// -------------------------------------------------------------
// MANEJO DE ERRORES GLOBAL
// -------------------------------------------------------------
app.use((err, req, res, next) => {
  console.error('[Global Error Handler]', err);
  registerLog('ERROR', err.message, err.stack);
  res.status(500).json({ success: false, message: 'Ha ocurrido un error inesperado en el servidor.' });
});

// INICIAR SERVIDOR
app.listen(PORT, async () => {
  console.log(`\n======================================================`);
  console.log(`🚀 SERVIDOR ACTIVO EN: http://localhost:${PORT}`);
  console.log(`💼 EMPRESA: ELEODORO EL GRANDE DISTRIBUIDORA`);
  console.log(`🛡️  SEGURIDAD: JWT + Rate Limiting + CSP Activo`);
  console.log(`======================================================\n`);
  
  // Asegurar existencia de la columna 'estado' en la tabla de productos para el toggle activo/agotado
  try {
    await db.query("ALTER TABLE productos ADD COLUMN estado VARCHAR(20) DEFAULT 'activo'");
    console.log('[DB] Columna de estado verificada/creada en productos.');
  } catch (err) {
    // Ignorar error si la columna ya existía
  }
  
  // Ejecutar importación automática si el catálogo está vacío
  autoImportCatalog();
});

async function autoImportCatalog() {
  try {
    // Comprobar si el producto 'CATUNSG16' ya existe para saber si el catálogo real está cargado
    const check = await db.query("SELECT id FROM productos WHERE codigo = $1", ["CATUNSG16"]);
    const hasRealCatalog = check.rows.length > 0;
    
    if (!hasRealCatalog) {
      console.log('[DB] El catálogo en base de datos está vacío o incompleto. Iniciando importación automática...');
      
      const catalogoPath = path.join(__dirname, 'database', 'catalogo.js');
      if (fs.existsSync(catalogoPath)) {
        const oldProducts = require(catalogoPath);
        console.log(`[DB] Importando ${oldProducts.length} productos reales desde catalogo.js...`);
        
        // 1. Obtener o crear categorías
        const categoryMap = new Map();
        const rawCategories = [...new Set(oldProducts.map(p => p.category).filter(Boolean))];

        for (const rawCat of rawCategories) {
          const cleanName = cleanCategory(rawCat);
          const catCheck = await db.query('SELECT id FROM categorias WHERE nombre = $1', [cleanName]);
          let catId;
          
          if (catCheck.rows.length > 0) {
            catId = catCheck.rows[0].id;
          } else {
            const catInsert = await db.query(
              'INSERT INTO categorias (nombre, descripcion) VALUES ($1, $2) RETURNING id',
              [cleanName, `Categoría de productos ${cleanName}`]
            );
            catId = catInsert.rows[0].id;
          }
          categoryMap.set(rawCat, catId);
        }

        // 2. Obtener o crear proveedor
        let supplierId;
        const supCheck = await db.query('SELECT id FROM proveedores WHERE rut_o_nit = $1', ['90.000.000-1']);
        if (supCheck.rows.length > 0) {
          supplierId = supCheck.rows[0].id;
        } else {
          const supInsert = await db.query(
            `INSERT INTO proveedores (rut_o_nit, nombre, contacto, telefono, email, direccion)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            ['90.000.000-1', 'Proveedor Importaciones Eleodoro', 'Contacto Central', '+56223456789', 'central@eleodoroprov.cl', 'Bodegas Centrales Distribuidora']
          );
          supplierId = supInsert.rows[0].id;
        }

        // 3. Insertar o actualizar productos de forma no destructiva (upsert) para evitar violar claves foráneas
        for (let i = 0; i < oldProducts.length; i++) {
          const p = oldProducts[i];
          const categoryId = categoryMap.get(p.category) || null;
          const codigo = p.id;
          const sku = `SKU-${p.id}`;
          const barcode = '780' + String(i).padStart(10, '0');
          const nombre = p.name;
          const precioVenta = parseFloat(p.price);
          const precioCosto = Math.round(precioVenta * 0.65);
          const margen = 35.00;
          const stockActual = Math.floor(Math.random() * 91) + 30;
          const stockMinimo = 10;
          const imagenUrl = p.image ? `/${p.image}` : '';
          const descripcion = `Producto importado de www.eleodoroelgrande.cl. Sabores/Variaciones: ${p.flavors ? p.flavors.join(', ') : 'Ninguno'}.`;
          const marca = formatName(p.category);

          // Comprobar si el producto ya existe por su código único
          const prodCheck = await db.query('SELECT id FROM productos WHERE codigo = $1', [codigo]);

          if (prodCheck.rows.length > 0) {
            // Actualizar datos del producto existente sin tocar su ID ni borrarlo
            const existingId = prodCheck.rows[0].id;
            await db.query(
              `UPDATE productos SET 
               nombre = $1, precio_venta = $2, precio_costo = $3, margen = $4,
               categoria_id = $5, marca = $6, imagen_url = $7, updated_at = CURRENT_TIMESTAMP
               WHERE id = $8`,
              [nombre, precioVenta, precioCosto, margen, categoryId, marca, imagenUrl, existingId]
            );
          } else {
            // Insertar producto nuevo
            const prodInsert = await db.query(
              `INSERT INTO productos 
               (codigo, sku, codigo_barra, nombre, descripcion, categoria_id, marca, proveedor_id, precio_costo, precio_venta, margen, stock_actual, stock_minimo, imagen_url)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
               RETURNING id`,
              [codigo, sku, barcode, nombre, descripcion, categoryId, marca, supplierId, precioCosto, precioVenta, margen, stockActual, stockMinimo, imagenUrl]
            );

            const newProductId = prodInsert.rows[0].id;

            // Vincular al inventario inicial
            await db.query(
              `INSERT INTO inventario (producto_id, stock_actual, stock_minimo, ubicacion)
               VALUES ($1, $2, $3, $4)`,
              [newProductId, stockActual, stockMinimo, 'Bodega Principal A']
            );

            // Registrar movimiento inicial en Kardex
            await db.query(
              `INSERT INTO movimientos_inventario (producto_id, tipo_movimiento, cantidad, motivo, usuario_id)
               VALUES ($1, 'ingreso_ajuste', $2, 'Carga de stock inicial catálogo www.eleodoroelgrande.cl', 1)`,
              [newProductId, stockActual]
            );
          }
        }
        console.log(`[DB] Catálogo de ${oldProducts.length} productos procesado exitosamente (agregados/actualizados).`);
      } else {
        console.warn(`[DB] No se encontró el archivo de catálogo en ${catalogoPath}`);
      }
    }
  } catch (err) {
    console.error('[DB] Error durante la importación automática de catálogo:', err.message);
  }
}

function formatName(str) {
  if (!str) return '';
  return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function cleanCategory(cat) {
  if (!cat) return 'Otros';
  let c = cat.toUpperCase().trim();
  if (c.includes('ENERG')) return 'Energéticas';
  if (c === 'AGUA') return 'Aguas y Aguas Saborizadas';
  if (c === 'BEBIDAS') return 'Bebidas Gaseosas';
  if (c === 'CERVEZA') return 'Cervezas';
  if (c === 'LICORES') return 'Licores y Destilados';
  if (c === 'PROMOCIONES') return 'Promociones Especiales';
  return formatName(c);
}
