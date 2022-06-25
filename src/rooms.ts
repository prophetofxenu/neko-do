import logger from 'winston';
import { Context } from './types';
import { dateDelta, dropletId } from './util';


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

  return {
    id: room.id
  }

}


export async function deleteRoom(ctx: Context, dropletId: number) {

  const room = await ctx.db.Room.findByPk(dropletId);
  const deleteResult = await ctx.do.droplets.deleteById(room.do_id);
  logger.debug('Droplet deletion request sent', deleteResult);
  await room.destroy();
  logger.debug('Droplet removed from db');

  return { ok: true, id: room.id };

}
