const express = require('express');
const db = require('../db');
const { requireProfesional } = require('../middleware');

const router = express.Router();
router.use(requireProfesional);

router.get('/', (req, res) => {
  const list = db.prepare('SELECT * FROM consultantes WHERE profesional_id = ? ORDER BY nombre COLLATE NOCASE')
    .all(req.session.profesionalId);
  res.json(list);
});

router.post('/', (req, res) => {
  const { nombre, edad, email, dni, telefono, localidad, observaciones } = req.body || {};
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });

  const prof = db.prepare('SELECT max_pacientes FROM profesionales WHERE id = ?').get(req.session.profesionalId);
  const actuales = db.prepare('SELECT COUNT(*) n FROM consultantes WHERE profesional_id = ?').get(req.session.profesionalId).n;
  if (actuales >= prof.max_pacientes) return res.status(403).json({ error: 'PAYWALL', max_pacientes: prof.max_pacientes });

  try {
    const info = db.prepare(`INSERT INTO consultantes (profesional_id, nombre, edad, email, dni, telefono, localidad, observaciones)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(req.session.profesionalId, String(nombre).trim(), edad || null, email || null, dni || null, telefono || null, localidad || null, observaciones || null);
    const creado = db.prepare('SELECT * FROM consultantes WHERE id = ?').get(info.lastInsertRowid);
    res.json(creado);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Ya existe un consultante con ese email y DNI' });
    throw e;
  }
});

router.put('/:id', (req, res) => {
  const existente = db.prepare('SELECT * FROM consultantes WHERE id = ? AND profesional_id = ?').get(req.params.id, req.session.profesionalId);
  if (!existente) return res.status(404).json({ error: 'No encontrado' });

  const { nombre, edad, email, dni, telefono, localidad, observaciones } = req.body || {};
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });

  try {
    db.prepare(`UPDATE consultantes SET nombre=?, edad=?, email=?, dni=?, telefono=?, localidad=?, observaciones=? WHERE id=?`)
      .run(String(nombre).trim(), edad || null, email || null, dni || null, telefono || null, localidad || null, observaciones || null, req.params.id);
    res.json(db.prepare('SELECT * FROM consultantes WHERE id = ?').get(req.params.id));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Ya existe un consultante con ese email y DNI' });
    throw e;
  }
});

router.delete('/:id', (req, res) => {
  const existente = db.prepare('SELECT id FROM consultantes WHERE id = ? AND profesional_id = ?').get(req.params.id, req.session.profesionalId);
  if (!existente) return res.status(404).json({ error: 'No encontrado' });
  db.prepare('DELETE FROM consultantes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
