# ⚡ Testing Rápido - Sin CURL

## 🌐 Tu API URL
**Base:** `https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/`

---

## 📱 Testing desde el Navegador (GET requests)

### ✅ Estadísticas de Tips
Abre en tu navegador:
```
https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/tips-stats
```

### ✅ Estadísticas de Feedback
Abre en tu navegador:
```
https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/feedback-stats
```

### ✅ Verificar Usuario
Abre en tu navegador (reemplaza el número):
```
https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/debug/study?phone=521234567890
```

### ✅ Health Check
Abre en tu navegador:
```
https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/health
```

---

## 🚀 Testing POST Requests (ReqBin)

### 1. Ve a: https://reqbin.com/

### 2. Tips Diarios

#### Enviar tip a usuario específico:
- **Método:** `POST`
- **URL:** `https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/send-tip/521234567890`
- **Headers:** (dejar vacío)
- Click en **"Send"**

#### Enviar tips a todos:
- **Método:** `POST`
- **URL:** `https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/send-tips`
- Click en **"Send"**

### 3. Feedback Mensual

#### Enviar feedback a usuario específico:
- **Método:** `POST`
- **URL:** `https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/send-feedback/521234567890`
- Click en **"Send"**

#### Enviar feedback a todos:
- **Método:** `POST`
- **URL:** `https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/send-monthly-feedback`
- Click en **"Send"**

---

## 📋 Checklist de Testing

### Antes de testear:
- [ ] Usuario tiene perfil completo (verificar con `/debug/study?phone=...`)
- [ ] Para feedback: usuario tiene conversaciones del mes pasado

### Testing Tips:
1. [ ] Abrir `/tips-stats` en navegador
2. [ ] Enviar tip a usuario específico desde ReqBin
3. [ ] Verificar que el usuario recibió el mensaje en WhatsApp
4. [ ] Verificar estadísticas actualizadas

### Testing Feedback:
1. [ ] Abrir `/feedback-stats` en navegador
2. [ ] Verificar usuario con `/debug/study?phone=...`
3. [ ] Enviar feedback a usuario específico desde ReqBin
4. [ ] Verificar que el usuario recibió el mensaje en WhatsApp
5. [ ] Verificar estadísticas actualizadas

---

## 🔗 Enlaces Directos

### GET (Abrir en navegador):
- [Tips Stats](https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/tips-stats)
- [Feedback Stats](https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/feedback-stats)
- [Health Check](https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/health)

### POST (Usar en ReqBin):
- [ReqBin.com](https://reqbin.com/)

**Endpoints POST:**
- `POST /send-tip/521234567890`
- `POST /send-tips`
- `POST /send-feedback/521234567890`
- `POST /send-monthly-feedback`

---

## 💡 Tips

1. **Reemplaza `521234567890`** con el número real del usuario que quieres testear
2. **Formato del número:** Sin espacios, con código de país (ej: 521234567890)
3. **Verifica primero** con `/debug/study` que el usuario tenga todos los datos
4. **Monitorea logs** mientras pruebas: `serverless logs -f api --tail`

