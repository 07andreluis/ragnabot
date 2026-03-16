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
    dataEvento: { type: Date, default: null },
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

function calcularContagem(dataEvento) {
    if (!dataEvento) return "Data não definida.";
    
    const agora = new Date();
    const diff = dataEvento - agora;

    if (diff <= 0) return "🚀 **O evento já começou ou aconteceu!**";

    const horas = Math.floor(diff / (1000 * 60 * 60));
    const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return `⏳ Faltam **${horas}h e ${minutos}m** para o início.`;
}

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
    const contagemTexto = calcularContagem(dados.dataEvento);

    const embed = new EmbedBuilder()
        .setTitle('🏰 Torre Sem Fim - Inscrição')
        .setDescription(`${contagemTexto}\n\nSelecione sua classe abaixo. Esta lista é exclusiva para este tópico!`)
        .setColor(dados.dataEvento && (dados.dataEvento - new Date() > 0) ? '#5865F2' : '#2b2d31')
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
    if (message.author.bot) return;
    // COMANDO: !torre que mostra o Embed
    if (message.content === '!torre') {
        const embed = await gerarEmbed(message.channel.id);
        await message.channel.send({ embeds: [embed], components: gerarBotoes() });
    }

    // COMANDO: !data DD/MM/AAAA HH:MM
    if (message.content.startsWith('!data')) {
        const args = message.content.split(' ');
        if (args.length < 3) {
            return message.reply('Use o formato: `!data DD/MM/AAAA HH:MM`');
        }

        const dataString = args[1]; // DD/MM/AAAA
        const horaString = args[2]; // HH:MM

        const [dia, mes, ano] = dataString.split('/');
        const [hora, min] = horaString.split(':');

        // Criar data (Mês no JS começa em 0, então mes - 1)
        const novaData = new Date(ano, mes - 1, dia, hora, min);

        if (isNaN(novaData)) {
            return message.reply('Data ou hora inválida! Verifique o formato DD/MM/AAAA HH:MM');
        }

        const dados = await getDadosTorre(message.channel.id);
        dados.dataEvento = novaData;
        await dados.save();

        message.reply(`✅ Horário do evento definido para: **${novaData.toLocaleString('pt-BR')}**! Digite \`!torre\` para ver a lista atualizada.`);
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

// --- ESTRATÉGIA DE AUTO-PING PARA O RENDER ---
const URL_DO_MEU_BOT = "https://organizador-dsss.onrender.com";

setInterval(() => {
    http.get(URL_DO_MEU_BOT, (res) => {
        if (res.statusCode === 200) {
            console.log("⚓ Auto-Ping realizado com sucesso: Bot acordado!");
        }
    }).on('error', (err) => {
        console.error("❌ Erro no Auto-Ping interno: " + err.message);
    });
}, 600000); // 600.000ms = 10 minutos

client.login(process.env.DISCORD_TOKEN);