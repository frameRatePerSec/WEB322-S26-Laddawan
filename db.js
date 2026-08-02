const mongoose = require("mongoose");
const { Sequelize } = require("sequelize");
const pg = require("pg");
require("dotenv").config();

// PostgreSQL (Sequelize) Setup
const postgresUri = process.env.POSTGRES_URI || "";
const sequelize = new Sequelize(postgresUri, {
  dialect: "postgres",
  dialectModule: pg,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
  logging: false,
});

// Import Task Model
const Task = require("../models/Task")(sequelize);

// MongoDB (Mongoose) Connection Function
const connectMongo = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri || mongoUri.includes("<username>")) {
    console.warn("⚠️ Warning: MONGODB_URI is not configured in .env!");
    return;
  }
  try {
    await mongoose.connect(mongoUri);
    console.log("✅ Successfully connected to MongoDB Atlas");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
  }
};

// PostgreSQL (Sequelize) Sync Function
const connectPostgres = async () => {
  if (!postgresUri || postgresUri.includes("<username>") || postgresUri.includes("user:pass")) {
    console.warn("⚠️ Warning: POSTGRES_URI is not configured in .env!");
    return;
  }
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    console.log("✅ Successfully connected & synced PostgreSQL database");
  } catch (err) {
    console.error("❌ PostgreSQL connection error:", err.message);
  }
};

module.exports = {
  mongoose,
  sequelize,
  Task,
  connectMongo,
  connectPostgres,
};
