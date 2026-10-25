import { describe, expect, it, vi } from 'vitest';
import { checkSubdomainAvailability } from './subdomain-availability.js';

const free = () => Promise.resolve(false);
const taken = () => Promise.resolve(true);

describe('checkSubdomainAvailability', () => {
  it('reports the first format issue with the contract message, without a lookup', async () => {
    const lookup = vi.fn(free);
    expect(await checkSubdomainAvailability('ab', lookup)).toEqual({
      subdomain: 'ab',
      available: false,
      reason: 'invalid',
      message: 'Tên miền con cần ít nhất 3 ký tự',
    });
    expect(await checkSubdomainAvailability('Nha Khoa', lookup)).toMatchObject({
      subdomain: 'nha khoa',
      reason: 'invalid',
      message:
        'Chỉ dùng chữ thường không dấu, số và dấu gạch ngang; không bắt đầu hay kết thúc bằng gạch ngang',
    });
    expect(await checkSubdomainAvailability('nha--khoa', lookup)).toMatchObject({
      reason: 'invalid',
      message: 'Không dùng hai dấu gạch ngang liền nhau',
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('reports reserved names before looking them up', async () => {
    const lookup = vi.fn(free);
    expect(await checkSubdomainAvailability('WWW', lookup)).toEqual({
      subdomain: 'www',
      available: false,
      reason: 'reserved',
      message: 'Tên này được hệ thống giữ lại, hãy chọn tên khác',
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('looks up the normalized subdomain and reports it as taken', async () => {
    const lookup = vi.fn(taken);
    expect(await checkSubdomainAvailability(' SmileCare ', lookup)).toEqual({
      subdomain: 'smilecare',
      available: false,
      reason: 'taken',
      message: 'Tên miền con này đã có người dùng',
    });
    expect(lookup).toHaveBeenCalledWith('smilecare');
  });

  it('reports a free subdomain as available with no message', async () => {
    expect(await checkSubdomainAvailability('smile-care-2', free)).toEqual({
      subdomain: 'smile-care-2',
      available: true,
      reason: null,
      message: null,
    });
  });
});
