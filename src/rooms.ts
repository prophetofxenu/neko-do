import logger from 'winston';
import { Op } from 'sequelize';
import genProvisionScript, { ProvisionOptions } from './provision';
import { Context } from './types';
import { dateDelta, dropletId } from './util';
import axios from 'axios';


export async function updateIp(ctx: Context, id: number) {
  logger.debug(`Getting IP address for room ${id}`);
  const room = await ctx.db.Room.findByPk(id);
  const dropletResult = await ctx.do.droplets.getById(room.do_id.toString());
  logger.debug('Result of IP retrieval', dropletResult);

  if (dropletResult.droplet.status !== 'active') {
    logger.debug('Droplet still not ready, retrying in 20s');
    setTimeout(async () => {
      await updateIp(ctx, id);
    }, 20000);
    return;
  }

  const ip = dropletResult.droplet.networks.v4[0].ip_address;
  room.ip = ip;
  await room.save();

  await createDomainEntry(ctx, id);
}


export async function createDomainEntry(ctx: Context, id: number) {
  logger.debug(`Creating domain entry for room ${id}`);
  const room = await ctx.db.Room.findByPk(id);
  if (room.url !== null) {
    logger.debug(`Domain entry already in db for room ${id}`);
    return;
  }

  const recordResult = await ctx.do.domains.createRecord(ctx.info.domain, {
    type: 'A',
    name: room.name,
    data: room.ip
  });
  logger.debug('Result of domain entry creation', recordResult);
  room.url = `${room.name}.${ctx.info.domain}`;
  room.record_id = recordResult.domain_record.id;
  room.status = 'record_created';
  await room.save();
}


export async function createRoom(ctx: Context, provisionOptions: ProvisionOptions,
  projectId: string, sshKeyPrint: string) {

  const name = `neko-room-${dropletId()}`;
  const provisionScript = genProvisionScript(provisionOptions, ctx.info.domain, name);

  const createResult = await ctx.do.droplets.create({
    name: name,
    region: 'nyc1',
    size: 's-4vcpu-8gb',
    image: 'ubuntu-20-04-x64',
    ssh_keys: [ sshKeyPrint ],
    monitoring: true,
    tags: [ 'neko' ],
    user_data: provisionScript
  });
  logger.debug('Droplet request sent', createResult);
  const room = await ctx.db.Room.create({
    name: createResult.droplet.name,
    status: 'submitted',
    do_id: createResult.droplet.id,
    password: provisionOptions.password,
    admin_password: provisionOptions.adminPassword,
    expires: dateDelta(new Date(), 7200)
  });
  logger.debug('Droplet saved to db');

  const projAssociationResult = await ctx.do.projects.addResources(
    projectId,
    [ `do:droplet:${createResult.droplet.id}` ]
  );
  logger.debug('Droplet associated with project', projAssociationResult);

  setTimeout(async () => {
    await updateIp(ctx, room.id);
  }, 45000);

  return {
    id: room.id
  };

}


async function deleteDomainEntry(ctx: Context, id: number) {
  logger.debug(`Deleting domain entry for room ${id}`);
  const room = await ctx.db.Room.findByPk(id);
  const deleteResult = await ctx.do.domains.deleteRecord(ctx.info.domain, room.record_id);
  logger.debug('Domain entry deletion', deleteResult);
  room.status = 'record_destroyed';
  await room.save();
  logger.debug(`Domain entry removed for room ${id}`);
}


export async function deleteRoom(ctx: Context, id: number) {

  await deleteDomainEntry(ctx, id);

  const room = await ctx.db.Room.findByPk(id);
  const deleteResult = await ctx.do.droplets.deleteById(room.do_id);
  logger.debug('Droplet deletion request sent', deleteResult);
  room.status = 'destroyed';
  await room.save();
  logger.debug('Droplet removed from db');

  return { ok: true, id: room.id };

}


export async function checkProvisioningStatus(ctx: Context) {

  logger.debug('Check provisioning status of in progress rooms');
  const inProgressRooms = await ctx.db.Room.findAll({
    where: {
      status: {
        [Op.or]: {
          [Op.eq]: 'record_created'
        }
      }
    }
  });

  for (const room of inProgressRooms) {
    logger.debug(`Checking provision status of room ${room.id}`);
    try {
      const status = await axios.get(`https://${room.url}`, { timeout: 1000 });
      switch (status.status) {
      case 200:
        room.status = 'active';
        await room.save();
        logger.info(`Room ${room.id} is ready`)
        break;
      case 502:
        room.status = 'proxy_ready';
        await room.save();
        logger.info(`Proxy ready on ${room.id}`)
        break;
      }
    } catch (error) {
      continue;
    }
  }

}
