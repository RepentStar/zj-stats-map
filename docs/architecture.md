# 项目架构

项目由 Vite 构建，使用原生 JavaScript、OpenLayers、ECharts、Tailwind CSS 与 basecoat-css。页面和数据均为静态资源

## 目录

| 目录           | 职责                                         |
| -------------- | -------------------------------------------- |
| `public/data/` | CSV 指标数据、地区信息与 GeoJSON 边界        |
| `src/data/`    | 加载、解析、内存索引与共享选择状态           |
| `src/map/`     | 底图、市级边界、分级设色、比例符号与产业饼图 |
| `src/charts/`  | 图表数据源、配置与按需加载的渲染模块         |
| `src/ui/`      | 控件、图例、提示、时间轴与悬浮窗口           |
| `src/main.js`  | 工作台初始化、窗口创建与交互联动             |
| `scripts/`     | 数据校验与构建产物检查                       |
| `tests/`       | 数据、地图、图表与播放测试                   |

## 数据与共享状态

`loadData()` 使用 Vite 的 `BASE_URL` 并行加载 CSV 与 GeoJSON。`parseData()` 检查字段、主键和编码关联，保留字符串编码，显式转换年份与数值

`createStore(data)` 建立 `Map<indicator, Map<year, Map<adcode, number>>>` 索引，提供：

- `getValue(indicator, year, adcode)`：返回观测值，缺失时返回 `null`
- `getSeries(indicator, adcode)`：按年份返回序列，保留缺失值
- `getState()`、`setState(patch)`：读取和更新 `indicator`、`year`、`selectedCities`
- `subscribe(listener)`：订阅状态变化，返回取消订阅函数

初始状态使用首个指标、最新年份和空城市选择。状态只接受登记的指标、年份和市级编码，同值更新不通知订阅者

## 地图与图表联动

地图、控件和图表点击共用城市多选状态。边界只在初始化时解析并投影，状态变化时更新图层样式。分级断点、气泡和饼图的数值比例尺基于全部年份固定

工作台图表使用 `createTimelineChartSource()`：指标在创建时确定，年份与城市范围读取共享状态；空选择表示全部 11 市。人口占比固定读取常住人口，产业图表固定读取三项产业数据。趋势图保留完整序列，以虚线标记当前年份

图表运行模块与所选类型模块并行加载。首页地图叠加层通过 `ol-echarts` 加载 ECharts 依赖；窗口模块按类型请求并复用浏览器模块缓存。具体映射见[图表模块](../src/charts/README.md)

## 生命周期

控件窗口按 key 复用，图表每次新建。关闭窗口执行注册的清理回调，取消订阅、尺寸观察并释放图表；关闭时间轴暂停播放。图例固定在地图左下角，独立于窗口管理器

模块加载完成后检查窗口是否关闭，并读取最新年份与城市范围。渲染失败支持窗口内重试，模块加载失败提供重新加载页面入口

## 验证

`npm test` 覆盖数据加载与索引、地图分类与样式、播放状态、五类图表的数值与联动、SVG 渲染和数据校验。`npm run build:check` 在生产构建后检查窗口模块的按需加载关系，并输出去重后的 JS 体积
