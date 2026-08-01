const express = require('express');
const db = require('../db');
const { requireProfesional, requirePaciente } = require('../middleware');
const { HORA_RE, HORA_MIN, HORA_MAX, calcularSlotsDisponibles } = require('../disponibilidad');

const router = express.Router();

router.get('/', requireProfesional, (req, res) => {
  const rangos = db.prepare('SELECT * FROM disponibilidad WHERE profesional_id = ? ORDER BY dia_semana, hora_inicio')
    .all(req.session.profesionalId);
  res.json(rangos);
});

router.post('/', requireProfesional, (req, res) => {
  const { dia_semana, hora_inicio, hora_fin } = req.body || {};
  const dia = Number(dia_semana);
  if (!Number.isInteger(dia) || dia < 0 || dia > 6) return res.status(400).json({ error: 'Día inválido' });
  if (!HORA_RE.test(hora_inicio) || !HORA_RE.test(hora_fin)) {
    return res.status(400).json({ error: 'El horario debe estar en punto o y media (ej: 09:00, 09:30)' });
  }
  if (hora_inicio < HORA_MIN || hora_fin > HORA_MAX || hora_inicio >= hora_fin) {
    return res.status(400).json({ error: `El horario debe estar entre ${HORA_MIN} y ${HORA_MAX}, y el fin debe ser posterior al inicio` });
  }
  const info = db.prepare('INSERT INTO disponibilidad (profesional_id, dia_semana, hora_inicio, hora_fin) VALUES (?, ?, ?, ?)')
    .run(req.session.profesionalId, dia, hora_inicio, hora_fin);
  res.json(db.prepare('SELECT * FROM disponibilidad WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/:id', requireProfesional, (req, res) => {
  const row = db.prepare('SELECT id FROM disponibilidad WHERE id = ? AND profesional_id = ?').get(req.params.id, req.session.profesionalId);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  db.prepare('DELETE FROM disponibilidad WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/horarios', requirePaciente, (req, res) => {
  const fecha = req.query.fecha;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return res.status(400).json({ error: 'Fecha inválida' });
  const consultante = db.prepare('SELECT profesional_id FROM consultantes WHERE id = ?').get(req.session.pacienteId);
  res.json(calcularSlotsDisponibles(consultante.profesional_id, fecha));
});

module.exports = router;
