// database/import_catalog.js
// Script para importar productos reales desde distribuidora2 a la base de datos (PostgreSQL o SQLite)

const fs = require('fs');
const path = require('path');
const db = require('./connection');

const OLD_CATALOG_PATH = path.join(__dirname, 'catalogo.js');

// Capitalizar palabras
function formatName(str) {
  if (!str) return '';
  return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

// Limpiar nombres de categorías
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

async function runImport() {
  console.log('Iniciando importación de catálogo real...');

  if (!fs.existsSync(OLD_CATALOG_PATH)) {
    console.error(`No se encontró el archivo catálogo en la ruta: ${OLD_CATALOG_PATH}`);
    process.exit(1);
  }

  try {
    // 1. Leer y evaluar catalogo.js
    const fileContent = fs.readFileSync(OLD_CATALOG_PATH, 'utf8');
    const tempJsContent = fileContent.replace('const catalogoProductos =', 'module.exports =');
    const tempPath = path.join(__dirname, 'temp_catalogo.js');
    
    fs.writeFileSync(tempPath, tempJsContent);
    const oldProducts = require(tempPath);
    fs.unlinkSync(tempPath);

    console.log(`Catálogo original cargado: ${oldProducts.length} productos detectados.`);

    // 2. Insertar Categorías Únicas
    const categoryMap = new Map();
    const rawCategories = [...new Set(oldProducts.map(p => p.category).filter(Boolean))];

    for (const rawCat of rawCategories) {
      const cleanName = cleanCategory(rawCat);
      
      // Buscar o Insertar Categoría
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
    console.log(`Categorías importadas/vinculadas: ${categoryMap.size}`);

    // 3. Insertar Proveedor Base para los productos importados
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

    // 4. Limpiar productos previos en la base de datos para evitar colisión de claves únicas (conservando ventas intactas)
    console.log('Limpiando catálogo base previo...');
    await db.query('DELETE FROM movimientos_inventario');
    await db.query('DELETE FROM inventario');
    await db.query('DELETE FROM productos');

    // 5. Insertar Productos
    let successCount = 0;
    for (let i = 0; i < oldProducts.length; i++) {
      const p = oldProducts[i];
      const categoryId = categoryMap.get(p.category) || null;
      
      const codigo = p.id;
      const sku = `SKU-${p.id}`;
      // Generar código de barra numérico estándar si no tiene
      const barcode = '780' + String(i).padStart(10, '0');
      
      const nombre = p.name;
      const precioVenta = parseFloat(p.price);
      
      // Costo estimado (65% del precio de venta para margen del 35%)
      const precioCosto = Math.round(precioVenta * 0.65);
      const margen = 35.00;
      
      // Stock inicial aleatorio entre 30 y 120 para tener datos de prueba realistas
      const stockActual = Math.floor(Math.random() * 91) + 30;
      const stockMinimo = 10;
      
      // Ruta de la imagen local
      const imagenUrl = p.image ? `/${p.image}` : '';
      const descripcion = `Producto importado de www.eleodoroelgrande.cl. Sabores/Variaciones: ${p.flavors ? p.flavors.join(', ') : 'Ninguno'}.`;
      const marca = formatName(p.category);

      try {
        const prodInsert = await db.query(
          `INSERT INTO productos 
           (codigo, sku, codigo_barra, nombre, descripcion, categoria_id, marca, proveedor_id, precio_costo, precio_venta, margen, stock_actual, stock_minimo, imagen_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           RETURNING id`,
          [codigo, sku, barcode, nombre, descripcion, categoryId, marca, supplierId, precioCosto, precioVenta, margen, stockActual, stockMinimo, imagenUrl]
        );

        const newProductId = prodInsert.rows[0].id;

        // Insertar consolidado de inventario
        await db.query(
          `INSERT INTO inventario (producto_id, stock_actual, stock_minimo, ubicacion)
           VALUES ($1, $2, $3, $4)`,
          [newProductId, stockActual, stockMinimo, 'Bodega Principal A']
        );

        // Insertar movimiento inicial en Kardex
        await db.query(
          `INSERT INTO movimientos_inventario (producto_id, tipo_movimiento, cantidad, motivo, usuario_id)
           VALUES ($1, 'ingreso_ajuste', $2, 'Carga de stock inicial catálogo www.eleodoroelgrande.cl', 1)`,
          [newProductId, stockActual]
        );

        successCount++;
      } catch (err) {
        console.error(`Error al importar producto ${nombre}:`, err.message);
      }
    }

    console.log(`\n======================================================`);
    console.log(`✅ IMPORTACIÓN COMPLETA`);
    console.log(`📦 Productos importados exitosamente: ${successCount} de ${oldProducts.length}`);
    console.log(`======================================================\n`);
    
    // Salir del script
    process.exit(0);
  } catch (err) {
    console.error('Error general durante la importación:', err);
    process.exit(1);
  }
}

// Ejecutar importación
runImport();
