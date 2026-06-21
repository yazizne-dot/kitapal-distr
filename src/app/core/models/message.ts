export interface DistMessage {
  id: number;
  distributor_id: number;
  from_profile_id: string | null;
  body: string;
  created_at: string;
}
