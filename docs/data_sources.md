# 数据说明

统计数据覆盖浙江省 11 个地级市、2016–2025 年，共 11 项指标、1210 条观测。省级记录仅用于地区层级，不提供统计值

## 文件与字段

前端从 `public/data/` 加载以下文件：

| 文件                     | 内容                                           |
| ------------------------ | ---------------------------------------------- |
| `regions.csv`            | 省、市编码、名称、面积与中心点                 |
| `indicators.csv`         | 指标名称、单位、精度、类型、公式与来源         |
| `stats.csv`              | 统计长表，字段为 `adcode,year,indicator,value` |
| `geo/zhejiang_city.json` | 浙江省 11 市 GeoJSON 边界                      |

地区编码为六位字符串；统计主键为 `(adcode, year, indicator)`。年份与观测值按数值解析，缺失观测返回 `null`。面积 `area_land` 是地区表中的静态属性，单位为 km²

## 指标

| 指标                                                 | 名称                   | 单位   |
| ---------------------------------------------------- | ---------------------- | ------ |
| `pop_resident`                                       | 常住人口               | 万人   |
| `pop_density`                                        | 人口密度               | 人/km² |
| `gdp`                                                | 地区生产总值           | 亿元   |
| `gdp_per_capita`                                     | 人均 GDP               | 元/人  |
| `gdp_primary`、`gdp_secondary`、`gdp_tertiary`       | 第一、二、三产业增加值 | 亿元   |
| `share_primary`、`share_secondary`、`share_tertiary` | 第一、二、三产业占比   | %      |
| `income_urban_pc`                                    | 城镇居民人均可支配收入 | 元     |

人口密度与产业占比均为预计算值，前端直接读取。产业占比以同一市年的三次产业增加值之和为分母。GDP、人均 GDP 使用数据表中的独立统计值

## 来源

- 常住人口的来源记录为统计年鉴
- 三次产业增加值采用各市统计局年度初步核算数；2018、2020–2023 年来源记录为宁波市统计局的省内城市年度汇总表，2019、2024、2025 年为湖州市统计局的省内城市主要经济指标，2016–2017 年为各市统计公报。记录示例：[宁波 2023 年汇总表](https://tjj.ningbo.gov.cn/art/2024/2/8/art_1229042823_58919689.html)、[湖州 2025 年汇总表](https://tjj.huzhou.gov.cn/col/col1229208255/art/2026/art_7c4adbcc75404441a72352baf1927840.html)
- GDP、人均 GDP 和城镇居民收入的原始统计文件摘自[中国统计年鉴](https://www.stats.gov.cn/sj/ndsj/)
- 市级边界来自仓库内的 `geo/浙江省.geojson`，在[DataV](https://datav.aliyun.com/portal/school/atlas/area_selector)上下载，保留原始几何并规范编码

## 校验

`npm run data:check` 检查字段、编码与边界关联、重复主键、指标登记及有限非负数值，并校验以下公式：

- 人口密度：`pop_resident × 10000 / area_land`，误差不超过 0.1 人/km²
- 产业占比：`gdp_x / (gdp_primary + gdp_secondary + gdp_tertiary) × 100`，单项误差及合计偏离 100% 均不超过 0.01 个百分点

覆盖率按城市、年份与指标计算，缺失项只报告。校验范围不包含人均 GDP 公式或 GDP 与产业合计的一致性
