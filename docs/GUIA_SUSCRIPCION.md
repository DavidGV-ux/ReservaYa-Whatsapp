# 📅 Guía de Implementación - Sistema de Suscripción de 15 Días

## ✅ Implementación Completada

Se ha implementado un sistema completo de suscripción de 15 días para el chatbot, con control automático y manual.

## 📋 Archivos Creados/Modificados

### Backend (FYN/)

1. **`add_subscription_fields.sql`** - Script SQL para agregar campos de suscripción
2. **`Services/subscriptionService.js`** - Servicio completo de gestión de suscripciones
3. **`index.js`** - Modificado para verificar suscripción antes de procesar mensajes
4. **Endpoints de administrador** agregados en `index.js`

### Frontend (fYN-FRONT/)

1. **`src/app/services/subscription.service.ts`** - Servicio Angular para suscripciones
2. **`src/app/components/admin/`** - Panel completo de administrador
   - `admin.ts` - Componente TypeScript
   - `admin.html` - Template HTML
   - `admin.css` - Estilos
3. **`src/app/components/account/`** - Modificado para mostrar días restantes
   - `account.ts` - Agregada lógica de suscripción
   - `account.html` - Agregada visualización de días restantes

## 🗄️ Base de Datos

### Ejecutar SQL en Supabase

```sql
-- Ejecutar en Supabase SQL Editor
-- Archivo: add_subscription_fields.sql
```

Campos agregados a `user_profiles`:
- `subscription_start_date` - Fecha de inicio
- `subscription_end_date` - Fecha de fin (15 días después)
- `subscription_active` - Estado activo/inactivo
- `subscription_manual_override` - Control manual del admin

## 🔧 Configuración

### 1. Backend - Variables de Entorno

Agregar al `.env`:
```env
ADMIN_SECRET=tu_secreto_admin_aqui
```

### 2. Frontend - URL de API

Actualizar en `subscription.service.ts`:
```typescript
private apiUrl = 'https://TU-URL-LAMBDA.execute-api.us-east-1.amazonaws.com/dev';
```

Reemplazar `TU-URL-LAMBDA` con la URL real de tu Lambda.

### 3. Frontend - HttpClient

Asegurarse de que `HttpClientModule` esté importado en `app.config.ts`:
```typescript
import { provideHttpClient } from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    // ... otros providers
  ]
};
```

## 🚀 Funcionamiento

### Automático

1. **Primer mensaje**: Al recibir el primer mensaje de un usuario, se inicia automáticamente la suscripción de 15 días
2. **Verificación**: Antes de procesar cada mensaje, se verifica si la suscripción está activa
3. **Expiración**: Si la fecha de fin ha pasado, la suscripción se desactiva automáticamente
4. **Mensaje de expiración**: Si la suscripción expiró, se envía un mensaje al usuario y no se procesa su mensaje

### Manual (Admin)

1. **Acceso**: Ir a `/admin` en el frontend
2. **Autenticación**: Ingresar el secreto de administrador
3. **Gestión**:
   - Ver todos los usuarios con sus suscripciones
   - Activar suscripción manualmente (con días personalizados)
   - Desactivar suscripción manualmente
   - Ver días restantes de cada usuario

## 📱 Endpoints API

### Públicos

- `GET /subscription/:phone/days` - Obtener días restantes de un usuario

### Admin (requieren secreto)

- `GET /admin/users?secret=XXX` - Listar todos los usuarios
- `GET /admin/subscription/:phone?secret=XXX` - Info de suscripción
- `POST /admin/subscription/:phone/activate?secret=XXX` - Activar suscripción
- `POST /admin/subscription/:phone/deactivate?secret=XXX` - Desactivar suscripción

## 🎨 Frontend

### Componente Account

Muestra días restantes de suscripción en la página de cuenta del usuario.

### Panel Admin

Acceso en `/admin`:
- Lista de todos los usuarios
- Estado de suscripción
- Días restantes
- Acciones para activar/desactivar

## ⚠️ Importante

1. **Ejecutar SQL primero**: Antes de hacer deploy, ejecutar `add_subscription_fields.sql` en Supabase
2. **Configurar ADMIN_SECRET**: Agregar al `.env` del backend
3. **Actualizar URL en frontend**: Cambiar la URL de la API en `subscription.service.ts`
4. **HttpClient**: Asegurarse de que esté configurado en Angular

## 🔒 Seguridad

- El secreto de admin se guarda en localStorage (mejorar con autenticación real si es necesario)
- Los endpoints de admin requieren el secreto en query parameter o header
- Considerar usar JWT o autenticación más robusta para producción

## 📝 Próximos Pasos

1. Ejecutar `add_subscription_fields.sql` en Supabase
2. Agregar `ADMIN_SECRET` al `.env` del backend
3. Actualizar URL de API en el frontend
4. Hacer deploy del backend
5. Probar con un mensaje de WhatsApp
6. Acceder a `/admin` para gestionar suscripciones

---

**Estado**: ✅ Implementación completa y lista para usar

