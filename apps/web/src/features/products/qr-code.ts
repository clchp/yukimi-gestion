type Matrix = boolean[][];

const TOTAL_CODEWORDS = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
const ECC_PER_BLOCK = [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18];
const BLOCKS = [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4];
const BYTE_CAPACITY = [0, 17, 32, 53, 78, 106, 134, 154, 192, 230, 271];
const ALIGNMENT: number[][] = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    EXP[index] = value;
    LOG[value] = index;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let index = 255; index < 512; index += 1) EXP[index] = EXP[index - 255] as number;
}

function multiply(left: number, right: number): number {
  return left === 0 || right === 0
    ? 0
    : (EXP[(LOG[left] as number) + (LOG[right] as number)] as number);
}

function generator(degree: number): number[] {
  let polynomial = [1];
  for (let index = 0; index < degree; index += 1) {
    const factor = EXP[index] as number;
    const next = new Array<number>(polynomial.length + 1).fill(0);
    polynomial.forEach((coefficient, position) => {
      next[position] = (next[position] ?? 0) ^ coefficient;
      next[position + 1] = (next[position + 1] ?? 0) ^ multiply(coefficient, factor);
    });
    polynomial = next;
  }
  return polynomial;
}

function remainder(data: number[], degree: number): number[] {
  const divisor = generator(degree);
  const result = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ (result[0] as number);
    result.shift();
    result.push(0);
    for (let index = 0; index < degree; index += 1)
      result[index] = (result[index] as number) ^ multiply(divisor[index + 1] as number, factor);
  }
  return result;
}

class BitBuffer {
  public readonly bits: boolean[] = [];
  public append(value: number, length: number) {
    for (let index = length - 1; index >= 0; index -= 1)
      this.bits.push(((value >>> index) & 1) !== 0);
  }
}

function dataCodewords(text: string, version: number): number[] {
  const bytes = [...new TextEncoder().encode(text)];
  const dataCapacity = TOTAL_CODEWORDS[version]! - ECC_PER_BLOCK[version]! * BLOCKS[version]!;
  const bits = new BitBuffer();
  bits.append(0b0100, 4);
  bits.append(bytes.length, version <= 9 ? 8 : 16);
  for (const byte of bytes) bits.append(byte, 8);
  const capacityBits = dataCapacity * 8;
  bits.append(0, Math.min(4, capacityBits - bits.bits.length));
  while (bits.bits.length % 8 !== 0) bits.bits.push(false);
  const result: number[] = [];
  for (let index = 0; index < bits.bits.length; index += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1) byte = (byte << 1) | (bits.bits[index + bit] ? 1 : 0);
    result.push(byte);
  }
  for (let pad = 0; result.length < dataCapacity; pad += 1)
    result.push(pad % 2 === 0 ? 0xec : 0x11);
  return result;
}

function fullCodewords(data: number[], version: number): number[] {
  const total = TOTAL_CODEWORDS[version]!;
  const blocks = BLOCKS[version]!;
  const eccLength = ECC_PER_BLOCK[version]!;
  const shortBlockLength = Math.floor(total / blocks);
  const shortBlocks = blocks - (total % blocks);
  const shortDataLength = shortBlockLength - eccLength;
  const dataBlocks: number[][] = [];
  const eccBlocks: number[][] = [];
  let offset = 0;
  for (let block = 0; block < blocks; block += 1) {
    const length = shortDataLength + (block >= shortBlocks ? 1 : 0);
    const values = data.slice(offset, offset + length);
    offset += length;
    dataBlocks.push(values);
    eccBlocks.push(remainder(values, eccLength));
  }
  const result: number[] = [];
  const maxDataLength = Math.max(...dataBlocks.map((block) => block.length));
  for (let index = 0; index < maxDataLength; index += 1)
    for (const block of dataBlocks) if (index < block.length) result.push(block[index] as number);
  for (let index = 0; index < eccLength; index += 1)
    for (const block of eccBlocks) result.push(block[index] as number);
  return result;
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function formatBits(mask: number): number {
  const data = (1 << 3) | mask; // ECC level L = 01
  let remainderValue = data;
  for (let index = 0; index < 10; index += 1)
    remainderValue = (remainderValue << 1) ^ ((remainderValue >>> 9) * 0x537);
  return ((data << 10) | remainderValue) ^ 0x5412;
}

function versionBits(version: number): number {
  let remainderValue = version;
  for (let index = 0; index < 12; index += 1)
    remainderValue = (remainderValue << 1) ^ ((remainderValue >>> 11) * 0x1f25);
  return (version << 12) | remainderValue;
}

function penalty(matrix: Matrix): number {
  const size = matrix.length;
  let score = 0;
  const lines = [
    ...matrix,
    ...Array.from({ length: size }, (_, x) => matrix.map((row) => row[x] as boolean)),
  ];
  for (const line of lines) {
    let runColor = line[0];
    let runLength = 1;
    for (let index = 1; index < size; index += 1) {
      if (line[index] === runColor) runLength += 1;
      else {
        if (runLength >= 5) score += 3 + runLength - 5;
        runColor = line[index];
        runLength = 1;
      }
    }
    if (runLength >= 5) score += 3 + runLength - 5;
    const pattern = line.map((value) => (value ? '1' : '0')).join('');
    for (let index = 0; index <= size - 11; index += 1) {
      const sample = pattern.slice(index, index + 11);
      if (sample === '00001011101' || sample === '10111010000') score += 40;
    }
  }
  for (let y = 0; y < size - 1; y += 1)
    for (let x = 0; x < size - 1; x += 1) {
      const color = matrix[y]![x];
      if (
        matrix[y]![x + 1] === color &&
        matrix[y + 1]![x] === color &&
        matrix[y + 1]![x + 1] === color
      )
        score += 3;
    }
  const dark = matrix.reduce((total, row) => total + row.filter(Boolean).length, 0);
  score += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  return score;
}

function buildMatrix(version: number, codewords: number[], mask: number): Matrix {
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const functional = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const setFunction = (x: number, y: number, value: boolean) => {
    if (x >= 0 && y >= 0 && x < size && y < size) {
      modules[y]![x] = value;
      functional[y]![x] = true;
    }
  };
  const finder = (centerX: number, centerY: number) => {
    for (let dy = -4; dy <= 4; dy += 1)
      for (let dx = -4; dx <= 4; dx += 1) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        setFunction(centerX + dx, centerY + dy, distance !== 2 && distance !== 4);
      }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  for (let index = 8; index < size - 8; index += 1) {
    setFunction(6, index, index % 2 === 0);
    setFunction(index, 6, index % 2 === 0);
  }
  for (const centerY of ALIGNMENT[version]!)
    for (const centerX of ALIGNMENT[version]!) {
      if (functional[centerY]?.[centerX]) continue;
      for (let dy = -2; dy <= 2; dy += 1)
        for (let dx = -2; dx <= 2; dx += 1)
          setFunction(centerX + dx, centerY + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }

  const drawFormat = (selectedMask: number) => {
    const bits = formatBits(selectedMask);
    for (let index = 0; index < 15; index += 1) {
      const bit = ((bits >>> index) & 1) !== 0;
      if (index < 6) setFunction(8, index, bit);
      else if (index < 8) setFunction(8, index + 1, bit);
      else setFunction(8, size - 15 + index, bit);
      if (index < 8) setFunction(size - index - 1, 8, bit);
      else if (index === 8) setFunction(7, 8, bit);
      else setFunction(15 - index - 1, 8, bit);
    }
    setFunction(8, size - 8, true);
  };
  drawFormat(mask);
  if (version >= 7) {
    const bits = versionBits(version);
    for (let index = 0; index < 18; index += 1) {
      const bit = ((bits >>> index) & 1) !== 0;
      const a = size - 11 + (index % 3);
      const b = Math.floor(index / 3);
      setFunction(a, b, bit);
      setFunction(b, a, bit);
    }
  }

  const bits = codewords.flatMap((byte) =>
    Array.from({ length: 8 }, (_, index) => ((byte >>> (7 - index)) & 1) !== 0),
  );
  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let vertical = 0; vertical < size; vertical += 1) {
      const y = upward ? size - 1 - vertical : vertical;
      for (let column = 0; column < 2; column += 1) {
        const x = right - column;
        if (functional[y]![x]) continue;
        const dataBit = bits[bitIndex] ?? false;
        modules[y]![x] = dataBit !== maskBit(mask, x, y);
        bitIndex += 1;
      }
    }
    upward = !upward;
  }
  return modules;
}

export function createQrMatrix(text: string): Matrix {
  const byteLength = new TextEncoder().encode(text).length;
  const version = BYTE_CAPACITY.findIndex((capacity, index) => index > 0 && byteLength <= capacity);
  if (version < 1) throw new Error('El contenido es demasiado largo para la etiqueta QR.');
  const codewords = fullCodewords(dataCodewords(text, version), version);
  let best = buildMatrix(version, codewords, 0);
  let bestPenalty = penalty(best);
  for (let mask = 1; mask < 8; mask += 1) {
    const candidate = buildMatrix(version, codewords, mask);
    const candidatePenalty = penalty(candidate);
    if (candidatePenalty < bestPenalty) {
      best = candidate;
      bestPenalty = candidatePenalty;
    }
  }
  return best;
}

export function qrSvg(text: string, scale = 8, border = 4): string {
  const matrix = createQrMatrix(text);
  const size = matrix.length + border * 2;
  const path: string[] = [];
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) path.push(`M${x + border},${y + border}h1v1h-1z`);
    }),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * scale}" height="${size * scale}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path.join('')}" fill="#000"/></svg>`;
}

export function downloadQrLabel(
  filename: string,
  title: string,
  subtitle: string,
  payload: string,
) {
  const qr = qrSvg(payload, 7);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="620" viewBox="0 0 480 620"><rect width="480" height="620" rx="24" fill="white" stroke="#222" stroke-width="2"/><text x="240" y="48" text-anchor="middle" font-family="Arial" font-size="24" font-weight="700">${title.replace(/[&<>]/g, '')}</text><text x="240" y="78" text-anchor="middle" font-family="Arial" font-size="15">${subtitle.replace(/[&<>]/g, '')}</text><g transform="translate(40 100) scale(.74)">${qr.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g><text x="240" y="585" text-anchor="middle" font-family="monospace" font-size="14">${payload.replace(/[&<>]/g, '')}</text></svg>`;
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
