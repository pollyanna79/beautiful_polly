// Este arquivo coordena os formulários, os modais e a comunicação da página com a API.

/**
 * Inicializa os eventos da página depois que o navegador terminar de montar o HTML.
 */
function inicializarPagina() {
    const ambienteLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname) ||
        window.location.protocol === 'file:';
    const enderecoBaseApi = window.ENDERECO_BASE_API ||
        (ambienteLocal ? 'http://localhost:3000' : 'https://beautifulpolly-backend.vercel.app');
    const situacaoApi = document.getElementById('situacao-servicos');
    const formularioDados = document.getElementById('form-coleta-dados');
    const modalAgendamento = document.getElementById('modal-agendamento');
    const formularioConsulta = document.getElementById('form-consulta');
    const modalConsulta = document.getElementById('modal-consulta');
    const resultadoConsulta = document.getElementById('resultado-consulta');

    configurarEventosDosModais();
    window.controleDeServicos.inicializarCarrosseis();
    window.controleDeAgendamentos.configurarAgendamentos(
        enderecoBaseApi,
        window.controleDeServicos.gruposDeServicos
    );

    document.getElementById('botao-consultar-reserva').addEventListener('click', abrirModalDeConsulta);
    document.getElementById('botao-voltar-inicio').addEventListener('click', voltarAoInicio);
    formularioDados.addEventListener('submit', enviarAgendamento);
    formularioConsulta.addEventListener('submit', consultarReservas);
    carregarCatalogoDeServicos(enderecoBaseApi, situacaoApi);

    /**
     * Abre a consulta de reservas e posiciona o cursor no campo de busca.
     */
    function abrirModalDeConsulta() {
        modalConsulta.classList.remove('oculto');
        modalConsulta.setAttribute('aria-hidden', 'false');
        document.getElementById('busca-reserva').focus();
    }

    /**
     * Lê e remove espaços externos do valor de um campo do formulário pelo seu identificador.
     */
    function obterValorDoCampo(identificador) {
        return document.getElementById(identificador).value.trim();
    }

    /**
     * Valida e envia os dados da cliente e do horário selecionado para criar uma reserva na API.
     */
    async function enviarAgendamento(evento) {
        evento.preventDefault();
        const agendamentoPendente = window.controleDeAgendamentos.obterAgendamentoPendente();
        if (!agendamentoPendente) {
            alert('Selecione um serviço, uma data e um horário antes de continuar.');
            return;
        }

        const cidade = obterValorDoCampo('cliente-cidade');
        if (!window.controleDeAgendamentos.cidadesAtendidas.has(cidade)) {
            alert('No momento, atendemos somente Mauá, Santo André, São Caetano do Sul, Ribeirão Pires e Capuava.');
            return;
        }

        const botaoEnviar = formularioDados.querySelector('button[type="submit"]');
        botaoEnviar.disabled = true;
        botaoEnviar.textContent = 'Enviando...';
        const dadosDaCliente = {
            cliente_nome: obterValorDoCampo('cliente-nome'),
            telefone: obterValorDoCampo('cliente-telefone'),
            email: obterValorDoCampo('cliente-email'),
            endereco: obterValorDoCampo('cliente-endereco'),
            cpf: obterValorDoCampo('cliente-cpf'),
            cidade,
            cep: obterValorDoCampo('cliente-cep'),
            id_servico: agendamentoPendente.id_servico,
            data_agenda: agendamentoPendente.data_agenda
        };

        try {
            const resposta = await fetch(`${enderecoBaseApi}/tbl_clientes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dadosDaCliente)
            });
            const resultado = await resposta.json();
            if (!resposta.ok) {
                if (resposta.status === 409) atualizarHorariosDepoisDeConflito(agendamentoPendente);
                throw new Error(resultado.erro || 'Não foi possível concluir o agendamento.');
            }

            fecharModal(modalAgendamento);
            formularioDados.reset();
            window.controleDeAgendamentos.limparAgendamentoPendente();
            abrirModalDeAgradecimento();
        } catch (erro) {
            console.error('Erro ao criar agendamento:', erro);
            alert(erro.message || 'Erro de conexão com o servidor. Verifique se a API está em execução.');
        } finally {
            botaoEnviar.disabled = false;
            botaoEnviar.textContent = 'Confirmar agendamento';
        }
    }

    /**
     * Atualiza a disponibilidade quando outra reserva ocupa o horário durante o preenchimento do formulário.
     */
    function atualizarHorariosDepoisDeConflito(agendamentoPendente) {
        const sufixo = agendamentoPendente.grupo === 'manicure' ? 'unha' : agendamentoPendente.grupo;
        document.getElementById(`data-${sufixo}`).dispatchEvent(new Event('change'));
    }

    /**
     * Exibe a confirmacao da reserva e move o foco para o botao de retorno.
     */
    function abrirModalDeAgradecimento() {
        const modalAgradecimento = document.getElementById('modal-agradecimento');
        modalAgradecimento.classList.remove('oculto');
        modalAgradecimento.setAttribute('aria-hidden', 'false');
        document.getElementById('botao-voltar-inicio').focus();
    }

    /**
     * Consulta a API usando o nome completo ou o e-mail informado pela cliente.
     */
    async function consultarReservas(evento) {
        evento.preventDefault();
        const termoDeBusca = obterValorDoCampo('busca-reserva');
        resultadoConsulta.textContent = 'Buscando reservas...';

        try {
            const resposta = await fetch(
                `${enderecoBaseApi}/detalhe_agendamento?busca=${encodeURIComponent(termoDeBusca)}`
            );
            const resultado = await resposta.json();
            if (!resposta.ok) throw new Error(resultado.erro || 'Erro ao consultar reservas.');
            exibirResultadoDaConsulta(resultado);
        } catch (erro) {
            console.error('Erro ao consultar reservas:', erro);
            resultadoConsulta.textContent = erro.message || 'Não foi possível consultar as reservas.';
        }
    }

    /**
     * Renderiza as reservas encontradas sem inserir dados da API como HTML executavel.
     */
    function exibirResultadoDaConsulta(reservas) {
        resultadoConsulta.replaceChildren();
        if (!reservas.length) {
            resultadoConsulta.textContent = 'Nenhuma reserva encontrada para este nome ou e-mail.';
            return;
        }

        for (const reserva of reservas) {
            const cartao = document.createElement('article');
            cartao.className = 'resultado-reserva';
            const camposDaReserva = [
                ['Cliente', reserva.Nome],
                ['Serviço', reserva.Servico],
                ['Data/Hora', reserva.Data_servico ? new Date(reserva.Data_servico).toLocaleString('pt-BR') : ''],
                ['Profissional', reserva.Profissional]
            ];

            for (const [rotulo, valor] of camposDaReserva) {
                if (valor === undefined || valor === null || valor === '') continue;
                const linha = document.createElement('p');
                const destaque = document.createElement('strong');
                destaque.textContent = `${rotulo}: `;
                linha.append(destaque, document.createTextNode(String(valor)));
                cartao.append(linha);
            }

            resultadoConsulta.append(cartao);
        }
    }
}

/**
 * Registra os fechamentos por botão, clique no fundo do modal e tecla Escape.
 */
function configurarEventosDosModais() {
    for (const botaoFechar of document.querySelectorAll('.botao-fechar-modal')) {
        botaoFechar.addEventListener('click', fecharModalPeloBotao);
    }

    for (const modal of document.querySelectorAll('.modal')) {
        modal.addEventListener('click', fecharModalPeloFundo);
    }

    document.addEventListener('keydown', fecharModalPelaTeclaEscape);

    /**
     * Fecha o modal associado ao botão de fechar que recebeu o clique.
     */
    function fecharModalPeloBotao(evento) {
        fecharModal(evento.currentTarget.closest('.modal'));
    }

    /**
     * Fecha um modal ao clicar fora do conteúdo, mantendo aberta a confirmação final.
     */
    function fecharModalPeloFundo(evento) {
        const modal = evento.currentTarget;
        if (evento.target !== modal) return;
        if (modal.id === 'modal-agradecimento') voltarAoInicio();
        else fecharModal(modal);
    }

    /**
     * Fecha os modais com Escape e retorna ao início quando a reserva já foi confirmada.
     */
    function fecharModalPelaTeclaEscape(evento) {
        if (evento.key !== 'Escape') return;

        for (const modalAberto of document.querySelectorAll('.modal:not(.oculto)')) {
            if (modalAberto.id === 'modal-agradecimento') voltarAoInicio();
            else fecharModal(modalAberto);
        }
    }

}

/**
 * Esconde um modal e atualiza seu estado de acessibilidade.
 */
function fecharModal(modal) {
    modal.classList.add('oculto');
    modal.setAttribute('aria-hidden', 'true');
}

/**
 * Limpa seleções, datas e horários e retorna a página ao topo depois da confirmação.
 */
function voltarAoInicio() {
    fecharModal(document.getElementById('modal-agradecimento'));

    for (const [grupo, configuracao] of Object.entries(window.controleDeServicos.gruposDeServicos)) {
        const sufixo = grupo === 'manicure' ? 'unha' : grupo;
        const seletor = document.getElementById(configuracao.idSeletor);
        document.getElementById(`area-agendamento-${sufixo}`).classList.add('oculto');
        document.getElementById(`data-${sufixo}`).value = '';
        document.getElementById(`horarios-${sufixo}`).replaceChildren();

        const botaoContinuar = document.getElementById(`botao-continuar-agendamento-${sufixo}`);
        botaoContinuar.classList.add('oculto');
        delete botaoContinuar.dataset.horario;
        seletor.selectedIndex = 0;
    }

    window.controleDeAgendamentos.limparAgendamentoPendente();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Busca o catálogo de serviços na API e preenche os seletores da página //.
 */
async function carregarCatalogoDeServicos(enderecoBaseApi, situacaoApi) {
    try {
        const resposta = await fetch(`${enderecoBaseApi}/servicos`);
        const catalogo = await resposta.json();
        if (!resposta.ok) throw new Error(catalogo.erro || 'Não foi possível carregar os serviços.');
        if (!Array.isArray(catalogo)) throw new Error('A API retornou um catálogo de serviços inválido.');

        window.controleDeServicos.preencherSeletoresDeServico(catalogo);
        situacaoApi.textContent = catalogo.length
            ? 'Valores e serviços atualizados conforme o cadastro do salão.'
            : 'Nenhum serviço foi encontrado no cadastro do banco.';
        if (!catalogo.length) situacaoApi.classList.add('erro');
    } catch (erro) {
        console.error('Erro ao carregar catálogo de serviços:', erro);
        situacaoApi.textContent = 'Não foi possível conectar ao catálogo de serviços. Verifique a API e o banco de dados.';
        situacaoApi.classList.add('erro');

        for (const configuracao of Object.values(window.controleDeServicos.gruposDeServicos)) {
            const seletor = document.getElementById(configuracao.idSeletor);
            seletor.replaceChildren(new Option('Serviços indisponíveis — tente novamente mais tarde', ''));
            seletor.disabled = true;
        }
    }
}

document.addEventListener('DOMContentLoaded', inicializarPagina);
