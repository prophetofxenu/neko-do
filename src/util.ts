import crypto from 'crypto';


export function dropletId(): string {
  return crypto.randomBytes(4).toString('hex');
}

export function randomPw(): string {
  return crypto.randomBytes(6).toString('hex');
}

export function dateDelta(date: Date, deltaSeconds: number) {
  return new Date(date.getTime() + deltaSeconds * 1000);
}
