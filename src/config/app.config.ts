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
