import { OrderStatus } from './role';

export interface OrderItem {
  id?: number;
  order_id?: string;
  product_id: number;
  qty: number;
  unit_price: number;
  discount: number;
  amount: number;
  // joined from products for display
  name?: string;
  barcode?: string;
  publisher?: string;
}

export interface OrderHistory {
  status: OrderStatus;
  note: string;
  changed_at: string;
}

export interface Order {
  id: string;
  order_code: string | null;
  distributor_id: number;
  status: OrderStatus;
  created_at: string;
  items: OrderItem[];
  history: OrderHistory[];
  amount: number; // computed client-side from items
}
