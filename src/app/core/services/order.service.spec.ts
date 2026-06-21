import { decideStatus } from './order.service';

describe('decideStatus', () => {
  it('is draft when the order pushes debt over the credit limit', () => {
    expect(decideStatus(900_000, 200_000, 1_000_000)).toBe('draft');
  });
  it('is pending when within the limit', () => {
    expect(decideStatus(100_000, 200_000, 1_000_000)).toBe('pending');
  });
});
