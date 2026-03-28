import 'dotenv/config';
import {
    Client,
    SlashCommandBuilder,
    GatewayIntentBits,
    Events,
    REST,
    Routes
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

const rest = new REST( {version: '10'} ).setToken(token);

async function registerCommands(clientID: string, guildID: string) {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationGuildCommands(clientID, guildID),
            { body: [whitelistCommand.toJSON()] }
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
}

client.once(Events.ClientReady, readyClient => {
    console.log(`Logged in as ${readyClient.user.tag}`);
    const guildID = readyClient.guilds.cache.first()?.id;
    if (!guildID) return;
    registerCommands(readyClient.application.id, guildID)
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "whitelist") return;

    const sub = interaction.options.getSubcommand();
    const player = interaction.options.getString('player', true);

    await interaction.deferReply({ephemeral: true});

    try {
        const res = await axios.post(
            `${nanook_base}/whitelist`,
            { name: player },
            { headers: { Authorization: `Bearer ${nanook_token}` } },
        )

        if (res.status === 201) {
            await interaction.editReply(`Successfully ${sub} to \`${player}\` on the whitelist`)
        } else {
            await interaction.editReply(`Failed to ${sub} \`${player}\` to the whitelist`)
        }
    } catch (error: any) {
        console.error(error);
        if (error.response.status === 409) {
            await interaction.editReply(`User is already whitelisted`);
        } else {
            await interaction.editReply(`Error communicating with backend`);
        }
    }
})

client.login(token);