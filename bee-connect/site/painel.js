/* ===== Painel — Bee Connect ===== */

function formatarCnpj(c) {
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12, 14)}`;
}

async function carregar() {
  const resposta = await fetch('/api/me');
  if (resposta.status === 401) {
    window.location.replace('login.html');
    return;
  }
  const d = await resposta.json();

  document.getElementById('saudacao').textContent = 'Olá, ' + d.nome;
  document.getElementById('tipo-conta').textContent =
    d.tipo === 'prestadora' ? 'Conta de empresa prestadora' : 'Conta de empresa requisitante';
  document.getElementById('d-nome').textContent = d.nome;
  document.getElementById('d-cnpj').textContent = formatarCnpj(d.cnpj);
  document.getElementById('d-email').textContent = d.email;
  document.getElementById('cartao').dataset.tipo = d.tipo;
}

document.getElementById('sair').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = 'index.html';
});

carregar();
