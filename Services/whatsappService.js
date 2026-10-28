const axios = require("axios");
const config = require("../config");

class WhatsAppService {
  constructor() {
    this.apiUrl = `${config.whatsapp.apiUrl}/${config.whatsapp.phoneId}/messages`;
    this.token = config.whatsapp.token;
  }

  async sendMessage(to, message) {
    try {
      const response = await axios.post(
        this.apiUrl,
        {
          messaging_product: "whatsapp",
          to: to,
          text: { body: message },
        },
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
        },
      );
      return response.data;
    } catch (error) {
      console.error(
        "Error enviando mensaje:",
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  async sendMediaMessage(to, type, mediaUrl, caption = "") {
    try {
      const response = await axios.post(
        this.apiUrl,
        {
          messaging_product: "whatsapp",
          to: to,
          type: type,
          [type]: {
            link: mediaUrl,
            caption: caption,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
        },
      );
      return response.data;
    } catch (error) {
      console.error(
        "Error enviando media:",
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  /**
   * Descargar imagen desde WhatsApp API
   * @param {string} mediaId - ID de la imagen en WhatsApp
   * @returns {Promise<Buffer>} - Buffer de la imagen
   */
  async downloadImage(mediaId) {
    try {
      if (!mediaId) {
        throw new Error('mediaId es requerido para descargar la imagen');
      }

      // La API de WhatsApp para obtener la URL del media es:
      // GET https://graph.facebook.com/v{version}/{media-id}
      // Primero extraer la versión de la API URL o usar v18.0 por defecto
      let baseApiUrl = config.whatsapp.apiUrl;
      
      // Si la URL contiene /messages, removerlo
      if (baseApiUrl.includes('/messages')) {
        baseApiUrl = baseApiUrl.split('/messages')[0];
      }
      
      // Si no tiene versión, agregar v18.0
      if (!baseApiUrl.match(/\/v\d+\.\d+/)) {
        // Extraer la base de graph.facebook.com
        const graphMatch = baseApiUrl.match(/(https?:\/\/[^\/]+)/);
        if (graphMatch) {
          baseApiUrl = `${graphMatch[1]}/v18.0`;
        } else {
          // Fallback: construir desde cero
          baseApiUrl = 'https://graph.facebook.com/v18.0';
        }
      }
      
      const mediaUrl = `${baseApiUrl}/${mediaId}`;
      
      console.log(`[WhatsApp] Descargando imagen desde: ${mediaUrl}`);
      
      const mediaResponse = await axios.get(mediaUrl, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
        timeout: 30000, // 30 segundos timeout
      });

      if (!mediaResponse.data || !mediaResponse.data.url) {
        console.error('[WhatsApp] Respuesta inválida al obtener URL de imagen:', mediaResponse.data);
        throw new Error("No se pudo obtener la URL de la imagen. Respuesta: " + JSON.stringify(mediaResponse.data));
      }

      const imageUrl = mediaResponse.data.url;
      console.log(`[WhatsApp] Descargando imagen desde URL: ${imageUrl.substring(0, 100)}...`);

      // Descargar la imagen
      const imageResponse = await axios.get(imageUrl, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
        responseType: 'arraybuffer',
        maxContentLength: 20 * 1024 * 1024, // 20MB máximo
        maxBodyLength: 20 * 1024 * 1024,
        timeout: 60000, // 60 segundos timeout para descargar
      });

      if (!imageResponse.data || imageResponse.data.length === 0) {
        throw new Error('La imagen descargada está vacía');
      }

      const buffer = Buffer.from(imageResponse.data);
      console.log(`[WhatsApp] Imagen descargada exitosamente: ${buffer.length} bytes`);
      
      return buffer;
    } catch (error) {
      console.error('[WhatsApp] Error descargando imagen:', {
        mediaId: mediaId,
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
      throw error;
    }
  }

  verifyWebhook(mode, token) {
    return mode === "subscribe" && token === config.whatsapp.verifyToken;
  }
}

module.exports = new WhatsAppService();
