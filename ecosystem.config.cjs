module.exports = {
  apps: [
    {
      name: "tap-and-tally",
      script: "build/index.js",
      cwd: __dirname,
      env: { NODE_ENV: "production", HOST: "0.0.0.0", PORT: "8000" },
    },
  ],
};
