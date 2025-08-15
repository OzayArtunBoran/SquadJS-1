import test from 'node:test';
import assert from 'node:assert/strict';
import EventEmitter from 'events';

import SeedThresholdWarn from '../seed-threshold-warn.js';

class MockRcon {
  constructor() {
    this.calls = [];
  }
  async warn(id, message) {
    this.calls.push({ id, message });
  }
}

class MockServer extends EventEmitter {
  constructor() {
    super();
    this.players = [];
    this.rcon = new MockRcon();
  }
  removeEventListener(event, listener) {
    this.removeListener(event, listener);
  }
}

const createPlayer = (id) => ({ eosID: String(id) });

// Test 1: 34->35 triggers warn and threshold becomes 35
test('warns on first threshold crossing', async () => {
  const server = new MockServer();
  for (let i = 0; i < 34; i++) server.players.push(createPlayer(i));
  const plugin = new SeedThresholdWarn(server, {}, {});
  await plugin.mount();
  server.players.push(createPlayer(34));
  server.emit('PLAYER_CONNECTED', {});
  await new Promise((r) => setImmediate(r));
  assert.equal(server.rcon.calls.length, 35);
  assert.equal(plugin.currentThreshold, 35);
});

// Test 2: 35->34->35 cycle does not warn again
test('does not warn when returning to previous threshold', async () => {
  const server = new MockServer();
  for (let i = 0; i < 34; i++) server.players.push(createPlayer(i));
  const plugin = new SeedThresholdWarn(server, {}, {});
  await plugin.mount();
  server.players.push(createPlayer(34));
  server.emit('PLAYER_CONNECTED', {});
  await new Promise((r) => setImmediate(r));
  const warnsAfterFirst = server.rcon.calls.length;
  server.players.pop();
  server.emit('PLAYER_DISCONNECTED', {});
  server.players.push(createPlayer(34));
  server.emit('PLAYER_CONNECTED', {});
  await new Promise((r) => setImmediate(r));
  assert.equal(server.rcon.calls.length, warnsAfterFirst);
});

// Test 3: 35->36 triggers new warn and threshold becomes 36
test('warns on next threshold crossing', async () => {
  const server = new MockServer();
  for (let i = 0; i < 34; i++) server.players.push(createPlayer(i));
  const plugin = new SeedThresholdWarn(server, {}, {});
  await plugin.mount();
  server.players.push(createPlayer(34));
  server.emit('PLAYER_CONNECTED', {});
  await new Promise((r) => setImmediate(r));
  server.players.push(createPlayer(35));
  server.emit('PLAYER_CONNECTED', {});
  await new Promise((r) => setImmediate(r));
  assert.equal(server.rcon.calls.length, 71);
  assert.equal(plugin.currentThreshold, 36);
});

// Test 4 & 5: Seed mode off resets threshold and no warn at >= seedGoal
test('resets when seed mode ends and stops warning', async () => {
  const server = new MockServer();
  for (let i = 0; i < 34; i++) server.players.push(createPlayer(i));
  const plugin = new SeedThresholdWarn(server, {}, {});
  await plugin.mount();
  // raise to 36
  server.players.push(createPlayer(34));
  server.emit('PLAYER_CONNECTED', {});
  await new Promise((r) => setImmediate(r));
  server.players.push(createPlayer(35));
  server.emit('PLAYER_CONNECTED', {});
  await new Promise((r) => setImmediate(r));
  // now push up to 44
  for (let i = 36; i < 44; i++) {
    server.players.push(createPlayer(i));
    server.emit('PLAYER_CONNECTED', {});
    await new Promise((r) => setImmediate(r));
  }
  const warnsBefore44 = server.rcon.calls.length;
  // at 44 players seed mode ends -> reset and no new warns
  assert.equal(plugin.currentThreshold, 34);
  assert.equal(server.rcon.calls.length, warnsBefore44);
});

// Test 6: custom messageTemplate interpolation
test('applies custom message template', async () => {
  const server = new MockServer();
  for (let i = 0; i < 34; i++) server.players.push(createPlayer(i));
  const plugin = new SeedThresholdWarn(
    server,
    { messageTemplate: 'Players: ${currentPlayerCount}/${seedGoal}', seedGoal: 50 },
    {}
  );
  await plugin.mount();
  server.players.push(createPlayer(34));
  server.emit('PLAYER_CONNECTED', {});
  await new Promise((r) => setImmediate(r));
  assert.equal(server.rcon.calls[0].message, 'Players: 35/50');
});

