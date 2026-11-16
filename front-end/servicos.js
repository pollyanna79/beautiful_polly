// Este módulo concentra o catálogo de serviços, a formatação dos preços e a navegação dos carrosséis.
window.controleDeServicos = (() => {
    const gruposDeServicos = {
        manicure: {
            idSeletor: 'servico-unha',
            servicos: [
                { rotulo: 'Unha decorada', apelidos: ['unha decorada'] },
                { rotulo: 'Pé e mão simples', apelidos: ['pe e mao simples', 'pe e mao'] },
                { rotulo: 'Pé', apelidos: ['pedicure', 'pe simples', 'pe'] },
                { rotulo: 'Mão', apelidos: ['mao simples', 'mao'] },
                { rotulo: 'Unha em gel', apelidos: ['unha em gel', 'unha de gel'] },
                { rotulo: 'Unha de fibra', apelidos: ['unha de fibra', 'fibra de vidro'] },
                { rotulo: 'Unha de acrílico', apelidos: ['unha de acrilico', 'acrilico'] }
            ]
        },
        sobrancelha: {
            idSeletor: 'servico-sobrancelha',
            servicos: [
                { rotulo: 'Design de sobrancelha', apelidos: ['design de sobrancelha', 'design sobrancelha'] },
                { rotulo: 'Henna', apelidos: ['henna'] },
                { rotulo: 'Microblading', apelidos: ['microblading'] },
                { rotulo: 'Sobrancelha fio a fio', apelidos: ['sobrancelha fio a fio', 'fio a fio'] }
            ]
        },
        maquiagem: {
            idSeletor: 'servico-maquiagem',
            variantes: [
                { rotulo: 'Maquiagem social' },
                { rotulo: 'Maquiagem para noiva' },
                { rotulo: 'Maquiagem para debutante' }
            ]
        },
        cabelos: {
            idSeletor: 'servico-cabelos',
            servicos: [
                { rotulo: 'Penteado', apelidos: ['penteado', 'penteados'] },
                { rotulo: 'Corte', apelidos: ['cabelo'] },
                { rotulo: 'Loiro iluminado', apelidos: ['cabelo'] },
                { rotulo: 'Morena iluminada', apelidos: ['cabelo'] },
                { rotulo: 'Luzes', apelidos: ['cabelo'] }
            ]
        }
    };

    /**
     * Padroniza um texto removendo acentos e espaços externos para comparar nomes de serviços.
     */
    function normalizarTexto(valor) {
        return String(valor || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    /**
     * Localiza no catálogo da API o primeiro serviço que corresponda a um dos nomes alternativos.
     */
    function encontrarServico(catalogo, apelidos) {
        const apelidosNormalizados = [];
        for (const apelido of apelidos) {
            const apelidoNormalizado = normalizarTexto(apelido);
            apelidosNormalizados.push(apelidoNormalizado, `${apelidoNormalizado}s`);
        }

        for (const servico of catalogo) {
            if (apelidosNormalizados.includes(normalizarTexto(servico.nome_servico))) return servico;
        }

        return undefined;
    }

    /**
     * Converte um preço numérico para moeda brasileira e acrescenta separação visual ao rótulo.
     */
    function formatarPreco(valor) {
        const preco = Number(valor);
        return Number.isFinite(preco)
            ? ` - ${preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
            : '';
    }

    /**
     * Apresenta a duração recebida da API em horas e minutos para exibi-la no seletor.
     */
    function formatarDuracao(valor) {
        if (!valor) return '';

        const [horas = 0, minutos = 0] = String(valor).split(':').map(Number);
        const duracao = [horas ? `${horas} h` : '', minutos ? `${minutos} min` : '']
            .filter(Boolean)
            .join(' ');

        return duracao ? ` · ${duracao}` : '';
    }

    /**
     * Converte a duração no formato HH:MM:SS para segundos, usada no cálculo de horários.
     */
    function duracaoEmSegundos(valor) {
        const [horas = 0, minutos = 0, segundos = 0] = String(valor || '').split(':').map(Number);
        return horas * 3600 + minutos * 60 + segundos;
    }

    /**
     * Cria uma opção de serviço com preço, duração e dados necessários para o agendamento.
     */
    function adicionarOpcaoServico(seletor, servico, rotulo) {
        const opcao = document.createElement('option');
        opcao.value = String(servico.id_servico);
        opcao.textContent = `${rotulo}${formatarPreco(servico.preco)}${formatarDuracao(servico.duracao_estimada)}`;
        opcao.dataset.nomeServico = servico.nome_servico;
        opcao.dataset.duracao = String(duracaoEmSegundos(servico.duracao_estimada));
        seletor.appendChild(opcao);
    }

    /**
     * Relaciona os serviços da API aos grupos da página e desativa seletores sem serviços cadastrados.
     */
    function preencherSeletoresDeServico(catalogo) {
        for (const [grupo, configuracao] of Object.entries(gruposDeServicos)) {
            const seletor = document.getElementById(configuracao.idSeletor);
            seletor.replaceChildren(new Option('Escolha um serviço...', ''));

            if (grupo === 'maquiagem') {
                const servico = encontrarServico(catalogo, ['maquiagem']);
                if (servico) {
                    for (const variante of configuracao.variantes) {
                        adicionarOpcaoServico(seletor, servico, variante.rotulo);
                    }
                }
            } else {
                for (const definicao of configuracao.servicos) {
                    const servico = encontrarServico(catalogo, definicao.apelidos);
                    if (servico) adicionarOpcaoServico(seletor, servico, definicao.rotulo);
                }
            }

            if (grupo === 'cabelos') {
                const servicoDePenteado = encontrarServico(catalogo, ['penteado', 'penteados']);
                let penteadoJaListado = false;
                if (servicoDePenteado) {
                    for (const opcao of seletor.options) {
                        if (opcao.value === String(servicoDePenteado.id_servico)) {
                            penteadoJaListado = true;
                            break;
                        }
                    }
                }

                if (servicoDePenteado && !penteadoJaListado) {
                    adicionarOpcaoServico(seletor, servicoDePenteado, 'Penteado');
                }
            }

            const possuiServicos = seletor.options.length > 1;
            seletor.disabled = !possuiServicos;
            if (!possuiServicos) {
                seletor.replaceChildren(new Option('Serviços indisponíveis no cadastro do banco', ''));
            }
        }
    }

    /**
     * Atualiza a posição do carrossel, adapta a quantidade de imagens visíveis e controla as setas.
     */
    function atualizarCarrossel(trilha, imagens, botaoAnterior, botaoProximo, quantidadeDeImagensDesktop, estado) {
        const quantidadeVisivel = window.matchMedia('(max-width: 560px)').matches
            ? 1
            : window.matchMedia('(max-width: 1000px)').matches ? 2 : quantidadeDeImagensDesktop;
        const indiceMaximo = Math.max(imagens.length - quantidadeVisivel, 0);
        estado.indice = (estado.indice + indiceMaximo + 1) % (indiceMaximo + 1);
        const espaco = parseFloat(getComputedStyle(trilha).columnGap) || 0;
        const larguraDoPasso = imagens[0].getBoundingClientRect().width + espaco;

        trilha.style.transform = `translateX(-${estado.indice * larguraDoPasso}px)`;
        botaoAnterior.hidden = indiceMaximo === 0;
        botaoProximo.hidden = indiceMaximo === 0;
    }

    /**
     * Configura os controles de um carrossel individual e mantém sua posição correta ao redimensionar.
     */
    function configurarCarrossel(carrossel) {
        const trilha = carrossel.querySelector('.trilha-carrossel');
        const imagens = Array.from(carrossel.querySelectorAll('.item-carrossel'));
        const botaoAnterior = carrossel.querySelector('.anterior');
        const botaoProximo = carrossel.querySelector('.proximo');
        const quantidadeDeImagensDesktop = Number(carrossel.dataset.quantidadeTelaAmpla) || 1;
        const estado = { indice: 0 };

        if (!trilha || !imagens.length || !botaoAnterior || !botaoProximo) return;

        /**
         * Recalcula a posição do carrossel para a largura atual da tela.
         */
        function mostrarCarrosselAtualizado() {
            atualizarCarrossel(
                trilha,
                imagens,
                botaoAnterior,
                botaoProximo,
                quantidadeDeImagensDesktop,
                estado
            );
        }

        /**
         * Move o carrossel para a última posição anterior disponível.
         */
        function mostrarImagemAnterior() {
            estado.indice -= 1;
            mostrarCarrosselAtualizado();
        }

        /**
         * Move o carrossel para a próxima imagem disponível.
         */
        function mostrarProximaImagem() {
            estado.indice += 1;
            mostrarCarrosselAtualizado();
        }

        botaoAnterior.addEventListener('click', mostrarImagemAnterior);
        botaoProximo.addEventListener('click', mostrarProximaImagem);
        window.addEventListener('resize', mostrarCarrosselAtualizado);
        mostrarCarrosselAtualizado();
    }

    /**
     * Inicializa todos os carrosséis de serviços encontrados na página.
     */
    function inicializarCarrosseis() {
        for (const carrossel of document.querySelectorAll('.area-carrossel')) {
            configurarCarrossel(carrossel);
        }
    }

    return {
        gruposDeServicos,
        preencherSeletoresDeServico,
        inicializarCarrosseis
    };
})();
