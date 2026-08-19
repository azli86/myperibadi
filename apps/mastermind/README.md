# Mastermind

Standalone MyPeribadi administration portal.

- `api/`: independent FastAPI service; default port `8031`
- `web/`: independent Next.js service; default port `8030`
- No imports from `apps/api` or `apps/web`
- Database access uses an explicit table allowlist. Unrelated/Cuba Info Biz data is intentionally ignored.

## Start

```bash
cd apps/mastermind/api
python -m venv venv && venv/bin/pip install -r requirements.txt
cp .env.example .env
venv/bin/uvicorn main:app --host 127.0.0.1 --port 8031

cd ../web
npm install
cp .env.example .env.local
npm run dev -- --port 8030
```

Set `MASTERMIND_ADMIN_PASSWORD_SHA256` using:

```bash
printf '%s' 'strong-password' | sha256sum
```

Initial scope: isolated admin login, system dashboard, read-only user directory. Mutations, RBAC, MFA, audit trail intentionally deferred until admin identity storage is finalized.
