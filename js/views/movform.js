import { icon, esc, modal, formData, fileToPayload, toast, verArchivo } from '../ui.js';
import { call, isDemo } from '../api.js';

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

  const catOptions = (tipo, sel) => {
    const list = cats[tipo].filter((c) => c !== reservada);
    const custom = sel && !list.includes(sel);
    return list.map((c) => `<option ${c === sel ? 'selected' : ''}>${esc(c)}</option>`).join('') +
      (custom ? `<option selected>${esc(sel)}</option>` : '') + '<option value="__otra">Otra…</option>';
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
    <label class="field" data-otra hidden><span>Nombre de la categoría</span><input name="categoriaOtra" maxlength="40"></label>
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
    title: opts.titulo || (mov ? 'Editar movimiento' : 'Nuevo movimiento'),
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
      const money = form.monto;
      const fmt = () => { const d = money.value.replace(/\D/g, ''); money.value = d ? Number(d).toLocaleString('es-CL') : ''; };
      money.addEventListener('input', fmt); fmt();
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
      d.monto = Number(String(d.monto).replace(/\D/g, ''));
      if (d.categoria === '__otra') d.categoria = d.categoriaOtra;
      delete d.categoriaOtra;
      if (!d.monto) throw new Error('Ingresa un monto');
      if (!d.categoria) throw new Error('Indica la categoría');
      const archivo = form.archivo._payload;
      if (archivo) { d.archivo = { nombre: archivo.nombre, mime: archivo.mime, base64: archivo.base64 }; }
      if (mov) { d.id = mov.id; d.quitarArchivo = !!d.quitarArchivo; }
      if (opts.ministerioId) d.ministerioId = opts.ministerioId;
      await call(opts.action, d);
      toast(!esGeneral && d.tipo === 'gasto' && !archivo && !mov?.archivoId ? 'Registrado. Recuerda subir la boleta después.' : mov ? 'Movimiento actualizado' : 'Movimiento registrado');
      await ctx.refresh();
    }
  });
}
