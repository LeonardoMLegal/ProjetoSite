# Bee Connect

```
pip install -r requirements.txt
python app.py
```

Abra http://127.0.0.1:5000 — o banco (beeconnect.db) é criado sozinho.

- Front: pasta `site/` (servida pelo Flask)
- Tabelas: `contratante` e `prestador`
- Rotas: POST /api/cadastro, POST /api/login, GET /api/me, POST /api/logout
- Em produção, defina a variável de ambiente BEE_SECRET_KEY e desligue o debug.
