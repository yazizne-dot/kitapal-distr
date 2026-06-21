import { Role } from './role';

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  distributor_id: number | null;
}
