require("dotenv").config();
const Redis = require("ioredis");
const config = require("./config");

const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
});

console.log("🧹 Limpiando TODA la base de datos Redis...\n");

redis.on("ready", async () => {
  try {
    // Eliminar TODAS las claves
    await redis.flushdb();
    console.log("✅ Redis limpiado completamente\n");
    console.log("💡 Ahora:");
    console.log("  1. Inicia el worker: node workers/messageWorker.js");
    console.log("  2. Inicia el servidor: node index.js");
    console.log("  3. Envía un mensaje NUEVO de WhatsApp\n");
    
    redis.quit();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    redis.quit();
    process.exit(1);
  }
});

redis.on("error", (err) => {
  console.error("❌ Error conectando a Redis:", err.message);
  process.exit(1);
});
