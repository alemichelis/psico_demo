const path = require('path');
const express = require('express');
const session = require('express-session');

const authRoutes = require('./routes/auth');
const consultantesRoutes = require('./routes/consultantes');
const agendaRoutes = require('./routes/agenda');

const app = express();
const PORT = process.env.PORT || 3001;
const RAIZ = path.join(__dirname, '..'); // carpeta del proyecto, un nivel arriba de /backend

app.use(express.json());
app.use(session({
  name: 'psico.sid',
  secret: process.env.SESSION_SECRET || 'cambiar-este-secreto-en-produccion',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

app.use('/api/auth', authRoutes);
app.use('/api/consultantes', consultantesRoutes);
app.use('/api/agenda', agendaRoutes);

// Frontends estáticos: viven en la raíz del proyecto para no moverlos del lugar
// donde ya se estaban editando. Solo se exponen estos dos archivos puntuales
// (no toda la carpeta), así el backend (server.js, db.js, psico.sqlite) nunca
// queda accesible por HTTP.
app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(RAIZ, 'index.html')));
app.get(['/paciente', '/paciente.html'], (req, res) => res.sendFile(path.join(RAIZ, 'paciente.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`Backend escuchando en http://localhost:${PORT}`);
  console.log(`  Profesional: http://localhost:${PORT}/`);
  console.log(`  Paciente:    http://localhost:${PORT}/paciente`);
});
