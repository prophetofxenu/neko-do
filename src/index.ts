import bodyParser from 'body-parser';
import express, { Express, Request, Response } from 'express';
import DigitalOcean from 'do-wrapper';
import dotenv from 'dotenv';
import { Sequelize } from 'sequelize';
import logger from 'winston';
import { checkForExpired, checkProvisioningStatus, provisionRoom, deleteRoom, getStatus, renewRoom, updateIp, createRoom } from './rooms';

import room from './models/room';
import user from './models/user';

import { checkProject } from './project';
import { Context } from './types';
import { bearerToJwt, checkPw, checkType, createUser, issueToken, loadSigningKey } from './auth';


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
  Room: room(sequelize),
  User: user(sequelize)
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

(async () => {
  const signingKey = await loadSigningKey();

  const ctx: Context = {
    db: db,
    do: digiocean,
    info: {
      domain: domain,
      doProjName: doProjName,
      sshKeyPrint: sshKeyPrint,
      signingKey: signingKey
    }
  };

  await sequelize.sync({ alter: true });

  const projectId = await checkProject(digiocean, doProjName);
  logger.info(`Using DO project ${doProjName} (${projectId})`);

  app.get('/room/:id', async (req, res) => {

    const jwt = bearerToJwt(ctx, req.headers.authorization);
    if (!jwt || checkType(jwt, 'disabled')) {
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
    const room = await createRoom(ctx, provisionOptions);
    res.send({ room: room });
    await provisionRoom(ctx, room, projectId, sshKeyPrint);
  });

  app.put('/room/:id', async (req, res) => {

    const jwt = bearerToJwt(ctx, req.headers.authorization);
    if (!jwt || !checkType(jwt, 'admin')) {
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
      res.status(403).send({ error: 'Unauthorized' });
      return;
    }

    const id = parseInt(req.params.id);
    const room = await deleteRoom(ctx, id);
    res.send({ room: room });
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
      checkProvisioningStatus(ctx),
      checkForExpired(ctx)
    ]);
  }, 10000);

  app.listen(port, () => {
    logger.info(`Express server is running at https://localhost:${port}`);
  });
})();
