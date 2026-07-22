module.exports = {
  apps: [{
    name: "tap-to-track",
    script: "node_modules/.bin/tsx",
    args: "server/index.ts",
    cwd: __dirname,
    env: { NODE_ENV: "production", PORT: "8000", DB_PATH: "./data/tap-to-track.db" },
    env_file: ".env"
  }]
};
