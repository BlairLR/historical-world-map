import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
// 这个配置文件由 tsconfig.node.json 单独做类型检查，而本项目没有安装 @types/node。
// 为了不改动 package.json（不新增任何依赖），这里用 @ts-ignore 借用构建期的内置模块。
// 注意：不能在模块文件里写 `declare module 'node:fs'`，那会被 TS 当成非法的模块增强（TS2664）。
// @ts-ignore -- 未安装 @types/node，见上方说明
import { readFileSync } from 'node:fs';

/**
 * ── 为什么需要这个插件 ───────────────────────────────────────────────
 *
 * MapLibre GL JS v6 把 GeoJSON 解析（geojson-vt 建索引）和矢量瓦片处理全部放在 Web Worker 里，
 * 而该 worker 是一个独立文件。MapLibre 内部这样推算它的地址：
 *
 *   let e = import.meta.url;                                  // 当前模块自身的 URL
 *   let t = e.endsWith('-dev.mjs') ? 'maplibre-gl-worker-dev.mjs' : 'maplibre-gl-worker.mjs';
 *   return new URL(`./${t}`, e).href;                         // 同目录下的兄弟文件
 *
 * 打包后 maplibre-gl 被并入 assets/maplibre-<hash>.js，这个兄弟文件不会自动出现，
 * 于是 worker 请求 404 —— 地图只剩不经过 worker 的 background 图层（一片纯色，什么都没有）。
 *
 * ── 两个文件必须成对、且保持原始字节 ─────────────────────────────────
 *
 * maplibre-gl-worker.mjs 的静态 import 只有一个：`./maplibre-gl-shared.mjs`
 * （而 shared.mjs 是叶子模块，不再 import 任何东西）。浏览器按相对路径解析它，
 * 所以两个文件必须落在同一个目录里。
 *
 * 同时这两个文件不能被 Vite 的转换管线处理，否则：
 *   - worker 里会被注入 `import ... from "/@vite/client"`（HMR 客户端，模块作用域内会访问 document/window）
 *   - 相对 import 会被改写成带 `?v=` 的绝对路径
 * 所以开发环境用一个前置中间件直接吐原始字节，生产环境用 emitFile 原样输出。
 */
const MAPLIBRE_DIST = 'node_modules/maplibre-gl/dist';
const MAPLIBRE_WORKER_FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

function maplibreWorkerAssets(): Plugin {
  // configResolved 一定先于 configureServer / generateBundle 执行，这里的初值只是兜底
  let root = '.';
  let assetsDir = 'assets';

  const fileFor = (name: string) => `${root}/${MAPLIBRE_DIST}/${name}`;

  return {
    name: 'maplibre-worker-assets',

    configResolved(config) {
      root = config.root.replace(/[\\/]+$/, '');
      assetsDir = config.build.assetsDir;
    },

    // ── 开发环境 ──
    // 直接注册中间件（不是在返回的函数里），因此它跑在 Vite 内部中间件之前，
    // 请求不会进入转换管线。这也让 dev 与 build 的行为完全一致（同样是原始字节）。
    configureServer(server) {
      const prefix = `/${MAPLIBRE_DIST}/`;
      // 这三个参数必须显式标注 any：
      //   1) 手写内联类型 `{ url?: string }` 会触发 TS 的 weak-type 检查（与 IncomingMessage 无共同属性）；
      //   2) 交给上下文推断又会拿到本项目残缺的 node 类型（IncomingMessage 上根本没有 url）。
      // 这里只是把两个静态文件原样吐出去，不需要更精确的类型。
      /* eslint-disable @typescript-eslint/no-explicit-any */
      server.middlewares.use((req: any, res: any, next: any) => {
        const url: string = req.url?.split('?')[0] ?? '';
        if (!url.startsWith(prefix)) return next();

        const name = url.slice(prefix.length);
        if (!MAPLIBRE_WORKER_FILES.includes(name)) return next();

        res.setHeader('Content-Type', 'text/javascript');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(readFileSync(fileFor(name)));
      });
      /* eslint-enable @typescript-eslint/no-explicit-any */
    },

    // ── 生产构建 ──
    // 以 Buffer（Uint8Array）原样输出，字节数与上游完全一致。
    // 路径必须是 assets/：manualChunks 把 maplibre 放进了 assets/maplibre-<hash>.js，
    // MapLibre 要找的兄弟文件自然就是 assets/maplibre-gl-worker.mjs。
    generateBundle() {
      for (const name of MAPLIBRE_WORKER_FILES) {
        this.emitFile({
          type: 'asset',
          fileName: `${assetsDir}/${name}`,
          source: readFileSync(fileFor(name)),
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), maplibreWorkerAssets()],
  // 开发环境不要预打包 maplibre-gl：
  // 预打包后 import.meta.url 指向 .vite/deps/，MapLibre 会去那里找 worker，必然 404。
  // 关掉之后模块 URL 就是 /node_modules/maplibre-gl/dist/maplibre-gl.mjs，
  // 兄弟文件地址正好命中上面中间件提供的路径。
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  server: {
    host: '127.0.0.1',
    port: 5180,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 5181,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        // maplibre-gl 体积较大，单独拆包便于长期缓存
        manualChunks(id: string) {
          if (id.includes('maplibre-gl')) return 'maplibre';
          if (id.includes('node_modules/react')) return 'react';
          return undefined;
        },
      },
    },
  },
});
