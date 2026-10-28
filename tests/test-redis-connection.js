require("dotenv").config();
const Redis = require("ioredis");

const host = process.env.REDIS_HOST;
const port = parseInt(process.env.REDIS_PORT);
const password = process.env.REDIS_PASSWORD;

console.log("🔍 TEST 1: Probando SIN TLS...\n");

// TEST 1: SIN TLS
const redis1 = new Redis({
  host,
  port,
  password,
  connectTimeout: 5000,
  lazyConnect: true, // No conectar automáticamente
});

redis1.on("ready", async () => {
  console.log("✅ ¡FUNCIONA SIN TLS!\n");
  console.log("Tu configuración correcta es:");
  console.log("  REDIS_TLS=false (o no incluir esta variable)\n");
  
  try {
    await redis1.set("test", "ok");
    console.log("✅ Escritura exitosa");
    redis1.quit();
    process.exit(0);
  } catch (error) {
    console.error("Error:", error.message);
    redis1.quit();
    process.exit(1);
  }
});

redis1.on("error", (err) => {
  console.log("❌ NO funciona sin TLS");
  console.log(`   Error: ${err.message}\n`);
  redis1.quit();
  
  // TEST 2: CON TLS
  console.log("🔍 TEST 2: Probando CON TLS...\n");
  
  const redis2 = new Redis({
    host,
    port,
    password,
    tls: {
      rejectUnauthorized: false,
    },
    connectTimeout: 5000,
  });

  redis2.on("ready", async () => {
    console.log("✅ ¡FUNCIONA CON TLS!\n");
    console.log("Tu configuración correcta es:");
    console.log("  REDIS_TLS=true\n");
    
    try {
      await redis2.set("test", "ok");
      console.log("✅ Escritura exitosa");
      redis2.quit();
      process.exit(0);
    } catch (error) {
      console.error("Error:", error.message);
      redis2.quit();
      process.exit(1);
    }
  });

  redis2.on("error", (err2) => {
    console.log("❌ Tampoco funciona con TLS");
    console.log(`   Error: ${err2.message}\n`);
    console.log("💡 Verifica:");
    console.log("   1. Host correcto en .env");
    console.log("   2. Puerto correcto en .env");
    console.log("   3. Password correcto en .env");
    console.log("   4. Que Redis Cloud esté activo\n");
    redis2.quit();
    process.exit(1);
  });
});

// Iniciar test
redis1.connect().catch(err => {
  console.error("Error inicial:", err.message);
});
