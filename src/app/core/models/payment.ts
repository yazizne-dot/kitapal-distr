export interface Payment {
  id: number;
  distributor_id: number;
  amount: number;
  paid_at: string;
  note: string;
}
