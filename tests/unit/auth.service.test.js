process.env.JWT_SECRET = 'unit-access-secret';
process.env.JWT_REFRESH_SECRET = 'unit-refresh-secret';
jest.mock('../../src/utils/prisma', () => ({
  user: {
    findUnique: jest.fn(),
    update: jest.fn()
  }
}));

const bcrypt = require('bcryptjs');
const prisma = require('../../src/utils/prisma');
const service = require('../../src/services/auth');

describe('auth service', () => {
  test('logs in and rotates refresh tokens', async () => {
    const password = await bcrypt.hash('secret', 4);
    const user = {
      id: 'user-1', name: 'Test User', email: 'test@example.com', password, roleId: 'role-1',
      role: { name: 'ADMIN', permissions: [{ permission: { code: 'dashboard:read' } }] }
    };
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.user.update.mockResolvedValue(user);
    const result = await service.login({ email: user.email, password: 'secret' });
    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.user.role.permissions).toContain('dashboard:read');
    expect(prisma.user.update).toHaveBeenCalled();
  });

  test('rejects bad credentials', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.login({ email: 'none@example.com', password: 'bad' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401 });
  });
});
