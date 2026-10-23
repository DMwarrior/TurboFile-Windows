/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const capacityUnits = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];

function capacityParts(bytes: number): { value: string; unit: string } | undefined {
	if (!Number.isFinite(bytes)) { return undefined; }
	let value = Math.abs(bytes);
	let unit = 0;
	while (value >= 1024 && unit < capacityUnits.length - 1) { value /= 1024; unit++; }
	return { value: `${bytes < 0 ? '-' : ''}${value.toFixed(unit ? 1 : 0)}`, unit: capacityUnits[unit] };
}

export function formatTurboFileMonitorCapacity(bytes: number): string {
	const size = capacityParts(bytes);
	return size ? `${size.value} ${size.unit}` : '—';
}

/** Share a suffix only when both quantities actually reach the same unit. */
export function formatTurboFileMonitorCapacityPair(used: number, total: number): string {
	const first = capacityParts(used);
	const second = capacityParts(total);
	if (!first || !second) { return '—'; }
	return first.unit === second.unit ? `${first.value}/${second.value} ${second.unit}` : `${first.value} ${first.unit}/${second.value} ${second.unit}`;
}
