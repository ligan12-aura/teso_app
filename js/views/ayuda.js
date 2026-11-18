// Guía de uso integrada: se abre con el botón "Ayuda" y muestra
// el tema de la pantalla en que está el usuario.
import { icon, modal } from '../ui.js';

const paso = (n, html) => `<li><span class="hp-n">${n}</span><div>${html}</div></li>`;
const pasos = (...items) => `<ol class="hp-steps">${items.map((t, i) => paso(i + 1, t)).join('')}</ol>`;
const tip = (html, cls = '') => `<div class="note ${cls}">${icon(cls === 'warn' ? 'alert' : 'sparkle', 16)}<span>${html}</span></div>`;
const btn = (ico, txt) => `<span class="hp-btn">${icon(ico, 13)} ${txt}</span>`;

const FLUJO = `
  <div class="hp-flow">
    <div><span>1</span><b>Líder registra</b><small>gastos con boleta e ingresos del mes</small></div>
    <div><span>2</span><b>Líder confirma</b><small>que la rendición está completa</small></div>
    <div><span>3</span><b>Tesorero revisa</b><small>aprueba u observa</small></div>
    <div><span>4</span><b>Se transfiere</b><small>el ítem del mes siguiente</small></div>
  </div>`;

const ESTADOS_HTML = `
  <ul class="hp-states">
    <li><span class="badge st-open">${icon('clock', 13)}Abierta</span> El líder todavía puede agregar, editar o borrar movimientos.</li>
    <li><span class="badge st-sent">${icon('send', 13)}En revisión</span> El líder confirmó. El mes queda bloqueado mientras tesorería revisa.</li>
    <li><span class="badge st-obs">${icon('alert', 13)}Observada</span> Tesorería pidió una corrección. El mes se desbloquea para corregir y reenviar.</li>
    <li><span class="badge st-ok">${icon('checkCircle', 13)}Aprobada</span> Revisada y cerrada. Ya se puede transferir el ítem del mes siguiente.</li>
  </ul>`;

const TEMAS = {
  tesorero: [
    {
      id: 'bienvenida', titulo: 'Cómo funciona', ico: 'sparkle', html: `
      <p>Esta app reúne en un solo lugar la <b>tesorería general</b> de la iglesia y el <b>control de los fondos de cada ministerio</b>. Todo lo que se registra queda guardado automáticamente en la planilla de Google y las boletas en Google Drive.</p>
      <h4>El ciclo de cada mes</h4>${FLUJO}
      <h4>Qué ve cada persona</h4>
      <ul class="hp-list">
        <li><b>Tesorero:</b> todo. Tesorería general, todos los ministerios, rendiciones y configuración.</li>
        <li><b>Líder de ministerio:</b> solo su ministerio. No ve la tesorería general ni los otros ministerios.</li>
      </ul>
      ${tip('Puedes abrir esta guía cuando quieras con el botón <b>Ayuda</b>. Siempre se abre en el tema de la pantalla donde estás.')}`
    },
    {
      id: 'inicio', titulo: 'Inicio', ico: 'home', html: `
      <p>Es el resumen de la tesorería. Con las flechas ${btn('chevL', '')}${btn('chevR', '')} del selector de mes cambias el mes que se muestra.</p>
      <ul class="hp-list">
        <li><b>Saldo en caja:</b> el dinero que debería haber hoy (saldo inicial + ingresos − gastos). La línea muestra cómo ha cambiado en 12 meses.</li>
        <li><b>Ingresos, gastos y resultado del mes</b>, comparados con el mes anterior.</li>
        <li><b>Flujo de 12 meses:</b> barras verdes (ingresos), rojas (gastos) y la línea dorada del saldo.</li>
        <li><b>Rendiciones:</b> el estado de cada ministerio del mes anterior. El ícono ${icon('transfer', 13)} verde indica que ya se transfirió el ítem.</li>
        <li><b>¿De dónde viene? / ¿A dónde va?:</b> en qué categorías entra y sale el dinero.</li>
        <li><b>Ministerios este mes:</b> cuánto ha gastado cada uno de lo que tiene disponible.</li>
      </ul>
      ${tip('Si aparece una franja azul “rendiciones esperando tu revisión”, haz clic en ella para ir directo a revisarlas.')}`
    },
    {
      id: 'general', titulo: 'Tesorería general', ico: 'wallet', html: `
      <p>Aquí está el <b>libro de ingresos y gastos de la iglesia</b>.</p>
      <h4>Registrar los ingresos de un culto</h4>
      ${pasos(`Presiona ${btn('church', 'Registrar culto')}.`, 'Elige la fecha y el medio (efectivo, transferencia…).', 'Escribe lo recaudado en diezmos, ofrendas, ofrenda misionera, etc. Los que queden vacíos no se registran.', 'Presiona <b>Registrar ingresos</b>. Se crea un ingreso por cada monto.')}
      <h4>Registrar otro ingreso o un gasto</h4>
      ${pasos(`Presiona ${btn('plus', 'Ingreso')} o ${btn('plus', 'Gasto')}.`, 'Completa monto, fecha, categoría y descripción. Si la categoría no está en la lista, elige <b>Otra…</b> y escríbela.', 'Opcional: adjunta la foto del comprobante.')}
      <h4>Buscar y revisar</h4>
      <ul class="hp-list">
        <li>Cambia entre <b>Mes</b> y <b>Año</b> para ver un período más largo.</li>
        <li>Filtra por tipo o categoría, o escribe en el buscador.</li>
        <li>La columna <b>Saldo</b> muestra cuánto había en caja después de cada movimiento.</li>
        <li>${icon('receipt', 13)} ver comprobante · ${icon('edit', 13)} editar · ${icon('trash', 13)} eliminar.</li>
      </ul>
      <h4>Tipos de gasto</h4>
      <p>Cada categoría pertenece a un <b>tipo</b>, para ver de un vistazo en qué se usa el dinero:</p>
      <ul class="hp-list">
        <li><b>Personal y remuneraciones:</b> sueldo pastoral, imposiciones, asignación familiar, fondo de indemnización, guardatemplo, aguinaldos.</li>
        <li><b>Servicios básicos:</b> luz, agua, gas, internet y teléfono.</li>
        <li><b>Templo y mantención:</b> aseo, reparaciones, arriendo, equipamiento.</li>
        <li><b>Vehículo:</b> mantención del furgón, combustible, seguro y permisos.</li>
        <li><b>Aportes y cooperación:</b> UNIBA, UBACH, convención, Hogar Bautista, fundaciones.</li>
        <li><b>Ministerios y educación:</b> ítems de ministerios, escuela dominical, misiones.</li>
        <li><b>Ayuda social:</b> ayudas a familias, ofrendas solidarias, condolencias.</li>
        <li><b>Actividades y administración:</b> reuniones, celebraciones, gastos bancarios y varios.</li>
      </ul>
      <p>La tarjeta <b>Gastos por tipo</b> muestra cuánto se gastó en cada uno; toca un tipo para filtrar el libro. Arriba, la franja de <b>presupuesto</b> muestra cuánto queda disponible en el mes.</p>
      ${tip(`Los movimientos con ${icon('lock', 13)} son transferencias de ítems a ministerios. No se editan aquí: si hubo un error, se anulan desde el ministerio.`, 'warn')}`
    },
    {
      id: 'ministerios', titulo: 'Ministerios', ico: 'grid', html: `
      <p>Una tarjeta por ministerio con su información del mes elegido:</p>
      <ul class="hp-list">
        <li><b>Saldo:</b> dinero que le queda al ministerio (se arrastra de un mes a otro).</li>
        <li><b>Barra:</b> cuánto ha gastado de lo que tenía disponible. Se pone roja si gastó más de lo disponible.</li>
        <li><b>Gráfico:</b> gastos de los últimos 6 meses.</li>
        <li><b>Abajo:</b> estado de la rendición del mes anterior y del actual, y si ya se transfirió el ítem.</li>
      </ul>
      <p>Arriba, <b>“Gastos sin boleta”</b> te avisa cuántos gastos no tienen respaldo.</p>
      <h4>Dentro de un ministerio</h4>
      <ul class="hp-list">
        <li>Ves todos sus movimientos y puedes abrir cada boleta con ${btn('receipt', 'Boleta')}.</li>
        <li>Desde el panel de rendición puedes <b>aprobar</b>, <b>observar</b> y <b>transferir el ítem</b>.</li>
        <li>El <b>historial de rendiciones</b> (a la derecha o abajo) te lleva a meses anteriores.</li>
      </ul>`
    },
    {
      id: 'rendiciones', titulo: 'Rendiciones e ítems', ico: 'checkCircle', html: `
      <p>Es la pantalla del <b>cierre de mes</b>. Por defecto muestra el mes anterior, que es el que se rinde.</p>
      ${FLUJO}
      <h4>Estados</h4>${ESTADOS_HTML}
      <h4>Revisar y aprobar</h4>
      ${pasos(`Presiona ${btn('eye', 'Revisar')} para ver los movimientos y las boletas del ministerio.`, `Si está todo bien, presiona ${btn('check', 'Aprobar')}.`, `Si falta algo, presiona <b>Observar</b> y escribe qué debe corregir. El líder verá tu comentario.`)}
      <h4>Transferir el ítem del mes siguiente</h4>
      ${pasos('Haz la transferencia real al líder desde el banco.', `En la app presiona ${btn('transfer', 'Ítem …')} (o <b>Transferir ítems aprobados</b> para todos a la vez).`, 'Confirma el monto y la fecha.')}
      <p>La app registra automáticamente <b>el gasto en la tesorería general</b> y <b>el ingreso en el ministerio</b>.</p>
      ${tip('Si la rendición del mes anterior no está aprobada, la app te avisará antes de transferir. Puedes continuar igual si es necesario. Si te equivocaste, usa <b>Anular</b> en el ministerio.', 'warn')}`
    },
    {
      id: 'diezmos', titulo: 'Diezmos', ico: 'heart', html: `
      <p>Control de los diezmos de cada hermano, mes a mes. Es <b>información confidencial</b>: solo la ve el tesorero.</p>
      <h4>Registrar</h4>
      ${pasos(`<b>En el culto:</b> en Tesorería → ${btn('church', 'Registrar culto')} presiona <b>Detallar diezmos por hermano</b> y escribe cuánto dio cada uno (y lo que venga sin nombre). Se guarda el ingreso del culto en la caja y, a la vez, el diezmo de cada hermano.`, `<b>Fuera del culto</b> (transferencia, depósito): toca la celda del hermano en el mes, o usa ${btn('plus', 'Registrar diezmos')} para varios a la vez. Con <b>Sumar a la caja</b> marcado se crea también el ingreso en la tesorería general, con la misma fecha. Puedes adjuntar la <b>foto o captura del comprobante</b> de la transferencia como respaldo; se ve con el botón “Comprobante”.`, 'Si corriges o eliminas un diezmo sumado a la caja, su ingreso en la tesorería se actualiza o se elimina solo. Eliminar el diezmo de un hermano registrado en un culto no cambia el total del culto (ese dinero ya se recibió): solo pasa a “sin identificar”.')}
      <h4>Categorías (solo hermanos activos y habilitados para diezmar)</h4>
      <p>En la ficha de cada miembro se indica si está <b>habilitado para diezmar</b>. Los no habilitados (por ejemplo, estudiantes o quienes no tienen ingresos) no se cuentan en la estadística; si igual dan un diezmo, se registra y suma al total del mes.</p>
      <ul class="hp-list">
        <li><span class="badge st-ok">Constante</span> diezmó en al menos el 80% de los meses transcurridos del año.</li>
        <li><span class="badge st-obs">Irregular</span> diezmó algunos meses. Si lleva 2 o más meses sin diezmar se indica bajo su nombre.</li>
        <li><span class="badge st-sin">No diezma</span> no tiene diezmos en el año.</li>
      </ul>
      <h4>Estadística del mes</h4>
      <p>Elige el <b>mes y el año</b> arriba (con las flechas o las listas). Verás el total diezmado y su variación frente al mes anterior, cuántos hermanos activos diezmaron y cuántos no, el promedio por diezmo y las listas de <b>quiénes diezmaron</b> y <b>quiénes no</b> ese mes. El gráfico <b>Mes a mes</b> muestra el total de cada mes del año y el % de hermanos que diezmó; toca una barra para ir a ese mes.</p>`
    },
    {
      id: 'miembros', titulo: 'Miembros', ico: 'users', html: `
      <p>Registro de los miembros de la iglesia con su estado y datos de contacto. Solo lo ve el tesorero.</p>
      <ul class="hp-list">
        <li><b>Activo / Inactivo:</b> al marcar a alguien inactivo se registra su <b>fecha de baja</b>. En el resumen de diezmos cuenta como activo hasta el mes anterior a la baja, y desde ahí deja de contar; su historial se conserva. Un miembro con diezmos no se puede eliminar: se marca inactivo.</li>
        <li><b>Ficha:</b> fecha de nacimiento, celular, correo, domicilio, notas y <b>cónyuge</b>. ${btn('edit', '')} abre la ficha.</li>
        <li><b>💍 Matrimonio:</b> al elegir el cónyuge, ambos quedan unidos. Al registrar diezmos, el matrimonio aparece en una sola fila y su diezmo cuenta para los dos hermanos.</li>
        <li><b>Ficha incompleta:</b> filtra a quienes les falta algún dato, para ir completándolos.</li>
        <li><b>Cumpleaños del mes:</b> aparecen arriba los hermanos activos que cumplen años este mes.</li>
        <li><b>Importar listado:</b> carga un Excel con los nombres en la primera columna; quienes digan “alejado/a” quedan inactivos.</li>
      </ul>`
    },
    {
      id: 'admin', titulo: 'Configuración', ico: 'settings', html: `
      <h4>Ministerios</h4>
      ${pasos(`Presiona ${btn('plus', 'Nuevo ministerio')}.`, 'Escribe el nombre, el <b>ítem mensual</b> y elige un ícono y un color.', 'Si un ministerio deja de funcionar, edítalo y desmarca <b>Ministerio activo</b>. Su historial se conserva.')}
      <h4>Usuarios (líderes)</h4>
      ${pasos(`Presiona ${btn('plus', 'Nuevo usuario')}.`, 'Escribe el nombre, un usuario corto (ej: <code>alabanza</code>), el rol <b>Líder</b> y su ministerio.', 'Inventa una <b>contraseña temporal</b> y envíasela junto con el enlace de la página.', 'Al entrar por primera vez, el líder deberá crear su propia contraseña.')}
      ${tip('Si un líder olvida su contraseña, edita su usuario y escribe una nueva contraseña temporal.')}
      <h4>Presupuesto</h4>
      <p>Define el <b>presupuesto mensual de la tesorería general</b>: el máximo para todos los gastos de cada mes, incluidos los ítems de los ministerios. Si un gasto o una transferencia lo supera, la app no lo deja registrar; para autorizarlo hay que subir el presupuesto. En la misma pantalla se fijan, por separado, el <b>ítem mensual</b> de cada ministerio (lo que se le transfiere; la transferencia no puede superarlo) y su <b>presupuesto mensual</b> (lo máximo que puede gastar en el mes). Solo el tesorero puede cambiar estos montos.</p>
      <h4>Importar historial</h4>
      <p>Carga el historial desde una <b>planilla tipo</b> (la misma que descarga la página, de la tesorería general o de un ministerio) o desde el libro antiguo de entradas y salidas. La app muestra un resumen antes de importar y no duplica lo que ya existe.</p>
      <h4>General</h4>
      <p>Define el <b>saldo inicial de caja</b>: el dinero que tenía la iglesia el día que empezaste a usar la app, y esa fecha.</p>`
    },
    {
      id: 'excel', titulo: 'Excel y respaldo', ico: 'sheet', html: `
      <ul class="hp-list">
        <li><b>Planilla automática:</b> cada movimiento se guarda al instante en la planilla de Google. Ábrela con ${btn('sheet', 'Abrir planilla')} en el menú. La pestaña <b>Resumen</b> calcula totales por mes sola.</li>
        <li><b>Descargar planilla:</b> el botón ${btn('download', 'Descargar planilla')} del menú genera la planilla de la tesorería general del año elegido, con los datos al día: resumen con saldos y presupuesto, flujo de caja por categoría y mes, y todos los movimientos. Dentro de cada ministerio hay un botón igual con su planilla. Las fórmulas siguen funcionando si agregas filas en Excel.</li>
        <li><b>Respaldo completo:</b> en Configuración → General puedes descargar todos los datos en bruto (.xlsx).</li>
        <li><b>Boletas:</b> se guardan en la carpeta privada <i>“Tesorería El Redentor · Boletas”</i> de Google Drive, ordenadas por ministerio y mes.</li>
      </ul>
      ${tip('No modifiques a mano las hojas de la planilla: la app usa la columna <b>id</b> para encontrar cada registro. Para corregir algo, hazlo desde la app.', 'warn')}`
    }
  ],
  lider: [
    {
      id: 'bienvenida', titulo: 'Cómo funciona', ico: 'sparkle', html: `
      <p>Aquí llevas el control del dinero de <b>tu ministerio</b>: lo que recibes (el ítem mensual y otros ingresos) y lo que gastas, con la foto de cada boleta.</p>
      <h4>El ciclo de cada mes</h4>${FLUJO}
      ${tip('Solo tú y tesorería ven la información de tu ministerio.')}
      <p>Puedes abrir esta guía cuando quieras con el botón <b>Ayuda</b>.</p>`
    },
    {
      id: 'mi-ministerio', titulo: 'Mi ministerio', ico: 'wallet', html: `
      <ul class="hp-list">
        <li><b>Saldo disponible hoy:</b> el dinero que le queda a tu ministerio.</li>
        <li>Con las flechas ${btn('chevL', '')}${btn('chevR', '')} cambias el mes que ves.</li>
        <li><b>Saldo inicial:</b> lo que sobró de meses anteriores.</li>
        <li><b>Ingresos:</b> el ítem mensual que te transfirió tesorería más otros ingresos.</li>
        <li><b>Gastos:</b> lo que has rendido, y cuántos gastos tienen boleta.</li>
        <li><b>Presupuesto del mes:</b> el máximo que puede gastar tu ministerio en el mes, definido por tesorería. No puedes gastar más que eso; al rendir un gasto verás cuánto te queda disponible.</li>
        <li><b>Saldo al cierre:</b> lo que debería quedarte al final del mes.</li>
      </ul>
      <p>El ítem mensual aparece solo, con fondo dorado ${icon('transfer', 13)}, cuando tesorería lo transfiere.</p>`
    },
    {
      id: 'gasto', titulo: 'Rendir un gasto', ico: 'camera', html: `
      ${pasos(`Presiona ${btn('camera', 'Rendir gasto')}.`, 'Escribe el <b>monto</b> y revisa la <b>fecha</b> de la compra.', 'Elige la <b>categoría</b> (materiales, alimentación, transporte…) y escribe una descripción corta, por ejemplo “Colación ensayo general”.', 'Toca <b>“Tomar foto o elegir archivo”</b> y fotografía la boleta. También puedes elegir una foto o un PDF.', 'Presiona <b>Registrar</b>.')}
      ${tip('Fotografía la boleta completa, sobre una superficie plana y con buena luz, para que se lea el monto y la fecha.')}
      ${tip(`Los gastos sin boleta quedan marcados con ${icon('alert', 13)} <b>Sin boleta</b>. Puedes agregarla después con ${icon('edit', 13)} editar.`, 'warn')}
      <h4>Registrar un ingreso extra</h4>
      <p>Si tu ministerio recibió dinero aparte del ítem (una venta, una ofrenda especial o una donación), usa ${btn('plus', 'Ingreso')}.</p>
      <h4>Corregir</h4>
      <p>${icon('edit', 13)} edita y ${icon('trash', 13)} elimina un movimiento. Solo puedes hacerlo mientras la rendición del mes esté <b>abierta</b> u <b>observada</b>.</p>`
    },
    {
      id: 'rendicion', titulo: 'Confirmar la rendición', ico: 'send', html: `
      <p>A fin de mes, cuando ya registraste <b>todos</b> los gastos e ingresos:</p>
      ${pasos('Ve al mes que vas a rendir con las flechas del selector.', `Presiona ${btn('send', 'Confirmar rendición de …')}.`, 'Revisa el resumen. Si quieres, deja un comentario para tesorería (por ejemplo, por qué falta una boleta).', 'Presiona <b>Confirmar y enviar</b>.')}
      <h4>Estados</h4>${ESTADOS_HTML}
      ${tip('Mientras tu rendición está <b>en revisión</b> puedes usar <b>Retirar para corregir</b> si te diste cuenta de un error.')}
      ${tip('Tesorería transfiere el ítem del mes siguiente solo cuando la rendición del mes anterior está aprobada. ¡Rinde a tiempo!', 'warn')}
      <h4>Si tu rendición fue observada</h4>
      ${pasos('Verás un aviso amarillo arriba. Tócalo para ir a ese mes.', 'Lee el comentario de tesorería y haz la corrección (por ejemplo, sube la boleta que faltaba).', `Presiona ${btn('send', 'Reenviar rendición')}.`)}`
    },
    {
      id: 'perfil', titulo: 'Mi cuenta', ico: 'user', html: `
      <ul class="hp-list">
        <li>En <b>Mi cuenta</b> puedes cambiar tu contraseña cuando quieras.</li>
        <li>Si olvidas tu contraseña, pídele al tesorero que te asigne una temporal.</li>
        <li>Para salir, usa el botón ${icon('logout', 13)} de arriba.</li>
      </ul>
      ${tip('En el celular puedes agregar la página a tu pantalla de inicio (en el menú del navegador, “Agregar a pantalla de inicio”) para abrirla como una app.')}`
    }
  ]
};

TEMAS.pastor = TEMAS.tesorero;
TEMAS.secretaria = [
  {
    id: 'bienvenida', titulo: 'Cómo funciona', ico: 'sparkle', html: `
    <p>Con tu usuario de <b>Secretaría</b> llevas el registro de los miembros de la iglesia: su estado y sus datos de contacto.</p>
    <ul class="hp-list">
      <li>Solo ves el apartado <b>Miembros</b> y <b>Mi cuenta</b>.</li>
      <li>La información financiera (tesorería, ministerios y diezmos) es visible solo para tesorería y el pastor.</li>
    </ul>
    ${tip('Puedes abrir esta guía cuando quieras con el botón <b>Ayuda</b>.')}`
  },
  TEMAS.tesorero.find((t) => t.id === 'miembros'),
  TEMAS.lider.find((t) => t.id === 'perfil')
];

const RUTA_A_TEMA = { inicio: 'inicio', general: 'general', ministerios: 'ministerios', ministerio: 'ministerios', rendiciones: 'rendiciones', diezmos: 'diezmos', miembros: 'miembros', admin: 'admin', 'mi-ministerio': 'mi-ministerio', perfil: 'perfil' };

export function abrirAyuda(rol, ruta = '') {
  const temas = TEMAS[rol] || TEMAS.lider;
  let actual = temas.find((t) => t.id === RUTA_A_TEMA[ruta]) ? RUTA_A_TEMA[ruta] : temas[0].id;
  return modal({
    title: `${icon('help', 20)} Guía de uso`,
    wide: true,
    hideFooter: true,
    body: `
      <div class="help">
        <nav class="help-nav">${temas.map((t) => `<button type="button" data-tema="${t.id}">${icon(t.ico, 16)}<span>${t.titulo}</span></button>`).join('')}</nav>
        <article class="help-body"></article>
      </div>`,
    onOpen(form) {
      const body = form.querySelector('.help-body');
      const show = (id) => {
        actual = id;
        const t = temas.find((x) => x.id === id);
        body.innerHTML = `<h3>${icon(t.ico, 20)} ${t.titulo}</h3>${t.html}
          <div class="help-pager">${pager(temas, id)}</div>`;
        const sc = form.querySelector('.modal-body');
        if (sc) sc.scrollTop = 0;
        form.querySelectorAll('[data-tema]').forEach((b) => b.classList.toggle('active', b.dataset.tema === id));
        form.querySelector(`.help-nav [data-tema="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
      };
      form.addEventListener('click', (e) => {
        const b = e.target.closest('[data-tema]');
        if (b) show(b.dataset.tema);
      });
      show(actual);
    }
  });
}

function pager(temas, id) {
  const i = temas.findIndex((t) => t.id === id);
  const prev = temas[i - 1], next = temas[i + 1];
  return `${prev ? `<button type="button" class="btn btn-ghost btn-sm" data-tema="${prev.id}">${icon('chevL', 15)} ${prev.titulo}</button>` : '<span></span>'}
    ${next ? `<button type="button" class="btn btn-primary btn-sm" data-tema="${next.id}">${next.titulo} ${icon('chevR', 15)}</button>` : ''}`;
}
