require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, User } = require('discord.js');
const mongoose = require('mongoose');
const http = require('http');

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
    criadorId: String,
    tipoInstancia: { type: String, default: 'et' },
    dataEvento: { type: Date, default: null },
    alertasEnviados: { type: [String], default: [] },
    ultimaMensagemId: { type: String, default: null },
    ultimaDataMsgId: { type: String, default: null },
    inscritos: { type: Map, of: [String], default: {} }
});

const Instancia = mongoose.model('Instancia', InstanciaSchema);

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences
    ] 
});

const CONFIG_INSTANCIAS = {
    et: {
        nome: "Endless Tower (ET)",
        emoji: "🗼",
        limiteGrupo: 12,
        cor: "#3498db",
        classes: {
            'Sniper': { limite: 5, emoji: '🏹' },
            'HP': { limite: 2, emoji: '✝️' },
            'Bragi': { limite: 1, emoji: '🎻' },
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
        limiteGrupo: 12,
        cor: "#8e44ad",
        classes: {
            'Sniper': { limite: 4, emoji: '🏹' },
            'HP': { limite: 2, emoji: '✝️' },
            'Bragi': { limite: 1, emoji: '🎻' },
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
        limiteGrupo: 12,
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
            'Leecher': { limite: 2, emoji: '👶' },
            'Reserva': { limite: 5, emoji: '⏳' }
        }
    },
    celine: {
        nome: "HTF (Celine)",
        emoji: "🧸",
        limiteGrupo: 5,
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
    if (!dataEvento) return "📅 **Data ainda não definida.** Use `/data DD/MM HH:MM`";
    const timestampUnix = Math.floor(dataEvento.getTime() / 1000);
    return `📌 **Início:** <t:${timestampUnix}:F>\n⏳ **Contagem:** <t:${timestampUnix}:R>`;
}

async function enviarPainelAtualizado(channel) {
    const dados = await Instancia.findOne({ eventoId: channel.id });
    if (!dados) return;
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
            { m: 60,   nome: '1h' }
        ];
        for (const g of gatilhos) {
            if (diffMinutos <= g.m && diffMinutos > (g.m - 10) && !evento.alertasEnviados.includes(g.nome)) {
                const canal = await client.channels.fetch(evento.eventoId).catch(() => null);
                if (canal) {
                    let mencoes = "";
                    evento.inscritos.forEach(lista => lista.forEach(id => { if (!mencoes.includes(id)) mencoes += `${id} `; }));
                    await canal.send(`🔔 **ALERTA DE ${g.nome}!**\n📍 A **${CONFIG_INSTANCIAS[evento.tipoInstancia].nome}** começará em ${g.nome}!\n👥 Participantes: ${mencoes}\n💡 *Dica: Digite **/checklist** para ver os itens e equipamentos obrigatórios.*`);
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
    if (!dados) return new EmbedBuilder().setTitle("❌ Instância não configurada. Volte ao **#instâncias** e use /criar para iniciar.");

    const infoInstancia = CONFIG_INSTANCIAS[dados.tipoInstancia];
    const contagemTexto = calcularContagem(dados.dataEvento);
    const limiteMaximo = infoInstancia.limiteGrupo || 12;

    let totalInscritos = 0;
    dados.inscritos.forEach((lista, classe) => {
        if (classe !== 'Reserva') {
            totalInscritos += lista.length;
        }
    });

    const statusGrupo = totalInscritos >= limiteMaximo ? "🔴 GRUPO CHEIO" : "🟢 VAGAS ABERTAS";

    let corEmbed = infoInstancia.cor; 
    if (dados.dataEvento) {
        const agora = new Date();
        const diff = dados.dataEvento - agora;
        if (diff <= 0) corEmbed = '#ff0000';
        else if (diff <= 2 * 60 * 60 * 1000) corEmbed = '#f1c40f';
    }

    let nomeLider = "Não definido";
    if (dados.criadorId) {
        const membro = client.users.cache.get(dados.criadorId);
        nomeLider = membro ? membro.username : `ID: ${dados.criadorId}`;
    }

    const embed = new EmbedBuilder()
        .setTitle(`${infoInstancia.emoji} ${infoInstancia.nome} - Inscrição`)
        .setDescription(`${contagemTexto}\n\n**Status do Grupo:** ${statusGrupo} (${totalInscritos}/${limiteMaximo})\n\nSelecione sua classe abaixo.`)
        .setColor(corEmbed)
        .setFooter({ text: `ID: ${idDoCanal} | Líder do Grupo: ${nomeLider}` });

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
        new ButtonBuilder().setCustomId('reset').setLabel('Resetar [Admin]').setStyle(ButtonStyle.Primary)
    ));
    return rows;
}

client.once('ready', async () => {
    console.log(`🚀 Bot online como ${client.user.tag}`);

    const comandos = [
        {
            name: 'painel',
            description: 'Gera ou atualiza o painel de vagas neste tópico'
        },
        {
            name: 'data',
            description: 'Define a data e hora (Ex: 05/04 19:30)',
            options: [
                { 
                    name: 'quando', 
                    type: 3, 
                    description: 'Digite no formato DD/MM HH:MM', 
                    required: true 
                }
            ]
        },
        {
            name: 'criar',
            description: 'Cria um novo tópico para organizar uma instância',
            options: [
                { 
                    name: 'instancia', 
                    type: 3, 
                    description: 'Qual instância será organizada?', 
                    required: true,
                    choices: [
                        { name: 'Endless Tower (ET)', value: 'et' },
                        { name: 'Endless Cellar (EC)', value: 'ec' },
                        { name: 'PT de Galho Seco', value: 'galho' },
                        { name: 'HTF (Celine)', value: 'celine' }
                    ]
                },
                { 
                    name: 'titulo', 
                    type: 3, 
                    description: 'Nome do tópico (ex: ET - 05/04 - 16h)', 
                    required: true 
                }
            ]
        },
        {
            name: 'checklist',
            description: 'Exibe os itens e equipamentos obrigatórios para a instância atual'
        },
        {
            name: 'ajuda',
            description: 'Exibe o manual de instruções do bot'
        },
        {
            name: 'adicionar',
            description: 'Adiciona manualmente um membro a uma classe',
            options: [
                { name: 'usuario', type: 6, description: 'Membro a ser adicionado', required: true },
                { name: 'classe', type: 3, description: 'Escolha a classe', required: true, autocomplete: true }
            ]
        },
        {
            name: 'remover',
            description: 'Remove um usuário de uma classe',
            options: [
                { name: 'usuario', type: 6, description: 'Usuário a ser removido', required: true }
            ]
        },
        {
            name: 'lider',
            description: 'Transfere a liderança da instância para outro jogador',
            options: [
                { name: 'usuario', type: 6, description: 'Selecione o novo líder do grupo', required: true }
            ]
        }
    ];

    await client.application.commands.set(comandos);
    console.log('✅ Slash Commands registrados!');
});

client.on('interactionCreate', async interaction => {
    const canalId = interaction.channel.id;
    const userId = `<@${interaction.user.id}>`;
    const dados = await Instancia.findOne({ eventoId: canalId });

    if (interaction.isAutocomplete()) {
        if (interaction.commandName === 'adicionar') {
            const canalId = interaction.channel.id;
            const dados = await Instancia.findOne({ eventoId: canalId });

            if (!dados || !CONFIG_INSTANCIAS[dados.tipoInstancia]) return interaction.respond([]);

            const focusedValue = interaction.options.getFocused();
            const classesDisponiveis = Object.keys(CONFIG_INSTANCIAS[dados.tipoInstancia].classes);

            const filtradas = classesDisponiveis.filter(escolha => 
                escolha.toLowerCase().includes(focusedValue.toLowerCase())
            );

            return interaction.respond(
                filtradas.slice(0, 25).map(escolha => ({ name: escolha, value: escolha }))
            );
        }
    }


    if (interaction.isChatInputCommand()) {
        let dados = await Instancia.findOne({ eventoId: canalId });
        if (interaction.commandName === 'painel') {
            await interaction.deferReply({ ephemeral: true });
            if (!dados) return interaction.editReply({ content: '❌ Use `/criar` primeiro!', ephemeral: true });

            const isDono = interaction.user.id === dados.criadorId;
            const isAdm = interaction.member.permissions.has('Administrator');

            if (!isDono && !isAdm) {
                return interaction.editReply({ content: '❌ Apenas o Líder do Grupo ou ADMs podem gerar o painel.', ephemeral: true });
            }

            await interaction.editReply({ content: '🔄 Gerando painel de vagas...', ephemeral: true });
            await enviarPainelAtualizado(interaction.channel);
        }

        if (interaction.commandName === 'data') {
            await interaction.deferReply({ ephemeral: true });
            const canalId = interaction.channel.id;
            const entrada = interaction.options.getString('quando');
            const formatoValido = /^(\d{2})\/(\d{2})\s(\d{2}):(\d{2})$/;
            const match = entrada.match(formatoValido);
            const dados = await Instancia.findOne({ eventoId: canalId });

            if (!match) {
                return interaction.editReply({ 
                    content: '❌ Formato inválido! Use: **DD/MM HH:MM** (Ex: 05/04 19:30)', 
                    ephemeral: true 
                });
            }

            const [_, dia, mes, hora, minuto] = match;
            const ano = new Date().getFullYear();
            const dataString = `${ano}-${mes}-${dia}T${hora}:${minuto}:00-03:00`;
            const novaData = new Date(dataString);

            if (isNaN(novaData.getTime())) {
                return interaction.editReply({ content: '❌ Data ou hora numericamente inválida!', ephemeral: true });
            }

            if (!dados) return interaction.editReply({ content: '❌ Instância não encontrada.', ephemeral: true });
            
            if (interaction.user.id !== dados.criadorId && !interaction.member.permissions.has('Administrator')) {
                return interaction.editReply({ content: '❌ Sem permissão para alterar a data.', ephemeral: true });
            }

            if (dados.ultimaDataMsgId) {
                try {
                    const msgAntiga = await interaction.channel.messages.fetch(dados.ultimaDataMsgId);
                    if (msgAntiga) await msgAntiga.delete();
                } catch (err) { /* Mensagem já deletada */ }
            }

            dados.dataEvento = novaData;
            dados.alertasEnviados = [];
            await dados.save();

            const timestamp = Math.floor(novaData.getTime() / 1000);
            const msgAnuncio = await interaction.channel.send(
                `📢 **A instância ${CONFIG_INSTANCIAS[dados.tipoInstancia].nome} foi MARCADA!**\n` +
                `📅 **Início:** <t:${timestamp}:F>\n` +
                `⚠️ <@&1100422246998233199>, inscrevam-se!`
            );

            dados.ultimaDataMsgId = msgAnuncio.id;
            await dados.save();

            await interaction.editReply({ content: '✅ Horário atualizado com sucesso!', ephemeral: true });
            await enviarPainelAtualizado(interaction.channel);
        }

        if (interaction.commandName === 'criar') {
            await interaction.deferReply({ ephemeral: true });
            const tipoSelecionado = interaction.options.getString('instancia');
            const titulo = interaction.options.getString('titulo');
            
            try {
                const topico = await interaction.channel.threads.create({
                    name: titulo,
                    type: interaction.channel.type === 0 ? 11 : 12, 
                    reason: 'Organização de Instância pelo bot',
                });

                const novaInstancia = new Instancia({
                    eventoId: topico.id,
                    tipoInstancia: tipoSelecionado,
                    inscritos: new Map(),
                    criadorId: interaction.user.id,
                    alertasEnviados: []
                });

                await novaInstancia.save();

                await topico.members.add(interaction.user.id);
                await interaction.editReply({ 
                    content: `✅ Tópico **${titulo}** criado com sucesso! <#${topico.id}>`, 
                    ephemeral: true 
                });

                await topico.send({ 
                    content: `👋 Olá <@${interaction.user.id}>! Este tópico está pronto para a organizar a instância **${CONFIG_INSTANCIAS[tipoSelecionado].nome}**.\nUse /data para marcar o dia e horário da sua instância.\nEm seguida, automaticamente será gerado o painel de vagas da instância para você escolher sua vaga.\nObs.: se usado, o comando /painel gera um painel nas mensagens mais recentes do tópico.`
                });

            } catch (error) {
                console.error('Erro ao criar tópico:', error);
                await interaction.editReply({ content: '❌ Erro ao criar o tópico. Verifique minhas permissões!', ephemeral: true });
            }
        }

        if (interaction.commandName === 'checklist') {
            await interaction.deferReply({ ephemeral: true });
            if (!dados) return interaction.editReply({ content: '❌ Instância não configurada. Use /criar primeiro.', ephemeral: true });
            const embed = new EmbedBuilder();
            if (dados.tipoInstancia === 'et') {
                embed.setTitle('🎒 Checklist de Suprimentos - Torre Sem Fim')
                    .setDescription('Preparem seus estoques! A falta de um item pode causar o wipe do grupo.')
                    .setColor('#e67e22')
                    .addFields(
                        { name: '🛡️ Equipamentos Obrigatórios (Todos)', value: '• Armaduras: com cartas MARC e PASANA (ED proibida!)\n• Capa: Nyd com Raydric ou Noxious p/ uso na Valk e Ifrit.\n• Cabeça: com carta Nightmare (ou Pet Nightmare Terror) e carta Giearth.\n• Acessórios: com carta Alligator p/ uso na Valk e Ifrit.' },
                        { name: '🧪 Consumíveis Gerais', value: '• 25 Panaceas | 10 Ygg Leafs | 15 Scrolls de Mercenário (level 1 já serve)\n• Itens de HP/SP e 500k em Zeny para gastos locais.\n📍 *Scrolls: /navi prontera 42/336*' },
                        { name: '🧙 Suportes (Gemas/Água)', value: '• **HP:** 250+ Blue Gemstone | 70+ Holy Water\n• **Prof:** 100+ Blue Gemstone | 100+ Yellow Gemstone' },
                        { name: '🏹 Snipers', value: '• 15+ Conversores (cada elemento) | 20+ Cursed Water\n• 2k Flecha Imaterial | 100 Traps' },
                        { name: '🛡️ Escudos Especiais (p/ quem usa)', value: '• Escudo com carta Medusa (Exceto Devo e CF)\n• Escudo com cartas Tatacho ou Hodremlin\n• Escudo com carta Alice' }
                    )
                    .setFooter({ text: '💡 Dica: Use o RODEX para enviar itens e economizar peso!' });
            } 
            
            else if (dados.tipoInstancia === 'ec') {
                embed.setTitle('🎒 Checklist de Suprimentos - Endless Cellar (EC)')
                    .setDescription('Itens vitais para a sobrevivência nas profundezas da Cellar.')
                    .setColor('#8e44ad')
                    .addFields(
                        { name: '🛡️ Essenciais para TODOS', value: '• Armadura com Marc (ED proibida!)\n• Elmo com Nightmare (ou Pet Nightmare Terror)\n• 20+ Panaceas | 10 Folhas de Ygg | 500k Zeny\n• Suprimentos de HP e SP' },
                        { name: '🛡️ Classes com Escudo', value: '• Medusa (Exceto Devo/CF) | Tatacho (ou Hodremlin) | Alice' },
                        { name: '🏹 Snipers', value: '• Dragon Wing (Nyd) | Arco da BG (Bio3)\n• 2k+ Immaterial Arrow | Falcon Assault na barra\n• 10 Conversores (Wind/Earth/Water) | 20+ Fire' },
                        { name: '🧪 Creator & Suportes', value: '• **Creator:** 150+ ADs | 30+ Glistening Coats\n• **HP:** 200+ Blue Gemstone | 50+ Holy Water\n• **Prof:** 150+ Blue Gemstone | 100+ Yellow Gemstone' }
                    )
                    .setFooter({ text: '💡 Dica: Use o RODEX para enviar itens e economizar peso!' });
            }

            else if (dados.tipoInstancia === 'celine') {
                embed.setTitle('🎒 Checklist de Suprimentos - HTF (Celine)')
                    .setDescription('Prepare-se para enfrentar os horrores da Fábrica de Brinquedos.')
                    .setColor('#e74c3c')
                    .addFields(
                        { name: '🛡️ Essenciais para TODOS', value: '• 20+ Panaceas | 10 Folhas de Ygg\n• 5 Fireproof Potion | Itens de HP/SP' },
                        { name: '🎭 Suportes (HP/Bragi/Dancer)', value: '• Armadura com Pasana | Escudo com Medusa\n• Elmo com Nightmare (ou Pet Nightmare Terror)\n• **HP:** 150+ Blue Gemstone | 10+ Holy Water' },
                        { name: '🏹 Sniper', value: '• 1k Immaterial Arrow | Elmo com Nightmare\n• Sniper Suit com Pasana | Arco MVP Ghost (2 AK / 2 Mao Guai)' }
                    )
                    .setFooter({ text: '💡 Dica: Use o RODEX para enviar itens e economizar peso!' });
            }

            else if (dados.tipoInstancia === 'galho') {
                embed.setTitle('🎒 Checklist de Suprimentos - PT de Galho Seco')
                    .setDescription('Itens para garantir o sustain durante os galhos.')
                    .setColor('#2ecc71')
                    .addFields(
                        { name: '📦 Essenciais para TODOS', value: '• 25+ Panaceas | 2 Folhas de YGG\n• Itens de recuperação de SP' },
                        { name: '🧙 Suportes', value: '• **Prof:** 100+ Blue Gemstone | 100+ Yellow Gemstone | 50+ Cobweb\n• **HP:** 150+ Blue Gemstone' }
                    )
                    .setFooter({ text: '💡 Dica: Use o RODEX para enviar itens e economizar peso!' });
            }

            await interaction.editReply({ embeds: [embed] });
        }

        if (interaction.commandName === 'adicionar') {
            await interaction.deferReply({ ephemeral: true });

            const canalId = interaction.channel.id;
            const dados = await Instancia.findOne({ eventoId: canalId });

            if (!dados) {
                return interaction.editReply({ content: '❌ Nenhuma instância ativa neste tópico.' });
            }

            const isDono = interaction.user.id === dados.criadorId;
            const isAdm = interaction.member.permissions.has('Administrator');

            if (!isDono && !isAdm) {
                return interaction.editReply({ 
                    content: '❌ Apenas o **Líder do Grupo** que criou este tópico ou um **ADM** podem adicionar membros manualmente.'
                });
            }

            const targetUser = interaction.options.getUser('usuario');
            const targetId = `<@${targetUser.id}>`;
            
            const classeEscolhida = interaction.options.getString('classe');
            const infoInstancia = CONFIG_INSTANCIAS[dados.tipoInstancia];
            if (!infoInstancia.classes[classeEscolhida]) {
                return interaction.editReply({ 
                    content: `❌ A classe **${classeEscolhida}** não existe na configuração de ${infoInstancia.nome}.`
                });
            }

            const lista = dados.inscritos.get(classeEscolhida) || [];
            
            let jaInscrito = false;
            dados.inscritos.forEach(l => { if (l.includes(targetId)) jaInscrito = true; });

            if (jaInscrito) {
                return interaction.editReply({ content: '❌ Este usuário já está inscrito em uma classe!' });
            }

            if (lista.length >= infoInstancia.classes[classeEscolhida].limite) {
                return interaction.editReply({ content: '❌ Esta classe já está cheia!' });
            }

            lista.push(targetId);
            dados.inscritos.set(classeEscolhida, lista);
            
            await dados.save();

            await interaction.editReply({ content: `✅ ${targetUser.username} adicionado como **${classeEscolhida}**!` });
            
            await enviarPainelAtualizado(interaction.channel);
        }

        if (interaction.commandName === 'remover') {
            await interaction.deferReply({ ephemeral: true });
            if (!dados) return interaction.editReply({ content: '❌ Nenhuma instância ativa neste tópico.', ephemeral: true });
            if (interaction.user.id !== dados.criadorId && !interaction.member.permissions.has('Administrator')) {
                return interaction.editReply({ content: '❌ Apenas o Líder ou ADMs podem remover membros manualmente.', ephemeral: true });
            }
            
            const targetUser = interaction.options.getUser('usuario');
            const targetId = `<@${targetUser.id}>`;

            let removido = false;
            dados.inscritos.forEach((lista, classe) => {
                if (lista.includes(targetId)) {
                    const novaLista = lista.filter(id => id !== targetId);
                    dados.inscritos.set(classe, novaLista);
                    removido = true;
                }
            });

            if (!removido) {
                return interaction.editReply({ content: `❌ O usuário ${targetUser.username} não foi encontrado em nenhuma vaga.`, ephemeral: true });
            }

            await dados.save();
            await interaction.editReply({ content: `✅ ${targetUser.username} foi removido da instância com sucesso!`, ephemeral: true });
            await enviarPainelAtualizado(interaction.channel);
        }

        if (interaction.commandName === 'ajuda') {
            await interaction.deferReply({ ephemeral: true });
            const embedAjuda = new EmbedBuilder()
                .setTitle('📖 Guia de Operação - Organizador de Instâncias')
                .setDescription('Siga o roteiro abaixo para organizar sua instância com eficiência:')
                .setColor('#ffffff')
                .addFields(
                    { 
                        name: '🚀 Roteiro de Organização (Passo a Passo)', 
                        value: '1️⃣ **Crie o Tópico:** Com o **#instâncias** aberto use o comando `/criar` e escolha qual instância vai abrir (ET, EC, PT de Galho ou Celine).\n' +
                            '2️⃣ **Defina um título:** Ainda no `/criar` defina um título para seu tópico (por ex.: Galho - 20/03 - 20h).\n' +
                            '3️⃣ **Defina o Horário:** Use `/data` preenchendo os campos no formato DD/MM HH:MM para marcar o início.\n' +
                            '4️⃣ **Escolha sua classe:** Automaticamente o comando `/painel` é disparado e o painel de classes é gerado para você e os outros fazerem suas escolhas.'
                    },
                    { 
                        name: '🎮 Comandos de Jogador', 
                        value: '• **/ajuda** - Visualiza todas as informações acerca da utilidade do bot.\n' +
                            '• **/checklist** - Mostra os itens e equipamentos obrigatórios para a instância atual.\n' +
                            '• **Botão Classe:** Clique para ocupar uma vaga principal no grupo.\n' +
                            '• **Botão Reserva:** Entre na fila de espera se as vagas encherem.\n' +
                            '• **Botão Sair:** Remove você mesmo da lista automaticamente.'
                    },
                    { 
                        name: '🛠️ Comandos de Líder ou Moderadores', 
                        value: '• **/data** - Define ou altera o horário do evento.\n' +
                            '• **/painel** - Gera o painel de inscrição. Obs.: use sempre que quiser chamar o painel p/ mensagens recentes.\n' +
                            '• **/adicionar** - Selecione o usuário e a classe para colocar alguém direto na vaga.\n' +
                            '• **/remover** - Retira um membro da vaga ocupada através da seleção de usuário.\n' +
                            '• **/lider** - Transfere a liderança do grupo de um membro para outro.\n' +
                            '• **Botão Resetar:** Limpa todas as vagas da instância atual.'
                    },
                    { 
                        name: '💡 Dicas de Ouro', 
                        value: '• Crie um **Tópico Novo** para cada instância para não misturar as listas.\n' +
                            '• As cores do painel mudam: 🔵 (Longe), 🟡 (Faltam 2h), 🔴 (Atrasado).\n' +
                            '• Use o comando **/checklist** logo após marcar a data para orientar o grupo.\n' +
                            '• O painel informa visualmente se o grupo tem vagas através de: 🔴 GRUPO CHEIO ou 🟢 VAGAS ABERTAS.\n' +
                            '• O sistema de alertas avisa o grupo automaticamente 24h, 3h e 1h antes.'
                    }
                )
                .setFooter({ text: 'Sistema de Apoio ao Clã criado por André Luís' });

            await interaction.editReply({ embeds: [embedAjuda], ephemeral: true });
        }

        if (interaction.commandName === 'lider') {
            await interaction.deferReply({ ephemeral: true });
            const canalId = interaction.channel.id;
            const dados = await Instancia.findOne({ eventoId: canalId });
            if (!dados) {
                return interaction.editReply({ content: '❌ Não há uma instância ativa neste tópico.', ephemeral: true });
            }

            const ehAdmin = interaction.member.permissions.has('Administrator');
            const ehLiderAtual = interaction.user.id === dados.criadorId;

            if (!ehAdmin && !ehLiderAtual) {
                return interaction.editReply({ 
                    content: '❌ Apenas o Líder do Grupo ou um Administrador podem transferir a liderança.', 
                    ephemeral: true 
                });
            }

            const novoLider = interaction.options.getUser('usuario');

            if (novoLider.id === dados.criadorId) {
                return interaction.editReply({ content: '❌ Este usuário já é o líder atual.', ephemeral: true });
            }
            if (novoLider.bot) {
                return interaction.editReply({ content: '❌ Você não pode transferir a liderança para um bot.', ephemeral: true });
            }

            dados.criadorId = novoLider.id;
            await dados.save();

            await interaction.editReply({ 
                content: `👑 **Transferência de Liderança**\nO usuário <@${interaction.user.id}> passou o comando do grupo para **${novoLider.username}**!` 
            });

            try {
                const embedAtualizado = await gerarEmbed(canalId);
                const canalOriginal = await client.channels.fetch(interaction.channel.parentId);
                
                if (canalOriginal) {
                    const msgPainel = await canalOriginal.messages.fetch(dados.painelId);
                    if (msgPainel && typeof msgPainel.edit === 'function') {
                        await msgPainel.edit({ embeds: [embedAtualizado] });
                    }
                }
            } catch (err) {
                console.error("⚠️ Erro ao atualizar painel após troca de líder:", err.message);
            }
        }
    }

    if (interaction.isButton()) {
        await interaction.deferReply({ ephemeral: true });
        const dados = await Instancia.findOne({ eventoId: canalId });
        if (!dados) return;
        const tipoTecnico = dados.tipoInstancia?dados.tipoInstancia.toLowerCase():'et';
        const infoInstancia = CONFIG_INSTANCIAS[tipoTecnico];
        const limiteMaximo = infoInstancia?.limiteGrupo || 12;
        if (interaction.customId === 'sair') {
            dados.inscritos.forEach((l, k) => dados.inscritos.set(k, l.filter(id => id !== userId)));
        } else if (interaction.customId === 'reset') {
            if (!interaction.member.permissions.has('Administrator')) return interaction.editReply({ content: 'Apenas administradores podem resetar.', ephemeral: true });
            dados.inscritos = new Map();
        } else {
            const classe = interaction.customId.replace('insc_', '');
            if (classe !== 'Reserva') {
                let totalAtual = 0;
                dados.inscritos.forEach((lista, nomeClasse) => {
                    if (nomeClasse !== 'Reserva') totalAtual += lista.length;
                });

                if (totalAtual >= limiteMaximo) {
                    return interaction.editReply({ 
                        content: `❌ Este grupo já atingiu o limite de **${limiteMaximo}** pessoas. Inscreva-se como **Reserva**!`, 
                        ephemeral: true 
                    });
                }
            }
            
            const lista = dados.inscritos.get(classe) || [];
            let jaInscrito = false;
            dados.inscritos.forEach(l => { if (l.includes(userId)) jaInscrito = true; });

            if (jaInscrito) return interaction.editReply({ content: 'Você já está em uma classe!', ephemeral: true });
            if (lista.length >= CONFIG_INSTANCIAS[dados.tipoInstancia].classes[classe].limite) return interaction.editReply({ content: 'Esta classe está cheia!', ephemeral: true });

            lista.push(userId);
            dados.inscritos.set(classe, lista);
        }
        await dados.save();
        await interaction.update({ embeds: [await gerarEmbed(canalId)] });
    }
});

client.login(process.env.DISCORD_TOKEN);