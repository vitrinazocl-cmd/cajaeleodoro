// database/test_smtp.js
// Script de prueba para validar que tu configuración de correo en el archivo .env sea correcta

const nodemailer = require('nodemailer');
require('dotenv').config();

async function testEmail() {
  console.log('--- Probando Conexión SMTP ---');
  console.log(`Host: ${process.env.SMTP_HOST}`);
  console.log(`Port: ${process.env.SMTP_PORT}`);
  console.log(`User: ${process.env.SMTP_USER}`);
  
  if (!process.env.SMTP_USER || process.env.SMTP_USER.includes('tu-correo')) {
    console.error('\n❌ ERROR: Aún no has configurado tu correo en el archivo .env (tiene los valores por defecto).');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  try {
    console.log('Conectando con el servidor de correo...');
    await transporter.verify();
    console.log('✅ Conexión SMTP exitosa. Credenciales correctas.');

    console.log('Enviando correo de prueba a vitrinazo.cl@gmail.com...');
    await transporter.sendMail({
      from: `"Eleodoro El Grande" <${process.env.SMTP_USER}>`,
      to: 'vitrinazo.cl@gmail.com',
      subject: 'Prueba de Sistema - Eleodoro El Grande',
      text: '¡Felicidades! La automatización de correos de tu ERP funciona correctamente.'
    });
    console.log('✅ Correo de prueba enviado exitosamente a vitrinazo.cl@gmail.com. ¡Por favor revisa tu bandeja de entrada o spam!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ ERROR AL ENVIAR CORREO:', error.message);
    console.log('\nSugerencias de solución:');
    console.log('1. Asegúrate de que el correo en SMTP_USER sea tu cuenta de Gmail.');
    console.log('2. Asegúrate de usar una "Contraseña de aplicación" de 16 caracteres en SMTP_PASS, y NO tu contraseña normal de Gmail.');
    console.log('3. Asegúrate de tener habilitada la verificación en 2 pasos en tu cuenta de Google.');
    process.exit(1);
  }
}

testEmail();
