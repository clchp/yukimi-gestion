import type { BankStatementRowInput } from '@yukimi/shared';

function normalizeHeader(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function cell(record: Record<string, unknown>, aliases: string[]): unknown {
  const normalized = new Map(Object.entries(record).map(([key, value]) => [normalizeHeader(key), value]));
  for (const alias of aliases) {
    const value = normalized.get(normalizeHeader(alias));
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return null;
}
function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(/S\/?\.?/gi, '').replace(/\s/g, '').replace(/,/g, '');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}
function excelSerialToDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1) return null;
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString().slice(0, 10);
}
function dateValue(value: unknown): string | null {
  if (typeof value === 'number') return excelSerialToDate(value);
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2]!.padStart(2, '0')}-${iso[3]!.padStart(2, '0')}`;
  const latam = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (latam) return `${latam[3]}-${latam[2]!.padStart(2, '0')}-${latam[1]!.padStart(2, '0')}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString().slice(0, 10);
}

function parseCsv(text: string): Record<string, unknown>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ',' || char === ';' || char === '\t') { row.push(value.trim()); value = ''; }
    else if (char === '\n') { row.push(value.trim()); rows.push(row); row = []; value = ''; }
    else if (char !== '\r') value += char;
  }
  if (value.length > 0 || row.length > 0) { row.push(value.trim()); rows.push(row); }
  const headers = rows.shift()?.map((item) => item.trim()) ?? [];
  return rows.filter((items) => items.some((item) => item !== '')).map((items) => Object.fromEntries(headers.map((header, index) => [header, items[index] ?? ''])));
}

function u16(view: DataView, offset: number): number { return view.getUint16(offset, true); }
function u32(view: DataView, offset: number): number { return view.getUint32(offset, true); }
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (u32(view, offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error('El archivo XLSX no tiene una estructura ZIP válida.');
  const entryCount = u16(view, eocd + 10);
  let offset = u32(view, eocd + 16);
  const decoder = new TextDecoder();
  const files = new Map<string, Uint8Array>();
  for (let index = 0; index < entryCount; index += 1) {
    if (u32(view, offset) !== 0x02014b50) throw new Error('El directorio del XLSX está dañado.');
    const method = u16(view, offset + 10);
    const compressedSize = u32(view, offset + 20);
    const nameLength = u16(view, offset + 28);
    const extraLength = u16(view, offset + 30);
    const commentLength = u16(view, offset + 32);
    const localOffset = u32(view, offset + 42);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    if (u32(view, localOffset) !== 0x04034b50) throw new Error('Una entrada del XLSX está dañada.');
    const localNameLength = u16(view, localOffset + 26);
    const localExtraLength = u16(view, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    if (method === 0) files.set(name, compressed);
    else if (method === 8) files.set(name, await inflateRaw(compressed));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function xml(bytes: Uint8Array | undefined, label: string): XMLDocument {
  if (!bytes) throw new Error(`El XLSX no contiene ${label}.`);
  const document = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xml');
  if (document.querySelector('parsererror')) throw new Error(`No se pudo leer ${label}.`);
  return document;
}
function columnIndex(reference: string): number {
  const letters = reference.match(/[A-Z]+/i)?.[0]?.toUpperCase() ?? 'A';
  let value = 0;
  for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
  return value - 1;
}

async function parseXlsx(buffer: ArrayBuffer): Promise<Record<string, unknown>[]> {
  const files = await unzip(buffer);
  const workbook = xml(files.get('xl/workbook.xml'), 'el libro de Excel');
  const relationships = xml(files.get('xl/_rels/workbook.xml.rels'), 'las relaciones del libro');
  const firstSheet = workbook.getElementsByTagNameNS('*', 'sheet')[0];
  const relationId = firstSheet?.getAttribute('r:id') ?? firstSheet?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  if (!relationId) throw new Error('El XLSX no contiene una hoja utilizable.');
  const relation = Array.from(relationships.getElementsByTagNameNS('*', 'Relationship')).find((item) => item.getAttribute('Id') === relationId);
  const target = relation?.getAttribute('Target');
  if (!target) throw new Error('No se encontró la primera hoja del XLSX.');
  const sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  const sheet = xml(files.get(sheetPath), 'la primera hoja');
  const sharedDoc = files.has('xl/sharedStrings.xml') ? xml(files.get('xl/sharedStrings.xml'), 'los textos compartidos') : null;
  const shared = sharedDoc ? Array.from(sharedDoc.getElementsByTagNameNS('*', 'si')).map((item) => Array.from(item.getElementsByTagNameNS('*', 't')).map((node) => node.textContent ?? '').join('')) : [];
  const matrix: unknown[][] = [];
  for (const rowNode of Array.from(sheet.getElementsByTagNameNS('*', 'row'))) {
    const row: unknown[] = [];
    for (const cellNode of Array.from(rowNode.getElementsByTagNameNS('*', 'c'))) {
      const index = columnIndex(cellNode.getAttribute('r') ?? 'A1');
      const type = cellNode.getAttribute('t');
      const raw = cellNode.getElementsByTagNameNS('*', 'v')[0]?.textContent ?? '';
      let value: unknown = raw;
      if (type === 's') value = shared[Number(raw)] ?? '';
      else if (type === 'inlineStr') value = Array.from(cellNode.getElementsByTagNameNS('*', 't')).map((node) => node.textContent ?? '').join('');
      else if (type === 'b') value = raw === '1';
      else if (raw !== '' && Number.isFinite(Number(raw))) value = Number(raw);
      row[index] = value;
    }
    matrix.push(row);
  }
  const headers = (matrix.shift() ?? []).map((item) => String(item ?? '').trim());
  return matrix.filter((row) => row.some((item) => item !== null && item !== undefined && String(item).trim() !== '')).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null])));
}

export async function parseBankFile(file: File, currencyCode: string): Promise<{ rows: BankStatementRowInput[]; checksum: string }> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const checksum = Array.from(new Uint8Array(digest)).map((item) => item.toString(16).padStart(2, '0')).join('');
  const lowerName = file.name.toLowerCase();
  const records = lowerName.endsWith('.xlsx') ? await parseXlsx(buffer) : parseCsv(new TextDecoder().decode(buffer));
  const rows: BankStatementRowInput[] = [];
  records.forEach((record) => {
    const transactionDate = dateValue(cell(record, ['fecha', 'fecha operación', 'fecha operacion', 'transaction date', 'date']));
    const description = String(cell(record, ['descripcion', 'descripción', 'concepto', 'detalle', 'movimiento', 'description']) ?? '').trim();
    const referenceRaw = cell(record, ['referencia', 'operacion', 'operación', 'numero operacion', 'nro operacion', 'reference']);
    const directAmount = numberValue(cell(record, ['importe', 'monto', 'amount', 'importe movimiento']));
    const income = numberValue(cell(record, ['abono', 'ingreso', 'credito', 'crédito', 'haber', 'credit'])) ?? 0;
    const expense = numberValue(cell(record, ['cargo', 'egreso', 'debito', 'débito', 'debe', 'debit'])) ?? 0;
    const amountSigned = directAmount ?? (income - expense);
    const balanceAfter = numberValue(cell(record, ['saldo', 'saldo disponible', 'balance']));
    if (!transactionDate || !description || !amountSigned) return;
    rows.push({ transactionDate, postedAt: null, description, reference: referenceRaw === null ? null : String(referenceRaw).trim(), amountSigned, currencyCode, balanceAfter });
  });
  if (rows.length === 0) throw new Error('No se reconocieron filas. El archivo debe tener fecha, descripción y monto; también se aceptan columnas Cargo y Abono.');
  return { rows, checksum };
}
