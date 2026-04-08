# 语文小助手 -- 产品功能设计文档

> 面向小学 3-6 年级学生的课后语文自主练习工具，通过手写识别、语音分析和引导式写作，让孩子在无人辅导时也能获得即时、精准、有温度的反馈。

详见完整设计文档：[语文学习辅助工具设计](../plans/语文学习辅助工具设计.plan.md)

## 快速启动

### 开发环境

```bash
# 1. 安装依赖
npm install
cd client && npm install && cd ..

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填写 JWT_SECRET、ADMIN_PASSWORD 等

# 3. 初始化数据库
npm run db:init

# 4. 启动后端（开发模式）
npm run dev

# 5. 启动前端（另一个终端）
npm run client:dev
```

浏览器访问 http://localhost:5173，默认管理员账户见 `.env` 中的配置。

### 生产部署

```bash
# 构建前端
cd client && npm run build && cd ..

# PM2 启动
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

Nginx 配置参考：`scripts/nginx.conf.example`

## 项目结构

```
chinese_helper/
├── server/                 # Node.js 后端
│   ├── index.js            # 入口
│   ├── config.js           # 配置
│   ├── db/                 # 数据库
│   │   ├── schema.sql      # DDL
│   │   └── init.js         # 初始化
│   ├── middleware/          # 中间件
│   │   ├── auth.js         # JWT 认证
│   │   └── usageTracker.js # 防沉迷
│   └── routes/             # API 路由
│       ├── auth.js         # 登录
│       ├── admin.js        # 管理后台
│       ├── dictation.js    # 默写
│       ├── recitation.js   # 背诵
│       ├── writing.js      # 写作
│       └── parent.js       # 家长端
├── client/                 # React 前端
│   └── src/
│       ├── api.js          # API 调用层
│       ├── context/        # 全局状态
│       ├── components/     # 公共组件
│       └── pages/          # 页面
│           ├── admin/      # 管理后台
│           ├── student/    # 学生端
│           └── parent/     # 家长端
├── ecosystem.config.js     # PM2 配置
├── scripts/                # 部署脚本
└── data/                   # 数据（.gitignore）
```

## 账户角色

| 角色 | 说明 |
|------|------|
| 管理员 | 管理用户、词表、课文，控制全局设置 |
| 学生 | 生词默写、背诵检查、写作指导 |
| 家长 | 查看学习报告、设置防沉迷时长（可由管理员全局开关） |
