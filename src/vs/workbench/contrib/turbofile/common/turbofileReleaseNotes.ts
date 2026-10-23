/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';

/** Keep released versions here so the installed application can show its history offline. */
export const turboFileReleaseNotes: readonly { readonly version: string; readonly date: string; readonly changes: readonly string[] }[] = [
	{
		version: '1.173.0',
		date: '2026-10-23',
		changes: [
			localize('turbofile.release173.tabs', "同名文件标签仅显示文件名，不再追加长路径；完整路径仍可通过悬停查看。"),
			localize('turbofile.release173.button', "恢复文字更新按钮，下载时持续显示真实百分比，保留悬停版本与更新内容。"),
			localize('turbofile.release173.progress', "修复持续下载时进度被反复推迟刷新的问题，更新进度时保留按钮及悬停内容。"),
			localize('turbofile.release173.download', "更新下载优先国内分片，增加断点续传、已完成分片复用、有限重试和停滞超时；仍执行大小与 SHA-256 校验。"),
			localize('turbofile.release173.publish', "发布流程要求同版本国内安装包验证通过后再更新 GitHub 自动更新清单，防止误发仅含海外下载地址的版本。")
		]
	},
	{
		version: '1.172.0',
		date: '2026-10-23',
		changes: [
			localize('turbofile.release172.journal', "任务日志持久保存复制、传输和删除记录，精简摘要并限制日志容量，恢复顶部状态统计。"),
			localize('turbofile.release172.monitor', "底部新增轻量设备监控，跟随当前面板显示 CPU、内存及当前目录所在磁盘的已用和总容量。"),
			localize('turbofile.release172.layout', "统一左侧栏宽度和设备图标，修复设备及日志页底部留白、监控数字变化导致布局跳动等问题。"),
			localize('turbofile.release172.readability', "改善浅色模式文字和图标的可读性，设备列表充分利用可用高度，恢复默认标签页名称。"),
			localize('turbofile.release172.installer', "安装器默认勾选创建桌面快捷方式。"),
			localize('turbofile.release172.updater', "帮助右侧改用更新图标，悬停可查看目标版本和更新摘要；更新日志从本版本开始记录。"),
			localize('turbofile.release172.source', "GitHub 和 Gitee 统一公开源码与安装包的发布入口。")
		]
	}
];

/** Render feed content as bounded plain text, never as executable HTML or command links. */
export function summarizeTurboFileReleaseNotes(notes: string | undefined, maxLines = 7): string {
	return (notes ?? '').slice(0, 12000).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').split(/\r?\n/)
		.map(line => line.replace(/^\s{0,3}#{1,6}\s+/, '').replace(/^\s*[-*+]\s+/, '• ').trim())
		.filter(line => line && !/^\s*(?:SHA-?256|安装包|https?:\/\/|```)/i.test(line))
		.slice(0, maxLines).map(line => line.length > 240 ? `${line.slice(0, 240)}…` : line).join('\n');
}

export function getTurboFileReleaseHistory(): string {
	return turboFileReleaseNotes.map(release => `${release.version} · ${release.date}\n${release.changes.map(change => `• ${change}`).join('\n')}`).join('\n\n');
}
