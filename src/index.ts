import bodyParser from 'body-parser';
import express from 'express';
import DigitalOcean from 'do-wrapper';
import dotenv from 'dotenv';
import { Sequelize } from 'sequelize';
import logger from 'winston';
import {
  checkForExpired,
  provisionRoom,
  deleteRoom,
  getStatus,
  renewRoom,
  createRoom,
  markRoomForDeletion,
  updateRoomStatus
} from './rooms';
import process from 'process';
import setupDb from './models/setup';

import { checkProject } from './project';
import { Context } from './types';
import {
  bearerToJwt,
  checkType,
  createUser,
  issueToken,
  loadSigningKey
} from './auth';
import { getSnapshotId } from './util';


dotenv.config();

logger.add(new logger.transports.Console({ level: 'info', format: logger.format.simple() }));

const dbUser = process.env.DB_USER || 'neko';
const dbPw = process.env.DB_PW || 'password';
const dbIp = process.env.DB_ADDR || '127.0.0.1';
const dbString = `postgres://${dbUser}:${dbPw}@${dbIp}:5432/neko`;
const sequelize = new Sequelize(dbString, {
  logging: msg => logger.debug(msg)
});
sequelize.authenticate();
const db = setupDb(sequelize);

if (!process.env.DOMAIN) {
  logger.error('DOMAIN not defined in .env');
  process.exit(1);
}
if (!process.env.DO_TOKEN) {
  logger.error('DO_TOKEN with DigitalOcean API token not defined in .env');
  process.exit(1);
}
if (!process.env.DO_SSH_KEY_ID) {
  logger.error('DO_SSH_KEY_ID not defined in .env');
  process.exit(1);
}
const domain = process.env.DOMAIN;
const doProjName = process.env.DO_PROJECT_NAME || 'neko';
const digitalocean = new DigitalOcean(process.env.DO_TOKEN);
const sshKeyPrint = process.env.DO_SSH_KEY_ID as string;

const app = express();
const port = process.env.PORT;
app.use(bodyParser.json());

(async () => {
  const signingKey = await loadSigningKey();

  // get snapshot id
  const snapshotId = await getSnapshotId(digitalocean, 'neko-do-img');
  logger.info(`Snapshot ID: ${snapshotId}`);
  if (!snapshotId) {
    logger.error('Droplet snapshot not found');
    process.exit(1);
  }

  const ctx: Context = {
    db: db,
    do: digitalocean,
    info: {
      domain: domain,
      doProjName: doProjName,
      sshKeyPrint: sshKeyPrint,
      snapshotId: snapshotId,
      signingKey: signingKey
    }
  };

  await sequelize.sync({ alter: true });

  const projectId = await checkProject(digitalocean, doProjName);
  logger.info(`Using DO project ${doProjName} (${projectId})`);

  app.get('/room/:id', async (req, res) => {

    const jwt = bearerToJwt(ctx, req.headers.authorization);
    if (!jwt || checkType(jwt, 'disabled')) {
      logger.warn('Unauthorized request', jwt);
      res.status(403).send({ error: 'Invalid JWT' });
      return;
    }

    const id = parseInt(req.params.id);
    const room = await getStatus(ctx, id);
    res.send({ room: room });
  });

  app.post('/room', async (req, res) => {

    const jwt = bearerToJwt(ctx, req.headers.authorization);
    if (!jwt || !checkType(jwt, 'admin')) {
      logger.warn('Unauthorized request', jwt);
      res.status(403).send({ error: 'Unauthorized' });
      return;
    }

    const provisionOptions = {
      image: req.body.image,
      resolution: req.body.resolution,
      fps: req.body.fps,
      password: req.body.password,
      adminPassword: req.body.adminPassword
    };
    const callbackUrl = req.body.callbackUrl;
    const room = await createRoom(ctx, provisionOptions, callbackUrl);
    res.send({ room: room });
    await provisionRoom(ctx, room, projectId, sshKeyPrint);
  });

  app.put('/room/:id', async (req, res) => {

    const jwt = bearerToJwt(ctx, req.headers.authorization);
    if (!jwt || !checkType(jwt, 'admin')) {
      logger.warn('Unauthorized request', jwt);
      res.status(403).send({ error: 'Unauthorized' });
      return;
    }

    const id = parseInt(req.params.id);
    const room = await renewRoom(ctx, id);
    res.send({ room: room });
  });

  app.delete('/room/:id', async (req, res) => {

    const jwt = bearerToJwt(ctx, req.headers.authorization);
    if (!jwt || !checkType(jwt, 'admin')) {
      logger.warn('Unauthorized request', jwt);
      res.status(403).send({ error: 'Unauthorized' });
      return;
    }

    const id = parseInt(req.params.id);
    const room = await markRoomForDeletion(ctx, id);
    res.send({ room: room });
    await deleteRoom(ctx, id);
  });

  app.post('/roomCallback', async (req, res) => {

    const jwt = bearerToJwt(ctx, req.headers.authorization);
    if (!jwt || !checkType(jwt, 'room')) {
      logger.warn('Unauthorized request', jwt);
      res.status(403).send({ error: 'Unauthorized' });
      return;
    }

    const jwtBody: any = jwt?.body as object;
    const roomId = jwtBody.sub;
    res.status(200).send();
    await updateRoomStatus(ctx, roomId, req.body);

  });

  app.post('/user', async (req, res) => {
    const name = req.body.name;
    const pw = req.body.pw;
    const user = await createUser(ctx, name, 'disabled', pw);
    logger.info(`User ${user.name} (${user.id}) created`);
    res.send({ user: user });
  });

  app.post('/login', async (req, res) => {
    const name = req.body.name;
    const pw = req.body.pw;
    const token = await issueToken(ctx, name, pw);
    logger.info(`User ${name} logged in`);
    res.send({ token: token });
  });

  setInterval(() => {
    Promise.all([
      checkForExpired(ctx)
    ]);
  }, 10000);

  app.listen(port, () => {
    logger.info(`Express server is running at https://localhost:${port}`);
  });
})();
