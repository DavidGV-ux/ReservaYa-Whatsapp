
const subscriptionService = require('../Services/subscriptionService');
const supabaseService = require('../Services/supabaseService');

/**
 * Script de prueba para el flujo completo de pago/licencia:
 * 1. Generar una licencia (Admin)
 * 2. Canjear la licencia (Usuario)
 * 3. Verificar activación y extensión de suscripción
 */
async function testPaymentFlow() {
    const testPhone = '573001180584'; // Tu número de prueba
    console.log('🚀 Iniciando prueba de flujo de pago para:', testPhone);

    try {
        // --- PASO 1: GENERAR LICENCIA (Simulando acción del Admin) ---
        console.log('\n--- PASO 1: Generando licencia (Admin) ---');
        const newLicense = await supabaseService.getAvailableLicenseKey();
        const licenseKey = newLicense.key_code;
        console.log('✅ Licencia generada con éxito:', licenseKey);

        // --- PASO 2: VERIFICAR ESTADO INICIAL ---
        console.log('\n--- PASO 2: Verificando estado inicial de suscripción ---');
        const initialInfo = await subscriptionService.getSubscriptionInfo(testPhone);
        console.log('📊 Estado inicial:', {
            isActive: initialInfo?.isActive,
            endDate: initialInfo?.endDate,
            daysRemaining: initialInfo?.daysRemaining
        });

        // --- PASO 3: CANJEAR LICENCIA (Simulando acción del Usuario) ---
        console.log('\n--- PASO 3: Canjeando licencia (Usuario) ---');
        const redeemResult = await subscriptionService.redeemLicense(testPhone, licenseKey);
        console.log('✅ Resultado del canje:', redeemResult.message);

        // --- PASO 4: VERIFICAR ACTIVACIÓN FINAL ---
        console.log('\n--- PASO 4: Verificando estado final de suscripción ---');
        const finalInfo = await subscriptionService.getSubscriptionInfo(testPhone);
        console.log('📊 Estado final:', {
            isActive: finalInfo?.isActive,
            endDate: finalInfo?.endDate,
            daysRemaining: finalInfo?.daysRemaining
        });

        if (finalInfo.isActive && (!initialInfo || finalInfo.daysRemaining > initialInfo.daysRemaining)) {
            console.log('\n🏆 PRUEBA EXITOSA: La licencia se generó, canjeó y activó correctamente la suscripción.');
        } else {
            console.log('\n❌ PRUEBA FALLIDA: El estado de la suscripción no cambió como se esperaba.');
        }

    } catch (error) {
        console.error('\n❌ ERROR DURANTE LA PRUEBA:', error.message);
    } finally {
        process.exit(0);
    }
}

testPaymentFlow();
