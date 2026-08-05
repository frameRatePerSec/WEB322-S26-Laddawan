const mongoose = require("mongoose");
const { Sequelize } = require("sequelize");
const pg = require("pg");
require("dotenv").config();

// PostgreSQL (Sequelize) Setup
// Wrapped in try/catch: a failure here (e.g. the "pg" native dialect module
// not loading correctly in the serverless bundle) must NOT crash the whole
// process, since that used to take down every route, including the ones
// that only need MongoDB (register/login/home).
const postgresUri = process.env.POSTGRES_URI || "postgres://user:pass@localhost:5432/neondb";
let sequelize = null;
let Task = null;
try {
  sequelize = new Sequelize(postgresUri, {
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
  Task = require("../models/Task")(sequelize);
} catch (err) {
  console.error("❌ Failed to initialize PostgreSQL (Sequelize):", err.message);
}

// MongoDB (Mongoose) Connection Function
// Cached as a singleton promise so cold starts and route handlers can all
// `await connectMongo()` before touching the DB without opening duplicate
// connections or racing Mongoose's command buffering timeout.
let mongoConnectionPromise = null;

const connectMongo = () => {
  if (mongoose.connection.readyState === 1) {
    return Promise.resolve();
  }
  if (mongoConnectionPromise) {
    return mongoConnectionPromise;
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri || mongoUri.includes("<username>")) {
    console.warn("⚠️ Warning: MONGODB_URI is not configured in .env!");
    return Promise.resolve();
  }

  mongoConnectionPromise = mongoose
    .connect(mongoUri)
    .then(() => {
      console.log("✅ Successfully connected to MongoDB Atlas");
    })
    .catch((err) => {
      console.error("❌ MongoDB connection error:", err.message);
      mongoConnectionPromise = null; // allow the next call to retry
      throw err;
    });

  return mongoConnectionPromise;
};

// PostgreSQL (Sequelize) Sync Function
const connectPostgres = async () => {
  if (!sequelize) {
    return;
  }
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
