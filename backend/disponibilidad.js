const db = require('./db');

const HORA_RE = /^([01]\d|2[0-3]):(00|30)$/;
const HORA_MIN = '07:00';
const HORA_MAX = '23:00';

function minutosDesdeMedianoche(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function hhmmDesdeMinutos(min) {
  const h = String(Math.floor(min / 60)).padStart(2, '0');
  const m = String(min % 60).padStart(2, '0');
  return `${h}:${m}`;
}
function fechaLocalHoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Turnos de 30 minutos entre horaInicio (inclusive) y horaFin (exclusive).
function generarSlots(horaInicio, horaFin) {
  const slots = [];
  const fin = minutosDesdeMedianoche(horaFin);
  for (let m = minutosDesdeMedianoche(horaInicio); m < fin; m += 30) slots.push(hhmmDesdeMinutos(m));
  return slots;
}

// Turnos libres de un profesional en una fecha puntual: unión de sus franjas
// semanales para ese día de la semana, menos los horarios ya ocupados en la
// agenda (de cualquiera de sus consultantes) para esa fecha exacta. No hay
// duración de sesión modelada en la base, así que el choque se detecta por
// coincidencia exacta de horario, igual que el resto de la agenda.
function calcularSlotsDisponibles(profesionalId, fecha) {
  const diaSemana = new Date(fecha + 'T00:00:00').getDay();
  const rangos = db.prepare('SELECT hora_inicio, hora_fin FROM disponibilidad WHERE profesional_id = ? AND dia_semana = ?')
    .all(profesionalId, diaSemana);

  const libres = new Set();
  rangos.forEach(r => generarSlots(r.hora_inicio, r.hora_fin).forEach(s => libres.add(s)));

  const ocupados = db.prepare(`
    SELECT a.horario FROM agenda a JOIN consultantes c ON c.id = a.consultante_id
    WHERE c.profesional_id = ? AND a.fecha = ? AND a.horario IS NOT NULL
  `).all(profesionalId, fecha);
  ocupados.forEach(o => libres.delete(o.horario));

  if (fecha === fechaLocalHoy()) {
    const ahora = new Date();
    const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
    for (const s of [...libres]) if (minutosDesdeMedianoche(s) <= minutosAhora) libres.delete(s);
  }

  return [...libres].sort();
}

module.exports = { HORA_RE, HORA_MIN, HORA_MAX, generarSlots, calcularSlotsDisponibles };
