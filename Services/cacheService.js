// Services/cacheService.js - ADAPTADO PARA LAMBDA (solo caché, sin colas)
const Redis = require("ioredis");
const NodeCache = require("node-cache");
const config = require("../config");

class CacheService {
  constructor() {
    // Configuración de Redis
    const redisOptions = {
      host: config.redis.host || "localhost",
      port: config.redis.port || 6379,
      password: config.redis.password,
      retryStrategy: (times) => {
        if (times > 3) {
          console.error("Redis: No se pudo conectar después de 3 intentos");
          return null;
        }
        return Math.min(times * 50, 2000);
      },
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      enableReadyCheck: true,
      lazyConnect: true,  // ⚠️ IMPORTANTE para Lambda
    };

    if (config.redis.tls) {
      redisOptions.tls = config.redis.tls;
      console.log("Redis con TLS habilitado");
    }

    this.redis = new Redis(redisOptions);

    // Caché local (funciona sin Redis)
    this.localCache = new NodeCache({
      stdTTL: 300,
      checkperiod: 60,
      maxKeys: 1000,
    });

    this.redis.on("error", (err) => {
      console.error("Redis Error:", err.message);
    });

    this.redis.on("ready", () => {
      console.log("✅ Redis conectado");
    });
    
    // ⚠️ IMPORTANTE: Conectar manualmente en Lambda
    if (config.redis.enabled) {
      this.redis.connect().catch(err => {
        console.warn("⚠️ Redis no disponible, usando solo caché local:", err.message);
      });
    }
  }

  // Obtener perfil de usuario (caché de 2 niveles)
  async getUserProfile(phoneNumber) {
    const key = `profile:${phoneNumber}`;
    
    // 1. Intentar caché local primero
    const localData = this.localCache.get(key);
    if (localData) {
      console.log(`✅ Cache LOCAL hit: ${phoneNumber}`);
      return localData;
    }

    // 2. Intentar Redis
    if (config.redis.enabled) {
      try {
        const redisData = await this.redis.get(key);
        if (redisData) {
          const parsed = JSON.parse(redisData);
          this.localCache.set(key, parsed);
          console.log(`✅ Cache REDIS hit: ${phoneNumber}`);
          return parsed;
        }
      } catch (error) {
        console.warn("⚠️ Redis no disponible, continuando sin caché:", error.message);
      }
    }

    return null;
  }

  async setUserProfile(phoneNumber, profile, ttl = 1800) {
    const key = `profile:${phoneNumber}`;
    
    // Guardar en caché local siempre
    this.localCache.set(key, profile, ttl);
    
    // Intentar guardar en Redis
    if (config.redis.enabled) {
      try {
        await this.redis.setex(key, ttl, JSON.stringify(profile));
        console.log(`✅ Perfil cacheado: ${phoneNumber}`);
      } catch (error) {
        console.warn("⚠️ Redis no disponible para guardar:", error.message);
      }
    }
  }

  async invalidateUserCache(phoneNumber) {
    const key = `profile:${phoneNumber}`;
    this.localCache.del(key);
    
    if (config.redis.enabled) {
      try {
        await this.redis.del(key);
        console.log(`✅ Caché invalidado: ${phoneNumber}`);
      } catch (error) {
        console.warn("⚠️ Redis no disponible para invalidar:", error.message);
      }
    }
  }

  async getStats() {
    const localStats = this.localCache.getStats();
    
    let redisStatus = "disabled";
    if (config.redis.enabled) {
      redisStatus = this.redis.status;
    }
    
    return {
      local: localStats,
      redis: {
        enabled: config.redis.enabled,
        status: redisStatus,
      },
    };
  }
  
  // ⚠️ IMPORTANTE: Cerrar conexión Redis al finalizar Lambda
  async close() {
    if (this.redis && config.redis.enabled) {
      try {
        await this.redis.quit();
        console.log("✅ Redis conexión cerrada");
      } catch (error) {
        console.warn("⚠️ Error cerrando Redis:", error.message);
      }
    }
  }
}

module.exports = new CacheService();
