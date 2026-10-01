// ─── FIREBASE CONFIG ──────────────────────────────────────────────────────────
// firebaseConfig é carregado de ./firebase-config.js
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
    // --- SELETORES GLOBAIS ---
    const cartIcon = document.querySelector(".cart-icon"),
        cartSidebar = document.querySelector(".cart-sidebar"),
        cartOverlay = document.querySelector(".cart-overlay"),
        closeCartBtn = document.querySelector(".close-cart-btn"),
        cartBody = document.querySelector(".cart-body"),
        cartBadge = document.querySelector(".cart-badge");
    const deliveryToggleBtns = document.querySelectorAll(".delivery-btn");
    const deliveryOptionBtn = document.querySelector('.delivery-btn[data-option="delivery"]');
    const deliveryIndisponivelAviso = document.getElementById("delivery-indisponivel-aviso");
    const deliveryForm = document.getElementById("delivery-form-container"),
        pickupForm = document.getElementById("pickup-form-container");
    const productModalOverlay = document.getElementById("product-modal-overlay"),
        productModalCloseBtn = document.getElementById("product-modal-close"),
        productModalImg = document.getElementById("product-modal-img"),
        productModalDestaque = document.getElementById("product-modal-destaque"),
        productModalNome = document.getElementById("product-modal-nome"),
        productModalDescricao = document.getElementById("product-modal-descricao"),
        productModalEntregaNote = document.getElementById("product-modal-entrega-note"),
        productModalPreco = document.getElementById("product-modal-preco"),
        productModalComprarBtn = document.getElementById("product-modal-comprar");

    // Aplica o tipo de entrega (delivery/pickup) nos botões e nos formulários.
    // Fica em função à parte pra poder ser chamada tanto pelo clique do
    // cliente quanto automaticamente quando a entrega deixa de ser possível.
    const aplicarTipoEntrega = (tipo) => {
        tipoEntrega = tipo;
        deliveryToggleBtns.forEach((b) => {
            const ativo = b.dataset.option === tipo;
            b.classList.toggle("active", ativo);
            b.setAttribute("aria-selected", String(ativo));
        });
        if (tipo === "delivery") {
            deliveryForm.style.display = "block";
            pickupForm.style.display = "none";
        } else {
            deliveryForm.style.display = "none";
            pickupForm.style.display = "block";
        }
    };
    const trocoContainer = document.getElementById("troco-container");
    const couponInput = document.getElementById("coupon-input"),
        applyCouponBtn = document.getElementById("apply-coupon-btn"),
        couponFeedback = document.getElementById("coupon-feedback");
    const subtotalElem = document.getElementById("cart-subtotal"),
        cartDiscountElem = document.getElementById("cart-discount"),
        discountLineElem = document.querySelector(".discount-line"),
        cartDeliveryFeeElem = document.getElementById("cart-delivery-fee"),
        deliveryFeeLineElem = document.getElementById("delivery-fee-line"),
        totalElem = document.getElementById("cart-total");
    const finishOrderBtn = document.getElementById("finish-order-btn");
    // Seletores da barra inferior
    const viewCartBanner = document.querySelector(".view-cart-banner");
    const bannerTotalElem = document.getElementById("banner-total");
    const viewCartBannerBtn = document.querySelector(".view-cart-banner-btn");

    // Seletores para o sistema de filtro
    const categoriesBar = document.getElementById("categories-bar");
    const searchInput = document.querySelector(".search-input");
    const themeToggleBtn = document.getElementById("theme-toggle-btn");
    const favoritesToggleBtn = document.getElementById("favorites-toggle-btn");

    // --- TEMA (MODO ESCURO) ---
    const temaSalvo = localStorage.getItem("tema");
    if (temaSalvo === "dark") document.body.classList.add("dark-mode");
    const atualizarIconeTema = () => {
        const escuro = document.body.classList.contains("dark-mode");
        themeToggleBtn.innerHTML = `<i class="fa-solid ${escuro ? "fa-sun" : "fa-moon"}" aria-hidden="true"></i>`;
        themeToggleBtn.setAttribute("aria-label", escuro ? "Ativar modo claro" : "Ativar modo escuro");
    };
    atualizarIconeTema();
    themeToggleBtn.addEventListener("click", () => {
        document.body.classList.toggle("dark-mode");
        localStorage.setItem("tema", document.body.classList.contains("dark-mode") ? "dark" : "light");
        atualizarIconeTema();
    });

    // --- FAVORITOS (localStorage, não mexe no Firestore) ---
    const FAVORITOS_KEY = "loja_favoritos";
    let favoritos = [];
    try { favoritos = JSON.parse(localStorage.getItem(FAVORITOS_KEY)) || []; } catch { favoritos = []; }
    let somenteFavoritos = false;
    const salvarFavoritos = () => localStorage.setItem(FAVORITOS_KEY, JSON.stringify(favoritos));
    const alternarFavorito = (id) => {
        const idx = favoritos.indexOf(id);
        if (idx === -1) favoritos.push(id); else favoritos.splice(idx, 1);
        salvarFavoritos();
    };
    favoritesToggleBtn.addEventListener("click", () => {
        somenteFavoritos = !somenteFavoritos;
        favoritesToggleBtn.classList.toggle("active", somenteFavoritos);
        favoritesToggleBtn.setAttribute("aria-pressed", String(somenteFavoritos));
        filtrarEMostrarProdutos();
    });

    // --- TOAST SIMPLES (feedback de favorito/compartilhar) ---
    let miniToastTimer;
    const miniToast = (msg) => {
        let el = document.querySelector(".mini-toast");
        if (!el) {
            el = document.createElement("div");
            el.className = "mini-toast";
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.classList.add("show");
        clearTimeout(miniToastTimer);
        miniToastTimer = setTimeout(() => el.classList.remove("show"), 2200);
    };

    // --- COMPARTILHAR NO WHATSAPP ---
    // Evita a Web Share API (navigator.share) de propósito: em vários
    // navegadores/ambientes desktop ela abre um seletor nativo do sistema
    // operacional que pode travar a página esperando uma resposta que nunca
    // chega. Um link comum do wa.me é só uma navegação simples, sem nenhuma
    // API especial nem diálogo nativo — o mesmo mecanismo já usado em
    // "Finalizar Pedido".
    const compartilharNoWhatsapp = (produto, url) => {
        const texto = `${produto.nome} — ${formatarMoeda(produto.preco)}\n${url}`;
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(texto)}`;
        window.open(whatsappUrl, "_blank");
    };

    // --- LOADING (skeleton enquanto busca dados no Firebase) ---
    const mostrarSkeleton = () => {
        const container = document.querySelector(".products-container");
        container.innerHTML = Array.from({ length: 8 })
            .map(
                () => `
                <div class="skeleton-card">
                    <div class="skeleton-img"></div>
                    <div class="skeleton-info">
                        <div class="skeleton-line w-90"></div>
                        <div class="skeleton-line w-70"></div>
                        <div class="skeleton-line w-40"></div>
                    </div>
                </div>`,
            )
            .join("");
    };
    mostrarSkeleton();

    // --- CARREGAR PRODUTOS DO FIREBASE ---
    // Ordena por "id" (igual o admin já faz) pra manter a ordem de cadastro
    // dentro de cada categoria. Filtra "ativo" no navegador em vez de usar
    // where(!=) + orderBy juntos, que exigiria criar um índice composto no
    // Firestore pra essa combinação.
    let produtos = [];
    try {
        const snap = await db.collection("produtos")
            .orderBy("id")
            .get();
        produtos = snap.docs.map(d => ({ ...d.data() })).filter(p => p.ativo !== false);
    } catch (e) {
        console.error("Erro ao carregar produtos do Firebase:", e);
    }

    // --- CARREGAR CATEGORIAS DO FIREBASE ---
    let categorias = [];
    try {
        const catSnap = await db.collection("categorias").get();
        categorias = catSnap.docs.map(d => ({ ...d.data() }));
    } catch (e) {
        console.error("Erro ao carregar categorias do Firebase:", e);
    }

    // Categorias sem "ordem" definida caem no fim (fallback alfabético) —
    // mesmo critério usado no admin (compararCategorias).
    const compararCategorias = (a, b) => {
        const oa = a.ordem ?? 9999;
        const ob = b.ordem ?? 9999;
        if (oa !== ob) return oa - ob;
        return (a.nome || "").localeCompare(b.nome || "", "pt-BR");
    };

    const renderizarCategoriasBar = () => {
        const botoesExtra = [...categorias]
            .sort(compararCategorias)
            .map(
                (c) => `
                    <button class="category-btn" data-category="${c.id}">
                        <i class="fa-solid ${c.icone || 'fa-tag'}"></i> ${c.nome}
                    </button>
                `,
            )
            .join("");
        categoriesBar.innerHTML = `
            <button class="category-btn active" data-category="all">
                <i class="fa-solid fa-border-all"></i> Todos
            </button>
            ${botoesExtra}
        `;
    };
    renderizarCategoriasBar();

    // --- CARREGAR CUPONS DO FIREBASE ---
    let coupons = [];
    try {
        const cuponsSnap = await db.collection("cupons").get();
        coupons = cuponsSnap.docs.map((d) => ({ docId: d.id, ...d.data() }));
    } catch (e) {
        console.error("Erro ao carregar cupons do Firebase:", e);
    }

    // --- CARREGAR GRUPOS DE ADICIONAIS DO FIREBASE ---
    // Catálogo separado de "Variações": multi-seleção, opcional, cada opção
    // com seu próprio preço (ex: "Bacon +R$5"). Produtos só guardam os ids
    // dos grupos que oferecem (produto.adicionaisGrupos).
    let gruposAdicionais = [];
    try {
        const adicSnap = await db.collection("gruposAdicionais").get();
        gruposAdicionais = adicSnap.docs.map((d) => ({ docId: d.id, ...d.data() }));
    } catch (e) {
        console.error("Erro ao carregar grupos de adicionais do Firebase:", e);
    }

    // --- CARREGAR CONFIGURAÇÕES DA LOJA DO FIREBASE ---
    const CONFIG_PADRAO = {
        nomeLoja: "Burger House",
        whatsapp: "558182362638",
        retiradaDias: [0, 1, 2, 3, 4, 5, 6],
        retiradaHoraInicio: "08:00",
        retiradaHoraFim: "18:00",
        retiradaIntervalo: 60,
        funcionamentoDias: [0, 1, 2, 3, 4, 5, 6],
        funcionamentoHoraInicio: "08:00",
        funcionamentoHoraFim: "22:00",
        taxaEntrega: 0,
        bannerUrl: "",
        corPrimaria: "#D4AF37",
        corSecundaria: "#1C1C1C",
        corDestaque: "#E8A33D",
    };
    let configLoja = { ...CONFIG_PADRAO };
    try {
        const configDoc = await db.collection("configuracoes").doc("geral").get();
        if (configDoc.exists) configLoja = { ...CONFIG_PADRAO, ...configDoc.data() };
    } catch (e) {
        console.error("Erro ao carregar configurações da loja:", e);
    }

    const aplicarConfiguracoesDaLoja = () => {
        document.title = configLoja.nomeLoja;

        const headerEl = document.querySelector("header");
        if (headerEl && configLoja.bannerUrl) {
            headerEl.style.backgroundImage = `url("${configLoja.bannerUrl}")`;
            headerEl.classList.add("header--banner");
        }

        const root = document.documentElement;
        if (configLoja.corPrimaria) root.style.setProperty("--primary-color", configLoja.corPrimaria);
        if (configLoja.corSecundaria) root.style.setProperty("--secondary-color", configLoja.corSecundaria);
        if (configLoja.corDestaque) root.style.setProperty("--accent-color", configLoja.corDestaque);

        const logoTitleEl = document.querySelector(".logo h1");
        if (logoTitleEl) logoTitleEl.textContent = configLoja.nomeLoja;

        // Logo customizada: se a loja cadastrou uma, troca o ícone genérico pela foto.
        if (configLoja.logoUrl) {
            const logoImgEl = document.getElementById("logo-img");
            const logoIconEl = document.getElementById("logo-icon");
            if (logoImgEl) {
                logoImgEl.src = configLoja.logoUrl;
                logoImgEl.style.display = "block";
            }
            if (logoIconEl) logoIconEl.style.display = "none";
        }

        const footerEl = document.querySelector("footer p");
        if (footerEl) {
            const ano = new Date().getFullYear();
            footerEl.textContent = `${ano} - ${configLoja.nomeLoja}. Todos os direitos reservados`;
        }

        const pickupDateInput = document.getElementById("pickup-date");
        if (pickupDateInput) {
            const hoje = new Date();
            pickupDateInput.min = hoje.toISOString().split("T")[0];
        }

        const pickupTimeSelect = document.getElementById("pickup-time");
        if (pickupTimeSelect) {
            const [hIni, mIni] = configLoja.retiradaHoraInicio.split(":").map(Number);
            const [hFim, mFim] = configLoja.retiradaHoraFim.split(":").map(Number);
            const inicioMin = hIni * 60 + mIni;
            const fimMin = hFim * 60 + mFim;
            const passo = configLoja.retiradaIntervalo || 60;
            let opcoes = `<option value="" disabled selected>Selecione</option>`;
            for (let m = inicioMin; m <= fimMin; m += passo) {
                const h = String(Math.floor(m / 60)).padStart(2, "0");
                const min = String(m % 60).padStart(2, "0");
                opcoes += `<option value="${h}:${min}">${h}:${min}</option>`;
            }
            pickupTimeSelect.innerHTML = opcoes;
        }
    };
    aplicarConfiguracoesDaLoja();

    // --- HORÁRIO DE FUNCIONAMENTO (diferente do horário de retirada, que só
    // controla os horários oferecidos pra AGENDAR uma retirada) ---
    // Fora do horário a loja continua navegável, só o checkout é bloqueado.
    const calcularLojaAberta = () => {
        const agora = new Date();
        const diaSemana = agora.getDay();
        if (!configLoja.funcionamentoDias.includes(diaSemana)) return false;
        const [hIni, mIni] = configLoja.funcionamentoHoraInicio.split(":").map(Number);
        const [hFim, mFim] = configLoja.funcionamentoHoraFim.split(":").map(Number);
        const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
        return minutosAgora >= hIni * 60 + mIni && minutosAgora <= hFim * 60 + mFim;
    };
    const lojaAberta = calcularLojaAberta();
    const lojaFechadaBanner = document.getElementById("loja-fechada-banner");
    if (!lojaAberta && lojaFechadaBanner) lojaFechadaBanner.style.display = "flex";

    // --- MODO MESA (pedido feito direto da mesa via QR code/link) ---
    // Nunca usa WhatsApp: o pedido vai direto pro Firestore e aparece em
    // tempo real no painel de Cozinha do admin. Se o parâmetro "mesa" não
    // corresponder a uma mesa cadastrada/ativa, a loja funciona normal.
    let modoMesa = false;
    let mesaAtual = null;
    const mesaIdParam = new URLSearchParams(location.search).get("mesa");
    if (mesaIdParam) {
        try {
            const mesaDoc = await db.collection("mesas").doc(mesaIdParam).get();
            if (mesaDoc.exists && mesaDoc.data().ativo !== false) {
                modoMesa = true;
                mesaAtual = { id: mesaDoc.id, ...mesaDoc.data() };
            }
        } catch (e) {
            console.error("Erro ao carregar mesa:", e);
        }
    }
    if (modoMesa) {
        const mesaBanner = document.getElementById("mesa-banner");
        const mesaBannerNome = document.getElementById("mesa-banner-nome");
        if (mesaBanner && mesaBannerNome) {
            mesaBannerNome.textContent = mesaAtual.nome;
            mesaBanner.style.display = "flex";
        }
        const optionsToggleEl = document.querySelector(".options-toggle");
        if (optionsToggleEl) optionsToggleEl.style.display = "none";
        deliveryForm.style.display = "none";
        pickupForm.style.display = "none";
        deliveryIndisponivelAviso.style.display = "none";
        finishOrderBtn.innerHTML = '<i class="fa-solid fa-kitchen-set" aria-hidden="true"></i> Enviar Pedido';
    }

    // --- ESTADO DA APLICAÇÃO ---
    let carrinho = [],
        tipoEntrega = "delivery",
        appliedCoupon = null;

    // Variáveis de estado para filtros
    let categoriaAtiva = "all";
    let termoBusca = "";

    const formatarMoeda = (v) =>
        v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    // --- NÚMERO DO PEDIDO (8 caracteres: 2 letras + 6 alfanuméricos) ---
    // Sem acompanhamento no banco de dados: a checagem de duplicidade é
    // feita contra os números já gerados neste mesmo navegador
    // (localStorage). A entropia (26² × 36⁶ ≈ 1,4 trilhão de combinações)
    // já torna uma colisão entre clientes diferentes praticamente impossível.
    const PEDIDO_LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sem I/O, pra não confundir com 1/0
    const PEDIDO_ALFANUM = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const PEDIDO_HISTORICO_KEY = "loja_numeros_pedido";

    const sortearCaractere = (alfabeto) => {
        const idx = crypto.getRandomValues(new Uint32Array(1))[0] % alfabeto.length;
        return alfabeto[idx];
    };

    const gerarNumeroPedido = () => {
        let historico = [];
        try { historico = JSON.parse(localStorage.getItem(PEDIDO_HISTORICO_KEY)) || []; } catch { historico = []; }

        let numero;
        let tentativas = 0;
        do {
            const letras = sortearCaractere(PEDIDO_LETRAS) + sortearCaractere(PEDIDO_LETRAS);
            const resto = Array.from({ length: 6 }, () => sortearCaractere(PEDIDO_ALFANUM)).join("");
            numero = letras + resto;
            tentativas++;
        } while (historico.includes(numero) && tentativas < 20);

        historico.push(numero);
        if (historico.length > 200) historico = historico.slice(-200); // não deixa crescer pra sempre
        localStorage.setItem(PEDIDO_HISTORICO_KEY, JSON.stringify(historico));
        return numero;
    };

    // --- LEMBRAR DADOS DO CLIENTE (nome, telefone, CEP, endereço) ---
    // Só salva quando o pedido é finalizado com sucesso (os dados já passaram
    // pela validação nesse momento). Na próxima visita, os campos já vêm
    // preenchidos — o cliente só mexe se precisar mudar algo.
    const CLIENTE_STORAGE_KEY = "loja_dados_cliente";

    const salvarDadosCliente = (novosDados) => {
        let dados = {};
        try { dados = JSON.parse(localStorage.getItem(CLIENTE_STORAGE_KEY)) || {}; } catch { dados = {}; }
        // Só sobrescreve os campos que vieram preenchidos, pra não apagar
        // dados salvos antes (ex: finalizar por retirada não deveria apagar
        // o endereço já salvo de uma entrega anterior).
        Object.entries(novosDados).forEach(([chave, valor]) => {
            if (valor) dados[chave] = valor;
        });
        localStorage.setItem(CLIENTE_STORAGE_KEY, JSON.stringify(dados));
    };

    const carregarDadosCliente = () => {
        let dados = {};
        try { dados = JSON.parse(localStorage.getItem(CLIENTE_STORAGE_KEY)) || {}; } catch { dados = {}; }
        if (dados.nome) {
            document.getElementById("delivery-name").value = dados.nome;
            document.getElementById("pickup-name").value = dados.nome;
        }
        if (dados.telefone) document.getElementById("delivery-phone").value = dados.telefone;
        if (dados.cep) document.getElementById("delivery-cep").value = dados.cep;
        if (dados.endereco) document.getElementById("delivery-address").value = dados.endereco;
    };

    const getScrollbarWidth = () =>
        window.innerWidth - document.documentElement.clientWidth;
    const lockScroll = () => {
        document.body.style.paddingRight = `${getScrollbarWidth()}px`;
        document.body.classList.add("no-scroll");
    };
    const unlockScroll = () => {
        document.body.style.paddingRight = "";
        document.body.classList.remove("no-scroll");
    };
    const abrirCarrinho = () => {
        cartSidebar.classList.add("show");
        cartOverlay.classList.add("show");
        lockScroll();
    };
    const fecharCarrinho = () => {
        cartSidebar.classList.remove("show");
        cartOverlay.classList.remove("show");
        unlockScroll();
    };

    // --- POPUP DE DETALHES DO PRODUTO ---
    // Guarda o produto aberto no popup e as opções de variação (Cor,
    // Tamanho...) que o cliente já escolheu, enquanto o popup está aberto.
    let modalProdutoAtual = null;
    let modalVariacoesEscolhidas = {};

    const renderizarVariacoesNoModal = (produto) => {
        const cont = document.getElementById("product-modal-variacoes");
        const variacoes = produto.variacoes || [];
        if (!variacoes.length) { cont.innerHTML = ""; return; }
        cont.innerHTML = variacoes
            .map(
                (grupo) => `
                    <div class="variacao-grupo">
                        <div class="variacao-grupo-nome">${grupo.tipoNome}</div>
                        <div class="variacao-opcoes">
                            ${grupo.opcoes
                                .map(
                                    (opcao) => `
                                        <button type="button" class="variacao-opcao-btn" data-tipo-id="${grupo.tipoId}" data-tipo-nome="${grupo.tipoNome}" data-opcao="${opcao}">${opcao}</button>
                                    `,
                                )
                                .join("")}
                        </div>
                    </div>`,
            )
            .join("") + `<p class="variacao-aviso" id="variacao-aviso">Escolha uma opção de cada variação antes de comprar.</p>`;
    };

    // --- ADICIONAIS (Bacon, Queijo extra...) dentro do popup de produto ---
    // Multi-seleção, sempre opcional (nunca trava o botão "Comprar"), cada
    // opção com seu próprio preço, que soma ao preço exibido em tempo real.
    const renderizarAdicionaisNoModal = (produto) => {
        const cont = document.getElementById("product-modal-adicionais");
        const grupos = (produto.adicionaisGrupos || [])
            .map((id) => gruposAdicionais.find((g) => g.docId === id))
            .filter(Boolean);
        if (!grupos.length) { cont.innerHTML = ""; return; }
        cont.innerHTML = grupos
            .map(
                (grupo) => `
                    <div class="adicional-grupo">
                        <div class="adicional-grupo-nome">${grupo.nome}</div>
                        <div class="adicional-opcoes">
                            ${(grupo.opcoes || [])
                                .map(
                                    (op) => `
                                        <label class="adicional-opcao">
                                            <input type="checkbox" class="adicional-opcao-check" data-grupo-nome="${grupo.nome}" data-opcao-nome="${op.nome}" data-preco="${op.preco}">
                                            <span>${op.nome}</span>
                                            <span class="adicional-opcao-preco">+ ${formatarMoeda(Number(op.preco) || 0)}</span>
                                        </label>`,
                                )
                                .join("")}
                        </div>
                    </div>`,
            )
            .join("");
    };

    const obterAdicionaisEscolhidosDoModal = () =>
        Array.from(document.querySelectorAll("#product-modal-adicionais .adicional-opcao-check:checked")).map(
            (chk) => ({
                grupoNome: chk.dataset.grupoNome,
                opcaoNome: chk.dataset.opcaoNome,
                preco: Number(chk.dataset.preco) || 0,
            }),
        );

    const atualizarPrecoModalComAdicionais = () => {
        if (!modalProdutoAtual) return;
        const somaAdicionais = obterAdicionaisEscolhidosDoModal().reduce((s, a) => s + a.preco, 0);
        productModalPreco.textContent = formatarMoeda(modalProdutoAtual.preco + somaAdicionais);
    };

    // Só libera o botão "Comprar" quando todo grupo de variação (se o
    // produto tiver algum) já tem uma opção escolhida.
    const atualizarBotaoComprarModal = () => {
        if (!modalProdutoAtual) return;
        const variacoes = modalProdutoAtual.variacoes || [];
        const faltaEscolher = variacoes.some((g) => !modalVariacoesEscolhidas[g.tipoId]);
        productModalComprarBtn.disabled = faltaEscolher;
        const aviso = document.getElementById("variacao-aviso");
        if (aviso) aviso.classList.toggle("show", faltaEscolher && variacoes.length > 0);
    };

    const abrirModalProduto = (produtoId) => {
        const produto = produtos.find((p) => p.id === produtoId);
        if (!produto) return;

        productModalImg.src = produto.imagem;
        productModalImg.alt = produto.nome;
        productModalDestaque.style.display = produto.destaque ? "flex" : "none";
        productModalNome.textContent = produto.nome;
        productModalDescricao.textContent = produto.descricao || "";
        productModalEntregaNote.style.display = produto.entrega === false ? "flex" : "none";
        productModalPreco.textContent = formatarMoeda(produto.preco);
        productModalComprarBtn.dataset.id = produto.id;

        modalProdutoAtual = produto;
        modalVariacoesEscolhidas = {};
        renderizarVariacoesNoModal(produto);
        renderizarAdicionaisNoModal(produto);
        document.getElementById("product-modal-observacao").value = "";
        atualizarBotaoComprarModal();

        productModalOverlay.classList.add("show");
        lockScroll();
    };
    const fecharModalProduto = () => {
        productModalOverlay.classList.remove("show");
        unlockScroll();
    };

    const animacaoVoarParaCarrinho = (productCard) => {
        const productImg = productCard.querySelector(".product-img"),
            imgRect = productImg.getBoundingClientRect(),
            cartRect = cartIcon.getBoundingClientRect(),
            flyingImg = document.createElement("img");
        flyingImg.src = productImg.src;
        flyingImg.classList.add("product-image-fly");
        flyingImg.style.left = `${imgRect.left}px`;
        flyingImg.style.top = `${imgRect.top}px`;
        flyingImg.style.width = `${imgRect.width}px`;
        flyingImg.style.height = `${imgRect.height}px`;
        document.body.appendChild(flyingImg);
        requestAnimationFrame(() => {
            flyingImg.style.left = `${cartRect.left + cartRect.width / 2}px`;
            flyingImg.style.top = `${cartRect.top + cartRect.height / 2}px`;
            flyingImg.style.width = "0px";
            flyingImg.style.height = "0px";
            flyingImg.style.opacity = "0";
        });
        flyingImg.addEventListener("transitionend", () => flyingImg.remove());
    };

    // Função para filtrar e mostrar produtos
    // Card de produto: extraído numa função à parte pra ser reaproveitado
    // tanto na grade principal quanto na faixa de Destaques da home.
    const montarCardProdutoHtml = (p) => {
        const isFav = favoritos.includes(p.id);
        return `
            <div class="product-card" id="produto-${p.id}" data-id="${p.id}">
                <div class="product-img-wrap">
                    <img class="product-img" src="${p.imagem}" alt="${p.nome}" loading="lazy"
                         onerror="this.onerror=null;this.src='./assets/placeholder.svg'">
                    ${p.destaque ? '<span class="destaque-badge"><i class="fa-solid fa-star" aria-hidden="true"></i> Destaque</span>' : ""}
                    <div class="product-card-actions">
                        <button type="button" class="fav-btn ${isFav ? "active" : ""}" data-action="favoritar" aria-label="Favoritar">
                            <i class="fa-${isFav ? "solid" : "regular"} fa-heart" aria-hidden="true"></i>
                        </button>
                        <button type="button" class="share-btn" data-action="compartilhar" aria-label="Compartilhar no WhatsApp">
                            <i class="fa-brands fa-whatsapp" aria-hidden="true"></i>
                        </button>
                    </div>
                </div>
                <div class="product-info">
                    <h3 class="product-name">${p.nome}</h3>
                    <p class="product-description">${p.descricao}</p>
                    ${p.entrega === false ? '<p class="product-delivery-note"><i class="fa-solid fa-store" aria-hidden="true"></i> Disponível só para retirada</p>' : ""}
                    <p class="product-price">${formatarMoeda(p.preco)}</p>
                    <button class="product-button">Adicionar</button>
                </div>
            </div>
        `;
    };

    const destaquesSection = document.getElementById("destaques-section");
    const destaquesContainer = document.querySelector(".destaques-container");
    const renderizarDestaques = () => {
        if (!destaquesSection || !destaquesContainer) return;
        const destaques = produtos.filter((p) => p.destaque);
        if (!destaques.length) {
            destaquesSection.style.display = "none";
            return;
        }
        destaquesSection.style.display = "block";
        destaquesContainer.innerHTML = destaques.map(montarCardProdutoHtml).join("");
    };

    const filtrarEMostrarProdutos = () => {
        let produtosFiltrados = produtos;

        // Filtro por categoria
        if (categoriaAtiva !== "all") {
            produtosFiltrados = produtosFiltrados.filter(
                (produto) => produto.categoria === categoriaAtiva,
            );
        }

        // Filtro por busca
        if (termoBusca.trim() !== "") {
            const termo = termoBusca.toLowerCase();
            produtosFiltrados = produtosFiltrados.filter(
                (produto) =>
                    produto.nome.toLowerCase().includes(termo) ||
                    (produto.descricao || "").toLowerCase().includes(termo),
            );
        }

        // Filtro por favoritos
        if (somenteFavoritos) {
            produtosFiltrados = produtosFiltrados.filter((produto) =>
                favoritos.includes(produto.id),
            );
        }

        // Produtos em destaque aparecem primeiro
        produtosFiltrados = [...produtosFiltrados].sort(
            (a, b) => (b.destaque ? 1 : 0) - (a.destaque ? 1 : 0),
        );

        // Renderizar produtos filtrados
        const container = document.querySelector(".products-container");
        if (produtosFiltrados.length === 0) {
            container.innerHTML = `
                        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: #999;">
                            <i class="fa-solid fa-box-open" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                            <p style="font-size: 1.2rem; font-weight: 600;">${somenteFavoritos ? "Você ainda não favoritou nenhum produto" : "Nenhum produto encontrado"}</p>
                        </div>
                    `;
        } else {
            container.innerHTML = produtosFiltrados.map(montarCardProdutoHtml).join("");
        }
    };

    // variacaoEscolhida é um texto tipo "Cor: Azul" (ou null se o produto não
    // tem variação). Dois itens do mesmo produto com variações, adicionais
    // ou observação diferentes viram linhas separadas no carrinho — só
    // juntam a quantidade se tudo isso for igual.
    const chaveAdicionais = (adicionais) =>
        JSON.stringify([...(adicionais || [])].sort((a, b) => (a.opcaoNome > b.opcaoNome ? 1 : -1)));

    const adicionarAoCarrinho = (produtoId, productCard, variacaoEscolhida = null, adicionaisEscolhidos = [], observacao = null) => {
        if (productCard) animacaoVoarParaCarrinho(productCard);
        const produto = produtos.find((p) => p.id === produtoId);
        if (!produto) return;

        const itemNoCarrinho = carrinho.find(
            (item) =>
                item.id === produtoId &&
                (item.variacaoEscolhida || null) === (variacaoEscolhida || null) &&
                chaveAdicionais(item.adicionais) === chaveAdicionais(adicionaisEscolhidos) &&
                (item.observacao || null) === (observacao || null),
        );
        if (itemNoCarrinho) itemNoCarrinho.quantidade++;
        else carrinho.push({ ...produto, quantidade: 1, variacaoEscolhida, adicionais: adicionaisEscolhidos, observacao: observacao || null });
        atualizarCarrinho();
    };

    // Endereça a linha do carrinho pela posição no array, não pelo id do
    // produto — assim funciona certo mesmo com duas linhas do mesmo produto
    // (variações diferentes) ao mesmo tempo.
    const alterarQuantidade = (index, acao) => {
        const item = carrinho[index];
        if (!item) return;
        if (acao === "aumentar") item.quantidade++;
        else if (acao === "diminuir") {
            item.quantidade--;
            if (item.quantidade <= 0) carrinho.splice(index, 1);
        }
        atualizarCarrinho();
    };

    // Preço real da linha: base do produto + soma dos adicionais escolhidos
    // (cada adicional já carrega seu próprio preço). Usado em todo lugar que
    // hoje só usava item.preco — carrinho, cupom, WhatsApp e Firestore.
    const precoItemComAdicionais = (item) =>
        item.preco + (item.adicionais || []).reduce((s, a) => s + (Number(a.preco) || 0), 0);

    const atualizarCarrinho = () => {
        if (carrinho.length === 0) {
            cartBody.innerHTML = `<div class="cart-empty"><i class="fa-solid fa-box-open"></i><p>Seu carrinho está vazio.</p></div>`;
        } else {
            cartBody.innerHTML = carrinho
                .map(
                    (item, index) =>
                        `<div class="cart-item" data-index="${index}">
                            <img src="${item.imagem}" alt="${item.nome}" class="cart-item-img" loading="lazy"
                                 onerror="this.onerror=null;this.src='./assets/placeholder.svg'">
                            <div class="cart-item-info">
                                <h4 class="cart-item-name">${item.nome}</h4>
                                ${item.variacaoEscolhida ? `<p class="cart-item-variacao">${item.variacaoEscolhida}</p>` : ""}
                                ${item.adicionais && item.adicionais.length ? `<p class="cart-item-adicionais">+ ${item.adicionais.map((a) => a.opcaoNome).join(", ")}</p>` : ""}
                                <p class="cart-item-price">${formatarMoeda(precoItemComAdicionais(item))}</p>
                                <input type="text" class="cart-item-obs-input" data-index="${index}" placeholder="Observação (opcional)" value="${(item.observacao || "").replace(/"/g, "&quot;")}">
                                <div class="cart-item-controls">
                                    <button class="quantity-btn" data-action="diminuir">-</button>
                                    <span class="quantity">${item.quantidade}</span>
                                    <button class="quantity-btn" data-action="aumentar">+</button>
                                </div>
                            </div>
                            <button class="remove-item-btn">&times;</button>
                        </div>`,
                )
                .join("");
        }

        // Se algum item do carrinho não pode ser entregue, a opção de
        // entrega inteira fica indisponível para este pedido. Não se aplica
        // no modo mesa (não existe entrega/retirada pra quem já está na loja).
        if (!modoMesa) {
            const algumItemSemEntrega = carrinho.some((item) => item.entrega === false);
            deliveryOptionBtn.disabled = algumItemSemEntrega;
            deliveryIndisponivelAviso.style.display = algumItemSemEntrega ? "flex" : "none";
            if (algumItemSemEntrega && tipoEntrega === "delivery") {
                aplicarTipoEntrega("pickup");
            }
        }

        const subtotal = carrinho.reduce(
            (acc, item) => acc + precoItemComAdicionais(item) * item.quantidade,
            0,
        );

        if (
            appliedCoupon &&
            appliedCoupon.valorMinimo &&
            subtotal < appliedCoupon.valorMinimo
        ) {
            appliedCoupon = null;
            couponFeedback.textContent =
                "Cupom removido: o pedido não atinge mais o valor mínimo exigido.";
            couponFeedback.classList.remove("success");
            couponFeedback.classList.add("error");
        }

        const discountAmount = calcularDesconto(subtotal);
        // Taxa de entrega: valor fixo configurado pelo admin, só quando o
        // cliente escolhe entrega (nunca em retirada nem no modo mesa).
        const taxaEntrega = !modoMesa && tipoEntrega === "delivery" ? Number(configLoja.taxaEntrega) || 0 : 0;
        const total = subtotal - discountAmount + taxaEntrega;
        subtotalElem.textContent = formatarMoeda(subtotal);
        if (taxaEntrega > 0) {
            cartDeliveryFeeElem.textContent = formatarMoeda(taxaEntrega);
            deliveryFeeLineElem.style.display = "flex";
        } else {
            deliveryFeeLineElem.style.display = "none";
        }
        if (discountAmount > 0) {
            cartDiscountElem.textContent = `- ${formatarMoeda(discountAmount)}`;
            discountLineElem.style.display = "flex";
        } else {
            discountLineElem.style.display = "none";
        }
        totalElem.textContent = formatarMoeda(total);
        cartBadge.textContent = carrinho.reduce(
            (acc, item) => acc + item.quantidade,
            0,
        );
        finishOrderBtn.disabled = carrinho.length === 0 || !lojaAberta;

        if (carrinho.length > 0 && window.innerWidth <= 768) {
            bannerTotalElem.textContent = formatarMoeda(total);
            viewCartBanner.classList.add("show");
        } else {
            viewCartBanner.classList.remove("show");
        }
    };

    const calcularDesconto = (subtotal) => {
        if (!appliedCoupon) return 0;
        if (appliedCoupon.tipo === "fixo")
            return Math.min(appliedCoupon.valor, subtotal);
        return subtotal * (appliedCoupon.valor / 100);
    };

    const applyCoupon = () => {
        const code = couponInput.value.trim().toUpperCase();
        const subtotal = carrinho.reduce(
            (acc, item) => acc + precoItemComAdicionais(item) * item.quantidade,
            0,
        );
        const foundCoupon = coupons.find((c) => c.codigo === code);
        couponFeedback.classList.remove("success", "error");

        if (!foundCoupon) {
            appliedCoupon = null;
            couponFeedback.textContent = "Cupom inválido.";
            couponFeedback.classList.add("error");
        } else if (foundCoupon.ativo === false) {
            appliedCoupon = null;
            couponFeedback.textContent = "Este cupom não está mais disponível.";
            couponFeedback.classList.add("error");
        } else if (
            foundCoupon.validade &&
            new Date(`${foundCoupon.validade}T23:59:59`) < new Date()
        ) {
            appliedCoupon = null;
            couponFeedback.textContent = "Este cupom expirou.";
            couponFeedback.classList.add("error");
        } else if (
            foundCoupon.valorMinimo &&
            subtotal < foundCoupon.valorMinimo
        ) {
            appliedCoupon = null;
            couponFeedback.textContent = `Pedido mínimo de ${formatarMoeda(
                foundCoupon.valorMinimo,
            )} para usar este cupom.`;
            couponFeedback.classList.add("error");
        } else {
            appliedCoupon = foundCoupon;
            couponFeedback.textContent = "Cupom aplicado!";
            couponFeedback.classList.add("success");
        }
        atualizarCarrinho();
    };

    const finalizarPedido = () => {
        if (!lojaAberta) {
            alert("A loja está fechada no momento. Tente novamente dentro do horário de funcionamento.");
            return;
        }
        let valid = true;
        let fieldsToValidate = [];

        if (tipoEntrega === "delivery") {
            fieldsToValidate = [
                "delivery-name",
                "delivery-phone",
                "delivery-cep",
                "delivery-address",
            ];
        } else {
            fieldsToValidate = ["pickup-name", "pickup-date", "pickup-time"];
        }

        if (tipoEntrega === "pickup") {
            const dataInput = document.getElementById("pickup-date");
            if (dataInput.value) {
                const [ano, mes, dia] = dataInput.value.split("-").map(Number);
                const diaSemana = new Date(ano, mes - 1, dia).getDay();
                if (!configLoja.retiradaDias.includes(diaSemana)) {
                    dataInput.classList.add("error");
                    alert("A loja não realiza retiradas no dia selecionado. Escolha outra data.");
                    return;
                }
            }
        }

        fieldsToValidate.forEach((id) => {
            const el = document.getElementById(id);
            let isFieldValid = el.value.trim() !== "";

            if (id.includes("name") && isFieldValid) {
                if (
                    el.value
                        .trim()
                        .split(" ")
                        .filter((word) => word).length < 2
                ) {
                    isFieldValid = false;
                }
            }

            if (!isFieldValid) {
                el.classList.add("error");
                valid = false;
            } else {
                el.classList.remove("error");
            }
        });

        if (!valid) {
            alert(
                "Por favor, preencha todos os campos obrigatórios marcados em vermelho.",
            );
            return;
        }

        // Guarda os dados pra já vir preenchido da próxima vez
        if (tipoEntrega === "delivery") {
            salvarDadosCliente({
                nome: document.getElementById("delivery-name").value.trim(),
                telefone: document.getElementById("delivery-phone").value.trim(),
                cep: document.getElementById("delivery-cep").value.trim(),
                endereco: document.getElementById("delivery-address").value.trim(),
            });
        } else {
            salvarDadosCliente({
                nome: document.getElementById("pickup-name").value.trim(),
            });
        }

        const numeroWhatsApp = configLoja.whatsapp;
        const numeroPedido = gerarNumeroPedido();
        const itensPedido = carrinho
            .map((item) => {
                let linha = `  - ${item.quantidade}x ${item.nome}`;
                if (item.variacaoEscolhida) linha += ` (${item.variacaoEscolhida})`;
                if (item.adicionais && item.adicionais.length) linha += ` + ${item.adicionais.map((a) => a.opcaoNome).join(", ")}`;
                if (item.observacao) linha += `\n    Obs: ${item.observacao}`;
                return linha;
            })
            .join("\n");
        const subtotal = carrinho.reduce(
            (acc, item) => acc + precoItemComAdicionais(item) * item.quantidade,
            0,
        );
        const discountAmount = calcularDesconto(subtotal);
        const taxaEntrega = tipoEntrega === "delivery" ? Number(configLoja.taxaEntrega) || 0 : 0;
        let cupomInfo = "";
        if (appliedCoupon) {
            cupomInfo = `\n*Cupom Aplicado:* ${appliedCoupon.codigo} (${formatarMoeda(
                discountAmount,
            )})`;
        }
        const taxaInfo = taxaEntrega > 0 ? `\n*Taxa de entrega:* ${formatarMoeda(taxaEntrega)}` : "";
        const total = subtotal - discountAmount + taxaEntrega;
        let mensagem = `*-- NOVO PEDIDO ${configLoja.nomeLoja} --*\n*Número do Pedido:* ${numeroPedido}\n\n*Itens:*\n${itensPedido}\n\n*Subtotal:* ${formatarMoeda(
            subtotal,
        )}${cupomInfo}${taxaInfo}\n*Total:* ${formatarMoeda(
            total,
        )}\n\n-------------------------\n\n`;

        if (tipoEntrega === "delivery") {
            const nome = document.getElementById("delivery-name").value;
            const phone = document.getElementById("delivery-phone").value;
            const address = document.getElementById("delivery-address").value;
            const modoEntrega = document.querySelector(
                'input[name="delivery-mode"]:checked',
            ).value;
            const horario = document.getElementById("delivery-horario").value;
            const recebedor = document.getElementById("delivery-recebedor").value.trim();

            const paymentMethod = document.querySelector(
                'input[name="payment"]:checked',
            ).value;
            let paymentInfo = `*Forma de Pagamento:* ${paymentMethod}`;
            if (paymentMethod === "Dinheiro") {
                const troco = document.getElementById("troco-para").value;
                paymentInfo += troco
                    ? ` (Troco para R$ ${troco})`
                    : " (Não precisa de troco)";
            }
            mensagem += `*Tipo de Pedido:* Entrega\n\n*Nome:* ${nome}\n*Telefone:* ${phone}\n*Endereço:* ${address}\n*Como entregar:* ${modoEntrega}${horario ? `\n*Horário desejado:* ${horario}` : ""}\n*Quem vai receber:* ${recebedor || nome}\n\n${paymentInfo}`;
        } else {
            const nome = document.getElementById("pickup-name").value;
            const dataInput = document.getElementById("pickup-date").value;
            const hora = document.getElementById("pickup-time").value;
            const [year, month, day] = dataInput.split("-");
            const dataFormatada = `${day}/${month}/${year}`;

            mensagem += `*Tipo de Pedido:* Retirada\n\n*Nome para Retirada:* ${nome}\n*Data Agendada:* ${dataFormatada}\n*Hora Agendada:* ${hora}`;
        }

        // Grava também no Firestore (além do WhatsApp), pra aparecer no
        // painel "Pedidos Online" do admin. Roda depois de toda a validação
        // e montagem da mensagem, e nunca bloqueia o envio pro WhatsApp
        // (que já funciona hoje) se a escrita falhar.
        try {
            const itensFirestore = carrinho.map((item) => ({
                nome: item.nome,
                preco: item.preco,
                qtd: item.quantidade,
                variacao: item.variacaoEscolhida || null,
                adicionais: item.adicionais || [],
                observacao: item.observacao || null,
            }));
            const clienteFirestore = tipoEntrega === "delivery"
                ? {
                    nome: document.getElementById("delivery-name").value.trim(),
                    telefone: document.getElementById("delivery-phone").value.trim(),
                    cep: document.getElementById("delivery-cep").value.trim(),
                    endereco: document.getElementById("delivery-address").value.trim(),
                  }
                : { nome: document.getElementById("pickup-name").value.trim() };
            // Retirada não tem forma de pagamento pré-selecionada (o cliente
            // paga na hora, no balcão) — só delivery escolhe isso no carrinho.
            const formaPagamento = tipoEntrega === "delivery"
                ? document.querySelector('input[name="payment"]:checked')?.value || null
                : null;
            db.collection("pedidos").add({
                origem: tipoEntrega,
                numeroPedido,
                mesaId: null,
                mesaNome: null,
                itens: itensFirestore,
                subtotal,
                desconto: discountAmount,
                taxaEntrega,
                cupom: appliedCoupon ? appliedCoupon.codigo : null,
                total,
                tipoEntrega,
                formaPagamento,
                cliente: clienteFirestore,
                status: "recebido",
                fechada: false,
                criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
                atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
            }).catch((e) => console.error("Erro ao salvar pedido no Firestore:", e));
        } catch (e) {
            console.error("Erro ao preparar pedido para o Firestore:", e);
        }

        const url = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensagem)}`;
        miniToast(`Pedido nº ${numeroPedido} enviado!`);
        window.open(url, "_blank");
    };

    // --- FINALIZAR PEDIDO DE MESA (sem WhatsApp, direto pro Firestore) ---
    const finalizarPedidoMesa = async () => {
        if (!carrinho.length || !mesaAtual) return;
        if (!lojaAberta) {
            alert("A loja está fechada no momento. Peça a um funcionário para verificar o horário de funcionamento.");
            return;
        }
        const subtotal = carrinho.reduce(
            (acc, item) => acc + precoItemComAdicionais(item) * item.quantidade,
            0,
        );
        const desconto = calcularDesconto(subtotal);
        const total = subtotal - desconto;
        const itens = carrinho.map((item) => ({
            nome: item.nome,
            preco: item.preco,
            qtd: item.quantidade,
            variacao: item.variacaoEscolhida || null,
            adicionais: item.adicionais || [],
            observacao: item.observacao || null,
        }));

        finishOrderBtn.disabled = true;
        try {
            await db.collection("pedidos").add({
                origem: "mesa",
                numeroPedido: null,
                mesaId: mesaAtual.id,
                mesaNome: mesaAtual.nome,
                itens,
                subtotal,
                desconto,
                cupom: appliedCoupon ? appliedCoupon.codigo : null,
                total,
                tipoEntrega: null,
                cliente: null,
                status: "recebido",
                fechada: false,
                criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
                atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
            });
            carrinho = [];
            appliedCoupon = null;
            atualizarCarrinho();
            fecharCarrinho();
            miniToast(`Pedido enviado para a cozinha — ${mesaAtual.nome}!`);
        } catch (e) {
            console.error("Erro ao enviar pedido da mesa:", e);
            alert("Não foi possível enviar o pedido. Verifique sua conexão e tente novamente.");
        } finally {
            finishOrderBtn.disabled = carrinho.length === 0 || !lojaAberta;
        }
    };

    // --- EVENT LISTENERS ---
    cartIcon.addEventListener("click", abrirCarrinho);
    closeCartBtn.addEventListener("click", fecharCarrinho);
    cartOverlay.addEventListener("click", fecharCarrinho);
    applyCouponBtn.addEventListener("click", applyCoupon);
    finishOrderBtn.addEventListener("click", () => {
        if (modoMesa) finalizarPedidoMesa();
        else finalizarPedido();
    });
    viewCartBannerBtn.addEventListener("click", abrirCarrinho);

    productModalCloseBtn.addEventListener("click", fecharModalProduto);
    productModalOverlay.addEventListener("click", (e) => {
        if (e.target === productModalOverlay) fecharModalProduto();
    });
    document.getElementById("product-modal-variacoes").addEventListener("click", (e) => {
        const btn = e.target.closest(".variacao-opcao-btn");
        if (!btn) return;
        modalVariacoesEscolhidas[btn.dataset.tipoId] = {
            tipoNome: btn.dataset.tipoNome,
            opcao: btn.dataset.opcao,
        };
        // desmarca só os outros botões do mesmo grupo de variação
        btn.closest(".variacao-opcoes")
            .querySelectorAll(".variacao-opcao-btn")
            .forEach((b) => b.classList.remove("selecionada"));
        btn.classList.add("selecionada");
        atualizarBotaoComprarModal();
    });
    document.getElementById("product-modal-adicionais").addEventListener("change", (e) => {
        if (!e.target.matches(".adicional-opcao-check")) return;
        atualizarPrecoModalComAdicionais();
    });
    productModalComprarBtn.addEventListener("click", () => {
        if (productModalComprarBtn.disabled) return;
        const produtoId = Number.parseInt(productModalComprarBtn.dataset.id);
        const escolhas = Object.values(modalVariacoesEscolhidas);
        const variacaoEscolhida = escolhas.length
            ? escolhas.map((v) => `${v.tipoNome}: ${v.opcao}`).join(", ")
            : null;
        const adicionaisEscolhidos = obterAdicionaisEscolhidosDoModal();
        const observacao = document.getElementById("product-modal-observacao").value.trim() || null;
        adicionarAoCarrinho(produtoId, null, variacaoEscolhida, adicionaisEscolhidos, observacao);
        fecharModalProduto();
        abrirCarrinho();
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && productModalOverlay.classList.contains("show")) fecharModalProduto();
    });

    // Event listener para botões de categoria (delegação, pois são renderizados dinamicamente)
    categoriesBar.addEventListener("click", (e) => {
        const btn = e.target.closest(".category-btn");
        if (!btn) return;
        // Remove classe active de todos os botões
        categoriesBar
            .querySelectorAll(".category-btn")
            .forEach((b) => b.classList.remove("active"));
        // Adiciona classe active no botão clicado
        btn.classList.add("active");
        // Atualiza categoria ativa
        categoriaAtiva = btn.dataset.category;
        // Filtra e mostra produtos
        filtrarEMostrarProdutos();
    });

    // Event listener para campo de busca
    searchInput.addEventListener("input", (e) => {
        termoBusca = e.target.value;
        filtrarEMostrarProdutos();
    });

    // Handler único de clique nos cards de produto, reaproveitado tanto na
    // grade principal quanto na faixa de Destaques (mesmo template de card).
    const handleProductCardClick = (e) => {
            if (e.target.matches(".product-button")) {
                const productCard = e.target.closest(".product-card");
                const produtoId = Number.parseInt(productCard.dataset.id);
                const produtoClicado = produtos.find((p) => p.id === produtoId);
                // Produto com variação (Cor, Tamanho...) ou com adicionais
                // precisa passar pelo popup antes de ir pro carrinho.
                // Observação sozinha (sem variação/adicionais) não força o
                // popup — continua sendo um toque só pra comprar, e dá pra
                // adicionar uma observação depois direto na linha do carrinho.
                if (produtoClicado && ((produtoClicado.variacoes || []).length || (produtoClicado.adicionaisGrupos || []).length)) {
                    abrirModalProduto(produtoId);
                    return;
                }
                adicionarAoCarrinho(produtoId, productCard);
                return;
            }

            const actionBtn = e.target.closest("[data-action]");
            if (!actionBtn) {
                // Clique em qualquer outra parte do card (imagem, nome, descrição)
                // abre o popup com os detalhes do produto.
                const cardClicado = e.target.closest(".product-card");
                if (cardClicado) abrirModalProduto(Number.parseInt(cardClicado.dataset.id));
                return;
            }
            const productCard = actionBtn.closest(".product-card");
            const produtoId = Number.parseInt(productCard.dataset.id);
            const produto = produtos.find((p) => p.id === produtoId);
            if (!produto) return;

            if (actionBtn.dataset.action === "favoritar") {
                alternarFavorito(produtoId);
                const agoraFav = favoritos.includes(produtoId);
                actionBtn.classList.toggle("active", agoraFav);
                actionBtn.querySelector("i").className = `fa-${agoraFav ? "solid" : "regular"} fa-heart`;
                miniToast(agoraFav ? "Adicionado aos favoritos" : "Removido dos favoritos");
                if (somenteFavoritos && !agoraFav) filtrarEMostrarProdutos();
            }

            if (actionBtn.dataset.action === "compartilhar") {
                const url = `${location.origin}${location.pathname}?produto=${produtoId}`;
                compartilharNoWhatsapp(produto, url);
            }
    };
    document.querySelector(".products-container").addEventListener("click", handleProductCardClick);
    if (destaquesContainer) destaquesContainer.addEventListener("click", handleProductCardClick);

    cartBody.addEventListener("click", (e) => {
        const cartItem = e.target.closest(".cart-item");
        if (cartItem) {
            const index = Number.parseInt(cartItem.dataset.index);
            if (e.target.matches(".quantity-btn"))
                alterarQuantidade(index, e.target.dataset.action);
            if (e.target.matches(".remove-item-btn")) {
                carrinho.splice(index, 1);
                atualizarCarrinho();
            }
        }
    });
    // Atualiza a observação direto no array, sem re-renderizar o carrinho
    // (re-renderizar a cada tecla digitada tiraria o foco do campo).
    cartBody.addEventListener("input", (e) => {
        if (!e.target.matches(".cart-item-obs-input")) return;
        const index = Number.parseInt(e.target.dataset.index);
        if (carrinho[index]) carrinho[index].observacao = e.target.value.trim() || null;
    });

    deliveryToggleBtns.forEach((btn) =>
        btn.addEventListener("click", () => {
            if (btn.disabled) return;
            aplicarTipoEntrega(btn.dataset.option);
        }),
    );

    document
        .querySelectorAll('input[name="payment"], input[name="delivery-mode"]')
        .forEach((radio) => {
            radio.addEventListener("change", (e) => {
                if (e.target.name === "payment") {
                    trocoContainer.style.display =
                        e.target.value === "Dinheiro" ? "block" : "none";
                }
                // Só desmarca visualmente as opções do mesmo grupo (payment ou delivery-mode)
                document
                    .querySelectorAll(`input[name="${e.target.name}"]`)
                    .forEach((r) => r.closest(".payment-option").classList.remove("selected"));
                e.target.closest(".payment-option").classList.add("selected");
            });
        });

    // Remove o erro ao digitar
    document
        .querySelectorAll(
            "#delivery-form-container input[required], #pickup-form-container input[required], #pickup-form-container select[required]",
        )
        .forEach((input) => {
            input.addEventListener("input", () => {
                if (input.value.trim() !== "") input.classList.remove("error");
            });
        });

    // --- BOTÃO FLUTUANTE DO WHATSAPP ---
    const botaoWhatsapp = document.createElement("a");
    botaoWhatsapp.className = "whatsapp-float";
    botaoWhatsapp.target = "_blank";
    botaoWhatsapp.rel = "noopener";
    botaoWhatsapp.setAttribute("aria-label", "Falar no WhatsApp");
    botaoWhatsapp.innerHTML = `<i class="fab fa-whatsapp" aria-hidden="true"></i>`;
    botaoWhatsapp.href = `https://wa.me/${configLoja.whatsapp}?text=${encodeURIComponent("Olá! Vim pelo site e tenho uma dúvida.")}`;
    document.body.appendChild(botaoWhatsapp);

    // --- INICIALIZAÇÃO ---
    renderizarDestaques();
    filtrarEMostrarProdutos();
    atualizarCarrinho();
    carregarDadosCliente();

    // Link compartilhado (?produto=ID): abre o popup do produto direto
    const produtoCompartilhadoId = new URLSearchParams(location.search).get("produto");
    if (produtoCompartilhadoId) {
        const idNumerico = Number.parseInt(produtoCompartilhadoId);
        if (produtos.some((p) => p.id === idNumerico)) {
            abrirModalProduto(idNumerico);
        }
    }
});
