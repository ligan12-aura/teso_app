/**
 * Configuración de la app.
 *
 * API_URL: URL de la "Aplicación web" de Google Apps Script (termina en /exec).
 *          Si se deja vacía, la app funciona en MODO DEMO (datos de ejemplo
 *          guardados solo en este navegador).
 */
export const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbw4mzMOm8KSUgISiNkWHeqCrAVeaSIGAHCXH8_-MysheXowShEDGd078jkuCh0oJUGy/exec',
  // Servidor nuevo en Supabase. Para probarlo antes del cambio, abre la página con ?supabase al final.
  API_SUPABASE: 'https://qaqpyrmibzktuyvcpnuu.supabase.co/functions/v1/api',
  NOMBRE_IGLESIA: 'Iglesia Bautista El Redentor',
  LOCALE: 'es-CL',
  MONEDA: 'CLP'
};
