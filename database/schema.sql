-- Esquema de Base de Datos para Eleodoro El Grande Distribuidora
-- Diseñado para PostgreSQL

-- 1. Tabla de Roles
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) UNIQUE NOT NULL,
    descripcion TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de Usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE,
    rol_id INT REFERENCES roles(id) ON DELETE SET NULL,
    estado VARCHAR(20) DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla de Categorías
CREATE TABLE IF NOT EXISTS categorias (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL,
    descripcion TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabla de Proveedores
CREATE TABLE IF NOT EXISTS proveedores (
    id SERIAL PRIMARY KEY,
    rut_o_nit VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    contacto VARCHAR(100),
    telefono VARCHAR(50),
    email VARCHAR(100),
    direccion TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabla de Clientes
CREATE TABLE IF NOT EXISTS clientes (
    id SERIAL PRIMARY KEY,
    rut_o_nit VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    telefono VARCHAR(50),
    email VARCHAR(100),
    direccion TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Tabla de Productos
CREATE TABLE IF NOT EXISTS productos (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    sku VARCHAR(50) UNIQUE,
    codigo_barra VARCHAR(100) UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    categoria_id INT REFERENCES categorias(id) ON DELETE SET NULL,
    marca VARCHAR(100),
    proveedor_id INT REFERENCES proveedores(id) ON DELETE SET NULL,
    precio_costo DECIMAL(12,2) DEFAULT 0.00,
    precio_venta DECIMAL(12,2) DEFAULT 0.00,
    margen DECIMAL(5,2) DEFAULT 0.00,
    stock_actual INT DEFAULT 0,
    stock_minimo INT DEFAULT 5,
    imagen_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Tabla de Ventas (Encabezado)
CREATE TABLE IF NOT EXISTS ventas (
    id SERIAL PRIMARY KEY,
    folio VARCHAR(50) UNIQUE NOT NULL,
    fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
    cliente_id INT REFERENCES clientes(id) ON DELETE SET NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    iva DECIMAL(12,2) NOT NULL,
    total DECIMAL(12,2) NOT NULL,
    descuento DECIMAL(12,2) DEFAULT 0.00,
    observacion TEXT,
    sync_status VARCHAR(20) DEFAULT 'sin_sincronizar' CHECK (sync_status IN ('sincronizado', 'sin_sincronizar')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Tabla de Detalle de Ventas
CREATE TABLE IF NOT EXISTS detalle_ventas (
    id SERIAL PRIMARY KEY,
    venta_id INT REFERENCES ventas(id) ON DELETE CASCADE,
    producto_id INT REFERENCES productos(id) ON DELETE RESTRICT,
    cantidad INT NOT NULL CHECK (cantidad > 0),
    precio_unitario DECIMAL(12,2) NOT NULL,
    descuento DECIMAL(12,2) DEFAULT 0.00,
    subtotal DECIMAL(12,2) NOT NULL
);

-- 9. Tabla de Pagos
CREATE TABLE IF NOT EXISTS pagos (
    id SERIAL PRIMARY KEY,
    venta_id INT REFERENCES ventas(id) ON DELETE CASCADE,
    metodo VARCHAR(50) NOT NULL CHECK (metodo IN ('efectivo', 'debito', 'credito', 'transferencia', 'mixto')),
    monto DECIMAL(12,2) NOT NULL,
    detalle TEXT, -- JSON o texto indicando desglose para pago mixto
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. Tabla de Inventario (Consolidado)
CREATE TABLE IF NOT EXISTS inventario (
    id SERIAL PRIMARY KEY,
    producto_id INT REFERENCES productos(id) ON DELETE CASCADE UNIQUE,
    stock_actual INT DEFAULT 0,
    stock_minimo INT DEFAULT 5,
    ubicacion VARCHAR(100),
    ultima_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. Tabla de Movimientos de Inventario (Kardex)
CREATE TABLE IF NOT EXISTS movimientos_inventario (
    id SERIAL PRIMARY KEY,
    producto_id INT REFERENCES productos(id) ON DELETE CASCADE,
    tipo_movimiento VARCHAR(50) NOT NULL CHECK (tipo_movimiento IN ('ingreso_compra', 'ingreso_ajuste', 'egreso_venta', 'egreso_ajuste', 'egreso_perdida', 'egreso_merma', 'transferencia_entrada', 'transferencia_salida')),
    cantidad INT NOT NULL,
    motivo TEXT NOT NULL,
    usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. Tabla de Compras (ERP)
CREATE TABLE IF NOT EXISTS compras (
    id SERIAL PRIMARY KEY,
    folio_compra VARCHAR(50) UNIQUE NOT NULL,
    proveedor_id INT REFERENCES proveedores(id) ON DELETE SET NULL,
    fecha_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_recepcion TIMESTAMP,
    estado VARCHAR(50) DEFAULT 'pedido' CHECK (estado IN ('pedido', 'recibido', 'cancelado')),
    total DECIMAL(12,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 13. Tabla de Detalle de Compras
CREATE TABLE IF NOT EXISTS detalle_compras (
    id SERIAL PRIMARY KEY,
    compra_id INT REFERENCES compras(id) ON DELETE CASCADE,
    producto_id INT REFERENCES productos(id) ON DELETE RESTRICT,
    cantidad INT NOT NULL CHECK (cantidad > 0),
    precio_costo DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL
);

-- 14. Tabla de Reportes Guardados
CREATE TABLE IF NOT EXISTS reportes (
    id SERIAL PRIMARY KEY,
    tipo_reporte VARCHAR(50) NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    filtros TEXT,
    fecha_generacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ruta_archivo TEXT,
    usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL
);

-- 15. Tabla de Auditoría de Seguridad
CREATE TABLE IF NOT EXISTS auditoria (
    id SERIAL PRIMARY KEY,
    usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
    accion VARCHAR(100) NOT NULL,
    tabla_afectada VARCHAR(100) NOT NULL,
    registro_id INT,
    valor_anterior TEXT,
    valor_nuevo TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 16. Tabla de Logs de Sistema
CREATE TABLE IF NOT EXISTS logs (
    id SERIAL PRIMARY KEY,
    nivel VARCHAR(20) NOT NULL, -- 'INFO', 'WARNING', 'ERROR', 'FATAL'
    mensaje TEXT NOT NULL,
    contexto TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para optimizar velocidad de consultas
CREATE INDEX IF NOT EXISTS idx_productos_codigo_barra ON productos(codigo_barra);
CREATE INDEX IF NOT EXISTS idx_productos_codigo ON productos(codigo);
CREATE INDEX IF NOT EXISTS idx_ventas_folio ON ventas(folio);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha_hora);
CREATE INDEX IF NOT EXISTS idx_movimientos_producto ON movimientos_inventario(producto_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria(usuario_id);

-- Inserción de Roles Base
INSERT INTO roles (id, nombre, descripcion) VALUES
(1, 'Administrador', 'Control total de la plataforma ERP, POS y BI'),
(2, 'Supervisor', 'Autorización de descuentos, devoluciones y control de inventario'),
(3, 'Cajero', 'Venta en POS, registro de cobros y arqueos de caja'),
(4, 'Bodega', 'Recepción de compras, despachos, ajustes y mermas'),
(5, 'Gerencia', 'Visualización de reportes ejecutivos, indicadores BI y análisis')
ON CONFLICT (id) DO NOTHING;

-- Inserción de Categorías Iniciales
INSERT INTO categorias (id, nombre, descripcion) VALUES
(1, 'Licores y Destilados', 'Pisco, Ron, Vodka, Whisky, Gin, Tequila'),
(2, 'Cervezas', 'Cervezas nacionales, artesanales e importadas'),
(3, 'Vinos y Espumantes', 'Vinos tintos, blancos, espumantes y sidras'),
(4, 'Bebidas Analcohólicas', 'Gaseosas, bebidas energéticas, aguas y jugos'),
(5, 'Snacks y Abarrotes', 'Papas fritas, frutos secos, galletas y confites')
ON CONFLICT (id) DO NOTHING;

-- Inserción de Clientes Iniciales
INSERT INTO clientes (id, rut_o_nit, nombre, telefono, email, direccion) VALUES
(1, '77.777.777-7', 'Cliente General / Boleta', '+56900000000', 'general@eleodorodistribuidora.cl', 'Punto de Venta Presencial'),
(2, '11.111.111-1', 'Botillería El Faro', '+56987654321', 'elfaro@gmail.com', 'Av. Alemania 450, Santiago'),
(3, '22.222.222-2', 'Restobar Don Eleodoro', '+56999887766', 'doneleodoro@restobar.cl', 'Calle Central 1022, Valparaíso')
ON CONFLICT (id) DO NOTHING;

-- Inserción de Proveedores Iniciales
INSERT INTO proveedores (id, rut_o_nit, nombre, contacto, telefono, email, direccion) VALUES
(1, '99.999.999-9', 'Compañía de Cervecerías Unidas (CCU)', 'Juan Pérez', '+5622345678', 'contacto@ccu.cl', 'Vitacura 3568, Santiago'),
(2, '88.888.888-8', 'Viña Concha y Toro', 'María González', '+5622876543', 'ventas@conchaytoro.cl', 'Pirque 120, Santiago'),
(3, '55.555.555-5', 'Distribuidora Andina', 'Pedro Flores', '+5622999888', 'contacto@andina.cl', 'Renca 400, Santiago')
ON CONFLICT (id) DO NOTHING;

-- Inserción de Productos Iniciales (Bebidas, Licores, Consumo Masivo)
-- Nota: Contraseñas de usuario serán creadas e insertadas en la inicialización de la DB para incluir bcrypt
INSERT INTO productos (id, codigo, sku, codigo_barra, nombre, descripcion, categoria_id, marca, proveedor_id, precio_costo, precio_venta, margen, stock_actual, stock_minimo) VALUES
(1, 'PROD001', 'SKU-PIS-MIST-35', '7802100001012', 'Pisco Mistral 35° 1L', 'Pisco añejado en roble americano', 1, 'Mistral', 3, 4500.00, 6990.00, 55.33, 45, 10),
(2, 'PROD002', 'SKU-CER-HEIN-6P', '8712000025016', 'Pack Cerveza Heineken Lata 6x350cc', 'Pack de 6 latas de cerveza lager lager premium', 2, 'Heineken', 1, 3200.00, 4990.00, 55.94, 120, 15),
(3, 'PROD003', 'SKU-VIN-CYT-CS', '7804320753018', 'Vino Casillero del Diablo Cabernet Sauvignon 750cc', 'Vino tinto reserva', 3, 'Concha y Toro', 2, 2800.00, 4490.00, 60.36, 60, 12),
(4, 'PROD004', 'SKU-BEB-COKE-25', '7801620001234', 'Bebida Coca Cola Original 2.5L', 'Gaseosa sabor original pet desechable', 4, 'Coca Cola', 3, 1100.00, 1890.00, 71.82, 200, 30),
(5, 'PROD005', 'SKU-BEB-RED-BUL', '9002490100070', 'Bebida Energética Red Bull 250cc', 'Bebida energética estimulante de taurina', 4, 'Red Bull', 3, 950.00, 1690.00, 77.89, 150, 20),
(6, 'PROD006', 'SKU-SNA-KRY-PAP', '7802220004567', 'Papas Fritas Kryzpo Original 130g', 'Snack papas fritas tarro', 5, 'Kryzpo', 3, 850.00, 1490.00, 75.29, 80, 10)
ON CONFLICT (id) DO NOTHING;

-- Vincular productos al Inventario
INSERT INTO inventario (producto_id, stock_actual, stock_minimo, ubicacion) VALUES
(1, 45, 10, 'Pasillo A - Estante 2'),
(2, 120, 15, 'Cámara Frío 1'),
(3, 60, 12, 'Pasillo B - Estante 1'),
(4, 200, 30, 'Bodega Central Secos'),
(5, 150, 20, 'Cámara Frío 2'),
(6, 80, 10, 'Pasillo C - Estante 4')
ON CONFLICT (producto_id) DO NOTHING;
