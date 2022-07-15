import { ModelStatic } from 'sequelize/types';

export interface Context {
  db: {
    Room: ModelStatic<any>,
    User: ModelStatic<any>
  },
  do: any,
  info: {
    domain: string,
    doProjName: string,
    sshKeyPrint: string,
    signingKey: Buffer
  }
}
