import logger from 'winston';


export async function checkProject(digiocean: any, projectName: string) {
  logger.debug('Getting projectId');
  const currentProjects = await digiocean.projects.getAll();
  logger.debug('Current projects', currentProjects);
  for (const p of currentProjects.projects) {
    if (p.name === projectName) {
      return p.id;
    }
  }
  return null;
}
