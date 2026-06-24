/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const nonRetryableRemoteDirectoryErrors = /no such file|no such file or directory|file not found|path not found|enoent|permission denied|not a directory/i;

const retryableRemoteDirectoryErrors = /no response from server|not connected|connection (?:lost|closed|reset|timed out)|econnreset|socket.*closed|channel.*(?:closed|not open|not available)|sftp.*(?:closed|ended|not connected)|remote directory read timed out|remote command (?:timed out|produced no progress)/i;

export function shouldRetryRemoteDirectoryRead(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	if (nonRetryableRemoteDirectoryErrors.test(message)) {
		return false;
	}
	return retryableRemoteDirectoryErrors.test(message);
}
