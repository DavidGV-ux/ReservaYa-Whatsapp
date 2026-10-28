// Services/supabaseService.js — Capa de datos (Supabase/PostgREST).
//
// Es el singleton que casi TODOS los demás servicios usan a través de
// `supabaseService.supabase` (metricsService, budgetAlertService, userProfileService, etc.),
// por eso el cliente se construye aquí con la fábrica compartida de ./postgrestClient.
//
// Patrones a respetar en esta capa:
//   • La LLAMADA al cliente devuelve SIEMPRE `{ data, error }` (convención PostgREST).
//   • getMonthlyExpensesTotal() NO confía en acumuladores: recalcula sumando las filas reales
//     de `transactions` del mes. Nunca "arreglar" esto con un contador manual.
//   • Los teléfonos se normalizan a dígitos (validatePhoneNumber) ANTES de tocar la BD;
//     los perfiles se guardan con phone_number ya normalizado.
const createPostgrestClient = require("./postgrestClient");

class SupabaseService {
  constructor() {
    this.supabase = createPostgrestClient();
    this.activeUsers = new Set(); // Rastrear usuarios activos
  }

  // Validar y normalizar formato de número de teléfono
  // Formato esperado: solo números (sin +, sin espacios, sin guiones)
  validatePhoneNumber(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      throw new Error('Número de teléfono inválido');
    }
    
    // Eliminar TODOS los caracteres que no sean números
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    
    if (cleanPhone.length < 10) {
      throw new Error('Número de teléfono demasiado corto');
    }
    
    if (cleanPhone.length > 15) {
      throw new Error('Número de teléfono demasiado largo');
    }
    
    return cleanPhone;
  }
  
  // Normalizar número de teléfono para comparación estricta
  normalizePhoneNumber(phoneNumber) {
    return this.validatePhoneNumber(phoneNumber);
  }

  // Obtener o crear perfil de usuario con aislamiento garantizado
  async getUserProfile(phoneNumber) {
    try {
      const validatedPhone = this.validatePhoneNumber(phoneNumber);
      
      const { data, error } = await this.supabase
        .from("user_profiles")
        .select("*") // Trae todas las columnas, incluyendo las nuevas total_monthly_expenses y budget
        .eq("phone_number", validatedPhone)
        .single();

      if (error && error.code === "PGRST116") {
        // Usuario no existe, crear nuevo perfil aislado
        console.log(`📝 Creando nuevo perfil para: ${validatedPhone}`);
        return await this.createUserProfile(validatedPhone);
      }

      if (error) {
        console.error('Error obteniendo perfil:', error);
        throw error;
      }

      // Registrar usuario activo
      this.activeUsers.add(validatedPhone);
      
      return data;
    } catch (error) {
      console.error("Error en getUserProfile:", error);
      throw error;
    }
  }

  async createUserProfile(phoneNumber) {
    try {
      const validatedPhone = this.validatePhoneNumber(phoneNumber);
      
      const { data, error } = await this.supabase
        .from("user_profiles")
        .insert([{ 
          phone_number: validatedPhone,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          total_monthly_expenses: 0, // Inicializar campo nuevo
          monthly_expenses_budget: 0 // Inicializar campo nuevo
        }])
        .select()
        .single();

      if (error) {
        console.error('Error creando perfil:', error);
        throw error;
      }

      console.log(`✨ Nuevo usuario creado: ${validatedPhone}`);
      this.activeUsers.add(validatedPhone);
      
      return data;
    } catch (error) {
      console.error("Error en createUserProfile:", error);
      throw error;
    }
  }

  async updateUserProfile(phoneNumber, profileData) {
    try {
      const validatedPhone = this.validatePhoneNumber(phoneNumber);
      
      // Validar que solo se actualicen campos permitidos, INCLUYENDO LOS NUEVOS
      const allowedFields = [
        'user_name', 'monthly_salary', 'city', 'country', 
        'language', 'currency', 'fixed_expenses',
        'total_monthly_expenses', 'monthly_expenses_budget',
        'financial_health_score', 'financial_health_level', 'financial_health_updated_at'
      ];
      
      const updateData = {};
      
      for (const [key, value] of Object.entries(profileData)) {
        if (allowedFields.includes(key) && value !== null && value !== undefined) {
          // Convertir números a formato correcto
          if (['monthly_salary', 'fixed_expenses', 'total_monthly_expenses', 'monthly_expenses_budget'].includes(key)) {
            const numValue = typeof value === 'string' ? parseFloat(value.replace(/[^\d.]/g, '')) : parseFloat(value);
            if (!isNaN(numValue) && numValue >= 0) {
              updateData[key] = numValue;
            } else {
              console.warn(`⚠️ Valor inválido para ${key}: ${value}, omitiendo`);
            }
          } else {
            updateData[key] = value;
          }
        }
      }
      
      if (Object.keys(updateData).length === 0) {
        // Si es una actualización vacía pero válida (ej: borrar algo intencionalmente), revisar lógica.
        // Por ahora mantenemos el log
        console.log('⚠️ No hay campos válidos para actualizar o están vacíos');
        return null;
      }

      updateData.updated_at = new Date().toISOString();

      const { data, error } = await this.supabase
        .from("user_profiles")
        .update(updateData)
        .eq("phone_number", validatedPhone)
        .select()
        .single();

      if (error) {
        console.error('❌ Error actualizando perfil:', error.message);
        throw error;
      }

      console.log(`✅ Perfil actualizado exitosamente para: ${validatedPhone}`);
      return data;
    } catch (error) {
      console.error("❌ Error en updateUserProfile:", error);
      throw error;
    }
  }

  async updateUserProfileById(userId, profileData) {
    try {
      if (!userId) throw new Error('User ID is required');

      // Validar que solo se actualicen campos permitidos
      const allowedFields = [
        'user_name', 'monthly_salary', 'city', 'country', 
        'language', 'currency', 'fixed_expenses',
        'total_monthly_expenses', 'monthly_expenses_budget',
        'financial_health_score', 'financial_health_level', 'financial_health_updated_at'
      ];
      
      const updateData = {};
      
      for (const [key, value] of Object.entries(profileData)) {
        if (allowedFields.includes(key) && value !== null && value !== undefined) {
          // Convertir números a formato correcto
          if (['monthly_salary', 'fixed_expenses', 'total_monthly_expenses', 'monthly_expenses_budget'].includes(key)) {
            const numValue = typeof value === 'string' ? parseFloat(value.replace(/[^\d.]/g, '')) : parseFloat(value);
            if (!isNaN(numValue) && numValue >= 0) {
              updateData[key] = numValue;
            } else {
              console.warn(`⚠️ Valor inválido para ${key}: ${value}, omitiendo`);
            }
          } else {
            updateData[key] = value;
          }
        }
      }
      
      if (Object.keys(updateData).length === 0) {
        return null;
      }

      updateData.updated_at = new Date().toISOString();

      const { data, error } = await this.supabase
        .from("user_profiles")
        .update(updateData)
        .eq("id", userId)
        .select()
        .single();

      if (error) {
        console.error('❌ Error actualizando perfil por ID:', error.message);
        throw error;
      }

      console.log(`✅ Perfil actualizado exitosamente para ID: ${userId}`);
      return data;
    } catch (error) {
      console.error("❌ Error en updateUserProfileById:", error);
      throw error;
    }
  }

  async saveMessage(phoneNumber, userName, message, response, timestamp) {
    try {
      const validatedPhone = this.validatePhoneNumber(phoneNumber);
      const fecha = new Date(timestamp);
      
      // Verificar que el usuario existe antes de guardar mensaje
      // Usamos count para ser más eficientes si solo queremos chequear existencia
      const { count, error: userError } = await this.supabase
        .from("user_profiles")
        .select("*", { count: 'exact', head: true })
        .eq("phone_number", validatedPhone);

      if (userError || count === 0) {
        console.error('Usuario no existe al intentar guardar mensaje');
        // Opcional: Auto-crear perfil si no existe para no perder mensaje
        // await this.createUserProfile(validatedPhone);
        throw new Error('Usuario no existe');
      }

      const { data, error } = await this.supabase
        .from("conversaciones")
        .insert([
          {
            user_phone: validatedPhone,
            mensaje: message.substring(0, 5000), // Limitar tamaño
            respuesta: response.substring(0, 5000),
            fecha: fecha.toISOString(),
            hora: fecha.toTimeString().split(" ")[0],
            created_at: new Date().toISOString()
          },
        ]);

      if (error) {
        console.error('Error guardando mensaje:', error);
        throw error;
      }

      console.log(`💬 Mensaje guardado para: ${validatedPhone}`);
      return data;
    } catch (error) {
      console.error("Error en saveMessage:", error);
      throw error;
    }
  }

  async getConversationHistory(phoneNumber, limit = 10) {
    try {
      const validatedPhone = this.validatePhoneNumber(phoneNumber);
      
      const { data, error } = await this.supabase
        .from("conversaciones")
        .select("*")
        .eq("user_phone", validatedPhone)
        .order("fecha", { ascending: false })
        .limit(Math.min(limit, 100)); // Máximo 100 registros

      if (error) {
        console.error('Error obteniendo historial:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error("Error en getConversationHistory:", error);
      throw error;
    }
  }

  // Verificar integridad de datos del usuario
  async verifyUserDataIntegrity(phoneNumber) {
    try {
      const validatedPhone = this.validatePhoneNumber(phoneNumber);
      
      const profile = await this.getUserProfile(validatedPhone);
      
      const { count, error } = await this.supabase
        .from("conversaciones")
        .select("*", { count: 'exact', head: true })
        .eq("user_phone", validatedPhone);

      if (error) throw error;

      return {
        profileExists: !!profile,
        messageCount: count || 0,
        phoneNumber: validatedPhone,
        isIsolated: true
      };
    } catch (error) {
      console.error("Error verificando integridad:", error);
      return {
        profileExists: false,
        messageCount: 0,
        phoneNumber: phoneNumber,
        isIsolated: false,
        error: error.message
      };
    }
  }

  // Obtener estadísticas de usuarios activos
  getActiveUsersCount() {
    return this.activeUsers.size;
  }

  // Guardar transacción (gasto o ingreso) desde una factura procesada
  async saveTransaction(phoneNumber, transactionData) {
    try {
      const validatedPhone = this.validatePhoneNumber(phoneNumber);
      
      const userProfile = await this.getUserProfile(validatedPhone);
      if (!userProfile || !userProfile.id) {
        throw new Error('No se pudo obtener el perfil del usuario');
      }

      const transactionDate = transactionData.date || new Date().toISOString().split('T')[0];

      const transaction = {
        user_id: userProfile.id,
        amount: parseFloat(transactionData.amount) || 0,
        currency: transactionData.currency || userProfile.currency || 'MXN',
        description: transactionData.description || transactionData.concepto || 'Sin descripción',
        date: transactionDate,
        receipt_url: transactionData.receipt_url || null,
        transaction_type: transactionData.type || (['GASTO', 'EXPENSE', 'DESPESA'].includes(transactionData.clasificacion) ? 'expense' : 'income'),
        metadata: {
          tipo_documento: transactionData.tipoDocumento,
          empresa: transactionData.empresa,
          concepto: transactionData.concepto,
          clasificacion: transactionData.clasificacion,
          fecha_documento: transactionData.fecha
        },
        created_at: new Date().toISOString()
      };

      if (transactionData.category_id) {
        transaction.category_id = transactionData.category_id;
      }

      const { data, error } = await this.supabase
        .from("transactions")
        .insert([transaction])
        .select()
        .single();

      if (error) {
        console.error('❌ Error guardando transacción:', error);
        throw error;
      }
      
      // NUEVO: Actualizar el acumulado mensual en el perfil si es un gasto
      if (transaction.transaction_type === 'expense') {
        await this.updateMonthlyExpensesTotal(validatedPhone, transaction.amount, true, transactionDate);
      }

      console.log(`✅ Transacción guardada: ${transaction.amount} ${transaction.currency} (${transaction.transaction_type})`);
      return data;
    } catch (error) {
      console.error("❌ Error en saveTransaction:", error);
      throw error;
    }
  }

  // Actualizar una transacción existente
  async updateTransaction(transactionId, updates) {
    try {
      const { data, error } = await this.supabase
        .from("transactions")
        .update(updates)
        .eq("id", transactionId)
        .select()
        .single();

      if (error) {
        console.error('❌ Error actualizando transacción:', error);
        throw error;
      }

      console.log(`✅ Transacción actualizada: ${transactionId}`);
      return data;
    } catch (error) {
      console.error("❌ Error en updateTransaction:", error);
      throw error;
    }
  }

  // Eliminar una transacción existente
  async deleteTransaction(transactionId) {
    try {
      const { error } = await this.supabase
        .from("transactions")
        .delete()
        .eq("id", transactionId);

      if (error) {
        console.error('❌ Error eliminando transacción:', error);
        throw error;
      }

      console.log(`🗑️ Transacción eliminada: ${transactionId}`);
      return true;
    } catch (error) {
      console.error("❌ Error en deleteTransaction:", error);
      throw error;
    }
  }

  // Obtener transacciones del mes actual
  async getMonthlyTransactions(phoneNumber, year = null, month = null) {
    try {
      const validatedPhone = this.validatePhoneNumber(phoneNumber);
      
      const userProfile = await this.getUserProfile(validatedPhone);
      if (!userProfile || !userProfile.id) {
        return [];
      }

      const now = new Date();
      const targetYear = year || now.getFullYear();
      const targetMonth = month || (now.getMonth() + 1);

      const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
      const endDate = new Date(targetYear, targetMonth, 0).toISOString().split('T')[0];

      const { data, error } = await this.supabase
        .from("transactions")
        .select("*")
        .eq("user_id", userProfile.id)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: false });

      if (error) {
        console.error('❌ Error obteniendo transacciones:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error("❌ Error en getMonthlyTransactions:", error);
      return [];
    }
  }

  // Calcular total de gastos del mes
  async getMonthlyExpensesTotal(phoneNumber, year = null, month = null) {
    try {
      const transactions = await this.getMonthlyTransactions(phoneNumber, year, month);
      
      const expenses = transactions.filter(t => t.transaction_type === 'expense');
      
      const totalsByCurrency = {};
      expenses.forEach(expense => {
        const currency = expense.currency || 'MXN';
        if (!totalsByCurrency[currency]) {
          totalsByCurrency[currency] = 0;
        }
        totalsByCurrency[currency] += parseFloat(expense.amount) || 0;
      });

      return {
        total: totalsByCurrency,
        count: expenses.length,
        transactions: expenses
      };
    } catch (error) {
      console.error("❌ Error en getMonthlyExpensesTotal:", error);
      return { total: {}, count: 0, transactions: [] };
    }
  }

  // Obtener saldo disponible
  async getAvailableBalance(phoneNumber) {
    try {
      const userProfile = await this.getUserProfile(phoneNumber);
      if (!userProfile) {
        return null;
      }

      const monthlySalary = parseFloat(userProfile.monthly_salary) || 0;
      const fixedExpenses = parseFloat(userProfile.fixed_expenses) || 0;
      const currency = userProfile.currency || 'MXN';
      
      // Fuente de verdad: transacciones del mes actual en BD
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const monthlyExpensesData = await this.getMonthlyExpensesTotal(phoneNumber, year, month);
      const variableExpenses = monthlyExpensesData.total[currency] || 0;

      const availableBalance = monthlySalary - fixedExpenses - variableExpenses;

      return {
        monthlySalary,
        fixedExpenses,
        variableExpenses,
        totalExpenses: fixedExpenses + variableExpenses,
        availableBalance,
        currency,
        budget: parseFloat(userProfile.monthly_expenses_budget || 0)
      };
    } catch (error) {
      console.error("❌ Error en getAvailableBalance:", error);
      return null;
    }
  }

  // Obtener lista detallada de gastos del mes actual
  async getCurrentMonthExpensesList(phoneNumber) {
    try {
      const validatedPhone = this.validatePhoneNumber(phoneNumber);
      
      const userProfile = await this.getUserProfile(validatedPhone);
      if (!userProfile || !userProfile.id) {
        return [];
      }

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const { data, error } = await this.supabase
        .from("transactions")
        .select("*")
        .eq("user_id", userProfile.id)
        .eq("transaction_type", "expense")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        console.error('❌ Error obteniendo lista de gastos:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error("❌ Error en getCurrentMonthExpensesList:", error);
      return [];
    }
  }

  /**
   * NUEVO: Obtener resumen de gastos del mes desde el perfil
   * Usado para respuestas rápidas
   */
  async getMonthlyExpensesSummary(phoneNumber) {
    try {
      const profile = await this.getUserProfile(phoneNumber);
      if (!profile) return null;

      return {
        total: profile.total_monthly_expenses || 0,
        budget: profile.monthly_expenses_budget || 0,
        currency: profile.currency || 'COP'
      };
    } catch (error) {
      console.error('Error obteniendo resumen de gastos:', error);
      return null;
    }
  }

  /**
   * NUEVO: Actualizar el acumulado de gastos del mes
   * Se puede llamar después de registrar una transacción o corrección
   */
  async updateMonthlyExpensesTotal(phoneNumber, amount, isAddition = true, date = null) {
    try {
      const profile = await this.getUserProfile(phoneNumber);
      if (!profile) return;

      const now = date ? new Date(date) : new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const currentYear = profile.current_expenses_year || year;
      const currentMonth = profile.current_expenses_month || month;

      // SI CAMBIÓ EL MES: Guardar historial y resetear acumulado en el perfil
      if (currentYear !== year || currentMonth !== month) {
        console.log(`📅 Cambio de mes detectado para ${phoneNumber}: ${currentMonth}/${currentYear} -> ${month}/${year}`);
        
        // 1. Obtener el total real desde las transacciones del mes que acaba de "cerrar"
        const prevData = await this.getMonthlyExpensesTotal(phoneNumber, currentYear, currentMonth);
        const currencies = Object.keys(prevData.total || {});

        if (prevData.count > 0 && currencies.length > 0) {
          const primaryCurrency = currencies[0];

          // 2. Guardar en la tabla de historial (merge: conserva informes más ricos del cron)
          await this.archiveMonthlyExpense(profile, {
            year: currentYear,
            month: currentMonth,
            total: prevData.total[primaryCurrency] || 0,
            currency: primaryCurrency
          });
        }
        
        // 3. Resetear el acumulado en el perfil para el nuevo mes
        // El recalculo de abajo se encargará de poner el valor correcto para el nuevo mes
      }

      // Recalcular SIEMPRE desde la base de datos para el mes actual
      const monthlyData = await this.getMonthlyExpensesTotal(phoneNumber, year, month);
      const currency = profile.currency || 'MXN';
      const totalInProfileCurrency = monthlyData.total[currency];
      const finalTotal = totalInProfileCurrency !== undefined 
        ? totalInProfileCurrency 
        : (Object.values(monthlyData.total)[0] || 0);

      console.log(`🔄 Sincronizando total mensual para ${phoneNumber}: ${finalTotal} ${currency} (Mes: ${month}/${year})`);

      await this.updateUserProfile(phoneNumber, {
        total_monthly_expenses: finalTotal,
        current_expenses_year: year,
        current_expenses_month: month
      });
      
      return finalTotal;
    } catch (error) {
      console.error('Error actualizando total de gastos:', error);
    }
  }

  /**
   * Archivar / actualizar un mes cerrado en monthly_expense_history (historial del dashboard web).
   * Usada por el cron mensual (día 1) y como respaldo cuando se registra una transacción
   * después de un cambio de mes.
   *
   * Reglas de merge (evita duplicados y no pisa datos):
   * - Si NO existe registro (user_id, año, mes) -> inserta.
   * - Si ya existe y el nuevo payload trae informe completo (message) y el existente no lo tiene
   *   -> lo completa con savings/mensaje (el cron escribe más rico que el respaldo de transacciones).
   * - Cualquier otro caso -> conserva el registro existente.
   *
   * Degradación: si la BD aún no tiene las columnas savings/savings_percentage/message
   * (migración pendiente en Supabase SQL Editor), se reintenta solo con los campos base,
   * de modo que el historial de "Total Gastado" por mes nunca se pierde.
   */
  async archiveMonthlyExpense(profile, fields) {
    try {
      const profileRow = profile && profile.id ? profile : await this.getUserProfile(fields.phoneNumber);

      if (!profileRow) throw new Error('Perfil no encontrado');

      const { year, month } = fields;
      const base = {
        user_id: profileRow.id,
        year,
        month,
        total: parseFloat(fields.total) || 0,
        currency: fields.currency || profileRow.currency || 'MXN'
      };
      const rich = { ...base, created_at: new Date().toISOString() };
      if (fields.savings !== null && fields.savings !== undefined) rich.savings = parseFloat(fields.savings) || 0;
      if (fields.savings_percentage !== null && fields.savings_percentage !== undefined) {
        rich.savings_percentage = parseFloat(fields.savings_percentage) || 0;
      }
      if (fields.message) rich.message = String(fields.message);

      const { data: existing, error } = await this.supabase
        .from('monthly_expense_history')
        .select('id, message')
        .eq('user_id', profileRow.id)
        .eq('year', year)
        .eq('month', month);

      if (error) throw error;

      if (!existing || existing.length === 0) {
        await this.writeMonthlyExpenseHistory(rich);
        console.log(`✅ Historial archivado ${month}/${year} (${base.total} ${base.currency})`);
        return;
      }

      // Ya existe: solo completar cuando llega un informe completo y el existente no lo tiene
      const row = existing[0];
      if (fields.message && !row.message) {
        await this.writeMonthlyExpenseHistory(rich, row.id);
        console.log(`✅ Historial completado con informe ${month}/${year}`);
      } else {
        console.log(`ℹ️ Historial ${month}/${year} ya existía; se conserva.`);
      }
    } catch (error) {
      console.error('❌ Error en archiveMonthlyExpense:', error.message);
    }
  }

  /**
   * Write/update en monthly_expense_history con degradación a columnas base
   * cuando el esquema aún no incluye savings/savings_percentage/message.
   */
  async writeMonthlyExpenseHistory(payload, id = null) {
    try {
      if (id) {
        const { error } = await this.supabase.from('monthly_expense_history').update(payload).eq('id', id);
        if (error) throw error;
        return;
      }
      const { error } = await this.supabase.from('monthly_expense_history').insert([payload]);
      if (error) throw error;
    } catch (error) {
      const hasRichFields = payload.savings !== undefined || payload.message !== undefined;
      if (hasRichFields && /does not exist|schema cache|column/i.test(String(error.message || ''))) {
        const base = { ...payload };
        delete base.savings;
        delete base.savings_percentage;
        delete base.message;
        console.warn('⚠️ Columnas de informe no migradas; archivando solo total.');
        return this.writeMonthlyExpenseHistory(base, id);
      }
      throw error;
    }
  }

  // --- LICENSING SYSTEM METHODS ---

  /**
   * Obtener historial de gastos mensuales de un usuario
   * @param {string} phoneNumber - teléfono normalizado
   * @param {object|null} profile - perfil ya obtenido (p.ej. por requireOwnData). Evita una consulta extra en BD.
   */
  async getMonthlyHistory(phoneNumber, profile = null) {
    try {
      const validatedPhone = this.validatePhoneNumber(phoneNumber);
      const profileRow = profile || await this.getUserProfile(validatedPhone);
      
      if (!profileRow) throw new Error('Perfil no encontrado');

      const { data, error } = await this.supabase
        .from("monthly_expense_history")
        .select("*")
        .eq("user_id", profileRow.id)
        .order("year", { ascending: false })
        .order("month", { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Error obteniendo historial mensual:", error);
      throw error;
    }
  }

  /**
   * Generar una clave aleatoria formato XXXX-XXXX-XXXX
   */
  generateRandomKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sin caracteres ambiguos (I, 1, O, 0)
    const part = () => Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `${part()}-${part()}-${part()}`;
  }

  /**
   * Generar una nueva clave de licencia y marcarla como pendiente (para admin)
   */
  async getAvailableLicenseKey(retryCount = 0) {
    try {
      if (retryCount > 3) throw new Error("No se pudo generar una clave única después de varios intentos");

      // 1. Generar clave aleatoria
      const newKey = this.generateRandomKey();

      // 2. Insertar directamente como 'pending' (ya reservada para entregar)
      const { data: createdKey, error: insertError } = await this.supabase
        .from("license_keys")
        .insert({ 
          key_code: newKey,
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) {
        // Si hay error de duplicado (muy raro), reintentar
        if (insertError.code === '23505') { // Postgres unique violation code
             console.log("⚠️ Colisión de clave generada, reintentando...");
             return this.getAvailableLicenseKey(retryCount + 1);
        }
        throw insertError;
      }

      console.log(`🔑 Clave generada y reservada: ${createdKey.key_code}`);
      return createdKey;
    } catch (error) {
      console.error("Error generando clave de licencia:", error);
      throw error;
    }
  }

  /**
   * Activar una clave de licencia (para usuario)
   */
  async activateLicenseKey(phoneNumber, keyCode) {
    try {
      const validatedPhone = this.validatePhoneNumber(phoneNumber);
      
      // 1. Verificar si la clave existe y está pendiente
      const { data: keyData, error: searchError } = await this.supabase
        .from("license_keys")
        .select("*")
        .eq("key_code", keyCode)
        .single();
        
      if (searchError || !keyData) {
        throw new Error("Clave inválida o no encontrada");
      }
      
      if (keyData.status !== 'pending') {
         if (keyData.status === 'used') throw new Error("Esta clave ya ha sido utilizada");
         if (keyData.status === 'available') throw new Error("Clave no activada por administrador");
         throw new Error("Estado de clave inválido");
      }

      // 2. Marcar como usada y vincular al usuario
      const { data: updatedKey, error: updateError } = await this.supabase
        .from("license_keys")
        .update({
          status: 'used',
          activated_by: validatedPhone,
          activated_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("id", keyData.id)
        .eq("status", "pending") // Concurrencia check
        .select()
        .single();

      if (updateError || !updatedKey) {
        throw new Error("Error activando clave (posible conflicto), intente nuevamente");
      }

      console.log(`✅ Licencia activada por ${validatedPhone}: ${keyCode}`);
      return updatedKey;
    } catch (error) {
      console.error("Error activando licencia:", error);
      throw error;
    }
  }

  /**
   * Obtener todas las encuestas de satisfacción (para admin)
   */
  async getAllSurveys() {
    try {
      const { data, error } = await this.supabase
        .from('product_surveys')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error obteniendo encuestas:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error("❌ Error en getAllSurveys:", error);
      throw error;
    }
  }

  // ============================================================
  // FYN FINANCIAL HEALTH SCORE
  // ============================================================

  /**
   * Categorización de las 10 preguntas para coaching
   */
  getFynScoreCategoryMap() {
    return {
      1: 'Ahorro e Inversión',
      2: 'Fondo de Emergencia',
      3: 'Flujo de Caja',
      4: 'Deudas',
      5: 'Presupuesto',
      6: 'Metas Financieras',
      7: 'Conocimiento de Inversiones',
      8: 'Historial Crediticio',
      9: 'Gastos Hormiga',
      10: 'Protección y Seguros'
    };
  }

  /**
   * Calcular Score FYN a partir de las respuestas
   * answers: { "1": 0..4, "2": 0..4, ..., "10": 0..4 }  (valor en puntos)
   */
  calculateFynScore(answers) {
    const catMap = this.getFynScoreCategoryMap();
    let totalPoints = 0;
    const breakdown = {};

    for (let q = 1; q <= 10; q++) {
      const pts = Number(answers[String(q)] || 0);
      totalPoints += pts;
      const cat = catMap[q];
      if (!breakdown[cat]) breakdown[cat] = { points: 0, max: 4, pct: 0 };
      breakdown[cat].points += pts;
      breakdown[cat].pct = Math.round((pts / 4) * 100);
    }

    const score = Math.round((totalPoints / 40) * 100);
    let level = 'Crítico';
    if (score >= 80) level = 'Excelente';
    else if (score >= 60) level = 'Buena';
    else if (score >= 40) level = 'Regular';

    return { totalPoints, score, level, breakdown };
  }

  /**
   * Obtener último score del usuario (por phone o por id)
   */
  async getFinancialHealthScore({ phoneNumber, userId }) {
    try {
      let query = this.supabase.from('financial_health_scores').select('*');

      if (phoneNumber) {
        const validatedPhone = this.validatePhoneNumber(phoneNumber);
        query = query.eq('phone_number', validatedPhone);
      } else if (userId) {
        query = query.eq('user_id', userId);
      } else {
        return null;
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('❌ Error obteniendo score:', error);
        throw error;
      }

      return data || null;
    } catch (err) {
      console.error('❌ Error en getFinancialHealthScore:', err);
      return null;
    }
  }

  /**
   * Guardar / actualizar score de un usuario
   * Retorna el registro nuevo (incluye attempt_count incrementado)
   */
  async saveFinancialHealthScore({ phoneNumber, userId, answers }) {
    try {
      let targetPhone = null;
      let targetUserId = userId || null;
      let profile = null;

      if (phoneNumber) {
        targetPhone = this.validatePhoneNumber(phoneNumber);
        profile = await this.getUserProfile(targetPhone).catch(() => null);
        if (profile && profile.id && !targetUserId) targetUserId = profile.id;
      } else if (userId) {
        const { data: byId } = await this.supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        profile = byId;
        if (byId?.phone_number) targetPhone = byId.phone_number;
      }

      if (!targetPhone && !targetUserId) {
        throw new Error('Se requiere phone_number o user_id para guardar el score');
      }

      const calc = this.calculateFynScore(answers);

      // Obtener último score para contar attempts
      const previous = await this.getFinancialHealthScore({
        phoneNumber: targetPhone,
        userId: targetUserId
      });
      const attemptCount = (previous?.attempt_count || 0) + 1;

      const insertRow = {
        answers,
        total_points: calc.totalPoints,
        score: calc.score,
        level: calc.level,
        category_breakdown: calc.breakdown,
        attempt_count: attemptCount,
        created_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString()
      };

      if (targetUserId) insertRow.user_id = targetUserId;
      if (targetPhone) insertRow.phone_number = targetPhone;

      const { data, error } = await this.supabase
        .from('financial_health_scores')
        .insert([insertRow])
        .select()
        .single();

      if (error) {
        console.error('❌ Error guardando score:', error);
        throw error;
      }

      // Sincronizar caché en user_profiles
      const updateProfilePayload = {
        financial_health_score: calc.score,
        financial_health_level: calc.level,
        financial_health_updated_at: new Date().toISOString()
      };

      if (targetPhone) {
        try { await this.updateUserProfile(targetPhone, updateProfilePayload); } catch (_) {}
      } else if (targetUserId && profile) {
        try { await this.updateUserProfileById(targetUserId, updateProfilePayload); } catch (_) {}
      }

      console.log(`✅ Score guardado: ${calc.score} (${calc.level}) - Intento #${attemptCount}`);
      return data;
    } catch (err) {
      console.error('❌ Error en saveFinancialHealthScore:', err);
      throw err;
    }
  }
}

module.exports = new SupabaseService();
