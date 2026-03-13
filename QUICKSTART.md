# GoGetAJob - 快速开始

## 启动应用

1. **安装依赖** (如果还没有安装)
```bash
npm install
```

2. **构建项目**
```bash
npm run build
```

3. **启动服务器**
```bash
npm start
```

服务器将在 http://localhost:9393 启动

## 使用指南

### 1. 市场大厅 (Market Hall)
- 点击"添加项目"按钮
- 输入 GitHub 仓库地址，例如: `https://github.com/facebook/react`
- 系统会自动获取项目信息（stars、forks、语言等）
- 点击"买入"按钮开始投资该项目

### 2. 持仓 (Positions)
- 查看所有已买入的项目
- 显示实时状态（买入中/贡献中/停止）
- 查看 Token 花费和持仓时长
- 点击"卖出"结束投资

### 3. 投资组合 (Portfolio)
- 查看总投资额和总收益
- 计算总体 ROI（投资回报率）
- 详细的持仓列表和盈亏分析

## ROI 计算公式

```
ROI = (当前价格 - 买入价格) / Token花费 × 100%
```

其中：
- **项目价格** = Stars数 + Forks数 × 2
- **Token花费** = AI贡献使用的Token成本

## 项目结构

```
gogetajob/
├── src/
│   ├── backend/          # 后端代码
│   │   ├── lib/          # 核心服务
│   │   │   ├── database.ts        # 数据库连接
│   │   │   ├── migrations.ts      # 数据库迁移
│   │   │   ├── github-api.ts      # GitHub API客户端
│   │   │   ├── project-service.ts # 项目管理
│   │   │   ├── position-service.ts # 持仓管理
│   │   │   └── config.ts          # 配置管理
│   │   ├── server.ts     # Express服务器
│   │   └── types.ts      # TypeScript类型定义
│   └── frontend/         # 前端代码
│       ├── components/   # React组件
│       ├── pages/        # 页面组件
│       ├── api.ts        # API客户端
│       ├── App.tsx       # 主应用
│       └── index.tsx     # 入口文件
├── public/              # 静态文件
│   ├── css/
│   ├── js/
│   └── index.html
├── data/                # 数据文件
│   ├── gogetajob.db    # SQLite数据库
│   └── config.json     # 配置文件
└── dist/               # 编译输出

## 开发模式

如果需要开发调试，可以使用：

```bash
# 监听后端变化
npm run dev:backend

# 监听前端变化（新终端）
npm run dev:frontend

# 启动服务器（新终端）
npm start
```

## API 端点

### 项目管理
- `GET /api/projects` - 获取所有项目
- `POST /api/projects` - 添加新项目
- `GET /api/projects/:id` - 获取项目详情
- `POST /api/projects/:id/update` - 更新项目数据

### 持仓管理
- `GET /api/positions` - 获取所有持仓
- `POST /api/positions/:id/buy` - 买入项目
- `POST /api/positions/:id/sell` - 卖出项目
- `GET /api/positions/:id/roi` - 获取ROI

### 通知
- `GET /api/notifications` - 获取通知列表
- `POST /api/notifications/:id/read` - 标记为已读

## 注意事项

1. **GitHub API 限制**: 未认证请求每小时限制60次，建议在 `data/config.json` 中配置 GitHub Token
2. **数据库**: 首次启动会自动创建数据库和表结构
3. **端口**: 默认端口9393，可在配置文件中修改

## 下一步计划

- [ ] 实现 AI 自动贡献功能（通过 Claude API）
- [ ] 添加 K线图展示项目价格走势
- [ ] 实现项目热度分类（hot/warm/cold）
- [ ] 添加实时通知系统
- [ ] 支持批量操作

---

现在可以开始试用了！打开浏览器访问 http://localhost:9393 🚀
