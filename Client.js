const {
  EndBehaviorType,
  createAudioPlayer,
  createAudioResource,
} = require("@discordjs/voice");
const { Client, IntentsBitField } = require("discord.js");
const { opus } = require("prism-media");
const ffmpeg = require("fluent-ffmpeg");
const cp = require("child_process");
const shell = require("shelljs");
const fs = require("fs");

module.exports = class extends Client {
  constructor() {
    super({
      intents: [
        "GuildVoiceStates",
        "MessageContent",
        "MessageContent",
        "GuildMessages",
        "GuildMembers",
        "Guilds",
      ],
    });

    /** @type {Record<String, import("@discordjs/voice").AudioReceiveStream} */
    this.subscriptions = {};
    /** @type {null | import("@discordjs/voice").VoiceConnection} */
    this.connection = null;
    /** @type {Record<number, NodeJS.Timeout>} */
    this.timeouts = {};
    this.model = "large-v3-q5_0.bin";

    this.words = [];

    this.index = 0;

    this.init();
  }

  init() {
    const words = fs.readdirSync("./words");
    const temp = fs.readdirSync("./temp");

    for (const file of temp) {
      fs.rmSync(`./temp/${file}`);
    }

    for (const word of words) {
      this.words.push(word.split(".")[0]);
    }
  }

  whisper(index) {
    return new Promise((resolve, reject) => {
      try {
        shell.exec(
          `"./whisper/main.exe" -ml 1 -m ./whisper/${this.model} -f ./temp/${index}.wav`,
          { silent: true, async: false },
          (code, stdout, stderr) => {
            if (code == 0) resolve(stdout);
            else reject(stderr);
          }
        );

        // cp.exec(
        //   `"./whisper/main.exe" -ml 1 -m ./whisper/medium.bin -f ./temp/${index}.wav`,
        //   (err, stdout, stderr) => {
        //     console.log({ err, stdout, stderr });
        //     if (err == null) resolve(stdout);
        //   }
        // );
      } catch (error) {
        reject(error);
      }
    });
  }

  formatTranscript(vtt) {
    // 1. separate lines by matching the format like "[00:03:04.000 --> 00:03:13.000]   XXXXXX"
    const lines = vtt.match(/\[[0-9:.]+\s-->\s[0-9:.]+\].*/g);
    if (lines == null) return {};

    // 2. remove the first line, which is empty
    lines.shift();

    // 3. convert each line into an object
    return lines.map((line) => {
      // 3a. split ts from speech
      let [timestamp, speech] = line.split("]  "); // two spaces (3 spaces doesn't work with punctuation like period . )

      // 3b. remove the open bracket of timestamp
      timestamp = timestamp.substring(1);

      // 3c. split timestamp into begin and end
      const [start, end] = timestamp.split(" --> ");

      // 3d. remove \n from speech with regex
      speech = speech.replace(/\n/g, "");

      // 3e. remove beginning space
      speech = speech.replace(" ", "");

      return { start, end, speech };
    });
  }

  /** @param {any[]} transcript */
  parse(transcript) {
    const pass = [".", ",", "...", "-"];
    let i = 0;
    let transLen = transcript.length;
    let copy = Array.from(transcript);

    while (i < transLen) {
      const data = copy[i];
      if (pass.includes(data.speech)) continue;
      if (data.speech.startsWith("'")) {
        const prefix = copy[i - 1];
        prefix.speech += data.speech;
        prefix.speech = prefix.speech.toLowerCase();
        prefix.end = data.end;
        copy.splice(i, 1);
      } else {
        copy[i].speech = copy[i].speech.toLowerCase();
      }

      transLen = copy.length;
      i++;
    }

    return copy;
  }

  killStream(stream) {
    if (stream.writableLength > 0) {
      setTimeout(() => {
        this.killStream(stream);
      }, 500);
    } else stream.destroy();
  }

  /**
   * @param {string} userId
   */
  subscribe(userId) {
    if (userId == this.user.id) return;
    if (this.index >= 15) this.index = 0;
    const i = this.index;
    this.index++;

    const stream = this.connection.receiver
      .subscribe(userId, {
        end: EndBehaviorType.Manual,
        emitClose: true,
      })
      .pipe(
        new opus.Decoder({
          rate: 16000,
          channels: 2,
          frameSize: 960,
        })
      )
      .pipe(fs.createWriteStream(`./temp/${i}.pcm`));

    setTimeout(() => {
      console.log("Killing stream");
      this.killStream(stream);
    }, 7500);

    stream.on("close", async () => {
      ffmpeg(`./temp/${i}.pcm`)
        .inputOption(["-f s16le", "-ar 16k", "-ac 2"])
        .output(`./temp/${i}.wav`)
        .run();

      console.log(`Running wav file through whisper`);

      try {
        const trans = await this.whisper(i);
        const format = this.formatTranscript(trans);
        const parsed = this.parse(format);

        console.log(`Parsed audio file`);

        for (const value of parsed) {
          if (this.words.includes(value.speech)) return;

          this.words.push(value.speech);
          ffmpeg(`./temp/${i}.wav`)
            .inputOption([`-ss ${value.start}`, `-to ${value.end}`])
            .output(`./words/${value.speech}.wav`)
            .run();
        }

        fs.rmSync(`./temp/${i}.pcm`);
        fs.rmSync(`./temp/${i}.wav`);
      } catch (error) {
        console.log(`[Whisper] Error: ${error}`);
      }
    });

    // command to split: ffmpeg -ss 10 -to 16 -i index.wav output.wav
  }

  /** @param {string} sentence */
  say(sentence) {
    sentence = sentence.toLowerCase();
    const player = createAudioPlayer();
    const con = this.connection.subscribe(player);

    player.on("debug", (message) => {
      console.log(message);
    });

    player.on("error", (err) => {
      console.error(`Error playing audio: ${err}`);
    });

    this.makeAudio(sentence.split(" "));
    const resource = createAudioResource("./sentence.wav");
    player.play(resource);

    con.unsubscribe();
    fs.rmSync("./sentence.wav");
  }

  makeAudio(words) {
    const out = fs.createWriteStream("./sentence.wav");
    for (const word of words) {
      const input = fs.createReadStream(`./words/${word}.wav`);
      input.pipe(out, { end: false });
      const _ = fs.createReadStream(`./words/-.wav`);
      _.pipe(out, { end: false });
    }

    out.close();
    return;
  }
};
