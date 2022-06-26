import logger from 'winston';
import { Context } from './types';
import { dateDelta, dropletId } from './util';


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
}


export async function createRoom(ctx: Context, projectId: string, sshKeyPrint: string) {

  const createResult = await ctx.do.droplets.create({
    name: `neko-room-${dropletId()}`,
    region: 'nyc1',
    size: 's-4vcpu-8gb',
    image: 'ubuntu-20-04-x64',
    ssh_keys: [ sshKeyPrint ],
    monitoring: true,
    tags: [ 'neko' ]
  });
  logger.debug('Droplet request sent', createResult);
  const room = await ctx.db.Room.create({
    name: createResult.droplet.name,
    do_id: createResult.droplet.id,
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


export async function deleteRoom(ctx: Context, dropletId: number) {

  const room = await ctx.db.Room.findByPk(dropletId);
  const deleteResult = await ctx.do.droplets.deleteById(room.do_id);
  logger.debug('Droplet deletion request sent', deleteResult);
  await room.destroy();
  logger.debug('Droplet removed from db');

  return { ok: true, id: room.id };

}
