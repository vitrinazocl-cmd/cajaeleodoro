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

// Asegurar directorios
if (!fs.existsSync(BOLETAS_DIR)) fs.mkdirSync(BOLETAS_DIR, { recursive: true });
if (!fs.existsSync(COMPRAS_DIR)) fs.mkdirSync(COMPRAS_DIR, { recursive: true });
if (!fs.existsSync(DESPACHOS_DIR)) fs.mkdirSync(DESPACHOS_DIR, { recursive: true });

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
      const pdfPath = path.join(DESPACHOS_DIR, `${despacho.folio}.pdf`);
      const doc = new PDFDocument({ size: 'LETTER', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
      const writeStream = fs.createWriteStream(pdfPath);
      doc.pipe(writeStream);

      // --- 1. DIBUJAR RECUADRO ROJO SII (S.I.I. CHILE FORMAT) ---
      const boxX = 380;
      const boxY = 40;
      const boxW = 190;
      const boxH = 90;
      
      doc.rect(boxX, boxY, boxW, boxH).lineWidth(2).stroke('#E50914');
      
      doc.fillColor('#E50914').font('Helvetica-Bold').fontSize(12);
      doc.text('R.U.T.: 76.999.888-K', boxX, boxY + 12, { width: boxW, align: 'center' });
      doc.text('GUÍA DE DESPACHO', boxX, boxY + 28, { width: boxW, align: 'center' });
      doc.text('ELECTRÓNICA', boxX, boxY + 42, { width: boxW, align: 'center' });
      doc.fontSize(14).text(`Nº ${despacho.folio}`, boxX, boxY + 58, { width: boxW, align: 'center' });
      doc.fontSize(9).text('S.I.I. - SANTIAGO', boxX, boxY + 74, { width: boxW, align: 'center' });

      // Resetear color
      doc.fillColor('#000000').font('Helvetica').fontSize(9);

      // --- 2. DATOS DEL EMISOR (BODEGA CENTRAL / DISTRIBUIDORA) ---
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#1a1a1a').text('ELEODORO EL GRANDE DISTRIBUIDORA', 40, 40);
      doc.fontSize(8).font('Helvetica').fillColor('#555555').text('GIRO: Distribuidora de Bebidas, Licores y Consumo Masivo');
      doc.text('Dirección: Av. Principal 4500, Santiago, Chile');
      doc.text('Teléfono: +56 9 8765 4321 | Email: contacto@eleodoroelgrande.cl');
      doc.moveDown(2);

      // --- 3. RECUADROS DE INFORMACIÓN (CLIENTE Y TRANSPORTE) ---
      const infoY = 150;
      
      // Recuadro Cliente (Izquierda)
      doc.rect(40, infoY, 260, 110).lineWidth(0.5).stroke('#cccccc');
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8.5).text('DATOS DEL RECEPTOR (CLIENTE)', 50, infoY + 8);
      doc.font('Helvetica').fontSize(8);
      doc.text(`Señor(es): ${clientInfo.nombre || 'Cliente General'}`, 50, infoY + 22, { width: 240 });
      doc.text(`R.U.T.: ${clientInfo.rut_o_nit || 'N/A'}`, 50, infoY + 45);
      doc.text(`Giro: ${clientInfo.giro || 'Comercial / Distribución'}`, 50, infoY + 57, { width: 240 });
      doc.text(`Dirección: ${despacho.direccion_despacho}`, 50, infoY + 77, { width: 240 });
      doc.text(`Comuna: ${despacho.comuna_despacho || 'Santiago'}`, 50, infoY + 95);

      // Recuadro Transporte/Despacho (Derecha)
      doc.rect(310, infoY, 260, 110).lineWidth(0.5).stroke('#cccccc');
      doc.font('Helvetica-Bold').fontSize(8.5).text('DATOS DEL TRASLADO Y DESPACHO', 320, infoY + 8);
      doc.font('Helvetica').fontSize(8);
      doc.text(`Fecha Emisión: ${new Date(despacho.fecha_emision).toLocaleDateString('es-CL')}`, 320, infoY + 22);
      doc.text(`Fecha Traslado: ${new Date(despacho.fecha_traslado).toLocaleDateString('es-CL')}`, 320, infoY + 34);
      doc.text(`Tipo Traslado: ${despacho.tipo_traslado || 'Venta'}`, 320, infoY + 46);
      doc.text(`Chofer: ${despacho.nombre_chofer || 'N/A'}`, 320, infoY + 58, { width: 240 });
      doc.text(`RUT Chofer: ${despacho.rut_chofer || 'N/A'}`, 320, infoY + 77);
      doc.text(`Patente Vehículo: ${despacho.patente_vehiculo || 'N/A'}`, 320, infoY + 89);

      doc.moveDown(3);

      // --- 4. TABLA DE PRODUCTOS ---
      const tableY = 285;
      doc.rect(40, tableY, 530, 20).fill('#1a1a1a');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
      doc.text('CÓDIGO', 45, tableY + 6);
      doc.text('DESCRIPCIÓN DEL PRODUCTO', 120, tableY + 6);
      doc.text('CANTIDAD', 380, tableY + 6, { width: 50, align: 'center' });
      doc.text('UNITARIO', 440, tableY + 6, { width: 50, align: 'right' });
      doc.text('TOTAL', 500, tableY + 6, { width: 60, align: 'right' });

      doc.fillColor('#000000').font('Helvetica');
      let itemY = tableY + 20;

      items.forEach((item, index) => {
        if (index % 2 === 1) {
          doc.rect(40, itemY, 530, 18).fill('#f9f9f9');
          doc.fillColor('#000000');
        }
        
        doc.text(item.codigo || `P-${item.producto_id}`, 45, itemY + 5);
        doc.text(item.nombre || item.producto_nombre || 'Producto', 120, itemY + 5, { width: 250, ellipsis: true });
        doc.text(String(item.cantidad), 380, itemY + 5, { width: 50, align: 'center' });
        doc.text(fmtCLP(item.precio_unitario), 440, itemY + 5, { width: 50, align: 'right' });
        doc.text(fmtCLP(item.subtotal), 500, itemY + 5, { width: 60, align: 'right' });
        
        itemY += 18;
      });

      doc.rect(40, itemY, 530, 0.5).stroke('#cccccc');

      // --- 5. RESUMEN DE TOTALES ---
      const totalsY = itemY + 15;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('NETO:', 420, totalsY, { width: 70, align: 'left' });
      doc.text(fmtCLP(despacho.subtotal), 500, totalsY, { width: 70, align: 'right' });

      doc.text('IVA (19%):', 420, totalsY + 15, { width: 70, align: 'left' });
      doc.text(fmtCLP(despacho.iva), 500, totalsY + 15, { width: 70, align: 'right' });

      doc.fontSize(10).text('TOTAL:', 420, totalsY + 30, { width: 70, align: 'left' });
      doc.text(fmtCLP(despacho.total), 500, totalsY + 30, { width: 70, align: 'right' });

      // --- 6. TIMBRE ELECTRÓNICO SII (MOCKED) ---
      const timbreY = totalsY + 50;
      doc.rect(40, timbreY, 280, 75).lineWidth(1).stroke('#E50914');
      
      doc.save();
      doc.translate(50, timbreY + 10);
      doc.lineWidth(0.5).strokeColor('#E50914');
      for (let i = 0; i < 260; i += 4) {
        let height = 30;
        if (i % 8 === 0) doc.moveTo(i, 0).lineTo(i, height).stroke();
        if (i % 12 === 0) doc.moveTo(i + 1, 0).lineTo(i + 1, height).stroke();
      }
      doc.restore();

      doc.fillColor('#E50914').font('Helvetica-Bold').fontSize(7.5);
      doc.text('Timbre Electrónico S.I.I.', 50, timbreY + 45, { width: 260, align: 'center' });
      doc.font('Helvetica').fontSize(6.5);
      doc.text('Resolución Nº 80 de 2026 - Verifique validez en www.sii.cl', 50, timbreY + 55, { width: 260, align: 'center' });

      // --- 7. ACUSE DE RECIBO ---
      const recY = timbreY + 90;
      doc.rect(40, recY, 530, 50).lineWidth(0.5).stroke('#999999');
      doc.fillColor('#555555').font('Helvetica-Bold').fontSize(7).text('ACUSE DE RECIBO Y RECEPCIÓN', 45, recY + 5);
      doc.font('Helvetica').fontSize(6.5);
      doc.text('Nombre Recibe: _______________________________   R.U.T.: ___________________   Firma: ___________________', 45, recY + 18);
      doc.text('El acuse de recibo que se declara en este acto, acredita que las mercaderías han sido entregadas al receptor conforme y a su entera satisfacción.', 45, recY + 33);

      doc.end();

      writeStream.on('finish', () => {
        console.log(`[PDF] Guía de Despacho PDF guardada en: exports/despachos/${despacho.folio}.pdf`);
        resolve(pdfPath);
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
