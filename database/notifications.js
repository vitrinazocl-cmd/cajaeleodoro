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

// Asegurar directorios
if (!fs.existsSync(BOLETAS_DIR)) fs.mkdirSync(BOLETAS_DIR, { recursive: true });
if (!fs.existsSync(COMPRAS_DIR)) fs.mkdirSync(COMPRAS_DIR, { recursive: true });

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
  const isSmtpConfigured = process.env.SMTP_USER && process.env.SMTP_PASS;

  if (isSmtpConfigured) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  } else {
    // Modo JSON de pruebas: escribe los correos a logs de consola
    transporter = nodemailer.createTransport({
      jsonTransport: true
    });
  }

  const mailOptions = {
    from: `"Eleodoro El Grande" <${process.env.SMTP_USER || 'contacto@eleodoroelgrande.cl'}>`,
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

module.exports = {
  generateSalePDF,
  generatePurchasePDF,
  sendEmailNotification,
  sendWhatsAppNotification
};
