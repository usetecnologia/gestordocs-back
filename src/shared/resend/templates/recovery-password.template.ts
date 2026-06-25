export function recoveryPasswordTemplate(params: {
  name: string;
  token: string;
  frontendUrl: string;
}): string {
  const { name, token, frontendUrl } = params;
  const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Recuperación de contraseña</title>
</head>
<body style="font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px;">
  <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 8px; padding: 32px;">
    <h2 style="color: #333;">Recuperación de contraseña</h2>
    <p>Hola <strong>${name}</strong>,</p>
    <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta. Usa el siguiente botón para continuar:</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${resetUrl}"
         style="background: #4f46e5; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-size: 16px;">
        Restablecer contraseña
      </a>
    </div>
    <p style="color: #666; font-size: 14px;">Este enlace expira en 15 minutos. Si no solicitaste este cambio, ignora este correo.</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
    <p style="color: #999; font-size: 12px;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br />${resetUrl}</p>
  </div>
</body>
</html>
  `.trim();
}
