// ⚠️ 这是「受限沙箱专用」的兼容垫片，不属于应用代码。
//
// 背景：
//   Vite 在 Windows 上首次解析路径时会执行 `net use`（vite/dist/node/chunks/node.js:2481）
//   来探测网络驱动器。这条命令的失败本来就被 Vite 忽略（回调里第一行就是 `if (error) return;`），
//   结果只用于挑选更快的 realpath 实现。
//   但在本机的受限沙箱里，child_process 无法创建管道，`exec()` 会**同步抛出 EPERM**，
//   直接被 rolldown 的 resolve 插件包成构建错误 —— 于是 build / dev 全挂。
//
// 做法：
//   在 Vite 之前加载本模块，把这条探测命令替换为「立即回调空结果」，
//   等价于 Vite 原本期望的失败分支，不改变任何解析结果。
//   其它所有 child_process 调用一律原样透传。
//
// 用法：
//   node --import ./scripts/sandbox-netuse-shim.mjs ./node_modules/vite/bin/vite.js build
//   node --import ./scripts/sandbox-netuse-shim.mjs ./node_modules/vite/bin/vite.js
//
// 在普通终端（非沙箱）里直接 `npm run build` / `npm run dev` 即可，不需要本文件。

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const childProcess = require('node:child_process');

const originalExec = childProcess.exec;

childProcess.exec = function exec(command, options, callback) {
  if (typeof command === 'string' && command.trim().toLowerCase() === 'net use') {
    const cb = typeof options === 'function' ? options : callback;
    if (typeof cb === 'function') queueMicrotask(() => cb(null, '', ''));
    return {
      on() {
        return this;
      },
      once() {
        return this;
      },
      kill() {},
      pid: -1,
      stdout: null,
      stderr: null,
    };
  }
  return originalExec.apply(this, arguments);
};
