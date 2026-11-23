// Reportes por WhatsApp: un resumen personal de los diezmos del año para cada hermano habilitado para diezmar
// (un matrimonio recibe un solo resumen, en el celular de cada uno). La página arma el mensaje y abre WhatsApp
// con el texto listo: quien envía es la persona de tesorería, desde su propio WhatsApp.
import { icon, esc, money, modal, toast, sinTildes } from '../ui.js';
import { resumenDiezmos, esDeMiembro, esEspecial, diezmosRegulares } from './diezmos.js';
import { editarMiembro } from './miembros.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_C = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const CLAVE_PLANTILLA = 'teso_wsp_plantilla_v2';
const PLANTILLA = `Hola {nombre} 👋, bendiciones.

Te compartimos el resumen de tus diezmos {periodo} en la Iglesia Bautista El Redentor:

• Total diezmado: *{total}*
• Meses con diezmo: {meses}
{especiales}
• Tu aporte equivale al *{aporte}* de los ingresos de la iglesia en este período

{detalle}

¡Gracias por tu fidelidad y por sostener la obra del Señor! 🙏
"Cada uno dé como propuso en su corazón… porque Dios ama al dador alegre" (2 Co 9:7)

Tesorería · Iglesia Bautista El Redentor
(Mensaje confidencial, solo para ti)`;

const leer = (k, def) => { try { return localStorage.getItem(k) ?? def; } catch { return def; } };
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
    const esp = especiales.filter((d) => delAnio(d) && es(d)).reduce((a, d) => a + d.monto, 0);
    const personas = pareja ? [x.m, pareja.m] : [x.m];
    filas.push({
      id: ids.join('+'),
      nombre: personas.map((p) => p.nombre).join(' y '),
      saludo: personas.map((p) => p.nombre.split(' ')[0]).join(' y '),
      personas: personas.map((p) => ({ id: p.id, nombre: p.nombre, celular: p.celular || '', numero: numeroWsp(p.celular) })),
      meses, total: meses.reduce((a, v) => a + v, 0), especiales: esp, matrimonio: !!pareja
    });
  });
  return { filas, mesesPeriodo };
}

function periodoTexto(anio, mesesPeriodo, hoy) {
  const hoyY = +hoy.slice(0, 4);
  if (anio < hoyY || mesesPeriodo >= 12) return `del año ${anio}`;
  return mesesPeriodo <= 1 ? `de enero de ${anio}` : `de enero a ${MESES[mesesPeriodo - 1]} de ${anio}`;
}

// Ingresos de la tesorería general en los primeros n meses del año
function ingresosIglesia(data, anio, n) {
  const hasta = `${anio}-${String(n).padStart(2, '0')}`;
  return (data.movGenerales || []).filter((m) => m.tipo === 'ingreso' && m.mes >= `${anio}-01` && m.mes <= hasta).reduce((a, m) => a + m.monto, 0);
}

export function armarMensaje(plantilla, f, anio, mesesPeriodo, hoy, data) {
  const conDiezmo = f.meses.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  // el mes en curso solo cuenta si ya tiene diezmo (mientras no termina, no es una falta)
  let evaluados = Math.max(1, Math.min(12, mesesPeriodo));
  if (anio === +hoy.slice(0, 4) && evaluados > 1 && !f.meses[evaluados - 1]) evaluados--;
  mesesPeriodo = evaluados;
  // aporte: lo que dio en el período (diezmo regular y especial) sobre todos los ingresos de la iglesia en esos meses
  const ing = data ? ingresosIglesia(data, anio, evaluados) : 0;
  const dio = f.meses.slice(0, evaluados).reduce((a, v) => a + v, 0) + f.especiales;
  const pct = ing ? (dio * 100) / ing : 0;
  const aporte = ing ? `${pct < 0.1 && dio ? 'menos de 0,1' : pct.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%` : '';
  const reemplazos = {
    nombre: f.saludo,
    anio: String(anio),
    periodo: periodoTexto(anio, mesesPeriodo, hoy),
    total: money(f.total),
    meses: conDiezmo.length ? `${conDiezmo.length} de ${evaluados}` : `aún no registramos diezmos en ${evaluados === 1 ? 'el mes' : `los ${evaluados} meses`}`,
    especiales: f.especiales ? `• Diezmos especiales (aparte): *${money(f.especiales)}*` : '',
    detalle: conDiezmo.length ? 'Detalle por mes:\n' + conDiezmo.map((i) => `   ${MESES_C[i]}: ${money(f.meses[i])}`).join('\n') : '',
    matrimonio: f.matrimonio ? '(diezmos del matrimonio)' : '',
    aporte
  };
  const rellenar = (l) => l.replace(/\{(\w+)\}/g, (m, k) => (k in reemplazos ? reemplazos[k] : m));
  return plantilla.split('\n')
    // una línea con un dato que no aplica (sin especiales, sin aporte…) se quita entera
    .filter((l) => !/\{(\w+)\}/.test(l) || ![...l.matchAll(/\{(\w+)\}/g)].some(([, k]) => k in reemplazos && !reemplazos[k]))
    .map(rellenar).join('\n')
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n').trim();
}

export function abrirReportesWsp(ctx, anioInicial) {
  const { data } = ctx;
  const hoyY = +data.hoy.slice(0, 4);
  const anios = [...new Set([hoyY, anioInicial, ...data.diezmos.map((d) => +(d.mes || d.fecha).slice(0, 4))])].filter(Boolean).sort((a, b) => b - a);
  let anio = anioInicial || hoyY;
  let plantilla = leer(CLAVE_PLANTILLA, PLANTILLA);
  let q = '';
  const claveEnviados = () => `teso_wsp_enviados_${anio}`;
  const enviados = () => { try { return JSON.parse(leer(claveEnviados(), '{}')) || {}; } catch { return {}; } };
  const marcarEnviado = (k) => { const e = enviados(); e[k] = new Date().toISOString().slice(0, 10); guardar(claveEnviados(), JSON.stringify(e)); };

  return modal({
    title: 'Reportes de diezmos por WhatsApp',
    wide: true,
    body: `
      <p class="muted small">Un resumen personal para cada hermano activo y habilitado para diezmar (un matrimonio recibe uno solo, en el celular de cada uno). Al tocar <b>Enviar</b> se abre WhatsApp con el mensaje listo: lo envías tú desde tu WhatsApp. Solo diezmo regular en el total; los especiales van aparte.</p>
      <div class="pick-tools">
        <select data-anio aria-label="Año">${anios.map((y) => `<option ${y === anio ? 'selected' : ''}>${y}</option>`).join('')}</select>
        <div class="search">${icon('search', 16)}<input type="search" placeholder="Buscar hermano…" data-buscar></div>
      </div>
      <details class="wsp-plantilla">
        <summary>${icon('edit', 14)} Editar el mensaje</summary>
        <textarea data-plantilla rows="14">${esc(plantilla)}</textarea>
        <p class="muted small">Puedes usar: <code>{nombre}</code> <code>{periodo}</code> <code>{total}</code> <code>{meses}</code> <code>{especiales}</code> <code>{detalle}</code> <code>{aporte}</code> <code>{anio}</code>. Si un dato no aplica (por ejemplo, sin diezmos especiales), esa línea se quita sola. <button type="button" class="link-btn" data-restaurar>Volver al mensaje original</button></p>
      </details>
      <div class="wsp-resumen" data-resumen></div>
      <ul class="wsp-lista" data-lista></ul>
      <div class="wsp-vista" data-vista hidden></div>`,
    hideFooter: true,
    onOpen(f, { close }) {
      const lista = f.querySelector('[data-lista]');
      const vista = f.querySelector('[data-vista]');
      const pintar = () => {
        const { filas, mesesPeriodo } = filasReporte(data, anio);
        const env = enviados();
        const qq = sinTildes(q);
        const vis = filas.filter((x) => !qq || sinTildes(x.nombre).includes(qq));
        const conNum = filas.filter((x) => x.personas.some((p) => p.numero));
        const listos = filas.filter((x) => x.personas.some((p) => env[x.id + ':' + p.id]));
        f.querySelector('[data-resumen]').innerHTML = `<span><b>${filas.length}</b> ${filas.length === 1 ? 'resumen' : 'resúmenes'} ${periodoTexto(anio, mesesPeriodo, data.hoy)}</span><span><b>${conNum.length}</b> con celular</span>${filas.length - conNum.length ? `<span class="falta"><b>${filas.length - conNum.length}</b> sin celular</span>` : ''}<span><b>${listos.length}</b> enviado${listos.length === 1 ? '' : 's'}</span>${Object.keys(env).length ? `<button type="button" class="link-btn" data-reiniciar>${icon('undo', 13)} Reiniciar envíos</button>` : ''}`;
        f.querySelector('[data-reiniciar]')?.addEventListener('click', () => {
          if (!confirm(`¿Reiniciar los envíos de ${anio}? Todos los botones vuelven a decir “Enviar”. No borra ningún mensaje ya enviado por WhatsApp.`)) return;
          try { localStorage.removeItem(claveEnviados()); } catch { /* sin almacenamiento */ }
          toast('Envíos reiniciados');
          pintar();
        });
        lista.innerHTML = vis.length ? vis.map((x) => `<li>
          <div class="wsp-quien"><b>${x.matrimonio ? '💍 ' : ''}${esc(x.nombre)}</b><small class="muted">${money(x.total)}${x.especiales ? ` · especiales ${money(x.especiales)}` : ''} · ${x.meses.filter(Boolean).length} mes${x.meses.filter(Boolean).length === 1 ? '' : 'es'} con diezmo</small></div>
          <div class="wsp-acciones">
            <button type="button" class="link-btn" data-ver="${esc(x.id)}">${icon('eye', 14)} Ver</button>
            ${x.personas.map((p) => p.numero
              ? `<button type="button" class="btn btn-sm ${env[x.id + ':' + p.id] ? 'btn-ghost' : 'btn-soft-green'}" data-enviar="${esc(x.id)}" data-persona="${p.id}" title="${esc(p.celular)}">${env[x.id + ':' + p.id] ? `${icon('check', 14)} Enviado` : `${icon('send', 14)} Enviar`}${x.personas.length > 1 ? ` a ${esc(p.nombre.split(' ')[0])}` : ''}</button>`
              : `<button type="button" class="link-btn falta" data-ficha="${p.id}" title="${p.celular ? 'El celular no tiene un formato válido' : 'Sin celular en su ficha'}">${icon('alert', 13)} ${p.celular ? 'Revisar' : 'Agregar'} celular${x.personas.length > 1 ? ` de ${esc(p.nombre.split(' ')[0])}` : ''}</button>`).join('')}
          </div></li>`).join('') : `<li class="muted">${filas.length ? 'Nadie coincide con la búsqueda' : 'No hay hermanos habilitados con diezmos en este año'}</li>`;
        const filaDe = (id) => filas.find((x) => x.id === id);
        lista.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => {
          const x = filaDe(b.dataset.ver);
          vista.hidden = false;
          vista.innerHTML = `<header><b>Mensaje para ${esc(x.nombre)}</b><button type="button" class="icon-btn sm" data-cerrar-vista aria-label="Cerrar vista previa">${icon('x', 15)}</button></header><pre>${esc(armarMensaje(plantilla, x, anio, mesesPeriodo, data.hoy, data))}</pre>`;
          vista.querySelector('[data-cerrar-vista]').addEventListener('click', () => { vista.hidden = true; });
          vista.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }));
        lista.querySelectorAll('[data-enviar]').forEach((b) => b.addEventListener('click', () => {
          const x = filaDe(b.dataset.enviar);
          const p = x.personas.find((y) => y.id === b.dataset.persona);
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
      f.querySelector('[data-anio]').addEventListener('change', (e) => { anio = +e.target.value; vista.hidden = true; pintar(); });
      const bq = f.querySelector('[data-buscar]');
      bq.addEventListener('input', () => { q = bq.value; pintar(); });
      const ta = f.querySelector('[data-plantilla]');
      ta.addEventListener('input', () => { plantilla = ta.value; guardar(CLAVE_PLANTILLA, plantilla); vista.hidden = true; });
      f.querySelector('[data-restaurar]').addEventListener('click', () => { plantilla = PLANTILLA; ta.value = PLANTILLA; guardar(CLAVE_PLANTILLA, PLANTILLA); toast('Se restauró el mensaje original'); });
      pintar();
    }
  });
}
