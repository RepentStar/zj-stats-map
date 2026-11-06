<h1 align="center">浙江省统计专题地图</h1>

<p align="center">浙江 11 市 · 2016–2025 年 · 人口、经济、产业结构与收入可视化</p>

<p align="center">
  <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&amp;logoColor=white" alt="Vite 8" />
  <img src="https://img.shields.io/badge/OpenLayers-10-1F6B75?logo=openlayers&amp;logoColor=white" alt="OpenLayers 10" />
  <img src="https://img.shields.io/badge/ECharts-6-AA344D?logo=apacheecharts&amp;logoColor=white" alt="ECharts 6" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&amp;logoColor=white" alt="Tailwind CSS 4" />
</p>

<p align="center">
  <a href="#快速开始">本地运行</a> ·
  <a href="docs/architecture.md">项目架构</a> ·
  <a href="docs/data_sources.md">数据说明</a>
</p>

## 主要功能

基于原生 JavaScript、OpenLayers 与 ECharts 的静态 WebGIS，界面使用 Tailwind CSS 和 basecoat-css

| 功能     | 说明                                                                   |
| -------- | ---------------------------------------------------------------------- |
| 专题地图 | 11 项指标；总量用比例气泡，比率与人均指标用分级设色，产业占比用饼图    |
| 时间轴   | 年份切换、自动播放、速度调整与循环；分级和符号比例尺跨年份固定         |
| 城市联动 | 地图、控制面板与图表共享城市多选；悬停查看数值、排名和较上年变化       |
| 图表分析 | 人口占比、城市排行、历年趋势、产业占比雷达图及产业增加值堆叠图         |
| 多窗口   | 图表可并排查看、拖动、缩放和关闭；各自保留指标，年份和城市范围实时同步 |

## 快速开始

需要 Node.js `^20.19.0 || >=22.12.0`、npm 和 Python 3.10+。Python 校验工具只使用标准库

```bash
npm ci
npm run dev
```

打开终端输出的本地地址。天地图底图需要联网

<details>
<summary>常用命令</summary>

| 命令                  | 用途                             |
| --------------------- | -------------------------------- |
| `npm run dev`         | 启动开发服务器                   |
| `npm test`            | 运行核心功能与数据校验测试       |
| `npm run data:check`  | 校验统计数据                     |
| `npm run build`       | 校验数据并构建到 `dist/`         |
| `npm run build:check` | 构建并检查图表按需加载及产物体积 |
| `npm run preview`     | 本地预览构建产物                 |

</details>

## 文档导航

| 内容                     | 文档                             |
| ------------------------ | -------------------------------- |
| 目录、共享状态与模块协作 | [项目架构](docs/architecture.md) |
| 数据文件、指标与来源     | [数据说明](docs/data_sources.md) |
| 地图图层与专题表达       | [地图模块](src/map/README.md)    |
| 图表配置、联动与加载     | [图表模块](src/charts/README.md) |
| 控件、播放与窗口管理     | [交互模块](src/ui/README.md)     |

## 部署

将 `dist/` 部署到静态托管服务。部署到子路径时，构建命令使用 `npm run build -- --base=/子路径/`

## 许可证

[MIT](LICENSE)
