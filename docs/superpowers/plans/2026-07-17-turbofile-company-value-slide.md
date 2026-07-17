# TurboFile Company Value Slide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在极速传领导汇报中增加一页“对公司的直接价值”，并在 Markdown 中记录 AI 算法、售后/应用和数据标注三类岗位的使用价值。

**Architecture:** 以当前“实测数据版” PPT 为源文件，用 `python-pptx` 新建一张白底三栏页面，将其插入到现有第 8 页和现场演示页之间，并把原第 9 页页码更新为 10。Markdown 使用独立章节保留更完整的岗位场景、收益和实测证据。

**Tech Stack:** Python 3、python-pptx、PowerPoint COM、Markdown、PowerShell

## Global Constraints

- PPT 继续使用白底、深灰文字、单一蓝色强调的极简风格。
- 新页使用三栏并列布局，不使用深色大卡片、阴影或彩色圆形。
- 只使用已提供的 234 秒、24.6 秒、12 分钟和 23.7 秒等实测数据。
- Markdown 只记录软件优势、业务价值、实验数据和演示清单，不增加演讲稿。
- 不生成 PDF，不保留 PPT 生成脚本。

---

### Task 1: 在 Markdown 中新增公司业务价值章节

**Files:**
- Modify: `docs/presentations/极速传软件优势与演示清单.md`

**Interfaces:**
- Consumes: 现有“极速传的核心优势”和“WinSCP 传输实验记录”章节。
- Produces: 介于两者之间的“对公司的业务价值”章节。

- [ ] **Step 1: 写入三类岗位的业务价值**

使用 `apply_patch` 在 `## 四、WinSCP 传输实验记录` 之前插入以下结构，并把后续章节序号顺延一位：

```markdown
## 四、对公司的业务价值

### AI 算法工程师

- 直接在服务器上网格浏览模型训练图片，不需要先整批下载。
- 左右对比原始图片、处理结果和不同数据集。
- 更快排查数据质量、样本差异和模型效果问题。

### 售后与应用工程师

- 快速传输 X86 设备和 AI 芯片采集的现场图片。
- 减少先导入 Windows，再发送回公司的等待时间。
- 2.32 GB 混合文件实测从 234 秒缩短到 24.6 秒，耗时提升约 9.5 倍。

### 数据标注人员

- 使用图片缩放能力查看大米、小麦等微小物料的细节特征。
- 大批量数据可快速上传至 NAS、62 和 64 等服务器。
- 62 → 64 设备传输实测从 12 分钟缩短到 23.7 秒。

**公司整体价值：** 缩短“采图—传输—分析—标注—反馈”的完整业务周期。
```

- [ ] **Step 2: 检查 Markdown 结构和数据**

Run:

```powershell
rg -n "对公司的业务价值|AI 算法工程师|售后与应用工程师|数据标注人员|234 秒|24\.6 秒|12 分钟|23\.7 秒" "docs/presentations/极速传软件优势与演示清单.md"
```

Expected: 三类岗位、两组实测数据和新章节标题均能被检索到。

### Task 2: 新建并插入公司价值页

**Files:**
- Read: `docs/presentations/极速传领导汇报-实测数据版.pptx`
- Create: `docs/presentations/极速传领导汇报-公司价值版.pptx`

**Interfaces:**
- Consumes: 现有 9 页、16:9 的实测数据版 PPT。
- Produces: 10 页 PPT，新第 9 页为公司价值页，第 10 页为现场演示页。

- [ ] **Step 1: 用 python-pptx 创建三栏页面**

通过一次性 Python 命令加载源 PPT，使用空白版式新建页面，并写入：

```python
columns = [
    (
        "AI 算法工程师",
        "服务器上的训练图片可以直接查看和分析",
        ["网格浏览训练数据集",
         "左右对比原图与处理结果",
         "快速排查数据与模型效果"],
    ),
    (
        "售后与应用工程师",
        "现场密集图片可以更快传回公司",
        ["X86 设备与 AI 芯片图片快速导出",
         "减少 Windows 中转和上传等待",
         "2.32 GB：234s → 24.6s，提升 9.5 倍"],
    ),
    (
        "数据标注人员",
        "微小物料看得更清楚，海量数据传得更快",
        ["缩放查看大米、小麦等细节特征",
         "快速上传至 NAS、62 和 64 服务器",
         "62→64：12 分钟 → 23.7s"],
    ),
]
```

统一使用 `Microsoft YaHei`，标题 27 pt，岗位标题 16 pt，核心价值 13 pt，说明文字 11 pt。三栏使用细灰线分割，底部浅蓝色总结条写入：

```text
缩短“采图—传输—分析—标注—反馈”的完整业务周期
```

- [ ] **Step 2: 插入新第 9 页并更新页码**

将新建页的 slide ID 从列表末尾移动到原第 9 页之前：

```python
sld_id_list = prs.slides._sldIdLst
new_id = sld_id_list[-1]
sld_id_list.remove(new_id)
sld_id_list.insert(8, new_id)
```

将原现场演示页右上角页码从 `09` 改为 `10`，并把新页右上角页码设为 `09`。保存为 `极速传领导汇报-公司价值版.pptx`。

- [ ] **Step 3: 检查 PPT 结构**

Run:

```python
from pptx import Presentation
prs = Presentation(r"docs/presentations/极速传领导汇报-公司价值版.pptx")
assert len(prs.slides) == 10
assert "极速传对公司的直接价值" in prs.slides[8].shapes[0].text
assert "现场演示" in " ".join(
    shape.text for shape in prs.slides[9].shapes if hasattr(shape, "text")
)
```

Expected: 所有断言通过。

### Task 3: 打开、渲染并检查最终交付物

**Files:**
- Verify: `docs/presentations/极速传领导汇报-公司价值版.pptx`
- Verify: `docs/presentations/极速传软件优势与演示清单.md`

**Interfaces:**
- Consumes: Task 1 和 Task 2 的最终文件。
- Produces: 可正常打开、无文字溢出的 10 页 PPT 和完整 Markdown。

- [ ] **Step 1: 用 PowerPoint COM 打开 PPT**

Run:

```powershell
$ppt = (Resolve-Path -LiteralPath 'docs\presentations\极速传领导汇报-公司价值版.pptx').Path
$app = New-Object -ComObject PowerPoint.Application
$pres = $app.Presentations.Open($ppt, $true, $true, $false)
$pres.Slides.Count
$pres.Close()
$app.Quit()
```

Expected: 输出 `10`，不出现修复或文件损坏提示。

- [ ] **Step 2: 渲染新第 9 页**

使用 PowerPoint `Slide.Export` 把第 9 页导出为 1600×900 PNG，并用图像检查确认：

- 标题、三栏和底部总结条全部可见。
- 无文字溢出、文字重叠或中文问号乱码。
- 无深色大面积背景和彩色装饰。

- [ ] **Step 3: 最终文件检查**

Run:

```powershell
Get-Item -LiteralPath 'docs\presentations\极速传领导汇报-公司价值版.pptx'
Get-Item -LiteralPath 'docs\presentations\极速传软件优势与演示清单.md'
Test-Path -LiteralPath 'docs\presentations\极速传领导汇报.pdf'
Test-Path -LiteralPath 'scripts\generate-turbofile-leadership-presentation.py'
```

Expected: PPT 和 Markdown 存在，PDF 和生成脚本均不存在。
