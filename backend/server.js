const path = require('path');
const express = require('express');
const session = require('express-session');

const authRoutes = require('./routes/auth');
const consultantesRoutes = require('./routes/consultantes');
const agendaRoutes = require('./routes/agenda');
const disponibilidadRoutes = require('./routes/disponibilidad');

const app = express();
const PORT = process.env.PORT || 3001;
const RAIZ = __dirname; // los frontends viven junto al server, así todo queda autocontenido en /backend
const isProd = process.env.NODE_ENV === 'production';

// En Hostinger (y en cualquier PaaS) el TLS lo termina el proxy de la
// plataforma; la app recibe tráfico HTTP plano puertas adentro. trust proxy
// hace que Express confíe en el header X-Forwarded-Proto para saber que la
// conexión original era HTTPS, y así la cookie "secure" funcione.
app.set('trust proxy', 1);

app.use(express.json());
app.use(session({
  name: 'psico.sid',
  secret: process.env.SESSION_SECRET || 'cambiar-este-secreto-en-produccion',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

app.use('/api/auth', authRoutes);
app.use('/api/consultantes', consultantesRoutes);
app.use('/api/agenda', agendaRoutes);
app.use('/api/disponibilidad', disponibilidadRoutes);

// Frontends estáticos: solo se exponen estos dos archivos puntuales (no toda
// la carpeta), así db.js, server.js y psico.sqlite nunca quedan accesibles
// por HTTP aunque compartan directorio con ellos.
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
