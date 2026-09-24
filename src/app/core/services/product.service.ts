import { Injectable, signal } from '@angular/core';
import { supabase } from '../supabase.client';
import { Product } from '../models/product';

@Injectable({ providedIn: 'root' })
export class ProductService {
  coverUrl(path?: string | null): string | undefined {
    return path ? supabase.storage.from('book-covers').getPublicUrl(path).data.publicUrl : undefined;
  }

  async saveCover(id: number, file: File | null): Promise<string | null> {
    const previous = this.products().find(p => p.id === id)?.cover_path;
    let path: string | null = null;
    if (file) {
      const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png' } as Record<string, string>)[file.type];
      if (!extension || file.size > 5 * 1024 * 1024) return 'JPG немесе PNG суретін таңдаңыз (5 МБ дейін).';
      path = `${id}/${crypto.randomUUID()}.${extension}`;
      const upload = await supabase.storage.from('book-covers').upload(path, file, { contentType: file.type, upsert: false });
      if (upload.error) return 'Сурет жүктелмеді. Қайта көріңіз.';
    }
    const { error } = await supabase.rpc('set_product_cover', { product_id: id, object_path: path });
    if (error) {
      if (path) await supabase.storage.from('book-covers').remove([path]);
      return 'Сурет сақталмады. Қайта көріңіз.';
    }
    if (previous && previous !== path) await supabase.storage.from('book-covers').remove([previous]);
    await this.load();
    return null;
  }

  readonly products = signal<Product[]>([]);

  async load(): Promise<void> {
    const pageSize = 1000;
    const all: Product[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('products').select('*').order('name').order('id').range(from, from + pageSize - 1);
      if (error) return;
      all.push(...((data ?? []) as Product[]));
      if (!data || data.length < pageSize) break;
    }
    this.products.set(all);
  }

  async create(input: Pick<Product, 'name' | 'barcode' | 'publisher' | 'category' | 'base_price'>): Promise<string | null> {
    const { error } = await supabase.from('products').insert({ ...input, discount_override: null });
    if (error) return error.code === '23505' ? 'Бұл штрихкодпен кітап бұрыннан бар.' : error.message;
    await this.load();
    return null;
  }

  async remove(id: number): Promise<string | null> {
    // The foreign key from order_items prevents deleting books used in orders.
    const { data, error } = await supabase.from('products').delete()
      .eq('id', id).neq('barcode', 'OPENING-BALANCE').select('id');
    if (error) return error.code === '23503'
      ? 'Бұл кітап тапсырыстарда қолданылған, сондықтан жоюға болмайды.'
      : error.message;
    if (!data?.length) return 'Кітап жойылмады: жоюға рұқсат жоқ немесе кітап табылмады.';
    this.products.update(products => products.filter(product => product.id !== id));
    return null;
  }

  async update(id: number, patch: Partial<Product>): Promise<string | null> {
    const { error } = await supabase.from('products').update(patch).eq('id', id);
    if (error) return error.message;
    await this.load();
    return null;
  }
}
