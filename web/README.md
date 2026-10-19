# arch-template Web UI

中文优先的表单，也带英文。用来生成 Architectury 双平台模组工程。页面本身不跑模板逻辑。浏览器把选项 JSON 交给 API，API 调用引擎的 `generateZip(options)`，返回 `application/zip`。警告放在响应头 `X-Arch-Template-Warnings`（UTF-8 JSON 的 base64）。

选中的 Minecraft 版本（包括「Arch 官方模板」）都走这一条生成接口，不会改成打开外链。

选项字段名和校验规则都没有改。网页层只做了两件额外的事：

- 拒绝 `icon.path`。那是命令行读本地文件用的，网页接口只接受 `icon.base64` / `icon.pngBase64`，避免服务端被拿去读任意路径。
- 一次最多 20 个依赖，请求正文大约限制在 2MB。这是网页接口的上限，不是引擎的上限。

仓库里没有 Cloudflare API token，也没有 account id。

## 语言

页头有 **中文 / English**。默认中文。选择会写到 `localStorage` 键 `arch-template-lang`（`zh` 或 `en`），下次打开仍用上次的语言。私人浏览拒绝存储时，这次访问里的切换仍然有效。

切换会重写整张表单：标题、说明、空状态、字段错误、预设和依赖按钮、生成结果和引擎警告。接口失败时，页面用当前语言翻译响应里的 `detail`（引擎英文原文）。`error` 字段仍是中文，给不跑这张表单的客户端看。

## 版本下拉

Minecraft 版本是一个 `<select>`，选项来自 `listBases()`，分成两组：

| 分组 | 标签 | 版本（新到旧） |
| --- | --- | --- |
| 维护底模 / Maintained | `kind: custom` | 1.21.1、1.20.1 |
| Arch 官方模板 / Arch official | `kind: arch-official` | 1.19.4、1.19.3、1.19.2、1.19、1.18.2、1.18.1、1.17.1、1.16.5 |

官方条目由 `node scripts/vendor-arch-official.mjs` 收录。上游 `architectury-templates` 的 `*-forge-fabric` 清单最新到 1.20.1；1.20.1 和 1.21.1 已是维护底模，不再复制进 `templates/arch-official/`。1.21 的 NeoForge 不在那份官方生成器里。这些官方目录是带占位符的骨架，不是 Loom 的逐字节导出。选中后仍调用 `generateZip({ base })`。

## 本地预览

先在仓库根目录构建引擎（网页通过包名 `arch-template` 调用 `dist/`）：

```bash
npm install
npm run build
cd web
npm install
npm run dev
```

打开 [http://127.0.0.1:5173/arch-template/](http://127.0.0.1:5173/arch-template/)。

Vite 只提供页面，并把 `/arch-template/api` 代理到 `127.0.0.1:8788`。Node 进程在那边调用 `generateZip`，直接读仓库里的 `templates/` 和 `presets/`。

根目录也可以：

```bash
npm install
npm run build
npm install --prefix web
npm run web:dev
```

冒烟测试（读预设、生成 zip、检查 `settings.gradle.kts` 里的 modId，再生成一份 1.18.2 官方底模，并走一遍 Worker 打包）：

```bash
npm test
npm run web:smoke
```

## 环境变量

没有必须配置的密钥。

| 变量 | 用在 | 默认 | 作用 |
| --- | --- | --- | --- |
| `PORT` | Node | `8788` | API 端口 |
| `HOST` | Node | `127.0.0.1` | 监听地址 |
| `CORS_ORIGIN` | Worker / Node | 空 | 空 = 仅同源。`*`，或逗号分隔的来源列表，例如 GitHub Pages 的源 |
| `VITE_BASE` | `vite build` | `/arch-template/` | 静态资源公共路径 |
| `VITE_GENERATE_API` | `vite build` | 空 | 空 = 请求同源的 `${VITE_BASE}api`。静态托管时填 Worker 的 API 前缀，不要末尾斜杠 |

示例见 `web/.env.example`。不要把 token 写进这个文件再提交。

## 生产：Node

```bash
npm run build
cd web
npm install
npm run build
npm start
```

默认是 `http://127.0.0.1:8788/arch-template/`。反向代理把 `/arch-template` 指到这个进程即可。页面和 `/arch-template/api/*` 在同一端口。

## 生产：Cloudflare Workers

这是打算挂到 `tools.xm1221.cn/arch-template` 的路径。Worker 没有仓库文件系统，打包时：

1. `npm run embed` 把 `templates/` 和 `presets/` 收成 `web/worker/embedded-fs.generated.json`（已 gitignore）。
2. esbuild 把 Worker 打成单文件，并把 `node:fs`、`node:fs/promises`、`node:url` 换成 `web/worker/shims/`。`generateZip` / `listBases` / `loadPreset` 仍按原来的方式调用。

配置在 `web/wrangler.toml`：`name = "arch-template"`，`main = "dist-worker/index.js"`，`compatibility_date = "2025-09-23"`，`compatibility_flags = ["nodejs_compat"]`，静态资源目录 `./dist`，`run_worker_first` 覆盖 `/api/*` 和 `/arch-template/api/*`。自定义路由是注释，避免把 zone 写死。

```bash
npm install && npm run build
cd web
npm install
npx wrangler login
npm run deploy
```

`npm run deploy` = embed + 打包 Worker + `vite build` + `wrangler deploy`。模板有更新时要重新部署，否则 Worker 里仍是上一次嵌入的文件。

## 生产：Cloudflare Pages

同一份 Worker 包可以当 Pages Function 用。`npm run build:pages` 会在 `web/dist/_worker.js` 放上已经垫过文件系统的包，并写 `web/dist/_routes.json`（`include: /*`），这样 `/arch-template/assets/...` 会先进入 Worker，再去掉前缀去取 Vite 产物。

`web/wrangler.pages.toml` 只声明 Pages 输出目录和 `nodejs_compat`。部署用 `--no-bundle`，避免 wrangler 把已经垫好的包再打一遍。

```bash
npm install && npm run build
cd web
npm install
npx wrangler pages project create arch-template \
  --compatibility-date 2025-09-23 \
  --compatibility-flag nodejs_compat
npm run deploy:pages
```

`deploy:pages` 等于 `build:pages` 再加上：

```bash
wrangler pages deploy dist \
  --project-name arch-template \
  --commit-dirty=true \
  --no-bundle \
  --config wrangler.pages.toml
```

Pages 项目要在创建时带上 `nodejs_compat`。`pages deploy` 本身不写 compatibility flag。

## 生产：GitHub Pages

GitHub Pages 只托管静态页面，不能在浏览器里跑 `generateZip`。构建时设置 `VITE_GENERATE_API`，页面就会把生成、预设和 Modrinth 代理打到那个前缀（一般是上面的 Worker）。

`.github/workflows/pages.yml`：

- `workflow_dispatch`，以及推到 `main` 时如果仓库变量 `VITE_GENERATE_API` 已设置才会跑。变量还没填时，推送不会把 CI 跑红。
- `permissions`: `contents: read`，`pages: write`，`id-token: write`。
- 先构建引擎，再在 `web/` 里 `npm run build`（只有 Vite，不包含 `_worker.js`）。
- 可选仓库变量 `VITE_BASE`，默认 `/arch-template/`。
- 产物目录 `web/dist`。`web/public/.nojekyll` 会一起上传。

仓库 Settings → Secrets and variables → Actions → Variables：

- `VITE_GENERATE_API` = `https://arch-template.<子域>.workers.dev/arch-template/api`
- 若 Pages 和 Worker 不同源，在 Worker 里设置 `CORS_ORIGIN` 为 Pages 的源，例如 `https://<user>.github.io`。多个源用逗号隔开。

## CI 自动部署（Workers）

`.github/workflows/deploy-worker.yml`：推到 `main` 或手动 `workflow_dispatch` 时构建引擎并执行 `web` 里的 `npm run deploy`。

仓库 Secrets：

- `CLOUDFLARE_API_TOKEN`（已用于 pixelstage 等同账号 token 即可）

Account id 写在 workflow 环境变量里（公开），不进 wrangler 配置。自定义路由 `tools.xm1221.cn/arch-template*` 在 `web/wrangler.toml`。

---

## 交给 MieHelper 的清单

密钥在 MieHelper 那边，不要写回这个仓库。

1. `npx wrangler login` 到拥有 `xm1221.cn` 的 Cloudflare 账号。确认仓库里没有 `CLOUDFLARE_API_TOKEN`、`account_id` 或 zone id。
2. 在 `web/` 运行 `npm run deploy`（Workers）或按上一节创建 Pages 项目后运行 `npm run deploy:pages`。
3. 给 Worker 加路由 `tools.xm1221.cn/arch-template*`，zone 选 `xm1221.cn`。`wrangler.toml` 里对应行可以在本地取消注释后再部署，不要把账号 id 提交上来。
4. 若还要 GitHub Pages：设置 Actions 变量 `VITE_GENERATE_API`，并在 Worker 变量里设置 `CORS_ORIGIN` 为 Pages 源。然后手动跑 GitHub Pages workflow。
5. `tools.xm1221.cn` 的 DNS 仍指向 Cloudflare。聚合站卡片文案在 `web/SITE.md`，路径 `/arch-template`。
6. 模板或预设有改动时重新 deploy，嵌入的文件才会更新。

未绑自定义域时，开发地址是 `https://arch-template.<子域>.workers.dev/arch-template/`。打开后应看到中文表单，页头可以切到 English，版本下拉里有维护底模和 Arch 官方模板。

## API

前缀是 `/api`，也接受 `/arch-template/api`。

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/health` | `{ ok: true, generate: "generateZip" }` |
| GET | `/bases` | `listBases()` 的公开字段。不含服务器路径 |
| GET | `/presets` | `presets/*.json` 摘要 |
| GET | `/presets/:id` | `loadPreset(id)` |
| GET | `/modrinth/search?q=` | 代理 Modrinth 搜索 |
| GET | `/modrinth/project/:slug/versions?gameVersion=` | 代理版本列表 |
| POST | `/generate` | body 为选项 JSON，响应为 zip |

`POST /generate` 成功时：

- `Content-Type: application/zip`
- `Content-Disposition: attachment; filename="<modId>.zip"`
- `X-Arch-Template-Warnings`: base64 后的 JSON 字符串数组（引擎原文，页面按当前语言翻译）

失败时返回 `{ "error": "中文说明", "detail": "引擎原文" }`。预检 `OPTIONS` 在设置了 `CORS_ORIGIN` 时回显允许的 `Origin`。

CurseForge 在界面上是灰色的「未支持 / Not supported」，接口仍交给引擎拒绝。
