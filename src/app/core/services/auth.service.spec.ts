import { loginToEmail } from './auth.service';

describe('loginToEmail', () => {
  it('maps a short login to the kitapal email', () => {
    expect(loginToEmail('admin')).toBe('admin@kitapal.kz');
    expect(loginToEmail('  Astana ')).toBe('astana@kitapal.kz');
  });
  it('passes a full email through unchanged', () => {
    expect(loginToEmail('admin@kitapal.kz')).toBe('admin@kitapal.kz');
  });
});
