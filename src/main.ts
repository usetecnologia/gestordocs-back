import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { envs } from './config/envs';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Express 5 usa por defecto el parser "simple" de querystring, que no soporta la
  // notación de arrays `foo[]=1&foo[]=2` (Express 4 usaba "extended"/qs). Se restaura
  // "extended" para que los query params tipo array sigan funcionando como antes.
  app.getHttpAdapter().getInstance().set('query parser', 'extended');

  app.enableCors({
    origin: envs.ALLOWED_ORIGINS?.split(',') ?? true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition', 'X-Skipped-Participants'],
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalInterceptors(new LoggingInterceptor(), new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerBuilder = new DocumentBuilder()
    .setTitle(envs.APP_NAME)
    .setDescription(
      `## API REST — ${envs.APP_NAME}\n\n` +
        'Documentación completa de todos los endpoints disponibles.\n\n' +
        '### Autenticación\nUsa **Bearer Token** (JWT) en el header `Authorization`.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      'access-token',
    )
    .addServer(`http://localhost:${envs.PORT}`, 'Local');

  if (envs.APP_URL) {
    swaggerBuilder.addServer(envs.APP_URL, 'Producción');
  }

  const swaggerConfig = swaggerBuilder
    .addTag('auth', 'Autenticación y autorización')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: `${envs.APP_NAME} — Docs`,
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
    },
  });

  await app.listen(envs.PORT);

  if (envs.NODE_ENV !== 'production') {
    console.log(`\n🚀 App running on: http://localhost:${envs.PORT}`);
    console.log(`📄 Swagger docs:   http://localhost:${envs.PORT}/docs\n`);
  }
}

bootstrap().catch((err) => {
  console.error('❌ Failed to start application:', err);
  process.exit(1);
});
