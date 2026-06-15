export interface S3UploadFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

export interface S3UploadResult {
  url: string;
  key: string;
}
