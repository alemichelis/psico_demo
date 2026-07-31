const nodemailer = require('nodemailer');

const smtpConfigurado = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const transporter = smtpConfigurado
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    })
  : null;

// Sin SMTP configurado (ej. desarrollo local) el link queda en la consola del
// servidor en vez de perderse silenciosamente, así el flujo sigue siendo
// probable de punta a punta sin depender de credenciales de email.
async function enviarEmailRecuperacion(destinatario, nombre, resetUrl) {
  if (!transporter) {
    console.log('--- Email de recuperación (SMTP no configurado) ---');
    console.log(`Para: ${destinatario}`);
    console.log(`Link: ${resetUrl}`);
    console.log('----------------------------------------------------');
    return;
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: destinatario,
    subject: 'Recuperar acceso a Psique',
    text: `Hola ${nombre},\n\nPara elegir una nueva contraseña entrá a este link (válido por 1 hora):\n${resetUrl}\n\nSi no pediste esto, ignorá este mensaje.`
  });
}

module.exports = { enviarEmailRecuperacion };
