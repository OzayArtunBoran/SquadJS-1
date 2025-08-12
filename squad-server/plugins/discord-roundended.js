import DiscordBasePlugin from './discord-base-plugin.js';

export default class DiscordRoundEnded extends DiscordBasePlugin {
  static get description() {
    return 'The <code>DiscordRoundEnded</code> plugin will send the round winner to a Discord channel.';
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      ...DiscordBasePlugin.optionsSpecification,
      channelID: {
        required: true,
        description: 'The ID of the channel to log round end events to.',
        default: '',
        example: '667741905228136459'
      },
      color: {
        required: false,
        description: 'The color of the embed.',
        default: 16761867
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.onRoundEnd = this.onRoundEnd.bind(this);
  }

  async mount() {
    this.server.on('ROUND_ENDED', this.onRoundEnd);
  }

  async unmount() {
    this.server.removeEventListener('ROUND_ENDED', this.onRoundEnd);
  }

  async onRoundEnd(info) {
    if (!info.winner || !info.loser) {
      await this.sendDiscordMessage({
        embed: {
          title: 'Round Bitti',
          description: 'Bu maç berabere bitti.',
          color: this.options.color,
          timestamp: info.time.toISOString()
        }
      });
      return;
    }

    await this.sendDiscordMessage({
      embed: {
        title: 'Round Bitti',
        description: `${info.winner.layer} - ${info.winner.level}`,
        color: this.options.color,
        fields: [
          {
            name: `Team ${info.winner.team} Kazandı`,
            value: `${info.winner.subfaction}\n ${info.winner.faction}\n ${info.winner.tickets} biletle kazandı.`
          },
          {
            name: `Team ${info.loser.team} Kaybetti`,
            value: `${info.loser.subfaction}\n ${info.loser.faction}\n ${info.loser.tickets} biletle kaybetti.`
          },
          {
            name: 'Ticket Farkı',
            value: `${info.winner.tickets - info.loser.tickets}.`
          }
        ],
        footer: {
          text: 'Oyun sona erdi.'
        },
        timestamp: info.time.toISOString()
      }
    });
  }
}
