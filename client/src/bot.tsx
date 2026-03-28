import 'dotenv/config';
import {
    ActivityType,
    ChatInputCommandInteraction,
    Client, EmbedBuilder,
    Events,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder
} from 'discord.js';
import axios from 'axios';

const token = process.env.BOT_TOKEN;
const nanook_base = process.env.NANOOK_BASE_URL;
const nanook_token = process.env.NANOOK_TOKEN;

if (!token || !nanook_base || !nanook_token) {
    throw new Error("Missing environment variables");
}

const client = new Client(
    {intents: [GatewayIntentBits.Guilds]}
)
const whitelistCommand = new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Manage whitelist')
    .addSubcommand(sub =>
        sub
            .setName('add')
            .setDescription('Add a player to the whitelist')
            .addStringOption((option) =>
                option
                    .setName('player')
                    .setDescription('Minecraft username')
                    .setRequired(true)
            )
    )
    .addSubcommand(sub =>
        sub
            .setName('remove')
            .setDescription('Remove a player from the whitelist')
            .addStringOption((option) =>
                option
                    .setName('player')
                    .setDescription('Remove player from the whitelist')
                    .setRequired(true)
            )
    )
    .addSubcommand(sub =>
        sub
            .setName('list')
            .setDescription('Players registered in whitelist')
    )

const rest = new REST({version: '10'}).setToken(token);

async function registerCommands(clientID: string, guildID: string) {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationGuildCommands(clientID, guildID),
            {body: [whitelistCommand.toJSON()]}
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
}

async function addUser(player: string, interaction: ChatInputCommandInteraction) {
    try {
        const res = await axios.post(
            `${nanook_base}/whitelist`,
            {name: player},
            {headers: {Authorization: `Bearer ${nanook_token}`}},
        )

        if (res.status === 201) {
            await interaction.editReply(`Successfully added \`${player}\` on the whitelist`)
        } else {
            await interaction.editReply(`Failed to add \`${player}\` to the whitelist`)
        }
    } catch (error: any) {
        console.error(error);
        if (error.response.status === 409) {
            await interaction.editReply(`User is already whitelisted`);
        } else {
            await interaction.editReply(`Error communicating with backend`);
        }
    }
}

async function removeUser(player: string, interaction: ChatInputCommandInteraction) {
    try {
        const res = await axios.delete(
            `${nanook_base}/whitelist/${player}`,
            {
                headers: {Authorization: `Bearer ${nanook_token}`},
            }
        );

        if (res.status === 204) {
            await interaction.editReply(`Successfully removed \`${player}\` from the whitelist`);
        } else {
            await interaction.editReply(`Failed to remove \`${player}\` from the whitelist`);
        }
    } catch (error: any) {
        console.error(error);
        if (error.response?.status === 404) {
            await interaction.editReply(`User not found in whitelist`);
        } else {
            await interaction.editReply(`Error communicating with backend`);
        }
    }
}

async function listWhitelist(interaction: ChatInputCommandInteraction) {
    try {
        const res = await axios.get(
            `${nanook_base}/whitelist`,
            {headers: {Authorization: `Bearer ${nanook_token}`}},
        )

        const embed = new EmbedBuilder()
            .setTitle('Whitelist')
            .setColor('#19ff99')

        for (const user of res.data) {
            const date = new Date(user.created).toLocaleDateString();

            embed.addFields({
                name: user.name,
                value:
                    `UUID: \`${user.id}\`\n` +
                    `Added: ${date}`,
                inline: false
            });
        }

        await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
        await interaction.editReply(`Error communicating with backend`);
    }
}

client.once(Events.ClientReady, readyClient => {
    console.log(`Logged in as ${readyClient.user.tag}`);
    readyClient.guilds.cache.forEach(guildID => {
        registerCommands(readyClient.application.id, guildID.id);
    })
    readyClient
        .user
        .setActivity(
            '/whitelist',
            {type: ActivityType.Watching}
        )
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "whitelist") return;

    const sub = interaction.options.getSubcommand();

    await interaction.deferReply({ephemeral: true});

    switch (sub) {
        case 'add': {
            const player = interaction.options.getString('player', true);
            await addUser(player, interaction)
            break;
        }

        case 'remove': {
            const player = interaction.options.getString('player', true);
            await removeUser(player, interaction)
            break;
        }

        case 'list':
            await listWhitelist(interaction)
            break;
    }
})

client.login(token);