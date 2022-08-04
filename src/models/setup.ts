import { Sequelize } from 'sequelize';
import room from './room';
import user from './user';


function setupDb(sequelize: Sequelize) {
  const _room = room(sequelize);
  const _user = user(sequelize);

  // this is ass backwards
  _user.hasOne(_room, {
    foreignKey: 'user_id'
  });

  return {
    Room: _room,
    User: _user
  };
}
export default setupDb;
