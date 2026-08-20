# Etapa 1: Builder
FROM node:20-alpine AS builder

# Instalar dependencias del sistema para Prisma
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias (npm ci respeta exactamente el package-lock.json)
RUN npm ci

# Copiar el código fuente completo (incluye tsconfig.json y prisma/schema.prisma)
# IMPORTANTE: tsconfig.json debe existir ANTES de "prisma generate", porque
# Prisma detecta su presencia para decidir el formato de los imports relativos
# (con tsconfig.json genera CommonJS clásico sin extensión; sin él, genera
# imports con extensión ".ts" que rompen la compilación con tsc).
COPY . .

# Generar Prisma Client
RUN npx prisma generate

# Build de NestJS
RUN npm run build

# Etapa 2: Production
FROM node:20-alpine AS production

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm ci --only=production && npm cache clean --force

# Copiar archivos necesarios desde builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
# prisma.config.ts es donde vive la URL de conexion del CLI: sin el, "migrate deploy" no sabe
# a que base conectarse. Se carga como TypeScript sin ts-node, via el loader que trae
# @prisma/config (c12/jiti), ambos ya incluidos al estar "prisma" en dependencies.
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

# Exponer puerto
EXPOSE 3011

# Aplicar las migraciones pendientes antes de levantar la app. Sin este paso la base queda
# atras del schema en cada despliegue: fue lo que dejo tres migraciones sin aplicar entre
# julio y agosto de 2026. Si una migracion falla, el contenedor no arranca — es deliberado:
# es preferible a servir la aplicacion contra una base con la estructura equivocada.
# El Prisma Client ya viene generado desde el builder en prisma/generated/prisma.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]