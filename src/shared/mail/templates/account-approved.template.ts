export function accountApprovedTemplate(params: {
  name: string;
  appName: string;
  frontendUrl: string;
}): string {
  const { name, appName, frontendUrl } = params;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Cuenta aprobada</title>
</head>
<body style="font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px;">
  <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 8px; padding: 32px;">
    <h2 style="color: #22c55e;">¡Tu cuenta ha sido aprobada!</h2>
    <p>Hola <strong>${name}</strong>,</p>
    <p>Nos complace informarte que tu cuenta en <strong>${appName}</strong> ha sido aprobada. Ya puedes iniciar sesión y comenzar a usar la plataforma.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${frontendUrl}/login"
         style="background: #22c55e; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-size: 16px;">
        Iniciar sesión
      </a>
    </div>
    <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
    <p style="color: #999; font-size: 12px;">El equipo de ${appName}</p>
  </div>
</body>
</html>
  `.trim();
}
