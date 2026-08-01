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

// Endpoint único para editar disponibilidad: activa o desactiva un tramo
// horario de un día, fusionando franjas contiguas al activar y partiendo
// franjas existentes al desactivar, para que nunca queden rangos superpuestos
// o innecesariamente fragmentados. Devuelve la disponibilidad completa ya
// actualizada, así el cliente repinta sin pedir un GET aparte.
router.post('/toggle', requireProfesional, (req, res) => {
  const { dia_semana, hora_inicio, hora_fin, activar } = req.body || {};
  const dia = Number(dia_semana);
  if (!Number.isInteger(dia) || dia < 0 || dia > 6) return res.status(400).json({ error: 'Día inválido' });
  if (!HORA_RE.test(hora_inicio) || !HORA_RE.test(hora_fin) || hora_inicio >= hora_fin) {
    return res.status(400).json({ error: 'Rango horario inválido' });
  }
  if (hora_inicio < HORA_MIN || hora_fin > HORA_MAX) {
    return res.status(400).json({ error: `El horario debe estar entre ${HORA_MIN} y ${HORA_MAX}` });
  }

  const profesionalId = req.session.profesionalId;
  const existentes = db.prepare('SELECT * FROM disponibilidad WHERE profesional_id = ? AND dia_semana = ? ORDER BY hora_inicio')
    .all(profesionalId, dia);
  const borrar = db.prepare('DELETE FROM disponibilidad WHERE id = ?');
  const crear = db.prepare('INSERT INTO disponibilidad (profesional_id, dia_semana, hora_inicio, hora_fin) VALUES (?, ?, ?, ?)');

  const aplicar = db.transaction(() => {
    if (activar) {
      let nuevoInicio = hora_inicio, nuevoFin = hora_fin;
      for (const r of existentes) {
        const tocaOSolapa = r.hora_inicio <= nuevoFin && r.hora_fin >= nuevoInicio;
        if (tocaOSolapa) {
          if (r.hora_inicio < nuevoInicio) nuevoInicio = r.hora_inicio;
          if (r.hora_fin > nuevoFin) nuevoFin = r.hora_fin;
          borrar.run(r.id);
        }
      }
      crear.run(profesionalId, dia, nuevoInicio, nuevoFin);
    } else {
      for (const r of existentes) {
        const sinSolape = r.hora_inicio >= hora_fin || r.hora_fin <= hora_inicio;
        if (sinSolape) continue;
        borrar.run(r.id);
        if (r.hora_inicio < hora_inicio) crear.run(profesionalId, dia, r.hora_inicio, hora_inicio);
        if (r.hora_fin > hora_fin) crear.run(profesionalId, dia, hora_fin, r.hora_fin);
      }
    }
  });
  aplicar();

  res.json(db.prepare('SELECT * FROM disponibilidad WHERE profesional_id = ? ORDER BY dia_semana, hora_inicio').all(profesionalId));
});

router.get('/horarios', requirePaciente, (req, res) => {
  const fecha = req.query.fecha;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return res.status(400).json({ error: 'Fecha inválida' });
  const consultante = db.prepare('SELECT profesional_id FROM consultantes WHERE id = ?').get(req.session.pacienteId);
  res.json(calcularSlotsDisponibles(consultante.profesional_id, fecha));
});

module.exports = router;
