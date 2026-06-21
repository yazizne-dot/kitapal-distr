import { Injectable, signal } from '@angular/core';
import { supabase } from '../supabase.client';
import { Order, OrderItem } from '../models/order';
import { OrderStatus } from '../models/role';

export function decideStatus(debt: number, amount: number, creditLimit: number): OrderStatus {
  return debt + amount > creditLimit ? 'draft' : 'pending';
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  readonly orders = signal<Order[]>([]);

  async load(): Promise<void> {
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_code, distributor_id, status, created_at, ' +
              'order_items(id, product_id, qty, unit_price, discount, amount, products(name, barcode, publisher)), ' +
              'order_history(status, note, changed_at)')
      .order('created_at', { ascending: false });
    if (error || !data) return;
    this.orders.set(data.map((o: any) => ({
      id: o.id, order_code: o.order_code, distributor_id: o.distributor_id,
      status: o.status, created_at: o.created_at,
      items: (o.order_items ?? []).map((i: any) => ({
        id: i.id, product_id: i.product_id, qty: i.qty, unit_price: i.unit_price,
        discount: i.discount, amount: i.amount,
        name: i.products?.name, barcode: i.products?.barcode, publisher: i.products?.publisher,
      })) as OrderItem[],
      history: (o.order_history ?? []).map((h: any) => ({
        status: h.status, note: h.note, changed_at: h.changed_at })),
      amount: (o.order_items ?? []).reduce((s: number, i: any) => s + Number(i.amount), 0),
    })) as Order[]);
  }

  async create(
    distributorId: number,
    items: { productId: number; qty: number; unitPrice: number; discount: number }[],
    status: OrderStatus,
  ): Promise<string | null> {
    const { data: order, error } = await supabase
      .from('orders').insert({ distributor_id: distributorId, status }).select('id').single();
    if (error || !order) return error?.message ?? 'order insert failed';
    const rows = items.map((i) => ({
      order_id: order.id, product_id: i.productId, qty: i.qty,
      unit_price: i.unitPrice, discount: i.discount,
    }));
    const { error: iErr } = await supabase.from('order_items').insert(rows);
    if (iErr) return iErr.message;
    await this.addHistory(order.id, status,
      status === 'draft' ? 'Лимиттен асқандықтан черновик болып сақталды' : 'Дистрибьютор тапсырыс жіберді');
    await this.load();
    return null;
  }

  async setStatus(orderId: string, status: OrderStatus, note: string): Promise<string | null> {
    const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
    if (error) return error.message;
    await this.addHistory(orderId, status, note);
    await this.load();
    return null;
  }

  private async addHistory(orderId: string, status: OrderStatus, note: string): Promise<void> {
    await supabase.from('order_history').insert({ order_id: orderId, status, note });
  }
}
