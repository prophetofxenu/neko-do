import { Sequelize, DataTypes } from 'sequelize';


function room(sequelize: Sequelize) {
  return sequelize.define('Room', {
    name: {
      type: DataTypes.STRING(18),
      allowNull: false
    },
    status: {
      type: DataTypes.STRING(30),
      defaultValue: 'submitted',
    },
    step: {
      type: DataTypes.INTEGER,
      defaultValue: 0
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
    image: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    resolution: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    fps: {
      type: DataTypes.INTEGER,
      allowNull: false,
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
