// Services/searchService.js - OPTIMIZADO PARA LAMBDA Y TU ESQUEMA
const createPostgrestClient = require("./postgrestClient");

class SearchService {
  constructor() {
    this.supabase = createPostgrestClient();
    
    // Caché local para Lambda (ephemeral)
    this.searchCache = new Map();
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutos
  }

  /**
   * Detectar si el mensaje requiere búsqueda en historial
   */
  needsContextSearch(userMessage) {
    const messageLower = userMessage.toLowerCase();
    
    // Palabras clave que indican referencia a conversaciones anteriores
    const contextKeywords = [
      'dijiste', 'mencionaste', 'hablamos', 'conversación anterior',
      'antes', 'lo que me', 'cuando te pregunté', 'recuerdo',
      'anterior', 'última vez', 'me dijiste que', 'contexto',
      'hace rato', 'ayer', 'la otra vez', 'referencia'
    ];

    const needsSearch = contextKeywords.some(keyword => 
      messageLower.includes(keyword)
    );

    // También buscar si hace preguntas sobre sus propias respuestas
    const selfReferencePatterns = [
      /qué (dije|comenté|mencioné)/i,
      /cuánto (te dije|mencioné)/i,
      /cuál (era|fue) (mi|el)/i,
      /me (dijiste|recomendaste|sugeriste)/i
    ];

    const hasSelfReference = selfReferencePatterns.some(pattern =>
      pattern.test(userMessage)
    );

    return needsSearch || hasSelfReference;
  }

  /**
   * Extraer términos de búsqueda del mensaje
   */
  extractSearchTerms(userMessage) {
    // Eliminar palabras comunes (stop words)
    const stopWords = new Set([
      'el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'ser', 'se', 'no',
      'haber', 'por', 'con', 'su', 'para', 'como', 'estar', 'tener',
      'le', 'lo', 'todo', 'pero', 'más', 'hacer', 'o', 'poder', 'decir',
      'este', 'ir', 'otro', 'ese', 'la', 'si', 'me', 'ya', 'ver', 'porque',
      'dar', 'cuando', 'él', 'muy', 'sin', 'vez', 'mucho', 'saber', 'qué',
      'sobre', 'mi', 'alguno', 'mismo', 'yo', 'también', 'hasta', 'año',
      'dos', 'querer', 'entre', 'así', 'primero', 'desde', 'grande', 'eso',
      'ni', 'nos', 'llegar', 'pasar', 'tiempo', 'ella', 'sí', 'día', 'uno',
      'bien', 'poco', 'deber', 'entonces', 'poner', 'cosa', 'tanto', 'hombre',
      'parecer', 'nuestro', 'tan', 'donde', 'ahora', 'parte', 'después', 'vida',
      'quedar', 'siempre', 'creer', 'hablar', 'llevar', 'dejar', 'nada', 'cada',
      'seguir', 'menos', 'nuevo', 'encontrar', 'algo', 'solo', 'decir', 'casa',
      'usar', 'tal', 'otro', 'momento'
    ]);

    // Extraer palabras significativas
    const words = userMessage
      .toLowerCase()
      .replace(/[^\wáéíóúñü\s]/g, ' ')
      .split(/\s+/)
      .filter(word => 
        word.length > 3 && 
        !stopWords.has(word) &&
        !/^\d+$/.test(word) // Excluir solo números
      );

    // Tomar las 5 palabras más largas (suelen ser más específicas)
    const terms = words
      .sort((a, b) => b.length - a.length)
      .slice(0, 5);

    return terms;
  }

  /**
   * Búsqueda principal usando función de Postgres
   */
  async searchUserConversations(userPhone, searchTerm, limit = 5) {
    try {
      const cacheKey = `${userPhone}:${searchTerm}`;
      const cached = this.searchCache.get(cacheKey);
      
      // Verificar caché
      if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
        console.log(`✅ Cache hit: ${cacheKey}`);
        return cached.results;
      }

      console.log(`🔍 Buscando: "${searchTerm}" para ${userPhone}`);

      // Llamar función de Postgres optimizada
      const { data, error } = await this.supabase
        .rpc('buscar_conversaciones_usuario', {
          p_user_phone: userPhone,
          p_search_term: searchTerm,
          p_limit: limit
        });

      if (error) {
        console.error('Error en búsqueda:', error);
        // Fallback a búsqueda simple
        return await this.searchSimple(userPhone, searchTerm, limit);
      }

      const results = data || [];
      console.log(`📊 Encontrados ${results.length} resultados`);

      // Guardar en caché
      this.searchCache.set(cacheKey, {
        results,
        timestamp: Date.now()
      });

      // Limpiar caché antigua
      this.cleanCache();

      return results;

    } catch (error) {
      console.error('Error en searchUserConversations:', error);
      return [];
    }
  }

  /**
   * Búsqueda con múltiples términos
   */
  async searchMultipleTerms(userPhone, terms, limit = 5) {
    try {
      if (!terms || terms.length === 0) {
        return [];
      }

      console.log(`🔎 Búsqueda múltiple: [${terms.join(', ')}]`);

      const { data, error } = await this.supabase
        .rpc('buscar_conversaciones_terminos', {
          p_user_phone: userPhone,
          p_terms: terms,
          p_limit: limit
        });

      if (error) {
        console.error('Error en búsqueda múltiple:', error);
        // Fallback: buscar con el primer término
        return await this.searchUserConversations(userPhone, terms[0], limit);
      }

      return data || [];

    } catch (error) {
      console.error('Error en searchMultipleTerms:', error);
      return [];
    }
  }

  /**
   * Búsqueda simple (fallback)
   */
  async searchSimple(userPhone, searchTerm, limit = 5) {
    try {
      const { data, error } = await this.supabase
        .from('conversaciones')
        .select('id, mensaje, respuesta, fecha')
        .eq('user_phone', userPhone)
        .or(`mensaje.ilike.%${searchTerm}%,respuesta.ilike.%${searchTerm}%`)
        .order('fecha', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data || [];

    } catch (error) {
      console.error('Error en searchSimple:', error);
      return [];
    }
  }

  /**
   * Búsqueda inteligente (método principal)
   */
  async smartSearch(userPhone, userMessage, limit = 5) {
    try {
      console.log(`🧠 SmartSearch para: ${userPhone}`);

      // 1. Extraer términos de búsqueda
      const terms = this.extractSearchTerms(userMessage);
      
      if (terms.length === 0) {
        console.log('⚠️ No se encontraron términos de búsqueda');
        return [];
      }

      console.log(`📝 Términos extraídos: [${terms.join(', ')}]`);

      // 2. Búsqueda con múltiples términos
      let results = await this.searchMultipleTerms(userPhone, terms, limit);

      // 3. Si no hay resultados, buscar con el mensaje completo
      if (results.length === 0 && userMessage.length < 100) {
        console.log('🔄 Reintentando con mensaje completo');
        results = await this.searchUserConversations(
          userPhone,
          userMessage,
          limit
        );
      }

      return results;

    } catch (error) {
      console.error('Error en smartSearch:', error);
      return [];
    }
  }

  /**
   * Obtener contexto reciente (útil para mantener coherencia)
   */
  async getRecentContext(userPhone, limit = 10) {
    try {
      const { data, error } = await this.supabase
        .rpc('obtener_contexto_reciente', {
          p_user_phone: userPhone,
          p_limit: limit
        });

      if (error) {
        console.error('Error obteniendo contexto:', error);
        return [];
      }

      return data || [];

    } catch (error) {
      console.error('Error en getRecentContext:', error);
      return [];
    }
  }

  /**
   * Formatear resultados para el prompt de IA
   */
  formatResultsForAI(results) {
    if (!results || results.length === 0) {
      return '';
    }

    const formatted = results
      .map((r, i) => {
        const fecha = new Date(r.fecha).toLocaleDateString('es-ES', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        return `[Conversación ${i + 1} - ${fecha}]\nUsuario: ${r.mensaje}\nAsistente: ${r.respuesta}`;
      })
      .join('\n\n');

    return `\n\n📚 CONTEXTO DE CONVERSACIONES ANTERIORES DEL USUARIO:\n${formatted}\n\nUsa este contexto para responder de forma coherente con lo que ya se ha discutido.\n`;
  }

  /**
   * Limpiar caché antigua
   */
  cleanCache() {
    const now = Date.now();
    for (const [key, value] of this.searchCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.searchCache.delete(key);
      }
    }
  }

  /**
   * Estadísticas del servicio
   */
  getStats() {
    return {
      cacheSize: this.searchCache.size,
      cacheTTL_minutes: this.CACHE_TTL / 60000
    };
  }
}

module.exports = new SearchService();
