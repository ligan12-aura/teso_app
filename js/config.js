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
  GOOGLE_CLIENT_ID: '',
  NOMBRE_IGLESIA: 'Iglesia Bautista El Redentor',
  LOCALE: 'es-CL',
  MONEDA: 'CLP'
};
