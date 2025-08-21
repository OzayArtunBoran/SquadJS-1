import DiscordBasePlugin from './discord-base-plugin.js';
import mysql  from 'mysql2/promise'

export default class SquadLeaderBAN extends DiscordBasePlugin {
    static get description() {
        return (
            "The <code>Squad Leader BAN</code> is for servers that want to limit the amount of time a player can be squad leader."
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
            maximumWarnings: {
                required: false,
                description: 'The maximum amount of warnings a player can receive before being blacklisted.',
                default: 3,
                example: 3
            },
            action: {
                required: false,
                description: 'The action to take when a player is blacklisted.',
                default: "",
                example: 'kick'
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
        
        this.checkSquadLeaders = this.checkSquadLeaders.bind(this);
        this.warnedPlayers = new Map();
    }
    

    async mount() {
        this.server.on(`SQUAD_CREATED`, this.onSquadCreate);  
        this.interval = setInterval(this.checkSquadLeaders, 5000);
    }

    async unmount() {
        this.server.removeEventListener(`SQUAD_CREATED`, this.onSquadCreate);
        clearInterval(this.interval); // Zamanlayıcıyı durdur
    }

    

    async onSquadCreate(info) {
       

        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'poyraz',
            password: 'Dbr6_xfUcX',
            database: 'arthursquad'
        });
    
        const [rows] = await connection.execute('SELECT * FROM bans WHERE steamid = ? AND ban_end_date > CURRENT_TIMESTAMP', [info.player.steamID]);
        await connection.end();

        const banInfo = rows.length > 0 ? rows[0] : null;

        if (banInfo) {
            
            const banEndDate = new Date(banInfo.ban_end_date);

           
            const formattedDate = `${banEndDate.getDate()} . ${banEndDate.getMonth() + 1} . ${banEndDate.getFullYear()} `;
        
            this.server.rcon.execute(`AdminDisbandSquad ${info.player.teamID} ${info.player.squadID}`);
            this.server.rcon.warn(info.player.steamID, ` ${formattedDate} Tarihine kadar Lider Olamazsınız.`);
        
        }
    }

    async checkBanStatus(steamid){
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '',
            database: 'arthursquad'
        });
    
        const [rows] = await connection.execute('SELECT * FROM bans WHERE steamid = ? AND ban_end_date > CURRENT_TIMESTAMP', [steamid]);
        await connection.end();

        const banInfo = rows.length > 0 ? rows[0] : null;
        return banInfo;
    }

    
    async checkSquadLeaders() {
        // Oyuncu listesini al
        const players = await this.server.rcon.getListPlayers();
        
        for (const player of players) {
          // Liderlik banını kontrol et
          if (player.isLeader) {
            const banInfo = await this.checkBanStatus(player.steamID);
            if (banInfo) {
              // Uyarı süresini kontrol et
              const now = Date.now();
              const warningTime = this.warnedPlayers.get(player.steamID);


              
              if (warningTime && now - warningTime > 60000) { // 1 dakika geçmiş mi?
                // Oyuncuyu kickle
                
                this.server.rcon.execute(`AdminKick ${player.steamID} "SL Banı nedeniyle kicklendiniz."`);
                this.warnedPlayers.delete(player.steamID);
              } else if (!warningTime) {
                // Oyuncuyu uyar
                const banEndDate = new Date(banInfo.ban_end_date);

           
                const formattedDate = `${banEndDate.getDate()} . ${banEndDate.getMonth() + 1} . ${banEndDate.getFullYear()} `;
                this.server.rcon.warn(player.steamID, `${formattedDate} tarihine kadar SL olamazsınız. Eğer liderliği devretmezseniz 1 dakika içinde atılacaksınız!`);
                this.warnedPlayers.set(player.steamID, now); // Uyarı zamanını kaydet
              }
            }
          }
        }
      }
    




}
