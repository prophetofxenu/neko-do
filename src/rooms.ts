import logger from 'winston';
import { Op } from 'sequelize';
import genProvisionScript, { makeProvisionOpts, ProvisionOptions } from './provision';
import { Context } from './types';
import { dateDelta, dropletId, randomPw } from './util';
import axios from 'axios';
import { createUser } from './auth';


export const READY_STEP = 7;
export const DESTROYED_STEP = READY_STEP + 3;


export async function getStatus(ctx: Context, id: number) {
  logger.debug(`Querying info for room ${id}`);
  const room = await ctx.db.Room.findByPk(id);
  if (!room) {
    logger.warn(`Room ${id} not found during querying of status`);
  }
  return room;
}


export async function updateIp(ctx: Context, id: number) {
  logger.debug(`Getting IP address for room ${id}`);
  const room = await ctx.db.Room.findByPk(id);
  if (!room) {
    logger.warn(`Room ${id} not found during updating of IP`);
    return null;
  }
  const dropletResult = await ctx.do.droplets.getById(room.do_id.toString());
  logger.debug('Result of IP retrieval', dropletResult);

  if (dropletResult.droplet.status !== 'active') {
    logger.debug('Droplet still not ready, retrying in 20s');
    setTimeout(async () => {
      await updateIp(ctx, id);
    }, 20000);
    return room;
  }

  const ip = dropletResult.droplet.networks.v4[0].ip_address;
  room.ip = ip;
  room.step = 2;
  room.status = 'ip_acquired'
  await room.save();

  return await createDomainEntry(ctx, id);
}


export async function createDomainEntry(ctx: Context, id: number) {
  logger.debug(`Creating domain entry for room ${id}`);
  const room = await ctx.db.Room.findByPk(id);
  if (!room) {
    logger.warn(`Room ${id} not found during creation of domain entry`);
    return null;
  }
  if (room.url !== null) {
    logger.debug(`Domain entry already in db for room ${id}`);
    return room;
  }

  const recordResult = await ctx.do.domains.createRecord(ctx.info.domain, {
    type: 'A',
    name: room.name,
    data: room.ip
  });
  logger.debug('Result of domain entry creation', recordResult);
  room.url = `${room.name}.${ctx.info.domain}`;
  room.record_id = recordResult.domain_record.id;
  room.step = 3;
  room.status = 'record_created';
  await room.save();
  return room;
}


export async function createRoom(ctx: Context, opts: ProvisionOptions) {
  const name = `neko-room-${dropletId()}`;
  const provisionOptions = makeProvisionOpts(opts);
  logger.debug(`Provision options for ${name}`, provisionOptions);
  const room = await ctx.db.Room.create({
    name: name,
    status: 'submitted',
    step: 1,
    image: provisionOptions.image,
    resolution: provisionOptions.resolution,
    fps: provisionOptions.fps,
    password: provisionOptions.password,
    admin_password: provisionOptions.adminPassword,
    expires: dateDelta(new Date(), 60 * 60 + 2)
  });
  await room.save();
  logger.debug(`Room ${room.id} saved to db`);
  return room;
}


export async function provisionRoom(ctx: Context, room: any,
  projectId: string, sshKeyPrint: string) {

  const roomPw = randomPw(10);
  const roomUser = await createUser(ctx, room.name, 'room', roomPw);

  const provisionOptions: ProvisionOptions = {
    image: room.image,
    resolution: room.resolution,
    fps: room.fps,
    password: room.password,
    adminPassword: room.admin_password,
  };
  const provisionScript = genProvisionScript(provisionOptions, ctx.info.domain, room.name, room.name, roomPw);

  const createResult = await ctx.do.droplets.create({
    name: room.name,
    region: 'nyc1',
    size: 's-4vcpu-8gb',
    image: `${ctx.info.snapshotId}`,
    ssh_keys: [ sshKeyPrint ],
    monitoring: true,
    tags: [ 'neko' ],
    user_data: provisionScript
  });
  logger.debug('Droplet request sent', createResult);
  room.do_id = createResult.droplet.id;
  room.expires = dateDelta(new Date(), 60 * 60 * 2);
  await room.save();
  logger.debug('Droplet saved to db');

  const projAssociationResult = await ctx.do.projects.addResources(
    projectId,
    [ `do:droplet:${createResult.droplet.id}` ]
  );
  logger.debug('Droplet associated with project', projAssociationResult);

  setTimeout(async () => {
    await updateIp(ctx, room.id);
  }, 45000);

  return room;

}


export async function renewRoom(ctx: Context, id: number) {

  const room = await ctx.db.Room.findByPk(id);
  if (!room) {
    logger.warn(`Room ${id} not found during renewal`);
    return null;
  }
  if (room.status !== 'ready') {
    logger.warn(`Tried to renew room ${id} but it is not ready`);
    return room;
  }

  const diff = Number(room.expires) - Number(new Date());
  if (diff < 0) {
    logger.info(`Tried to renew room ${id} but it has expired`);
    return room;
  }
  if (diff > 3600 * 1000) {
    logger.info(`Tried to renew room ${id} but it still has more than an hour left`);
    return room;
  }
  room.expires = dateDelta(new Date(), 3600);
  await room.save();
  logger.info(`Expiration time for room ${id} set to one hour from now`);
  return room;

}


async function deleteDomainEntry(ctx: Context, id: number) {
  logger.debug(`Deleting domain entry for room ${id}`);
  const room = await ctx.db.Room.findByPk(id);
  if (!room) {
    logger.warn(`Room ${id} not found during deletion of domain entry`);
    return null;
  }
  const deleteResult = await ctx.do.domains.deleteRecord(ctx.info.domain, room.record_id);
  logger.debug('Domain entry deletion', deleteResult);
  room.step = READY_STEP + 1;
  room.status = 'record_destroyed';
  await room.save();
  logger.debug(`Domain entry removed for room ${id}`);
}


export async function markRoomForDeletion(ctx: Context, id: number) {
  const room = await ctx.db.Room.findByPk(id);
  if (!room) {
    logger.warn(`Room ${id} not found during mark for deletion`);
    return null;
  }

  room.step++;
  room.status = 'decommissioning';
  await room.save();
  return room;
}


export async function deleteRoom(ctx: Context, id: number) {

  await deleteDomainEntry(ctx, id);

  const room = await ctx.db.Room.findByPk(id);
  if (!room) {
    logger.warn(`Room ${id} not found during deletion`);
    return null;
  }
  const deleteResult = await ctx.do.droplets.deleteById(room.do_id);
  logger.debug('Droplet deletion request sent', deleteResult);
  room.step = DESTROYED_STEP;
  room.status = 'destroyed';
  await room.save();
  logger.debug('Droplet removed from db');
  logger.info(`Room ${id} destroyed`);

  return room;

}


export async function updateRoomStatus(ctx: Context, id: number, body: any) {
  const room = await ctx.db.Room.findByPk(id);
  room.status = body.status;
  room.step = body.step;
  await room.save();
  logger.info(`Room ${id} status updated: ${body.status} (${body.step})`);
}


export async function checkProvisioningStatus(ctx: Context) {

  logger.debug('Check provisioning status of in progress rooms');
  const inProgressRooms = await ctx.db.Room.findAll({
    where: {
      status: {
        [Op.notIn]: [
          'ready',
          'destroyed',
          'record_destroyed'
        ]
      },
      ip: {
        [Op.not]: null
      }
    }
  });

  for (const room of inProgressRooms) {
    logger.debug(`Checking provision status of room ${room.id}`);
    try {
      const res = await axios.get(`http://${room.ip}:6969`, { timeout: 250 });
      logger.debug(`Status of room ${room.id}: ${res.data}`);
      const [ _, step, status ] = res.data.match(/^(\d+):(.+)$/m);
      if (step !== room.step) {
        room.step = parseInt(step);
        room.status = status;
        await room.save();
        if (status === 'ready') {
          logger.info(`Room ${room.id} is ready`);
        }
      }
    } catch (error) {
      logger.error(error);
      continue;
    }
  }

}


export async function checkForExpired(ctx: Context) {

  logger.debug('Checking for expired rooms');
  const expiredRooms = await ctx.db.Room.findAll({
    where: {
      status: 'ready',
      expires: {
        [Op.lt]: new Date()
      }
    }
  });

  const promises = [];
  for (const room of expiredRooms) {
    logger.info(`Room ${room.id} has expired, removing`);
    promises.push(deleteRoom(ctx, room.id));
  }
  await Promise.all(promises);

}
