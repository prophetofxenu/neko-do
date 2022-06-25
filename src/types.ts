import { ModelStatic } from 'sequelize/types';

export interface Context {
  db: {
    Room: ModelStatic<any>
  },
  do: any,
  info: {
    doProjName: string,
    sshKeyPrint: string
  }
}
