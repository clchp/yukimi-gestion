import type { WorkbookSheet } from './file-export-v2';

function downloadBlob(filename: string, bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const url = URL.createObjectURL(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.replace(/\.csv$/i, '.xlsx');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function xml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    };
    return replacements[character] ?? character;
  });
}

function u16(value: number): Uint8Array {
  return Uint8Array.of(value & 255, (value >>> 8) & 255);
}

function u32(value: number): Uint8Array {
  return Uint8Array.of(
    value & 255,
    (value >>> 8) & 255,
    (value >>> 16) & 255,
    (value >>> 24) & 255,
  );
}

function concat(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const entries: Array<{
    name: Uint8Array;
    bytes: Uint8Array;
    crc: number;
    offset: number;
  }> = [];
  let offset = 0;

  Object.entries(files).forEach(([path, content]) => {
    const name = encoder.encode(path);
    const bytes = encoder.encode(content);
    const crc = crc32(bytes);
    const header = concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(bytes.length),
      u32(bytes.length),
      u16(name.length),
      u16(0),
      name,
    ]);
    const local = concat([header, bytes]);
    entries.push({ name, bytes, crc, offset });
    locals.push(local);
    offset += local.length;
  });

  const central = concat(
    entries.map((entry) =>
      concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(0),
        u16(0),
        u32(entry.crc),
        u32(entry.bytes.length),
        u32(entry.bytes.length),
        u16(entry.name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(entry.offset),
        entry.name,
      ]),
    ),
  );

  return concat([
    ...locals,
    central,
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
}

function columnName(index: number): string {
  let result = '';
  for (let current = index + 1; current > 0; current = Math.floor((current - 1) / 26)) {
    result = String.fromCharCode(65 + ((current - 1) % 26)) + result;
  }
  return result;
}

function safeSheetName(value: string, index: number) {
  return value.replace(/[\\/?*:[\]]/g, ' ').trim().slice(0, 31) || `Hoja ${index + 1}`;
}

function sectionRow(row: unknown[]) {
  return (
    row.length === 1 &&
    typeof row[0] === 'string' &&
    row[0].trim().length > 0 &&
    row[0] === row[0].toLocaleUpperCase('es-PE')
  );
}

function headerRow(row: unknown[], next: unknown[] | undefined) {
  return (
    row.length >= 2 &&
    row.every((value) => typeof value === 'string') &&
    Boolean(next?.length) &&
    (next?.length === row.length || next?.some((value) => typeof value === 'number'))
  );
}

function moneyColumn(value: unknown) {
  return /venta|cobro|costo|ganancia|precio|importe|saldo|comprado|valor|monto|gasto|ingreso|ticket/i.test(
    String(value ?? ''),
  );
}

function styleFor(rows: unknown[][], rowIndex: number, columnIndex: number, value: unknown) {
  const row = rows[rowIndex] ?? [];
  if (rowIndex === 0 && row.length === 1) return 1;
  if (sectionRow(row)) return 2;
  if (headerRow(row, rows[rowIndex + 1])) return 3;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const nearestHeader = [...rows.slice(0, rowIndex)]
      .reverse()
      .find((candidate) => headerRow(candidate, row));
    return moneyColumn(nearestHeader?.[columnIndex]) ? 4 : 5;
  }
  return rowIndex % 2 === 0 ? 0 : 6;
}

function widthFor(rows: unknown[][], columnIndex: number) {
  const longest = rows.reduce(
    (maximum, row) => Math.max(maximum, String(row[columnIndex] ?? '').length),
    0,
  );
  return Math.min(44, Math.max(10, longest + 2));
}

function worksheet(sheet: WorkbookSheet) {
  const rows = sheet.rows.length > 0 ? sheet.rows : [['Sin información']];
  const columns = Math.max(1, ...rows.map((row) => row.length));
  const merges: string[] = [];
  const rowXml = rows
    .map((row, rowIndex) => {
      if ((rowIndex === 0 && row.length === 1) || sectionRow(row)) {
        merges.push(`A${rowIndex + 1}:${columnName(columns - 1)}${rowIndex + 1}`);
      }
      const cells = row
        .map((value, columnIndex) => {
          const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
          const style = styleFor(rows, rowIndex, columnIndex, value);
          return typeof value === 'number' && Number.isFinite(value)
            ? `<c r="${reference}" s="${style}"><v>${value}</v></c>`
            : `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}"${rowIndex === 0 && row.length === 1 ? ' ht="28" customHeight="1"' : ''}>${cells}</row>`;
    })
    .join('');
  const freeze = Math.max(0, sheet.freezeRows ?? 0);
  const views = freeze
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${freeze}" topLeftCell="A${freeze + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView></sheetViews>`
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const filter = sheet.autoFilterRow
    ? `<autoFilter ref="A${sheet.autoFilterRow}:${columnName(columns - 1)}${rows.length}"/>`
    : '';
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((value) => `<mergeCell ref="${value}"/>`).join('')}</mergeCells>`
    : '';
  const widths = Array.from(
    { length: columns },
    (_, index) => sheet.columnWidths?.[index] ?? widthFor(rows, index),
  );
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${views}<sheetFormatPr defaultRowHeight="15"/>
<cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>
<sheetData>${rowXml}</sheetData>${filter}${mergeXml}
<pageMargins left="0.35" right="0.35" top="0.55" bottom="0.55" header="0.2" footer="0.2"/>
</worksheet>`;
}

function styles() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;S/ &quot;#,##0.00;[Red]-&quot;S/ &quot;#,##0.00"/></numFmts>
<fonts count="4">
<font><sz val="10"/><color rgb="FF2B1E2A"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FF4F214A"/><name val="Arial"/><family val="2"/></font>
</fonts>
<fills count="6">
<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF74366E"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF9A5A91"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF2E8F0"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFAF7FA"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFE7DCE5"/></left><right style="thin"><color rgb="FFE7DCE5"/></right><top style="thin"><color rgb="FFE7DCE5"/></top><bottom style="thin"><color rgb="FFE7DCE5"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="1" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
}

function normalize(input: unknown[][] | WorkbookSheet[]): WorkbookSheet[] {
  if (
    input.length > 0 &&
    !Array.isArray(input[0]) &&
    typeof input[0] === 'object' &&
    input[0] !== null &&
    'rows' in input[0]
  ) {
    return input as WorkbookSheet[];
  }
  return [{ name: 'Reporte', rows: input as unknown[][], freezeRows: 1 }];
}

export function downloadXlsx(filename: string, input: unknown[][] | WorkbookSheet[]) {
  const sheets = normalize(input).map((sheet, index) => ({
    ...sheet,
    name: safeSheetName(sheet.name, index),
  }));
  const overrides = sheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('');
  const sheetNodes = sheets
    .map(
      (sheet, index) =>
        `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join('');
  const relationships = sheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join('');
  const files: Record<string, string> = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>`,
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheetNodes}</sheets><calcPr calcId="191029"/></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': styles(),
  };
  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = worksheet(sheet);
  });
  downloadBlob(filename, zip(files));
}
