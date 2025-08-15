import BasePlugin from './base-plugin.js';

/**
 * Plugin that warns all players when population crosses thresholds during seed mode.
 */
export default class SeedThresholdWarn extends BasePlugin {
  static get description() {
    return (
      'The <code>SeedThresholdWarn</code> plugin warns all players as the server population grows during seeding. ' +
      'It sends a warning once for each new player count threshold while the server is in seed mode.'
    );
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      initialThreshold: {
        required: false,
        description: 'Starting player count threshold for warnings.',
        default: 34
      },
      seedGoal: {
        required: false,
        description: 'Player count at which seeding is considered complete.',
        default: 44
      },
      messageTemplate: {
        required: false,
        description: 'Template for warning messages.',
        default:
          'Aramıza biri daha katıldı, Seed bitmesine ${currentPlayerCount} / ${seedGoal}'
      },
      cooldownMs: {
        required: false,
        description: 'Minimum time between warnings in milliseconds.',
        default: 0
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.currentThreshold = this.options.initialThreshold;
    this.lastWarnedAtCount = undefined;
    this.lastWarnAt = undefined;
    this.seedActive = false;

    this.onPlayerConnected = this.onPlayerConnected.bind(this);
    this.onPlayerDisconnected = this.onPlayerDisconnected.bind(this);
    this.onNewGame = this.onNewGame.bind(this);
  }

  async mount() {
    this.seedActive = this.isSeedMode();

    this.server.on('PLAYER_CONNECTED', this.onPlayerConnected);
    this.server.on('PLAYER_DISCONNECTED', this.onPlayerDisconnected);
    this.server.on('NEW_GAME', this.onNewGame);
  }

  async unmount() {
    this.server.removeEventListener('PLAYER_CONNECTED', this.onPlayerConnected);
    this.server.removeEventListener('PLAYER_DISCONNECTED', this.onPlayerDisconnected);
    this.server.removeEventListener('NEW_GAME', this.onNewGame);
  }

  isSeedMode() {
    return this.server.players.length < this.options.seedGoal;
  }

  resetState() {
    this.currentThreshold = this.options.initialThreshold;
    this.lastWarnedAtCount = undefined;
    this.lastWarnAt = undefined;
  }

  handleSeedModeChange() {
    const seedMode = this.isSeedMode();
    if (seedMode !== this.seedActive) {
      this.resetState();
      this.seedActive = seedMode;
    }
  }

  async warnAll(message) {
    for (const player of this.server.players) {
      await this.server.rcon.warn(player.eosID, message);
    }
  }

  async onPlayerConnected() {
    this.handleSeedModeChange();
    if (!this.seedActive) return;

    const currentPlayerCount = this.server.players.length;

    if (
      currentPlayerCount > this.currentThreshold &&
      currentPlayerCount <= this.options.seedGoal &&
      this.lastWarnedAtCount !== currentPlayerCount &&
      (!this.lastWarnAt || Date.now() - this.lastWarnAt >= this.options.cooldownMs)
    ) {
      const message = this.options.messageTemplate
        .replace('${currentPlayerCount}', currentPlayerCount)
        .replace('${seedGoal}', this.options.seedGoal);
      await this.warnAll(message);
      this.currentThreshold = currentPlayerCount;
      this.lastWarnedAtCount = currentPlayerCount;
      this.lastWarnAt = Date.now();
    }
  }

  async onPlayerDisconnected() {
    this.handleSeedModeChange();
  }

  onNewGame() {
    this.resetState();
    this.seedActive = this.isSeedMode();
  }
}

