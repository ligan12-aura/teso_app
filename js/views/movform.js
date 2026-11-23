import { icon, esc, modal, formData, fileToPayload, toast, verArchivo, pesos, formatoPesos } from '../ui.js';
import { call, isDemo } from '../api.js';
import { presupuestoMinisterio, presupuestoGeneral } from '../calc.js';

/**
 * Formulario de movimiento (ingreso/gasto) compartido entre
 * tesorería general y ministerios.
 * opts: { ctx, ambito: 'general'|'ministerio', mov?, tipo?, ministerioId?, action, titulo }
 */
export function abrirFormMovimiento(opts) {
  const { ctx, ambito, mov } = opts;
  const data = ctx.data;
  const cats = data.categorias[ambito];
  const reservada = data.reservadas[ambito];
  const tipo0 = mov?.tipo || opts.tipo || 'gasto';
  const hoy = data.hoy;
  const esGeneral = ambito === 'general';
  // actividades de la tesorería general abiertas (o la del movimiento que se edita)
  const actsGen = esGeneral ? (data.actividades || []).filter((a) => !a.ministerioId && (a.estado !== 'cerrada' || a.id === mov?.actividadId)).sort((a, b) => b.fecha.localeCompare(a.fecha)) : [];

  const opt = (c, sel) => `<option ${c === sel ? 'selected' : ''}>${esc(c)}</option>`;
  const catOptions = (tipo, sel) => {
    // en la tesorería general los diezmos se registran solo en el apartado Diezmos
    const fuera = (c) => c === reservada || (esGeneral && tipo === 'ingreso' && ['Diezmos', 'Diezmos especiales'].includes(c) && sel !== c);
    const list = cats[tipo].filter((c) => !fuera(c));
    const custom = sel && !list.includes(sel);
    const gr = esGeneral && data.grupos ? data.grupos[tipo] : null;
    const body = gr
      ? gr.map(([g, cs]) => { const v = cs.filter((c) => !fuera(c)); return v.length ? `<optgroup label="${esc(g)}">${v.map((c) => opt(c, sel)).join('')}</optgroup>` : ''; }).join('')
      : list.map((c) => opt(c, sel)).join('');
    return body + (custom ? `<option selected>${esc(sel)}</option>` : '') + '<option value="__otra">Otra…</option>';
  };

  const body = `
    <div class="seg" role="radiogroup">
      <label><input type="radio" name="tipo" value="gasto" ${tipo0 === 'gasto' ? 'checked' : ''}><span class="seg-gasto">${icon('up', 15)} Gasto</span></label>
      <label><input type="radio" name="tipo" value="ingreso" ${tipo0 === 'ingreso' ? 'checked' : ''}><span class="seg-ingreso">${icon('down', 15)} Ingreso</span></label>
    </div>
    <div class="form-row">
      <label class="field"><span>Monto ($)</span><input name="monto" inputmode="numeric" class="input-money" placeholder="0" value="${mov ? mov.monto : ''}" required></label>
      <label class="field"><span>Fecha</span><input type="date" name="fecha" value="${mov?.fecha || hoy}" max="${hoy}" required></label>
    </div>
    <label class="field"><span>Categoría</span><select name="categoria">${catOptions(tipo0, mov?.categoria)}</select></label>
    <div class="pres-hint" data-pres hidden></div>
    <label class="field" data-otra hidden><span>Nombre de la categoría</span><input name="categoriaOtra" maxlength="40"></label>
    ${esGeneral && !opts.extra?.actividadId && actsGen.length ? `<label class="field"><span>Actividad <small class="muted">(opcional)</small></span><select name="actividadId"><option value="">— Ninguna —</option>${actsGen.map((a) => `<option value="${a.id}" ${a.id === mov?.actividadId ? 'selected' : ''}>${esc(a.nombre)}</option>`).join('')}</select><small class="hint">Si es un gasto o ingreso de una actividad de la iglesia, queda en su resultado.</small></label>` : ''}
    ${esGeneral ? `<label class="field"><span>Medio</span><select name="medio">${data.medios.map((m) => `<option ${m === (mov?.medio || 'Efectivo') ? 'selected' : ''}>${m}</option>`).join('')}</select></label>` : ''}
    <label class="field"><span>Descripción</span><input name="descripcion" maxlength="300" placeholder="${esGeneral ? 'Ej: Culto dominical, cuenta de luz…' : 'Ej: Colación ensayo, materiales…'}" value="${esc(mov?.descripcion || '')}"></label>
    <div class="field">
      <span>${esGeneral ? 'Comprobante (opcional)' : 'Foto de la boleta'}</span>
      <label class="upload">
        <input type="file" name="archivo" accept="image/*,application/pdf">
        <div class="upload-ui">
          <div class="upload-preview" ${mov?.archivoId ? '' : 'hidden'}>${mov?.archivoId ? `<span class="has-file">${icon('receipt', 20)} Boleta adjunta</span>` : ''}</div>
          <div class="upload-cta">${icon('camera', 22)}<span><strong>Tomar foto o elegir archivo</strong><small>JPG, PNG o PDF · se comprime automáticamente</small></span></div>
        </div>
      </label>
      ${mov?.archivoId ? `<div class="upload-actions"><button type="button" class="link-btn" data-ver>${icon('eye', 14)} Ver actual</button><label class="check"><input type="checkbox" name="quitarArchivo" value="1"> Quitar boleta</label></div>` : ''}
    </div>`;

  return modal({
    // el título puede traer el nombre de una actividad o ministerio: siempre como texto
    title: esc(opts.titulo || (mov ? 'Editar movimiento' : 'Nuevo movimiento')),
    body,
    submitLabel: mov ? 'Guardar cambios' : 'Registrar',
    onOpen(form) {
      const sel = form.categoria;
      const otra = form.querySelector('[data-otra]');
      form.querySelectorAll('[name=tipo]').forEach((r) => r.addEventListener('change', () => {
        sel.innerHTML = catOptions(form.tipo.value);
        otra.hidden = true;
      }));
      sel.addEventListener('change', () => { otra.hidden = sel.value !== '__otra'; if (!otra.hidden) form.categoriaOtra.focus(); });
      formatoPesos(form.monto);
      // Muestra cuánto queda del presupuesto del mes y avisa si el gasto lo supera
      const hint = form.querySelector('[data-pres]');
      const midForm = opts.ministerioId || ctx.user.ministerioId;
      const actualizarHint = () => {
        const tipo = form.tipo.value, fechaV = form.fecha.value, cat = form.categoria.value;
        const monto = pesos(form.monto.value);
        if (tipo !== 'gasto' || !fechaV) { hint.hidden = true; return; }
        const mesF = fechaV.slice(0, 7);
        let lim, gastado, etiqueta;
        if (esGeneral) {
          const p = presupuestoGeneral(data, mesF, mov?.id);
          if (!p.limite) { hint.hidden = true; return; }
          lim = p.limite; gastado = p.gastado; etiqueta = 'la tesorería';
        } else {
          const p = presupuestoMinisterio(data, midForm, mesF, mov?.id);
          if (!p.limite) { hint.hidden = true; return; }
          lim = p.limite; gastado = p.gastado; etiqueta = 'el ministerio';
        }
        const disp = lim - gastado;
        const excede = monto > disp;
        hint.hidden = false;
        hint.className = `pres-hint ${excede ? 'over' : ''}`;
        hint.innerHTML = `${icon(excede ? 'alert' : 'wallet', 14)} ${excede ? `<b>Supera el presupuesto.</b> ` : ''}Disponible para ${etiqueta} en ${mesF.slice(5, 7)}/${mesF.slice(0, 4)}: <b>${Math.max(0, disp).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })}</b> de ${lim.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })}`;
      };
      ['input', 'change'].forEach((ev) => form.addEventListener(ev, actualizarHint));
      actualizarHint();
      const file = form.archivo;
      const prev = form.querySelector('.upload-preview');
      file.addEventListener('change', async () => {
        const f = file.files[0];
        if (!f) return;
        prev.hidden = false;
        prev.innerHTML = '<div class="spinner sm"></div>';
        try {
          const p = await fileToPayload(f, isDemo ? 900 : 1600, isDemo ? 0.6 : 0.78);
          file._payload = p;
          prev.innerHTML = p.preview ? `<img src="${p.preview}" alt="Vista previa">` : `<span class="has-file">${icon('file', 20)} ${esc(f.name)}</span>`;
        } catch (e) { prev.innerHTML = `<span class="err">${esc(e.message)}</span>`; file.value = ''; file._payload = null; }
      });
      form.querySelector('[data-ver]')?.addEventListener('click', () => verArchivo(mov.archivoId, mov.descripcion || mov.categoria));
    },
    async onSubmit(form) {
      const d = formData(form);
      d.monto = pesos(d.monto);
      if (d.categoria === '__otra') d.categoria = d.categoriaOtra;
      delete d.categoriaOtra;
      if (!d.monto) throw new Error('Ingresa un monto');
      if (!d.categoria) throw new Error('Indica la categoría');
      const archivo = form.archivo._payload;
      if (archivo) { d.archivo = { nombre: archivo.nombre, mime: archivo.mime, base64: archivo.base64 }; }
      if (mov) { d.id = mov.id; d.quitarArchivo = !!d.quitarArchivo; }
      if (opts.ministerioId) d.ministerioId = opts.ministerioId;
      if (opts.extra) Object.assign(d, opts.extra);
      await call(opts.action, d);
      toast(!esGeneral && d.tipo === 'gasto' && !archivo && !mov?.archivoId ? 'Registrado. Recuerda subir la boleta después.' : mov ? 'Movimiento actualizado' : 'Movimiento registrado');
      await ctx.refresh();
    }
  });
}
