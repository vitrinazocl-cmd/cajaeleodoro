// database/import_clients.js
// Script para importar clientes desde el archivo de Excel plantilla_clientes_proveedores ELEODORO.xlsx

const XLSX = require('xlsx');
const path = require('path');
const db = require('./connection');

const fs = require('fs');
const userDownloads = path.join(process.env.USERPROFILE || 'C:\\Users\\ext_jmena', 'Downloads', 'plantilla_clientes_proveedores ELEODORO.xlsx');
const filePath = fs.existsSync(userDownloads) ? userDownloads : 'C:\\Users\\pc\\Downloads\\plantilla_clientes_proveedores ELEODORO.xlsx';

async function runImport() {
  console.log('Iniciando importación de clientes desde Excel...');

  try {
    const workbook = XLSX.readFile(filePath);
    const sheetNames = workbook.SheetNames;

    const clientRows = [];
    const seenRutsInExcel = new Set();

    sheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        console.warn(`La hoja ${sheetName} no se encontró en el archivo.`);
        return;
      }
      
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      console.log(`Leídas ${rows.length} filas de la hoja: ${sheetName}`);
      
      rows.forEach((row) => {
        let rut = '';
        let nombre = '';
        let comuna = '';
        
        Object.keys(row).forEach(key => {
          const lowerKey = key.trim().toLowerCase();
          if (lowerKey === 'rut') {
            rut = String(row[key]).trim();
          } else if (lowerKey === 'cliente' || lowerKey === 'nombre') {
            nombre = String(row[key]).trim();
          } else if (lowerKey === 'comuna' || lowerKey === 'comunas') {
            comuna = String(row[key]).trim();
          }
        });
        
        // Validar que tengamos los datos mínimos requeridos
        if (!rut || !nombre || rut.toLowerCase() === 'rut') {
          return;
        }

        const normalizedRut = rut.toLowerCase().replace(/\s+/g, '');
        
        if (seenRutsInExcel.has(normalizedRut)) {
          return;
        }
        seenRutsInExcel.add(normalizedRut);

        clientRows.push({
          rut: rut,
          nombre: nombre,
          direccion: comuna
        });
      });
    });

    console.log(`Total clientes únicos a procesar del Excel: ${clientRows.length}`);

    // Consultar clientes existentes en la BD
    console.log('Consultando clientes existentes en la base de datos...');
    const existingRes = await db.query('SELECT rut_o_nit FROM clientes');
    const existingRuts = new Set(existingRes.rows.map(r => r.rut_o_nit.trim().toLowerCase().replace(/\s+/g, '')));
    console.log(`Clientes existentes en la BD: ${existingRuts.size}`);

    // Filtrar los nuevos
    const newClients = clientRows.filter(c => {
      const norm = c.rut.toLowerCase().replace(/\s+/g, '');
      return !existingRuts.has(norm);
    });

    console.log(`Total nuevos clientes a insertar: ${newClients.length}`);

    if (newClients.length === 0) {
      console.log('No hay nuevos clientes para insertar.');
      process.exit(0);
    }

    let insertedCount = 0;
    
    // Iniciar transacción para PostgreSQL
    const isPostgres = db.getMode() === 'POSTGRES';
    if (isPostgres) {
      await db.query('BEGIN');
    }

    for (const client of newClients) {
      try {
        await db.query(
          'INSERT INTO clientes (rut_o_nit, nombre, direccion) VALUES ($1, $2, $3)',
          [client.rut, client.nombre, client.direccion]
        );
        insertedCount++;
        if (insertedCount % 200 === 0) {
          console.log(`Insertados ${insertedCount} clientes...`);
        }
      } catch (err) {
        console.error(`Error al insertar cliente ${client.nombre} (${client.rut}):`, err.message);
      }
    }

    if (isPostgres) {
      await db.query('COMMIT');
    }

    console.log(`\n======================================================`);
    console.log(`✅ IMPORTACIÓN DE CLIENTES COMPLETADA`);
    console.log(`👥 Clientes insertados exitosamente: ${insertedCount} de ${newClients.length}`);
    console.log(`======================================================\n`);
    
    process.exit(0);
  } catch (err) {
    console.error('Error general durante la importación:', err);
    process.exit(1);
  }
}

runImport();
