export interface Distributor {
  id: number;
  company: string;
  city: string;
  manager_id: string | null;
  discount: number;
  credit_limit: number;
  phone: string;
}

// Shape returned by the distributor_stats view
export interface DistributorStats {
  distributor_id: number;
  company: string;
  city: string;
  credit_limit: number;
  discount: number;
  achieved: number;
  target: number;
  debt: number;
  remaining_limit: number;
}
