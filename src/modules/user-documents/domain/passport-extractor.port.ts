import { PassportData } from './passport-data';

export interface PassportSourceFile {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

export interface IPassportExtractorPort {
  extract(file: PassportSourceFile): Promise<PassportData>;
}

export const PASSPORT_EXTRACTOR_PORT = Symbol('PASSPORT_EXTRACTOR_PORT');
