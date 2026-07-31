// database/connection.js
// Arquitectura híbrida de base de datos PostgreSQL / SQLite Fallback
const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Cargar variables de entorno si no están cargadas
require('dotenv').config();

let dbMode = 'POSTGRES';
let pgPool = null;
let sqliteDb = null;
let connectionResolver = null;
const connectionPromise = new Promise((resolve) => {
  connectionResolver = resolve;
});

const dbConfig = {
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'postgres',
};

// Inicializa base de datos SQLite de contingencia
function initSQLite() {
  dbMode = 'SQLITE';
  const dbDir = path.join(__dirname, '..', 'database');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const dbPath = path.join(dbDir, 'local_backup.db');
  console.log(`\x1b[33m[DB] Iniciando Modo Contingencia Híbrido (SQLite)\x1b[0m`);
  console.log(`\x1b[33m[DB] Archivo local: ${dbPath}\x1b[0m`);

  sqliteDb = new sqlite3.Database(dbPath);

  // Inicializar tablas desde schema.sql traducido
  try {
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    
    // Traducir dialecto Postgres a SQLite
    let sqliteSchema = schemaSql
      .replace(/SERIAL PRIMARY KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')
      .replace(/DECIMAL\(\d+,\d+\)/gi, 'NUMERIC')
      .replace(/CHECK \([^)]+IN\s+\([^)]+\)\)/gi, ''); // Simplificar checks para SQLite
      
    const statements = sqliteSchema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    sqliteDb.serialize(() => {
      // Desactivar temporalmente claves foráneas para evitar problemas de orden al poblar datos iniciales
      sqliteDb.run('PRAGMA foreign_keys = OFF');
      
      statements.forEach(stmt => {
        sqliteDb.run(stmt, (err) => {
          if (err && !err.message.includes('already exists')) {
            // Ignorar errores menores de tablas duplicadas
          }
        });
      });
      
      // Reactivar claves foráneas
      sqliteDb.run('PRAGMA foreign_keys = ON');
      
      // Crear administrador por defecto si no existe
      sqliteDb.get('SELECT id FROM usuarios WHERE username = ?', ['eleodoro'], (err, row) => {
        if (!row) {
          const salt = bcrypt.genSaltSync(10);
          const hash = bcrypt.hashSync('123456', salt);
          sqliteDb.run(
            'INSERT OR IGNORE INTO usuarios (username, password_hash, nombre, email, rol_id, estado) VALUES (?, ?, ?, ?, ?, ?)',
            ['eleodoro', hash, 'Eleodoro El Grande', 'contacto@eleodoro.cl', 1, 'activo'],
            () => {
              connectionResolver();
            }
          );
        } else {
          connectionResolver();
        }
      });
    });
    console.log(`\x1b[32m[DB] SQLite inicializado con éxito.\x1b[0m`);
  } catch (err) {
    console.error('Error al inicializar SQLite:', err);
    connectionResolver();
  }
}

// Inicializar conexión
function initConnection() {
  if (process.env.USE_SQLITE_FALLBACK === 'only') {
    initSQLite();
    return;
  }

  const poolConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : { ...dbConfig };

  console.log(`[DB] Intentando conectar a PostgreSQL...`);
  pgPool = new Pool({
    ...poolConfig,
    connectionTimeoutMillis: 3000 // Timeout corto para detectar fallo rápido
  });

  pgPool.query('SELECT NOW()', (err, res) => {
    if (err) {
      console.warn(`\x1b[31m[DB] Error al conectar a PostgreSQL:\x1b[0m`, err.message);
      if (process.env.USE_SQLITE_FALLBACK !== 'false') {
        initSQLite();
      } else {
        console.error('SQLite fallback deshabilitado. Cerrando la aplicación.');
        process.exit(1);
      }
    } else {
      dbMode = 'POSTGRES';
      console.log(`\x1b[32m[DB] Conectado exitosamente a PostgreSQL (Servidor: ${dbConfig.host})\x1b[0m`);
      
      // Ejecutar inicialización de esquema Postgres
      try {
        const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
        pgPool.query(schemaSql, (schemaErr) => {
          if (schemaErr) {
            console.error('[DB] Error al ejecutar schema.sql en Postgres:', schemaErr.message);
            connectionResolver();
          } else {
            console.log('[DB] Esquema e índices de PostgreSQL validados/creados.');
            
            // Sincronizar secuencias de claves primarias seriales en PostgreSQL para evitar colisiones
            const syncQueries = [
              "SELECT setval(pg_get_serial_sequence('roles', 'id'), COALESCE(max(id), 1)) FROM roles",
              "SELECT setval(pg_get_serial_sequence('categorias', 'id'), COALESCE(max(id), 1)) FROM categorias",
              "SELECT setval(pg_get_serial_sequence('clientes', 'id'), COALESCE(max(id), 1)) FROM clientes",
              "SELECT setval(pg_get_serial_sequence('proveedores', 'id'), COALESCE(max(id), 1)) FROM proveedores",
              "SELECT setval(pg_get_serial_sequence('productos', 'id'), COALESCE(max(id), 1)) FROM productos"
            ];
            
            Promise.all(syncQueries.map(q => pgPool.query(q)))
              .then(() => console.log('[DB] Secuencias de PostgreSQL sincronizadas con éxito.'))
              .catch(syncErr => console.warn('[DB] Advertencia al sincronizar secuencias:', syncErr.message))
              .finally(() => {
                // Insertar administrador base
                pgPool.query('SELECT id FROM usuarios WHERE username = $1', ['eleodoro'], (uErr, uRes) => {
                  if (uRes && uRes.rows.length === 0) {
                    const salt = bcrypt.genSaltSync(10);
                    const hash = bcrypt.hashSync('123456', salt);
                    pgPool.query(
                      'INSERT INTO usuarios (username, password_hash, nombre, email, rol_id, estado) VALUES ($1, $2, $3, $4, $5, $6)',
                      ['eleodoro', hash, 'Eleodoro El Grande', 'contacto@eleodoro.cl', 1, 'activo'],
                      () => {
                        connectionResolver();
                      }
                    );
                  } else {
                    connectionResolver();
                  }
                });
              });
          }
        });
      } catch (fErr) {
        console.error('Error al cargar schema.sql:', fErr);
        connectionResolver();
      }
    }
  });
}

initConnection();

// Wrapper universal para consultas (asíncrono con compuerta de conexión)
const query = async (text, params = []) => {
  // Esperar a que se complete la conexión inicial antes de ejecutar cualquier consulta
  await connectionPromise;

  if (dbMode === 'POSTGRES') {
    return pgPool.query(text, params);
  } else {
    return new Promise((resolve, reject) => {
      // Traducir marcadores Postgres ($1, $2) a marcadores SQLite (?)
      let sqliteText = text;
      let paramCount = 1;
      while (sqliteText.includes(`$${paramCount}`)) {
        sqliteText = sqliteText.replace(`$${paramCount}`, '?');
        paramCount++;
      }

      // SQLite no soporta "RETURNING *" en versiones antiguas o consultas no INSERT.
      // Si contiene "RETURNING", podemos quitarlo para SQLite y simular el retorno o hacer un select.
      const hasReturning = /returning\s+/i.test(sqliteText);
      let cleanText = sqliteText;
      if (hasReturning) {
        cleanText = sqliteText.replace(/returning\s+.*$/i, '');
      }

      // Determinar si es una consulta de lectura o escritura
      const isSelect = /^\s*select/i.test(cleanText);

      if (isSelect) {
        sqliteDb.all(cleanText, params, (err, rows) => {
          if (err) return reject(err);
          resolve({ rows, rowCount: rows.length });
        });
      } else {
        sqliteDb.run(cleanText, params, function (err) {
          if (err) return reject(err);
          
          // Si tenía RETURNING, intentamos obtener el registro insertado usando lastID
          if (hasReturning && this.lastID) {
            const tableMatch = cleanText.match(/into\s+(\w+)/i) || cleanText.match(/update\s+(\w+)/i);
            if (tableMatch) {
              const table = tableMatch[1];
              sqliteDb.all(`SELECT * FROM ${table} WHERE id = ?`, [this.lastID], (errSel, rows) => {
                if (errSel || rows.length === 0) {
                  resolve({ rows: [{ id: this.lastID }], rowCount: 1 });
                } else {
                  resolve({ rows: rows, rowCount: 1 });
                }
              });
              return;
            }
          }
          resolve({ rows: [{ id: this.lastID }], rowCount: this.changes, changes: this.changes });
        });
      }
    });
  }
};

module.exports = {
  query,
  getMode: () => dbMode,
  getPool: () => pgPool,
  getSqlite: () => sqliteDb
};
