const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireProfesional } = require('../middleware');

const router = express.Router();

function normEmail(s) { return String(s || '').trim().toLowerCase(); }
function normDni(s) { return String(s || '').trim().replace(/[.\s]/g, ''); }

router.get('/estado', (req, res) => {
  const hayProfesional = db.prepare('SELECT COUNT(*) n FROM profesionales').get().n > 0;
  let sesion = null;
  if (req.session.tipo === 'profesional') {
    const p = db.prepare('SELECT id, nombre, email, max_pacientes FROM profesionales WHERE id = ?').get(req.session.profesionalId);
    if (p) sesion = { tipo: 'profesional', ...p };
  } else if (req.session.tipo === 'paciente') {
    const c = db.prepare('SELECT id, nombre, email FROM consultantes WHERE id = ?').get(req.session.pacienteId);
    if (c) sesion = { tipo: 'paciente', ...c };
  }
  res.json({ setupRequerido: !hayProfesional, sesion });
});

// Bootstrap: solo funciona si todavia no existe ningun profesional.
router.post('/profesional/registrar', (req, res) => {
  const hayProfesional = db.prepare('SELECT COUNT(*) n FROM profesionales').get().n > 0;
  if (hayProfesional) return res.status(403).json({ error: 'Ya existe una cuenta de profesional. Iniciá sesión.' });

  const { nombre, email, password } = req.body || {};
  if (!nombre || !email || !password || String(password).length < 6) {
    return res.status(400).json({ error: 'Nombre, email y una contraseña de al menos 6 caracteres son obligatorios' });
  }
  const hash = bcrypt.hashSync(String(password), 10);
  const info = db.prepare('INSERT INTO profesionales (nombre, email, password_hash) VALUES (?, ?, ?)')
    .run(String(nombre).trim(), normEmail(email), hash);

  req.session.tipo = 'profesional';
  req.session.profesionalId = info.lastInsertRowid;
  res.json({ ok: true, id: info.lastInsertRowid });
});

// Vía de recuperación: si todavía no se cargó ningún consultante, permite
// reiniciar la cuenta de profesional (ej. si se erró el email/contraseña en
// el alta inicial). Una vez que hay datos reales, queda bloqueado para no
// arriesgar información cargada.
router.post('/profesional/reiniciar', (req, res) => {
  const totalConsultantes = db.prepare('SELECT COUNT(*) n FROM consultantes').get().n;
  if (totalConsultantes > 0) {
    return res.status(403).json({ error: 'Ya hay consultantes cargados; no se puede reiniciar la cuenta por esta vía.' });
  }
  db.prepare('DELETE FROM profesionales').run();
  req.session.destroy(() => res.json({ ok: true }));
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
