// Personal preset over the real CLI; shared configuration is unchanged.
import { fileURLToPath } from 'node:url';
import { applyPersonalImagePreset } from '../lib/personalPreset.js';
const { REGISTRY } = await import('../lib/providers/registry.js');
const oauth = REGISTRY.find(provider => provider.id === 'oauth');
if (!oauth.models.some(model => model.id === 'gpt-6.1-sol')) {
  const template = oauth.models.find(model => model.id === 'gpt-5.6-sol');
  oauth.models.push({ id: 'gpt-6.1-sol', kind: 'image', supports: { ...template.supports } });
}
const args = applyPersonalImagePreset(process.argv.slice(2));
if (args[0] === 'serve') {
  // Keep the process-local catalog in the server, as in the prior generation bootstrap.
  const { startServer } = await import('../server.js');
  await startServer();
} else {
  process.argv = [process.argv[0], fileURLToPath(new URL('../bin/ima2.js', import.meta.url)), ...args];
  await import('../bin/ima2.js');
}
