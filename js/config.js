/**
 * Configuración de la app.
 *
 * API_URL: servidor de la app. Desde el 23-11-2026 es la función "api" de Supabase
 *          (antes, la Aplicación web de Google Apps Script, que ya no acepta consultas).
 *          Si se deja vacía, la app funciona en MODO DEMO (datos de ejemplo
 *          guardados solo en este navegador).
 */
export const CONFIG = {
  API_URL: 'https://qaqpyrmibzktuyvcpnuu.supabase.co/functions/v1/api',
  // (?supabase al final de la dirección también usa este servidor; se mantiene por los enlaces de prueba)
  API_SUPABASE: 'https://qaqpyrmibzktuyvcpnuu.supabase.co/functions/v1/api',
  // Ingreso con Google: ID de cliente OAuth (público; termina en .apps.googleusercontent.com).
  // Vacío = ingreso con usuario y contraseña para todos.
  // Ingreso con Microsoft (Hotmail, Outlook, Live): ID de aplicación de Microsoft Entra (público). Vacío = sin botón.
  MS_CLIENT_ID: 'ae51abdd-7989-474a-9a13-f830c795f1c4',
  GOOGLE_CLIENT_ID: '1008155354544-195kplpah2agbd58i40mt2jvlk409v94.apps.googleusercontent.com',
  NOMBRE_IGLESIA: 'Iglesia Bautista El Redentor',
  LOCALE: 'es-CL',
  MONEDA: 'CLP'
};
