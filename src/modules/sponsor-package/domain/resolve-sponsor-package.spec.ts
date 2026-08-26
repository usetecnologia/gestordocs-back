import { resolveSponsorPackage } from './resolve-sponsor-package';
import { SponsorPackage } from './sponsor-package.entity';
import { PackageStructure } from './sponsor-package.enums';

/**
 * La escalera de especificidad. Hoy todos los paquetes sembrados son genéricos, así que en
 * producción siempre gana el escalón 4 — pero la regla se implementa completa desde el día uno
 * para que habilitar el alcance en el admin no requiera tocar el motor.
 */

const PROG = 'prog-wat';
const OTRO_PROG = 'prog-intern';
const PAIS = 'pais-peru';
const OTRO_PAIS = 'pais-chile';

let contador = 0;

function paquete(overrides: Partial<SponsorPackage> = {}): SponsorPackage {
  contador += 1;
  return {
    id: `pkg-${contador}`,
    name: `paquete ${contador}`,
    sponsorId: 'sponsor-1',
    sponsorCode: 'UNITED',
    programId: null,
    countryId: null,
    structure: PackageStructure.CARPETA_POR_PARTICIPANTE,
    folderPathTemplate: '{PROGRAMA}/{PAIS}/{SPONSOR}',
    itemNameTemplate: '{dni} - {apellidos}, {nombres}',
    fallbackPrograma: 'SIN PROGRAMA',
    fallbackPais: 'SIN PAIS',
    priority: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    outputs: [],
    inputs: [],
    ...overrides,
  };
}

const scope = { programId: PROG, countryId: PAIS };

describe('resolveSponsorPackage', () => {
  it('sin candidatos devuelve null: el llamador omite al participante', () => {
    expect(resolveSponsorPackage([], scope)).toBeNull();
  });

  it('el genérico aplica a cualquier programa y país', () => {
    const generico = paquete();
    expect(resolveSponsorPackage([generico], scope)).toBe(generico);
    expect(resolveSponsorPackage([generico], { programId: null, countryId: null })).toBe(generico);
  });

  it('programa + país le gana a todos', () => {
    const generico = paquete();
    const porPrograma = paquete({ programId: PROG });
    const porPais = paquete({ countryId: PAIS });
    const exacto = paquete({ programId: PROG, countryId: PAIS });

    expect(resolveSponsorPackage([generico, porPrograma, porPais, exacto], scope)).toBe(exacto);
  });

  it('programa le gana a país — es la dimensión que más manda en qué documentos existen', () => {
    const porPrograma = paquete({ programId: PROG });
    const porPais = paquete({ countryId: PAIS });

    expect(resolveSponsorPackage([porPais, porPrograma], scope)).toBe(porPrograma);
  });

  it('un paquete de otro programa no aplica, aunque el país coincida', () => {
    const otro = paquete({ programId: OTRO_PROG, countryId: PAIS });
    const generico = paquete();

    expect(resolveSponsorPackage([otro, generico], scope)).toBe(generico);
    expect(resolveSponsorPackage([otro], scope)).toBeNull();
  });

  it('un paquete de otro país no aplica, aunque el programa coincida', () => {
    const otro = paquete({ programId: PROG, countryId: OTRO_PAIS });
    expect(resolveSponsorPackage([otro], scope)).toBeNull();
  });

  it('a igual especificidad gana la prioridad más alta', () => {
    const baja = paquete({ programId: PROG, priority: 0 });
    const alta = paquete({ programId: PROG, priority: 10 });

    expect(resolveSponsorPackage([baja, alta], scope)).toBe(alta);
    expect(resolveSponsorPackage([alta, baja], scope)).toBe(alta);
  });

  it('a igual prioridad gana el más antiguo, sin importar el orden de entrada', () => {
    const viejo = paquete({ programId: PROG, createdAt: new Date('2026-01-01T00:00:00Z') });
    const nuevo = paquete({ programId: PROG, createdAt: new Date('2026-06-01T00:00:00Z') });

    expect(resolveSponsorPackage([nuevo, viejo], scope)).toBe(viejo);
    expect(resolveSponsorPackage([viejo, nuevo], scope)).toBe(viejo);
  });

  it('empatado en todo, desempata el id: dos corridas nunca eligen distinto', () => {
    const fecha = new Date('2026-01-01T00:00:00Z');
    const a = paquete({ id: 'pkg-aaa', createdAt: fecha });
    const b = paquete({ id: 'pkg-bbb', createdAt: fecha });

    expect(resolveSponsorPackage([b, a], scope)).toBe(a);
    expect(resolveSponsorPackage([a, b], scope)).toBe(a);
  });

  it('un participante sin programa ni país solo puede caer en el genérico', () => {
    const generico = paquete();
    const porPrograma = paquete({ programId: PROG });

    expect(resolveSponsorPackage([porPrograma, generico], { programId: null, countryId: null })).toBe(
      generico,
    );
  });
});
