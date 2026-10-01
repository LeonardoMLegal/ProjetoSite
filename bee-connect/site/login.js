/* ===== Login — Bee Connect ===== */

const cartao = document.querySelector('.cartao-form');
const form = document.querySelector('.formulario');
const aviso = document.querySelector('.sucesso');
const campos = form.querySelectorAll('input, select');

function mostrarAviso(mensagem) {
  aviso.textContent = mensagem;
  aviso.hidden = mensagem === '';
}

function mostrarErro(campo, mensagem) {
  document.getElementById(campo.id + '-erro').textContent = mensagem;
  campo.setAttribute('aria-invalid', mensagem !== '');
}

// Devolve true se o campo está preenchido
function validarCampo(campo) {
  const vazio = campo.type === 'password' ? campo.value === '' : campo.value.trim() === '';
  mostrarErro(campo, vazio ? (campo.tagName === 'SELECT' ? 'Escolha uma opção.' : 'Preencha este campo.') : '');
  return !vazio;
}

campos.forEach((campo) => {
  campo.addEventListener('blur', () => validarCampo(campo));
  const evento = campo.tagName === 'SELECT' ? 'change' : 'input';
  campo.addEventListener(evento, () => {
    if (campo.getAttribute('aria-invalid') === 'true') validarCampo(campo);
  });
});

// a cor da borda do cartão acompanha o tipo escolhido, como no cadastro
document.getElementById('log-tipo').addEventListener('change', (e) => {
  cartao.dataset.tipo = e.target.value;
});

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  mostrarAviso('');

  let primeiroInvalido = null;
  campos.forEach((campo) => {
    if (!validarCampo(campo) && !primeiroInvalido) primeiroInvalido = campo;
  });
  if (primeiroInvalido) {
    primeiroInvalido.focus();
    return;
  }

  const botao = form.querySelector('button[type="submit"]');
  botao.disabled = true;

  try {
    const resposta = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const resultado = await resposta.json().catch(() => ({}));

    if (resposta.ok) {
      window.location.href = 'painel.html';
      return;
    }

    const erros = resultado.erros || {};
    let mensagemGeral = '';
    Object.entries(erros).forEach(([nome, mensagem]) => {
      const campo = form.querySelector(`[name="${nome}"]`);
      if (campo) mostrarErro(campo, mensagem);
      else mensagemGeral = mensagem;
    });
    mostrarAviso(mensagemGeral || (Object.keys(erros).length ? '' : 'Não foi possível entrar.'));
  } catch (erro) {
    mostrarAviso('Não foi possível conectar ao servidor. Tente novamente.');
  } finally {
    botao.disabled = false;
  }
});
