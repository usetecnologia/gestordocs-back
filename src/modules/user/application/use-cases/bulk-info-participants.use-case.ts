import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'crypto';

const WORKUSE_API_KEY = 'nexsys-01-app';
const WORKUSE_API_SECRET =
  'f8c2e131e76d7c4f37b24a6fdd2b83c3c252740268de5f83b0c80abc1330b';
const WORKUSE_REQUEST_PATH = '/api/user/userinfo2.php';
const WORKUSE_URL = `https://secure.workuse.com${WORKUSE_REQUEST_PATH}`;

@Injectable()
export class BulkInfoParticipantsUseCase {
  async execute(): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payload = `${WORKUSE_API_KEY}|${timestamp}|GET|${WORKUSE_REQUEST_PATH}`;
    const signature = createHmac('sha256', WORKUSE_API_SECRET)
      .update(payload)
      .digest('hex');

    console.log('BulkInfoParticipants — request:', {
      url: WORKUSE_URL,
      method: 'GET',
      headers: {
        'X-API-Key': WORKUSE_API_KEY,
        'X-Timestamp': timestamp,
        'X-Signature': signature,
        'Content-Type': 'application/json',
      },
    });

    let response: Response;
    try {
      response = await fetch(WORKUSE_URL, {
        method: 'GET',
        headers: {
          'X-API-Key': WORKUSE_API_KEY,
          'X-Timestamp': timestamp,
          'X-Signature': signature,
          'Content-Type': 'application/json',
        },
      });

    } catch (err) {
      console.log(err)
      throw new ServiceUnavailableException('No se pudo conectar con el servicio externo.');
    }

    const raw = await response.text();
    console.log('BulkInfoParticipants — Workuse response:', raw);
  }
}
