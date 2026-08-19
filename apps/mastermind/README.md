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

Admin login uses the existing `users` table: active users with `is_admin=true`, verified against the existing bcrypt `password_hash`. Mastermind keeps its own JWT secret and cookie; normal users cannot enter.

Initial scope: isolated admin login, system dashboard, read-only user directory. Mutations, role levels, MFA, audit trail intentionally deferred.
