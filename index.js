const Client = require("./Client");
const { ChannelType } = require("discord.js");
const { joinVoiceChannel } = require("@discordjs/voice");

const client = new Client();

const ids = ["865033209380995122" /* Player id */, "" /* DM id just in case */];
const ignore = []; // array of user ids to ignore when getting words
const prefix = "!";

client.on("messageCreate", async (message) => {
  if (message.author.id == client.user.id) return;
  if (!ids.includes(message.author.id)) return;
  if (!message.content.startsWith(prefix)) return;

  const command = message.content.slice(prefix.length);
  const name = command.split(" ")[0];
  const args = command.split(" ").slice(1);

  switch (name.toLowerCase()) {
    case "norec": {
      const channel = message.member.voice.channel;
      if (channel.joinable) {
        const conn = await joinVoiceChannel({
          adapterCreator: message.guild.voiceAdapterCreator,
          guildId: message.guildId,
          channelId: channel.id,
          selfDeaf: false,
          selfMute: false,
        });

        client.connection = conn;
      }
      break;
    }
    case "join": {
      let voiceChannel = message.guild.channels.cache
        .filter((c) => c.type === ChannelType.GuildVoice)
        .find((channel) => channel.id === args[0]);

      if (!voiceChannel && message.member.voice.channel)
        voiceChannel = message.member.voice.channel;

      if (!voiceChannel)
        return message.reply(
          `There is no voice channel with the id of ${args[0]}`
        );

      if (voiceChannel.joinable) {
        const conn = await joinVoiceChannel({
          adapterCreator: message.guild.voiceAdapterCreator,
          guildId: message.guild.id,
          channelId: voiceChannel.id,
          selfDeaf: false,
        });

        client.connection = conn;

        voiceChannel.members
          .filter((m) => m.id !== client.user.id)
          .filter((m) => !ignore.includes(m))
          .forEach((member) => {
            client.subscribe(member.id);
          });
      }

      break;
    }
    case "say":
    case "play":
      client.say(args.join(" "));
      break;
  }
});

client.on("voiceStateUpdate", (oldState, newState) => {
  if (oldState.member.id == client.user.id) return;
  if (newState.channelId == null && client.connection) {
    client.connection.receiver.subscriptions.get(oldState.member.id).destroy();
  }
  if (oldState.channelId == null) {
    client.subscribe(oldState.member.id);
  }
});

client.on("ready", () => {
  console.log(`${client.user.username} is ready`);
});

client.login();
