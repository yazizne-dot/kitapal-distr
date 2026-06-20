import { CommonModule, DatePipe, PercentPipe } from '@angular/common';
import { Component, computed, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
// xlsx import removed — накладная is now generated as HTML (Form З-2)
import { products as initialProducts, type Product } from './price-products';
import { KztPipe } from './kzt.pipe';

type Role = 'admin' | 'manager' | 'distributor';
type OrderStatus = 'draft' | 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
type OrderItemSort = 'name' | 'qty' | 'amount';
type ProfileTab = 'password' | 'notifications' | 'language';

type AppNotif = {
  id: number;
  type: 'danger' | 'warning' | 'success' | 'info';
  title: string;
  body: string;
  date: string;
  distributorId?: number;
};

type Distributor = {
  id: number;
  company: string;
  city: string;
  manager: string;
  target: number;
  achieved: number;
  discount: number;
  creditLimit: number;
  debt: number;
  phone: string;
};

type Order = {
  id: string;
  distributorId: number;
  items: OrderItem[];
  status: OrderStatus;
  amount: number;
  createdAt: string;
  history: OrderHistory[];
};

type OrderItem = {
  productId: number;
  name: string;
  barcode: string;
  publisher: string;
  qty: number;
  unitPrice: number;
  discount: number;
  amount: number;
};

type OrderHistory = {
  date: string;
  status: OrderStatus;
  text: string;
};

type Payment = {
  id: number;
  distributorId: number;
  amount: number;
  date: string;
  note: string;
};

type DistMessage = {
  id: number;
  distributorId: number;
  from: string;
  text: string;
  date: string;
};

type UserAccount = {
  id: number;
  name: string;
  login: string;
  password: string;
  role: Role;
  distributorId?: number;
};

const initialAccounts: UserAccount[] = [
  { id: 1,  name: 'Бас Администратор',  login: 'admin',  password: 'admin2026',    role: 'admin' },
  { id: 2,  name: 'Маржан',            login: 'marjan', password: 'manager2026',  role: 'manager' },
  { id: 5,  name: 'Paidaly — Астана',          login: 'astana',    password: 'kitapal2026',  role: 'distributor', distributorId: 1 },
  { id: 6,  name: 'Руханият — Ақтау',          login: 'rukhaniyat',password: 'kitapal2026',  role: 'distributor', distributorId: 2 },
  { id: 7,  name: 'Ақтау франшиза',            login: 'aktaufr',   password: 'kitapal2026',  role: 'distributor', distributorId: 3 },
  { id: 8,  name: 'Aidyn Kitap — Қызылорда',   login: 'kyzylorda', password: 'kitapal2026',  role: 'distributor', distributorId: 4 },
  { id: 9,  name: 'Kitapal Oral — Орал',        login: 'oral',      password: 'kitapal2026',  role: 'distributor', distributorId: 5 },
  { id: 10, name: 'Закария — Павлодар',         login: 'pavlodar',  password: 'kitapal2026',  role: 'distributor', distributorId: 6 },
  { id: 11, name: 'Байгелов — Тараз',           login: 'baigelov',  password: 'kitapal2026',  role: 'distributor', distributorId: 7 },
  { id: 12, name: 'ЖасКО — Тараз',              login: 'jasko',     password: 'kitapal2026',  role: 'distributor', distributorId: 8 },
  { id: 13, name: 'Олжабаев — Шымкент',         login: 'shymkent',  password: 'kitapal2026',  role: 'distributor', distributorId: 9 },
  { id: 14, name: 'Сабитова Нұртас — Алматы',   login: 'almaty',    password: 'kitapal2026',  role: 'distributor', distributorId: 10 },
  { id: 15, name: 'Рахманов — Барахолка',        login: 'rakhmanov', password: 'kitapal2026',  role: 'distributor', distributorId: 11 },
];

const distributors: Distributor[] = [
  { id: 1,  company: 'Paidaly',          city: 'Астана',    manager: 'Маржан', target: 42000000, achieved: 4726848,  discount: 0.45, creditLimit: 8000000,  debt: 8050087,  phone: '' },
  { id: 2,  company: 'Руханият',         city: 'Ақтау',     manager: 'Маржан', target: 18000000, achieved: 2572777,  discount: 0.40, creditLimit: 3000000,  debt: 3585136,  phone: '' },
  { id: 3,  company: 'Ақтау франшиза',   city: 'Ақтау',     manager: 'Маржан', target: 15000000, achieved: 1255682,  discount: 0.40, creditLimit: 3000000,  debt: 3741159,  phone: '' },
  { id: 4,  company: 'Aidyn Kitap',      city: 'Қызылорда', manager: 'Маржан', target: 12000000, achieved: 545037,   discount: 0.40, creditLimit: 2000000,  debt: 1761489,  phone: '' },
  { id: 5,  company: 'Kitapal Oral',     city: 'Орал',      manager: 'Маржан', target: 27000000, achieved: 1915963,  discount: 0.43, creditLimit: 4500000,  debt: 1915963,  phone: '' },
  { id: 6,  company: 'Закария',          city: 'Павлодар',  manager: 'Маржан', target: 14000000, achieved: 886814,   discount: 0.38, creditLimit: 14000000, debt: 523769,   phone: '' },
  { id: 7,  company: 'Байгелов',         city: 'Тараз',     manager: 'Маржан', target: 9000000,  achieved: 702806,   discount: 0.37, creditLimit: 2000000,  debt: 2455954,  phone: '' },
  { id: 8,  company: 'ЖасКО',            city: 'Тараз',     manager: 'Маржан', target: 10000000, achieved: 759006,   discount: 0.40, creditLimit: 2000000,  debt: 2083129,  phone: '' },
  { id: 9,  company: 'Олжабаев',         city: 'Шымкент',   manager: 'Маржан', target: 42000000, achieved: 1668679,  discount: 0.45, creditLimit: 15000000, debt: 1668679,  phone: '' },
  { id: 10, company: 'Сабитова Нұртас',  city: 'Алматы',    manager: 'Маржан', target: 40000000, achieved: 2831901,  discount: 0.45, creditLimit: 8000000,  debt: 2831901,  phone: '' },
  { id: 11, company: 'Рахманов',         city: 'Барахолка', manager: 'Маржан', target: 25000000, achieved: 2307519,  discount: 0.45, creditLimit: 10000000, debt: 7065200,  phone: '' },
];

const orders: Order[] = [
  {
    id: 'KP-AST-2605-0001', distributorId: 1,
    items: [
      { productId: 1, name: '100 вопросов о вечной жизни', barcode: '9786018112188', publisher: 'Самға',  qty: 400,  unitPrice: 908,  discount: 0.40, amount: 363200 },
      { productId: 2, name: '100 хадис',                   barcode: '9786017271152', publisher: 'Букмейд', qty: 1500, unitPrice: 231,  discount: 0.40, amount: 346500 },
      { productId: 5, name: '365 күн, 365 оқиға, 365 діни сөз', barcode: '9786018107887', publisher: 'Самға', qty: 200, unitPrice: 2264, discount: 0.40, amount: 452800 },
    ],
    status: 'delivered', amount: 1162500, createdAt: '2026-05-05',
    history: [
      { date: '2026-05-05', status: 'pending',   text: 'Дистрибьютор тапсырыс жіберді' },
      { date: '2026-05-06', status: 'confirmed', text: 'Менеджер растады' },
      { date: '2026-05-07', status: 'shipped',   text: 'Қоймадан жіберілді' },
      { date: '2026-05-12', status: 'delivered', text: 'Дистрибьютор алды' },
    ]
  },
  {
    id: 'KP-AKT-2605-0001', distributorId: 2,
    items: [
      { productId: 1, name: '100 вопросов о вечной жизни', barcode: '9786018112188', publisher: 'Самға',  qty: 300,  unitPrice: 908,  discount: 0.40, amount: 272400 },
      { productId: 2, name: '100 хадис',                   barcode: '9786017271152', publisher: 'Букмейд', qty: 800,  unitPrice: 231,  discount: 0.40, amount: 184800 },
      { productId: 5, name: '365 күн, 365 оқиға, 365 діни сөз', barcode: '9786018107887', publisher: 'Самға', qty: 150, unitPrice: 2264, discount: 0.40, amount: 339600 },
    ],
    status: 'delivered', amount: 796800, createdAt: '2026-05-06',
    history: [
      { date: '2026-05-06', status: 'pending',   text: 'Дистрибьютор тапсырыс жіберді' },
      { date: '2026-05-07', status: 'confirmed', text: 'Менеджер растады' },
      { date: '2026-05-08', status: 'shipped',   text: 'Қоймадан жіберілді' },
      { date: '2026-05-13', status: 'delivered', text: 'Дистрибьютор алды' },
    ]
  },
  {
    id: 'KP-AKT-2605-0002', distributorId: 3,
    items: [
      { productId: 1, name: '100 вопросов о вечной жизни', barcode: '9786018112188', publisher: 'Самға',  qty: 250, unitPrice: 908,  discount: 0.40, amount: 227000 },
      { productId: 4, name: '30 күн дұға, салауат',        barcode: '9786017495329', publisher: 'Таным',   qty: 500, unitPrice: 198,  discount: 0.40, amount: 99000  },
      { productId: 5, name: '365 күн, 365 оқиға, 365 діни сөз', barcode: '9786018107887', publisher: 'Самға', qty: 50,  unitPrice: 2264, discount: 0.40, amount: 113200 },
    ],
    status: 'delivered', amount: 439200, createdAt: '2026-05-08',
    history: [
      { date: '2026-05-08', status: 'pending',   text: 'Дистрибьютор тапсырыс жіберді' },
      { date: '2026-05-09', status: 'confirmed', text: 'Менеджер растады' },
      { date: '2026-05-10', status: 'shipped',   text: 'Қоймадан жіберілді' },
      { date: '2026-05-14', status: 'delivered', text: 'Дистрибьютор алды' },
    ]
  },
  {
    id: 'KP-KYZ-2605-0001', distributorId: 4,
    items: [
      { productId: 1, name: '100 вопросов о вечной жизни', barcode: '9786018112188', publisher: 'Самға',  qty: 150, unitPrice: 908,  discount: 0.40, amount: 136200 },
      { productId: 2, name: '100 хадис',                   barcode: '9786017271152', publisher: 'Букмейд', qty: 400, unitPrice: 231,  discount: 0.40, amount: 92400  },
      { productId: 5, name: '365 күн, 365 оқиға, 365 діни сөз', barcode: '9786018107887', publisher: 'Самға', qty: 30,  unitPrice: 2264, discount: 0.40, amount: 67920  },
    ],
    status: 'delivered', amount: 296520, createdAt: '2026-05-10',
    history: [
      { date: '2026-05-10', status: 'pending',   text: 'Дистрибьютор тапсырыс жіберді' },
      { date: '2026-05-11', status: 'confirmed', text: 'Менеджер растады' },
      { date: '2026-05-12', status: 'shipped',   text: 'Қоймадан жіберілді' },
      { date: '2026-05-16', status: 'delivered', text: 'Дистрибьютор алды' },
    ]
  },
  {
    id: 'KP-ORL-2605-0001', distributorId: 5,
    items: [
      { productId: 1, name: '100 вопросов о вечной жизни', barcode: '9786018112188', publisher: 'Самға',  qty: 350, unitPrice: 908,  discount: 0.40, amount: 317800 },
      { productId: 2, name: '100 хадис',                   barcode: '9786017271152', publisher: 'Букмейд', qty: 900, unitPrice: 231,  discount: 0.40, amount: 207900 },
      { productId: 5, name: '365 күн, 365 оқиға, 365 діни сөз', barcode: '9786018107887', publisher: 'Самға', qty: 120, unitPrice: 2264, discount: 0.40, amount: 271680 },
    ],
    status: 'delivered', amount: 797380, createdAt: '2026-05-05',
    history: [
      { date: '2026-05-05', status: 'pending',   text: 'Дистрибьютор тапсырыс жіберді' },
      { date: '2026-05-06', status: 'confirmed', text: 'Менеджер растады' },
      { date: '2026-05-07', status: 'shipped',   text: 'Қоймадан жіберілді' },
      { date: '2026-05-11', status: 'delivered', text: 'Дистрибьютор алды' },
    ]
  },
  {
    id: 'KP-PAV-2605-0001', distributorId: 6,
    items: [
      { productId: 1, name: '100 вопросов о вечной жизни', barcode: '9786018112188', publisher: 'Самға',  qty: 200, unitPrice: 908,  discount: 0.40, amount: 181600 },
      { productId: 2, name: '100 хадис',                   barcode: '9786017271152', publisher: 'Букмейд', qty: 500, unitPrice: 231,  discount: 0.40, amount: 115500 },
      { productId: 5, name: '365 күн, 365 оқиға, 365 діни сөз', barcode: '9786018107887', publisher: 'Самға', qty: 60,  unitPrice: 2264, discount: 0.40, amount: 135840 },
    ],
    status: 'delivered', amount: 432940, createdAt: '2026-05-12',
    history: [
      { date: '2026-05-12', status: 'pending',   text: 'Дистрибьютор тапсырыс жіберді' },
      { date: '2026-05-13', status: 'confirmed', text: 'Менеджер растады' },
      { date: '2026-05-14', status: 'shipped',   text: 'Қоймадан жіберілді' },
      { date: '2026-05-18', status: 'delivered', text: 'Дистрибьютор алды' },
    ]
  },
  {
    id: 'KP-TAR-2605-0001', distributorId: 7,
    items: [
      { productId: 1, name: '100 вопросов о вечной жизни', barcode: '9786018112188', publisher: 'Самға',  qty: 150, unitPrice: 908,  discount: 0.40, amount: 136200 },
      { productId: 2, name: '100 хадис',                   barcode: '9786017271152', publisher: 'Букмейд', qty: 400, unitPrice: 231,  discount: 0.40, amount: 92400  },
      { productId: 5, name: '365 күн, 365 оқиға, 365 діни сөз', barcode: '9786018107887', publisher: 'Самға', qty: 40,  unitPrice: 2264, discount: 0.40, amount: 90560  },
    ],
    status: 'delivered', amount: 319160, createdAt: '2026-05-09',
    history: [
      { date: '2026-05-09', status: 'pending',   text: 'Дистрибьютор тапсырыс жіберді' },
      { date: '2026-05-10', status: 'confirmed', text: 'Менеджер растады' },
      { date: '2026-05-11', status: 'shipped',   text: 'Қоймадан жіберілді' },
      { date: '2026-05-15', status: 'delivered', text: 'Дистрибьютор алды' },
    ]
  },
  {
    id: 'KP-TAR-2605-0002', distributorId: 8,
    items: [
      { productId: 1, name: '100 вопросов о вечной жизни', barcode: '9786018112188', publisher: 'Самға',  qty: 180, unitPrice: 908,  discount: 0.40, amount: 163440 },
      { productId: 2, name: '100 хадис',                   barcode: '9786017271152', publisher: 'Букмейд', qty: 350, unitPrice: 231,  discount: 0.40, amount: 80850  },
      { productId: 5, name: '365 күн, 365 оқиға, 365 діни сөз', barcode: '9786018107887', publisher: 'Самға', qty: 35,  unitPrice: 2264, discount: 0.40, amount: 79240  },
    ],
    status: 'delivered', amount: 323530, createdAt: '2026-05-11',
    history: [
      { date: '2026-05-11', status: 'pending',   text: 'Дистрибьютор тапсырыс жіберді' },
      { date: '2026-05-12', status: 'confirmed', text: 'Менеджер растады' },
      { date: '2026-05-13', status: 'shipped',   text: 'Қоймадан жіберілді' },
      { date: '2026-05-17', status: 'delivered', text: 'Дистрибьютор алды' },
    ]
  },
  {
    id: 'KP-SHY-2605-0001', distributorId: 9,
    items: [
      { productId: 1, name: '100 вопросов о вечной жизни', barcode: '9786018112188', publisher: 'Самға',  qty: 300, unitPrice: 908,  discount: 0.40, amount: 272400 },
      { productId: 2, name: '100 хадис',                   barcode: '9786017271152', publisher: 'Букмейд', qty: 800, unitPrice: 231,  discount: 0.40, amount: 184800 },
      { productId: 5, name: '365 күн, 365 оқиға, 365 діни сөз', barcode: '9786018107887', publisher: 'Самға', qty: 130, unitPrice: 2264, discount: 0.40, amount: 294320 },
    ],
    status: 'delivered', amount: 751520, createdAt: '2026-05-04',
    history: [
      { date: '2026-05-04', status: 'pending',   text: 'Дистрибьютор тапсырыс жіберді' },
      { date: '2026-05-05', status: 'confirmed', text: 'Менеджер растады' },
      { date: '2026-05-06', status: 'shipped',   text: 'Қоймадан жіберілді' },
      { date: '2026-05-10', status: 'delivered', text: 'Дистрибьютор алды' },
    ]
  },
  {
    id: 'KP-ALA-2605-0001', distributorId: 10,
    items: [
      { productId: 1, name: '100 вопросов о вечной жизни', barcode: '9786018112188', publisher: 'Самға',  qty: 380,  unitPrice: 908,  discount: 0.40, amount: 345040 },
      { productId: 2, name: '100 хадис',                   barcode: '9786017271152', publisher: 'Букмейд', qty: 1000, unitPrice: 231,  discount: 0.40, amount: 231000 },
      { productId: 5, name: '365 күн, 365 оқиға, 365 діни сөз', barcode: '9786018107887', publisher: 'Самға', qty: 160, unitPrice: 2264, discount: 0.40, amount: 362240 },
    ],
    status: 'delivered', amount: 938280, createdAt: '2026-05-07',
    history: [
      { date: '2026-05-07', status: 'pending',   text: 'Дистрибьютор тапсырыс жіберді' },
      { date: '2026-05-08', status: 'confirmed', text: 'Менеджер растады' },
      { date: '2026-05-09', status: 'shipped',   text: 'Қоймадан жіберілді' },
      { date: '2026-05-13', status: 'delivered', text: 'Дистрибьютор алды' },
    ]
  },
  {
    id: 'KP-BAR-2605-0001', distributorId: 11,
    items: [
      { productId: 1, name: '100 вопросов о вечной жизни', barcode: '9786018112188', publisher: 'Самға',  qty: 280, unitPrice: 908,  discount: 0.40, amount: 254240 },
      { productId: 2, name: '100 хадис',                   barcode: '9786017271152', publisher: 'Букмейд', qty: 700, unitPrice: 231,  discount: 0.40, amount: 161700 },
      { productId: 5, name: '365 күн, 365 оқиға, 365 діни сөз', barcode: '9786018107887', publisher: 'Самға', qty: 100, unitPrice: 2264, discount: 0.40, amount: 226400 },
    ],
    status: 'delivered', amount: 642340, createdAt: '2026-05-06',
    history: [
      { date: '2026-05-06', status: 'pending',   text: 'Дистрибьютор тапсырыс жіберді' },
      { date: '2026-05-07', status: 'confirmed', text: 'Менеджер растады' },
      { date: '2026-05-08', status: 'shipped',   text: 'Қоймадан жіберілді' },
      { date: '2026-05-12', status: 'delivered', text: 'Дистрибьютор алды' },
    ]
  },
  // ─── Маусым 2026 — жаңа тапсырыстар (менеджер тексеруі қажет) ───
  {
    id: 'KP-ORL-2606-0012', distributorId: 5,
    items: [
      { productId: 1, name: '100 вопросов о вечной жизни', barcode: '9786018112188', publisher: 'Самға',   qty: 200, unitPrice: 908,  discount: 0.40, amount: 181600 },
      { productId: 2, name: '100 хадис',                   barcode: '9786017271152', publisher: 'Букмейд', qty: 300, unitPrice: 231,  discount: 0.40, amount: 69300  },
      { productId: 3, name: 'Аналар мен апалар',           barcode: '9786010018426', publisher: 'Дайк',    qty: 150, unitPrice: 1155, discount: 0.40, amount: 173250 },
    ],
    status: 'pending', amount: 424150, createdAt: '2026-06-10',
    history: [
      { date: '2026-06-10', status: 'pending', text: 'Дистрибьютор тапсырыс жіберді' },
    ]
  },
  {
    id: 'KP-AST-2606-0013', distributorId: 1,
    items: [
      { productId: 5, name: '365 күн, 365 оқиға, 365 діни сөз', barcode: '9786018107887', publisher: 'Самға', qty: 120, unitPrice: 2264, discount: 0.40, amount: 271680 },
      { productId: 4, name: 'Бала тілі — ана сүті',              barcode: '9786010017978', publisher: 'Дайк',  qty: 80,  unitPrice: 1155, discount: 0.40, amount: 92400  },
    ],
    status: 'draft', amount: 364080, createdAt: '2026-06-12',
    history: [
      { date: '2026-06-12', status: 'draft', text: 'Лимиттен асқандықтан черновик болып сақталды' },
    ]
  },
  {
    id: 'KP-SHY-2606-0014', distributorId: 2,
    items: [
      { productId: 6, name: 'Асқар таулар аясында', barcode: '9786010001169', publisher: 'Аруна', qty: 500, unitPrice: 462, discount: 0.40, amount: 231000 },
    ],
    status: 'pending', amount: 231000, createdAt: '2026-06-13',
    history: [
      { date: '2026-06-13', status: 'pending', text: 'Дистрибьютор тапсырыс жіберді' },
    ]
  },
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, KztPipe, DatePipe, PercentPipe],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  private readonly cityCodeMap: Record<string, string> = {
    'Астана': 'AST', 'Шымкент': 'SHY', 'Ақтау': 'AKT',
    'Қызылорда': 'KYZ', 'Тараз': 'TAR', 'Жезқазған': 'JEZ',
    'Павлодар': 'PAV', 'Орал': 'ORL', 'Барахолка': 'BAR',
    'Алматы': 'ALA', 'Атырау': 'ATR',
  };

  signedIn = signal(false);
  role = signal<Role>('admin');
  currentUser = signal<UserAccount | null>(null);
  activeScreen = signal('overview');
  selectedDistributorId = signal(1);
  productQuery = signal('');
  selectedCategory = signal('Барлығы');
  priceQuantities = signal<Record<number, number>>({});
  selectedOrderId = signal('KP-AST-2605-0001');
  orderItemSort = signal<OrderItemSort>('name');
  priceViewMode = signal<'list' | 'grid'>('grid');
  priceDisplayCount = signal(8);
  addItemModal = signal(false);
  addItemQuery = signal('');
  shipModal = signal(false);

  // Profile panel
  profileOpen = signal(false);
  profileTab = signal<ProfileTab>('password');
  notificationsEnabled = signal(true);
  selectedLanguage = signal<'kz' | 'ru' | 'en'>('kz');
  currentPwd = '';
  newPwd = '';
  confirmPwd = '';
  pwdMsg = '';
  pwdMsgType: 'error' | 'success' = 'error';

  // Distributor detail view
  distributorDetailId = signal<number | null>(null);
  detailActiveMonth = signal<string>('all'); // 'all' | '2026-01' | '2026-07' etc.

  // Discount editing (admin only)
  editingDiscountDistId = signal<number | null>(null);
  editDiscountStr = '';

  // Payment recording
  paymentModalOpen = signal(false);
  paymentDistId = signal<number | null>(null);
  paymentAmountStr = '';
  paymentNoteStr = '';
  paymentDateStr = '2026-06-10';

  // Price editing
  editingProductId = signal<number | null>(null);
  editProdName = '';
  editProdPublisher = '';
  editProdBarcode = '';
  editProdCategory = '';
  editProdBasePrice = 0;

  // Column visibility for admin price table
  hiddenColumns = signal<string[]>([]);

  addItemProductId = 1;
  addItemQty = 1;
  shipDate = '2026-06-11';
  trackingNumber = '';
  shipNotes = '';

  email = 'admin';
  password = '';
  rememberMe = false;
  loginError = '';
  orderQty = 10;
  orderProductId = 1;

  accounts = signal<UserAccount[]>(initialAccounts);
  accountModal = signal(false);
  editingAccountId: number | null = null;
  newAccName = '';
  newAccLogin = '';
  newAccPassword = '';
  newAccRole: Role = 'distributor';
  newAccDistributorId = 1;

  distributors = signal<Distributor[]>((() => {
    try { const s = localStorage.getItem('kp_distributors'); return s ? JSON.parse(s) as Distributor[] : distributors; }
    catch { return distributors; }
  })());
  products = signal<Product[]>([...initialProducts]);
  orders = signal<Order[]>((() => {
    try { const s = localStorage.getItem('kp_orders'); return s ? JSON.parse(s) as Order[] : orders; }
    catch { return orders; }
  })());

  constructor() {
    // Persist orders, payments, messages to localStorage on every change
    effect(() => { localStorage.setItem('kp_orders', JSON.stringify(this.orders())); });
    effect(() => { localStorage.setItem('kp_payments', JSON.stringify(this.payments())); });
    effect(() => { localStorage.setItem('kp_messages', JSON.stringify(this.messages())); });
    effect(() => { localStorage.setItem('kp_distributors', JSON.stringify(this.distributors())); });

    // "Есімде сақта" — алдыңғы сессиядан логин/парольді қалпына келтіру
    try {
      const saved = localStorage.getItem('kp_remember');
      if (saved) {
        const { login, password } = JSON.parse(saved);
        this.email = login;
        this.password = password;
        this.rememberMe = true;
        this.login();
      }
    } catch { /* сақталған дерек жоқ немесе бұзылған */ }
  }

  adminMenu = [
    ['overview', 'Басқы бет'],
    ['goals', 'Мақсаттар'],
    ['distributors', 'Дистрибьюторлар'],
    ['price', 'Прайс-лист'],
    ['orders', 'Тапсырыстар'],
    ['debts', 'Қарыз және лимит'],
    ['users', 'Пайдаланушылар'],
    ['notifications', 'Хабарламалар'],
    ['excel', 'Excel импорт'],
    ['security', 'RLS қауіпсіздік']
  ];

  distributorMenu = [
    ['overview', 'Менің прогресім'],
    ['price', 'Прайс-лист'],
    ['orders', 'Тапсырыс беру'],
    ['debts', 'Қарызым'],
    ['notifications', 'Хабарламалар']
  ];

  managerMenu = [
    ['overview', 'Басқы бет'],
    ['distributors', 'Дистрибьюторлар'],
    ['orders', 'Тапсырыстар'],
    ['debts', 'Қарыз және төлемдер'],
    ['price', 'Прайс-лист'],
    ['notifications', 'Хабарламалар']
  ];

  currentMenu = computed(() => {
    if (this.role() === 'distributor') return this.distributorMenu;
    return this.role() === 'manager' ? this.managerMenu : this.adminMenu;
  });

  payments = signal<Payment[]>((() => {
    try { const s = localStorage.getItem('kp_payments'); return s ? JSON.parse(s) as Payment[] : []; }
    catch { return []; }
  })());

  paymentFilterDistId = signal<number>(0); // 0 = барлығы (тек admin/manager үшін)

  messages = signal<DistMessage[]>((() => {
    try { const s = localStorage.getItem('kp_messages'); return s ? JSON.parse(s) as DistMessage[] : []; }
    catch { return []; }
  })());

  messageModalOpen = signal(false);
  messageDistId = signal<number | null>(null);
  messageText = '';

  paymentsByDist = computed(() => {
    const map = new Map<number, number>();
    for (const p of this.payments()) {
      map.set(p.distributorId, (map.get(p.distributorId) ?? 0) + p.amount);
    }
    return map;
  });

  effectiveDistributors = computed(() => {
    const paidMap = this.paymentsByDist();
    return this.distributors().map(d => ({
      ...d,
      debt: Math.max(0, d.debt - (paidMap.get(d.id) ?? 0))
    }));
  });

  visibleDistributors = computed(() => {
    const all = this.effectiveDistributors();
    if (this.role() === 'distributor') {
      return all.filter((item) => item.id === this.selectedDistributorId());
    }
    return all;
  });

  selectedDistributor = computed(() =>
    this.effectiveDistributors().find((item) => item.id === this.selectedDistributorId()) ?? this.effectiveDistributors()[0]
  );

  visibleOrders = computed(() => {
    const allowed = new Set(this.visibleDistributors().map((item) => item.id));
    return this.orders().filter((order) => allowed.has(order.distributorId));
  });

  // Orders needing manager attention: pending + draft (draft = limit exceeded, needs review)
  pendingOrders = computed(() =>
    this.visibleOrders().filter(o => o.status === 'pending' || o.status === 'draft')
  );

  selectedOrder = computed(() =>
    this.visibleOrders().find((order) => order.id === this.selectedOrderId()) ?? this.sortedVisibleOrders()[0]
  );

  // Orders sorted: pending & draft first, then confirmed, shipped, delivered last
  sortedVisibleOrders = computed(() => {
    const priority: Record<string, number> = {
      pending: 0, draft: 1, confirmed: 2, shipped: 3, delivered: 4, cancelled: 5
    };
    return [...this.visibleOrders()].sort((a, b) => {
      const p = priority[a.status] - priority[b.status];
      return p !== 0 ? p : b.createdAt.localeCompare(a.createdAt);
    });
  });

  sortedOrderItems = computed(() => {
    const order = this.selectedOrder();
    if (!order) return [];
    return [...order.items].sort((a, b) => {
      if (this.orderItemSort() === 'qty') return b.qty - a.qty;
      if (this.orderItemSort() === 'amount') return b.amount - a.amount;
      return a.name.localeCompare(b.name);
    });
  });

  totalTarget = computed(() => this.visibleDistributors().reduce((sum, d) => sum + d.target, 0));
  totalAchieved = computed(() => this.visibleDistributors().reduce((sum, d) => sum + d.achieved, 0));
  totalDebt = computed(() => this.visibleDistributors().reduce((sum, d) => sum + d.debt, 0));
  totalCredit = computed(() => this.visibleDistributors().reduce((sum, d) => sum + d.creditLimit, 0));
  totalPaid = computed(() => this.payments().reduce((sum, p) => sum + p.amount, 0));

  categories = computed(() => ['Барлығы', ...new Set(this.products().map((p) => p.category))]);
  filteredProducts = computed(() => {
    const query = this.productQuery().trim().toLowerCase();
    const category = this.selectedCategory();
    return this.products().filter((product) =>
      (category === 'Барлығы' || product.category === category) &&
      [product.name, product.publisher, product.barcode, product.category]
        .join(' ').toLowerCase().includes(query)
    );
  });

  displayedProducts = computed(() => {
    const defaultCount = this.priceViewMode() === 'grid' ? 8 : 40;
    return this.filteredProducts().slice(0, Math.max(this.priceDisplayCount(), defaultCount));
  });

  adminFilteredProducts = computed(() => this.filteredProducts());
  adminDisplayedProducts = computed(() => this.adminFilteredProducts().slice(0, this.priceDisplayCount()));

  isColVisible(col: string): boolean {
    return !this.hiddenColumns().includes(col);
  }

  toggleColumn(col: string): void {
    this.hiddenColumns.update(list =>
      list.includes(col) ? list.filter(c => c !== col) : [...list, col]
    );
  }

  addItemFilteredProducts = computed(() => {
    const q = this.addItemQuery().trim().toLowerCase();
    return this.products()
      .filter(p => !q || p.name.toLowerCase().includes(q) || p.publisher.toLowerCase().includes(q))
      .slice(0, 20);
  });

  priceDraftItems = computed(() =>
    this.products()
      .map((product) => ({
        product,
        qty: this.priceQty(product.id),
        amount: this.myPrice(product) * this.priceQty(product.id)
      }))
      .filter((item) => item.qty > 0)
  );

  priceDraftTotal = computed(() =>
    this.priceDraftItems().reduce((sum, item) => sum + item.amount, 0)
  );

  remainingLimit = computed(() =>
    Math.max(0, this.selectedDistributor().creditLimit - this.selectedDistributor().debt)
  );

  // Distributor detail computeds
  readonly YEAR_MONTHS = [
    '2026-01','2026-02','2026-03','2026-04','2026-05','2026-06',
    '2026-07','2026-08','2026-09','2026-10','2026-11','2026-12'
  ];
  // Current active month — distributors cannot go beyond this
  readonly CURRENT_MONTH = '2026-06';

  // Distributor order month selection
  distributorOrderMonth = signal<string>('2026-06');

  // Available months for distributor (current + past only)
  distributorAvailableMonths = computed(() => {
    const idx = this.YEAR_MONTHS.indexOf(this.CURRENT_MONTH);
    return this.YEAR_MONTHS.slice(0, idx + 1);
  });

  // Distributor's orders filtered by selected month
  distributorMonthOrders = computed(() => {
    const m = this.distributorOrderMonth();
    return this.visibleOrders().filter(o => o.createdAt.startsWith(m));
  });

  isCurrentMonth = computed(() => this.distributorOrderMonth() === this.CURRENT_MONTH);

  // Pre-computed: order counts per month for distributor
  distributorOrderCountByMonth = computed(() => {
    const map: Record<string, number> = {};
    this.visibleOrders().forEach(o => {
      const m = o.createdAt.substring(0, 7);
      map[m] = (map[m] ?? 0) + 1;
    });
    return map;
  });

  // Orders for distributor in the currently selected month
  distributorCurrentMonthOrders = computed(() => {
    const m = this.distributorOrderMonth();
    return this.visibleOrders().filter(o => o.createdAt.startsWith(m));
  });

  // Manager monthly filter
  managerOrderMonth = signal<string>('all');

  // months that appear in manager's order list (for tab badges)
  managerOrderMonthCounts = computed(() => {
    const map: Record<string, number> = {};
    this.sortedVisibleOrders().forEach(o => {
      const m = o.createdAt.substring(0, 7);
      map[m] = (map[m] ?? 0) + 1;
    });
    return map;
  });

  // months with orders, sorted ascending
  managerAvailableMonths = computed(() =>
    Object.keys(this.managerOrderMonthCounts()).sort()
  );

  // Admin/manager orders list — filtered by month and optionally by distributor
  adminManagerOrders = computed(() => {
    const m = this.managerOrderMonth();
    const distId = this.role() !== 'distributor' ? this.selectedDistributorId() : 0;
    let list = this.sortedVisibleOrders();
    if (m !== 'all') list = list.filter(o => o.createdAt.startsWith(m));
    if (distId > 0) list = list.filter(o => o.distributorId === distId);
    return list;
  });

  selectedDetailDistributor = computed(() => {
    const id = this.distributorDetailId();
    return id ? this.effectiveDistributors().find(d => d.id === id) ?? null : null;
  });

  distributorDetailOrders = computed(() => {
    const id = this.distributorDetailId();
    if (!id) return [];
    return this.orders().filter(o => o.distributorId === id);
  });

  // months that have at least one order — used for tab badges
  detailMonthStats = computed(() => {
    const map: Record<string, { orderCount: number; total: number; itemCount: number }> = {};
    this.distributorDetailOrders().forEach(o => {
      const m = o.createdAt.substring(0, 7);
      if (!map[m]) map[m] = { orderCount: 0, total: 0, itemCount: 0 };
      map[m].orderCount++;
      map[m].total += o.amount;
      map[m].itemCount += o.items.reduce((s, i) => s + i.qty, 0);
    });
    return map;
  });

  // orders filtered by selected month (or all)
  detailFilteredOrders = computed(() => {
    const m = this.detailActiveMonth();
    const all = this.distributorDetailOrders();
    if (m === 'all') return all;
    return all.filter(o => o.createdAt.startsWith(m));
  });

  // books aggregated for the filtered period
  distributorBooksAggregated = computed(() => {
    const map: Record<number, { name: string; publisher: string; qty: number; amount: number }> = {};
    this.detailFilteredOrders().forEach(order => {
      order.items.forEach(item => {
        if (!map[item.productId]) {
          map[item.productId] = { name: item.name, publisher: item.publisher, qty: 0, amount: 0 };
        }
        map[item.productId].qty += item.qty;
        map[item.productId].amount += item.amount;
      });
    });
    return Object.values(map).sort((a, b) => b.amount - a.amount);
  });

  // Auto-generated notifications from real data — рөл бойынша шектелген (тек өзіне қатыстысын көреді)
  computedNotifications = computed((): AppNotif[] => {
    const notifs: AppNotif[] = [];
    let id = 1;
    const visible = this.visibleDistributors();
    visible.forEach(d => {
      if (d.debt > d.creditLimit) {
        notifs.push({
          id: id++, type: 'danger',
          title: 'Лимит асылды',
          body: `${d.company} (${d.city}) — қарыз ${d.debt.toLocaleString('ru')} ₸, лимит ${d.creditLimit.toLocaleString('ru')} ₸`,
          date: '2026-06-10',
          distributorId: d.id
        });
      } else if (d.debt > d.creditLimit * 0.8) {
        notifs.push({
          id: id++, type: 'warning',
          title: 'Лимит ескертуі',
          body: `${d.company} (${d.city}) — лимиттің ${Math.round(d.debt / d.creditLimit * 100)}% қолданылды`,
          date: '2026-06-10',
          distributorId: d.id
        });
      }
      const pct = d.achieved / d.target;
      if (pct >= 0.8 && pct < 1) {
        notifs.push({
          id: id++, type: 'success',
          title: 'Мақсатқа жақын',
          body: `${d.company} — мақсаттың ${Math.round(pct * 100)}% орындалды`,
          date: '2026-06-08',
          distributorId: d.id
        });
      }
    });
    this.visibleOrders().filter(o => o.status === 'pending').forEach(o => {
      const dist = visible.find(d => d.id === o.distributorId);
      if (dist) {
        notifs.push({
          id: id++, type: 'info',
          title: 'Тапсырыс расталуды күтуде',
          body: `${o.id} — ${dist.company}, ${o.amount.toLocaleString('ru')} ₸`,
          date: o.createdAt,
          distributorId: dist.id
        });
      }
    });
    const visibleIds = new Set(visible.map(d => d.id));
    this.messages().filter(m => visibleIds.has(m.distributorId)).forEach(m => {
      const dist = visible.find(d => d.id === m.distributorId);
      notifs.push({
        id: id++, type: 'info',
        title: `Хабарлама${dist ? ' — ' + dist.company : ''}`,
        body: m.text,
        date: m.date,
        distributorId: m.distributorId
      });
    });
    return notifs;
  });

  login(): void {
    const acc = this.accounts().find(
      a => a.login === this.email.trim() && a.password === this.password
    );
    if (!acc) {
      this.loginError = 'Логин немесе пароль қате';
      return;
    }
    this.loginError = '';
    this.role.set(acc.role);
    this.currentUser.set(acc);
    if (acc.distributorId != null) this.selectedDistributorId.set(acc.distributorId);
    this.activeScreen.set('overview');
    this.signedIn.set(true);

    if (this.rememberMe) {
      localStorage.setItem('kp_remember', JSON.stringify({ login: this.email.trim(), password: this.password }));
    } else {
      localStorage.removeItem('kp_remember');
    }
  }

  loginDemo(role: Role): void {
    this.role.set(role);
    if (role === 'distributor') {
      this.selectedDistributorId.set(1);
      this.currentUser.set(this.accounts().find(a => a.role === 'distributor') ?? null);
    } else if (role === 'admin') {
      this.currentUser.set(this.accounts().find(a => a.role === 'admin') ?? null);
    } else {
      this.currentUser.set(this.accounts().find(a => a.role === 'manager') ?? null);
    }
    this.activeScreen.set('overview');
    this.signedIn.set(true);
  }

  logout(): void {
    this.signedIn.set(false);
    this.password = '';
    this.loginError = '';
    this.currentUser.set(null);
    this.profileOpen.set(false);
  }

  changePassword(): void {
    const user = this.currentUser();
    if (!user) return;
    if (!this.currentPwd || !this.newPwd || !this.confirmPwd) {
      this.pwdMsg = 'Барлық өрісті толтырыңыз';
      this.pwdMsgType = 'error';
      return;
    }
    if (user.password !== this.currentPwd) {
      this.pwdMsg = 'Ағымдағы пароль қате';
      this.pwdMsgType = 'error';
      return;
    }
    if (this.newPwd !== this.confirmPwd) {
      this.pwdMsg = 'Жаңа пароль сәйкес келмейді';
      this.pwdMsgType = 'error';
      return;
    }
    if (this.newPwd.length < 6) {
      this.pwdMsg = 'Пароль кемінде 6 таңба болуы керек';
      this.pwdMsgType = 'error';
      return;
    }
    this.accounts.update(list => list.map(a => a.id === user.id ? { ...a, password: this.newPwd } : a));
    this.currentUser.update(u => u ? { ...u, password: this.newPwd } : u);
    this.pwdMsg = 'Пароль сәтті өзгертілді!';
    this.pwdMsgType = 'success';
    this.currentPwd = '';
    this.newPwd = '';
    this.confirmPwd = '';
  }

  openEditProduct(product: Product): void {
    this.editingProductId.set(product.id);
    this.editProdName = product.name;
    this.editProdPublisher = product.publisher;
    this.editProdBarcode = product.barcode;
    this.editProdCategory = product.category;
    this.editProdBasePrice = product.basePrice;
  }

  saveEditProduct(): void {
    const id = this.editingProductId();
    if (!id) return;
    this.products.update(list => list.map(p => p.id !== id ? p : {
      ...p,
      name: this.editProdName.trim() || p.name,
      publisher: this.editProdPublisher.trim() || p.publisher,
      barcode: this.editProdBarcode.trim() || p.barcode,
      category: this.editProdCategory.trim() || p.category,
      basePrice: Number(this.editProdBasePrice) > 0 ? Number(this.editProdBasePrice) : p.basePrice,
    }));
    this.editingProductId.set(null);
  }

  monthLabel(month: string): string {
    const labels: Record<string, string> = {
      '01': 'Қаңтар', '02': 'Ақпан', '03': 'Наурыз', '04': 'Сәуір',
      '05': 'Мамыр', '06': 'Маусым', '07': 'Шілде', '08': 'Тамыз',
      '09': 'Қыркүйек', '10': 'Қазан', '11': 'Қараша', '12': 'Желтоқсан',
    };
    const [year, m] = month.split('-');
    return `${labels[m] ?? m} ${year}`;
  }

  getDistributorById(id: number): Distributor | undefined {
    return this.effectiveDistributors().find(d => d.id === id);
  }

  openPaymentModal(distId: number): void {
    this.paymentDistId.set(distId);
    this.paymentAmountStr = '';
    this.paymentNoteStr = '';
    this.paymentDateStr = '2026-06-10';
    this.paymentModalOpen.set(true);
  }

  filteredPayments = computed(() => {
    const list = this.payments().slice().reverse();
    if (this.role() === 'distributor') {
      return list.filter(p => p.distributorId === this.selectedDistributorId());
    }
    const distId = this.paymentFilterDistId();
    return distId === 0 ? list : list.filter(p => p.distributorId === distId);
  });

  paymentTotalByFilter = computed(() =>
    this.filteredPayments().reduce((s, p) => s + p.amount, 0)
  );

  deletePayment(id: number): void {
    this.payments.update(ps => ps.filter(p => p.id !== id));
  }

  savePayment(): void {
    const amount = parseFloat(this.paymentAmountStr);
    if (!amount || amount <= 0 || !this.paymentDistId()) return;
    const nextId = (this.payments().at(-1)?.id ?? 0) + 1;
    this.payments.update(ps => [...ps, {
      id: nextId,
      distributorId: this.paymentDistId()!,
      amount,
      date: this.paymentDateStr || '2026-06-10',
      note: this.paymentNoteStr
    }]);
    this.paymentModalOpen.set(false);
  }

  paymentsForDist(distId: number): Payment[] {
    return this.payments().filter(p => p.distributorId === distId);
  }

  startEditDiscount(d: Distributor): void {
    this.editingDiscountDistId.set(d.id);
    this.editDiscountStr = String(Math.round(d.discount * 100));
  }

  saveDiscount(distId: number): void {
    if (this.role() !== 'admin') return;
    const pct = parseFloat(this.editDiscountStr);
    if (isNaN(pct) || pct < 0 || pct > 100) return;
    this.distributors.update(ds => ds.map(d => d.id === distId ? { ...d, discount: pct / 100 } : d));
    this.editingDiscountDistId.set(null);
  }

  openMessageModal(distId: number): void {
    this.messageDistId.set(distId);
    this.messageText = '';
    this.messageModalOpen.set(true);
  }

  sendMessage(): void {
    const distId = this.messageDistId();
    const text = this.messageText.trim();
    if (!distId || !text) return;
    const nextId = (this.messages().at(-1)?.id ?? 0) + 1;
    this.messages.update(ms => [...ms, {
      id: nextId,
      distributorId: distId,
      from: this.currentUser()?.name ?? (this.role() === 'admin' ? 'Әкімші' : 'Менеджер'),
      text,
      date: '2026-06-16'
    }]);
    this.messageModalOpen.set(false);
  }

  messagesForDist(distId: number): DistMessage[] {
    return this.messages().filter(m => m.distributorId === distId).slice().reverse();
  }

  openAccountModal(): void {
    this.editingAccountId = null;
    this.newAccName = '';
    this.newAccLogin = '';
    this.newAccPassword = '';
    this.newAccRole = 'distributor';
    this.newAccDistributorId = 1;
    this.accountModal.set(true);
  }

  editAccount(acc: UserAccount): void {
    this.editingAccountId = acc.id;
    this.newAccName = acc.name;
    this.newAccLogin = acc.login;
    this.newAccPassword = '';
    this.newAccRole = acc.role;
    this.newAccDistributorId = acc.distributorId ?? 1;
    this.accountModal.set(true);
  }

  saveAccount(): void {
    if (!this.newAccLogin.trim() || !this.newAccName.trim()) return;
    if (this.editingAccountId != null) {
      this.accounts.update(list =>
        list.map(a => a.id !== this.editingAccountId ? a : {
          ...a,
          name: this.newAccName.trim(),
          login: this.newAccLogin.trim(),
          ...(this.newAccPassword ? { password: this.newAccPassword } : {}),
          role: this.newAccRole,
          distributorId: this.newAccRole === 'distributor' ? Number(this.newAccDistributorId) : undefined,
        })
      );
    } else {
      const nextId = Math.max(0, ...this.accounts().map(a => a.id)) + 1;
      this.accounts.update(list => [...list, {
        id: nextId,
        name: this.newAccName.trim(),
        login: this.newAccLogin.trim(),
        password: this.newAccPassword || 'kitapal2026',
        role: this.newAccRole,
        distributorId: this.newAccRole === 'distributor' ? Number(this.newAccDistributorId) : undefined,
      }]);
    }
    this.accountModal.set(false);
  }

  deleteAccount(id: number): void {
    if (id === 1) return;
    this.accounts.update(list => list.filter(a => a.id !== id));
  }

  navigate(screen: string): void {
    this.activeScreen.set(screen);
    this.distributorDetailId.set(null);
    this.detailActiveMonth.set('all');
  }

  openDistributorDetail(id: number): void {
    this.distributorDetailId.set(id);
    this.detailActiveMonth.set('all');
  }

  effectiveDiscount(product: Product, distributor = this.selectedDistributor()): number {
    return product.discountOverride ?? distributor.discount;
  }

  myPrice(product: Product): number {
    return Math.round(product.basePrice * (1 - this.effectiveDiscount(product)));
  }

  priceQty(productId: number): number {
    return this.priceQuantities()[productId] ?? 0;
  }

  setPriceQty(productId: number, value: string | number): void {
    const nextQty = Math.max(0, Number(value) || 0);
    this.priceQuantities.update((quantities) => ({ ...quantities, [productId]: nextQty }));
  }

  changePriceQty(productId: number, amount: number): void {
    this.setPriceQty(productId, this.priceQty(productId) + amount);
  }

  progress(distributor: Distributor): number {
    return distributor.target ? distributor.achieved / distributor.target : 0;
  }

  createOrder(): void {
    const product = this.products().find((item) => item.id === Number(this.orderProductId)) ?? this.products()[0];
    const distributor = this.selectedDistributor();
    const unitPrice = this.myPrice(product);
    const discount = this.effectiveDiscount(product);
    const amount = unitPrice * this.orderQty;
    const status: OrderStatus = distributor.debt + amount > distributor.creditLimit ? 'draft' : 'pending';
    const id = this.nextOrderId();
    this.orders.update((items) => [{
      id, distributorId: distributor.id,
      items: [{ productId: product.id, name: product.name, barcode: product.barcode, publisher: product.publisher, qty: this.orderQty, unitPrice, discount, amount }],
      status, amount, createdAt: '2026-06-10',
      history: [{ date: '2026-06-10', status, text: status === 'draft' ? 'Лимиттен асқандықтан черновик болып сақталды' : 'Дистрибьютор тапсырыс жіберді' }]
    }, ...items]);
    this.selectedOrderId.set(id);
  }

  createOrderFromPrice(): void {
    const items = this.priceDraftItems();
    if (items.length === 0) return;
    const distributor = this.selectedDistributor();
    const amount = this.priceDraftTotal();
    const status: OrderStatus = distributor.debt + amount > distributor.creditLimit ? 'draft' : 'pending';
    const id = this.nextOrderId();
    this.orders.update((orders) => [{
      id, distributorId: distributor.id,
      items: items.map((item) => ({
        productId: item.product.id, name: item.product.name, barcode: item.product.barcode,
        publisher: item.product.publisher, qty: item.qty,
        unitPrice: this.myPrice(item.product), discount: this.effectiveDiscount(item.product), amount: item.amount
      })),
      status, amount, createdAt: '2026-06-10',
      history: [{ date: '2026-06-10', status, text: status === 'draft' ? 'Лимиттен асқандықтан черновик болып сақталды' : 'Дистрибьютор тапсырыс жіберді' }]
    }, ...orders]);
    this.priceQuantities.set({});
    this.selectedOrderId.set(id);
    this.activeScreen.set('orders');
  }

  openOrder(orderId: string): void {
    this.selectedOrderId.set(orderId);
  }

  totalOrderQty(order: Order): number {
    return order.items.reduce((sum, item) => sum + item.qty, 0);
  }

  orderProductsLabel(order: Order): string {
    return order.items.length === 1 ? order.items[0].name : `${order.items.length} кітап`;
  }

  orderDistributor(order: Order): Distributor {
    return this.distributors().find((item) => item.id === order.distributorId) ?? this.distributors()[0];
  }

  updateOrderStatus(orderId: string, status: OrderStatus, text: string): void {
    this.orders.update((orders) =>
      orders.map((order) =>
        order.id === orderId
          ? { ...order, status, history: [...order.history, { date: '2026-06-10', status, text }] }
          : order
      )
    );
  }

  confirmOrder(orderId: string): void {
    const order = this.orders().find(o => o.id === orderId);
    const note = order?.status === 'draft'
      ? 'Менеджер лимиттен асқанын растады (қолмен өткізілді)'
      : 'Менеджер тапсырысты растады';
    this.updateOrderStatus(orderId, 'confirmed', note);
  }

  shipOrder(orderId: string): void {
    this.updateOrderStatus(orderId, 'shipped', 'Менеджер тапсырысты жіберуге бекітті');
  }

  cancelOrder(orderId: string): void {
    this.updateOrderStatus(orderId, 'cancelled', 'Менеджер тапсырысты қайтарды');
  }

  nextOrderId(): string {
    const distributor = this.selectedDistributor();
    const cityCode = this.cityCodeMap[distributor.city] ?? 'KP';
    const prefix = `KP-${cityCode}-2606-`;
    const maxSeq = this.orders()
      .filter(o => o.id.startsWith(prefix))
      .map(o => parseInt(o.id.slice(prefix.length)) || 0)
      .reduce((max, n) => Math.max(max, n), 0);
    return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
  }

  loadMorePrice(): void {
    this.priceDisplayCount.update(n => n + (this.priceViewMode() === 'grid' ? 8 : 40));
  }

  statusLabel(status: OrderStatus): string {
    const labels: Record<OrderStatus, string> = {
      draft: 'Черновик', pending: 'Күтуде', confirmed: 'Расталды',
      shipped: 'Жіберілді', delivered: 'Жеткізілді', cancelled: 'Жойылды'
    };
    return labels[status];
  }

  orderBaseTotal(order: Order): number {
    return order.items.reduce((sum, item) =>
      sum + Math.round(item.unitPrice / (1 - item.discount)) * item.qty, 0);
  }

  orderDiscountAmount(order: Order): number {
    return this.orderBaseTotal(order) - order.amount;
  }

  canEditOrder(order: Order): boolean {
    return (this.role() === 'admin' || this.role() === 'manager') && ['pending', 'draft', 'confirmed'].includes(order.status);
  }

  canAddItem(order: Order): boolean {
    return (this.role() === 'admin' || this.role() === 'manager') && ['pending', 'draft'].includes(order.status);
  }

  removeOrderItem(orderId: string, productId: number): void {
    this.orders.update(orders =>
      orders.map(order => {
        if (order.id !== orderId) return order;
        const items = order.items.filter(item => item.productId !== productId);
        const amount = items.reduce((sum, item) => sum + item.amount, 0);
        return {
          ...order, items, amount,
          history: [...order.history, { date: '2026-06-10', status: order.status, text: 'Менеджер кітапты алып тастады' }]
        };
      })
    );
  }

  updateOrderItemQty(orderId: string, productId: number, newQty: number): void {
    const qty = Math.max(1, Math.round(newQty) || 1);
    this.orders.update(orders =>
      orders.map(order => {
        if (order.id !== orderId) return order;
        const items = order.items.map(item =>
          item.productId === productId
            ? { ...item, qty, amount: item.unitPrice * qty }
            : item
        );
        const amount = items.reduce((sum, item) => sum + item.amount, 0);
        return {
          ...order, items, amount,
          history: [...order.history, { date: '2026-06-10', status: order.status, text: 'Менеджер кітап санын өзгертті' }]
        };
      })
    );
  }

  confirmAddItem(): void {
    const order = this.selectedOrder();
    if (!order) return;
    const product = this.products().find(p => p.id === Number(this.addItemProductId));
    if (!product) return;
    const distributor = this.orderDistributor(order);
    const discount = this.effectiveDiscount(product, distributor);
    const unitPrice = Math.round(product.basePrice * (1 - discount));
    const qty = Math.max(1, Number(this.addItemQty) || 1);
    const amount = unitPrice * qty;
    this.orders.update(orders =>
      orders.map(o => {
        if (o.id !== order.id) return o;
        const existingIdx = o.items.findIndex(item => item.productId === product.id);
        let items: OrderItem[];
        if (existingIdx >= 0) {
          items = o.items.map((item, idx) => idx === existingIdx
            ? { ...item, qty: item.qty + qty, amount: item.amount + amount }
            : item);
        } else {
          items = [...o.items, {
            productId: product.id, name: product.name, barcode: product.barcode,
            publisher: product.publisher, qty, unitPrice, discount, amount
          }];
        }
        return {
          ...o, items, amount: items.reduce((s, i) => s + i.amount, 0),
          history: [...o.history, { date: '2026-06-10', status: o.status, text: `Менеджер ${product.name} × ${qty} қосты` }]
        };
      })
    );
    this.addItemModal.set(false);
    this.addItemQuery.set('');
  }

  openShipModal(): void {
    this.shipDate = '2026-06-11';
    this.trackingNumber = '';
    this.shipNotes = '';
    this.shipModal.set(true);
  }

  confirmShip(): void {
    const order = this.selectedOrder();
    if (!order || order.status !== 'confirmed') return;
    const note = `Жөнелтілді. Трек: ${this.trackingNumber || '—'}. Жеткізу: ${this.shipDate}`;
    this.updateOrderStatus(order.id, 'shipped', note);
    this.generateNakladnoy(order);
    this.shipModal.set(false);
  }

  generateNakladnoy(order: Order): void {
    const dist = this.getDistributorById(order.distributorId);
    if (!dist) return;
    const managerName = this.currentUser()?.name ?? 'Менеджер';

    // ── Document number & date ──
    const docNumMatch = order.id.match(/(\d+)$/);
    const docNum = docNumMatch ? String(parseInt(docNumMatch[1], 10)) : order.id;
    const d = new Date();
    const dateStr = `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`;

    // ── Number-to-words (Russian) ──
    const ones_m = ['','один','два','три','четыре','пять','шесть','семь','восемь','девять'];
    const ones_f = ['','одна','две','три','четыре','пять','шесть','семь','восемь','девять'];
    const teens_w = ['десять','одиннадцать','двенадцать','тринадцать','четырнадцать',
                     'пятнадцать','шестнадцать','семнадцать','восемнадцать','девятнадцать'];
    const tens_w  = ['','десять','двадцать','тридцать','сорок','пятьдесят',
                     'шестьдесят','семьдесят','восемьдесят','девяносто'];
    const hunds_w = ['','сто','двести','триста','четыреста','пятьсот',
                     'шестьсот','семьсот','восемьсот','девятьсот'];

    const chunk3 = (n: number, fem: boolean): string => {
      const h = Math.floor(n/100), tm = n%100, t = Math.floor(tm/10), o = n%10;
      let r = '';
      if (h > 0) r += hunds_w[h] + ' ';
      if (t === 1) r += teens_w[o] + ' ';
      else { if (t > 1) r += tens_w[t] + ' '; if (o > 0) r += (fem ? ones_f[o] : ones_m[o]) + ' '; }
      return r.trim();
    };
    const thouSuffix = (n: number) => { const t=n%100,o=n%10; return (t>=11&&t<=19)?'тысяч':o===1?'тысяча':(o>=2&&o<=4)?'тысячи':'тысяч'; };
    const milSuffix  = (n: number) => { const t=n%100,o=n%10; return (t>=11&&t<=19)?'миллионов':o===1?'миллион':(o>=2&&o<=4)?'миллиона':'миллионов'; };
    const numWords = (n: number, fem = false): string => {
      if (n === 0) return 'ноль';
      let r = '';
      const mil = Math.floor(n/1_000_000), tho = Math.floor((n%1_000_000)/1_000), rem = n%1_000;
      if (mil > 0) r += chunk3(mil,false)+' '+milSuffix(mil)+' ';
      if (tho > 0) r += chunk3(tho,true)+' '+thouSuffix(tho)+' ';
      if (rem > 0) r += chunk3(rem,fem);
      return r.trim();
    };
    const cap = (s: string) => s.charAt(0).toUpperCase()+s.slice(1);

    // ── Totals ──
    const totalQty    = order.items.reduce((s,i) => s+i.qty, 0);
    const totalAmount = order.amount;
    const qtyInWords  = cap(numWords(totalQty));
    const tengeInt    = Math.floor(totalAmount);
    const tiyn        = Math.round((totalAmount - tengeInt)*100);
    const amtInWords  = `${cap(numWords(tengeInt))} тенге ${tiyn.toString().padStart(2,'0')} тиын`;

    // ── Format numbers ──
    const fmt = (n: number) => n.toLocaleString('ru-RU', {minimumFractionDigits:2, maximumFractionDigits:2});

    // ── Item rows ──
    const itemRows = order.items.map((item, idx) => {
      const unitPrice = item.unitPrice * (1 - item.discount);
      return `<tr>
        <td class="c">${idx+1}</td>
        <td class="l">${item.name}</td>
        <td class="c">${item.barcode}</td>
        <td class="c">шт</td>
        <td class="c">${item.qty}</td>
        <td class="c">${item.qty}</td>
        <td class="r">${fmt(unitPrice)}</td>
        <td class="r">${fmt(item.amount)}</td>
        <td class="r"></td>
      </tr>`;
    }).join('');

    // ── Flat data for CSV/Excel export (no rowspan/colspan — avoids Excel parsing corruption) ──
    const csvRowsData = order.items.map((item, idx) => ({
      num: idx + 1,
      name: item.name,
      barcode: item.barcode,
      qty: item.qty,
      unitPrice: Math.round(item.unitPrice * (1 - item.discount)),
      basePrice: Math.round(item.unitPrice),
      discountPct: Math.round(item.discount * 100),
      amount: item.amount
    }));
    const csvRowsJson = JSON.stringify(csvRowsData).replace(/</g, '\\u003c');

    // ── HTML (Form З-2) ──
    const html = `<!DOCTYPE html>
<html lang="ru"><head>
<meta charset="UTF-8">
<title>Накладная №${docNum} от ${dateStr}</title>
<style>
@page{size:A4 portrait;margin:12mm 10mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:8.5pt;color:#000}
.top-wrapper{position:relative;min-height:68px;margin-bottom:4px}
.top-ref{position:absolute;top:0;right:0;text-align:right;font-size:7.5pt;line-height:1.4;font-style:italic}
.org-row{display:flex;align-items:baseline;gap:6px;margin-bottom:4px;margin-right:200px}
.org-label{white-space:nowrap;font-size:8pt}
.org-name{flex:1;border-bottom:1px solid #000;font-weight:bold;text-align:center;padding-bottom:1px;min-width:200px}
.iin-wrap{display:inline-flex;align-items:baseline;gap:4px;margin-left:6px}
.iin-val{border:1px solid #000;padding:2px 8px;font-weight:bold}
.doc-box{border-collapse:collapse;float:right;margin-top:4px}
.doc-box th,.doc-box td{border:1px solid #000;padding:2px 10px;text-align:center;font-size:8pt}
.doc-box th{font-weight:normal;font-size:7.5pt}
h1{text-align:center;font-size:10pt;font-weight:bold;text-transform:uppercase;margin:10px 0 6px;letter-spacing:.5px;clear:both}
.mt{width:100%;border-collapse:collapse;font-size:8pt;margin-bottom:6px}
.mt th,.mt td{border:1px solid #000;padding:3px 4px;vertical-align:middle}
.mt th{text-align:center;font-weight:normal;font-size:7.5pt}
.it{width:100%;border-collapse:collapse;font-size:8pt;margin-bottom:6px}
.it th,.it td{border:1px solid #000;padding:2px 4px;vertical-align:middle}
.it th{text-align:center;font-weight:bold;font-size:7.5pt}
.c{text-align:center}.r{text-align:right}.l{text-align:left}
.tr-tot td{font-weight:bold;background:#f5f5f5}
.propis{margin:4px 0 8px;font-size:8pt;line-height:1.6}
.sig-wrap{width:100%;font-size:8pt;line-height:2}
.sig-row{display:flex;gap:12px;margin-bottom:6px;align-items:flex-end}
.sig-block{display:inline-flex;align-items:flex-end;gap:4px}
.sig-line{border-bottom:1px solid #000;display:inline-block;min-width:80px}
.sig-hint{font-size:7pt;text-align:center;color:#444;display:block}
.sig-spacer{flex:1}
.mp{font-weight:bold;margin:4px 0}
.toolbar{position:fixed;top:12px;right:12px;display:flex;gap:8px;z-index:9999}
.tbtn{background:#B52278;color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:10.5pt;
  cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3);white-space:nowrap}
.tbtn:disabled{opacity:.6;cursor:default}
.dl-wrap{position:relative}
.dl-menu{display:none;position:absolute;top:calc(100% + 4px);right:0;background:#fff;border:1px solid #d7dfdb;
  border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.2);overflow:hidden;min-width:140px}
.dl-menu.open{display:block}
.dl-menu button{display:block;width:100%;text-align:left;background:#fff;color:#19221f;border:none;
  padding:9px 14px;font-size:10.5pt;cursor:pointer}
.dl-menu button:hover{background:#f6f9f7}
@media print{.toolbar{display:none}}
</style>
</head>
<body>
<div class="toolbar">
  <button class="tbtn" onclick="window.print()">🖨️ Басып шығару</button>
  <div class="dl-wrap">
    <button class="tbtn" id="btnDlToggle">📥 Жүктеу ▾</button>
    <div class="dl-menu" id="dlMenu">
      <button id="btnPdf">📄 PDF ретінде</button>
      <button id="btnXls">📊 Excel ретінде</button>
    </div>
  </div>
  <button class="tbtn" id="btnShare">📤 Бөлісу</button>
</div>

<div class="top-wrapper">
  <div class="top-ref">
    Приложение 26<br>к приказу Министра финансов<br>Республики Казахстан<br>от 20 декабря 2012 года № 562<br><br>
    <b>Форма 3-2</b>
  </div>
  <table class="doc-box">
    <tr><th>Номер документа</th><th>Дата составления</th></tr>
    <tr><td><b>${docNum}</b></td><td><b>${dateStr}</b></td></tr>
  </table>
  <div class="org-row">
    <span class="org-label">Организация (индивидуальный предприниматель)</span>
    <span class="org-name">Индивидуальный предприниматель "Kitapal Almaty"</span>
    <span class="iin-wrap">ИИН/БИН <span class="iin-val">771112301336</span></span>
  </div>
</div>

<h1>Накладная на отпуск запасов на сторону</h1>

<table class="mt">
  <tr>
    <th style="width:22%">Организация (индивидуальный предприниматель) - отправитель</th>
    <th style="width:22%">Организация (индивидуальный предприниматель) - получатель</th>
    <th style="width:20%">Ответственный за поставку (Ф.И.О.)</th>
    <th style="width:18%">Транспортная организация</th>
    <th style="width:18%">Товарно-транспортная накладная (номер, дата)</th>
  </tr>
  <tr>
    <td>ИП "Kitapal Almaty"</td>
    <td><b>${dist.company}</b></td>
    <td>${managerName}</td>
    <td></td>
    <td></td>
  </tr>
</table>

<table class="it">
  <thead>
    <tr>
      <th rowspan="3" style="width:4%">Номер по порядку</th>
      <th rowspan="3" style="width:30%">Наименование, характеристика</th>
      <th rowspan="3" style="width:13%">Номенклатурный номер</th>
      <th rowspan="3" style="width:5%">Единица измерения</th>
      <th colspan="2" style="width:12%">Количество</th>
      <th rowspan="3" style="width:13%">Цена за единицу, в KZT</th>
      <th rowspan="3" style="width:13%">Сумма с НДС, в KZT</th>
      <th rowspan="3" style="width:10%">Сумма НДС, в KZT</th>
    </tr>
    <tr><th>подлежит отпуску</th><th>отпущено</th></tr>
    <tr><th>5</th><th>6</th></tr>
    <tr><th>1</th><th>2</th><th>3</th><th>4</th><th></th><th></th><th>7</th><th>8</th><th>9</th></tr>
  </thead>
  <tbody>
    ${itemRows}
    <tr class="tr-tot">
      <td colspan="4" class="c"><b>Итого</b></td>
      <td class="c"><b>${totalQty}</b></td>
      <td class="c"><b>${totalQty}</b></td>
      <td></td>
      <td class="r"><b>${fmt(totalAmount)}</b></td>
      <td></td>
    </tr>
  </tbody>
</table>

<div class="propis">
  Всего отпущено количество запасов (прописью) &nbsp;<b><i>${qtyInWords}</i></b>
  &nbsp;&nbsp; на сумму (прописью), в KZT &nbsp;<b><i>${amtInWords}</i></b>
</div>

<div class="sig-wrap">
  <div class="sig-row">
    <span>Отпуск разрешил</span>
    <span class="sig-block">
      <span>Заведующий складом</span>
      <span class="sig-line">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
      <span>/</span>
      <span class="sig-line">Ибрагимов К.С.</span>
    </span>
    <span class="sig-spacer"></span>
    <span>По доверенности №____________ от "____"_____________ 20___ года</span>
  </div>
  <div class="sig-row">
    <span style="margin-left:60px">выданной</span>
    <span class="sig-line" style="min-width:200px">&nbsp;</span>
  </div>
  <div class="sig-row">
    <span>Главный бухгалтер</span>
    <span class="sig-block">
      <span class="sig-line">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
      <span>/</span>
      <span class="sig-line">Мырзабекова Ұ.М.</span>
    </span>
  </div>
  <div class="mp">М.П.</div>
  <div class="sig-row">
    <span>Отпустил</span>
    <span class="sig-block">
      <span class="sig-line">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
      <span>/</span>
      <span class="sig-line">${managerName}</span>
    </span>
    <span class="sig-spacer"></span>
    <span>Запасы получил</span>
    <span class="sig-block">
      <span class="sig-line">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
      <span>/</span>
      <span class="sig-line">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
    </span>
  </div>
</div>

<script>
(function(){
  var docName = 'Nakladnaya_${docNum}';

  function loadScript(src){
    return new Promise(function(resolve, reject){
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function downloadBlob(blob, filename){
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  }

  var nakladnayaItems = ${csvRowsJson};
  var nakladnayaTotalQty = ${totalQty};
  var nakladnayaTotalAmount = ${totalAmount};
  var CSV_SEP = ';';

  function csvEscape(v){
    var s = String(v);
    if (s.indexOf(CSV_SEP) !== -1 || s.indexOf('"') !== -1 || s.indexOf('\\n') !== -1) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function fmtMoney(v){
    var r = Math.round(v);
    var sign = r < 0 ? '-' : '';
    var digits = Math.abs(r).toString();
    return sign + digits.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ' ');
  }

  function buildExcelBlob(){
    var rows = [];
    rows.push([
      'Штрихкод','Наименование, характеристика','Количество ','Цена','% руч.'
    ].map(csvEscape).join(CSV_SEP));
    nakladnayaItems.forEach(function(it){
      rows.push([
        it.barcode, csvEscape(it.name), it.qty, fmtMoney(it.basePrice), it.discountPct
      ].join(CSV_SEP));
    });
    var csv = rows.join('\\r\\n');
    return new Blob(['\\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  }

  async function buildPdfBlob(){
    if (!window.jspdf) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    }
    var canvas = await html2canvas(document.body, { scale: 2 });
    var imgData = canvas.toDataURL('image/png');
    var pdf = new window.jspdf.jsPDF('p', 'mm', 'a4');
    var pageWidth = pdf.internal.pageSize.getWidth();
    var pageHeight = (canvas.height * pageWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight);
    return pdf.output('blob');
  }

  var dlToggle = document.getElementById('btnDlToggle');
  var dlMenu = document.getElementById('dlMenu');
  dlToggle.onclick = function(e){
    e.stopPropagation();
    dlMenu.classList.toggle('open');
  };
  document.addEventListener('click', function(){ dlMenu.classList.remove('open'); });

  document.getElementById('btnXls').onclick = function(){
    dlMenu.classList.remove('open');
    downloadBlob(buildExcelBlob(), docName + '.csv');
  };

  document.getElementById('btnPdf').onclick = async function(){
    dlMenu.classList.remove('open');
    var btn = dlToggle; var prevText = btn.textContent;
    btn.disabled = true; btn.textContent = '⏳ Дайындалып жатыр...';
    try {
      var blob = await buildPdfBlob();
      downloadBlob(blob, docName + '.pdf');
    } catch(e) {
      alert('PDF жасау кезінде қате шықты. Интернет байланысын тексеріп көріңіз.');
    } finally {
      btn.disabled = false; btn.textContent = prevText;
    }
  };

  document.getElementById('btnShare').onclick = async function(){
    var btn = this; var prevText = btn.textContent;
    btn.disabled = true; btn.textContent = '⏳ Дайындалып жатыр...';
    try {
      var blob = await buildPdfBlob();
      var file = new File([blob], docName + '.pdf', { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Накладная № ${docNum}' });
      } else {
        // Файлмен тікелей бөлісу қолдау көрсетілмейді (көбіне desktop браузерлерде) —
        // сондықтан PDF-ті бірден жүктеп аламыз, пайдаланушы оны қолмен бекітіп жібереді
        downloadBlob(blob, docName + '.pdf');
        if (navigator.share) {
          try {
            await navigator.share({ title: 'Накладная № ${docNum}', text: 'Накладная № ${docNum} — ${dist.company} (PDF файл жүктеліп алынды)' });
          } catch(shareErr) { /* пайдаланушы бас тартты — еленбейді */ }
        } else {
          alert('Бұл браузерде/құрылғыда файлмен тікелей бөлісу қолдау көрсетілмейді. PDF файл жүктеліп алынды — оны WhatsApp/Email арқылы қолмен бекітіп жіберуге болады.');
        }
      }
    } catch(e) {
      if (e && e.name !== 'AbortError') {
        alert('Бөлісу/жүктеу кезінде қате шықты. Интернет байланысын тексеріп, қайта көріңіз.');
      }
    } finally {
      btn.disabled = false; btn.textContent = prevText;
    }
  };
})();
</script>
</body></html>`;

    const win = window.open('', '_blank', 'width=960,height=720');
    if (win) { win.document.write(html); win.document.close(); }
  }

  deliverOrder(orderId: string): void {
    this.updateOrderStatus(orderId, 'delivered', 'Дистрибьютор тапсырысты алды');
  }
}
