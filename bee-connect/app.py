"""Bee Connect — back-end de cadastro (Flask + SQLite).

Rodar:  python app.py   →   http://127.0.0.1:5000
O banco (beeconnect.db) é criado automaticamente na primeira execução.
"""
import os
import re
import secrets
import sqlite3
from contextlib import closing
from pathlib import Path

from flask import Flask, g, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "beeconnect.db"

# O front (html/css/js/imagens) fica na pasta "site/" e é servido na raiz do site.
app = Flask(__name__, static_folder="site", static_url_path="")


def carregar_chave_secreta() -> str:
    """Chave que assina o cookie de sessão. Em produção, defina BEE_SECRET_KEY."""
    chave = os.environ.get("BEE_SECRET_KEY")
    if chave:
        return chave
    arquivo = BASE_DIR / ".secret_key"
    if not arquivo.exists():
        arquivo.write_text(secrets.token_hex(32))
    return arquivo.read_text().strip()


app.secret_key = carregar_chave_secreta()
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax")

# ---------------------------------------------------------------- banco ----
SCHEMA = """
CREATE TABLE IF NOT EXISTS contratante (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    nome           TEXT    NOT NULL,
    cnpj           TEXT    NOT NULL UNIQUE,   -- 14 caracteres, sem máscara
    email          TEXT    NOT NULL UNIQUE,
    senha_hash     TEXT    NOT NULL,          -- nunca a senha em texto puro
    aceitou_termos INTEGER NOT NULL DEFAULT 1,
    criado_em      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prestador (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    nome           TEXT    NOT NULL,
    cnpj           TEXT    NOT NULL UNIQUE,   -- 14 caracteres, sem máscara
    telefone       TEXT    NOT NULL,          -- só dígitos, com DDD
    email          TEXT    NOT NULL UNIQUE,
    servico        TEXT    NOT NULL,
    cobranca       TEXT    NOT NULL
                   CHECK (cobranca IN ('hora', 'dia', 'temporario', 'a-combinar')),
    senha_hash     TEXT    NOT NULL,
    aceitou_termos INTEGER NOT NULL DEFAULT 1,
    criado_em      TEXT    NOT NULL DEFAULT (datetime('now'))
);
"""


def iniciar_banco():
    with closing(sqlite3.connect(DB_PATH)) as conn:
        conn.executescript(SCHEMA)
        conn.commit()


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def fechar_db(_erro):
    db = g.pop("db", None)
    if db is not None:
        db.close()


# ----------------------------------------------------------- validações ----
# Espelham as do codigo.js: o front valida para ajudar o usuário,
# o back valida porque nunca se deve confiar só no navegador.

COBRANCAS = {"hora", "dia", "temporario", "a-combinar"}


def calcular_dv(base: str) -> int:
    """Dígito verificador do CNPJ (módulo 11). Serve para numérico e alfanumérico."""
    soma, peso = 0, 2
    for caractere in reversed(base):
        soma += (ord(caractere) - 48) * peso
        peso = 2 if peso == 9 else peso + 1
    resto = soma % 11
    return 0 if resto < 2 else 11 - resto


def normalizar_cnpj(valor: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", valor.upper())


def cnpj_valido(cnpj: str) -> bool:
    if not re.fullmatch(r"[A-Z0-9]{12}\d{2}", cnpj):
        return False
    if len(set(cnpj)) == 1:  # 00000000000000, 11111111111111...
        return False
    dv1 = calcular_dv(cnpj[:12])
    dv2 = calcular_dv(cnpj[:12] + str(dv1))
    return cnpj.endswith(f"{dv1}{dv2}")


def email_valido(valor: str) -> bool:
    return len(valor) <= 254 and re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]{2,}", valor) is not None


def telefone_valido(digitos: str) -> bool:
    return re.fullmatch(r"[1-9]{2}(9\d{8}|\d{8})", digitos) is not None


def texto(dados: dict, campo: str) -> str:
    valor = dados.get(campo)
    return valor.strip() if isinstance(valor, str) else ""


def validar(dados: dict, tipo: str):
    """Devolve (dados_limpos, erros). Erros é {campo: mensagem}."""
    limpos, erros = {}, {}

    # nome
    nome = texto(dados, "nome")
    if not nome:
        erros["nome"] = "Preencha este campo."
    elif len(nome) > 150:
        erros["nome"] = "O nome pode ter no máximo 150 caracteres."
    limpos["nome"] = nome

    # cnpj
    cnpj_bruto = texto(dados, "cnpj")
    cnpj = normalizar_cnpj(cnpj_bruto)
    if not cnpj_bruto:
        erros["cnpj"] = "Preencha este campo."
    elif not cnpj_valido(cnpj):
        erros["cnpj"] = "CNPJ inválido. Confira os 14 caracteres."
    limpos["cnpj"] = cnpj

    # telefone, serviço e cobrança (só prestadora)
    if tipo == "prestadora":
        telefone_bruto = texto(dados, "telefone")
        telefone = re.sub(r"\D", "", telefone_bruto)
        if not telefone_bruto:
            erros["telefone"] = "Preencha este campo."
        elif not telefone_valido(telefone):
            erros["telefone"] = "Digite o telefone com DDD, como (41) 99999-9999."
        limpos["telefone"] = telefone

    # e-mail
    email = texto(dados, "email").lower()
    if not email:
        erros["email"] = "Preencha este campo."
    elif not email_valido(email):
        erros["email"] = "Digite um e-mail válido, como contato@empresa.com.br."
    limpos["email"] = email

    if tipo == "prestadora":
        servico = texto(dados, "servico")
        if not servico:
            erros["servico"] = "Preencha este campo."
        elif len(servico) > 200:
            erros["servico"] = "Descreva o serviço em até 200 caracteres."
        limpos["servico"] = servico

        cobranca = texto(dados, "cobranca")
        if not cobranca:
            erros["cobranca"] = "Escolha uma opção."
        elif cobranca not in COBRANCAS:
            erros["cobranca"] = "Opção de cobrança inválida."
        limpos["cobranca"] = cobranca

    # senha (não usa strip: espaços podem fazer parte da senha)
    senha = dados.get("senha") if isinstance(dados.get("senha"), str) else ""
    if not senha:
        erros["senha"] = "Preencha este campo."
    elif len(senha) < 8:
        erros["senha"] = "A senha precisa ter pelo menos 8 caracteres."
    elif len(senha) > 128:
        erros["senha"] = "A senha pode ter no máximo 128 caracteres."
    limpos["senha"] = senha

    # termos
    if dados.get("termos") is not True:
        erros["termos"] = "Aceite os termos para continuar."

    return limpos, erros


# ---------------------------------------------------------------- rotas ----
@app.get("/")
def home():
    return app.send_static_file("index.html")


@app.post("/api/cadastro")
def cadastrar():
    dados = request.get_json(silent=True)
    if not isinstance(dados, dict):
        return jsonify(erros={"geral": "Requisição inválida."}), 400

    # o front chama de "requisitante"; no banco a tabela é "contratante"
    tipo = dados.get("tipo")
    if tipo not in ("requisitante", "prestadora"):
        return jsonify(erros={"geral": "Tipo de cadastro inválido."}), 400

    limpos, erros = validar(dados, tipo)
    if erros:
        return jsonify(erros=erros), 400

    senha_hash = generate_password_hash(limpos["senha"])
    db = get_db()

    try:
        with db:  # commit automático, rollback se der erro
            if tipo == "requisitante":
                cursor = db.execute(
                    "INSERT INTO contratante (nome, cnpj, email, senha_hash) VALUES (?, ?, ?, ?)",
                    (limpos["nome"], limpos["cnpj"], limpos["email"], senha_hash),
                )
            else:
                cursor = db.execute(
                    """INSERT INTO prestador
                       (nome, cnpj, telefone, email, servico, cobranca, senha_hash)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (
                        limpos["nome"], limpos["cnpj"], limpos["telefone"], limpos["email"],
                        limpos["servico"], limpos["cobranca"], senha_hash,
                    ),
                )
    except sqlite3.IntegrityError as erro:
        # ex.: "UNIQUE constraint failed: contratante.cnpj"
        mensagem = str(erro)
        if "cnpj" in mensagem:
            return jsonify(erros={"cnpj": "Este CNPJ já está cadastrado."}), 409
        if "email" in mensagem:
            return jsonify(erros={"email": "Este e-mail já está cadastrado."}), 409
        return jsonify(erros={"geral": "Não foi possível salvar o cadastro."}), 400

    return jsonify(ok=True, id=cursor.lastrowid), 201


# ---------------------------------------------------------------- login ----
# o front chama de "requisitante"; no banco a tabela é "contratante"
TABELA_POR_TIPO = {"requisitante": "contratante", "prestadora": "prestador"}

# hash de mentira: gasta o mesmo tempo quando o e-mail não existe,
# para não dar pista de quais e-mails estão cadastrados
HASH_FALSO = generate_password_hash("senha-falsa-para-igualar-o-tempo")


@app.post("/api/login")
def login():
    dados = request.get_json(silent=True)
    if not isinstance(dados, dict):
        return jsonify(erros={"geral": "Requisição inválida."}), 400

    tipo = dados.get("tipo")
    email = texto(dados, "email").lower()
    senha = dados.get("senha") if isinstance(dados.get("senha"), str) else ""

    erros = {}
    if tipo not in TABELA_POR_TIPO:
        erros["tipo"] = "Escolha o tipo de conta."
    if not email:
        erros["email"] = "Preencha este campo."
    if not senha:
        erros["senha"] = "Preencha este campo."
    if erros:
        return jsonify(erros=erros), 400

    tabela = TABELA_POR_TIPO[tipo]  # vem da lista fixa acima, então é seguro no SQL
    usuario = get_db().execute(
        f"SELECT id, nome, senha_hash FROM {tabela} WHERE email = ?", (email,)
    ).fetchone()

    senha_ok = check_password_hash(usuario["senha_hash"] if usuario else HASH_FALSO, senha)
    if not usuario or not senha_ok:
        return jsonify(erros={"geral": "E-mail ou senha incorretos."}), 401

    session.clear()
    session["usuario_id"] = usuario["id"]
    session["tipo"] = tipo
    return jsonify(ok=True, nome=usuario["nome"], tipo=tipo)


@app.get("/api/me")
def quem_sou_eu():
    tipo = session.get("tipo")
    if tipo not in TABELA_POR_TIPO or "usuario_id" not in session:
        return jsonify(erros={"geral": "Não autenticado."}), 401

    tabela = TABELA_POR_TIPO[tipo]
    usuario = get_db().execute(
        f"SELECT nome, cnpj, email FROM {tabela} WHERE id = ?", (session["usuario_id"],)
    ).fetchone()
    if not usuario:
        session.clear()
        return jsonify(erros={"geral": "Não autenticado."}), 401

    return jsonify(tipo=tipo, nome=usuario["nome"], cnpj=usuario["cnpj"], email=usuario["email"])


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


@app.errorhandler(500)
def erro_interno(_erro):
    return jsonify(erros={"geral": "Erro interno. Tente novamente em instantes."}), 500


iniciar_banco()

if __name__ == "__main__":
    app.run(debug=True)
