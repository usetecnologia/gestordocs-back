# Etapa 1: Builder
FROM node:20-alpine AS builder

# Instalar dependencias del sistema para Prisma
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias (npm ci respeta exactamente el package-lock.json)
RUN npm ci

# Copiar prisma schema
COPY prisma ./prisma/

# Generar Prisma Client
RUN npx prisma generate

# Copiar el código fuente
COPY . .

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

# Exponer puerto
EXPOSE 3011

# Iniciar app (Prisma Client ya viene generado desde el builder en prisma/generated/prisma)
CMD ["node", "dist/src/main"]