function requireProfesional(req, res, next) {
  if (req.session && req.session.tipo === 'profesional') return next();
  return res.status(401).json({ error: 'Sesion de profesional requerida' });
}

function requirePaciente(req, res, next) {
  if (req.session && req.session.tipo === 'paciente') return next();
  return res.status(401).json({ error: 'Sesion de paciente requerida' });
}

module.exports = { requireProfesional, requirePaciente };
