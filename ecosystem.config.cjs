// PM2 config for the Linux homeserver deployment.
// NOTE: The project deploys via restart_api.sh / restart_web.sh (systemd-style
// background processes), not PM2. This file is kept only for parity and should
// NOT run Next in dev mode. If unused, it can be deleted.
module.exports = {
  apps: [
    {
      name: "budget-api",
      cwd: "/home/digitalport2budget/htdocs/budget.digitalport.my/apps/api",
      script: "venv/bin/python",
      args: "main.py",
      autorestart: true,
      max_restarts: 50,
      min_uptime: "5s",
      env: {
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
      },
    },
    {
      name: "budget-web",
      cwd: "/home/digitalport2budget/htdocs/budget.digitalport.my/apps/web",
      script: "node_modules/.bin/next",
      args: "start",
      autorestart: true,
      max_restarts: 50,
      min_uptime: "5s",
    },
  ],
};
