import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class CryptoService {
  private readonly key: Buffer | null;

  constructor(private readonly config: ConfigService) {
    const secret = this.config.get<string>('APP_SECRET', '');
    if (!secret || secret.trim().length < 16) {
      this.key = null;
      return;
    }
    this.key = crypto.createHash('sha256').update(secret).digest();
  }

  encrypt(plain: string): string {
    if (!this.key) return plain;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
  }

  decrypt(stored: string | null): string | null {
    if (!stored) return null;
    if (!this.key) return stored;
    if (!stored.startsWith('v1:')) return stored;
    const parts = stored.split(':');
    if (parts.length !== 4) return null;
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const data = Buffer.from(parts[3], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]);
    return plain.toString('utf8');
  }
}
