module.exports = {
  apps: [
    {
      name: "budget-api",
      cwd: "E:/Project/budgetsw/apps/api",
      script: "E:/Project/budgetsw/apps/api/venv/Scripts/python.exe",
      args: "main.py",
      interpreter: "none",
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
      cwd: "E:/Project/budgetsw/apps/web",
      script: "E:/Project/budgetsw/apps/web/node_modules/next/dist/bin/next",
      args: "dev",
      interpreter: "C:/Program Files/nodejs/node.exe",
      autorestart: true,
      max_restarts: 50,
      min_uptime: "5s",
    },
  ],
};
