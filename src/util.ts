import crypto from 'crypto';
import DigitalOcean from 'do-wrapper';
import { resourceLimits } from 'worker_threads';


export function dropletId(): string {
  return crypto.randomBytes(4).toString('hex');
}

export function randomPw(bytes=6): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function dateDelta(date: Date, deltaSeconds: number) {
  return new Date(date.getTime() + deltaSeconds * 1000);
}

export async function getSnapshotId(digiOcean: DigitalOcean, name: string) {
  let page = 0;
  let result;
  do {
    result = await digiOcean.snapshots.getForDroplets('neko', true, page++);
    const snapshots = result.filter((s: any) => s.name === name);
    if (snapshots.length > 0) {
      return snapshots[0].id;
    }
  } while (result.links.next);
  return null;
}
