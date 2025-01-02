const Client = require("./Client");
const { joinVoiceChannel } = require("@discordjs/voice");

const client = new Client();

const ids = ["" /* Player id */, "" /* DM id just in case */];
const prefix = "!";

client.on("messageCreate", (message) => {
    if(message.author.id == client.user.id) return;
    if(!ids.includes(message.author.id)) return;
    if(!message.content.startsWith(prefix)) return;

    const command = message.content.slice(prefix.length);
    const name = command.split(" ")[0];
    const args = command.split(" ").slice(1);

    switch(name.toLowerCase()) {
        case "join": {
            const voiceChannel = message.guild.channels.cache
                .filter(c => c.type === ChannelType.GuildVoice)
                .find(channel => channel.id === args[0]);
            
            if(!voiceChannel) return message.reply(`There is no voice channel with the id of ${args[0]}`);
        
            if(voiceChannel.joinable) {
                const conn = joinVoiceChannel({
                    adapterCreator: message.guild.voiceAdapterCreator,
                    guildId: message.guild.id,
                    channelId: voiceChannel.id
                });

                client.connection = conn;

                voiceChannel.members.filter((m) => m.id !== client.user.id).forEach((member) => {
                    client.subscribe(member.id);
                })
            }
        }
    }
});

client.on("voiceStateUpdate", (oldState, newState) => {
    if(newState.channelId == null) {
        client.connection.receiver.subscriptions.get(oldState.member.id).destroy();
    }
    if(oldState.channelId == null) {
        client.subscribe(oldState.member.id);
    }
});