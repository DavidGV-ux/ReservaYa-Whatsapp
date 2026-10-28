const Queue = require("bull");
const config = require("../config");

class QueueService {
  constructor() {
    // **Configuración CORRECTA de Redis para Bull**
    const redisConfig = {
      host: config.redis.host || "localhost",
      port: config.redis.port || 6379,
      password: config.redis.password,
    };

    // Solo agregar TLS si está explícitamente configurado
    if (config.redis.tls === true) {
      redisConfig.tls = {
        rejectUnauthorized: false,
      };
      console.log("Colas Redis con TLS habilitada");
    }

    // **Configuración de Bull para evitar locks**
    const bullSettings = {
      lockDuration: 30000, // 30 segundos
      stalledInterval: 5000, // Verificar cada 5 segundos
      maxStalledCount: 2, // Reintentar 2 veces si se estanca
    };

    // Cola para procesamiento de mensajes
    this.messageQueue = new Queue("messages", {
      redis: redisConfig,
      settings: bullSettings,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });

    // Cola para tareas pesadas (OpenAI)
    this.aiQueue = new Queue("ai-processing", {
      redis: redisConfig,
      settings: bullSettings,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 3000,
        },
        timeout: 60000,
      },
    });

    // Cola para webhooks externos (Make, etc.)
    this.webhookQueue = new Queue("webhooks", {
      redis: redisConfig,
      settings: bullSettings,
      limiter: {
        max: 10,
        duration: 1000,
      },
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      },
    });

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    // Eventos de la cola de mensajes
    this.messageQueue.on("completed", (job, result) => {
      console.log(`Mensaje procesado: ${job.id}`);
    });

    this.messageQueue.on("failed", (job, err) => {
      console.error(`Mensaje fallido: ${job.id}`, err.message);
    });

    this.messageQueue.on("stalled", (job) => {
      console.warn(`Mensaje estancado: ${job.id} - será reintentado`);
    });

    // Eventos de la cola AI
    this.aiQueue.on("completed", (job) => {
      console.log(`IA completada: ${job.id}`);
    });

    this.aiQueue.on("failed", (job, err) => {
      console.error(` IA fallida: ${job.id}`, err.message);
    });

    // Eventos de webhooks
    this.webhookQueue.on("completed", (job) => {
      console.log(` Webhook enviado: ${job.id}`);
    });
  }

  // Agregar mensaje a la cola
  async addMessage(data, priority = 0) {
    return await this.messageQueue.add(data, {
      priority, // 0 = normal, números más bajos = mayor prioridad
      jobId: `msg-${data.from}-${Date.now()}`, // ID único
    });
  }

  // Agregar procesamiento de IA
  async addAIProcessing(data) {
    return await this.aiQueue.add(data, {
      jobId: `ai-${data.userId}-${Date.now()}`,
    });
  }

  // Agregar webhook
  async addWebhook(data) {
    return await this.webhookQueue.add(data, {
      delay: 1000, // Retrasar 1 segundo para agrupar
    });
  }

  // Obtener estadísticas
  async getStats() {
    const [msgCounts, aiCounts, webhookCounts] = await Promise.all([
      this.messageQueue.getJobCounts(),
      this.aiQueue.getJobCounts(),
      this.webhookQueue.getJobCounts(),
    ]);

    return {
      messages: msgCounts,
      ai: aiCounts,
      webhooks: webhookCounts,
    };
  }

  // Limpiar colas
  async clean() {
    await Promise.all([
      this.messageQueue.clean(24 * 3600 * 1000), // Limpiar > 24 horas
      this.aiQueue.clean(24 * 3600 * 1000),
      this.webhookQueue.clean(24 * 3600 * 1000),
    ]);
    console.log("Colas limpiadas");
  }

  // Pausar procesamiento
  async pauseAll() {
    await Promise.all([
      this.messageQueue.pause(),
      this.aiQueue.pause(),
      this.webhookQueue.pause(),
    ]);
  }

  // Reanudar procesamiento
  async resumeAll() {
    await Promise.all([
      this.messageQueue.resume(),
      this.aiQueue.resume(),
      this.webhookQueue.resume(),
    ]);
  }
}

module.exports = new QueueService();
