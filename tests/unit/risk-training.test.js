jest.mock('child_process', () => ({ execFile: jest.fn() }));
jest.mock('../../src/services/risk-model', () => ({ reloadModel: jest.fn() }));
const { execFile } = require('child_process');
const { trainModel, isTraining } = require('../../src/services/risk-training');
afterEach(() => { delete process.env.VERCEL; jest.clearAllMocks(); });
test('hosted training is disabled before spawning Python', async () => {
  process.env.VERCEL = '1';
  await expect(trainModel()).rejects.toMatchObject({ status: 409 });
  expect(execFile).not.toHaveBeenCalled();
});
test('training rejects concurrent requests and clears lock after failure', async () => {
  let complete;
  execFile.mockImplementation((_python, _args, _options, callback) => { complete = callback; });
  const first = trainModel();
  expect(isTraining()).toBe(true);
  await expect(trainModel()).rejects.toMatchObject({ status: 409 });
  const rejected = expect(first).rejects.toThrow('Python is unavailable');
  complete({ code: 'ENOENT' }, '');
  await rejected;
  expect(isTraining()).toBe(false);
});
test('training has a timeout, no shell, and reloads only valid completion', async () => {
  execFile.mockImplementation((_python, _args, options, callback) => {
    expect(options.timeout).toBe(180000);
    expect(options.shell).toBeUndefined();
    callback(null, JSON.stringify({ version: 'test', status: 'completed' }));
  });
  await expect(trainModel()).resolves.toMatchObject({ status: 'completed' });
  expect(require('../../src/services/risk-model').reloadModel).toHaveBeenCalledTimes(1);
});
