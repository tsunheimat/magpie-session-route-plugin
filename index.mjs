import { PLUGIN_ID } from './lib/config.mjs';
import { startService } from './lib/lifecycle.mjs';

// Magpie owns this process and its other plugins. There is no process-wide
// shutdown hook here: the service's configuration watchdog owns revocation.
export default Object.freeze({
  id: PLUGIN_ID,
  async server(input, options) {
    await startService(input, options);
    return {};
  },
});
