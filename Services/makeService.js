const axios = require("axios");
const config = require("../config");

class MakeService {
  async sendToMake(data) {
    if (!config.make.webhookUrl) {
      // Sin webhook configurado: no hay enlace secreto hardcodeado que disparar.
      console.warn("⚠️ MAKE_WEBHOOK_URL no configurado. Envío a Make omitido (no bloquea el flujo).");
      return { skipped: true, reason: "MAKE_WEBHOOK_URL not configured" };
    }
    try {
      const response = await axios.post(config.make.webhookUrl, data);
      return response.data;
    } catch (error) {
      console.error("Error enviando a Make:", error);
      throw error;
    }
  }
}

module.exports = new MakeService();
