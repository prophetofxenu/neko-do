import { Sequelize, DataTypes } from 'sequelize';


function user(sequelize: Sequelize) {
  return sequelize.define('User', {
    name: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true
    },
    type: {
      // disabled
      // room
      // admin
      type: DataTypes.STRING(20),
      allowNull: false
    },
    password: {
      type: DataTypes.STRING(60),
      allowNull: false
    },
  });
}
export default user;
