// database/export_catalog_excel.js
// Script para exportar el catálogo completo de productos a un archivo CSV compatible con Excel

const fs = require('fs');
const path = require('path');
const db = require('./connection');

async function exportToExcel() {
  console.log('Iniciando exportación de catálogo...');

  try {
    const res = await db.query(`
      SELECT p.*, c.nombre as categoria_nombre, pr.nombre as proveedor_nombre
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
      ORDER BY p.nombre ASC
    `);

    const products = res.rows;
    console.log(`Se encontraron ${products.length} productos en la base de datos.`);

    // BOM UTF-8 para que Excel detecte correctamente la codificación en español
    let csv = "\ufeff";
    
    // Encabezados del Excel
    const headers = [
      "ID Interno",
      "Código Producto",
      "SKU",
      "Código Barras",
      "Nombre Comercial",
      "Marca",
      "Categoría",
      "Proveedor",
      "Precio Costo ($)",
      "Precio Venta ($)",
      "Margen Comercial (%)",
      "Stock Actual",
      "Stock Mínimo Alerta",
      "Ruta Imagen",
      "Descripción Detallada"
    ];
    csv += headers.join(";") + "\n";

    // Llenar filas
    products.forEach(p => {
      const row = [
        p.id,
        p.codigo || '',
        p.sku || '',
        p.codigo_barra || '',
        p.nombre ? p.nombre.replace(/"/g, '""') : '',
        p.marca || '',
        p.categoria_nombre || '',
        p.proveedor_nombre || '',
        p.precio_costo || 0,
        p.precio_venta || 0,
        p.margen || 0,
        p.stock_actual || 0,
        p.stock_minimo || 0,
        p.imagen_url || '',
        p.descripcion ? p.descripcion.replace(/"/g, '""').replace(/\n/g, ' ') : ''
      ];
      
      // Sanitizar valores con comillas
      const formattedRow = row.map(val => {
        if (typeof val === 'string') {
          return `"${val}"`;
        }
        return val;
      });

      csv += formattedRow.join(";") + "\n";
    });

    // Definir ruta y guardar
    const exportDir = path.join(__dirname, '..', 'exports');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const exportPath = path.join(exportDir, 'Catalogo_Detallado_Eleodoro.csv');
    fs.writeFileSync(exportPath, csv, 'utf8');

    console.log(`\n======================================================`);
    console.log(`✅ EXPORTACIÓN COMPLETA`);
    console.log(`📊 Archivo guardado: exports/Catalogo_Detallado_Eleodoro.csv`);
    console.log(`📦 Total registros exportados: ${products.length}`);
    console.log(`======================================================\n`);
    
    process.exit(0);
  } catch (err) {
    console.error('Error durante la exportación a Excel:', err);
    process.exit(1);
  }
}

exportToExcel();
exportToExcel();
