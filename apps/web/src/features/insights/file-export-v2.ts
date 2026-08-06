export interface WorkbookSheet {
  name: string;
  rows: unknown[][];
  freezeRows?: number;
  autoFilterRow?: number;
  columnWidths?: number[];
}

export interface PdfSection {
  title: string;
  rows: string[][];
  columns?: string[];
}

export interface BusinessPdfReport {
  title: string;
  subtitle?: string;
  metadata?: string[];
  sections: PdfSection[];
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function xmlEscape(value: unknown): string {
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

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
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
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

interface ZipEntry {
  name: string;
  bytes: Uint8Array;
  crc: number;
  offset: number;
}

function zipStore(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const entries: ZipEntry[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
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
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ]);
    const local = concat([header, bytes]);
    entries.push({ name, bytes, crc, offset });
    localParts.push(local);
    offset += local.length;
  }

  const centralParts: Uint8Array[] = [];
  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    centralParts.push(
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
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(entry.offset),
        nameBytes,
      ]),
    );
  }
  const central = concat(centralParts);
  return concat([
    ...localParts,
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
  let name = '';
  for (let current = index + 1; current > 0; current = Math.floor((current - 1) / 26)) {
    name = String.fromCharCode(65 + ((current - 1) % 26)) + name;
  }
  return name;
}

function safeSheetName(value: string, index: number): string {
  const cleaned = value.replace(/[\\/?*:[\]]/g, ' ').trim().slice(0, 31);
  return cleaned || `Hoja ${index + 1}`;
}

function isSectionRow(row: unknown[]): boolean {
  return (
    row.length === 1 &&
    typeof row[0] === 'string' &&
    row[0].trim().length > 0 &&
    row[0] === row[0].toLocaleUpperCase('es-PE')
  );
}

function looksLikeHeader(row: unknown[], next: unknown[] | undefined): boolean {
  if (row.length < 2 || !row.every((value) => typeof value === 'string')) return false;
  if (!next || next.length === 0) return false;
  return next.length === row.length || next.some((value) => typeof value === 'number');
}

function moneyHeader(value: unknown): boolean {
  return /venta|cobro|costo|ganancia|precio|importe|saldo|comprado|valor|monto|gasto|ingreso|ticket/i.test(
    String(value ?? ''),
  );
}

function styleIndex(rows: unknown[][], rowIndex: number, columnIndex: number, value: unknown) {
  const row = rows[rowIndex] ?? [];
  if (rowIndex === 0 && row.length === 1) return 1;
  if (isSectionRow(row)) return 2;
  if (looksLikeHeader(row, rows[rowIndex + 1])) return 3;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const header = [...rows.slice(0, rowIndex)]
      .reverse()
      .find((candidate) => looksLikeHeader(candidate, row));
    return moneyHeader(header?.[columnIndex]) ? 4 : 5;
  }
  return rowIndex % 2 === 0 ? 0 : 6;
}

function columnWidth(rows: unknown[][], index: number): number {
  const longest = rows.reduce(
    (maximum, row) => Math.max(maximum, String(row[index] ?? '').length),
    0,
  );
  return Math.min(44, Math.max(10, longest + 2));
}

function worksheetXml(sheet: WorkbookSheet): string {
  const rows = sheet.rows.length > 0 ? sheet.rows : [['Sin información']];
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const widths = Array.from(
    { length: columnCount },
    (_, index) => sheet.columnWidths?.[index] ?? columnWidth(rows, index),
  );
  const merges: string[] = [];
  const rowXml = rows
    .map((row, rowIndex) => {
      if ((rowIndex === 0 && row.length === 1) || isSectionRow(row)) {
        merges.push(`A${rowIndex + 1}:${columnName(columnCount - 1)}${rowIndex + 1}`);
      }
      const cells = row
        .map((value, columnIndex) => {
          const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
          const style = styleIndex(rows, rowIndex, columnIndex, value);
          if (typeof value === 'number' && Number.isFinite(value)) {
            return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
          }
          return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
        })
        .join('');
      const height = rowIndex === 0 && row.length === 1 ? ' ht="28" customHeight="1"' : '';
      return `<row r="${rowIndex + 1}"${height}>${cells}</row>`;
    })
    .join('');
  const freezeRows = Math.max(0, sheet.freezeRows ?? 0);
  const views =
    freezeRows > 0
      ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${freezeRows}" topLeftCell="A${freezeRows + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView></sheetViews>`
      : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const filter = sheet.autoFilterRow
    ? `<autoFilter ref="A${sheet.autoFilterRow}:${columnName(columnCount - 1)}${rows.length}"/>`
    : '';
  const mergeXml =
    merges.length > 0
      ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`
      : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${views}
<sheetFormatPr defaultRowHeight="15"/>
<cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>
<sheetData>${rowXml}</sheetData>
${filter}
${mergeXml}
<pageMargins left="0.35" right="0.35" top="0.55" bottom="0.55" header="0.2" footer="0.2"/>
</worksheet>`;
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="S/ #,##0.00;[Red]-S/ #,##0.00"/></numFmts>
<fonts count="4">
  <font><sz val="10"/><color rgb="FF2B1E2A"/><name val="Arial"/><family val="2"/></font>
  <font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font>
  <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font>
  <font><b/><sz val="10"/><color rgb="FF4F214A"/><name val="Arial"/><family val="2"/></font>
</fonts>
<fills count="6">
  <fill><patternFill patternType="none"/></fill>
  <fill><patternFill patternType="gray125"/></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FF74366E"/><bgColor indexed="64"/></patternFill></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FF9A5A91"/><bgColor indexed="64"/></patternFill></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FFF2E8F0"/><bgColor indexed="64"/></patternFill></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FFFAF7FA"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
  <border><left/><right/><top/><bottom/><diagonal/></border>
  <border><left style="thin"><color rgb="FFE7DCE5"/></left><right style="thin"><color rgb="FFE7DCE5"/></right><top style="thin"><color rgb="FFE7DCE5"/></top><bottom style="thin"><color rgb="FFE7DCE5"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
  <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
  <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
  <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
  <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
  <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
  <xf numFmtId="1" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
  <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
<dxfs count="0"/>
<tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
}

function normalizeWorkbook(input: unknown[][] | WorkbookSheet[]): WorkbookSheet[] {
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
  const sheets = normalizeWorkbook(input).map((sheet, index) => ({
    ...sheet,
    name: safeSheetName(sheet.name, index),
  }));
  const worksheetOverrides = sheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('');
  const workbookSheets = sheets
    .map(
      (sheet, index) =>
        `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join('');
  const relationships = sheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join('');
  const files: Record<string, string> = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${worksheetOverrides}</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${workbookSheets}</sheets><calcPr calcId="191029"/></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': stylesXml(),
  };
  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = worksheetXml(sheet);
  });
  const bytes = zipStore(files);
  downloadBlob(
    filename.replace(/\.csv$/i, '.xlsx'),
    new Blob([copyToArrayBuffer(bytes)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
}

function pdfEscape(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7e]/g, '?');
}

function wrap(value: string, limit = 88): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = `${line} ${word}`.trim();
    if (candidate.length > limit && line) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [''];
}

interface PdfLine {
  text: string;
  kind: 'title' | 'subtitle' | 'meta' | 'section' | 'header' | 'body';
}

function reportLines(report: BusinessPdfReport): PdfLine[] {
  const lines: PdfLine[] = [{ text: report.title, kind: 'title' }];
  if (report.subtitle) lines.push({ text: report.subtitle, kind: 'subtitle' });
  for (const value of report.metadata ?? []) lines.push({ text: value, kind: 'meta' });
  for (const section of report.sections) {
    lines.push({ text: section.title, kind: 'section' });
    if (section.columns?.length) lines.push({ text: section.columns.join(' | '), kind: 'header' });
    section.rows.forEach((row) => lines.push({ text: row.join(' | '), kind: 'body' }));
  }
  return lines;
}

function legacyReport(title: string, lines: string[]): BusinessPdfReport {
  return {
    title,
    sections: [{ title: 'REPORTE', rows: lines.map((line) => line.split(' | ')) }],
  };
}

export function downloadBusinessPdf(filename: string, report: BusinessPdfReport) {
  const logical = reportLines(report).flatMap((line) =>
    wrap(line.text, line.kind === 'body' ? 94 : 78).map((text) => ({ ...line, text })),
  );
  const pages: PdfLine[][] = [];
  let page: PdfLine[] = [];
  let used = 0;
  for (const line of logical) {
    const height = line.kind === 'title' ? 34 : line.kind === 'section' ? 25 : 17;
    if (used + height > 700 && page.length > 0) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(line);
    used += height;
  }
  if (page.length > 0) pages.push(page);
  if (pages.length === 0) pages.push([{ text: 'Sin información', kind: 'body' }]);

  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  const catalogId = add('');
  const pagesId = add('');
  const regularFontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const boldFontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pageIds: number[] = [];

  pages.forEach((lines, pageIndex) => {
    let y = 790;
    const commands: string[] = [
      '0.45 0.21 0.43 rg 36 806 523 18 re f',
      `BT /F2 8 Tf 1 1 1 rg 44 812 Td (${pdfEscape(`YUKIMI GESTIÓN · Página ${pageIndex + 1}`)}) Tj ET`,
    ];
    for (const line of lines) {
      const bold = ['title', 'section', 'header'].includes(line.kind);
      const size = line.kind === 'title' ? 18 : line.kind === 'section' ? 12 : 9;
      const color = line.kind === 'section' ? '0.45 0.21 0.43' : '0.16 0.12 0.16';
      if (line.kind === 'title') y -= 8;
      commands.push(
        `BT /F${bold ? 2 : 1} ${size} Tf ${color} rg 44 ${y} Td (${pdfEscape(line.text)}) Tj ET`,
      );
      y -= line.kind === 'title' ? 30 : line.kind === 'section' ? 23 : 16;
    }
    const stream = commands.join('\n');
    const contentId = add(`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`);
    const pageId = add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  });

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(new TextEncoder().encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n `)
    .join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  downloadBlob(filename, new Blob([pdf], { type: 'application/pdf' }));
}

export function downloadPdf(filename: string, title: string, lines: string[]) {
  downloadBusinessPdf(filename, legacyReport(title, lines));
}
