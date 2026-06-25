export function welcomeReviewTemplate(params: {
  name: string;
  appName: string;
}): string {
  const { name, appName } = params;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Cuenta en revisión</title>
</head>
<body style="font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px;">
  <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 8px; padding: 32px;">
    <h2 style="color: #333;">Bienvenido a ${appName}</h2>
    <p>Hola <strong>${name}</strong>,</p>
    <p>Gracias por registrarte. Tu cuenta está siendo revisada por nuestro equipo.</p>
    <p>Te notificaremos por correo una vez que tu cuenta sea aprobada y puedas comenzar a usar la plataforma.</p>
    <p style="color: #666; font-size: 14px;">Si tienes dudas, no dudes en contactarnos.</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
    <p style="color: #999; font-size: 12px;">El equipo de ${appName}</p>
  </div>
</body>
</html>
  `.trim();
}
