import DiscordBasePlugin from './discord-base-plugin.js';
import mysql from 'mysql2/promise';


export default class TimeTracker extends DiscordBasePlugin {
    static get description() {
        return (
            "The <code>Squad Time Tracker</code> plugin tracks the time each player spends on the server."
        );
    }

    static get defaultEnabled() {
        return true;
    }

    static get optionsSpecification() {
        return {
            ...DiscordBasePlugin.optionsSpecification,
            // veritabani: {
            //     required: true,
            //     description: 'The database connection configuration.',
            //     default: {
            //         host: 'localhost',
            //         user: 'artun',
            //         password: 'artun',
            //         database: 'whitelists'
            //     }
            // }
        };
    }

    constructor(server, options, connectors) {
        super(server, options, connectors);

        this.db = null; // Will hold our database connection
        this.onPlayerConnected = this.onPlayerConnected.bind(this);
        this.onPlayerDisconnected = this.onPlayerDisconnected.bind(this);
        this.onRoundEnd = this.onRoundEnd.bind(this);
        this.scoreUpdateInterval = null;
    }

    async mount() {
        this.db = await mysql.createConnection(
            {
                host: 'localhost',
                user: 'root',
                password: '',
                database: 'whitelists'

            }

        );
        this.server.on('ROUND_ENDED', this.onRoundEnd);
        this.server.on('PLAYER_CONNECTED', this.onPlayerConnected);
        this.server.on('PLAYER_DISCONNECTED', this.onPlayerDisconnected);
        this.startScoreUpdateInterval();
    }

    async unmount() {
        this.server.removeEventListener('ROUND_ENDED', this.onRoundEnd);
        this.server.removeEventListener('PLAYER_CONNECTED', this.onPlayerConnected);
        this.server.removeEventListener('PLAYER_DISCONNECTED', this.onPlayerDisconnected);

        if (this.db) {
            await this.db.end();
        }

        this.stopScoreUpdateInterval();
    }

    startScoreUpdateInterval() {
        if (this.scoreUpdateInterval) clearInterval(this.scoreUpdateInterval);
        this.scoreUpdateInterval = setInterval(() => this.updateScoresAndReset(), 300000); // 5 minutes
    }

    stopScoreUpdateInterval() {
        if (this.scoreUpdateInterval) clearInterval(this.scoreUpdateInterval);
    }

    async onPlayerConnected(info) {
        console.log("onPlayerConnected");
        const query = `
            INSERT INTO PlayerActivities (SteamID, EOSID, IPAddress, SessionStartTime, LastLogin)
            VALUES (?, ?, ?, NOW(), NOW())
            ON DUPLICATE KEY UPDATE LastLogin=NOW(), SessionStartTime=NOW();
        `;
        console.log("BİR OYUNCU BAGLANDI", info.player.steamID, "   ", info.eosID, "   ", info.ip)
        await this.db.execute(query, [info.player.steamID, info.eosID, info.ip]);

    }



    async onPlayerDisconnected(info) {
        try {
            const queryStartTime = `
                SELECT SessionStartTime FROM playeractivities WHERE SteamID = ? OR EOSID = ? LIMIT 1;
            `;

            const [rows] = await this.db.query(queryStartTime, [info.steamID, info.eosID]);

            if (rows.length > 0) {
                const sessionStartTime = rows[0].SessionStartTime;
                const response = await this.server.rcon.execute('ShowCurrentMap');
                console.log(response);
                const currentLayer = response;



                const isSeedOrJensen = currentLayer.toLowerCase().includes("jensen") || currentLayer.toLowerCase().includes("seed");
                let durationMinutesFieldUpdate = isSeedOrJensen ? "SeedDuration" : "DurationMinutes";

                const queryUpdate = `
    UPDATE playeractivities
    SET SessionEndTime=NOW(), 
        ${durationMinutesFieldUpdate}=IFNULL(${durationMinutesFieldUpdate}, 0) + TIMESTAMPDIFF(MINUTE, SessionStartTime, NOW())
    WHERE SteamID = ? OR EOSID = ?;
`;

                await this.db.query(queryUpdate, [info.steamID, info.eosID]);
                await this.updateScoresAndReset(); // Oyuncu çıkışında puanları güncelle 
            }
        } catch (error) {
            console.error("An error occurred in onPlayerDisconnected method:", error);
        }
    }

    async onRoundEnd() {
        console.log("onRoundEnd");
        try {
            // Mevcut turun layer'ını al
            const currentLayerResponse = await this.server.rcon.execute('ShowCurrentMap');
            const currentLayer = currentLayerResponse; // Bu satırı, gelen cevabı doğru şekilde işleyecek şekilde ayarlayın.
            console.log(currentLayer);
            const isSeedOrJensen = currentLayer.toLowerCase().includes("jensen") || currentLayer.toLowerCase().includes("seed");

            // Tüm aktif oyuncuları al
            const activePlayers = await this.getActivePlayers();

            for (const player of activePlayers) {
                console.log(player);
                const queryStartTime = `
                SELECT SessionStartTime FROM playeractivities WHERE SteamID = ? OR EOSID = ? LIMIT 1;
            `;

                const [rows] = await this.db.query(queryStartTime, [player.steamID, player.eosID]);

                if (rows.length > 0) {
                    const sessionStartTime = rows[0].SessionStartTime;

                    let durationUpdateField = isSeedOrJensen ? "SeedDuration" : "DurationMinutes";
                    let queryUpdate = `
                    UPDATE playeractivities
                    SET SessionEndTime=NOW(), 
                        ${durationUpdateField}=IFNULL(${durationUpdateField}, 0) + TIMESTAMPDIFF(MINUTE, SessionStartTime, NOW())
                    WHERE SteamID = ? OR EOSID = ?;
                `;

                    await this.db.query(queryUpdate, [sessionStartTime, player.steamID, player.eosID]);
                    await this.updateScoresAndReset(true); // Tur sonunda puanları güncelle ve süreleri sıfırla
                }
            }

            // Tur bittiğinde, aktif oyuncuların SessionStartTime'ını güncelle
            await this.resetSessionStartTimeForActivePlayers(activePlayers);
        } catch (error) {
            console.error("An error occurred in onRoundEnd method:", error);
        }
    }


    async getActivePlayers() {
        const players = await this.server.rcon.getListPlayers();
        return players;
    }

    async resetSessionStartTimeForActivePlayers(activePlayers) {
        console.log("resetSessionStartTimeForActivePlayers");
        for (const player of activePlayers) {
            const query = `
                UPDATE playeractivities
                SET SessionStartTime=NOW()
                WHERE SteamID = ? OR EOSID = ?;
            `;
            await this.db.query(query, [player.steamID, player.eosID]);
        }
    }

    async updateScoresAndReset(resetTime = false) {
        console.log("Updating scores for all players");

        // Mevcut haritanın seed durumunu kontrol et
        const currentMapResponse = await this.server.rcon.execute('ShowCurrentMap');
        const isSeedMap = currentMapResponse.toLowerCase().includes("seed");

        // Aktif oyuncuları getActivePlayers metoduyla al
        const activePlayers = await this.getActivePlayers();

        for (const player of activePlayers) {
            // Oyuncunun klan bilgisini al
            const clanInfoQuery = `
    SELECT c.ClanID, c.ClanName
    FROM player p
    JOIN clan c ON p.ClanID = c.ClanID
    WHERE p.SteamID = ?;
`;
            const [[clanInfo]] = await this.db.query(clanInfoQuery, [player.steamID]);


            // Aynı klandaki aktif oyuncu sayısını hesapla
            let clanCount = 1;
            if (clanInfo && clanInfo.ClanID != 61) {
                const clanCountQuery = `
                    SELECT COUNT(*) AS ClanCount
                    FROM playeractivities pa
                    JOIN player p ON pa.SteamID = p.SteamID
                    WHERE p.ClanID = ? AND pa.SessionEndTime IS NULL;
                `;
                let [[{ ClanCount }]] = await this.db.query(clanCountQuery, [clanInfo.ClanID]);
                clanCount = ClanCount;
            }
            // Aynı klandaki aktif oyuncu sayısını hesapla



            // Puanı hesapla
            let points = 1; // Her 10 dakika için 1 temel puan
            points *= clanCount; // Klan bonusu
            if (isSeedMap) points *= 2; // Seed haritası bonusu

            // Puanı güncelle
            const updateScoresQuery = `
                INSERT INTO player_scores (SteamID, TotalPoints)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE TotalPoints = TotalPoints + ?;
            `;
            await this.db.query(updateScoresQuery, [player.steamID, points, points]);
        }

        // resetTime true ise, aktif oyuncuların sürelerini sıfırla
        if (resetTime) {
            const resetTimeQuery = `
                UPDATE playeractivities
                SET SessionStartTime = NOW()
                WHERE SessionEndTime IS NULL;
            `;
            await this.db.query(resetTimeQuery);
        }

        console.log("Scores updated and times reset (if applicable).");
    }




}
