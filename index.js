require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const http = require('http'); // Adicionado para o Keep-Alive

// --- SERVIDOR PARA RECEBER O CRON-JOB ---
http.createServer((_, res) => {
    res.writeHead(200, {'Content-Type': 'text/plain'});
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
    'HP': { limite: 2, emoji: '✝️' },
    'Sniper': { limite: 4, emoji: '🏹' },
    'Devo': { limite: 1, emoji: '🛡️' },
    'Champ CF': { limite: 1, emoji: '💪' },
    'Champ Asura': { limite: 1, emoji: '👊' },
    'Professor': { limite: 1, emoji: '📚' },
    'Bragi': { limite: 1, emoji: '🎻' },
    'Dancer': { limite: 1, emoji: '💃' },
    'Creator': { limite: 1, emoji: '🧪' },
    'Reserva': { limite: 12, emoji: '⏳'}
};

function calcularContagem(dataEvento) {
    if (!dataEvento) return "📅 **Data ainda não definida.** Use `!data DD/MM/AAAA HH:MM`";
    
    // O Discord usa o tempo em segundos, não milissegundos
    const timestampUnix = Math.floor(dataEvento.getTime() / 1000);

    // R: Relativo (ex: "em 2 horas" ou "há 10 minutos")
    // F: Data Completa (ex: "20 de março de 2026 21:00")
    return `📌 **Início:** <t:${timestampUnix}:F>\n⏳ **Contagem:** <t:${timestampUnix}:R>`;
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
    
    // Lógica de Cores Dinâmicas
    let corEmbed = '#2b2d31'; // Cor padrão (Cinza escuro)
    
    if (dados.dataEvento) {
        const agora = new Date();
        const diff = dados.dataEvento - agora;
        const duasHoras = 2 * 60 * 60 * 1000; // 2 horas em milissegundos

        if (diff <= 0) {
            corEmbed = '#ff0000'; // Vermelho (Evento já começou/atrasado)
        } else if (diff <= duasHoras) {
            corEmbed = '#f1c40f'; // Amarelo (Falta menos de 2h - Atenção!)
        } else {
            corEmbed = '#3498db'; // Azul (Tudo sob controle)
        }
    }

    const embed = new EmbedBuilder()
        .setTitle('🏰 Torre Sem Fim - Inscrição')
        .setDescription(`${contagemTexto}\n\nSelecione sua classe abaixo. Esta lista é exclusiva para este tópico!`)
        .setColor(corEmbed) // Aplica a cor definida acima
        .setFooter({ text: `ID do Evento: ${idDoCanal}` });

    const chavesClasses = Object.keys(CONFIG_TORRE);

    for (const classe of chavesClasses) {
        const info = CONFIG_TORRE[classe];
        // Busca os inscritos no Map do banco de dados
        const listaIds = dados.inscritos.get(classe) || [];
        const listaNomes = listaIds.length > 0 ? listaIds.join('\n') : '*Vazio*';

        if (classe === 'Reserva') {
            // Adiciona uma linha de separação antes da reserva
            embed.addFields({ name: '\u200B', value: '━━━━━━━━━━━━━━━━━━━━━━━━━━', inline: false });
            embed.addFields({ 
                name: `⏳ FILA DE ESPERA (${listaIds.length}/${info.limite})`, 
                value: listaNomes, 
                inline: false 
            });
        } else {
            embed.addFields({ 
                name: `${info.emoji} ${classe} (${listaIds.length}/${info.limite})`, 
                value: listaNomes, 
                inline: true 
            });
        }
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

// --- FUNÇÃO DE LIMPEZA ---
async function limparEventosAntigos() {
    const umDiaAtras = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await Torre.deleteMany({
        dataEvento: { $lt: umDiaAtras, $ne: null }
    });
}

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // Comando !torre com Faxina Automática
    if (message.content === '!torre') {
        await limparEventosAntigos(); // Limpa o lixo antes de mostrar a nova
        const embed = await gerarEmbed(message.channel.id);
        await message.channel.send({ embeds: [embed], components: gerarBotoes() });
    }

    // Comando !remover @usuario (Com permissão flexível)
    if (message.content.startsWith('!remover')) {
        const isThread = message.channel.isThread();
        const isThreadOwner = isThread && message.channel.ownerId === message.author.id;
        const isAdmin = message.member.permissions.has('Administrator');

        // Se não for Admin E não for o dono do tópico, bloqueia
        if (!isAdmin && !isThreadOwner) {
            setTimeout(() => message.delete().catch(() => {}), 1000);
            return message.reply({ 
                content: 'Apenas administradores ou o criador deste tópico podem remover membros.', 
                flags: [64] 
            });
        }

        const usuarioParaRemover = message.mentions.users.first();
        if (!usuarioParaRemover) return message.reply('Marque o usuário: `!remover @Nick`');

        const userIdRemover = `<@${usuarioParaRemover.id}>`;
        const dados = await getDadosTorre(message.channel.id);
        let removido = false;

        for (let [classe, lista] of dados.inscritos) {
            if (lista.includes(userIdRemover)) {
                dados.inscritos.set(classe, lista.filter(id => id !== userIdRemover));
                removido = true;
            }
        }

        if (removido) {
            await dados.save();
            const embed = await gerarEmbed(message.channel.id);
            await message.channel.send({ 
                content: `✅ ${usuarioParaRemover} foi removido por ${message.author}.`, 
                embeds: [embed], 
                components: gerarBotoes() 
            });
            await message.delete().catch(() => {});
        } else {
            message.reply('Este usuário não está na lista.');
        }
    }
    
    // COMANDO: !data DD/MM/AAAA HH:MM
    if (message.content.startsWith('!data')) {
        const args = message.content.split(' ');
        if (args.length < 3) return message.reply('Use: `!data DD/MM/AAAA HH:MM`');

        const [dia, mes, ano] = args[1].split('/');
        const [hora, min] = args[2].split(':');

        // Criamos a data forçando o fuso horário de Brasília/Piauí
        const dataString = `${ano}-${mes}-${dia}T${hora}:${min}:00-03:00`;
        const novaData = new Date(dataString);

        if (isNaN(novaData)) {
            return message.reply('❌ Formato inválido! Use DD/MM/AAAA HH:MM');
        }

        const dados = await getDadosTorre(message.channel.id);
        dados.dataEvento = novaData;
        await dados.save();

        message.reply(`✅ Evento marcado! O cronômetro no \`!torre\` agora atualizará em tempo real.`);
        // Apaga o comando !data para limpar o chat
        setTimeout(() => message.delete().catch(() => {}), 2000);
    }

    // COMANDO: !ajuda
    if (message.content === '!ajuda') {
        const embedAjuda = new EmbedBuilder()
            .setTitle('📖 Guia de Operação - Organizador de Torre')
            .setDescription('Siga o roteiro abaixo para organizar sua subida com eficiência:')
            .setColor('#ffffff')
            .addFields(
                { 
                    name: '🚀 Roteiro de Organização (Passo a Passo)', 
                    value: '1️⃣ **Defina o Horário:** Use `!data DD/MM/AAAA HH:MM` para marcar o início. (Horário de Brasília)\n' +
                           '2️⃣ **Inicie a Chamada:** Use `!torre` para gerar o painel de classes.\n' +
                           '3️⃣ **Aguarde as Inscrições:** O cronômetro atualizará sozinho conforme o tempo passa.\n' +
                           '4️⃣ **Ajustes:** Use `!remover @Nick` se precisar liberar alguma vaga manualmente.'
                },
                { 
                    name: '🎮 Comandos de Jogador', 
                    value: '• `!torre` - Mostra o painel de inscrição atual.\n' +
                           '• **Botão Sair:** Remove você da classe que escolheu.'
                },
                { 
                    name: '🛠️ Comandos de Líder (Dono do Tópico ou Admin)', 
                    value:  '• `!data` - Define/Altera o horário do evento.\n' +
                            '• `!remover @Nick` - Retira um membro da vaga ocupada.\n' +
                            '• **Botão Resetar:** Limpa todas as vagas daquela torre.'
                },
                { 
                    name: '💡 Dicas de Ouro', 
                    value:  '• Crie um **Tópico Novo** para cada torre (assim as listas não se misturam).\n' +
                            '• As cores do painel mudam: 🔵 (Longe), 🟡 (Faltam 2h), 🔴 (Atrasado).\n' +
                            '• O sistema limpa automaticamente listas de eventos passados.'
                }
            )
            .setFooter({ text: 'Sistema de Apoio ao Clã - Versão Final' });

        await message.channel.send({ embeds: [embedAjuda] });
    
        // Apaga o comando !ajuda após 30 segundos para manter o chat limpo
        setTimeout(() => message.delete().catch(() => {}), 30000);
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