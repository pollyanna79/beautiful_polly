// Este módulo controla a escolha de datas e horários e guarda o agendamento até a confirmação.
window.controleDeAgendamentos = (() => {
    let agendamentoPendente = null;
    const cidadesAtendidas = new Set(['Mauá', 'Santo André', 'São Caetano do Sul', 'Ribeirão Pires', 'Capuava']);

    /**
     * Formata uma data no fuso local como AAAA-MM-DD, formato exigido pelo campo de data.
     */
    function formatarDataLocal(data) {
        const ano = data.getFullYear();
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const dia = String(data.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }

    /**
     * Traduz o nome do grupo para o sufixo usado nos identificadores dos campos de agendamento.
     */
    function obterSufixoDoGrupo(grupo) {
        return grupo === 'manicure' ? 'unha' : grupo;
    }

    /**
     * Verifica se o horário solicitado coincide com algum agendamento já retornado pela API.
     */
    function horarioEstaReservado(horarioInicio, horarioFim, dataEscolhida, reservas) {
        for (const reserva of reservas) {
            const [horaOcupada, minutoOcupado] = reserva.hora.split(':').map(Number);
            const inicioOcupado = new Date(
                `${dataEscolhida}T${String(horaOcupada).padStart(2, '0')}:${String(minutoOcupado).padStart(2, '0')}:00`
            );
            const fimOcupado = new Date(
                inicioOcupado.getTime() + Number(reserva.duracao_segundos) * 1000
            );

            if (horarioInicio < fimOcupado && horarioFim > inicioOcupado) return true;
        }

        return false;
    }

    /**
     * Marca o horário escolhido e habilita o botão para continuar o fluxo de agendamento.
     */
    function selecionarHorario(botao, gradeDeHorarios, botaoContinuar, horario) {
        for (const outroBotao of gradeDeHorarios.querySelectorAll('.botao-horario')) {
            outroBotao.classList.remove('selecionado');
        }

        botao.classList.add('selecionado');
        botaoContinuar.dataset.horario = horario;
        botaoContinuar.classList.remove('oculto');
    }

    /**
     * Cria um botão de horário e informa visualmente quando ele já está ocupado.
     */
    function criarBotaoDeHorario(horario, reservado, gradeDeHorarios, botaoContinuar) {
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'botao-horario';
        botao.textContent = horario;

        if (reservado) {
            botao.disabled = true;
            botao.classList.add('reservado');
            botao.textContent = `${horario} · reservado`;
            botao.setAttribute('aria-label', `${horario}, horário reservado`);
        }

        /**
         * Encaminha o clique no horário livre para a função que atualiza a seleção.
         */
        function aoSelecionarHorario() {
            selecionarHorario(botao, gradeDeHorarios, botaoContinuar, horario);
        }

        botao.addEventListener('click', aoSelecionarHorario);
        return botao;
    }

    /**
     * Monta a grade de horários permitidos e sinaliza quando não há horários livres.
     */
    function exibirHorariosDisponiveis(
        dataEscolhida,
        dataSelecionada,
        servicoSelecionado,
        reservas,
        gradeDeHorarios,
        botaoContinuar
    ) {
        const agora = new Date();
        const fimDeSemana = dataSelecionada.getDay() === 0 || dataSelecionada.getDay() === 6;
        const primeiraHora = fimDeSemana ? 10 : 9;
        const ultimaHora = fimDeSemana ? 15 : 18;
        const horarioMaisCedo = new Date(agora.getTime() + 2 * 60 * 60 * 1000);
        const duracaoServico = Number(servicoSelecionado.dataset.duracao);
        let quantidadeDisponivel = 0;
        let quantidadeOferecida = 0;

        for (let hora = primeiraHora; hora < ultimaHora; hora += 1) {
            const horario = `${String(hora).padStart(2, '0')}:00`;
            const inicioDoHorario = new Date(`${dataEscolhida}T${horario}:00`);
            if (hora === 13 || inicioDoHorario < horarioMaisCedo) continue;

            const fimDoHorario = new Date(inicioDoHorario.getTime() + duracaoServico * 1000);
            if (
                fimDoHorario.getHours() > ultimaHora ||
                (fimDoHorario.getHours() === ultimaHora && fimDoHorario.getMinutes() > 0)
            ) {
                continue;
            }

            quantidadeOferecida += 1;
            const reservado = horarioEstaReservado(inicioDoHorario, fimDoHorario, dataEscolhida, reservas);
            const botao = criarBotaoDeHorario(horario, reservado, gradeDeHorarios, botaoContinuar);
            gradeDeHorarios.append(botao);
            if (!reservado) quantidadeDisponivel += 1;
        }

        if (!quantidadeOferecida) {
            gradeDeHorarios.append(document.createTextNode('Não há horários disponíveis nesta data.'));
        } else if (!quantidadeDisponivel) {
            const mensagem = document.createElement('p');
            mensagem.className = 'horarios-indisponiveis';
            mensagem.textContent = 'Todos os horários deste serviço já estão reservados.';
            gradeDeHorarios.append(mensagem);
        }
    }

    /**
     * Consulta a API para a data escolhida e apresenta somente os horários ainda válidos para a seleção.
     */
    async function consultarHorarios(
        enderecoBaseApi,
        seletorDeServico,
        campoDeData,
        gradeDeHorarios,
        botaoContinuar
    ) {
        gradeDeHorarios.replaceChildren();
        botaoContinuar.classList.add('oculto');
        delete botaoContinuar.dataset.horario;
        if (!campoDeData.value) return;

        const dataSelecionada = new Date(`${campoDeData.value}T00:00:00`);
        if (dataSelecionada.getDay() === 1) {
            gradeDeHorarios.append(document.createTextNode('Não abrimos às segundas-feiras.'));
            return;
        }

        const servicoSelecionado = seletorDeServico.options[seletorDeServico.selectedIndex];
        if (!seletorDeServico.value) return;

        gradeDeHorarios.append(document.createTextNode('Consultando horários...'));
        const dataConsultada = campoDeData.value;
        const idServicoConsultado = seletorDeServico.value;
        let reservas;

        try {
            const resposta = await fetch(
                `${enderecoBaseApi}/horarios?id_servico=${encodeURIComponent(idServicoConsultado)}&data=${encodeURIComponent(dataConsultada)}`
            );
            const resultado = await resposta.json();
            if (!resposta.ok) throw new Error(resultado.erro || 'Não foi possível consultar os horários.');
            reservas = resultado;
        } catch (erro) {
            console.error('Erro ao carregar horários disponíveis:', erro);
            gradeDeHorarios.replaceChildren(
                document.createTextNode('Não foi possível consultar os horários. Tente novamente.')
            );
            return;
        }

        if (campoDeData.value !== dataConsultada || seletorDeServico.value !== idServicoConsultado) return;

        gradeDeHorarios.replaceChildren();
        exibirHorariosDisponiveis(
            dataConsultada,
            dataSelecionada,
            servicoSelecionado,
            reservas,
            gradeDeHorarios,
            botaoContinuar
        );
    }

    /**
     * Salva o serviço, a data e o horário escolhidos e abre o formulário de dados da cliente.
     */
    function continuarAgendamento(grupo, seletorDeServico, campoDeData, botaoContinuar) {
        if (!seletorDeServico.value || !campoDeData.value || !botaoContinuar.dataset.horario) return;

        const opcaoSelecionada = seletorDeServico.options[seletorDeServico.selectedIndex];
        agendamentoPendente = {
            id_servico: Number(seletorDeServico.value),
            data_agenda: `${campoDeData.value} ${botaoContinuar.dataset.horario}:00`,
            servico: opcaoSelecionada.textContent,
            grupo
        };

        const modalAgendamento = document.getElementById('modal-agendamento');
        modalAgendamento.classList.remove('oculto');
        modalAgendamento.setAttribute('aria-hidden', 'false');
        document.getElementById('cliente-nome').focus();
    }

    /**
     * Liga os campos de serviço, data e horário de um grupo ao fluxo de agendamento correspondente.
     */
    function configurarAgendamento(grupo, configuracao, enderecoBaseApi) {
        const sufixo = obterSufixoDoGrupo(grupo);
        const seletorDeServico = document.getElementById(configuracao.idSeletor);
        const areaDeAgendamento = document.getElementById(`area-agendamento-${sufixo}`);
        const campoDeData = document.getElementById(`data-${sufixo}`);
        const gradeDeHorarios = document.getElementById(`horarios-${sufixo}`);
        const botaoContinuar = document.getElementById(`botao-continuar-agendamento-${sufixo}`);
        const hoje = new Date();
        const dataMaxima = new Date(hoje);
        dataMaxima.setMonth(dataMaxima.getMonth() + 1);
        campoDeData.min = formatarDataLocal(hoje);
        campoDeData.max = formatarDataLocal(dataMaxima);

        /**
         * Mostra a etapa de agendamento e limpa a data e os horários do serviço anterior.
         */
        function aoAlterarServico() {
            areaDeAgendamento.classList.remove('oculto');
            campoDeData.value = '';
            gradeDeHorarios.replaceChildren();
            botaoContinuar.classList.add('oculto');
            delete botaoContinuar.dataset.horario;
        }

        /**
         * Atualiza a lista de horários sempre que a cliente escolhe outra data.
         */
        async function aoAlterarData() {
            await consultarHorarios(
                enderecoBaseApi,
                seletorDeServico,
                campoDeData,
                gradeDeHorarios,
                botaoContinuar
            );
        }

        /**
         * Avança para a coleta de dados depois que um horário foi selecionado.
         */
        function aoClicarContinuar() {
            continuarAgendamento(grupo, seletorDeServico, campoDeData, botaoContinuar);
        }

        seletorDeServico.addEventListener('change', aoAlterarServico);
        campoDeData.addEventListener('change', aoAlterarData);
        botaoContinuar.addEventListener('click', aoClicarContinuar);
    }

    /**
     * Configura as datas e os eventos dos seletores para todos os grupos de serviços.
     */
    function configurarAgendamentos(enderecoBaseApi, gruposDeServicos) {
        for (const [grupo, configuracao] of Object.entries(gruposDeServicos)) {
            configurarAgendamento(grupo, configuracao, enderecoBaseApi);
        }
    }

    /**
     * Devolve os dados do agendamento que aguardam o preenchimento do formulário da cliente.
     */
    function obterAgendamentoPendente() {
        return agendamentoPendente;
    }

    /**
     * Descarta os dados temporários depois da confirmação de uma reserva.
     */
    function limparAgendamentoPendente() {
        agendamentoPendente = null;
    }

    return {
        cidadesAtendidas,
        configurarAgendamentos,
        obterAgendamentoPendente,
        limparAgendamentoPendente
    };
})();
