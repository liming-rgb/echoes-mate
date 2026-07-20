# Echoes Mate — 项目说明文档

## 一、这是什么

一个 AI 聊天伴侣应用，核心功能：
- 支持多轮对话（类似 ChatGPT 界面）
- **RAG 记忆检索**：上传过往聊天记录，AI 能回忆起你们的往事
- 多对话管理：不同聊天对象/话题分对话管理
- 多 API 兼容：支持任何 OpenAI 兼容接口（DeepSeek、Claude、千问等）
- PWA：手机端可添加到主屏幕当 App 用

---

## 二、技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | Next.js 16（React + TypeScript） |
| UI 库 | Tailwind CSS + shadcn/ui |
| AI 对话 | AI SDK（`@ai-sdk/openai` + `@ai-sdk/react`） |
| 数据库 | Supabase（PostgreSQL + pgvector） |
| 向量模型 | 百炼 qwen3.7-text-embedding（1024 维） |
| 部署 | 本地开发（未来可部署到 Vercel） |

---

## 三、文件夹结构说明

```
echoes-mate/
│
├── app/                          # Next.js App Router 的页面和接口
│   ├── page.tsx                  # 主页（入口），就是 <ChatPage />
│   ├── layout.tsx                # 全局布局：字体、主题、PWA 元数据
│   ├── globals.css               # 全局样式（Tailwind + CSS 变量）
│   ├── icon.svg                  # 网页图标（favicon）
│   └── api/                      # 后端 API 路由
│       ├── chat/route.ts         # ★ 聊天核心：调 AI、RAG 检索、存消息
│       └── memories/
│           ├── upload/route.ts   # ★ 上传 history.json 并生成向量
│           └── diagnose/route.ts # 诊断工具：查 memories 表状态
│
├── components/                   # React 组件
│   ├── chat-page.tsx             # ★ 主组件：布局、状态管理、对话逻辑
│   ├── chat-sidebar.tsx          # 侧边栏：对话列表、新建、改名、删除
│   ├── chat-message.tsx          # 单条消息气泡（用户/AI 头像 + 文本）
│   ├── chat-input.tsx            # 底部输入框 + 发送按钮
│   ├── settings-dialog.tsx       # 全局设置弹窗（用户头像）
│   ├── conversation-settings-dialog.tsx  # ★ 对话设置弹窗（最多配置项）
│   ├── pwa-provider.tsx          # 注册 Service Worker，实现 PWA
│   └── ui/                       # shadcn/ui 基础组件
│       ├── button.tsx            #   按钮
│       ├── input.tsx             #   输入框
│       ├── textarea.tsx          #   多行文本
│       ├── label.tsx             #   标签
│       ├── dialog.tsx            #   弹窗
│       ├── sheet.tsx             #   侧滑面板（手机端用）
│       ├── switch.tsx            #   开关
│       └── avatar.tsx            #   头像
│
├── hooks/                        # 自定义 React Hook
│   └── use-local-storage.ts      # 同步状态到浏览器 localStorage
│
├── lib/                          # 工具函数和客户端
│   ├── supabase.ts               # Supabase 客户端（浏览器用 + 服务端用）
│   └── utils.ts                  # cn() 合并 CSS 类名、formatRelative() 时间格式化
│
├── history/                      # 聊天记录 JSON 文件（上传素材）
│   └── Yang.json                 # 示例：和杨茜的微信对话
│
├── migrations/                   # 数据库迁移 SQL（参考用，实际在 Supabase SQL Editor 执行）
│   └── 002_pgvector_memories.sql # memories 表 + 搜索函数
│
├── scripts/                      # 一次性脚本
│   └── embed_history.js          # 命令行批量导入 history.json（早期用，现在用网页上传）
│
├── public/                       # 静态资源
│   ├── manifest.json             # PWA 清单（应用名、图标、主题色）
│   ├── sw.js                     # Service Worker：缓存策略
│   └── *.svg                     # 占位图标（可删）
│
├── .env.local                    # 环境变量（API Key、数据库地址等，不提交到 Git）
├── next.config.ts                # Next.js 配置（移动端访问白名单等）
├── package.json                  # 项目依赖和脚本命令
├── tsconfig.json                 # TypeScript 编译配置
├── components.json               # shadcn/ui 配置
└── README.md                     # 项目自述
```

---

## 四、关键文件是哪些

如果你只看 5 个文件理解项目，就看这 5 个：

| 优先级 | 文件 | 为什么关键 |
|---|---|---|
| ⭐⭐⭐ | `app/api/chat/route.ts` | 所有 AI 调用逻辑：RAG 检索、拼接 prompt、调 LLM、存消息 |
| ⭐⭐⭐ | `components/chat-page.tsx` | 所有前端状态：加载对话、发消息、切换对话、错误处理 |
| ⭐⭐ | `components/conversation-settings-dialog.tsx` | 最复杂的设置界面：API Key、模型参数、上传记忆 |
| ⭐⭐ | `app/api/memories/upload/route.ts` | 上传 history.json → 调 embedding API → 存入 Supabase |
| ⭐ | `lib/supabase.ts` | 数据库连接，所有数据读写的入口 |

---

## 五、数据是怎么流转的

### 5.1 普通聊天

```
用户输入消息
  → chat-page.tsx: sendMessage()
  → useChat (AI SDK) → POST /api/chat
  → route.ts: 接收消息
    → 1. 存用户消息到 Supabase messages 表
    → 2. 检查 RAG 开关 → 如果开，调用 embedding API 搜 memories
    → 3. 取最后 N 条消息（滑动窗口）
    → 4. 组装 system prompt + 记忆上下文
    → 5. 调用 LLM 流式返回
  → 前端实时显示 AI 回复
  → route.ts onEnd: 存 AI 回复到 Supabase messages 表
```

### 5.2 RAG 记忆检索流程

```
用户在设置面板上传 history.json
  → POST /api/memories/upload
  → 逐条调用 百炼 embedding API → 得到 1024 维向量
  → 存入 Supabase memories 表 { content, embedding, chat_id }

用户发消息时
  → route.ts: 将用户最新消息生成向量
  → 调用 match_memories() RPC 函数（余弦相似度搜索）
  → 取 top 3 相似记忆
  → 拼成 <past_memories>...</past_memories> + 使用指令
  → 注入 system prompt 前面发给 AI
```

### 5.3 数据存储

```
Supabase 数据库：
├── chats 表       — 对话（标题、设置、时间）
├── messages 表    — 消息（角色、内容、时间）FK→chats
├── memories 表    — RAG 记忆（内容、向量）FK→chats
└── user_settings   — 全局设置（用户头像 URL 等）

Supabase Storage：
└── chat-assets/avatars/  — 头像图片文件
```

---

## 六、你需要弄明白的几个概念

### 6.1 `"use client"` 和 `"use server"`

- `"use client"`：这个组件在浏览器里运行，能访问 DOM、localStorage、state
- 不加 `"use client"` 默认是 Server Component，在服务端渲染，不能有交互
- 本项目大部分组件都是 `"use client"`

### 6.2 `app/api/` 文件夹就是后端

Next.js 的 `/app/api/xxx/route.ts` 会自动变成 HTTP 接口：
- `app/api/chat/route.ts` → `POST /api/chat`
- `app/api/memories/upload/route.ts` → `POST /api/memories/upload`

不需要另外启一个后端服务，同一个 `npm run dev` 同时跑前端和后端。

### 6.3 `.tsx` vs `.ts`

- `.tsx`：包含 JSX（React 组件）的 TypeScript
- `.ts`：纯 TypeScript 逻辑，没有 UI

### 6.4 Supabase 是什么

Supabase 是一个托管的 PostgreSQL 数据库 + 文件存储 + 实时订阅。你不需要自己搭数据库，注册一个免费项目就行。代码里通过 `process.env.NEXT_PUBLIC_SUPABASE_URL` 和密钥连接。

### 6.5 pgvector 是什么

PostgreSQL 的向量扩展。memories 表存储 1024 维向量，`match_memories()` 函数用余弦相似度找最匹配的记忆。`<=>` 运算符计算两个向量的余弦距离。

### 6.6 环境变量（`.env.local`）

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...  ← 浏览器端用，有 RLS 限制
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...      ← 只在服务端用，绕过 RLS
DASHSCOPE_API_KEY=sk-...                 ← 百炼 embedding API
DASHSCOPE_BASE_URL=https://...           ← 百炼 API 地址
OPENAI_BASE_URL=https://...              ← 聊天 API 地址
OPENAI_API_KEY=sk-...                    ← 聊天 API Key
OPENAI_MODEL=claude-sonnet-5             ← 默认模型
```

- `NEXT_PUBLIC_` 前缀的变量会暴露给浏览器，不加前缀的只在服务端可用
- 修改 `.env.local` 后需要重启 `npm run dev`

### 6.7 AI SDK 的两个关键函数

- **`streamText()`** — 服务端函数（route.ts 里），调用 LLM 返回流式响应
- **`useChat()`** — 客户端 Hook（chat-page.tsx 里），管理消息状态、发送消息、处理流

### 6.8 `instructions` 是什么

`streamText` 的 `instructions` 参数等同于 System Prompt，会被放在对话消息的最前面。本项目把"用户自定义 system prompt"和"RAG 检索到的记忆"拼在一起作为 instructions 发给 AI。

---

## 七、日常怎么用

### 启动项目

```bash
npm run dev      # 开发模式（热更新，仅本机访问）
npm run build    # 构建生产版本
npm run start    # 生产模式（构建后运行，手机也能访问）
```

### 添加新对话

1. 点侧边栏 "New Chat"
2. 点右上角齿轮 → 对话设置
3. 填 System Prompt（比如"你是林溪，我的好友..."）
4. 可选：上传 AI 头像、背景图
5. 可选：开启 RAG，上传 history.json

### 上传聊天记录

1. 准备 `history.json`，格式：`[{ "date": "2024-10-11", "text": "我：xxx\n杨茜：yyy" }]`
2. 放在 `history/` 文件夹下
3. 在对话设置里开启 RAG → 点上传 → 选择文件

### 切换 API

在对话设置里填 API Key、API URL、Model，可以切换任何兼容 OpenAI 格式的接口。

---

## 八、哪些是 AI 生成的，哪些是框架自带的

| 类型 | 文件 |
|---|---|
| **框架自带**（`create-next-app` 生成） | `package.json`、`tsconfig.json`、`next.config.ts`、`eslint.config.mjs`、`postcss.config.mjs`、`next-env.d.ts`、`public/*.svg` |
| **AI 编写** | 所有 `app/api/`、所有 `components/`、`lib/`、`hooks/`、`scripts/`、`migrations/`、`public/sw.js`、`public/manifest.json` |
| **shadcn/ui 命令生成** | `components/ui/*.tsx`（`npx shadcn add button` 这样生成）、`components.json` |

`CLAUDE.md` 和 `AGENTS.md` 是 AI 助手的配置文件，普通用户不需要关心。

---

## 九、如果以后想加功能

| 功能 | 改哪些文件 |
|---|---|
| 换 AI 模型 | `app/api/chat/route.ts` 的 `modelName` |
| 调 RAG 检索数量 | `route.ts` 里 `searchMemories(embedding, N)` 改成想要的数字 |
| 调 RAG 相似度门槛 | `route.ts` 里 `match_threshold: 0.5` 改大（更严格）改小（更宽松） |
| 加新的设置项 | ① `ConversationSettings` 接口加字段 ② 设置面板加 UI ③ `chat-page.tsx` 加传输和存储 ④ `route.ts` 加使用 |
| 对话导出 | 新加 `app/api/chat/export/route.ts`，读 messages 表返回 JSON |
