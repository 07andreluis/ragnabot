require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const http = require('http'); // Adicionado para o Keep-Alive

// --- SERVIDOR PARA RECEBER O CRON-JOB ---
http.createServer(async (_, res) => {
    try {
        await verificarAlertas();
        res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'});
        res.write("Bot: ONLINE | Alertas: Processados");
        res.end();
    } catch (err) {
        console.error("Erro no processamento do servidor HTTP:", err);
        res.writeHead(500);
        res.end();
    }
}).listen(process.env.PORT || 3000, () => {
    console.log("Servidor de monitoramento rodando na porta 3000");
});

// Conexão com o MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Conectado ao MongoDB com sucesso!'))
    .catch(err => console.error('❌ Erro ao conectar ao MongoDB:', err));

// Esquema do Banco de Dados
const InstanciaSchema = new mongoose.Schema({
    eventoId: { type: String, required: true },
    tipoInstancia: { type: String, default: 'et' },
    dataEvento: { type: Date, default: null },
    alertasEnviados: { type: [String], default: [] },
    ultimaMensagemId: { type: String, default: null },
    inscritos: { type: Map, of: [String], default: {} }
});

const Instancia = mongoose.model('Instancia', InstanciaSchema);

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages
    ] 
});

const CONFIG_INSTANCIAS = {
    et: {
        nome: "Endless Tower (ET)",
        emoji: "🗼",
        cor: "#3498db",
        classes: {
            'Sniper': { limite: 5, emoji: '🏹' },
            'HP': { limite: 2, emoji: '✝️' },
            'Bardo': { limite: 1, emoji: '🎻' },
            'Dancer': { limite: 1, emoji: '💃' },
            'CF': { limite: 1, emoji: '💪' },
            'Devo': { limite: 1, emoji: '🛡️' },
            'Prof': { limite: 1, emoji: '📚' },
            'Reserva': { limite: 5, emoji: '⏳' }
        }
    },
    ec: {
        nome: "Endless Cellar (EC)",
        emoji: "🍷",
        cor: "#8e44ad",
        classes: {
            'Sniper': { limite: 4, emoji: '🏹' },
            'HP': { limite: 2, emoji: '✝️' },
            'Bardo': { limite: 1, emoji: '🎻' },
            'Dancer': { limite: 1, emoji: '💃' },
            'CF': { limite: 1, emoji: '💪' },
            'Devo': { limite: 1, emoji: '🛡️' },
            'Prof': { limite: 1, emoji: '📚' },
            'Creator': { limite: 1, emoji: '🧪' },
            'Reserva': { limite: 5, emoji: '⏳' }
        }
    },
    galho: {
        nome: "PT de Galho Seco",
        emoji: "🌳",
        cor: "#2ecc71",
        classes: {
            'Sniper': { limite: 1, emoji: '🏹' },
            'HP': { limite: 3, emoji: '✝️' },
            'Dancer': { limite: 1, emoji: '💃' },
            'Bragi': { limite: 1, emoji: '🎻' },
            'Gospel': { limite: 1, emoji: '📖' },
            'Devo': { limite: 1, emoji: '🛡️' },
            'CF': { limite: 1, emoji: '💪' },
            'Prof': { limite: 1, emoji: '📚' },
            'Leechers': { limite: 2, emoji: '👶' }
        }
    },
    celine: {
        nome: "HTF (Celine)",
        emoji: "🧸",
        cor: "#e74c3c",
        classes: {
            'Sniper': { limite: 1, emoji: '🏹' },
            'HP': { limite: 1, emoji: '✝️' },
            'Dancer': { limite: 1, emoji: '💃' },
            'Bragi': { limite: 1, emoji: '🎻' },
            'Tanker': { limite: 1, emoji: '🛡️' },
            'Reserva': { limite: 5, emoji: '⏳' }
        }
    }
};

function calcularContagem(dataEvento) {
    if (!dataEvento) return "📅 **Data ainda não definida.** Use `!data DD/MM/AAAA HH:MM`";
    const timestampUnix = Math.floor(dataEvento.getTime() / 1000);
    return `📌 **Início:** <t:${timestampUnix}:F>\n⏳ **Contagem:** <t:${timestampUnix}:R>`;
}

async function enviarPainelAtualizado(channel) {
    const dados = await Instancia.findOne({ eventoId: channel.id });
    if (dados?.ultimaMensagemId) {
        try { await (await channel.messages.fetch(dados.ultimaMensagemId)).delete(); } catch {}
    }
    const msg = await channel.send({ embeds: [await gerarEmbed(channel.id)], components: gerarBotoes(dados.tipoInstancia) });
    dados.ultimaMensagemId = msg.id;
    await dados.save();
}

async function verificarAlertas() {
    const agora = new Date();
    const eventos = await Instancia.find({ dataEvento: { $ne: null } });
    for (const evento of eventos) {
        const diffMinutos = Math.floor((evento.dataEvento - agora) / (1000 * 60));
        const gatilhos = [
            { m: 1440, nome: '24h' },
            { m: 180,  nome: '3h' },
            { m: 60,   nome: '1h' }
        ];
        for (const g of gatilhos) {
            if (diffMinutos <= g.m && diffMinutos > (g.m - 10) && !evento.alertasEnviados.includes(g.nome)) {
                const canal = await client.channels.fetch(evento.eventoId).catch(() => null);
                if (canal) {
                    let mencoes = "";
                    evento.inscritos.forEach(lista => lista.forEach(id => { if (!mencoes.includes(id)) mencoes += `${id} `; }));
                    await canal.send(`🔔 **ALERTA DE ${g.nome}!**\n📍 A **${CONFIG_INSTANCIAS[evento.tipoInstancia].nome}** começará em breve!\n👥 Participantes: ${mencoes}!\n💡 *Dica: Digite **/checklist ${CONFIG_INSTANCIAS[evento.tipoInstancia].nome}** para ver os itens e equipamentos obrigatórios.*`);
                    evento.alertasEnviados.push(g.nome);
                    await evento.save();
                }
            }
        }
    }
}

async function getDadosInstancia(idDoCanal) {
    let dados = await Instancia.findOne({ eventoId: idDoCanal });
    
    if (!dados) {
        return null; 
    }
    return dados;
}

async function gerarEmbed(idDoCanal) {
    const dados = await getDadosInstancia(idDoCanal);
    if (!dados) return new EmbedBuilder().setTitle("❌ Instância não configurada. Use /abrir");

    const infoInstancia = CONFIG_INSTANCIAS[dados.tipoInstancia];
    const contagemTexto = calcularContagem(dados.dataEvento);
    
    let corEmbed = infoInstancia.cor; 
    if (dados.dataEvento) {
        const agora = new Date();
        const diff = dados.dataEvento - agora;
        if (diff <= 0) corEmbed = '#ff0000';
        else if (diff <= 2 * 60 * 60 * 1000) corEmbed = '#f1c40f';
    }

    const embed = new EmbedBuilder()
        .setTitle(`${infoInstancia.emoji} ${infoInstancia.nome} - Inscrição`)
        .setDescription(`${contagemTexto}\n\nSelecione sua classe abaixo.`)
        .setColor(corEmbed)
        .setFooter({ text: `ID: ${idDoCanal} | Tipo: ${dados.tipoInstancia.toUpperCase()}` });

    for (const [classe, info] of Object.entries(infoInstancia.classes)) {
        const listaIds = dados.inscritos.get(classe) || [];
        const listaNomes = listaIds.length > 0 ? listaIds.join('\n') : '*Vazio*';
        const isReserva = classe === 'Reserva';
        
        embed.addFields({ 
            name: `${isReserva ? '⏳' : info.emoji} ${classe} (${listaIds.length}/${info.limite})`, 
            value: listaNomes, 
            inline: !isReserva 
        });
        if (isReserva) embed.addFields({ name: '\u200B', value: '━━━━━━━━━━━━', inline: false });
    }
    return embed;
}

function gerarBotoes(tipo) {
    const rows = [];
    const classesInfo = CONFIG_INSTANCIAS[tipo].classes;
    const nomesClasses = Object.keys(classesInfo);

    for (let i = 0; i < nomesClasses.length; i += 4) {
        const row = new ActionRowBuilder();
        nomesClasses.slice(i, i + 4).forEach(classe => {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`insc_${classe}`)
                    .setLabel(classe)
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji(classesInfo[classe].emoji)
            );
        });
        rows.push(row);
    }
    
    rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('sair').setLabel('Sair da Lista').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('reset').setLabel('Resetar (Admin)').setStyle(ButtonStyle.Primary)
    ));
    return rows;
}

client.once('ready', async () => {
    console.log(`🚀 Bot online como ${client.user.tag}`);

    const comandos = [
        {
            name: 'abrir',
            description: 'Inicia o painel de uma instância neste tópico',
            options: [{
                name: 'instancia',
                type: 3, 
                description: 'Qual instância deseja abrir?',
                required: true,
                choices: Object.keys(CONFIG_INSTANCIAS).map(k => ({name: CONFIG_INSTANCIAS[k].nome, value: k }))
            }]
        },
        {
            name: 'data',
            description: 'Define a data e hora do evento',
            options: [
                { name: 'dia', description: 'O dia do evento (DD)', type: 4, required: true },
                { name: 'mes', description: 'O mês do evento (MM)', type: 4, required: true },
                { name: 'ano', description: 'O ano do evento (AAAA)', type: 4, required: true },
                { name: 'hora', description: 'A hora do evento (HH)', type: 4, required: true },
                { name: 'minuto', description: 'O minuto do evento (mm)', type: 4, required: true }
            ]
        }
    ];

    await client.application.commands.set(comandos);
    console.log('✅ Slash Commands registrados!');
});

client.on('interactionCreate', async interaction => {
    const canalId = interaction.channel.id;
    const userId = `<@${interaction.user.id}>`;

    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'abrir') {
            const tipo = interaction.options.getString('instancia');
            // Ajuste: Limpa inscritos ao abrir novo painel para evitar lixo de instâncias anteriores
            await Instancia.findOneAndUpdate({ eventoId: canalId }, { tipoInstancia: tipo, inscritos: new Map(), dataEvento: null, alertasEnviados: [] }, { upsert: true });
            await interaction.reply({ content: '✅ Painel gerado!', ephemeral: true });
            await enviarPainelAtualizado(interaction.channel);
        }

        if (interaction.commandName === 'data') {
            const [d, m, a, h, min] = ['dia','mes','ano','hora','minuto'].map(n => interaction.options.getInteger(n));
            const novaData = new Date(`${a}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:00-03:00`);
            
            const dados = await Instancia.findOne({ eventoId: canalId });
            if (!dados) return interaction.reply({ content: '❌ Use /abrir primeiro!', ephemeral: true });

            dados.dataEvento = novaData;
            dados.alertasEnviados = [];
            await dados.save();

            await interaction.channel.send(`📢 **${CONFIG_INSTANCIAS[dados.tipoInstancia].nome} MARCADA!**\n📅 **Data:** ${novaData.toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })}\n⚠️ <@&1100422246998233199>, inscrevam-se!`);
            await interaction.reply({ content: '✅ Data definida!', ephemeral: true });
            await enviarPainelAtualizado(interaction.channel);
        }
    }

    if (interaction.isButton()) {
        const dados = await Instancia.findOne({ eventoId: canalId });
        if (!dados) return;

        if (interaction.customId === 'sair') {
            dados.inscritos.forEach((l, k) => dados.inscritos.set(k, l.filter(id => id !== userId)));
        } else if (interaction.customId === 'reset') {
            if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: 'Apenas administradores podem resetar.', ephemeral: true });
            dados.inscritos = new Map();
        } else {
            const classe = interaction.customId.replace('insc_', '');
            const lista = dados.inscritos.get(classe) || [];
            let jaInscrito = false;
            dados.inscritos.forEach(l => { if (l.includes(userId)) jaInscrito = true; });

            if (jaInscrito) return interaction.reply({ content: 'Você já está em uma classe!', ephemeral: true });
            if (lista.length >= CONFIG_INSTANCIAS[dados.tipoInstancia].classes[classe].limite) return interaction.reply({ content: 'Esta classe está cheia!', ephemeral: true });

            lista.push(userId);
            dados.inscritos.set(classe, lista);
        }
        await dados.save();
        await interaction.update({ embeds: [await gerarEmbed(canalId)] });
    }
});

client.login(process.env.DISCORD_TOKEN);