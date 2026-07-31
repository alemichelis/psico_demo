const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireProfesional } = require('../middleware');
const { enviarEmailRecuperacion } = require('../mailer');

const router = express.Router();

// Al menos 8 caracteres, una mayúscula y dos números en cualquier posición.
const PASSWORD_RE = /^(?=.*[A-Z])(?=(?:.*\d){2,}).{8,}$/;
const PASSWORD_MSG = 'La contraseña debe tener al menos 8 caracteres, una mayúscula y dos números.';
const RESET_VALIDEZ_MS = 60 * 60 * 1000; // 1 hora

function normEmail(s) { return String(s || '').trim().toLowerCase(); }
function normDni(s) { return String(s || '').trim().replace(/[.\s]/g, ''); }

router.get('/estado', (req, res) => {
  let sesion = null;
  if (req.session.tipo === 'profesional') {
    const p = db.prepare('SELECT id, nombre, email, max_pacientes FROM profesionales WHERE id = ?').get(req.session.profesionalId);
    if (p) sesion = { tipo: 'profesional', ...p };
  } else if (req.session.tipo === 'paciente') {
    const c = db.prepare('SELECT id, nombre, email FROM consultantes WHERE id = ?').get(req.session.pacienteId);
    if (c) sesion = { tipo: 'paciente', ...c };
  }
  res.json({ sesion });
});

// Alta libre: cualquiera puede crear su propia cuenta de profesional
// (cada una ve solo sus propios consultantes y turnos).
router.post('/profesional/registrar', (req, res) => {
  const { nombre, email, password } = req.body || {};
  if (!nombre || !email) return res.status(400).json({ error: 'Nombre y email son obligatorios' });
  if (!PASSWORD_RE.test(String(password || ''))) return res.status(400).json({ error: PASSWORD_MSG });

  const hash = bcrypt.hashSync(String(password), 10);
  try {
    const info = db.prepare('INSERT INTO profesionales (nombre, email, password_hash) VALUES (?, ?, ?)')
      .run(String(nombre).trim(), normEmail(email), hash);
    req.session.tipo = 'profesional';
    req.session.profesionalId = info.lastInsertRowid;
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Ya existe una cuenta con ese email.' });
    throw e;
  }
});

router.post('/profesional/login', (req, res) => {
  const { email, password } = req.body || {};
  const p = db.prepare('SELECT * FROM profesionales WHERE email = ?').get(normEmail(email));
  if (!p || !bcrypt.compareSync(String(password || ''), p.password_hash)) {
    return res.status(401).json({ error: 'Email o contraseña incorrectos' });
  }
  req.session.tipo = 'profesional';
  req.session.profesionalId = p.id;
  res.json({ ok: true });
});

// Respuesta genérica siempre (exista o no esa cuenta), para no revelar qué
// emails están registrados.
router.post('/profesional/olvide-password', async (req, res) => {
  const p = db.prepare('SELECT * FROM profesionales WHERE email = ?').get(normEmail(req.body && req.body.email));
  if (p) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    db.prepare('UPDATE profesionales SET reset_token = ?, reset_token_expira = ? WHERE id = ?')
      .run(tokenHash, String(Date.now() + RESET_VALIDEZ_MS), p.id);
    const resetUrl = `${req.protocol}://${req.get('host')}/?reset=${token}`;
    try { await enviarEmailRecuperacion(p.email, p.nombre, resetUrl); }
    catch (e) { console.error('Error enviando email de recuperación:', e); }
  }
  res.json({ ok: true });
});

router.post('/profesional/resetear-password', (req, res) => {
  const { token, password } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Falta el token de recuperación' });
  if (!PASSWORD_RE.test(String(password || ''))) return res.status(400).json({ error: PASSWORD_MSG });

  const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
  const p = db.prepare('SELECT * FROM profesionales WHERE reset_token = ?').get(tokenHash);
  if (!p || !p.reset_token_expira || Number(p.reset_token_expira) < Date.now()) {
    return res.status(400).json({ error: 'El link de recuperación es inválido o venció. Solicitá uno nuevo.' });
  }
  const hash = bcrypt.hashSync(String(password), 10);
  db.prepare('UPDATE profesionales SET password_hash = ?, reset_token = NULL, reset_token_expira = NULL WHERE id = ?').run(hash, p.id);
  res.json({ ok: true });
});

router.post('/paciente/login', (req, res) => {
  const { email, dni } = req.body || {};
  const e = normEmail(email), d = normDni(dni);
  if (!e || !d) return res.status(400).json({ error: 'Ingresá email y DNI' });

  const c = db.prepare(`SELECT * FROM consultantes WHERE LOWER(TRIM(email)) = ? AND REPLACE(REPLACE(TRIM(dni),'.',''),' ','') = ?`).get(e, d);
  if (!c) return res.status(401).json({ error: 'No encontramos una cuenta con ese email y DNI. Consultá a tu profesional.' });

  req.session.tipo = 'paciente';
  req.session.pacienteId = c.id;
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.post('/profesional/ampliar-plan', requireProfesional, (req, res) => {
  db.prepare('UPDATE profesionales SET max_pacientes = max_pacientes + 5 WHERE id = ?').run(req.session.profesionalId);
  const p = db.prepare('SELECT max_pacientes FROM profesionales WHERE id = ?').get(req.session.profesionalId);
  res.json({ ok: true, max_pacientes: p.max_pacientes });
});

module.exports = router;
