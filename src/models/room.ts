import { Sequelize, DataTypes } from 'sequelize';


function room(sequelize: Sequelize) {
  return sequelize.define('Room', {
    name: {
      type: DataTypes.STRING(18),
      allowNull: false
    },
    do_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    ip: {
      type: DataTypes.STRING(15),
    },
    expires: {
      type: DataTypes.DATE
    }
  });
}
export default room;
