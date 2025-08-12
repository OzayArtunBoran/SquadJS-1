import GraphQLRequest from 'graphql-request';

import DiscordBasePlugin from './discord-base-plugin.js';

const { request, gql } = GraphQLRequest;

export default class CBLInfo extends DiscordBasePlugin {
  static get description() {
    return (
      'The <code>CBLInfo</code> plugin alerts admins when a harmful player is detected joining their server based ' +
      'on data from the <a href="https://communitybanlist.com/">Community Ban List</a>.'
    );
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      ...DiscordBasePlugin.optionsSpecification,
      channelID: {
        required: true,
        description: 'The ID of the channel to alert admins through.',
        default: '',
        example: '667741905228136459'
      },
      threshold: {
        required: false,
        description:
          'Admins will be alerted when a player has this or more reputation points. For more information on ' +
          'reputation points, see the ' +
          '<a href="https://communitybanlist.com/faq">Community Ban List\'s FAQ</a>',
        default: 6
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.onPlayerConnected = this.onPlayerConnected.bind(this);
  }

  async mount() {
    this.server.on('PLAYER_CONNECTED', this.onPlayerConnected);
  }

  async unmount() {
    this.server.removeEventListener('PLAYER_CONNECTED', this.onPlayerConnected);
  }

  async onPlayerConnected(info) {
    try {
      const data = await request(
        'https://communitybanlist.com/graphql',
        gql`
          query Search($id: String!) {
            steamUser(id: $id) {
              id
              name
              avatarFull
              reputationPoints
              riskRating
              reputationRank
              lastRefreshedInfo
              lastRefreshedReputationPoints
              lastRefreshedReputationRank
              activeBans: bans(orderBy: "created", orderDirection: DESC, expired: false) {
                edges {
                  cursor
                  node {
                    id
                  }
                }
              }
              expiredBans: bans(orderBy: "created", orderDirection: DESC, expired: true) {
                edges {
                  cursor
                  node {
                    id
                  }
                }
              }
            }
          }
        `,
        { id: info.player.steamID }
      );

      if (!data.steamUser) {
        this.verbose(
          2,
          `Oyuncu, ${info.player.name} (Steam ID: ${info.player.steamID}) CBL'de listelenmemis.` //translate turkish
          
        );
        return;
      }

      if (data.steamUser.reputationPoints < this.options.threshold) {
        this.verbose(
          2,
          `Oyuncu ${info.player.name} (Steam ID: ${info.player.steamID}) eşik değerinin altında bir itibara sahiptir.`
        );
        return;
      }

      await this.sendDiscordMessage({
        embed: {
          title: `${info.player.name} potansiyel olarak zararlı bir oyuncu!`,
          author: {
            name: 'Community Ban List',
            url: 'https://communitybanlist.com/',
            icon_url: 'https://communitybanlist.com/static/media/cbl-logo.caf6584e.png'
          },
          thumbnail: {
            url: data.steamUser.avatarFull
          },
          description: `[${info.player.name}](https://communitybanlist.com/search/${info.player.steamID}) CBL'de ${data.steamUser.reputationPoints} itibara sahiptir ve bu nedenle potansiyel olarak zararlı bir oyuncudur.`,
          fields: [
            {
              name: 'Itibar Puanları',
              value: `${data.steamUser.reputationPoints} (${
                data.steamUser.reputationPointsMonthChange || 0
              } bu ay)`,
              inline: true
            },
            {
              name: 'Risk Oranı',
              value: `${data.steamUser.riskRating} / 10`,
              inline: true
            },
            {
              name: 'İtibar Sıralaması',
              value: `#${data.steamUser.reputationRank}`,
              inline: true
            },
            {
              name: 'Aktif Yasaklar',
              value: `${data.steamUser.activeBans.edges.length}`,
              inline: true
            },
            {
              name: 'Süresi Dolmuş Yasaklar',
              value: `${data.steamUser.expiredBans.edges.length}`,
              inline: true
            }
          ],
          color: '#ffc40b',
          timestamp: info.time.toISOString(),
          footer: {
            text: 'Arthur ve  Community Ban List tarafından sağlandı.',
          }
        }
      });
    } catch (err) {
      this.verbose(
        1,
        `Oyuncu için Topluluk Yasak Listesi verileri alınamadı ${info.name} (Steam ID: ${info.steamID}): `,
        err
      );
    }
  }
}
