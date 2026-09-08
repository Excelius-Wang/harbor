# 品牌命名候选核查

核查日期：2026-09-07。此文用于选名，不代表已完成注册或商标许可核查。

产品定位：把 GitHub 上的仓库、讨论、通知和待处理事项集中到一个桌面工作区。产品包含发现与浏览，不能只按 PR 审查工具命名。GitHub 路径继续保留 `Excelius-Wang/harbor`；尚未批准新的产品名。

## 推荐顺序

| 优先级 | 名称 | 与产品的联系 | 取舍 |
| --- | --- | --- | --- |
| 首选保留 | Repolane | Repo + lane，围绕仓库处理工作的通道 | 拼写清楚，能覆盖多种工作；.com 已注册，另有 RepoLane Motors 的公开用名线索 |
| 第一备选 | Reporally | Repo + rally，把围绕仓库的人、讨论和事项汇集起来 | 更有协作与行动感；四音节，比 Repolane 长，rally 也有赛事含义 |
| 第二备选 | Repoway | Repo + way，访问和处理仓库工作的方式 | 短、容易理解；个性较弱，.com 与 GitHub 同名账号已占用 |
| 次级备选 | Repofield | Repo + field，集中开展仓库工作的空间 | 覆盖范围宽；存在韩国同名企业线索，.com 已注册，辨识度需再评估 |
| 暂缓 | Branchfold | 分支与汇拢的联想 | 易被误认为 Git 分支管理工具；同名 GitHub 组织、.com 已占用，另有数学术语与编译器函数同名 |
| 暂缓 | Repotrail | 仓库活动与讨论的跟进轨迹 | 易被理解为追踪/审计工具；已有同名 GitHub 组织、仓库和 GitHub 活动展示设计草案 |
| 暂缓 | Repofront | 仓库工作的操作入口 | GitHub 名称搜索返回 103 项，许多是前端仓库的通用命名，搜索噪声较大；.com 已注册 |

这些词根说明是本次命名构思，不是现有词典词源。优先级属于产品判断，不是法律结论。Repolane 的 .com 被占用本身不足以淘汰名字；若可接受 .app，可以继续保留。

## 域名、账号与包名

“未查到记录”指指定端点返回 404，不等于可购买、可创建或无商标冲突。域名可能被保留或按溢价出售；GitHub 名称也可能被平台保留。没有把网络错误或 403 当成可用。

| 名称 | .com | .app | .dev | GitHub 同名账号 | GitHub 仓库名称搜索 | npm 同名包 |
| --- | --- | --- | --- | --- | --- | --- |
| Repolane | 已注册 | 未查到记录 | 未查到记录 | 未查到公开账号 | 0 | 未查到包 |
| Reporally | 未查到记录 | 未查到记录 | 未查到记录 | 未查到公开账号 | 0 | 未查到包 |
| Repoway | 已注册 | 未查到记录 | 未查到记录 | 已有 User | 0 | 未查到包 |
| Repofield | 已注册 | 未查到记录 | 未查到记录 | 未查到公开账号 | 0 | 未查到包 |
| Branchfold | 已注册，重试确认 | 未查到记录 | 未查到记录 | 已有 Organization | 7 | 未查到包 |
| Repotrail | 已注册 | 未查到记录 | 未查到记录 | 已有 Organization | 10 | 未查到包 |
| Repofront | 已注册 | 未查到记录 | 未查到记录 | 未查到公开账号 | 103 | 未查到包 |

仓库搜索使用 `NAME in:name`，数量包含部分匹配，不能将每项都视为正式产品。GitHub 匿名请求本轮遇到 403，之后用已认证的 `gh api` 重新查询账号与仓库。npm 只检查不带 scope 的同名包，不代表整个生态无冲突。

原始最小记录：[注册局与 npm 查询](registry-checks.json)、[GitHub 账号重试](github-accounts.json)、[GitHub 仓库搜索](github-search.json)、[Repofront 补查](repofront-checks.json)。记录不含账号凭据或域名持有人信息。

端点示例（替换小写名称可复核）：

- [.com 注册局 RDAP](https://rdap.verisign.com/com/v1/domain/reporally.com)
- [.app 注册局 RDAP](https://pubapi.registry.google/rdap/domain/reporally.app)
- [.dev 注册局 RDAP](https://pubapi.registry.google/rdap/domain/reporally.dev)
- [GitHub 账号](https://api.github.com/users/reporally)
- [GitHub 仓库名称搜索](https://api.github.com/search/repositories?q=reporally+in:name)
- [npm registry](https://registry.npmjs.org/reporally)

美国区 App Store 搜索 API 对这七个名称均未返回名称包含该候选的应用结果；查询范围为 software/macSoftware，最多取 50 项，不能推广为所有国家或所有商店无重名。[查询记录](appstore.json)。

## 已排除的近邻名称

| 名称 | 排除依据 |
| --- | --- |
| Repoweave | 已有多仓库工作区工具，直接接近本产品：[项目](https://github.com/cwalv/repoweave) |
| Repocove | 已有 GitHub 私有仓库共享产品：[官网](https://repocove.com/) |
| Repotide | 已有 GitHub Trending 产品：[项目](https://github.com/bowjoww/repotide) |
| Repogrove | 已有 GitHub 个人主页浏览工具：[项目](https://github.com/tymanmimo/repogrove) |
| Repovista | 已有代码库分析包：[npm](https://www.npmjs.com/package/repovista) |
| Repofolio | 已有同名应用：[页面](https://www.repofolio.com/sign-in) |
| Repobrief | 已有代码库上下文工具：[项目](https://github.com/joeynyc/repobrief) |
| Repocourse | 已有项目学习工具：[PyPI](https://pypi.org/project/repocourse/) |
| Patchward | 已有 Linux 补丁管理产品：[官网](https://patchward.net/) |
| Threadward | 已有并行实验包：[PyPI](https://pypi.org/project/threadward/) |

未进入短名单的 Threadquay 难以仅凭拼写读出；Repowalk 容易指向仓库遍历程序。二者没有继续做域名与账号核查。

## 需要保留的用名线索

- [RepoLane Motors](https://urlebird.com/user/repolane.motors/) 是第三方索引线索，不能据此认定商标权或业务真实性。
- [Repofield 韩国企业目录](https://bizno.net/article/1258607252) 是第三方企业线索，需到对应官方记录核实。
- [RepoTrail 的公开设计草案](https://v0.app/t/Rq1cwwPTvTp) 已使用这个名字描述 GitHub 活动时间线，但不能把设计草案说成已运营产品。
- [BranchFold 编译器函数](https://pkg.go.dev/github.com/goccy/wasm2go/internal/ssa/pass) 说明这个词存在开发者语境中的其他含义。

## 尚未完成的确认

公开搜索覆盖连写名、部分拆词写法、软件/应用/GitHub/商标关键词。没有得到明显同名产品结果只是一项初筛证据，不是全网无重名证明。

尝试读取 [WIPO Global Brand Database](https://branddb.wipo.int/) 与 [USPTO Trademark Search](https://tmsearch.uspto.gov/)，当前读取方式没有取得可核实的查询结果。所有候选的正式商标状态均为未核实；还需按计划发布地区查询完全相同及近似名称。不能把搜索引擎未命中说成商标可用。

注册商实际购买资格、首年及续费价格、GitHub 账号创建资格、社交平台账号均未确认。没有购买域名、创建账号、改仓库名或改产品配置。

## 选名时如何使用这份记录

如果保留 Repolane，优先确认 repolane.app 的实际注册与续费条件。如果 Repolane 因冲突淘汰，先评估 Reporally；若偏好更短、更直观的名称，再考虑 Repoway，并接受 GitHub 同名账号已经占用。Repofield 只作为次级备选，先核实企业线索。

定名前，让目标用户在不看解释的情况下读出名字、听写名字，并回答它像什么产品。这个环节尚未实际进行，不能用设计者自己的偏好代替结果。

名称经用户选定并完成必要确认后，再设计独立图形。应用显示名可以改变，仓库路径仍保留 harbor；稳定标识、用户数据目录和更新链路的改动需要另行做迁移评估。
