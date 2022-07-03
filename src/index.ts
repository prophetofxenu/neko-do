import bodyParser from 'body-parser';
import express, { Express, Request, Response } from 'express';
import DigitalOcean from 'do-wrapper';
import dotenv from 'dotenv';
import { Sequelize } from 'sequelize';
import logger from 'winston';
import { checkForExpired, checkProvisioningStatus, createRoom, deleteRoom, getStatus, updateIp } from './rooms';

import room from './models/room';

import { checkProject } from './project';
import { Context } from './types';


dotenv.config();


logger.add(new logger.transports.Console({ level: 'debug', format: logger.format.simple() }));

const dbUser = process.env.DB_USER || 'neko';
const dbPw = process.env.DB_PW || 'password';
const dbIp = process.env.DB_ADDR || '127.0.0.1';
const dbString = `postgres://${dbUser}:${dbPw}@${dbIp}:5432/neko`;
const sequelize = new Sequelize(dbString, {
  logging: msg => logger.debug(msg)
});
sequelize.authenticate();
const db = {
  Room: room(sequelize)
};

let domain: any;
if (!process.env.DOMAIN) {
  logger.error('DOMAIN not defined in .env');
} else {
  domain = process.env.DOMAIN;
}
let digiocean: any;
if (!process.env.DO_TOKEN) {
  logger.error('DO_TOKEN with DigitalOcean API token not defined in .env');
} else {
  digiocean = new DigitalOcean(process.env.DO_TOKEN);
}
const doProjName = process.env.DO_PROJECT_NAME || 'neko';
let sshKeyPrint: any;
if (!process.env.DO_SSH_KEY_ID) {
  logger.error('DO_SSH_KEY_ID not defined in .env');
} else {
  sshKeyPrint = process.env.DO_SSH_KEY_ID;
}

const app = express();
const port = process.env.PORT;
app.use(bodyParser.json());

const ctx: Context = {
  db: db,
  do: digiocean,
  info: {
    domain: domain,
    doProjName: doProjName,
    sshKeyPrint: sshKeyPrint
  }
};

(async () => {
  await sequelize.sync({ alter: true });

  const projectId = await checkProject(digiocean, doProjName);
  logger.info(`Using DO project ${doProjName} (${projectId})`);

  app.get('/room/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const room = await getStatus(ctx, id);
    res.send({ room: room });
  });

  app.post('/room', async (req, res) => {
    const provisionOptions = {
      image: req.body.image,
      resolution: req.body.resolution,
      fps: req.body.fps,
      password: req.body.password,
      adminPassword: req.body.adminPassword
    };
    const room = await createRoom(ctx, provisionOptions, projectId, sshKeyPrint);
    res.send({ room: room });
  });

  app.put('/room/ip/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const room = await updateIp(ctx, id);
    res.send({ room: room });
  });

  app.delete('/room/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const room = await deleteRoom(ctx, id);
    res.send({ room: room });
  });

  setInterval(() => {
    Promise.all([
      checkProvisioningStatus(ctx),
      checkForExpired(ctx)
    ]);
  }, 10000);

  app.listen(port, () => {
    logger.info(`Express server is running at https://localhost:${port}`);
  });
})();
