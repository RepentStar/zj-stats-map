# 浙江省统计专题地图 WebGIS

基于 Vite + 原生 JavaScript + OpenLayers + ECharts 的静态 WebGIS，无后端
行政区划仅含浙江省及 11 个地级市，当前数据为 2016–2025 年人口、产业结构与城镇居民收入，共 9 项指标

## 开发环境

- Node.js 20.19+（20 系列）或 22.12+，建议使用 Node.js 24 LTS
- npm
- Python 3.10+，校验脚本仅使用标准库，无需安装 Python 依赖

```bash
npm ci
npm run data:check
npm run dev
```

访问终端输出的本地地址，默认展示最近年份的浙江省 11 市专题地图。

控制面板、图例、时间轴和图表均为可拖动、缩放和关闭的悬浮窗口。工具栏可重新打开控件、关闭全部窗口或返回全省视图。

支持切换常住人口、人口密度、三次产业增加值及占比、城镇居民人均可支配收入，多选城市、年份滑块及自动播放。地图与图例使用跨年份固定分级，城市按钮可查看当前数值。

界面保留操作标签、年份、单位、图例和必要状态反馈，省去说明段落与数据口径提示。项目侧重可视化课设展示。

点击“新建图表”选择：

- **人口占比**：各市常住人口构成。
- **城市排行**：当前年份和指标的城市对比。
- **历年趋势**：多城市年度变化，虚线标记当前年份。

图表以独立窗口保留生成时的条件，可并排对比；未选城市时展示全省 11 市。点击图形可联动城市选择或地图年份。

## 常用命令

| 命令                 | 用途                                                     |
| -------------------- | -------------------------------------------------------- |
| `npm run dev`        | 启动 Vite 开发服务器                                     |
| `npm run data:check` | 只校验现有 `stats.csv`，不改写数据                       |
| `npm run data:merge` | 合并 `public/data/raw/*.csv`，校验通过后写入 `stats.csv` |
| `npm test`           | 运行数据、地图、播放状态、图表快照/配置/SVG 与校验脚本测试 |
| `npm run build`      | 先校验数据，再构建到 `dist/`；校验失败则停止             |
| `npm run preview`    | 本地预览构建产物                                         |

需要选择输入文件时：

```bash
python scripts/merge_stats.py --input public/data/raw/stats_task1.csv
```

## 目录与接口

```text
public/data/
  geo/zhejiang_city.json  # 规范化市级边界，adcode 为字符串
  regions.csv            # 1 省 + 11 市，含面积与中心点
  indicators.csv         # 任务 1、3、4 共 9 项指标
  stats.csv              # 长表；当前 990 条记录
  raw/stats_task1.csv     # 人口与密度原始提交
  raw/stats_task3.csv     # 三次产业增加值与预计算占比原始提交
  raw/stats_task4.csv     # 收入原始提交，合并时将城市名称转换为编码
scripts/merge_stats.py    # CSV 合并、校验与覆盖率报告
src/
  data/loader.js         # 并行加载、CSV 解析与编码关联
  data/store.js          # 内存索引与共享选择状态
  data/indicators.js     # 指标常量与数值格式化
  map/                   # 市级图层、跨年份固定断点与选择样式
  charts/                # 图表条件快照、环形/排行/趋势图与配置
  ui/                    # 悬浮窗口管理、指标选择、图例、时间轴与播放状态机
  main.js                # 全屏地图工作台与按需创建图表入口
tests/                   # Node.js 与 Python 标准库测试
```

`loadData()` 使用 Vite 的 `BASE_URL` 加载资源，返回解析后的数据。编码始终保留为字符串，数值和年份显式转换；人口密度与产业占比直接读取，不在前端计算

```js
const store = createStore(await loadData());
store.getValue('pop_resident', 2016, '330100'); // 918.8；缺失时返回 null
store.getSeries('pop_resident', '330100'); // [[2016, 918.8], ...]
const unsubscribe = store.subscribe((state) => {
    /* 更新地图、图表、控件 */
});
store.setState({ year: 2020, selectedCities: ['330100'] });
unsubscribe();
```

索引结构为 `Map<indicator, Map<year, Map<adcode, number>>>`。共享状态包含 `indicator`、`year` 和 `selectedCities`；默认选择首个指标和最新年份，不预选城市。支持多城市选择，拒绝省级与未登记地区

## 数据校验

脚本检查列名与顺序、六位字符串编码、地区及边界关联、重复主键、有限非负数值、指标登记、人口密度公式和产业占比公式。密度允许误差 ≤ 0.1 人/km²；产业占比以三次产业增加值之和为分母，单项误差与合计偏离 100% 均须 ≤ 0.01 个百分点。校验失败不会覆盖输出文件。覆盖率按登记城市、当前数据年份和启用指标计算，缺失行只报告、不补零

- 当前覆盖率：11 市 × 10 年 × 9 指标 = 990 行，缺失 0 行
- 原始收入 CSV 的 `城市,year,indicator,value` 在合并入口按地区表的全名或简称精确匹配；未知名称报错。输出与前端仍严格使用 `adcode,year,indicator,value`
- 来源、文件对应关系与本次校验结果见 [数据接入记录](docs/data_sources.md)。收入提交未附来源说明，产业数值为当年初步核算口径
- 省级不提供统计值，面积是地区表的静态属性
- 市级边界由仓库中的 `public/data/geo/浙江省.geojson` 规范化而来，保留原始几何。

## 开发阶段

依据 [设计文档 v0.2](docs/webgis_design_v0.2.md)，已完成 **M0–M2**：数据加载与校验、市级专题地图、年份滑块/播放控制和多城市折线图联动

- M1 已实现：仅初始化时解析并投影 GeoJSON（EPSG:4326 → EPSG:3857），状态更新调用 `layer.changed()`，不重复加载边界；图例与地图共用断点。当前仅绘制本地市级边界，无外部底图服务
- M2 已实现：年份滑块、逐年播放/暂停、速度/循环设置；环形占比、城市排行、多城市趋势图按需创建为独立悬浮窗口，保留各自生成时的条件。地图与控件使用共享状态，图表点击可更新地图；不默认渲染数据表
- 已接入任务 3、4 数据：新增 7 项指标可使用现有分级设色、固定图例、时间轴、城市排行和历年趋势。M5 收入指标已完成
- M3 GDP/人均 GDP 数据与 M4 专用产业雷达图、堆叠图仍待办；不从三次产业合计新增任务 2 指标。县区下钻不在范围内
