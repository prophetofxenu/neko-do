import { Sequelize, DataTypes } from 'sequelize';


function room(sequelize: Sequelize) {
  return sequelize.define('Room', {
    name: {
      type: DataTypes.STRING(18),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM,
      values: [
        'submitted',
        'record_created',
        'proxy_ready',
        'active',
        'record_destroyed',
        'destroyed'
      ],
      defaultValue: 'submitted',
    },
    do_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    ip: {
      type: DataTypes.STRING(15),
    },
    url: {
      type: DataTypes.STRING,
    },
    record_id: {
      type: DataTypes.INTEGER,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    admin_password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    expires: {
      type: DataTypes.DATE
    }
  });
}
export default room;
