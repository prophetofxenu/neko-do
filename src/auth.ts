import logger from 'winston';
import bcrypt from 'bcrypt';
import njwt from 'njwt';
import fs from 'fs/promises';
import secureRandom from 'secure-random';
import { Context } from './types';


const SALT_ROUNDS = 10;
const EXPIRATION_HOURS = 12;


export async function createHash(pw: string) {
  return await bcrypt.hash(pw, SALT_ROUNDS);
}


export async function createUser(ctx: Context, name: string, type: string, pw: string) {
  if (!['disabled', 'room', 'admin'].includes(type)) {
    logger.error(`Tried to create an invalid type: ${type}`);
    throw 'Invalid user type';
  }

  const hash = await createHash(pw);
  const user = await ctx.db.User.create({
    name: name,
    type: type,
    password: hash
  });
  await user.save();
  logger.info(`Created user ${name} (${user.id})`)
  return user;
}


export async function checkPw(ctx: Context, id: number, pw: string) {
  const user = await ctx.db.User.findByPk(id);
  if (!user) {
    logger.error(`User ${id} does not exist`);
    return false;
  }
  return await bcrypt.compare(pw, user.password);
}


export async function requireTypeDb(ctx: Context, id: number, type: string) {
  const user = await ctx.db.User.findByPk(id);
  if (!user) {
    logger.error(`User ${id} does not exist`);
    throw `User ${id} does not exist`;
  }
  return type == user.type;
}


// JWT stuff


export function bearerToJwt(ctx: Context, headerContent: string | undefined) {
  if (!headerContent) {
    logger.warn('Bearer token was missing');
    return null;
  }
  const matches = headerContent.match(/^Bearer ([A-z0-9.+/=-]+)$/);
  if (matches?.length !== 2) {
    logger.warn('Bearer token was invalid');
    return null;
  }
  const jwt = verifyToken(ctx, matches[1]);
  if (jwt?.isExpired()) {
    logger.warn('JWT was expired');
    return null;
  }
  return jwt;
}


export async function loadSigningKey(keyPath?: string): Promise<Buffer> {
  const path = keyPath || 'signing_key.key';
  try {
    const f = await fs.open(path);
    logger.info(`Signing key at ${path} opened`);
    const data = (await f.read()).buffer;
    await f.close();
    return data;
  } catch (e) {
    logger.info(`Signing key at ${path} does not exist`);
    return await generateSigningKey(keyPath || 'signing_key.key');
  }
}


export async function generateSigningKey(keyPath: string): Promise<Buffer> {
  const key = secureRandom(256, { type: 'Buffer' });
  await fs.writeFile(keyPath, key);
  logger.info(`Signing key generated and written to ${keyPath}`);
  return key;
}


export async function issueToken(ctx: Context, name: string, pw: string) {
  const user = await ctx.db.User.findOne({
    where: {
      name: name
    }
  });
  if (!user) {
    logger.error(`User (name=${name}) does not exist`);
    return null;
  }

  if (!await checkPw(ctx, user.id, pw)) {
    logger.warn(`Incorrect password for user ${user.id}`);
    return null;
  }

  const claims = {
    iss: 'neko-do',
    sub: user.id,
    aud: user.id,
    userType: user.type
  };
  const jwt = njwt.create(claims, ctx.info.signingKey);
  jwt.setExpiration(new Date().getTime() + EXPIRATION_HOURS * 60 * 60 * 1000);
  logger.debug(`Token created for user ${user.id}`);
  return jwt.compact();
}


export function verifyToken(ctx: Context, token: string) {
  try {
    const verifiedJwt = njwt.verify(token, ctx.info.signingKey);
    return verifiedJwt;
  } catch (error) {
    logger.error(error);
  }
}


export function checkType(jwt: njwt.Jwt, type: string): boolean {
  const body: any = jwt.body as object;
  return body.userType === type;
}
