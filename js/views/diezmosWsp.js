// Reportes por WhatsApp: un resumen personal de los diezmos del año para cada hermano habilitado para diezmar
// (un matrimonio recibe un solo resumen, en el celular de cada uno). La página arma el mensaje y abre WhatsApp
// con el texto listo: quien envía es la persona de tesorería, desde su propio WhatsApp.
import { icon, esc, money, modal, toast, sinTildes, coincide } from '../ui.js';
import { resumenDiezmos, esDeMiembro, esEspecial, diezmosRegulares, finEvaluacion } from './diezmos.js';
import { editarMiembro } from './miembros.js';
import { call, isDemo } from '../api.js';

// Envío automático (API oficial de WhatsApp): el texto es la plantilla aprobada por Meta que esté en uso
// (el servidor dice su nombre). Cada {{n}} lo completa la página con los datos del hermano.
export const PLANTILLA_META = `Hola {{1}}, bendiciones.

Te compartimos el resumen de tus diezmos {{2}} en la Iglesia Bautista El Redentor:

• Total diezmado: {{3}}
• Meses con diezmo: {{4}}
• Detalle: {{5}}

{{6}}

"Cada uno dé como propuso en su corazón, no con tristeza ni por necesidad, porque Dios ama al dador alegre" (2 Corintios 9:7)

Tesorería · Iglesia Bautista El Redentor
Mensaje confidencial, solo para ti.`;
// Versión 2: avisa que es un mensaje automático y a quién consultar
export const PLANTILLA_META_V2 = `${PLANTILLA_META}

Este es un mensaje automático y las respuestas a este número no se revisan. Ante cualquier duda o consulta, contactar directamente al tesorero Miguel Argomedo: +56 9 8519 5729.`;
const PLANTILLAS_META = { resumen_diezmos: PLANTILLA_META, resumen_diezmos_es: PLANTILLA_META, resumen_diezmos_v2: PLANTILLA_META_V2 };

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_C = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const CLAVE_PLANTILLA = 'teso_wsp_plantilla_v3';
// Frase para quien es irregular o no diezma en el período (constancia: misma regla que Diezmos, 80 % de los meses)
const FRASE_ANIMO = '¡Te animamos a ser constante con tu diezmo!';
const PLANTILLA = `Hola {nombre}, bendiciones.

Te compartimos el resumen de tus diezmos {periodo} en la Iglesia Bautista El Redentor:

• Total diezmado: *{total}*
• Meses con diezmo: {meses}
{especiales}
• Tu aporte equivale al *{aporte}* de los ingresos de la iglesia en este período

{detalle}

{animo}

¡Gracias por tu fidelidad y por sostener la obra del Señor!
"Cada uno dé como propuso en su corazón… porque Dios ama al dador alegre" (2 Co 9:7)

Tesorería · Iglesia Bautista El Redentor
(Mensaje confidencial, solo para ti)`;

// emojis (incluidos ⭐ ⬆ 🇨🇱, tonos de piel y combinaciones) y los espacios que dejan al quitarlos
export function quitarEmojis(t) {
  return String(t)
    .replace(/(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u{1F3FB}-\u{1F3FF}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}])/gu, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,.!?;:])/g, '$1')
    .replace(/^[ \t]+/gm, '')
    .replace(/[ \t]+$/gm, '');
}
const leer = (k, def) => { try { return localStorage.getItem(k) ?? def; } catch { return def; } };
// Mensaje editado con la versión anterior: se conserva, sin emojis y con la frase de ánimo antes del agradecimiento
function plantillaGuardada() {
  const actual = leer(CLAVE_PLANTILLA, null);
  if (actual !== null) return actual;
  const vieja = leer('teso_wsp_plantilla_v2', null);
  if (vieja === null) return PLANTILLA;
  let t = quitarEmojis(vieja);
  if (!t.includes('{animo}')) t = /¡Gracias/.test(t) ? t.replace(/¡Gracias/, '{animo}\n\n¡Gracias') : t + '\n\n{animo}';
  return t;
}
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

// Celular chileno → número para WhatsApp (569XXXXXXXX). null si no se puede usar.
export function numeroWsp(cel) {
  const d = String(cel || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 11 && d.startsWith('569')) return d;
  if (d.length === 9 && d.startsWith('9')) return '56' + d;
  if (d.length === 8) return '569' + d;
  if (d.length >= 10 && d.length <= 15 && !d.startsWith('0')) return d; // otro país, con su código
  return null;
}

// Filas del reporte: hermanos activos y habilitados, con diezmos regulares del año (o con algún mes por evaluar)
export function filasReporte(data, anio) {
  const { mesesPeriodo, porMiembro } = resumenDiezmos(data, anio, false);
  const regulares = diezmosRegulares(data);
  const especiales = data.diezmos.filter(esEspecial);
  const mesDe = (d) => d.mes || d.fecha.slice(0, 7);
  const delAnio = (d) => mesDe(d).startsWith(String(anio));
  const lista = Object.values(porMiembro).filter((x) => x.habilitado && x.m.estado === 'activo' && (x.enPeriodo || x.total > 0));
  const enLista = new Set(lista.map((x) => x.m.id));
  const usados = new Set();
  const filas = [];
  lista.sort((a, b) => a.m.nombre.localeCompare(b.m.nombre, 'es')).forEach((x) => {
    if (usados.has(x.m.id)) return;
    usados.add(x.m.id);
    const c = x.m.conyugeId && porMiembro[x.m.conyugeId];
    const pareja = c && c.m.conyugeId === x.m.id && enLista.has(c.m.id) && !usados.has(c.m.id) ? c : null;
    if (pareja) usados.add(pareja.m.id);
    const ids = pareja ? [x.m.id, pareja.m.id] : [x.m.id];
    const es = (d) => ids.some((id) => esDeMiembro(d, id));
    const meses = Array(12).fill(0);
    regulares.filter((d) => delAnio(d) && es(d)).forEach((d) => { meses[+mesDe(d).slice(5, 7) - 1] += d.monto; });
    const personas = pareja ? [x.m, pareja.m] : [x.m];
    const desde = pareja ? Math.min(x.activoDesde, pareja.activoDesde) : x.activoDesde;
    // especiales: también solo desde que es miembro o está habilitado para diezmar
    const esp = especiales.filter((d) => delAnio(d) && es(d) && +mesDe(d).slice(5, 7) - 1 >= (desde || 0)).reduce((a, d) => a + d.monto, 0);
    filas.push({
      id: ids.join('+'),
      nombre: personas.map((p) => p.nombre).join(' y '),
      saludo: personas.map((p) => p.nombre.split(' ')[0]).join(' y '),
      personas: personas.map((p) => ({ id: p.id, nombre: p.nombre, celular: p.celular || '', numero: numeroWsp(p.celular) })),
      meses, total: meses.reduce((a, v) => a + v, 0), especiales: esp, matrimonio: !!pareja, desde
    });
  });
  return { filas, mesesPeriodo };
}

// desde = mes (0-11) en que el hermano empieza a contar (miembro o habilitado para diezmar desde)
function periodoTexto(anio, mesesPeriodo, hoy, desde = 0) {
  const hoyY = +hoy.slice(0, 4);
  const completo = anio < hoyY || mesesPeriodo >= 12;
  if (desde > 0) {
    const fin = completo ? 11 : mesesPeriodo - 1;
    return desde >= fin ? `de ${MESES[Math.min(desde, 11)]} de ${anio}` : `de ${MESES[desde]} a ${MESES[fin]} de ${anio}`;
  }
  if (completo) return `del año ${anio}`;
  return mesesPeriodo <= 1 ? `de enero de ${anio}` : `de enero a ${MESES[mesesPeriodo - 1]} de ${anio}`;
}

// Ingresos de la tesorería general desde el mes "desde" (0 = enero) hasta el mes n del año
function ingresosIglesia(data, anio, n, desde = 0) {
  const hasta = `${anio}-${String(n).padStart(2, '0')}`;
  const inicio = `${anio}-${String(desde + 1).padStart(2, '0')}`;
  return (data.movGenerales || []).filter((m) => m.tipo === 'ingreso' && m.mes >= inicio && m.mes <= hasta).reduce((a, m) => a + m.monto, 0);
}

// Período de una fila: meses evaluados del año (el mes en curso, y el anterior hasta el día 10, solo si ya
// tienen diezmo: ver finEvaluacion), desde que cuenta
// (miembro desde / habilitado desde), total y meses con diezmo del período, y lo adelantado aparte
export function periodoFila(f, anio, mesesPeriodo, hoy) {
  const evaluados = Math.max(0, Math.min(12, mesesPeriodo, finEvaluacion(f.meses, anio, hoy)));
  const desde = Math.max(0, Math.min(f.desde || 0, evaluados));
  // solo cuentan los meses desde que es miembro o está habilitado (lo anterior no entra en su resumen)
  const enPeriodo = f.meses.slice(0, evaluados);
  return {
    evaluados, desde, evalFila: evaluados - desde,
    total: enPeriodo.slice(desde).reduce((a, v) => a + v, 0),
    conDiezmo: enPeriodo.map((v, i) => (v && i >= desde ? i : -1)).filter((i) => i >= 0),
    conEnFila: f.meses.slice(desde, evaluados).filter(Boolean).length,
    adelantados: f.meses.map((v, i) => (v && i >= evaluados ? i : -1)).filter((i) => i >= 0)
  };
}

function datosMensaje(f, anio, mesesPeriodo, hoy, data) {
  const pf = periodoFila(f, anio, mesesPeriodo, hoy);
  const evaluados = pf.evaluados;
  mesesPeriodo = evaluados;
  const totalPeriodo = pf.total;
  const adelantados = pf.adelantados;
  // aporte: lo que dio en el período (diezmo regular y especial) sobre todos los ingresos de la iglesia en esos meses
  const ing = data ? ingresosIglesia(data, anio, evaluados, pf.desde) : 0;
  const conDiezmo = pf.conDiezmo;
  const dio = totalPeriodo + f.especiales;
  const pct = ing ? (dio * 100) / ing : 0;
  const aporte = ing ? `${pct < 0.1 && dio ? 'menos de 0,1' : pct.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%` : '';
  // constante = diezmó en al menos el 80 % de los meses evaluados (desde que cuenta); si no, frase de ánimo
  const { evalFila, conEnFila } = pf;
  const animo = evalFila > 0 && conEnFila / evalFila < 0.8 ? FRASE_ANIMO : '';
  const reemplazos = {
    nombre: f.saludo,
    anio: String(anio),
    periodo: periodoTexto(anio, mesesPeriodo, hoy, f.desde || 0),
    total: money(totalPeriodo),
    // se cuentan desde que es miembro o está habilitado para diezmar (como en Diezmos)
    meses: conEnFila ? `${conEnFila} de ${evalFila}` : evalFila ? `aún no registramos diezmos en ${evalFila === 1 ? 'el mes' : `los ${evalFila} meses`}` : 'aún sin meses por evaluar',
    especiales: f.especiales ? `• Diezmos especiales (aparte): *${money(f.especiales)}*` : '',
    detalle: (conDiezmo.length ? 'Detalle por mes:\n' + conDiezmo.map((i) => `   ${MESES_C[i]}: ${money(f.meses[i])}`).join('\n') : '') +
      (adelantados.length ? `${conDiezmo.length ? '\n' : ''}Además, adelantado: ${adelantados.map((i) => `${MESES_C[i]} ${money(f.meses[i])}`).join(', ')}` : ''),
    matrimonio: f.matrimonio ? '(diezmos del matrimonio)' : '',
    aporte,
    animo
  };
  // detalle en una sola línea (la plantilla de Meta no admite saltos de línea en sus datos)
  const lineaDetalle = [
    conDiezmo.length ? conDiezmo.map((i) => `${MESES_C[i]} ${money(f.meses[i])}`).join(', ') : 'sin diezmos registrados en el período',
    f.especiales ? `diezmos especiales ${money(f.especiales)}` : '',
    adelantados.length ? `adelantado: ${adelantados.map((i) => `${MESES_C[i]} ${money(f.meses[i])}`).join(', ')}` : ''
  ].filter(Boolean).join(' · ');
  return { reemplazos, lineaDetalle };
}

// 6 datos de la plantilla de Meta, en orden
export function parametrosMeta(f, anio, mesesPeriodo, hoy, data) {
  const { reemplazos: r, lineaDetalle } = datosMensaje(f, anio, mesesPeriodo, hoy, data);
  return [r.nombre, r.periodo, r.total, r.meses, lineaDetalle,
    r.animo ? `${r.animo} ¡Gracias por tu fidelidad!` : '¡Gracias por tu fidelidad y por sostener la obra del Señor!'];
}
export const textoMeta = (params, nombre) => (PLANTILLAS_META[nombre] || PLANTILLA_META).replace(/\{\{(\d)\}\}/g, (m, n) => params[+n - 1] ?? m);

// A un matrimonio se le habla en plural (Les compartimos… sus diezmos… solo para ustedes)
const PLURAL = [
  [/\b(T|t)e compartimos\b/g, (m, t) => (t === 'T' ? 'Les' : 'les') + ' compartimos'],
  [/\b(T|t)e animamos a ser constante\b/g, (m, t) => (t === 'T' ? 'Los' : 'los') + ' animamos a ser constantes'],
  [/\b(T|t)e animamos\b/g, (m, t) => (t === 'T' ? 'Los' : 'los') + ' animamos'],
  [/\bpara ti\b/g, 'para ustedes'],
  [/\b(T|t)us\b/g, (m, t) => (t === 'T' ? 'Sus' : 'sus')],
  [/\b(T|t)u\b/g, (m, t) => (t === 'T' ? 'Su' : 'su')]
];
const enPlural = (t) => PLURAL.reduce((acc, [re, por]) => acc.replace(re, por), t);

export function armarMensaje(plantilla, f, anio, mesesPeriodo, hoy, data) {
  const { reemplazos } = datosMensaje(f, anio, mesesPeriodo, hoy, data);
  const rellenar = (l) => l.replace(/\{(\w+)\}/g, (m, k) => (k in reemplazos ? reemplazos[k] : m));
  if (f.matrimonio) {
    plantilla = enPlural(plantilla);
    if (reemplazos.animo) reemplazos.animo = enPlural(reemplazos.animo);
  }
  return plantilla.split('\n')
    // una línea con un dato que no aplica (sin especiales, sin aporte…) se quita entera
    .filter((l) => !/\{(\w+)\}/.test(l) || ![...l.matchAll(/\{(\w+)\}/g)].some(([, k]) => k in reemplazos && !reemplazos[k]))
    .map(rellenar).join('\n')
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n').trim();
}

// Motivos frecuentes por los que Meta no entrega un mensaje, en palabras simples
const MOTIVOS_WSP = {
  131026: 'ese número no tiene WhatsApp o no puede recibir este mensaje',
  131042: 'hay un problema con el método de pago de la cuenta de WhatsApp',
  131049: 'Meta lo retuvo para no saturar al destinatario; intenta otro día',
  131050: 'la persona bloqueó o dejó de recibir mensajes de la iglesia',
  131053: 'error al enviar el mensaje',
  132000: 'los datos no calzan con la plantilla',
  132001: 'la plantilla no existe en ese idioma',
  132015: 'la plantilla está pausada por baja calidad',
  368: 'la cuenta de WhatsApp de la iglesia está restringida',
  131031: 'la cuenta de WhatsApp de la iglesia está bloqueada'
};
const motivoWsp = (t) => { const c = +String(t).split(' ')[0]; return MOTIVOS_WSP[c] || String(t).replace(/^\d+\s*/, '') || 'motivo no informado'; };

// Constante / irregular / no diezma en el período, con el mismo criterio que la vista Diezmos
// (constante = diezmó en al menos el 80 % de los meses evaluados desde que cuenta)
const CATEGORIAS = [['todos', 'Todos'], ['constante', 'Constantes'], ['irregular', 'Irregulares'], ['sin', 'No diezman']];
const ETIQUETA_CAT = { constante: 'Constante', irregular: 'Irregular', sin: 'No diezma' };
export function categoriaFila(f, anio, mesesPeriodo, hoy) {
  const { evalFila, conEnFila } = periodoFila(f, anio, mesesPeriodo, hoy);
  if (evalFila <= 0) return null;
  return conEnFila === 0 ? 'sin' : conEnFila / evalFila >= 0.8 ? 'constante' : 'irregular';
}

export function abrirReportesWsp(ctx, anioInicial) {
  const { data } = ctx;
  const hoyY = +data.hoy.slice(0, 4);
  const anios = [...new Set([hoyY, anioInicial, ...data.diezmos.map((d) => +(d.mes || d.fecha).slice(0, 4))])].filter(Boolean).sort((a, b) => b - a);
  let anio = anioInicial || hoyY;
  let plantilla = plantillaGuardada();
  let q = '';
  let cat = 'todos';
  const sel = new Set(); // filas elegidas para el envío en grupo (modo automático)
  const claveEnviados = () => `teso_wsp_enviados_${anio}`;
  // automático: el servidor envía con la API oficial y guarda los envíos (los ve todo el equipo)
  const srv = { activo: false, enviados: {}, estados: {} };
  // un envío que Meta no pudo entregar vuelve a quedar pendiente (se puede reenviar, también en grupo)
  const enviados = () => {
    if (srv.activo) return Object.fromEntries(Object.entries(srv.enviados).filter(([k]) => (srv.estados[k] || {}).estado !== 'failed'));
    try { return JSON.parse(leer(claveEnviados(), '{}')) || {}; } catch { return {}; } };
  const marcarEnviado = (k) => { const e = enviados(); e[k] = new Date().toISOString().slice(0, 10); if (!srv.activo) guardar(claveEnviados(), JSON.stringify(e)); };
  const cargarEstado = async () => {
    if (isDemo) return;
    try { const r = await call('wspEstado', { anio }); srv.activo = !!r.activo; srv.enviados = r.enviados || {}; srv.estados = r.estados || {}; srv.plantilla = r.plantilla || ''; } catch { srv.activo = false; }
  };

  return modal({
    title: 'Reportes de diezmos por WhatsApp',
    wide: true,
    body: `
      <p class="muted small" data-intro>Un resumen personal para cada hermano activo y habilitado para diezmar (un matrimonio recibe uno solo, en el celular de cada uno). Al tocar <b>Enviar</b> se abre WhatsApp con el mensaje listo: lo envías tú desde tu WhatsApp. Solo diezmo regular en el total; los especiales van aparte.</p>
      <div class="pick-tools">
        <select data-anio aria-label="Año">${anios.map((y) => `<option ${y === anio ? 'selected' : ''}>${y}</option>`).join('')}</select>
        <div class="search">${icon('search', 16)}<input type="search" placeholder="Buscar hermano…" data-buscar></div>
        <div class="seg seg-sm" data-cats></div>
      </div>
      <details class="wsp-plantilla">
        <summary>${icon('edit', 14)} Editar el mensaje</summary>
        <textarea data-plantilla rows="14">${esc(plantilla)}</textarea>
        <p class="muted small">Puedes usar: <code>{nombre}</code> <code>{periodo}</code> <code>{total}</code> <code>{meses}</code> <code>{especiales}</code> <code>{detalle}</code> <code>{aporte}</code> <code>{animo}</code> (frase de ánimo para quien es irregular o no diezma) <code>{anio}</code>. Si un dato no aplica (por ejemplo, sin diezmos especiales), esa línea se quita sola. <button type="button" class="link-btn" data-restaurar>Volver al mensaje original</button></p>
      </details>
      <div class="wsp-resumen" data-resumen></div>
      <div class="wsp-grupo" data-grupo hidden></div>
      <ul class="wsp-lista" data-lista></ul>
      <div class="wsp-vista" data-vista hidden></div>`,
    hideFooter: true,
    onOpen(f, { close }) {
      const lista = f.querySelector('[data-lista]');
      const vista = f.querySelector('[data-vista]');
      const modoAuto = () => {
        f.querySelector('[data-intro]').innerHTML = srv.activo
          ? 'Un resumen personal para cada hermano activo y habilitado para diezmar (un matrimonio recibe uno solo, en el celular de cada uno). Filtra por constantes, irregulares o quienes no diezman, marca a los hermanos (o todos a la vez) y toca <b>Enviar a seleccionados</b>; también puedes enviar uno por uno. El mensaje sale <b>automáticamente</b> desde el WhatsApp de la iglesia, con la plantilla aprobada por Meta. Los envíos quedan registrados para todo el equipo.'
          : f.querySelector('[data-intro]').innerHTML;
        f.querySelector('.wsp-plantilla').hidden = srv.activo;
      };
      const pintar = () => {
        const { filas, mesesPeriodo } = filasReporte(data, anio);
        const env = enviados();
        const qq = sinTildes(q);
        const catDe = new Map(filas.map((x) => [x.id, categoriaFila(x, anio, mesesPeriodo, data.hoy)]));
        const cuenta = (k) => (k === 'todos' ? filas.length : filas.filter((x) => catDe.get(x.id) === k).length);
        f.querySelector('[data-cats]').innerHTML = CATEGORIAS.map(([k, l]) => `<label><input type="radio" name="wcat" value="${k}" ${cat === k ? 'checked' : ''}><span>${l} (${cuenta(k)})</span></label>`).join('');
        f.querySelectorAll('[name="wcat"]').forEach((r) => r.addEventListener('change', () => { cat = r.value; sel.clear(); pintar(); }));
        const vis = filas.filter((x) => (cat === 'todos' || catDe.get(x.id) === cat) && (!qq || coincide(x.nombre, qq)));
        const conCel = (x) => x.personas.some((p) => p.numero);
        for (const id of [...sel]) if (!filas.some((x) => x.id === id)) sel.delete(id);
        const conNum = filas.filter((x) => x.personas.some((p) => p.numero));
        const listos = filas.filter((x) => x.personas.some((p) => env[x.id + ':' + p.id]));
        f.querySelector('[data-resumen]').innerHTML = `<span><b>${filas.length}</b> ${filas.length === 1 ? 'resumen' : 'resúmenes'} ${periodoTexto(anio, mesesPeriodo, data.hoy)}</span><span><b>${conNum.length}</b> con celular</span>${filas.length - conNum.length ? `<span class="falta"><b>${filas.length - conNum.length}</b> sin celular</span>` : ''}<span><b>${listos.length}</b> enviado${listos.length === 1 ? '' : 's'}</span>${Object.keys(env).length ? `<button type="button" class="link-btn" data-reiniciar>${icon('undo', 13)} Reiniciar envíos</button>` : ''}`;
        // envío en grupo: se marcan hermanos (o todos los de la lista) y se envía a todos de una vez
        const grupo = f.querySelector('[data-grupo]');
        grupo.hidden = !srv.activo;
        if (srv.activo) {
          const elegibles = vis.filter(conCel);
          const todosMarcados = elegibles.length > 0 && elegibles.every((x) => sel.has(x.id));
          const nombreCat = cat === 'todos' ? '' : ` ${CATEGORIAS.find(([k]) => k === cat)[1].toLowerCase()}`;
          grupo.innerHTML = `<label class="check"><input type="checkbox" data-marcar-todos ${todosMarcados ? 'checked' : ''} ${elegibles.length ? '' : 'disabled'}> Seleccionar todos los${nombreCat} de la lista (${elegibles.length})</label>
            <button type="button" class="btn btn-primary btn-sm" data-enviar-sel ${sel.size ? '' : 'disabled'}>${icon('send', 14)} Enviar a ${sel.size} seleccionado${sel.size === 1 ? '' : 's'}</button>`;
          grupo.querySelector('[data-marcar-todos]').addEventListener('change', (e) => {
            elegibles.forEach((x) => (e.target.checked ? sel.add(x.id) : sel.delete(x.id)));
            pintar();
          });
          grupo.querySelector('[data-enviar-sel]').addEventListener('click', (e) => enviarGrupo(e.currentTarget, filas));
        }
        f.querySelector('[data-reiniciar]')?.addEventListener('click', async () => {
          if (!confirm(`¿Reiniciar los envíos de ${anio}? Todos los botones vuelven a decir “Enviar”. No borra ningún mensaje ya enviado por WhatsApp.`)) return;
          if (srv.activo) { try { await call('wspReiniciar', { anio }); srv.enviados = {}; } catch (e) { return toast(e.message, 'err'); } }
          else { try { localStorage.removeItem(claveEnviados()); } catch { /* sin almacenamiento */ } }
          toast('Envíos reiniciados');
          pintar();
        });
        lista.innerHTML = vis.length ? vis.map((x) => `<li>
          ${srv.activo ? `<input type="checkbox" class="wsp-sel" data-sel="${esc(x.id)}" ${sel.has(x.id) ? 'checked' : ''} ${conCel(x) ? '' : 'disabled'} aria-label="Seleccionar a ${esc(x.nombre)}">` : ''}
          <div class="wsp-quien"><b>${x.matrimonio ? '💍 ' : ''}${esc(x.nombre)}</b><small class="muted">${(() => { const pf = periodoFila(x, anio, mesesPeriodo, data.hoy); const c = catDe.get(x.id); return `${c ? `<span class="wsp-cat ${c}">${ETIQUETA_CAT[c]}</span> ` : ''}${money(pf.total)}${x.especiales ? ` · especiales ${money(x.especiales)}` : ''} · ${pf.conEnFila} de ${pf.evalFila} mes${pf.evalFila === 1 ? '' : 'es'} con diezmo${pf.adelantados.length ? ' · más adelantado' : ''}`; })()}</small></div>
          <div class="wsp-acciones">
            <button type="button" class="link-btn" data-ver="${esc(x.id)}">${icon('eye', 14)} Ver</button>
            ${x.personas.map((p) => p.numero
              ? `${estadoEnvio(x.id + ':' + p.id)}<button type="button" class="btn btn-sm ${env[x.id + ':' + p.id] ? 'btn-ghost' : 'btn-soft-green'}" data-enviar="${esc(x.id)}" data-persona="${p.id}" title="${esc(p.celular)}">${env[x.id + ':' + p.id] ? `${icon('check', 14)} Enviado` : `${icon('send', 14)} ${(srv.estados[x.id + ':' + p.id] || {}).estado === 'failed' ? 'Reintentar' : 'Enviar'}`}${x.personas.length > 1 ? ` a ${esc(p.nombre.split(' ')[0])}` : ''}</button>`
              : `<button type="button" class="link-btn falta" data-ficha="${p.id}" title="${p.celular ? 'El celular no tiene un formato válido' : 'Sin celular en su ficha'}">${icon('alert', 13)} ${p.celular ? 'Revisar' : 'Agregar'} celular${x.personas.length > 1 ? ` de ${esc(p.nombre.split(' ')[0])}` : ''}</button>`).join('')}
          </div></li>`).join('') : `<li class="muted">${filas.length ? 'Nadie coincide con la búsqueda' : 'No hay hermanos habilitados con diezmos en este año'}</li>`;
        const filaDe = (id) => filas.find((x) => x.id === id);
        lista.querySelectorAll('[data-sel]').forEach((c) => c.addEventListener('change', () => { if (c.checked) sel.add(c.dataset.sel); else sel.delete(c.dataset.sel); pintar(); }));
        lista.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => {
          const x = filaDe(b.dataset.ver);
          vista.hidden = false;
          const texto = srv.activo ? textoMeta(parametrosMeta(x, anio, mesesPeriodo, data.hoy, data), srv.plantilla) : armarMensaje(plantilla, x, anio, mesesPeriodo, data.hoy, data);
          vista.innerHTML = `<header><b>Mensaje para ${esc(x.nombre)}</b><button type="button" class="icon-btn sm" data-cerrar-vista aria-label="Cerrar vista previa">${icon('x', 15)}</button></header><pre>${esc(texto)}</pre>`;
          vista.querySelector('[data-cerrar-vista]').addEventListener('click', () => { vista.hidden = true; });
          vista.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }));
        lista.querySelectorAll('[data-enviar]').forEach((b) => b.addEventListener('click', async () => {
          const x = filaDe(b.dataset.enviar);
          const p = x.personas.find((y) => y.id === b.dataset.persona);
          if (srv.activo) {
            if (env[x.id + ':' + p.id] && !confirm(`A ${p.nombre} ya se le envió el resumen. ¿Enviarlo de nuevo?`)) return;
            b.disabled = true; b.classList.add('loading');
            try { await enviarAuto(x, p); toast(`Enviado a ${p.nombre}`); } catch (er) { toast(er.message, 'err'); }
            pintar();
            return;
          }
          const url = `https://wa.me/${p.numero}?text=${encodeURIComponent(armarMensaje(plantilla, x, anio, mesesPeriodo, data.hoy, data))}`;
          window.open(url, '_blank', 'noopener');
          marcarEnviado(x.id + ':' + p.id);
          pintar();
        }));
        lista.querySelectorAll('[data-ficha]').forEach((b) => b.addEventListener('click', () => {
          const m = data.miembros.find((y) => y.id === b.dataset.ficha);
          close(null);
          if (m) editarMiembro(ctx, m);
        }));
      };
      // envía a cada celular de las filas elegidas; quien ya lo recibió este año se omite
      async function enviarGrupo(b, filas) {
        const env = enviados();
        const todos = [];
        filas.filter((x) => sel.has(x.id)).forEach((x) => x.personas.forEach((p) => { if (p.numero) todos.push({ x, p }); }));
        const pend = todos.filter(({ x, p }) => !env[x.id + ':' + p.id]);
        const ya = todos.length - pend.length;
        if (!pend.length) return toast(ya ? 'Todos los seleccionados ya recibieron el resumen' : 'No hay celulares para enviar');
        if (!confirm(`Se enviará el resumen de ${anio} por WhatsApp a ${pend.length} celular${pend.length === 1 ? '' : 'es'}${ya ? ` (se omiten ${ya} que ya lo recibieron)` : ''}. ¿Continuar?`)) return;
        b.disabled = true;
        let ok = 0; const fallas = []; const conError = new Set();
        for (const [i, { x, p }] of pend.entries()) {
          b.textContent = `Enviando ${i + 1} de ${pend.length}…`;
          try { await enviarAuto(x, p); ok++; } catch (er) { fallas.push(`${p.nombre}: ${er.message}`); conError.add(x.id); }
        }
        // quedan marcados solo los que fallaron, para reintentar
        sel.clear(); conError.forEach((id) => sel.add(id));
        toast(`${ok} enviado${ok === 1 ? '' : 's'}${fallas.length ? ` · ${fallas.length} con error` : ''}`, fallas.length ? 'err' : undefined);
        if (fallas.length) alert('No se enviaron:\n' + fallas.join('\n'));
        pintar();
      }
      // estado que informa Meta después del envío: entregado, leído o no entregado (con el motivo)
      function estadoEnvio(k) {
        const e = srv.activo && srv.estados[k];
        if (!e || !e.estado || e.estado === 'sent') return '';
        if (e.estado === 'failed') return `<span class="wsp-est falla" title="${esc(e.error || '')}">${icon('alert', 13)} No entregado${e.error ? `: ${esc(motivoWsp(e.error))}` : ''}</span>`;
        return `<span class="wsp-est ok">${icon('check', 13)} ${e.estado === 'read' ? 'Leído' : 'Entregado'}</span>`;
      }
      async function enviarAuto(x, p) {
        const { mesesPeriodo } = filasReporte(data, anio);
        const r = await call('enviarWhatsapp', { anio, clave: x.id + ':' + p.id, miembroId: p.id, parametros: parametrosMeta(x, anio, mesesPeriodo, data.hoy, data) });
        srv.enviados[x.id + ':' + p.id] = r.fecha || data.hoy;
        delete srv.estados[x.id + ':' + p.id];
      }
      f.querySelector('[data-anio]').addEventListener('change', async (e) => { anio = +e.target.value; vista.hidden = true; sel.clear(); await cargarEstado(); pintar(); });
      const bq = f.querySelector('[data-buscar]');
      bq.addEventListener('input', () => { q = bq.value; pintar(); });
      const ta = f.querySelector('[data-plantilla]');
      ta.addEventListener('input', () => { plantilla = ta.value; guardar(CLAVE_PLANTILLA, plantilla); vista.hidden = true; });
      f.querySelector('[data-restaurar]').addEventListener('click', () => { plantilla = PLANTILLA; ta.value = PLANTILLA; guardar(CLAVE_PLANTILLA, PLANTILLA); toast('Se restauró el mensaje original'); });
      pintar();
      cargarEstado().then(() => { modoAuto(); pintar(); });
    }
  });
}
