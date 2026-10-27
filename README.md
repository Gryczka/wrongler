# Wrongler 🚀

> Wrangler with YOLO mode - because sometimes you just gotta ship it

## ⚠️ WARNING: FOR FUN ONLY ⚠️

**This project is called WRONGler for a reason.**

- 🎲 **DO NOT use this for serious/production work**
- 🎪 **This is a fun side project and experimental wrapper**
- 💥 **YOLO deploy is exactly what it sounds like - use at your own risk**
- 🎢 **Automatic deployments on every save can go hilariously wrong**
- 🤡 **No warranties, no guarantees, just pure YOLO energy**

If you're looking for a reliable, production-ready deployment tool, use [Wrangler](https://github.com/cloudflare/workers-sdk) directly. If you want to live dangerously and have some fun, welcome aboard! 🎉

---

**Wrongler** is a lightweight wrapper around [Cloudflare's Wrangler](https://github.com/cloudflare/workers-sdk) that adds **YOLO Mode** - automatic redeployment on file changes, inspired by AWS SAM's `sam sync --watch`.

## Installation

```bash
# Install wrongler
npm install -g @gryczka/wrongler

# wrongler requires wrangler as a peer dependency
npm install -g wrangler
```

Or use both together:
```bash
npm install -g @gryczka/wrongler wrangler
```

## What is YOLO Mode?

YOLO Mode watches your Worker files and automatically redeploys to Cloudflare's edge on every save. Perfect for rapid development iterations!

### Features

- ✅ **Auto-deploy on save** - 50ms debounce for rapid changes
- ✅ **Smart file watching** - Excludes build artifacts automatically
- ✅ **Condensed output** - Clean, minimal deployment info
- ✅ **Error resilient** - Stays in watch mode even if deployment fails
- ✅ **Graceful shutdown** - Clean exit on Ctrl+C

## Usage

### Basic YOLO Mode
```bash
wrongler deploy --yolo
```

This will:
1. Deploy your Worker initially
2. Watch for file changes
3. Automatically redeploy on save
4. Show condensed deployment output with URLs

### Verbose Output
```bash
wrongler deploy --yolo --verbose
```

Shows full deployment output instead of condensed mode.

### With Environment
```bash
wrongler deploy --yolo --env production
```

### With Custom Entry Point
```bash
wrongler deploy src/worker.ts --yolo
```

### With Custom Worker Name
```bash
wrongler deploy --yolo --name my-worker
```

All standard Wrangler deploy flags work with YOLO mode!

### Example Output

```
🚀 YOLO Mode activated - watching for changes...

Watching:
  - wrangler.toml
  - index.js
  - /project/dir

~ index.js
[4:41:34 PM] Deployment #1 starting...
[4:41:40 PM] ✓ Deployment #1 (5732ms)
  └─ Worker: https://my-worker.account.workers.dev
  └─ Preview: https://982b47f4-my-worker.account.workers.dev
  └─ Version: 982b47f4-5d2d-471b-a084-508acc7a2bc4

~ index.js
[4:41:45 PM] Deployment #2 starting...
[4:41:50 PM] ✓ Deployment #2 (4823ms)
  └─ Worker: https://my-worker.account.workers.dev
  └─ Preview: https://a8b2c3d4-my-worker.account.workers.dev
  └─ Version: a8b2c3d4-e5f6-7890-abcd-ef1234567890
```

## Regular Wrangler Commands

Wrongler is a drop-in replacement for Wrangler. All commands work exactly the same:

```bash
wrongler dev
wrongler deploy
wrongler tail
wrongler kv:key put
# ... all other wrangler commands
```

## cf Mode

Cloudflare's newer [`cf` CLI](https://www.npmjs.com/package/cf) (in beta) covers the whole Cloudflare API and is set to replace Wrangler. Wrongler can drive it instead of Wrangler, YOLO mode included.

```bash
# cf needs Node.js 22.23+ or 24.22+
npm install -g cf
```

### Turning it on

Wrongler picks the CLI in this order:

1. **Flags:** `--cf` or `--wrangler`, anywhere in the command
2. **Environment:** `WRONGLER_CLI=cf` or `WRONGLER_CLI=wrangler`
3. **Auto-detect:** a `cloudflare.config.ts` in the current folder with no Wrangler config means cf. A Wrangler config (`wrangler.toml`, `wrangler.json` or `wrangler.jsonc`) means Wrangler, following Cloudflare's guidance.
4. **Default:** Wrangler

```bash
wrongler --cf zones list
wrongler --cf d1 list | jq '.[].name'
WRONGLER_CLI=cf wrongler workers list
```

### YOLO Mode with cf

In a project with `cloudflare.config.ts`:

```bash
wrongler deploy --yolo
wrongler deploy --yolo --mode staging
```

Each save runs `cf deploy`. Wrongler watches the project folder, skipping `node_modules/`, `dist/`, `.cloudflare/`, `.wrangler/` and `.git/`. Other `cf deploy` flags pass through, and `--verbose` shows cf's full output.

### Good to know

- **`--env` becomes `--mode`.** For `deploy`, `dev` and `build`, a Wrangler-style `--env staging` is passed to cf as `--mode staging`.
- **`tail` and `secret` still go to Wrangler.** cf has no live logs or single-secret commands yet, so in cf mode these run through Wrangler.
- **Wrangler projects need migrating first.** cf won't `deploy`, `dev` or `build` a project that only has a Wrangler config. Preview the migration with `wrongler --cf migrate --dry-run`.
- **The warning banner goes to stderr**, so cf's JSON output on stdout pipes cleanly into `jq`.
- **cf is found as an npm package**, preferring the project's own copy, then one installed next to wrongler, then the global install. It is never looked up on PATH, because the Cloud Foundry CLI is also called `cf`.

## Why "Wrongler"?

Because adding auto-deploy on save is either brilliantly right or hilariously wrong depending on your perspective. It's called WRONG-ler because:

- Every file save triggers a deployment (what could go wrong? 😅)
- No confirmation, no safety nets, just pure deployment chaos
- It's the tool equivalent of "hold my beer and watch this"

**Use YOLO deploy solely for fun and at your own risk.** YOLO! 🎉

## Differences from Wrangler

Wrongler adds the `--yolo` flag to the `deploy` command for automatic redeployment on file changes, plus `--cf` / `--wrangler` to choose which Cloudflare CLI runs (see [cf Mode](#cf-mode)). All other commands work exactly the same as the underlying CLI.

## Development

### Setup
```bash
git clone https://github.com/Gryczka/wrongler.git
cd wrongler
npm install
npm run build
```

### Testing Locally
```bash
# Link globally
npm link

# Test in a Worker project
cd /path/to/your/worker
wrongler deploy
```

### Building
```bash
npm run build
```

## License

This project maintains the same dual MIT OR Apache-2.0 license as the original Wrangler project.

- MIT License: See [LICENSE-MIT](LICENSE-MIT)
- Apache 2.0 License: See [LICENSE-APACHE](LICENSE-APACHE)

## Credits

- **Wrangler**: Created and maintained by [Cloudflare](https://github.com/cloudflare/workers-sdk)
- **YOLO Mode**: Added by [Gryczka](https://github.com/Gryczka)
- **Inspired by**: AWS SAM's `sam sync --watch` feature

## Links

- [GitHub Repository](https://github.com/Gryczka/wrongler)
- [npm Package](https://www.npmjs.com/package/@gryczka/wrongler)
- [Feature Branch with YOLO Mode](https://github.com/Gryczka/workers-sdk-wrangler-yolo/tree/feat/yolo-mode)
- [Original Wrangler](https://github.com/cloudflare/workers-sdk)

---

## Disclaimer

**This is an unofficial, experimental wrapper for fun purposes only.** Not affiliated with or endorsed by Cloudflare.

⚠️ **IMPORTANT**:
- This project is for entertainment and experimentation
- Not intended for production or serious development work
- Use at your own risk - automatic deployments can have unexpected consequences
- When in doubt, use [official Wrangler](https://github.com/cloudflare/workers-sdk) instead

**Made with ☕ and YOLO spirit** - but seriously, don't use this for anything important! 🎲
