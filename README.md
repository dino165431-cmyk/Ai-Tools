# AI Tools

一个基于 **Vue 3 + Vite + Naive UI** 开发的 **uTools AI 工具箱插件**，集成 AI 对话、Markdown 笔记、智能体配置、提示词管理、Skill 管理、MCP 工具接入和定时任务能力，适合在 uTools 内构建个人 AI 工作流与知识管理中心。

## 功能特性

- **AI 聊天对话**：支持会话管理、模型切换、系统提示词配置、智能体选择、附件上下文、Markdown 渲染与工具调用结果展示。
- **Markdown 笔记管理**：支持多标签编辑、文件树管理、Markdown 预览、图片处理、笔记密码保护与密码重置。
- **模型服务商配置**：可管理不同 AI Provider 及其模型参数，用于灵活切换不同模型服务。
- **智能体与提示词管理**：支持维护 Agent 配置与 Prompt 模板，便于复用不同场景的对话策略。
- **Skill 管理**：支持管理可复用技能能力，扩展智能体在特定任务中的执行方式。
- **MCP 接入**：支持配置和调用 MCP 服务，将外部工具能力接入聊天流程。
- **定时任务**：支持配置周期性任务，适合自动化执行固定 AI 工作流。
- **深色/浅色主题**：跟随配置切换主题，优化长时间使用体验。
- **uTools 插件入口**：支持通过 uTools 插件关键字和超级面板快速唤起 AI 问答入口。

## 技术栈

- Vue 3
- Vue Router 4
- Vite 6
- Naive UI
- md-editor-v3
- highlight.js
- KaTeX
- pdfjs-dist
- mammoth
- xlsx
- jszip
- cropperjs
- Node.js Test Runner
- uTools Plugin API / preload 扩展

## 目录结构

```text
.
├── public/
│   ├── plugin.json              # uTools 插件配置
│   ├── logo.png                 # 插件图标
│   └── preload/                 # uTools preload 服务与内置 MCP/文件能力
├── src/
│   ├── components/              # 通用组件与 Markdown 渲染组件
│   ├── router/                  # 路由配置
│   ├── utils/                   # 聊天、MCP、笔记、文件、加密、定时任务等工具模块
│   ├── views/
│   │   ├── layout/              # 主布局
│   │   └── pages/
│   │       ├── chat/            # AI 聊天页面
│   │       ├── note/            # Markdown 笔记页面
│   │       └── setting/         # Provider / Agent / Prompt / Skill / MCP / Timed Task / Config
│   ├── workers/                 # 附件文本解析 Worker
│   ├── App.vue
│   └── main.js
├── tests/                       # 单元测试
├── index.html
├── vite.config.js
└── package.json
```

## 本地开发

### 环境要求

- Node.js 18+（建议使用 LTS 版本）
- uTools 开发环境

### 安装依赖

```bash
npm install
```

### 启动开发服务

```bash
npm run dev
```

启动后，前端开发服务默认运行在 `http://localhost:5173`，`public/plugin.json` 中的 `development.main` 已指向该地址，可用于 uTools 插件开发调试。

### 构建生产版本

```bash
npm run build
```

### 运行测试

```bash
npm test
```

## uTools 插件配置

插件入口配置位于 `public/plugin.json`，当前包含两个入口：

- `AI Tools`：打开插件主界面
- 超级面板 `问 AI`：通过输入内容直接进入 AI 问答场景

preload 逻辑位于 `public/preload/services.js`，并通过 `public/preload/builtins/` 和 `public/preload/utils/` 提供文件操作、配置管理、笔记服务、会话服务、MCP Client、S3 操作等能力。

## 项目说明

该项目适合用作桌面端个人 AI 助手插件基础工程。你可以在现有功能上继续扩展新的模型服务商、新的 MCP 工具、新的 Skill 执行逻辑，或者将笔记模块与聊天上下文进一步打通，形成更完整的个人知识工作流。

## 项目描述

**AI Tools 是一款运行在 uTools 平台上的桌面端 AI 效率插件，基于 Vue 3 和 Vite 构建，集成智能对话、Markdown 笔记、Agent/Prompt 管理、Skill 扩展、MCP 工具调用和定时任务能力，旨在帮助用户在本地桌面环境中快速搭建可配置、可扩展的个人 AI 工作流与知识管理系统。**
