// Guía de uso integrada: se abre con el botón "Ayuda" y muestra
// el tema de la pantalla en que está el usuario.
import { icon, modal } from '../ui.js';

const paso = (n, html) => `<li><span class="hp-n">${n}</span><div>${html}</div></li>`;
const pasos = (...items) => `<ol class="hp-steps">${items.map((t, i) => paso(i + 1, t)).join('')}</ol>`;
const tip = (html, cls = '') => `<div class="note ${cls}">${icon(cls === 'warn' ? 'alert' : 'info', 16)}<span>${html}</span></div>`;
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
      id: 'bienvenida', titulo: 'Cómo funciona', ico: 'info', html: `
      <p>Esta app reúne en un solo lugar la <b>administración</b> de la iglesia: la <b>tesorería general</b>, el <b>control de los fondos de cada ministerio</b>, la <b>ficha de los miembros</b> y la <b>asistencia</b>. Todo lo que se registra queda guardado en el servidor de la iglesia, y cada noche se copia a la planilla de Google como respaldo.</p>
      <h4>El ciclo de cada mes</h4>${FLUJO}
      <h4>Qué ve cada persona</h4>
      <ul class="hp-list">
        <li><b>Administrador, tesorero y pastor:</b> todo. Tesorería general, todos los ministerios y sus actividades, rendiciones, diezmos, miembros y configuración. La <b>asistencia</b> la ven solo el pastor, el administrador y la secretaría.</li>
        <li><b>Secretaría:</b> el registro de Miembros y la Asistencia. No ve dinero ni diezmos.</li>
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
      ${pasos(`Presiona ${btn('church', 'Registrar culto')}.`, 'Elige la fecha y el medio (efectivo, transferencia…).', 'Escribe lo recaudado en ofrendas, ofrenda misionera y pro-templo (los diezmos se registran en el apartado Diezmos). Los que queden vacíos no se registran.', 'Presiona <b>Registrar ingresos</b>. Se crea un ingreso por cada monto.')}
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
      <h4>Actividades de la iglesia</h4>
      <p>En la pestaña <b>Actividades</b> (arriba, junto a Movimientos) se crean las actividades de la iglesia: aniversario, retiro, venta… Igual que en los ministerios:</p>
      ${pasos(`Presiona ${btn('plus', 'Nueva actividad')}: nombre, fecha y cuota por persona (0 = sin cuota).`, `Con ${btn('users', 'Elegir confirmados')} marca a los <b>miembros</b> que participan.`, `Cuando alguien paga, presiona <b>Registrar pago</b>: entra como ingreso “Actividades” de la tesorería general con esa fecha. Si fue un error, usa <b>Anular</b>.`, `Registra sus gastos (y otros ingresos) con ${btn('camera', 'Gasto')} u <b>Otro ingreso</b> dentro de la actividad, o desde el libro eligiendo la actividad en el formulario. La actividad muestra entradas, salidas y su resultado.`)}
      ${tip(`Para entregar dinero extra a un ministerio (además de su ítem) presiona ${icon('transfer', 13)} <b>A ministerio</b>: queda como gasto aquí y como ingreso en la caja del ministerio. Si te equivocas, anúlala con el basurero del movimiento.`)}
      ${tip(`Los movimientos con ${icon('lock', 13)} son transferencias de ítems a ministerios, diezmos o cuotas de actividades. No se editan aquí: se corrigen desde el ministerio, el apartado Diezmos o la actividad.`, 'warn')}`
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
      <p>Control de los diezmos de cada hermano, mes a mes. Es <b>información confidencial</b>: solo la ven el administrador, el tesorero y el pastor.</p>
      <h4>Registrar</h4>
      ${pasos(`Todos los diezmos se registran aquí, nunca en el culto: toca la celda del hermano en el mes, o usa ${btn('plus', 'Registrar diezmos')} para varios a la vez (por ejemplo, los sobres del domingo).`, `<b>Fecha de entrega y mes al que corresponde:</b> la fecha es el día en que lo dio (así entra a la caja); el mes es al que corresponde. Por ejemplo, lo da el 11 de septiembre pero es el diezmo de julio: se ve en la columna de julio.`, `<b>Diezmo de varios meses:</b> al tocar la celda, elige en “¿Cuántos meses cubre?” (por ejemplo 3). El monto se reparte en partes iguales entre esos meses.`, `Con <b>Sumar a la caja</b> marcado se crea también el ingreso en la tesorería general. Puedes adjuntar la <b>foto o captura del comprobante</b>; se ve con el botón “Comprobante”. Si corriges o eliminas un diezmo sumado a la caja, su ingreso en la tesorería se actualiza o se elimina solo.`, `<b>Diezmo especial:</b> si es por un ingreso fuera de lo normal (herencia, bono, venta de un bien…), marca <b>Diezmo especial</b>. Entra a la caja como “Diezmos especiales” y se ve aparte en el mes, pero <b>no cuenta</b> en el total del diezmo regular, el promedio, las comparaciones con otros meses ni la constancia del hermano.`)}
      <h4>Categorías (solo hermanos activos y habilitados para diezmar)</h4>
      <p>En la ficha de cada miembro se indica si está <b>habilitado para diezmar</b>. Los no habilitados (por ejemplo, estudiantes o quienes no tienen ingresos) no se cuentan en la estadística ni aparecen en la tabla por hermano; si igual dan un diezmo, se registra y suma al total del mes. Al habilitar a alguien se guarda la fecha (<b>Habilitado desde</b>): cuenta en el análisis desde ese mes; antes, como no habilitado.</p>
      <p><b>💍 Matrimonios:</b> en la tabla por hermano aparecen en una sola fila. En el gráfico de categorías y en el promedio cuentan como 2 hermanos.</p>
      <ul class="hp-list">
        <li><span class="badge st-ok">Constante</span> diezmó en al menos el 80% de los meses transcurridos del año.</li>
        <li><span class="badge st-obs">Irregular</span> diezmó algunos meses. Si lleva 2 o más meses sin diezmar se indica bajo su nombre.</li>
        <li><span class="badge st-sin">No diezma</span> no tiene diezmos en el año.</li>
        <li><span class="badge st-open">Inactivo en 2026</span> en su ficha se marcó ese año como inactivo: ese año no se evalúa (ni constante ni irregular).</li>
      </ul>
      <h4>Reportes por WhatsApp</h4>
      <p>Con ${btn('send', 'Reportes por WhatsApp')} se prepara un resumen personal del año para cada hermano activo y habilitado para diezmar (un matrimonio recibe uno solo, en el celular de cada uno): total del diezmo regular, meses con diezmo, diezmos especiales aparte, detalle por mes y su <b>aporte</b> en % de los ingresos de la iglesia en el período. Al tocar <b>Enviar</b> se abre WhatsApp con el mensaje listo y lo envías tú. El mensaje se puede editar, el botón queda como “Enviado” y <b>Reiniciar envíos</b> los vuelve a “Enviar”. Quien no tenga celular en su ficha aparece con “Agregar celular”.</p>
      <h4>Estadística del mes</h4>
      <p>Elige el <b>mes y el año</b> arriba (con las flechas o las listas). Verás el total diezmado y su variación frente al mes anterior, cuántos hermanos activos diezmaron y cuántos no, el promedio por hermano (un matrimonio cuenta como 2) y las listas de <b>quiénes diezmaron</b> y <b>quiénes no</b> ese mes. El gráfico <b>Mes a mes</b> muestra el total de cada mes del año y el % de hermanos que diezmó; toca una barra para ir a ese mes.</p>`
    },
    {
      id: 'miembros', titulo: 'Miembros', ico: 'users', html: `
      <p>Registro de los miembros de la iglesia con su estado y datos de contacto. Lo ven el administrador, el tesorero, el pastor y la secretaría.</p>
      <ul class="hp-list">
        <li><b>Activo / Inactivo:</b> al marcar a alguien inactivo se registra su <b>fecha de baja</b>. En el resumen de diezmos cuenta como activo hasta el mes anterior a la baja, y desde ahí deja de contar; su historial se conserva. Un miembro con diezmos no se puede eliminar: se marca inactivo.</li>
        <li><b>Trasladado a otra iglesia:</b> en la ficha elige el estado “Trasladado a otra iglesia”, la <b>fecha del traslado</b> (obligatoria) y la iglesia de destino. Sus diezmos cuentan en la estadística mientras fue miembro (hasta el mes anterior al traslado) y desde ahí deja de contarse, sin aparecer como que dejó de diezmar. También sale de la asistencia, los discipulados y los listados de ministerios. Filtra a los trasladados con “Trasladados”.</li>
        <li><b>Fallecido:</b> elige ese estado con la <b>fecha de fallecimiento</b>. Como en un traslado, sus diezmos cuentan hasta esa fecha, sale de la asistencia y los grupos, y su ficha se conserva.</li>
        <li><b>Inactivo año a año:</b> en la ficha, en “Años en que estuvo inactivo”, marca los años en que dejó de venir. Por ejemplo, Juan estuvo activo en 2025, en 2026 dejó de ir y en 2027 volvió: marca solo <b>2026</b>. Ese año no cuenta en la constancia de sus diezmos ni como activo; los demás años, sí. Si marcas el año en curso, aparece como “Inactivo en 2026”. Al volver a poner Activo a alguien que estaba inactivo, la ficha propone marcar los años en que estuvo alejado.</li>
        <li><b>Tercera edad:</b> en un miembro activo, marca “Activo con condición de tercera edad”. Se ve la etiqueta en la lista (filtro “Tercera edad”) y en la asistencia no se le marcan ausencias: no aparece como irregular ni con faltas seguidas.</li>
        <li><b>Ficha:</b> fecha de nacimiento, celular, correo, domicilio, notas y <b>cónyuge</b>. ${btn('edit', '')} abre la ficha.</li>
        <li><b>💍 Matrimonio:</b> al elegir el cónyuge, ambos quedan unidos. Al registrar diezmos, el matrimonio aparece en una sola fila y su diezmo cuenta para los dos hermanos.</li>
        <li><b>Ficha incompleta:</b> filtra a quienes les falta algún dato, para ir completándolos.</li>
        <li><b>Cumpleaños del mes:</b> aparecen arriba los hermanos activos que cumplen años este mes.</li>
        <li><b>Importar listado:</b> carga un Excel con los nombres en la primera columna; quienes digan “alejado/a” quedan inactivos.</li>
      </ul>`
    },
    {
      id: 'asistencia', titulo: 'Asistencia', ico: 'calendar', html: `
      <p>Control de asistencia de los <b>cultos</b>, los <b>discipulados en hogares</b> y las reuniones de los <b>ministerios</b>. Lo ven solo el pastor, la secretaría y el administrador. Arriba eliges el apartado: <b>Cultos · Discipulados · Jóvenes…</b></p>
      <ul class="hp-list">
        <li><b>Tomar asistencia:</b> elige la fecha y la actividad (o escribe otra, por ejemplo “Reunión de oración”) y marca a los presentes. Usa el buscador para encontrar a alguien rápido. Si ya existe la asistencia de esa actividad ese día, ábrela en la lista para corregirla.</li>
        <li><b>Quiénes aparecen:</b> los miembros activos, las personas de los listados de los ministerios (por ejemplo Jóvenes) que no son miembros, y las visitas.</li>
        <li><b>Visitas:</b> si viene alguien nuevo, escribe su nombre en “¿Vino alguien nuevo?” y queda marcado y guardado para la próxima vez. También puedes agregarlo con ${btn('user', 'Agregar visita')}.</li>
        <li><b>Faltaron varias veces seguidas:</b> la app muestra solos a quienes llevan 3 o más reuniones seguidas sin venir (puedes cambiar el número), con la fecha de la última vez que vinieron y su celular, para llamarlos o visitarlos.</li>
        <li><b>Regular / irregular:</b> regular es quien vino a 3 de cada 4 de las últimas 8 reuniones o más; irregular, quien vino menos. Con menos de 3 reuniones registradas aparece “Pocos datos”. Los miembros de <b>tercera edad</b> aparecen como “Tercera edad” y no reciben alertas de ausencia.</li>
      </ul>
      <h4>Discipulados en hogares</h4>
      <ul class="hp-list">
        <li>Crea cada grupo con ${btn('plus', 'Nuevo grupo')}: nombre, sector, día y sus <b>líderes</b>, elegidos de la lista de Miembros: generalmente un matrimonio (al elegir a alguien casado se propone su cónyuge), o una sola persona. Los líderes quedan también como integrantes del grupo. El <b>Resumen</b> muestra todos los grupos con su última reunión, promedio y cuántos requieren atención.</li>
        <li>En el grupo, en <b>Personas del grupo</b>: ${btn('users', 'Agregar miembros')} los elige de la lista de Miembros (puedes marcar varios y filtrar “solo sin grupo”); ${btn('plus', 'No miembro')} agrega a quien participa sin ser miembro; ${btn('user', 'Visita')} agrega una visita con su celular y notas.</li>
        <li>${btn('check', 'Tomar asistencia')} funciona igual que en los cultos. Si llega alguien nuevo, escribe su nombre en “¿Vino alguien nuevo?” y queda como visita del grupo; después tócala para anotar su contacto o pasarla a integrante.</li>
        <li>Quien ya tiene asistencias no se quita del grupo: desmárcalo como activo. Un grupo con asistencias tampoco se elimina: se marca inactivo.</li>
      </ul>
      <h4>Reuniones de los ministerios</h4>
      <ul class="hp-list">
        <li>Los ministerios con listado (por ejemplo Jóvenes) tienen su apartado aquí para revisar su asistencia. La toma el líder dentro de su ministerio; la secretaría solo la ve (toca una reunión para ver quiénes vinieron).</li>
      </ul>`
    },
    {
      id: 'admin', titulo: 'Configuración', ico: 'settings', html: `
      <h4>Ministerios</h4>
      ${pasos(`Presiona ${btn('plus', 'Nuevo ministerio')}.`, 'Escribe el nombre, el <b>ítem mensual</b> y elige un ícono y un color. Si el ministerio ya tenía dinero al empezar, escribe su <b>saldo inicial</b> y a qué día corresponde (por defecto, el último día del mes anterior).', 'Si un ministerio deja de funcionar, edítalo y desmarca <b>Ministerio activo</b>. Su historial se conserva.')}
      <h4>Usuarios (líderes)</h4>
      ${pasos(`Presiona ${btn('plus', 'Nuevo usuario')}.`, 'Escribe el nombre, un usuario corto (ej: <code>alabanza</code>), el rol <b>Líder</b> y marca su ministerio (puede ser más de uno). Si lo lidera un matrimonio, crea un usuario para cada uno con el mismo ministerio.', 'Inventa una <b>contraseña temporal</b> y envíasela junto con el enlace de la página.', 'Al entrar por primera vez, el líder deberá crear su propia contraseña.')}
      ${tip('Si un líder olvida su contraseña, edita su usuario y escribe una nueva contraseña temporal.')}
      <h4>Presupuesto</h4>
      <p>Define el <b>presupuesto mensual de la tesorería general</b>: el máximo para todos los gastos de cada mes, incluidos los ítems de los ministerios. Si un gasto o una transferencia lo supera, la app no lo deja registrar; para autorizarlo hay que subir el presupuesto. Al cambiarlo eliges <b>desde qué mes rige</b>: los meses anteriores conservan el presupuesto que tenían, y en el historial se ve cada cambio (los futuros aparecen como “programado” y se pueden quitar). En la misma pantalla se fijan, por separado, el <b>ítem mensual</b> de cada ministerio (lo que se le transfiere; la transferencia no puede superarlo) y su <b>presupuesto mensual</b> (lo máximo que puede gastar en el mes). Solo el administrador, el tesorero y el pastor pueden cambiar estos montos.</p>
      <h4>Importar historial</h4>
      <p>Carga el historial desde una <b>planilla tipo</b> (la misma que descarga la página, de la tesorería general o de un ministerio) o desde el libro antiguo de entradas y salidas. La app muestra un resumen antes de importar y no duplica lo que ya existe.</p>
      <h4>General</h4>
      <p>Define el <b>saldo inicial de caja</b>: el dinero que tenía la iglesia el día que empezaste a usar la app, y esa fecha.</p>`
    },
    {
      id: 'excel', titulo: 'Excel y respaldo', ico: 'sheet', html: `
      <ul class="hp-list">
        <li><b>Planilla de respaldo:</b> cada noche se copian todos los datos a la planilla de Google, que queda solo para mirar (lo que se cambie directo ahí no llega a la página). La pestaña <b>Resumen</b> calcula totales por mes sola.</li>
        <li><b>Descargar planilla:</b> el botón ${btn('download', 'Descargar planilla')} del menú genera la planilla de la tesorería general del año elegido, con los datos al día: resumen con saldos y presupuesto, flujo de caja por categoría y mes, y todos los movimientos. Dentro de cada ministerio hay un botón igual con su planilla. Las fórmulas siguen funcionando si agregas filas en Excel.</li>
        <li><b>Respaldo completo:</b> en Configuración → General puedes descargar todos los datos en bruto (.xlsx).</li>
        <li><b>Boletas y comprobantes:</b> se guardan en un espacio privado del servidor, ordenados por ministerio y mes; solo los ve quien tiene permiso.</li>
      </ul>
      ${tip('No modifiques a mano las hojas de la planilla: la app usa la columna <b>id</b> para encontrar cada registro. Para corregir algo, hazlo desde la app.', 'warn')}`
    },
    {
      id: 'actividades', titulo: 'Integrantes y actividades', ico: 'users', html: `
      <p>Un ministerio puede tener su propio <b>listado de integrantes</b> (por ejemplo, Jóvenes) y <b>actividades con cuota</b>. Se activa en Configuración → Ministerios con la casilla “Listado de integrantes y actividades”. Ese ministerio muestra las pestañas <b>Finanzas · Jóvenes · Asistencia · Actividades</b>.</p>
      <p><b>Ministerio por matrimonios</b> (por ejemplo Familia): en Configuración → Ministerios, marca también “Los integrantes son matrimonios”. Cada integrante es un matrimonio (“Ana y Benjamín”) y se cuenta como uno en el listado, la asistencia y las actividades (la cuota es por matrimonio). Al agregar miembros, los casados aparecen y entran juntos; un matrimonio que no es miembro se agrega con los dos nombres.</p>
      <ul class="hp-list">
        <li><b>Enlazar con Miembros:</b> solo tesorería puede indicar que un integrante es miembro de la iglesia (“¿Es miembro de la iglesia?”). El líder ve su nombre, pero no los datos de su ficha.</li>
        <li><b>Asistencia del ministerio:</b> el líder (o el pastor o el administrador) pasa lista en sus reuniones con los integrantes del listado, y la app avisa quién lleva varias reuniones seguidas sin venir. Es aparte de la asistencia de los cultos.</li>
        <li><b>Pagos de cuota:</b> entran como ingreso del ministerio en la fecha del pago y se anulan desde la actividad.</li>
        <li><b>Resultado:</b> entradas − salidas de cada actividad; si es negativo, la diferencia sale de la caja del ministerio.</li>
        <li>Si desactivas el listado de un ministerio que ya tenía cuotas pagadas, esas cuotas siguen en sus finanzas y se pueden quitar desde ahí con ${btn('trash', '')}.</li>
      </ul>`
    }
  ],
  lider: [
    {
      id: 'bienvenida', titulo: 'Cómo funciona', ico: 'info', html: `
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
        <li>Si olvidas tu contraseña, pídele al administrador que te asigne una temporal.</li>
        <li>Para salir, usa el botón ${icon('logout', 13)} de arriba.</li>
      </ul>
      ${tip('En el celular puedes agregar la página a tu pantalla de inicio (en el menú del navegador, “Agregar a pantalla de inicio”) para abrirla como una app.')}`
    },
    {
      id: 'actividades', titulo: 'Jóvenes y actividades', ico: 'users', html: `
      <p>Si lideras <b>más de un ministerio</b> (por ejemplo Infantil y Familia), arriba aparece “Mis ministerios”: toca el que quieras ver; todo lo que registres queda en ese ministerio.</p>
      <p>Si tu ministerio tiene activado el <b>listado de integrantes y actividades</b> (por ejemplo, Jóvenes), verás las pestañas <b>Finanzas · Jóvenes · Asistencia · Actividades</b>.</p>
      <h4>Listado de jóvenes</h4>
      <ul class="hp-list">
        <li>Registra nombre, celular, correo y fecha de nacimiento de cada joven, sea o no miembro de la iglesia.</li>
        <li>Si un joven <b>se hace miembro</b> de la iglesia, no lo agregues de nuevo: cuando secretaría o tesorería lo registre en Miembros con el mismo nombre, queda enlazado solo y conserva su historial de actividades.</li>
        <li>En los jóvenes que son miembros, sus datos vienen de la ficha de Miembros. Si a la ficha le falta el celular, el correo o la fecha de nacimiento, puedes completarlo desde su ficha en el listado y queda guardado en Miembros.</li>
        <li>Si ya no participa, desmarca <b>Activo</b> en vez de eliminarlo.</li>
      </ul>
      <h4>Asistencia</h4>
      <ul class="hp-list">
        <li>En la pestaña <b>Asistencia</b> toca ${btn('check', 'Tomar asistencia')}, elige la fecha y la reunión (o escribe otra, por ejemplo “Vigilia”) y marca a los presentes del listado de jóvenes.</li>
        <li>Si vino alguien nuevo, escribe su nombre en “¿Vino alguien nuevo?”: queda en el listado como no miembro y marcado como presente.</li>
        <li>La app muestra sola a quienes llevan <b>3 o más reuniones seguidas sin venir</b> (puedes cambiar el número), con la última vez que vinieron y su celular, para llamarlos.</li>
        <li><b>Regular</b> es quien vino a 3 de cada 4 de las últimas 8 reuniones o más; <b>irregular</b>, quien vino menos. Toca una reunión registrada para corregirla.</li>
        <li>Quien tiene asistencias registradas no se puede eliminar del listado: desmarca <b>Activo</b>.</li>
      </ul>
      <h4>Actividades con cuota</h4>
      ${pasos('Crea la actividad con su <b>cuota por persona</b>.', 'Con <b>Elegir confirmados</b> marca, del listado de jóvenes, quiénes van.', 'Cuando cada uno pague, toca <b>Registrar pago</b> y pon la fecha en que entregó el dinero: entra como ingreso del ministerio en esa fecha.', 'Registra los <b>gastos</b> de la actividad (con su boleta) desde la misma actividad.')}
      <p>Verás el <b>resultado</b> de la actividad (entradas − salidas). Puede ser negativo: la diferencia sale de la caja del ministerio. Todos estos movimientos aparecen también en <b>Finanzas</b> y en tu rendición del mes.</p>
      ${tip('Si un pago se registró mal, usa <b>Anular</b> junto al pago y vuelve a registrarlo.')}`
    }
  ]
};

TEMAS.pastor = TEMAS.tesorero;
TEMAS.admin = TEMAS.tesorero;
TEMAS.secretaria = [
  {
    id: 'bienvenida', titulo: 'Cómo funciona', ico: 'info', html: `
    <p>Con tu usuario de <b>Secretaría</b> llevas el registro de los miembros de la iglesia (su estado y sus datos de contacto) y la asistencia a los cultos, los discipulados en hogares y las reuniones de los ministerios.</p>
    <ul class="hp-list">
      <li>Ves los apartados <b>Miembros</b>, <b>Asistencia</b> y <b>Mi cuenta</b>.</li>
      <li>La información financiera (tesorería, ministerios y diezmos) es visible solo para tesorería y el pastor.</li>
    </ul>
    ${tip('Puedes abrir esta guía cuando quieras con el botón <b>Ayuda</b>.')}`
  },
  {
    // Versión para la secretaría: sin referencias a diezmos (información que no ve)
    id: 'miembros', titulo: 'Miembros', ico: 'users', html: `
    <p>Registro de los miembros de la iglesia con su estado y datos de contacto. Lo ven el administrador, el tesorero, el pastor y la secretaría.</p>
    <ul class="hp-list">
      <li><b>Activo / Inactivo:</b> al marcar a alguien inactivo se registra su <b>fecha de baja</b> (desde cuándo no asiste) y su ficha se conserva. Si vuelve, márcalo activo otra vez.</li>
      <li><b>Trasladado a otra iglesia:</b> elige ese estado en la ficha con la fecha del traslado y la iglesia de destino. Deja de aparecer en la asistencia y los discipulados, y su ficha se conserva.</li>
      <li><b>Ficha:</b> fecha de nacimiento, celular, correo, domicilio, notas y <b>cónyuge</b>. ${btn('edit', '')} abre la ficha.</li>
      <li><b>💍 Matrimonio:</b> al elegir el cónyuge, ambos quedan unidos en sus fichas.</li>
      <li><b>Ficha incompleta:</b> filtra a quienes les falta algún dato, para ir completándolos.</li>
      <li><b>Cumpleaños del mes:</b> aparecen arriba los hermanos activos que cumplen años este mes.</li>
      <li><b>Importar listado:</b> carga un Excel con los nombres en la primera columna; quienes digan “alejado/a” quedan inactivos.</li>
      <li><b>Eliminar</b> a alguien del registro lo hace el administrador, el tesorero o el pastor. Si solo dejó de asistir, márcalo inactivo.</li>
    </ul>`
  },
  TEMAS.tesorero.find((t) => t.id === 'asistencia'),
  TEMAS.lider.find((t) => t.id === 'perfil')
];
// Líder de un grupo de discipulado
TEMAS.discipulado = [
  {
    id: 'asistencia', titulo: 'Mi grupo', ico: 'users', html: `
    <p>Con tu usuario de <b>Líder de discipulado</b> llevas la asistencia de tu grupo.</p>
    <ul class="hp-list">
      <li>${btn('check', 'Tomar asistencia')}: elige la fecha (se propone el día del grupo) y marca a los presentes.</li>
      <li>Si llega alguien nuevo, escribe su nombre en “¿Vino alguien nuevo?” y queda como visita. Después tócala en <b>Personas del grupo</b> para anotar su celular.</li>
      <li>Para corregir una reunión (por ejemplo, la fecha), toca el ${btn('edit', '')} de esa reunión, cambia lo que necesites y guarda.</li>
      <li>La app te avisa quién lleva varias reuniones seguidas sin venir, para llamarlo o visitarlo.</li>
      <li>Los miembros de la iglesia los agrega al grupo la secretaría o el pastor. Tú puedes agregar visitas y personas que no son miembros.</li>
    </ul>`
  },
  TEMAS.lider.find((t) => t.id === 'perfil')
];

const RUTA_A_TEMA = { integrantes: 'actividades', asistencia: 'asistencia', actividades: 'actividades', actividad: 'actividades', inicio: 'inicio', general: 'general', ministerios: 'ministerios', ministerio: 'ministerios', rendiciones: 'rendiciones', diezmos: 'diezmos', miembros: 'miembros', admin: 'admin', 'mi-ministerio': 'mi-ministerio', perfil: 'perfil' };

// ruta: la ruta completa (p. ej. "mi-ministerio/actividad/x"); conActividades: el ministerio del líder usa actividades
export function abrirAyuda(rol, ruta = '', { conActividades = false } = {}) {
  let temas = TEMAS[rol] || TEMAS.lider;
  // el tema de actividades solo lo ve el líder cuyo ministerio las tiene activadas
  if (!TEMAS[rol] || rol === 'lider') temas = temas.filter((t) => t.id !== 'actividades' || conActividades);
  // el tesorero no tiene acceso a Asistencia
  if (rol === 'tesorero') temas = temas.filter((t) => t.id !== 'asistencia').map((t) => (t.id === 'actividades' ? { ...t, html: t.html.replace(' · Asistencia', '').replace(/<li><b>Asistencia del ministerio:<\/b>[\s\S]*?<\/li>/, '') } : t));
  const partes = String(ruta).split('/');
  const sub = partes.find((x) => ['integrantes', 'asistencia', 'actividades', 'actividad'].includes(x));
  // la asistencia dentro de un ministerio se explica en el tema de integrantes y actividades
  const clave = sub === 'asistencia' && partes[0] !== 'asistencia' ? 'actividades' : RUTA_A_TEMA[sub] || RUTA_A_TEMA[partes[0]] || partes[0];
  const base = RUTA_A_TEMA[partes[0]];
  let actual = temas.find((t) => t.id === clave) ? clave : temas.find((t) => t.id === base) ? base : temas[0].id;
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
