# 图表模块（M2）

- `line.js`：选中城市的历年序列，支持多城市对比；标记当前年。
- `lineOptions.js`：纯配置构建函数，生成序列、单位、工具提示、城市固定颜色与标注，供运行时及测试共用。
- `snapshot.js`：捕获创建图表时的指标、年份和城市范围。
- `exploreOptions.js`：环形人口占比图、横向城市排行图的纯配置，并复用折线图配置。
- `explore.js`：按需注册饼图、条形图、折线图和所需组件，负责 SVG 渲染、点击事件与销毁。

使用 `echarts/core` 按需引入图表及组件。通过 `store.getSeries(indicator, adcode)` 获取序列；缺失值保持 `null`，不插值。工作台图表捕获生成时的选择状态，地图与控件使用 `store.subscribe()` 同步共享状态。

工作台入口在用户请求时动态导入 `explore.js`，每次请求新建窗口。`createChartSnapshot(store, type)` 保留生成时的状态，无选择时使用全部地级市，排除省级；饼图始终使用 `pop_resident`，不对密度做占比。`createExploreOption(snapshot, type)` 接受 `pie/rank/line`，不修改共享 Store。图表使用条件快照，不订阅后续地图条件变化。

`createExploreChart({ target, snapshot, type, onSelectCity, onSelectYear })` 返回销毁函数。饼图和排行点击调用 `onSelectCity(adcode)`，折线点选调用 `onSelectYear(year)`；入口更新地图选择，手动选年时暂停播放。图表数据保留生成时的条件，支持多个年份或城市范围并排对比。

饼图占比以本次城市范围内有效人口合计为分母。饼图与排行排除缺失观测，排行保留零值；无有效值时显示空状态，饼图人口合计为零时也不伪造占比。城市配色跨图表保持固定。生成失败可在当前窗口重试，模块加载失败提供重新加载页面入口，不影响地图；异步加载完成前检查窗口是否关闭，避免向已移除的节点初始化实例。

原 `createLineChart({ target, store, onSelectYear })` 仍可用于订阅 Store 的趋势组件；当前工作台通过 `explore.js` 和条件快照渲染，避免新请求覆盖旧窗口。

当前年份使用虚线，工具提示显示年份、城市数值和单位。ResizeObserver 同步容器尺寸，销毁时取消观察器并释放图表实例；原有订阅式趋势组件另行取消 Store 订阅。

GDP、产业结构和收入图表暂不实现。
