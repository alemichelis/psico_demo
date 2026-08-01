const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'psico.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS profesionales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    max_pacientes INTEGER NOT NULL DEFAULT 5,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS consultantes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profesional_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    edad INTEGER,
    email TEXT,
    dni TEXT,
    telefono TEXT,
    localidad TEXT,
    observaciones TEXT,
    creado_en TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (profesional_id) REFERENCES profesionales(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_consultante_login
    ON consultantes(profesional_id, email, dni)
    WHERE email IS NOT NULL AND email != '' AND dni IS NOT NULL AND dni != '';

  CREATE TABLE IF NOT EXISTS agenda (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    consultante_id INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    horario TEXT,
    costo REAL,
    anotaciones TEXT,
    link_reunion TEXT,
    creado_por TEXT NOT NULL DEFAULT 'profesional',
    creado_en TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (consultante_id) REFERENCES consultantes(id) ON DELETE CASCADE
  );

  -- Franjas horarias semanales recurrentes en las que el profesional ofrece
  -- turnos (ej: "todos los lunes de 09:00 a 13:00"). dia_semana: 0=domingo.
  CREATE TABLE IF NOT EXISTS disponibilidad (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profesional_id INTEGER NOT NULL,
    dia_semana INTEGER NOT NULL,
    hora_inicio TEXT NOT NULL,
    hora_fin TEXT NOT NULL,
    creado_en TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (profesional_id) REFERENCES profesionales(id) ON DELETE CASCADE
  );
`);

// Migración: agrega columnas para recuperación de contraseña si la base ya
// existía de antes (CREATE TABLE IF NOT EXISTS no altera tablas existentes).
const columnasProfesionales = db.prepare("PRAGMA table_info(profesionales)").all().map(c => c.name);
if (!columnasProfesionales.includes('reset_token')) {
  db.exec('ALTER TABLE profesionales ADD COLUMN reset_token TEXT');
}
if (!columnasProfesionales.includes('reset_token_expira')) {
  db.exec('ALTER TABLE profesionales ADD COLUMN reset_token_expira TEXT');
}

module.exports = db;
