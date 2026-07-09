export function documentsObservedTemplate(params: {
  documents: string[];
  frontendUrl: string;
  appName: string;
}): string {
  const { documents, frontendUrl, appName } = params;

  const documentsList = documents
    .map((doc) => `<li style="margin-bottom: 8px;">${doc}</li>`)
    .join('');

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Tienes documentos observados</title>
</head>
<body style="font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px;">
  <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 8px; padding: 32px;">
    <h2 style="color: #ef4444;">Tienes documentos observados</h2>
    <p>Hola,</p>
    <p>La lista de documentos observados son:</p>
    <ul style="color: #333; font-size: 15px; padding-left: 20px;">
      ${documentsList}
    </ul>
    <p>Ingresa a tu cuenta para poder validar los documentos.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${frontendUrl}/login"
         style="background: #ef4444; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-size: 16px;">
        Ingresar a mi cuenta
      </a>
    </div>
    <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
    <p style="color: #999; font-size: 12px;">El equipo de ${appName}</p>
  </div>
</body>
</html>
  `.trim();
}
