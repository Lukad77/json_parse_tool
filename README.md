# json_parse_tool

日志 / JSON / curl 格式化桌面工具。粘贴原始文本，自动识别类型并格式化输出，支持一键压缩和文件导出。

## 功能

- **自动识别输入类型**：根据内容特征区分 JSON、curl 命令、单条日志、批量日志，无需手动选择
- **JSON 格式化**：美化 / 压缩 JSON，自动提取日志行中嵌入的 JSON 片段并独立格式化
- **curl 解析**：拆解 curl 命令为 method、URL、headers、body 等结构化输出，body 中的 JSON 自动美化
- **日志格式化**：时间戳、日志级别、来源高亮；多行堆栈自动合并为一条记录
- **批量日志**：识别 TSV/多行日志记录，逐条结构化输出
- **压缩**：将格式化结果还原为紧凑格式（JSON 压缩回单行、curl 去掉续行符）
- **文件导出**：通过系统保存对话框导出为 .json 或 .txt

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Electron 30 + React 18 |
| 构建 | Vite 5 + TypeScript 5 |
| 编辑器 | CodeMirror 6 (JSON 语法高亮 + one-dark 主题) |
| 状态管理 | Zustand |
| 样式 | Tailwind CSS 3 |

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器（Vite + Electron 热加载）
npm run dev

# 构建生产版本
npm run build

# 打包为桌面应用（.dmg / .exe / .AppImage）
npm run electron:build
```

## 项目结构

```
json_parse_tool/
├── electron/
│   ├── main.ts          # Electron 主进程：窗口创建、IPC（save-file）
│   └── preload.ts       # preload 脚本：暴露 electronAPI 给渲染进程
├── src/
│   ├── components/      # React 组件（Layout、Toolbar、Editor）
│   ├── parsers/         # 核心解析逻辑
│   │   ├── index.ts     # 统一入口：detectInputType / parse / compress
│   │   ├── json-formatter.ts
│   │   ├── curl-parser.ts
│   │   ├── log-parser.ts
│   │   ├── batch-log-parser.ts
│   │   ├── stack-merger.ts
│   │   └── types.ts
│   ├── store/           # Zustand 状态
│   ├── utils/
│   └── main.tsx         # React 入口
├── package.json
└── vite.config.ts
```

## 输入类型检测优先级

1. 以 `curl ` 开头 → **curl**
2. 多行匹配批量日志模式 → **batch**
3. 整体是合法 JSON → **json**
4. 前 5 行含日志关键字 / 时间戳 / 方括号格式 → **log**
5. 以上均不命中 → **unknown**（按 log 模式尝试处理）
