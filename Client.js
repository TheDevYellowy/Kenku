const { EndBehaviorType } = require("@discordjs/voice");
const { Client, IntentsBitField } = require("discord.js");
const { opus } = require('prism-media')
const vosk = require("vosk");
const fs = require("fs");

module.exports = class extends Client {
    constructor() {
        super({
            intents: [
                IntentsBitField.Flags.GuildVoiceStates,
                IntentsBitField.Flags.MessageContent,
                IntentsBitField.Flags.GuildMessages,
                IntentsBitField.Flags.GuildMembers
            ]
        });

        /** @type {Record<String, import("@discordjs/voice").AudioReceiveStream} */
        this.subscriptions = {};
        /** @type {null | import("@discordjs/voice").VoiceConnection} */
        this.connection = null;

        this.words = [];

        this.index = 0;

        this.init();
    }

    init() {
        this.model = vosk.Model("./model");

        const words = fs.readdirSync("./words");
        for (const word in words) {
            this.words.push(word.split(".")[0]);
        }
    }

    /**
     * @param {string} userId 
     */
    subscribe(userId) {
        const i = this.index;
        this.index++;

        const rec = new vosk.Recognizer({ sampleRate: 48000, model: this.model });
        const stream = this.connection.receiver.subscribe(userId, { end: EndBehaviorType.AfterSilence })
        .pipe(new opus.Decoder({
            rate: 48000,
            channels: 2,
            frameSize: 120
        }))

        stream.on("data", (chunk) => {
            if(rec.acceptWaveform(chunk)) {
                console.log(rec.result());
            } else {
                console.log(rec.partialResult());
            }

            console.log(rec.finalResult());
        });

        stream.on("end", () => {
            console.log(`[subscribe ${userId}] end`);
        });
    }
}