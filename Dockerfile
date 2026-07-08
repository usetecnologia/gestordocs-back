# Etapa 1: Builder
FROM node:20-slim AS builder

# Instalar dependencias del sistema para Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

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
FROM node:20-slim AS production

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

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