/* ===== Cadastro — Bee Connect ===== */

const cartao = document.querySelector('.cartao-form');
const abas = document.querySelectorAll('.aba');
const paineis = document.querySelectorAll('.painel');

/* ---------- 1. Abas (requisitante / prestadora) ---------- */
function mostrarAba(tipo) {
  abas.forEach((aba) => {
    const ativa = aba.dataset.tipo === tipo;
    aba.setAttribute('aria-selected', ativa);
    aba.tabIndex = ativa ? 0 : -1;
  });

  paineis.forEach((painel) => {
    painel.hidden = painel.dataset.tipo !== tipo;
  });

  cartao.dataset.tipo = tipo; // o CSS usa isso para trocar a cor da borda
}

abas.forEach((aba) => {
  aba.addEventListener('click', () => mostrarAba(aba.dataset.tipo));

  // setas ← → trocam de aba (padrão de acessibilidade para abas)
  aba.addEventListener('keydown', (evento) => {
    if (evento.key !== 'ArrowLeft' && evento.key !== 'ArrowRight') return;
    const outra = aba.dataset.tipo === 'requisitante' ? 'prestadora' : 'requisitante';
    mostrarAba(outra);
    document.getElementById('aba-' + outra).focus();
  });
});

// Permite abrir direto numa aba: cadastro.html?tipo=prestadora
const tipoNaUrl = new URLSearchParams(window.location.search).get('tipo');
if (tipoNaUrl === 'requisitante' || tipoNaUrl === 'prestadora') {
  mostrarAba(tipoNaUrl);
}

/* ---------- 2. Máscaras ---------- */

// CNPJ no formato XX.XXX.XXX/XXXX-XX
// Aceita letras: desde julho de 2026 a Receita pode emitir CNPJ alfanumérico
// (12 primeiras posições com letras e números; as 2 últimas são sempre números).
function mascaraCnpj(valor) {
  const c = valor.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 14);
  let resultado = c.slice(0, 2);
  if (c.length > 2)  resultado += '.' + c.slice(2, 5);
  if (c.length > 5)  resultado += '.' + c.slice(5, 8);
  if (c.length > 8)  resultado += '/' + c.slice(8, 12);
  if (c.length > 12) resultado += '-' + c.slice(12, 14);
  return resultado;
}

// Telefone no formato (00) 00000-0000 ou (00) 0000-0000
function mascaraTelefone(valor) {
  const n = valor.replace(/\D/g, '').slice(0, 11);
  if (n.length === 0) return '';
  if (n.length <= 2) return '(' + n;
  if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
}

const mascaras = { cnpj: mascaraCnpj, telefone: mascaraTelefone };

document.querySelectorAll('[data-mascara]').forEach((campo) => {
  campo.addEventListener('input', () => {
    campo.value = mascaras[campo.dataset.mascara](campo.value);
  });
});

/* ---------- 3. Validações ---------- */

// Dígito verificador do CNPJ (módulo 11, pesos de 2 a 9 da direita para a esquerda).
// Cada caractere vale (código ASCII - 48): números 0–9 continuam valendo 0–9
// e as letras A–Z passam a valer 17–42. Por isso serve para os dois formatos.
function calcularDV(base) {
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += (base.charCodeAt(i) - 48) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function cnpjValido(valor) {
  const cnpj = valor.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj)) return false;
  if (/^(.)\1+$/.test(cnpj)) return false; // 00000000000000, 11111111111111...

  const base = cnpj.slice(0, 12);
  const dv1 = calcularDV(base);
  const dv2 = calcularDV(base + dv1);
  return cnpj.endsWith(`${dv1}${dv2}`);
}

function emailValido(valor) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor);
}

function telefoneValido(valor) {
  const n = valor.replace(/\D/g, '');
  // DDD (2 dígitos) + celular com 9 (9 dígitos) ou fixo (8 dígitos)
  return /^[1-9]{2}(9\d{8}|\d{8})$/.test(n);
}

// Devolve o texto do erro, ou '' se o campo está certo
function mensagemDeErro(campo) {
  if (campo.type === 'checkbox') {
    return campo.checked ? '' : 'Aceite os termos para continuar.';
  }

  const valor = campo.value.trim();

  if (valor === '') {
    return campo.tagName === 'SELECT' ? 'Escolha uma opção.' : 'Preencha este campo.';
  }

  switch (campo.dataset.validar) {
    case 'cnpj':
      return cnpjValido(valor) ? '' : 'CNPJ inválido. Confira os 14 caracteres.';
    case 'email':
      return emailValido(valor) ? '' : 'Digite um e-mail válido, como contato@empresa.com.br.';
    case 'telefone':
      return telefoneValido(valor) ? '' : 'Digite o telefone com DDD, como (41) 99999-9999.';
    case 'senha':
      return valor.length >= 8 ? '' : 'A senha precisa ter pelo menos 8 caracteres.';
    default:
      return '';
  }
}

// Mostra ou limpa o erro de um campo. Devolve true se o campo está válido.
function validarCampo(campo) {
  const mensagem = mensagemDeErro(campo);
  const areaDoErro = document.getElementById(campo.id + '-erro');

  areaDoErro.textContent = mensagem;
  campo.setAttribute('aria-invalid', mensagem !== '');
  return mensagem === '';
}

/* ---------- 4. Formulários ---------- */
document.querySelectorAll('.formulario').forEach((form) => {
  const campos = form.querySelectorAll('input, select');

  campos.forEach((campo) => {
    // valida ao sair do campo...
    campo.addEventListener('blur', () => validarCampo(campo));
    // ...e some com o erro assim que a pessoa corrige
    const evento = campo.type === 'checkbox' || campo.tagName === 'SELECT' ? 'change' : 'input';
    campo.addEventListener(evento, () => {
      if (campo.getAttribute('aria-invalid') === 'true') validarCampo(campo);
    });
  });

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault(); // impede a página de recarregar

    const painel = form.closest('.painel');
    mostrarAviso(painel, '');

    let primeiroInvalido = null;
    campos.forEach((campo) => {
      if (!validarCampo(campo) && !primeiroInvalido) primeiroInvalido = campo;
    });

    if (primeiroInvalido) {
      primeiroInvalido.focus();
      return;
    }

    const dados = Object.fromEntries(new FormData(form));
    dados.tipo = painel.dataset.tipo;
    dados.termos = form.querySelector('[name="termos"]').checked; // booleano de verdade

    const botao = form.querySelector('button[type="submit"]');
    botao.disabled = true;

    try {
      const resposta = await fetch('/api/cadastro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      });
      const resultado = await resposta.json().catch(() => ({}));

      if (!resposta.ok) {
        mostrarErrosDoServidor(form, painel, resultado.erros);
        return;
      }

      form.reset();
      mostrarAviso(painel, 'Cadastro enviado com sucesso!');
    } catch (erro) {
      mostrarAviso(painel, 'Não foi possível conectar ao servidor. Tente novamente.', true);
    } finally {
      botao.disabled = false;
    }
  });
});

/* ---------- 5. Respostas do servidor ---------- */

// Aviso no topo do painel. falha = true usa o estilo de erro.
function mostrarAviso(painel, mensagem, falha = false) {
  const aviso = painel.querySelector('.sucesso');
  aviso.textContent = mensagem;
  aviso.classList.toggle('falha', falha);
  aviso.hidden = mensagem === '';
  if (mensagem) aviso.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// O servidor devolve { erros: { campo: "mensagem" } }.
// Campos conhecidos mostram o erro embaixo do input; o resto vira aviso geral.
function mostrarErrosDoServidor(form, painel, erros = {}) {
  let primeiroComErro = null;
  let mensagemGeral = '';

  Object.entries(erros).forEach(([nome, mensagem]) => {
    const campo = form.querySelector(`[name="${nome}"]`);
    if (!campo) {
      mensagemGeral = mensagem;
      return;
    }
    document.getElementById(campo.id + '-erro').textContent = mensagem;
    campo.setAttribute('aria-invalid', 'true');
    if (!primeiroComErro) primeiroComErro = campo;
  });

  if (primeiroComErro) primeiroComErro.focus();
  if (mensagemGeral || !primeiroComErro) {
    mostrarAviso(painel, mensagemGeral || 'Não foi possível concluir o cadastro.', true);
  }
}
