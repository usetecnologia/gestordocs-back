import { ConflictException } from '@nestjs/common';

export function toSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .substring(0, 100);
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
  throw new ConflictException(
    'No se pudo generar un slug único. Intenta con un nombre diferente.',
  );
}
