const Discord = require("discord.js");
require("discord-reply");
const intents = new Discord.Intents()
const client = new Discord.Client({
    ws: {
        intents: intents.ALL
    }
});
const fetch = require("node-fetch");
const fs = require("fs");
let Parser = require("rss-parser");
let parser = new Parser();
const config = require('./config.json');

let previousVidId;
fs.open("previousVidID.json", 'r', function (err, fd) {
    if (err) {
        fs.writeFile("previousVidId.json", "[]", function (err) {
            if (err) {
                console.log(err);
            }
        });
    };
});

client.cooldowns = new Discord.Collection()
client.cmds = new Discord.Collection()
client.Embed = Discord.MessageEmbed
client.f = fetch;

let ipGrabberDomainsArr;
let stopIpGrabbers = false;
if (config.ipGrabberDomainsGistId != null) {
    stopIpGrabbers = true;
    fetch(`https://api.github.com/gists/${config.ipGrabberDomainsGistId}`)
        .then(r => r.json())
        .then(json => ipGrabberDomainsArr = JSON.parse(json.files.ip_grabber_domains.content))
        .catch(error => console.log(`Failed to get IP grabber domains array gist: ${error}`), stopIpGrabbers = false);
}

const modules = fs.readdirSync("./cmds")
    .filter(m => !m.startsWith("_"))
for (const m of modules) {
    const c = fs.readdirSync(`./cmds/${m}/`)
        .filter(f => !f.startsWith("_"))
    for (const cmds of c) {
        try {
            const command = require(`./cmds/${m}/${cmds}`)
            client.cmds.set(command.name, command)
            console.log(`${cmds} loaded!`)
        } catch (e) {
            console.error(`${"\033[0;31m"}It looks like the command ${cmds} did an oppsie!\n${e}`)
            console.error("But other commands will continue loading\033[0m")
            continue
        }
    }
}

client.on("ready", () => {
    console.log("Ready!");
    client.user.setActivity("you can talk with me in #chatbot");
    previousVidId = require('./previousVidId.json');
});

client.on("debug", info => {
   if(info.includes("Heartbeat")) return;
   console.log(info);
});

client.on("guildMemberAdd", member => {
    console.log("works joined!")
    if(member.guild.id != config.nick.guildID) return;
    try {
       const nickname = config.nick.name
       const shortUser = member.user.username.slice(0, 36-nickname.length);
       const newUser = config.nick.name.replace("{user}", shortUser)
       member.setNickname(newUser)
    } catch(e) {
       console.log("oof")
       console.log(e)
    }
    console.log("User joined!")
})

// this is command
client.on("message", message => {
    if(message.author.bot ||
       message.channel.type == "dm") return;
	if (stopIpGrabbers) {
        if (ipGrabberDomainsArr.some(ipGrabberDomain => message.content.toLowerCase().includes(ipGrabberDomain))) {
            message.delete();
            return message.reply("Don't send IP grabber links or you will be banned!");
    	}
	}
    if(message.content.toLowerCase().startsWith("ree")
       && config.enableREE) return message.channel.send("REEEEEEEEEEE")
    if(message.channel.id == config.chatbotChannel) return;
    if (!message.content.startsWith(config.prefix)) return;
    if(config.enableSudo) {
        if(message.content.startsWith("sudo rm -rf")) {
            return message.channel.send(`I'm going to remove the folder \`${message.content.slice(12)}\``).then(r => {
                setTimeout(() => r.edit(`\`${message.content.slice(12)}\` has been removed!`), 3000)
            })
        } else if(message.content.startsWith("sudo shutdown")) {
            return message.channel.send("Shutting down...")
        }
    }
    const args = message.content.slice(config.prefix.length).trim().split(/ +/)
    const cmdName = args.shift().toLowerCase()
    const command = client.cmds.get(cmdName) || client.cmds.find(m => m.aliases && m.aliases.includes(cmdName))
    if (!command) return;
    const owners = config.owners
    if (command.owner && !owners.includes(message.author.id)) return message.channel.send("No");
    if (!client.cooldowns.has(command.name)) {
        client.cooldowns.set(command.name, new Discord.Collection());
    }
    const now = Date.now();
    const timestamp = client.cooldowns.get(command.name);
    const ca = (command.cooldown || 1) * 1000;
    if (timestamp && timestamp.has(message.author.id)) {
        const et = timestamp.get(message.author.id) + ca;
        if (now < et) {
            const te = (et - now) / 1000;
            message.react("⌛");
            return message.reply(
                `Command is on cooldown! \`${te.toFixed(1)}\` seconds left!`
            ).then(msg => {
                msg.delete({timeout: 2000});
            });
        }
    }
    timestamp.set(message.author.id, now);
    setTimeout(() => {
        timestamp.delete(message.author.id);
    }, ca);
    try {
        command.run(message, args, client)
    } catch (e) {
        return message.channel.send(`It looks like the command did an oppsie\n${e}`)
    }
})

// this is chatbot
client.on("message", message => {
    if(!config.enableChatbot) return;
    if(message.author.id == client.user.id || message.author.bot) return;
    if(message.channel.id != config.chatbotChannel) return;
    if(message.content.startsWith("!")) return;
    if(message.content.toLowerCase() ==
    "uptime") {
        let totalSeconds = (client.uptime / 1000);
        let days = Math.floor(totalSeconds / 86400);
        totalSeconds %= 86400;
        let hours = Math.floor(totalSeconds / 3600);
        totalSeconds %= 3600;
        let minutes = Math.floor(totalSeconds / 60);
        let seconds = Math.floor(totalSeconds % 60);
        const i = `${days} days, ${hours}h ${minutes}m ${seconds}s`
        return message.channel.send(i);
    }
    const now = new Date();
    message.channel.startTyping(5);
    fetch(`https://chatbot.shootdot.repl.co/clever/${encodeURIComponent(message.content)}`).then(r => r.json())
    .then(res => {
        const rightNow = new Date();
        const milsec = rightNow - now
        console.log(res)
        message.lineReplyNoMention(
          res.message + ` (${milsec}ms)`
        ).catch(() => {
            message.lineReplyNoMention("I don't know")
        })
        message.channel.stopTyping(true)
    })
    .catch(err => {
        message.lineReplyNoMention(`It looks like the API did an oppsie: ${err}`)
        message.channel.stopTyping(true)
    })
})

setInterval(function() {
    parser.parseURL(`https://www.youtube.com/feeds/videos.xml?channel_id=${config.ytNotifs.ytChannelId}`).then(vidsJson => {
        if (vidsJson.items[0].id != previousVidId[0]) {
            let notifMsg = config.ytNotifs.notifMsg;
            notifMsg = notifMsg.replace("{author}", vidsJson.items[0].author);
            notifMsg = notifMsg.replace("{url}", vidsJson.items[0].link);
            try {
                client.channels.cache.get(config.ytNotifs.notifsChannelId).send(notifMsg);
            } catch (err) {
                console.log("Failed to send Youtube notification message!\n" + err);
            };
            previousVidId[0] = vidsJson.items[0].id;
            fs.writeFile('./previousVidId.json', JSON.stringify(previousVidId), 'utf8', function (err) {
                if (err) return console.log(err);
            });
        };
    });
}, config.ytNotifs.newVidCheckIntervalInMinutes * 60000);

client.login(config.token)
