# ADR-14: Consolidación del Canal WhatsApp IA y Retiro del Servicio Legacy (FYN)

- **Estado:** Aceptado
- **Fecha:** 2026-10-20
- **Responsable:** I2 — Fernando R. (Módulo de Notificaciones y WhatsApp IA)
- **Ítems del Backlog:** B-08, F-08, B-04, B-05

## 1. Contexto y Problema

Durante la fase inicial del proyecto existían dos implementaciones para el bot de WhatsApp:
1. **Servicio Legacy (`IA whatsapp` / repo `FYN`):** Prototipo inicial desacoplado del modelo multi-tenant de `Back-Reserva-Ya`, sin validación de firma criptográfica `X-Hub-Signature-256`, sin cola de mensajería y sin integración con las sesiones de pago de anticipos.
2. **Servicio Actual (`ReservaYa-Whatsapp`):** Nuevo microservicio conversacional integrado con `Back-Reserva-Ya` (`/api/whatsapp/lookup`, `/api/public/:tenantId/appointments`, `/api/public/:tenantId/appointments/:id/payment-session` y `/internal/events`).

Mantener ambos servicios apuntando al mismo número de WhatsApp Business (WABA) ocasionaba riesgo de **doble procesamiento de eventos** y respuestas contradictorias al cliente (RF-4.4).

## 2. Decisión Arquitectónica

1. **Único Receptor Oficial del Webhook de Meta:** Se establece a **`ReservaYa-Whatsapp`** como el único servicio propietario del webhook de Meta (`/webhook/whatsapp`) para el número de WhatsApp Business de la plataforma.
2. **Archivado del Servicio Legacy (`FYN` / `IA whatsapp`):** El repositorio legacy queda formalmente **archivado (read-only)** y desvinculado de las suscripciones de Webhooks en el panel de *Meta for Developers*.
3. **Deduplicación Estricta por `whatsapp_message_id` (`wamid`):**
   - `ReservaYa-Whatsapp` valida obligatoriamente la firma `X-Hub-Signature-256` antes de aceptar cualquier payload.
   - La cola SQS (`SqsMessageQueue`) y el registro de conversaciones aplican deduplicación por `whatsapp_message_id` (`wamid...`), garantizando semántica *idempotent consumer* ante reintentos de entrega de Meta.

## 3. Consecuencias

- **Positivas:** Se elimina por completo la duplicación de mensajes y reservas; todas las reservas creadas por chat llevan `source: 'whatsapp'`, clave de idempotencia derivada del `wamid` y enlace de pago oficial.
- **Operativas:** Cualquier cambio futuro en flujos conversacionales o plantillas WABA (`reservaya_bienvenida_es`, `reservaya_recibo_pago_es`, `reservaya_recordatorio_cita_es`) se versiona exclusivamente en `ReservaYa-Whatsapp` y `Back-Reserva-Ya`.
