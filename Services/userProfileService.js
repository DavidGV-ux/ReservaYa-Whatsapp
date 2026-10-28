// Services/userProfileService.js - Gestión de perfiles de usuario desde frontend
const supabaseService = require('./supabaseService');

class UserProfileService {
  /**
   * Actualizar perfil desde frontend (con email)
   * Valida que el número solo se pueda cambiar 1 vez
   * Valida que no haya correos duplicados con el mismo número
   */
  async updateProfileFromFrontend(email, profileData) {
    try {
      if (!email) {
        throw new Error('Email es requerido');
      }

      const { telefono, codigo_pais, username, monthly_salary, currency, country, fixed_expenses } = profileData;
      // avatar_url removido - la columna no existe en la base de datos
      
      // Construir número completo con validación estricta
      // Normalizar código de país: eliminar todo excepto números, luego quitar el +
      let codigoPais = (codigo_pais || '+57').trim();
      // Si tiene +, quitarlo. Luego solo números
      codigoPais = codigoPais.replace(/^\+/, '').replace(/[^0-9]/g, '');
      
      // Normalizar teléfono: solo números
      const telefonoClean = (telefono || '').replace(/[^0-9]/g, '');
      
      if (!telefonoClean || telefonoClean.length < 7) {
        throw new Error('Número de teléfono es requerido y debe tener al menos 7 dígitos');
      }
      
      if (!codigoPais || codigoPais.length < 1) {
        throw new Error('Código de país es requerido');
      }

      // Construir número completo: código país + teléfono (solo números)
      const phoneNumber = codigoPais + telefonoClean;
      const validatedPhone = supabaseService.validatePhoneNumber(phoneNumber);
      
      console.log(`📞 Número normalizado: ${validatedPhone} (código: ${codigoPais}, teléfono: ${telefonoClean})`);

      // Buscar perfil existente por email
      const { data: existingByEmail, error: emailError } = await supabaseService.supabase
        .from("user_profiles")
        .select("*")
        .eq("email", email)
        .maybeSingle();

      if (emailError && emailError.code !== 'PGRST116') {
        throw emailError;
      }

      // Verificar si el número ya está en uso por otro email
      const { data: existingByPhone, error: phoneError } = await supabaseService.supabase
        .from("user_profiles")
        .select("*")
        .eq("phone_number", validatedPhone)
        .maybeSingle();

      if (phoneError && phoneError.code !== 'PGRST116') {
        throw phoneError;
      }

      // Si el número está en uso por otro email diferente, rechazar
      if (existingByPhone && existingByPhone.email && existingByPhone.email !== email) {
        throw new Error('Este número de teléfono ya está registrado con otro correo electrónico');
      }

      // Si el número está en uso por un perfil sin email (chatbot), lo marcamos para migración
      const chatbotProfileToMigrate = (existingByPhone && !existingByPhone.email) ? existingByPhone : null;

      // Si existe perfil por email
      if (existingByEmail) {
        const currentPhone = existingByEmail.phone_number;
        const phoneChanged = currentPhone && currentPhone !== validatedPhone;
        const phoneChangeCount = existingByEmail.phone_changed_count || 0;

        // Validar que solo se pueda cambiar el número 1 vez
        if (phoneChanged && phoneChangeCount >= 1) {
          throw new Error('No puedes cambiar tu número de teléfono más de una vez. Contacta con soporte si necesitas cambiarlo nuevamente.');
        }

        // Actualizar perfil existente
        const updateData = {
          phone_number: validatedPhone,
          user_name: username || existingByEmail.user_name,
          email: email,
          monthly_salary: monthly_salary || existingByEmail.monthly_salary,
          currency: currency || existingByEmail.currency,
          country: country || existingByEmail.country,
          fixed_expenses: fixed_expenses || existingByEmail.fixed_expenses,
          updated_at: new Date().toISOString()
        };

        // SI HAY PERFIL DE CHATBOT PARA MIGRAR
        if (chatbotProfileToMigrate) {
          console.log(`🔄 [Migration] Migrando datos de perfil chatbot (${chatbotProfileToMigrate.id}) a perfil web (${existingByEmail.id})`);
          
          // 1. Mover transacciones
          const { error: txErr } = await supabaseService.supabase
            .from("transactions")
            .update({ user_id: existingByEmail.id })
            .eq("user_id", chatbotProfileToMigrate.id);
          
          if (txErr) console.error("❌ [Migration] Error moviendo transacciones:", txErr);

          // 2. Mover historial de gastos mensuales si existe
          const { error: historyErr } = await supabaseService.supabase
            .from("monthly_expense_history")
            .update({ user_id: existingByEmail.id })
            .eq("user_id", chatbotProfileToMigrate.id);
          
          if (historyErr) console.error("❌ [Migration] Error moviendo historial:", historyErr);

          // 3. Tomar datos del chatbot si el perfil web está vacío
          updateData.user_name = username || existingByEmail.user_name || chatbotProfileToMigrate.user_name;
          updateData.monthly_salary = monthly_salary || existingByEmail.monthly_salary || chatbotProfileToMigrate.monthly_salary;
          updateData.currency = currency || existingByEmail.currency || chatbotProfileToMigrate.currency;
          updateData.fixed_expenses = fixed_expenses || existingByEmail.fixed_expenses || chatbotProfileToMigrate.fixed_expenses;
          updateData.country = country || existingByEmail.country || chatbotProfileToMigrate.country;
          
          if (!existingByEmail.total_monthly_expenses && chatbotProfileToMigrate.total_monthly_expenses) {
            updateData.total_monthly_expenses = chatbotProfileToMigrate.total_monthly_expenses;
          }

          // 4. Eliminar perfil huérfano (importante: hacerlo después de migrar FKs)
          await supabaseService.supabase
            .from("user_profiles")
            .delete()
            .eq("id", chatbotProfileToMigrate.id);
          
          console.log("✅ [Migration] Migración completada con éxito");
        }

        // Si cambió el número, actualizar contador
        if (phoneChanged) {
          updateData.phone_changed_count = phoneChangeCount + 1;
          updateData.phone_last_changed = new Date().toISOString();
          if (!existingByEmail.original_phone_number) {
            updateData.original_phone_number = currentPhone;
          }
        } else if (!existingByEmail.original_phone_number) {
          // Si es la primera vez que se asigna, guardar como original
          updateData.original_phone_number = validatedPhone;
        }

        const { data, error } = await supabaseService.supabase
          .from("user_profiles")
          .update(updateData)
          .eq("email", email)
          .select()
          .single();

        if (error) throw error;

        console.log(`✅ Perfil actualizado para email ${email}, teléfono: ${validatedPhone}`);
        return data;
      } else {
        // Crear nuevo perfil desde frontend
        const newProfile = {
          email: email,
          phone_number: validatedPhone,
          user_name: username || '',
          monthly_salary: monthly_salary || null,
          currency: currency || null,
          country: country || null,
          fixed_expenses: fixed_expenses || null,
          phone_changed_count: 0,
          original_phone_number: validatedPhone,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        // avatar_url NO se incluye - la columna no existe en user_profiles

        const { data, error } = await supabaseService.supabase
          .from("user_profiles")
          .insert([newProfile])
          .select()
          .single();

        if (error) {
          // Si el error es por número duplicado
          if (error.code === '23505' || error.message.includes('unique')) {
            throw new Error('Este número de teléfono ya está registrado');
          }
          throw error;
        }

        console.log(`✅ Nuevo perfil creado para email ${email}, teléfono: ${validatedPhone}`);
        return data;
      }
    } catch (error) {
      console.error("Error en updateProfileFromFrontend:", error);
      throw error;
    }
  }

  /**
   * Iniciar suscripción desde frontend (al hacer clic en botón WhatsApp)
   * NO requiere que el perfil tenga todos los datos del chatbot
   */
  async startSubscriptionFromFrontend(email, phoneNumber) {
    try {
      if (!email || !phoneNumber) {
        throw new Error('Email y número de teléfono son requeridos');
      }

      const validatedPhone = supabaseService.validatePhoneNumber(phoneNumber);

      // Buscar perfil por email primero
      let profile = null;
      const { data: profileByEmail, error: emailError } = await supabaseService.supabase
        .from("user_profiles")
        .select("*")
        .eq("email", email)
        .maybeSingle();

      if (emailError && emailError.code !== 'PGRST116') {
        throw emailError;
      }

      profile = profileByEmail;

      // Si no existe perfil por email, buscar por teléfono
      if (!profile) {
        const { data: profileByPhone, error: phoneError } = await supabaseService.supabase
          .from("user_profiles")
          .select("*")
          .eq("phone_number", validatedPhone)
          .maybeSingle();

        if (phoneError && phoneError.code !== 'PGRST116') {
          throw phoneError;
        }

        profile = profileByPhone;

        // Si existe por teléfono pero no por email, actualizar con email
        if (profile && !profile.email) {
          await supabaseService.supabase
            .from("user_profiles")
            .update({ email: email })
            .eq("phone_number", validatedPhone);
        }
      }

      // Si no existe perfil, crear uno básico
      if (!profile) {
        console.log(`📝 Creando perfil básico para email ${email}, teléfono ${validatedPhone}`);
        const newProfile = {
          email: email,
          phone_number: validatedPhone,
          user_name: '',
          phone_changed_count: 0,
          original_phone_number: validatedPhone,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const { data: createdProfile, error: createError } = await supabaseService.supabase
          .from("user_profiles")
          .insert([newProfile])
          .select()
          .single();

        if (createError) {
          // Si el error es por número duplicado, intentar obtener el perfil existente
          if (createError.code === '23505' || createError.message.includes('unique')) {
            const { data: existing } = await supabaseService.supabase
              .from("user_profiles")
              .select("*")
              .eq("phone_number", validatedPhone)
              .single();
            
            if (existing) {
              profile = existing;
              // Actualizar con email si no lo tiene
              if (!existing.email) {
                await supabaseService.supabase
                  .from("user_profiles")
                  .update({ email: email })
                  .eq("phone_number", validatedPhone);
                profile.email = email;
              }
            } else {
              throw new Error('Este número de teléfono ya está registrado con otro correo');
            }
          } else {
            throw createError;
          }
        } else {
          profile = createdProfile;
        }
      } else {
        // Verificar que el teléfono coincida
        if (profile.phone_number !== validatedPhone) {
          // Si el email tiene un perfil pero con diferente teléfono, verificar si puede cambiar
          const phoneChangeCount = profile.phone_changed_count || 0;
          if (phoneChangeCount >= 1) {
            throw new Error('No puedes cambiar tu número de teléfono más de una vez. El número registrado no coincide.');
          }
          
          // Actualizar el teléfono
          await supabaseService.supabase
            .from("user_profiles")
            .update({ 
              phone_number: validatedPhone,
              phone_changed_count: phoneChangeCount + 1,
              phone_last_changed: new Date().toISOString()
            })
            .eq("email", email);
          
          profile.phone_number = validatedPhone;
        }
      }

      // Iniciar suscripción usando el servicio
      // forceRestart = true para que SIEMPRE reinicie la suscripción cuando se hace clic en el botón WhatsApp
      const subscriptionService = require('./subscriptionService');
      
      // Obtener estado actual antes de iniciar
      const hadActiveSubscription = profile.subscription_start_date && 
                                    profile.subscription_end_date && 
                                    new Date() < new Date(profile.subscription_end_date) &&
                                    profile.subscription_active;
      
      // Iniciar o REINICIAR suscripción (forceRestart = true para botón WhatsApp)
      // Esto asegura que siempre se active por el tiempo definido (15 días)
      const result = await subscriptionService.startSubscription(validatedPhone, true);
      
      // Verificar si era una suscripción nueva o se reinició
      const isNewSubscription = !hadActiveSubscription;
      
      console.log(`✅ Suscripción ${isNewSubscription ? 'iniciada' : 'reiniciada'} para ${email} (${validatedPhone}) - Duración: 15 días`);
      
      return {
        alreadyStarted: false, // Siempre false porque siempre se reinicia desde el botón
        startDate: result.subscription_start_date,
        endDate: result.subscription_end_date,
        isActive: result.subscription_active,
        phoneNumber: validatedPhone
      };
    } catch (error) {
      console.error("Error en startSubscriptionFromFrontend:", error);
      throw error;
    }
  }
}

module.exports = new UserProfileService();

