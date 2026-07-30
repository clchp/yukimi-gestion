export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';

export interface ProductRow {
  id: string;
  code: string;
  name: string;
  franchise: string;
  category: string;
  warehouse: 'Lorena' | 'Camila';
  available: number;
  reserved: number;
  transit: number;
  price: string;
  status: 'Disponible' | 'Stock bajo' | 'Agotado' | 'Preventa';
}

export const products: ProductRow[] = [
  {
    id: '1',
    code: 'YKM-FIG-JJK-0001',
    name: 'Figura Gojo Satoru — Uniforme negro',
    franchise: 'Jujutsu Kaisen',
    category: 'Figuras',
    warehouse: 'Lorena',
    available: 3,
    reserved: 1,
    transit: 5,
    price: 'S/.89.90',
    status: 'Disponible',
  },
  {
    id: '2',
    code: 'YKM-PEL-SPY-0004',
    name: 'Peluche Anya Forger 20 cm',
    franchise: 'Spy × Family',
    category: 'Peluches',
    warehouse: 'Camila',
    available: 1,
    reserved: 2,
    transit: 0,
    price: 'S/.49.90',
    status: 'Stock bajo',
  },
  {
    id: '3',
    code: 'YKM-ACR-KNY-0012',
    name: 'Acrílico Nezuko — Festival',
    franchise: 'Kimetsu no Yaiba',
    category: 'Acrílicos',
    warehouse: 'Lorena',
    available: 0,
    reserved: 0,
    transit: 8,
    price: 'S/.29.90',
    status: 'Preventa',
  },
  {
    id: '4',
    code: 'YKM-LLA-OP-0007',
    name: 'Llavero Luffy Gear 5',
    franchise: 'One Piece',
    category: 'Llaveros',
    warehouse: 'Camila',
    available: 7,
    reserved: 1,
    transit: 0,
    price: 'S/.18.00',
    status: 'Disponible',
  },
  {
    id: '5',
    code: 'YKM-FIG-NAR-0009',
    name: 'Figura Kakashi Hatake — Anbu',
    franchise: 'Naruto',
    category: 'Figuras',
    warehouse: 'Lorena',
    available: 0,
    reserved: 0,
    transit: 0,
    price: 'S/.119.00',
    status: 'Agotado',
  },
];

export const clients = [
  {
    id: '1',
    code: 'CLI-00031',
    name: 'María López',
    phone: '987 654 321',
    type: 'VIP',
    spent: 'S/.1,240.00',
    balance: 'S/.80.00',
    overdue: 0,
    lastPurchase: '28/07/2026',
  },
  {
    id: '2',
    code: 'CLI-00032',
    name: 'Andrea Quispe',
    phone: '956 205 480',
    type: 'Regular',
    spent: 'S/.435.00',
    balance: 'S/.120.00',
    overdue: 3,
    lastPurchase: '26/07/2026',
  },
  {
    id: '3',
    code: 'CLI-00033',
    name: 'Lucía Torres',
    phone: '914 002 716',
    type: 'VIP',
    spent: 'S/.2,810.00',
    balance: 'S/.0.00',
    overdue: 0,
    lastPurchase: '25/07/2026',
  },
  {
    id: '4',
    code: 'CLI-00034',
    name: 'Valeria Soto',
    phone: '988 443 920',
    type: 'Regular',
    spent: 'S/.290.00',
    balance: 'S/.45.00',
    overdue: 0,
    lastPurchase: '20/07/2026',
  },
];

export const sales = [
  {
    code: 'VN-1042',
    client: 'María López',
    date: '29/07/2026',
    total: 'S/.249.80',
    paid: 'S/.120.00',
    balance: 'S/.129.80',
    due: '12/08/2026',
    payment: 'Parcial',
    delivery: 'Acumula almacén',
    admin: 'Lorena',
  },
  {
    code: 'VN-1041',
    client: 'Lucía Torres',
    date: '29/07/2026',
    total: 'S/.89.90',
    paid: 'S/.89.90',
    balance: 'S/.0.00',
    due: '—',
    payment: 'Pagada',
    delivery: 'Pendiente agencia',
    admin: 'Camila',
  },
  {
    code: 'VN-1040',
    client: 'Andrea Quispe',
    date: '28/07/2026',
    total: 'S/.159.00',
    paid: 'S/.80.00',
    balance: 'S/.82.00',
    due: '26/07/2026',
    payment: 'Vencida',
    delivery: 'Pendiente',
    admin: 'Lorena',
  },
  {
    code: 'VN-1039',
    client: 'Valeria Soto',
    date: '27/07/2026',
    total: 'S/.49.90',
    paid: 'S/.49.90',
    balance: 'S/.0.00',
    due: '—',
    payment: 'Pagada',
    delivery: 'Entregada',
    admin: 'Camila',
  },
];

export const activities = [
  {
    time: '05:12 p. m.',
    title: 'Pago confirmado',
    detail: 'Camila confirmó S/.80.00 de la venta VN-1042',
    tone: 'success' as Tone,
  },
  {
    time: '04:48 p. m.',
    title: 'Stock actualizado',
    detail: 'Lorena registró 8 unidades de Acrílico Nezuko',
    tone: 'info' as Tone,
  },
  {
    time: '03:30 p. m.',
    title: 'Pago vencido',
    detail: 'La venta VN-1040 acumula 3 días de retraso',
    tone: 'danger' as Tone,
  },
  {
    time: '01:15 p. m.',
    title: 'Caja embarcada',
    detail: 'CJA-00127 cambió a estado En tránsito',
    tone: 'primary' as Tone,
  },
];

export const importsData = [
  {
    code: 'IMP-0015',
    provider: 'ZenMarket',
    method: 'Aéreo',
    boxes: 3,
    estimated: '05/08/2026',
    state: 'En tránsito',
    progress: 68,
    responsible: 'Lorena',
  },
  {
    code: 'IMP-0014',
    provider: 'Mercari JP',
    method: 'Barco',
    boxes: 5,
    estimated: '18/08/2026',
    state: 'Embarcada',
    progress: 45,
    responsible: 'Camila',
  },
  {
    code: 'IMP-0013',
    provider: 'AmiAmi',
    method: 'Aéreo',
    boxes: 2,
    estimated: '30/07/2026',
    state: 'Retrasada',
    progress: 78,
    responsible: 'Lorena',
  },
];

export const deliveries = [
  {
    code: 'ENT-0228',
    client: 'Lucía Torres',
    sale: 'VN-1041',
    operator: 'Shalom',
    products: 2,
    state: 'Pendiente de despacho',
    nextDate: 'Jue. 30/07',
    tracking: 'Pendiente',
  },
  {
    code: 'ENT-0227',
    client: 'Valeria Soto',
    sale: 'VN-1039',
    operator: 'AF Express',
    products: 1,
    state: 'Entregada',
    nextDate: '27/07/2026',
    tracking: 'AFX-88392',
  },
  {
    code: 'ENT-0226',
    client: 'María López',
    sale: 'VN-1042',
    operator: 'Acumula almacén',
    products: 3,
    state: 'Acumula almacén',
    nextDate: 'Sin fecha',
    tracking: '—',
  },
];
