# 传输速度测试结果与命令整理

本文档整理本轮测试中两个测试对象的速度排名前五方案，以及对应的复现命令。

测试对象：

- 目录：`D:\Work\test\1024x40`
- 文件：`D:\GanLaJiao_tongliao.zip`

服务器：

- 64 服务器：`ubuntu@192.168.9.64`
- 62 服务器：`th@192.168.9.62`

说明：

- 下方命令默认使用测试时创建的 SSH key：`C:\Users\13093\Documents\Codex\2026-05-23\new-chat-2\codex_transfer_ed25519`
- 如果没有配置免密登录，执行时需要手动输入对应服务器密码。
- `<目标目录>`、`<测试目录>` 需要替换为实际保存路径。
- 速度按原始数据量计算，成功结果均已做文件数/字节数或 SHA256 校验。
复制
---

## 一、`1024x40` 目录传输到 64

源目录：

```text
D:\Work\test\1024x40
```

目标服务器：

```text
ubuntu@192.168.9.64:/home/ubuntu/work/fankun/test
```

数据规模：

```text
191,919 个文件
5,784,834,129 字节
约 5.388 GiB
```

### 速度排名前五

| 排名 | 算法 | 时间 | 速度 |
|---:|---|---:|---:|
| 1 | 24 分片 `tar + zstd -6 + ssh` | 37.951s | 152.43 MB/s |
| 2 | 16 分片 `tar + zstd -3 + ssh` | 38.631s | 149.75 MB/s |
| 3 | 24 分片 `tar + zstd -3 + ssh` | 39.061s | 148.10 MB/s |
| 4 | 24 分片 `rsync + zstd level 1` | 40.319s | 143.48 MB/s |
| 5 | 16 分片 `rsync + zstd level 1` | 41.477s | 139.47 MB/s |

### 测试脚本命令

这些是我实际用于测试的入口命令：

```powershell
python run_transfer_bench.py --only chunk_zstd_6_24
python run_transfer_bench.py --only chunk_zstd_3_16
python run_transfer_bench.py --only chunk_zstd_3_24
python run_transfer_bench.py --only chunk_rsync_24_zstd1
python run_transfer_bench.py --only chunk_rsync_16_zstd1
```

### 第 1 名：24 分片 `tar + zstd -6 + ssh`

核心思路：

- 先把 191,919 个文件均衡切成 24 个文件清单。
- 每个清单启动一路 `tar`。
- 每路用 `zstd -6` 压缩。
- 通过 SSH 传到 64。
- 64 上边解压边落盘。

单路命令形态如下，实际测试时并行启动 24 路：

```powershell
tar -cf - -C D:/Work/test/1024x40 --null -T <分片清单文件> |
zstd -6 -T1 -c |
ssh -i C:\Users\13093\Documents\Codex\2026-05-23\new-chat-2\codex_transfer_ed25519 `
  -o BatchMode=yes `
  -o StrictHostKeyChecking=accept-new `
  ubuntu@192.168.9.64 `
  "zstd -d -c | tar -xf - -C /home/ubuntu/work/fankun/test/<测试目录>/1024x40"
```

### 第 2 名：16 分片 `tar + zstd -3 + ssh`

实际测试入口：

```powershell
python run_transfer_bench.py --only chunk_zstd_3_16
```

单路命令形态如下，实际测试时并行启动 16 路：

```powershell
tar -cf - -C D:/Work/test/1024x40 --null -T <分片清单文件> |
zstd -3 -T1 -c |
ssh -i C:\Users\13093\Documents\Codex\2026-05-23\new-chat-2\codex_transfer_ed25519 `
  -o BatchMode=yes `
  -o StrictHostKeyChecking=accept-new `
  ubuntu@192.168.9.64 `
  "zstd -d -c | tar -xf - -C /home/ubuntu/work/fankun/test/<测试目录>/1024x40"
```

### 第 3 名：24 分片 `tar + zstd -3 + ssh`

实际测试入口：

```powershell
python run_transfer_bench.py --only chunk_zstd_3_24
```

单路命令形态如下，实际测试时并行启动 24 路：

```powershell
tar -cf - -C D:/Work/test/1024x40 --null -T <分片清单文件> |
zstd -3 -T1 -c |
ssh -i C:\Users\13093\Documents\Codex\2026-05-23\new-chat-2\codex_transfer_ed25519 `
  -o BatchMode=yes `
  -o StrictHostKeyChecking=accept-new `
  ubuntu@192.168.9.64 `
  "zstd -d -c | tar -xf - -C /home/ubuntu/work/fankun/test/<测试目录>/1024x40"
```

### 第 4 名：24 分片 `rsync + zstd level 1`

实际测试入口：

```powershell
python run_transfer_bench.py --only chunk_rsync_24_zstd1
```

单路命令形态如下，实际测试时并行启动 24 路：

```powershell
rsync -a --whole-file -z --compress-choice=zstd --compress-level=1 `
  --from0 `
  --files-from=<分片清单文件> `
  -e "ssh -i /cygdrive/c/Users/13093/Documents/Codex/2026-05-23/new-chat-2/codex_transfer_ed25519 -o BatchMode=yes -o StrictHostKeyChecking=accept-new" `
  /cygdrive/d/Work/test/1024x40/ `
  ubuntu@192.168.9.64:/home/ubuntu/work/fankun/test/<测试目录>/1024x40/
```

### 第 5 名：16 分片 `rsync + zstd level 1`

实际测试入口：

```powershell
python run_transfer_bench.py --only chunk_rsync_16_zstd1
```

单路命令形态如下，实际测试时并行启动 16 路：

```powershell
rsync -a --whole-file -z --compress-choice=zstd --compress-level=1 `
  --from0 `
  --files-from=<分片清单文件> `
  -e "ssh -i /cygdrive/c/Users/13093/Documents/Codex/2026-05-23/new-chat-2/codex_transfer_ed25519 -o BatchMode=yes -o StrictHostKeyChecking=accept-new" `
  /cygdrive/d/Work/test/1024x40/ `
  ubuntu@192.168.9.64:/home/ubuntu/work/fankun/test/<测试目录>/1024x40/
```

---

## 二、`GanLaJiao_tongliao.zip` 本机传到 64

源文件：

```text
D:\GanLaJiao_tongliao.zip
```

目标服务器：

```text
ubuntu@192.168.9.64:/home/ubuntu/work/fankun/test
```

文件大小：

```text
3,243,954,361 字节
约 3.021 GiB
```

SHA256：

```text
755d5c7eb8e24fdbead10df1d203e0f8cce63a29dae558b35db7261bf99f850c
```

### 速度排名前五

| 排名 | 算法 | 时间 | 速度 |
|---:|---|---:|---:|
| 1 | `scp` 默认模式 | 30.042s | 107.98 MB/s |
| 2 | `rsync --whole-file` 不压缩 | 30.258s | 107.21 MB/s |
| 3 | `rsync + zstd level 1` | 31.791s | 102.04 MB/s |
| 4 | `rsync + lz4` | 31.874s | 101.77 MB/s |
| 5 | `scp -O` 旧 SCP 协议 | 33.777s | 96.04 MB/s |

### 第 1 名：`scp` 默认模式

```powershell
scp -i C:\Users\13093\Documents\Codex\2026-05-23\new-chat-2\codex_transfer_ed25519 `
  -o BatchMode=yes `
  -o StrictHostKeyChecking=accept-new `
  D:\GanLaJiao_tongliao.zip `
  ubuntu@192.168.9.64:/home/ubuntu/work/fankun/test/<目标目录>/
```

### 第 2 名：`rsync --whole-file` 不压缩

```powershell
rsync -a --whole-file `
  -e "ssh -i /cygdrive/c/Users/13093/Documents/Codex/2026-05-23/new-chat-2/codex_transfer_ed25519 -o BatchMode=yes -o StrictHostKeyChecking=accept-new" `
  /cygdrive/d/GanLaJiao_tongliao.zip `
  ubuntu@192.168.9.64:/home/ubuntu/work/fankun/test/<目标目录>/
```

### 第 3 名：`rsync + zstd level 1`

```powershell
rsync -a --whole-file -z --compress-choice=zstd --compress-level=1 `
  -e "ssh -i /cygdrive/c/Users/13093/Documents/Codex/2026-05-23/new-chat-2/codex_transfer_ed25519 -o BatchMode=yes -o StrictHostKeyChecking=accept-new" `
  /cygdrive/d/GanLaJiao_tongliao.zip `
  ubuntu@192.168.9.64:/home/ubuntu/work/fankun/test/<目标目录>/
```

### 第 4 名：`rsync + lz4`

```powershell
rsync -a --whole-file -z --compress-choice=lz4 `
  -e "ssh -i /cygdrive/c/Users/13093/Documents/Codex/2026-05-23/new-chat-2/codex_transfer_ed25519 -o BatchMode=yes -o StrictHostKeyChecking=accept-new" `
  /cygdrive/d/GanLaJiao_tongliao.zip `
  ubuntu@192.168.9.64:/home/ubuntu/work/fankun/test/<目标目录>/
```

### 第 5 名：`scp -O` 旧 SCP 协议

```powershell
scp -O `
  -i C:\Users\13093\Documents\Codex\2026-05-23\new-chat-2\codex_transfer_ed25519 `
  -o BatchMode=yes `
  -o StrictHostKeyChecking=accept-new `
  D:\GanLaJiao_tongliao.zip `
  ubuntu@192.168.9.64:/home/ubuntu/work/fankun/test/<目标目录>/
```

---

## 三、`GanLaJiao_tongliao.zip`：64 与 62 互传

64 服务器：

```text
ubuntu@192.168.9.64
```

62 服务器：

```text
th@192.168.9.62
```

测试中临时源文件路径：

```text
64: /home/ubuntu/work/fankun/test/codex_zip_stage64/GanLaJiao_tongliao.zip
62: /tmp/codex_zip_stage62/GanLaJiao_tongliao.zip
```

实际使用时，请替换成你的真实源文件路径。

---

## 64 → 62 速度前五

| 排名 | 算法 | 时间 | 速度 |
|---:|---|---:|---:|
| 1 | `scp` 默认模式 | 28.250s | 114.83 MB/s |
| 2 | `scp -O` 旧 SCP 协议 | 28.254s | 114.81 MB/s |
| 3 | 4 分片并行 `rsync` + 远端合并 | 36.610s | 88.61 MB/s |
| 4 | 8 分片并行 `scp` + 远端合并 | 37.556s | 86.38 MB/s |
| 5 | 4 分片并行 `scp` + 远端合并 | 37.662s | 86.13 MB/s |

### 64 → 62 第 1 名：`scp` 默认模式

在 64 上执行：

```bash
scp -i /tmp/codex_64_to_62_ed25519 \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=accept-new \
  /home/ubuntu/work/fankun/test/codex_zip_stage64/GanLaJiao_tongliao.zip \
  th@192.168.9.62:/tmp/<目标目录>/
```

### 64 → 62 第 2 名：`scp -O`

在 64 上执行：

```bash
scp -O \
  -i /tmp/codex_64_to_62_ed25519 \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=accept-new \
  /home/ubuntu/work/fankun/test/codex_zip_stage64/GanLaJiao_tongliao.zip \
  th@192.168.9.62:/tmp/<目标目录>/
```

### 64 → 62 第 3 名：4 分片并行 `rsync`

在 64 上执行：

```bash
tmp=$(mktemp -d /tmp/codex_zip_chunks.XXXXXX)

split -n 4 -d -a 3 \
  /home/ubuntu/work/fankun/test/codex_zip_stage64/GanLaJiao_tongliao.zip \
  "$tmp/part_"

ssh -i /tmp/codex_64_to_62_ed25519 \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=accept-new \
  th@192.168.9.62 \
  "rm -rf /tmp/<目标目录>/chunks; mkdir -p /tmp/<目标目录>/chunks"

for f in "$tmp"/part_*; do
  rsync -a --whole-file \
    -e "ssh -i /tmp/codex_64_to_62_ed25519 -o BatchMode=yes -o StrictHostKeyChecking=accept-new" \
    "$f" \
    th@192.168.9.62:/tmp/<目标目录>/chunks/ &
done
wait

ssh -i /tmp/codex_64_to_62_ed25519 \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=accept-new \
  th@192.168.9.62 \
  "cat /tmp/<目标目录>/chunks/part_* > /tmp/<目标目录>/GanLaJiao_tongliao.zip; rm -rf /tmp/<目标目录>/chunks"

rm -rf "$tmp"
```

### 64 → 62 第 4 名：8 分片并行 `scp`

在 64 上执行：

```bash
tmp=$(mktemp -d /tmp/codex_zip_chunks.XXXXXX)

split -n 8 -d -a 3 \
  /home/ubuntu/work/fankun/test/codex_zip_stage64/GanLaJiao_tongliao.zip \
  "$tmp/part_"

ssh -i /tmp/codex_64_to_62_ed25519 \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=accept-new \
  th@192.168.9.62 \
  "rm -rf /tmp/<目标目录>/chunks; mkdir -p /tmp/<目标目录>/chunks"

for f in "$tmp"/part_*; do
  scp -q \
    -i /tmp/codex_64_to_62_ed25519 \
    -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new \
    "$f" \
    th@192.168.9.62:/tmp/<目标目录>/chunks/ &
done
wait

ssh -i /tmp/codex_64_to_62_ed25519 \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=accept-new \
  th@192.168.9.62 \
  "cat /tmp/<目标目录>/chunks/part_* > /tmp/<目标目录>/GanLaJiao_tongliao.zip; rm -rf /tmp/<目标目录>/chunks"

rm -rf "$tmp"
```

### 64 → 62 第 5 名：4 分片并行 `scp`

在 64 上执行：

```bash
tmp=$(mktemp -d /tmp/codex_zip_chunks.XXXXXX)

split -n 4 -d -a 3 \
  /home/ubuntu/work/fankun/test/codex_zip_stage64/GanLaJiao_tongliao.zip \
  "$tmp/part_"

ssh -i /tmp/codex_64_to_62_ed25519 \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=accept-new \
  th@192.168.9.62 \
  "rm -rf /tmp/<目标目录>/chunks; mkdir -p /tmp/<目标目录>/chunks"

for f in "$tmp"/part_*; do
  scp -q \
    -i /tmp/codex_64_to_62_ed25519 \
    -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new \
    "$f" \
    th@192.168.9.62:/tmp/<目标目录>/chunks/ &
done
wait

ssh -i /tmp/codex_64_to_62_ed25519 \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=accept-new \
  th@192.168.9.62 \
  "cat /tmp/<目标目录>/chunks/part_* > /tmp/<目标目录>/GanLaJiao_tongliao.zip; rm -rf /tmp/<目标目录>/chunks"

rm -rf "$tmp"
```

---

## 62 → 64 速度前五

说明：最快稳定方式是让 64 从 62 拉取。数据方向仍然是 62 → 64，只是连接由 64 发起。

| 排名 | 算法 | 时间 | 速度 |
|---:|---|---:|---:|
| 1 | `scp -O` 拉取 | 28.248s | 114.84 MB/s |
| 2 | SFTP 拉取，`-B 262144 -R 128` | 28.258s | 114.80 MB/s |
| 3 | `scp` 默认拉取 | 28.265s | 114.77 MB/s |
| 4 | `rsync --whole-file` 拉取 | 28.286s | 114.68 MB/s |
| 5 | SFTP 默认拉取 | 28.317s | 114.56 MB/s |

### 62 → 64 第 1 名：`scp -O` 拉取

在 64 上执行：

```bash
scp -O \
  -i /tmp/codex_64_to_62_ed25519 \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=accept-new \
  th@192.168.9.62:/tmp/codex_zip_stage62/GanLaJiao_tongliao.zip \
  /home/ubuntu/work/fankun/test/<目标目录>/
```

### 62 → 64 第 2 名：SFTP 调优拉取

在 64 上执行：

```bash
batch=$(mktemp)

printf 'get %s %s/\n' \
  /tmp/codex_zip_stage62/GanLaJiao_tongliao.zip \
  /home/ubuntu/work/fankun/test/<目标目录> \
  > "$batch"

sftp -B 262144 -R 128 \
  -b "$batch" \
  -i /tmp/codex_64_to_62_ed25519 \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=accept-new \
  th@192.168.9.62

rm -f "$batch"
```

### 62 → 64 第 3 名：`scp` 默认拉取

在 64 上执行：

```bash
scp \
  -i /tmp/codex_64_to_62_ed25519 \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=accept-new \
  th@192.168.9.62:/tmp/codex_zip_stage62/GanLaJiao_tongliao.zip \
  /home/ubuntu/work/fankun/test/<目标目录>/
```

### 62 → 64 第 4 名：`rsync --whole-file` 拉取

在 64 上执行：

```bash
rsync -a --whole-file \
  -e "ssh -i /tmp/codex_64_to_62_ed25519 -o BatchMode=yes -o StrictHostKeyChecking=accept-new" \
  th@192.168.9.62:/tmp/codex_zip_stage62/GanLaJiao_tongliao.zip \
  /home/ubuntu/work/fankun/test/<目标目录>/
```

### 62 → 64 第 5 名：SFTP 默认拉取

在 64 上执行：

```bash
batch=$(mktemp)

printf 'get %s %s/\n' \
  /tmp/codex_zip_stage62/GanLaJiao_tongliao.zip \
  /home/ubuntu/work/fankun/test/<目标目录> \
  > "$batch"

sftp \
  -b "$batch" \
  -i /tmp/codex_64_to_62_ed25519 \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=accept-new \
  th@192.168.9.62

rm -f "$batch"
```

---

## 结论

### `1024x40` 目录

这是 19 万小文件目录，最快的是分片打包压缩流：

```text
24 分片 tar + zstd -6 + ssh
37.951s
152.43 MB/s
```

推荐方案：

```powershell
python run_transfer_bench.py --only chunk_zstd_6_24
```

### `GanLaJiao_tongliao.zip` 单文件

这是单个已压缩 zip 文件，不适合再次 zstd 压缩。

本机 → 64 推荐：

```text
scp 默认模式
30.042s
107.98 MB/s
```

64 → 62 推荐：

```text
scp 默认模式
28.250s
114.83 MB/s
```

62 → 64 推荐：

```text
64 从 62 拉取 scp -O
28.248s
114.84 MB/s
```

