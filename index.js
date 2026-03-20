require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
            'Leechers': { limite: 2, emoji: '👶' },
            'Reserva': { limite: 5, emoji: '⏳' }
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
                    await canal.send(`🔔 **ALERTA DE ${g.nome}!**\n📍 A **${CONFIG_INSTANCIAS[evento.tipoInstancia].nome}** começará em breve!\n👥 Participantes: ${mencoes}!\n💡 *Dica: Digite **/checklist** para ver os itens e equipamentos obrigatórios.*`);
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
        new ButtonBuilder().setCustomId('reset').setLabel('Resetar [Admin]').setStyle(ButtonStyle.Primary)
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
            description: 'Adiciona manualmente um usuário a uma classe',
            options: [
                { name: 'usuario', type: 6, description: 'Usuário a ser adicionado', required: true },
                { name: 'classe', type: 3, description: 'Nome da classe', required: true }
            ]
        },
        {
            name: 'remover',
            description: 'Remove um usuário de uma classe',
            options: [
                { name: 'usuario', type: 6, description: 'Usuário a ser removido', required: true }
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
            const tipoEscolhido = interaction.options.getString('instancia');
            
            let dados = await Instancia.findOne({ eventoId: canalId });

            if (dados && dados.tipoInstancia === tipoEscolhido) {
                await interaction.reply({ content: `🔄 Trazendo o painel de ${CONFIG_INSTANCIAS[tipoEscolhido].nome} para cá...`, ephemeral: true });
            } else {
                await Instancia.findOneAndUpdate(
                    { eventoId: canalId }, 
                    { 
                        tipoInstancia: tipoEscolhido, 
                        inscritos: new Map(), 
                        dataEvento: null, 
                        alertasEnviados: [] 
                    }, 
                    { upsert: true }
                );
                await interaction.reply({ content: `✅ Nova instância de ${CONFIG_INSTANCIAS[tipoEscolhido].nome} iniciada!`, ephemeral: true });
            }

            await enviarPainelAtualizado(interaction.channel);
        }

        if (interaction.commandName === 'data') {
            const entrada = interaction.options.getString('quando');
            const formatoValido = /^(\d{2})\/(\d{2})\s(\d{2}):(\d{2})$/;
            const match = entrada.match(formatoValido);

            if (!match) {
                return interaction.reply({ 
                    content: '❌ Formato inválido! Use: **DD/MM HH:MM** (Ex: 05/04 19:30)', 
                    ephemeral: true 
                });
            }

            const [_, dia, mes, hora, minuto] = match;
            const ano = new Date().getFullYear();
            const dataString = `${ano}-${mes}-${dia}T${hora}:${minuto}:00-03:00`;
            const novaData = new Date(dataString);

            if (isNaN(novaData.getTime())) {
                return interaction.reply({ content: '❌ Data ou hora numericamente inválida!', ephemeral: true });
            }

            const dados = await Instancia.findOne({ eventoId: interaction.channel.id });
            if (!dados) return interaction.reply({ content: '❌ Use /abrir primeiro!', ephemeral: true });

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

            await interaction.reply({ content: '✅ Horário atualizado com sucesso!', ephemeral: true });
            await enviarPainelAtualizado(interaction.channel);
        }

        if (interaction.commandName === 'criar') {
            const titulo = interaction.options.getString('titulo');
            
            try {
                const topico = await interaction.channel.threads.create({
                    name: titulo,
                    autoArchiveDuration: 2880,
                    reason: 'Organização de Instância pelo bot',
                });

                await topico.members.add(interaction.user.id);

                await interaction.reply({ 
                    content: `✅ Tópico **${titulo}** criado com sucesso! <#${topico.id}>`, 
                    ephemeral: true 
                });

                await topico.send({ 
                    content: `👋 Olá <@${interaction.user.id}>! Este tópico está pronto para a organização.\nUse \`/abrir\` para gerar o painel de vagas da instância desejada. \nEm seguida use \`/data\` para marcar o horário.`
                });

            } catch (error) {
                console.error('Erro ao criar tópico:', error);
                await interaction.reply({ content: '❌ Erro ao criar o tópico. Verifique minhas permissões!', ephemeral: true });
            }
        }

        if (interaction.commandName === 'checklist') {
            const dados = await Instancia.findOne({ eventoId: canalId });
            if (!dados) return interaction.reply({ content: '❌ Instância não configurada. Use /abrir primeiro.', ephemeral: true });

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
                    );
            }

            else if (dados.tipoInstancia === 'celine') {
                embed.setTitle('🎒 Checklist de Suprimentos - HTF (Celine)')
                    .setDescription('Prepare-se para enfrentar os horrores da Fábrica de Brinquedos.')
                    .setColor('#e74c3c')
                    .addFields(
                        { name: '🛡️ Essenciais para TODOS', value: '• 20+ Panaceas | 10 Folhas de Ygg\n• 5 Fireproof Potion | Itens de HP/SP' },
                        { name: '🎭 Suportes (HP/Bragi/Dancer)', value: '• Armadura com Pasana | Escudo com Medusa\n• Elmo com Nightmare (ou Pet Nightmare Terror)\n• **HP:** 150+ Blue Gemstone | 10+ Holy Water' },
                        { name: '🏹 Sniper', value: '• 1k Immaterial Arrow | Elmo com Nightmare\n• Sniper Suit com Pasana | Arco MVP Ghost (2 AK / 2 Mao Guai)' }
                    );
            }

            else if (dados.tipoInstancia === 'galho') {
                embed.setTitle('🎒 Checklist de Suprimentos - PT de Galho Seco')
                    .setDescription('Itens para garantir o sustain durante os galhos.')
                    .setColor('#2ecc71')
                    .addFields(
                        { name: '📦 Essenciais para TODOS', value: '• 25+ Panaceas | 2 Folhas de YGG\n• Itens de recuperação de SP' },
                        { name: '🧙 Suportes', value: '• **Prof:** 100+ Blue Gemstone | 100+ Yellow Gemstone | 50+ Cobweb\n• **HP:** 150+ Blue Gemstone' }
                    );
            }

            await interaction.reply({ embeds: [embed] });
        }

        if (interaction.commandName === 'adicionar') {
            const targetUser = interaction.options.getUser('usuario');
            const targetId = `<@${targetUser.id}>`;
            let classeDigitada = interaction.options.getString('classe').trim();
            let classeFormatada = classeDigitada.charAt(0).toUpperCase() + classeDigitada.slice(1).toLowerCase();
            
            if (classeDigitada.length <= 2) {
                classeFormatada = classeDigitada.toUpperCase();
            }
            // Casos específicos manuais se necessário (ex: Bragi) APENAS UM EXEMPLO PODE SER DESATIVADO
            if (classeFormatada === 'Bragi') classeFormatada = 'Bragi'; 

            const dados = await Instancia.findOne({ eventoId: canalId });
            if (!dados) return interaction.reply({ content: '❌ Use /abrir primeiro!', ephemeral: true });

            const infoInstancia = CONFIG_INSTANCIAS[dados.tipoInstancia];
            if (!infoInstancia.classes[classeFormatada]) {
                return interaction.reply({ 
                    content: `❌ a classe **${classeFormatada}** não existe na configuração de ${infoInstancia.nome}.`, 
                    ephemeral: true 
                });
            }

            const lista = dados.inscritos.get(classeFormatada) || [];
            
            let jaInscrito = false;
            dados.inscritos.forEach(l => { if (l.includes(targetId)) jaInscrito = true; });
            if (jaInscrito) return interaction.reply({ content: '❌ Este usuário já está inscrito em uma classe!', ephemeral: true });

            if (lista.length >= infoInstancia.classes[classeFormatada].limite) {
                return interaction.reply({ content: '❌ Esta classe já está cheia!', ephemeral: true });
            }

            lista.push(targetId);
            dados.inscritos.set(classeFormatada, lista);
            await dados.save();
            await interaction.reply({ content: `✅ ${targetUser.username} adicionado como **${classeFormatada}**!`, ephemeral: true });
            await enviarPainelAtualizado(interaction.channel);
        }

        if (interaction.commandName === 'remover') {
            const targetUser = interaction.options.getUser('usuario');
            const targetId = `<@${targetUser.id}>`;
            const canalId = interaction.channel.id;

            const dados = await Instancia.findOne({ eventoId: canalId });
            if (!dados) return interaction.reply({ content: '❌ Nenhuma instância ativa neste tópico.', ephemeral: true });

            let removido = false;
            dados.inscritos.forEach((lista, classe) => {
                if (lista.includes(targetId)) {
                    const novaLista = lista.filter(id => id !== targetId);
                    dados.inscritos.set(classe, novaLista);
                    removido = true;
                }
            });

            if (!removido) {
                return interaction.reply({ content: `❌ O usuário ${targetUser.username} não foi encontrado em nenhuma vaga.`, ephemeral: true });
            }

            await dados.save();
            await interaction.reply({ content: `✅ ${targetUser.username} foi removido da instância com sucesso!`, ephemeral: true });
            await enviarPainelAtualizado(interaction.channel);
        }

        if (interaction.commandName === 'ajuda') {
            const embedAjuda = new EmbedBuilder()
                .setTitle('📖 Guia de Operação - Organizador de Instâncias')
                .setDescription('Siga o roteiro abaixo para organizar sua instância com eficiência:')
                .setColor('#ffffff')
                .addFields(
                    { 
                        name: '🚀 Roteiro de Organização (Passo a Passo)', 
                        value: '1️⃣ **Inicie a Chamada:** Use `/abrir` e escolha o tipo (ET, EC, Celine ou Galho).\n' +
                            '2️⃣ **Defina o Horário:** Use `/data` preenchendo os campos numéricos para marcar o início.\n' +
                            '3️⃣ **Aguarde as Inscrições:** O cronômetro e as cores do painel atualizarão sozinhos.\n' +
                            '4️⃣ **Faxina Automática:** O bot apaga painéis antigos para manter o chat limpo.'
                    },
                    { 
                        name: '🎮 Comandos de Jogador', 
                        value: '• **/abrir** - Gera o painel de inscrição se ainda não existir.\n' +
                            '• **/checklist** - Mostra os itens obrigatórios para a instância atual.\n' +
                            '• **Botão Classe:** Clique para ocupar uma vaga principal.\n' +
                            '• **Botão Reserva:** Entre na fila de espera se as vagas encherem.\n' +
                            '• **Botão Sair:** Remove você da lista automaticamente.'
                    },
                    { 
                        name: '🛠️ Comandos de Líder (Admin)', 
                        value: '• **/data** - Define ou altera o horário do evento.\n' +
                            '• **/adicionar** - Selecione o usuário e a classe para colocar alguém direto na vaga.\n' +
                            '• **/remover** - Retira um membro da vaga ocupada através da seleção de usuário.\n' +
                            '• **Botão Resetar:** Limpa todas as vagas da instância atual.'
                    },
                    { 
                        name: '💡 Dicas de Ouro', 
                        value: '• Crie um **Tópico Novo** para cada instância para não misturar as listas.\n' +
                            '• As cores do painel mudam: 🔵 (Longe), 🟡 (Faltam 2h), 🔴 (Atrasado).\n' +
                            '• Use o comando **/checklist** logo após marcar a data para orientar o grupo.\n' +
                            '• O sistema de alertas avisa o grupo automaticamente 24h, 3h e 1h antes.'
                    }
                )
                .setFooter({ text: 'Sistema de Apoio ao Clã criado por André Luís' });

            await interaction.reply({ embeds: [embedAjuda], ephemeral: true });
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