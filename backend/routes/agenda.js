const express = require('express');
const db = require('../db');
const { requireProfesional, requirePaciente } = require('../middleware');
const { calcularSlotsDisponibles } = require('../disponibilidad');

const router = express.Router();

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^\d{2}:\d{2}$/;

function agendaConNombre(where, params) {
  return db.prepare(`
    SELECT a.*, c.nombre AS consultante_nombre
    FROM agenda a JOIN consultantes c ON c.id = a.consultante_id
    WHERE ${where}
    ORDER BY a.fecha, a.horario
  `).all(...params);
}

// ---------- lado profesional ----------
router.get('/', requireProfesional, (req, res) => {
  const filtro = req.query.consultante_id;
  let rows = agendaConNombre('c.profesional_id = ?', [req.session.profesionalId]);
  if (filtro) rows = rows.filter(r => String(r.consultante_id) === String(filtro));
  res.json(rows);
});

// Crea una o varias citas (recurrencia) de una sola vez. El cálculo de fechas
// recurrentes (misma día de la semana) se hace en el cliente y se manda ya
// resuelto como lista de fechas, para no duplicar esa lógica en dos lugares.
router.post('/lote', requireProfesional, (req, res) => {
  const { consultante_id, fechas, horario, costo, link_reunion, anotaciones } = req.body || {};
  const cons = db.prepare('SELECT id FROM consultantes WHERE id = ? AND profesional_id = ?').get(consultante_id, req.session.profesionalId);
  if (!cons) return res.status(404).json({ error: 'Consultante no encontrado' });
  if (!Array.isArray(fechas) || !fechas.length || fechas.some(f => !FECHA_RE.test(f))) {
    return res.status(400).json({ error: 'Fechas inválidas' });
  }
  if (horario && !HORA_RE.test(horario)) return res.status(400).json({ error: 'Horario inválido' });

  const insertar = db.prepare(`INSERT INTO agenda (consultante_id, fecha, horario, costo, link_reunion, anotaciones, creado_por)
    VALUES (?, ?, ?, ?, ?, ?, 'profesional')`);
  const ids = db.transaction((lista) => lista.map(f =>
    insertar.run(consultante_id, f, horario || null, costo === '' || costo == null ? null : Number(costo), link_reunion || null, anotaciones || '').lastInsertRowid
  ))(fechas);

  res.json(agendaConNombre(`a.id IN (${ids.map(() => '?').join(',')})`, ids));
});

router.put('/:id', requireProfesional, (req, res) => {
  const row = db.prepare(`SELECT a.id FROM agenda a JOIN consultantes c ON c.id=a.consultante_id
    WHERE a.id=? AND c.profesional_id=?`).get(req.params.id, req.session.profesionalId);
  if (!row) return res.status(404).json({ error: 'No encontrado' });

  const { fecha, horario, costo, anotaciones, link_reunion, consultante_id } = req.body || {};
  if (fecha && !FECHA_RE.test(fecha)) return res.status(400).json({ error: 'Fecha inválida' });
  if (horario && !HORA_RE.test(horario)) return res.status(400).json({ error: 'Horario inválido' });

  let nuevoConsultanteId = null;
  if (consultante_id) {
    const c = db.prepare('SELECT id FROM consultantes WHERE id=? AND profesional_id=?').get(consultante_id, req.session.profesionalId);
    if (!c) return res.status(404).json({ error: 'Consultante no encontrado' });
    nuevoConsultanteId = c.id;
  }

  const actual = db.prepare('SELECT * FROM agenda WHERE id=?').get(req.params.id);
  db.prepare(`UPDATE agenda SET consultante_id=?, fecha=?, horario=?, costo=?, anotaciones=?, link_reunion=? WHERE id=?`).run(
    nuevoConsultanteId || actual.consultante_id,
    fecha || actual.fecha,
    horario !== undefined ? (horario || null) : actual.horario,
    costo !== undefined ? (costo === '' || costo == null ? null : Number(costo)) : actual.costo,
    anotaciones !== undefined ? anotaciones : actual.anotaciones,
    link_reunion !== undefined ? (link_reunion || null) : actual.link_reunion,
    req.params.id
  );
  res.json(agendaConNombre('a.id = ?', [req.params.id])[0]);
});

router.delete('/:id', requireProfesional, (req, res) => {
  const row = db.prepare(`SELECT a.id FROM agenda a JOIN consultantes c ON c.id=a.consultante_id
    WHERE a.id=? AND c.profesional_id=?`).get(req.params.id, req.session.profesionalId);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  db.prepare('DELETE FROM agenda WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- lado paciente ----------
router.get('/mias', requirePaciente, (req, res) => {
  res.json(agendaConNombre('a.consultante_id = ?', [req.session.pacienteId]));
});

router.post('/mias', requirePaciente, (req, res) => {
  const { fecha, horario } = req.body || {};
  if (!fecha || !FECHA_RE.test(fecha)) return res.status(400).json({ error: 'Fecha inválida' });
  if (!horario || !HORA_RE.test(horario)) return res.status(400).json({ error: 'Elegí un horario' });

  // Se revalida contra la disponibilidad real del profesional (no alcanza con
  // que el front solo ofrezca horarios libres: alguien podría pedir cualquier
  // horario pegándole directo a la API).
  const consultante = db.prepare('SELECT profesional_id FROM consultantes WHERE id = ?').get(req.session.pacienteId);
  const disponibles = calcularSlotsDisponibles(consultante.profesional_id, fecha);
  if (!disponibles.includes(horario)) {
    return res.status(409).json({ error: 'Ese horario ya no está disponible. Elegí otro.' });
  }

  const info = db.prepare(`INSERT INTO agenda (consultante_id, fecha, horario, costo, link_reunion, anotaciones, creado_por)
    VALUES (?, ?, ?, NULL, NULL, '', 'paciente')`).run(req.session.pacienteId, fecha, horario);
  res.json(agendaConNombre('a.id = ?', [info.lastInsertRowid])[0]);
});

router.delete('/mias/:id', requirePaciente, (req, res) => {
  const row = db.prepare('SELECT id FROM agenda WHERE id=? AND consultante_id=?').get(req.params.id, req.session.pacienteId);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  db.prepare('DELETE FROM agenda WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
