export interface Product {
  id: number;
  name: string;
  barcode: string;
  publisher: string;
  category: string;
  base_price: number;
  discount_override: number | null;
}
