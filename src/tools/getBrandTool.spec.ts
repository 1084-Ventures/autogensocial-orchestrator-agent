import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getBrandTool } from './getBrandTool';
import { components } from '../generated/v2/models';

vi.mock('../../clients/cosmosClient', () => ({
  getBrandsContainer: () => ({
    items: {
      query: () => ({
        fetchAll: async () => ({ resources: [{ id: 'brand1', name: 'Test Brand' }] })
      })
    }
  })
}));

describe('getBrandTool', () => {
  it('returns a brand when found', async () => {
    const result = await getBrandTool.execute({ brandId: 'brand1' });
    expect(result).toEqual({ brand: { id: 'brand1', name: 'Test Brand' } });
  });

  it('returns null when brand not found', async () => {
    vi.mocked(require('../../clients/cosmosClient').getBrandsContainer).mockReturnValueOnce({
      items: {
        query: () => ({ fetchAll: async () => ({ resources: [] }) })
      }
    });
    const result = await getBrandTool.execute({ brandId: 'notfound' });
    expect(result).toEqual({ brand: null });
  });
});
