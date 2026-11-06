# 交互模块

| 文件                 | 职责                               |
| -------------------- | ---------------------------------- |
| `indicatorPicker.js` | 按主题分组的指标切换               |
| `legend.js`          | 左下角固定图例、当前年份与符号参照 |
| `tooltip.js`         | 城市数值、全省排名与较上年变化     |
| `timeline.js`        | 年份滑块、逐年切换及播放控件       |
| `player.js`          | 播放状态、速度与循环控制           |
| `windows.js`         | 非模态悬浮窗口管理                 |

## 控件与播放

指标选择器、图例和时间轴均订阅 Store，返回销毁函数。图例按指标显示固定分级及当年城市数、总量气泡参照或产业饼图参照。提示中的产业占比变化使用百分点，其余指标使用百分比

`createPlayer(store, { intervalMs = 1000, loop = false })` 提供 `play/pause/toggle/setIntervalMs/setLoop/getState/subscribe/destroy`。播放状态独立于 Store，年份写入共享状态。末年启动从首年重播，默认到末年暂停；循环时在末年停留一个间隔。速度变更替换计时器，单年份不启动播放

`createTimeline({ target, store, player })` 按实际年份索引选择，支持非连续年份，提供 0.5/1/2 秒间隔。手动切换年份或关闭时间轴会暂停播放

## 窗口

`createWindowManager({ target, fallbackFocus })` 提供 `open/closeAll/destroy`。`open({ key, title, width, placement, trigger })` 返回 `element/body/heading/isNew/closed/onClose/close`。有 key 的控件复用已有窗口，无 key 的图表每次创建新窗口

标题栏支持拖动和方向键移动，Shift 加方向键加快移动，Escape 关闭窗口；右下角可调整大小。窗口使用非模态 dialog 语义，聚焦时置顶，移动及视口变化时限制边界。关闭时执行清理回调，并在窗口持有焦点时恢复到触发按钮或工具栏

桌面默认打开控制面板和时间轴，手机默认只打开时间轴。图例常驻地图，关闭全部仅销毁悬浮窗口；控件可从工具栏重新打开
