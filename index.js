require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const http = require('http'); // Adicionado para o Keep-Alive

// --- MINI SERVIDOR PARA O RENDER NÃO DORMIR ---
http.createServer((req, res) => {
    res.write("Bot da Torre Online!");
    res.end();
}).listen(process.env.PORT || 3000);

// Conexão com o MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Conectado ao MongoDB com sucesso!'))
    .catch(err => console.error('❌ Erro ao conectar ao MongoDB:', err));

// Esquema do Banco de Dados
const TorreSchema = new mongoose.Schema({
    eventoId: { type: String, required: true }, 
    inscritos: {
        type: Map,
        of: [String],
        default: {
            'HP': [], 'Sniper': [], 'Devo': [], 'Champ CF': [],
            'Champ Asura': [], 'Professor': [], 'Bragi': [], 'Dancer': [], 'Creator': []
        }
    }
});

const Torre = mongoose.model('Torre', TorreSchema);

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ] 
});

const CONFIG_TORRE = {
    'HP': { limite: 2, emoji: '💉' },
    'Sniper': { limite: 4, emoji: '🏹' },
    'Devo': { limite: 1, emoji: '🛡️' },
    'Champ CF': { limite: 1, emoji: '🖐' },
    'Champ Asura': { limite: 1, emoji: '👊' },
    'Professor': { limite: 1, emoji: '📖' },
    'Bragi': { limite: 1, emoji: '🎹' },
    'Dancer': { limite: 1, emoji: '💃' },
    'Creator': { limite: 1, emoji: '🧪' }
};

async function getDadosTorre(idDoCanal) {
    let dados = await Torre.findOne({ eventoId: idDoCanal });
    if (!dados) {
        dados = await Torre.create({ 
            eventoId: idDoCanal,
            inscritos: {
                'HP': [], 'Sniper': [], 'Devo': [], 'Champ CF': [],
                'Champ Asura': [], 'Professor': [], 'Bragi': [], 'Dancer': [], 'Creator': []
            }
        });
    }
    return dados;
}

async function gerarEmbed(idDoCanal) {
    const dados = await getDadosTorre(idDoCanal);
    const embed = new EmbedBuilder()
        .setTitle('🏰 Torre Sem Fim - Inscrição')
        .setDescription('Selecione sua classe abaixo. Esta lista é exclusiva para este tópico!')
        .setColor('#2b2d31')
        .setFooter({ text: `ID do Evento: ${idDoCanal}` });

    for (const [classe, info] of Object.entries(CONFIG_TORRE)) {
        const listaIds = dados.inscritos.get(classe) || [];
        const listaNomes = listaIds.length > 0 ? listaIds.join('\n') : '*Vazio*';
        embed.addFields({ 
            name: `${info.emoji} ${classe} (${listaIds.length}/${info.limite})`, 
            value: listaNomes, 
            inline: true 
        });
    }
    return embed;
}

function gerarBotoes() {
    const rows = [];
    const classes = Object.keys(CONFIG_TORRE);
    for (let i = 0; i < classes.length; i += 4) {
        const row = new ActionRowBuilder();
        classes.slice(i, i + 4).forEach(classe => {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`insc_${classe}`)
                    .setLabel(classe)
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji(CONFIG_TORRE[classe].emoji)
            );
        });
        rows.push(row);
    }
    rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('sair').setLabel('Sair da Lista').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('reset').setLabel('Resetar Torre (Admin)').setStyle(ButtonStyle.Primary)
    ));
    return rows;
}

client.once('ready', () => {
    console.log(`🚀 Bot online como ${client.user.tag}! Digite !torre no Discord.`);
});

client.on('messageCreate', async message => {
    if (message.content === '!torre' && !message.author.bot) {
        // Passamos o ID do canal (ou tópico) atual
        const embed = await gerarEmbed(message.channel.id);
        await message.channel.send({ embeds: [embed], components: gerarBotoes() });
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    const userId = `<@${interaction.user.id}>`;
    
    // Pegamos o ID do canal onde o botão foi clicado
    const canalId = interaction.channel.id;
    const dados = await getDadosTorre(canalId);

    if (interaction.customId === 'sair') {
        for (let [classe, lista] of dados.inscritos) {
            dados.inscritos.set(classe, lista.filter(id => id !== userId));
        }
        await dados.save();
        return interaction.update({ embeds: [await gerarEmbed(canalId)] });
    }

    if (interaction.customId === 'reset') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: 'Apenas administradores podem resetar a lista.', ephemeral: true });
        }
        for (let classe of dados.inscritos.keys()) {
            dados.inscritos.set(classe, []);
        }
        await dados.save();
        return interaction.update({ embeds: [await gerarEmbed(canalId)] });
    }

    const classeEscolhida = interaction.customId.replace('insc_', '');
    const info = CONFIG_TORRE[classeEscolhida];
    const listaAtual = dados.inscritos.get(classeEscolhida);

    let jaInscrito = false;
    for (let lista of dados.inscritos.values()) {
        if (lista.includes(userId)) jaInscrito = true;
    }

    if (jaInscrito) return interaction.reply({ content: 'Você já está em uma classe neste tópico!', ephemeral: true });
    if (listaAtual.length >= info.limite) return interaction.reply({ content: 'Esta classe já está cheia!', ephemeral: true });

    listaAtual.push(userId);
    dados.inscritos.set(classeEscolhida, listaAtual);
    await dados.save();

    await interaction.update({ embeds: [await gerarEmbed(canalId)] });
});

client.login(process.env.DISCORD_TOKEN);