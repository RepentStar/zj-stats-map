# 地图模块（M1）

- `layers.js`：OpenLayers 市级面图层。使用 Store 中的 GeoJSON，仅初始化时读取一次。
- `breaks.js`：按指标在所有年份的数据计算固定分级断点。
- `style.js`：分级设色、无数据灰色样式与选中城市高亮。

M1 已实现。`createClassifications(store)` 为每个指标汇总全部年份，计算五级最近秩分位数；重复断点去重，断点值归入较低一级。地图与图例共用同一组分级结果，缺失值为灰色。边界从 EPSG:4326 投影到 EPSG:3857。

`createCityMap({ target, store, classifications })` 返回 `resetView()` 与 `destroy()`；后者取消 Store 订阅、尺寸观察并释放地图。`toggleCity(store, adcode)` 供地图点击、控制面板城市按钮和图表点击共用。

地图容器覆盖整个视口，悬浮窗口不参与地图布局；关闭控件或图表不缩小地图。窗口之间的空白区域可直接操作地图，工具栏提供返回全省和重新打开控件的入口。

从 Store 读取 `indicator`、`year`、`selectedCities`。状态更新时调用 `layer.changed()`，不重新获取边界；点击要素时调用 `store.setState({ selectedCities })`。仅市级，不做县区下钻。
