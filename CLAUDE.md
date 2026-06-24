# Backend NestJS — Arquitectura y Reglas del Proyecto

## Stack
- **Framework**: NestJS 11
- **ORM**: Prisma v7 (`prisma-client`, driver adapter MariaDB)
- **Base de datos**: MariaDB (MySQL-compatible)
- **Cache / Redis**: `@nestjs/cache-manager` + `@keyv/redis` + `keyv`
- **Hashing**: `bcrypt` vía `BcryptService` (12 rounds)
- **Correo**: Nodemailer vía `MailService`
- **Imágenes**: Cloudinary vía `CloudinaryService`
- **Validación de env**: Zod v4
- **Documentación**: Swagger (`@nestjs/swagger`)
- **Lenguaje**: TypeScript estricto
- **Arquitectura**: Clean Architecture (Domain → Application → Infrastructure)

---

## Principios de Clean Architecture

```
Frameworks (NestJS, Prisma, Redis)
        ↓  depende de
Infrastructure (controllers, repositories impl, mappers)
        ↓  depende de
Application (use cases)
        ↓  depende de
Domain (entities, repository interfaces, value objects, ports)
        ← NUNCA al revés →
```

- **Domain**: cero dependencias externas. Sin NestJS, sin Prisma, sin nada.
- **Application**: solo depende de Domain. Orquesta use cases. Inyecta interfaces/puertos.
- **Infrastructure**: implementa los puertos definidos en Domain. Usa frameworks.
- **Dependency Inversion**: Domain define la interfaz; Infrastructure la implementa.

---

## Estructura de directorios

```
src/
├── common/
│   ├── decorators/
│   │   ├── current-user.decorator.ts   # Extrae JwtPayload del request
│   │   └── public.decorator.ts         # Marca rutas públicas (sin JWT)
│   ├── dtos/
│   │   └── pagination-result.dto.ts    # PaginationResultDto<T> + toPaginationResult()
│   ├── enums/
│   │   └── authorization-token.enum.ts # AuthorizationTokenEnum
│   ├── filters/
│   │   └── http-exception.filter.ts    # AllExceptionsFilter
│   ├── guards/
│   │   └── jwt-auth.guard.ts           # JwtAuthGuard (respeta @Public)
│   ├── interceptors/
│   │   ├── logging.interceptor.ts      # LoggingInterceptor (colorizado ANSI)
│   │   └── response.interceptor.ts     # ResponseInterceptor (envuelve en success/data/timestamp)
│   ├── pipes/
│   │   └── parse-image.pipe.ts         # ParseImagePipe (MIME + tamaño ≤ 10 MB)
│   └── utils/
│       └── slug.util.ts                # toSlug() + generateUniqueSlug()
├── config/
│   ├── app.config.ts                   # registerAs con Zod
│   ├── env.schema.ts                   # Schema Zod de variables de entorno
│   └── envs.ts                         # Acceso tipado a env (importa dotenv/config)
├── shared/
│   ├── bcrypt/
│   │   ├── bcrypt.module.ts            # BcryptModule
│   │   └── bcrypt.service.ts           # BcryptService: hash / compare (12 rounds)
│   ├── cloudinary/
│   │   ├── cloudinary.module.ts        # CloudinaryModule
│   │   ├── cloudinary.service.ts       # CloudinaryService: uploadOne / uploadMany
│   │   └── interfaces/
│   │       └── upload-result.interface.ts  # UploadResult, CloudinaryFile
│   ├── jwt/
│   │   ├── jwt.module.ts               # AppJwtModule
│   │   ├── jwt.service.ts              # JwtTokenService: sign / verify / signRefresh / verifyRefresh
│   │   └── interfaces/
│   │       ├── jwt-payload.interface.ts        # { sub, email, username, role }
│   │       └── refresh-token-payload.interface.ts  # { sub, jti }
│   ├── mail/
│   │   ├── mail.module.ts              # MailModule
│   │   ├── mail.service.ts             # MailService (Nodemailer SMTP)
│   │   ├── interfaces/
│   │   │   └── send-mail.interface.ts  # SendMailOptions
│   │   └── templates/
│   │       ├── recovery-password.template.ts
│   │       ├── welcome-review.template.ts
│   │       └── account-approved.template.ts
│   ├── prisma/
│   │   ├── prisma.module.ts            # PrismaModule
│   │   └── prisma.service.ts           # PrismaService (extends PrismaClient, MariaDB adapter)
│   └── redis/
│       ├── redis.module.ts             # RedisModule
│       ├── redis.service.ts            # RedisService: generateToken / validateToken / revokeToken
│       └── interfaces/
│           └── redis.interface.ts      # CreateRedisInterface, PayloadRedisInterface, RevokeRedisInterface
├── modules/
│   └── [feature]/
│       ├── domain/
│       │   ├── [feature].entity.ts          # Entidad de dominio (puro TS, IDs string/uuid)
│       │   ├── [feature].repository.ts      # Interfaz IFeatureRepository + Symbol + Data interfaces
│       │   ├── [feature].enums.ts           # (si aplica) Enums del dominio con string values
│       │   └── [port-name].port.ts          # (si aplica) Puertos secundarios (IPasswordHasher, etc.)
│       ├── application/
│       │   └── use-cases/
│       │       ├── create-[feature].use-case.ts
│       │       ├── find-all-[feature].use-case.ts
│       │       ├── find-one-[feature].use-case.ts
│       │       ├── update-[feature].use-case.ts
│       │       └── delete-[feature].use-case.ts
│       ├── infrastructure/
│       │   ├── persistence/
│       │   │   ├── [feature].prisma.repository.ts  # Implementación del repositorio
│       │   │   └── [feature].mapper.ts             # Domain ↔ Prisma + tipos inferidos
│       │   └── http/
│       │       ├── [feature].controller.ts
│       │       └── dtos/
│       │           ├── create-[feature].dto.ts
│       │           ├── update-[feature].dto.ts
│       │           └── [feature]-response.dto.ts
│       └── [feature].module.ts              # Cablea DI: Symbol → Implementación
├── app.module.ts                            # CacheModule global + todos los feature modules
└── main.ts                                  # Bootstrap: CORS, prefix, pipes, interceptors, filter, Swagger
prisma/
├── schema.prisma                            # IDs uuid, provider = "prisma-client", datasource mysql
├── generated/
│   └── prisma/                              # Output del generator (cjs)
├── migrations/
└── seed.ts
```

---

## main.ts — Configuración base

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { envs } from './config/envs';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: envs.ALLOWED_ORIGINS?.split(',') ?? '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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

  // Orden importa: Logging primero (más externo), Response después
  app.useGlobalInterceptors(new LoggingInterceptor(), new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
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
    .addServer(`http://localhost:${envs.PORT}`, 'Local')
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
  console.log(`\n🚀 App running on: http://localhost:${envs.PORT}`);
  console.log(`📄 Swagger docs:   http://localhost:${envs.PORT}/docs\n`);
}
bootstrap().catch((err) => {
  console.error('❌ Failed to start application:', err);
  process.exit(1);
});
```

> **Notas**: No se llama `app.enableVersioning()`. La versión se declara en cada controller con `version: '1'` en el decorador `@Controller`. No se registra `JwtAuthGuard` globalmente — se registra por módulo como provider y se aplica con `@UseGuards(JwtAuthGuard)` a nivel de clase en cada controller.

---

## app.module.ts

```typescript
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import { envs } from './config/envs';
// feature modules aquí...

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => ({
        ttl: 5000,
        stores: [new KeyvRedis(envs.REDIS_URL)],
      }),
    }),
    // Todos los feature modules listados alfabéticamente
    AttributeTemplateModule,
    AuthModule,
    BankAccountModule,
    BrandModule,
    BranchModule,
    CategoryModule,
    CompanyModule,
    ProductModule,
    RoleModule,
    SupplierModule,
    TagModule,
    UserModule,
    WarehouseModule,
  ],
})
export class AppModule {}
```

> `CacheModule` es global — **NO** se reimporta en los feature modules. `ConfigModule` de NestJS no se usa; las env se cargan directamente via `appConfig()`. Los módulos `PrismaModule`, `AppJwtModule`, `BcryptModule`, `MailModule`, `CloudinaryModule` y `RedisModule` se importan **solo** en el feature module que los necesite.

---

## Path Aliases — tsconfig.json

```json
"paths": {
  "src/*":      ["./src/*"],
  "@shared/*":  ["./src/shared/*"],
  "@common/*":  ["./src/common/*"],
  "@config/*":  ["./src/config/*"],
  "@modules/*": ["./src/modules/*"]
}
```

Usar siempre aliases en imports cross-layer. Los imports relativos (`../../`) solo dentro de la misma capa de un módulo.

```typescript
// ✅ Correcto
import { PrismaService } from '@shared/prisma/prisma.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { envs } from '@config/envs';

// ❌ Evitar
import { PrismaService } from '@shared/prisma/prisma.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
```

> El NestJS CLI (Webpack) resuelve los aliases en build/dev automáticamente. `tsconfig-paths` ya está instalado para seed y tests.

---

## Validación de variables de entorno — Zod

### `src/config/env.schema.ts`

```typescript
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  // Base de datos
  HOST_DB: z.string(),
  PORT_DB: z.coerce.number().default(3306),
  USER_DB: z.string(),
  PASSWORD_DB: z.string(),
  DATABASE_DB: z.string(),
  // Redis
  REDIS_URL: z.string().min(1),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  // App
  ALLOWED_ORIGINS: z.string().optional(),
  FRONTEND_URL: z.string().url().default('http://localhost:5174'),
  APP_NAME: z.string().default('API'),
  // JWT — access token (15m) + refresh token (30d)
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  JWT_REFRESH_TTL_MS: z.coerce.number().default(2592000000), // 30d en ms
  // Mail
  MAIL_HOST: z.string().default('smtp.gmail.com'),
  MAIL_PORT: z.coerce.number().default(465),
  MAIL_USER: z.string().email(),
  MAIL_PASS: z.string().min(1),
  ADMIN_EMAIL: z.string().email(),
  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;
```

### `src/config/app.config.ts`

```typescript
import { registerAs } from '@nestjs/config';
import { envSchema } from './env.schema';

export default registerAs('app', () => {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Variables de entorno inválidas:', parsed.error.format());
    process.exit(1);
  }
  return parsed.data;
});
```

### `src/config/envs.ts`

```typescript
import 'dotenv/config';
import appConfig from './app.config';

export const envs = appConfig();
```

---

## Variables de entorno — `.env`

```env
NODE_ENV=development
PORT=3000
# Base de datos
HOST_DB=localhost
PORT_DB=3306
USER_DB=root
PASSWORD_DB=secret
DATABASE_DB=store
# Redis
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
# App
APP_NAME="Store API"
ALLOWED_ORIGINS="http://localhost:4200,http://localhost:3000"
FRONTEND_URL="http://localhost:5174"
# JWT — access (15m) + refresh (30d)
JWT_SECRET="super-secret-key-at-least-32-characters-long"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_SECRET="another-super-secret-key-at-least-32-chars"
JWT_REFRESH_EXPIRES_IN="30d"
JWT_REFRESH_TTL_MS=2592000000
# Mail
MAIL_HOST=smtp.gmail.com
MAIL_PORT=465
MAIL_USER=app@gmail.com
MAIL_PASS=app-password
ADMIN_EMAIL=admin@empresa.com
# Cloudinary
CLOUDINARY_CLOUD_NAME=my-cloud
CLOUDINARY_API_KEY=123456789
CLOUDINARY_API_SECRET=my-api-secret
```

---

## prisma/schema.prisma

```prisma
generator client {
  provider     = "prisma-client"
  output       = "./generated/prisma"
  moduleFormat = "cjs"
}

datasource db {
  provider = "mysql"
}
```

> No se definen credenciales en `datasource` — la conexión la gestiona el adapter en `PrismaService`. Los IDs son **siempre UUID** (`String @id @default(uuid()) @db.VarChar(36)`), nunca enteros autoincremental. Todos los campos con nombre compuesto usan `@map("snake_case")`. Los modelos usan `@@map("tabla_plural")`.

**Ejemplo de modelo con UUID:**

```prisma
model Feature {
  id          String   @id @default(uuid()) @db.VarChar(36)
  companyId   String   @map("company_id") @db.VarChar(36)
  name        String   @db.VarChar(200)
  slug        String   @unique @db.VarChar(100)
  status      Boolean  @default(true)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([companyId], map: "idx_features_company")
  @@map("features")
}
```

**Enums del schema** (definidos con `@@map` y nombres en snake_case):

```prisma
enum UserStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
  PENDING
  @@map("user_status")
}
```

**Importar el cliente generado:**

```typescript
// CORRECTO — siempre así, nunca de '@prisma/client'
import { PrismaClient } from 'prisma/generated/prisma/client';
import type { Prisma } from 'prisma/generated/prisma/client';
```

---

## Módulos compartidos (shared)

### `src/shared/prisma/prisma.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from 'prisma/generated/prisma/client';
import { envs } from '@config/envs';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    const adapter = new PrismaMariaDb({
      host: envs.HOST_DB,
      user: envs.USER_DB,
      password: envs.PASSWORD_DB,
      database: envs.DATABASE_DB,
      port: envs.PORT_DB,
      connectionLimit: 10,
    });
    super({ adapter });
  }
}
```

### `src/shared/bcrypt/bcrypt.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

@Injectable()
export class BcryptService {
  private readonly SALT_ROUNDS = 12;

  hash(value: string): Promise<string> {
    return bcrypt.hash(value, this.SALT_ROUNDS);
  }

  compare(value: string, hash: string): Promise<boolean> {
    return bcrypt.compare(value, hash);
  }
}
```

`BcryptService` implementa los puertos `IPasswordHasher` (user) e `IPasswordVerifier` (auth) — ambos definidos en su respectivo módulo de dominio.

### `src/shared/jwt/`

```
shared/jwt/
├── interfaces/
│   ├── jwt-payload.interface.ts           # { sub, email, username, role }
│   └── refresh-token-payload.interface.ts # { sub, jti }
├── jwt.service.ts                          # JwtTokenService
└── jwt.module.ts                           # AppJwtModule
```

```typescript
// jwt-payload.interface.ts
export interface JwtPayload {
  sub: string;
  email: string;
  username: string;
  role: string;
}

// refresh-token-payload.interface.ts
export interface RefreshTokenPayload {
  sub: string;
  jti: string;   // UUID único por sesión, guardado en Redis
}
```

```typescript
// jwt.service.ts
@Injectable()
export class JwtTokenService {
  constructor(private readonly jwtService: JwtService) {}

  sign(payload: JwtPayload): string { ... }
  verify(token: string): JwtPayload { ... }               // lanza UnauthorizedException si inválido
  signRefresh(userId: string, jti: string): string { ... }
  verifyRefresh(token: string): RefreshTokenPayload { ... }
}
```

```typescript
// jwt.module.ts
@Module({
  imports: [
    JwtModule.register({
      secret: envs.JWT_SECRET,
      signOptions: { expiresIn: envs.JWT_EXPIRES_IN as StringValue },
    }),
  ],
  providers: [JwtTokenService],
  exports: [JwtTokenService],
})
export class AppJwtModule {}
```

> `AuthModule` exporta `AppJwtModule` para que otros módulos que necesiten JWT lo reciban transitivamente.

### `src/shared/redis/redis.service.ts`

```typescript
@Injectable()
export class RedisService {
  private readonly randomToken = () => Math.floor(100000 + Math.random() * 900000).toString();
  private readonly getKey = (type: AuthorizationTokenEnum, userId: string) =>
    `token:${type}:user:${userId}`;

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async generateToken({ userId, type, ttl = 900000 }: CreateRedisInterface): Promise<string> { ... }
  async validateToken({ userId, type, token }: PayloadRedisInterface) { ... }
  async revokeToken({ userId, type }: RevokeRedisInterface): Promise<boolean> { ... }
}
```

- Clave Redis: `token:<AuthorizationTokenEnum>:user:<userId>`
- TTL por defecto: `900000` ms (15 min). Pasar TTL explícito en cada llamada a `generateToken`.
- `AuthorizationTokenEnum` (`CONFIRM_EMAIL | RECOVERY_PASSWORD`) está en `src/common/enums/authorization-token.enum.ts`.

### `src/shared/mail/mail.service.ts`

```typescript
@Injectable()
export class MailService implements OnModuleInit {
  private transporter: nodemailer.Transporter;

  onModuleInit() {
    this.transporter = nodemailer.createTransport({
      host: envs.MAIL_HOST,
      port: envs.MAIL_PORT,
      secure: envs.MAIL_PORT === 465,
      auth: { user: envs.MAIL_USER, pass: envs.MAIL_PASS },
    });
  }

  async sendMail(options: SendMailOptions): Promise<void> { ... }
  async notifyAdmin(subject: string, text: string): Promise<void> { ... }
}
```

```typescript
// send-mail.interface.ts
export interface SendMailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
}
```

### `src/shared/cloudinary/cloudinary.service.ts`

```typescript
@Injectable()
export class CloudinaryService implements OnModuleInit {
  onModuleInit() {
    cloudinary.config({
      cloud_name: envs.CLOUDINARY_CLOUD_NAME,
      api_key: envs.CLOUDINARY_API_KEY,
      api_secret: envs.CLOUDINARY_API_SECRET,
    });
  }

  async uploadOne(file: CloudinaryFile, folder?: string): Promise<UploadResult> { ... }
  async uploadMany(files: CloudinaryFile[], folder?: string): Promise<UploadResult[]> { ... }
}
```

```typescript
// upload-result.interface.ts
export interface UploadResult { url: string; publicId: string; }
export interface CloudinaryFile { buffer: Buffer; mimetype: string; originalname: string; size: number; }
```

---

## Common — Guards, Decoradores, Pipes, Utils

### Guard JWT

`src/common/guards/jwt-auth.guard.ts`

```typescript
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtTokenService: JwtTokenService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Token no proporcionado.');
    request['user'] = this.jwtTokenService.verify(token);
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
```

> `JwtAuthGuard` **no** es global. Se registra como provider en cada feature module y se aplica con `@UseGuards(JwtAuthGuard)` a nivel de clase en el controller.

### Decoradores

```typescript
// public.decorator.ts — marca rutas que NO requieren JWT
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// current-user.decorator.ts — extrae el payload del token del request
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request['user'] as JwtPayload;
  },
);
```

### Pipe de imagen

`src/common/pipes/parse-image.pipe.ts`

```typescript
@Injectable()
export class ParseImagePipe implements PipeTransform<unknown, CloudinaryFile> {
  // Valida MIME (jpeg, png, webp, gif, avif) y tamaño máximo 10 MB
  transform(value: unknown): CloudinaryFile { ... }
}
```

Uso en controller:
```typescript
@Post(':id/upload-avatar')
@UseInterceptors(FileInterceptor('file'))
@ApiConsumes('multipart/form-data')
@ApiBody({
  schema: {
    type: 'object',
    required: ['file'],
    properties: { file: { type: 'string', format: 'binary', description: 'Imagen (jpeg, png, webp, gif, avif — máx. 10 MB)' } },
  },
})
uploadAvatar(
  @Param('id', ParseUUIDPipe) id: string,
  @UploadedFile(new ParseImagePipe()) file: CloudinaryFile,
) {
  return this.uploadAvatarUseCase.execute(id, file);
}
```

### Paginación

`src/common/dtos/pagination-result.dto.ts`

```typescript
export class PaginationResultDto<T> {
  @ApiProperty({ isArray: true }) data: T[];
  @ApiProperty({ example: 100 }) total: number;
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 10 }) limit: number;
  @ApiProperty({ example: 10 }) totalPages: number;
}

export function toPaginationResult<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginationResultDto<T> {
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}
```

### Slug util

`src/common/utils/slug.util.ts`

```typescript
export function toSlug(value: string): string {
  return value.toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '').substring(0, 100);
}

export async function generateUniqueSlug(
  name: string,
  isSlugTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = toSlug(name);
  let slug = base;
  for (let attempt = 1; attempt <= 10; attempt++) {
    if (!(await isSlugTaken(slug))) return slug;
    slug = `${base}-${attempt}`;
  }
  throw new ConflictException('No se pudo generar un slug único. Intenta con un nombre diferente.');
}
```

---

## Clean Architecture por capas — ejemplo completo (feature: User)

### 1. Domain — Entidad (UUID como id)

`src/modules/[feature]/domain/[feature].entity.ts`

```typescript
export class Feature {
  constructor(
    public readonly id: string,           // UUID — nunca number
    public readonly companyId: string,
    public name: string,
    public slug: string,
    public status: FeatureStatus,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}
```

### 2. Domain — Enums del dominio

`src/modules/[feature]/domain/[feature].enums.ts`

```typescript
export enum FeatureStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}
```

> Siempre definir los enums con string values explícitos para que coincidan con Prisma.

### 3. Domain — Interfaz del repositorio (puerto)

`src/modules/[feature]/domain/[feature].repository.ts`

```typescript
import { Feature } from './feature.entity';
import { FeatureStatus } from './feature.enums';

export interface FeatureFilters {
  page: number;
  limit: number;
  companyId: string;
  status?: FeatureStatus;
  search?: string;
}

export interface CreateFeatureData {
  companyId: string;
  name: string;
  slug: string;
}

export interface UpdateFeatureData {
  name?: string;
  slug?: string;
  status?: FeatureStatus;
}

export interface IFeatureRepository {
  findAll(filters: FeatureFilters): Promise<{ data: Feature[]; total: number }>;
  findById(id: string): Promise<Feature | null>;
  isSlugTaken(slug: string, companyId: string, excludeId?: string): Promise<boolean>;
  create(data: CreateFeatureData): Promise<Feature>;
  update(id: string, data: UpdateFeatureData): Promise<Feature>;
  delete(id: string): Promise<void>;
}

export const FEATURE_REPOSITORY = Symbol('FEATURE_REPOSITORY');
```

> Las interfaces de datos (`CreateFeatureData`, `UpdateFeatureData`, etc.) se definen aquí, en el repositorio de dominio. Son los contratos que los use cases usan para hablar con la infraestructura.

### 4. Domain — Puertos secundarios (cuando aplica)

`src/modules/[feature]/domain/password-hasher.port.ts`

```typescript
export interface IPasswordHasher {
  hash(password: string): Promise<string>;
  compare(password: string, hash: string): Promise<boolean>;
}
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
```

> Los puertos secundarios desacoplan el dominio de servicios externos (bcrypt, email, etc.). El módulo los cablea: `{ provide: PASSWORD_HASHER, useClass: BcryptService }`.

### 5. Application — Use Cases

`src/modules/[feature]/application/use-cases/find-one-[feature].use-case.ts`

```typescript
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IFeatureRepository, FEATURE_REPOSITORY } from '../../domain/feature.repository';
import { Feature } from '../../domain/feature.entity';

@Injectable()
export class FindOneFeatureUseCase {
  constructor(
    @Inject(FEATURE_REPOSITORY)
    private readonly featureRepository: IFeatureRepository,
  ) {}

  async execute(id: string): Promise<Feature> {
    const feature = await this.featureRepository.findById(id);
    if (!feature) throw new NotFoundException(`Feature #${id} not found`);
    return feature;
  }
}
```

`src/modules/[feature]/application/use-cases/create-[feature].use-case.ts`

```typescript
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { generateUniqueSlug } from '@common/utils/slug.util';
import { IFeatureRepository, FEATURE_REPOSITORY } from '../../domain/feature.repository';
import { CreateFeatureDto } from '../../infrastructure/http/dtos/create-feature.dto';
import { Feature } from '../../domain/feature.entity';

@Injectable()
export class CreateFeatureUseCase {
  constructor(
    @Inject(FEATURE_REPOSITORY)
    private readonly featureRepository: IFeatureRepository,
  ) {}

  async execute(dto: CreateFeatureDto): Promise<Feature> {
    const slug = await generateUniqueSlug(dto.name, (s) =>
      this.featureRepository.isSlugTaken(s, dto.companyId),
    );
    return this.featureRepository.create({ companyId: dto.companyId, name: dto.name, slug });
  }
}
```

### 6. Infrastructure — Mapper

`src/modules/[feature]/infrastructure/persistence/[feature].mapper.ts`

```typescript
import type { Feature as PrismaFeature } from 'prisma/generated/prisma/client';
import { Feature } from '../../domain/feature.entity';
import { FeatureStatus } from '../../domain/feature.enums';

// Para includes complejos: exportar la constante y el tipo inferido
export const FEATURE_FULL_INCLUDE = {
  company: { select: { id: true, name: true } },
} satisfies Prisma.FeatureInclude;

export type PrismaFeatureFull = Prisma.FeatureGetPayload<{
  include: typeof FEATURE_FULL_INCLUDE;
}>;

export class FeatureMapper {
  static toDomain(raw: PrismaFeature): Feature {
    return new Feature(
      raw.id,
      raw.companyId,
      raw.name,
      raw.slug,
      raw.status as unknown as FeatureStatus,
      raw.createdAt,
      raw.updatedAt,
    );
  }
}
```

### 7. Infrastructure — Repositorio Prisma (adaptador)

`src/modules/[feature]/infrastructure/persistence/[feature].prisma.repository.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/prisma/prisma.service';
import { IFeatureRepository, FeatureFilters, CreateFeatureData, UpdateFeatureData } from '../../domain/feature.repository';
import { Feature } from '../../domain/feature.entity';
import { FeatureMapper } from './feature.mapper';

@Injectable()
export class FeaturePrismaRepository implements IFeatureRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll({ page, limit, companyId, status, search }: FeatureFilters) {
    const where = {
      companyId,
      ...(status && { status }),
      ...(search && { name: { contains: search } }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.feature.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.feature.count({ where }),
    ]);
    return { data: data.map(FeatureMapper.toDomain), total };
  }

  async findById(id: string): Promise<Feature | null> {
    const row = await this.prisma.feature.findUnique({ where: { id } });
    return row ? FeatureMapper.toDomain(row) : null;
  }

  async isSlugTaken(slug: string, companyId: string, excludeId?: string): Promise<boolean> {
    const row = await this.prisma.feature.findFirst({
      where: { slug, companyId, ...(excludeId && { id: { not: excludeId } }) },
    });
    return !!row;
  }

  async create(data: CreateFeatureData): Promise<Feature> {
    const row = await this.prisma.feature.create({ data });
    return FeatureMapper.toDomain(row);
  }

  async update(id: string, data: UpdateFeatureData): Promise<Feature> {
    const row = await this.prisma.feature.update({ where: { id }, data });
    return FeatureMapper.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.feature.delete({ where: { id } });
  }
}
```

### 8. Infrastructure — DTOs HTTP con Swagger

`src/modules/[feature]/infrastructure/http/dtos/create-[feature].dto.ts`

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MinLength, MaxLength } from 'class-validator';
import { FeatureStatus } from '../../../domain/feature.enums';

export class CreateFeatureDto {
  @ApiProperty({ example: 'uuid-de-la-empresa' })
  @IsUUID()
  companyId: string;

  @ApiProperty({ example: 'Mi Feature', minLength: 2, maxLength: 200 })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'mi-feature', description: 'Si no se provee, se genera automáticamente' })
  @IsOptional()
  @IsString()
  slug?: string;
}

export class UpdateFeatureDto {
  @ApiPropertyOptional({ example: 'Nuevo Nombre' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ enum: FeatureStatus })
  @IsOptional()
  @IsEnum(FeatureStatus)
  status?: FeatureStatus;
}
```

**Response DTO:**

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeatureStatus } from '../../../domain/feature.enums';

export class FeatureResponseDto {
  @ApiProperty({ example: 'uuid-del-feature' }) id: string;
  @ApiProperty({ example: 'uuid-de-la-empresa' }) companyId: string;
  @ApiProperty({ example: 'Mi Feature' }) name: string;
  @ApiProperty({ example: 'mi-feature' }) slug: string;
  @ApiProperty({ enum: FeatureStatus }) status: FeatureStatus;
  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' }) createdAt: Date;
  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' }) updatedAt: Date;
}
```

### 9. Infrastructure — Controller con Swagger completo

`src/modules/[feature]/infrastructure/http/[feature].controller.ts`

```typescript
import {
  Controller, Get, Post, Body, Patch, Param,
  Delete, HttpCode, HttpStatus, UseGuards, Query, ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation,
  ApiNotFoundResponse, ApiBadRequestResponse, ApiCreatedResponse,
  ApiOkResponse, ApiNoContentResponse, ApiUnauthorizedResponse,
  ApiConflictResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';
import type { JwtPayload } from '@shared/jwt/interfaces/jwt-payload.interface';
import { PaginationResultDto, toPaginationResult } from '@common/dtos/pagination-result.dto';
import { CreateFeatureUseCase } from '../../application/use-cases/create-feature.use-case';
import { FindAllFeatureUseCase } from '../../application/use-cases/find-all-feature.use-case';
import { FindOneFeatureUseCase } from '../../application/use-cases/find-one-feature.use-case';
import { UpdateFeatureUseCase } from '../../application/use-cases/update-feature.use-case';
import { DeleteFeatureUseCase } from '../../application/use-cases/delete-feature.use-case';
import { CreateFeatureDto, UpdateFeatureDto } from './dtos/create-feature.dto';
import { FeatureResponseDto } from './dtos/feature-response.dto';
import { FindFeaturesQueryDto } from './dtos/find-features-query.dto';

@ApiTags('features')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token inválido o ausente' })
@UseGuards(JwtAuthGuard)
@Controller({ path: 'features', version: '1' })
export class FeatureController {
  constructor(
    private readonly createFeature: CreateFeatureUseCase,
    private readonly findAllFeature: FindAllFeatureUseCase,
    private readonly findOneFeature: FindOneFeatureUseCase,
    private readonly updateFeature: UpdateFeatureUseCase,
    private readonly deleteFeature: DeleteFeatureUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear feature' })
  @ApiCreatedResponse({ type: FeatureResponseDto })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos.' })
  @ApiConflictResponse({ description: 'Slug ya en uso.' })
  create(@Body() dto: CreateFeatureDto) {
    return this.createFeature.execute(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar features (paginado)' })
  @ApiOkResponse({ type: PaginationResultDto })
  async findAll(@Query() query: FindFeaturesQueryDto): Promise<PaginationResultDto<FeatureResponseDto>> {
    const result = await this.findAllFeature.execute(query);
    return toPaginationResult(result.data as FeatureResponseDto[], result.total, query.page ?? 1, query.limit ?? 20);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener feature por ID' })
  @ApiParam({ name: 'id', description: 'UUID del feature' })
  @ApiOkResponse({ type: FeatureResponseDto })
  @ApiNotFoundResponse({ description: 'Feature no encontrado.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.findOneFeature.execute(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar feature' })
  @ApiOkResponse({ type: FeatureResponseDto })
  @ApiNotFoundResponse({ description: 'Feature no encontrado.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFeatureDto) {
    return this.updateFeature.execute(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar feature' })
  @ApiNoContentResponse({ description: 'Feature eliminado.' })
  @ApiNotFoundResponse({ description: 'Feature no encontrado.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.deleteFeature.execute(id);
  }
}
```

> Los IDs de parámetros usan **`ParseUUIDPipe`**, nunca `ParseIntPipe`.

### 10. Module — Cablea DI

`src/modules/[feature]/[feature].module.ts`

```typescript
import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/prisma/prisma.module';
import { AppJwtModule } from '@shared/jwt/jwt.module';
import { BcryptModule } from '@shared/bcrypt/bcrypt.module';
import { MailModule } from '@shared/mail/mail.module';
import { CloudinaryModule } from '@shared/cloudinary/cloudinary.module';
import { RedisModule } from '@shared/redis/redis.module';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { FEATURE_REPOSITORY } from './domain/feature.repository';
import { PASSWORD_HASHER } from './domain/password-hasher.port';
import { FeaturePrismaRepository } from './infrastructure/persistence/feature.prisma.repository';
import { BcryptService } from '@shared/bcrypt/bcrypt.service';
import { FeatureController } from './infrastructure/http/feature.controller';
import { CreateFeatureUseCase } from './application/use-cases/create-feature.use-case';
import { FindAllFeatureUseCase } from './application/use-cases/find-all-feature.use-case';
import { FindOneFeatureUseCase } from './application/use-cases/find-one-feature.use-case';
import { UpdateFeatureUseCase } from './application/use-cases/update-feature.use-case';
import { DeleteFeatureUseCase } from './application/use-cases/delete-feature.use-case';

const useCases = [
  CreateFeatureUseCase,
  FindAllFeatureUseCase,
  FindOneFeatureUseCase,
  UpdateFeatureUseCase,
  DeleteFeatureUseCase,
];

@Module({
  // Importar solo los shared modules que el feature realmente necesita
  imports: [PrismaModule, AppJwtModule],  // + BcryptModule, MailModule, CloudinaryModule, RedisModule según necesidad
  controllers: [FeatureController],
  providers: [
    ...useCases,
    { provide: FEATURE_REPOSITORY, useClass: FeaturePrismaRepository },
    // Cuando el feature tiene puertos secundarios:
    // { provide: PASSWORD_HASHER, useClass: BcryptService },
    JwtAuthGuard,  // Requerido por el controller que usa @UseGuards(JwtAuthGuard)
  ],
})
export class FeatureModule {}
```

---

## Auth Module — Patrón completo con refresh token

El módulo `auth` tiene puertos propios de dominio para separar responsabilidades:

```
modules/auth/
├── domain/
│   ├── auth-credentials.ts          # VO con datos del usuario para verificar login
│   ├── login-result.entity.ts       # LoginResult, AuthUserSnapshot, AuthCompanySnapshot
│   ├── auth-tokens.entity.ts        # VO con accessToken + refreshToken
│   ├── auth.repository.ts           # IAuthRepository + Symbol
│   ├── auth-token-store.port.ts     # IAuthTokenStore + Symbol (Redis para refresh tokens)
│   └── password-verifier.port.ts    # IPasswordVerifier + Symbol
├── application/use-cases/
│   ├── login.use-case.ts            # Verifica credenciales → emite tokens
│   ├── refresh-token.use-case.ts    # Rota el refresh token (jti rotativo)
│   ├── logout.use-case.ts           # Revoca el jti del refresh token en Redis
│   └── recovery-password.use-case.ts
├── infrastructure/
│   ├── persistence/
│   │   ├── auth.prisma.repository.ts
│   │   └── auth-token-store.redis.ts  # IAuthTokenStore → cacheManager.set/get/del
│   └── http/
│       ├── auth.controller.ts         # SIN @ApiBearerAuth (endpoints públicos de auth)
│       └── dtos/
└── auth.module.ts
```

**`auth-token-store.redis.ts`** — guarda `jti → userId` en Redis con TTL del refresh:

```typescript
@Injectable()
export class AuthTokenStoreRedis implements IAuthTokenStore {
  private readonly ttl = envs.JWT_REFRESH_TTL_MS;
  private readonly key = (jti: string) => `auth:refresh:${jti}`;

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async save(jti: string, userId: string): Promise<void> {
    await this.cache.set(this.key(jti), userId, this.ttl);
  }
  async getUserId(jti: string): Promise<string | null> {
    return (await this.cache.get<string>(this.key(jti))) ?? null;
  }
  async revoke(jti: string): Promise<void> {
    await this.cache.del(this.key(jti));
  }
}
```

**`auth.module.ts`:**

```typescript
@Module({
  imports: [PrismaModule, AppJwtModule, BcryptModule, RedisModule, MailModule],
  controllers: [AuthController],
  providers: [
    ...useCases,
    { provide: AUTH_REPOSITORY, useClass: AuthPrismaRepository },
    { provide: PASSWORD_VERIFIER, useClass: BcryptService },
    { provide: AUTH_TOKEN_STORE, useClass: AuthTokenStoreRedis },
  ],
  exports: [AppJwtModule],  // Exporta AppJwtModule para módulos que dependan de AuthModule
})
export class AuthModule {}
```

---

## Logging Interceptor

`src/common/interceptors/logging.interceptor.ts`

```typescript
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP', { timestamp: false });

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req  = context.switchToHttp().getRequest<Request>();
    const res  = context.switchToHttp().getResponse<Response>();
    const { method, originalUrl, ip } = req;
    const userAgent = req.get('user-agent') ?? '';
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - start;
        this.logger.log(`${colorMethod(method)} ${originalUrl}  ${colorStatus(res.statusCode)}  ${colorDuration(ms)}  ${ip} "${userAgent}"`);
      }),
      catchError((err: unknown) => {
        const ms = Date.now() - start;
        const status = err instanceof HttpException ? err.getStatus() : 500;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(`${colorMethod(method)} ${originalUrl}  ${colorStatus(status)}  ${colorDuration(ms)}  ✗ ${msg}  ${ip}`);
        return throwError(() => err);
      }),
    );
  }
}
```

**Salida de ejemplo:**
```
[HTTP] GET     /api/v1/products       200    23ms  ::1 "Mozilla/5.0"
[HTTP] POST    /api/v1/users          201    45ms  ::1 "Mozilla/5.0"
[HTTP] GET     /api/v1/users/abc-123  404    12ms  ✗ User not found  ::1
```

---

## Exception Filter global

`src/common/filters/http-exception.filter.ts`

```typescript
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx      = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request  = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const rawResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    const message =
      typeof rawResponse === 'object' && rawResponse !== null
        ? (rawResponse as Record<string, unknown>)['message'] ?? 'Internal server error'
        : rawResponse ?? 'Internal server error';

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
```

> El `LoggingInterceptor` ya registra errores en `catchError` — el filter **no** duplica el log.

---

## Response Interceptor

`src/common/interceptors/response.interceptor.ts`

```typescript
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => ({ success: true, data, timestamp: new Date().toISOString() })),
    );
  }
}
```

---

## Dependencias a instalar

```bash
# Core NestJS
npm install @nestjs/core @nestjs/common @nestjs/platform-express reflect-metadata rxjs

# Config (solo para registerAs — ConfigModule no se usa)
npm install @nestjs/config

# Prisma v7 con adapter MariaDB
npm install prisma@latest @prisma/client@latest
npm install @prisma/adapter-mariadb mariadb
npx prisma init

# Validación
npm install class-validator class-transformer

# Swagger
npm install @nestjs/swagger swagger-ui-express

# Zod
npm install zod

# JWT + bcrypt
npm install @nestjs/jwt bcrypt
npm install -D @types/bcrypt

# Redis (Keyv)
npm install @nestjs/cache-manager keyv @keyv/redis

# Mail
npm install nodemailer
npm install -D @types/nodemailer

# Cloudinary
npm install cloudinary @nestjs/platform-express multer
npm install -D @types/multer

# Dotenv
npm install dotenv

# Dev
npm install -D @nestjs/cli typescript ts-node @types/node @types/express
```

---

## Reglas de desarrollo (siempre seguir)

1. **IDs son siempre UUID** (`string`) — nunca `number` autoincremental. Usar `ParseUUIDPipe` en los controllers, `@IsUUID()` en los DTOs, `String @id @default(uuid()) @db.VarChar(36)` en Prisma.
2. **Domain no importa nada externo** — cero dependencias de NestJS, Prisma u otros frameworks.
3. **Use cases dependen solo de interfaces** — nunca de la implementación concreta. Inyectar con `@Inject(SYMBOL)`.
4. **El mapper traduce entre Domain ↔ Prisma** — exporta constantes de include (`FEATURE_FULL_INCLUDE`) y tipos inferidos (`PrismaFeatureFull`). Los use cases nunca tocan tipos de Prisma.
5. **El controller solo inyecta use cases** — nunca repositorios ni PrismaService directamente.
6. **El módulo es el único lugar donde se cablea** `SYMBOL → Implementación`.
7. **`JwtAuthGuard` se registra en el módulo como provider** y se aplica con `@UseGuards(JwtAuthGuard)` a nivel de clase en el controller. No es global.
8. **`@Public()`** marca los endpoints que no requieren autenticación (p. ej. `register-owner`, `login`).
9. **`@CurrentUser()`** para extraer el `JwtPayload` del token en el controller cuando se necesita el usuario autenticado.
10. **`PrismaModule`, `AppJwtModule`, `BcryptModule`, `MailModule`, `CloudinaryModule` y `RedisModule` se importan solo en el feature module que los necesita** — nunca en `AppModule`. Excepción: `CacheModule` se registra globalmente en `AppModule` y no se reimporta.
11. **Todo controller con JWT lleva `@ApiTags`, `@ApiBearerAuth('access-token')`, `@ApiUnauthorizedResponse` y `@UseGuards(JwtAuthGuard)`** en la clase. Los controllers públicos (auth) no llevan `@ApiBearerAuth`.
12. **Todo endpoint documenta sus respuestas** con `@ApiOkResponse`, `@ApiCreatedResponse`, `@ApiNotFoundResponse`, `@ApiBadRequestResponse`, etc.
13. **Siempre definir un `ResponseDto`** para documentar el tipo de retorno en Swagger.
14. **DTOs solo en `infrastructure/http/dtos/`** — con `class-validator`. El domain no tiene DTOs.
15. **Variables de entorno validadas con Zod al inicio** — si falla, la app no arranca (`process.exit(1)`).
16. **Tipado estricto** — no usar `any`. Tipar siempre retornos y parámetros.
17. **Errores lanzados en use cases** con `HttpException` o subclases (`NotFoundException`, `ConflictException`, `UnauthorizedException`, `BadRequestException`).
18. **Paginación** con `PaginationResultDto<T>` + `toPaginationResult()` en todos los listados.
19. **Slugs** generados con `generateUniqueSlug()` de `src/common/utils/slug.util.ts`. Validar disponibilidad en el repositorio con `isSlugTaken()`.
20. **Upload de imágenes** con `FileInterceptor` + `ParseImagePipe` + `CloudinaryService`.
21. **`RedisService` siempre con TTL explícito** — nunca cachear sin tiempo de expiración.
22. **`LoggingInterceptor` va primero** en `useGlobalInterceptors` — captura el tiempo real de toda la cadena.
23. **`AllExceptionsFilter` no loguea** — el `LoggingInterceptor` ya lo hace en `catchError`.
24. **Migrations con Prisma** — nunca modificar la BD directamente.
25. **`whitelist: true` y `forbidNonWhitelisted: true`** en `ValidationPipe` — siempre.
26. **Enums del dominio con string values explícitos** — `ACTIVE = 'ACTIVE'` para que coincidan con los valores de Prisma.
27. **Prisma client se importa de `prisma/generated/prisma/client`** — nunca de `@prisma/client`.
28. **`dotenv/config`** se importa en `src/config/envs.ts` para cargar el `.env` antes de Zod.
29. **Interfaces de datos en el repositorio de dominio** (`CreateFeatureData`, `UpdateFeatureData`, `FeatureFilters`) — no en los use cases ni en la infraestructura.
30. **Puertos secundarios en el dominio** (`IPasswordHasher`, `IPasswordVerifier`, `IAuthTokenStore`) cuando el feature necesita servicios externos distintos al repositorio.
31. **Todo endpoint POST, PATCH y DELETE siempre devuelve `{ message: string }`** — nunca `void` ni `204 No Content`. Usar `async/await` en el método y retornar el mensaje tras ejecutar el use case. Documentar con `@ApiOkResponse`. No usar `@HttpCode(HttpStatus.NO_CONTENT)` en ningún caso. Los GET no aplican esta regla porque ya retornan datos. Ejemplo:
    ```typescript
    @Delete(':id')
    @ApiOperation({ summary: 'Eliminar recurso' })
    @ApiOkResponse({ schema: { example: { message: 'Recurso eliminado correctamente.' } } })
    @ApiNotFoundResponse({ description: 'Recurso no encontrado.' })
    async remove(@Param('id', ParseUUIDPipe) id: string) {
      await this.deleteUseCase.execute(id);
      return { message: 'Recurso eliminado correctamente.' };
    }
    ```
    El `ResponseInterceptor` envuelve la respuesta en `{ success: true, data: { message }, timestamp }` automáticamente.
