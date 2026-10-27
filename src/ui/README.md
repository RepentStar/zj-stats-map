# 交互模块（M1–M2）

- `indicatorPicker.js`、`legend.js`、`tooltip.js`：按主题分组的指标切换、左下角停靠图例卡片（年份 + 色带或气泡参照）、地图悬停提示（数值、排名、较上年变化）。
- `timeline.js`、`player.js`：动态年份滑块与播放控制（M2）。
- `windows.js`：全屏地图上的非模态悬浮窗口，可拖动、调整大小、置顶和独立关闭。

M1 的 `createIndicatorPicker({ target, store })` 与 `createLegend({ target, store, classifications })` 已实现，均返回销毁函数，取消订阅并清理控件。图例随表达方式切换：分级指标从高到低逐档列出数值范围及当年落在该档的城市数，当年为空的档位变淡，有缺失时列出“无数据”；总量指标显示气泡面积参照（真实像素尺寸）与 11 市合计；产业占比显示扇区配色与饼图大小参照。图例区高度固定，切换指标或年份时卡片不跳动。

M2 已实现：`createPlayer(store, { intervalMs = 1000, loop = false })` 返回 `play/pause/toggle/setIntervalMs/setLoop/getState/subscribe/destroy`。播放状态独立于 Store，年份写入 Store。末年启动时重播，默认抵达末年立即暂停；循环时在末年停留一个间隔再回首年。速度变更替换计时器，单年份不启动播放。

`createTimeline({ target, store, player })` 返回销毁函数。滑块按实际年份索引取值，支持非连续年份；提供上一年/下一年、播放/暂停、0.5/1/2 秒间隔和循环控制。滑块 pointerdown/input 均暂停播放。

年份来自 `store.years`，控件通过 `store.setState()` 更新共享状态。播放默认间隔 1000 ms、末年停止；手动拖动时暂停。组件销毁时取消订阅和计时器。

`createWindowManager({ target, fallbackFocus })` 提供 `open/closeAll/destroy`。`open({ key, title, width, placement, trigger })` 返回 `element/body/heading/isNew/closed/onClose/close`：有 `key` 的控件复用已有窗口并置顶，无 `key` 的图表每次创建新窗口。关闭时先执行 `onClose` 注册的销毁回调，再移除节点，并将键盘焦点返回触发按钮或工具栏。

标题栏支持 Pointer Events 拖动和方向键移动，Shift 加方向键加快移动；Escape 关闭当前窗口。窗口采用 `role="dialog"`、`aria-modal="false"`，不阻塞地图，不锁定焦点。移动或视口缩小时限制窗口范围，避免标题栏被工具栏遮住。右下角使用浏览器原生 resize；内容区可滚动，图表观察自身尺寸变化。

入口为控制面板、时间轴和图表选择器分别注册生命周期，图例卡片常驻；关闭时间轴时暂停播放并取消控件订阅，重新打开时恢复当前年份。关闭全部会销毁所有悬浮窗口，工具栏始终可用于重新打开。

界面保留控件标签与必要状态反馈，省去分级、播放规则和图表条件的说明段落。
