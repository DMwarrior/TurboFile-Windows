/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function withTurboFileTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		return operation;
	}

	return new Promise<T>((resolve, reject) => {
		let settled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const finish = (callback: () => void): void => {
			if (settled) {
				return;
			}
			settled = true;
			if (timer) {
				clearTimeout(timer);
			}
			callback();
		};

		timer = setTimeout(() => {
			finish(() => reject(new Error(message)));
		}, timeoutMs);

		operation.then(
			value => finish(() => resolve(value)),
			error => finish(() => reject(error))
		);
	});
}
