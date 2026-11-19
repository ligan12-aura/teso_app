/**
 * Planilla tipo de tesorería (Excel profesional).
 * Se usa para el botón "Descargar planilla" (tesorería general y cada ministerio)
 * y como formato de importación del historial. No depende del navegador:
 * recibe la librería ExcelJS por parámetro (también corre en Node).
 *
 * d = {
 *   ambito: 'general' | 'ministerio', titulo, iglesia, anio, generado (texto),
 *   saldoInicial, presupuestoMensual, itemMensual (ministerio), color (hex, opcional),
 *   categorias: { ingreso: [...], gasto: [...] }            // ministerio
 *   grupos: { ingreso: [[grupo, [cats]]], gasto: [...] }      // general
 *   movimientos: [{ id, fecha:'YYYY-MM-DD', tipo:'ingreso'|'gasto', categoria, descripcion, monto, medio, boleta, observacion }],
 *   rendiciones: { 'YYYY-MM': 'aprobada' | ... }              // ministerio (opcional)
 * }
 */
export const FORMATO = 'teso_app_planilla';
export const VERSION = '1';
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_C = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const ESTADOS = { abierta: 'Abierta', enviada: 'En revisión', observada: 'Observada', aprobada: 'Aprobada' };

const C = {
  navy: 'FF23395D', navy2: 'FF1B2A45', gold: 'FFC99A3B', goldSoft: 'FFF7EFDD', goldText: 'FF8A6420',
  green: 'FF1F7A52', greenSoft: 'FFE4F4EC', rose: 'FFB23A48', roseSoft: 'FFFBE7E9', amberSoft: 'FFFCF1DA',
  grey: 'FF6F7787', line: 'FFE3DFD6', zebra: 'FFFAF8F3', white: 'FFFFFFFF', input: 'FFFFF6D6', ink: 'FF1B2433'
};
const PESOS = '"$"#,##0;[Red]-"$"#,##0;"–"';
const PESOS_OSCURO = '"$"#,##0;-"$"#,##0;"–"'; // para filas con fondo oscuro (sin rojo)
const PCT = '0%';
const FECHA = 'dd-mm-yyyy';
const FUENTE = 'Calibri';

const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const borde = (argb = C.line, style = 'thin') => ({ top: { style, color: { argb } }, bottom: { style, color: { argb } }, left: { style, color: { argb } }, right: { style, color: { argb } } });
const abajo = (argb = C.line, style = 'thin') => ({ bottom: { style, color: { argb } } });
const fecha = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const colLetra = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - m) / 26); } return s; };
const hexArgb = (hex, def = C.navy) => (/^#[0-9a-f]{6}$/i.test(hex || '') ? 'FF' + hex.slice(1).toUpperCase() : def);

function banda(ws, rango, texto, { size = 18, color = C.white, bg = C.navy, bold = true, height = 34, italic = false } = {}) {
  ws.mergeCells(rango);
  const c = ws.getCell(rango.split(':')[0]);
  c.value = texto;
  c.font = { name: FUENTE, size, bold, italic, color: { argb: color } };
  c.fill = fill(bg);
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(c.row).height = height;
  // pintar todas las celdas del rango (para que el relleno se vea completo)
  const [a, b] = rango.split(':');
  const ca = ws.getCell(a), cb = ws.getCell(b);
  for (let col = ca.col; col <= cb.col; col++) ws.getCell(ca.row, col).fill = fill(bg);
}
function encabezado(ws, fila, textos, { bg = C.navy, color = C.white, height = 30 } = {}) {
  textos.forEach((t, i) => {
    const c = ws.getCell(fila, i + 1);
    c.value = t;
    c.font = { name: FUENTE, size: 10.5, bold: true, color: { argb: color } };
    c.fill = fill(bg);
    c.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center', wrapText: true, indent: i === 0 ? 1 : 0 };
    c.border = borde(bg);
  });
  ws.getRow(fila).height = height;
}
function tarjeta(ws, rangoEtiqueta, rangoValor, etiqueta, valor, { numFmt = PESOS, editable = false, color = C.ink } = {}) {
  ws.mergeCells(rangoEtiqueta);
  const e = ws.getCell(rangoEtiqueta.split(':')[0]);
  e.value = etiqueta;
  e.font = { name: FUENTE, size: 9.5, bold: true, color: { argb: C.grey } };
  e.alignment = { vertical: 'bottom', horizontal: 'left', indent: 1 };
  ws.mergeCells(rangoValor);
  const v = ws.getCell(rangoValor.split(':')[0]);
  v.value = valor;
  v.numFmt = numFmt;
  v.font = { name: FUENTE, size: 17, bold: true, color: { argb: color } };
  v.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  const bg = editable ? C.input : C.zebra;
  [rangoEtiqueta, rangoValor].forEach((r) => {
    const [a, b] = r.split(':'); const ca = ws.getCell(a), cb = ws.getCell(b);
    for (let col = ca.col; col <= cb.col; col++) {
      const cell = ws.getCell(ca.row, col);
      cell.fill = fill(bg);
    }
  });
  if (editable) v.note = 'Celda editable';
}

export function construirPlanilla(ExcelJS, d) {
  const general = d.ambito === 'general';
  const anio = Number(d.anio);
  const acento = general ? C.gold : hexArgb(d.color, C.gold);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'App Tesorería · ' + (d.iglesia || '');
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;

  // ---------- definición de columnas de Movimientos ----------
  const cols = general
    ? [['fecha', 'Fecha', 12], ['tipo', 'Tipo', 10], ['categoria', 'Categoría', 26], ['grupo', 'Tipo de gasto / ingreso', 26], ['descripcion', 'Descripción', 44], ['medio', 'Medio', 14], ['ingreso', 'Ingreso', 14], ['egreso', 'Egreso', 14], ['saldo', 'Saldo', 15], ['boleta', 'Comprobante', 12], ['observacion', 'Observación', 30], ['id', 'ID (no modificar)', 16]]
    : [['fecha', 'Fecha', 12], ['tipo', 'Tipo', 10], ['categoria', 'Categoría', 24], ['descripcion', 'Descripción', 44], ['ingreso', 'Ingreso', 14], ['egreso', 'Egreso', 14], ['saldo', 'Saldo', 15], ['boleta', 'Boleta', 10], ['observacion', 'Observación', 36], ['id', 'ID (no modificar)', 16]];
  const L = Object.fromEntries(cols.map(([k], i) => [k, colLetra(i + 1)]));
  const PRIMERA = 5;
  const movs = [...(d.movimientos || [])].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const ULTIMA = PRIMERA + Math.max(movs.length + 400, 600) - 1;
  const R = (k) => `Movimientos!$${L[k]}$${PRIMERA}:$${L[k]}$${ULTIMA}`;
  const entre = (m) => `${R('fecha')},">="&DATE(${anio},${m},1),${R('fecha')},"<"&DATE(${anio},${m + 1},1)`;
  const SALDO_INI = 'Resumen!$A$6';
  const PRESUP = 'Resumen!$A$9';

  // Lista de categorías (para validación, flujo de caja y tipo de gasto)
  let catsIngreso, catsGasto, gruposGasto = null, gruposIngreso = null;
  if (general) {
    gruposIngreso = d.grupos.ingreso.map(([g, cs]) => [g, [...cs]]);
    gruposGasto = d.grupos.gasto.map(([g, cs]) => [g, [...cs]]);
    catsIngreso = gruposIngreso.flatMap(([, cs]) => cs);
    catsGasto = gruposGasto.flatMap(([, cs]) => cs);
  } else {
    catsIngreso = [...d.categorias.ingreso];
    catsGasto = [...d.categorias.gasto];
  }
  // categorías usadas que no están en la lista
  const extraI = [...new Set(movs.filter((m) => m.tipo === 'ingreso' && !catsIngreso.includes(m.categoria)).map((m) => m.categoria))];
  const extraG = [...new Set(movs.filter((m) => m.tipo === 'gasto' && !catsGasto.includes(m.categoria)).map((m) => m.categoria))];
  if (extraI.length) { catsIngreso.push(...extraI); if (gruposIngreso) gruposIngreso.push(['Otras categorías', extraI]); }
  if (extraG.length) { catsGasto.push(...extraG); if (gruposGasto) gruposGasto.push(['Otras categorías', extraG]); }
  const grupoDe = (tipo, cat) => {
    const gs = tipo === 'ingreso' ? gruposIngreso : gruposGasto;
    if (!gs) return '';
    const g = gs.find(([, cs]) => cs.includes(cat));
    return g ? g[0] : 'Sin clasificar';
  };

  // =====================================================================
  // 1) RESUMEN
  // =====================================================================
  const res = wb.addWorksheet('Resumen', { properties: { tabColor: { argb: C.navy } }, views: [{ showGridLines: false }] });
  res.columns = [16, 15, 15, 15, 15, 16, 15, 13, 16].map((width) => ({ width }));
  banda(res, 'A1:I1', `${d.iglesia || 'Iglesia'} · ${general ? 'Tesorería general' : d.titulo}`, { size: 18 });
  banda(res, 'A2:I2', `Planilla de tesorería ${anio}  ·  generada el ${d.generado || ''}`, { size: 10.5, color: 'FFE2BB6A', bold: false, height: 22 });
  res.getRow(3).height = 10;
  res.getRow(4).height = 8;

  tarjeta(res, 'A5:B5', 'A6:B6', `Saldo al 1 de enero ${anio}`, Number(d.saldoInicial) || 0, { editable: true });
  tarjeta(res, 'C5:D5', 'C6:D6', 'Ingresos del año', { formula: `SUMIFS(${R('ingreso')},${R('fecha')},">="&DATE(${anio},1,1),${R('fecha')},"<"&DATE(${anio + 1},1,1))` }, { color: C.green });
  tarjeta(res, 'E5:F5', 'E6:F6', 'Egresos del año', { formula: `SUMIFS(${R('egreso')},${R('fecha')},">="&DATE(${anio},1,1),${R('fecha')},"<"&DATE(${anio + 1},1,1))` }, { color: C.rose });
  tarjeta(res, 'G5:I5', 'G6:I6', 'Saldo actual', { formula: 'A6+C6-E6' }, { color: C.navy });
  res.getRow(5).height = 20; res.getRow(6).height = 32; res.getRow(7).height = 8;

  tarjeta(res, 'A8:B8', 'A9:B9', general ? 'Presupuesto mensual (tesorería)' : 'Presupuesto mensual', Number(d.presupuestoMensual) || 0, { editable: true });
  if (general) tarjeta(res, 'C8:D8', 'C9:D9', 'Egreso promedio mensual', { formula: 'IFERROR(E6/MAX(1,COUNTIF(D13:D24,">0")),0)' });
  else tarjeta(res, 'C8:D8', 'C9:D9', 'Ítem mensual', Number(d.itemMensual) || 0, { editable: true });
  // tesorería general: el presupuesto puede cambiar durante el año (cada mes lleva el suyo)
  const presMes = general && Array.isArray(d.presupuestosMes) && d.presupuestosMes.length === 12 ? d.presupuestosMes.map((v) => Number(v) || 0) : null;
  tarjeta(res, 'E8:F8', 'E9:F9', 'Presupuesto anual', { formula: presMes ? 'SUM(G13:G24)' : 'A9*12' });
  tarjeta(res, 'G8:I8', 'G9:I9', 'Egresos / presupuesto anual', { formula: 'IF(E9>0,E6/E9,"")' }, { numFmt: PCT });
  res.getRow(8).height = 20; res.getRow(9).height = 32; res.getRow(10).height = 12;

  banda(res, 'A11:I11', 'Flujo mensual', { size: 12, height: 24, bg: C.navy2 });
  const hdrRes = ['Mes', 'Saldo inicial', 'Ingresos', 'Egresos', 'Resultado', 'Saldo final', 'Presupuesto', '% del presupuesto', general ? 'Disponible' : 'Rendición'];
  encabezado(res, 12, hdrRes, { bg: acento, color: general ? C.navy2 : C.white });
  for (let m = 1; m <= 12; m++) {
    const r = 12 + m;
    const fila = res.getRow(r);
    fila.getCell(1).value = MESES[m - 1];
    fila.getCell(2).value = { formula: m === 1 ? 'A6' : `F${r - 1}` };
    fila.getCell(3).value = { formula: `SUMIFS(${R('ingreso')},${entre(m)})` };
    fila.getCell(4).value = { formula: `SUMIFS(${R('egreso')},${entre(m)})` };
    fila.getCell(5).value = { formula: `C${r}-D${r}` };
    fila.getCell(6).value = { formula: `B${r}+E${r}` };
    fila.getCell(7).value = presMes ? presMes[m - 1] : { formula: 'A$9' };
    fila.getCell(8).value = { formula: `IF(G${r}>0,D${r}/G${r},"")` };
    if (general) fila.getCell(9).value = { formula: `IF(G${r}>0,G${r}-D${r},"")` };
    else {
      const mm = `${anio}-${String(m).padStart(2, '0')}`;
      const e = (d.rendiciones || {})[mm];
      fila.getCell(9).value = e ? ESTADOS[e] || e : '';
    }
    fila.height = 20;
    for (let c = 1; c <= 9; c++) {
      const cell = fila.getCell(c);
      cell.font = { name: FUENTE, size: 10.5, color: { argb: C.ink }, bold: c === 1 || c === 6 };
      cell.numFmt = c === 8 ? PCT : c === 9 && !general ? '@' : PESOS;
      cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'left' : c === 9 && !general ? 'center' : 'right', indent: c === 1 ? 1 : 0 };
      cell.border = abajo();
      if (m % 2 === 0) cell.fill = fill(C.zebra);
    }
    fila.getCell(3).font = { name: FUENTE, size: 10.5, color: { argb: C.green } };
    fila.getCell(4).font = { name: FUENTE, size: 10.5, color: { argb: C.rose } };
  }
  const tot = res.getRow(25);
  tot.values = ['Total año', { formula: 'B13' }, { formula: 'SUM(C13:C24)' }, { formula: 'SUM(D13:D24)' }, { formula: 'SUM(E13:E24)' }, { formula: 'F24' }, { formula: 'SUM(G13:G24)' }, { formula: 'IF(G25>0,D25/G25,"")' }, general ? { formula: 'IF(G25>0,G25-D25,"")' } : ''];
  tot.height = 24;
  for (let c = 1; c <= 9; c++) {
    const cell = tot.getCell(c);
    cell.font = { name: FUENTE, size: 11, bold: true, color: { argb: C.white } };
    cell.fill = fill(C.navy);
    cell.numFmt = c === 8 ? PCT : PESOS_OSCURO;
    cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'left' : 'right', indent: c === 1 ? 1 : 0 };
  }
  res.addConditionalFormatting({
    ref: 'H13:H24',
    rules: [
      { type: 'expression', formulae: ['AND(ISNUMBER(H13),H13>1)'], priority: 1, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: C.roseSoft } }, font: { color: { argb: C.rose }, bold: true } } },
      { type: 'expression', formulae: ['AND(ISNUMBER(H13),H13>=0.9,H13<=1)'], priority: 2, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: C.amberSoft } }, font: { color: { argb: C.goldText }, bold: true } } }
    ]
  });
  res.addConditionalFormatting({
    ref: 'F13:F24',
    rules: [{ type: 'cellIs', operator: 'lessThan', formulae: ['0'], priority: 3, style: { font: { color: { argb: C.rose }, bold: true } } }]
  });
  res.mergeCells('A27:I28');
  const nota = res.getCell('A27');
  nota.value = 'Planilla generada por la app de Tesorería. Las celdas amarillas se pueden editar; todo lo demás se calcula solo a partir de la hoja "Movimientos". Para agregar un movimiento, escríbelo en la primera fila vacía de "Movimientos".';
  nota.font = { name: FUENTE, size: 9.5, italic: true, color: { argb: C.grey } };
  nota.alignment = { wrapText: true, vertical: 'top', horizontal: 'left', indent: 1 };
  res.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  res.headerFooter = { oddFooter: `&L${general ? 'Tesorería general' : d.titulo} ${anio}&RPágina &P de &N` };

  // =====================================================================
  // 2) FLUJO DE CAJA (meses en columnas, como la planilla original)
  // =====================================================================
  const fl = wb.addWorksheet('Flujo de caja', { properties: { tabColor: { argb: C.gold } }, views: [{ state: 'frozen', xSplit: 1, ySplit: 4, showGridLines: false }] });
  fl.columns = [{ width: 34 }, ...MESES.map(() => ({ width: 12.5 })), { width: 14 }];
  banda(fl, 'A1:N1', `Flujo de caja ${anio} · ${general ? 'Tesorería general' : d.titulo}`, { size: 16, height: 30 });
  banda(fl, 'A2:N2', 'Montos por categoría y mes, calculados desde la hoja "Movimientos"', { size: 10, color: 'FFE2BB6A', bold: false, height: 20 });
  encabezado(fl, 4, ['Concepto', ...MESES_C, 'Total'], { bg: C.navy2 });
  let r = 5;
  const filaFlujo = (etiqueta, fn, estilo = {}) => {
    const row = fl.getRow(r);
    row.getCell(1).value = etiqueta;
    for (let m = 1; m <= 12; m++) row.getCell(m + 1).value = { formula: fn(m, colLetra(m + 1)) };
    row.getCell(14).value = estilo.totalFormula ? { formula: estilo.totalFormula(r) } : { formula: `SUM(B${r}:M${r})` };
    row.height = estilo.height || 18;
    for (let c = 1; c <= 14; c++) {
      const cell = row.getCell(c);
      cell.numFmt = estilo.bg === C.navy ? PESOS_OSCURO : PESOS;
      cell.font = { name: FUENTE, size: estilo.size || 10, bold: !!estilo.bold, italic: !!estilo.italic, color: { argb: estilo.color || C.ink } };
      cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'left' : 'right', indent: c === 1 ? (estilo.indent ?? 1) : 0 };
      if (estilo.bg) cell.fill = fill(estilo.bg);
      cell.border = abajo(estilo.borde || C.line);
    }
    return r++;
  };
  const tituloSeccion = (texto, bg, color) => {
    const row = fl.getRow(r);
    row.getCell(1).value = texto;
    for (let c = 1; c <= 14; c++) { const cell = row.getCell(c); cell.fill = fill(bg); cell.font = { name: FUENTE, size: 10.5, bold: true, color: { argb: color } }; cell.alignment = { vertical: 'middle', indent: 1 }; }
    row.height = 22;
    r++;
  };
  const sumCat = (col, cat) => (m) => `SUMIFS(${R(col)},${R('categoria')},"${cat.replace(/"/g, '""')}",${entre(m)})`;

  const filaSaldoIni = filaFlujo('SALDO INICIAL', (m) => `Resumen!B${12 + m}`, { bold: true, bg: C.goldSoft, color: C.goldText, totalFormula: () => 'B5', height: 22 });
  r++;
  tituloSeccion('INGRESOS', C.greenSoft, C.green);
  const filasIng = [];
  const filasGrupoIng = [];
  if (gruposIngreso) {
    gruposIngreso.forEach(([g, cs]) => {
      const desde = r + 1, hasta = r + cs.length;
      filasGrupoIng.push(filaFlujo(g, (m, L2) => `SUM(${L2}${desde}:${L2}${hasta})`, { bold: true, color: C.green }));
      cs.forEach((cat) => filasIng.push(filaFlujo(cat, sumCat('ingreso', cat), { indent: 3, color: C.grey })));
    });
  } else catsIngreso.forEach((cat) => filasIng.push(filaFlujo(cat, sumCat('ingreso', cat), { indent: 2 })));
  const filaTotIng = filaFlujo('Total ingresos', (m, L2) => `SUM(${filasIng.map((x) => L2 + x).join(',')})`, { bold: true, color: C.green, bg: C.greenSoft, borde: C.green, height: 22 });
  r++;
  tituloSeccion('EGRESOS', C.roseSoft, C.rose);
  const filasEg = [];
  if (gruposGasto) {
    gruposGasto.forEach(([g, cs]) => {
      const desde = r + 1, hasta = r + cs.length;
      filaFlujo(g, (m, L2) => `SUM(${L2}${desde}:${L2}${hasta})`, { bold: true, color: C.rose });
      cs.forEach((cat) => filasEg.push(filaFlujo(cat, sumCat('egreso', cat), { indent: 3, color: C.grey })));
    });
  } else catsGasto.forEach((cat) => filasEg.push(filaFlujo(cat, sumCat('egreso', cat), { indent: 2 })));
  const filaTotEg = filaFlujo('Total egresos', (m, L2) => `SUM(${filasEg.map((x) => L2 + x).join(',')})`, { bold: true, color: C.rose, bg: C.roseSoft, borde: C.rose, height: 22 });
  r++;
  const filaRes = filaFlujo('RESULTADO DEL MES', (m, L2) => `${L2}${filaTotIng}-${L2}${filaTotEg}`, { bold: true, height: 22 });
  filaFlujo('SALDO FINAL', (m, L2) => `${L2}${filaSaldoIni}+${L2}${filaRes}`, { bold: true, bg: C.navy, color: C.white, size: 11, height: 24, totalFormula: () => `M${r}` });
  fl.addConditionalFormatting({ ref: `B${filaRes}:N${filaRes}`, rules: [{ type: 'cellIs', operator: 'lessThan', formulae: ['0'], priority: 1, style: { font: { color: { argb: C.rose }, bold: true } } }] });
  fl.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1 };

  // =====================================================================
  // 3) MOVIMIENTOS (la base de datos de la planilla)
  // =====================================================================
  const mv = wb.addWorksheet('Movimientos', { properties: { tabColor: { argb: C.green } }, views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
  mv.columns = cols.map(([, , width]) => ({ width }));
  const ultimaCol = colLetra(cols.length);
  banda(mv, `A1:${ultimaCol}1`, `Movimientos ${anio} · ${general ? 'Tesorería general' : d.titulo}`, { size: 16, height: 30 });
  banda(mv, `A2:${ultimaCol}2`, 'Un movimiento por fila, en orden de fecha. Agrega los nuevos en la primera fila vacía: el saldo y los resúmenes se calculan solos.', { size: 10, color: 'FFE2BB6A', bold: false, height: 20 });
  encabezado(mv, 4, cols.map(([, h]) => h), { bg: C.navy2 });
  const filaMov = (i, m) => {
    const rr = PRIMERA + i;
    const row = mv.getRow(rr);
    const v = (k, val) => { row.getCell(cols.findIndex(([kk]) => kk === k) + 1).value = val; };
    if (m) {
      v('fecha', fecha(m.fecha));
      v('tipo', m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso');
      v('categoria', m.categoria);
      v('descripcion', m.descripcion || '');
      if (m.tipo === 'ingreso') v('ingreso', Number(m.monto)); else v('egreso', Number(m.monto));
      v('boleta', m.boleta ? 'Sí' : '');
      v('observacion', m.observacion || '');
      v('id', m.id || '');
      if (general) v('medio', m.medio || '');
    }
    if (general) v('grupo', { formula: `IF(${L.categoria}${rr}="","",IFERROR(INDEX(Categorías!$B$5:$B$400,MATCH(1,INDEX((Categorías!$A$5:$A$400=${L.categoria}${rr})*(Categorías!$C$5:$C$400=${L.tipo}${rr}),0),0)),"Sin clasificar"))`, result: m ? grupoDe(m.tipo, m.categoria) : '' });
    v('saldo', { formula: `IF(AND(${L.ingreso}${rr}="",${L.egreso}${rr}=""),"",${SALDO_INI}+SUM(${L.ingreso}$${PRIMERA}:${L.ingreso}${rr})-SUM(${L.egreso}$${PRIMERA}:${L.egreso}${rr}))` });
    row.height = 18;
    cols.forEach(([k], ci) => {
      const cell = row.getCell(ci + 1);
      const esMonto = k === 'ingreso' || k === 'egreso' || k === 'saldo';
      cell.font = { name: FUENTE, size: 10, color: { argb: k === 'ingreso' ? C.green : k === 'egreso' ? C.rose : k === 'id' || k === 'grupo' ? C.grey : C.ink }, bold: k === 'saldo' };
      cell.numFmt = k === 'fecha' ? FECHA : esMonto ? PESOS : '@';
      cell.alignment = { vertical: 'middle', horizontal: esMonto ? 'right' : k === 'fecha' || k === 'tipo' || k === 'boleta' ? 'center' : 'left', indent: k === 'descripcion' || k === 'categoria' ? 1 : 0 };
      cell.border = abajo();
    });
  };
  movs.forEach((m, i) => filaMov(i, m));
  for (let i = movs.length; i <= ULTIMA - PRIMERA; i++) filaMov(i, null);
  mv.autoFilter = `A4:${ultimaCol}4`;
  mv.getColumn(cols.length).hidden = true;
  mv.addConditionalFormatting({
    ref: `A${PRIMERA}:${colLetra(cols.length - 1)}${ULTIMA}`,
    rules: [{ type: 'expression', formulae: [`AND($A${PRIMERA}<>"",MOD(ROW(),2)=0)`], priority: 1, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: C.zebra } } } }]
  });
  const rango = (k) => `${L[k]}${PRIMERA}:${L[k]}${ULTIMA}`;
  mv.dataValidations.add(rango('tipo'), { type: 'list', allowBlank: true, formulae: ['"Ingreso,Egreso"'], showErrorMessage: true, errorTitle: 'Tipo', error: 'Elige Ingreso o Egreso' });
  mv.dataValidations.add(rango('categoria'), { type: 'list', allowBlank: true, formulae: [`Categorías!$A$5:$A$${4 + catsIngreso.length + catsGasto.length}`], showErrorMessage: false });
  mv.dataValidations.add(rango('fecha'), { type: 'date', operator: 'greaterThan', allowBlank: true, formulae: [new Date(Date.UTC(2000, 0, 1))], showErrorMessage: true, errorTitle: 'Fecha', error: 'Escribe una fecha válida (dd-mm-aaaa)' });
  mv.dataValidations.add(rango('ingreso'), { type: 'decimal', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [0], showErrorMessage: true, error: 'El monto debe ser un número positivo' });
  mv.dataValidations.add(rango('egreso'), { type: 'decimal', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [0], showErrorMessage: true, error: 'El monto debe ser un número positivo' });
  if (general) mv.dataValidations.add(rango('medio'), { type: 'list', allowBlank: true, formulae: ['"Efectivo,Transferencia,Depósito,Cheque,Tarjeta"'] });
  mv.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '4:4', printArea: `A1:${colLetra(cols.length - 1)}${PRIMERA + Math.max(movs.length, 1) + 2}` };

  // =====================================================================
  // 4) CATEGORÍAS + INSTRUCCIONES
  // =====================================================================
  const ca = wb.addWorksheet('Categorías', { properties: { tabColor: { argb: C.grey } }, views: [{ showGridLines: false }] });
  ca.columns = [{ width: 30 }, { width: 30 }, { width: 12 }, { width: 4 }, { width: 78 }];
  banda(ca, 'A1:E1', 'Categorías e instrucciones', { size: 16, height: 30 });
  encabezado(ca, 4, ['Categoría', general ? 'Tipo de gasto / ingreso' : 'Grupo', 'Uso']);
  let fc = 5;
  const filaCat = (cat, grupo, uso) => {
    const row = ca.getRow(fc++);
    row.values = [cat, grupo, uso];
    row.eachCell((cell, i) => { cell.font = { name: FUENTE, size: 10, color: { argb: i === 3 ? (uso === 'Ingreso' ? C.green : C.rose) : C.ink } }; cell.border = abajo(); cell.alignment = { indent: 1, vertical: 'middle' }; });
  };
  catsIngreso.forEach((c) => filaCat(c, general ? grupoDe('ingreso', c) : 'Ingresos', 'Ingreso'));
  catsGasto.forEach((c) => filaCat(c, general ? grupoDe('gasto', c) : 'Egresos', 'Egreso'));
  const instrucciones = [
    ['Cómo usar esta planilla', true],
    ['1. Cada fila de "Movimientos" es un ingreso o un egreso. Escribe la fecha, el tipo, la categoría (lista desplegable) y el monto en la columna que corresponda.', false],
    ['2. El saldo, el resumen mensual y el flujo de caja se calculan solos. No es necesario tocar fórmulas.', false],
    ['3. Las celdas amarillas de "Resumen" (saldo inicial, presupuesto e ítem) se pueden editar.', false],
    ['4. La columna "ID" está oculta: identifica cada movimiento. No la modifiques para que la app no los duplique al importar.', false],
    ['5. Para cargar esta planilla en la página: Configuración → Importar historial (solo tesorero).', false],
    ['6. Montos en pesos chilenos, sin decimales. Fechas en formato dd-mm-aaaa.', false]
  ];
  instrucciones.forEach(([t, bold], i) => {
    const c = ca.getCell(4 + i, 5);
    c.value = t;
    c.font = { name: FUENTE, size: bold ? 12 : 10, bold, color: { argb: bold ? C.navy : C.ink } };
    c.alignment = { wrapText: true, vertical: 'top' };
    if (!bold) ca.getRow(4 + i).height = Math.max(ca.getRow(4 + i).height || 15, 30);
  });

  // =====================================================================
  // 5) METADATOS (oculta) — permiten volver a importar la planilla
  // =====================================================================
  const meta = wb.addWorksheet('_meta');
  meta.state = 'veryHidden';
  [['formato', FORMATO], ['version', VERSION], ['ambito', d.ambito], ['titulo', d.titulo || ''], ['ministerioId', d.ministerioId || ''], ['anio', String(anio)], ['generado', d.generado || ''], ['celdaSaldoInicial', 'Resumen!A6'], ['celdaPresupuesto', 'Resumen!A9'], ['celdaItem', general ? '' : 'Resumen!C9'], ['primeraFila', String(PRIMERA)], ['columnas', cols.map(([k]) => k).join(',')]]
    .forEach(([k, v], i) => { meta.getCell(i + 1, 1).value = k; meta.getCell(i + 1, 2).value = v; });

  wb.views = [{ activeTab: 0 }];
  return wb;
}

// ---------------------------------------------------------------------
// Lectura de una planilla tipo (para importar). Devuelve null si no es una.
// ---------------------------------------------------------------------
export function leerPlanilla(wb) {
  const meta = wb.getWorksheet('_meta');
  if (!meta) return null;
  const m = {};
  meta.eachRow((row) => { m[String(row.getCell(1).value)] = row.getCell(2).value == null ? '' : String(row.getCell(2).value); });
  if (m.formato !== FORMATO) return null;
  const valor = (ref) => {
    if (!ref) return 0;
    const [hoja, celda] = ref.split('!');
    const v = wb.getWorksheet(hoja)?.getCell(celda).value;
    const n = v && typeof v === 'object' ? (v.result ?? 0) : v;
    return Math.round(Number(n) || 0);
  };
  const cols = m.columnas.split(',');
  const mv = wb.getWorksheet('Movimientos');
  const out = [];
  const texto = (v) => (v == null ? '' : typeof v === 'object' ? (v.richText ? v.richText.map((t) => t.text).join('') : v.text ?? v.result ?? '') : String(v)).trim();
  // Montos: números de Excel tal cual; texto al estilo es-CL ("1.500.000", "$ 25.000", "1500,5" → 1500).
  // Devuelve { n, err }: err si hay texto que no es un monto válido.
  const numero = (v) => {
    const x = v && typeof v === 'object' && !(v instanceof Date) ? (v.result ?? texto(v)) : v;
    if (x == null || x === '') return { n: 0, err: '' };
    if (typeof x === 'number') return x < 0 ? { n: 0, err: 'monto negativo' } : { n: Math.round(x), err: '' };
    const s = String(x).trim();
    if (!s) return { n: 0, err: '' };
    if (!/^-?\s*\$?\s*[\d.\s]+(,\d*)?$/.test(s)) return { n: 0, err: `monto no válido “${s.slice(0, 20)}”` };
    if (s.includes('-')) return { n: 0, err: 'monto negativo' };
    return { n: Number(s.split(',')[0].replace(/\D/g, '')) || 0, err: '' };
  };
  const aFecha = (v) => {
    if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
    if (typeof v === 'number') { const dt = new Date(Math.round((v - 25569) * 86400000)); return aFecha(dt); }
    const s = texto(v); let r;
    if ((r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return `${r[1]}-${r[2].padStart(2, '0')}-${r[3].padStart(2, '0')}`;
    if ((r = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(s))) return `${r[3]}-${r[2].padStart(2, '0')}-${r[1].padStart(2, '0')}`;
    return '';
  };
  const ultima = mv.rowCount;
  for (let i = Number(m.primeraFila) || 5; i <= ultima; i++) {
    const row = mv.getRow(i);
    const get = (k) => row.getCell(cols.indexOf(k) + 1).value;
    const ni = numero(get('ingreso')), ne = numero(get('egreso'));
    const ingreso = ni.n, egreso = ne.n;
    if (!ingreso && !egreso && !ni.err && !ne.err) continue;
    const tipoTxt = texto(get('tipo')).toLowerCase();
    const tipo = ingreso ? 'ingreso' : 'gasto';
    let error = ni.err || ne.err || '';
    if (!error && ingreso && egreso) error = 'tiene monto en Ingreso y en Egreso';
    if (!error && tipoTxt && ((tipoTxt.startsWith('ing') && tipo !== 'ingreso') || (tipoTxt.startsWith('egr') && tipo !== 'gasto'))) error = `el tipo “${texto(get('tipo'))}” no coincide con la columna del monto`;
    if (!error && !ingreso && !egreso) error = 'monto en 0';
    out.push({
      fila: i,
      error,
      fecha: aFecha(get('fecha')),
      tipo,
      monto: ingreso || egreso,
      categoria: texto(get('categoria')),
      descripcion: texto(get('descripcion')),
      medio: cols.includes('medio') ? texto(get('medio')) : '',
      observacion: texto(get('observacion')),
      id: texto(get('id'))
    });
  }
  return {
    ambito: m.ambito, titulo: m.titulo, ministerioId: m.ministerioId, anio: Number(m.anio),
    saldoInicial: valor(m.celdaSaldoInicial), presupuesto: valor(m.celdaPresupuesto), item: valor(m.celdaItem),
    movimientos: out
  };
}
