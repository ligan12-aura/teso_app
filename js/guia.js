// =================================================================
// Guía paso a paso de cada pantalla (como la de AURA APP)
// El botón flotante «Guía» oscurece la página y destaca, una a una, las
// zonas importantes de la pantalla abierta, con un globo que explica qué
// hacer en cada una. Se maneja con Anterior/Siguiente, las flechas ← → y Esc.
//
// Cada paso: { en, titulo, texto }. "en" puede ser:
//   - un selector CSS («.kpis», «[data-tomar]»);
//   - "t:Texto": el título (h1, h2 o h3) visible que contenga ese texto; se destaca su tarjeta;
//   - "b:Texto": el botón visible que contenga ese texto.
// Los pasos cuyo destino no existe o no se ve en el rol actual se omiten solos.
// =================================================================

const COMUN_MOVIL = { en: '.bottom-nav', titulo: 'Menú', texto: 'Cambia de sección desde aquí. En «Más» están las secciones que no caben en la barra.' };

const PAGINAS = {
  inicio: [
    { en: '.page-head', titulo: 'Resumen del mes', texto: 'Es la foto de la tesorería del mes. Con las flechas del selector cambias el mes que se muestra.' },
    { en: 'b:Movimiento', titulo: 'Registrar', texto: '«Movimiento» anota un ingreso o un gasto de la tesorería general. «Registrar culto» anota de una vez las ofrendas de un culto. Los diezmos se registran en el apartado Diezmos.' },
    { en: '.alert-strip', titulo: 'Avisos', texto: 'Si hay rendiciones esperando tu revisión, aparece este aviso. Tócalo para ir directo a revisarlas.' },
    { en: '.kpis', titulo: 'Cifras del mes', texto: 'Saldo en caja, ingresos, gastos (con el uso del presupuesto) y el resultado del mes, comparados con el mes anterior.' },
    { en: 't:Flujo de los últimos', titulo: 'Flujo de 12 meses', texto: 'Barras verdes = ingresos, rojas = gastos; la línea dorada es el saldo acumulado. Toca una barra para ver el detalle.' },
    { en: 't:Rendiciones de', titulo: 'Rendiciones', texto: 'Estado de la rendición de cada ministerio y si ya se le transfirió el ítem del mes.' },
    { en: 't:Ministerios este mes', titulo: 'Ministerios', texto: 'Cuánto de su presupuesto lleva gastado cada ministerio. Toca uno para abrirlo.' },
    { en: 't:Últimos movimientos', titulo: 'Últimos movimientos', texto: 'Lo último que se registró. «Ver todos» abre el libro completo en Tesorería.' },
  ],
  general: [
    { en: '.page-head', titulo: 'Tesorería general', texto: 'La caja de la iglesia. Elige ver un mes o el año completo y cambia el período con las flechas.' },
    { en: '.kpis', titulo: 'Cifras del período', texto: 'Ingresos, gastos, resultado y saldo al cierre del período elegido.' },
    { en: '.pres-strip', titulo: 'Presupuesto', texto: 'Cuánto del presupuesto mensual se ha gastado, incluidos los ítems transferidos a los ministerios.' },
    { en: 't:Gastos por tipo', titulo: 'Gastos por tipo', texto: 'En qué se fue el dinero. Toca un tipo para filtrar el libro y ver sus movimientos.' },
    { en: 't:Libro de movimientos', titulo: 'Libro de movimientos', texto: 'Todos los ingresos y gastos con su saldo. Busca, filtra y usa el lápiz para corregir o el basurero para eliminar.' },
    { en: 'b:Registrar culto', titulo: 'Registrar', texto: '«Registrar culto» anota lo recaudado en un culto; «Ingreso» y «Gasto» anotan un movimiento suelto con su respaldo.' },
  ],
  ministerios: [
    { en: '.kpis', titulo: 'Resumen', texto: 'Ministerios activos, presupuesto del mes, lo gastado y los gastos que aún no tienen boleta.' },
    { en: '.min-card', titulo: 'Cada ministerio', texto: 'Saldo, uso del presupuesto, gasto de los últimos meses y el estado de sus rendiciones. Toca la tarjeta para abrirlo.' },
  ],
  ministerio: [
    { en: '.min-hero', titulo: 'El ministerio', texto: 'Saldo disponible, líder, ítem y presupuesto. Cambia el mes con las flechas y descarga su planilla.' },
    { en: '.min-tabs:not(.mis-ministerios)', titulo: 'Secciones', texto: 'Finanzas, integrantes, asistencia y actividades del ministerio (las dos últimas solo si están habilitadas).' },
    { en: 't:Rendición de', titulo: 'Rendición del mes', texto: 'Los pasos de la rendición: el líder registra y confirma; tesorería revisa, aprueba u observa y luego transfiere el ítem.' },
    { en: '.pres-strip', titulo: 'Presupuesto', texto: 'Lo gastado en el mes frente al presupuesto que fijó tesorería.' },
    { en: '.kpis', titulo: 'Cifras del mes', texto: 'Saldo inicial, ingresos, gastos (y cuántas boletas tienen) y saldo al cierre.' },
    { en: 't:Movimientos de', titulo: 'Movimientos', texto: '«Rendir gasto» anota una compra con la foto de su boleta; «Ingreso» anota dinero que entró. Los gastos sin boleta quedan marcados.' },
    { en: 't:Gastos por categoría', titulo: 'En qué se gasta', texto: 'Reparto de los gastos del mes por categoría.' },
    { en: 't:Historial de rendiciones', titulo: 'Historial', texto: 'El estado de la rendición de cada mes. Toca un mes para abrirlo.' },
  ],
  integrantes: [
    { en: 'b:Agregar', titulo: 'Agregar', texto: 'Agrega a una persona al listado, o a varios miembros de la iglesia de una vez.' },
    { en: '.kpis', titulo: 'Resumen', texto: 'Integrantes activos, cuántos son miembros de la iglesia, cuántos no y los cumpleaños del mes.' },
    { en: 't:Listado', titulo: 'Listado', texto: 'Busca y filtra. Los que dicen «Miembro» están enlazados a su ficha de Miembros. Usa el lápiz para editar.' },
  ],
  actividades: [
    { en: 'b:Nueva actividad', titulo: 'Nueva actividad', texto: 'Crea un campamento, una salida o un evento con su fecha y la cuota por persona.' },
    { en: '.kpis', titulo: 'Resumen', texto: 'Cuántas actividades hay, lo que entró, lo que salió y el resultado.' },
    { en: '.act-card', titulo: 'Cada actividad', texto: 'Confirmados, cuántos pagaron, entradas, salidas y resultado. Tócala para abrirla.' },
  ],
  'actividades-general': [
    { en: '.min-tabs', titulo: 'Movimientos y Actividades', texto: 'Cambia entre el libro de la tesorería y las actividades de la iglesia.' },
    { en: 'b:Nueva actividad', titulo: 'Nueva actividad', texto: 'Crea un aniversario, un retiro o una venta con su fecha y la cuota por persona.' },
    { en: '.kpis', titulo: 'Resumen', texto: 'Cuántas actividades hay, lo que entró, lo que salió y el resultado.' },
    { en: '.act-card', titulo: 'Cada actividad', texto: 'Confirmados, cuántos pagaron, entradas, salidas y resultado. Tócala para abrirla.' },
  ],
  'actividad-general': [
    { en: '.kpis', titulo: 'Resumen', texto: 'Confirmados, cuotas pagadas (y cuánto falta), gastos y el resultado de la actividad.' },
    { en: 'b:Elegir confirmados', titulo: 'Confirmados', texto: 'Marca de la lista de miembros quiénes van. Cuando cada uno pague, toca «Registrar pago»: entra como ingreso «Actividades» de la tesorería en esa fecha.' },
    { en: 't:Entradas y salidas', titulo: 'Entradas y salidas', texto: 'Registra aquí los gastos y otros ingresos de la actividad. Todo queda también en el libro de la tesorería general.' },
  ],
  actividad: [
    { en: '.kpis', titulo: 'Resumen', texto: 'Confirmados, cuotas pagadas (y cuánto falta), gastos y el resultado de la actividad.' },
    { en: 'b:Elegir confirmados', titulo: 'Confirmados', texto: 'Marca del listado quiénes van. Cuando cada uno pague, toca «Registrar pago»: entra como ingreso del ministerio en esa fecha.' },
    { en: 't:Entradas y salidas', titulo: 'Entradas y salidas', texto: 'Registra aquí los gastos de la actividad con su boleta. Todo queda también en las finanzas del ministerio.' },
    { en: 'b:Editar', titulo: 'Editar', texto: 'Cambia la fecha, la cuota o cierra la actividad cuando termine.' },
  ],
  rendiciones: [
    { en: '.flow-explain', titulo: 'Cómo funciona', texto: 'Los cuatro pasos del cierre de cada mes, desde que el líder registra hasta que se transfiere el ítem.' },
    { en: '.status-cards', titulo: 'Estado del mes', texto: 'Cuántas rendiciones están en revisión, observadas, abiertas o aprobadas, y cuántos ítems ya se transfirieron.' },
    { en: 't:Rendiciones de', titulo: 'Cada ministerio', texto: 'Revisa los gastos y boletas con «Revisar»; aprueba u observa con un comentario; luego transfiere el ítem del mes siguiente.' },
  ],
  diezmos: [
    { en: '.page-head', titulo: 'Diezmos', texto: 'Elige el mes y el año. Todos los diezmos se registran aquí: «Registrar diezmos» para varios a la vez (por ejemplo los sobres del domingo), o tocando la celda de un hermano.' },
    { en: '.kpis', titulo: 'Cifras del mes', texto: 'Total diezmado, cuántos diezmaron y cuántos no, y el promedio por hermano (un matrimonio cuenta como 2).' },
    { en: 't:Mes a mes', titulo: 'Mes a mes', texto: 'Barras = total de cada mes; la línea verde = porcentaje de hermanos habilitados que diezmó.' },
    { en: 't:Hermanos en', titulo: 'Constancia', texto: 'Cuántos diezman de forma constante, irregular o no diezman en el año.' },
    { en: 't:Puntualidad del diezmo', titulo: 'Puntualidad', texto: 'Cuánto se demoran los hermanos en entregar el diezmo de cada mes: adelantado, puntual (hasta el día 10 del mes siguiente), atrasado o sin entregar. Abajo, quiénes aún no entregan el del mes anterior.' },
    { en: 'b:Reportes por WhatsApp', titulo: 'Reportes por WhatsApp', texto: 'Envía a cada hermano el resumen personal de sus diezmos del año. Puedes filtrar por constantes, irregulares o los que no diezman, editar el mensaje y ver cuáles ya se enviaron.' },
    { en: 't:Diezmos por hermano', titulo: 'Diezmos por hermano', texto: 'Una fila por hermano y una columna por mes. Toca una celda para registrar o corregir su diezmo de ese mes.' },
  ],
  miembros: [
    { en: 'b:Nuevo miembro', titulo: 'Agregar', texto: '«Nuevo miembro» abre una ficha en blanco; «Importar listado» carga muchos de una vez desde la planilla.' },
    { en: '.kpis', titulo: 'Resumen', texto: 'Miembros, activos, inactivos y cuántas fichas están completas.' },
    { en: 't:Cumpleaños', titulo: 'Cumpleaños', texto: 'Quiénes están de cumpleaños este mes.' },
    { en: 't:Listado', titulo: 'Listado', texto: 'Busca por nombre, celular, correo o RUT y filtra. Toca el lápiz para abrir la ficha y completar o corregir los datos.' },
  ],
  asistencia: [
    { en: '.min-tabs.asist-secciones', titulo: 'Secciones', texto: 'Cultos, discipulados en hogares y las reuniones de cada ministerio que lleva asistencia.' },
    { en: 'b:Tomar asistencia', titulo: 'Tomar asistencia', texto: 'Marca quiénes vinieron a la reunión. Si llegó alguien nuevo, agrégalo como visita desde la misma ventana.' },
    { en: '.kpis', titulo: 'Resumen', texto: 'Asistentes de la última reunión, el promedio y cuántos requieren atención.' },
    { en: 't:Faltaron', titulo: 'Para llamar', texto: 'Quienes llevan varias reuniones seguidas sin venir, para llamarlos o visitarlos. Puedes cambiar desde cuántas faltas avisar.' },
    { en: 't:Reuniones registradas', titulo: 'Reuniones', texto: 'Cada reunión con sus presentes. Toca una para corregirla.' },
    { en: 't:Asistencia por persona', titulo: 'Por persona', texto: 'Cuántas veces vino cada uno en las últimas reuniones, sus faltas seguidas y si es regular o irregular.' },
  ],
  discipulados: [
    { en: 'b:Nuevo grupo', titulo: 'Nuevo grupo', texto: 'Crea un grupo de discipulado por sector, con sus líderes elegidos de Miembros.' },
    { en: '.hogar-grupos', titulo: 'Grupos', texto: '«Resumen» muestra todos los grupos; toca uno para tomar su asistencia y ver sus personas.' },
    { en: 't:Discipulados en hogares', titulo: 'Resumen', texto: 'Líderes, personas, última reunión, promedio y cuántos requieren atención en cada grupo.' },
  ],
  admin: [
    { en: '.tabs', titulo: 'Configuración', texto: 'Presupuesto, ministerios, usuarios, datos generales e importación del historial, cada uno en su pestaña.' },
    { en: 't:Presupuesto mensual', titulo: 'Presupuesto general', texto: 'El tope de gasto mensual de la tesorería. Al cambiarlo, elige desde qué mes rige: los meses anteriores no cambian.' },
    { en: 't:ítem y presupuesto', titulo: 'Ministerios', texto: 'Ítem = lo que se le transfiere cada mes; presupuesto = lo máximo que puede gastar. Guarda al final.' },
  ],
  perfil: [
    { en: 't:Cambiar contraseña', titulo: 'Contraseña', texto: 'Cambia tu contraseña (mínimo 8 caracteres).' },
    { en: 't:Sesiones abiertas', titulo: 'Sesiones', texto: 'Si dejaste la sesión abierta en otro equipo, ciérrala en todos los dispositivos desde aquí.' },
  ],
};

// Pantalla abierta según la dirección (#/ruta/...)
function clave() {
  const p = location.hash.replace(/^#\//, '').split('/').filter(Boolean);
  const r = p[0] || '';
  if (r === 'ministerio' || r === 'mi-ministerio') {
    const sub = r === 'ministerio' ? p[2] : p[1];
    if (sub === 'integrantes') return 'integrantes';
    if (sub === 'actividades') return 'actividades';
    if (sub === 'actividad') return 'actividad';
    if (sub === 'asistencia') return 'asistencia';
    return 'ministerio';
  }
  if (r === 'asistencia' && p[1] === 'discipulados') return 'discipulados';
  if (r === 'general' && p[1] === 'actividades') return 'actividades-general';
  if (r === 'general' && p[1] === 'actividad') return 'actividad-general';
  return r;
}

const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
function destino(en) {
  const vista = document.querySelector('#view') || document;
  if (en.startsWith('t:')) {
    const t = en.slice(2).toLowerCase();
    const h = [...vista.querySelectorAll('h1, h2, h3')].find((x) => visible(x) && x.textContent.toLowerCase().includes(t));
    return h ? (h.closest('.card, .rend-panel, .pres-strip, article, section') || h.parentElement) : null;
  }
  if (en.startsWith('b:')) {
    const t = en.slice(2).toLowerCase();
    return [...vista.querySelectorAll('button, a.btn')].find((x) => visible(x) && x.textContent.toLowerCase().includes(t)) || null;
  }
  const raiz = en === '.bottom-nav' ? document : vista;
  return [...raiz.querySelectorAll(en)].find(visible) || null;
}

function pasosDe(k) {
  const lista = [...(PAGINAS[k] || [])];
  if (window.matchMedia('(max-width: 960px)').matches && lista.length) lista.push(COMUN_MOVIL);
  const vistos = new Set();
  return lista.map((p) => ({ ...p, el: destino(p.en) })).filter((p) => p.el && !vistos.has(p.el) && vistos.add(p.el));
}

let pasos = [], i = 0, capa = null, foco = null, tip = null, origen = null, boton = null;

function construir() {
  capa = document.createElement('div'); capa.className = 'guia-capa';
  foco = document.createElement('div'); foco.className = 'guia-foco';
  tip = document.createElement('div'); tip.className = 'guia-tip';
  tip.setAttribute('role', 'dialog'); tip.setAttribute('aria-modal', 'true');
  tip.setAttribute('aria-labelledby', 'guiaTit'); tip.setAttribute('aria-describedby', 'guiaTxt');
  tip.innerHTML = `<h2 id="guiaTit"></h2><p id="guiaTxt"></p>
    <div class="guia-pie"><span class="guia-n"></span>
      <div class="guia-acc"><button type="button" class="btn btn-ghost btn-sm guia-ant">← Anterior</button><button type="button" class="btn btn-primary btn-sm guia-sig"></button></div></div>
    <button type="button" class="guia-x" aria-label="Cerrar la guía">×</button>`;
  tip.querySelector('.guia-ant').addEventListener('click', () => ir(i - 1));
  tip.querySelector('.guia-sig').addEventListener('click', () => (i < pasos.length - 1 ? ir(i + 1) : cerrar()));
  tip.querySelector('.guia-x').addEventListener('click', cerrar);
  capa.addEventListener('click', cerrar);
  document.body.append(capa, foco, tip);
}

function teclas(e) {
  if (e.key === 'Escape') { e.preventDefault(); cerrar(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); if (i < pasos.length - 1) ir(i + 1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); if (i > 0) ir(i - 1); }
  else if (e.key === 'Tab') { // el foco no sale del globo
    const f = [...tip.querySelectorAll('button:not([hidden])')];
    const a = f.indexOf(document.activeElement);
    if (e.shiftKey && a <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && a === f.length - 1) { e.preventDefault(); f[0].focus(); }
  }
}

function ubicar() {
  if (!tip || !pasos[i]) return;
  const r = pasos[i].el.getBoundingClientRect(), m = 6;
  Object.assign(foco.style, { top: `${r.top - m}px`, left: `${r.left - m}px`, width: `${r.width + 2 * m}px`, height: `${r.height + 2 * m}px` });
  const W = innerWidth, H = innerHeight, tw = tip.offsetWidth, th = tip.offsetHeight, s = 14;
  let x, y;
  if (W < 640) { // celular: abajo o arriba, donde no tape la zona destacada
    x = (W - tw) / 2;
    y = r.bottom + s + th <= H - 12 ? r.bottom + s : (r.top - s - th >= 12 ? r.top - s - th : H - th - 12);
  }
  else if (r.right + s + tw <= W - 8) { x = r.right + s; y = r.top; }
  else if (r.left - s - tw >= 8) { x = r.left - s - tw; y = r.top; }
  else if (r.bottom + s + th <= H - 8) { x = r.left; y = r.bottom + s; }
  else { x = r.left; y = Math.max(8, r.top - s - th); }
  tip.style.left = `${Math.max(8, Math.min(x, W - tw - 8))}px`;
  tip.style.top = `${Math.max(8, Math.min(y, H - th - 8))}px`;
}

function ir(n) {
  i = Math.max(0, Math.min(n, pasos.length - 1));
  const p = pasos[i];
  // Desplazamiento instantáneo: el globo se ubica según la posición final de la zona
  p.el.scrollIntoView({ block: p.el.offsetHeight > innerHeight * 0.6 ? 'start' : 'center' });
  tip.querySelector('#guiaTit').textContent = p.titulo;
  tip.querySelector('#guiaTxt').textContent = p.texto;
  tip.querySelector('.guia-n').textContent = `Paso ${i + 1} de ${pasos.length}`;
  const ant = tip.querySelector('.guia-ant'), sig = tip.querySelector('.guia-sig');
  ant.hidden = i === 0;
  sig.textContent = i < pasos.length - 1 ? 'Siguiente →' : 'Terminar';
  requestAnimationFrame(ubicar);
  sig.focus({ preventScroll: true });
}

export function abrirGuia() {
  if (capa) return;
  pasos = pasosDe(clave());
  if (!pasos.length) return;
  origen = document.activeElement;
  construir();
  document.documentElement.classList.add('guia-activa');
  addEventListener('keydown', teclas, true);
  addEventListener('resize', ubicar); addEventListener('scroll', ubicar, true);
  ir(0);
}

export function cerrarGuia() {
  if (!capa) return;
  removeEventListener('keydown', teclas, true);
  removeEventListener('resize', ubicar); removeEventListener('scroll', ubicar, true);
  capa.remove(); foco.remove(); tip.remove(); capa = foco = tip = null;
  document.documentElement.classList.remove('guia-activa');
  (origen && document.contains(origen) ? origen : boton)?.focus();
}
const cerrar = cerrarGuia;

// El botón aparece solo en las pantallas que tienen recorrido (no en el ingreso)
function actualizar() {
  if (!boton) return;
  const hay = !document.body.classList.contains('is-login') && !!document.querySelector('#view') && !!PAGINAS[clave()];
  boton.hidden = !hay;
  if (!hay) cerrarGuia();
}

function iniciar() {
  if (boton) return;
  boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'guia-btn';
  boton.hidden = true;
  boton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M9.3 9.2a2.8 2.8 0 015.4 1c0 1.9-2.7 2.5-2.7 4"/><path d="M12 17.6h.01"/></svg><span>Guía</span>';
  boton.title = 'Recorrido por esta pantalla';
  boton.setAttribute('aria-haspopup', 'dialog');
  // Late en las primeras visitas, hasta que se use una vez
  let vista = false;
  try { vista = localStorage.getItem('teso_guia_recorrido') === '1'; } catch { /* sin almacenamiento */ }
  if (!vista) boton.classList.add('nueva');
  boton.addEventListener('click', () => {
    boton.classList.remove('nueva');
    try { localStorage.setItem('teso_guia_recorrido', '1'); } catch { /* sin almacenamiento */ }
    abrirGuia();
  });
  document.body.append(boton);
  addEventListener('hashchange', () => { cerrarGuia(); setTimeout(actualizar, 0); });
  // Cada pantalla se dibuja dentro de #app: al cambiar, se revisa si hay recorrido
  const app = document.getElementById('app');
  if (app) new MutationObserver(actualizar).observe(app, { childList: true });
  actualizar();
}

iniciar();
