// Services/postgrestClient.js — ÚNICO punto de construcción del cliente PostgREST.
//
// Históricamente el app usaba @supabase/supabase-js, un wrapper pesado (auth, storage,
// realtime, functions) que jamás se usaba. Lo reemplazamos por @supabase/postgrest-js,
// que es exactamente la capa que supabase-js envuelve: MISMA cadena .from().select().eq()...
// y MISMA forma de respuesta { data, error }.
//
// ⚠️ DOS DETALLES QUE NO SE VEN Y QUE ROMPEN SILENCIOSAMENTE si se ignoran:
//   1. postgrest-js NO añade "/rest/v1" al URL (supabase-js lo hacía por dentro).
//   2. postgrest-js NO inyecta los headers de auth. Sin `apikey` + `Authorization: Bearer`,
//      Supabase responde 401.
// Ambos viven aquí para no tener que recordarlos en cada servicio.
const { PostgrestClient } = require("@supabase/postgrest-js");
const config = require("../config");

function createPostgrestClient() {
  return new PostgrestClient(`${config.supabase.url}/rest/v1`, {
    headers: {
      apikey: config.supabase.key,
      Authorization: `Bearer ${config.supabase.key}`,
    },
  });
}

module.exports = createPostgrestClient;