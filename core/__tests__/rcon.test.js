import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'net';

import Rcon from '../rcon.js';

test('connecting twice quickly does not throw EISCONN', async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  const rcon = new Rcon({ host: '127.0.0.1', port, password: 'pass' });
  rcon.write = async () => {
    rcon.loggedin = true;
  };

  await assert.doesNotReject(async () => {
    await Promise.all([rcon.connect(), rcon.connect()]);
  });

  await rcon.disconnect();
  await new Promise((resolve) => server.close(resolve));
});
