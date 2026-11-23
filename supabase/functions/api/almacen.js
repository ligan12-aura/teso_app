// Memoria de una consulta: todas las filas se cargan al inicio (Core.js trabaja de forma síncrona),
// los cambios quedan anotados y al final se guardan juntos en Postgres dentro de la misma transacción.
// Tablas internas (no las ve Core.js): "_archivos" (comprobantes) y "_limites" (intentos de ingreso).

export function crearAlmacen(filas) {
  const tablas = {};
  for (const f of filas) (tablas[f.tabla] ||= []).push(f.datos);
  const sucias = new Map(); // "tabla\u0000id" → { tabla, id }
  const marcar = (t, id) => sucias.set(t + '\u0000' + id, { tabla: t, id: String(id) });
  const lista = (t) => (tablas[t] ||= []);
  const store = {
    read: (t) => lista(t),
    insert: (t, r) => { lista(t).push({ ...r }); marcar(t, r.id); },
    insertMany: (t, rs) => { for (const r of rs) { lista(t).push({ ...r }); marcar(t, r.id); } },
    update: (t, id, r) => {
      const l = lista(t), i = l.findIndex((x) => String(x.id) === String(id));
      if (i < 0) throw new Error('Registro no encontrado');
      l[i] = { ...r }; marcar(t, id);
    },
    remove: (t, id) => {
      const l = lista(t), i = l.findIndex((x) => String(x.id) === String(id));
      if (i >= 0) { l.splice(i, 1); marcar(t, id); }
    }
  };
  // Cambios finales: lo que existe se guarda (insert/update), lo que ya no está se borra
  function cambios(soloTablas) {
    const guardar = [], borrar = [];
    for (const { tabla, id } of sucias.values()) {
      if (soloTablas && !soloTablas.includes(tabla)) continue;
      const r = lista(tabla).find((x) => String(x.id) === id);
      if (r) guardar.push({ tabla, id, datos: r }); else borrar.push({ tabla, id });
    }
    return { guardar, borrar };
  }
  return { store, cambios };
}

// Contador de intentos fallidos de ingreso (reemplaza el CacheService de Google)
export function crearLimites(store, ahora = () => Date.now()) {
  const T = '_limites';
  const fila = (k) => store.read(T).find((x) => x.id === k);
  return {
    get(clave) { const r = fila(clave); return r && r.vence > ahora() ? r.valor : null; },
    put(clave, valor, seg) {
      const r = { id: clave, valor: String(valor), vence: ahora() + seg * 1000 };
      if (fila(clave)) store.update(T, clave, r); else store.insert(T, r);
    },
    remove(clave) { store.remove(T, clave); }
  };
}

// Comprobantes en Supabase Storage. Core.js es síncrono: las subidas se anotan y se hacen al final;
// una descarga devuelve una marca que la función reemplaza por el archivo antes de responder.
export function crearArchivos(store, uuid) {
  const T = '_archivos';
  const subir = [], borrar = [];
  return {
    files: {
      save(o) {
        const id = 'sb' + String(uuid()).replace(/-/g, '').slice(0, 20);
        const carpeta = (o.carpeta || []).map((c) => String(c).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_')).join('/');
        const ruta = (carpeta ? carpeta + '/' : '') + id;
        store.insert(T, { id, nombre: String(o.nombre || 'comprobante').slice(0, 120), mime: o.mime, ruta });
        subir.push({ ruta, mime: o.mime, base64: o.base64 });
        return id;
      },
      get(id) { return { __descargar: String(id) }; },
      remove(id) {
        const r = store.read(T).find((x) => x.id === String(id));
        if (r) { borrar.push(r.ruta); store.remove(T, r.id); }
      }
    },
    pendientes: { subir, borrar },
    infoDe: (id) => store.read(T).find((x) => x.id === String(id)) || null
  };
}
