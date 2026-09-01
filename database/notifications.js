// database/notifications.js
// Utilidades de automatización: Generación de PDF físico, envío de correo (Nodemailer) y alertas WhatsApp (simulación + logs)

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');

require('dotenv').config();

// Directorios para exportaciones
const BOLETAS_DIR = path.join(__dirname, '..', 'exports', 'boletas');
const COMPRAS_DIR = path.join(__dirname, '..', 'exports', 'compras');
const DESPACHOS_DIR = path.join(__dirname, '..', 'exports', 'despachos');
const DESPACHOS_EFECTIVO_DIR = path.join(DESPACHOS_DIR, 'efectivo');
const DESPACHOS_TRANSFERENCIA_DIR = path.join(DESPACHOS_DIR, 'transferencia');
const DESPACHOS_TARJETA_DIR = path.join(DESPACHOS_DIR, 'tarjeta');
const DESPACHOS_COMBINADO_DIR = path.join(DESPACHOS_DIR, 'combinado');

// Asegurar directorios
if (!fs.existsSync(BOLETAS_DIR)) fs.mkdirSync(BOLETAS_DIR, { recursive: true });
if (!fs.existsSync(COMPRAS_DIR)) fs.mkdirSync(COMPRAS_DIR, { recursive: true });
if (!fs.existsSync(DESPACHOS_DIR)) fs.mkdirSync(DESPACHOS_DIR, { recursive: true });
if (!fs.existsSync(DESPACHOS_EFECTIVO_DIR)) fs.mkdirSync(DESPACHOS_EFECTIVO_DIR, { recursive: true });
if (!fs.existsSync(DESPACHOS_TRANSFERENCIA_DIR)) fs.mkdirSync(DESPACHOS_TRANSFERENCIA_DIR, { recursive: true });
if (!fs.existsSync(DESPACHOS_TARJETA_DIR)) fs.mkdirSync(DESPACHOS_TARJETA_DIR, { recursive: true });
if (!fs.existsSync(DESPACHOS_COMBINADO_DIR)) fs.mkdirSync(DESPACHOS_COMBINADO_DIR, { recursive: true });

// Formateador de moneda CLP
const fmtCLP = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val);

/**
 * 1. GENERADOR DE PDF PARA VENTAS (BOLETA TÉRMICA)
 */
function generateSalePDF(ticket) {
  return new Promise((resolve, reject) => {
    try {
      const pdfPath = path.join(BOLETAS_DIR, `${ticket.folio}.pdf`);
      const doc = new PDFDocument({
        size: [226, 650], // Ancho estándar papel térmico 80mm
        margins: { top: 15, bottom: 15, left: 10, right: 10 }
      });

      const writeStream = fs.createWriteStream(pdfPath);
      doc.pipe(writeStream);

      // Encabezado
      doc.fontSize(11).font('Helvetica-Bold').text('ELEODORO EL GRANDE', { align: 'center' });
      doc.fontSize(8).font('Helvetica').text('DISTRIBUIDORA DE BEBIDAS', { align: 'center' });
      doc.text('Av. Principal 4500, Santiago', { align: 'center' });
      doc.text('RUT: 76.999.888-K', { align: 'center' });
      doc.moveDown(1);

      // Metadatos
      doc.fontSize(8).font('Helvetica-Bold').text(`FOLIO BOLETA: ${ticket.folio}`);
      doc.font('Helvetica');
      doc.text(`Fecha: ${new Date(ticket.fecha_hora).toLocaleString('es-CL')}`);
      doc.text(`Vendedor: ${ticket.vendedor}`);
      doc.text(`Cliente: ${ticket.cliente} (${ticket.cliente_rut})`);
      doc.moveDown(0.5);

      // Línea divisoria
      doc.text('-------------------------------------------');

      // Tabla de ítems
      ticket.items.forEach(item => {
        doc.text(`${item.nombre.substring(0, 22)}`);
        doc.text(`   ${item.cantidad} x ${fmtCLP(item.precio_unitario)} = ${fmtCLP(item.subtotal)}`, { align: 'right' });
      });

      doc.text('-------------------------------------------');
      doc.moveDown(0.5);

      // Totales
      doc.text(`Subtotal Neto: ${fmtCLP(ticket.subtotal)}`, { align: 'right' });
      doc.text(`IVA (19%): ${fmtCLP(ticket.iva)}`, { align: 'right' });
      if (ticket.descuento > 0) {
        doc.text(`Descuento: -${fmtCLP(ticket.descuento)}`, { align: 'right' });
      }
      doc.fontSize(10).font('Helvetica-Bold').text(`TOTAL: ${fmtCLP(ticket.total)}`, { align: 'right' });
      
      doc.fontSize(8).font('Helvetica');
      doc.text(`Pago (${ticket.pago_metodo.toUpperCase()}): ${fmtCLP(ticket.pago_monto)}`, { align: 'right' });
      doc.text(`Vuelto: ${fmtCLP(ticket.cambio)}`, { align: 'right' });
      doc.moveDown(1);

      // Pie de página
      doc.fontSize(7).text('¡GRACIAS POR SU COMPRA!', { align: 'center' });
      doc.text('Copias guardadas en servidor local.', { align: 'center' });

      doc.end();

      writeStream.on('finish', () => {
        console.log(`[PDF] Boleta PDF guardada en: exports/boletas/${ticket.folio}.pdf`);
        resolve(pdfPath);
      });
    } catch (err) {
      console.error('Error al generar PDF de Venta:', err);
      reject(err);
    }
  });
}

/**
 * 2. GENERADOR DE PDF PARA COMPRAS ERP (ORDEN DE COMPRA)
 */
function generatePurchasePDF(purchase, items, supplierName) {
  return new Promise((resolve, reject) => {
    try {
      const pdfPath = path.join(COMPRAS_DIR, `${purchase.folio_compra}.pdf`);
      const doc = new PDFDocument({ size: 'LETTER', margins: { top: 40, bottom: 40, left: 40, right: 40 } });

      const writeStream = fs.createWriteStream(pdfPath);
      doc.pipe(writeStream);

      // Encabezado Factura / OC
      doc.fontSize(18).font('Helvetica-Bold').text('ELEODORO EL GRANDE DISTRIBUIDORA', { color: '#E50914' });
      doc.fontSize(10).font('Helvetica').text('Orden de Compra y Recepción de Mercadería');
      doc.text('RUT: 76.999.888-K | Bodega Central');
      doc.moveDown(2);

      // Detalles
      doc.fontSize(11).font('Helvetica-Bold').text('DATOS DE LA COMPRA');
      doc.fontSize(9).font('Helvetica');
      doc.text(`Folio Interno OC: ${purchase.folio_compra}`);
      doc.text(`Proveedor: ${supplierName}`);
      doc.text(`Fecha Pedido: ${new Date(purchase.fecha_pedido).toLocaleString('es-CL')}`);
      doc.text(`Estado: ${purchase.estado.toUpperCase()}`);
      doc.moveDown(1.5);

      // Tabla de ítems
      doc.font('Helvetica-Bold').text('Detalle de Productos Ingresados:');
      doc.moveDown(0.5);

      items.forEach(item => {
        doc.font('Helvetica').text(`- ${item.nombre} | Cantidad: ${item.cantidad} | Costo unitario: ${fmtCLP(item.precio_costo)} | Subtotal: ${fmtCLP(item.cantidad * item.precio_costo)}`);
      });

      doc.moveDown(2);
      doc.fontSize(12).font('Helvetica-Bold').text(`TOTAL INGRESADO AL INVENTARIO: ${fmtCLP(purchase.total)}`, { align: 'right' });

      doc.end();

      writeStream.on('finish', () => {
        console.log(`[PDF] Orden Compra PDF guardada en: exports/compras/${purchase.folio_compra}.pdf`);
        resolve(pdfPath);
      });
    } catch (err) {
      console.error('Error al generar PDF de Compra:', err);
      reject(err);
    }
  });
}

/**
 * 3. ENVÍO DE EMAIL (SMTP O MOCK FALLBACK)
 */
async function sendEmailNotification(subject, htmlBody, attachments = [], recipient = 'vitrinazo.cl@gmail.com') {
  // Transporter SMTP Configurable o JSON Transporter de pruebas
  let transporter;
  const smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER;
  let smtpPass = process.env.SMTP_PASS || process.env.GMAIL_PASS;

  if (smtpPass) {
    smtpPass = smtpPass.replace(/\s+/g, ''); // Limpiar cualquier espacio copiado del token de aplicación de Gmail
  }

  const isSmtpConfigured = smtpUser && smtpPass;

  if (isSmtpConfigured) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 465,
      secure: true,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });
  } else {
    // Modo JSON de pruebas: escribe los correos a logs de consola
    transporter = nodemailer.createTransport({
      jsonTransport: true
    });
  }

  const mailOptions = {
    from: `"Eleodoro El Grande" <${smtpUser || 'contacto@eleodoroelgrande.cl'}>`,
    to: recipient,
    subject: subject,
    html: htmlBody,
    attachments: attachments
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    if (isSmtpConfigured) {
      console.log(`[Email] Correo enviado exitosamente a ${recipient}. MessageId: ${info.messageId}`);
    } else {
      console.log(`\n\x1b[35m[SMTP MOCK] Correo de Notificación Generado:\x1b[0m`);
      console.log(`Para: ${recipient}`);
      console.log(`Asunto: ${subject}`);
      console.log(`Cuerpo: ${htmlBody.replace(/<[^>]*>/g, '').substring(0, 150)}...`);
      if (attachments.length > 0) {
        console.log(`Adjuntos: ${attachments.map(a => a.filename).join(', ')}`);
      }
      console.log(`\x1b[35m[SMTP MOCK] (Configura SMTP_USER y SMTP_PASS en .env para envío real)\x1b[0m\n`);
    }
    return true;
  } catch (error) {
    console.error(`[Email] Error al enviar correo de notificación a ${recipient}:`, error.message);
    return false;
  }
}

/**
 * 4. ALERTA WHATSAPP (TWILIO AUTOMATIZADO + MOCK FALLBACK)
 */
async function sendWhatsAppNotification(phoneNumber, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER || '+14155238886';

  // Si no está configurado, imprimir mockup detallado en consola
  if (!accountSid || !authToken || accountSid.includes('tu-twilio')) {
    console.log(`\n\x1b[32m[WSP AUTOMATION - MOCK] Mensaje WhatsApp automático generado con éxito:\x1b[0m`);
    console.log(`Para: ${phoneNumber}`);
    console.log(`Mensaje: \x1b[36m"${message}"\x1b[0m`);
    console.log(`\x1b[33m[WSP AUTOMATION] (Configura las variables TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN en el archivo .env para el envío real a celulares)\x1b[0m\n`);
    return true;
  }

  // Si está configurado, disparar POST seguro a Twilio API
  return new Promise((resolve) => {
    const https = require('https');
    const querystring = require('querystring');

    const postData = querystring.stringify({
      To: `whatsapp:${phoneNumber}`,
      From: `whatsapp:${fromNumber}`,
      Body: message
    });

    const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const options = {
      hostname: 'api.twilio.com',
      port: 443,
      path: `/2010-04-01/Accounts/${accountSid}/Messages.json`,
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': postData.length
      }
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => responseBody += chunk);
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          console.log(`\x1b[32m[WSP AUTOMATION] Mensaje WhatsApp enviado automáticamente vía Twilio a ${phoneNumber}\x1b[0m`);
          resolve(true);
        } else {
          console.error(`\x1b[31m[WSP AUTOMATION] Error en API Twilio (Código ${res.statusCode}):\x1b[0m`, responseBody);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.error('[WSP AUTOMATION] Error de conexión de red con Twilio:', err.message);
      resolve(false);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * 5. GENERADOR DE PDF PARA GUÍAS DE DESPACHO (FORMATO SII CHILE)
 */
function generateDespachoPDF(despacho, items, clientInfo) {
  return new Promise((resolve, reject) => {
    try {
      // Determinar subcarpeta según método de pago (efectivo, transferencia, tarjeta, combinado)
      let subDir = DESPACHOS_TRANSFERENCIA_DIR;
      let rawMethod = String(despacho.forma_pago || despacho.formaPago || 'transferencia').toLowerCase().trim();

      if (rawMethod.includes('combinado') || rawMethod.includes('mixto')) {
        subDir = DESPACHOS_COMBINADO_DIR;
        rawMethod = 'Pago Combinado';
      } else if (rawMethod.includes('efectivo') || rawMethod.includes('cash')) {
        subDir = DESPACHOS_EFECTIVO_DIR;
        rawMethod = 'Efectivo';
      } else if (rawMethod.includes('tarjeta') || rawMethod.includes('card') || rawMethod.includes('debito') || rawMethod.includes('débito') || rawMethod.includes('credito') || rawMethod.includes('crédito')) {
        subDir = DESPACHOS_TARJETA_DIR;
        rawMethod = 'Tarjeta';
      } else {
        subDir = DESPACHOS_TRANSFERENCIA_DIR;
        rawMethod = 'Transferencia';
      }

      despacho.forma_pago = rawMethod;

      const targetPdfPath = path.join(subDir, `${despacho.folio}.pdf`);
      const fallbackPdfPath = path.join(DESPACHOS_DIR, `${despacho.folio}.pdf`);

      const doc = new PDFDocument({ size: 'LETTER', margins: { top: 35, bottom: 35, left: 35, right: 35 } });
      const writeStream = fs.createWriteStream(targetPdfPath);
      doc.pipe(writeStream);

      const logoPath = path.join(__dirname, '..', 'public', 'logo.jpg');

      // --- 1. RECUADRO ROJO SII (S.I.I. CHILE FORMAT) ---
      const boxX = 370;
      const boxY = 35;
      const boxW = 200;
      const boxH = 95;
      
      doc.rect(boxX, boxY, boxW, boxH).lineWidth(2).stroke('#E50914');
      
      doc.fillColor('#E50914').font('Helvetica-Bold').fontSize(12);
      doc.text('R.U.T.: 78.256.573-7', boxX, boxY + 12, { width: boxW, align: 'center' });
      doc.text('GUIA DE DESPACHO', boxX, boxY + 28, { width: boxW, align: 'center' });
      doc.text('ELECTRONICA', boxX, boxY + 42, { width: boxW, align: 'center' });
      doc.fontSize(14).text(`Nº ${despacho.folio || '000001'}`, boxX, boxY + 58, { width: boxW, align: 'center' });
      doc.fontSize(8.5).text('S.I.I. - SANTIAGO PONIENTE', boxX, boxY + 76, { width: boxW, align: 'center' });

      // Resetear color
      doc.fillColor('#000000');

      // --- 2. DATOS DEL EMISOR CON LOGO ---
      if (fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, 35, 30, { width: 120, height: 50 });
        } catch (e) {
          console.error('Error cargando logo en PDF:', e.message);
        }
      }

      // Sanitizar direcciones y vendedor para eliminar remanentes viejos de Lo Espejo
      let rawDirDespacho = despacho.direccion_despacho || (clientInfo && clientInfo.direccion);
      if (!rawDirDespacho || rawDirDespacho.toUpperCase().includes('ESPEJO') || rawDirDespacho.toUpperCase().includes('RODRÍGUEZ') || rawDirDespacho.toUpperCase().includes('RODRIGUEZ')) {
        rawDirDespacho = 'Laguna Sur #8383 Pudahuel';
      }
      let rawComDespacho = despacho.comuna_despacho || (clientInfo && clientInfo.comuna);
      if (!rawComDespacho || rawComDespacho.toUpperCase().includes('CERILLOS') || rawComDespacho.toUpperCase().includes('SAN FERNANDO')) {
        rawComDespacho = 'PUDAHUEL';
      }

      let rawDirDestino = despacho.direccion_destino;
      if (!rawDirDestino || rawDirDestino.toUpperCase().includes('ESPEJO') || rawDirDestino.toUpperCase().includes('RODRÍGUEZ') || rawDirDespacho.toUpperCase().includes('RODRIGUEZ')) {
        rawDirDestino = 'Rene Oliva #1358 Cerro Navia';
      }
      let rawComDestino = despacho.comuna_destino;
      if (!rawComDestino || rawComDestino.toUpperCase().includes('CERILLOS') || rawComDestino.toUpperCase().includes('SAN FERNANDO')) {
        rawComDestino = 'CERRO NAVIA';
      }

      let vendorVal = despacho.vendedor || despacho.vendedor_nombre;
      if (!vendorVal || vendorVal === '-' || vendorVal.toUpperCase().includes('ELEODORO')) {
        if (items && items[0] && items[0].vendedor) vendorVal = items[0].vendedor;
      }
      if (!vendorVal || vendorVal === '-' || vendorVal.toUpperCase().includes('ELEODORO')) vendorVal = 'Arantxa Perez';

      const emisorY = 70;
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a1a1a').text('COMERCIAL ELEODORO SPA', 35, emisorY);
      doc.fontSize(7).font('Helvetica').fillColor('#444444').text('COMPRA VENTA Y DIST. AL POR MENOR Y MAYOR DE BEBIDAS NO ALCOHÓLICAS', 35, emisorY + 13);
      doc.fontSize(6.5).fillColor('#333333').text('CASA MATRIZ: LAGUNA SUR #8383 PUDAHUEL', 35, emisorY + 23);
      doc.text('SUCURSAL: RENE OLIVA #1358 CERRO NAVIA, SANTIAGO', 35, emisorY + 32);
      doc.fontSize(7).font('Helvetica-Bold').fillColor('#111111').text('FONOS: +56 9 4969 2316  /  +56 9 5626 4496', 35, emisorY + 43);

      // --- 3. RECUADRO 1: DATOS DEL CLIENTE Y VENDEDOR ---
      const infoY = 138;
      const infoH = 82;
      doc.rect(35, infoY, 535, infoH).lineWidth(0.7).stroke('#333333');

      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8);
      
      // Columna 1
      doc.text('Señor(es)', 42, infoY + 8);
      doc.text('Dirección', 42, infoY + 22);
      doc.text('Comuna', 42, infoY + 36);
      doc.text('Condiciones', 42, infoY + 50);
      doc.text('Vendedor', 42, infoY + 64);

      doc.font('Helvetica').fontSize(8);
      doc.text(': COMERCIAL ELEODORO SPA', 100, infoY + 8, { width: 220, ellipsis: true });
      doc.text(`: ${rawDirDespacho}`, 100, infoY + 22, { width: 220, ellipsis: true });
      doc.text(`: ${rawComDespacho}`, 100, infoY + 36);
      doc.text(`: ${despacho.condiciones || '-'}`, 100, infoY + 50);
      doc.font('Helvetica-Bold');
      doc.text(`: ${vendorVal}`, 100, infoY + 64, { width: 220, ellipsis: true });
      doc.font('Helvetica');

      // Columna 2
      doc.font('Helvetica-Bold');
      doc.text('Ciudad :', 220, infoY + 36);
      doc.font('Helvetica');
      doc.text(`${despacho.ciudad_despacho || rawComDespacho || 'SANTIAGO'}`, 260, infoY + 36);

      doc.font('Helvetica-Bold');
      doc.text('Vencimiento :', 220, infoY + 50);
      doc.font('Helvetica');
      doc.text(`${despacho.vencimiento || '-'}`, 285, infoY + 50);

      // Columna Derecha (SII datos cliente)
      doc.font('Helvetica-Bold');
      doc.text('Giro', 350, infoY + 8);
      doc.text('R.U.T.', 350, infoY + 22);
      doc.text('Fecha', 350, infoY + 36);

      const fechaEmision = despacho.fecha_emision ? new Date(despacho.fecha_emision) : new Date();
      const fechaStr = `Santiago, ${fechaEmision.getDate()} de ${fechaEmision.toLocaleString('es-CL', { month: 'long' })} de ${fechaEmision.getFullYear()}`;

      doc.font('Helvetica');
      doc.text(`: ${clientInfo.giro || despacho.giro || '-'}`, 390, infoY + 8, { width: 175 });
      doc.text(`: ${clientInfo.rut_o_nit || despacho.cliente_rut || '78.256.573-7'}`, 390, infoY + 22);
      doc.text(`: ${fechaStr}`, 390, infoY + 36);

      // --- 4. RECUADRO 2: DATOS DEL TRANSPORTE Y CHOFER ---
      const transpY = infoY + infoH + 6;
      const transpH = 65;
      doc.rect(35, transpY, 535, transpH).lineWidth(0.7).stroke('#333333');

      doc.font('Helvetica-Bold').fontSize(8);
      doc.text('Nombre Chofer', 42, transpY + 6);
      doc.text('Rut Chofer', 42, transpY + 20);
      doc.text('Despacho', 42, transpY + 34);
      doc.text('Traslado', 42, transpY + 48);

      doc.font('Helvetica').fontSize(8);
      doc.text(`: ${despacho.nombre_chofer || 'CRISTIAN MIRANDA'}`, 115, transpY + 6, { width: 175, ellipsis: true });
      doc.text(`: ${despacho.rut_chofer || '18338934-3'}`, 115, transpY + 20);
      doc.text(`: ${despacho.tipo_despacho || 'Sin Despacho'}`, 115, transpY + 34);
      doc.text(`: ${despacho.tipo_traslado || 'TRASLADO: Otros traslados No Venta'}`, 115, transpY + 48, { width: 175, ellipsis: true });

      doc.font('Helvetica-Bold').fontSize(8);
      doc.text('Patente', 300, transpY + 6);
      doc.text('Dirección destino', 300, transpY + 20);
      doc.text('Comuna destino', 300, transpY + 34);
      doc.text('Rut Transportista', 300, transpY + 48);

      doc.font('Helvetica').fontSize(8);
      doc.text(`: ${despacho.patente_vehiculo || 'CYPX-41'}`, 390, transpY + 6);
      doc.text(`: ${rawDirDestino}`, 390, transpY + 20, { width: 175, ellipsis: true });
      doc.text(`: ${rawComDestino}`, 390, transpY + 34);
      doc.text(`: ${despacho.rut_transportista || despacho.rut_chofer || '18338934-3'}`, 390, transpY + 48);

      // --- 5. TABLA DE PRODUCTOS (HASTA 16 SKUs EN 1 HOJA) ---
      const tableY = transpY + transpH + 6;
      const tableH = 16;
      
      doc.rect(35, tableY, 535, tableH).fill('#000000');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5);
      doc.text('No.', 38, tableY + 4, { width: 25, align: 'center' });
      doc.text('Código', 65, tableY + 4, { width: 45, align: 'left' });
      doc.text('Detalle', 115, tableY + 4, { width: 230, align: 'left' });
      doc.text('Cantidad', 350, tableY + 4, { width: 45, align: 'right' });
      doc.text('U.M.', 400, tableY + 4, { width: 30, align: 'center' });
      doc.text('Precio', 435, tableY + 4, { width: 40, align: 'right' });
      doc.text('Descto', 480, tableY + 4, { width: 35, align: 'right' });
      doc.text('Total', 520, tableY + 4, { width: 45, align: 'right' });

      doc.fillColor('#000000').font('Helvetica').fontSize(7.5);
      let itemY = tableY + tableH;

      // Limitar a máximo 16 SKUs para asegurar formato estricto de 1 sola página
      const pageItems = items.slice(0, 16);

      pageItems.forEach((item, index) => {
        const lineNo = index + 1;
        const rowH = 14;
        if (index % 2 === 1) {
          doc.rect(35, itemY, 535, rowH).fill('#f7f7f7');
          doc.fillColor('#000000');
        }

        const qtyFormatted = (typeof item.cantidad === 'number' ? item.cantidad.toFixed(2) : item.cantidad || '1,00').replace('.', ',');
        const unit = item.um || 'UN';
        const price = item.precio_unitario || 0;
        const descto = item.descuento || 0;
        const subtotal = item.subtotal || (item.cantidad * price - descto);

        doc.text(String(lineNo), 38, itemY + 3, { width: 25, align: 'center' });
        doc.text(String(item.codigo || '0'), 65, itemY + 3, { width: 45, align: 'left' });
        doc.text(String(item.nombre || item.detalle || 'Producto'), 115, itemY + 3, { width: 230, ellipsis: true });
        doc.text(qtyFormatted, 350, itemY + 3, { width: 45, align: 'right' });
        doc.text(unit, 400, itemY + 3, { width: 30, align: 'center' });
        doc.text(price.toLocaleString('es-CL'), 435, itemY + 3, { width: 40, align: 'right' });
        doc.text(descto.toLocaleString('es-CL'), 480, itemY + 3, { width: 35, align: 'right' });
        doc.text(subtotal.toLocaleString('es-CL'), 520, itemY + 3, { width: 45, align: 'right' });

        itemY += rowH;
      });

      doc.rect(35, itemY, 535, 0.5).stroke('#cccccc');

      // --- 6. SECCIÓN PIE Y TIMBRE SII ---
      const footerY = Math.max(itemY + 6, 506);

      doc.font('Helvetica-Bold').fontSize(8);
      doc.text('SON: PESOS.--', 35, footerY);

      doc.font('Helvetica').fontSize(7.5);
      doc.text('Cancelado por : ____________________ de: ___________ de: ___________', 260, footerY);

      doc.rect(35, footerY + 14, 535, 26).lineWidth(0.5).stroke('#aaaaaa');
      doc.font('Helvetica-Bold').fontSize(7);
      doc.text('Referencias:', 42, footerY + 17);
      doc.font('Helvetica').fontSize(7);
      doc.text(despacho.referencias || 'Devolución / Venta', 42, footerY + 28);

      // Cuadro Timbre Electrónico SII (Izquierda)
      const timbreY = footerY + 46;
      doc.rect(35, timbreY, 250, 85).lineWidth(0.8).stroke('#000000');
      
      doc.save();
      doc.translate(45, timbreY + 8);
      doc.lineWidth(0.6).strokeColor('#000000');
      for (let i = 0; i < 230; i += 3) {
        let height = 40;
        if (i % 6 === 0) doc.moveTo(i, 0).lineTo(i, height).stroke();
        if (i % 9 === 0) doc.moveTo(i + 1, 0).lineTo(i + 1, height).stroke();
      }
      doc.restore();

      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(7.5);
      doc.text('Timbre Electronico S.I.I.', 35, timbreY + 56, { width: 250, align: 'center' });
      doc.font('Helvetica').fontSize(6.5);
      doc.text('Resolución 80 del 22/08/2014   Verifique Documento: http://www.sii.cl', 35, timbreY + 68, { width: 250, align: 'center' });

      // Cuadro Forma de Pago y Montos Totales (Derecha)
      doc.rect(295, timbreY, 130, 85).lineWidth(0.5).stroke('#aaaaaa');
      doc.font('Helvetica-Bold').fontSize(8);
      doc.text('Forma de Pago:', 300, timbreY + 8);
      doc.font('Helvetica').fontSize(7.5);
      doc.text(despacho.forma_pago || 'Crédito / Transferencia', 300, timbreY + 22);

      doc.rect(430, timbreY, 140, 85).lineWidth(0.5).stroke('#aaaaaa');
      doc.font('Helvetica-Bold').fontSize(8.5);
      
      const subtotalVal = despacho.subtotal || items.reduce((acc, i) => acc + (i.subtotal || 0), 0);
      const ivaVal = despacho.iva || Math.round(subtotalVal * 0.19);
      const totalVal = despacho.total || (subtotalVal + ivaVal);

      doc.text('Montos Totales', 435, timbreY + 6, { width: 130, align: 'center' });
      doc.font('Helvetica').fontSize(8);
      doc.text(`Neto:`, 438, timbreY + 24);
      doc.text(`$ ${subtotalVal.toLocaleString('es-CL')}`, 480, timbreY + 24, { width: 85, align: 'right' });

      doc.text(`IVA (19%):`, 438, timbreY + 40);
      doc.text(`$ ${ivaVal.toLocaleString('es-CL')}`, 480, timbreY + 40, { width: 85, align: 'right' });

      doc.font('Helvetica-Bold').fontSize(9);
      doc.text(`Total:`, 438, timbreY + 60);
      doc.text(`$ ${totalVal.toLocaleString('es-CL')}`, 480, timbreY + 60, { width: 85, align: 'right' });

      // Pie de página sitio web oficial
      const webY = 735;
      doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#E50914');
      doc.text('www.eleodoroelgrande.cl', 35, webY + 10, { width: 350, align: 'center' });

      // Logo impreso en la esquina inferior derecha (a la derecha del sitio web)
      const watermarkPath = fs.existsSync(path.join(__dirname, '..', 'public', 'sello_agua.jpg'))
        ? path.join(__dirname, '..', 'public', 'sello_agua.jpg')
        : path.join(__dirname, 'sello_agua.jpg');

      if (fs.existsSync(watermarkPath)) {
        try {
          doc.image(watermarkPath, 410, 695, { fit: [150, 48] });
        } catch (e) {
          console.error('Error imprimiendo logo inferior:', e.message);
        }
      }

      doc.end();

      writeStream.on('finish', () => {
        try {
          fs.copyFileSync(targetPdfPath, fallbackPdfPath);
        } catch (e) {}
        console.log(`[PDF] Guía de Despacho PDF SII guardada en: ${targetPdfPath}`);
        resolve(targetPdfPath);
      });
    } catch (err) {
      console.error('Error al generar PDF de Despacho:', err);
      reject(err);
    }
  });
}

module.exports = {
  generateSalePDF,
  generatePurchasePDF,
  generateDespachoPDF,
  sendEmailNotification,
  sendWhatsAppNotification
};
