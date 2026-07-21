# 极速传领导汇报材料 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 生成一套可编辑的 9 页极速传领导汇报 PPT，以及与页序一致的 Markdown 讲稿、现场演示清单和实验记录模板。

**Architecture:** 使用 Python 和 `python-pptx` 生成可编辑的 PowerPoint 元素，避免将文字和图表栅格化。PPT 采用演示驱动结构，速度数据区域显示明确的“待填入实测数据”，不虚构实验结果；Markdown 保存完整讲稿、演示动作和测试记录字段。

**Tech Stack:** Python 3、python-pptx、Pillow、PowerPoint Open XML、Markdown

## Global Constraints

- 输出目录固定为 `docs/presentations/`。
- PPT 文件固定为 `docs/presentations/极速传领导汇报.pptx`。
- Markdown 文件固定为 `docs/presentations/极速传领导汇报讲稿与演示清单.md`。
- PPT 共 9 页，适配 10–15 分钟汇报。
- 不写入虚构的 WinSCP 或极速传耗时、平均速度和峰值速度。
- 回收站必须标记为“规划中”，不能表述为当前已完成功能。
- 每页只保留一个主要结论，详细说明放入 Markdown。
- 生成器不得覆盖或修改用户现有源码、未提交修改和实验数据。

---

### Task 1: 建立可重复执行的 PPT 生成器

**Files:**
- Create: `scripts/generate-turbofile-leadership-presentation.py`
- Create: `docs/presentations/极速传领导汇报.pptx`

**Interfaces:**
- Consumes: `docs/superpowers/specs/2026-07-17-turbofile-leadership-presentation-design.md`
- Produces: `main() -> None`，生成固定路径的 PowerPoint 文件

- [ ] **Step 1: 检查运行环境**

Run:

```powershell
python -c "import pptx, PIL; print('pptx and Pillow available')"
```

Expected:

```text
pptx and Pillow available
```

如果导入失败，只安装缺失的 Python 包：

```powershell
python -m pip install python-pptx Pillow
```

- [ ] **Step 2: 创建生成器**

生成器必须：

- 使用 16:9 宽屏尺寸。
- 设置中文字体为 `Microsoft YaHei`，数字和英文可使用 `Aptos`。
- 使用深蓝、亮蓝、青绿色和白色作为主色。
- 提供封面、章节标题、优势卡片、数据表、流程箭头、结论标签等复用函数。
- 使用 PowerPoint 原生文本框、形状、表格和图表。
- 生成设计文档规定的 9 页内容。
- 在第 5 页插入 WinSCP 对比数据表和零值占位柱状图。
- 在第 9 页把“回收站”标为“规划中”。
- 在文件属性中将标题设置为“极速传领导汇报”。

- [ ] **Step 3: 执行生成器**

Run:

```powershell
python scripts/generate-turbofile-leadership-presentation.py
```

Expected:

```text
Created: D:\Work\Code\TurboFile-Windows\docs\presentations\极速传领导汇报.pptx
Slides: 9
```

- [ ] **Step 4: 验证 PowerPoint Open XML**

Run:

```powershell
python -c "from pptx import Presentation; p=Presentation(r'docs/presentations/极速传领导汇报.pptx'); print(len(p.slides), p.slide_width, p.slide_height)"
```

Expected:

- 第一项为 `9`
- 宽高比约为 `1.7778`

### Task 2: 编写逐页讲稿和现场演示清单

**Files:**
- Create: `docs/presentations/极速传领导汇报讲稿与演示清单.md`

**Interfaces:**
- Consumes: PPT 的 9 页标题和顺序
- Produces: 可直接照读或精简使用的逐页讲稿、演示动作和实验数据模板

- [ ] **Step 1: 编写汇报总览**

文档开头必须写明：

- 建议总时长为 10–15 分钟。
- PPT 讲解约 6–8 分钟。
- 软件现场演示约 5–7 分钟。
- 发生网络或设备异常时使用提前准备的截图或录像。

- [ ] **Step 2: 编写九页逐页讲稿**

每页包含：

- 本页目标。
- 建议讲解时间。
- 30–60 秒口语化讲稿。
- 是否切换软件。
- 要展示的具体操作。
- 演示结束后如何切回 PPT。

- [ ] **Step 3: 编写传输实验模板**

模板必须分别记录：

- 单个大文件。
- 大量小图片。
- SSH A 到 SSH B。

每组必须包含：

- 数据大小。
- 文件数量。
- 网络带宽。
- WinSCP 协议、耗时、平均速度和峰值速度。
- 极速传协议、路线、耗时、平均速度和峰值速度。
- 首次出现进度所需时间。
- 提升倍数和节省时间。

- [ ] **Step 4: 编写演示前检查表**

检查表至少包含：

- 所有 SSH 设备能够连接。
- 左右图片目录已经准备。
- 测试数据已经复制到来源目录。
- 删除测试使用可安全删除的副本。
- WinSCP 会话和目标目录已经配置。
- 远程终端命令提示符正常。
- Markdown、代码和日志示例文件存在。
- Windows 资源管理器目标目录已打开。
- 关闭无关通知。
- 准备网络异常时的备用截图或录像。

### Task 3: 视觉和内容验证

**Files:**
- Verify: `docs/presentations/极速传领导汇报.pptx`
- Verify: `docs/presentations/极速传领导汇报讲稿与演示清单.md`

**Interfaces:**
- Consumes: Task 1 和 Task 2 的产物
- Produces: 验证结果，不修改其他项目文件

- [ ] **Step 1: 检查幻灯片标题**

Run:

```powershell
python -c "from pptx import Presentation; p=Presentation(r'docs/presentations/极速传领导汇报.pptx'); print([next((s.text for s in slide.shapes if hasattr(s, 'text') and s.text.strip()), '') for slide in p.slides])"
```

Expected:

- 输出 9 个非空页面标题。
- 第一页包含“极速传”。
- 第五页包含“高速传输”。
- 第九页包含“总结”。

- [ ] **Step 2: 检查禁止性表述**

Run:

```powershell
rg -n "已经实现回收站|全球最快|绝对最快|所有软件中唯一|100%领先" docs/presentations scripts/generate-turbofile-leadership-presentation.py
```

Expected:

- 无匹配结果。

- [ ] **Step 3: 检查数据占位**

Run:

```powershell
rg -n "待填入实测数据|待填写" docs/presentations/极速传领导汇报讲稿与演示清单.md scripts/generate-turbofile-leadership-presentation.py
```

Expected:

- 第 5 页生成内容和 Markdown 实验模板均包含明确的数据占位说明。

- [ ] **Step 4: 检查 Markdown 完整性**

Run:

```powershell
rg -n "^## 第 [1-9] 页|^## 传输实验记录模板|^## 演示前检查表" docs/presentations/极速传领导汇报讲稿与演示清单.md
```

Expected:

- 九个页面章节全部存在。
- 实验模板存在。
- 演示前检查表存在。

### Task 4: 最终交付

**Files:**
- Deliver: `docs/presentations/极速传领导汇报.pptx`
- Deliver: `docs/presentations/极速传领导汇报讲稿与演示清单.md`
- Deliver: `scripts/generate-turbofile-leadership-presentation.py`

**Interfaces:**
- Consumes: 所有验证结果
- Produces: 可点击的本地文件链接和数据替换说明

- [ ] **Step 1: 检查最终文件**

Run:

```powershell
Get-Item 'docs/presentations/极速传领导汇报.pptx','docs/presentations/极速传领导汇报讲稿与演示清单.md','scripts/generate-turbofile-leadership-presentation.py' | Select-Object Name,Length,LastWriteTime
```

Expected:

- 三个文件均存在。
- PPT 文件大小大于 10 KB。
- Markdown 和生成器文件大小均大于 1 KB。

- [ ] **Step 2: 输出交付说明**

最终说明必须包括：

- PPT 文件链接。
- Markdown 文件链接。
- 生成器文件链接。
- 第 5 页实验数据需要替换。
- 建议先在 PowerPoint 中检查字体和投影比例。
