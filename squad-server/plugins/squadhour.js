import DiscordBasePlugin from './discord-base-plugin.js';
import BM from "@leventhan/battlemetrics";
import axios from 'axios';
export default class SquadLeaderHL extends DiscordBasePlugin {
    static get description() {
        return (
            "The <code>Squad Leader Hour Limit</code> is for servers that want to limit the amount of time a player can be squad leader."
        );
    }

    static get defaultEnabled() {
        return true;
    }

    static get optionsSpecification() {
        return {
            ...DiscordBasePlugin.optionsSpecification,
            minimumLimit: {
                required: true,
                description: 'The minimum amount of time a player can be squad leader.',
                default: 0,
                example: 0
            },
            channelIDs: {
                required: true,
                description: 'The ID of the channel to log admin broadcasts to.',
                default: '',
                example: '1068656396758941775'
            },
            manualWhitelist: {
                required: true,
                description: 'A list of Steam IDs that are exempt from the hour limit.',
                default: [],
                example: ['76561198000000000']
            },
            blacklist: {
                required: true,
                description: 'A list of Steam IDs that are not allowed to be squad leader.',
                default: [],
                example: ['76561198000000000']
            },
            embed: {
                required: false,
                description: 'The embed to send to Discord.',
                default: {
                    title: 'Squad Leader Hour Limit',
                    footer: {
                        text: '',
                        url: "",
                    },
                    color: 16761867,
                    image: { url: "" }
                },
                example: {},
            },
            keys: {
                required: true,
                description: 'The keys to use for the axios.',
                default: {
                    steam: '8285F502AE10EFFABDE6FC3E8C5EF704',
                    battlemetrics: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbiI6IjRmNmIzMGIzNGMyZWQxNTMiLCJpYXQiOjE3NDI1MDMwMTIsIm5iZiI6MTc0MjUwMzAxMiwiaXNzIjoiaHR0cHM6Ly93d3cuYmF0dGxlbWV0cmljcy5jb20iLCJzdWIiOiJ1cm46dXNlcjo2MzM2OTAifQ.RoRfnfRzPD-t6-0adIO7wkIlxqwX-f-N1mGH8t1LU_w'
                },
                example: {},
            },
            maximumWarnings: {
                required: true,
                description: 'The maximum amount of warnings a player can receive before being blacklisted.',
                default: 2,
                example: 2
            },
            action: {
                required: false,
                description: 'The action to take when a player is blacklisted.',
                default: "",
                example: 'kick'
            },
            banDuration: {
                required: false,
                description: 'The duration of the ban in minutes.',
                default: "1h",
                example: ""
            },
            BMserverID: {
                required: true,
                description: 'The ID of the server on BattleMetrics.',
                default: "",
                example: ""
            }
        };
    }

    constructor(server, options, connectors) {
        super(server, options, connectors);

        this.battle = null
        this.gameID = 393380;
        this.playerCache = [];
        this.blackList = [];
        this.description = "";
        this.status = true;
        this.onSquadCreate = this.onSquadCreate.bind(this);
        this.onChatMessage = this.onChatMessage.bind(this);
    }

    async mount() {
        this.server.on(`SQUAD_CREATED`, this.onSquadCreate);
        this.server.on(`CHAT_MESSAGE`, this.onChatMessage);
        this.battle = new BM({
            token: this.options.keys.battlemetrics,
            serverID: this.options.BMserverID,
            game: "Squad"
        });
    }

    async unmount() {
        this.server.removeEventListener(`SQUAD_CREATED`, this.onSquadCreate);
        this.server.removeEventListener(`CHAT_MESSAGE`, this.onChatMessage);

    }

    async onChatMessage(info) {
        if (info.chat == "ChatAdmin") {
            if (info.message === "!slstatus") {
                this.status = !this.status;
                this.server.rcon.warn(info.player.steamID, `Squad Leader Hour Limit is now ${this.status ? "enabled" : "disabled"}.`);
            }
        }
    }

    async onSquadCreate(info) {
        let message = '';
        info.steamID = info.player.steamID;
        if (this.status) {
            if (this.blackList.includes(info.steamID) || this.options.blacklist.includes(info.steamID)) return this.server.rcon.warn(info.steamID, "Squad Lider olmanız bu sunucuda yasaktır. Nedenini öğrenmek için : discord.blackowls.net , #📞・admin-i̇letişim ");
            const player = this.playerCache.find(x => x.steamID === info.steamID);
            if (this.options.manualWhitelist.includes(info.steamID)) return;
            const { playTime, isPassed } = await this.isPlayerPassedBarrier(info.steamID);
            if (!isPassed) {
                this.server.rcon.execute(`AdminDisbandSquad ${info.player.teamID} ${info.player.squadID}`);
                this.server.rcon.warn(info.player.steamID, `Minimum saat limiti olan ${this.options.minimumLimit} saate ulaşamadığınız için mangadan atıldınız.`);
                message = `${info.player.name}, minimum saat limiti olan ${this.options.minimumLimit} saate ulaşamadığı için takımdan atıldı.`;
                if (player?.warning >= this.options.maximumWarnings) {
                    this.blackList.push(info.steamID);
                    if (this.options.action) {
                        this.options.action ? this.options.action === "AdminBan" ? this.server.rcon.ban(info.player.steamID, this.options.banDuration ? this.options.banDuration : "1D", "Maksimum uyarı sayısına ulaştınız! Destek için discord.blackowls.net , #admin-i̇letişim") : this.server.rcon.execute(`${this.options.action} ${info.player.steamID}`) : null;
                        this.sendDiscordMessage({
                            content: `${info.player.name}, maksimum uyarı sayısına ulaştığı için ${this.options.action ? this.options.action + ' edildi' : '(hiçbir işlem yapılmadı)'}.`,
                        });
                    }
                } else {
                    player ? player.warning++ : this.playerCache.push({ steamID: info.steamID, warning: 1 });
                }
            } else {
                message = `${info.player.name}, ${playTime} saatlik oyun süresiyle lider olabilecek kadar yeterli oyun süresine sahip.`;
            }
            this.sendDiscordMessage({
                content: message,
            });
        }
    }

    async isPlayerPassedBarrier(steamID) {
        const steamAPI = `http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${this.options.keys.steam}&steamid=${steamID}&format=json`;
        const steamRESP = await axios.get(steamAPI);
        const games = steamRESP?.data?.response?.games ? steamRESP.data.response.games : null;
        if (!games) {
            this.description = "Oyuncu profili gizli. BM Kaydina bakiliyor...";
            const time = await this.getBattlemetricsHours(steamID);
            return { playTime: time, isPassed: (time > 30) };
        }
        const game = games.find(x => x.appid === this.gameID);
        return game ? { playTime: ((game.playtime_forever / 60)), isPassed: ((game.playtime_forever / 60) > this.options.minimumLimit) } : { playTime: 0, isPassed: false };
    }


    async getBattlemetricsHours(steamID) {

        const getBattlemetricsID = await this.getBattlemetricsID(steamID);
        if (getBattlemetricsID) {
            const BMInfo = await this.battle.getServerPlayerInfo(getBattlemetricsID);
            if (BMInfo) {
                return Math.floor(BMInfo.data.attributes.timePlayed / 3600);
            } else {
                // no battlemetrics info so return 0
                return 0;
            }
        } else {
            // no battlemetrics ID so return 0
            console.log("no battlemetrics id");
            return 0;
        }

    }

    async getBattlemetricsID(steamID) {
        const playerBattleMetrics = await this.battle.getPlayerInfoBy("steamID", steamID);
        if (playerBattleMetrics) {
            // battlemetrics ID found so return it back to main process
            return playerBattleMetrics?.data[0]?.relationships.player.data.id;
        }
        return null;
    }




}
