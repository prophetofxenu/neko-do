import { ModelStatic } from 'sequelize/types';

export interface Context {
  db: {
    Room: ModelStatic<any>,
    User: ModelStatic<any>
  },
  do: any,
  info: {
    domain: string,
    callbackIp: string,
    doProjName: string,
    sshKeyPrint: string,
    snapshotId: number,
    signingKey: Buffer
  }
}
